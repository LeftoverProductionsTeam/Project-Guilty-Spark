//! Local, privacy-allowlisted manifest comparison. No network traffic or gameplay attestation.
use crate::{
    invalid, maps,
    runtime::{self, RuntimeId, TestStatus},
    Result,
};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, path::Path};

pub const MANIFEST_SCHEMA_VERSION: u32 = 1;
pub const MAX_MANIFEST_BYTES: usize = 64 * 1024;
const RESOURCE_NAMES: [&str; 3] = ["bitmaps.map", "sounds.map", "loc.map"];

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SessionMode {
    MccCoopCampaign,
    MccCustomMultiplayer,
    NativeCoop,
    NativeMultiplayer,
    LegacyMultiplayer,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PeerMapIdentity {
    pub sha256: String,
    pub cache_version: u32,
    pub scenario_type: u16,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PeerResourceIdentity {
    pub name: String,
    pub sha256: Option<String>,
    pub required: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PeerManifest {
    pub schema_version: u32,
    pub adapter_version: u32,
    pub runtime_id: RuntimeId,
    pub platform: String,
    pub runtime_build: Option<String>,
    pub network_version: Option<String>,
    pub executable_sha256: Option<String>,
    pub mode: SessionMode,
    pub anti_cheat_disabled: Option<bool>,
    pub map: PeerMapIdentity,
    pub resources: Vec<PeerResourceIdentity>,
    pub package_sha256: Option<String>,
    pub source_sha256: Option<String>,
    pub build_tool_version: Option<String>,
    pub build_verified: bool,
    pub resource_set_verified: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gameplay: Option<PeerGameplay>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PeerGameplay {
    pub game_mode: String,
    pub expected_players: u8,
    pub configuration_sha256: Option<String>,
}
/// All flags are local evidence or peer declarations, never remote attestation.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManifestContext {
    pub runtime_id: RuntimeId,
    pub platform: String,
    pub runtime_build: Option<String>,
    pub network_version: Option<String>,
    pub executable_sha256: Option<String>,
    pub mode: SessionMode,
    pub anti_cheat_disabled: Option<bool>,
    pub package_sha256: Option<String>,
    pub source_sha256: Option<String>,
    pub build_tool_version: Option<String>,
    pub build_verified: bool,
    pub resource_set_verified: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightCheck {
    pub key: String,
    pub status: TestStatus,
    pub detail: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerPreflight {
    pub schema_version: u32,
    pub status: TestStatus,
    pub scope: String,
    pub gameplay_verified: bool,
    pub checks: Vec<PreflightCheck>,
    pub diagnostics: Vec<String>,
}

fn valid_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}
pub fn validate_manifest(manifest: &PeerManifest) -> Result<()> {
    if let Some(gameplay) = &manifest.gameplay {
        if !["slayer","teamSlayer","ctf","king","oddball","race","firefight","zombie"].contains(&gameplay.game_mode.as_str())
            || !(1..=16).contains(&gameplay.expected_players)
            || (manifest.mode == SessionMode::MccCoopCampaign && gameplay.expected_players > 2)
            || gameplay.configuration_sha256.as_deref().is_some_and(|h|!valid_hash(h)) {
            return invalid("Invalid game mode, player count or gameplay configuration SHA-256");
        }
    }
    if manifest.schema_version != MANIFEST_SCHEMA_VERSION {
        return invalid("Unsupported peer-manifest schema version");
    }
    if manifest.adapter_version != runtime::ADAPTER_VERSION {
        return invalid("Unsupported runtime adapter version");
    }
    if !["windows", "macos", "linux", "unknown"].contains(&manifest.platform.as_str()) {
        return invalid("Peer platform must be a fixed platform identifier");
    }
    for token in [
        &manifest.runtime_build,
        &manifest.network_version,
        &manifest.build_tool_version,
    ]
    .into_iter()
    .flatten()
    {
        if !runtime::version_token(token) {
            return invalid(
                "Version fields accept bounded version tokens only, not paths or free-form text",
            );
        }
    }
    if !valid_hash(&manifest.map.sha256) {
        return invalid("Map SHA256 must be 64 lowercase hexadecimal characters");
    }
    for hash in [
        &manifest.executable_sha256,
        &manifest.package_sha256,
        &manifest.source_sha256,
    ]
    .into_iter()
    .flatten()
    {
        if !valid_hash(hash) {
            return invalid("Invalid SHA256 in peer manifest");
        }
    }
    if manifest.resources.len() > RESOURCE_NAMES.len() {
        return invalid("Peer manifest contains too many resources");
    }
    let mut names = std::collections::BTreeSet::new();
    for resource in &manifest.resources {
        if !RESOURCE_NAMES.contains(&resource.name.as_str()) || !names.insert(&resource.name) {
            return invalid("Resource names must be unique allowlisted shared-map filenames");
        }
        if resource.sha256.as_deref().is_some_and(|h| !valid_hash(h)) {
            return invalid("Invalid shared-resource SHA256");
        }
    }
    Ok(())
}
pub fn parse_manifest(text: &str) -> Result<PeerManifest> {
    if text.len() > MAX_MANIFEST_BYTES {
        return invalid("Peer manifest exceeds 64 KiB");
    }
    let manifest: PeerManifest = serde_json::from_str(text)?;
    validate_manifest(&manifest)?;
    Ok(manifest)
}
pub fn export_manifest(manifest: &PeerManifest) -> Result<String> {
    validate_manifest(manifest)?;
    let text = serde_json::to_string_pretty(manifest)?;
    if text.len() > MAX_MANIFEST_BYTES {
        return invalid("Peer manifest exceeds 64 KiB");
    }
    Ok(text)
}
pub fn create_manifest(
    inspection: &maps::MapInspection,
    context: ManifestContext,
    resources: Vec<PeerResourceIdentity>,
) -> Result<PeerManifest> {
    let mut manifest = PeerManifest {
        schema_version: MANIFEST_SCHEMA_VERSION,
        adapter_version: runtime::ADAPTER_VERSION,
        runtime_id: context.runtime_id,
        platform: context.platform,
        runtime_build: context.runtime_build,
        network_version: context.network_version,
        executable_sha256: context.executable_sha256,
        mode: context.mode,
        anti_cheat_disabled: context.anti_cheat_disabled,
        map: PeerMapIdentity {
            sha256: inspection.sha256.clone(),
            cache_version: inspection.header.version,
            scenario_type: inspection.header.scenario_type,
        },
        resources,
        package_sha256: context.package_sha256,
        source_sha256: context.source_sha256,
        build_tool_version: context.build_tool_version,
        build_verified: context.build_verified,
        resource_set_verified: context.resource_set_verified,
        gameplay: None,
    };
    if inspection.header.build.contains("synthetic parser fixture") {
        manifest.build_verified = false;
        manifest.resource_set_verified = false;
    }
    validate_manifest(&manifest)?;
    Ok(manifest)
}
pub fn resource_identities(
    inspection: &maps::MapInspection,
    directory: &Path,
) -> Result<Vec<PeerResourceIdentity>> {
    crate::reject_links(directory)?;
    let mut result = Vec::new();
    for name in RESOURCE_NAMES {
        let path = directory.join(name);
        crate::reject_links(&path)?;
        let sha256 = if path.is_file() {
            if fs::metadata(&path)?.len() > 2 * 1024 * 1024 * 1024 {
                return invalid("Resource exceeds the 2 GiB hash limit");
            }
            Some(maps::hash_file(&path)?)
        } else {
            None
        };
        result.push(PeerResourceIdentity {
            name: name.into(),
            sha256,
            required: inspection
                .resources
                .iter()
                .any(|r| r.name == name && r.required),
        });
    }
    Ok(result)
}

fn check(key: &str, status: TestStatus, detail: impl Into<String>) -> PreflightCheck {
    PreflightCheck {
        key: key.into(),
        status,
        detail: detail.into(),
    }
}
fn compare_optional(
    key: &str,
    left: &Option<String>,
    right: &Option<String>,
    required: bool,
) -> PreflightCheck {
    match (left, right) {
        (Some(a), Some(b)) if a == b => check(key, TestStatus::Pass, "Both manifests declare the same value."),
        (Some(_), Some(_)) => check(key, TestStatus::Fail, "Manifest values differ."),
        _ if required => check(key, TestStatus::Blocked, "A required value is unknown in one or both manifests."),
        _ => check(key, TestStatus::Pass, "Optional evidence is not available on both sides; no compatibility claim derives from it."),
    }
}
fn mode_matches(manifest: &PeerManifest) -> bool {
    match manifest.runtime_id {
        RuntimeId::MccSteam => matches!(
            manifest.mode,
            SessionMode::MccCoopCampaign | SessionMode::MccCustomMultiplayer
        ),
        RuntimeId::ChupathingyCe | RuntimeId::OpenCe => matches!(
            manifest.mode,
            SessionMode::NativeCoop | SessionMode::NativeMultiplayer
        ),
        RuntimeId::HaloPc | RuntimeId::HaloCustomEdition => {
            manifest.mode == SessionMode::LegacyMultiplayer
        }
        _ => false,
    }
}
fn known_family(manifest: &PeerManifest) -> bool {
    match manifest.runtime_id {
        RuntimeId::MccSteam => manifest.map.cache_version == 13,
        RuntimeId::ChupathingyCe => [5, 7, 609].contains(&manifest.map.cache_version),
        RuntimeId::OpenCe => [5, 609].contains(&manifest.map.cache_version),
        RuntimeId::HaloPc => manifest.map.cache_version == 7,
        RuntimeId::HaloCustomEdition => manifest.map.cache_version == 609,
        _ => false,
    }
}
fn supported_platform(manifest: &PeerManifest) -> bool {
    match manifest.runtime_id {
        RuntimeId::MccSteam | RuntimeId::HaloPc | RuntimeId::HaloCustomEdition => {
            manifest.platform == "windows"
        }
        RuntimeId::OpenCe => ["windows", "linux"].contains(&manifest.platform.as_str()),
        RuntimeId::ChupathingyCe => {
            ["windows", "macos", "linux"].contains(&manifest.platform.as_str())
        }
        _ => false,
    }
}

pub fn compare(local: &PeerManifest, peer: &PeerManifest) -> Result<PeerPreflight> {
    use TestStatus::*;
    validate_manifest(local)?;
    validate_manifest(peer)?;
    let mut checks = vec![
        check("runtime", if local.runtime_id == peer.runtime_id { Pass } else { Blocked },
            if local.runtime_id == peer.runtime_id { "Both manifests select the same runtime. This does not verify an installed executable's identity." }
            else { "Cross-runtime compatibility is not verified; matching protocol labels do not establish interoperability." }),
        check("mode", if local.mode == peer.mode && mode_matches(local) && mode_matches(peer) { Pass } else { Fail }, "Both manifests must select the same mode and a runtime that implements that mode."),
        compare_optional("runtimeBuild", &local.runtime_build, &peer.runtime_build, true),
        check("map", if local.map.sha256 == peer.map.sha256 && local.map.cache_version == peer.map.cache_version && local.map.scenario_type == peer.map.scenario_type { Pass } else { Fail }, "Map bytes, cache version and scenario type must match."),
        check("mapFamily", if known_family(local) && known_family(peer) { Pass } else { Blocked }, "The selected engine must document the input cache family. This check does not prove successful loading."),
        check("buildValidation", if local.build_verified && peer.build_verified { Pass } else { Blocked }, "Both manifests must declare a validated derived build. Imported flags are self-reported, not remote attestation."),
        check("resourceCompleteness", if local.resource_set_verified && peer.resource_set_verified { Pass } else { Blocked }, "Both manifests must declare verified resource completeness; matching file names alone is insufficient."),
    ];
    let campaign = matches!(
        local.mode,
        SessionMode::MccCoopCampaign | SessionMode::NativeCoop
    );
    if local.gameplay.is_some() || peer.gameplay.is_some() {
        checks.push(check("gameplayConfiguration", if local.gameplay == peer.gameplay {Pass} else {Fail}, "Declared game mode, expected player count and gameplay configuration identity must match. This does not attest a running wave director."));
    }
    checks.push(check("scenarioMode", if local.map.scenario_type == if campaign { 0 } else { 1 } && peer.map.scenario_type == if campaign { 0 } else { 1 } { Pass } else { Fail },
        "Scenario type must match the selected campaign or multiplayer mode; a matching type is not evidence of correct authored mechanics."));
    if local.runtime_id.is_native() || peer.runtime_id.is_native() {
        checks.push(compare_optional(
            "networkVersion",
            &local.network_version,
            &peer.network_version,
            true,
        ));
        checks.push(if local.platform == peer.platform {
            compare_optional("executableEvidence", &local.executable_sha256, &peer.executable_sha256, true)
        } else {
            check("executableEvidence", if local.executable_sha256.is_some() && peer.executable_sha256.is_some() { Pass } else { Blocked }, "Different platforms can have different executable hashes; both files must still be identified. Cross-platform gameplay remains untested.")
        });
    }
    if local.runtime_id == RuntimeId::MccSteam || peer.runtime_id == RuntimeId::MccSteam {
        checks.push(compare_optional(
            "package",
            &local.package_sha256,
            &peer.package_sha256,
            true,
        ));
        checks.push(check("antiCheatDeclaration", if local.anti_cheat_disabled == Some(true) && peer.anti_cheat_disabled == Some(true) { Pass } else { Blocked },
            "Both users must declare EAC disabled; this is self-reported and has not been read from either game process."));
        checks.push(check("platform", if local.platform == "windows" && peer.platform == "windows" { Pass } else { Blocked }, "This MCC workflow is validated only for Windows configuration; gameplay still requires actual testing."));
    } else {
        checks.push(check("platform", if supported_platform(local) && supported_platform(peer) { Pass } else { Blocked },
            "Native OS pairs require their own gameplay tests; unsupported/unknown declared platforms block this preflight."));
    }
    let a: BTreeMap<_, _> = local
        .resources
        .iter()
        .map(|r| (r.name.as_str(), r))
        .collect();
    let b: BTreeMap<_, _> = peer
        .resources
        .iter()
        .map(|r| (r.name.as_str(), r))
        .collect();
    for name in RESOURCE_NAMES {
        checks.push(match (a.get(name), b.get(name)) {
            (Some(left), Some(right)) => {
                if left.required != right.required {
                    check(name, Fail, "Required-resource declarations differ.")
                } else {
                    compare_optional(name, &left.sha256, &right.sha256, left.required)
                }
            }
            _ => check(
                name,
                Blocked,
                "The allowlisted resource entry is absent; completeness is unknown.",
            ),
        });
    }
    checks.push(check("aiSynchronization", Untested, match local.mode {
        SessionMode::MccCustomMultiplayer => "Unknown: arbitrary MCC multiplayer AI is not implemented; an acceptable extension path is still blocked. Matching manifests do not synchronize actors.",
        SessionMode::MccCoopCampaign => "Untested: a valid authored two-player campaign and real host/client observations are required; no MCC co-op session was verified.",
        SessionMode::NativeCoop | SessionMode::NativeMultiplayer => "Untested: upstream native actor replication is implementation evidence only. The selected map, script/wave state and two-computer session remain unverified.",
        SessionMode::LegacyMultiplayer => "Unknown: ordinary legacy multiplayer does not synchronize arbitrary AI, and no separately supported extension is integrated.",
    }));
    // AI gameplay is outside manifest equality. Expose its untested status without
    // turning a field-agreement result into a claim about an unobserved session.
    let status = if checks.iter().any(|c| c.status == Fail) {
        Fail
    } else if checks.iter().any(|c| c.status == Blocked) {
        Blocked
    } else {
        Pass
    };
    let mut diagnostics = vec![
        "This compares local and self-reported peer manifests only. PASS means 'Manifests agree'; it never means multiplayer ready or gameplay verified.".into(),
        "No game process, remote machine, AI actor, network session or EAC state was inspected. No network traffic was sent.".into(),
        "AI synchronization and actual two-computer play remain untested, including after a matching manifest comparison.".into(),
    ];
    if local.executable_sha256 != peer.executable_sha256 {
        diagnostics.push("Executable hash evidence differs or is unavailable. Different platforms may legitimately have different binaries; declared build/network values remain self-reported.".into());
    }
    if local.source_sha256 != peer.source_sha256
        || local.build_tool_version != peer.build_tool_version
    {
        diagnostics.push("Source/toolchain provenance differs or is incomplete; identical output hashes do not resolve provenance questions.".into());
    }
    Ok(PeerPreflight {
        schema_version: MANIFEST_SCHEMA_VERSION,
        status,
        scope: "manifestComparisonOnly".into(),
        gameplay_verified: false,
        checks,
        diagnostics,
    })
}
