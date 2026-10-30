use notify::Watcher;
use serde::{Deserialize, Serialize};
use spark_core::{
    self as core, archive, assets, audio, quickforge, forge_build, firefight, tag_exchange,
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
    time::{Duration, Instant},
    io::Read,
    process::Stdio,
};
use tauri::{Emitter, Manager, State};
#[path="shared_editing.rs"] mod shared_editing;
#[path="runtime_workbench.rs"] mod runtime_workbench;
#[path="external_changes_native.rs"] mod external_changes_native;
#[path="invitations_native.rs"] mod invitations_native;
#[path="community_host_native.rs"] mod community_host_native;
#[path="map_download.rs"] mod map_download;
#[path="director_native.rs"] mod director_native;
#[path="director_recording.rs"]mod director_recording;
#[path="working_tag_changes_native.rs"]mod working_tag_changes_native;
#[path="conversion_resources_native.rs"]mod conversion_resources_native;
#[path="portability_native.rs"]mod portability_native;
#[path="dependency_install.rs"] mod dependency_install;
#[path="baboon_native.rs"] mod baboon_native;
#[path="native_tag_parser.rs"] mod native_tag_parser;
type Reply<T> = std::result::Result<T, String>;
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Settings {
    native_camera_shortcut:core::live_adapter::camera::Shortcut,
    steam_directory: Option<PathBuf>,
    mcc_directory: Option<PathBuf>,
    invader_directory: Option<PathBuf>,
    resource_directory: Option<PathBuf>,
    metadata_template_directory: Option<PathBuf>,
    native_executable: Option<PathBuf>,
    steam_bridge_directory: Option<PathBuf>,
    steam_bridge_manifest_sha256: Option<String>,
    hek_directory: Option<PathBuf>,
    /// Explicit family selector prevents invoking classic HEK against MCC tags.
    hek_flavor: Option<String>,
    hek_tags_directory: Option<PathBuf>,
    auto_build: bool,
    preferred_halo:Option<runtime::RuntimeId>,
    onboarding_completed:bool,
    snapshot_interval_minutes:u32,
    snapshot_retention:usize,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            native_camera_shortcut:Default::default(),
            steam_directory: None,
            mcc_directory: None,
            invader_directory: None,
            resource_directory: None,
            metadata_template_directory: None,
            native_executable: None,
            steam_bridge_directory: None,
            steam_bridge_manifest_sha256: None,
            hek_directory: None,
            hek_flavor: None,
            hek_tags_directory: None,
            auto_build: true,
            preferred_halo:None,
            onboarding_completed:false,
            snapshot_interval_minutes:10,
            snapshot_retention:20,
        }
    }
}
impl Settings {
    fn tools(&self) -> Toolchain {
        Toolchain {
            invader_directory: self.invader_directory.clone(),
            resource_directory: self.resource_directory.clone(),
            h1a_directory:if self.hek_flavor.as_deref()==Some("h1aEk"){self.hek_directory.clone()}else{None},
            base_tags_directory:if self.hek_flavor.as_deref()==Some("h1aEk"){self.hek_tags_directory.clone().or_else(||self.hek_directory.as_ref().map(|p|p.join("tags")))}else{None},
        }
    }
}
struct AppState {
    root: PathBuf,
    library: Mutex<Library>,
    settings: Mutex<Settings>,
    settings_write:Mutex<()>,
    installation: Mutex<Installation>,
    managed: Mutex<Option<ManagedRoot>>,
    watcher: Mutex<Option<notify::RecommendedWatcher>>,
    inspections: Mutex<HashMap<String, Arc<MapInspection>>>,
    jobs: Mutex<HashMap<String, Arc<AtomicBool>>>,
    logs: Mutex<Vec<JobEvent>>,
    diagnostics: Mutex<Vec<String>>,
    live_mcc: Mutex<Option<crate::live_mcc::Session>>,
    forge_session: Mutex<Option<shared_editing::Session>>,
    document_owners: Mutex<HashMap<String,String>>,
    runtime_workbench: Mutex<runtime_workbench::WorkbenchState>,
    external_changes: Mutex<external_changes_native::ExternalChangesState>,
    invitations: Mutex<invitations_native::InvitationsState>,
    community_hosts: Mutex<community_host_native::CommunityHostState>,
    map_downloads: map_download::DownloadRegistry,
    dependency_install: Mutex<dependency_install::DependencyInstallState>,
    director:Mutex<director_native::DirectorState>,
    recordings:Mutex<director_recording::RecordingState>,
    working_tag_changes:Mutex<working_tag_changes_native::WorkingTagChangesState>,
    conversion_repairs:Mutex<conversion_resources_native::RepairState>,
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
fn editing_tools(state: &AppState, project: &Project) -> Reply<Toolchain> {
    let mut tools = lock(&state.settings)?.tools();
    if let Some(id)=&project.active_build_target{
        let target=project.build_targets.iter().find(|t|&t.id==id).ok_or("Selected conversion target is missing")?;
        tools.h1a_directory=if target.hek_flavor.as_deref()==Some("h1aEk"){target.hek_directory.clone()}else{None};tools.base_tags_directory=target.tags_directory.clone();
        tools.invader_directory=target.invader_directory.clone().or(tools.invader_directory);
    }
    if let Some(resources) = project
        .source
        .as_ref()
        .and_then(|s| s.resource_directory.clone())
    {
        tools.resource_directory = Some(resources);
    }
    Ok(tools)
}
fn project_tools(state:&AppState,project:&Project)->Reply<Toolchain>{
    if let Some(target)=project.active_build_target.as_ref().and_then(|id|project.build_targets.iter().find(|t|&t.id==id)){if target.runtime_id!=runtime::RuntimeId::MccSteam||target.builder!="h1a-tool"||target.hek_flavor.as_deref()!=Some("h1aEk"){return Err("Imported map conversion currently targets MCC using H1A Tool. CE source authoring has its own QuickForge target.".into());}}
    editing_tools(state,project)
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
    if output.parent().map(fs::canonicalize).transpose().map_err(error)?
        != Some(fs::canonicalize(dir.join("output")).map_err(error)?)
        || Some(maps::hash_file(output).map_err(error)?) != record.sha256
    {
        return Err("Build output integrity failed".into());
    }
    Ok(record)
}
#[tauri::command]
async fn open_built_map(app:tauri::AppHandle,project_id:String,build_id:String)->Reply<OpenProject>{
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();
        let source=lock(&state.library)?.get(&project_id).map_err(error)?;
        let build=verified_build(&state,&source,&build_id)?;
        let inherited_tools=project_tools(&state,&source).ok();
        // Native revisions consult library settings. Resolve before taking the
        // import lock so opening a compiled map cannot recursively lock it.
        let inherited_tags=if build.target=="mcc-cea"{runtime_workbench::compiled_tags(&state,&source,&build).ok()}else{None};
        let library=lock(&state.library)?;
        let entries=library.list().map_err(error)?;
        let existed=entries.iter().any(|e|e.sha256.as_deref()==build.sha256.as_deref());
        let(mut project,inspection)=library.import_map(build.output.as_ref().ok_or("Build output is missing")?,None).map_err(error)?;
        if !existed{
            let label=|value:&str|value.chars().filter(|c|c.is_alphanumeric()).flat_map(char::to_lowercase).collect::<String>();
            let mut base=if let Some(assembly)=&source.bsp_assembly{
                if label(&source.title).contains(&label(&assembly.donor_title)){format!("{} · compiled",source.title)}else{format!("{} + {} · compiled",source.title,assembly.donor_title)}
            }else{format!("{} · compiled",source.title)};
            while base.len()>180{base.pop();}
            let mut title=base.clone();let mut ordinal=2;
            while entries.iter().any(|e|e.title==title){title=format!("{base} ({ordinal})");ordinal+=1;}
            project.title=title;
            if build.target=="mcc-cea" && inspection.header.version==13 {
                if let Some(tags)=inherited_tags {
                  if tags.is_dir() && tags.join(core::safe_relative(&format!("{}.scenario",inspection.scenario_path)).map_err(error)?).is_file() {
                    core::reject_links(&tags).map_err(error)?;
                    if let Some(tools)=inherited_tools {if let Some(kit)=tools.h1a_directory {project.bind_compiled_mcc_tags(kit,tags,tools.invader_directory).map_err(error)?;}}
                  }
                }
            }
            library.save(&project,Some(&inspection)).map_err(error)?;
        }
        Ok(OpenProject{project,inspection:Some(inspection)})
    }).await.map_err(error)?
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
/// Extract only a selected internal bitmap's top mip from a preserved cache.
/// The source SHA is checked against the inspection and a fresh read; source
/// maps and resource maps are never written to or silently read elsewhere.
#[tauri::command]
async fn inspect_source_appearance(app:tauri::AppHandle,project_id:String)->Reply<core::appearance::SourceAppearance>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let p=lock(&state.library)?.get(&project_id).map_err(error)?;
        let source=p.source.as_ref().ok_or("Project has no preserved Halo source")?;let inspection=inspect(&state,&p)?;
        core::appearance::inspect(&source.preserved_path,&source.sha256,&inspection).map_err(error)
    }).await.map_err(error)?
}

#[tauri::command]
async fn bsp_assembly_options(app:tauri::AppHandle,project_id:String)->Reply<Vec<serde_json::Value>>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let p=lock(&state.library)?.get(&project_id).map_err(error)?;let i=inspect(&state,&p)?;Ok(i.mesh.parts.iter().enumerate().map(|(index,p)|serde_json::json!({"index":index,"name":p.name,"triangles":p.index_count/3})).collect())}).await.map_err(error)?
}
#[tauri::command]
async fn plan_bsp_assembly(app:tauri::AppHandle,project_id:String,donor_project_id:String,donor_bsp_index:usize)->Reply<core::bsp_assembly::BspAssembly>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let base=lock(&state.library)?.get(&project_id).map_err(error)?;let donor=lock(&state.library)?.get(&donor_project_id).map_err(error)?;let tags=editing_tools(&state,&donor)?.base_tags_directory.ok_or("Select matching editable tags for the donor map in Map tools & tags")?;let i=inspect(&state,&base)?;let j=inspect(&state,&donor)?;core::bsp_assembly::plan(&base,&i,&donor,&j,donor_bsp_index,tags).map_err(error)}).await.map_err(error)?
}
#[tauri::command]
async fn preview_bsp_assembly(app:tauri::AppHandle,project_id:String)->Reply<core::bsp_assembly::AssemblyReport>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let p=lock(&state.library)?.get(&project_id).map_err(error)?;let i=inspect(&state,&p)?;core::bsp_assembly::generate_project(&p,&i,&AtomicBool::new(false)).map(|g|g.report).map_err(error)}).await.map_err(error)?
}
#[tauri::command]
async fn preview_owned_cache_bitmap(
    app: tauri::AppHandle,
    project_id: String,
    bitmap_tag_id: u32,
    image_index: usize,
) -> Reply<core::bitmap_preview::OwnedBitmapPreview> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let project = lock(&state.library)?.get(&project_id).map_err(error)?;
        let source = project.source.as_ref().ok_or("Project has no preserved Halo map")?;
        let inspection = inspect(&state, &project)?;
        if inspection.header.version==13&&source.resource_sha256.contains_key("mcc-textures") {
            let folder=source.resource_directory.as_deref().ok_or("MCC texture directory is missing")?;let request=core::bitmap_preview::OwnedBitmapRequest{bitmap_tag_id,image_index};
            let batch=core::bitmap_preview::preview_mcc_bitmap_batch(&source.preserved_path,&source.sha256,&inspection,&[request],folder,&source.resource_sha256).map_err(error)?;
            let item=batch.items.into_iter().next().ok_or("MCC bitmap response missing")?;return item.preview.ok_or_else(||item.error.unwrap_or_else(||"MCC bitmap unavailable".into()));
        }
        // Resource-map access requires a per-project explicitly selected
        // directory and its recorded hash; global preferences are not trusted
        // for copyrighted shared pixels. Internal bitmap reads need neither.
        let pinned = source.resource_directory.as_ref().and_then(|folder| {
            source.resource_sha256.get("bitmaps.map")
                .map(|hash| (folder.join("bitmaps.map"), hash.as_str()))
        });
        let resource_args = pinned.as_ref().map(|(path, hash)| (path.as_path(), *hash));
        core::bitmap_preview::preview_owned_bitmap_with_resources(
            &source.preserved_path, &source.sha256, &inspection,
            bitmap_tag_id, image_index, resource_args,
        ).map_err(error)
    }).await.map_err(error)?
}

/// Bounded, read-only material batch. The native reader hashes one immutable
/// cache snapshot and at most one exact per-project bitmaps.map resource file.
/// It does not write maps or follow arbitrary client-supplied file paths.
#[tauri::command]
async fn preview_owned_cache_bitmap_batch(
    app: tauri::AppHandle,
    project_id: String,
    requests: Vec<core::bitmap_preview::OwnedBitmapRequest>,
) -> Reply<core::bitmap_preview::OwnedBitmapBatch> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let project = lock(&state.library)?.get(&project_id).map_err(error)?;
        let source = project.source.as_ref().ok_or("Project has no preserved Halo map")?;
        let inspection = inspect(&state, &project)?;
        if inspection.header.version==13&&source.resource_sha256.contains_key("mcc-textures") {
            return core::bitmap_preview::preview_mcc_bitmap_batch(&source.preserved_path,&source.sha256,&inspection,&requests,source.resource_directory.as_deref().ok_or("MCC texture directory is missing")?,&source.resource_sha256).map_err(error);
        }
        let pinned = source.resource_directory.as_ref().and_then(|folder| {
            source.resource_sha256.get("bitmaps.map")
                .map(|hash| (folder.join("bitmaps.map"), hash.as_str()))
        });
        let resource_args = pinned.as_ref().map(|(path, hash)| (path.as_path(), *hash));
        core::bitmap_preview::preview_owned_bitmap_batch_with_resources(
            &source.preserved_path, &source.sha256, &inspection, &requests, resource_args,
        ).map_err(error)
    }).await.map_err(error)?
}

