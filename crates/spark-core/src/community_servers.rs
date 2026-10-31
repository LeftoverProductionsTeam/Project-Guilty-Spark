//! Read-only interoperability with Delta List. The game owns its invitation
//! tunnel, wire negotiation, map identity check and connection outcome.
//!
//! This module does not fetch, start processes, register URI handlers, contact a
//! game server, or implement Delta Peer/Link/Control. See the pinned protocol
//! evidence in docs/research/C34_COMMUNITY_PROTOCOLS.md.

use crate::runtime::{
    RuntimeId, RuntimeInstallation, RuntimeInventory, RuntimeRegistration, TestStatus,
};
use crate::{invalid, Result};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;

pub const DELTA_LIST_URL: &str = "https://stats.chupathingy.org/v1/games";
pub const MAX_LISTING_BYTES: usize = 1024 * 1024;
pub const MAX_LISTING_ROWS: usize = 512;
pub const LISTING_TTL_SECONDS: u64 = 30;
pub const MIN_REFRESH_SECONDS: u64 = 30;
pub const REQUEST_TIMEOUT_SECONDS: u64 = 15;
pub const MAX_ADVERTISEMENT_AGE_SECONDS: u64 = 120;
pub const CHUPATHINGY_REVISION: &str = "c5a07c69589ab8d40180fc99eac993bc06b06ebb";
pub const OPENCE_REVISION: &str = "f2597b704d59e66257dba7629f22a0f78f5f3d09";

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CommunityProtocol {
    Delta,
    OpenCe,
    Unknown,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CommunityMapFamily {
    Xbox,
    CustomEdition,
    HaloPc,
    HaloMd,
    MapPack,
    Unknown,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommunityMap {
    pub family: CommunityMapFamily,
    pub name: String,
    pub pack: Option<String>,
    pub display_name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommunityServer {
    /// Stable within this public invitation's lifetime. No token in row IDs.
    pub id: String,
    pub provider: String,
    pub source: String,
    pub name: String,
    pub map: CommunityMap,
    pub game_type: String,
    pub mode: String,
    pub players: u16,
    /// Advertised, never a measurement or a Spark certification.
    pub advertised_capacity: u16,
    pub open: bool,
    pub locked: bool,
    pub in_progress: bool,
    pub legacy_network_version: u16,
    pub protocol: CommunityProtocol,
    pub build: Option<String>,
    pub platform: Option<String>,
    pub hosting: String,
    pub region: Option<String>,
    pub capabilities: Option<String>,
    /// Upstream's listing-verification claim, not Spark gameplay evidence.
    pub provider_verified: bool,
    pub fetched_at_unix: u64,
    pub advertisement_age_seconds: u64,
    #[serde(skip)]
    invite: String,
}

impl std::fmt::Debug for CommunityServer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CommunityServer")
            .field("id", &self.id)
            .field("protocol", &self.protocol)
            .field("map", &self.map)
            .field("invite", &"[redacted]")
            .finish_non_exhaustive()
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommunityListing {
    pub provider: String,
    pub fetched_at_unix: u64,
    pub expires_at_unix: u64,
    pub servers: Vec<CommunityServer>,
    pub rejected_rows: usize,
    pub diagnostics: Vec<String>,
}

/// Fields must come from the selected local registration/inventory, never the
/// listing response. Header/resource inspection still leaves gameplay untested.
#[derive(Clone, Debug)]
pub struct CommunityClientProfile {
    pub registration_id: String,
    pub runtime_id: RuntimeId,
    pub executable_ready: bool,
    pub network_version: Option<u16>,
    pub base_data_ready: bool,
    pub maps: Vec<InstalledCommunityMap>,
}

#[derive(Clone, Debug)]
pub struct InstalledCommunityMap {
    pub family: CommunityMapFamily,
    pub name: String,
    pub pack: Option<String>,
    pub valid: bool,
    pub resources_ready: bool,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum JoinReadiness {
    Blocked,
    ReadyForRuntimeCheck,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinIssue {
    pub code: String,
    pub summary: String,
    pub setup_route: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinAssessment {
    pub readiness: JoinReadiness,
    pub runtime_id: RuntimeId,
    pub registration_id: String,
    pub issues: Vec<JoinIssue>,
    pub limitations: Vec<String>,
    pub connection_outcome: String,
}

/// An invitation handoff, not an established connection. Pass `argument()` as
/// one argv element to the inspected registered executable, without a shell.
/// Do not serialize or log its token. The app must recheck executable identity.
#[derive(Clone)]
pub struct CommunityJoinTarget {
    pub runtime_id: RuntimeId,
    pub registration_id: String,
    pub server_id: String,
    argument: String,
}

impl std::fmt::Debug for CommunityJoinTarget {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CommunityJoinTarget")
            .field("runtime_id", &self.runtime_id)
            .field("registration_id", &self.registration_id)
            .field("server_id", &self.server_id)
            .field("argument", &"halo://join/[redacted]")
            .finish()
    }
}

impl CommunityJoinTarget {
    pub fn argument(&self) -> &str {
        &self.argument
    }
}

/// Pure request scheduling, also applied after failed requests. Failed refreshes
/// must not extend the old snapshot's TTL. The caller must serialize access.
#[derive(Clone, Debug, Default)]
pub struct ListingRefreshGate {
    last_attempt_unix: Option<u64>,
}

impl ListingRefreshGate {
    pub fn seconds_until_refresh(&self, now_unix: u64) -> u64 {
        self.last_attempt_unix
            .map(|last| {
                last.saturating_add(MIN_REFRESH_SECONDS)
                    .saturating_sub(now_unix)
            })
            .unwrap_or(0)
    }

    pub fn begin_refresh(&mut self, now_unix: u64) -> Result<()> {
        if self.seconds_until_refresh(now_unix) != 0 {
            return invalid("Community listing refresh is limited to once every 30 seconds");
        }
        self.last_attempt_unix = Some(now_unix);
        Ok(())
    }
}

fn text<'a>(row: &'a Value, key: &str, max: usize) -> Result<&'a str> {
    let value = row.get(key).and_then(Value::as_str).ok_or_else(|| {
        crate::SparkError::Invalid("Community listing has a missing text field".into())
    })?;
    if value.is_empty() || value.len() > max || value.chars().any(char::is_control) {
        return invalid(
            "Community listing text is empty, too long, or contains control characters",
        );
    }
    Ok(value)
}

fn optional_text(row: &Value, key: &str, max: usize) -> Result<Option<String>> {
    match row.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) if value.is_empty() => Ok(None),
        Some(_) => text(row, key, max).map(|s| Some(s.to_string())),
    }
}

fn integer(row: &Value, key: &str, maximum: u64) -> Result<u64> {
    let value = row.get(key).and_then(Value::as_u64).ok_or_else(|| {
        crate::SparkError::Invalid("Community listing has a missing unsigned integer".into())
    })?;
    if value > maximum {
        return invalid("Community listing integer exceeds its bound");
    }
    Ok(value)
}

fn flag(row: &Value, key: &str, default: bool) -> Result<bool> {
    match row.get(key) {
        None => Ok(default),
        Some(Value::Bool(value)) => Ok(*value),
        Some(Value::Number(value)) if value.as_u64() == Some(0) => Ok(false),
        Some(Value::Number(value)) if value.as_u64() == Some(1) => Ok(true),
        _ => invalid("Community listing flag is not a boolean or 0/1"),
    }
}

fn valid_invite(invite: &str) -> bool {
    invite.len() == 64 && invite.bytes().all(|b| b.is_ascii_hexdigit())
}

fn map_component(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 96
        && !value.contains("..")
        && value != "."
        && !value.starts_with('.')
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_-. ".contains(&b))
}

fn parse_map(row: &Value) -> Result<CommunityMap> {
    let map = text(row, "map", 256)?;
    let normalized = map.replace('\\', "/");
    let parts: Vec<_> = normalized.split('/').collect();
    if parts.len() > 8
        || parts
            .iter()
            .any(|part| part.is_empty() || *part == "." || *part == "..")
    {
        return invalid("Community map name contains an unsafe path");
    }
    // Only the legacy logical level path is accepted, never filesystem URLs.
    for part in &parts[..parts.len() - 1] {
        if !map_component(part) {
            return invalid("Community map path is malformed");
        }
    }
    let last = parts[parts.len() - 1];
    let mut suffix = last.split('@');
    let name = suffix.next().unwrap_or_default();
    let tag = suffix.next();
    if suffix.next().is_some() || !map_component(name) || tag.is_some_and(|s| !map_component(s)) {
        return invalid("Community map identity is malformed");
    }
    let family = match row.get("family").and_then(Value::as_str).unwrap_or("") {
        "xbox" => CommunityMapFamily::Xbox,
        "ce" => CommunityMapFamily::CustomEdition,
        "pc" => CommunityMapFamily::HaloPc,
        "md" => CommunityMapFamily::HaloMd,
        "pack" => CommunityMapFamily::MapPack,
        _ => CommunityMapFamily::Unknown,
    };
    let correct_tag = match family {
        CommunityMapFamily::Xbox => tag.is_none(),
        CommunityMapFamily::CustomEdition => tag == Some("ce"),
        CommunityMapFamily::HaloPc => tag == Some("pc"),
        CommunityMapFamily::HaloMd => tag == Some("md"),
        CommunityMapFamily::MapPack => tag.is_some_and(|s| !["ce", "pc", "md"].contains(&s)),
        CommunityMapFamily::Unknown => true,
    };
    if !correct_tag {
        return invalid("Community map family disagrees with its suffix");
    }
    let name = name
        .strip_suffix(".map")
        .unwrap_or(name)
        .to_ascii_lowercase();
    if !map_component(&name) {
        return invalid("Community map filename is empty");
    }
    Ok(CommunityMap {
        family,
        name,
        pack: if family == CommunityMapFamily::MapPack {
            tag.map(str::to_ascii_lowercase)
        } else {
            None
        },
        display_name: optional_text(row, "map_title", 128)?.unwrap_or_else(|| map.to_string()),
    })
}

fn parse_server(row: &Value, fetched_at_unix: u64) -> Result<CommunityServer> {
    if !row.is_object() {
        return invalid("Community listing row is not an object");
    }
    let invite = text(row, "invite", 64)?;
    if !valid_invite(invite) {
        return invalid("Community invitation is not a 64-digit hexadecimal token");
    }
    let invite = invite.to_ascii_lowercase();
    let id = format!("delta-{}", crate::hex_bytes(Sha256::digest(invite.as_bytes())));
    let players = integer(row, "players", 1024)? as u16;
    // 1024 is a parser allocation/display limit, not an engine capacity claim.
    let advertised_capacity = integer(row, "maximum_players", 1024)? as u16;
    if advertised_capacity == 0 || players > advertised_capacity {
        return invalid("Community player counts are inconsistent");
    }
    let legacy_network_version = integer(row, "version", u16::MAX as u64)? as u16;
    if legacy_network_version == 0 {
        return invalid("Community protocol number is zero");
    }
    let capabilities = optional_text(row, "capabilities", 8)?;
    if capabilities
        .as_ref()
        .is_some_and(|s| s.len() != 8 || !s.bytes().all(|b| b.is_ascii_hexdigit()))
    {
        return invalid("Community capabilities are not eight hexadecimal digits");
    }
    let protocol = match row.get("protocol").and_then(Value::as_str).unwrap_or("") {
        "delta" => CommunityProtocol::Delta,
        "opence" => CommunityProtocol::OpenCe,
        _ => CommunityProtocol::Unknown,
    };
    Ok(CommunityServer {
        id,
        provider: "deltaList".into(),
        source: optional_text(row, "source", 32)?.unwrap_or_else(|| "unknown".into()),
        name: text(row, "name", 128)?.to_string(),
        map: parse_map(row)?,
        game_type: optional_text(row, "gametype", 96)?
            .unwrap_or_else(|| "Unknown game type".into()),
        mode: optional_text(row, "mode", 32)?.unwrap_or_else(|| "unknown".into()),
        players,
        advertised_capacity,
        open: flag(row, "open", false)?,
        locked: flag(row, "locked", false)?,
        in_progress: flag(row, "in_progress", false)?,
        legacy_network_version,
        protocol,
        build: optional_text(row, "build", 96)?,
        platform: optional_text(row, "platform", 32)?,
        hosting: optional_text(row, "hosting", 32)?.unwrap_or_else(|| "unknown".into()),
        region: optional_text(row, "region", 32)?,
        capabilities,
        provider_verified: flag(row, "verified", false)?,
        fetched_at_unix,
        advertisement_age_seconds: integer(row, "age", 86400)?,
        invite,
    })
}

/// Parse a successful application/json response from the fixed provider only.
/// Unknown optional fields are ignored for additive upstream changes. A bad row
/// is counted and isolated; an oversized or malformed envelope fails closed.
pub fn parse_delta_listing(bytes: &[u8], fetched_at_unix: u64) -> Result<CommunityListing> {
    if bytes.len() > MAX_LISTING_BYTES {
        return invalid("Community listing exceeds 1 MiB");
    }
    let document: Value = serde_json::from_slice(bytes)?;
    let rows = document
        .get("games")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            crate::SparkError::Invalid("Community listing must contain a games array".into())
        })?;
    if rows.len() > MAX_LISTING_ROWS {
        return invalid("Community listing exceeds 512 rows");
    }
    let mut servers = Vec::with_capacity(rows.len());
    let mut rejected_rows = 0;
    let mut seen = BTreeSet::new();
    for row in rows {
        match parse_server(row, fetched_at_unix) {
            Ok(server) if seen.insert(server.id.clone()) => servers.push(server),
            _ => rejected_rows += 1,
        }
    }
    let mut diagnostics = vec![
        "Public community listing; advertisements and capacity are upstream claims. No game connection has been observed.".into(),
        "The listing supplies neither a signed Delta wire range nor a map file hash. The selected game must complete protocol and content checks.".into(),
    ];
    if rejected_rows != 0 {
        diagnostics.push(format!(
            "Skipped {rejected_rows} malformed or duplicate listing rows."
        ));
    }
    Ok(CommunityListing {
        provider: "deltaList".into(),
        fetched_at_unix,
        expires_at_unix: fetched_at_unix.saturating_add(LISTING_TTL_SECONDS),
        servers,
        rejected_rows,
        diagnostics,
    })
}

