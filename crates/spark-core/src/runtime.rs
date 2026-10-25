//! Read-only runtime adapters. Discovery never executes a game or writes game data.
use crate::{invalid, maps, steam, Result};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

pub const ADAPTER_SCHEMA_VERSION: u32 = 1;
pub const ADAPTER_VERSION: u32 = 1;
const MAX_INVENTORY_ENTRIES: usize = 4096;
const MAX_EXECUTABLE_BYTES: u64 = 2 * 1024 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeId {
    MccSteam,
    ChupathingyCe,
    OpenCe,
    HaloPc,
    HaloCustomEdition,
    MacRetail,
    MacDemo,
    HaloPcTrial,
    HaloMd,
    HaloXbox,
}
impl RuntimeId {
    pub fn name(self) -> &'static str {
        match self {
            Self::MccSteam => "Steam MCC / Halo 1",
            Self::ChupathingyCe => "ChupathingyCE",
            Self::OpenCe => "OpenCE",
            Self::HaloPc => "Halo PC Retail",
            Self::HaloCustomEdition => "Halo Custom Edition",
            Self::MacRetail => "Halo Mac Retail (preservation)",
            Self::MacDemo => "Halo Mac Demo (preservation)",
            Self::HaloPcTrial => "Halo PC Trial (preservation)",
            Self::HaloMd => "HaloMD (preservation)",
            Self::HaloXbox => "Halo Xbox (preservation)",
        }
    }
    pub fn allows_registration(self) -> bool {
        matches!(
            self,
            Self::ChupathingyCe | Self::OpenCe | Self::HaloPc | Self::HaloCustomEdition
        )
    }
    pub fn is_native(self) -> bool {
        matches!(self, Self::ChupathingyCe | Self::OpenCe)
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SupportStatus {
    Supported,
    Unsupported,
    Unknown,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TestStatus {
    Pass,
    Fail,
    Blocked,
    Untested,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EvidenceKind {
    Application,
    OfficialDocumentation,
    UpstreamSource,
    UserDeclaration,
    LocalInspection,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceReference {
    pub title: String,
    pub url: String,
    pub revision: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityEvidence {
    pub key: String,
    pub status: SupportStatus,
    pub evidence: EvidenceKind,
    pub test_status: TestStatus,
    pub detail: String,
    pub sources: Vec<SourceReference>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapFamilyCapability {
    pub family: String,
    pub cache_versions: Vec<u32>,
    pub status: SupportStatus,
    pub evidence: EvidenceKind,
    pub test_status: TestStatus,
    pub detail: String,
    pub sources: Vec<SourceReference>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuntimeRegistration {
    pub id: String,
    pub runtime_id: RuntimeId,
    pub root: PathBuf,
    pub executable: PathBuf,
    pub data_root: Option<PathBuf>,
    pub version: Option<String>,
    pub network_version: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInstallation {
    pub registration_id: String,
    pub root: PathBuf,
    pub executable: Option<PathBuf>,
    pub data_root: PathBuf,
    pub executable_sha256: Option<String>,
    pub version: Option<String>,
    pub network_version: Option<String>,
    pub identity: String,
    pub validation: TestStatus,
    pub diagnostics: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeReport {
    pub schema_version: u32,
    pub adapter_version: u32,
    pub id: RuntimeId,
    pub name: String,
    pub host_platform: String,
    pub installation: Option<RuntimeInstallation>,
    pub capabilities: Vec<CapabilityEvidence>,
    pub map_families: Vec<MapFamilyCapability>,
    pub diagnostics: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeMapEntry {
    pub relative_path: String,
    pub family: String,
    pub cache_version: Option<u32>,
    pub sha256: Option<String>,
    pub scenario_type: Option<u16>,
    pub file_size: u64,
    pub valid: bool,
    pub detail: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeResourceEntry {
    pub relative_path: String,
    pub name: String,
    pub sha256: Option<String>,
    pub size: Option<u64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInventory {
    pub runtime_id: RuntimeId,
    pub registration_id: String,
    pub maps: Vec<RuntimeMapEntry>,
    pub resources: Vec<RuntimeResourceEntry>,
    pub diagnostics: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchPlan {
    pub runtime_id: RuntimeId,
    pub executable: PathBuf,
    pub cwd: PathBuf,
    pub args: Vec<String>,
    pub direct_map_launch: bool,
    pub warnings: Vec<String>,
}

/// A versioned adapter describes evidence and prepares actions; it never executes them.
pub trait HaloRuntimeAdapter {
    fn id(&self) -> RuntimeId;
    fn adapter_version(&self) -> u32 {
        ADAPTER_VERSION
    }
    fn descriptor(&self) -> RuntimeReport;
    fn inspect_registration(
        &self,
        registration: &RuntimeRegistration,
    ) -> Result<RuntimeInstallation> {
        if self.id() != registration.runtime_id {
            return invalid("Registration belongs to another runtime adapter");
        }
        inspect_registration(registration)
    }
    fn inventory_maps(&self, registration: &RuntimeRegistration) -> Result<RuntimeInventory> {
        if self.id() != registration.runtime_id {
            return invalid("Registration belongs to another runtime adapter");
        }
        inventory_maps(registration)
    }
    fn prepare_launch(&self, registration: &RuntimeRegistration) -> Result<LaunchPlan> {
        if self.id() != registration.runtime_id {
            return invalid("Registration belongs to another runtime adapter");
        }
        prepare_launch(registration)
    }
}
pub struct ProfileAdapter(pub RuntimeId);
impl HaloRuntimeAdapter for ProfileAdapter {
    fn id(&self) -> RuntimeId {
        self.0
    }
    fn descriptor(&self) -> RuntimeReport {
        descriptor(self.0)
    }
}

pub fn platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
}
pub fn version_token(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._+-".contains(&c))
}

fn source(id: RuntimeId) -> Vec<SourceReference> {
    let (title, url, revision) = match id {
        RuntimeId::ChupathingyCe => ("ChupathingyCE audited README", "https://github.com/ChupathingyCE/chupathingyce/blob/d7fafc81f824886d7fccd58fcf954691df6c6901/README.md", Some("d7fafc81f824886d7fccd58fcf954691df6c6901")),
        RuntimeId::OpenCe => ("OpenCE audited README", "https://github.com/OpenCommunityEdition/OpenCE/blob/7fb941b0b205edb1f7ecbb0aa6c2d7f5b884732d/README.md", Some("7fb941b0b205edb1f7ecbb0aa6c2d7f5b884732d")),
        RuntimeId::MccSteam => ("Official MCC anti-cheat-disabled launch", "https://support.halowaypoint.com/hc/en-us/articles/360037475251-How-to-Launch-Halo-The-Master-Chief-Collection-with-Easy-Anti-Cheat-EAC-Disabled", None),
        _ => ("H1 cache format reference", "https://c20.reclaimers.net/h1/maps/", None),
    };
    vec![SourceReference {
        title: title.into(),
        url: url.into(),
        revision: revision.map(str::to_string),
    }]
}
fn capability(
    key: &str,
    status: SupportStatus,
    evidence: EvidenceKind,
    detail: &str,
    sources: Vec<SourceReference>,
) -> CapabilityEvidence {
    CapabilityEvidence {
        key: key.into(),
        status,
        evidence,
        test_status: TestStatus::Untested,
        detail: detail.into(),
        sources,
    }
}
fn descriptor(id: RuntimeId) -> RuntimeReport {
    use EvidenceKind::*;
    use SupportStatus::*;
    let preservation = !id.allows_registration() && id != RuntimeId::MccSteam;
    let upstream = if id == RuntimeId::MccSteam {
        OfficialDocumentation
    } else {
        UpstreamSource
    };
    let mut capabilities = vec![
        capability("inspectMaps", Supported, Application, "Guilty Spark inspects supported cache families; this is not a runtime playback result.", vec![]),
        capability("importMaps", Supported, Application, "Application import preserves and indexes supported cache families and bounded ZIP candidates. Unsupported or malformed formats remain blocked; importing does not establish playback.", vec![]),
        capability("editMaps", Supported, Application, "Only audited fields are editable. Rebuild/playback support is evaluated separately.", vec![]),
        capability("convertMaps", Unknown, Application, "Conversion requires the original resources, complete extraction and a target-specific rebuild. No universal conversion or playable output is claimed.", vec![]),
        capability("rebuildMaps", Unknown, Application, "Requires a complete extraction, original resources and the target-specific toolchain; no blanket conversion support.", vec![]),
        capability("launchRuntime", if preservation { Unsupported } else { Supported }, Application,
            if preservation { "Preservation profile only; no executable integration." } else { "Explicit launch requires a validated installation. No runtime was launched by adapter discovery." }, vec![]),
        capability("launchMap", if preservation { Unsupported } else { Unknown }, Application, "Direct map launch is not implemented or verified. Native adapters supply no guessed command-line flags.", vec![]),
        capability("hostMultiplayer", if preservation { Unknown } else { Supported }, upstream, "Documented engine capability; exact installed build, map and real multiplayer session remain untested.", source(id)),
        capability("networkedAi", if id.is_native() { Supported } else if matches!(id, RuntimeId::HaloPc | RuntimeId::HaloCustomEdition) { Unsupported } else { Unknown }, upstream,
            if id.is_native() { "Upstream actor replication exists separately from co-op scripts. This map and two-computer gameplay are untested." }
            else if id == RuntimeId::MccSteam { "Campaign co-op and arbitrary multiplayer AI are separate. No supported MCC multiplayer AI bridge is implemented." }
            else { "No arbitrary multiplayer AI synchronization is integrated for this profile." }, source(id)),
        capability("liveEditing", Unsupported, Application, "No attached runtime bridge or live transport is implemented.", vec![]),
        capability("vr", Unknown, Application, "No OpenXR runtime integration or gameplay test is implemented.", vec![]),
        capability("installMod", if id == RuntimeId::MccSteam { Supported } else { Unsupported }, Application, "Only MCC owned local-package creation is implemented. It requires validated output and an exact Excession template; game enumeration remains untested.", vec![]),
        capability("registerMod", if id == RuntimeId::MccSteam { Supported } else { Unsupported }, Application, "Only explicit MCC owned-root manifest registration is implemented; discovery never changes it.", vec![]),
        capability("unregisterMod", Unsupported, Application, "Manifest-root unregistration is not implemented. MCC owned-package removal is a separate operation.", vec![]),
        capability("removeMod", if id == RuntimeId::MccSteam { Supported } else { Unsupported }, Application, "Only explicit verified removal of a Guilty Spark owned MCC package is implemented; stock content is excluded.", vec![]),
        capability("readLogs", Unsupported, Application, "Game-runtime log collection is not integrated. Application build logs are separate.", vec![]),
        capability("discoverRunning", if id == RuntimeId::MccSteam { Supported } else { Unsupported }, Application, "MCC process-name discovery is implemented; generic native running-instance discovery and attachment are not.", vec![]),
    ];
    if id == RuntimeId::MccSteam || id.is_native() {
        capabilities.push(capability("campaignCoop", Supported, upstream, "Documented upstream campaign capability. A valid authored campaign and separate real two-computer tests are required.", source(id)));
    }
    let host_supported = match id {
        RuntimeId::MccSteam | RuntimeId::HaloPc | RuntimeId::HaloCustomEdition => {
            platform() == "windows"
        }
        RuntimeId::ChupathingyCe => ["windows", "linux", "macos"].contains(&platform()),
        RuntimeId::OpenCe => ["windows", "linux"].contains(&platform()),
        _ => false,
    };
    if !host_supported {
        if let Some(launch) = capabilities.iter_mut().find(|c| c.key == "launchRuntime") {
            launch.status = Unsupported;
            launch.detail =
                "This profile has no established launch integration on the current host platform."
                    .into();
        }
    }
    let families = [
        ("xbox", vec![5]),
        ("demoTrial", vec![6]),
        ("pcMacHaloMd", vec![7]),
        ("customEdition", vec![609]),
        ("mccHalo1", vec![13]),
        ("openSauce", vec![]),
    ];
    let map_families = families.into_iter().map(|(family, versions)| {
        let version = versions.first().copied().unwrap_or(0);
        let supported = match id {
            RuntimeId::MccSteam => version == 13,
            RuntimeId::ChupathingyCe => [5, 7, 609].contains(&version),
            RuntimeId::OpenCe => [5, 609].contains(&version),
            RuntimeId::HaloPc | RuntimeId::MacRetail | RuntimeId::HaloMd => version == 7,
            RuntimeId::HaloCustomEdition => version == 609,
            RuntimeId::MacDemo | RuntimeId::HaloPcTrial => version == 6,
            RuntimeId::HaloXbox => version == 5,
        };
        MapFamilyCapability {
            family: family.into(), cache_versions: versions,
            status: if preservation { Unknown } else if supported { Supported } else { Unknown },
            evidence: if preservation { Application } else { upstream }, test_status: TestStatus::Untested,
            detail: if preservation { "Cache preservation/inspection profile only; no runtime execution claim." }
                else if version == 7 { "Version 7 does not distinguish retail, Mac or HaloMD provenance. Matching resources and target layout are required." }
                else if supported { "Family documented for this engine; each map still needs structural, resource and gameplay validation." }
                else { "Direct loading/conversion for this family is not established. Do not rewrite its version to claim compatibility." }.into(),
            sources: source(id),
        }
    }).collect();
    RuntimeReport {
        schema_version: ADAPTER_SCHEMA_VERSION,
        adapter_version: ADAPTER_VERSION,
        id,
        name: id.name().into(),
        host_platform: platform().into(),
        installation: None,
        capabilities,
        map_families,
        diagnostics: vec![
            "No local gameplay or two-computer multiplayer result is attached to this report."
                .into(),
        ],
    }
}

pub fn report(
    steam: &steam::Installation,
    registrations: &[RuntimeRegistration],
) -> Result<Vec<RuntimeReport>> {
    if registrations.len() > 32 {
        return invalid("Too many runtime registrations");
    }
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
    let mut reports = Vec::new();
    for id in ids {
        let mut item = descriptor(id);
        if id == RuntimeId::MccSteam {
            if let Some(root) = &steam.mcc_path {
                let version = steam::mcc_build_id(steam).unwrap_or_else(|e| {
                    item.diagnostics.push(e.to_string());
                    None
                });
                let identity = if version.is_some() {
                    "steamManifest"
                } else {
                    "unknown"
                };
                item.installation = Some(RuntimeInstallation {
                    registration_id: "steam-976730".into(),
                    root: root.clone(),
                    executable: steam.steam_executable.clone(),
                    data_root: root.clone(),
                    executable_sha256: None,
                    version,
                    network_version: None,
                    identity: identity.into(),
                    validation: if steam.halo1_installed
                        && steam.steam_executable.as_ref().is_some_and(|p| p.is_file())
                    {
                        TestStatus::Pass
                    } else {
                        TestStatus::Blocked
                    },
                    diagnostics: steam.diagnostics.clone(),
                });
            }
            if platform() != "windows" {
                item.diagnostics.push(
                    "The Windows MCC modding workflow is not verified on this host platform."
                        .into(),
                );
            }
        } else if let Some(registration) = registrations.iter().find(|r| r.runtime_id == id) {
            match inspect_registration(registration) {
                Ok(installation) => item.installation = Some(installation),
                Err(e) => item
                    .diagnostics
                    .push(format!("Registration validation failed: {e}")),
            }
        }
        reports.push(item);
    }
    Ok(reports)
}

fn checked_directory(path: &Path) -> Result<PathBuf> {
    crate::reject_links(path)?;
    if !path.is_dir() {
        return invalid("Runtime directory does not exist");
    }
    Ok(fs::canonicalize(path)?)
}
fn registration_roots(registration: &RuntimeRegistration) -> Result<(PathBuf, PathBuf, PathBuf)> {
    if !registration.runtime_id.allows_registration() {
        return invalid(
            "This profile does not accept executable registrations; MCC uses Steam discovery",
        );
    }
    if !version_token(&registration.id) {
        return invalid("Registration ID must be a bounded identifier");
    }
    for value in [&registration.version, &registration.network_version]
        .into_iter()
        .flatten()
    {
        if !version_token(value) {
            return invalid(
                "Declared versions must be bounded version tokens, not paths or free-form text",
            );
        }
    }
    let root = checked_directory(&registration.root)?;
    crate::reject_links(&registration.executable)?;
    let executable = fs::canonicalize(&registration.executable)?;
    if !executable.starts_with(&root) {
        return invalid("Registered executable must be inside its installation root");
    }
    if !executable.is_file() {
        return invalid("Registered executable is not a regular file");
    }
    let data_root = checked_directory(
        registration
            .data_root
            .as_deref()
            .unwrap_or(&registration.root),
    )?;
    Ok((root, executable, data_root))
}
fn executable_format(path: &Path) -> Result<&'static str> {
    let meta = fs::metadata(path)?;
    if !(4..=MAX_EXECUTABLE_BYTES).contains(&meta.len()) {
        return invalid("Executable size is outside inspection limits");
    }
    let mut signature = [0u8; 4];
    fs::File::open(path)?.read_exact(&mut signature)?;
    if signature.starts_with(b"MZ") {
        Ok("windows")
    } else if signature == *b"\x7fELF" {
        Ok("linux")
    } else if [
        [0xfe, 0xed, 0xfa, 0xce],
        [0xce, 0xfa, 0xed, 0xfe],
        [0xfe, 0xed, 0xfa, 0xcf],
        [0xcf, 0xfa, 0xed, 0xfe],
        [0xca, 0xfe, 0xba, 0xbe],
        [0xbe, 0xba, 0xfe, 0xca],
        [0xca, 0xfe, 0xba, 0xbf],
        [0xbf, 0xba, 0xfe, 0xca],
    ]
    .contains(&signature)
    {
        Ok("macos")
    } else {
        invalid("Unrecognized executable signature; scripts and archive payloads are not launch registrations")
    }
}

pub fn inspect_registration(registration: &RuntimeRegistration) -> Result<RuntimeInstallation> {
    let (root, executable, data_root) = registration_roots(registration)?;
    let binary_platform = executable_format(&executable)?;
    let mut diagnostics = vec![
        "Runtime kind and supplied version are user declarations, not executable identity attestation.".into(),
        "Read-only file/header/hash inspection performed; no executable or version probe was run.".into(),
    ];
    if binary_platform != platform() {
        diagnostics.push(format!(
            "Executable format targets {binary_platform}; this host is {}. Launch is blocked.",
            platform()
        ));
    }
    if registration.version.is_none() {
        diagnostics.push(
            "Installed build version is unknown; friends compatibility remains blocked.".into(),
        );
    }
    if registration.runtime_id.is_native() && registration.network_version.is_none() {
        diagnostics.push("Native network protocol version is unknown.".into());
    }
    diagnostics.push("Data root is explicit or installation-root default; config.toml overrides are not automatically interpreted.".into());
    Ok(RuntimeInstallation {
        registration_id: registration.id.clone(),
        root,
        executable: Some(executable.clone()),
        data_root,
        executable_sha256: Some(maps::hash_file(&executable)?),
        version: registration.version.clone(),
        network_version: registration.network_version.clone(),
        identity: "userDeclared".into(),
        validation: if binary_platform == platform() {
            TestStatus::Pass
        } else {
            TestStatus::Blocked
        },
        diagnostics,
    })
}

fn map_directories(id: RuntimeId) -> &'static [(&'static str, &'static str)] {
    match id {
        RuntimeId::MccSteam => &[("halo1/maps", "mccHalo1")],
        RuntimeId::ChupathingyCe => &[
            ("maps", "xbox"),
            ("maps_ce", "customEdition"),
            ("maps_md", "haloMd"),
            ("maps_pc", "pcRetail"),
            ("maps/ce", "customEdition"),
            ("md_maps", "haloMd"),
            ("custom_maps", "customEdition"),
        ],
        RuntimeId::OpenCe => &[("maps", "xbox"), ("custom_maps", "customEdition")],
        RuntimeId::HaloPc => &[("maps", "pcRetail")],
        RuntimeId::HaloCustomEdition => &[("maps", "customEdition")],
        _ => &[],
    }
}
pub fn inventory_maps(registration: &RuntimeRegistration) -> Result<RuntimeInventory> {
    let (_, _, data_root) = registration_roots(registration)?;
    inventory_at(registration.runtime_id, &registration.id, &data_root)
}
pub fn inventory_mcc(steam: &steam::Installation) -> Result<RuntimeInventory> {
    let root = steam
        .mcc_path
        .as_ref()
        .ok_or_else(|| crate::SparkError::Invalid("MCC installation is unavailable".into()))?;
    let root = checked_directory(root)?;
    inventory_at(RuntimeId::MccSteam, "steam-976730", &root)
}
fn inventory_at(
    id: RuntimeId,
    registration_id: &str,
    data_root: &Path,
) -> Result<RuntimeInventory> {
    let mut result = RuntimeInventory {
        runtime_id: id,
        registration_id: registration_id.into(),
        maps: vec![],
        resources: vec![],
        diagnostics: vec![],
    };
    let mut seen = 0usize;
    for (folder, _declared_family) in map_directories(id) {
        let directory = data_root.join(folder);
        if !directory.is_dir() {
            continue;
        }
        crate::reject_links(&directory)?;
        for entry in fs::read_dir(&directory)? {
            seen += 1;
            if seen > MAX_INVENTORY_ENTRIES {
                return invalid("Runtime map inventory exceeds 4096 entries");
            }
            let entry = entry?;
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path)?;
            if !metadata.is_file() || metadata.file_type().is_symlink() {
                continue;
            }
            crate::reject_links(&path)?;
            if !path
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("map"))
            {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            let relative = path
                .strip_prefix(data_root)
                .map_err(|_| {
                    crate::SparkError::Invalid("Inventory path escaped its data root".into())
                })?
                .to_string_lossy()
                .replace('\\', "/");
            if ["bitmaps.map", "sounds.map", "loc.map"].contains(&name.as_str()) {
                let hash = if metadata.len() <= MAX_EXECUTABLE_BYTES {
                    Some(maps::hash_file(&path)?)
                } else {
                    result
                        .diagnostics
                        .push(format!("Resource {relative} exceeds the 2 GiB hash limit"));
                    None
                };
                result.resources.push(RuntimeResourceEntry {
                    relative_path: relative,
                    name,
                    sha256: hash,
                    size: Some(metadata.len()),
                });
                continue;
            }
            let mut item = RuntimeMapEntry {
                relative_path: relative,
                family: "unknown".into(),
                cache_version: None,
                sha256: None,
                scenario_type: None,
                file_size: metadata.len(),
                valid: false,
                detail: String::new(),
            };
            if !(2048..=maps::MAX_CACHE_BYTES).contains(&metadata.len()) {
                item.detail = "Map size is outside supported inspection limits".into();
            } else {
                let mut bytes = [0u8; 2048];
                fs::File::open(&path)?.read_exact(&mut bytes)?;
                item.sha256 = Some(maps::hash_file(&path)?);
                match maps::parse_header(&bytes, metadata.len()) {
                    Ok(header) => {
                        item.cache_version = Some(header.version);
                        item.scenario_type = Some(header.scenario_type);
                        item.family = match header.version {
                            5 => "xbox",
                            6 => "demoTrial",
                            7 => "pcMacHaloMd",
                            609 => "customEdition",
                            13 => "mccHalo1",
                            _ => "unknown",
                        }
                        .into();
                        item.valid = true;
                        item.detail = "Header and hash inspected only; tag/resource completeness and gameplay are not verified.".into();
                    }
                    Err(e) => item.detail = e.to_string(),
                }
            }
            result.maps.push(item);
        }
    }
    result
        .maps
        .sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    result
        .resources
        .sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    result.diagnostics.push("Inventory is read-only. Resource names/hashes do not establish resource completeness or authorize deployment.".into());
    Ok(result)
}

pub fn prepare_launch(registration: &RuntimeRegistration) -> Result<LaunchPlan> {
    let installed = inspect_registration(registration)?;
    if installed.validation != TestStatus::Pass {
        return invalid("Executable format is not supported on this host");
    }
    if matches!(
        registration.runtime_id,
        RuntimeId::HaloPc | RuntimeId::HaloCustomEdition
    ) && platform() != "windows"
    {
        return invalid("Legacy PC executable launch is implemented only on Windows");
    }
    if registration.runtime_id == RuntimeId::OpenCe && platform() == "macos" {
        return invalid("OpenCE macOS launch support is not established for this adapter");
    }
    let executable = installed
        .executable
        .ok_or_else(|| crate::SparkError::Invalid("No executable".into()))?;
    let cwd = executable
        .parent()
        .ok_or_else(|| crate::SparkError::Invalid("No executable parent".into()))?
        .to_path_buf();
    Ok(LaunchPlan { runtime_id: registration.runtime_id, executable, cwd, args: vec![], direct_map_launch: false,
        warnings: vec!["This plan starts only the explicitly registered user-installed runtime. It does not deploy or select a map, verify gameplay, or attach a bridge.".into(),
        "Runtime startup/hosting may have its own migration, asset-sharing and telemetry behavior; review its settings.".into()] })
}