/// Audit only the selected, SHA-pinned classic bitmap resource INDEX. The
/// response contains counts and hashes, not game pixels or local file paths.
#[tauri::command]
async fn audit_owned_bitmap_resources(
    app: tauri::AppHandle,
    project_id: String,
) -> Reply<core::resource_map::ResourceMapAudit> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let project = lock(&state.library)?.get(&project_id).map_err(error)?;
        let source = project.source.as_ref().ok_or("Project has no preserved Halo map")?;
        if !matches!(source.cache_version, 6 | 7 | 609) {
            return Err("MCC ipaks need a separate reader; use supported local editing-kit source images".into());
        }
        let folder = source.resource_directory.as_ref().ok_or("Choose source resources for this project in Build first")?;
        let sha = source.resource_sha256.get("bitmaps.map")
            .ok_or("bitmaps.map was not SHA-256 pinned when source resources were selected")?;
        let inspected = inspect(&state, &project)?;
        let names: Vec<String> = inspected.tags.iter().filter(|tag| tag.class == "bitm")
            .map(|tag| if source.cache_version == 609 {format!("{}__pixels",tag.path)} else {format!("{}_0",tag.path)}).collect();
        core::resource_map::audit(&folder.join("bitmaps.map"), sha, &names).map_err(error)
    }).await.map_err(error)?
}

#[tauri::command]
fn bootstrap(state: State<AppState>) -> Reply<Bootstrap> {
    bootstrap_state(&state)
}
fn bootstrap_state(state:&AppState)->Reply<Bootstrap> {
    // Drop each guard before acquiring another: background discovery/imports
    // must not create a lock-order cycle with this UI snapshot.
    let installation=lock(&state.installation)?.clone();
    let managed=lock(&state.managed)?.clone();
    let settings=lock(&state.settings)?.clone();
    let entries=lock(&state.library)?.list().map_err(error)?;
    let diagnostics=lock(&state.diagnostics)?.clone();
    let logs=lock(&state.logs)?.clone();
    Ok(Bootstrap {
        api_version: 1,
        installation,
        managed,
        settings,
        entries,
        data_directory: state.root.clone(),
        inbox_directory: state.root.join("Inbox"),
        diagnostics,
        logs,
    })
}
#[tauri::command]
async fn open_project(app: tauri::AppHandle, id: String) -> Reply<OpenProject> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut p = lock(&state.library)?.get(&id).map_err(error)?;
        let i = if p.source.is_some() {
            Some((*inspect(&state, &p)?).clone())
        } else {
            None
        };
        if p.source_scene_version==0 {
            if let Some(inspection)=&i {
                snapshot_project_state(&state,&p,"before-upgrade")?;
                let additions:Vec<_>=inspection.objects.iter().filter(|object|object.id.starts_with("netgame-equipment-")&&!p.scene.iter().any(|old|old.id==object.id)).cloned().collect();
                p.scene.extend(additions);p.source_scene_version=1;
                lock(&state.library)?.save(&p,Some(inspection)).map_err(error)?;
            }
        }
        Ok(OpenProject {
            project: p,
            inspection: i,
        })
    })
    .await
    .map_err(error)?
}
#[tauri::command]
async fn connect_mcc_texture_resources(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String)->Reply<OpenProject>{
    let owner=window.label().to_string();tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;let mut p=lock(&state.library)?.get(&project_id).map_err(error)?;let i=inspect(&state,&p)?;
        if i.header.version!=13{return Err("MCC texture packs require an MCC Halo 1 cache".into());}
        let source=p.source.as_ref().ok_or("Missing preserved map source")?;
        if !core::bitmap_preview::mcc_uses_external_bitmaps(&source.preserved_path,&source.sha256,&i).map_err(error)?{return Ok(OpenProject{project:p,inspection:Some((*i).clone())});}
        let root=lock(&state.installation)?.mcc_path.clone().ok_or("Locate your MCC installation before connecting its texture packs")?;let directory=root.join("halo1/prebuild/paks");
        let hashes=core::mcc_textures::pin(&directory,&i.header.name).map_err(error)?;
        let library=lock(&state.library)?;p=library.get(&project_id).map_err(error)?;check_document_owner(&state,&project_id,&owner)?;
        let source=p.source.as_mut().ok_or("Missing preserved map source")?;if source.sha256!=i.sha256{return Err("Map source changed while connecting texture packs".into());}source.resource_directory=Some(directory);source.resource_sha256=hashes;library.save(&p,None).map_err(error)?;
        Ok(OpenProject{project:p,inspection:Some((*i).clone())})
    }).await.map_err(error)?
}
#[tauri::command]
fn create_quickforge_project(state: State<AppState>, title: String, template: String, target: Option<runtime::RuntimeId>) -> Reply<OpenProject> {
    let mut document = quickforge::create_arena(&title, &template).map_err(error)?;
    if let Some(target) = target { document.runtime_id = target; }
    let mut project = Project::new(&title);
    project.provenance.description = "Original geometry authored in Guilty Spark QuickForge. Base-game assets are not bundled.".into();
    project.quick_forge = Some(document);
    lock(&state.library)?.save(&project, None).map_err(error)?;
    Ok(OpenProject { project, inspection: None })
}
#[tauri::command]
async fn quickforge_validate(document: quickforge::QuickForgeDocument) -> Reply<quickforge::GeometryReport> {
    tauri::async_runtime::spawn_blocking(move || quickforge::validate(&document).map_err(error)).await.map_err(error)?
}
#[tauri::command]
async fn quickforge_preview(document: quickforge::QuickForgeDocument) -> Reply<quickforge::ForgeMesh> {
    tauri::async_runtime::spawn_blocking(move || quickforge::preview_mesh(&document).map_err(error)).await.map_err(error)?
}
fn forge_provenance_blockers(state: &AppState, project: &Project) -> Vec<String> {
    let mut blockers = vec![];
    let Some(document) = project.quick_forge.as_ref() else {return vec!["No QuickForge document".into()]};
    for placement in &document.placements {
        let Some(source_id) = placement.source_project_id.as_ref() else {continue};
        let result=(||->Reply<()> {
            let source_project = lock(&state.library)?.get(source_id).map_err(error)?;
            let source=source_project.source.as_ref().ok_or("Asset provenance must reference an imported map")?;
            if placement.source_sha256.as_ref()!=Some(&source.sha256) || maps::hash_file(&source.preserved_path).map_err(error)?!=source.sha256 {return Err("Referenced asset source changed or has no matching SHA-256".into());}
            let inspected=inspect(state,&source_project)?;
            if !inspected.tags.iter().any(|tag|Some(tag.id)==placement.tag_id && tag.class==placement.tag_class && tag.path.replace('\\',"/").eq_ignore_ascii_case(&placement.tag_path.replace('\\',"/"))){return Err(format!("Asset reference {} does not match the preserved source tag",placement.name));}
            Ok(())
        })();
        if let Err(e)=result {blockers.push(e);}
    }
    blockers.sort();blockers.dedup();blockers
}
fn forge_tools(state: &AppState) -> Reply<forge_build::ForgeToolchain> {
    let settings=lock(&state.settings)?.clone();
    Ok(forge_build::ForgeToolchain{hek_directory:settings.hek_directory.or(lock(&state.installation)?.editing_tools.clone()),hek_tags_directory:settings.hek_tags_directory,invader_directory:settings.invader_directory,hek_flavor:settings.hek_flavor})
}
fn verify_compiler_location(state:&AppState, tools:&forge_build::ForgeToolchain)->Reply<()> {
    // A user-selected compiler may not come from an imported mod archive or Inbox.
    for directory in [&tools.hek_directory,&tools.invader_directory].into_iter().flatten() {
        core::reject_links(directory).map_err(error)?;
        let candidate=directory.canonicalize().map_err(error)?;
        let mut protected=vec![state.root.join("Inbox"),state.root.join("archives"),state.root.join("projects")];
        let lib=lock(&state.library)?;
        for entry in lib.list().map_err(error)? {
            if let Some(source)=lib.get(&entry.id).map_err(error)?.source {
                if let Some(parent)=source.original_path.parent(){protected.push(parent.into());}
                if let Some(parent)=source.original_path.parent().filter(|p|p.file_name().is_some_and(|n|n.eq_ignore_ascii_case("maps"))) {if let Some(package)=parent.parent(){protected.push(package.into());}}
                if let Some(archive)=source.archive {if let Some(parent)=archive.original_path.parent(){protected.push(parent.into());}}
            }
        }
        for path in protected {if path.exists() && candidate.starts_with(path.canonicalize().map_err(error)?){return Err("Compilers must be separately installed tools, outside imported archives, source maps and Inbox folders".into());}}
    }
    Ok(())
}
fn save_forge_receipt(state:&AppState, receipt:&forge_build::QuickForgeBuildReceipt)->Reply<()> {
    let lib=lock(&state.library)?;
    lib.set_setting(&format!("quickforge.receipt.{}",receipt.project_id),receipt).map_err(error)?;
    if let Some(record)=&receipt.build {let mut project=lib.get(&receipt.project_id).map_err(error)?;project.builds.push(record.clone());project.modified_at=chrono::Utc::now().to_rfc3339();lib.save(&project,None).map_err(error)?;}
    Ok(())
}
#[tauri::command]
async fn quickforge_export(app:tauri::AppHandle,project_id:String)->Reply<forge_build::QuickForgeBuildReceipt> {
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();let project=lock(&state.library)?.get(&project_id).map_err(error)?;
        let receipt=forge_build::run_job(&project,&forge_build::tools_for_target(&project,forge_tools(&state)?).map_err(error)?,&state.root.join("jobs"),&uuid::Uuid::new_v4().to_string(),true,forge_provenance_blockers(&state,&project),Arc::new(AtomicBool::new(false)),|e|event(&app,e)).map_err(error)?;
        save_forge_receipt(&state,&receipt)?;Ok(receipt)
    }).await.map_err(error)?
}
#[tauri::command]
fn quickforge_build(app:tauri::AppHandle,project_id:String)->Reply<String> {
    let state=app.state::<AppState>();
    let project=lock(&state.library)?.get(&project_id).map_err(error)?;
    baboon_native::guard_regeneration(&state,&project)?;
    snapshot_project_state(&state,&project,"before-build")?;
    let tools=forge_build::tools_for_target(&project,forge_tools(&state)?).map_err(error)?;verify_compiler_location(&state,&tools)?;
    let blockers=forge_provenance_blockers(&state,&project);
    let job_id=uuid::Uuid::new_v4().to_string();let cancel=Arc::new(AtomicBool::new(false));
    let mut jobs=lock(&state.jobs)?;if !jobs.is_empty(){return Err("Another build is already running".into());}jobs.insert(job_id.clone(),cancel.clone());drop(jobs);
    let jobs_root=state.root.join("jobs");let returned=job_id.clone();
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();
        let result=forge_build::run_job(&project,&tools,&jobs_root,&job_id,false,blockers,cancel,|e|event(&app,e)).map_err(error).and_then(|receipt|save_forge_receipt(&state,&receipt));
        if let Err(message)=result {event(&app,JobEvent{job_id:job_id.clone(),project_id:project_id.clone(),phase:"failed".into(),severity:"error".into(),message,progress:100,timestamp:chrono::Utc::now().to_rfc3339()});}
        if let Ok(mut jobs)=state.jobs.lock(){jobs.remove(&job_id);}
        let _=app.emit("spark:library-changed",());
    });Ok(returned)
}
#[tauri::command]
fn quickforge_build_report(state:State<AppState>,project_id:String)->Reply<Option<forge_build::QuickForgeBuildReceipt>> {
    let project=lock(&state.library)?.get(&project_id).map_err(error)?;
    let receipt:Option<forge_build::QuickForgeBuildReceipt>=lock(&state.library)?.setting(&format!("quickforge.receipt.{project_id}")).map_err(error)?;
    // A prior receipt is useful evidence but must never describe current edits as built.
    Ok(receipt.map(|mut r|{if r.project_fingerprint!=project.fingerprint().unwrap_or_default(){r.warnings.push("This receipt is for an earlier project revision; export or build the current saved edits.".into());}r}))
}
#[tauri::command]
fn create_project(state: State<AppState>, title: String) -> Reply<OpenProject> {
    let p = lock(&state.library)?.create(&title).map_err(error)?;
    Ok(OpenProject {
        project: p,
        inspection: None,
    })
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
struct FirefightCatalog {
    default_config:firefight::FirefightConfig,
    enemies:Vec<firefight::EnemyType>,
    presets:Vec<firefight::FirefightPreset>,
}
#[tauri::command]
async fn firefight_catalog(app:tauri::AppHandle,source_project_id:String)->Reply<FirefightCatalog> {
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();let p=lock(&state.library)?.get(&source_project_id).map_err(error)?;let i=inspect(&state,&p)?;
        let source=p.source.as_ref().ok_or("Choose a preserved source map")?;
        if maps::hash_file(&source.preserved_path).map_err(error)?!=source.sha256{return Err("Preserved source changed".into());}
        let mut defaults=firefight::default_config();defaults.source_sha256=Some(i.sha256.clone());
        Ok(FirefightCatalog{default_config:defaults,enemies:firefight::available_enemies(&i),presets:firefight::presets(&i)})
    }).await.map_err(error)?
}
#[tauri::command]
async fn firefight_validate(app:tauri::AppHandle,config:firefight::FirefightConfig,source_project_id:Option<String>)->Reply<firefight::ValidationReport> {
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();
        let source=if let Some(id)=source_project_id{Some(id)}else{lock(&state.library)?.list().map_err(error)?.into_iter().find(|entry|entry.sha256.is_some()&&entry.sha256==config.source_sha256).map(|e|e.id)};
        if let Some(id)=source {let p=lock(&state.library)?.get(&id).map_err(error)?;let i=inspect(&state,&p)?;
            if let Some(source)=&p.source{if maps::hash_file(&source.preserved_path).map_err(error)?!=source.sha256{return Err("Preserved source changed".into());}}
            Ok(firefight::validate_assets(&config,&i))
        } else {
            Ok(firefight::ValidationReport{valid:false,source_matches:false,missing_actor_variants:config.enemies.iter().map(|e|e.actor_variant_path.clone()).collect(),missing_equipment:config.starting_equipment.clone(),runtime_integrated:false,diagnostics:vec!["Select an imported source map with matching SHA-256 to verify actual actor variants. A configuration preview cannot verify game behavior.".into()]})
        }
    }).await.map_err(error)?
}
#[tauri::command]
async fn firefight_preview(config:firefight::FirefightConfig,completed_waves:u16)->Reply<firefight::SimulationReport> {
    tauri::async_runtime::spawn_blocking(move||firefight::preview(&config,completed_waves).map_err(error)).await.map_err(error)?
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
fn prepare_map_download(state:State<AppState>,url:String)->Reply<map_download::DownloadStatus>{state.map_downloads.prepare(&url).map_err(error)}
#[tauri::command]
fn map_download_status(state:State<AppState>,id:String)->Reply<map_download::DownloadStatus>{state.map_downloads.status(&id).map_err(error)}
#[tauri::command]
fn cancel_map_download(state:State<AppState>,id:String)->Reply<bool>{state.map_downloads.cancel(&id).map_err(error)}
#[tauri::command]
async fn download_and_import_maps(app:tauri::AppHandle,id:String)->Reply<Vec<OpenProject>>{
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();let receipt=state.map_downloads.download(&id,&state.root.join("Inbox/downloads")).map_err(error)?;
        state.map_downloads.mark_importing(&id).map_err(error)?;
        match import_file(&state,&receipt.path){
            Ok(opened)=>{state.map_downloads.mark_imported(&id,opened.iter().map(|p|p.project.id.clone()).collect()).map_err(error)?;let _=app.emit("spark:library-changed",());Ok(opened)},
            Err(reason)=>{let _=state.map_downloads.mark_import_failed(&id);Err(reason)}
        }
    }).await.map_err(error)?
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
fn list_project_snapshots(state:State<AppState>,project_id:String)->Reply<Vec<core::snapshots::SnapshotInfo>> {
    let lib=lock(&state.library)?;let _=lib.get(&project_id).map_err(error)?;
    core::snapshots::list(&lib.project_dir(&project_id).map_err(error)?).map_err(error)
}
fn snapshot_project_state(state:&AppState,p:&Project,reason:&str)->Reply<core::snapshots::SnapshotInfo> {
    let retention=lock(&state.settings)?.snapshot_retention;
    let dir=lock(&state.library)?.project_dir(&p.id).map_err(error)?;
    core::snapshots::create(&dir,p,reason,retention).map_err(error)
}
#[tauri::command]
fn create_project_snapshot(state:State<AppState>,project_id:String,reason:String)->Reply<core::snapshots::SnapshotInfo> {
    let p=lock(&state.library)?.get(&project_id).map_err(error)?;
    snapshot_project_state(&state,&p,&reason)
}
#[tauri::command]
fn preview_project_snapshot(state:State<AppState>,project_id:String,snapshot_id:String,sha256:String)->Reply<Project> {
    let lib=lock(&state.library)?;let p=lib.get(&project_id).map_err(error)?;
    core::snapshots::preview(&lib.project_dir(&project_id).map_err(error)?,&p,&snapshot_id,&sha256).map_err(error)
}
#[tauri::command]
fn restore_project_snapshot(state:State<AppState>,project_id:String,snapshot_id:String,sha256:String,confirmed:bool)->Reply<OpenProject> {
    if !confirmed {return Err("Preview and confirm the project snapshot before restoring".into());}
    let lib=lock(&state.library)?;let current=lib.get(&project_id).map_err(error)?;
    let dir=lib.project_dir(&project_id).map_err(error)?;
    let mut restored=core::snapshots::preview(&dir,&current,&snapshot_id,&sha256).map_err(error)?;
    core::snapshots::create(&dir,&current,"before-restore",lock(&state.settings)?.snapshot_retention).map_err(error)?;
    restored.modified_at=chrono::Utc::now().to_rfc3339();restored.builds=current.builds;
    lib.save(&restored,None).map_err(error)?;drop(lib);
    lock(&state.inspections)?.remove(&project_id);
    let inspection=if restored.source.is_some(){Some((*inspect(&state,&restored)?).clone())}else{None};
    Ok(OpenProject{project:restored,inspection})
}

