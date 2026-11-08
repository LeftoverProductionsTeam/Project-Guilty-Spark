//! Windows implementation of the existing dedicated-host adapter. No service,
//! firewall changes, public listing, arbitrary commands, or engine code import.
use super::*;
use std::{process::Command, thread};
const COPY_LIMIT: u64 = 768 * 1024 * 1024;
const RESERVATION: u64 = 1536 * 1024 * 1024;
const BASE_MAPS: &[&str] = &[
    "ui",
    "beavercreek",
    "bloodgulch",
    "boardingaction",
    "carousel",
    "chillout",
    "damnation",
    "hangemhigh",
    "longest",
    "prisoner",
    "putput",
    "ratrace",
    "sidewinder",
    "wizard",
];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct View {
    id: String,
    phase: String,
    detail: String,
    map: String,
    game_type: String,
    process_id: Option<u32>,
    map_sha256: String,
    server_sha256: String,
    copied_bytes: u64,
    status: Option<host::ServerStatus>,
    restarts: u32,
    source_build_id: Option<String>,
    session_directory: Option<PathBuf>,
    original_inputs_unchanged: Option<bool>,
}
pub(super) struct Session {
    stopping: AtomicBool,
    restart: AtomicBool,
    view: Mutex<View>,
}
impl Session {
    pub(super) fn stop(&self) {
        self.stopping.store(true, Ordering::Relaxed);
    }
}
struct Stage {
    root: PathBuf,
    lease: Option<core::storage::Lease>,
    budget: core::storage::ToolBudget,
    originals: Vec<(PathBuf, String)>,
    map: PathBuf,
}
impl Drop for Stage {
    fn drop(&mut self) {
        if let Some(lease) = self.lease.take() {
            if let Err(problem) = lease.finish_disposable() {
                eprintln!("Private server cleanup pending: {problem}");
            }
        }
    }
}
fn installed(state: &AppState) -> Reply<PathBuf> {
    if !cfg!(all(windows, target_arch = "x86_64")) {
        return Err("The managed dedicated launcher currently supports the verified Windows x64 server. Other hosts can use authenticated status.".into());
    }
    let path: Option<PathBuf> = lock(&state.library)?
        .setting("chupathingyDedicatedServer")
        .map_err(error)?;
    let path=path.ok_or("Download or locate the dedicated server first. The interactive Chupathingy client is a separate program.")?;
    core::reject_links(&path).map_err(error)?;
    if maps::hash_file(&path).map_err(error)?
        != core::runtime_packages::community_server_package().executable_sha256
    {
        return Err(
            "Dedicated executable differs from the reviewed v0.9.0c server; no game was started."
                .into(),
        );
    }
    Ok(path)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Installation {
    installed: bool,
    version: String,
    download_bytes: u64,
    executable: Option<PathBuf>,
}
fn installation(state: &AppState) -> Installation {
    let pin = core::runtime_packages::community_server_package();
    let executable = installed(state).ok();
    Installation {
        installed: executable.is_some(),
        version: pin.version.into(),
        download_bytes: pin.bytes,
        executable,
    }
}
#[tauri::command]
pub(crate) async fn community_server_installation(app: tauri::AppHandle) -> Reply<Installation> {
    tauri::async_runtime::spawn_blocking(move || Ok(installation(&app.state::<AppState>())))
        .await
        .map_err(error)?
}
#[tauri::command]
pub(crate) async fn community_server_install(app: tauri::AppHandle) -> Reply<Installation> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        if !core::runtime_packages::supported_host() {
            return Err("This server package requires Windows x64".into());
        }
        let reg = runtime_registration(&state, runtime::RuntimeId::ChupathingyCe)?;
        let inspected = runtime::inspect_registration(&reg).map_err(error)?;
        if inspected.executable_sha256.as_deref()
            != Some(
                core::runtime_packages::package("chupathingy")
                    .map_err(error)?
                    .executable_sha256,
            )
        {
            return Err("Connect the matching Chupathingy v0.9.0c client first.".into());
        }
        let pin = core::runtime_packages::community_server_package();
        let pending = state
            .map_downloads
            .prepare_engine(map_download::EngineBinding {
                package_id: pin.id.into(),
                dynamic_root: None,
                content_registration_id: Some(reg.id),
                data_root: inspected.data_root,
                content_executable_sha256: inspected.executable_sha256,
            })
            .map_err(error)?;
        let result = (|| {
            let receipt = state
                .map_downloads
                .download(&pending.id, &state.root.join("Inbox/downloads"))
                .map_err(error)?;
            state
                .map_downloads
                .mark_importing(&pending.id)
                .map_err(error)?;
            let package = core::runtime_packages::install(
                &receipt.path,
                pin.id,
                &state.root.join("Runtimes/servers"),
            )
            .map_err(error)?;
            lock(&state.library)?
                .set_setting("chupathingyDedicatedServer", &package.executable)
                .map_err(error)?;
            state
                .map_downloads
                .finish_pack_install(&pending.id, &state.root.join("Inbox/downloads"))
                .map_err(error)?;
            Ok(installation(&state))
        })();
        if result.is_err() {
            let _ = state.map_downloads.mark_import_failed(&pending.id);
        }
        result
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub(crate) async fn community_server_locate(app: tauri::AppHandle) -> Reply<Option<Installation>> {
    let Some(selected) = rfd::AsyncFileDialog::new()
        .set_title("Select Chupathingy v0.9.0c dedicated server")
        .add_filter("Dedicated server", &["exe"])
        .pick_file()
        .await
    else {
        return Ok(None);
    };
    let path = selected.path().to_path_buf();
    tauri::async_runtime::spawn_blocking(move||{
        core::reject_links(&path).map_err(error)?;
        if maps::hash_file(&path).map_err(error)?!=core::runtime_packages::community_server_package().executable_sha256{return Err("This is not the reviewed Windows x64 dedicated executable. Your file was left unchanged.".into());}
        let state=app.state::<AppState>();lock(&state.library)?.set_setting("chupathingyDedicatedServer",&path).map_err(error)?;
        Ok(Some(installation(&state)))
    }).await.map_err(error)?
}
fn active(session: &Session) -> bool {
    session
        .view
        .lock()
        .is_ok_and(|v| !matches!(v.phase.as_str(), "stopped" | "failed"))
}
fn owned(state: &AppState, owner: &str, id: &str) -> Reply<Arc<Session>> {
    lock(&state.community_hosts)?
        .hosts
        .get(owner)
        .filter(|s| s.view.lock().is_ok_and(|v| v.id == id))
        .cloned()
        .ok_or("This dedicated session belongs to another window or is no longer current.".into())
}
fn copy(source: &Path, target: &Path, stage: &mut Stage, total: &mut u64) -> Reply<String> {
    let sha = maps::hash_file(source).map_err(error)?;
    runtime_workbench::rebuild::copy_pin_bounded(source, target, &sha, total, COPY_LIMIT)?;
    stage.originals.push((source.to_owned(), sha.clone()));
    Ok(sha)
}
fn stage(
    state: &AppState,
    request: &host::HostRequest,
    project_id: Option<&str>,
    session: &Session,
    receivers: &str,
) -> Reply<(Stage, host::HostLaunchSpec)> {
    let reg = runtime_registration(state, runtime::RuntimeId::ChupathingyCe)?;
    let source = runtime::inspect_registration(&reg).map_err(error)?;
    if source.executable_sha256.as_deref()
        != Some(
            core::runtime_packages::package("chupathingy")
                .map_err(error)?
                .executable_sha256,
        )
    {
        return Err(
            "Connect the matching Chupathingy v0.9.0c client and its owned Xbox resources first."
                .into(),
        );
    }
    let server = installed(state)?;
    let root = state
        .root
        .join("runtime-servers")
        .join(uuid::Uuid::new_v4().to_string());
    let store = core::storage::Store::for_output(&root).map_err(error)?;
    let lease = store
        .reserve(
            &root,
            Some(&source.data_root),
            RESERVATION,
            core::storage::Category::Staging,
            "Private Windows Chupathingy dedicated acceptance",
        )
        .map_err(error)?;
    fs::create_dir_all(&root).map_err(error)?;
    lease.mark_owned().map_err(error)?;
    let budget = store
        .tool_budget(&root)
        .map_err(error)?
        .ok_or("Missing dedicated staging budget")?;
    let mut stage = Stage {
        root,
        lease: Some(lease),
        budget,
        originals: vec![],
        map: PathBuf::new(),
    };
    for name in [
        "data/maps",
        "data/maps_ce",
        "data/playlists",
        "save",
        "logs",
        "cache",
        "engine",
    ] {
        fs::create_dir_all(stage.root.join(name)).map_err(error)?;
    }
    let mut total = 0;
    let private_exe = stage.root.join("engine/chupathingyce-server.exe");
    copy(&server, &private_exe, &mut stage, &mut total)?;
    for name in BASE_MAPS {
        if session.stopping.load(Ordering::Relaxed) {
            return Err("Dedicated preparation cancelled".into());
        }
        let file = source.data_root.join("maps").join(format!("{name}.map"));
        core::reject_links(&file).map_err(error)?;
        let header = maps::inspect_header(&file).map_err(error)?;
        if header.version != 5
            || header.name != *name
            || header.scenario_type != if *name == "ui" { 2 } else { 1 }
        {
            return Err(format!(
                "The required Xbox base cache {name} has a different native identity."
            ));
        }
        let target = stage.root.join("data/maps").join(format!("{name}.map"));
        copy(&file, &target, &mut stage, &mut total)?;
    }
    let entry = &request.entries[0];
    if let Some(id) = project_id {
        let project = lock(&state.library)?.get(id).map_err(error)?;
        let build = runtime_workbench::rebuild::checked_build(state, &project, None)?;
        let output = build.output.as_ref().ok_or("Build output missing")?;
        let header = maps::inspect_header(output).map_err(error)?;
        if entry.map != format!("{}@ce", header.name) {
            return Err(
                "The host map selector must match the current validated CE build, including @ce."
                    .into(),
            );
        }
        let target = stage
            .root
            .join("data/maps_ce")
            .join(format!("{}.map", header.name));
        let sha = copy(output, &target, &mut stage, &mut total)?;
        stage.map = target;
        let ce = runtime_connections::ce_resource_source(state)?;
        for name in ["bitmaps.map", "sounds.map", "loc.map"] {
            let file = ce.join("maps").join(name);
            let target = stage.root.join("data/maps_ce").join(name);
            copy(&file, &target, &mut stage, &mut total)?;
        }
        // Existing native bank parser checks the actual resource headers; no unrelated bank substitution.
        core::runtime_content::prepare_ce_resources(&stage.root.join("data"), &ce)
            .map_err(error)?;
        let mut view = lock(&session.view)?;
        view.map_sha256 = sha;
        view.source_build_id = Some(build.id);
    } else {
        if !BASE_MAPS.iter().any(|n| *n == entry.map && *n != "ui") {
            return Err(
                "Select an installed Xbox multiplayer map, or use the current validated CE build."
                    .into(),
            );
        }
        stage.map = stage
            .root
            .join("data/maps")
            .join(format!("{}.map", entry.map));
        lock(&session.view)?.map_sha256 = maps::hash_file(&stage.map).map_err(error)?;
    }
    let header = maps::inspect_header(&stage.map).map_err(error)?;
    let sha = maps::hash_file(&stage.map).map_err(error)?;
    let evidence = host::HostInstallationEvidence {
        platform: "windows".into(),
        architecture: "x86_64".into(),
        executable: Some(runtime::process_path(&private_exe).map_err(error)?),
        executable_sha256: Some(maps::hash_file(&private_exe).map_err(error)?),
        server_identity_verified: true,
        network_version: Some(32),
        data_root: Some(runtime::process_path(&stage.root.join("data")).map_err(error)?),
        save_root: Some(runtime::process_path(&stage.root.join("save")).map_err(error)?),
        owned_writable_roots: true,
        base_data_ready: true,
        maps: vec![host::HostMapEvidence {
            selector: entry.map.clone(),
            cache_version: header.version,
            scenario_type: header.scenario_type,
            sha256: sha,
            resources_ready: true,
        }],
    };
    let plan = host::plan_host(request, &evidence).map_err(error)?;
    let mut launch = plan.launch.ok_or_else(|| {
        plan.gates
            .iter()
            .map(|g| g.detail.as_str())
            .collect::<Vec<_>>()
            .join("; ")
    })?;
    // Local QA is not a public or whole-LAN host. Existing games are never stopped.
    launch
        .environment
        .insert("HALO_NET_ADDRESS".into(), "127.0.0.2".into());
    launch
        .environment
        .insert("HALO_NET_BROADCAST".into(), receivers.into());
    launch
        .environment
        .insert("HALO_NET_ANNOUNCE".into(), "32".into());
    launch
        .environment
        .insert("HALO_MOVE_OLD_MAP_FOLDERS".into(), "no".into());
    launch
        .environment
        .insert("HALO_UPDATE_AUTO".into(), "false".into());
    launch
        .environment
        .insert("HALO_CRASH_REPORTS".into(), "no".into());
    launch
        .environment
        .insert("HALO_NET_SHARE_PROFILE".into(), "false".into());
    for (key, dir) in [("HALO_LOG_ROOT", "logs"), ("HALO_CACHE_ROOT", "cache")] {
        launch.environment.insert(
            key.into(),
            runtime::process_path(&stage.root.join(dir))
                .map_err(error)?
                .to_string_lossy()
                .into_owned(),
        );
    }
    let playlist = stage.root.join("data/playlists/spark_private.txt");
    fs::write(
        playlist,
        plan.configuration
            .ok_or("No host configuration")?
            .playlist_text,
    )
    .map_err(error)?;
    stage.budget.check().map_err(error)?;
    {
        let mut view = lock(&session.view)?;
        view.copied_bytes = total;
        view.session_directory = Some(stage.root.clone());
    }
    Ok((stage, launch))
}
fn capture_token(
    mut pipe: impl Read + Send + 'static,
    token: Arc<Mutex<Option<Arc<host::ControlToken>>>>,
) {
    thread::spawn(move || {
        let mut line = Vec::new();
        let mut bytes = [0; 2048];
        loop {
            let Ok(n) = pipe.read(&mut bytes) else { break };
            if n == 0 {
                break;
            }
            for b in &bytes[..n] {
                if *b == b'\n' {
                    if let Ok(text) = std::str::from_utf8(&line) {
                        let value = text.trim();
                        if value.starts_with("chce_") {
                            if let Ok(parsed) = host::ControlToken::new(value) {
                                if let Ok(mut cell) = token.lock() {
                                    *cell = Some(Arc::new(parsed));
                                }
                            }
                        }
                    }
                    line.clear();
                } else if line.len() < 4096 {
                    line.push(*b);
                }
            }
        }
    });
}
fn run(
    app: &tauri::AppHandle,
    owner: &str,
    request: &host::HostRequest,
    project: Option<&str>,
    session: &Session,
    receivers: &str,
) -> Reply<()> {
    let state = app.state::<AppState>();
    let (stage, launch) = stage(&state, request, project, session, receivers)?;
    if session.stopping.load(Ordering::Relaxed) || app.get_webview_window(owner).is_none() {
        return Ok(());
    }
    let target =
        host::ControlTarget::new(runtime::RuntimeId::ChupathingyCe, &request.control_address)
            .map_err(error)?;
    let mut command = Command::new(&launch.executable);
    command
        .current_dir(&launch.working_directory)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (key, _) in std::env::vars_os().filter(|(k, _)| {
        k.to_string_lossy()
            .to_ascii_uppercase()
            .starts_with("HALO_")
    }) {
        command.env_remove(key);
    }
    command.envs(&launch.environment);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    if maps::hash_file(&launch.executable).map_err(error)?
        != core::runtime_packages::community_server_package().executable_sha256
    {
        return Err("Private dedicated executable changed before launch".into());
    }
    let mut process = ce_host_native::OwnedProcess::spawn(&mut command)?;
    let token = Arc::new(Mutex::new(None));
    if let Some(pipe) = process.child.stdout.take() {
        capture_token(pipe, Arc::clone(&token));
    }
    if let Some(pipe) = process.child.stderr.take() {
        capture_token(pipe, Arc::clone(&token));
    }
    {
        let mut view = lock(&session.view)?;
        view.process_id = Some(process.child.id());
        view.phase = "starting".into();
        view.detail =
            "Private dedicated server started; awaiting authenticated native state.".into();
    }
    let began = Instant::now();
    let mut next_poll = Instant::now();
    let mut failure = None;
    while !session.stopping.load(Ordering::Relaxed) && app.get_webview_window(owner).is_some() {
        if let Some(status) = process.child.try_wait().map_err(error)? {
            failure=Some(format!("Dedicated server exited ({status}); the owned session log contains the native diagnostic."));
            break;
        }
        if began.elapsed() > Duration::from_secs(120) && lock(&session.view)?.status.is_none() {
            failure=Some("Dedicated startup did not return authenticated state within 120 seconds; originals were left unchanged.".into());
            break;
        }
        if Instant::now() >= next_poll {
            next_poll = Instant::now() + Duration::from_secs(2);
            stage.budget.check().map_err(error)?;
            let secret = lock(&token)?.clone();
            if let Some(secret) = secret {
                match request_json(
                    &host::read_plan(&target, host::ControlRead::Status),
                    &secret,
                )
                .and_then(|b| host::parse_status(&b).map_err(error))
                {
                    Ok(status) => {
                        if let Err(problem) = host::verify_owned_windows_status(&status) {
                            lock(&session.view)?.status = Some(status);
                            failure = Some(problem.to_string());
                            break;
                        }
                        if session.restart.swap(false, Ordering::Relaxed) {
                            let expected = lock(&session.view)?.map_sha256.clone();
                            if maps::hash_file(&stage.map).map_err(error)? != expected {
                                lock(&session.view)?.detail="Staged cache changed; restart rejected and current game retained.".into();
                            } else {
                                let catalog = host::parse_maps(&request_json(
                                    &host::read_plan(&target, host::ControlRead::Maps),
                                    &secret,
                                )?)
                                .map_err(error)?;
                                let now = chrono::Utc::now().timestamp().max(0) as u64;
                                let guard = host::ControlGuard {
                                    mode: host::HostMode::Multiplayer,
                                    status: status.clone(),
                                    maps: Some(catalog),
                                    observed_at_unix: now,
                                    private_configuration_verified: true,
                                };
                                let change = host::ControlCommand::ChangeMap {
                                    map: request.entries[0].map.clone(),
                                    game_type: request.entries[0].game_type.clone(),
                                };
                                let result = host::command_plan(&target, &change, &guard, now)
                                    .map_err(error)
                                    .and_then(|plan| request_json(&plan, &secret))
                                    .and_then(|bytes| {
                                        host::parse_acknowledgement(&bytes).map_err(error)
                                    });
                                let mut view = lock(&session.view)?;
                                match result {
                                    Ok(ack) if ack.ok => {
                                        view.restarts += 1;
                                        view.detail="Native map restart acknowledged; wait for loaded-map state. Gameplay remains separate.".into();
                                    }
                                    _ => {
                                        view.detail =
                                            "Native restart rejected; current game was retained."
                                                .into()
                                    }
                                }
                            }
                        }
                        let mut view = lock(&session.view)?;
                        if view.status.is_none() {
                            view.detail="Private server authenticated; map identity and native state are shown below.".into();
                        }
                        view.phase = if matches!(status.state, host::ServerState::InGame) {
                            "inGame"
                        } else {
                            "ready"
                        }
                        .into();
                        view.status = Some(status);
                    }
                    Err(problem) => {
                        lock(&session.view)?.detail = problem;
                    }
                }
            }
        }
        thread::sleep(Duration::from_millis(100));
    }
    drop(process);
    let unchanged = stage
        .originals
        .iter()
        .all(|(file, sha)| maps::hash_file(file).is_ok_and(|actual| &actual == sha));
    let mut view = lock(&session.view)?;
    view.original_inputs_unchanged = Some(unchanged);
    view.process_id = None;
    if let Some(problem) = failure {
        view.phase = "failed".into();
        view.detail = problem;
    } else {
        view.phase = "stopped".into();
        view.detail="Owned dedicated session stopped; disposable copies removed. Ordinary hosting is not persistent Extraction or AI Apocalypse acceptance.".into();
    }
    if !unchanged {
        view.phase = "failed".into();
        view.detail="An original input changed independently during the trial; review it before starting another session.".into();
    }
    Ok(())
}
#[tauri::command]
pub(crate) async fn community_server_start(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    request: host::HostRequest,
    project_id: Option<String>,
    client_addresses: Option<Vec<String>>,
) -> Reply<View> {
    let owner = window.label().to_owned();
    let receivers = host::private_client_addresses(
        &client_addresses.unwrap_or_else(|| vec!["127.0.0.3".into()]),
    )
    .map_err(error)?;
    host::plan_host(&request, &Default::default()).map_err(error)?;
    if request.runtime_id != runtime::RuntimeId::ChupathingyCe
        || request.mode != host::HostMode::Multiplayer
        || request.network != host::HostNetwork::Lan
        || request.entries.len() != 1
    {
        return Err("This private dedicated launcher supports one standard multiplayer map. Campaign, AI Apocalypse and persistence need their own verified engine capabilities.".into());
    }
    host::ControlTarget::new(runtime::RuntimeId::ChupathingyCe, &request.control_address)
        .map_err(error)?;
    let socket = std::net::TcpListener::bind(request.control_address.as_str()).map_err(|_| {
        "The control port is already in use; choose another. No existing server was changed."
            .to_string()
    })?;
    drop(socket);
    let view = View {
        id: uuid::Uuid::new_v4().to_string(),
        phase: "preparing".into(),
        detail: "Verifying native content and preparing bounded private copies…".into(),
        map: request.entries[0].map.clone(),
        game_type: request.entries[0].game_type.clone(),
        process_id: None,
        map_sha256: String::new(),
        server_sha256: core::runtime_packages::community_server_package()
            .executable_sha256
            .into(),
        copied_bytes: 0,
        status: None,
        restarts: 0,
        source_build_id: None,
        session_directory: None,
        original_inputs_unchanged: None,
    };
    let session = Arc::new(Session {
        stopping: AtomicBool::new(false),
        restart: AtomicBool::new(false),
        view: Mutex::new(view.clone()),
    });
    {
        let state = app.state::<AppState>();
        let mut hosts = lock(&state.community_hosts)?;
        if hosts.hosts.values().any(|s| active(s)) {
            return Err("Stop Spark's current dedicated trial before starting another; existing games are left alone.".into());
        }
        if app.get_webview_window(&owner).is_none() {
            return Err("Requesting window closed".into());
        }
        hosts.hosts.insert(owner.clone(), Arc::clone(&session));
    }
    thread::spawn(move || {
        if let Err(problem) = run(
            &app,
            &owner,
            &request,
            project_id.as_deref(),
            &session,
            &receivers,
        ) {
            if let Ok(mut view) = session.view.lock() {
                view.phase = "failed".into();
                view.process_id = None;
                view.detail = problem;
            }
        }
    });
    Ok(view)
}
#[tauri::command]
pub(crate) async fn community_server_status(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Reply<Option<View>> {
    let state = app.state::<AppState>();
    let value = lock(&state.community_hosts)?
        .hosts
        .get(window.label())
        .cloned();
    value.map(|s| Ok(lock(&s.view)?.clone())).transpose()
}
#[tauri::command]
pub(crate) async fn community_server_action(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: String,
    action: String,
) -> Reply<()> {
    let state = app.state::<AppState>();
    let session = owned(&state, window.label(), &id)?;
    match action.as_str() {
        "stop" => session.stop(),
        "restart" => {
            if !session
                .view
                .lock()
                .is_ok_and(|v| matches!(v.phase.as_str(), "ready" | "inGame"))
            {
                return Err(
                    "Wait for authenticated server state before restarting the map.".into(),
                );
            }
            session.restart.store(true, Ordering::Relaxed);
        }
        _ => return Err("Unsupported dedicated action".into()),
    };
    Ok(())
}
