use notify::Watcher;
use serde::{Deserialize, Serialize};
use spark_core::{
    self as core, assets,
    build::{self, JobEvent, Toolchain},
    library::{Library, LibraryEntry},
    maps::{self, MapInspection, MeshData},
    mcc::{self, ManagedRoot},
    project::{self, Asset, BuildRecord, Project},
    steam::{self, Installation},
};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{Emitter, Manager, State};
type Reply<T> = std::result::Result<T, String>;
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Settings {
    steam_directory: Option<PathBuf>,
    mcc_directory: Option<PathBuf>,
    invader_directory: Option<PathBuf>,
    resource_directory: Option<PathBuf>,
    metadata_template_directory: Option<PathBuf>,
    native_executable: Option<PathBuf>,
    auto_build: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            steam_directory: None,
            mcc_directory: None,
            invader_directory: None,
            resource_directory: None,
            metadata_template_directory: None,
            native_executable: None,
            auto_build: true,
        }
    }
}
impl Settings {
    fn tools(&self) -> Toolchain {
        Toolchain {
            invader_directory: self.invader_directory.clone(),
            resource_directory: self.resource_directory.clone(),
        }
    }
}
struct AppState {
    root: PathBuf,
    library: Mutex<Library>,
    settings: Mutex<Settings>,
    installation: Mutex<Installation>,
    managed: Mutex<Option<ManagedRoot>>,
    watcher: Mutex<Option<notify::RecommendedWatcher>>,
    inspections: Mutex<HashMap<String, Arc<MapInspection>>>,
    jobs: Mutex<HashMap<String, Arc<AtomicBool>>>,
    logs: Mutex<Vec<JobEvent>>,
    diagnostics: Mutex<Vec<String>>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Bootstrap {
    api_version: u32,
    installation: Installation,
    managed: Option<ManagedRoot>,
    settings: Settings,
    entries: Vec<LibraryEntry>,
    data_directory: PathBuf,
    diagnostics: Vec<String>,
    logs: Vec<JobEvent>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenProject {
    project: Project,
    inspection: Option<MapInspection>,
}
fn lock<T>(m: &Mutex<T>) -> Reply<std::sync::MutexGuard<'_, T>> {
    m.lock()
        .map_err(|_| "Application state lock was interrupted; restart Guilty Spark".into())
}
fn inspect(state: &AppState, p: &Project) -> Reply<Arc<MapInspection>> {
    if let Some(i) = lock(&state.inspections)?.get(&p.id) {
        return Ok(i.clone());
    }
    let source = p
        .source
        .as_ref()
        .ok_or("This is an asset workspace without a Halo map")?;
    let settings = lock(&state.settings)?.clone();
    let resources = settings
        .resource_directory
        .as_deref()
        .or(source.original_path.parent());
    let mut inspected = maps::inspect_map(&source.preserved_path, resources).map_err(error)?;
    inspected.header.extended |= source
        .original_path
        .extension()
        .is_some_and(|x| x.eq_ignore_ascii_case("yelo"));
    let i = Arc::new(inspected);
    if i.sha256 != source.sha256 {
        return Err(
            "Preserved source checksum changed. Restore the original map before continuing.".into(),
        );
    }
    lock(&state.inspections)?.insert(p.id.clone(), i.clone());
    Ok(i)
}
#[tauri::command]
fn bootstrap(state: State<AppState>) -> Reply<Bootstrap> {
    Ok(Bootstrap {
        api_version: 1,
        installation: lock(&state.installation)?.clone(),
        managed: lock(&state.managed)?.clone(),
        settings: lock(&state.settings)?.clone(),
        entries: lock(&state.library)?.list().map_err(error)?,
        data_directory: state.root.clone(),
        diagnostics: lock(&state.diagnostics)?.clone(),
        logs: lock(&state.logs)?.clone(),
    })
}
#[tauri::command]
async fn open_project(app: tauri::AppHandle, id: String) -> Reply<OpenProject> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let p = lock(&state.library)?.get(&id).map_err(error)?;
        let i = if p.source.is_some() {
            Some((*inspect(&state, &p)?).clone())
        } else {
            None
        };
        Ok(OpenProject {
            project: p,
            inspection: i,
        })
    })
    .await
    .map_err(error)?
}
#[tauri::command]
fn create_project(state: State<AppState>, title: String) -> Reply<OpenProject> {
    let p = lock(&state.library)?.create(&title).map_err(error)?;
    Ok(OpenProject {
        project: p,
        inspection: None,
    })
}
fn import_one(state: &AppState, path: &Path) -> Reply<OpenProject> {
    let ext = path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    let settings = lock(&state.settings)?.clone();
    let (p, i) = if ext == "gsproject" {
        let p = lock(&state.library)?.import_project(path).map_err(error)?;
        let i = if p.source.is_some() {
            Some((*inspect(state, &p)?).clone())
        } else {
            None
        };
        (p, i)
    } else if ext == "map" || ext == "yelo" {
        let (p, i) = lock(&state.library)?
            .import_map(path, settings.resource_directory.as_deref())
            .map_err(error)?;
        lock(&state.inspections)?.insert(p.id.clone(), Arc::new(i.clone()));
        (p, Some(i))
    } else {
        return Err("Choose a .map, .yelo or .gsproject file. OBJ meshes are imported from the Asset Workshop.".into());
    };
    Ok(OpenProject {
        project: p,
        inspection: i,
    })
}
#[tauri::command]
async fn import_paths(app: tauri::AppHandle, paths: Vec<PathBuf>) -> Reply<Vec<OpenProject>> {
    if paths.len() > 16 {
        return Err("Import at most 16 files at a time".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut opened=vec![];let mut failures=vec![];
        for path in paths { match import_one(&state,&path) { Ok(project)=>opened.push(project),Err(e)=>failures.push(format!("{}: {e}",path.display())) } }
        if !failures.is_empty(){Err(format!("Imported {} project(s); {} file(s) were rejected. Successfully imported projects are preserved in the library.\n{}",opened.len(),failures.len(),failures.join("\n")))}else{Ok(opened)}
    })
    .await
    .map_err(error)?
}
#[tauri::command]
async fn import_dialog(app: tauri::AppHandle) -> Reply<Vec<OpenProject>> {
    let files = rfd::AsyncFileDialog::new()
        .set_title("Import Halo maps or Guilty Spark projects")
        .add_filter(
            "Halo maps / Guilty Spark projects",
            &["map", "yelo", "gsproject"],
        )
        .pick_files()
        .await;
    if let Some(files) = files {
        import_paths(app, files.into_iter().map(|f| f.path().into()).collect()).await
    } else {
        Ok(vec![])
    }
}
#[tauri::command]
fn save_project(state: State<AppState>, mut project: Project) -> Reply<LibraryEntry> {
    let existing = lock(&state.library)?.get(&project.id).map_err(error)?;
    project.source = existing.source;
    project.assets = existing.assets;
    project.builds = existing.builds;
    project.created_at = existing.created_at;
    if project.source.is_some() {
        project::validate_edits(&project, &*inspect(&state, &project)?).map_err(error)?;
    }
    project.modified_at = chrono::Utc::now().to_rfc3339();
    lock(&state.library)?.save(&project, None).map_err(error)
}
#[tauri::command]
async fn export_project(app: tauri::AppHandle, id: String) -> Reply<Option<PathBuf>> {
    let p = {
        let state = app.state::<AppState>();
        let p = lock(&state.library)?.get(&id).map_err(error)?;
        p
    };
    let chosen = rfd::AsyncFileDialog::new()
        .set_title("Export project descriptor")
        .set_file_name(format!(
            "{}.gsproject",
            p.title.replace(['\\', '/', ':'], "_")
        ))
        .add_filter("Guilty Spark project", &["gsproject"])
        .save_file()
        .await;
    if let Some(file) = chosen {
        let path = file.path().to_path_buf();
        if path.extension().is_none_or(|x| x != "gsproject") {
            return Err("Project descriptors must end in .gsproject".into());
        }
        if path.exists() {
            let previous = project::load_project(&path).map_err(|_| {
                "The selected file is not a Guilty Spark project; it will not be overwritten"
            })?;
            if previous.id != p.id {
                return Err(
                    "That descriptor belongs to a different project. Choose a new filename.".into(),
                );
            }
        }
        project::save_project(&path, &p).map_err(error)?;
        Ok(Some(path))
    } else {
        Ok(None)
    }
}
#[tauri::command]
async fn choose_setting_path(key: String) -> Reply<Option<PathBuf>> {
    if key == "nativeExecutable" {
        return Ok(rfd::AsyncFileDialog::new()
            .set_title("Choose a separately installed native Halo runtime executable")
            .pick_file()
            .await
            .map(|f| f.path().into()));
    }
    if ![
        "steamDirectory",
        "mccDirectory",
        "invaderDirectory",
        "resourceDirectory",
        "metadataTemplateDirectory",
    ]
    .contains(&key.as_str())
    {
        return Err("Unknown path preference".into());
    }
    Ok(rfd::AsyncFileDialog::new()
        .set_title("Choose folder")
        .pick_folder()
        .await
        .map(|f| f.path().into()))
}
fn configure(app: &tauri::AppHandle, state: &AppState, settings: Settings) -> Reply<()> {
    for p in [
        &settings.steam_directory,
        &settings.mcc_directory,
        &settings.invader_directory,
        &settings.resource_directory,
        &settings.metadata_template_directory,
    ]
    .into_iter()
    .flatten()
    {
        if !p.is_absolute() || !p.is_dir() {
            return Err(format!("Folder is unavailable: {}", p.display()));
        }
    }
    lock(&state.library)?
        .set_setting("preferences", &settings)
        .map_err(error)?;
    *lock(&state.settings)? = settings.clone();
    lock(&state.inspections)?.clear();
    let installation = steam::discover(
        settings.steam_directory.as_deref(),
        settings.mcc_directory.as_deref(),
    );
    let root = installation
        .mcc_path
        .as_ref()
        .and_then(|path| match mcc::initialize(path) {
            Ok(root) => Some(root),
            Err(e) => {
                if let Ok(mut d) = state.diagnostics.lock() {
                    d.push(e.to_string());
                }
                None
            }
        });
    *lock(&state.installation)? = installation;
    *lock(&state.managed)? = root;
    start_watcher(app, state)?;
    Ok(())
}
#[tauri::command]
fn save_settings(
    app: tauri::AppHandle,
    state: State<AppState>,
    settings: Settings,
) -> Reply<Bootstrap> {
    configure(&app, &state, settings)?;
    bootstrap(state)
}
#[tauri::command]
fn refresh_installation(app: tauri::AppHandle, state: State<AppState>) -> Reply<Bootstrap> {
    let settings = lock(&state.settings)?.clone();
    configure(&app, &state, settings)?;
    bootstrap(state)
}
#[tauri::command]
fn compatibility(state: State<AppState>, id: String) -> Reply<build::CompatibilityReport> {
    let p = lock(&state.library)?.get(&id).map_err(error)?;
    let i = inspect(&state, &p)?;
    Ok(build::compatibility(
        &p,
        &i,
        &lock(&state.settings)?.tools(),
    ))
}
fn event(app: &tauri::AppHandle, e: JobEvent) {
    let state = app.state::<AppState>();
    if let Ok(mut logs) = state.logs.lock() {
        logs.push(e.clone());
        if logs.len() > 2000 {
            logs.drain(0..500);
        }
    }
    let _ = app.emit("spark:job", &e);
    let logs = state.root.join("logs");
    if fs::create_dir_all(&logs).is_ok() {
        use std::io::Write;
        if let Ok(mut f) = fs::OpenOptions::new()
            .append(true)
            .create(true)
            .open(logs.join(format!("{}.jsonl", e.job_id)))
        {
            if let Ok(line) = serde_json::to_string(&e) {
                let _ = writeln!(f, "{line}");
            }
        }
    }
}
fn begin_build(app: tauri::AppHandle, id: String) -> Reply<String> {
    let state = app.state::<AppState>();
    let project = lock(&state.library)?.get(&id).map_err(error)?;
    let inspection = inspect(&state, &project)?;
    let tools = lock(&state.settings)?.tools();
    let report = build::compatibility(&project, &inspection, &tools);
    if !report.ready {
        return Err(report.blockers.join("\n"));
    }
    let job_id = uuid::Uuid::new_v4().to_string();
    let cancel = Arc::new(AtomicBool::new(false));
    let mut running = lock(&state.jobs)?;
    if !running.is_empty() {
        return Err(
            "One conversion job is already running. Cancel it or wait for completion.".into(),
        );
    }
    running.insert(job_id.clone(), cancel.clone());
    drop(running);
    let jobs = state.root.join("jobs");
    let returned = job_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let record = build::run_build(&project, &inspection, &tools, &jobs, &job_id, cancel, |e| {
            event(&app, e)
        });
        let state = app.state::<AppState>();
        match record {
            Ok(record) => {
                if let Ok(lib) = state.library.lock() {
                    if let Ok(mut current) = lib.get(&id) {
                        current.builds.push(record);
                        current.modified_at = chrono::Utc::now().to_rfc3339();
                        let _ = lib.save(&current, None);
                    }
                }
            }
            Err(e) => event(
                &app,
                JobEvent {
                    job_id: job_id.clone(),
                    project_id: id.clone(),
                    phase: "failed".into(),
                    severity: "error".into(),
                    message: e.to_string(),
                    progress: 100,
                    timestamp: chrono::Utc::now().to_rfc3339(),
                },
            ),
        }
        if let Ok(mut jobs) = state.jobs.lock() {
            jobs.remove(&job_id);
        }
        let _ = app.emit("spark:library-changed", ());
    });
    Ok(returned)
}
#[tauri::command]
fn start_build(app: tauri::AppHandle, id: String) -> Reply<String> {
    begin_build(app, id)
}
#[tauri::command]
async fn validate_existing(app: tauri::AppHandle, id: String) -> Reply<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let p = lock(&state.library)?.get(&id).map_err(error)?;
        let i = inspect(&state, &p)?;
        let tools = lock(&state.settings)?.tools();
        let job_id = uuid::Uuid::new_v4().to_string();
        let cancel = Arc::new(AtomicBool::new(false));
        let mut running = lock(&state.jobs)?;
        if !running.is_empty() {
            return Err("Wait for the active conversion job".into());
        }
        running.insert(job_id.clone(), cancel.clone());
        drop(running);
        let result = build::validate_existing_mcc(
            &p,
            &i,
            &tools,
            &state.root.join("jobs"),
            &job_id,
            cancel,
            |e| event(&app, e),
        );
        lock(&state.jobs)?.remove(&job_id);
        match result {
            Ok(r) => {
                let lib = lock(&state.library)?;
                let mut current = lib.get(&id).map_err(error)?;
                current.builds.push(r.clone());
                lib.save(&current, None).map_err(error)?;
                drop(lib);
                let _ = app.emit("spark:library-changed", ());
                Ok(r.message)
            }
            Err(e) => {
                let message = e.to_string();
                event(
                    &app,
                    JobEvent {
                        job_id,
                        project_id: id,
                        phase: "failed".into(),
                        severity: "error".into(),
                        message: message.clone(),
                        progress: 100,
                        timestamp: chrono::Utc::now().to_rfc3339(),
                    },
                );
                Err(message)
            }
        }
    })
    .await
    .map_err(error)?
}
#[tauri::command]
fn cancel_build(state: State<AppState>, job_id: String) -> Reply<()> {
    let jobs = lock(&state.jobs)?;
    let cancel = jobs.get(&job_id).ok_or("Build is no longer active")?;
    cancel.store(true, Ordering::Relaxed);
    Ok(())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AssetResult {
    project: Project,
    asset: Asset,
    mesh: MeshData,
    warnings: Vec<String>,
}
#[tauri::command]
async fn import_asset(app: tauri::AppHandle, id: String) -> Reply<Option<AssetResult>> {
    let file = rfd::AsyncFileDialog::new()
        .set_title("Import OBJ geometry into the Asset Workshop")
        .add_filter("Wavefront OBJ", &["obj"])
        .pick_file()
        .await;
    let Some(file) = file else { return Ok(None) };
    let path = file.path().to_path_buf();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let meta = fs::metadata(&path).map_err(error)?;
        if meta.len() > 64 * 1024 * 1024 {
            return Err("OBJ exceeds 64 MiB".into());
        }
        let imported =
            assets::parse_obj(&fs::read_to_string(&path).map_err(error)?).map_err(error)?;
        let lib = lock(&state.library)?;
        let mut p = lib.get(&id).map_err(error)?;
        let asset_id = uuid::Uuid::new_v4().to_string();
        let dir = lib.project_dir(&id).map_err(error)?.join("assets");
        core::reject_links(&dir).map_err(error)?;
        fs::create_dir_all(&dir).map_err(error)?;
        let raw = dir.join(format!("{asset_id}.obj"));
        fs::copy(&path, &raw).map_err(error)?;
        let asset = Asset {
            id: asset_id.clone(),
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            kind: "obj".into(),
            sha256: maps::hash_file(&raw).map_err(error)?,
            path: raw,
            vertices: imported.mesh.positions.len() / 3,
            triangles: imported.mesh.indices.len() / 3,
            has_uvs: imported.has_uvs,
            materials: imported.materials,
        };
        project::atomic_write(
            &dir.join(format!("{asset_id}.mesh.json")),
            &serde_json::to_vec(&imported.mesh).map_err(error)?,
            false,
        )
        .map_err(error)?;
        p.assets.push(asset.clone());
        p.scene.push(maps::SceneObject {
            id: format!("asset-{}", uuid::Uuid::new_v4()),
            name: asset.name.clone(),
            kind: "Workshop mesh".into(),
            tag_id: None,
            position: [0.; 3],
            rotation: [0.; 3],
            scale: [1.; 3],
            visible: true,
            source_offset: None,
            rotation_offset: None,
            asset_id: Some(asset_id),
        });
        p.modified_at = chrono::Utc::now().to_rfc3339();
        lib.save(&p, None).map_err(error)?;
        Ok(Some(AssetResult {
            project: p,
            asset,
            mesh: imported.mesh,
            warnings: imported.warnings,
        }))
    })
    .await
    .map_err(error)?
}
#[tauri::command]
fn asset_mesh(state: State<AppState>, id: String, asset_id: String) -> Reply<MeshData> {
    uuid::Uuid::parse_str(&asset_id).map_err(error)?;
    let lib = lock(&state.library)?;
    let p = lib.get(&id).map_err(error)?;
    if !p.assets.iter().any(|a| a.id == asset_id) {
        return Err("Asset does not belong to this project".into());
    }
    let file = lib
        .project_dir(&id)
        .map_err(error)?
        .join("assets")
        .join(format!("{asset_id}.mesh.json"));
    let bytes = fs::read(file).map_err(error)?;
    serde_json::from_slice(&bytes).map_err(error)
}
#[tauri::command]
fn inspect_template(state: State<AppState>, id: String) -> Reply<mcc::TemplateReport> {
    let p = lock(&state.library)?.get(&id).map_err(error)?;
    let i = inspect(&state, &p)?;
    let template = lock(&state.settings)?
        .metadata_template_directory
        .clone()
        .ok_or("Choose an unpublished Excession metadata template folder in Settings")?;
    mcc::inspect_template(&template, &i.scenario_path, i.header.scenario_type).map_err(error)
}
#[tauri::command]
fn install_package(state: State<AppState>, id: String, build_id: String) -> Reply<PathBuf> {
    uuid::Uuid::parse_str(&build_id).map_err(error)?;
    let lib = lock(&state.library)?;
    let p = lib.get(&id).map_err(error)?;
    let receipt: BuildRecord = serde_json::from_slice(
        &fs::read(state.root.join("jobs").join(&build_id).join("receipt.json")).map_err(error)?,
    )
    .map_err(error)?;
    if !p.builds.iter().any(|b| b.id == build_id)
        || receipt.status != "validated"
        || receipt.project_fingerprint != p.fingerprint().map_err(error)?
    {
        return Err("Select a validated build of the current saved project".into());
    }
    let output = receipt.output.ok_or("Validated build has no map output")?;
    let expected = state.root.join("jobs").join(&build_id).join("output");
    if output.parent() != Some(expected.as_path())
        || Some(maps::hash_file(&output).map_err(error)?) != receipt.sha256
    {
        return Err("Build output integrity failed".into());
    }
    let root = lock(&state.managed)?
        .clone()
        .ok_or("MCC's managed mod root is unavailable")?;
    let template = lock(&state.settings)?
        .metadata_template_directory
        .clone()
        .ok_or("Choose an Excession metadata template in Settings")?;
    let manifest = lock(&state.installation)?
        .manifest_path
        .clone()
        .ok_or("MCC manifest registration is available on Windows")?;
    let package = mcc::package(&root, &template, &output, &p, &build_id).map_err(error)?;
    if let Err(e) = mcc::register_root(&manifest, &root.mods) {
        let _ = mcc::remove_package(&root, &p);
        return Err(format!(
            "Registration failed and the new owned package was rolled back: {e}"
        ));
    }
    Ok(package)
}
#[tauri::command]
fn remove_package(state: State<AppState>, id: String) -> Reply<()> {
    let p = lock(&state.library)?.get(&id).map_err(error)?;
    let root = lock(&state.managed)?.clone().ok_or("No managed mod root")?;
    mcc::remove_package(&root, &p).map_err(error)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Readiness {
    mcc_found: bool,
    halo1_installed: bool,
    steam_available: bool,
    package_valid: bool,
    registered: bool,
    running: bool,
    launch_ready: bool,
    message: String,
}
#[tauri::command]
fn launch_readiness(state: State<AppState>, id: String) -> Reply<Readiness> {
    let p = lock(&state.library)?.get(&id).map_err(error)?;
    let install = lock(&state.installation)?.clone();
    let root = lock(&state.managed)?.clone();
    let package_valid = root
        .as_ref()
        .is_some_and(|r| mcc::verify_package(r, &p).is_ok());
    let registered = match (root.as_ref(), install.manifest_path.as_ref()) {
        (Some(r), Some(m)) => mcc::manifest_contains(m, &r.mods).unwrap_or(false),
        _ => false,
    };
    let ready = install.halo1_installed
        && install.steam_executable.is_some()
        && package_valid
        && registered;
    Ok(Readiness{mcc_found:install.mcc_path.is_some(),halo1_installed:install.halo1_installed,steam_available:install.steam_executable.is_some(),package_valid,registered,running:steam::is_mcc_running(),launch_ready:ready,message:if ready{"Choose ‘Play Halo: MCC Anti-Cheat Disabled (Mods and Limited Services)’ in Steam. Launch mode and in-game load remain unverified."}else{"Build and install a validated local package before launching this project. Live editing, VR, and multiplayer AI replication are not implemented for MCC."}.into()})
}
#[tauri::command]
fn launch_mcc(state: State<AppState>, id: String) -> Reply<String> {
    let ready = launch_readiness(state.clone(), id)?;
    if !ready.launch_ready {
        return Err(ready.message);
    }
    if ready.running {
        return Err(
            "MCC is already running. Close it and launch again so it enumerates new mods.".into(),
        );
    }
    steam::launch_steam(&*lock(&state.installation)?).map_err(error)?;
    Ok(ready.message)
}
#[tauri::command]
fn launch_native(state: State<AppState>) -> Reply<String> {
    let executable = lock(&state.settings)?
        .native_executable
        .clone()
        .ok_or("Select a user-installed native runtime executable in Settings")?;
    if !executable.is_file() {
        return Err("Native runtime executable is unavailable".into());
    }
    steam::command(executable.to_string_lossy().as_ref())
        .current_dir(executable.parent().unwrap_or(Path::new(".")))
        .spawn()
        .map_err(error)?;
    Ok("Opened the configured runtime. Map deployment, live operations, network compatibility, and VR are not verified by Guilty Spark.".into())
}
#[tauri::command]
fn reveal_folder(state: State<AppState>, kind: String, id: Option<String>) -> Reply<()> {
    let path = match kind.as_str() {
        "inbox" => lock(&state.managed)?
            .as_ref()
            .map(|r| r.inbox.clone())
            .ok_or("MCC Inbox is unavailable")?,
        "data" => state.root.clone(),
        "project" => lock(&state.library)?
            .project_dir(&id.ok_or("Missing project ID")?)
            .map_err(error)?,
        _ => return Err("Unknown folder shortcut".into()),
    };
    if !path.is_dir() {
        return Err("Folder does not exist".into());
    }
    #[cfg(windows)]
    {
        steam::command("explorer.exe")
            .arg(&path)
            .spawn()
            .map_err(error)?;
    }
    #[cfg(target_os = "macos")]
    {
        steam::command("open").arg(&path).spawn().map_err(error)?;
    }
    #[cfg(target_os = "linux")]
    {
        steam::command("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(error)?;
    }
    Ok(())
}
fn start_watcher(app: &tauri::AppHandle, state: &AppState) -> Reply<()> {
    *lock(&state.watcher)? = None;
    let Some(root) = lock(&state.managed)?.clone() else {
        return Ok(());
    };
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = notify::recommended_watcher(move |event| {
        let _ = tx.send(event);
    })
    .map_err(error)?;
    watcher
        .watch(&root.inbox, notify::RecursiveMode::NonRecursive)
        .map_err(error)?;
    *lock(&state.watcher)? = Some(watcher);
    let app = app.clone();
    std::thread::spawn(move || {
        let mut observed: HashMap<PathBuf, (u64, std::time::SystemTime)> = HashMap::new();
        loop {
            match rx.recv_timeout(Duration::from_secs(2)) {
                Ok(_) => {}
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                Err(_) => break,
            }
            let Ok(entries) = fs::read_dir(&root.inbox) else {
                continue;
            };
            let mut present = std::collections::HashSet::new();
            for entry in entries.flatten() {
                let path = entry.path();
                present.insert(path.clone());
                let Some(ext) = path.extension() else {
                    continue;
                };
                if !ext.eq_ignore_ascii_case("map") && !ext.eq_ignore_ascii_case("yelo") {
                    continue;
                }
                let Ok(meta) = entry.metadata() else { continue };
                if !meta.is_file() {
                    continue;
                }
                let stamp = (meta.len(), meta.modified().unwrap_or(std::time::UNIX_EPOCH));
                if observed.get(&path) != Some(&stamp) {
                    observed.insert(path.clone(), stamp);
                    continue;
                }
                let state = app.state::<AppState>();
                let key = format!("inbox:{}:{}:{:?}", path.display(), stamp.0, stamp.1);
                let already = state
                    .library
                    .lock()
                    .ok()
                    .and_then(|lib| lib.setting::<bool>(&key).ok())
                    .unwrap_or(false);
                if already {
                    continue;
                }
                let result = import_one(&state, &path);
                if let Ok(lib) = state.library.lock() {
                    let _ = lib.set_setting(&key, &true);
                }
                match result {
                    Ok(open) => {
                        let _ = app.emit("spark:imported", &open.project.id);
                        let _ = app.emit("spark:library-changed", ());
                        let auto = state.settings.lock().map(|s| s.auto_build).unwrap_or(false);
                        if auto {
                            if let Err(e) = begin_build(app.clone(), open.project.id.clone()) {
                                event(&app,JobEvent{job_id:uuid::Uuid::new_v4().to_string(),project_id:open.project.id,phase:"blocked".into(),severity:"warning".into(),message:format!("Inbox import succeeded; automatic conversion blocked: {e}"),progress:0,timestamp:chrono::Utc::now().to_rfc3339()});
                            }
                        }
                    }
                    Err(e) => {
                        event(
                            &app,
                            JobEvent {
                                job_id: uuid::Uuid::new_v4().to_string(),
                                project_id: String::new(),
                                phase: "import".into(),
                                severity: "error".into(),
                                message: format!("{}: {e}", path.display()),
                                progress: 0,
                                timestamp: chrono::Utc::now().to_rfc3339(),
                            },
                        );
                    }
                }
            }
            observed.retain(|p, _| present.contains(p));
        }
    });
    Ok(())
}
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let root = std::env::var_os("GUILTY_SPARK_DATA_DIR")
                .map(PathBuf::from)
                .unwrap_or(app.path().app_local_data_dir()?);
            let library = Library::open(&root)?;
            let settings: Settings = library.setting("preferences")?;
            let installation = steam::discover(
                settings.steam_directory.as_deref(),
                settings.mcc_directory.as_deref(),
            );
            app.manage(AppState {
                root,
                library: Mutex::new(library),
                settings: Mutex::new(settings.clone()),
                installation: Mutex::new(installation),
                managed: Mutex::new(None),
                watcher: Mutex::new(None),
                inspections: Mutex::new(HashMap::new()),
                jobs: Mutex::new(HashMap::new()),
                logs: Mutex::new(vec![]),
                diagnostics: Mutex::new(vec![]),
            });
            if let Err(e) = configure(app.handle(), &app.state::<AppState>(), settings) {
                if let Ok(mut d) = app.state::<AppState>().diagnostics.lock() {
                    d.push(e);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            open_project,
            create_project,
            import_paths,
            import_dialog,
            save_project,
            export_project,
            choose_setting_path,
            save_settings,
            refresh_installation,
            compatibility,
            start_build,
            validate_existing,
            cancel_build,
            import_asset,
            asset_mesh,
            inspect_template,
            install_package,
            remove_package,
            launch_readiness,
            launch_mcc,
            launch_native,
            reveal_folder
        ])
        .run(tauri::generate_context!())
        .expect("Guilty Spark could not start");
}
