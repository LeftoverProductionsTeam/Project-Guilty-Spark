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
) -> Reply<Info> {
    check_document_owner(state, &project_id, owner)?;
    let p = lock(&state.library)?.get(&project_id).map_err(error)?;
    if p.quick_forge.is_none() {
        return Err("Open a QuickForge project first".into());
    }
    let mut slot = lock(&state.forge_session)?;
    if slot.is_some() {
        return Err("Another editing session is active. Open its map to manage it.".into());
    }
    let binding = if link_game { Some(game(state)?) } else { None };
    snapshot_project_state(state, &p, "before-shared-session")?;
    let host = Host::start_with_game(
        document,
        lan && transport == Transport::Lan,
        binding.clone(),
    )
    .map_err(error)?;
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
    let session = Session {
        project_id: project_id.clone(),
        id: view.session_id.clone(),
        peer,
        transport,
        endpoint,
        lan,
        game: binding,
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
    }
}
pub(super) fn status(state: &AppState, project_id: &str) -> Reply<Option<Info>> {
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
    let own = active == project_id;
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
    let (guest, view) = Guest::join_with_timeout(
        &local,
        &key,
        if transport == Transport::SteamSpacewar {
            Duration::from_secs(20)
        } else {
            Duration::from_secs(3)
        },
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
    if let Err(error) = matches_game(state, &view.game) {
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
        _bridge: bridge,
    });
    Ok(view)
}
fn peer(
    state: &AppState,
    project_id: &str,
    session_id: Option<&str>,
) -> Reply<(String, Peer, Option<GameBinding>)> {
    let slot = lock(&state.forge_session)?;
    let session = slot
        .as_ref()
        .filter(|s| s.project_id == project_id && session_id.is_none_or(|id| s.id == id))
        .ok_or("This map has no matching editing session")?;
    Ok((
        session.id.clone(),
        session.peer.clone(),
        session.game.clone(),
    ))
}
pub(super) fn poll(
    state: &AppState,
    project_id: &str,
    session_id: Option<&str>,
    resume: bool,
) -> Reply<View> {
    let (id, peer, binding) = peer(state, project_id, session_id)?;
    if resume {
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
    project_id: &str,
    session_id: &str,
    revision: u64,
    document: quickforge::QuickForgeDocument,
) -> Reply<View> {
    let (id, peer, binding) = peer(state, project_id, Some(session_id))?;
    matches_game(state, &binding)?;
    let view = peer.propose(revision, document).map_err(error)?;
    if lock(&state.forge_session)?
        .as_ref()
        .is_none_or(|s| s.id != id)
    {
        return Err("Editing session changed while sharing edits".into());
    }
    Ok(view)
}
pub(super) fn leave(state: &AppState, project_id: &str, session_id: &str) -> Reply<()> {
    let session = {
        let mut slot = lock(&state.forge_session)?;
        if slot
            .as_ref()
            .is_none_or(|s| s.project_id != project_id || s.id != session_id)
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
    project_id: &str,
    session_id: &str,
    address: Option<String>,
) -> Reply<String> {
    let slot = lock(&state.forge_session)?;
    let session = slot
        .as_ref()
        .filter(|s| s.id == session_id && s.project_id == project_id && s.peer.role() == "host")
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
        format!("{ip}:{}", session.peer.endpoint().port())
    } else {
        session.endpoint.clone()
    };
    Invite {
        schema_version: core::forge_session::PROTOCOL_VERSION,
        session_id: session.id.clone(),
        transport: session.transport.clone(),
        endpoint,
        key: session.peer.key().into(),
        game: session.game.clone(),
    }
    .encode()
    .map_err(error)
}
