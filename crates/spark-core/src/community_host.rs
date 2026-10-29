//! Original, operation-specific Chupathingy dedicated host / Delta Control adapter.
//!
//! Pure preparation and bounded parsing only: no HTTP, process launch, WSL,
//! firewall, installation, engine memory, or MCC wire translation. Native callers
//! supply verified installation/content evidence, hold credentials privately, and
//! review/revalidate each plan before performing an operation.

use crate::{invalid, runtime::RuntimeId, safe_relative, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fmt,
    net::SocketAddr,
    path::PathBuf,
};

pub const ADAPTER_VERSION: u32 = 1;
pub const CHUPATHINGY_REVISION: &str = "c5a07c69589ab8d40180fc99eac993bc06b06ebb";
pub const MAX_CONTROL_BYTES: usize = 1024 * 1024;
pub const MAX_COMMAND_BODY_BYTES: usize = 4096;
pub const CONTROL_TIMEOUT_SECONDS: u64 = 10;
pub const STATUS_TTL_SECONDS: u64 = 15;
pub const MIN_STATUS_POLL_SECONDS: u64 = 2;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum HostMode {
    Multiplayer,
    Campaign,
    Firefight,
}
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum HostNetwork {
    #[default]
    Lan,
    InviteOnlyOnline,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HostPlaylistEntry {
    pub map: String,
    pub game_type: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HostRequest {
    pub runtime_id: RuntimeId,
    pub mode: HostMode,
    pub name: String,
    pub maximum_players: u16,
    pub minimum_players: u16,
    #[serde(default)]
    pub network: HostNetwork,
    #[serde(default)]
    pub public: bool,
    #[serde(default)]
    pub list_games: bool,
    pub control_address: String,
    pub entries: Vec<HostPlaylistEntry>,
}

/// Native-only observations, never an authority-bearing frontend IPC payload.
#[derive(Clone, Debug, Default)]
pub struct HostInstallationEvidence {
    pub platform: String,
    pub architecture: String,
    pub executable: Option<PathBuf>,
    pub executable_sha256: Option<String>,
    pub server_identity_verified: bool,
    pub network_version: Option<u16>,
    pub data_root: Option<PathBuf>,
    pub save_root: Option<PathBuf>,
    pub owned_writable_roots: bool,
    pub base_data_ready: bool,
    pub maps: Vec<HostMapEvidence>,
}
#[derive(Clone, Debug)]
pub struct HostMapEvidence {
    pub selector: String,
    pub cache_version: u32,
    pub scenario_type: u16,
    pub sha256: String,
    pub resources_ready: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostGate {
    pub code: String,
    pub detail: String,
}
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum HostReadiness {
    SetupRequired,
    ReadyForReview,
    Unavailable,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostConfiguration {
    pub playlist_relative_path: String,
    pub playlist_text: String,
    pub environment: BTreeMap<String, String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostLaunchSpec {
    pub executable: PathBuf,
    pub executable_sha256: String,
    pub working_directory: PathBuf,
    /// Upstream server config is environment-based, never shell text.
    pub arguments: Vec<String>,
    pub environment: BTreeMap<String, String>,
    /// Native launcher must start with a reviewed environment and remove inherited
    /// HALO_* overrides; otherwise PUBLIC/commands/credentials can escape this plan.
    pub clear_inherited_halo_environment: bool,
    /// Upstream prints first-use tokens/setup links on stdout. Do not pipe this
    /// stream to ordinary logs, diagnostics or serializable process receipts.
    pub private_startup_output_required: bool,
    pub requires_final_owner_review: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostPlan {
    pub adapter_version: u32,
    pub runtime_id: RuntimeId,
    pub mode: HostMode,
    pub requested_players: u16,
    pub readiness: HostReadiness,
    pub configuration: Option<HostConfiguration>,
    pub launch: Option<HostLaunchSpec>,
    pub gates: Vec<HostGate>,
    pub client_steps: Vec<String>,
    pub evidence: Vec<String>,
    pub tested_players: Option<u16>,
    pub game_outcome: String,
}

fn gate(code: &str, detail: &str) -> HostGate {
    HostGate {
        code: code.into(),
        detail: detail.into(),
    }
}
fn valid_hash(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|c| c.is_ascii_hexdigit())
}
fn printable(value: &str, maximum: usize) -> bool {
    !value.is_empty() && value.len() <= maximum && value.bytes().all(|c| (32..=126).contains(&c))
}
fn quoted_atom(value: &str, maximum: usize) -> bool {
    printable(value, maximum)
        && !value.contains(['"', '\\', '/', ';', '`', '<', '>', '\r', '\n'])
        && value.trim() == value
}
fn variant_token(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 39
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c))
}
fn campaign_map(value: &str) -> bool {
    let base = value
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or(value)
        .split('@')
        .next()
        .unwrap_or(value);
    [
        "a10", "a30", "a50", "b30", "b40", "c10", "c20", "c40", "d20", "d40",
    ]
    .iter()
    .any(|v| base.eq_ignore_ascii_case(v))
}
fn expected_cache(map: &str) -> Result<u32> {
    if !quoted_atom(map, 127)
        || map.starts_with('.')
        || map.ends_with('.')
        || map.matches('@').count() > 1
    {
        return invalid("Map selector contains unsupported command/path characters");
    }
    match map.rsplit_once('@') {
        None => Ok(5),
        Some((name, pack)) if !name.is_empty() => match pack {
            "ce" => Ok(609),
            "pc" | "md" => Ok(7),
            other
                if !other.is_empty()
                    && other.len() <= 8
                    && other.bytes().all(|c| c.is_ascii_alphanumeric())
                    && !["de", "fr", "es", "it"].contains(&other) =>
            {
                Ok(5)
            }
            _ => invalid("Unknown or invalid community map family/pack"),
        },
        _ => invalid("Map selector has an empty name"),
    }
}
fn builtin_variant(value: &str) -> bool {
    [
        "slayer",
        "team_slayer",
        "ctf",
        "ironctf",
        "king",
        "team_king",
        "oddball",
        "team_oddball",
        "race",
        "team_race",
        "rally",
        "elimination",
        "stalker",
        "accumulation",
        "bomb",
        "grifball",
        "grifball_open_pitch",
    ]
    .contains(&value)
}
fn linux_absolute(path: &std::path::Path) -> bool {
    let text = path.to_string_lossy();
    text.starts_with('/')
        && text.len() <= 1024
        && !text.contains(['\0', '\n', '\r', '\\'])
        && !text.split('/').any(|c| c == ".." || c == ".")
}
fn community_runtime(runtime: RuntimeId) -> Result<()> {
    if !matches!(runtime, RuntimeId::ChupathingyCe | RuntimeId::OpenCe) {
        return invalid("This host operation requires a community H1 runtime. MCC-to-other-H1 wire translation is not implemented; a config or invitation cannot provide it");
    }
    Ok(())
}

/// Generate original, private-by-default config plus a reviewed Linux launch
/// specification when native installation/content observations are complete.
/// Preparation is not process start, game hosting, client agreement or128 proof.
pub fn plan_host(
    request: &HostRequest,
    installation: &HostInstallationEvidence,
) -> Result<HostPlan> {
    community_runtime(request.runtime_id)?;
    if request.public || request.list_games {
        return invalid("This adapter prepares private sessions only: both dedicated PUBLIC and game-list publication must remain off");
    }
    if !quoted_atom(&request.name, 15) {
        return invalid("Server name must be1–15 printable characters without command delimiters");
    }
    let maximum = if request.mode == HostMode::Multiplayer {
        128
    } else {
        8
    };
    if request.minimum_players == 0
        || request.maximum_players == 0
        || request.maximum_players > maximum
        || request.minimum_players > request.maximum_players
    {
        return invalid("Player limits are invalid for the requested operation (multiplayer1–128; campaign/Firefight goal1–8)");
    }
    let target = ControlTarget::new(RuntimeId::ChupathingyCe, &request.control_address)?;
    if request.entries.len() > 64 {
        return invalid("Host playlist exceeds64entries");
    }
    let mut plan=HostPlan{adapter_version:ADAPTER_VERSION,runtime_id:request.runtime_id,mode:request.mode,requested_players:request.maximum_players,
        readiness:HostReadiness::Unavailable,configuration:None,launch:None,gates:vec![],client_steps:vec![],
        evidence:vec![format!("Chupathingy pinned upstream {CHUPATHINGY_REVISION}; original Spark config/control adapter, no engine code copied."),"Configurable/advertised capacity is not measured player acceptance; platform limits and exact client protocols/content still apply.".into()],tested_players:None,game_outcome:"notRun".into()};
    match request.mode {
        HostMode::Campaign => {
            plan.gates.push(gate("campaignDedicatedUnsupported","Pinned dedicated.c explicitly refuses campaign levels; online campaign is hosted from the game, not a Slayer playlist."));
            plan.gates.push(gate("eightPlayerCampaignAcceptance","The requested eight-player campaign requires a matching native client/lobby and real encounter/checkpoint/reconnect acceptance; no eight-player proof exists."));
            plan.client_steps=vec!["In the matching Chupathingy client open Multiplayer → Create Game → Internet.".into(),"Change the map chooser's top row to SINGLEPLAYER; select the actual campaign level and difficulty.".into(),"In Server Setup keep Listing PRIVATE and disable public browser/game-list reporting. Configure the requested player limit only through controls actually offered by that build.".into(),"Invite matching clients; accept two real players before the eight-player campaign goal, including progression, death/respawn, checkpoints, late join and reconnect.".into()];
            if request.runtime_id == RuntimeId::OpenCe {
                plan.gates.push(gate("openCeCampaignMenuNotValidated","The cited menu path is Chupathingy's; OpenCE's exact build/menu/capacity needs separate verification."));
            }
            return Ok(plan);
        }
        HostMode::Firefight => {
            plan.gates.push(gate("firefightEngineAdapterMissing","No documented dedicated Firefight gametype/director or accepted eight-client authored survival scenario is integrated. A multiplayer cap change cannot create it."));
            plan.client_steps=vec!["Author and compile the actual compatible survival scenario, encounters and wave director.".into(),"Integrate host-authoritative AI/lifecycle/progression on a matching engine; validate two clients and recovery, then the requested eight players.".into()];
            return Ok(plan);
        }
        HostMode::Multiplayer => {}
    }
    if request.entries.is_empty() {
        return invalid("A multiplayer host plan needs at least one playlist entry");
    }
    let mut playlist = String::from(
        "# Spark private multiplayer playlist; generated for explicit owner review.\n",
    );
    for entry in &request.entries {
        expected_cache(&entry.map)?;
        if campaign_map(&entry.map) {
            return invalid("Campaign maps cannot be hosted as dedicated multiplayer; use the actual in-game co-op route");
        }
        if !variant_token(&entry.game_type) || !builtin_variant(&entry.game_type) {
            return invalid("Dedicated playlist requires an audited built-in multiplayer gametype; campaign/Firefight aliases are not gametypes");
        }
        playlist.push_str(&format!("\"{}\" {}\n", entry.map, entry.game_type));
    }
    let mut env = BTreeMap::new();
    for (key, value) in [
        ("HALO_DEDICATED", "playlists/spark_private.txt"),
        ("HALO_DEDICATED_PUBLIC", "false"),
        ("HALO_NET_LIST_GAMES", "false"),
        ("HALO_NET_BROWSER", ""),
        ("HALO_NET_PUBLIC_LOBBY", "false"),
        ("HALO_NET_HOST_PUBLIC", "false"),
        ("HALO_NET_REPORT_HOSTED", "false"),
        ("HALO_NET_REPORT_GAMES", "false"),
        ("HALO_NET_REPORT_EVENTS", "false"),
        ("HALO_DEDICATED_GAMESPY_LISTING", "false"),
        ("HALO_NET_ALLOW_UPNP", "false"),
        ("HALO_DEDICATED_LINK", "false"),
        ("HALO_DEDICATED_CONSOLE", "false"),
        ("HALO_DEDICATED_CONTROL_TLS", "off"),
        ("HALO_NET_HOST_PLATFORM_LIMITS", "true"),
    ] {
        env.insert(key.into(), value.into());
    }
    env.insert("HALO_DEDICATED_NAME".into(), request.name.clone());
    env.insert(
        "HALO_DEDICATED_MAXIMUM_PLAYERS".into(),
        request.maximum_players.to_string(),
    );
    env.insert(
        "HALO_DEDICATED_MINIMUM_PLAYERS".into(),
        request.minimum_players.to_string(),
    );
    env.insert("HALO_DEDICATED_CONTROL".into(), target.address.to_string());
    env.insert(
        "HALO_NET_ONLINE".into(),
        if request.network == HostNetwork::Lan {
            "false"
        } else {
            "true"
        }
        .into(),
    );
    if request.runtime_id != RuntimeId::ChupathingyCe {
        plan.gates.push(gate("dedicatedProviderRequired","This dedicated/control implementation is Chupathingy's Linux server. OpenCE clients may join only after exact protocol/content checks; no OpenCE server binary API is assumed."));
    }
    if installation.platform != "linux" {
        plan.gates.push(gate("linuxServerRequired","The pinned standalone dedicated binary is Linux. Windows/WSL support is not established; Spark will not install or start WSL automatically."));
    }
    if !matches!(
        installation.architecture.as_str(),
        "x86_64" | "aarch64" | "x86"
    ) {
        plan.gates.push(gate("serverArchitectureRequired","Identify the selected Linux server's exact architecture; do not infer it from the client."));
    }
    if !installation.server_identity_verified
        || installation
            .executable
            .as_ref()
            .is_none_or(|p| !linux_absolute(p))
        || installation
            .executable_sha256
            .as_deref()
            .is_none_or(|v| !valid_hash(v))
        || installation.network_version.is_none_or(|v| v == 0)
    {
        plan.gates.push(gate("verifiedServerIdentityRequired","Select and verify the exact dedicated executable, full hash and declared network version. A filename or client registration is insufficient."));
    }
    if !installation.owned_writable_roots
        || installation
            .data_root
            .as_ref()
            .is_none_or(|p| !linux_absolute(p))
        || installation
            .save_root
            .as_ref()
            .is_none_or(|p| !linux_absolute(p))
        || installation.data_root == installation.save_root
    {
        plan.gates.push(gate("ownedServerRootsRequired","Use separate verified writable derived data/save roots; never SDK/game installation masters or another server's saves."));
    }
    if !installation.base_data_ready {
        plan.gates.push(gate("baseDataRequired","Server startup needs the complete matching owned NTSC Xbox base mapset including ui.map, not only the selected playlist map or MCC assets."));
    }
    for entry in &request.entries {
        let expected = expected_cache(&entry.map)?;
        if !installation.maps.iter().any(|map| {
            map.selector == entry.map
                && map.cache_version == expected
                && map.scenario_type == 1
                && map.resources_ready
                && valid_hash(&map.sha256)
        }) {
            plan.gates.push(gate("matchingMultiplayerMapRequired","Every playlist map needs a verified same-family multiplayer cache hash and exact resources; MCCv13 is not a substitute."));
        }
        if expected != 5 && !matches!(installation.architecture.as_str(), "x86_64" | "aarch64") {
            plan.gates.push(gate("sourceMapArchitectureRequired","CE/PC/HaloMD source-map hosting requires the separately checked x64/arm64 server and classic CE resources."));
        }
    }
    if let Some(data) = installation.data_root.as_ref().filter(|p|linux_absolute(p)) {
        env.insert("HALO_DATA_ROOT".into(), data.to_string_lossy().into_owned());
        env.insert(
            "HALO_LOG_ROOT".into(),
            format!("{}/logs",data.to_string_lossy().trim_end_matches('/')),
        );
    }
    if let Some(save) = installation.save_root.as_ref().filter(|p|linux_absolute(p)) {
        env.insert("HALO_SAVE_ROOT".into(), save.to_string_lossy().into_owned());
        env.insert(
            "HALO_CACHE_ROOT".into(),
            format!("{}/cache",save.to_string_lossy().trim_end_matches('/')),
        );
    }
    plan.configuration = Some(HostConfiguration {
        playlist_relative_path: "playlists/spark_private.txt".into(),
        playlist_text: playlist,
        environment: env.clone(),
    });
    plan.readiness = if plan.gates.is_empty() {
        HostReadiness::ReadyForReview
    } else {
        HostReadiness::SetupRequired
    };
    if plan.gates.is_empty() {
        plan.launch = Some(HostLaunchSpec {
            executable: installation.executable.clone().unwrap(),
            executable_sha256: installation.executable_sha256.clone().unwrap(),
            working_directory: installation.data_root.clone().unwrap(),
            arguments: vec![],
            environment: env,
            clear_inherited_halo_environment: true,
            private_startup_output_required: true,
            requires_final_owner_review: true,
        });
    }
    plan.client_steps=vec!["Review the exact Linux binary/content identity, derived writable roots, private settings and private startup credential handling before starting a server.".into(),"Matching native clients join through the game's private invitation/System Link lobby. Browser clients have their own startup/content/protocol/capacity gates.".into(),"Verify two real clients first, then controlled8/16/32/64/128 stages. Keep actual frame/network/AI/recovery acceptance separate from maximum_players.".into()];
    Ok(plan)
}

/// Constructed from a literal socket address, never a URL, hostname or redirect.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlTarget {
    runtime_id: RuntimeId,
    address: SocketAddr,
}
impl ControlTarget {
    pub fn new(runtime_id: RuntimeId, address: &str) -> Result<Self> {
        if runtime_id != RuntimeId::ChupathingyCe {
            return invalid("Delta Control is the dedicated Chupathingy server API; other runtimes need an independent adapter");
        }
        let parsed: SocketAddr = address.parse().map_err(|_| {
            crate::SparkError::Invalid(
                "Control address must be a literal loopback IP and port".into(),
            )
        })?;
        if !parsed.ip().is_loopback() || parsed.port() == 0 {
            return invalid("Control/status is loopback only with a nonzero port; remote/DNS/proxy addresses are refused");
        }
        Ok(Self {
            runtime_id,
            address: parsed,
        })
    }
    pub fn address(&self) -> SocketAddr {
        self.address
    }
    pub fn runtime_id(&self) -> RuntimeId {
        self.runtime_id
    }
}

/// Deliberately no Serialize/Deserialize or raw-string Debug implementation.
pub struct ControlToken(String);
impl ControlToken {
    pub fn new(value: &str) -> Result<Self> {
        // Do not guess upstream's evolving credential prefix/encoding. Enforce
        // one bounded bearer field; native UI never persists it in settings.
        if !(16..=256).contains(&value.len())
            || !value
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"-._~+/=".contains(&c))
        {
            return invalid("Control credential must be a bounded single bearer token; spaces/header delimiters are refused");
        }
        Ok(Self(value.into()))
    }
    /// Native HTTP adapter must mark this header sensitive and never log it.
    pub fn with_authorization<T>(&self, use_header: impl FnOnce(&str) -> T) -> T {
        let header = format!("Bearer {}", self.0);
        use_header(&header)
    }
}
impl fmt::Debug for ControlToken {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("ControlToken([redacted])")
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ControlRead {
    Status,
    Maps,
    Players,
    Mapcycle,
    Settings,
}
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum HttpMethod {
    Get,
    Post,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlRequestPlan {
    pub method: HttpMethod,
    pub url: String,
    pub body: Option<String>,
    pub requires_authentication: bool,
    pub requires_confirmation: bool,
    pub follow_redirects: bool,
    pub use_proxy: bool,
    pub timeout_seconds: u64,
    pub maximum_response_bytes: usize,
    pub description: String,
}
fn request_plan(
    target: &ControlTarget,
    path: &str,
    body: Option<String>,
    description: &str,
) -> ControlRequestPlan {
    ControlRequestPlan {
        method: if body.is_some() {
            HttpMethod::Post
        } else {
            HttpMethod::Get
        },
        url: format!("http://{}{path}", target.address),
        requires_confirmation: body.is_some(),
        body,
        requires_authentication: true,
        follow_redirects: false,
        use_proxy: false,
        timeout_seconds: CONTROL_TIMEOUT_SECONDS,
        maximum_response_bytes: MAX_CONTROL_BYTES,
        description: description.into(),
    }
}
pub fn read_plan(target: &ControlTarget, read: ControlRead) -> ControlRequestPlan {
    let path = match read {
        ControlRead::Status => "/v1/status",
        ControlRead::Maps => "/v1/maps",
        ControlRead::Players => "/v1/players",
        ControlRead::Mapcycle => "/v1/mapcycle",
        ControlRead::Settings => "/v1/settings",
    };
    request_plan(target,path,None,"Authenticated loopback Delta Control read; no hosting/connection/gameplay outcome inferred")
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ServerState {
    Starting,
    Lobby,
    Loading,
    InGame,
    Postgame,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub name: String,
    pub version: String,
    pub network_version: u16,
    pub following: Option<String>,
    pub state: ServerState,
    pub map: String,
    pub game_type: String,
    pub playlist: String,
    pub players: u16,
    pub maximum_players: u16,
    pub minimum_players: u16,
    pub public: bool,
    pub uptime_seconds: u64,
}
#[derive(Deserialize)]
struct RawStatus {
    name: String,
    version: String,
    network_version: u16,
    #[serde(default)]
    following: Option<String>,
    state: ServerState,
    #[serde(default)]
    map: String,
    #[serde(default)]
    game_type: String,
    #[serde(default)]
    playlist: String,
    players: u16,
    maximum_players: u16,
    minimum_players: u16,
    public: bool,
    uptime_seconds: u64,
}
fn bounded_json<T: serde::de::DeserializeOwned>(bytes: &[u8]) -> Result<T> {
    if bytes.len() > MAX_CONTROL_BYTES {
        return invalid("Delta Control response exceeds1MiB");
    }
    serde_json::from_slice(bytes).map_err(|_| {
        crate::SparkError::Invalid("Malformed or incompatible Delta Control response".into())
    })
}
pub fn parse_status(bytes: &[u8]) -> Result<ServerStatus> {
    let value: RawStatus = bounded_json(bytes)?;
    if !printable(&value.name, 15)
        || !printable(&value.version, 128)
        || value.network_version == 0
        || value.maximum_players == 0
        || value.maximum_players > 128
        || value.minimum_players == 0
        || value.minimum_players > value.maximum_players
        || value.players > 128
        || value.following.as_ref().is_some_and(|s| !printable(s, 256))
        || value.map.len() > 127
        || value.game_type.len() > 39
        || value.playlist.len() > 240
        || [&value.map, &value.game_type, &value.playlist]
            .iter()
            .any(|s| s.chars().any(char::is_control))
    {
        return invalid("Delta Control status has invalid text, protocol or player bounds");
    }
    if !value.map.is_empty() {
        expected_cache(&value.map)?;
    }
    if !value.game_type.is_empty() && !variant_token(&value.game_type) {
        return invalid("Delta Control status has an invalid gametype token");
    }
    if !value.playlist.is_empty() {
        safe_relative(&value.playlist)?;
    }
    Ok(ServerStatus {
        name: value.name,
        version: value.version,
        network_version: value.network_version,
        following: value.following,
        state: value.state,
        map: value.map,
        game_type: value.game_type,
        playlist: value.playlist,
        players: value.players,
        maximum_players: value.maximum_players,
        minimum_players: value.minimum_players,
        public: value.public,
        uptime_seconds: value.uptime_seconds,
    })
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerMaps {
    pub maps: Vec<String>,
    pub game_types: Vec<String>,
}
#[derive(Deserialize)]
struct RawMaps {
    maps: Vec<String>,
    game_types: Vec<String>,
}
pub fn parse_maps(bytes: &[u8]) -> Result<ServerMaps> {
    let value: RawMaps = bounded_json(bytes)?;
    if value.maps.len() > 512 || value.game_types.len() > 512 {
        return invalid("Delta Control map/gametype catalog exceeds512entries");
    }
    let mut maps = BTreeSet::new();
    let mut types = BTreeSet::new();
    for map in value.maps {
        expected_cache(&map)?;
        if campaign_map(&map) {
            return invalid("Dedicated multiplayer catalog contains an unsupported campaign map");
        }
        maps.insert(map);
    }
    for kind in value.game_types {
        if !variant_token(&kind) {
            return invalid("Delta Control catalog contains an invalid gametype");
        }
        types.insert(kind);
    }
    Ok(ServerMaps {
        maps: maps.into_iter().collect(),
        game_types: types.into_iter().collect(),
    })
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ControlCommand {
    SetMaximumPlayers { players: u16 },
    ChangeMap { map: String, game_type: String },
    NextMap,
    EndGame,
    SetName { name: String },
}
/// Construct from fresh native HTTP observations and an owned private config
/// receipt, never frontend assertions. It contains no credential or raw command.
pub struct ControlGuard {
    pub mode: HostMode,
    pub status: ServerStatus,
    pub maps: Option<ServerMaps>,
    pub observed_at_unix: u64,
    pub private_configuration_verified: bool,
}
pub fn command_plan(
    target: &ControlTarget,
    command: &ControlCommand,
    guard: &ControlGuard,
    now_unix: u64,
) -> Result<ControlRequestPlan> {
    if guard.mode != HostMode::Multiplayer {
        return invalid("Dedicated Delta Control does not create campaign/Firefight hosting; use that operation's independent engine adapter");
    }
    if !guard.private_configuration_verified || guard.status.public {
        return invalid("A verified private configuration including browser/list-reporting disablement is required; status.public=false alone is insufficient");
    }
    if now_unix < guard.observed_at_unix || now_unix - guard.observed_at_unix > STATUS_TTL_SECONDS {
        return invalid(
            "Control status is stale; refresh the exact owned session before preparing a change",
        );
    }
    if matches!(
        guard.status.state,
        ServerState::Starting | ServerState::Loading
    ) {
        return invalid(
            "Server is starting/loading; wait for a stable lobby or game before preparing a change",
        );
    }
    let line = match command {
        ControlCommand::SetMaximumPlayers { players } => {
            if *players == 0 || *players > 128 || *players < guard.status.minimum_players {
                return invalid("Maximum players must be1–128 and not below the server minimum");
            }
            format!("sv_maxplayers {players}")
        }
        ControlCommand::ChangeMap { map, game_type } => {
            expected_cache(map)?;
            if campaign_map(map) || !variant_token(game_type) {
                return invalid("Map/gametype is not a dedicated multiplayer operation");
            }
            let catalog = guard.maps.as_ref().ok_or_else(|| {
                crate::SparkError::Invalid(
                    "Refresh the actual server map/gametype catalog before changing maps".into(),
                )
            })?;
            if !catalog.maps.contains(map) || !catalog.game_types.contains(game_type) {
                return invalid("Selected map/gametype is absent from the actual server catalog");
            }
            format!("sv_map \"{map}\" {game_type}")
        }
        ControlCommand::NextMap => "sv_mapcycle_next".into(),
        ControlCommand::EndGame => {
            if guard.status.state != ServerState::InGame {
                return invalid("End game requires an actual in-game status");
            }
            "sv_end_game".into()
        }
        ControlCommand::SetName { name } => {
            if !quoted_atom(name, 15) {
                return invalid(
                    "Server name must be1–15 printable characters without command delimiters",
                );
            }
            format!("sv_name \"{name}\"")
        }
    };
    let body = serde_json::to_string(&serde_json::json!({"command":line}))?;
    if body.len() > MAX_COMMAND_BODY_BYTES {
        return invalid("Delta Control command exceeds4KiB");
    }
    Ok(request_plan(target,"/v1/command",Some(body),"Reviewed typed server change; queued upstream on its engine main thread. HTTP acknowledgement is not gameplay acceptance"))
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandAcknowledgement {
    pub ok: bool,
    pub output: String,
    pub game_outcome: String,
}
#[derive(Deserialize)]
struct RawAcknowledgement {
    ok: bool,
    output: String,
}
pub fn parse_acknowledgement(bytes: &[u8]) -> Result<CommandAcknowledgement> {
    let value: RawAcknowledgement = bounded_json(bytes)?;
    if value.output.len() > 64 * 1024
        || value
            .output
            .chars()
            .any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t'))
    {
        return invalid("Delta Control acknowledgement exceeds text bounds");
    }
    // This whitelist cannot generate credentials. Never return a token/setup
    // link if an unexpected/misconfigured service tries to echo one anyway.
    if value.output.contains("Bearer ")
        || value.output.contains("chce_")
        || value.output.contains("/setup?")
    {
        return invalid(
            "Unexpected sensitive material in control acknowledgement; output withheld",
        );
    }
    Ok(CommandAcknowledgement {
        ok: value.ok,
        output: value.output,
        game_outcome: "notObserved".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> HostRequest {
        HostRequest {
            runtime_id: RuntimeId::ChupathingyCe,
            mode: HostMode::Multiplayer,
            name: "Spark private".into(),
            maximum_players: 128,
            minimum_players: 1,
            network: HostNetwork::Lan,
            public: false,
            list_games: false,
            control_address: "127.0.0.1:8080".into(),
            entries: vec![HostPlaylistEntry {
                map: "bloodgulch".into(),
                game_type: "slayer".into(),
            }],
        }
    }
    fn installed() -> HostInstallationEvidence {
        HostInstallationEvidence {
            platform: "linux".into(),
            architecture: "x86_64".into(),
            executable: Some("/opt/chupa/chupathingyce-server".into()),
            executable_sha256: Some("a".repeat(64)),
            server_identity_verified: true,
            network_version: Some(33),
            data_root: Some("/home/owner/spark/server/data".into()),
            save_root: Some("/home/owner/spark/server/save".into()),
            owned_writable_roots: true,
            base_data_ready: true,
            maps: vec![HostMapEvidence {
                selector: "bloodgulch".into(),
                cache_version: 5,
                scenario_type: 1,
                sha256: "b".repeat(64),
                resources_ready: true,
            }],
        }
    }
    fn status() -> ServerStatus {
        parse_status(br#"{"name":"Spark","version":"0.8.0","network_version":33,"state":"in_game","map":"bloodgulch","game_type":"slayer","playlist":"playlists/spark_private.txt","players":2,"maximum_players":128,"minimum_players":1,"public":false,"uptime_seconds":10}"#).unwrap()
    }
    fn guard() -> ControlGuard {
        ControlGuard {
            mode: HostMode::Multiplayer,
            status: status(),
            maps: Some(ServerMaps {
                maps: vec!["bloodgulch".into(), "skedar v2@ce".into()],
                game_types: vec!["slayer".into(), "ctf".into()],
            }),
            observed_at_unix: 100,
            private_configuration_verified: true,
        }
    }
    #[test]
    fn private_config_disables_both_independent_listing_paths_and_reporting() {
        let plan = plan_host(&request(), &installed()).unwrap();
        assert_eq!(plan.readiness, HostReadiness::ReadyForReview);
        let launch = plan.launch.unwrap();
        for key in [
            "HALO_DEDICATED_PUBLIC",
            "HALO_NET_LIST_GAMES",
            "HALO_NET_REPORT_HOSTED",
            "HALO_NET_REPORT_EVENTS",
            "HALO_DEDICATED_GAMESPY_LISTING",
            "HALO_NET_ALLOW_UPNP",
        ] {
            assert_eq!(launch.environment[key], "false");
        }
        assert_eq!(launch.environment["HALO_NET_BROWSER"], "");
        assert_eq!(launch.environment["HALO_DEDICATED_MAXIMUM_PLAYERS"], "128");
        assert!(
            launch.clear_inherited_halo_environment
                && launch.private_startup_output_required
                && launch.requires_final_owner_review
        );
        assert!(launch.arguments.is_empty());
        assert_eq!(plan.tested_players, None);
        assert_eq!(plan.game_outcome, "notRun");
    }
    #[test]
    fn campaign_and_firefight_are_distinct_unavailable_native_operations() {
        for mode in [HostMode::Campaign, HostMode::Firefight] {
            let mut r = request();
            r.mode = mode;
            r.maximum_players = 8;
            let plan = plan_host(&r, &installed()).unwrap();
            assert_eq!(plan.readiness, HostReadiness::Unavailable);
            assert!(plan.launch.is_none() && plan.configuration.is_none());
            assert!(!plan.gates.is_empty());
        }
        let mut r = request();
        r.entries[0].map = "a30@ce".into();
        assert!(plan_host(&r, &installed()).is_err());
    }
    #[test]
    fn mcc_wrong_provider_windows_unknown_maps_and_public_requests_cannot_launch() {
        let mut r = request();
        r.runtime_id = RuntimeId::MccSteam;
        assert!(plan_host(&r, &installed()).is_err());
        r = request();
        r.public = true;
        assert!(plan_host(&r, &installed()).is_err());
        r = request();
        r.list_games = true;
        assert!(plan_host(&r, &installed()).is_err());
        r = request();
        let mut i = installed();
        i.platform = "windows".into();
        assert!(plan_host(&r, &i).unwrap().launch.is_none());
        i = installed();
        i.maps[0].cache_version = 13;
        assert!(plan_host(&r, &i).unwrap().launch.is_none());
        r.runtime_id = RuntimeId::OpenCe;
        assert!(plan_host(&r, &installed()).unwrap().launch.is_none());
    }
    #[test]
    fn capacities_and_command_injection_are_rejected() {
        for count in [0, 129, u16::MAX] {
            let mut r = request();
            r.maximum_players = count;
            assert!(plan_host(&r, &installed()).is_err());
        }
        for map in [
            "bloodgulch;sv_maxplayers 999",
            "../a30",
            "bloodgulch\nsv_end_game",
            "evil\" slayer",
        ] {
            let mut r = request();
            r.entries[0].map = map.into();
            assert!(plan_host(&r, &installed()).is_err());
        }
        let mut r = request();
        r.mode = HostMode::Campaign;
        r.maximum_players = 9;
        assert!(plan_host(&r, &installed()).is_err());
    }
    #[test]
    fn loopback_literals_only_and_bearer_credential_never_serializes_in_a_plan() {
        for endpoint in [
            "0.0.0.0:8080",
            "192.168.1.5:8080",
            "localhost:8080",
            "http://127.0.0.1:8080",
            "127.0.0.1:0",
            "[::ffff:127.0.0.1]:8080",
        ] {
            assert!(ControlTarget::new(RuntimeId::ChupathingyCe, endpoint).is_err());
        }
        let target = ControlTarget::new(RuntimeId::ChupathingyCe, "[::1]:8080").unwrap();
        let token = ControlToken::new("chce_private_test_credential_only").unwrap();
        assert!(!format!("{token:?}").contains("private_test"));
        let plan = read_plan(&target, ControlRead::Status);
        let json = serde_json::to_string(&plan).unwrap();
        assert!(!json.contains("private_test"));
        assert!(!plan.follow_redirects && !plan.use_proxy);
        assert_eq!(plan.method, HttpMethod::Get);
        assert_eq!(token.with_authorization(|s| s.starts_with("Bearer ")), true);
        assert!(ControlToken::new("chce_abc\r\nInjected: yes").is_err());
    }
    #[test]
    fn bounded_status_parser_rejects_bad_state_counts_protocol_and_html() {
        for bytes in [b"<html>fallback</html>".as_slice(),br#"{"state":"other"}"#.as_slice(),br#"{"name":"bad\nname","version":"x","network_version":0,"state":"lobby","players":0,"maximum_players":999,"minimum_players":0,"public":false,"uptime_seconds":1}"#.as_slice()]{assert!(parse_status(bytes).is_err());}
        assert!(parse_status(&vec![b' '; MAX_CONTROL_BYTES + 1]).is_err());
        assert_eq!(status().maximum_players, 128);
    }
    #[test]
    fn typed_commands_use_actual_catalog_fresh_private_state_and_no_arbitrary_console() {
        let target = ControlTarget::new(RuntimeId::ChupathingyCe, "127.0.0.1:8080").unwrap();
        let g = guard();
        let plan = command_plan(
            &target,
            &ControlCommand::ChangeMap {
                map: "skedar v2@ce".into(),
                game_type: "ctf".into(),
            },
            &g,
            101,
        )
        .unwrap();
        assert_eq!(plan.method, HttpMethod::Post);
        assert!(plan.requires_confirmation);
        let value: serde_json::Value = serde_json::from_str(plan.body.as_ref().unwrap()).unwrap();
        assert_eq!(value["command"], "sv_map \"skedar v2@ce\" ctf");
        assert!(command_plan(
            &target,
            &ControlCommand::SetMaximumPlayers { players: 129 },
            &g,
            101
        )
        .is_err());
        assert!(command_plan(&target, &ControlCommand::NextMap, &g, 116).is_err());
        let mut wrong = guard();
        wrong.private_configuration_verified = false;
        assert!(command_plan(&target, &ControlCommand::NextMap, &wrong, 101).is_err());
        wrong = guard();
        wrong.mode = HostMode::Campaign;
        assert!(command_plan(
            &target,
            &ControlCommand::SetMaximumPlayers { players: 8 },
            &wrong,
            101
        )
        .is_err());
        assert!(serde_json::from_str::<ControlCommand>(
            r#"{"kind":"raw","command":"sv_admin_add thief"}"#
        )
        .is_err());
    }
    #[test]
    fn acknowledgements_are_not_gameplay_and_unexpected_secrets_are_withheld() {
        let ack =
            parse_acknowledgement(br#"{"ok":true,"output":"maximum players set to128"}"#).unwrap();
        assert!(ack.ok);
        assert_eq!(ack.game_outcome, "notObserved");
        assert!(parse_acknowledgement(
            br#"{"ok":true,"output":"chce_accidentally_echoed_secret"}"#
        )
        .is_err());
        assert!(parse_acknowledgement(br#"{"ok":"yes","output":""}"#).is_err());
    }
}