fn issue(issues: &mut Vec<JoinIssue>, code: &str, summary: &str, route: &str) {
    issues.push(JoinIssue {
        code: code.into(),
        summary: summary.into(),
        setup_route: route.into(),
    });
}

/// This conservative check does not reproduce or override the signed upstream
/// compatibility table. Different numbers need game-owned negotiation research.
pub fn assess_join(server: &CommunityServer, client: &CommunityClientProfile) -> JoinAssessment {
    let mut issues = vec![];
    if !matches!(
        client.runtime_id,
        RuntimeId::ChupathingyCe | RuntimeId::OpenCe
    ) {
        issue(&mut issues, "wrongRuntime", "Choose a ChupathingyCE or OpenCE installation for this provider. MCC and classic CE clients use different session protocols.", "runtimeSetup");
    }
    if !client.executable_ready || client.registration_id.is_empty() {
        issue(
            &mut issues,
            "runtimeNotReady",
            "Inspect and register the matching installed runtime before joining.",
            "runtimeSetup",
        );
    }
    if !client.base_data_ready {
        issue(&mut issues, "missingBaseData", "This runtime needs its own Xbox base maps and UI data. MCC or a Custom Edition map alone does not establish startup compatibility.", "runtimeResources");
    }
    if server.protocol == CommunityProtocol::Unknown {
        issue(&mut issues, "unknownProtocol", "The listing does not identify a supported protocol. Use the runtime's browser to investigate this game.", "runtimeProtocol");
    }
    if client.network_version != Some(server.legacy_network_version) {
        issue(&mut issues, "protocolNotEstablished", "The selected runtime's declared legacy number does not exactly match this listing. A signed compatible range or an observed game negotiation is required before Spark can hand it off.", "runtimeProtocol");
    }
    if server.locked {
        issue(&mut issues, "passwordRequired", "Use the selected runtime's server browser for password entry. Spark does not accept passwords or password-wrapped invitations.", "runtimeBrowser");
    }
    if !server.open || server.players >= server.advertised_capacity {
        issue(&mut issues, "notOpen", "The game advertises no available joining slot. Refresh the list or choose another game.", "serversRefresh");
    }
    if server.advertisement_age_seconds > MAX_ADVERTISEMENT_AGE_SECONDS {
        issue(
            &mut issues,
            "oldAdvertisement",
            "The upstream advertisement is old. Refresh before attempting a join.",
            "serversRefresh",
        );
    }
    let supported_family = match client.runtime_id {
        RuntimeId::ChupathingyCe => server.map.family != CommunityMapFamily::Unknown,
        RuntimeId::OpenCe => matches!(
            server.map.family,
            CommunityMapFamily::Xbox | CommunityMapFamily::CustomEdition
        ),
        _ => false,
    };
    if !supported_family {
        issue(&mut issues, "unsupportedMapFamily", "This map family is not established for the selected runtime. Choose a compatible runtime and matching owned content.", "runtimeResources");
    }
    if client.maps.len() > 4096 {
        issue(
            &mut issues,
            "inventoryLimit",
            "The local inventory exceeds its inspection bound. Reinspect the runtime.",
            "runtimeResources",
        );
    } else {
        let local = client.maps.iter().find(|map| {
            map.family == server.map.family
                && map.name.eq_ignore_ascii_case(&server.map.name)
                && map.pack == server.map.pack
        });
        match local {
            None => issue(&mut issues, "missingMap", "Install the matching owned map into this runtime's map-family folder, then rescan. Spark does not download server-supplied content.", "runtimeResources"),
            Some(map) if !map.valid => issue(&mut issues, "invalidLocalMap", "The local map did not pass header and file inspection. Resolve the selected map before joining.", "runtimeResources"),
            Some(map) if !map.resources_ready => issue(&mut issues, "missingMapResources", "The selected map's family-specific resource files are missing or uninspected. Resolve its bitmaps, sounds and localization resources.", "runtimeResources"),
            Some(_) => {},
        }
    }
    JoinAssessment {
        readiness: if issues.is_empty() {JoinReadiness::ReadyForRuntimeCheck} else {JoinReadiness::Blocked},
        runtime_id: client.runtime_id, registration_id: client.registration_id.clone(), issues,
        limitations: vec![
            "An exact declared legacy number and a local map establish handoff prerequisites, not cross-play certification. The game owns its Delta/legacy handshake and checks the host's map identity.".into(),
            "No remote map hash or wire range is present in this provider response. Same-named local maps may differ; a failed game-side content check must end the join.".into(),
            "Launching or forwarding an invitation is not an observed lobby connection. No two-client or advertised-capacity test has been performed by this listing provider.".into(),
        ],
        connection_outcome: "notObserved".into(),
    }
}

