use super::*;
use spark_core as core;
use spark_core::invitations::{self, Invitation, InvitationClient, InvitationRoute};

#[derive(Default)]
pub(super) struct InvitationsState {
    tickets: HashMap<String, Ticket>,
}
#[derive(PartialEq)]
struct ClientIdentity {
    executable: PathBuf,
    sha256: String,
    content: String,
    data_root: Option<PathBuf>,
}
struct Ticket {
    owner: String,
    invitation: Invitation,
    client: InvitationClient,
    identity: Option<ClientIdentity>,
    created: Instant,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Preview {
    id: Option<String>,
    route: InvitationRoute,
    expires_at_unix: u64,
    executable: Option<PathBuf>,
    executable_sha256: Option<String>,
    data_root: Option<PathBuf>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Handoff {
    status: String,
    detail: String,
    process_id: Option<u32>,
}

fn runtime_id(client: InvitationClient) -> Option<runtime::RuntimeId> {
    match client {
        InvitationClient::MccSteam => Some(runtime::RuntimeId::MccSteam),
        InvitationClient::ChupathingyCe => Some(runtime::RuntimeId::ChupathingyCe),
        InvitationClient::OpenCe => Some(runtime::RuntimeId::OpenCe),
        InvitationClient::WebOpenCe => None,
    }
}
fn native_identity(state: &AppState, client: InvitationClient) -> Reply<Option<ClientIdentity>> {
    match client {
        InvitationClient::WebOpenCe => {
            #[cfg(windows)]
            {
                let (executable, sha256, _) = dependency_install::browser_executable()?;
                Ok(Some(ClientIdentity {
                    executable,
                    sha256,
                    content: "official-opence-web".into(),
                    data_root: None,
                }))
            }
            #[cfg(not(windows))]
            Ok(None)
        }
        InvitationClient::MccSteam => {
            let installation = lock(&state.installation)?.clone();
            if !installation.halo1_installed {
                return Err("Select the owned MCC Halo 1 installation in Settings & tools".into());
            }
            let exe = installation
                .steam_executable
                .ok_or("Steam is not installed or its executable could not be validated")?;
            core::reject_links(&exe).map_err(error)?;
            Ok(Some(ClientIdentity {
                executable: exe.clone(),
                sha256: maps::hash_file(&exe).map_err(error)?,
                content: "steam-976730".into(),
                data_root: None,
            }))
        }
        InvitationClient::ChupathingyCe | InvitationClient::OpenCe => {
            let id = runtime_id(client).ok_or("Unknown native runtime")?;
            let (registration, profile, hash, content, data_root) =
                runtime_workbench::client_profile(state, id)?;
            if !profile.executable_ready
                || !profile.base_data_ready
                || profile.network_version.is_none()
            {
                return Err("Inspect the matching community runtime, its declared network version and its own base UI/maps first. MCC content alone is not sufficient startup evidence.".into());
            }
            let plan = runtime::prepare_launch(&registration).map_err(error)?;
            let root = fs::canonicalize(&state.root).map_err(error)?;
            if plan.executable.starts_with(root.join("archives"))
                || plan.executable.starts_with(root.join("Inbox"))
            {
                return Err("Register a separately installed runtime; imported executables cannot be launched".into());
            }
            if maps::hash_file(&plan.executable).map_err(error)? != hash {
                return Err("The runtime changed during inspection; check it again".into());
            }
            Ok(Some(ClientIdentity {
                executable: plan.executable,
                sha256: hash,
                content,
                data_root: Some(data_root),
            }))
        }
    }
}

#[tauri::command]
pub(super) async fn invitation_prepare(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    invitation: String,
    client: InvitationClient,
) -> Reply<Preview> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let invitation = invitations::parse(&invitation).map_err(error)?;
        let mut route = invitations::route(&invitation, client);
        let state = app.state::<AppState>();
        let mut identity = None;
        if route.can_handoff {
            match native_identity(&state, client) {
                Ok(value) => identity = value,
                Err(reason) => {
                    route.can_handoff = false;
                    route.requirements.insert(0, reason);
                }
            }
        }
        let expires_at_unix = chrono::Utc::now().timestamp().max(0) as u64 + 90;
        let executable = identity.as_ref().map(|i| i.executable.clone());
        let executable_sha256 = identity.as_ref().map(|i| i.sha256.clone());
        let data_root = identity.as_ref().and_then(|i| i.data_root.clone());
        let id = if route.can_handoff {
            let id = uuid::Uuid::new_v4().to_string();
            let mut tickets = lock(&state.invitations)?;
            if app.get_webview_window(&owner).is_none() {
                return Err("The requesting window closed during inspection".into());
            }
            tickets
                .tickets
                .retain(|_, t| t.created.elapsed() < Duration::from_secs(90));
            if tickets.tickets.len() >= 32 {
                return Err("Too many pending invitations; let an old preview expire".into());
            }
            tickets.tickets.insert(
                id.clone(),
                Ticket {
                    owner,
                    invitation,
                    client,
                    identity,
                    created: Instant::now(),
                },
            );
            Some(id)
        } else {
            None
        };
        Ok(Preview {
            id,
            route,
            expires_at_unix,
            executable,
            executable_sha256,
            data_root,
        })
    })
    .await
    .map_err(error)?
}