#[tauri::command]
fn save_project(state: State<AppState>, window:tauri::WebviewWindow, mut project: Project) -> Reply<LibraryEntry> {
    check_document_owner(&state,&project.id,window.label())?;
    let existing = lock(&state.library)?.get(&project.id).map_err(error)?;
    project.source = existing.source;
    project.assets = existing.assets;
    project.builds = existing.builds;
    project.created_at = existing.created_at;
    if project.source.is_some() {
        project::validate_edits(&project, &*inspect(&state, &project)?).map_err(error)?;
    }
    project.modified_at = chrono::Utc::now().to_rfc3339();
    let entry=lock(&state.library)?.save(&project, None).map_err(error)?;
    let _=window.app_handle().emit("spark:project-saved",&project.id);
    Ok(entry)
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
async fn validate_setting_path(key:String,path:PathBuf)->Reply<String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !path.is_absolute() || !path.is_dir(){return Err("Choose an existing absolute folder path".into());}
        core::reject_links(&path).map_err(error)?;
        match key.as_str() {
            "hekDirectory"=>{
                let report=core::connections::inspect_kit(&path,"unconfirmed",None).map_err(error)?;
                let tool=report.tools.iter().find(|t|t.name=="tool.exe").ok_or("Tool check unavailable")?;
                Ok(format!("Map Builder: {}. Select its generation and check the full kit in Start here.",tool.state))
            },
            "hekTagsDirectory"=>Ok(core::connections::inspect_kit(path.parent().unwrap_or(&path),"unconfirmed",Some(&path)).map_err(error)?.editable_tags),
            "resourceDirectory"=>{
                let file=path.join("bitmaps.map");
                if !file.is_file(){return Ok("No classic bitmaps.map found. MCC ipak resources require a separate reader; supported source images can be matched in World.".into());}
                let hash=maps::hash_file(&file).map_err(error)?;
                let (_,index)=core::resource_map::open_verified(&file,&hash).map_err(error)?;
                Ok(format!("Classic resource index checked: {} entries. Connect it to an open map to verify image compatibility.",index.entries.len()))
            },
            "steamDirectory"=>{let libs=steam::libraries(&path).map_err(error)?;
                if !path.join("steamapps").is_dir(){return Err("This folder has no Steam steamapps directory".into());}
                Ok(format!("Steam folder structure checked; {} library roots read",libs.len()))},
            "mccDirectory"=>if path.join("halo1/maps").is_dir(){Ok("Halo 1 map folder found. Game installation and runtime tests remain separate.".into())}else{Err("This folder does not contain halo1/maps".into())},
            "invaderDirectory"=>if path.join(if cfg!(windows){"invader-build.exe"}else{"invader-build"}).is_file(){Ok("Invader builder file found. Check SHA/version in Runtimes & friends; it has not been run by this folder check.".into())}else{Err("No invader-build executable found in this folder".into())},
            "metadataTemplateDirectory"=>Ok("Folder available. Build preflight checks its Excession scenario/package metadata before use.".into()),
            _=>Err("Unknown path preference".into()),
        }
    }).await.map_err(error)?
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
        "hekDirectory",
        "hekTagsDirectory",
        "baboonDirectory",
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
async fn halo_setup_report(app:tauri::AppHandle)->Reply<serde_json::Value> {
    tauri::async_runtime::spawn_blocking(move || {
        let state=app.state::<AppState>();
        let settings=lock(&state.settings)?.clone();
        let installation=steam::discover(settings.steam_directory.as_deref(),settings.mcc_directory.as_deref());
        let registrations:Vec<runtime::RuntimeRegistration>=lock(&state.library)?.setting("runtimeRegistrations").map_err(error)?;
        let runtimes=runtime::report(&installation,&registrations).map_err(error)?;
        let mut kits=vec![];
        if let Some(root)=settings.hek_directory.as_ref() {
            kits.push(core::connections::inspect_kit(root,settings.hek_flavor.as_deref().unwrap_or("unconfirmed"),settings.hek_tags_directory.as_deref()).map_err(error)?);
        }
        if let Some(root)=installation.editing_tools.as_ref().filter(|r|settings.hek_directory.as_ref()!=Some(*r)) {
            kits.push(core::connections::inspect_kit(root,"h1aEk (discovered; select to configure)",None).map_err(error)?);
        }
        Ok(serde_json::json!({"schemaVersion":1,"runtimes":runtimes,"kits":kits,
            "editingKitSteamAppId":"1532190","mccInstalled":installation.mcc_path.is_some(),
            "invaderConfigured":settings.invader_directory.is_some()}))
    }).await.map_err(error)?
}

#[tauri::command]
async fn bitmap_resource_candidates(app:tauri::AppHandle,project_id:String)->Reply<Vec<serde_json::Value>> {
    tauri::async_runtime::spawn_blocking(move || {
        let state=app.state::<AppState>();
        let project=lock(&state.library)?.get(&project_id).map_err(error)?;
        let settings=lock(&state.settings)?.clone();
        let installed=lock(&state.installation)?.clone();
        let mut roots:Vec<(PathBuf,&str)>=vec![];
        if let Some(s)=project.source.as_ref() {
            if let Some(p)=&s.resource_directory {roots.push((p.clone(),"Previously selected resources"));}
            if let Some(p)=s.original_path.parent(){roots.push((p.to_path_buf(),"Beside the original map"));}
            let library=lock(&state.library)?;
            for entry in library.list().map_err(error)?.into_iter().filter(|entry|entry.id!=project_id&&entry.sha256.as_deref()==Some(s.sha256.as_str())).take(24){
                if let Ok(other)=library.get(&entry.id){if let Some(other)=other.source{if let Some(p)=other.resource_directory{roots.push((p,"Resources used by an identical preserved map"));}if let Some(p)=other.original_path.parent(){roots.push((p.to_path_buf(),"Beside an identical preserved map"));}}}
            }
        }
        if let Some(p)=settings.resource_directory {roots.push((p,"Configured resource folder"));}
        if let Some(p)=installed.mcc_path {roots.push((p.join("halo1/maps"),"Detected MCC legacy compatibility resources; ipak is separate"));}
        let registrations:Vec<runtime::RuntimeRegistration>=lock(&state.library)?.setting("runtimeRegistrations").map_err(error)?;
        for r in registrations {roots.push((r.root.join("maps"),"Registered Halo installation"));
            if let Some(p)=r.data_root {roots.push((p.join("maps"),"Registered runtime data"));}}
        let mut seen=std::collections::HashSet::new();
        Ok(roots.into_iter().filter_map(|(root,reason)|{let file=root.join("bitmaps.map");
            (file.is_file()&&seen.insert(file.clone())).then(||serde_json::json!({"path":file,"reason":reason}))}).collect())
    }).await.map_err(error)?
}

