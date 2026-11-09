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
    project_id: Option<String>,
    source_fingerprint: Option<String>,
    compiled_build_id: Option<String>,
    compiled_sha256: Option<String>,
    game_build_id: Option<String>,
    game_sha256: Option<String>,
    pending_job_id: Option<String>,
    error: Option<String>,
}
pub(super) struct Session {
    stopping: AtomicBool,
    restart: AtomicBool,
    pending: Mutex<Option<runtime_workbench::rebuild::Pending>>,
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
    map_sha256: String,
    build_id: Option<String>,
    copied_bytes: u64,
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
fn copy_pinned(source: &Path, target: &Path, sha: &str, stage: &mut Stage, total: &mut u64) -> Reply<()> {
    runtime_workbench::rebuild::copy_pin_bounded(source, target, sha, total, COPY_LIMIT)?;
    stage.originals.push((source.to_owned(), sha.to_owned()));
    Ok(())
}
fn copy(source: &Path, target: &Path, stage: &mut Stage, total: &mut u64) -> Reply<String> {
    let sha = maps::hash_file(source).map_err(error)?;
    copy_pinned(source, target, &sha, stage, total)?;
    Ok(sha)
}
fn stage(
    state: &AppState,
    request: &host::HostRequest,
    project_id: Option<&str>,
    session: &Session,
    receivers: &str,
    build_id: Option<&str>,
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
    let entry = &request.entries[0];
    // A failed/stale native build must be rejected before reserving storage or
    // copying the required stock caches. Keep the exact verified map hash for
    // the later copy rather than admitting bytes that changed after validation.
    let prepared_build = if let Some(id) = project_id {
        let project = lock(&state.library)?.get(id).map_err(error)?;
        let build = runtime_workbench::rebuild::checked_build(state, &project, build_id)?;
        let output = build.output.as_ref().ok_or("Build output missing")?;
        let header = maps::inspect_header(output).map_err(error)?;
        if entry.map != format!("{}@ce", header.name) {
            return Err("The host map selector must match the current validated CE build, including @ce.".into());
        }
        Some((build, header.name))
    } else {
        if !BASE_MAPS.iter().any(|n| *n == entry.map && *n != "ui") {
            return Err("Select an installed Xbox multiplayer map, or use the current validated CE build.".into());
        }
        None
    };
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
        map_sha256: String::new(),
        build_id: None,
        copied_bytes: 0,
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
    if let Some((build, map_name)) = prepared_build {
        let output = build.output.as_ref().ok_or("Build output missing")?;
        let sha = build.sha256.as_ref().ok_or("Validated native build hash is missing")?;
        let target = stage.root.join("data/maps_ce").join(format!("{map_name}.map"));
        copy_pinned(output, &target, sha, &mut stage, &mut total)?;
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
        stage.map_sha256 = sha.clone();
        stage.build_id = Some(build.id);
    } else {
        stage.map = stage
            .root
            .join("data/maps")
            .join(format!("{}.map", entry.map));
        stage.map_sha256 = maps::hash_file(&stage.map).map_err(error)?;
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
    stage.copied_bytes = total;
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
// A complete candidate is checked before the previous owned child is stopped.
// Stages remain immutable: clients must acquire the matching map and rejoin.
struct Running {
    process: ce_host_native::OwnedProcess,
    stage: Stage,
    launch: host::HostLaunchSpec,
    token: Arc<Mutex<Option<Arc<host::ControlToken>>>>,
    started: Instant,
}
fn prepared_command(stage: &Stage, launch: &host::HostLaunchSpec) -> Reply<Command> {
    stage.budget.check().map_err(error)?;
    if maps::hash_file(&stage.map).map_err(error)? != stage.map_sha256 {
        return Err("Private cache changed before restart; the running game was left alone".into());
    }
    if maps::hash_file(&launch.executable).map_err(error)?
        != core::runtime_packages::community_server_package().executable_sha256 {
        return Err("Private dedicated executable changed before launch".into());
    }
    let mut command=Command::new(&launch.executable);
    command.args(&launch.arguments).current_dir(&launch.working_directory).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    for (key, _) in std::env::vars_os().filter(|(k,_)|k.to_string_lossy().to_ascii_uppercase().starts_with("HALO_")) {
        command.env_remove(key);
    }
    command.envs(&launch.environment);
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    Ok(command)
}
fn launch_prepared(stage: Stage, launch: host::HostLaunchSpec, mut command: Command) -> Reply<Running> {
    let mut process=ce_host_native::OwnedProcess::spawn(&mut command)?;
    let token=Arc::new(Mutex::new(None));
    if let Some(pipe)=process.child.stdout.take(){capture_token(pipe,Arc::clone(&token));}
    if let Some(pipe)=process.child.stderr.take(){capture_token(pipe,Arc::clone(&token));}
    Ok(Running{process,stage,launch,token,started:Instant::now()})
}
// The pinned engine rebuilds these six Z-drive map-cache slots. Other Z
// files include checkpoints/profile selection and must remain intact. No engine
// implementation is copied here; see the pinned source references in the report.
fn retire_stopped_map_caches(stage: &Stage) -> Reply<u64> {
    let root=stage.lease.as_ref().ok_or("Missing private staging owner")?
        .owned_staging_root().map_err(error)?;
    let map=fs::canonicalize(&stage.map).map_err(error)?;
    let mut files=Vec::new();
    for index in 0..6 {
        let file=root.join("save/z").join(format!("cache{index:03}.map"));
        let metadata=match fs::symlink_metadata(&file) {
            Ok(metadata)=>metadata,
            Err(problem) if problem.kind()==std::io::ErrorKind::NotFound=>continue,
            Err(problem)=>return Err(error(problem)),
        };
        core::reject_links(&file).map_err(error)?;
        let file=fs::canonicalize(&file).map_err(error)?;
        if !metadata.is_file() || !file.starts_with(&root) || file==map
            || stage.originals.iter().any(|(input,_)|fs::canonicalize(input).is_ok_and(|input|input==file)) {
            return Err("A stopped map-cache slot is not disposable private output".into());
        }
        let sha=maps::hash_file(&file).map_err(error)?;
        files.push((file,sha,metadata.len()));
    }
    // Validate the whole bounded set before removing the first file.
    for (file,sha,_) in &files {
        core::reject_links(file).map_err(error)?;
        if !fs::symlink_metadata(file).map_err(error)?.is_file()
            || maps::hash_file(file).map_err(error)?!=*sha {
            return Err("Stopped map cache changed during retirement; retained".into());
        }
    }
    let mut removed=0;
    for (file,_,bytes) in files {fs::remove_file(file).map_err(error)?;removed+=bytes;}
    Ok(removed)
}
fn stop_owned(run: Running) -> (Stage, host::HostLaunchSpec) {
    let Running{process,stage,launch,..}=run;
    drop(process); // Kill-on-owner-exit guard waits; never enumerate unrelated games.
    match retire_stopped_map_caches(&stage) {
        Ok(bytes)=>eprintln!("Retired {bytes} logical bytes of stopped private map cache"),
        Err(problem)=>eprintln!("Stopped private cache retirement deferred: {problem}"),
    }
    (stage,launch)
}
fn publish_running(session: &Session, run: &Running) -> Reply<()> {
    let mut view=lock(&session.view)?;
    view.process_id=Some(run.process.child.id());view.phase="starting".into();view.status=None;
    view.map_sha256=run.stage.map_sha256.clone();view.source_build_id=run.stage.build_id.clone();
    view.session_directory=Some(run.stage.root.clone());view.copied_bytes=run.stage.copied_bytes;
    if view.compiled_build_id.is_none(){view.compiled_build_id=run.stage.build_id.clone();view.compiled_sha256=Some(run.stage.map_sha256.clone());}
    view.game_build_id=None;view.game_sha256=None;
    view.detail="Private dedicated process started with the checked cache; awaiting authenticated loaded-map state. Matching clients must rejoin.".into();
    Ok(())
}
// Staged and compiled identities survive a round ending, but an active-game
// confirmation must follow every authenticated status, including postgame.
fn confirmed_game_revision(
    stage: &Stage,
    expected_map: &str,
    state: host::ServerState,
    observed_map: &str,
) -> (Option<String>, Option<String>) {
    if state == host::ServerState::InGame && observed_map == expected_map {
        (stage.build_id.clone(), Some(stage.map_sha256.clone()))
    } else {
        (None, None)
    }
}
fn run(
    app: &tauri::AppHandle,
    owner: &str,
    request: &host::HostRequest,
    project_id: Option<&str>,
    session: &Session,
    receivers: &str,
) -> Reply<()> {
    let state=app.state::<AppState>();
    let registration=runtime_registration(&state,runtime::RuntimeId::ChupathingyCe)?;
    let (staged,launch)=stage(&state,request,project_id,session,receivers,None)?;
    let mut original_pins=staged.originals.clone();
    let command=prepared_command(&staged,&launch)?;
    if session.stopping.load(Ordering::Relaxed)||app.get_webview_window(owner).is_none(){return Ok(());}
    let mut running=launch_prepared(staged,launch,command)?;
    publish_running(session,&running)?;
    let target=host::ControlTarget::new(runtime::RuntimeId::ChupathingyCe,&request.control_address).map_err(error)?;
    let lifetime=Instant::now();let mut next_poll=Instant::now();let mut failure=None;
    // At most one previous stage is retained for rollback, never an SDK/history warehouse.
    let mut previous: Option<(Stage,host::HostLaunchSpec)>=None;
    loop {
        if session.stopping.load(Ordering::Relaxed)||app.get_webview_window(owner).is_none(){break;}
        if lifetime.elapsed()>Duration::from_secs(8*60*60){failure=Some("Private dedicated trial reached its eight-hour lifetime".into());break;}
        let exited=running.process.child.try_wait().map_err(error)?;
        let startup_expired=running.started.elapsed()>Duration::from_secs(120)&&lock(&session.view)?.status.is_none();
        if exited.is_some()||startup_expired {
            let problem=exited.map(|status|format!("Dedicated server exited ({status})")).unwrap_or_else(||"Dedicated startup did not authenticate within 120 seconds".into());
            if let Some((old,launch))=previous.take() {
                let command=prepared_command(&old,&launch)?;
                drop(stop_owned(running));
                running=launch_prepared(old,launch,command)?;
                publish_running(session,&running)?;
                let mut view=lock(&session.view)?;
                view.error=Some(format!("{problem}; restarted only the retained previous-good private stage. Clients must rejoin."));
                next_poll=Instant::now();
                continue;
            }
            failure=Some(problem);break;
        }
        let pending={let mut pending=lock(&session.pending)?;
            if pending.as_ref().is_some_and(|p|!lock(&state.jobs).is_ok_and(|jobs|jobs.contains_key(&p.job_id))){pending.take()}else{None}
        };
        if let Some(pending)=pending {
            let candidate=(||{
                let id=project_id.ok_or("This session has no saved native project")?;
                check_document_owner(&state,id,owner)?;
                let current=lock(&state.library)?.get(id).map_err(error)?;
                if current.fingerprint().map_err(error)?!=pending.fingerprint{return Err("Source changed during compilation; the running revision was kept. Save and rebuild the latest source.".into());}
                let reg=runtime_registration(&state,runtime::RuntimeId::ChupathingyCe)?;
                if reg.id!=registration.id||reg.root!=registration.root||reg.executable!=registration.executable||reg.data_root!=registration.data_root{
                    return Err("Runtime profile changed during compilation; the existing session was retained".into());
                }
                let (staged,launch)=stage(&state,request,Some(id),session,receivers,Some(&pending.job_id))?;
                let command=prepared_command(&staged,&launch)?;
                let after=runtime_registration(&state,runtime::RuntimeId::ChupathingyCe)?;
                if after.id!=registration.id||after.root!=registration.root||after.executable!=registration.executable||after.data_root!=registration.data_root {
                    return Err("Runtime profile changed while staging; the existing session was kept".into());
                }
                // Source/owner may change during native inspection and bounded copying.
                check_document_owner(&state,id,owner)?;
                if lock(&state.library)?.get(id).map_err(error)?.fingerprint().map_err(error)?!=pending.fingerprint {
                    return Err("Source changed while preparing the replacement; the running map was kept".into());
                }
                if session.stopping.load(Ordering::Relaxed)||app.get_webview_window(owner).is_none(){return Err("Session stopped before adoption".into());}
                Ok::<_,String>((staged,launch,command))
            })();
            lock(&session.view)?.pending_job_id=None;
            match candidate {
                Err(problem)=>{
                    let mut view=lock(&session.view)?;view.error=Some(problem);
                    view.detail="Live Rebuild did not adopt an output. The existing server, map and round were retained; inspect Build & playtest for the compiler diagnostic.".into();
                }
                Ok((staged,launch,command))=>{
                    original_pins.extend(staged.originals.iter().cloned());
                    {let mut view=lock(&session.view)?;view.compiled_build_id=staged.build_id.clone();view.compiled_sha256=Some(staged.map_sha256.clone());}
                    // Only after all native/source/storage checks have succeeded.
                    let old=stop_owned(running);
                    match launch_prepared(staged,launch,command) {
                        Ok(next)=>{
                            previous=Some(old);running=next;publish_running(session,&running)?;
                            let mut view=lock(&session.view)?;view.restarts+=1;view.error=None;
                        }
                        Err(problem)=>{
                            let (old,launch)=old;let command=prepared_command(&old,&launch)?;
                            running=launch_prepared(old,launch,command)?;publish_running(session,&running)?;
                            lock(&session.view)?.error=Some(format!("Replacement could not start: {problem}. Previous-good private stage restarted; clients must rejoin."));
                        }
                    }
                    next_poll=Instant::now();
                }
            }
        }
        if Instant::now()>=next_poll {
            next_poll=Instant::now()+Duration::from_secs(2);
            running.stage.budget.check().map_err(error)?;
            let secret=lock(&running.token)?.clone();
            if let Some(secret)=secret {
                match request_json(&host::read_plan(&target,host::ControlRead::Status),&secret).and_then(|b|host::parse_status(&b).map_err(error)) {
                    Ok(status)=>{
                        if let Err(problem)=host::verify_owned_windows_status(&status){failure=Some(problem.to_string());break;}
                        if session.restart.swap(false,Ordering::Relaxed) {
                            if maps::hash_file(&running.stage.map).map_err(error)?!=running.stage.map_sha256 {
                                lock(&session.view)?.detail="Staged cache changed; restart rejected and current game retained.".into();
                            }else{
                                let catalog=host::parse_maps(&request_json(&host::read_plan(&target,host::ControlRead::Maps),&secret)?).map_err(error)?;
                                let now=chrono::Utc::now().timestamp().max(0) as u64;
                                let guard=host::ControlGuard{mode:host::HostMode::Multiplayer,status:status.clone(),maps:Some(catalog),observed_at_unix:now,private_configuration_verified:true};
                                let change=host::ControlCommand::ChangeMap{map:request.entries[0].map.clone(),game_type:request.entries[0].game_type.clone()};
                                let result=host::command_plan(&target,&change,&guard,now).map_err(error).and_then(|plan|request_json(&plan,&secret)).and_then(|bytes|host::parse_acknowledgement(&bytes).map_err(error));
                                let mut view=lock(&session.view)?;
                                match result {
                                    Ok(ack) if ack.ok=>{view.restarts+=1;view.detail="Native map restart acknowledged; wait for loaded-map state. Gameplay remains separate.".into();}
                                    _=>view.detail="Native restart rejected; current game was retained.".into(),
                                }
                            }
                        }
                        let mut view=lock(&session.view)?;
                        if view.status.is_none(){view.detail="Private server authenticated; loaded-map identity and native state are shown below.".into();}
                        view.phase=if matches!(status.state,host::ServerState::InGame){"inGame"}else{"ready"}.into();
                        (view.game_build_id, view.game_sha256) = confirmed_game_revision(
                            &running.stage, &request.entries[0].map, status.state, &status.map,
                        );
                        view.status=Some(status);
                    }
                    Err(problem)=>lock(&session.view)?.detail=problem,
                }
            }
        }
        thread::sleep(Duration::from_millis(100));
    }
    drop(stop_owned(running));drop(previous);
    let unchanged=original_pins.iter().all(|(file,sha)|maps::hash_file(file).is_ok_and(|actual|&actual==sha));
    let mut view=lock(&session.view)?;
    view.original_inputs_unchanged=Some(unchanged);view.process_id=None;view.game_build_id=None;view.game_sha256=None;view.pending_job_id=None;
    if let Some(problem)=failure{view.phase="failed".into();view.detail=problem;}else{
        view.phase="stopped".into();view.detail="Owned dedicated session stopped; disposable copies removed. Ordinary hosting is not persistent Extraction or AI Apocalypse acceptance.".into();
    }
    if !unchanged{view.phase="failed".into();view.detail="An original input changed independently during the trial; review it before starting another session.".into();}
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
        project_id: project_id.clone(),
        source_fingerprint: project_id.as_ref().map(|id|lock(&app.state::<AppState>().library)?.get(id).map_err(error)?.fingerprint().map_err(error)).transpose()?,
        compiled_build_id: None, compiled_sha256: None, game_build_id: None, game_sha256: None,
        pending_job_id: None, error: None,
    };
    let session = Arc::new(Session {
        stopping: AtomicBool::new(false),
        restart: AtomicBool::new(false),
        pending: Mutex::new(None),
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
    value.map(|s| {
        let mut view=lock(&s.view)?.clone();
        if let Some(id)=&view.project_id{view.source_fingerprint=Some(lock(&state.library)?.get(id).map_err(error)?.fingerprint().map_err(error)?);}
        Ok(view)
    }).transpose()
}
#[tauri::command]
pub(crate) async fn community_server_action(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: String,
    action: String,
    project_id: Option<String>,
    confirmed_restart: Option<bool>,
) -> Reply<()> {
    tauri::async_runtime::spawn_blocking(move||{
    let state = app.state::<AppState>();
    let session = owned(&state, window.label(), &id)?;
    match action.as_str() {
        "stop" => session.stop(),
        "rebuild" => {
            if confirmed_restart!=Some(true){return Err("Confirm that Live Rebuild resets the private dedicated round and clients must rejoin".into());}
            if project_id.is_none()||lock(&session.view)?.project_id!=project_id{return Err("Return to the saved project owning this dedicated session before rebuilding".into());}
            let mut pending=lock(&session.pending)?;
            if pending.is_some()||lock(&session.view)?.pending_job_id.is_some()||session.stopping.load(Ordering::Relaxed)||!matches!(lock(&session.view)?.phase.as_str(),"ready"|"inGame"){
                return Err("Wait for the current build and authenticated server state before rebuilding".into());
            }
            let next=runtime_workbench::rebuild::begin_saved_build(&app,window.label(),project_id.as_deref().unwrap())?;
            let mut view=lock(&session.view)?;view.pending_job_id=Some(next.job_id.clone());view.source_fingerprint=Some(next.fingerprint.clone());
            view.error=None;view.detail="Compiling saved source while the current dedicated round continues. Only matching validated output can restart this private server.".into();
            *pending=Some(next);
        }
        "restart" => {
            if lock(&session.pending)?.is_some()||lock(&session.view)?.pending_job_id.is_some(){return Err("Wait for Live Rebuild before restarting the map".into());}
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
    }).await.map_err(error)?
}

#[cfg(test)]
mod stopped_cache_tests {
    use super::*;
    fn staged(parent:&Path)->Stage {
        let root=parent.join("private-server");let store=core::storage::Store::for_output(&root).unwrap();
        let lease=store.reserve(&root,None,RESERVATION,core::storage::Category::Staging,"stopped dedicated cache regression").unwrap();
        fs::create_dir_all(root.join("save/z")).unwrap();fs::create_dir_all(root.join("data/maps_ce")).unwrap();lease.mark_owned().unwrap();
        let map=root.join("data/maps_ce/previous.map");fs::write(&map,b"previous-good native map").unwrap();
        let budget=store.tool_budget(&root).unwrap().unwrap();
        Stage{root,budget,lease:Some(lease),originals:vec![],map,map_sha256:String::new(),build_id:None,copied_bytes:0}
    }
    #[test]
    fn game_confirmation_tracks_current_native_state_without_discarding_the_staged_revision() {
        let temp=tempfile::tempdir().unwrap();let mut stage=staged(temp.path());
        stage.map_sha256=maps::hash_file(&stage.map).unwrap();stage.build_id=Some("validated-build".into());
        let pinned_hash=stage.map_sha256.clone();let pinned_build=stage.build_id.clone();
        assert_eq!(confirmed_game_revision(&stage,"previous",host::ServerState::InGame,"previous"),
            (pinned_build.clone(),Some(pinned_hash.clone())));
        for state in [host::ServerState::Starting,host::ServerState::Lobby,host::ServerState::Loading,host::ServerState::Postgame] {
            assert_eq!(confirmed_game_revision(&stage,"previous",state,"previous"),(None,None));
        }
        assert_eq!(confirmed_game_revision(&stage,"previous",host::ServerState::InGame,"another-map"),(None,None));
        assert_eq!(stage.build_id,pinned_build);assert_eq!(stage.map_sha256,pinned_hash);
        assert_eq!(maps::hash_file(&stage.map).unwrap(),pinned_hash);
        // A subsequent matching round confirms the same immutable map again.
        assert_eq!(confirmed_game_revision(&stage,"previous",host::ServerState::InGame,"previous"),
            (pinned_build,Some(pinned_hash)));
    }
    #[test]
    fn native_build_copy_requires_the_previously_validated_hash() {
        let temp=tempfile::tempdir().unwrap();let mut stage=staged(temp.path());
        let source=temp.path().join("validated-input.map");fs::write(&source,b"validated bytes").unwrap();
        let expected=maps::hash_file(&source).unwrap();fs::write(&source,b"changed after native validation").unwrap();
        let target=stage.root.join("data/maps_ce/replacement.map");let mut total=0;
        assert!(copy_pinned(&source,&target,&expected,&mut stage,&mut total).is_err());
        assert!(!target.exists());assert!(stage.originals.is_empty());
        assert_eq!(fs::read(&source).unwrap(),b"changed after native validation");
        assert_eq!(fs::read(&stage.map).unwrap(),b"previous-good native map");
        fs::write(&source,b"validated bytes").unwrap();
        copy_pinned(&source,&target,&expected,&mut stage,&mut total).unwrap();
        assert_eq!(maps::hash_file(&target).unwrap(),expected);
        assert_eq!(stage.originals,vec![(source,expected)]);
    }
    #[test]
    fn stopped_cache_retirement_keeps_map_checkpoints_profiles_and_other_files() {
        let temp=tempfile::tempdir().unwrap();let stage=staged(temp.path());
        for index in 0..6 {fs::write(stage.root.join(format!("save/z/cache{index:03}.map")),b"rebuilt cache").unwrap();}
        for name in ["save/z/savegame.bin","save/z/lastprof.txt","save/z/cache006.map","save/z/custom.map","save/profile"] {fs::write(stage.root.join(name),b"keep authored or saved data").unwrap();}
        let before=maps::hash_file(&stage.map).unwrap();assert_eq!(retire_stopped_map_caches(&stage).unwrap(),6*13);
        for index in 0..6 {assert!(!stage.root.join(format!("save/z/cache{index:03}.map")).exists());}
        for name in ["save/z/savegame.bin","save/z/lastprof.txt","save/z/cache006.map","save/z/custom.map","save/profile"] {assert_eq!(fs::read(stage.root.join(name)).unwrap(),b"keep authored or saved data");}
        assert_eq!(maps::hash_file(&stage.map).unwrap(),before);assert_eq!(retire_stopped_map_caches(&stage).unwrap(),0);
    }
    #[test]
    fn unexpected_cache_slots_or_source_references_refuse_before_any_deletion() {
        let temp=tempfile::tempdir().unwrap();let mut stage=staged(temp.path());let first=stage.root.join("save/z/cache000.map");fs::write(&first,b"retain until full preflight").unwrap();
        let unexpected=stage.root.join("save/z/cache005.map");fs::create_dir(&unexpected).unwrap();assert!(retire_stopped_map_caches(&stage).is_err());assert!(first.exists());fs::remove_dir(&unexpected).unwrap();
        stage.originals.push((first.clone(),maps::hash_file(&first).unwrap()));assert!(retire_stopped_map_caches(&stage).is_err());assert_eq!(fs::read(first).unwrap(),b"retain until full preflight");
    }
}
