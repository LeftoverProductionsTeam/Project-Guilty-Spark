//! Native rebuild/restart for a window-owned private playtest, not live BSP writes.
//! Reuses the Workbench registry, native compilers, verified builds and storage ledger.
use super::*;
use std::io::Write;

const RESERVATION: u64 = 1536 * 1024 * 1024;
const COPY_LIMIT: u64 = 512 * 1024 * 1024;
const RUNTIME_ROOTS: [(&str, &str); 4] = [
    ("HALO_DATA_ROOT", "data"), ("HALO_SAVE_ROOT", "save"),
    ("HALO_LOG_ROOT", "logs"), ("HALO_CACHE_ROOT", "cache"),
];
fn prepare_runtime_roots(root: &Path) -> Reply<()> {
    // process_path validates an existing directory's Windows filesystem identity.
    // Create only this owned stage's roots before asking the engine to use them.
    for (_, folder) in RUNTIME_ROOTS {
        let directory = root.join(folder);
        core::reject_links(&directory).map_err(error)?;
        fs::create_dir_all(&directory).map_err(|problem|format!("Cannot prepare private {folder} directory: {problem}"))?;
        runtime::process_path(&directory).map_err(|problem|format!("Cannot validate private {folder} directory: {problem}"))?;
    }
    Ok(())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct View {
    id: String,
    project_id: String,
    phase: String,
    source_fingerprint: String,
    compiled_build_id: String,
    compiled_sha256: String,
    game_build_id: Option<String>,
    game_sha256: Option<String>,
    process_id: Option<u32>,
    pending_job_id: Option<String>,
    detail: String,
    error: Option<String>,
    console_tail: String,
    ce_resource_sha256: std::collections::BTreeMap<String,String>,
}
struct Pending { job_id: String, fingerprint: String }
pub(super) struct Session {
    view: Mutex<View>,
    pending: Mutex<Option<Pending>>,
    stopping: AtomicBool,
}
impl Session {
    pub(super) fn stop(&self) { self.stopping.store(true, Ordering::Relaxed); }
}
struct Stage {
    root: PathBuf,
    lease: Option<core::storage::Lease>,
    budget: core::storage::ToolBudget,
    build: BuildRecord,
    map: String,
    ce_resource_sha256: std::collections::BTreeMap<String,String>,
}
impl Drop for Stage {
    fn drop(&mut self) {
        if let Some(lease) = self.lease.take() {
            if let Err(problem) = lease.finish_disposable() { eprintln!("Playtest cleanup pending: {problem}"); }
        }
    }
}
struct Running {
    process: ce_host_native::OwnedProcess,
    stage: Stage,
    tail: Arc<Mutex<Vec<u8>>>,
    started: Instant,
}
impl Running {
    fn close(&mut self) {
        if self.process.child.try_wait().ok().flatten().is_some() { return; }
        #[cfg(windows)]
        {
            // Only windows owned by this Child are sent the standard close event.
            use windows_sys::Win32::{Foundation::{HWND, LPARAM}, UI::WindowsAndMessaging::*};
            unsafe extern "system" fn close_window(window: HWND, pid: LPARAM) -> i32 {
                let mut owner = 0;
                GetWindowThreadProcessId(window, &mut owner);
                if owner == pid as u32 { PostMessageW(window, WM_CLOSE, 0, 0); }
                1
            }
            unsafe { EnumWindows(Some(close_window), self.process.child.id() as LPARAM); }
            for _ in 0..30 {
                if self.process.child.try_wait().ok().flatten().is_some() { return; }
                std::thread::sleep(Duration::from_millis(100));
            }
        }
        let _ = self.process.child.kill();
        let _ = self.process.child.wait();
    }
}
impl Drop for Running { fn drop(&mut self) { self.close(); } }

fn registration(state: &AppState) -> Reply<runtime::RuntimeRegistration> {
    if !cfg!(all(windows, target_arch="x86_64")) { return Err("Live Rebuild currently supports the verified Windows x64 Chupathingy playtest adapter".into()); }
    let registration = runtime_registration(state, runtime::RuntimeId::ChupathingyCe)?;
    let installed = runtime::inspect_registration(&registration).map_err(error)?;
    let pin = core::runtime_packages::package("chupathingy").map_err(error)?;
    if installed.executable_sha256.as_deref() != Some(pin.executable_sha256) {
        return Err(format!("Live Rebuild requires the reviewed Chupathingy {} executable; this build has no validated restart adapter", pin.version));
    }
    Ok(registration)
}
fn checked_build(state: &AppState, project: &Project, build_id: Option<&str>) -> Reply<BuildRecord> {
    let build = if let Some(id) = build_id { verified_build(state, project, id)? } else { current_build(state, project)? };
    if build.target != "gbx-custom" { return Err("Build the saved project as standard Custom Edition content for Chupathingy first".into()); }
    let output = build.output.as_ref().ok_or("Validated native output is missing")?;
    let inspection = maps::inspect_map(output, None).map_err(error)?;
    let header = &inspection.header;
    if header.version != 609 || header.scenario_type != 1 || header.extended
        || !core::ce_host::map_selector(&header.name)
        || output.file_stem().and_then(|n|n.to_str()) != Some(header.name.as_str()) {
        return Err("Live Rebuild needs a standard version-609 multiplayer cache with its native filename; no header rewriting is performed".into());
    }
    if inspection.resources.iter().any(|r|r.required) || inspection.tags.iter().any(|t|t.external) {
        return Err("This playtest needs a self-contained CE build. Rebuild with native embedded resources; no unrelated bitmap/sound bank is substituted".into());
    }
    if build.sha256.as_deref() != Some(inspection.sha256.as_str()) { return Err("Native output changed during inspection; the running game was left alone".into()); }
    Ok(build)
}
fn copy_pin(source: &Path, target: &Path, expected: &str, total: &mut u64) -> Reply<()> {
    core::reject_links(source).map_err(error)?;
    core::reject_links(target).map_err(error)?;
    let size = fs::metadata(source).map_err(error)?.len();
    *total = total.checked_add(size).ok_or("Playtest copy size overflow")?;
    if *total > COPY_LIMIT { return Err("Playtest inputs exceed 512 MiB; originals were not changed".into()); }
    if maps::hash_file(source).map_err(error)? != expected { return Err("Playtest input changed before staging".into()); }
    fs::create_dir_all(target.parent().ok_or("Missing playtest parent")?).map_err(error)?;
    let mut input = fs::File::open(source).map_err(error)?;
    let mut out = fs::OpenOptions::new().write(true).create_new(true).open(target).map_err(error)?;
    let copied = std::io::copy(&mut std::io::Read::by_ref(&mut input).take(size + 1), &mut out).map_err(error)?;
    out.flush().map_err(error)?; out.sync_all().map_err(error)?; drop(out);
    if copied != size || maps::hash_file(target).map_err(error)? != expected || maps::hash_file(source).map_err(error)? != expected {
        return Err("Playtest copy failed identity readback; originals and previous-good build were retained".into());
    }
    Ok(())
}
fn stage(state: &AppState, reg: &runtime::RuntimeRegistration, build: BuildRecord) -> Reply<Stage> {
    let installed = runtime::inspect_registration(reg).map_err(error)?;
    let output = build.output.as_ref().ok_or("Build output is missing")?;
    let header = maps::inspect_header(output).map_err(error)?;
    let root = state.root.join("runtime-playtests").join(uuid::Uuid::new_v4().to_string());
    let store = core::storage::Store::for_output(&root).map_err(error)?;
    let lease = store.reserve(&root, Some(&installed.data_root), RESERVATION, core::storage::Category::Staging, "Bounded Chupathingy native rebuild/playtest").map_err(error)?;
    fs::create_dir_all(&root).map_err(error)?;
    lease.mark_owned().map_err(error)?;
    let budget = store.tool_budget(&root).map_err(error)?.ok_or("Missing playtest storage owner")?;
    let mut result = Stage { root, lease: Some(lease), budget, build: build.clone(), map: header.name.clone(), ce_resource_sha256: Default::default() };
    prepare_runtime_roots(&result.root)?;
    let mut total = 0;
    let engine_source=installed.executable.as_deref().and_then(Path::parent).ok_or("Runtime executable has no package folder")?;
    for &(name,sha,size) in core::runtime_packages::chupathingy_playtest_members() {
        let source=engine_source.join(name);
        if fs::metadata(&source).map_err(|problem|format!("Chupathingy package member {name} is missing: {problem}"))?.len()!=size {
            return Err(format!("Chupathingy package member {name} differs from the reviewed release; reconnect the correct package"));
        }
        copy_pin(&source,&result.root.join("engine").join(name),sha,&mut total).map_err(|problem|format!("Chupathingy package member {name}: {problem}"))?;
    }
    for name in ["ui.map", "carousel.map"] {
        let file = installed.data_root.join("maps").join(name);
        if name == "carousel.map" && !file.try_exists().map_err(error)? { continue; }
        core::reject_links(&file).map_err(error)?;
        if maps::inspect_header(&file).map_err(error)?.version != 5 { return Err("Connect the matching Xbox UI assets for Chupathingy; CE/MCC UI cannot substitute".into()); }
        copy_pin(&file, &result.root.join("data/maps").join(name), &maps::hash_file(&file).map_err(error)?, &mut total)?;
    }
    copy_pin(output, &result.root.join("data/maps_ce").join(format!("{}.map", header.name)), build.sha256.as_deref().ok_or("Build has no SHA-256")?, &mut total)?;
    // Chupathingy requires CE banks even when the selected map embeds its own
    // tag payloads. Reuse the existing validated CE-bank preparation, always
    // into this disposable data root and never into the original installation.
    let ce=runtime_connections::ce_resource_source(state)?;
    for name in ["bitmaps.map","sounds.map","loc.map"] {
        total=total.checked_add(fs::metadata(ce.join("maps").join(name)).map_err(error)?.len()).ok_or("Playtest resource size overflow")?;
    }
    if total>COPY_LIMIT{return Err("Private playtest inputs exceed 512 MiB; original resources were not changed".into());}
    let resources=core::runtime_content::prepare_ce_resources(&result.root.join("data"),&ce).map_err(error)?;
    result.ce_resource_sha256=resources.resource_sha256;
    result.budget.check().map_err(error)?;
    Ok(result)
}
fn play_command(reg: &runtime::RuntimeRegistration, stage: &Stage) -> Reply<Command> {
    let installed = runtime::prepare_launch(reg).map_err(error)?;
    let pin = core::runtime_packages::package("chupathingy").map_err(error)?;
    if maps::hash_file(&installed.executable).map_err(error)? != pin.executable_sha256 { return Err("Chupathingy changed before launch; no process was restarted".into()); }
    for &(name,sha,_) in core::runtime_packages::chupathingy_playtest_members() {
        if maps::hash_file(&stage.root.join("engine").join(name)).map_err(error)?!=sha{return Err(format!("Private engine member {name} changed before launch"));}
    }
    let mut command = Command::new(runtime::process_path(&stage.root.join("engine").join(pin.executable)).map_err(error)?);
    command.arg("--play"); // Documented one-run mode choice; native missing-resource checks remain active.
    command.current_dir(runtime::process_path(&stage.root).map_err(error)?).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    // Do not inherit debugging, online hosting, capture or download overrides.
    for (key, _) in std::env::vars_os().filter(|(key,_)|key.to_string_lossy().to_ascii_uppercase().starts_with("HALO_")) { command.env_remove(key); }
    for (key, value) in [
        ("HALO_NET_ONLINE","false"),("HALO_NET_PUBLIC_LOBBY","false"),("HALO_NET_HOST_PUBLIC","false"),("HALO_NET_COOP_PUBLIC","false"),
        ("HALO_NET_ALLOW_UPNP","false"),("HALO_NET_LIST_GAMES","false"),("HALO_NET_REPORT_HOSTED","false"),("HALO_NET_REPORT_GAMES","false"),
        ("HALO_NET_REPORT_EVENTS","false"),("HALO_NET_SHARE_PROFILE","false"),("HALO_NET_BROWSER",""),("HALO_NET_COPY_TO_CLIPBOARD","false"),
        ("HALO_NET_JOIN_FROM_CLIPBOARD","never"),("HALO_NET_MAP_DOWNLOADS","never"),("HALO_UPDATE_AUTO","false"),("HALO_MOVE_OLD_MAP_FOLDERS","no"),
        ("HALO_CRASH_REPORTS","no"),("HALO_DISCORD_PRESENCE","off"),("HALO_NETWORK_TEST_START","2"),("HALO_TEST_INPUT",""),
        ("HALO_DISPLAY_MODE","windowed"),("HALO_WINDOW_SIZE","1280x720"),("HALO_LAUNCHER_MODE_CHOICE","default"),("HALO_LAUNCHER_DEFAULT_MODE","vanilla"),
        ("HALO_CONSOLE_LOG","all"),("HALO_NETWORK_TEST_SHOOT","0"),("HALO_NETWORK_TEST_KILL","0"),("HALO_NET_ADDRESS","127.0.0.210"),("HALO_NET_BROADCAST","127.0.0.210"),
    ] { command.env(key,value); }
    command.env("HALO_NETWORK_TEST", format!("host:{}@ce:slayer",stage.map));
    for (key, folder) in RUNTIME_ROOTS {
        command.env(key, runtime::process_path(&stage.root.join(folder)).map_err(error)?);
    }
    #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
    Ok(command)
}
fn capture(mut pipe: impl Read + Send + 'static, tail: Arc<Mutex<Vec<u8>>>) {
    std::thread::spawn(move || {
        let mut bytes = [0;4096];
        while let Ok(n) = pipe.read(&mut bytes) {
            if n==0 { break; }
            if let Ok(mut out) = tail.lock() { out.extend_from_slice(&bytes[..n]); let extra=out.len().saturating_sub(32768); out.drain(..extra); }
        }
    });
}
fn launch_command(mut command: Command, stage: Stage) -> Reply<Running> {
    // Reuse the existing kill-on-owner-exit native process lifetime guard.
    let mut process=ce_host_native::OwnedProcess::spawn(&mut command)?;
    let tail=Arc::new(Mutex::new(Vec::new()));
    if let Some(pipe)=process.child.stdout.take(){capture(pipe,tail.clone());}
    if let Some(pipe)=process.child.stderr.take(){capture(pipe,tail.clone());}
    Ok(Running{process,stage,tail,started:Instant::now()})
}
fn launch(reg: &runtime::RuntimeRegistration, stage: Stage) -> Reply<Running> {
    launch_command(play_command(reg,&stage)?,stage)
}
fn owned_session(workbench: &WorkbenchState, owner: &str, id: &str) -> Reply<Arc<Session>> {
    workbench.rebuilds.get(owner).filter(|s|s.view.lock().is_ok_and(|v|v.id==id)).cloned().ok_or("This playtest belongs to another window or has ended".into())
}
fn owned(state: &AppState, owner: &str, id: &str) -> Reply<Arc<Session>> {
    owned_session(&*lock(&state.runtime_workbench)?,owner,id)
}
fn publish(session: &Session, run: &Running) -> Reply<()> {
    let mut view=lock(&session.view)?;
    view.process_id=Some(run.process.child.id()); view.compiled_build_id=run.stage.build.id.clone(); view.compiled_sha256=run.stage.build.sha256.clone().ok_or("Missing map hash")?;
    view.ce_resource_sha256=run.stage.ce_resource_sha256.clone();
    view.game_build_id=None; view.game_sha256=None; view.phase="loading".into();
    view.detail="Private native playtest started; waiting for an actual engine gameplay tick. Rebuild restarts this round and does not replace live geometry.".into();
    Ok(())
}
fn drive(app: tauri::AppHandle, owner: String, reg: runtime::RuntimeRegistration, session: Arc<Session>, mut run: Running) -> Reply<()> {
    let began=Instant::now(); let mut checked=Instant::now();
    loop {
        if session.stopping.load(Ordering::Relaxed) || app.get_webview_window(&owner).is_none() { return Ok(()); }
        if began.elapsed()>Duration::from_secs(8*60*60) { return Err("Private playtest reached its eight-hour lifetime; source and builds stay saved".into()); }
        if let Some(exit)=run.process.child.try_wait().map_err(error)? { return Err(format!("Private playtest exited ({exit}); source and previous-good native builds remain available")); }
        if checked.elapsed()>Duration::from_secs(2) { run.stage.budget.check().map_err(error)?; checked=Instant::now(); }
        if run.started.elapsed()>Duration::from_secs(180) && lock(&session.view)?.game_build_id.is_none() {
            return Err("Chupathingy did not report gameplay ticks within three minutes. Review its native log; the compiled source and prior builds remain intact".into());
        }
        let tail=String::from_utf8_lossy(&lock(&run.tail)?).to_string();
        {
            let mut view=lock(&session.view)?; view.console_tail=tail.clone();
            if tail.lines().any(|line|line.contains("network test: tick ") && line.contains(" player ")) {
                view.game_build_id=Some(run.stage.build.id.clone()); view.game_sha256=run.stage.build.sha256.clone();
                if view.pending_job_id.is_none() { view.phase="running".into(); view.detail="Native engine gameplay ticks observed for this staged revision. Human traversal and multiplayer acceptance remain separate.".into(); }
            }
        }
        let pending={let mut pending=lock(&session.pending)?;if pending.as_ref().is_some_and(|p|!p.job_id.is_empty()&&!app.state::<AppState>().jobs.lock().is_ok_and(|jobs|jobs.contains_key(&p.job_id))) { pending.take() } else { None }};
        if let Some(pending)=pending {
            let state=app.state::<AppState>();
            let replacement=(||{
                check_document_owner(&state,&lock(&session.view)?.project_id,&owner)?;
                let project=lock(&state.library)?.get(&lock(&session.view)?.project_id).map_err(error)?;
                if project.fingerprint().map_err(error)?!=pending.fingerprint { return Err("Source changed during compilation. The running revision was kept; save and rebuild the latest source".into()); }
                let current=registration(&state)?;
                if current.id!=reg.id || current.executable!=reg.executable || current.root!=reg.root || current.data_root!=reg.data_root { return Err("Runtime profile changed while building; the original playtest was kept".into()); }
                let build=checked_build(&state,&project,Some(&pending.job_id))?;
                let candidate=stage(&state,&reg,build)?;
                let command=play_command(&reg,&candidate)?; // Validate everything before closing the old child.
                if session.stopping.load(Ordering::Relaxed) { return Err("Playtest stopped before restart".into()); }
                run.close();
                match launch_command(command,candidate) {
                    Ok(next)=>{run=next;publish(&session,&run)?;}
                    Err(problem)=>{
                        // The previous isolated map still exists. Restart only its owned process.
                        if let Ok(mut process)=ce_host_native::OwnedProcess::spawn(&mut play_command(&reg,&run.stage)?) {
                            let tail=Arc::new(Mutex::new(Vec::new()));
                            if let Some(pipe)=process.child.stdout.take(){capture(pipe,tail.clone());}
                            if let Some(pipe)=process.child.stderr.take(){capture(pipe,tail.clone());}
                            run.process=process;run.tail=tail;run.started=Instant::now();publish(&session,&run)?;
                        }
                        return Err(format!("New playtest could not start: {problem}. The previous-good native build remains available"));
                    }
                }
                Ok::<_,String>(())
            })();
            let mut view=lock(&session.view)?;view.pending_job_id=None;
            match replacement { Ok(())=>view.error=None, Err(problem)=>{view.error=Some(problem);view.phase=if view.game_build_id.is_some(){"running"}else{"loading"}.into();view.detail="Live Rebuild did not adopt an output. Source and previous-good native builds were retained; check the private playtest status before continuing.".into();} }
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

#[tauri::command]
pub(crate) async fn runtime_rebuild_start(app: tauri::AppHandle, window: tauri::WebviewWindow, project_id: String, confirmed_restart: bool) -> Reply<View> {
    let owner=window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move||{
        if !confirmed_restart { return Err("Confirm that Live Rebuild restarts only its private playtest round".into()); }
        let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;
        let reg=registration(&state)?;let project=lock(&state.library)?.get(&project_id).map_err(error)?;let build=checked_build(&state,&project,None)?;
        // Reserve the single loopback host before staging; another window cannot race it.
        let mut workbench=lock(&state.runtime_workbench)?;
        if workbench.rebuilds.values().any(|s|s.view.lock().is_ok_and(|v|!matches!(v.phase.as_str(),"stopped"|"failed"))) { return Err("Stop the existing Live Rebuild playtest before starting another; other windows keep their own work".into()); }
        let view=View{id:uuid::Uuid::new_v4().to_string(),project_id,phase:"preparing".into(),source_fingerprint:project.fingerprint().map_err(error)?,compiled_build_id:build.id.clone(),compiled_sha256:build.sha256.clone().ok_or("Missing build hash")?,game_build_id:None,game_sha256:None,process_id:None,pending_job_id:None,detail:"Preparing an isolated native playtest".into(),error:None,console_tail:String::new(),ce_resource_sha256:Default::default()};
        let session=Arc::new(Session{view:Mutex::new(view),pending:Mutex::new(None),stopping:AtomicBool::new(false)});
        workbench.rebuilds.insert(owner.clone(),session.clone());drop(workbench);
        let result=(||{let staged=stage(&state,&reg,build)?;if app.get_webview_window(&owner).is_none()||session.stopping.load(Ordering::Relaxed){return Err("The requesting window closed".into());}let run=launch(&reg,staged)?;publish(&session,&run)?;Ok::<_,String>(run)})();
        match result {
            Ok(run)=>{let answer=lock(&session.view)?.clone();std::thread::spawn(move||{let result=drive(app,owner,reg,session.clone(),run);if let Ok(mut view)=session.view.lock(){view.process_id=None;view.game_build_id=None;view.game_sha256=None;view.pending_job_id=None;view.phase=if result.is_ok(){"stopped"}else{"failed"}.into();view.detail=result.err().unwrap_or_else(||"Private playtest stopped; generated runtime scratch disposed. Source and build history remain.".into());}});Ok(answer)}
            Err(problem)=>{let mut view=lock(&session.view)?;view.phase="failed".into();view.error=Some(problem.clone());Err(problem)}
        }
    }).await.map_err(error)?
}
#[tauri::command]
pub(crate) async fn runtime_rebuild_begin(app: tauri::AppHandle, window: tauri::WebviewWindow, session_id: String) -> Reply<View> {
    let owner=window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();let session=owned(&state,&owner,&session_id)?;
        let project_id=lock(&session.view)?.project_id.clone();check_document_owner(&state,&project_id,&owner)?;
        let project=lock(&state.library)?.get(&project_id).map_err(error)?;
        let selected=project.active_build_target.as_ref().and_then(|id|project.build_targets.iter().find(|t|&t.id==id));
        if !selected.is_some_and(|target|target.runtime_id==runtime::RuntimeId::ChupathingyCe&&target.builder=="invader-ce") { return Err("Select the Chupathingy native CE build target in Project setup before Live Rebuild".into()); }
        let fingerprint=project.fingerprint().map_err(error)?;
        {let mut pending=lock(&session.pending)?;let view=lock(&session.view)?;if pending.is_some()||session.stopping.load(Ordering::Relaxed)||matches!(view.phase.as_str(),"failed"|"stopped"){return Err("The playtest is stopped or already rebuilding".into());}*pending=Some(Pending{job_id:String::new(),fingerprint:fingerprint.clone()});}
        let job=if project.quick_forge.is_some(){quickforge_build(app.clone(),project_id)}else{begin_build(app.clone(),project_id)};
        let mut pending=lock(&session.pending)?;
        match job {Ok(job_id)=>{if let Some(pending)=pending.as_mut(){pending.job_id=job_id.clone();}let mut view=lock(&session.view)?;view.source_fingerprint=fingerprint;view.pending_job_id=Some(job_id);view.phase="rebuilding".into();view.error=None;view.detail="Compiling saved source while the previous-good playtest remains active. Only validated matching output will restart it.".into();Ok(view.clone())},Err(problem)=>{*pending=None;Err(problem)}}
    }).await.map_err(error)?
}
#[tauri::command]
pub(crate) fn runtime_rebuild_status(state: State<AppState>, window: tauri::WebviewWindow) -> Reply<Option<View>> {
    let session=lock(&state.runtime_workbench)?.rebuilds.get(window.label()).cloned();
    session.map(|session|{let mut view=lock(&session.view)?.clone();
        // Saved source can advance independently from the compiled and game revisions.
        view.source_fingerprint=lock(&state.library)?.get(&view.project_id).map_err(error)?.fingerprint().map_err(error)?;
        Ok(view)
    }).transpose()
}
#[tauri::command]
pub(crate) fn runtime_rebuild_stop(state: State<AppState>, window: tauri::WebviewWindow, session_id: String) -> Reply<()> {
    owned(&state,window.label(),&session_id)?.stop();Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn session(id: &str, project: &str) -> Arc<Session> {
        Arc::new(Session { view:Mutex::new(View{id:id.into(),project_id:project.into(),phase:"running".into(),source_fingerprint:"synthetic".into(),compiled_build_id:"old-good-build".into(),compiled_sha256:"old-good-sha".into(),game_build_id:Some("old-good-build".into()),game_sha256:Some("old-good-sha".into()),process_id:None,pending_job_id:None,detail:String::new(),error:None,console_tail:String::new(),ce_resource_sha256:Default::default()}),pending:Mutex::new(None),stopping:AtomicBool::new(false) })
    }
    #[test]
    fn fresh_playtest_roots_exist_before_windows_process_path_validation() {
        let parent=tempfile::tempdir().unwrap();let root=parent.path().join("private-stage");
        prepare_runtime_roots(&root).unwrap();
        for (_, folder) in RUNTIME_ROOTS {
            let directory=root.join(folder);
            assert!(directory.is_dir());
            assert_eq!(fs::canonicalize(runtime::process_path(&directory).unwrap()).unwrap(),fs::canonicalize(&directory).unwrap());
            assert_eq!(fs::read_dir(directory).unwrap().count(),0);
        }
        fs::write(root.join("save/profile"),b"owned saved profile").unwrap();
        prepare_runtime_roots(&root).unwrap();
        assert_eq!(fs::read(root.join("save/profile")).unwrap(),b"owned saved profile");
    }
    #[test]
    fn old_window_or_session_cannot_take_over_another_playtest() {
        let mut workbench=WorkbenchState::default();let a=session("a","map-a");let b=session("b","map-b");
        workbench.rebuilds.insert("one".into(),a.clone());workbench.rebuilds.insert("two".into(),b.clone());
        assert!(owned_session(&workbench,"two","a").is_err());assert!(owned_session(&workbench,"one","old-id").is_err());
        owned_session(&workbench,"one","a").unwrap().stop();
        assert!(a.stopping.load(Ordering::Relaxed));assert!(!b.stopping.load(Ordering::Relaxed));
        assert_eq!(lock(&b.view).unwrap().game_build_id.as_deref(),Some("old-good-build"));
    }
    #[test]
    fn staging_never_replaces_an_existing_file_or_an_input_that_changed() {
        let dir=tempfile::tempdir().unwrap();let source=dir.path().join("source.map");let target=dir.path().join("copy.map");
        fs::write(&source,b"exact original data").unwrap();let hash=maps::hash_file(&source).unwrap();
        copy_pin(&source,&target,&hash,&mut 0).unwrap();assert_eq!(maps::hash_file(&target).unwrap(),hash);
        fs::write(&target,b"previous-good output").unwrap();
        assert!(copy_pin(&source,&target,&hash,&mut 0).is_err());assert_eq!(fs::read(&target).unwrap(),b"previous-good output");
        fs::write(&source,b"changed input").unwrap();
        assert!(copy_pin(&source,&dir.path().join("late.map"),&hash,&mut 0).is_err());assert!(!dir.path().join("late.map").exists());
        assert_eq!(fs::read(&source).unwrap(),b"changed input");
    }
    #[test]
    fn copy_budget_failure_happens_before_target_creation() {
        let dir=tempfile::tempdir().unwrap();let source=dir.path().join("source");fs::write(&source,b"bounded").unwrap();
        let target=dir.path().join("no-output");let mut total=COPY_LIMIT-1;
        assert!(copy_pin(&source,&target,&maps::hash_file(&source).unwrap(),&mut total).unwrap_err().contains("512 MiB"));
        assert!(!target.exists());assert_eq!(fs::read(source).unwrap(),b"bounded");
    }
}