#[tauri::command]
async fn connect_halo_textures(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String,mode:String,path:String)->Reply<Option<OpenProject>> {
    let owner=window.label().to_owned();check_document_owner(&app.state::<AppState>(),&project_id,&owner)?;
    let chosen=match mode.as_str() {
        "file"=>rfd::AsyncFileDialog::new().set_title("Locate Halo Textures — original bitmaps.map")
            .add_filter("Halo bitmap resources",&["map"]).pick_file().await.map(|f|f.path().to_path_buf()),
        "folder"=>rfd::AsyncFileDialog::new().set_title("Choose the original Halo resources folder")
            .pick_folder().await.map(|f|f.path().to_path_buf()),
        "path"=>Some(PathBuf::from(path)),
        _=>return Err("Unknown Halo Textures selection mode".into()),
    };
    let Some(chosen)=chosen else{return Ok(None)};
    tauri::async_runtime::spawn_blocking(move || {
        core::reject_links(&chosen).map_err(error)?;
        let file=if chosen.is_dir(){chosen.join("bitmaps.map")}else{chosen};
        if !file.is_absolute(){return Err("Choose an absolute path to your original bitmaps.map".into());}
        let folder=file.parent().ok_or("Resource folder unavailable")?.to_path_buf();
        let state=app.state::<AppState>();
        check_document_owner(&state,&project_id,&owner)?;
        let mut p=lock(&state.library)?.get(&project_id).map_err(error)?;
        let before=serde_json::to_vec(&p).map_err(error)?;
        let s=p.source.as_ref().ok_or("Open a Halo map before connecting its shared textures")?;
        let inspected=inspect(&state,&p)?;
        let hash=maps::hash_file(&file).map_err(error)?;
        core::bitmap_preview::verify_resource_for_source(&s.preserved_path,&s.sha256,&inspected,&file,&hash).map_err(error)?;
        let hashes=project::resource_hashes(&folder).map_err(error)?;
        if hashes.get("bitmaps.map")!=Some(&hash){return Err("Resource changed during verification; try again".into());}
        let lib=lock(&state.library)?;
        if serde_json::to_vec(&lib.get(&project_id).map_err(error)?).map_err(error)?!=before {
            return Err("Project changed while verifying textures; try again".into());
        }
        let source=p.source.as_mut().ok_or("Source disappeared")?;
        source.resource_directory=Some(folder);source.resource_sha256=hashes;
        p.modified_at=chrono::Utc::now().to_rfc3339();
        lib.save(&p,Some(&inspected)).map_err(error)?;
        drop(lib);
        lock(&state.inspections)?.remove(&project_id);
        let _=app.emit("spark:project-saved",&project_id);
        Ok(Some(OpenProject{project:p,inspection:Some((*inspected).clone())}))
    }).await.map_err(error)?
}
#[tauri::command]
async fn auto_connect_sound_resources(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String)->Reply<Option<OpenProject>> {
    let owner=window.label().to_string();
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;
        let project=lock(&state.library)?.get(&project_id).map_err(error)?;
        let source=project.source.as_ref().ok_or("No preserved sound source")?;
        let inspected=inspect(&state,&project)?;
        if source.audio_resources.is_some(){return Ok(Some(OpenProject{project,inspection:Some((*inspected).clone())}));}
        let mcc=lock(&state.installation)?.mcc_path.clone();
        let binding=if source.cache_version==13 {
            let Some(root)=mcc else{return Ok(None)};
            let directory=root.join("halo1/sound/pc");
            if !directory.join("sounds_adpcm.fsb").is_file()||!directory.join("lst/sounds_adpcm.lst.bin").is_file(){return Ok(None);}
            Some(core::mcc_audio::pin_mcc(&directory).map_err(error)?)
        }else if [6,7,609].contains(&source.cache_version) {
            let mut roots=vec![];
            if let Some(root)=&source.resource_directory{roots.push(root.clone());}
            if let Some(root)=source.original_path.parent(){roots.push(root.to_path_buf());}
            if let Some(root)=lock(&state.settings)?.resource_directory.clone(){roots.push(root);}
            if let Some(root)=mcc{roots.push(root.join("halo1/maps/custom_edition"));}
            let mut seen=std::collections::HashSet::new();let mut found=None;
            for root in roots.into_iter().filter(|root|seen.insert(root.clone())).take(6) {
                if !root.join("sounds.map").is_file(){continue;}
                let Ok(binding)=core::mcc_audio::pin_classic(&root) else{continue};
                if source.resource_directory.as_ref()==Some(&root)&&source.resource_sha256.get("sounds.map").is_some_and(|hash|Some(hash)!=binding.sha256.get("sounds.map")){continue;}
                let matching=inspected.tags.iter().filter(|tag|tag.class=="snd!").take(8).any(|tag|audio::inspect_sound_with_bindings(&source.preserved_path,&source.sha256,tag.id,None,Some(&binding)).is_ok_and(|report|report.permutations.iter().any(|p|!p.embedded&&p.available)));
                if matching{found=Some(binding);break;}
            }
            found
        }else{None};
        let Some(binding)=binding else{return Ok(None)};
        let library=lock(&state.library)?;let mut latest=library.get(&project_id).map_err(error)?;
        check_document_owner(&state,&project_id,&owner)?;
        let latest_source=latest.source.as_mut().ok_or("Sound source disappeared")?;
        if latest_source.sha256!=source.sha256{return Err("Sound source changed during automatic resource discovery".into());}
        if latest_source.audio_resources.is_some(){return Ok(Some(OpenProject{project:latest,inspection:Some((*inspected).clone())}));}
        latest_source.audio_resources=Some(binding);library.save(&latest,None).map_err(error)?;
        Ok(Some(OpenProject{project:latest,inspection:Some((*inspected).clone())}))
    }).await.map_err(error)?
}
#[tauri::command]
async fn auto_connect_classic_textures(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String)->Reply<Option<OpenProject>>{
    let candidates={let state=app.state::<AppState>();check_document_owner(&state,&project_id,window.label())?;let lib=lock(&state.library)?;let project=lib.get(&project_id).map_err(error)?;let source=project.source.as_ref().ok_or("No map source")?;
        if ![6,7,609].contains(&source.cache_version)||source.resource_sha256.contains_key("bitmaps.map"){return Ok(None);}
        let mut roots=vec![];if let Some(dir)=&source.resource_directory{roots.push(dir.clone());}if let Some(dir)=source.original_path.parent(){roots.push(dir.to_path_buf());}
        for entry in lib.list().map_err(error)?{if entry.sha256.as_deref()!=Some(source.sha256.as_str())||entry.id==project_id{continue;}if let Ok(other)=lib.get(&entry.id){if let Some(s)=other.source{if let Some(dir)=s.resource_directory{roots.push(dir);}if let Some(dir)=s.original_path.parent(){roots.push(dir.to_path_buf());}}}}
        if let Some(dir)=lock(&state.settings)?.resource_directory.clone(){roots.push(dir);}let mut seen=std::collections::HashSet::new();roots.into_iter().map(|dir|dir.join("bitmaps.map")).filter(|file|file.is_file()&&seen.insert(file.clone())).take(12).collect::<Vec<_>>()};
    for file in candidates{if let Ok(Some(open))=connect_halo_textures(app.clone(),window.clone(),project_id.clone(),"path".into(),file.to_string_lossy().into_owned()).await{return Ok(Some(open));}}Ok(None)
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
fn configure(app: &tauri::AppHandle, state: &AppState, mut settings: Settings) -> Reply<()> {
    let _update=lock(&state.settings_write)?;
    let previous=lock(&state.settings)?.clone();
    // This preference has its own live command. An older Settings form must
    // not overwrite a shortcut changed while that form was open.
    settings.native_camera_shortcut=previous.native_camera_shortcut.clone();
    let discovery_changed=previous.steam_directory!=settings.steam_directory||previous.mcc_directory!=settings.mcc_directory||lock(&state.watcher)?.is_none();
    if !(1..=1440).contains(&settings.snapshot_interval_minutes) || !(1..=100).contains(&settings.snapshot_retention) {
        return Err("Snapshot interval must be 1–1440 minutes and retention 1–100".into());
    }
    if settings.hek_flavor.as_deref().is_some_and(|v| !matches!(v, "legacyHek" | "h1aEk")) {
        return Err("Select a known official Halo 1 Editing Kit family".into());
    }
    for (before,next) in [
        (&previous.steam_directory,&settings.steam_directory),
        (&previous.mcc_directory,&settings.mcc_directory),
        (&previous.invader_directory,&settings.invader_directory),
        (&previous.resource_directory,&settings.resource_directory),
        (&previous.metadata_template_directory,&settings.metadata_template_directory),
        (&previous.hek_directory,&settings.hek_directory),
        (&previous.hek_tags_directory,&settings.hek_tags_directory),
    ]
    {
        if before==next{continue;}let Some(p)=next else{continue};
        if !p.is_absolute() || !p.is_dir() {
            return Err(format!("Folder is unavailable: {}", p.display()));
        }
    }
    lock(&state.library)?
        .set_setting("preferences", &settings)
        .map_err(error)?;
    *lock(&state.settings)? = settings.clone();
    if previous.resource_directory!=settings.resource_directory{lock(&state.inspections)?.clear();}
    // Choosing a Halo or changing editor preferences does not require dropping
    // native watchers and rediscovering all game installations.
    if !discovery_changed{return Ok(());}
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
async fn save_settings(
    app: tauri::AppHandle,
    settings: Settings,
) -> Reply<Bootstrap> {
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();configure(&app,&state,settings)?;bootstrap_state(&state)
    }).await.map_err(error)?
}
#[tauri::command]
async fn extract_selected_tag_tree(app: tauri::AppHandle, project_id: String, tag_id: u32) -> Reply<tag_exchange::TagExtractReceipt> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let project = lock(&state.library)?.get(&project_id).map_err(error)?;
        let inspection = inspect(&state, &project)?;
        let tools = editing_tools(&state, &project)?;
        let job_id = uuid::Uuid::new_v4().to_string();
        let cancel = Arc::new(AtomicBool::new(false));
        {
            let mut jobs = lock(&state.jobs)?;
            if !jobs.is_empty() { return Err("A build or extraction is already running".into()); }
            jobs.insert(job_id.clone(),cancel.clone());
        }
        let result = tag_exchange::extract_selected_tag(
            &project, &inspection, &tools, &state.root, &job_id, tag_id, cancel,
            |e| event(&app,e),
        ).map_err(error);
        if let Ok(mut jobs) = state.jobs.lock() { jobs.remove(&job_id); }
        result
    }).await.map_err(error)?
}
#[tauri::command]
async fn list_tag_exchanges(app: tauri::AppHandle) -> Reply<Vec<tag_exchange::TagExchangeSummary>> {
    tauri::async_runtime::spawn_blocking(move || {
        let state=app.state::<AppState>();
        tag_exchange::list_exchanges(&state.root).map_err(error)
    }).await.map_err(error)?
}
#[tauri::command]
async fn stage_tag_exchange_into_project(app: tauri::AppHandle, project_id: String, source_job_id: String) -> Reply<tag_exchange::TagImportReceipt> {
    tauri::async_runtime::spawn_blocking(move || {
        let state=app.state::<AppState>();
        let target=lock(&state.library)?.get(&project_id).map_err(error)?;
        let job_id=uuid::Uuid::new_v4().to_string();
        let busy=Arc::new(AtomicBool::new(false));
        {
            let mut jobs=lock(&state.jobs)?;
            if !jobs.is_empty() {return Err("A build, extraction or staging job is already running".into());}
            jobs.insert(job_id.clone(),busy);
        }
        let result=tag_exchange::stage_into_project(&target,&state.root,&source_job_id,&job_id).map_err(error);
        if let Ok(mut jobs)=state.jobs.lock() {jobs.remove(&job_id);}
        result
    }).await.map_err(error)?
}
#[tauri::command]
fn cache_invader_installation(state: State<AppState>, source_directory: String) -> Reply<String> {
    // Explicit user-triggered local copy. No downloads or executables are run.
    let target = crate::tool_cache::cache_invader(Path::new(&source_directory), &state.root)?;
    Ok(target.to_string_lossy().into_owned())
}
#[tauri::command]
fn refresh_installation(app: tauri::AppHandle, state: State<AppState>) -> Reply<Bootstrap> {
    let settings = lock(&state.settings)?.clone();
    configure(&app, &state, settings)?;
    bootstrap(state)
}
#[tauri::command]
async fn compatibility(app:tauri::AppHandle, id: String) -> Reply<build::CompatibilityReport> {
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();
        let p = lock(&state.library)?.get(&id).map_err(error)?;
        let i = inspect(&state, &p)?;
        Ok(build::compatibility(&p, &i, &project_tools(&state, &p)?))
    }).await.map_err(error)?
}
#[tauri::command]
async fn prepare_mcc_conversion_tools(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:Option<String>)->Reply<String>{
    let owner=window.label().to_string();tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();if let Some(project)=&project_id{check_document_owner(&state,project,&owner)?;}
        let mut settings=lock(&state.settings)?.clone();
        let kit=settings.hek_directory.clone().filter(|p|p.join("HCEEK.7z").is_file()).or(lock(&state.installation)?.editing_tools.clone()).ok_or("Install Halo: CE Mod Tools - MCC using Steam Library → Tools, then refresh discovery")?;
        let existing=settings.hek_tags_directory.clone().filter(|p|settings.hek_flavor.as_deref()==Some("h1aEk")&&p.join("globals/globals.globals").is_file());
        let tags=if let Some(tags)=existing{tags}else{let id=uuid::Uuid::new_v4().to_string();let project=project_id.as_deref().unwrap_or("setup");match core::conversion::prepare_sdk_tags(&kit,&state.root.join("sdk-cache").join(&id),project,&id,|e|event(&app,e)){
            Ok(tags)=>tags,Err(failure)=>{event(&app,JobEvent{job_id:id,project_id:project.into(),phase:"sdk-failed".into(),message:failure.to_string(),progress:100,severity:"error".into(),timestamp:chrono::Utc::now().to_rfc3339()});return Err(error(failure));}
        }};
        settings.hek_directory=Some(kit);settings.hek_flavor=Some("h1aEk".into());settings.hek_tags_directory=Some(tags.clone());
        configure(&app,&state,settings)?;Ok(tags.to_string_lossy().into_owned())
    }).await.map_err(error)?
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
    baboon_native::guard_regeneration(&state,&project)?;
    snapshot_project_state(&state,&project,"before-build")?;
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
async fn copy_project_asset(app:tauri::AppHandle,window:tauri::WebviewWindow,source_id:String,asset_id:String,target_id:String)->Reply<AssetResult> {
    let owner=window.label().to_string();
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();check_document_owner(&state,&target_id,&owner)?;let lib=lock(&state.library)?;let(project,asset,imported)=core::asset_transfer::copy_obj(&lib,&source_id,&asset_id,&target_id).map_err(error)?;Ok(AssetResult{project,asset,mesh:imported.mesh,warnings:imported.warnings})}).await.map_err(error)?
}
#[tauri::command]
async fn import_asset(app: tauri::AppHandle, window: tauri::WebviewWindow, id: String, path: Option<PathBuf>) -> Reply<Option<AssetResult>> {
    let owner=window.label().to_string();
    let path=if let Some(path)=path{path}else{let file = rfd::AsyncFileDialog::new()
        .set_title("Import OBJ geometry into the Asset Workshop")
        .add_filter("Wavefront OBJ", &["obj"])
        .pick_file()
        .await;
    let Some(file) = file else { return Ok(None) };
    file.path().to_path_buf()};
    if !path.extension().is_some_and(|extension|extension.eq_ignore_ascii_case("obj")){return Err("Choose a Wavefront OBJ file".into());}
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        check_document_owner(&state,&id,&owner)?;
        core::reject_links(&path).map_err(error)?;
        let meta = fs::metadata(&path).map_err(error)?;
        if meta.len() > 64 * 1024 * 1024 {
            return Err("OBJ exceeds 64 MiB".into());
        }
        let mut bytes=Vec::new();
        std::io::Read::read_to_end(&mut std::io::Read::take(fs::File::open(&path).map_err(error)?,64*1024*1024+1),&mut bytes).map_err(error)?;
        if bytes.len()>64*1024*1024{return Err("OBJ exceeds 64 MiB".into());}
        let imported=assets::parse_obj(std::str::from_utf8(&bytes).map_err(error)?).map_err(error)?;
        let lib = lock(&state.library)?;
        let mut p = lib.get(&id).map_err(error)?;
        let asset_id = uuid::Uuid::new_v4().to_string();
        let dir = lib.project_dir(&id).map_err(error)?.join("assets");
        core::reject_links(&dir).map_err(error)?;
        fs::create_dir_all(&dir).map_err(error)?;
        let raw = dir.join(format!("{asset_id}.obj"));
        project::atomic_write(&raw,&bytes,false).map_err(error)?;
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
            source_model: None,
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
async fn import_custom_sound(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String,path:Option<PathBuf>)->Reply<Option<serde_json::Value>>{
    let path=if let Some(path)=path{path}else{let Some(file)=rfd::AsyncFileDialog::new().set_title("Import a custom sound into this map").add_filter("WAVE or Vorbis audio",&["wav","ogg"]).pick_file().await else{return Ok(None)};file.path().to_path_buf()};
    let owner=window.label().to_string();
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;let lib=lock(&state.library)?;let(project,asset)=core::custom_sounds::import(&lib,&project_id,&path).map_err(error)?;Ok(Some(serde_json::json!({"project":project,"asset":asset})))}).await.map_err(error)?
}
#[tauri::command]
async fn preview_custom_sound(app:tauri::AppHandle,project_id:String,asset_id:String,sha256:String)->Reply<core::custom_sounds::Preview>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let lib=lock(&state.library)?;core::custom_sounds::preview(&lib,&project_id,&asset_id,&sha256).map_err(error)}).await.map_err(error)?
}
#[tauri::command]
async fn inspect_map_ambience(app:tauri::AppHandle,project_id:String)->Reply<core::bsp_audio::Inspection>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let project=lock(&state.library)?.get(&project_id).map_err(error)?;let source=project.source.as_ref().ok_or("Choose a preserved map to inspect its ambience")?;core::bsp_audio::inspect_ambience(&source.preserved_path,&source.sha256).map_err(error)}).await.map_err(error)?
}
#[tauri::command]
async fn import_animation_sources(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String,paths:Option<Vec<PathBuf>>)->Reply<Vec<core::animations::AnimationAsset>>{
    let paths=if let Some(paths)=paths{paths}else{let Some(files)=rfd::AsyncFileDialog::new().set_title("Import Halo animations or an FBX animation").add_filter("Halo animations",&["jma","jmm","jmo","jmr","jmt","jmz","fbx","model_animations"]).pick_files().await else{return Ok(vec![])};files.into_iter().map(|f|f.path().to_path_buf()).collect()};
    if paths.is_empty()||paths.len()>16{return Err("Import between 1 and 16 animation files at a time".into());}let owner=window.label().to_string();
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;let (project,root)={let lib=lock(&state.library)?;(lib.get(&project_id).map_err(error)?,lib.project_dir(&project_id).map_err(error)?)};
        if project.animations.len()+paths.len()>128{return Err("This project's animation library is full (128 assets)".into());}let tools=editing_tools(&state,&project)?;let mut imported=vec![];
        for path in paths{imported.push(core::animations::import_owned(&root,&path,&tools,&project_id,|e|event(&app,e)).map_err(error)?);}Ok(imported)
    }).await.map_err(error)?
}
#[tauri::command]
async fn preview_animation_clip(app:tauri::AppHandle,project_id:String,asset:core::animations::AnimationAsset)->Reply<core::animations::AnimationClip>{
    tauri::async_runtime::spawn_blocking(move||{asset.validate().map_err(error)?;let state=app.state::<AppState>();let root=lock(&state.library)?.project_dir(&project_id).map_err(error)?;let folder=fs::canonicalize(root.join("animations").join(&asset.id)).map_err(error)?;let data=fs::canonicalize(&asset.data_path).map_err(error)?;
        if data.parent()!=Some(folder.as_path()){return Err("Animation preview must belong to this project's imported library".into());}core::animations::verified_clip(&asset).map_err(error)
    }).await.map_err(error)?
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
    let (scenario,scenario_type) = if p.quick_forge.is_some() {(p.scenario_path().map_err(error)?,1)} else {let i=inspect(&state,&p)?;(i.scenario_path.clone(),i.header.scenario_type)};
    let template = lock(&state.settings)?
        .metadata_template_directory
        .clone()
        .ok_or("Choose an unpublished Excession metadata template folder in Settings")?;
    mcc::inspect_template(&template, &scenario, scenario_type).map_err(error)
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
    Ok(Readiness{mcc_found:install.mcc_path.is_some(),halo1_installed:install.halo1_installed,steam_available:install.steam_executable.is_some(),package_valid,registered,running:steam::is_mcc_running(),launch_ready:ready,current_validated_build_id:current.ok().map(|b|b.id),current_build_message,message:if ready{"Choose ‘Play Halo: MCC Anti-Cheat Disabled (Mods and Limited Services)’ in Steam. Launch mode and in-game load remain unverified."}else{"Build and install a validated local package before launching this project. Settings → Dependencies & setup explains missing tools and source data. Existing-object live edits use a separate exact-build adapter; arbitrary spawning, live BSP replacement and multiplayer AI replication remain unavailable for MCC."}.into()})
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
fn launch_engine_take(state:State<AppState>,window:tauri::WebviewWindow,project_id:String,build_id:String,resolution:String)->Reply<String>{
    check_document_owner(&state,&project_id,window.label())?;let p=lock(&state.library)?.get(&project_id).map_err(error)?;let _build=verified_build(&state,&p,&build_id)?;
    let job=state.root.join("jobs").join(&build_id);let metadata:serde_json::Value=serde_json::from_slice(&bounded_read(&job.join("engine-machinima.json"),1024*1024)?).map_err(error)?;
    if metadata.get("schemaVersion").and_then(|v|v.as_u64())!=Some(2){return Err("Rebuild this take with the current recording controls before launching; older diagnostic scripts can display console text".into());}
    let scenario=p.scenario_path().map_err(error)?;if metadata.get("scenario").and_then(|v|v.as_str())!=Some(scenario.as_str())||metadata.get("projectFingerprint").and_then(|v|v.as_str())!=Some(p.fingerprint().map_err(error)?.as_str()){return Err("This build does not contain the current native camera take. Save and rebuild it first".into());}
    let scenario_file=job.join("tags").join(core::safe_relative(&format!("{scenario}.scenario")).map_err(error)?);core::reject_links(&scenario_file).map_err(error)?;
    if metadata.get("scenarioSha256").and_then(|v|v.as_str())!=Some(maps::hash_file(&scenario_file).map_err(error)?.as_str()){return Err("The take's scenario tags changed after compilation. Rebuild before launching".into());}
    let tools=project_tools(&state,&p)?;let kit=tools.h1a_directory.ok_or("Select Halo: CE Mod Tools - MCC before launching a native take")?;let exe=kit.join("halo_tag_test.exe");core::reject_links(&exe).map_err(error)?;if !exe.is_file(){return Err("MCC Standalone (halo_tag_test.exe) is missing from the selected editing kit".into());}
    let size=match resolution.as_str(){"1080p"=>(1920,1080),"1440p"=>(2560,1440),"4k"=>(3840,2160),"desktop"=>{let monitor=window.current_monitor().map_err(error)?.ok_or("Monitor resolution unavailable; choose a capture resolution")?;(monitor.size().width,monitor.size().height)},_=>return Err("Choose desktop, 1080p, 1440p or 4k capture resolution".into())};
    if size.0<640||size.1<480||size.0>7680||size.1>4320{return Err("Native capture resolution must be between 640×480 and 7680×4320".into());}
    let init=job.join("spark-engine-take-init.txt");let variant=if p.source.as_ref().is_some_and(|s|s.cache_version>0){"game_variant slayer\r\n"}else{""};project::atomic_write(&init,format!("; Spark native take. Flashlight toggles camera and HUD.\r\n{variant}map_name \"{scenario}\"\r\n").as_bytes(),false).map_err(error)?;
    let mut command=std::process::Command::new(&exe);command.current_dir(&kit).args(["-window","-vidmode",&format!("{},{}",size.0,size.1),"-tags_dir"]).arg(job.join("tags")).arg("-data_dir").arg(job.join("data")).arg("-exec").arg(&init).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]{use std::os::windows::process::CommandExt;command.creation_flags(0x08000000);}
    let child=command.spawn().map_err(error)?;Ok(format!("MCC Standalone take launched at {}×{} (process {}). Toggle your flashlight for camera/HUD controls; record the game window with OBS. Retail MCC load and actor movement still require acceptance.",size.0,size.1,child.id()))
}
#[tauri::command]
fn reveal_folder(state: State<AppState>, kind: String, id: Option<String>) -> Reply<()> {
    let path = match kind.as_str() {
        "inbox" => state.root.join("Inbox"),
        "data" => state.root.clone(),
        "project" => lock(&state.library)?
            .project_dir(&id.ok_or("Missing project ID")?)
            .map_err(error)?,
        "tagExchange" => {
            let job_id = id.ok_or("Missing tag extraction ID")?;
            uuid::Uuid::parse_str(&job_id).map_err(error)?;
            let path=state.root.join("tag-exchanges").join(job_id).join("tags");
            core::reject_links(&path).map_err(error)?;
            path
        },
        "tagImport" => {
            let ids=id.ok_or("Missing staged tag import IDs")?;
            let (project_id,job_id)=ids.split_once(':').ok_or("Expected target project and import job IDs")?;
            uuid::Uuid::parse_str(project_id).map_err(error)?;
            uuid::Uuid::parse_str(job_id).map_err(error)?;
            let path=state.root.join("tag-imports").join(project_id).join(job_id).join("tags");
            core::reject_links(&path).map_err(error)?;
            path
        },
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
async fn close_application(app: tauri::AppHandle,window:tauri::WebviewWindow) -> Reply<()> {
    if app.webview_windows().keys().filter(|label|!label.starts_with("director-")).count()==1 {
        let closing=app.clone();tauri::async_runtime::spawn_blocking(move||{let state=closing.state::<AppState>();let mut live=lock(&state.live_mcc)?;if let Some(session)=live.as_ref(){crate::live_mcc::disconnect(session).map_err(error)?;}*live=None;Ok::<(),String>(())}).await.map_err(error)??;
    }
    lock(&app.state::<AppState>().document_owners)?.retain(|_,owner|owner!=window.label());
    window.destroy().map_err(error)
}
fn check_document_owner(state:&AppState,id:&str,label:&str)->Reply<()> {
    if lock(&state.document_owners)?.get(id).is_some_and(|owner|owner!=label){return Err("This map is being edited in another Spark window. Close it there before editing it here.".into());}Ok(())
}
#[tauri::command]
fn claim_project_document(state:State<AppState>,window:tauri::WebviewWindow,id:String)->Reply<()> {
    let _=lock(&state.library)?.get(&id).map_err(error)?;
    let mut owners=lock(&state.document_owners)?;
    if owners.get(&id).is_some_and(|owner|owner!=window.label()){return Err("This map is already open for editing in another Spark window.".into());}
    owners.insert(id,window.label().into());Ok(())
}
#[tauri::command]
fn release_project_document(state:State<AppState>,window:tauri::WebviewWindow,id:String)->Reply<()> {
    let mut owners=lock(&state.document_owners)?;if owners.get(&id).is_some_and(|owner|owner==window.label()){owners.remove(&id);}Ok(())
}
#[tauri::command]
async fn open_project_window(app:tauri::AppHandle,window:tauri::WebviewWindow,id:String)->Reply<String> {
    let state=app.state::<AppState>();let project=lock(&state.library)?.get(&id).map_err(error)?;
    check_document_owner(&state,&id,window.label())?;
    let label=format!("editor-{}",uuid::Uuid::new_v4());
    let url=tauri::WebviewUrl::App(format!("index.html?project={}",project.id).into());
    // Only a registered UUID project may select the local app page. No arbitrary URL or script.
    if uuid::Uuid::parse_str(&project.id).is_err(){return Err("Invalid project identity".into());}
    let child=tauri::WebviewWindowBuilder::new(&app,&label,url).title(format!("{} · Project Guilty Spark",project.title)).inner_size(1440.,900.).min_inner_size(1000.,640.).decorations(false).transparent(true).shadow(true).theme(Some(tauri::Theme::Dark)).build().map_err(error)?;
    lock(&state.document_owners)?.insert(id,child.label().into());Ok(label)
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
// Only exact, known tool executable filenames are eligible; no shell, arbitrary
// arguments or user-provided executable path can be launched via this API.
#[derive(Clone, Copy)]
struct ToolChoice { id: &'static str, filename: &'static str, group: &'static str, gui: bool }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolchainTool {
    id: String,
    available: bool,
    executable: Option<PathBuf>,
    launch_mode: String,
    detail: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolchainProbe {
    tool_id: String,
    sha256: String,
    byte_size: u64,
    mode: String,
    executed: bool,
    exit_code: Option<i32>,
    output: String,
    message: String,
}
fn probe_pipe<R: Read + Send + 'static>(mut stream: R) -> std::thread::JoinHandle<String> {
    std::thread::spawn(move || {
        // Drain even if output is long so a child cannot deadlock on a full pipe.
        // Only retain the first 12 KiB for UI display.
        let mut stored = Vec::new();
        let mut chunk = [0u8; 4096];
        loop {
            match stream.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let room = 12_288usize.saturating_sub(stored.len());
                    stored.extend_from_slice(&chunk[..n.min(room)]);
                }
            }
        }
        String::from_utf8_lossy(&stored).to_string()
    })
}
fn bounded_invader_info(file: &Path) -> Reply<(Option<i32>, String)> {
    // -i is Invader's documented read-only information/version operation.
    // There are no arbitrary user arguments, flags, paths or shell invocations.
    let mut child = std::process::Command::new(file)
        .arg("-i")
        .current_dir(file.parent().ok_or("Missing tool directory")?)
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(error)?;
    let stdout = probe_pipe(child.stdout.take().ok_or("Missing tool stdout")?);
    let stderr = probe_pipe(child.stderr.take().ok_or("Missing tool stderr")?);
    let start = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().map_err(error)? { break status; }
        if start.elapsed() >= Duration::from_secs(5) {
            let _ = child.kill();
            let _ = child.wait();
            // Join draining readers after termination so no background process remains.
            let _ = stdout.join(); let _ = stderr.join();
            return Err("Invader -i timed out; the diagnostic process was terminated".into());
        }
        std::thread::sleep(Duration::from_millis(30));
    };
    let stdout = stdout.join().map_err(|_| "Info output thread failed")?;
    let stderr = stderr.join().map_err(|_| "Info error thread failed")?;
    Ok((status.code(),format!("{}\n{}",stdout,stderr).trim().to_owned()))
}
/// Read-only file identity for every configured tool; for the Invader CLI only,
/// optionally run the documented -i information switch in a bounded console.
/// GUI editors remain native separate processes, never silently re-parented.
#[tauri::command]
async fn probe_toolchain_tool(app: tauri::AppHandle, runtime_id: String, tool_id: String, run_info: bool) -> Reply<ToolchainProbe> {
    // Hashing a 256 MiB executable or waiting for `-i` may take seconds. Run
    // outside the Tauri UI thread; preserve the exact same allowlist and limits.
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        probe_toolchain_tool_blocking(state, runtime_id, tool_id, run_info)
    }).await.map_err(error)?
}
fn probe_toolchain_tool_blocking(state: State<AppState>, runtime_id: String, tool_id: String, run_info: bool) -> Reply<ToolchainProbe> {
    if !cfg!(target_os="windows") {return Err("Native tool inspection requires the Windows desktop build".into());}
    let settings=lock(&state.settings)?.clone();
    let choice=allowed_toolchain(&runtime_id,settings.hek_flavor.as_deref()).into_iter()
        .find(|choice|choice.id==tool_id).ok_or("Tool is not allowed for this selected runtime/profile")?;
    let file=known_tool_file(&settings,choice)?.ok_or("Executable not found in configured tool folder")?;
    let size=fs::metadata(&file).map_err(error)?.len();
    if size>256*1024*1024 {return Err("Executable larger than supported 256 MiB audit limit".into());}
    let hash=maps::hash_file(&file).map_err(error)?;
    let can_info=!choice.gui && choice.group=="invader";
    if run_info && !can_info {return Err("Only compatible Invader CLI -i probes can execute in the embedded console".into());}
    let (exit_code,output,executed)=if run_info {
        let (code,text)=bounded_invader_info(&file)?;(code,text,true)
    }else{(None,String::new(),false)};
    Ok(ToolchainProbe{tool_id,sha256:hash,byte_size:size,
        mode:if choice.gui{"externalGui".into()}else{"integratedCli".into()},
        executed,exit_code,output,
        message:if executed{"Only Invader -i was executed. No content-build, tag-modification or map command ran. Tool version and target compatibility still require validation.".into()}
            else{"Read-only executable hash and size. No tool process executed.".into()}})
}
fn allowed_toolchain(runtime_id: &str, flavor: Option<&str>) -> Vec<ToolChoice> {
    let official = [
        ToolChoice { id:"sapien", filename:"sapien.exe", group:"official", gui:true },
        ToolChoice { id:"guerilla", filename:"guerilla.exe", group:"official", gui:true },
        ToolChoice { id:"haloTool", filename:"tool.exe", group:"official", gui:false },
    ];
    let invader = [
        ToolChoice { id:"invaderEditor", filename:"invader-edit-qt.exe", group:"invader", gui:true },
        ToolChoice { id:"invaderExtract", filename:"invader-extract.exe", group:"invader", gui:false },
        ToolChoice { id:"invaderInfo", filename:"invader-info.exe", group:"invader", gui:false },
    ];
    match runtime_id {
        "mccSteam" if flavor == Some("h1aEk") => {
            let mut tools = official.to_vec();
            tools.push(ToolChoice { id:"tagTest", filename:"halo_tag_test.exe", group:"official", gui:true });
            tools
        }
        "haloCustomEdition" => {
            let mut tools=Vec::new();
            if flavor==Some("legacyHek") {tools.extend(official);}
            tools.extend(invader);
            tools.push(ToolChoice {id:"invaderBuild",filename:"invader-build.exe",group:"invader",gui:false});
            tools
        }
        "haloPc" | "haloPcTrial" | "openCe" | "chupathingyCe" => invader.to_vec(),
        _ => vec![],
    }
}
fn known_tool_file(settings:&Settings, choice:ToolChoice)->Reply<Option<PathBuf>> {
    let root = if choice.group=="official" { settings.hek_directory.as_ref() }
        else { settings.invader_directory.as_ref() };
    let Some(root)=root else {return Ok(None)};
    // Refuse symlinked directories, reparse points, junctions or executable aliases.
    core::reject_links(root).map_err(error)?;
    let file=root.join(choice.filename);
    if !file.is_file() {return Ok(None)};
    core::reject_links(&file).map_err(error)?;
    let canonical_root=fs::canonicalize(root).map_err(error)?;
    if file.parent()!=Some(root.as_path()) {return Err("Tool is not located in configured tool directory".into());}
    let canonical_file=fs::canonicalize(&file).map_err(error)?;
    if canonical_file.parent()!=Some(canonical_root.as_path()) {return Err("Tool escaped configured tool directory".into());}
    if fs::metadata(&file).map_err(error)?.len()==0 {return Err("Tool executable is empty".into());}
    Ok(Some(canonical_file))
}
#[tauri::command]
fn toolchain_inventory(state:State<AppState>,runtime_id:String)->Reply<Vec<ToolchainTool>> {
    let settings=lock(&state.settings)?.clone();
    let mut tools:Vec<ToolchainTool>=allowed_toolchain(&runtime_id,settings.hek_flavor.as_deref()).into_iter().map(|choice|{
        let (file,detail)=match known_tool_file(&settings,choice) {
            Ok(Some(path)) => (Some(path),"Exact installed executable found. Version/runtime compatibility still requires owner testing.".to_string()),
            Ok(None) => (None,"Executable not found in configured tool folder.".to_string()),
            Err(reason) => (None,format!("Executable rejected: {reason}")),
        };
        Ok(ToolchainTool { id:choice.id.into(), available:cfg!(target_os="windows") && file.is_some(),executable:file,
            launch_mode:if choice.gui {"externalGui".into()} else {"integratedCli".into()},detail })
    }).collect::<Reply<_>>()?;
    if runtime_id=="mccSteam"&&settings.hek_flavor.as_deref()==Some("h1aEk") {
        let (executable,detail)=match baboon_native::installation(&state){Ok(i)=>(Some(i.executable),format!("Verified Baboon {} and matching Halo 1 definitions. Open a validated map's native tag handoff.",i.version)),Err(e)=>(None,e)};
        tools.push(ToolchainTool{id:"baboon".into(),available:cfg!(windows)&&executable.is_some(),executable,launch_mode:"sourceHandoff".into(),detail});
    }
    Ok(tools)
}
#[tauri::command]
fn launch_toolchain_tool(state:State<AppState>,runtime_id:String,tool_id:String,confirm_source_mutation:bool)->Reply<String> {
    if !cfg!(target_os="windows") {return Err("External Halo tool launching is currently supported only on Windows".into());}
    if !confirm_source_mutation {return Err("Confirm that the selected tool may write to its configured working tag directory".into());}
    let settings=lock(&state.settings)?.clone();
    let choice=allowed_toolchain(&runtime_id,settings.hek_flavor.as_deref()).into_iter()
        .find(|choice|choice.id==tool_id).ok_or("Tool is not enabled for this runtime/profile")?;
    if !choice.gui {return Err("CLI tools must run through an audited Guilty Spark workflow, not a bare terminal".into());}
    let file=known_tool_file(&settings,choice)?.ok_or("Executable is not installed in the configured tool directory")?;
    let dir=file.parent().ok_or("No working directory for tool")?;
    // This explicitly launches a separately installed GUI. It is not an embedded
    // game/editor bridge, does not alter a running Halo process, and never uses a shell.
    let child=std::process::Command::new(&file).current_dir(dir).spawn().map_err(error)?;
    Ok(format!("Launched {} beside Guilty Spark (PID {}). No scenario opened or game process modified.",choice.id,child.id()))
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
async fn runtime_hosting_plan(app:tauri::AppHandle,runtime_id:runtime::RuntimeId,action:runtime::HostingAction,project_id:Option<String>)->Reply<serde_json::Value> {
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();let project=project_id.map(|id|lock(&state.library)?.get(&id).map_err(error)).transpose()?;
        let scenario_type=if let Some(project)=&project{if project.quick_forge.is_some(){Some(1)}else if project.source.is_some(){Some(inspect(&state,project)?.header.scenario_type)}else{None}}else{None};
        let plan=runtime::hosting_plan_for(runtime_id,action,scenario_type);
        Ok(serde_json::json!({"plan":plan,"mapTitle":project.as_ref().map(|p|&p.title),"scenarioType":scenario_type,"cacheVersion":project.as_ref().and_then(|p|p.source.as_ref().map(|s|s.cache_version))}))
    }).await.map_err(error)?
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
// User-owned legacy programs stay outside Spark's map/tag build pipeline.
// The private library records exact executable hashes and canonical paths;
// the frontend sees only names and compatibility *candidates*.
#[tauri::command]
async fn legacy_companion_dashboard(app: tauri::AppHandle) -> Reply<crate::legacy_companions::Dashboard> {
    tauri::async_runtime::spawn_blocking(move || {
        let state=app.state::<AppState>();
        let regs:Vec<crate::legacy_companions::Registration>=lock(&state.library)?.setting("legacyCompanions").map_err(error)?;
        Ok(crate::legacy_companions::dashboard(&regs,&state.root))
    }).await.map_err(error)?
}
#[tauri::command]
async fn choose_legacy_companion_path(format: String) -> Reply<Option<PathBuf>> {
    let dialog=rfd::AsyncFileDialog::new().set_title("Choose an already installed historical Halo tool (never your game .map)");
    match format.as_str() {
        "windows-pe" => Ok(dialog.add_filter("Windows application", &["exe"]).pick_file().await.map(|file|file.path().to_path_buf())),
        "mac-app" => Ok(dialog.pick_folder().await.map(|folder|folder.path().to_path_buf())),
        _ => Err("Choose a supported companion application format".into()),
    }
}
#[tauri::command]
async fn register_legacy_companion(app: tauri::AppHandle, tool_id: String, format: String, path: PathBuf) -> Reply<crate::legacy_companions::Dashboard> {
    tauri::async_runtime::spawn_blocking(move || {
        let state=app.state::<AppState>();
        let library=lock(&state.library)?;
        let mut regs:Vec<crate::legacy_companions::Registration>=library.setting("legacyCompanions").map_err(error)?;
        crate::legacy_companions::register(&tool_id,&format,path,&state.root,&mut regs)?;
        library.set_setting("legacyCompanions",&regs).map_err(error)?;
        Ok(crate::legacy_companions::dashboard(&regs,&state.root))
    }).await.map_err(error)?
}
#[tauri::command]
async fn unregister_legacy_companion(app: tauri::AppHandle, registration_id: String) -> Reply<crate::legacy_companions::Dashboard> {
    uuid::Uuid::parse_str(&registration_id).map_err(error)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state=app.state::<AppState>();
        let library=lock(&state.library)?;
        let mut regs:Vec<crate::legacy_companions::Registration>=library.setting("legacyCompanions").map_err(error)?;
        let before=regs.len();
        regs.retain(|r|r.id!=registration_id);
        if regs.len()==before {return Err("Companion registration was not found".into());}
        library.set_setting("legacyCompanions",&regs).map_err(error)?;
        Ok(crate::legacy_companions::dashboard(&regs,&state.root))
    }).await.map_err(error)?
}
#[tauri::command]
async fn launch_legacy_companion(app: tauri::AppHandle, registration_id: String, confirm_external_launch: bool) -> Reply<String> {
    if !confirm_external_launch {return Err("External launch requires a separate confirmation".into());}
    uuid::Uuid::parse_str(&registration_id).map_err(error)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state=app.state::<AppState>();
        let regs:Vec<crate::legacy_companions::Registration>=lock(&state.library)?.setting("legacyCompanions").map_err(error)?;
        let reg=regs.iter().find(|r|r.id==registration_id).ok_or("Registered companion not found")?;
        crate::legacy_companions::launch(reg,&state.root,confirm_external_launch)
    }).await.map_err(error)?
}