#[tauri::command]
pub(super) async fn invitation_handoff(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    preview_id: String,
    confirmed: bool,
) -> Reply<Handoff> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move||{
        if !confirmed{return Err("Review the invitation route and exact client before confirming the handoff".into());}
        let state=app.state::<AppState>();let ticket={let mut invitations=lock(&state.invitations)?;if invitations.tickets.get(&preview_id).is_some_and(|ticket|ticket.owner!=owner){return Err("This invitation preview belongs to another window".into());}invitations.tickets.remove(&preview_id).ok_or("The invitation preview expired or was already used")?};
        if ticket.owner!=owner || ticket.created.elapsed()>=Duration::from_secs(90){return Err("This preview belongs to another window or expired; inspect the invitation again".into());}
        let identity=native_identity(&state,ticket.client)?;
        if identity!=ticket.identity{return Err("The inspected client or content changed after preview; inspect the invitation again".into());}
        let argument=ticket.invitation.argument(ticket.client).map_err(error)?;
        if ticket.client!=InvitationClient::WebOpenCe {
            let identity=identity.ok_or("The inspected native client identity is missing")?;
            let mut command=steam::command(identity.executable.to_string_lossy().as_ref());
            if let Some(parent)=identity.executable.parent(){command.current_dir(parent);}
            if let Some(data_root)=identity.data_root{runtime_workbench::community_data_environment(&mut command,runtime_id(ticket.client).ok_or("Unknown community client")?,&data_root);}
            let child=command.arg(&argument).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|_|"The inspected client could not start; no game connection is confirmed".to_string())?;
            Ok(Handoff{status:"nativeHandoffUnobserved".into(),detail:"Invitation passed to the inspected client. Lobby membership, Halo title, mod identity and gameplay must be verified by that game; Spark has no authenticated connection acknowledgement for this route.".into(),process_id:Some(child.id())})
        }else{
            // The URI is constructed by the strict fixed-origin parser, never a
            // caller-provided executable, scheme, broker or shell command.
            #[cfg(windows)]let mut command=steam::command(identity.as_ref().ok_or("The reviewed Windows browser opener is missing")?.executable.to_string_lossy().as_ref());
            #[cfg(target_os="macos")]let mut command=std::process::Command::new("/usr/bin/open");
            #[cfg(all(not(windows),not(target_os="macos")))]let mut command=std::process::Command::new("/usr/bin/xdg-open");
            command.arg(&argument).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|_|"The default browser could not open the official web client".to_string())?;
            Ok(Handoff{status:"browserHandoffUnobserved".into(),detail:"Opened the official web client. It may download its runtime and requires your own compatible disc/map data in browser storage. No MCC gameplay translation, lobby connection or browser-content validation is claimed.".into(),process_id:None})
        }
    }).await.map_err(error)?
}

pub(super) fn release_window(state: &AppState, label: &str) {
    if let Ok(mut state) = state.invitations.lock() {
        state.tickets.retain(|_, ticket| ticket.owner != label);
    }
}
