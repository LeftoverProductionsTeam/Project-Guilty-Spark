//! Operation-specific runtime evidence, separate from executable discovery.
//!
//! This registry does not launch programs, attach to processes, or authorize writes.
//! Callers must obtain observations from native inspection, and operation handlers
//! must repeat identity/session checks immediately before performing an action.
//! In particular, a frontend-provided `RuntimeObservation` is never a write permit.

use crate::runtime::{RuntimeId, RuntimeReport, TestStatus};
use serde::{Deserialize, Serialize};

pub const REGISTRY_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GameFamily {
    #[default]
    Halo1,
    Halo2,
    Halo3,
    Halo3Odst,
    HaloReach,
    Halo4,
    HaloInfinite,
}

/// Content edition is not inferred from its cache version or executable name.
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeTarget {
    pub family: GameFamily,
    pub edition: String,
    pub platform: String,
    pub distribution: String,
    pub architecture: String,
    pub extension_ids: Vec<String>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EvidenceLevel {
    Unknown,
    Unsupported,
    UpstreamDeclared,
    Implemented,
    LocallyTested,
    MultiplayerTested,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ActionAvailability {
    Ready,
    Running,
    SetupRequired,
    UpdateNeeded,
    Unavailable,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeOperation {
    Detect,
    Inspect,
    Edit,
    Extract,
    Convert,
    Build,
    LaunchGame,
    TestScene,
    EditLevel,
    EditTags,
    Publish,
    ObserveLive,
    MoveLiveObject,
    ScaleLiveObject,
    Sprint,
    ThirdPersonCamera,
    SpawnLiveObject,
    ReplaceLiveBsp,
    ReplicateLiveEdits,
    DiscoverGames,
    HostGame,
    JoinGame,
    SynchronizeAi,
    CampaignCoop,
    PlayerScale,
    LegacyTools,
}

impl RuntimeOperation {
    pub const ALL: [Self; 26] = [
        Self::Detect,
        Self::Inspect,
        Self::Edit,
        Self::Extract,
        Self::Convert,
        Self::Build,
        Self::LaunchGame,
        Self::TestScene,
        Self::EditLevel,
        Self::EditTags,
        Self::Publish,
        Self::ObserveLive,
        Self::MoveLiveObject,
        Self::ScaleLiveObject,
        Self::Sprint,
        Self::ThirdPersonCamera,
        Self::SpawnLiveObject,
        Self::ReplaceLiveBsp,
        Self::ReplicateLiveEdits,
        Self::DiscoverGames,
        Self::HostGame,
        Self::JoinGame,
        Self::SynchronizeAi,
        Self::CampaignCoop,
        Self::PlayerScale,
        Self::LegacyTools,
    ];
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceReference {
    pub target: String,
    pub procedure: String,
    pub result: String,
    pub location: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityGate {
    pub code: String,
    pub detail: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCapability {
    pub operation: RuntimeOperation,
    pub evidence_level: EvidenceLevel,
    pub availability: ActionAvailability,
    pub detail: String,
    pub gates: Vec<CapabilityGate>,
    pub next_action: String,
    pub evidence: Vec<EvidenceReference>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BuildFingerprint {
    pub executable_sha256: Option<String>,
    pub module_sha256: Option<String>,
    pub build_label: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResourceEvidence {
    pub generation: String,
    pub source: Option<String>,
    pub complete: bool,
    pub identity: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ToolKind {
    Sapien,
    Guerilla,
    Tool,
    Standalone,
    Legacy,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ToolchainEvidence {
    pub generation: String,
    /// Tool PE/host architecture is independent of the game's live-memory ABI.
    /// Official H1A Tool may be x86 while Steam MCC Halo 1 is x86_64.
    #[serde(default)]
    pub architecture: Option<String>,
    pub validated: bool,
    pub tools: Vec<ToolKind>,
    pub content_identity: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProtocolEvidence {
    pub protocol_id: Option<String>,
    pub build_identity: Option<String>,
    pub content_identity: Option<String>,
    /// Reported only after the relevant native planner validates this tuple.
    pub compatible: bool,
    pub two_client_tested: bool,
    pub tested_players: Option<u16>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionEvidence {
    pub process_id: Option<u32>,
    pub private_mod_session: bool,
    pub anti_cheat_disabled: bool,
    pub explicit_live_consent: bool,
    pub map_identity: Option<String>,
    pub generation: Option<String>,
    pub same_generation_confirmed: bool,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectEvidence {
    pub cache_version: Option<u32>,
    #[serde(default)]
    pub scenario_type: Option<u16>,
    pub content_identity: Option<String>,
    /// Exact source resource generation, established by native source preflight.
    /// A foreign target's resources cannot substitute for these source assets.
    pub resource_generation: Option<String>,
    pub source_complete: bool,
    pub built_output_verified: bool,
    pub publish_template_verified: bool,
    /// A native conversion preflight has selected an implemented source profile.
    pub conversion_profile: Option<String>,
    pub contains_new_scenario_objects: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuntimeObservation {
    pub runtime_id: RuntimeId,
    pub target: RuntimeTarget,
    pub detected: bool,
    pub installation_validated: bool,
    pub game_running: bool,
    pub fingerprint: BuildFingerprint,
    pub resources: Vec<ResourceEvidence>,
    pub toolchains: Vec<ToolchainEvidence>,
    pub protocol: ProtocolEvidence,
    pub session: SessionEvidence,
    pub project: ProjectEvidence,
}

impl RuntimeObservation {
    /// Existing discovery remains intact. A Steam build number is not an EXE or
    /// halo1.dll fingerprint, and a registration is not a suitable live session.
    pub fn from_report(report: &RuntimeReport) -> Self {
        let installation = report.installation.as_ref();
        Self {
            runtime_id: report.id,
            target: target_for(report.id, &report.host_platform),
            detected: installation.is_some(),
            installation_validated: installation.is_some_and(|i| i.validation == TestStatus::Pass),
            game_running: false,
            fingerprint: BuildFingerprint {
                executable_sha256: if report.id == RuntimeId::MccSteam {
                    // runtime::report identifies Steam's launcher, not MCC's EXE.
                    None
                } else {
                    installation.and_then(|i| i.executable_sha256.clone())
                },
                module_sha256: None,
                build_label: installation.and_then(|i| i.version.clone()),
            },
            resources: vec![],
            toolchains: vec![],
            protocol: ProtocolEvidence::default(),
            session: SessionEvidence::default(),
            project: ProjectEvidence::default(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAdapterProfile {
    pub profile_id: String,
    pub adapter_version: u32,
    pub runtime_id: Option<RuntimeId>,
    pub label: String,
    pub target: RuntimeTarget,
    pub resource_generation: String,
    pub toolchain_generation: String,
    pub protocol_generation: String,
    pub cache_versions: Vec<u32>,
    pub implemented_adapter: bool,
    pub detail: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCapabilityReport {
    pub schema_version: u32,
    pub adapter_version: u32,
    pub profile_id: String,
    pub target: RuntimeTarget,
    pub fingerprint: BuildFingerprint,
    pub resources: Vec<ResourceEvidence>,
    pub toolchains: Vec<ToolchainEvidence>,
    pub protocol: ProtocolEvidence,
    pub session: SessionEvidence,
    pub player_scale: PlayerScaleAcceptance,
    pub capabilities: Vec<RuntimeCapability>,
    pub diagnostics: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlayerScaleAcceptance {
    pub goal_players: u16,
    pub checkpoints: Vec<u16>,
    /// No large-scale native game acceptance has been recorded in Spark.
    pub accepted_game_players: Option<u16>,
    /// Untrusted/observational metadata, never promoted to accepted evidence.
    pub reported_players: Option<u16>,
}

impl RuntimeCapabilityReport {
    pub fn capability(&self, operation: RuntimeOperation) -> Option<&RuntimeCapability> {
        self.capabilities.iter().find(|c| c.operation == operation)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDockAction {
    pub id: String,
    pub operation: RuntimeOperation,
    pub label: String,
    pub availability: ActionAvailability,
    pub description: String,
    pub next_action: String,
    pub requires_confirmation: bool,
}

pub fn profile_id(id: RuntimeId) -> &'static str {
    match id {
        RuntimeId::MccSteam => "halo1-mcc-steam",
        RuntimeId::ChupathingyCe => "halo1-chupathingy-ce",
        RuntimeId::OpenCe => "halo1-open-ce",
        RuntimeId::HaloPc => "halo1-pc-retail",
        RuntimeId::HaloCustomEdition => "halo1-custom-edition",
        RuntimeId::MacRetail => "halo1-mac-retail",
        RuntimeId::MacDemo => "halo1-mac-demo",
        RuntimeId::HaloPcTrial => "halo1-pc-trial",
        RuntimeId::HaloMd => "halo1-mac-halomd",
        RuntimeId::HaloXbox => "halo1-xbox",
    }
}

/// Behavior version, independently pinned from the serialized schema version.
pub fn profile_version(id: RuntimeId) -> u32 {
    match id {
        RuntimeId::MccSteam => 1,
        RuntimeId::ChupathingyCe => 1,
        RuntimeId::OpenCe => 1,
        RuntimeId::HaloPc => 1,
        RuntimeId::HaloCustomEdition => 1,
        RuntimeId::MacRetail => 1,
        RuntimeId::MacDemo => 1,
        RuntimeId::HaloPcTrial => 1,
        RuntimeId::HaloMd => 1,
        RuntimeId::HaloXbox => 1,
    }
}

pub fn target_for(id: RuntimeId, host: &str) -> RuntimeTarget {
    let (edition, platform, distribution, architecture) = match id {
        RuntimeId::MccSteam => ("mccHalo1", host, "steam", "x86_64"),
        RuntimeId::ChupathingyCe => ("chupathingyCe", host, "community", "unknown"),
        RuntimeId::OpenCe => ("openCe", host, "community", "unknown"),
        RuntimeId::HaloPc => ("retail", "windows", "retail", "x86"),
        RuntimeId::HaloCustomEdition => ("customEdition", "windows", "standalone", "x86"),
        RuntimeId::MacRetail => ("retail", "macos", "retail", "unknown"),
        RuntimeId::MacDemo => ("demo", "macos", "demo", "unknown"),
        RuntimeId::HaloPcTrial => ("trial", "windows", "trial", "x86"),
        RuntimeId::HaloMd => ("haloMd", "macos", "community", "unknown"),
        RuntimeId::HaloXbox => ("originalXbox", "xbox", "retail", "x86"),
    };
    RuntimeTarget {
        family: GameFamily::Halo1,
        edition: edition.into(),
        platform: platform.into(),
        distribution: distribution.into(),
        architecture: architecture.into(),
        extension_ids: vec![],
    }
}

pub fn resource_generation(id: RuntimeId) -> &'static str {
    match id {
        RuntimeId::MccSteam => "mcc-halo1",
        RuntimeId::ChupathingyCe => "chupathingy-ce",
        RuntimeId::OpenCe => "open-ce",
        RuntimeId::HaloPc => "halo-pc-retail",
        RuntimeId::HaloCustomEdition => "halo-custom-edition",
        RuntimeId::MacRetail => "halo-mac-retail",
        RuntimeId::MacDemo => "halo-mac-demo",
        RuntimeId::HaloPcTrial => "halo-pc-trial",
        RuntimeId::HaloMd => "halo-md",
        RuntimeId::HaloXbox => "halo-xbox",
    }
}

pub fn tool_generation(id: RuntimeId) -> &'static str {
    if id == RuntimeId::MccSteam {
        "h1a-ek"
    } else {
        "hek"
    }
}

/// Discovery profiles, including explicit unimplemented targets. A descriptor is
/// never evidence that a runtime executable, converter, or wire protocol works.
pub fn registry() -> Vec<RuntimeAdapterProfile> {
    let ids = [
        RuntimeId::MccSteam,
        RuntimeId::ChupathingyCe,
        RuntimeId::OpenCe,
        RuntimeId::HaloPc,
        RuntimeId::HaloCustomEdition,
        RuntimeId::MacRetail,
        RuntimeId::MacDemo,
        RuntimeId::HaloPcTrial,
        RuntimeId::HaloMd,
        RuntimeId::HaloXbox,
    ];
    let mut profiles: Vec<_> = ids.into_iter().map(|id| RuntimeAdapterProfile {
        profile_id: profile_id(id).into(), adapter_version: profile_version(id),
        runtime_id: Some(id),
        label: id.name().into(),
        target: target_for(id, crate::runtime::platform()),
        resource_generation: resource_generation(id).into(),
        toolchain_generation: tool_generation(id).into(),
        protocol_generation: "exact engine/build/extension protocol required".into(),
        cache_versions: match id {
            RuntimeId::MccSteam => vec![13],
            RuntimeId::ChupathingyCe => vec![5, 7, 609],
            RuntimeId::OpenCe => vec![5, 609],
            RuntimeId::HaloPc | RuntimeId::MacRetail | RuntimeId::HaloMd => vec![7],
            RuntimeId::HaloCustomEdition => vec![609],
            RuntimeId::MacDemo | RuntimeId::HaloPcTrial => vec![6],
            RuntimeId::HaloXbox => vec![5],
        },
        implemented_adapter: id.allows_registration() || id == RuntimeId::MccSteam,
        detail: "Existing discovery/registration scope retained. Listed cache families describe bounded inspection or upstream input; they are not universal playback or conversion claims.".into(),
    }).collect();
    for (id, label, edition, platform, distribution, architecture, family) in [
        (
            "halo1-mcc-store",
            "MCC Halo 1 — Microsoft Store",
            "mccHalo1",
            "windows",
            "microsoftStore",
            "x86_64",
            GameFamily::Halo1,
        ),
        (
            "halo1-mcc-proton",
            "MCC Halo 1 — Steam / Proton",
            "mccHalo1",
            "linux",
            "steamProton",
            "x86_64",
            GameFamily::Halo1,
        ),
        (
            "halo1-h1a-standalone",
            "Halo CE Mod Tools — Standalone",
            "h1aStandalone",
            "windows",
            "steamTool",
            "x86",
            GameFamily::Halo1,
        ),
        (
            "halo1-mac-intel",
            "Halo Mac — Intel",
            "retail",
            "macos",
            "retail",
            "x86",
            GameFamily::Halo1,
        ),
        (
            "halo1-mac-powerpc",
            "Halo Mac — PowerPC G4/G5",
            "retail",
            "macos",
            "retail",
            "powerpc",
            GameFamily::Halo1,
        ),
        (
            "halo1-pc-dedicated",
            "Halo PC dedicated server",
            "retailDedicated",
            "windows",
            "retail",
            "x86",
            GameFamily::Halo1,
        ),
        (
            "halo1-ce-dedicated",
            "Halo Custom Edition dedicated server",
            "customEditionDedicated",
            "windows",
            "standalone",
            "x86",
            GameFamily::Halo1,
        ),
        (
            "halo1-experimental-remix",
            "Experimental MCC-content community fork",
            "experimentalRemix",
            "unknown",
            "community",
            "unknown",
            GameFamily::Halo1,
        ),
        (
            "halo2-future",
            "Halo 2 adapter research",
            "unprofiled",
            "unknown",
            "unknown",
            "unknown",
            GameFamily::Halo2,
        ),
        (
            "halo3-future",
            "Halo 3 adapter research",
            "unprofiled",
            "unknown",
            "unknown",
            "unknown",
            GameFamily::Halo3,
        ),
        (
            "halo3-odst-future",
            "Halo 3: ODST adapter research",
            "unprofiled",
            "unknown",
            "unknown",
            "unknown",
            GameFamily::Halo3Odst,
        ),
        (
            "halo-reach-future",
            "Halo: Reach adapter research",
            "unprofiled",
            "unknown",
            "unknown",
            "unknown",
            GameFamily::HaloReach,
        ),
        (
            "halo4-future",
            "Halo 4 adapter research",
            "unprofiled",
            "unknown",
            "unknown",
            "unknown",
            GameFamily::Halo4,
        ),
        (
            "halo-infinite-future",
            "Halo Infinite adapter research",
            "unprofiled",
            "unknown",
            "unknown",
            "unknown",
            GameFamily::HaloInfinite,
        ),
    ] {
        profiles.push(RuntimeAdapterProfile {
            profile_id: id.into(), adapter_version: 0, runtime_id: None, label: label.into(),
            target: RuntimeTarget { family, edition: edition.into(), platform: platform.into(), distribution: distribution.into(), architecture: architecture.into(), extension_ids: vec![] },
            resource_generation: if edition == "h1aStandalone" { "h1a-ek" } else { "unprofiled" }.into(),
            toolchain_generation: if edition == "h1aStandalone" { "h1a-ek" } else { "unprofiled" }.into(),
            protocol_generation: "unprofiled".into(), cache_versions: vec![],
            implemented_adapter: false,
            detail: if edition == "h1aStandalone" {
                "Official development scene testing is integrated through H1A tools, not a generic live/network adapter. Native SDK proof does not establish retail MCC multiplayer."
            } else {
                "Explicit retained target; no executable, write, conversion, or network adapter is implemented for this identity. H1 layouts must not be applied."
            }.into(),
        });
    }
    for (id, label, extension) in [
        (
            "halo1-ce-chimera",
            "Halo Custom Edition + Chimera",
            "chimera",
        ),
        (
            "halo1-ce-open-sauce",
            "Halo Custom Edition + OpenSauce",
            "openSauce",
        ),
        (
            "halo1-ce-balltze",
            "Halo Custom Edition + Balltze",
            "balltze",
        ),
        (
            "halo1-ce-sapp",
            "Halo Custom Edition dedicated + SAPP",
            "sapp",
        ),
        ("halo1-ce-mimic", "Halo Custom Edition + Mimic", "mimic"),
    ] {
        let mut target = target_for(RuntimeId::HaloCustomEdition, "windows");
        target.extension_ids.push(extension.into());
        profiles.push(RuntimeAdapterProfile {
            profile_id: id.into(), adapter_version: 0, runtime_id: None, label: label.into(), target,
            resource_generation: "halo-custom-edition".into(),
            toolchain_generation: "hek".into(),
            protocol_generation: "exact extension/build protocol required".into(),
            cache_versions: vec![], implemented_adapter: false,
            detail: "Retained CE-specific extension research target; no automatic binary/API/network compatibility follows from sharing the CE family. Requires pinned implementation, license and per-operation tests.".into(),
        });
    }
    profiles
}

fn gate(code: &str, detail: &str) -> CapabilityGate {
    CapabilityGate {
        code: code.into(),
        detail: detail.into(),
    }
}

fn capability(
    operation: RuntimeOperation,
    level: EvidenceLevel,
    availability: ActionAvailability,
    detail: &str,
    next: &str,
) -> RuntimeCapability {
    RuntimeCapability {
        operation,
        evidence_level: level,
        availability,
        detail: detail.into(),
        gates: vec![],
        next_action: next.into(),
        evidence: vec![],
    }
}

fn installed(observation: &RuntimeObservation) -> ActionAvailability {
    if observation.installation_validated {
        ActionAvailability::Ready
    } else {
        ActionAvailability::SetupRequired
    }
}

fn exact_mcc_build(observation: &RuntimeObservation) -> bool {
    observation.runtime_id == RuntimeId::MccSteam
        && observation.target.family == GameFamily::Halo1
        && observation.target.edition == "mccHalo1"
        && observation.target.platform == "windows"
        && observation.target.distribution == "steam"
        && observation.target.architecture == "x86_64"
        && observation.target.extension_ids.is_empty()
        && observation.fingerprint.executable_sha256.as_deref()
            == Some(crate::live_adapter::EXE_SHA256)
        && observation.fingerprint.module_sha256.as_deref()
            == Some(crate::live_adapter::MODULE_SHA256)
}

fn has_tool(observation: &RuntimeObservation, kind: ToolKind) -> bool {
    observation.toolchains.iter().any(|tools| {
        tools.validated
            && tools.generation == tool_generation(observation.runtime_id)
            && tools.tools.contains(&kind)
            && tools
                .content_identity
                .as_ref()
                .is_some_and(|identity| !identity.is_empty())
    })
}

fn matching_resources(observation: &RuntimeObservation) -> bool {
    observation.resources.iter().any(|resource| {
        observation.project.resource_generation.as_deref() == Some(resource.generation.as_str())
            && resource.complete
            && resource
                .identity
                .as_ref()
                .is_some_and(|identity| !identity.is_empty())
    })
}

fn known_cache(observation: &RuntimeObservation) -> bool {
    matches!(
        observation.project.cache_version,
        Some(5 | 6 | 7 | 13 | 609)
    ) && observation.target.family == GameFamily::Halo1
}

fn known_conversion_preflight(observation: &RuntimeObservation) -> bool {
    if observation.runtime_id != RuntimeId::MccSteam {
        return false;
    }
    match observation.project.conversion_profile.as_deref() {
        // `faithful` still requires native complete-source/resource/tool checks
        // below; it is not a claim that an arbitrary cache is recoverable.
        Some("faithful") => true,
        Some("zombie-recovery") => {
            observation.project.content_identity.as_deref()
                == Some(crate::legacy::ZOMBIE_DEMO_SHA256)
        }
        Some("yoyorast-v1-mcc") => observation
            .project
            .content_identity
            .as_deref()
            .is_some_and(crate::conversion::is_yoyorast_v1),
        Some("bigass-v2104-mcc") => {
            observation.project.content_identity.as_deref()
                == Some(crate::conversion::BIGASS_V2104_SHA256)
        }
        _ => false,
    }
}

fn live_gates(observation: &RuntimeObservation, write: bool) -> Vec<CapabilityGate> {
    let mut gates = vec![];
    if !exact_mcc_build(observation) {
        gates.push(gate("unverifiedBuild", "Exact Steam Windows x64 MCC EXE and Halo 1 module hashes, family, edition and extensions must match the audited adapter."));
    }
    if !observation.game_running || observation.session.process_id.is_none() {
        gates.push(gate("noRunningSession", "Inspect the specific running MCC Halo 1 process; installation detection is insufficient."));
    }
    if !observation.session.private_mod_session || !observation.session.anti_cheat_disabled {
        gates.push(gate("unsuitableSession", "Positively establish a compatible private mod session with anti-cheat disabled; launch-option selection alone is insufficient."));
    }
    if !observation.session.same_generation_confirmed
        || observation
            .session
            .map_identity
            .as_ref()
            .is_none_or(|v| v.is_empty())
        || observation
            .session
            .generation
            .as_ref()
            .is_none_or(|v| v.is_empty())
    {
        gates.push(gate("unverifiedGeneration", "Recheck current map identity and session generation; never restore bytes into a changed session."));
    }
    if write && !observation.session.explicit_live_consent {
        gates.push(gate(
            "liveConsentRequired",
            "The user must explicitly enable this live operation for the identified session.",
        ));
    }
    gates
}

/// Produce bounded evidence. Historical native tests are attached to their exact
/// target; the current observation cannot turn them into multiplayer acceptance.
pub fn capability_report(observation: &RuntimeObservation) -> RuntimeCapabilityReport {
    use ActionAvailability::*;
    use EvidenceLevel::*;
    use RuntimeOperation::*;
    let mut capabilities = vec![];
    let h1 = observation.target.family == GameFamily::Halo1;
    let expected_target = target_for(observation.runtime_id, &observation.target.platform);
    let target_matches = h1
        && observation.target.edition == expected_target.edition
        && observation.target.distribution == expected_target.distribution
        && (expected_target.architecture == "unknown"
            || observation.target.architecture == expected_target.architecture)
        && observation.target.extension_ids.is_empty();
    let editable_cache = known_cache(observation);
    let preservation = !observation.runtime_id.allows_registration()
        && observation.runtime_id != RuntimeId::MccSteam;
    let native_host_supported = match observation.runtime_id {
        RuntimeId::MccSteam | RuntimeId::HaloPc | RuntimeId::HaloCustomEdition => {
            observation.target.platform == "windows"
        }
        RuntimeId::ChupathingyCe => {
            ["windows", "linux", "macos"].contains(&observation.target.platform.as_str())
        }
        RuntimeId::OpenCe => ["windows", "linux"].contains(&observation.target.platform.as_str()),
        _ => false,
    };
    capabilities.push(capability(Detect, Implemented, if observation.detected { Ready } else { SetupRequired }, "Read-only installation discovery and explicit registrations are separate from playable content or a process attachment.", "Connect the matching installed Halo or register a compatible community runtime."));
    for (operation, detail) in [
        (Inspect, "Bounded H1 cache/tag/BSP inspection preserves source identity; missing resources and malformed or protected maps are reported."),
        (Edit, "Audited typed fields and source scene edits are supported. New editor placements are not arbitrary compiled scenario imports."),
        (Extract, "Bounded source/dependency extraction and staged export are implemented. Complete binary merge and universal recovery are not claimed."),
    ] {
        let mut record = capability(operation, if h1 { Implemented } else { Unknown }, if editable_cache { Ready } else { SetupRequired }, detail, "Select an owned supported map and resolve its exact resource generation; inspect refusal details for unsupported content.");
        if !editable_cache { record.gates.push(gate("mapProfileRequired", "Select a supported H1 cache profile; another Halo engine family cannot use H1 layouts.")); }
        capabilities.push(record);
    }
    for (operation, kind, detail) in [
        (Build, ToolKind::Tool, "Guided target-specific source build through the validated matching Tool generation; no console-only default or generic cache-header conversion."),
        (TestScene, ToolKind::Standalone, "H1A Standalone tests compatible loose editable source. It does not test retail MCC packaging, network play, or arbitrary cache loading."),
        (EditLevel, ToolKind::Sapien, "Open the current compatible editable scenario in the matching Sapien generation."),
        (EditTags, ToolKind::Guerilla, "Open the current compatible editable source tags in the matching Guerilla generation."),
    ] {
        let integrated = target_matches && !preservation && (operation != TestScene || observation.runtime_id == RuntimeId::MccSteam);
        let mut record = capability(operation, if integrated { Implemented } else { Unknown }, if !integrated { Unavailable } else if has_tool(observation, kind) && observation.project.source_complete { Ready } else { SetupRequired }, detail, "Choose compatible editable source and validate the matching installed editing kit in setup.");
        if !has_tool(observation, kind) { record.gates.push(gate("matchingToolchainRequired", "A validated tool of the matching content generation is required; a different Halo editing kit cannot substitute.")); }
        if !observation.project.source_complete { record.gates.push(gate("editableSourceRequired", "Complete compatible editable source and its dependencies are required.")); }
        if operation == Build && observation.project.contains_new_scenario_objects {
            record.availability = Unavailable;
            record.gates.push(gate("scenarioPlacementWriterMissing", "New/duplicated World scene objects are editor-only; current project build refuses them instead of silently producing a crashing scenario."));
        }
        if operation == TestScene {
            match observation.project.scenario_type {
                Some(2) => {
                    record.availability = Unavailable;
                    record.detail = "This is a UI scenario. Standalone's generic map startup is not a validated menu/UI launch context; edit tags and source builds remain separate paths.".into();
                    record.gates.push(gate("uiScenarioContextRequired", "Use an independently validated UI/menu context; do not treat this interface cache as a multiplayer or campaign map."));
                    record.next_action = "Edit/rebuild the UI source, then validate its correct native menu context before enabling scene launch.".into();
                }
                Some(0 | 1) => {},
                _ => {
                    if integrated { record.availability = SetupRequired; }
                    record.gates.push(gate("scenarioTypeRequired", "Inspect the actual scenario type before offering Standalone scene startup."));
                }
            }
        }
        capabilities.push(record);
    }
    let conversion_supported = observation.runtime_id == RuntimeId::MccSteam && target_matches;
    let mut convert = capability(Convert, if conversion_supported { Implemented } else { Unknown }, SetupRequired, "Bounded source-profile recovery and native MCC H1A recompilation exist; protected sources, missing dependencies, other-runtime conversion profiles and arbitrary binary cache conversions remain refused.", "Run source-profile and matching-resource preflight, then build in an isolated derived target workspace.");
    if known_conversion_preflight(observation)
        && matching_resources(observation)
        && has_tool(observation, ToolKind::Tool)
        && observation.project.source_complete
        && observation
            .project
            .content_identity
            .as_ref()
            .is_some_and(|v| !v.is_empty())
        && !observation.project.contains_new_scenario_objects
        && target_matches
        && !preservation
    {
        convert.availability = Ready;
    } else {
        convert.gates.push(gate("conversionPreflightRequired", "An implemented native source-profile preflight, exact resources, complete dependencies and matching validated builder are all required."));
    }
    if preservation || !conversion_supported {
        convert.availability = Unavailable;
    }
    capabilities.push(convert);
    let mut launch = capability(LaunchGame, if !preservation && native_host_supported && target_matches { Implemented } else { Unknown }, if preservation || !native_host_supported || !target_matches { Unavailable } else if observation.game_running { Running } else { installed(observation) }, "Explicit existing game/launcher integration is independent from content conversion and live editing. Discovery never executes a program.", "Validate the installed executable/official launcher and choose Play. Use the official MCC mod route where needed.");
    if !observation.installation_validated {
        launch.gates.push(gate("installationRequired", "A validated installation/launcher is required; executable-name matching alone is insufficient."));
    }
    capabilities.push(launch);
    let publish_supported = observation.runtime_id == RuntimeId::MccSteam && target_matches;
    capabilities.push(capability(Publish, if publish_supported { Implemented } else { Unsupported }, if !publish_supported { Unavailable } else if observation.project.built_output_verified && observation.project.publish_template_verified { Ready } else { SetupRequired }, "Owned MCC mod packaging, explicit manifest registration, and owned-package removal exist. Enumeration and in-game loading require separate acceptance.", "Verify the build output and exact Excession template; preview the owned destination before publishing."));
    for (operation, detail) in [
        (ObserveLive, "Exact-build MCC Halo 1 object/map inspection. No generic process reader or other-engine memory layout is exposed."),
        (MoveLiveObject, "Move existing live objects with bounds, readback and operation-owned restoration; this is not arbitrary spawning or game-peer replication."),
        (ScaleLiveObject, "Uniform existing item/vehicle scale and shared vehicle physics/suspension coupling. Owner accepted the corrected 2× Warthog; other vehicles/scales remain separate tests."),
        (Sprint, "Exact-build MCC Shift sprint controller; current default 1.75× is configurable. Proportional running animation and broader acceptance remain open."),
        (ThirdPersonCamera, "Exact-build editable shoulder camera and reversible first/third-person switch. Crosshair aim alignment remains an open acceptance defect."),
    ] {
        let mcc = observation.runtime_id == RuntimeId::MccSteam && target_matches;
        let gates = live_gates(observation, operation != ObserveLive);
        let mut record = capability(operation, if mcc { LocallyTested } else { Unsupported }, if !mcc { Unavailable } else if gates.is_empty() { Ready } else if !exact_mcc_build(observation) { UpdateNeeded } else { SetupRequired }, detail, "Use the audited exact Steam build in a verified private Halo 1 mod session; recheck identity and map generation before each operation.");
        if mcc {
            record.gates = gates;
            record.evidence.push(EvidenceReference { target: crate::live_adapter::PROFILE.into(), procedure: "C33 native local operation tests and owner observations; see operation-specific acceptance in the live adapter and gameplay documents.".into(), result: "Historical single-machine evidence only; current session, peer replication and remaining gameplay/visual gates are independent.".into(), location: "docs/LIVE_ADAPTER.md; docs/NATIVE_GAMEPLAY_AND_AUDIO.md; docs/CONTINUATION_33_ENGINEERING.md".into() });
        }
        capabilities.push(record);
    }
    for (operation, detail) in [
        (SpawnLiveObject, "No validated general engine object-create/delete call adapter is implemented. Editor previews do not create objects in Halo."),
        (ReplaceLiveBsp, "Live BSP/tunnel replacement is not implemented; engine collision, portals/PVS, ownership, and peer transitions require a separate validated adapter."),
        (ReplicateLiveEdits, "QuickForge source collaboration and the optional Steam development bridge synchronize editors, not authoritative game simulation or game-peer edits."),
    ] {
        capabilities.push(capability(operation, Unsupported, Unavailable, detail, "Implement the operation on a versioned engine API with generation-safe failure handling and real game/peer tests."));
    }
    let community = observation.runtime_id.is_native();
    let mut discovery = capability(DiscoverGames, if community { Implemented } else { Unsupported }, if community && target_matches { Ready } else { Unavailable }, "Read-only Delta List discovery for registered Chupathingy/OpenCE profiles has bounded JSON parsing, deduplication, stale/full/password reporting and refresh budgets. Listed protocol/build/content claims are advertisements, not a verified game connection.", "Choose a community game, then run the native runtime/content preflight; setup a compatible installation if needed.");
    if community {
        discovery.evidence.push(EvidenceReference { target: "Delta List provider / Chupathingy + OpenCE".into(), procedure: "Read-only GET https://stats.chupathingy.org/v1/games on 2026-10-28; bounded parser and adversarial fixture tests.".into(), result: "HTTP 200; 47 advertised games in 30,986 bytes. No game joined, hosted or protocol handshake accepted.".into(), location: "crates/spark-core/src/community_servers.rs; docs/CONTINUATION_34_ENGINEERING.md".into() });
    }
    capabilities.push(discovery);
    let mut join = capability(JoinGame, if community { Implemented } else { Unsupported }, if community && target_matches { SetupRequired } else { Unavailable }, "Typed halo://join handoff follows selected-server preflight for the matching community runtime, declared legacy version, source map/resources and listing freshness. The game must still verify its real wire protocol/content; planning is not a joined session.", "Select a fresh Delta listing and validate the registered client/content; hand the bounded invitation to the matching game for final verification.");
    join.gates.push(gate("selectedServerPreflightRequired", "A registry-wide ready flag cannot authorize a particular game invitation; the native community planner checks the selected listing and exact registered installation."));
    capabilities.push(join);
    capabilities.push(capability(HostGame, if community { UpstreamDeclared } else { Unknown }, Unavailable, "Upstream private/dedicated hosting instructions exist. Spark has not accepted an owner-controlled running game-server launch, host/client agreement or rollback path for this target.", "Follow the pinned runtime's documented private hosting plan and retain the actual server and client evidence before enabling automation."));
    let mut ai = capability(SynchronizeAi, if community { UpstreamDeclared } else { Unsupported }, Unavailable, if community { "Upstream community engine actor replication is separate from co-op script/encounter coverage. Spark has not accepted a real two-client authored AI scenario." } else { "No arbitrary multiplayer AI synchronization adapter is implemented for this runtime; official campaign co-op does not provide it." }, "Pin the engine implementation and validate host-authoritative lifecycle, damage/death, late join and map transitions in two real clients.");
    if community {
        ai.evidence.push(EvidenceReference { target: profile_id(observation.runtime_id).into(), procedure: "Inspect pinned upstream actor/netcode implementation, separate from Spark execution.".into(), result: "Upstream-declared implementation; no local or multiplayer acceptance in Spark.".into(), location: "docs/MCC_MULTIPLAYER_AI_FEASIBILITY.md".into() });
    }
    capabilities.push(ai);
    capabilities.push(capability(CampaignCoop, if community || observation.runtime_id == RuntimeId::MccSteam { UpstreamDeclared } else { Unknown }, Unavailable, "Engine campaign co-op, script synchronization, and arbitrary multiplayer AI are different capabilities. No two-computer Spark campaign acceptance has been recorded.", "Use a compatible campaign profile and verify progression, respawn, checkpoints and late join on real clients."));
    capabilities.push(capability(PlayerScale, Unknown, Unavailable, &format!("The 128-player target remains open. Current observation reports {:?} tested players; neither protocol metadata nor simulated messages certify real clients.", observation.protocol.tested_players), "Progress through controlled 2/8/16/32/64/128-client gates with matched content, measured server/frame/network budgets and AI/connected-world acceptance."));
    capabilities.push(capability(LegacyTools, Implemented, if has_tool(observation, ToolKind::Legacy) { Ready } else { SetupRequired }, "Optional legacy companion fingerprint/setup and explicit launch are separate from modern Halo tools. A detected archive is not a verified executable.", "Choose and validate the separately installed exact companion. Confirm each legacy execution or external download."));
    let mut diagnostics = vec!["Registry evidence describes a bounded operation, not authorization to execute it. Native handlers must revalidate identities, generation and operation preconditions.".into()];
    if !exact_mcc_build(observation) {
        diagnostics.push("Unverified exact builds retain bounded file inspection/setup; no MCC live memory operation is enabled by installation detection or a version string.".into());
    }
    if observation.protocol.two_client_tested || observation.protocol.tested_players.is_some() {
        diagnostics.push("Caller-supplied protocol metadata is observational only; it does not promote any operation to multiplayer-tested without retained game test evidence.".into());
    }
    RuntimeCapabilityReport {
        schema_version: REGISTRY_SCHEMA_VERSION,
        adapter_version: profile_version(observation.runtime_id),
        profile_id: profile_id(observation.runtime_id).into(),
        target: observation.target.clone(),
        fingerprint: observation.fingerprint.clone(),
        resources: observation.resources.clone(),
        toolchains: observation.toolchains.clone(),
        protocol: observation.protocol.clone(),
        session: observation.session.clone(),
        player_scale: PlayerScaleAcceptance {
            goal_players: 128,
            checkpoints: vec![2, 8, 16, 32, 64, 128],
            accepted_game_players: None,
            reported_players: observation.protocol.tested_players,
        },
        capabilities,
        diagnostics,
    }
}

pub fn dock_actions(report: &RuntimeCapabilityReport) -> Vec<RuntimeDockAction> {
    use RuntimeOperation::*;
    [
        ("play", LaunchGame, "Play Halo"),
        ("testScene", TestScene, "Test Scene"),
        ("editLevel", EditLevel, "Sapien / Edit Level"),
        ("editTags", EditTags, "Guerilla / Edit Tags"),
        ("build", Build, "Build Map"),
        ("publish", Publish, "Publish Mod"),
        ("findGames", DiscoverGames, "Find Games"),
        ("host", HostGame, "Host"),
        ("legacy", LegacyTools, "Legacy Tools"),
    ]
    .into_iter()
    .filter_map(|(id, operation, label)| {
        report
            .capability(operation)
            .map(|capability| RuntimeDockAction {
                id: id.into(),
                operation,
                label: label.into(),
                availability: capability.availability,
                description: capability.detail.clone(),
                next_action: capability.next_action.clone(),
                requires_confirmation: operation == LegacyTools,
            })
    })
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn observation(id: RuntimeId) -> RuntimeObservation {
        RuntimeObservation {
            runtime_id: id,
            target: target_for(id, "windows"),
            detected: true,
            installation_validated: true,
            game_running: false,
            fingerprint: BuildFingerprint::default(),
            resources: vec![],
            toolchains: vec![],
            protocol: ProtocolEvidence::default(),
            session: SessionEvidence::default(),
            project: ProjectEvidence {
                cache_version: Some(13),
                ..Default::default()
            },
        }
    }
    fn live() -> RuntimeObservation {
        let mut o = observation(RuntimeId::MccSteam);
        o.game_running = true;
        o.fingerprint = BuildFingerprint {
            executable_sha256: Some(crate::live_adapter::EXE_SHA256.into()),
            module_sha256: Some(crate::live_adapter::MODULE_SHA256.into()),
            build_label: Some("1.3528.0.0".into()),
        };
        o.session = SessionEvidence {
            process_id: Some(42),
            private_mod_session: true,
            anti_cheat_disabled: true,
            explicit_live_consent: true,
            map_identity: Some("owned-map-sha256".into()),
            generation: Some("session-42-map-7".into()),
            same_generation_confirmed: true,
        };
        o
    }
    #[test]
    fn registration_does_not_grant_memory_or_conversion_or_network_actions() {
        let report = capability_report(&observation(RuntimeId::MccSteam));
        assert_eq!(
            report
                .capability(RuntimeOperation::Inspect)
                .unwrap()
                .availability,
            ActionAvailability::Ready
        );
        for op in [
            RuntimeOperation::ObserveLive,
            RuntimeOperation::MoveLiveObject,
            RuntimeOperation::ScaleLiveObject,
            RuntimeOperation::Convert,
            RuntimeOperation::SynchronizeAi,
            RuntimeOperation::HostGame,
            RuntimeOperation::JoinGame,
        ] {
            assert_ne!(
                report.capability(op).unwrap().availability,
                ActionAvailability::Ready,
                "{op:?}"
            );
        }
    }
    #[test]
    fn live_identity_dimensions_and_generation_are_all_required() {
        let accepted = live();
        assert_eq!(
            capability_report(&accepted)
                .capability(RuntimeOperation::MoveLiveObject)
                .unwrap()
                .availability,
            ActionAvailability::Ready
        );
        let mut variants = vec![];
        let mut o = accepted.clone();
        o.target.distribution = "microsoftStore".into();
        variants.push(o);
        let mut o = accepted.clone();
        o.target.architecture = "powerpc".into();
        variants.push(o);
        let mut o = accepted.clone();
        o.target.family = GameFamily::Halo2;
        variants.push(o);
        let mut o = accepted.clone();
        o.target.extension_ids.push("unprofiled".into());
        variants.push(o);
        let mut o = accepted.clone();
        o.fingerprint.module_sha256 = None;
        variants.push(o);
        let mut o = accepted.clone();
        o.session.same_generation_confirmed = false;
        variants.push(o);
        let mut o = accepted.clone();
        o.session.anti_cheat_disabled = false;
        variants.push(o);
        let mut o = accepted.clone();
        o.session.private_mod_session = false;
        variants.push(o);
        let mut o = accepted.clone();
        o.session.explicit_live_consent = false;
        variants.push(o);
        for o in variants {
            assert_ne!(
                capability_report(&o)
                    .capability(RuntimeOperation::MoveLiveObject)
                    .unwrap()
                    .availability,
                ActionAvailability::Ready
            );
        }
    }
    #[test]
    fn unimplemented_engine_operations_stay_blocked_in_an_accepted_local_session() {
        let report = capability_report(&live());
        for op in [
            RuntimeOperation::SpawnLiveObject,
            RuntimeOperation::ReplaceLiveBsp,
            RuntimeOperation::ReplicateLiveEdits,
            RuntimeOperation::SynchronizeAi,
            RuntimeOperation::PlayerScale,
        ] {
            assert_eq!(
                report.capability(op).unwrap().availability,
                ActionAvailability::Unavailable
            );
        }
    }
    #[test]
    fn wrong_generation_tools_and_missing_source_never_enable_build() {
        let mut o = observation(RuntimeId::MccSteam);
        o.project.source_complete = true;
        o.toolchains.push(ToolchainEvidence {
            generation: "hek".into(),
            architecture: Some("x86".into()),
            validated: true,
            tools: vec![ToolKind::Tool],
            content_identity: Some("tags".into()),
        });
        assert_ne!(
            capability_report(&o)
                .capability(RuntimeOperation::Build)
                .unwrap()
                .availability,
            ActionAvailability::Ready
        );
        o.toolchains[0].generation = "h1a-ek".into();
        assert_eq!(o.target.architecture, "x86_64");
        assert_eq!(o.toolchains[0].architecture.as_deref(), Some("x86"));
        assert_eq!(
            capability_report(&o)
                .capability(RuntimeOperation::Build)
                .unwrap()
                .availability,
            ActionAvailability::Ready
        );
        o.project.contains_new_scenario_objects = true;
        assert_eq!(
            capability_report(&o)
                .capability(RuntimeOperation::Build)
                .unwrap()
                .availability,
            ActionAvailability::Unavailable
        );
    }
    #[test]
    fn foreign_resources_and_protocol_metadata_do_not_certify_conversion_or_gameplay() {
        let mut o = observation(RuntimeId::ChupathingyCe);
        o.project.source_complete = true;
        o.project.conversion_profile = Some("source-selected".into());
        o.toolchains.push(ToolchainEvidence {
            generation: "hek".into(),
            architecture: Some("x86".into()),
            validated: true,
            tools: vec![ToolKind::Tool],
            content_identity: Some("source-tags".into()),
        });
        o.resources.push(ResourceEvidence {
            generation: "mcc-halo1".into(),
            source: Some("owned-install".into()),
            complete: true,
            identity: Some("mcc-bank".into()),
        });
        o.protocol.compatible = true;
        o.protocol.two_client_tested = true;
        o.protocol.tested_players = Some(128);
        let report = capability_report(&o);
        assert_ne!(
            report
                .capability(RuntimeOperation::Convert)
                .unwrap()
                .availability,
            ActionAvailability::Ready
        );
        assert!(!report
            .capabilities
            .iter()
            .any(|c| c.evidence_level == EvidenceLevel::MultiplayerTested));
        assert_eq!(
            report
                .capability(RuntimeOperation::PlayerScale)
                .unwrap()
                .availability,
            ActionAvailability::Unavailable
        );
    }
    #[test]
    fn native_conversion_requires_an_implemented_source_bound_preflight() {
        let mut o = observation(RuntimeId::MccSteam);
        o.project.source_complete = true;
        o.project.content_identity = Some("owned-source".into());
        o.project.resource_generation = Some("halo-custom-edition".into());
        o.project.conversion_profile = Some("unimplemented-converter".into());
        o.toolchains.push(ToolchainEvidence {
            generation: "h1a-ek".into(),
            architecture: Some("x86".into()),
            validated: true,
            tools: vec![ToolKind::Tool],
            content_identity: Some("verified-tags".into()),
        });
        o.resources.push(ResourceEvidence {
            generation: "halo-custom-edition".into(),
            source: Some("owned-resource-map".into()),
            complete: true,
            identity: Some("exact-resource-sha".into()),
        });
        assert_ne!(
            capability_report(&o)
                .capability(RuntimeOperation::Convert)
                .unwrap()
                .availability,
            ActionAvailability::Ready
        );
        o.project.conversion_profile = Some("yoyorast-v1-mcc".into());
        assert_ne!(
            capability_report(&o)
                .capability(RuntimeOperation::Convert)
                .unwrap()
                .availability,
            ActionAvailability::Ready
        );
        o.project.content_identity = Some(crate::conversion::YOYORAST_V1_SHA256.into());
        assert_eq!(
            capability_report(&o)
                .capability(RuntimeOperation::Convert)
                .unwrap()
                .availability,
            ActionAvailability::Ready
        );
        o.project.contains_new_scenario_objects = true;
        assert_ne!(
            capability_report(&o)
                .capability(RuntimeOperation::Convert)
                .unwrap()
                .availability,
            ActionAvailability::Ready
        );
    }
    #[test]
    fn ui_cache_is_not_implicitly_a_standalone_map_but_tags_and_build_stay_separate() {
        let mut o = observation(RuntimeId::MccSteam);
        o.project.source_complete = true;
        o.project.scenario_type = Some(2);
        o.toolchains.push(ToolchainEvidence {
            generation: "h1a-ek".into(),
            architecture: Some("x86".into()),
            validated: true,
            tools: vec![ToolKind::Standalone, ToolKind::Tool, ToolKind::Guerilla],
            content_identity: Some("validated-ui-source".into()),
        });
        let report = capability_report(&o);
        let scene = report.capability(RuntimeOperation::TestScene).unwrap();
        assert_eq!(scene.availability, ActionAvailability::Unavailable);
        assert!(scene
            .gates
            .iter()
            .any(|g| g.code == "uiScenarioContextRequired"));
        assert_eq!(
            report
                .capability(RuntimeOperation::Build)
                .unwrap()
                .availability,
            ActionAvailability::Ready
        );
        assert_eq!(
            report
                .capability(RuntimeOperation::EditTags)
                .unwrap()
                .availability,
            ActionAvailability::Ready
        );
        o.project.scenario_type = Some(1);
        assert_eq!(
            capability_report(&o)
                .capability(RuntimeOperation::TestScene)
                .unwrap()
                .availability,
            ActionAvailability::Ready
        );
    }
    #[test]
    fn adapter_contract_versions_are_explicit_and_separate_from_schema() {
        let profiles = registry();
        for profile in profiles {
            if let Some(id) = profile.runtime_id {
                assert_eq!(profile.adapter_version, profile_version(id));
                assert!(profile.adapter_version > 0);
            } else {
                assert_eq!(profile.adapter_version, 0);
            }
        }
        let report = capability_report(&observation(RuntimeId::MccSteam));
        assert_eq!(report.adapter_version, profile_version(RuntimeId::MccSteam));
        assert_eq!(report.schema_version, REGISTRY_SCHEMA_VERSION);
    }
    #[test]
    fn all_legacy_ids_and_future_families_are_retained_without_h1_layout_reuse() {
        let profiles = registry();
        assert_eq!(
            profiles.iter().filter(|p| p.runtime_id.is_some()).count(),
            10
        );
        for profile in profiles
            .iter()
            .filter(|p| p.target.family != GameFamily::Halo1)
        {
            assert!(!profile.implemented_adapter);
            assert!(profile.cache_versions.is_empty());
        }
        assert!(profiles.iter().any(|p| p.target.architecture == "powerpc"));
        assert!(profiles
            .iter()
            .any(|p| p.target.distribution == "microsoftStore"));
    }
    #[test]
    fn dock_actions_have_unique_task_names_and_source_game_test_distinctions() {
        let report = capability_report(&observation(RuntimeId::MccSteam));
        assert_eq!(report.capabilities.len(), RuntimeOperation::ALL.len());
        for operation in RuntimeOperation::ALL {
            assert_eq!(
                report
                    .capabilities
                    .iter()
                    .filter(|c| c.operation == operation)
                    .count(),
                1,
                "{operation:?}"
            );
        }
        let actions = dock_actions(&report);
        let mut ids: Vec<_> = actions.iter().map(|a| a.id.as_str()).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), 9);
        assert!(actions
            .iter()
            .find(|a| a.id == "testScene")
            .unwrap()
            .description
            .contains("does not test retail MCC"));
        assert!(
            actions
                .iter()
                .find(|a| a.id == "legacy")
                .unwrap()
                .requires_confirmation
        );
    }

    #[test]
    fn discovery_report_does_not_confuse_a_steam_launcher_hash_with_mcc_identity() {
        let report = RuntimeReport {
            schema_version: 1,
            adapter_version: 1,
            id: RuntimeId::MccSteam,
            name: "MCC".into(),
            host_platform: "windows".into(),
            installation: Some(crate::runtime::RuntimeInstallation {
                registration_id: "steam-976730".into(),
                root: "owned-mcc".into(),
                executable: Some("steam.exe".into()),
                data_root: "owned-mcc".into(),
                executable_sha256: Some(crate::live_adapter::EXE_SHA256.into()),
                version: Some("1.3528.0.0".into()),
                network_version: None,
                identity: "steamManifest".into(),
                validation: TestStatus::Pass,
                diagnostics: vec![],
            }),
            capabilities: vec![],
            map_families: vec![],
            diagnostics: vec![],
        };
        let observed = RuntimeObservation::from_report(&report);
        assert!(observed.detected && observed.installation_validated);
        assert!(observed.fingerprint.executable_sha256.is_none());
        assert!(!observed.session.explicit_live_consent);
        assert_ne!(
            capability_report(&observed)
                .capability(RuntimeOperation::MoveLiveObject)
                .unwrap()
                .availability,
            ActionAvailability::Ready
        );
    }
}