#[tauri::command]
async fn inspect_looping_sound(app: tauri::AppHandle, project_id: String, tag_id: u32) -> Reply<core::looping_audio::Inspection> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let project = lock(&state.library)?.get(&project_id).map_err(error)?;
        let source = project.source.ok_or("Project has no source map")?;
        core::looping_audio::inspect(&source.preserved_path, &source.sha256, tag_id).map_err(error)
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
        let resource=s.resource_directory.as_ref().map(|p|p.join("sounds.map"));
        let pinned=resource.as_ref().zip(s.resource_sha256.get("sounds.map")).map(|(p,h)|(p.as_path(),h.as_str()));
        audio::inspect_sound_with_bindings(&s.preserved_path, &s.sha256, tag_id,pinned,s.audio_resources.as_ref()).map_err(error)
    })
    .await
    .map_err(error)?
}

#[derive(serde::Serialize)]
#[serde(rename_all="camelCase")]
struct OwnedModelPreview {
    source_sha256:String,resource_sha256:Option<String>,object_tag_id:u32,model_tag_id:u32,
    mesh:maps::MeshData,tags:Vec<maps::Tag>,
}
#[tauri::command]
async fn preview_owned_object_model(app:tauri::AppHandle,project_id:String,tag_id:u32,source_sha256:String)->Reply<OwnedModelPreview>{
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();let project=lock(&state.library)?.get(&project_id).map_err(error)?;
        let source=project.source.as_ref().ok_or("Model source has no preserved map")?;
        if source.sha256!=source_sha256{return Err("Model reference source SHA-256 differs from the project".into());}
        let inspection=inspect(&state,&project)?;
        let (model_id,mesh)=core::render::preview_owned_object_model(&source.preserved_path,&source.sha256,&inspection,tag_id).map_err(error)?;
        let mut ids:std::collections::HashSet<u32>=mesh.material_ranges.iter().map(|r|r.shader_tag_id).collect();
        for shader in inspection.tags.iter().filter(|t|ids.contains(&t.id)).collect::<Vec<_>>(){for reference in &shader.references{ids.insert(reference.target_id);}}
        let tags=inspection.tags.iter().filter(|t|ids.contains(&t.id)).cloned().collect();
        Ok(OwnedModelPreview{source_sha256:source.sha256.clone(),resource_sha256:source.resource_sha256.get("mcc-textures").or_else(||source.resource_sha256.get("bitmaps.map")).cloned(),object_tag_id:tag_id,model_tag_id:model_id,mesh,tags})
    }).await.map_err(error)?
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
        let resource=s.resource_directory.as_ref().map(|p|p.join("sounds.map"));
        let pinned=resource.as_ref().zip(s.resource_sha256.get("sounds.map")).map(|(p,h)|(p.as_path(),h.as_str()));
        audio::preview_sound_with_bindings(
            &s.preserved_path,
            &s.sha256,
            tag_id,
            pitch_range,
            permutation,
            pinned,
            s.audio_resources.as_ref(),
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
        let source = p.source.as_ref();
        let reports = runtime_reports(&state)?;
        let installed = reports
            .into_iter()
            .find(|r| r.id == runtime_id)
            .and_then(|r| r.installation);
        let build = if runtime_id == runtime::RuntimeId::MccSteam || p.quick_forge.is_some() {
            current_build(&state, &p).ok()
        } else {
            None
        };
        let inspection = if let Some(record) = &build {
            maps::inspect_map(record.output.as_ref().unwrap(), None).map_err(error)?
        } else {
            if source.is_none() {return Err("Build this QuickForge project successfully before creating a map manifest".into());}
            (*inspect(&state, &p)?).clone()
        };
        let resources = project_tools(&state, &p)?
            .resource_directory
            .or_else(|| source.and_then(|s|s.original_path.parent().map(Path::to_path_buf)));
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
            source_sha256: source.map(|s|s.sha256.clone()),
            build_tool_version: None,
            build_verified: build.is_some(),
            resource_set_verified: build.is_some()
                && inspection.resources.iter().all(|r| !r.required),
        };
        let mut manifest=multiplayer::create_manifest(&inspection, context, resource_ids).map_err(error)?;
        if let Some(document)=&p.quick_forge {
            use sha2::{Digest,Sha256};
            manifest.gameplay=Some(multiplayer::PeerGameplay{game_mode:document.game_mode.clone(),expected_players:p.firefight.as_ref().map_or(4,|f|f.player_count),configuration_sha256:p.firefight.as_ref().map(|f|serde_json::to_vec(f).map(|bytes|format!("{:x}",Sha256::digest(bytes)))).transpose().map_err(error)?});
            multiplayer::validate_manifest(&manifest).map_err(error)?;
        }
        Ok(manifest)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
