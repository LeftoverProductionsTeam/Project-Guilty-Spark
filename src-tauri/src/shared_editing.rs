use super::*;
use spark_core::{
    forge_session::{GameBinding, Guest, Host, Peer, View},
    session_invite::{Invite, Transport},
};
pub(super) struct Session {
    pub project_id: String,
    pub id: String,
    pub peer: Peer,
    pub transport: Transport,
    pub endpoint: String,
    pub lan: bool,
    pub game: Option<GameBinding>,
    pub owner: String,
    pub directory_id: Option<String>,
    pub studio: bool,
    _bridge: Option<crate::steam_bridge::Bridge>,
}
impl Drop for Session {
    fn drop(&mut self) {
        self.peer.leave();
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Info {
    project_id: String,
    project_title: String,
    session_id: String,
    role: String,
    transport: Transport,
    endpoint: String,
    key: Option<String>,
    view: Option<View>,
    lan: bool,
    detail: Option<String>,
    owned: bool,
    directory_id: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct StudioRecord {
    directory_id: String,
    session_id: String,
    project_id: String,
    title: String,
    created_at: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Identity {
    client: String,
    credential: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Pending {
    session_id: String,
    operation_id: String,
    revision: u64,
    document: quickforge::QuickForgeDocument,
}
pub(super) fn pending(state: &AppState, owner: &str, project: &str) -> Reply<Option<Pending>> {
    check_document_owner(state, project, owner)?;
    let value: Option<Pending> = lock(&state.library)?
        .setting(&format!("studio-pending-{project}"))
        .map_err(error)?;
    if let Some(value) = &value {
        uuid::Uuid::parse_str(&value.session_id).map_err(error)?;
        uuid::Uuid::parse_str(&value.operation_id).map_err(error)?;
        quickforge::validate_portable_document(&value.document).map_err(error)?;
    }
    Ok(value)
}
pub(super) fn save_pending(
    state: &AppState,
    owner: &str,
    project: &str,
    value: Pending,
) -> Reply<()> {
    check_document_owner(state, project, owner)?;
    uuid::Uuid::parse_str(&value.session_id).map_err(error)?;
    uuid::Uuid::parse_str(&value.operation_id).map_err(error)?;
    quickforge::validate_portable_document(&value.document).map_err(error)?;
    let library = lock(&state.library)?;
    let retained: Option<Pending> = library
        .setting(&format!("studio-pending-{project}"))
        .map_err(error)?;
    if retained
        .as_ref()
        .is_some_and(|old| old.session_id != value.session_id)
    {
        return Err("An unacknowledged edit from another session is retained. Export or restore it, then explicitly clear it before submitting a new session's draft.".into());
    }
    let p = library.get(project).map_err(error)?;
    if p.quick_forge
        .as_ref()
        .is_none_or(|d| d.runtime_id != value.document.runtime_id)
        || serde_json::to_vec(&value).map_err(error)?.len() > 2 * 1024 * 1024
    {
        return Err(
            "The pending shared edit does not match this source/runtime or exceeds its bound"
                .into(),
        );
    }
    library
        .set_setting(&format!("studio-pending-{project}"), &Some(value))
        .map_err(error)
}
pub(super) fn clear_pending(
    state: &AppState,
    owner: &str,
    project: &str,
    operation: &str,
) -> Reply<()> {
    check_document_owner(state, project, owner)?;
    let library = lock(&state.library)?;
    let value: Option<Pending> = library
        .setting(&format!("studio-pending-{project}"))
        .map_err(error)?;
    if value.is_some_and(|p| p.operation_id == operation) {
        library
            .set_setting(
                &format!("studio-pending-{project}"),
                &Option::<Pending>::None,
            )
            .map_err(error)?;
    }
    Ok(())
}
pub(super) fn release_window(state: &AppState, owner: &str) {
    let session = state.forge_session.lock().ok().and_then(|mut slot| {
        if slot.as_ref().is_some_and(|s| s.owner == owner) {
            slot.take()
        } else {
            None
        }
    });
    drop(session);
}
pub(super) fn claim_owner(state: &AppState, project: &str, owner: &str) -> Reply<()> {
    if let Some(session) = lock(&state.forge_session)?
        .as_mut()
        .filter(|s| s.project_id == project)
    {
        session.owner = owner.into();
    }
    Ok(())
}
fn directory(state: &AppState, id: &str) -> Reply<PathBuf> {
    uuid::Uuid::parse_str(id).map_err(error)?;
    let root = state.root.join("studio-sessions");
    core::reject_links(&root).map_err(error)?;
    fs::create_dir_all(&root).map_err(error)?;
    let result = root.join(id);
    core::reject_links(&result).map_err(error)?;
    Ok(result)
}
fn history_key(project: &str) -> String {
    format!("studio-history-{project}")
}
pub(super) fn history(state: &AppState, project: &str) -> Reply<Vec<StudioRecord>> {
    let mut rows: Vec<StudioRecord> = lock(&state.library)?
        .setting(&history_key(project))
        .map_err(error)?;
    if rows.len() > 32 {
        return Err("SparkLink history exceeds 32 retained sessions".into());
    }
    rows.sort_by(|a,b|b.created_at.cmp(&a.created_at).then_with(||a.directory_id.cmp(&b.directory_id)));
    Ok(rows)
}
pub(super) fn recover(
    state: &AppState,
    owner: &str,
    project_id: String,
    directory_id: String,
    address: String,
    display_name: String,
) -> Reply<Info> {
    check_document_owner(state, &project_id, owner)?;
    let p = lock(&state.library)?.get(&project_id).map_err(error)?;
    let record = history(state, &project_id)?
        .into_iter()
        .find(|r| r.directory_id == directory_id && r.project_id == project_id)
        .ok_or("This project has no matching retained SparkLink session")?;
    let mut slot = lock(&state.forge_session)?;
    if slot.is_some() {
        return Err("Leave the active session before recovering another".into());
    }
    snapshot_project_state(state, &p, core::snapshots::BEFORE_SHARED_RECOVERY)?;
    let ip = address
        .parse::<std::net::Ipv4Addr>()
        .map_err(|_| "Use a private recovery bind address")?;
    let host =
        Host::recover(&directory(state, &directory_id)?, ip, None, &display_name).map_err(error)?;
    let peer = Peer::Host(host);
    let view = peer.poll().map_err(error)?;
    if view.session_id != record.session_id
        || p.quick_forge
            .as_ref()
            .is_none_or(|d| d.runtime_id != view.document.runtime_id)
    {
        peer.leave();
        return Err("The retained session does not match this project's identity/runtime".into());
    }
    let session = Session {
        project_id: project_id.clone(),
        id: view.session_id.clone(),
        endpoint: peer.endpoint().to_string(),
        peer,
        transport: Transport::Lan,
        lan: !ip.is_loopback(),
        game: None,
        owner: owner.into(),
        directory_id: Some(directory_id),
        studio: true,
        _bridge: None,
    };
    let response = info(&session, p.title, Some(view), true);
    *slot = Some(session);
    Ok(response)
}
pub(super) fn reverse(
    state: &AppState,
    owner: &str,
    project: &str,
    session: &str,
    operation_id: &str,
    redo: bool,
) -> Reply<View> {
    let (_, peer, _) = peer(state, owner, project, Some(session))?;
    peer.reverse(operation_id, redo).map_err(error)
}
pub(super) fn role(
    state: &AppState,
    owner: &str,
    project: &str,
    session: &str,
    participant: &str,
    role: core::studio_journal::Role,
    revoke: bool,
) -> Reply<View> {
    let (_, peer, _) = peer(state, owner, project, Some(session))?;
    match peer {
        Peer::Host(host) => host.role(participant, role, revoke).map_err(error),
        _ => Err("Only the session owner can manage participants".into()),
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct BuildBinding {
    schema_version: u32,
    project_id: String,
    session_id: String,
    session_revision: u64,
    project_fingerprint: String,
    document_sha256: String,
}
fn document_hash(document: &quickforge::QuickForgeDocument) -> Reply<String> {
    use sha2::Digest;
    Ok(format!(
        "{:x}",
        sha2::Sha256::digest(
            serde_json::to_vec(&core::forge_session::portable(document.clone())).map_err(error)?
        )
    ))
}
pub(super) fn build_binding(state: &AppState, project: &Project) -> Reply<Option<BuildBinding>> {
    let peer = {
        let slot = lock(&state.forge_session)?;
        slot.as_ref()
            .filter(|s| s.project_id == project.id && s.studio)
            .map(|s| s.peer.clone())
    };
    let Some(peer) = peer else { return Ok(None) };
    if peer.role() != "host" {
        return Err("The SparkLink owner builds authoritative session snapshots. Guests can continue editing their local/shared source.".into());
    }
    let view = peer.poll().map_err(error)?;
    let document = project
        .quick_forge
        .as_ref()
        .ok_or("This build has no QuickForge source")?;
    if core::forge_session::portable(document.clone()) != view.document {
        return Err("Save and wait for shared edits to converge before building this session revision. All local and acknowledged work is retained.".into());
    }
    Ok(Some(BuildBinding {
        schema_version: 1,
        project_id: project.id.clone(),
        session_id: view.session_id,
        session_revision: view.revision,
        project_fingerprint: project.fingerprint().map_err(error)?,
        document_sha256: document_hash(document)?,
    }))
}
pub(super) fn build_snapshot(state: &AppState, project: &Project, id: &str) -> Reply<Project> {
    uuid::Uuid::parse_str(id).map_err(error)?;
    let job = state.root.join("jobs").join(id);
    read_build_snapshot(project, &job)
}
fn read_build_snapshot(project: &Project, job: &Path) -> Reply<Project> {
    let binding: BuildBinding =
        serde_json::from_slice(&bounded_read(&job.join("studio-binding.json"), 16384)?)
            .map_err(error)?;
    let mut snapshot =
        core::project::load_project(&job.join("workspace/project.gsproject")).map_err(error)?;
    if binding.schema_version != 1
        || binding.project_id != project.id
        || snapshot.id != project.id
        || snapshot.fingerprint().map_err(error)? != binding.project_fingerprint
        || document_hash(
            snapshot
                .quick_forge
                .as_ref()
                .ok_or("Shared snapshot has no source")?,
        )? != binding.document_sha256
    {
        return Err(
            "The shared build snapshot identity/source changed. The current project is retained."
                .into(),
        );
    }
    snapshot.builds = project.builds.clone();
    Ok(snapshot)
}
fn game(state: &AppState) -> Reply<GameBinding> {
    let session = lock(&state.live_mcc)?
        .as_ref()
        .cloned()
        .ok_or("Connect the running Halo map in Live mode before linking this invite")?;
    let status = crate::live_mcc::sample(&session).map_err(error)?;
    let id = status.snapshot.identity;
    Ok(GameBinding {
        runtime_id: "mccSteam".into(),
        scenario: id.scenario,
        checksum: id.checksum,
        tag_count: id.tag_count,
    })
}
fn matches_game(state: &AppState, expected: &Option<GameBinding>) -> Reply<()> {
    if let Some(expected) = expected {
        if &game(state)? != expected {
            return Err("The loaded Halo map does not match this editing session. Connect the matching map before joining or sharing edits.".into());
        }
    }
    Ok(())
}
fn module(state: &AppState) -> Reply<(PathBuf, String)> {
    let settings = lock(&state.settings)?.clone();
    Ok((
        settings
            .steam_bridge_directory
            .ok_or("Choose the optional Spacewar module folder first")?,
        settings
            .steam_bridge_manifest_sha256
            .ok_or("Review the optional Steam module before enabling it")?,
    ))
}
pub(super) fn host(
    state: &AppState,
    owner: &str,
    project_id: String,
    document: quickforge::QuickForgeDocument,
    lan: bool,
    transport: Transport,
    link_game: bool,
    studio: bool,
    host_name: String,
    bind_address: Option<String>,
) -> Reply<Info> {
    check_document_owner(state, &project_id, owner)?;
    let p = lock(&state.library)?.get(&project_id).map_err(error)?;
    if p.quick_forge.is_none() {
        return Err("Open a QuickForge project first".into());
    }
    studio_native_source::matches(state,&project_id,&document)?;
    let mut slot = lock(&state.forge_session)?;
    if slot.is_some() {
        return Err("Another editing session is active. Open its map to manage it.".into());
    }
    let binding = if link_game { Some(game(state)?) } else { None };
    snapshot_project_state(state, &p, "before-shared-session")?;
    let mut directory_id = None;
    let host = if studio {
        let rows = history(state, &project_id)?;
        if rows.len() >= 32 {
            return Err("This project retains 32 SparkLink sessions. Existing work is preserved; review those sessions before creating more.".into());
        }
        let address = if lan && transport == Transport::Lan {
            bind_address
                .as_deref()
                .unwrap_or("127.0.0.1")
                .parse::<std::net::Ipv4Addr>()
                .map_err(|_| "Use the host's private LAN/VPN IPv4 address")?
        } else {
            std::net::Ipv4Addr::LOCALHOST
        };
        let id = uuid::Uuid::new_v4().to_string();
        let host = Host::persistent(
            document,
            address,
            binding.clone(),
            &directory(state, &id)?,
            &host_name,
            transport == Transport::Lan,
        )
        .map_err(error)?;
        directory_id = Some(id);
        host
    } else {
        Host::start_with_game(
            document,
            lan && transport == Transport::Lan,
            binding.clone(),
        )
        .map_err(error)?
    };
    let local = format!("127.0.0.1:{}", host.endpoint.port());
    let bridge = if transport == Transport::SteamSpacewar {
        let (dir, hash) = module(state)?;
        Some(crate::steam_bridge::Bridge::start(
            &dir,
            &hash,
            &["--host".into(), local, host.endpoint.port().to_string()],
        )?)
    } else {
        None
    };
    let endpoint = bridge
        .as_ref()
        .map(|b| b.ready.steam_endpoint.clone())
        .unwrap_or_else(|| host.endpoint.to_string());
    let peer = Peer::Host(host);
    let view = peer.poll().map_err(error)?;
    if let Some(directory_id) = &directory_id {
        let mut rows = history(state, &project_id)?;
        rows.push(StudioRecord {
            directory_id: directory_id.clone(),
            session_id: view.session_id.clone(),
            project_id: project_id.clone(),
            title: p.title.clone(),
            created_at: chrono::Utc::now().to_rfc3339(),
        });
        lock(&state.library)?
            .set_setting(&history_key(&project_id), &rows)
            .map_err(error)?;
    }
    let session = Session {
        project_id: project_id.clone(),
        id: view.session_id.clone(),
        peer,
        transport,
        endpoint,
        lan,
        game: binding,
        owner: owner.into(),
        directory_id,
        studio,
        _bridge: bridge,
    };
    let info = info(&session, p.title, Some(view), true);
    *slot = Some(session);
    Ok(info)
}
fn info(session: &Session, title: String, view: Option<View>, own: bool) -> Info {
    Info {
        project_id: session.project_id.clone(),
        project_title: title,
        session_id: session.id.clone(),
        role: session.peer.role().into(),
        transport: session.transport.clone(),
        endpoint: if own {
            session.endpoint.clone()
        } else {
            String::new()
        },
        key: own.then(|| session.peer.key().to_string()),
        view,
        lan: session.lan,
        detail: None,
        owned: own,
        directory_id: own.then(|| session.directory_id.clone()).flatten(),
    }
}
pub(super) fn status(state: &AppState, owner: &str, project_id: &str) -> Reply<Option<Info>> {
    let data = {
        let slot = lock(&state.forge_session)?;
        slot.as_ref().map(|s| {
            (
                s.project_id.clone(),
                s.id.clone(),
                s.peer.clone(),
                s.transport.clone(),
                s.endpoint.clone(),
                s.lan,
            )
        })
    };
    let Some((active, id, peer, _, _, _)) = data else {
        return Ok(None);
    };
    let own = active == project_id
        && lock(&state.forge_session)?
            .as_ref()
            .is_some_and(|s| s.owner == owner);
    let (view, detail) = if own {
        match peer.poll() {
            Ok(view) => (Some(view), None),
            Err(error) => (None, Some(error.to_string())),
        }
    } else {
        (None, None)
    };
    let title = lock(&state.library)?.get(&active).map_err(error)?.title;
    let slot = lock(&state.forge_session)?;
    let session = slot
        .as_ref()
        .filter(|s| s.id == id)
        .ok_or("Editing session changed; refresh its status")?;
    let mut response = info(session, title, view, own);
    response.detail = detail;
    Ok(Some(response))
}
pub(super) fn join(
    state: &AppState,
    owner: &str,
    project_id: String,
    endpoint: String,
    key: String,
    transport: Transport,
    invite_text: Option<String>,
    display_name: String,
) -> Reply<View> {
    check_document_owner(state, &project_id, owner)?;
    let p = lock(&state.library)?.get(&project_id).map_err(error)?;
    if p.quick_forge.is_none() {
        return Err("Open a QuickForge project before joining".into());
    }
    let invite = invite_text
        .as_deref()
        .map(Invite::decode)
        .transpose()
        .map_err(error)?;
    if invite
        .as_ref()
        .is_some_and(|i| i.transport == Transport::Lan && i.certificate.is_none())
    {
        return Err("This LAN invitation has no TLS certificate. Request a modern private invitation, or explicitly use Advanced legacy address/key mode for unencrypted sessions.".into());
    }
    let (endpoint, key, transport) = invite
        .as_ref()
        .map(|i| (i.endpoint.clone(), i.key.clone(), i.transport.clone()))
        .unwrap_or((endpoint, key, transport));
    let mut slot = lock(&state.forge_session)?;
    if slot.is_some() {
        return Err("Leave the current editing session before joining another".into());
    }
    snapshot_project_state(state, &p, "before-shared-session")?;
    let bridge = if transport == Transport::SteamSpacewar {
        let (dir, hash) = module(state)?;
        Some(crate::steam_bridge::Bridge::start(
            &dir,
            &hash,
            &["--guest".into(), endpoint.clone()],
        )?)
    } else {
        None
    };
    let local = bridge
        .as_ref()
        .and_then(|b| b.ready.local_endpoint.clone())
        .unwrap_or_else(|| endpoint.clone());
    let identity: Option<Identity> = lock(&state.library)?
        .setting(&format!("studio-identity-{project_id}"))
        .map_err(error)?;
    let (guest, view) = Guest::join_studio(
        &local,
        &key,
        invite.as_ref().and_then(|i| i.certificate.as_deref()),
        &display_name,
        identity.map(|i| (i.client, i.credential)),
        if transport == Transport::SteamSpacewar {
            Duration::from_secs(20)
        } else {
            Duration::from_secs(3)
        },
    )
    .map_err(error)?;
    if view.document.runtime_id != p.quick_forge.as_ref().unwrap().runtime_id {
        Peer::Guest(guest).leave();
        return Err("This project's runtime differs from the shared source. Open a matching QuickForge target before joining.".into());
    }
    if let Err(e)=studio_native_source::matches(state,&project_id,&view.document){ Peer::Guest(guest).leave(); return Err(e); }
    let (client, credential) = guest.identity();
    lock(&state.library)?
        .set_setting(
            &format!("studio-identity-{project_id}"),
            &Some(Identity { client, credential }),
        )
        .map_err(error)?;
    let peer = Peer::Guest(guest);
    if invite
        .as_ref()
        .is_some_and(|i| i.session_id != view.session_id || i.game != view.game)
    {
        peer.leave();
        return Err("This invite belongs to a different or replaced session".into());
    }
    if let Err(error) = if view.durable {
        Ok(())
    } else {
        matches_game(state, &view.game)
    } {
        peer.leave();
        return Err(error);
    }
    *slot = Some(Session {
        project_id,
        id: view.session_id.clone(),
        peer,
        transport,
        endpoint,
        lan: false,
        game: view.game.clone(),
        owner: owner.into(),
        directory_id: None,
        studio: view.durable,
        _bridge: bridge,
    });
    Ok(view)
}
fn peer(
    state: &AppState,
    owner: &str,
    project_id: &str,
    session_id: Option<&str>,
) -> Reply<(String, Peer, Option<GameBinding>)> {
    let slot = lock(&state.forge_session)?;
    let session = slot
        .as_ref()
        .filter(|s| {
            s.owner == owner && s.project_id == project_id && session_id.is_none_or(|id| s.id == id)
        })
        .ok_or("This map has no matching editing session")?;
    Ok((
        session.id.clone(),
        session.peer.clone(),
        session.game.clone(),
    ))
}
pub(super) fn poll(
    state: &AppState,
    owner: &str,
    project_id: &str,
    session_id: Option<&str>,
    resume: bool,
) -> Reply<View> {
    let (id, peer, binding) = peer(state, owner, project_id, session_id)?;
    if resume
        && lock(&state.forge_session)?
            .as_ref()
            .is_some_and(|s| !s.studio)
    {
        matches_game(state, &binding)?;
    }
    let view = if resume { peer.resume() } else { peer.poll() }.map_err(error)?;
    if lock(&state.forge_session)?
        .as_ref()
        .is_none_or(|s| s.id != id)
    {
        return Err("Editing session changed while waiting for its response".into());
    }
    Ok(view)
}
pub(super) fn update(
    state: &AppState,
    owner: &str,
    project_id: &str,
    session_id: &str,
    revision: u64,
    document: quickforge::QuickForgeDocument,
    operation_id: Option<String>,
) -> Reply<View> {
    let (id, peer, binding) = peer(state, owner, project_id, Some(session_id))?;
    if lock(&state.forge_session)?
        .as_ref()
        .is_some_and(|s| !s.studio)
    {
        matches_game(state, &binding)?;
    }
    let view = peer
        .propose_with_id(
            &operation_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            revision,
            document,
        )
        .map_err(error)?;
    if lock(&state.forge_session)?
        .as_ref()
        .is_none_or(|s| s.id != id)
    {
        return Err("Editing session changed while sharing edits".into());
    }
    Ok(view)
}
pub(super) fn leave(
    state: &AppState,
    owner: &str,
    project_id: &str,
    session_id: &str,
) -> Reply<()> {
    let session = {
        let mut slot = lock(&state.forge_session)?;
        if slot
            .as_ref()
            .is_none_or(|s| s.owner != owner || s.project_id != project_id || s.id != session_id)
        {
            return Err("The editing session changed; refresh before leaving it".into());
        }
        slot.take()
    };
    drop(session);
    Ok(())
}
pub(super) fn invite(
    state: &AppState,
    owner: &str,
    project_id: &str,
    session_id: &str,
    address: Option<String>,
    viewer: bool,
) -> Reply<String> {
    let slot = lock(&state.forge_session)?;
    let session = slot
        .as_ref()
        .filter(|s| {
            s.owner == owner
                && s.id == session_id
                && s.project_id == project_id
                && s.peer.role() == "host"
        })
        .ok_or("Open the active host map before copying its invite")?;
    let endpoint = if session.transport == Transport::Lan {
        let ip: std::net::Ipv4Addr = address
            .as_deref()
            .unwrap_or("127.0.0.1")
            .trim()
            .parse()
            .map_err(|_| "Enter this computer's private LAN/VPN IPv4 address")?;
        if !session.lan && !ip.is_loopback() {
            return Err("Enable private LAN/VPN when hosting for another computer".into());
        }
        if session.peer.certificate().is_some()
            && session.peer.endpoint().ip() != std::net::IpAddr::V4(ip)
        {
            return Err("This TLS host listens on its selected private address. Use that address in the invite, or close and rehost on the desired LAN/VPN interface.".into());
        }
        format!("{ip}:{}", session.peer.endpoint().port())
    } else {
        session.endpoint.clone()
    };
    Invite {
        schema_version: core::forge_session::PROTOCOL_VERSION,
        session_id: session.id.clone(),
        transport: session.transport.clone(),
        endpoint,
        key: match &session.peer {
            Peer::Host(host) => host.key_for(viewer),
            _ => return Err("Only the owner can issue invitations".into()),
        },
        certificate: session.peer.certificate(),
        game: session.game.clone(),
    }
    .encode()
    .map_err(error)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn frozen_build_reads_the_existing_export_workspace_and_rejects_changed_input() {
        let temp = tempfile::tempdir().unwrap();
        let mut input = Project::new("frozen source");
        input.quick_forge = Some(quickforge::create_arena("frozen_source", "emptyArena").unwrap());
        let id = uuid::Uuid::new_v4().to_string();
        let receipt = forge_build::run_job(
            &input,
            &forge_build::ForgeToolchain::default(),
            temp.path(),
            &id,
            true,
            vec![],
            Arc::new(AtomicBool::new(false)),
            |_| {},
        )
        .unwrap();
        assert_eq!(receipt.status, "exported");
        let job = temp.path().join(&id);
        let binding = BuildBinding {
            schema_version: 1,
            project_id: input.id.clone(),
            session_id: uuid::Uuid::new_v4().to_string(),
            session_revision: 7,
            project_fingerprint: input.fingerprint().unwrap(),
            document_sha256: document_hash(input.quick_forge.as_ref().unwrap()).unwrap(),
        };
        project::atomic_write(
            &job.join("studio-binding.json"),
            &serde_json::to_vec(&binding).unwrap(),
            false,
        )
        .unwrap();
        let mut current = input.clone();
        current.quick_forge.as_mut().unwrap().spawns[0].position[0] += 1.;
        let frozen = read_build_snapshot(&current, &job).unwrap();
        assert_eq!(frozen.quick_forge, input.quick_forge);
        assert_ne!(frozen.quick_forge, current.quick_forge);
        project::save_project(&job.join("workspace/project.gsproject"), &current).unwrap();
        assert!(read_build_snapshot(&current, &job).is_err());
        assert_ne!(current.quick_forge, input.quick_forge);
    }
}