pub fn prepare_join(
    server: &CommunityServer,
    client: &CommunityClientProfile,
    now_unix: u64,
) -> Result<CommunityJoinTarget> {
    if now_unix < server.fetched_at_unix
        || now_unix.saturating_sub(server.fetched_at_unix) >= LISTING_TTL_SECONDS
    {
        return invalid(
            "Community listing is stale or the system clock changed; refresh before joining",
        );
    }
    if server
        .advertisement_age_seconds
        .saturating_add(now_unix - server.fetched_at_unix)
        > MAX_ADVERTISEMENT_AGE_SECONDS
    {
        return invalid("Community advertisement is stale; refresh before joining");
    }
    if !valid_invite(&server.invite)
        || server.id != format!("delta-{}", crate::hex_bytes(Sha256::digest(server.invite.as_bytes())))
    {
        return invalid("Community invitation identity changed; refresh before joining");
    }
    let assessment = assess_join(server, client);
    if assessment.readiness != JoinReadiness::ReadyForRuntimeCheck {
        return invalid(
            assessment
                .issues
                .first()
                .map(|issue| issue.summary.clone())
                .unwrap_or_else(|| "Community join is not ready".into()),
        );
    }
    Ok(CommunityJoinTarget {
        runtime_id: client.runtime_id,
        registration_id: client.registration_id.clone(),
        server_id: server.id.clone(),
        argument: format!("halo://join/{}", server.invite),
    })
}