async fn live_mcc_connect(app:tauri::AppHandle,mods_mode:bool)->Reply<crate::live_mcc::Status>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let root=lock(&state.installation)?.mcc_path.clone().ok_or("Connect the Steam MCC installation in Start here first")?;
        let mut slot=lock(&state.live_mcc)?;if let Some(existing)=slot.as_ref(){if let Ok(status)=crate::live_mcc::sample(existing){return Ok(status);}crate::live_mcc::disconnect(existing).map_err(error)?;}
        let session=crate::live_mcc::connect(&root,mods_mode).map_err(error)?;
        let shortcut=lock(&state.settings)?.native_camera_shortcut.clone();
        crate::live_mcc::camera_shortcut(&session,shortcut).map_err(error)?;
        let status=crate::live_mcc::sample(&session).map_err(error);*slot=Some(session);
        let _=app.emit("spark:live-session-changed",());status
    }).await.map_err(error)?
}
#[tauri::command]
async fn live_mcc_sample(app:tauri::AppHandle)->Reply<crate::live_mcc::Status>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let session=lock(&state.live_mcc)?.clone().ok_or("Live adapter is disconnected")?;
        // Keep the owning session until explicit disconnect/reconnect can stop
        // its controllers and restore their journals. A transient read failure
        // must not orphan a keeper that is about to apply an edit.
        crate::live_mcc::sample(&session).map_err(error)
    }).await.map_err(error)?
}
#[tauri::command]
async fn live_mcc_gameplay_inventory(app:tauri::AppHandle)->Reply<core::live_adapter::GameplayInventory>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let session=lock(&state.live_mcc)?.clone().ok_or("Connect the running Halo 1 map in Level editor → Live mode first")?;crate::live_mcc::gameplay_inventory(&session).map_err(error)}).await.map_err(error)?
}
#[tauri::command]
async fn live_mcc_sprint_status(app:tauri::AppHandle)->Reply<crate::live_mcc::NativeSprintStatus>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let session=lock(&state.live_mcc)?.clone().ok_or("Connect MCC in Level editor → Live mode first")?;crate::live_mcc::sprint_status(&session).map_err(error)}).await.map_err(error)?
}
#[tauri::command]
async fn live_mcc_sprint_configure(app:tauri::AppHandle,enabled:bool,config:core::live_adapter::sprint::Config)->Reply<crate::live_mcc::NativeSprintStatus>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let session=lock(&state.live_mcc)?.clone().ok_or("Connect MCC in Level editor → Live mode first")?;crate::live_mcc::sprint_configure(&session,enabled,config).map_err(error)}).await.map_err(error)?
}
#[tauri::command]
async fn live_mcc_camera_status(app:tauri::AppHandle)->Reply<crate::live_mcc::NativeCameraStatus>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let session=lock(&state.live_mcc)?.clone().ok_or("Connect MCC in Level editor → Live mode first")?;crate::live_mcc::camera_status(&session).map_err(error)}).await.map_err(error)?
}
#[tauri::command]
async fn live_mcc_camera_configure(app:tauri::AppHandle,enabled:bool,config:core::live_adapter::camera::Config)->Reply<crate::live_mcc::NativeCameraStatus>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let session=lock(&state.live_mcc)?.clone().ok_or("Connect MCC in Level editor → Live mode first")?;crate::live_mcc::camera_configure(&session,enabled,config).map_err(error)}).await.map_err(error)?
}
#[tauri::command]
async fn live_mcc_camera_shortcut(app:tauri::AppHandle,shortcut:core::live_adapter::camera::Shortcut)->Reply<crate::live_mcc::NativeCameraStatus>{
    shortcut.function_key().map_err(error)?;
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let session=lock(&state.live_mcc)?.clone().ok_or("Connect MCC in Level editor → Live mode first")?;
        {let _update=lock(&state.settings_write)?;let mut settings=lock(&state.settings)?.clone();
            settings.native_camera_shortcut=shortcut.clone();lock(&state.library)?.set_setting("preferences",&settings).map_err(error)?;
            *lock(&state.settings)?=settings;}
        crate::live_mcc::camera_shortcut(&session,shortcut).map_err(error)
    }).await.map_err(error)?
}
#[tauri::command]
async fn live_mcc_camera_toggle(app:tauri::AppHandle,config:Option<core::live_adapter::camera::Config>)->Reply<crate::live_mcc::NativeCameraStatus>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let session=lock(&state.live_mcc)?.clone().ok_or("Connect MCC in Level editor → Live mode first")?;crate::live_mcc::camera_toggle(&session,config).map_err(error)}).await.map_err(error)?
}
#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct LiveBinding {placement_id:String,datum:u32,tag_datum:u32,expected_position:[f32;3]}
#[tauri::command]
async fn live_mcc_apply(app:tauri::AppHandle,project_id:String,document:quickforge::QuickForgeDocument,bindings:Vec<LiveBinding>,expected_session:String)->Reply<Vec<core::live_adapter::MoveReceipt>>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let p=lock(&state.library)?.get(&project_id).map_err(error)?;
        if p.quick_forge.is_none()||document.runtime_id!=runtime::RuntimeId::MccSteam{return Err("Choose an MCC QuickForge project for live updates".into());}quickforge::validate_document(&document).map_err(error)?;
        let session=lock(&state.live_mcc)?.clone().ok_or("Live adapter is disconnected")?;
        crate::live_mcc::check_session_token(Some(&session),Some(&expected_session)).map_err(error)?;
        if !session.identity.scenario.eq_ignore_ascii_case(&quickforge::scenario_path(&document).map_err(error)?.replace('\\',"/")){return Err("Loaded Halo scenario does not match this QuickForge map. Build and load this project's map before binding live objects.".into());}
        let snapshot=crate::live_mcc::sample(&session).map_err(error)?;
        let mut moves=vec![];for binding in bindings {let placement=document.placements.iter().find(|p|p.id==binding.placement_id).ok_or("Bound placement was removed")?;
            let object=snapshot.snapshot.objects.iter().find(|o|o.datum==binding.datum&&o.tag_datum==binding.tag_datum).ok_or("Bound live object disappeared or respawned")?;
            let class=match object.kind{0=>"bipd",1=>"vehi",2=>"weap",3=>"eqip",6=>"scen",_=>""};
            if !object.tag_path.eq_ignore_ascii_case(&placement.tag_path.replace('\\',"/"))||placement.tag_class!=class{return Err("Live object tag/class does not match this placement; item collections must bind their actual spawned weapon separately".into());}
            moves.push(core::live_adapter::MoveObject{datum:object.datum,tag_datum:object.tag_datum,expected_position:binding.expected_position,position:placement.position});
        }
        crate::live_mcc::moves(&session,&moves).map_err(error)
    }).await.map_err(error)?
}
#[tauri::command]
async fn live_mcc_cleanup_status(app: tauri::AppHandle) -> Reply<crate::live_mcc::CleanupStatus> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let session = lock(&state.live_mcc)?;
        crate::live_mcc::cleanup_status(session.as_ref()).map_err(error)
    }).await.map_err(error)?
}
#[tauri::command]
async fn live_mcc_disconnect(app:tauri::AppHandle, expected_session:Option<String>)->Reply<crate::live_mcc::DisconnectReport>{
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();let mut slot=lock(&state.live_mcc)?;
        crate::live_mcc::check_session_token(slot.as_ref(),expected_session.as_deref()).map_err(error)?;
        let report=if let Some(session)=slot.as_ref(){crate::live_mcc::disconnect(session).map_err(error)?}
            else { crate::live_mcc::DisconnectReport::already_disconnected() };
        *slot=None;let _=app.emit("spark:live-session-changed",());Ok(report)
    }).await.map_err(error)?
}
#[tauri::command]
async fn live_mcc_move_object(app:tauri::AppHandle,operation:core::live_adapter::MoveObject,expected_session:String)->Reply<Vec<core::live_adapter::MoveReceipt>>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let session=lock(&state.live_mcc)?.clone().ok_or("Connect the live Halo adapter first")?;
        crate::live_mcc::check_session_token(Some(&session),Some(&expected_session)).map_err(error)?;
        crate::live_mcc::moves(&session,&[operation]).map_err(error)
    }).await.map_err(error)?
}
#[tauri::command]
async fn live_mcc_scale_info(app:tauri::AppHandle,datum:u32)->Reply<core::live_adapter::scaling::ScaleInfo>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let session=lock(&state.live_mcc)?.clone().ok_or("Connect the live Halo adapter first")?;crate::live_mcc::scale_info(&session,datum).map_err(error)}).await.map_err(error)?
}
#[tauri::command]
async fn live_mcc_scale_object(app:tauri::AppHandle,operation:core::live_adapter::scaling::ScaleOperation,expected_session:String)->Reply<core::live_adapter::scaling::ScaleReceipt>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let session=lock(&state.live_mcc)?.clone().ok_or("Connect the live Halo adapter first")?;crate::live_mcc::check_session_token(Some(&session),Some(&expected_session)).map_err(error)?;crate::live_mcc::scale(&session,&operation).map_err(error)}).await.map_err(error)?
}
#[tauri::command]
async fn live_mcc_import_map(app:tauri::AppHandle)->Reply<OpenProject>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let session=lock(&state.live_mcc)?.clone().ok_or("Connect the live Halo adapter first")?;let sample=crate::live_mcc::sample(&session).map_err(error)?;let name=sample.snapshot.identity.scenario.rsplit('/').next().ok_or("Live scenario has no map name")?;
        if name.is_empty()||name.len()>64||!name.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'_'||c==b'-'){return Err("Live map name is not supported for automatic lookup".into());}let path=session.root.join("halo1/maps").join(format!("{name}.map"));
        let mut opened=import_file(&state,&path)?;if opened.len()!=1{return Err("Expected one preserved live map".into());}let result=opened.remove(0);let identity=&sample.snapshot.identity;
        if result.inspection.as_ref().is_none_or(|i|i.tag_checksum!=Some(identity.checksum)||i.tags.len()!=identity.tag_count as usize||i.scenario_path.replace('\\',"/")!=identity.scenario){return Err("The preserved cache does not match the live tag checksum, tag count and scenario. Import the exact loaded map manually before enabling live gizmos.".into());}
        if crate::live_mcc::sample(&session).map_err(error)?.snapshot.identity!=sample.snapshot.identity{return Err("Map changed during preservation; reconnect before editing".into());}Ok(result)
    }).await.map_err(error)?
}

