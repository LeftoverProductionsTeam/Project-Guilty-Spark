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
    runtime_id: runtime::RuntimeId,
    staged_map: String,
    startup_map:Option<String>,
    vehicle_test: bool,
    required_native_features:Vec<String>,
    engine_sha256: std::collections::BTreeMap<String,String>,
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
pub(crate) struct Pending { pub(crate) job_id: String, pub(crate) fingerprint: String }
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
    executable_name: String,
    staged_sha256: std::collections::BTreeMap<String,String>,
    forerunner_extraction:bool,
    forerunner_startup:Option<String>,
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
    captures:Vec<std::thread::JoinHandle<()>>,
    started: Instant,
}
impl Running {
    fn drain_console(&mut self)->bool{
        let began=Instant::now();
        while self.captures.iter().any(|reader|!reader.is_finished())&&began.elapsed()<Duration::from_millis(500){std::thread::sleep(Duration::from_millis(10));}
        let mut complete=true;
        for reader in self.captures.drain(..){if reader.is_finished(){complete&=reader.join().is_ok();}else{complete=false;}}
        complete
    }
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
impl Drop for Running { fn drop(&mut self) { self.close();self.drain_console(); } }

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
pub(crate) fn checked_build(state: &AppState, project: &Project, build_id: Option<&str>) -> Reply<BuildRecord> {
    checked_build_for(state,project,build_id,1).map(|(build,_,_)|build)
}
fn checked_build_for(state: &AppState, project: &Project, build_id: Option<&str>, scenario_type:u16) -> Reply<(BuildRecord,bool,Vec<String>)> {
    let build = if let Some(id) = build_id { verified_build(state, project, id)? } else { current_build(state, project)? };
    if !matches!(build.target.as_str(),"gbx-custom"|"ce-existing") { return Err(if scenario_type==0{"Build the saved project as standard Custom Edition solo content for Forerunner first"}else{"Build the saved project as standard Custom Edition content for Chupathingy first"}.into()); }
    let output = build.output.as_ref().ok_or("Validated native output is missing")?;
    let inspection = maps::inspect_map(output, None).map_err(error)?;
    let header = &inspection.header;
    if scenario_type == 1 && header.version == 609 && header.scenario_type == 0
        && core::creative::compiled_extraction_mode(output, &inspection).map_err(error)?
    {
        return Err("This compiled mission uses Forerunner’s native Extraction settlement. Select the reviewed Forerunner profile and Start staged solo test.".into());
    }
    if header.version != 609 || header.scenario_type != scenario_type || header.extended
        || !core::ce_host::map_selector(&header.name)
        || output.file_stem().and_then(|n|n.to_str()) != Some(header.name.as_str()) {
        return Err(format!("This private playtest needs a standard version-609 {} cache with its native filename; no header rewriting is performed",if scenario_type==0{"solo"}else{"multiplayer"}));
    }
    if inspection.resources.iter().any(|r|r.required) || inspection.tags.iter().any(|t|t.external) {
        return Err("This playtest needs a self-contained CE build. Rebuild with native embedded resources; no unrelated bitmap/sound bank is substituted".into());
    }
    if build.sha256.as_deref() != Some(inspection.sha256.as_str()) { return Err("Native output changed during inspection; the running game was left alone".into()); }
    let requirements=core::creative::compiled_extraction_requirements(output,&inspection).map_err(error)?;
    let extraction=requirements.is_some();
    Ok((build,extraction,requirements.unwrap_or_default()))
}
const VEHICLE_TEST_MAP: &str = "spark_vehicle_playtest";

fn checked_vehicle_build(state: &AppState, project: &Project, build_id: &str) -> Reply<BuildRecord> {
    let build = verified_build(state, project, build_id)?;
    if build.target != "mcc-cea" || !project.shape_draft.as_ref().is_some_and(|draft| draft.vehicle_mount.is_some()) {
        return Err("Build the saved vehicle attachment before starting this playtest".into());
    }
    let receipt: serde_json::Value = serde_json::from_slice(&bounded_read(
        &state.root.join("jobs").join(build_id).join("vehicle-attachment.json"), 1024 * 1024,
    )?).map_err(error)?;
    let output = build.output.as_ref().ok_or("Missing vehicle attachment output")?;
    let inspection = maps::inspect_map(output, None).map_err(error)?;
    if inspection.header.version != 13 || inspection.header.scenario_type != 1 || inspection.header.extended
        || inspection.resources.iter().any(|resource| resource.required) || inspection.tags.iter().any(|tag| tag.external)
        || build.sha256.as_deref() != Some(inspection.sha256.as_str())
        || receipt["privateMap"]["sha256"].as_str() != Some(inspection.sha256.as_str())
        || receipt["privateMap"]["vehicleReferencesVerified"].as_bool() != Some(true)
    {
        return Err("This playtest needs the verified, self-contained MCC multiplayer attachment build".into());
    }
    Ok(build)
}

fn copy_pin(source: &Path, target: &Path, expected: &str, total: &mut u64) -> Reply<()> {
    copy_pin_bounded(source,target,expected,total,COPY_LIMIT)
}
pub(crate) fn copy_pin_bounded(source: &Path, target: &Path, expected: &str, total: &mut u64, limit:u64) -> Reply<()> {
    core::reject_links(source).map_err(error)?;
    core::reject_links(target).map_err(error)?;
    let size = fs::metadata(source).map_err(error)?.len();
    *total = total.checked_add(size).ok_or("Playtest copy size overflow")?;
    if *total > limit { return Err(format!("Playtest inputs exceed {} MiB; originals were not changed", limit/1024/1024)); }
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
fn forerunner_registration(state:&AppState,expected:Option<&runtime::RuntimeRegistration>,expected_sha256:Option<&str>)->Reply<runtime::RuntimeRegistration>{
    if !cfg!(all(windows,target_arch="x86_64")){return Err("The Forerunner solo playtest source currently targets Windows x64 Spark with a reviewed x86 or x64 engine".into());}
    let reg=runtime_registration(state,runtime::RuntimeId::OpenCe)?;
    let plan=runtime::prepare_launch(&reg).map_err(error)?;
    let expected=expected.ok_or("Inspect the selected Forerunner profile before starting its playtest")?;
    if serde_json::to_value(expected).map_err(error)?!=serde_json::to_value(&reg).map_err(error)? || expected_sha256!=Some(plan.executable_sha256.as_str()) || plan.profile_interface.as_deref()!=Some("forerunner") {
        return Err("Select and inspect the recorded Forerunner profile before starting this solo playtest; a newer filename or changed profile is not admitted".into());
    }
    Ok(reg)
}
fn stage_forerunner(state:&AppState,reg:&runtime::RuntimeRegistration,build:BuildRecord)->Reply<Stage>{
    let installed=runtime::inspect_registration(reg).map_err(error)?;
    let executable_sha=installed.executable_sha256.as_deref().ok_or("Forerunner identity is missing")?;
    let machine=runtime::forerunner_registration_machine(reg,executable_sha).map_err(error)?.ok_or("Forerunner changed or has no reviewed Windows profile; inspect the build before staging")?;
    let executable=installed.executable.as_deref().ok_or("Forerunner executable is missing")?;
    let package=executable.parent().ok_or("Forerunner package folder is missing")?;
    let library=package.join("SDL3.dll");core::reject_links(&library).map_err(error)?;
    // The reviewed Windows source links one adjacent SDL3 library. Pin the
    // installed architecture-matched member; never borrow another runtime's DLLs.
    let bytes=bounded_read(&library,64*1024*1024)?;
    if bytes.len()<64 || &bytes[..2]!=b"MZ"{return Err("Forerunner needs its own architecture-matched installed SDL3.dll".into());}
    let pe=u32::from_le_bytes(bytes[60..64].try_into().map_err(error)?) as usize;
    let dll_header=bytes.get(pe..pe.saturating_add(24)).ok_or("SDL3.dll has an invalid PE header")?;
    if &dll_header[..4]!=b"PE\0\0" || dll_header[4..6]!=machine.to_le_bytes() || u16::from_le_bytes([dll_header[22],dll_header[23]])&0x2000==0{return Err("Forerunner's SDL3.dll must match the admitted executable architecture".into());}
    let library_sha=core::hex_bytes(sha2::Sha256::digest(&bytes));drop(bytes);
    let output=build.output.as_ref().ok_or("Build output is missing")?;
    let header=maps::inspect_header(output).map_err(error)?;
    let vehicle_test = build.target == "mcc-cea" && header.version == 13 && header.scenario_type == 1;
    if !vehicle_test && (header.version != 609 || header.scenario_type != 0) {
        return Err("Forerunner needs a validated CE solo or MCC multiplayer vehicle build".into());
    }
    let map = if vehicle_test { VEHICLE_TEST_MAP.into() } else { header.name.clone() };
    let startup = if vehicle_test { None } else { runtime::forerunner_registration_startup_selector(reg, executable_sha, &map).map_err(error)? };
    let root=state.root.join("runtime-playtests").join(uuid::Uuid::new_v4().to_string());
    let store=core::storage::Store::for_output(&root).map_err(error)?;
    let lease=store.reserve(&root,Some(&installed.data_root),RESERVATION,core::storage::Category::Staging,"Bounded Forerunner authored playtest").map_err(error)?;
    fs::create_dir_all(&root).map_err(error)?;lease.mark_owned().map_err(error)?;
    let budget=store.tool_budget(&root).map_err(error)?.ok_or("Missing playtest storage owner")?;
    let name=executable.file_name().and_then(|n|n.to_str()).ok_or("Invalid Forerunner executable name")?.to_owned();
    let mut result=Stage{forerunner_startup:startup,forerunner_extraction:false,root,lease:Some(lease),budget,build:build.clone(),map,ce_resource_sha256:Default::default(),executable_name:name.clone(),staged_sha256:Default::default()};
    prepare_runtime_roots(&result.root)?;let mut total=0;
    for(source,relative,sha)in[(executable.to_path_buf(),format!("engine/{name}"),executable_sha.to_owned()),(library,"engine/SDL3.dll".into(),library_sha)]{
        copy_pin(&source,&result.root.join(&relative),&sha,&mut total)?;result.staged_sha256.insert(relative,sha);
    }
    for name in ["ui.map","carousel.map"]{
        let ui=installed.data_root.join("maps").join(name);core::reject_links(&ui).map_err(error)?;
        if name=="carousel.map"&&!ui.try_exists().map_err(error)?{continue;}
        if maps::inspect_header(&ui).map_err(error)?.version!=5{return Err("Forerunner needs matching original Xbox UI data; CE/MCC UI is not a substitute".into());}
        let sha=maps::hash_file(&ui).map_err(error)?;let relative=format!("data/maps/{name}");
        copy_pin(&ui,&result.root.join(&relative),&sha,&mut total)?;result.staged_sha256.insert(relative,sha);
    }
    let directory = if vehicle_test { "mcc_maps" } else { "maps_ce" };
    let relative = format!("data/{directory}/{}.map", result.map);
    let sha = build.sha256.clone().ok_or("Build has no SHA-256")?;
    copy_pin(output, &result.root.join(&relative), &sha, &mut total)?;
    result.staged_sha256.insert(relative, sha);
    if vehicle_test {
        result.budget.check().map_err(error)?;
        return Ok(result);
    }
    let ce=runtime_connections::ce_resource_source(state)?;
    for name in ["bitmaps.map","sounds.map","loc.map"]{total=total.checked_add(fs::metadata(ce.join("maps").join(name)).map_err(error)?.len()).ok_or("Playtest resource size overflow")?;}
    if total>COPY_LIMIT{return Err("Private playtest inputs exceed 512 MiB; no original resource was changed".into());}
    result.ce_resource_sha256=core::runtime_content::prepare_ce_resources(&result.root.join("data"),&ce).map_err(error)?.resource_sha256;
    for(name,sha)in &result.ce_resource_sha256{result.staged_sha256.insert(format!("data/maps_ce/{name}"),sha.clone());}
    result.budget.check().map_err(error)?;Ok(result)
}
fn seal_vehicle_mode(stage: &mut Stage, project: &Project) -> Reply<()> {
    let relative = format!("data/mcc_maps/{}.map", stage.map);
    let sha256 = stage.staged_sha256.get(&relative).ok_or("Missing verified staged map")?.clone();
    let output = stage.root.join(&relative);
    let bytes = fs::metadata(&output).map_err(error)?.len();
    let export = core::build::MapExport {
        project_id: project.id.clone(), build_id: stage.build.id.clone(),
        project_fingerprint: stage.build.project_fingerprint.clone(), output, sha256, bytes,
        cache_version: 13, runtime_id: runtime::RuntimeId::OpenCe, reused: false,
    };
    let mode = core::build::write_vehicle_playtest_mode(&export, project).map_err(error)?;
    stage.staged_sha256.insert(format!("data/mcc_maps/{}.spark-mode.json", stage.map), maps::hash_file(&mode).map_err(error)?);
    stage.budget.check().map_err(error)
}

fn apply_forerunner_startup(command:&mut Command,selector:Option<String>)->Reply<Option<String>>{
    command.env_remove("HALO_START_MAP");
    if let Some(selector)=&selector{command.env("HALO_START_MAP",selector);}
    Ok(selector)
}
fn forerunner_command(state:&AppState,reg:&runtime::RuntimeRegistration,stage:&Stage)->Reply<Command>{
    let original=runtime::prepare_launch(reg).map_err(error)?;
    if original.profile_interface.as_deref()!=Some("forerunner"){return Err("Forerunner identity changed; no playtest was started".into());}
    for(relative,sha)in &stage.staged_sha256{
        let file=stage.root.join(relative);core::reject_links(&file).map_err(error)?;
        if maps::hash_file(&file).map_err(error)?!=*sha{return Err(format!("Private playtest member {relative} changed before launch"));}
    }
    if stage.staged_sha256.get(&format!("engine/{}",stage.executable_name))!=Some(&original.executable_sha256){return Err("Forerunner executable changed after staging; the private copy was not launched".into());}
    let mut isolated=reg.clone();isolated.root=stage.root.join("engine");isolated.executable=isolated.root.join(&stage.executable_name);isolated.data_root=Some(stage.root.join("data"));
    let plan=runtime::prepare_launch(&isolated).map_err(error)?;
    let mut command=registered_runtime_command_at(state,&isolated,&plan,Some(&stage.root.join("profile")))?;
    // Native HaloScript owns these waves. A reviewed CE startup request uses
    // only this staged cache; no debug/test startup is inherited.
    for(key,value)in[("HALO_NET_ONLINE","false"),("HALO_NET_PUBLIC_LOBBY","false"),("HALO_NET_JOIN_FROM_CLIPBOARD","never"),("HALO_NET_FIREFIGHT_ENCOUNTER","false"),("HALO_CUSTOM_EDITION","true"),("HALO_CRASH_REPORTS","no"),("HALO_DISCORD_PRESENCE","off")]{command.env(key,value);}
    if stage.forerunner_extraction&&runtime::forerunner_registration_machine(reg,&original.executable_sha256).map_err(error)?!=Some(0x8664){return Err("This older Forerunner build is not reviewed for native Extraction settlement; select the current verified x64 profile".into());}
    let vehicle_test = stage.build.target == "mcc-cea";
    let startup = if vehicle_test { None } else {
        runtime::forerunner_registration_startup_selector(reg, &original.executable_sha256, &stage.map).map_err(error)?
    };
    if startup!=stage.forerunner_startup{return Err("Forerunner startup contract changed after staging; no process was launched".into());}
    apply_forerunner_startup(&mut command,startup)?;
    command.env("HALO_EXTRACTION",if stage.forerunner_extraction{"true"}else{"false"});
    if vehicle_test {
        command.env("HALO_MENUS", "chupathingy")
            .env("HALO_NET_HOST_PUBLIC", "false")
            .env("HALO_NET_ALLOW_UPNP", "false");
    }
    if stage.forerunner_extraction {
        // A fresh private profile can otherwise use the classic menu, which has no Extraction entry.
        command.env("HALO_MENUS", "chupathingy")
            .env("HALO_NET_COOP_SCRIPT_ADAPTATIONS", "false");
    }
    if runtime::forerunner_registration_machine(reg,&original.executable_sha256).map_err(error)?==Some(0x014c){command.env("HALO_RENDERER","gl");}
    command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());Ok(command)
}
fn stage(state: &AppState, reg: &runtime::RuntimeRegistration, build: BuildRecord) -> Reply<Stage> {
    if reg.runtime_id==runtime::RuntimeId::OpenCe{return stage_forerunner(state,reg,build);}
    let installed = runtime::inspect_registration(reg).map_err(error)?;
    let output = build.output.as_ref().ok_or("Build output is missing")?;
    let header = maps::inspect_header(output).map_err(error)?;
    let root = state.root.join("runtime-playtests").join(uuid::Uuid::new_v4().to_string());
    let store = core::storage::Store::for_output(&root).map_err(error)?;
    let lease = store.reserve(&root, Some(&installed.data_root), RESERVATION, core::storage::Category::Staging, "Bounded Chupathingy native rebuild/playtest").map_err(error)?;
    fs::create_dir_all(&root).map_err(error)?;
    lease.mark_owned().map_err(error)?;
    let budget = store.tool_budget(&root).map_err(error)?.ok_or("Missing playtest storage owner")?;
    let mut result = Stage { forerunner_startup:None,forerunner_extraction:false, root, lease: Some(lease), budget, build: build.clone(), map: header.name.clone(), ce_resource_sha256: Default::default(), executable_name: String::new(), staged_sha256: Default::default() };
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
fn play_command(state:&AppState, reg: &runtime::RuntimeRegistration, stage: &Stage) -> Reply<Command> {
    if reg.runtime_id==runtime::RuntimeId::OpenCe{return forerunner_command(state,reg,stage);}
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
fn capture(mut pipe: impl Read + Send + 'static, tail: Arc<Mutex<Vec<u8>>>) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let mut bytes = [0;4096];
        while let Ok(n) = pipe.read(&mut bytes) {
            if n==0 { break; }
            if let Ok(mut out) = tail.lock() { out.extend_from_slice(&bytes[..n]); let extra=out.len().saturating_sub(32768); out.drain(..extra); }
        }
    })
}
// Keep the useful end of this owned session's log in the existing UI before
// Stage disposes scratch. Never enumerate a runtime install or follow a link.
const DEBUG_TAIL_BYTES:usize=16*1024;
fn bounded_log_text(bytes:&[u8],limit:usize)->String {
    let mut text=String::from_utf8_lossy(bytes).replace('\0', "");
    if text.len()>limit {let mut start=text.len()-limit;while !text.is_char_boundary(start){start+=1;}text.drain(..start);}
    text
}
fn private_debug_tail(root:&Path,runtime_id:runtime::RuntimeId)->Reply<String>{
    use std::io::{Seek,SeekFrom};
    let relative=if runtime_id==runtime::RuntimeId::OpenCe{"profile/logs/debug.txt"}else{"logs/debug.txt"};
    let file=root.join(relative);core::reject_links(&file).map_err(error)?;
    let mut input=match fs::File::open(&file){Ok(file)=>file,Err(e)if e.kind()==std::io::ErrorKind::NotFound=>return Ok(String::new()),Err(e)=>return Err(error(e))};
    let metadata=input.metadata().map_err(error)?;
    if !metadata.is_file(){return Err("Private debug log is not a regular file".into());}
    let begin=metadata.len().saturating_sub(DEBUG_TAIL_BYTES as u64);
    input.seek(SeekFrom::Start(begin)).map_err(error)?;let mut bytes=Vec::new();
    std::io::Read::by_ref(&mut input).take(DEBUG_TAIL_BYTES as u64).read_to_end(&mut bytes).map_err(error)?;
    let text=bounded_log_text(&bytes,DEBUG_TAIL_BYTES);
    if text.is_empty(){return Ok(String::new());}
    Ok(format!("\n--- Private {relative}{} ---\n{text}",if begin>0{" (earlier bytes omitted)"}else{""}))
}
fn diagnostic_tail(root:&Path,runtime_id:runtime::RuntimeId,console:&[u8])->String{
    let mut text=bounded_log_text(console,32768);
    match private_debug_tail(root,runtime_id){Ok(debug)=>text.push_str(&debug),Err(problem)=>{text.push_str("\n--- Private debug log unavailable: ");text.extend(problem.chars().take(300));text.push_str(" ---\n");}}
    text
}
fn fatal_native_line(text:&str)->Option<String>{
    // A conservative stop guard, not the offline QA health classifier or a
    // claim that an unclassified/missing log proves healthy gameplay.
    text.lines().find(|line|{let line=line.to_ascii_lowercase();["exception halt","exception assert","exception access violation","unhandled exception","crash: exception"].iter().any(|fatal|line.contains(fatal))}).map(|line|line.chars().take(512).collect())
}
fn finish_session(session:&Session,result:Reply<()>){
    if let Ok(mut view)=session.view.lock(){
        let result=match fatal_native_line(&view.console_tail){Some(fault)=>Err(format!("Native playtest failed: {fault}. Copy diagnostic tail for the full retained log. Source and previous-good builds remain available.")),None=>result};
        view.process_id=None;view.game_build_id=None;view.game_sha256=None;view.pending_job_id=None;
        view.phase=if result.is_ok(){"stopped"}else{"failed"}.into();view.error=result.as_ref().err().cloned();
        view.detail=result.err().unwrap_or_else(||"Private playtest stopped; diagnostic tail, source and build history remain. Owned scratch cleanup was requested.".into());
    }
}
fn launch_command(mut command: Command, stage: Stage) -> Reply<Running> {
    // Reuse the existing kill-on-owner-exit native process lifetime guard.
    let mut process=ce_host_native::OwnedProcess::spawn(&mut command)?;
    let tail=Arc::new(Mutex::new(Vec::new()));
    let mut captures=Vec::new();
    if let Some(pipe)=process.child.stdout.take(){captures.push(capture(pipe,tail.clone()));}
    if let Some(pipe)=process.child.stderr.take(){captures.push(capture(pipe,tail.clone()));}
    Ok(Running{process,stage,tail,captures,started:Instant::now()})
}
fn launch(state:&AppState, reg: &runtime::RuntimeRegistration, stage: Stage) -> Reply<Running> {
    launch_command(play_command(state,reg,&stage)?,stage)
}
fn owned_session(workbench: &WorkbenchState, owner: &str, id: &str) -> Reply<Arc<Session>> {
    workbench.rebuilds.get(owner).filter(|s|s.view.lock().is_ok_and(|v|v.id==id)).cloned().ok_or("This playtest belongs to another window or has ended".into())
}
fn owned(state: &AppState, owner: &str, id: &str) -> Reply<Arc<Session>> {
    owned_session(&*lock(&state.runtime_workbench)?,owner,id)
}
fn publish_forerunner(view:&mut View,startup:Option<String>,map:&str)->Reply<()>{
        view.game_build_id=None;view.game_sha256=None;
        view.startup_map=startup;
        if let Some(selector)=view.startup_map.clone(){view.phase="awaitingMapStartup".into();view.detail=format!("Forerunner was asked to start the staged CE solo map {selector} fresh. Create a temporary player profile in its native menus if prompted. This request does not confirm a loaded map, revision or gameplay. Stop disposes this owned profile and scratch.");}
        else{view.phase="awaitingMapSelection".into();view.detail=format!("Forerunner opened with an isolated CE solo cache: {}. This reviewed build uses its native custom campaign chooser; create a temporary player profile if prompted. Spark cannot confirm the loaded map or restart it automatically. Stop disposes this owned profile and scratch.",map);}
    Ok(())
}
fn publish(session: &Session, run: &Running) -> Reply<()> {
    let mut view=lock(&session.view)?;
    view.console_tail.clear(); // The next staged revision must not display the old child's log.
    view.process_id=Some(run.process.child.id()); view.compiled_build_id=run.stage.build.id.clone(); view.compiled_sha256=run.stage.build.sha256.clone().ok_or("Missing map hash")?;
    view.ce_resource_sha256=run.stage.ce_resource_sha256.clone();
    view.staged_map=run.stage.map.clone();view.engine_sha256=run.stage.staged_sha256.iter().filter(|(name,_)|name.starts_with("engine/")).map(|(name,sha)|(name.clone(),sha.clone())).collect();
    if view.vehicle_test {
        view.phase = "awaitingMapSelection".into();
        view.detail = format!("In Forerunner, choose Zombies → Play Solo → {}. Create a temporary profile if prompted. Spark is waiting for your in-game check.", run.stage.map);
        view.game_build_id = None;
        view.game_sha256 = None;
        return Ok(());
    }
    if view.runtime_id==runtime::RuntimeId::OpenCe{
        return publish_forerunner(&mut view,run.stage.forerunner_startup.clone(),&run.stage.map);
    }
    view.game_build_id=None; view.game_sha256=None; view.phase="loading".into();
    view.detail="Private native playtest started; waiting for an actual engine gameplay tick. Rebuild restarts this round and does not replace live geometry.".into();
    Ok(())
}
fn drive(app: tauri::AppHandle, owner: String, reg: runtime::RuntimeRegistration, session: Arc<Session>, mut run: Running) -> Reply<()> {
    let began=Instant::now(); let mut checked=Instant::now();
    let result=(||{loop {
        if session.stopping.load(Ordering::Relaxed) || app.get_webview_window(&owner).is_none() { return Ok(()); }
        if began.elapsed()>Duration::from_secs(8*60*60) { return Err("Private playtest reached its eight-hour lifetime; source and builds stay saved".into()); }
        if let Some(exit)=run.process.child.try_wait().map_err(error)? { if reg.runtime_id==runtime::RuntimeId::OpenCe&&exit.success(){return Ok(());} return Err(format!("Private playtest exited ({exit}); source and previous-good native builds remain available")); }
        if checked.elapsed()>Duration::from_secs(2) {
            run.stage.budget.check().map_err(error)?;checked=Instant::now();
            let output=diagnostic_tail(&run.stage.root,reg.runtime_id,&lock(&run.tail)?);
            let fault=fatal_native_line(&output);lock(&session.view)?.console_tail=output;
            if let Some(fault)=fault{return Err(format!("Native playtest reported: {fault}"));}
        }
        if reg.runtime_id==runtime::RuntimeId::ChupathingyCe && run.started.elapsed()>Duration::from_secs(180) && lock(&session.view)?.game_build_id.is_none() {
            return Err("Chupathingy did not report gameplay ticks within three minutes. Review its native log; the compiled source and prior builds remain intact".into());
        }
        let tail=String::from_utf8_lossy(&lock(&run.tail)?).to_string();
        {
            if let Some(fault)=fatal_native_line(&tail){return Err(format!("Native playtest reported: {fault}"));}
            let mut view=lock(&session.view)?;
            // Preserve the last bounded file tail between its two-second reads.
            if !view.console_tail.contains("--- Private "){view.console_tail=tail.clone();}
            if reg.runtime_id==runtime::RuntimeId::ChupathingyCe && tail.lines().any(|line|line.contains("network test: tick ") && line.contains(" player ")) {
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
                let command=play_command(&state,&reg,&candidate)?; // Validate everything before closing the old child.
                if session.stopping.load(Ordering::Relaxed) { return Err("Playtest stopped before restart".into()); }
                run.close();run.drain_console();
                match launch_command(command,candidate) {
                    Ok(next)=>{run=next;publish(&session,&run)?;}
                    Err(problem)=>{
                        // The previous isolated map still exists. Restart only its owned process.
                        if let Ok(mut process)=ce_host_native::OwnedProcess::spawn(&mut play_command(&state,&reg,&run.stage)?) {
                            let tail=Arc::new(Mutex::new(Vec::new()));
                            let mut captures=Vec::new();
                            if let Some(pipe)=process.child.stdout.take(){captures.push(capture(pipe,tail.clone()));}
                            if let Some(pipe)=process.child.stderr.take(){captures.push(capture(pipe,tail.clone()));}
                            run.process=process;run.tail=tail;run.captures=captures;run.started=Instant::now();publish(&session,&run)?;
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
    }})();
    run.close(); // Flush only this owned child before capturing its final log.
    let complete=run.drain_console();
    let mut output=diagnostic_tail(&run.stage.root,reg.runtime_id,&lock(&run.tail)?);
    if !complete{output.push_str("\n--- Console readers did not finish within 500 ms; this diagnostic tail may be incomplete. ---\n");}
    lock(&session.view)?.console_tail=output;
    result
}

#[tauri::command]
pub(crate) async fn runtime_rebuild_start(app: tauri::AppHandle, window: tauri::WebviewWindow, project_id: String, confirmed_restart: bool, runtime_id:Option<runtime::RuntimeId>, expected_registration:Option<runtime::RuntimeRegistration>, expected_executable_sha256:Option<String>, vehicle_build_id: Option<String>) -> Reply<View> {
    let owner=window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move||{
        if !confirmed_restart { return Err("Confirm the window-owned private playtest; stopping it disposes its temporary profile and scratch".into()); }
        let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;
        let runtime_id=runtime_id.unwrap_or(runtime::RuntimeId::ChupathingyCe);
        let reg=match runtime_id{runtime::RuntimeId::ChupathingyCe=>registration(&state)?,runtime::RuntimeId::OpenCe=>forerunner_registration(&state,expected_registration.as_ref(),expected_executable_sha256.as_deref())?,_=>return Err("No owned playtest adapter is admitted for this runtime".into())};
        let project=lock(&state.library)?.get(&project_id).map_err(error)?;
        let mission_extraction=project.studio.as_ref().is_some_and(|studio|studio.missions.iter().any(|beat|beat.trigger=="forerunnerExtractionSettled"));
        if mission_extraction&&runtime_id!=runtime::RuntimeId::OpenCe{return Err("This saved mission requires Forerunner native settled extraction; another engine cannot complete its objective".into());}
        let vehicle_test = vehicle_build_id.is_some();
        let (build, compiled_extraction, required_native_features) = if let Some(id) = vehicle_build_id {
            let sha = expected_executable_sha256.as_deref().ok_or("Inspect Forerunner before starting the vehicle playtest")?;
            if runtime_id != runtime::RuntimeId::OpenCe || mission_extraction
                || runtime::forerunner_registration_machine(&reg, sha).map_err(error)? != Some(0x8664) {
                return Err("The MCC vehicle playtest needs a reviewed Windows x64 Forerunner profile".into());
            }
            let capability = runtime_connections::query_companion_capabilities(&reg.executable, sha)?;
            if !capability.map_targets.iter().any(|target| target.cache_version == 13) {
                return Err("This Forerunner build does not advertise MCC13 map support".into());
            }
            (checked_vehicle_build(&state, &project, &id)?, false, vec![])
        } else if runtime_id == runtime::RuntimeId::OpenCe {
            checked_build_for(&state, &project, None, 0)?
        } else {
            (checked_build(&state, &project, None)?, false, vec![])
        };
        if !required_native_features.is_empty(){
            let sha=expected_executable_sha256.as_deref().ok_or("Inspect the required Forerunner build before starting")?;
            runtime_connections::query_companion_capabilities(&reg.executable,sha)?.require_native_features(&required_native_features).map_err(error)?;
        }
        if mission_extraction&&!compiled_extraction{return Err("The saved mission requires native settled Extraction, but this compiled revision has no admitted callback and hub layout. Rebuild the reviewed mission first".into());}
        // Reserve the existing owned playtest slot before staging; retain the single Chupathingy loopback-host restriction.
        let mut workbench=lock(&state.runtime_workbench)?;
        if workbench.rebuilds.values().any(|s|s.view.lock().is_ok_and(|v|!matches!(v.phase.as_str(),"stopped"|"failed"))) { return Err("Stop the existing Live Rebuild playtest before starting another; other windows keep their own work".into()); }
        let view=View{id:uuid::Uuid::new_v4().to_string(),runtime_id,staged_map:String::new(),startup_map:None,vehicle_test,required_native_features,engine_sha256:Default::default(),project_id,phase:"preparing".into(),source_fingerprint:project.fingerprint().map_err(error)?,compiled_build_id:build.id.clone(),compiled_sha256:build.sha256.clone().ok_or("Missing build hash")?,game_build_id:None,game_sha256:None,process_id:None,pending_job_id:None,detail:"Preparing an isolated native playtest".into(),error:None,console_tail:String::new(),ce_resource_sha256:Default::default()};
        let session=Arc::new(Session{view:Mutex::new(view),pending:Mutex::new(None),stopping:AtomicBool::new(false)});
        workbench.rebuilds.insert(owner.clone(),session.clone());drop(workbench);
        let result=(||{let mut staged=stage(&state,&reg,build)?;staged.forerunner_extraction=compiled_extraction;
            if vehicle_test { seal_vehicle_mode(&mut staged, &project)?; }
            if app.get_webview_window(&owner).is_none()||session.stopping.load(Ordering::Relaxed){return Err("The requesting window closed".into());}check_document_owner(&state,&project.id,&owner)?;if lock(&state.library)?.get(&project.id).map_err(error)?.fingerprint().map_err(error)?!=project.fingerprint().map_err(error)?{return Err("Source changed while staging; prepare the saved revision again".into());}if runtime_id==runtime::RuntimeId::OpenCe{forerunner_registration(&state,expected_registration.as_ref(),expected_executable_sha256.as_deref())?;}let run=launch(&state,&reg,staged)?;publish(&session,&run)?;Ok::<_,String>(run)})();
        match result {
            Ok(run)=>{let answer=lock(&session.view)?.clone();std::thread::spawn(move||{let result=drive(app,owner,reg,session.clone(),run);finish_session(&session,result);});Ok(answer)}
            Err(problem)=>{let mut view=lock(&session.view)?;view.phase="failed".into();view.error=Some(problem.clone());Err(problem)}
        }
    }).await.map_err(error)?
}
/// One native build entrypoint for both owned client and dedicated playtests.
/// Callers reserve their own pending slot before entering; source ownership and
/// the selected edition are always checked here, never supplied by a peer.
pub(crate) fn begin_saved_build(app: &tauri::AppHandle, owner: &str, project_id: &str) -> Reply<Pending> {
    let state=app.state::<AppState>();
    check_document_owner(&state,project_id,owner)?;
    let project=lock(&state.library)?.get(project_id).map_err(error)?;
    let selected=project.active_build_target.as_ref().and_then(|id|project.build_targets.iter().find(|t|&t.id==id));
    if !selected.is_some_and(|target|target.runtime_id==runtime::RuntimeId::ChupathingyCe&&target.builder=="invader-ce") {
        return Err("Select the Chupathingy native CE build target in Project setup before Live Rebuild".into());
    }
    let fingerprint=project.fingerprint().map_err(error)?;
    let job_id=if project.quick_forge.is_some(){quickforge_build(app.clone(),project_id.into())}else{begin_build(app.clone(),project_id.into())}?;
    Ok(Pending{job_id,fingerprint})
}
#[tauri::command]
pub(crate) async fn runtime_rebuild_begin(app: tauri::AppHandle, window: tauri::WebviewWindow, session_id: String) -> Reply<View> {
    let owner=window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();let session=owned(&state,&owner,&session_id)?;
        if lock(&session.view)?.runtime_id!=runtime::RuntimeId::ChupathingyCe{return Err("Forerunner has no admitted Live Rebuild restart interface. Stop this owned test, rebuild saved source and start a fresh private test; game revision remains unconfirmed".into());}
        let project_id=lock(&session.view)?.project_id.clone();
        let mut pending=lock(&session.pending)?;
        if pending.is_some()||session.stopping.load(Ordering::Relaxed)||matches!(lock(&session.view)?.phase.as_str(),"failed"|"stopped") {
            return Err("The playtest is stopped or already rebuilding".into());
        }
        let next=begin_saved_build(&app,&owner,&project_id)?;
        let mut view=lock(&session.view)?;
        view.source_fingerprint=next.fingerprint.clone();view.pending_job_id=Some(next.job_id.clone());
        *pending=Some(next);view.phase="rebuilding".into();view.error=None;
        view.detail="Compiling saved source while the previous-good playtest remains active. Only validated matching output will restart it.".into();
        Ok(view.clone())
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
        Arc::new(Session { view:Mutex::new(View{id:id.into(),runtime_id:runtime::RuntimeId::ChupathingyCe,staged_map:String::new(),startup_map:None,vehicle_test:false,required_native_features:vec![],engine_sha256:Default::default(),project_id:project.into(),phase:"running".into(),source_fingerprint:"synthetic".into(),compiled_build_id:"old-good-build".into(),compiled_sha256:"old-good-sha".into(),game_build_id:Some("old-good-build".into()),game_sha256:Some("old-good-sha".into()),process_id:None,pending_job_id:None,detail:String::new(),error:None,console_tail:String::new(),ce_resource_sha256:Default::default()}),pending:Mutex::new(None),stopping:AtomicBool::new(false) })
    }
    #[test]fn console_reader_retains_final_fatal_bytes_and_keeps_its_original_bound(){
        let tail=Arc::new(Mutex::new(Vec::new()));let mut bytes=vec![b'x';65536];bytes.extend_from_slice(b"\nEXCEPTION halt final native diagnostic\n");
        let reader=capture(std::io::Cursor::new(bytes),tail.clone());reader.join().unwrap();let output=lock(&tail).unwrap();
        assert_eq!(output.len(),32768);assert!(String::from_utf8_lossy(&output).ends_with("EXCEPTION halt final native diagnostic\n"));
    }
    #[test]
    fn private_diagnostic_tail_survives_cleanup_and_zero_exit_cannot_hide_native_halt(){
        let dir=tempfile::tempdir().unwrap();let root=dir.path();fs::create_dir_all(root.join("profile/logs")).unwrap();
        let path=root.join("profile/logs/debug.txt");let fault="EXCEPTION halt in c:\\halo\\SOURCE\\cache\\cache_files.c,#298: expected tag group 'DeLa' but got 'schi' for e1234567";
        let mut bytes=vec![b'x';2*DEBUG_TAIL_BYTES];bytes.extend_from_slice(format!("\n{fault}\nwindow closed\n").as_bytes());fs::write(&path,&bytes).unwrap();
        let output=diagnostic_tail(root,runtime::RuntimeId::OpenCe,b"native startup request only\n");
        assert!(output.contains(fault));assert!(output.contains("earlier bytes omitted"));assert!(output.len()<DEBUG_TAIL_BYTES+512);
        assert_eq!(fs::read(&path).unwrap(),bytes);fs::remove_file(path).unwrap();
        let session=session("owned","native");{let mut view=lock(&session.view).unwrap();view.console_tail=output;view.process_id=Some(123);}
        finish_session(&session,Ok(()));let view=lock(&session.view).unwrap();
        assert_eq!(view.phase,"failed");assert!(view.error.as_ref().unwrap().contains("e1234567"));assert!(view.console_tail.contains(fault));
        assert!(view.process_id.is_none()&&view.game_build_id.is_none()&&view.game_sha256.is_none());
        assert_eq!(view.compiled_build_id,"old-good-build");assert_eq!(view.compiled_sha256,"old-good-sha");
    }
    #[test]
    fn diagnostic_capture_uses_only_fixed_owned_paths_and_bounds_invalid_utf8(){
        let dir=tempfile::tempdir().unwrap();let root=dir.path();
        assert_eq!(private_debug_tail(root,runtime::RuntimeId::OpenCe).unwrap(),"");assert_eq!(fs::read_dir(root).unwrap().count(),0);
        fs::create_dir_all(root.join("logs")).unwrap();fs::write(root.join("logs/debug.txt"),"normal shutdown").unwrap();
        assert!(diagnostic_tail(root,runtime::RuntimeId::ChupathingyCe,b"last console message").contains("normal shutdown"));
        assert!(!diagnostic_tail(root,runtime::RuntimeId::OpenCe,b"last console message").contains("normal shutdown"));
        fs::create_dir_all(root.join("profile/logs/debug.txt")).unwrap();let unavailable=diagnostic_tail(root,runtime::RuntimeId::OpenCe,b"kept console");
        assert!(unavailable.contains("kept console")&&unavailable.contains("Private debug log unavailable"));
        assert!(bounded_log_text(&vec![255;65536],32768).len()<=32768);assert!(!bounded_log_text(b"a\0b",16).contains('\0'));
        let session=session("owned","native");lock(&session.view).unwrap().console_tail="optional intro warning\nwindow closed".into();finish_session(&session,Ok(()));
        assert_eq!(lock(&session.view).unwrap().phase,"stopped");assert!(lock(&session.view).unwrap().error.is_none());
        lock(&session.view).unwrap().console_tail="no fatal record".into();finish_session(&session,Err("native child exited unsuccessfully".into()));assert_eq!(lock(&session.view).unwrap().phase,"failed");
    }
    #[cfg(unix)]
    #[test]fn diagnostic_capture_refuses_a_link_outside_owned_output(){
        let dir=tempfile::tempdir().unwrap();let root=dir.path().join("owned");fs::create_dir_all(root.join("logs")).unwrap();
        let protected=dir.path().join("protected");fs::write(&protected,b"private external bytes").unwrap();std::os::unix::fs::symlink(&protected,root.join("logs/debug.txt")).unwrap();
        let output=diagnostic_tail(&root,runtime::RuntimeId::ChupathingyCe,b"owned console");assert!(!output.contains("private external bytes"));assert!(output.contains("unavailable"));assert_eq!(fs::read(protected).unwrap(),b"private external bytes");
    }
    #[test]
    fn forerunner_startup_is_pinned_scoped_and_not_a_game_acknowledgement(){
        let mut command=Command::new("unused-no-process-created");command.env("HALO_START_MAP","inherited_unrelated@ce");
        assert_eq!(apply_forerunner_startup(&mut command,runtime::forerunner_solo_startup_selector(runtime::FORERUNNER_WINDOWS_X64_CURRENT_SHA256,"be_native").unwrap()).unwrap().as_deref(),Some("be_native@ce"));
        let value=command.get_envs().find(|(key,_)|*key=="HALO_START_MAP").unwrap().1.unwrap();assert_eq!(value,"be_native@ce");assert_eq!(command.get_args().count(),0);
        assert_eq!(apply_forerunner_startup(&mut command,runtime::forerunner_solo_startup_selector(runtime::FORERUNNER_WINDOWS_X64_SHA256,"be_native").unwrap()).unwrap(),None);assert!(command.get_envs().find(|(key,_)|*key=="HALO_START_MAP").unwrap().1.is_none());
        assert!(runtime::forerunner_solo_startup_selector(&"0".repeat(64),"be_native").is_err());assert!(runtime::forerunner_solo_startup_selector(runtime::FORERUNNER_WINDOWS_X64_CURRENT_SHA256,"../other").is_err());
        let session=session("owned","map");let mut view=lock(&session.view).unwrap();view.runtime_id=runtime::RuntimeId::OpenCe;
        publish_forerunner(&mut view,runtime::forerunner_solo_startup_selector(runtime::FORERUNNER_WINDOWS_X64_CURRENT_SHA256,"be_native").unwrap(),"be_native").unwrap();assert_eq!(view.startup_map.as_deref(),Some("be_native@ce"));assert_eq!(view.phase,"awaitingMapStartup");assert!(view.game_build_id.is_none()&&view.game_sha256.is_none());
        publish_forerunner(&mut view,runtime::forerunner_solo_startup_selector(runtime::FORERUNNER_WINDOWS_X64_SHA256,"be_native").unwrap(),"be_native").unwrap();assert_eq!(view.phase,"awaitingMapSelection");assert!(view.startup_map.is_none()&&view.game_build_id.is_none()&&view.game_sha256.is_none());
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
    #[test]
    #[ignore="Explicit installed Forerunner/owned CE content; stage and command inspection only, never launches"]
    fn installed_forerunner_staging_verifies_real_banks_and_leaves_originals_unchanged(){
        let (_temporary,state,_project,mut build)=super::super::readiness_tests::fixture();
        let executable=PathBuf::from(std::env::var_os("SPARK_NATIVE_FORERUNNER_EXE").expect("Explicit runtime"));
        let data=PathBuf::from(std::env::var_os("SPARK_NATIVE_FORERUNNER_DATA").expect("Explicit Xbox UI data"));
        let ce=PathBuf::from(std::env::var_os("SPARK_NATIVE_CE_INSTALLATION").expect("Explicit owned CE installation"));
        let map=PathBuf::from(std::env::var_os("SPARK_NATIVE_SOLO_MAP").expect("Explicit independently compiled solo map"));
        let mut registration=runtime::RuntimeRegistration{reviewed_companion:None,id:"native-forerunner-stage".into(),runtime_id:runtime::RuntimeId::OpenCe,root:executable.parent().unwrap().into(),executable:executable.clone(),data_root:Some(data.clone()),version:None,network_version:None};
        let original=maps::hash_file(&executable).unwrap();
        if let Ok(expected)=std::env::var("SPARK_NATIVE_FORERUNNER_REVIEW_SHA256"){
            assert_eq!(original,expected,"Explicit owner-selected snapshot identity");let capabilities=runtime_connections::query_companion_capabilities(&executable,&original).unwrap();let dependency_sha256=runtime::companion_dependency_sha256(&executable,&capabilities).unwrap();registration.reviewed_companion=Some(runtime::CompanionReview{executable_sha256:original.clone(),dependency_sha256,capabilities});runtime_connections::verify_companion_review(&executable,registration.reviewed_companion.as_ref().unwrap()).unwrap();
        }else{assert_eq!(original,runtime::FORERUNNER_WINDOWS_X64_CURRENT_SHA256);}
        let ce_registration=runtime::RuntimeRegistration{reviewed_companion:None,id:"native-ce-source".into(),runtime_id:runtime::RuntimeId::HaloCustomEdition,root:ce.clone(),executable:ce.join("haloce.exe"),data_root:Some(ce.clone()),version:None,network_version:None};
        lock(&state.library).unwrap().set_setting("runtimeRegistrations",&vec![ce_registration]).unwrap();
        let mut protected=vec![executable.clone(),executable.with_file_name("SDL3.dll"),data.join("maps/ui.map"),map.clone()];for name in ["bitmaps.map","sounds.map","loc.map","ui.map"]{protected.push(ce.join("maps").join(name));}
        let hashes=protected.iter().map(|file|maps::hash_file(file).unwrap()).collect::<Vec<_>>();
        build.output=Some(map);build.sha256=Some(hashes[3].clone());build.target="gbx-custom".into();
        let inspection=maps::inspect_map(build.output.as_ref().unwrap(),None).unwrap();assert_eq!((inspection.header.version,inspection.header.scenario_type,inspection.header.extended),(609,0,false));assert!(!inspection.resources.iter().any(|r|r.required)&&!inspection.tags.iter().any(|tag|tag.external),"Real candidate must meet the production self-contained-cache gate");let required=core::creative::compiled_extraction_requirements(build.output.as_ref().unwrap(),&inspection).unwrap().unwrap();
        runtime_connections::query_companion_capabilities(&executable,&original).unwrap().require_native_features(&required).unwrap();
        let mut staged=stage_forerunner(&state,&registration,build).unwrap();let root=staged.root.clone();
        assert_eq!(staged.ce_resource_sha256.len(),3);for (name,sha) in &staged.ce_resource_sha256{assert_eq!(*sha,maps::hash_file(&staged.root.join("data/maps_ce").join(name)).unwrap());}
        staged.forerunner_extraction=true;let command=forerunner_command(&state,&registration,&staged).unwrap();
        let environment=command.get_envs().filter_map(|(key,value)|value.map(|value|(key.to_string_lossy().into_owned(),value.to_string_lossy().into_owned()))).collect::<std::collections::BTreeMap<_,_>>();
        assert_eq!(environment.get("HALO_START_MAP").map(String::as_str),Some("be_native@ce"));assert_eq!(environment.get("HALO_EXTRACTION").map(String::as_str),Some("true"));assert_eq!(environment.get("HALO_NET_COOP_SCRIPT_ADAPTATIONS").map(String::as_str),Some("false"));assert_eq!(environment.get("HALO_NET_FIREFIGHT_ENCOUNTER").map(String::as_str),Some("false"));
        for key in ["HALO_DATA_ROOT","HALO_SAVE_ROOT","HALO_LOG_ROOT","HALO_CACHE_ROOT"]{assert!(Path::new(&environment[key]).canonicalize().unwrap().starts_with(root.canonicalize().unwrap()));}
        assert!(command.get_program().to_string_lossy().contains("runtime-playtests"));assert_eq!(command.get_args().count(),2);assert_eq!(command.get_args().next().unwrap(),"--config");assert!(Path::new(command.get_args().nth(1).unwrap()).canonicalize().unwrap().starts_with(root.canonicalize().unwrap()));
        let staged_map=staged.root.join(format!("data/maps_ce/{}.map",staged.map));fs::write(&staged_map,b"changed owned candidate").unwrap();assert!(forerunner_command(&state,&registration,&staged).unwrap_err().contains("changed before launch"));
        drop(staged);assert!(!root.exists());assert_eq!(hashes,protected.iter().map(|file|maps::hash_file(file).unwrap()).collect::<Vec<_>>());
        eprintln!("Native Forerunner staging/command/refusal/disposal PASS: current exact executable, independent SDL3,3 real CE banks and original hashes unchanged; no process/game launched");
    }

}