/// Convert the existing read-only runtime inventory into handoff prerequisites.
/// UI-cache presence is necessary, not proof of every possible startup asset.
/// External resources must be in the same family folder, with inspected hashes.
pub fn profile_from_inventory(
    registration: &RuntimeRegistration,
    installed: &RuntimeInstallation,
    inventory: &RuntimeInventory,
) -> CommunityClientProfile {
    let identities_match = registration.id == installed.registration_id
        && registration.id == inventory.registration_id
        && registration.runtime_id == inventory.runtime_id
        && installed.executable.is_some();
    let maps = inventory
        .maps
        .iter()
        .take(4097)
        .map(|map| {
            let path = map.relative_path.replace('\\', "/");
            let (folder, file) = path.rsplit_once('/').unwrap_or(("", &path));
            let family = match (folder, map.cache_version) {
                ("maps", Some(5)) => CommunityMapFamily::Xbox,
                ("maps_ce" | "maps/ce" | "custom_maps", Some(609)) => {
                    CommunityMapFamily::CustomEdition
                }
                ("maps_md" | "md_maps", Some(7 | 609)) => CommunityMapFamily::HaloMd,
                ("maps_pc", Some(7)) => CommunityMapFamily::HaloPc,
                _ => CommunityMapFamily::Unknown,
            };
            let resources_ready = family == CommunityMapFamily::Xbox
                || ["bitmaps.map", "sounds.map", "loc.map"].iter().all(|name| {
                    inventory.resources.iter().any(|resource| {
                        resource
                            .relative_path
                            .replace('\\', "/")
                            .eq_ignore_ascii_case(&format!("{folder}/{name}"))
                            && resource.sha256.is_some()
                            && resource.size.is_some_and(|size| size >= 2048)
                    })
                });
            let lower_file = file.to_ascii_lowercase();
            InstalledCommunityMap {
                family,
                name: lower_file
                    .strip_suffix(".map")
                    .unwrap_or(&lower_file)
                    .to_string(),
                pack: None,
                valid: identities_match
                    && map.valid
                    && map.sha256.is_some()
                    && map.file_size >= 2048,
                resources_ready,
            }
        })
        .collect::<Vec<_>>();
    CommunityClientProfile {
        registration_id: registration.id.clone(),
        runtime_id: registration.runtime_id,
        executable_ready: identities_match
            && installed.validation == TestStatus::Pass
            && installed.executable_sha256.is_some()
            && installed
                .version
                .as_deref()
                .is_some_and(crate::runtime::version_token),
        network_version: installed
            .network_version
            .as_deref()
            .and_then(|value| value.parse::<u16>().ok())
            .filter(|value| *value != 0),
        base_data_ready: identities_match
            && maps
                .iter()
                .any(|map| map.family == CommunityMapFamily::Xbox && map.name == "ui" && map.valid),
        maps,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // Synthetic values retain the observed 2026-10-28 response's field types.
    // No live name, invitation, account, endpoint or roster is a fixture.
    fn row() -> Value {
        json!({
            "invite": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "name": "Synthetic private fixture", "map":"levels\\test\\bloodgulch\\bloodgulch",
            "gametype":"Slayer", "engine":2, "players":1, "maximum_players":128,
            "open":1, "in_progress":0, "version":39, "age":2,
            "source":"announced", "platform":"pc_linux", "hosting":"dedicated",
            "protocol":"delta", "family":"xbox", "mode":"multiplayer",
            "build":"0.8.0h-dev", "capabilities":"00000001", "verified":true,
            "locked":false, "roster":[{"name":"Ignored"}], "future":{"field":1}
        })
    }
    fn listing(rows: Vec<Value>) -> CommunityListing {
        parse_delta_listing(&serde_json::to_vec(&json!({"games":rows})).unwrap(), 1000).unwrap()
    }
    fn client() -> CommunityClientProfile {
        CommunityClientProfile {
            registration_id: "fixture-runtime".into(),
            runtime_id: RuntimeId::ChupathingyCe,
            executable_ready: true,
            network_version: Some(39),
            base_data_ready: true,
            maps: vec![InstalledCommunityMap {
                family: CommunityMapFamily::Xbox,
                name: "bloodgulch".into(),
                pack: None,
                valid: true,
                resources_ready: true,
            }],
        }
    }
    fn has_issue(assessment: &JoinAssessment, code: &str) -> bool {
        assessment.issues.iter().any(|issue| issue.code == code)
    }

    fn inventory_fixture() -> (RuntimeRegistration, RuntimeInstallation, RuntimeInventory) {
        let root = std::path::PathBuf::from("fixture-runtime");
        let executable = root.join("halo.exe");
        let registration = RuntimeRegistration {
            id: "fixture-runtime".into(),
            runtime_id: RuntimeId::ChupathingyCe,
            root: root.clone(),
            executable: executable.clone(),
            data_root: None,
            version: Some("0.8.0h".into()),
            network_version: Some("39".into()),
        };
        let installed = RuntimeInstallation {
            registration_id: registration.id.clone(),
            root: root.clone(),
            executable: Some(executable),
            data_root: root,
            executable_sha256: Some("a".repeat(64)),
            version: registration.version.clone(),
            network_version: registration.network_version.clone(),
            identity: "userDeclared".into(),
            validation: TestStatus::Pass,
            diagnostics: vec![],
        };
        let maps = [
            ("maps/UI.MAP", 5),
            ("maps/bloodgulch.map", 5),
            ("maps_ce/fixture.map", 609),
        ]
        .into_iter()
        .map(|(path, version)| crate::runtime::RuntimeMapEntry {
            relative_path: path.into(),
            family: "labelNotUsedAsCacheEvidence".into(),
            cache_version: Some(version),
            sha256: Some("b".repeat(64)),
            scenario_type: Some(1),
            file_size: 4096,
            valid: true,
            detail: "synthetic".into(),
        })
        .collect();
        let resources = ["bitmaps.map", "sounds.map", "loc.map"]
            .into_iter()
            .map(|name| crate::runtime::RuntimeResourceEntry {
                relative_path: format!("maps_ce/{name}"),
                name: name.into(),
                sha256: Some("c".repeat(64)),
                size: Some(4096),
            })
            .collect();
        let inventory = RuntimeInventory {
            runtime_id: registration.runtime_id,
            registration_id: registration.id.clone(),
            maps,
            resources,
            diagnostics: vec![],
        };
        (registration, installed, inventory)
    }

    #[test]
    fn parses_observed_shape_without_trusting_capacity_or_leaking_token() {
        let list = listing(vec![row()]);
        assert_eq!(list.servers.len(), 1);
        assert_eq!(list.servers[0].advertised_capacity, 128);
        assert_eq!(list.servers[0].map.name, "bloodgulch");
        let serialized = serde_json::to_string(&list).unwrap();
        assert!(!serialized.contains("0123456789abcdef"));
        assert!(!format!("{list:?}").contains("0123456789abcdef"));
        assert!(!serialized.contains("Ignored"));
        let assessment = assess_join(&list.servers[0], &client());
        assert_eq!(assessment.readiness, JoinReadiness::ReadyForRuntimeCheck);
        assert_eq!(assessment.connection_outcome, "notObserved");
        let target = prepare_join(&list.servers[0], &client(), 1001).unwrap();
        assert_eq!(target.argument().len(), "halo://join/".len() + 64);
        assert!(!format!("{target:?}").contains("0123456789abcdef"));
    }

    #[test]
    fn isolates_bad_rows_duplicates_and_retains_additive_unknowns() {
        let mut bad = row();
        bad["name"] = json!("bad\nname");
        let mut unknown = row();
        unknown["invite"] = json!("f".repeat(64));
        unknown["protocol"] = json!("futureProtocol");
        let list = listing(vec![row(), bad, row(), unknown]);
        assert_eq!(list.servers.len(), 2);
        assert_eq!(list.rejected_rows, 2);
        assert!(has_issue(
            &assess_join(&list.servers[1], &client()),
            "unknownProtocol"
        ));
    }

    #[test]
    fn empty_upstream_game_type_is_an_unknown_label_not_a_bad_server() {
        // The actual capture had 26/47 empty gametype strings, including
        // announced games. A label is not the protocol or the engine's rules.
        let mut input = row();
        input["gametype"] = json!("");
        let list = listing(vec![input]);
        assert_eq!(list.rejected_rows, 0);
        assert_eq!(list.servers[0].game_type, "Unknown game type");
    }

    #[test]
    fn rejects_malformed_counts_numeric_types_paths_and_invites() {
        for (key, value) in [
            ("players", json!(-1)),
            ("players", json!(129)),
            ("maximum_players", json!(0)),
            ("maximum_players", json!(1025)),
            ("version", json!(65536)),
            ("version", json!(0)),
            ("age", json!(86401)),
            ("age", json!(1.5)),
            ("open", json!(2)),
            (
                "invite",
                json!("halo://join/".to_string() + &"a".repeat(64)),
            ),
            ("invite", json!("a".repeat(63) + ";")),
            ("invite", json!("p".to_string() + &"a".repeat(63))),
            ("map", json!("../bloodgulch")),
            ("map", json!("https://example.invalid/map")),
            ("map", json!("bloodgulch@ce")),
            ("capabilities", json!("rm -rf /")),
        ] {
            let mut bad = row();
            bad[key] = value;
            assert_eq!(listing(vec![bad]).rejected_rows, 1, "{key}");
        }
    }

    #[test]
    fn bounds_envelope_bytes_and_row_count() {
        assert!(parse_delta_listing(&vec![b' '; MAX_LISTING_BYTES + 1], 1000).is_err());
        assert!(parse_delta_listing(b"[]", 1000).is_err());
        assert!(parse_delta_listing(b"{\"games\":{}}", 1000).is_err());
        assert!(parse_delta_listing(
            &serde_json::to_vec(&json!({"games":vec![row();513]})).unwrap(),
            1000
        )
        .is_err());
        assert_eq!(listing(vec![]).servers.len(), 0);
    }

    #[test]
    fn wrong_runtime_and_unready_identity_never_become_join_commands() {
        let server = &listing(vec![row()]).servers[0];
        for runtime in [
            RuntimeId::MccSteam,
            RuntimeId::HaloPc,
            RuntimeId::HaloCustomEdition,
            RuntimeId::MacRetail,
            RuntimeId::HaloMd,
            RuntimeId::HaloXbox,
        ] {
            let mut profile = client();
            profile.runtime_id = runtime;
            assert!(has_issue(&assess_join(server, &profile), "wrongRuntime"));
            assert!(prepare_join(server, &profile, 1001).is_err());
        }
        let mut profile = client();
        profile.executable_ready = false;
        assert!(has_issue(&assess_join(server, &profile), "runtimeNotReady"));
    }

    #[test]
    fn unknown_or_different_protocol_number_requires_real_negotiation() {
        let server = &listing(vec![row()]).servers[0];
        for version in [None, Some(32), Some(38), Some(40)] {
            let mut profile = client();
            profile.network_version = version;
            assert!(has_issue(
                &assess_join(server, &profile),
                "protocolNotEstablished"
            ));
            assert!(prepare_join(server, &profile, 1001).is_err());
        }
    }

    #[test]
    fn mcc_content_same_name_and_missing_resources_do_not_count_as_compatible() {
        let server = &listing(vec![row()]).servers[0];
        let mut profile = client();
        profile.base_data_ready = false;
        assert!(has_issue(&assess_join(server, &profile), "missingBaseData"));
        profile = client();
        profile.maps[0].family = CommunityMapFamily::CustomEdition;
        assert!(has_issue(&assess_join(server, &profile), "missingMap"));
        profile = client();
        profile.maps[0].valid = false;
        assert!(has_issue(&assess_join(server, &profile), "invalidLocalMap"));
        profile = client();
        profile.maps[0].resources_ready = false;
        assert!(has_issue(
            &assess_join(server, &profile),
            "missingMapResources"
        ));
    }

    #[test]
    fn map_suffixes_are_family_specific_and_known_families_stay_separate() {
        for (family, suffix, expected) in [
            ("ce", "ce", CommunityMapFamily::CustomEdition),
            ("pc", "pc", CommunityMapFamily::HaloPc),
            ("md", "md", CommunityMapFamily::HaloMd),
            ("pack", "cex", CommunityMapFamily::MapPack),
        ] {
            let mut input = row();
            input["map"] = json!(format!("fixture@{suffix}"));
            input["family"] = json!(family);
            let list = listing(vec![input]);
            assert_eq!(list.servers[0].map.family, expected);
            assert!(has_issue(
                &assess_join(&list.servers[0], &client()),
                "missingMap"
            ));
            if expected == CommunityMapFamily::HaloPc
                || expected == CommunityMapFamily::HaloMd
                || expected == CommunityMapFamily::MapPack
            {
                let mut profile = client();
                profile.runtime_id = RuntimeId::OpenCe;
                assert!(has_issue(
                    &assess_join(&list.servers[0], &profile),
                    "unsupportedMapFamily"
                ));
            }
        }
    }

    #[test]
    fn full_closed_locked_and_old_advertisements_do_not_launch() {
        for (key, value, code) in [
            ("players", json!(128), "notOpen"),
            ("open", json!(0), "notOpen"),
            ("locked", json!(true), "passwordRequired"),
            ("age", json!(121), "oldAdvertisement"),
        ] {
            let mut input = row();
            input[key] = value;
            let list = listing(vec![input]);
            assert!(has_issue(&assess_join(&list.servers[0], &client()), code));
            assert!(prepare_join(&list.servers[0], &client(), 1001).is_err());
        }
    }

    #[test]
    fn stale_future_and_mutated_rows_cannot_reuse_a_join() {
        let mut server = listing(vec![row()]).servers.remove(0);
        assert!(prepare_join(&server, &client(), 999).is_err());
        assert!(prepare_join(&server, &client(), 1030).is_err());
        assert!(prepare_join(&server, &client(), 1029).is_ok());
        server.invite = "b".repeat(64);
        assert!(prepare_join(&server, &client(), 1001).is_err());
    }

    #[test]
    fn refresh_gate_applies_after_failures_and_clock_rollback() {
        let mut gate = ListingRefreshGate::default();
        assert!(gate.begin_refresh(1000).is_ok());
        assert_eq!(gate.seconds_until_refresh(1001), 29);
        assert!(gate.begin_refresh(1029).is_err());
        assert_eq!(gate.seconds_until_refresh(999), 31);
        assert!(gate.begin_refresh(1030).is_ok());
    }

    #[test]
    fn inventory_requires_matching_registration_and_inspected_base_cache() {
        let (registration, installed, mut inventory) = inventory_fixture();
        let profile = profile_from_inventory(&registration, &installed, &inventory);
        assert!(profile.executable_ready);
        assert!(profile.base_data_ready);
        assert_eq!(profile.network_version, Some(39));
        assert_eq!(profile.maps[2].family, CommunityMapFamily::CustomEdition);
        assert!(profile.maps[2].resources_ready);
        inventory.maps[0].cache_version = Some(13);
        assert!(!profile_from_inventory(&registration, &installed, &inventory).base_data_ready);
        inventory.runtime_id = RuntimeId::MccSteam;
        let wrong = profile_from_inventory(&registration, &installed, &inventory);
        assert!(!wrong.executable_ready);
        assert!(!wrong.base_data_ready);
        assert!(wrong.maps.iter().all(|map| !map.valid));
    }

    #[test]
    fn resource_files_cannot_leak_across_map_folders_or_uninspected_files() {
        let (registration, installed, mut inventory) = inventory_fixture();
        inventory.resources[0].relative_path = "maps_pc/bitmaps.map".into();
        assert!(
            !profile_from_inventory(&registration, &installed, &inventory).maps[2].resources_ready
        );
        inventory.resources[0].relative_path = "maps_ce/bitmaps.map".into();
        inventory.resources[0].sha256 = None;
        assert!(
            !profile_from_inventory(&registration, &installed, &inventory).maps[2].resources_ready
        );
    }

    #[test]
    fn unknown_build_and_protocol_are_not_ready_from_an_executable_header_alone() {
        let (registration, mut installed, inventory) = inventory_fixture();
        installed.version = None;
        assert!(!profile_from_inventory(&registration, &installed, &inventory).executable_ready);
        installed.version = registration.version.clone();
        installed.network_version = Some("unknown".into());
        let profile = profile_from_inventory(&registration, &installed, &inventory);
        assert!(has_issue(
            &assess_join(&listing(vec![row()]).servers[0], &profile),
            "protocolNotEstablished"
        ));
    }
}