#[tauri::command]
async fn forge_session_host(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String,document:quickforge::QuickForgeDocument,lan:bool,transport:Option<core::session_invite::Transport>,link_game:Option<bool>)->Reply<shared_editing::Info>{
    let owner=window.label().to_string();tauri::async_runtime::spawn_blocking(move||shared_editing::host(&app.state::<AppState>(),&owner,project_id,document,lan,transport.unwrap_or(core::session_invite::Transport::Lan),link_game.unwrap_or(false))).await.map_err(error)?
}
#[tauri::command]
async fn forge_session_status(app:tauri::AppHandle,project_id:String)->Reply<Option<shared_editing::Info>>{tauri::async_runtime::spawn_blocking(move||shared_editing::status(&app.state::<AppState>(),&project_id)).await.map_err(error)?}
#[tauri::command]
async fn forge_session_join(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String,endpoint:String,key:String,transport:Option<core::session_invite::Transport>,invite:Option<String>)->Reply<core::forge_session::View>{
    let owner=window.label().to_string();tauri::async_runtime::spawn_blocking(move||shared_editing::join(&app.state::<AppState>(),&owner,project_id,endpoint,key,transport.unwrap_or(core::session_invite::Transport::Lan),invite)).await.map_err(error)?
}
#[tauri::command]
async fn forge_session_poll(app:tauri::AppHandle,project_id:String,session_id:Option<String>)->Reply<core::forge_session::View>{tauri::async_runtime::spawn_blocking(move||shared_editing::poll(&app.state::<AppState>(),&project_id,session_id.as_deref(),false)).await.map_err(error)?}
#[tauri::command]
async fn forge_session_resume(app:tauri::AppHandle,project_id:String,session_id:String)->Reply<core::forge_session::View>{tauri::async_runtime::spawn_blocking(move||shared_editing::poll(&app.state::<AppState>(),&project_id,Some(&session_id),true)).await.map_err(error)?}
#[tauri::command]
async fn forge_session_update(app:tauri::AppHandle,project_id:String,session_id:String,revision:u64,document:quickforge::QuickForgeDocument)->Reply<core::forge_session::View>{tauri::async_runtime::spawn_blocking(move||shared_editing::update(&app.state::<AppState>(),&project_id,&session_id,revision,document)).await.map_err(error)?}
#[tauri::command]
async fn forge_session_leave(app:tauri::AppHandle,project_id:String,session_id:String)->Reply<()>{tauri::async_runtime::spawn_blocking(move||shared_editing::leave(&app.state::<AppState>(),&project_id,&session_id)).await.map_err(error)?}
#[tauri::command]
async fn forge_session_invite(app:tauri::AppHandle,project_id:String,session_id:String,address:Option<String>)->Reply<String>{tauri::async_runtime::spawn_blocking(move||shared_editing::invite(&app.state::<AppState>(),&project_id,&session_id,address)).await.map_err(error)?}
#[tauri::command]
fn forge_session_parse_invite(text:String)->Reply<core::session_invite::Invite>{core::session_invite::Invite::decode(&text).map_err(error)}
#[tauri::command]
fn steam_module_status(state:State<AppState>)->serde_json::Value {
    let result=(||->Reply<bool>{let settings=lock(&state.settings)?.clone();if let(Some(folder),Some(hash))=(settings.steam_bridge_directory,settings.steam_bridge_manifest_sha256){crate::steam_bridge::validate(&folder,Some(&hash))?;Ok(true)}else{Ok(false)}})();
    match result{Ok(configured)=>serde_json::json!({"configured":configured,"appId":480,"testMode":true,"detail":if configured{"Optional Spacewar module verified; connect explicitly to test Steam"}else{"Choose the optional Steam test module folder to enable Spacewar"}}),Err(detail)=>serde_json::json!({"configured":false,"appId":480,"testMode":true,"detail":detail})}
}
#[tauri::command]
async fn choose_steam_module(app:tauri::AppHandle,path:Option<PathBuf>)->Reply<serde_json::Value>{
    let path=if let Some(path)=path{path}else{let Some(folder)=rfd::AsyncFileDialog::new().set_title("Choose the optional Spark Spacewar module folder").pick_folder().await else{return Ok(serde_json::json!({"cancelled":true}));};folder.path().to_path_buf()};
    tauri::async_runtime::spawn_blocking(move||{let(folder,hash)=crate::steam_bridge::validate(&path,None)?;let state=app.state::<AppState>();let mut settings=lock(&state.settings)?.clone();settings.steam_bridge_directory=Some(folder);settings.steam_bridge_manifest_sha256=Some(hash);configure(&app,&state,settings)?;Ok(steam_module_status(state))}).await.map_err(error)?
}
#[tauri::command]
async fn steam_session_probe(app:tauri::AppHandle)->Reply<crate::steam_bridge::Ready>{tauri::async_runtime::spawn_blocking(move||{
    let state=app.state::<AppState>();let settings=lock(&state.settings)?.clone();let folder=settings.steam_bridge_directory.ok_or("Choose the optional Spacewar module first")?;let hash=settings.steam_bridge_manifest_sha256.ok_or("Review the selected Steam module first")?;
    let bridge=crate::steam_bridge::Bridge::start(&folder,&hash,&["--probe".into()])?;Ok(bridge.ready.clone())
}).await.map_err(error)?}

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
                settings_write:Mutex::new(()),
                installation: Mutex::new(installation),
                managed: Mutex::new(None),
                watcher: Mutex::new(None),
                inspections: Mutex::new(HashMap::new()),
                jobs: Mutex::new(HashMap::new()),
                logs: Mutex::new(vec![]),
                diagnostics: Mutex::new(vec![]),
                live_mcc: Mutex::new(None),
                forge_session: Mutex::new(None),
                document_owners: Mutex::new(HashMap::new()),
                runtime_workbench: Mutex::new(Default::default()),
                external_changes: Mutex::new(Default::default()),
                invitations: Mutex::new(Default::default()),
                community_hosts: Mutex::new(Default::default()),
                map_downloads: Default::default(),
                dependency_install: Mutex::new(Default::default()),
                director:Mutex::new(Default::default()),
                recordings:Mutex::new(Default::default()),
            working_tag_changes:Mutex::new(Default::default()),
            conversion_repairs:Mutex::new(Default::default()),
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
        .on_window_event(|window,event|{director_native::window_event(window.app_handle(),window,event);if matches!(event,tauri::WindowEvent::Destroyed){
            if let Some(state)=window.app_handle().try_state::<AppState>(){if let Ok(mut owners)=state.document_owners.lock(){owners.retain(|_,owner|owner!=window.label());}}
            let app=window.app_handle().clone();let label=window.label().to_owned();
            tauri::async_runtime::spawn_blocking(move||{if let Some(state)=app.try_state::<AppState>(){external_changes_native::release_window(&state,&label);runtime_workbench::release_window(&state,&label);invitations_native::release_window(&state,&label);community_host_native::release_window(&state,&label);dependency_install::release_window(&state,&label);director_recording::release_window(&state,&label);working_tag_changes_native::release_window(&state,&label);conversion_resources_native::release_window(&state,&label);}});
        }})
        .invoke_handler(tauri::generate_handler![
            prepare_map_download,
            download_and_import_maps,
            map_download_status,
            cancel_map_download,
            dependency_install::dependency_report,
            dependency_install::prepare_dependency_action,
            director_native::director_session,
            director_native::director_update,
            director_native::director_popout,
            director_native::director_displays,
            director_native::director_window,
            director_recording::director_record_open,
            director_recording::director_record_append,
            director_recording::director_record_finish,
            working_tag_changes_native::working_tag_watch_start,
            working_tag_changes_native::working_tag_watch_poll,
            working_tag_changes_native::working_tag_watch_stop,
            conversion_resources_native::prepare_bitmap_tagset_repair,
            conversion_resources_native::create_bitmap_tagset_repair,
            conversion_resources_native::bitmap_tagset_repair_status,
            dependency_install::run_dependency_action,
            dependency_install::discard_dependency_action,
            dependency_install::choose_dependency_path,
            community_host_native::community_host_plan,
            community_host_native::community_host_save,
            community_host_native::community_control_connect,
            community_host_native::community_control_poll,
            community_host_native::community_control_disconnect,
            invitations_native::invitation_prepare,
            invitations_native::invitation_handoff,
            external_changes_native::external_map_watch_start,
            external_changes_native::external_map_watch_poll,
            external_changes_native::external_map_watch_stop,
            external_changes_native::external_map_change_import,
            runtime_workbench::runtime_workbench_report,
            runtime_workbench::prepare_runtime_tool,
            runtime_workbench::launch_runtime_tool,
            runtime_workbench::build_working_tags,
            baboon_native::baboon_report,
            baboon_native::baboon_register,
            baboon_native::baboon_prepare,
            baboon_native::baboon_launch,
            baboon_native::baboon_poll,
            baboon_native::baboon_reconcile,
            baboon_native::baboon_restore_start,
            runtime_workbench::inspect_bsp_audio_workspace,
            runtime_workbench::runtime_tool_processes,
            runtime_workbench::community_listing,
            runtime_workbench::community_join_preflight,
            runtime_workbench::community_join,
            runtime_workbench::mcc_owned_content_probe,
            bsp_assembly_options,
            plan_bsp_assembly,
            preview_bsp_assembly,
            claim_project_document,
            release_project_document,
            open_project_window,
            live_mcc_connect,
            live_mcc_sample,
            live_mcc_gameplay_inventory,
            live_mcc_sprint_status,
            live_mcc_sprint_configure,
            live_mcc_camera_status,
            live_mcc_camera_configure,
            live_mcc_camera_shortcut,
            live_mcc_camera_toggle,
            live_mcc_apply,
            live_mcc_cleanup_status,
            live_mcc_disconnect,
            live_mcc_move_object,
            live_mcc_scale_info,
            live_mcc_scale_object,
            live_mcc_import_map,
            forge_session_status,
            forge_session_resume,
            forge_session_invite,
            forge_session_parse_invite,
            steam_module_status,
            choose_steam_module,
            steam_session_probe,
            forge_session_host,
            forge_session_join,
            forge_session_poll,
            forge_session_update,
            forge_session_leave,
            preview_owned_cache_bitmap,
            inspect_source_appearance,
            preview_owned_cache_bitmap_batch,
            audit_owned_bitmap_resources,
            cache_invader_installation,
            extract_selected_tag_tree,
            list_tag_exchanges,
            stage_tag_exchange_into_project,
            bootstrap,
            open_project,
            connect_mcc_texture_resources,
            create_project,
            create_quickforge_project,
            quickforge_validate,
            quickforge_preview,
            quickforge_export,
            quickforge_build,
            quickforge_build_report,
            firefight_catalog,
            firefight_validate,
            firefight_preview,
            import_paths,
            open_built_map,
            import_dialog,
            save_project,
            list_project_snapshots,
            create_project_snapshot,
            preview_project_snapshot,
            restore_project_snapshot,
            export_project,
            choose_setting_path,
            validate_setting_path,
            choose_project_resources,
            bitmap_resource_candidates,
            halo_setup_report,
            connect_halo_textures,
            auto_connect_classic_textures,
            auto_connect_sound_resources,
            save_settings,
            refresh_installation,
            compatibility,
            portability_native::portability_profiles,
            portability_native::inspect_portability,
            portability_native::verify_native_preservation,
            portability_native::compare_portability,
            portability_native::save_portability_report,
            start_build,
            prepare_mcc_conversion_tools,
            validate_existing,
            cancel_build,
            import_asset,
            import_custom_sound,
            preview_custom_sound,
            inspect_map_ambience,
            import_animation_sources,
            preview_animation_clip,
            copy_project_asset,
            asset_mesh,
            inspect_template,
            install_package,
            remove_package,
            launch_readiness,
            launch_mcc,
            launch_native,
            launch_engine_take,
            close_application,
            initialize_mcc_inbox,
            runtime_report,
            legacy_companion_dashboard,
            choose_legacy_companion_path,
            register_legacy_companion,
            unregister_legacy_companion,
            launch_legacy_companion,
            toolchain_inventory,
            probe_toolchain_tool,
            launch_toolchain_tool,
            runtime_hosting_plan,
            inspect_runtime_registration,
            register_runtime,
            runtime_inventory,
            choose_runtime_path,
            launch_registered_runtime,
            inspect_sound,
            inspect_looping_sound,
            preview_owned_object_model,
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
            settings_write:Mutex::new(()),
            installation: Mutex::new(Installation::default()),
            managed: Mutex::new(None),
            watcher: Mutex::new(None),
            inspections: Mutex::new(HashMap::new()),
            jobs: Mutex::new(HashMap::new()),
            logs: Mutex::new(vec![]),
            diagnostics: Mutex::new(vec![]),
            live_mcc: Mutex::new(None),
            forge_session: Mutex::new(None),
            document_owners:Mutex::new(HashMap::new()),
            runtime_workbench:Mutex::new(Default::default()),
            external_changes:Mutex::new(Default::default()),
            invitations:Mutex::new(Default::default()),
            community_hosts:Mutex::new(Default::default()),
            map_downloads:Default::default(),
            dependency_install:Mutex::new(Default::default()),
            director:Mutex::new(Default::default()),
            recordings:Mutex::new(Default::default()),
            working_tag_changes:Mutex::new(Default::default()),
            conversion_repairs:Mutex::new(Default::default()),
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
    #[test]
    fn readiness_accepts_canonical_owned_output_and_rejects_other_directory() {
        let (_temp, state, p, mut record) = fixture();
        record.output = Some(fs::canonicalize(record.output.as_ref().unwrap()).unwrap());
        let receipt=state.root.join("jobs").join(&record.id).join("receipt.json");
        fs::write(&receipt,serde_json::to_vec(&record).unwrap()).unwrap();
        assert_eq!(current_build(&state,&p).unwrap().id,record.id);
        let elsewhere=state.root.join("same-content.map");
        fs::copy(record.output.as_ref().unwrap(),&elsewhere).unwrap();
        record.output=Some(elsewhere);
        fs::write(&receipt,serde_json::to_vec(&record).unwrap()).unwrap();
        assert!(current_build(&state,&p).is_err());
    }
}
