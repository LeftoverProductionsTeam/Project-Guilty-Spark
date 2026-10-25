use notify::Watcher;
use serde::{Deserialize, Serialize};
use spark_core::{
    self as core, archive, assets, audio,
    build::{self, JobEvent, Toolchain},
    library::{Library, LibraryEntry},
    maps::{self, MapInspection, MeshData},
    mcc::{self, ManagedRoot},
    multiplayer,
    project::{self, Asset, BuildRecord, Project},
    runtime,
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
    inbox_directory: PathBuf,
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
fn project_tools(state: &AppState, project: &Project) -> Reply<Toolchain> {
    let mut tools = lock(&state.settings)?.tools();
    if let Some(resources) = project
        .source
        .as_ref()
        .and_then(|s| s.resource_directory.clone())
    {
        tools.resource_directory = Some(resources);
    }
    Ok(tools)
}
fn bounded_read(path: &Path, limit: u64) -> Reply<Vec<u8>> {
    use std::io::Read;
    core::reject_links(path).map_err(error)?;
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(error)?
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(error)?;
    if bytes.len() as u64 > limit {
        return Err("File exceeds the supported read limit".into());
    }
    Ok(bytes)
}
fn verified_build(state: &AppState, project: &Project, id: &str) -> Reply<BuildRecord> {
    uuid::Uuid::parse_str(id).map_err(error)?;
    if !project
        .builds
        .iter()
        .any(|b| b.id == id && b.status == "validated")
    {
        return Err("Build does not belong to this project's validated history".into());
    }
    let dir = state.root.join("jobs").join(id);
    let record: BuildRecord =
        serde_json::from_slice(&bounded_read(&dir.join("receipt.json"), 1024 * 1024)?)
            .map_err(error)?;
    if record.id != id
        || record.status != "validated"
        || record.project_fingerprint != project.fingerprint().map_err(error)?
    {
        return Err(
            "Build is stale or its receipt is invalid; rebuild the current saved project".into(),
        );
    }
    let output = record.output.as_ref().ok_or("Build has no output")?;
    core::reject_links(output).map_err(error)?;
    if output.parent() != Some(dir.join("output").as_path())
        || Some(maps::hash_file(output).map_err(error)?) != record.sha256
    {
        return Err("Build output integrity failed".into());
    }
    Ok(record)
}
fn current_build(state: &AppState, project: &Project) -> Reply<BuildRecord> {
    let mut message = "No validated build of the current saved project is available".to_string();
    for build in project
        .builds
        .iter()
        .rev()
        .filter(|b| b.status == "validated")
    {
        match verified_build(state, project, &build.id) {
            Ok(record) => return Ok(record),
            Err(e) => message = e,
        }
    }
    Err(message)
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
    let resources = source
        .resource_directory
        .as_deref()
        .or(settings.resource_directory.as_deref())
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
        inbox_directory: state.root.join("Inbox"),
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
fn import_file(state: &AppState, path: &Path) -> Reply<Vec<OpenProject>> {
    if !path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("zip"))
    {
        return import_one(state, path).map(|p| vec![p]);
    }
    let mut imported = archive::import_archive(path, &state.root).map_err(error)?;
    let mut opened = vec![];
    let mut diagnostics = imported.inventory.diagnostics.clone();
    for entry in &imported.inventory.entries {
        for message in &entry.diagnostics {
            diagnostics.push(format!("{}: {message}", entry.name));
        }
    }
    for candidate in &imported.maps {
        let settings = lock(&state.settings)?.clone();
        let resources = candidate
            .resource_directory
            .as_deref()
            .or(settings.resource_directory.as_deref());
        let result = lock(&state.library)?.import_map(&candidate.path, resources);
        match result {
            Ok((mut p, i)) => {
                if let Some(source) = p.source.as_mut() {
                    if source.archive.is_none() {
                        source.archive = Some(project::ArchiveOrigin {
                            original_path: imported.original_path.clone(),
                            sha256: imported.sha256.clone(),
                            entry_path: candidate.entry_path.clone(),
                        });
                    }
                }
                lock(&state.library)?.save(&p, Some(&i)).map_err(error)?;
                lock(&state.inspections)?.insert(p.id.clone(), Arc::new(i.clone()));
                opened.push(OpenProject {
                    project: p,
                    inspection: Some(i),
                });
            }
            Err(e) => diagnostics.push(format!("{}: {e}", candidate.entry_path)),
        }
    }
    diagnostics.push(format!("ZIP preserved: {} entries inventoried; {} supported scenario(s) imported. Executables and DLLs were not extracted or run.", imported.inventory.entries.len(), opened.len()));
    imported.inventory.diagnostics = diagnostics.clone();
    lock(&state.library)?
        .set_setting(&format!("archive:{}", imported.sha256), &imported)
        .map_err(error)?;
    let report = serde_json::json!({"schemaVersion":1,"archiveSha256":imported.sha256,"projects":opened.iter().map(|o|&o.project.id).collect::<Vec<_>>(),"diagnostics":diagnostics});
    project::atomic_write(
        &imported.root.join("import-report.json"),
        &serde_json::to_vec_pretty(&report).map_err(error)?,
        false,
    )
    .map_err(error)?;
    lock(&state.diagnostics)?.extend(diagnostics.clone());
    if opened.is_empty() {
        return Err(format!(
            "ZIP preserved at {} but no supported scenarios could be imported. {}",
            imported.root.display(),
            diagnostics.join("\n")
        ));
    }
    Ok(opened)
}
#[tauri::command]
async fn import_paths(app: tauri::AppHandle, paths: Vec<PathBuf>) -> Reply<Vec<OpenProject>> {
    if paths.len() > 16 {
        return Err("Import at most 16 files at a time".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut opened=vec![];let mut failures=vec![];
        for path in paths { match import_file(&state,&path) { Ok(projects)=>opened.extend(projects),Err(e)=>failures.push(format!("{}: {e}",path.display())) } }
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
            &["map", "yelo", "gsproject", "zip"],
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
#[tauri::command]
async fn choose_project_resources(
    app: tauri::AppHandle,
    project_id: String,
) -> Reply<Option<OpenProject>> {
    let chosen = rfd::AsyncFileDialog::new()
        .set_title("Choose original runtime resources for this project")
        .pick_folder()
        .await;
    let Some(chosen) = chosen else {
        return Ok(None);
    };
    let folder = chosen.path().to_path_buf();
    tauri::async_runtime::spawn_blocking(move || {
        core::reject_links(&folder).map_err(error)?;
        let state = app.state::<AppState>();
        let mut p = lock(&state.library)?.get(&project_id).map_err(error)?;
        let s = p.source.as_mut().ok_or("Project has no source map")?;
        s.resource_sha256 = project::resource_hashes(&folder).map_err(error)?;
        s.resource_directory = Some(folder);
        lock(&state.inspections)?.remove(&project_id);
        let i = (*inspect(&state, &p)?).clone();
        p.modified_at = chrono::Utc::now().to_rfc3339();
        lock(&state.library)?.save(&p, Some(&i)).map_err(error)?;
        Ok(Some(OpenProject {
            project: p,
            inspection: Some(i),
        }))
    })
    .await
    .map_err(error)?
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
    let root =
        installation
            .mcc_path
            .as_ref()
            .and_then(|path| match mcc::inspect_managed_root(path) {
                Ok(root) => root,
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
    Ok(build::compatibility(&p, &i, &project_tools(&state, &p)?))
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
    let tools = project_tools(&state, &project)?;
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
        let tools = project_tools(&state, &p)?;
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
    let receipt = verified_build(&state, &p, &build_id)?;
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
    current_validated_build_id: Option<String>,
    current_build_message: String,
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
    let current = current_build(&state, &p);
    let current_build_message = match &current {
        Ok(_) => {
            "Current saved project has an intact validated build; gameplay remains untested.".into()
        }
        Err(e) => e.clone(),
    };
    Ok(Readiness{mcc_found:install.mcc_path.is_some(),halo1_installed:install.halo1_installed,steam_available:install.steam_executable.is_some(),package_valid,registered,running:steam::is_mcc_running(),launch_ready:ready,current_validated_build_id:current.ok().map(|b|b.id),current_build_message,message:if ready{"Choose ‘Play Halo: MCC Anti-Cheat Disabled (Mods and Limited Services)’ in Steam. Launch mode and in-game load remain unverified."}else{"Build and install a validated local package before launching this project. Live editing, VR, and multiplayer AI replication are not implemented for MCC."}.into()})
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
    let _ = state;
    Err("Register and inspect a separately installed runtime in Runtimes before opening it. The legacy executable preference is no longer executed.".into())
}
#[tauri::command]
fn reveal_folder(state: State<AppState>, kind: String, id: Option<String>) -> Reply<()> {
    let path = match kind.as_str() {
        "inbox" => state.root.join("Inbox"),
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
    let local = state.root.join("Inbox");
    core::reject_links(&local).map_err(error)?;
    fs::create_dir_all(&local).map_err(error)?;
    let mut inboxes = vec![local];
    if let Some(root) = lock(&state.managed)?.clone() {
        inboxes.push(root.inbox);
    }
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = notify::recommended_watcher(move |event| {
        let _ = tx.send(event);
    })
    .map_err(error)?;
    for inbox in &inboxes {
        watcher
            .watch(inbox, notify::RecursiveMode::NonRecursive)
            .map_err(error)?;
    }
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
            let entries = inboxes
                .iter()
                .filter_map(|root| fs::read_dir(root).ok())
                .flatten();
            let mut present = std::collections::HashSet::new();
            for entry in entries.flatten() {
                let path = entry.path();
                present.insert(path.clone());
                let Some(ext) = path.extension() else {
                    continue;
                };
                if !ext.eq_ignore_ascii_case("map")
                    && !ext.eq_ignore_ascii_case("yelo")
                    && !ext.eq_ignore_ascii_case("zip")
                {
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
                let result = import_file(&state, &path);
                if let Ok(lib) = state.library.lock() {
                    let _ = lib.set_setting(&key, &true);
                }
                match result {
                    Ok(opened) => {
                        for open in opened {
                            let _ = app.emit("spark:imported", &open.project.id);
                            let _ = app.emit("spark:library-changed", ());
                            let auto = state.settings.lock().map(|s| s.auto_build).unwrap_or(false);
                            if auto {
                                if let Err(e) = begin_build(app.clone(), open.project.id.clone()) {
                                    event(&app,JobEvent{job_id:uuid::Uuid::new_v4().to_string(),project_id:open.project.id,phase:"blocked".into(),severity:"warning".into(),message:format!("Inbox import succeeded; automatic conversion blocked: {e}"),progress:0,timestamp:chrono::Utc::now().to_rfc3339()});
                                }
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
#[tauri::command]
fn close_application(app: tauri::AppHandle) -> Reply<()> {
    app.get_webview_window("main")
        .ok_or("Main window unavailable")?
        .destroy()
        .map_err(error)
}
#[tauri::command]
fn initialize_mcc_inbox(app: tauri::AppHandle, state: State<AppState>) -> Reply<Bootstrap> {
    if steam::is_mcc_running() {
        return Err("Close MCC before initializing its managed mod folders".into());
    }
    let path = lock(&state.installation)?
        .mcc_path
        .clone()
        .ok_or("MCC installation is not available")?;
    *lock(&state.managed)? = Some(mcc::initialize(&path).map_err(error)?);
    start_watcher(&app, &state)?;
    bootstrap(state)
}
fn runtime_reports(state: &AppState) -> Reply<Vec<runtime::RuntimeReport>> {
    let registrations: Vec<runtime::RuntimeRegistration> = lock(&state.library)?
        .setting("runtimeRegistrations")
        .map_err(error)?;
    runtime::report(&*lock(&state.installation)?, &registrations).map_err(error)
}
#[tauri::command]
async fn runtime_report(app: tauri::AppHandle) -> Reply<Vec<runtime::RuntimeReport>> {
    tauri::async_runtime::spawn_blocking(move || runtime_reports(&app.state::<AppState>()))
        .await
        .map_err(error)?
}
#[tauri::command]
async fn inspect_runtime_registration(
    registration: runtime::RuntimeRegistration,
) -> Reply<runtime::RuntimeInstallation> {
    tauri::async_runtime::spawn_blocking(move || {
        runtime::inspect_registration(&registration).map_err(error)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
async fn register_runtime(
    app: tauri::AppHandle,
    registration: runtime::RuntimeRegistration,
) -> Reply<Vec<runtime::RuntimeReport>> {
    tauri::async_runtime::spawn_blocking(move || {
        runtime::inspect_registration(&registration).map_err(error)?;
        let state = app.state::<AppState>();
        let lib = lock(&state.library)?;
        let mut registrations: Vec<runtime::RuntimeRegistration> =
            lib.setting("runtimeRegistrations").map_err(error)?;
        registrations.retain(|r| r.runtime_id != registration.runtime_id);
        registrations.push(registration);
        lib.set_setting("runtimeRegistrations", &registrations)
            .map_err(error)?;
        drop(lib);
        runtime_reports(&state)
    })
    .await
    .map_err(error)?
}
fn runtime_registration(
    state: &AppState,
    id: runtime::RuntimeId,
) -> Reply<runtime::RuntimeRegistration> {
    let registrations: Vec<runtime::RuntimeRegistration> = lock(&state.library)?
        .setting("runtimeRegistrations")
        .map_err(error)?;
    registrations
        .into_iter()
        .find(|r| r.runtime_id == id)
        .ok_or("Register a separately installed runtime first".into())
}
#[tauri::command]
async fn runtime_inventory(
    app: tauri::AppHandle,
    runtime_id: runtime::RuntimeId,
) -> Reply<runtime::RuntimeInventory> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        if runtime_id == runtime::RuntimeId::MccSteam {
            runtime::inventory_mcc(&*lock(&state.installation)?).map_err(error)
        } else {
            runtime::inventory_maps(&runtime_registration(&state, runtime_id)?).map_err(error)
        }
    })
    .await
    .map_err(error)?
}
#[tauri::command]
async fn choose_runtime_path(kind: String) -> Reply<Option<PathBuf>> {
    let dialog =
        rfd::AsyncFileDialog::new().set_title("Choose a separately installed Halo runtime path");
    match kind.as_str() {
        "executable" => Ok(dialog.pick_file().await.map(|f| f.path().into())),
        "root" | "dataRoot" => Ok(dialog.pick_folder().await.map(|f| f.path().into())),
        _ => Err("Unknown runtime path kind".into()),
    }
}
#[tauri::command]
async fn launch_registered_runtime(
    app: tauri::AppHandle,
    runtime_id: runtime::RuntimeId,
) -> Reply<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        if runtime_id == runtime::RuntimeId::MccSteam {
            let installation = lock(&state.installation)?.clone();
            if steam::is_mcc_running() { return Err("MCC is already running".into()); }
            steam::launch_steam(&installation).map_err(error)?;
            return Ok("Opened MCC's Steam launch workflow. Choose Play Halo: MCC Anti-Cheat Disabled (Mods and Limited Services). No map was deployed or selected; game loading remains unverified.".into());
        }
        let registration = runtime_registration(&state, runtime_id)?;
        let plan = runtime::prepare_launch(&registration).map_err(error)?;
        let canonical_data = fs::canonicalize(&state.root).map_err(error)?;
        if plan.executable.starts_with(canonical_data.join("archives")) || plan.executable.starts_with(canonical_data.join("Inbox")) {
            return Err("Archived or Inbox executables cannot be launched. Use a separately installed runtime.".into());
        }
        steam::command(plan.executable.to_string_lossy().as_ref()).current_dir(plan.cwd).args(plan.args).spawn().map_err(error)?;
        Ok(plan.warnings.join(" "))
    }).await.map_err(error)?
}
#[tauri::command]
async fn inspect_sound(
    app: tauri::AppHandle,
    project_id: String,
    tag_id: u32,
) -> Reply<audio::SoundInspection> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let p = lock(&state.library)?.get(&project_id).map_err(error)?;
        let s = p.source.ok_or("Project has no source map")?;
        audio::inspect_sound(&s.preserved_path, &s.sha256, tag_id).map_err(error)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
async fn preview_sound(
    app: tauri::AppHandle,
    project_id: String,
    tag_id: u32,
    pitch_range: usize,
    permutation: usize,
) -> Reply<audio::AudioPreview> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let p = lock(&state.library)?.get(&project_id).map_err(error)?;
        let s = p.source.ok_or("Project has no source map")?;
        audio::preview_sound(
            &s.preserved_path,
            &s.sha256,
            tag_id,
            pitch_range,
            permutation,
        )
        .map_err(error)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
fn compare_peer_manifest(
    local: multiplayer::PeerManifest,
    peer: multiplayer::PeerManifest,
) -> Reply<multiplayer::PeerPreflight> {
    multiplayer::compare(&local, &peer).map_err(error)
}
#[tauri::command]
async fn choose_peer_manifest() -> Reply<Option<multiplayer::PeerManifest>> {
    let file = rfd::AsyncFileDialog::new()
        .set_title("Choose a friend's compatibility manifest")
        .add_filter("Compatibility manifest", &["json"])
        .pick_file()
        .await;
    file.map(|f| {
        let bytes = bounded_read(f.path(), multiplayer::MAX_MANIFEST_BYTES as u64)?;
        let text = std::str::from_utf8(&bytes).map_err(error)?;
        multiplayer::parse_manifest(text).map_err(error)
    })
    .transpose()
}
#[tauri::command]
async fn export_peer_manifest(manifest: multiplayer::PeerManifest) -> Reply<Option<PathBuf>> {
    let text = multiplayer::export_manifest(&manifest).map_err(error)?;
    let file = rfd::AsyncFileDialog::new()
        .set_title("Export compatibility manifest (no paths or accounts)")
        .set_file_name("guilty-spark-compatibility.json")
        .add_filter("JSON", &["json"])
        .save_file()
        .await;
    if let Some(file) = file {
        // An existing file must itself be a compatibility manifest before replacement.
        if file.path().exists() {
            let bytes = bounded_read(file.path(), multiplayer::MAX_MANIFEST_BYTES as u64)?;
            multiplayer::parse_manifest(std::str::from_utf8(&bytes).map_err(error)?)
                .map_err(error)?;
        }
        project::atomic_write(file.path(), text.as_bytes(), true).map_err(error)?;
        Ok(Some(file.path().into()))
    } else {
        Ok(None)
    }
}
#[tauri::command]
async fn create_peer_manifest(
    app: tauri::AppHandle,
    project_id: String,
    runtime_id: runtime::RuntimeId,
    mode: multiplayer::SessionMode,
    anti_cheat_disabled: Option<bool>,
) -> Reply<multiplayer::PeerManifest> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let p = lock(&state.library)?.get(&project_id).map_err(error)?;
        let source = p.source.as_ref().ok_or("Choose an imported map project")?;
        let reports = runtime_reports(&state)?;
        let installed = reports
            .into_iter()
            .find(|r| r.id == runtime_id)
            .and_then(|r| r.installation);
        let build = if runtime_id == runtime::RuntimeId::MccSteam {
            current_build(&state, &p).ok()
        } else {
            None
        };
        let inspection = if let Some(record) = &build {
            maps::inspect_map(record.output.as_ref().unwrap(), None).map_err(error)?
        } else {
            (*inspect(&state, &p)?).clone()
        };
        let resources = project_tools(&state, &p)?
            .resource_directory
            .or_else(|| source.original_path.parent().map(Path::to_path_buf));
        let resource_ids = if build.is_some() && inspection.resources.iter().all(|r| !r.required) {
            ["bitmaps.map", "sounds.map", "loc.map"]
                .into_iter()
                .map(|name| multiplayer::PeerResourceIdentity {
                    name: name.into(),
                    sha256: None,
                    required: false,
                })
                .collect()
        } else {
            multiplayer::resource_identities(
                &inspection,
                resources.as_deref().unwrap_or(&state.root),
            )
            .map_err(error)?
        };
        let mut package_sha256 = None;
        if runtime_id == runtime::RuntimeId::MccSteam {
            if let Some(root) = lock(&state.managed)?.clone() {
                if let Ok(receipt) = mcc::verify_package(&root, &p) {
                    let manifest = lock(&state.installation)?.manifest_path.clone();
                    if manifest
                        .is_some_and(|m| mcc::manifest_contains(&m, &root.mods).unwrap_or(false))
                    {
                        use sha2::{Digest, Sha256};
                        package_sha256 = Some(format!(
                            "{:x}",
                            Sha256::digest(serde_json::to_vec(&receipt.files).map_err(error)?)
                        ));
                    }
                }
            }
        }
        let context = multiplayer::ManifestContext {
            runtime_id,
            platform: std::env::consts::OS.into(),
            runtime_build: installed.as_ref().and_then(|i| i.version.clone()),
            network_version: installed.as_ref().and_then(|i| i.network_version.clone()),
            executable_sha256: installed.and_then(|i| i.executable_sha256),
            mode,
            anti_cheat_disabled: if runtime_id == runtime::RuntimeId::MccSteam {
                anti_cheat_disabled
            } else {
                None
            },
            package_sha256,
            source_sha256: Some(source.sha256.clone()),
            build_tool_version: None,
            build_verified: build.is_some(),
            resource_set_verified: build.is_some()
                && inspection.resources.iter().all(|r| !r.required),
        };
        multiplayer::create_manifest(&inspection, context, resource_ids).map_err(error)
    })
    .await
    .map_err(error)?
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
                // Missing optional tool/resource folders must not disable the independent local Inbox.
                if let Err(e) = start_watcher(app.handle(), &app.state::<AppState>()) {
                    if let Ok(mut d) = app.state::<AppState>().diagnostics.lock() {
                        d.push(e);
                    }
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
            choose_project_resources,
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
            close_application,
            initialize_mcc_inbox,
            runtime_report,
            inspect_runtime_registration,
            register_runtime,
            runtime_inventory,
            choose_runtime_path,
            launch_registered_runtime,
            inspect_sound,
            preview_sound,
            compare_peer_manifest,
            choose_peer_manifest,
            export_peer_manifest,
            create_peer_manifest,
            reveal_folder
        ])
        .run(tauri::generate_context!())
        .expect("Guilty Spark could not start");
}

#[cfg(test)]
mod readiness_tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, AppState, Project, BuildRecord) {
        let temp = tempfile::tempdir().unwrap();
        let library = Library::open(temp.path()).unwrap();
        let mut p = library.create("Synthetic readiness fixture").unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let dir = temp.path().join("jobs").join(&id);
        fs::create_dir_all(dir.join("output")).unwrap();
        let output = dir.join("output/fixture.map");
        fs::write(
            &output,
            b"synthetic artifact integrity fixture; never a playable map",
        )
        .unwrap();
        let record = BuildRecord {
            id,
            timestamp: String::new(),
            status: "validated".into(),
            target: "test-only".into(),
            output: Some(output.clone()),
            sha256: Some(maps::hash_file(&output).unwrap()),
            message: String::new(),
            project_fingerprint: p.fingerprint().unwrap(),
        };
        fs::write(
            dir.join("receipt.json"),
            serde_json::to_vec(&record).unwrap(),
        )
        .unwrap();
        p.builds.push(record.clone());
        let state = AppState {
            root: temp.path().into(),
            library: Mutex::new(library),
            settings: Mutex::new(Settings::default()),
            installation: Mutex::new(Installation::default()),
            managed: Mutex::new(None),
            watcher: Mutex::new(None),
            inspections: Mutex::new(HashMap::new()),
            jobs: Mutex::new(HashMap::new()),
            logs: Mutex::new(vec![]),
            diagnostics: Mutex::new(vec![]),
        };
        (temp, state, p, record)
    }
    #[test]
    fn readiness_rejects_stale_current_content_and_tampered_artifact() {
        let (_temp, state, mut p, record) = fixture();
        assert_eq!(current_build(&state, &p).unwrap().id, record.id);
        p.tag_edits.push(project::TagEdit {
            tag_id: 1,
            field_key: "fixture".into(),
            value: serde_json::json!(2),
        });
        assert!(current_build(&state, &p).is_err());
        p.tag_edits.clear();
        fs::write(record.output.unwrap(), b"external replacement").unwrap();
        assert!(current_build(&state, &p).is_err());
    }
    #[test]
    fn readiness_rejects_receipt_id_mismatch_and_unowned_builds() {
        let (_temp, state, p, mut record) = fixture();
        let original_id = record.id.clone();
        record.id = uuid::Uuid::new_v4().to_string();
        fs::write(
            state
                .root
                .join("jobs")
                .join(&original_id)
                .join("receipt.json"),
            serde_json::to_vec(&record).unwrap(),
        )
        .unwrap();
        assert!(current_build(&state, &p).is_err());
        assert!(verified_build(&state, &p, &record.id).is_err());
    }
}
