//! Project-bound Baboon handoffs. All edits and reconciled results stay in fresh
//! job-owned tag trees; installed SDKs, preserved maps and old builds are inputs.
use super::*;
use spark_core::{
    baboon, tool_transaction as transaction,
    working_tag_changes::{TagChangeMonitor, TagChanges},
};
use std::{
    collections::BTreeSet,
    process::{Child, Command},
    sync::OnceLock,
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Session {
    schema_version: u32,
    id: String,
    owner: String,
    project_id: String,
    fingerprint: String,
    parent_build_id: String,
    selected_tag: String,
    baseline: transaction::Inventory,
    #[serde(default)]
    initial_baseline: transaction::Inventory,
    revisions: Vec<String>,
    executable_sha256: String,
    definitions_sha256: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActiveSource {
    project_id: String,
    session_id: String,
    revision_id: String,
    fingerprint: String,
    parent_build_id: String,
}
struct Watched {
    project_id: String,
    monitor: TagChangeMonitor,
    _watcher: notify::RecommendedWatcher,
    dirty: Arc<AtomicBool>,
    resync: Arc<AtomicBool>,
    paths: Arc<Mutex<BTreeSet<String>>>,
    started: Instant,
    touched: Instant,
    integrity: core::native_tag_integrity::Cache,
    parser: native_tag_parser::Cache,
    child: Option<Child>,
}
fn registry() -> &'static Mutex<HashMap<String, Arc<Mutex<Watched>>>> {
    static WATCHES: OnceLock<Mutex<HashMap<String, Arc<Mutex<Watched>>>>> = OnceLock::new();
    WATCHES.get_or_init(|| Mutex::new(HashMap::new()))
}
fn root(state: &AppState, id: &str) -> Reply<PathBuf> {
    uuid::Uuid::parse_str(id).map_err(error)?;
    let root = state.root.join("jobs").join(format!("baboon-{id}"));
    core::reject_links(&root).map_err(error)?;
    Ok(root)
}
fn load(state: &AppState, id: &str, owner: &str, project_id: &str) -> Reply<Session> {
    let file = root(state, id)?.join("handoff.json");
    core::reject_links(&file).map_err(error)?;
    let session: Session =
        serde_json::from_slice(&bounded_read(&file, 16 * 1024 * 1024)?).map_err(error)?;
    if session.schema_version != 1
        || session.id != id
        || session.owner != owner
        || session.project_id != project_id
        || session.revisions.len() > 100
    {
        return Err(
            "This Baboon handoff belongs to another map/window or has an unsupported receipt"
                .into(),
        );
    }
    core::working_tag_changes::validate_baseline(&session.baseline).map_err(error)?;
    core::working_tag_changes::validate_baseline(&session.initial_baseline).map_err(error)?;
    Ok(session)
}
fn save(state: &AppState, session: &Session) -> Reply<()> {
    project::atomic_write(
        &root(state, &session.id)?.join("handoff.json"),
        &serde_json::to_vec_pretty(session).map_err(error)?,
        false,
    )
    .map(|_| ())
    .map_err(error)
}
pub(super) fn installation(state: &AppState) -> Reply<baboon::Installation> {
    let selected: Option<PathBuf> = lock(&state.library)?
        .setting("baboonInstallation")
        .map_err(error)?;
    let mut candidates: Vec<PathBuf> = selected.into_iter().collect();
    for variable in ["LOCALAPPDATA", "PROGRAMFILES"] {
        if let Some(path) = std::env::var_os(variable) {
            let path = PathBuf::from(path);
            candidates.push(path.join("Baboon"));
            candidates.push(path.join("Programs/Baboon"));
        }
    }
    let mut last = None;
    for candidate in candidates {
        if candidate.join("Baboon.exe").is_file() {
            match baboon::inspect(&candidate, "HCEEK") {
                Ok(installation) => return Ok(installation),
                Err(e) => last = Some(e.to_string()),
            }
        }
    }
    Err(last.unwrap_or_else(||"Set up Baboon: choose the official Windows 0.3.2 portable folder containing Baboon.exe and its matching definitions folder".into()))
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Dashboard {
    installed: Option<baboon::Installation>,
    setup_issue: Option<String>,
    source_issue: Option<String>,
    compatible_kits: &'static [baboon::Kit],
    session_id: Option<String>,
    sessions: Vec<SessionSummary>,
    source_ready: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionSummary {
    id: String,
    tag: String,
    owner: String,
}
fn history_key(project: &str) -> String {
    format!("baboon-history-{project}")
}
fn latest_key(project: &str) -> String {
    format!("baboon-latest-{project}")
}
fn source_key(project: &str) -> String {
    format!("baboon-source-{project}")
}
/// Procedural/cache rebuilds do not consume accepted native revisions. Refuse
/// that route before staging, rather than silently replacing authored tags.
pub(super) fn guard_regeneration(state: &AppState, project: &Project) -> Reply<()> {
    if native_source_revisions::retained(state,&project.id)? {
        return Err("This map retains native tool revisions. Use Build working tag edits; regenerating geometry would omit native edits and requires scenario/BSP preservation review.".into());
    }
    let active: Option<ActiveSource> = lock(&state.library)?
        .setting(&source_key(&project.id))
        .map_err(error)?;
    if active.is_some() {
        return Err("This map has retained native tag revisions. A regenerated build would omit those edits. Use Build working tag edits for the saved native source; geometry reimport requires native scenario/BSP review. Your source revisions and last compiled map are preserved.".into());
    }
    if has_running(&project.id)? {
        return Err("Close this map's Baboon editor before regenerating source. Keep or review its saved changes first.".into());
    }
    let history: Vec<SessionSummary> = lock(&state.library)?
        .setting(&history_key(&project.id))
        .map_err(error)?;
    if history.len() > 32 {
        return Err("Native handoff history exceeds its supported bound".into());
    }
    for item in history {
        let session = load(state, &item.id, &item.owner, &project.id)?;
        let external = root(state, &session.id)?.join("HCEEK/tags");
        if transaction::inventory(&external).map_err(error)? != session.baseline {
            return Err("Baboon has saved native changes that are not reconciled. Review or restore that handoff before regenerating this map. Existing source and compiled maps remain available.".into());
        }
    }
    Ok(())
}
pub(super) fn working_source(
    state: &AppState,
    project: &Project,
    build_id: &str,
    default: &Path,
) -> Reply<PathBuf> {
    if let Some(selected)=native_source_revisions::selected(state,project,build_id)? {return Ok(selected);}
    let active: Option<ActiveSource> = lock(&state.library)?
        .setting(&source_key(&project.id))
        .map_err(error)?;
    let Some(active) = active else {
        return Ok(default.to_path_buf());
    };
    if active.project_id != project.id {
        return Err("Native source revision belongs to another map".into());
    }
    if active.fingerprint != project.fingerprint().map_err(error)?
        || active.parent_build_id != build_id
    {
        return Ok(default.to_path_buf());
    }
    uuid::Uuid::parse_str(&active.revision_id).map_err(error)?;
    let path = root(state, &active.session_id)?
        .join("revisions")
        .join(&active.revision_id)
        .join("tags");
    core::reject_links(&path).map_err(error)?;
    let marker = path.parent().unwrap().join("revision.json");
    core::reject_links(&marker).map_err(error)?;
    let stored: ActiveSource =
        serde_json::from_slice(&bounded_read(&marker, 16384)?).map_err(error)?;
    if stored.project_id != project.id
        || stored.revision_id != active.revision_id
        || stored.session_id != active.session_id
        || stored.fingerprint != active.fingerprint
        || stored.parent_build_id != build_id
        || !path.is_dir()
    {
        return Err("The accepted native working revision is unavailable. Its previous build is preserved; restore the handoff revision before rebuilding".into());
    }
    Ok(path)
}
/// Preserve the core compiler's parent-job containment boundary. Accepted
/// external revisions are copied into a fresh input below that validated job,
/// rather than making SDK or arbitrary cross-job folders compiler inputs.
pub(super) fn compilation_source(
    state: &AppState,
    project: &Project,
    build: &BuildRecord,
    tags: &Path,
    cancel: Arc<AtomicBool>,
) -> Reply<PathBuf> {
    uuid::Uuid::parse_str(&build.id).map_err(error)?;
    let parent = state.root.join("jobs").join(&build.id);
    core::reject_links(&parent).map_err(error)?;
    let parent = fs::canonicalize(&parent).map_err(error)?;
    core::reject_links(tags).map_err(error)?;
    let source = fs::canonicalize(tags).map_err(error)?;
    let baseline = working_tag_changes_native::baseline(&parent)?.unwrap_or_default();
    let current = transaction::inventory(&source).map_err(error)?;
    let mut health = core::native_tag_integrity::Cache::default()
        .scan(&source, &baseline, &current, u64::MAX)
        .map_err(error)?;
    native_tag_parser::Cache::default().scan(
        state,
        project,
        &source,
        None,
        &baseline,
        &current,
        &mut health,
        usize::MAX,
    )?;
    if health.blocked() {
        return Err(format!("Native tag integrity check blocked compilation: {}. The last compiled map is preserved.",health.findings.iter().take(4).map(|f|format!("{}: {}",f.path,f.detail)).collect::<Vec<_>>().join("; ")));
    }
    if source.starts_with(&parent) {
        return Ok(source);
    }
    let selected = working_source(state, project, &build.id, &parent.join("workspace/tags"))?;
    if fs::canonicalize(selected).map_err(error)? != source {
        return Err("Only the accepted native revision may supply this compiler input".into());
    }
    let inputs = parent.join("native-inputs");
    core::reject_links(&inputs).map_err(error)?;
    fs::create_dir_all(&inputs).map_err(error)?;
    let output = inputs.join(uuid::Uuid::new_v4().to_string());
    transaction::fork(&source, &output, cancel).map_err(error)?;
    Ok(output)
}
#[tauri::command]
pub(super) async fn baboon_report(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: Option<String>,
) -> Reply<Dashboard> {
    let owner = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();let (installed,setup_issue)=match installation(&state){Ok(i)=>(Some(i),None),Err(e)=>(None,Some(e))};
        let mut source_issue=None;let mut source_ready=false;let mut session_id=None;let mut sessions:Vec<SessionSummary>=vec![];
        if let Some(id)=project_id {
            check_document_owner(&state,&id,&owner)?;let p=lock(&state.library)?.get(&id).map_err(error)?;
            match current_build(&state,&p).and_then(|b|runtime_workbench::compiled_tags(&state,&p,&b)){Ok(_)=>source_ready=true,Err(e)=>source_issue=Some(format!("Baboon edits loose MCC H1 tags, not this preserved compiled cache. Build or convert this map to a validated MCC working tag tree first. {e}"))}
            let recent:Option<String>=lock(&state.library)?.setting(&latest_key(&id)).map_err(error)?;
            if let Some(id)=recent {if load(&state,&id,&owner,&p.id).is_ok(){session_id=Some(id);}}
            sessions=lock(&state.library)?.setting(&history_key(&p.id)).map_err(error)?;
            if sessions.len()>32{return Err("Native handoff history exceeds its supported bound".into());}
            sessions.retain(|s|s.owner==owner);
        }
        Ok(Dashboard{installed,setup_issue,source_issue,source_ready,session_id,sessions,compatible_kits:baboon::KITS})
    }).await.map_err(error)?
}
#[tauri::command]
pub(super) async fn baboon_register(
    app: tauri::AppHandle,
    directory: PathBuf,
) -> Reply<baboon::Installation> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let installed = baboon::inspect(&directory, "HCEEK").map_err(error)?;
        lock(&state.library)?
            .set_setting("baboonInstallation", &Some(installed.directory.clone()))
            .map_err(error)?;
        Ok(installed)
    })
    .await
    .map_err(error)?
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Prepared {
    session_id: String,
    tag: String,
    files: usize,
    elapsed_ms: u128,
    detail: String,
}
#[tauri::command]
pub(super) async fn baboon_prepare(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    tag_id: Option<u32>,
) -> Reply<Prepared> {
    let owner = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move||{
        let started=Instant::now();let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;
        let p=lock(&state.library)?.get(&project_id).map_err(error)?;let build=current_build(&state,&p)?;
        let tags=runtime_workbench::compiled_tags(&state,&p,&build)?;let installed=installation(&state)?;
        let fingerprint=p.fingerprint().map_err(error)?;
        let mut history:Vec<SessionSummary>=lock(&state.library)?.setting(&history_key(&project_id)).map_err(error)?;
        if history.len()>=32{return Err("This map retains 32 native handoffs. Select a previous handoff to review/recover it before preparing more; no source was deleted.".into());}
        let selected=if let Some(id)=tag_id {let inspection=if p.source.is_some(){inspect(&state,&p)?}else{Arc::new(maps::inspect_map(build.output.as_ref().ok_or("Validated build output is unavailable")?,None).map_err(error)?)};let tag=inspection.tags.iter().find(|t|t.id==id).ok_or("Selected tag is no longer in this map")?;format!("{}.{}",tag.path.replace('\\',"/"),core::tag_exchange::extension(&tag.class).map_err(error)?)}else{format!("{}.scenario",p.scenario_path().map_err(error)?)};
        let relative=core::safe_relative(&selected).map_err(error)?;
        baboon::launch_arguments("HCEEK",&tags,&tags.join(&relative)).map_err(error)?;
        let id=uuid::Uuid::new_v4().to_string();let directory=root(&state,&id)?;fs::create_dir(&directory).map_err(error)?;
        let cancel=Arc::new(AtomicBool::new(false));
        let baseline=transaction::fork(&tags,&directory.join("baseline"),cancel.clone()).map_err(error)?;
        let kit=directory.join("HCEEK");fs::create_dir(&kit).map_err(error)?;
        if transaction::fork(&directory.join("baseline"),&kit.join("tags"),cancel).map_err(error)?!=baseline {return Err("The native source fork did not preserve its baseline".into());}
        baboon::prepare_instance(&installed,&directory.join("editor"),&kit).map_err(error)?;
        if lock(&state.library)?.get(&project_id).map_err(error)?.fingerprint().map_err(error)?!=fingerprint {return Err("The map changed while preparing Baboon. Its source copies remain available; prepare the current saved revision again".into());}
        let session=Session{schema_version:1,id:id.clone(),owner,project_id:project_id.clone(),fingerprint,parent_build_id:build.id,selected_tag:selected.clone(),initial_baseline:baseline.clone(),baseline,revisions:vec![],executable_sha256:installed.executable_sha256,definitions_sha256:installed.definitions_sha256};
        save(&state,&session)?;
        history.push(SessionSummary{id:id.clone(),tag:selected.clone(),owner:session.owner.clone()});
        lock(&state.library)?.set_setting(&history_key(&project_id),&history).map_err(error)?;
        lock(&state.library)?.set_setting(&latest_key(&project_id),&Some(id.clone())).map_err(error)?;
        Ok(Prepared{session_id:id,tag:selected,files:session.baseline.len(),elapsed_ms:started.elapsed().as_millis(),detail:"Prepared native tags, an unchanged baseline and a separate portable Baboon profile. Save in Baboon, review detected changes, then keep them as a new working revision.".into()})
    }).await.map_err(error)?
}
fn watched(state: &AppState, session: &Session) -> Reply<Arc<Mutex<Watched>>> {
    if let Some(watch) = lock(registry())?.get(&session.id).cloned() {
        lock(&watch)?.touched = Instant::now();
        return Ok(watch);
    }
    let tags = root(state, &session.id)?.join("HCEEK/tags");
    let (watcher, dirty, resync, paths) = working_tag_changes_native::observe(&tags)?;
    let monitor = TagChangeMonitor::new(&tags, Some(session.baseline.clone())).map_err(error)?;
    let watch = Arc::new(Mutex::new(Watched {
        project_id: session.project_id.clone(),
        monitor,
        _watcher: watcher,
        dirty,
        resync,
        paths,
        started: Instant::now(),
        touched: Instant::now(),
        integrity: Default::default(),
        parser: Default::default(),
        child: None,
    }));
    let mut registry = lock(registry())?;
    registry.retain(|_, watched| {
        watched.lock().map_or(true, |mut w| {
            w.touched.elapsed() < Duration::from_secs(120)
                || w.child
                    .as_mut()
                    .is_some_and(|child| child.try_wait().map_or(true, |status| status.is_none()))
        })
    });
    if registry.len() >= 8 {
        return Err("Eight native editor handoffs are active. Close an unused Baboon editor and hide its panel for two minutes before starting another. All source history is retained.".into());
    }
    Ok(registry.entry(session.id.clone()).or_insert(watch).clone())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Poll {
    session_id: String,
    tag: String,
    running: bool,
    process_id: Option<u32>,
    changes: TagChanges,
    revisions: Vec<String>,
    integrity: core::native_tag_integrity::Report,
    writer_context: String,
}
fn poll(state: &AppState, session: &Session) -> Reply<Poll> {
    let watched = watched(state, session)?;
    let mut watch = lock(&watched)?;
    let changed = {
        let mut paths = lock(&watch.paths)?;
        std::mem::take(&mut *paths)
    };
    watch.monitor.mark_changed(changed).map_err(error)?;
    let dirty = watch.dirty.swap(false, Ordering::AcqRel);
    let rehash = watch.resync.swap(false, Ordering::AcqRel);
    if dirty || rehash || watch.monitor.report().status == "saving" {
        let now = watch.started.elapsed().as_millis().min(u64::MAX as u128) as u64;
        watch.monitor.scan(now, rehash).map_err(error)?;
    }
    let running = if let Some(child) = watch.child.as_mut() {
        child.try_wait().map_err(error)?.is_none()
    } else {
        false
    };
    let mut integrity = if watch.monitor.report().status == "saving" {
        core::native_tag_integrity::Report {
            pending_files: 1,
            ..Default::default()
        }
    } else {
        let Watched {
            integrity, monitor, ..
        } = &mut *watch;
        integrity
            .scan(
                monitor.root(),
                monitor.baseline_hashes(),
                monitor.accepted_hashes(),
                64 * 1024 * 1024,
            )
            .map_err(error)?
    };
    if watch.monitor.report().status != "saving" {
        let Watched {
            parser, monitor, ..
        } = &mut *watch;
        let starting = root(state, &session.id)?.join("baseline");
        let project = lock(&state.library)?
            .get(&session.project_id)
            .map_err(error)?;
        parser.scan(
            state,
            &project,
            monitor.root(),
            if session.initial_baseline.is_empty() {
                None
            } else {
                Some((&starting, &session.initial_baseline))
            },
            monitor.baseline_hashes(),
            monitor.accepted_hashes(),
            &mut integrity,
            2,
        )?;
    }
    let writer_context=format!("Baboon handoff{}; actual writer unconfirmed. Other programs can also write this folder. Filesystem notifications supply no writer PID.",watch.child.as_ref().map(|c|format!(" · last launched PID {}",c.id())).unwrap_or_default());
    Ok(Poll {
        session_id: session.id.clone(),
        tag: session.selected_tag.clone(),
        running,
        process_id: watch.child.as_ref().map(Child::id),
        changes: watch.monitor.report(),
        revisions: session.revisions.clone(),
        integrity,
        writer_context,
    })
}
#[tauri::command]
pub(super) async fn baboon_poll(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    session_id: String,
) -> Reply<Poll> {
    let owner = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        check_document_owner(&state, &project_id, &owner)?;
        let session = load(&state, &session_id, &owner, &project_id)?;
        poll(&state, &session)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub(super) async fn baboon_launch(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    session_id: String,
) -> Reply<Poll> {
    let owner = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        if !cfg!(windows) {
            return Err("This verified Baboon launch route currently requires Windows".into());
        }
        let state = app.state::<AppState>();
        check_document_owner(&state, &project_id, &owner)?;
        let session = load(&state, &session_id, &owner, &project_id)?;
        let p = lock(&state.library)?.get(&project_id).map_err(error)?;
        if p.fingerprint().map_err(error)? != session.fingerprint {
            return Err(
                "Saved map changed; keep the previous handoff and prepare this revision again"
                    .into(),
            );
        }
        let directory = root(&state, &session.id)?;
        let editor = baboon::inspect(&directory.join("editor"), "HCEEK").map_err(error)?;
        if editor.executable_sha256 != session.executable_sha256
            || editor.definitions_sha256 != session.definitions_sha256
        {
            return Err(
                "The prepared editor or definitions changed; prepare a new verified handoff".into(),
            );
        }
        let tags = directory.join("HCEEK/tags");
        let arguments = baboon::launch_arguments(
            "HCEEK",
            &tags,
            &tags.join(core::safe_relative(&session.selected_tag).map_err(error)?),
        )
        .map_err(error)?;
        let watched = watched(&state, &session)?;
        let mut watch = lock(&watched)?;
        if watch
            .child
            .as_mut()
            .is_some_and(|c| c.try_wait().ok().flatten().is_none())
        {
            return Err("This handoff already has a running Baboon window".into());
        }
        watch.child = Some(
            Command::new(&editor.executable)
                .args(&arguments)
                .current_dir(&editor.directory)
                .spawn()
                .map_err(error)?,
        );
        drop(watch);
        poll(&state, &session)
    })
    .await
    .map_err(error)?
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Reconciled {
    accepted: bool,
    review: transaction::Review,
    source: Option<PathBuf>,
    reason: String,
}
#[tauri::command]
pub(super) async fn baboon_reconcile(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    session_id: String,
) -> Reply<Reconciled> {
    let owner = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move||{
        let _source_guard=native_operations_native::source_guard()?;
        native_operations_native::require_idle(&app.state::<AppState>())?;
        let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;let mut session=load(&state,&session_id,&owner,&project_id)?;
        let p=lock(&state.library)?.get(&project_id).map_err(error)?;if p.fingerprint().map_err(error)?!=session.fingerprint{return Err("The saved map revision changed. Both sources remain available; review against the current map before rebuilding".into());}
        let observed=poll(&state,&session)?;
        if observed.changes.status=="saving" {return Err("Baboon is still saving. Wait for the stable saved change before keeping a revision".into());}
        if observed.integrity.blocked(){return Err(format!("Native tag integrity check failed or is pending. Review the live warning and restore/re-save the affected file before keeping it. {}",observed.writer_context));}
        let build=current_build(&state,&p)?;let current=runtime_workbench::compiled_tags(&state,&p,&build)?;
        let directory=root(&state,&session.id)?;let external=directory.join("HCEEK/tags");let working=transaction::inventory(&current).map_err(error)?;let edited=transaction::inventory(&external).map_err(error)?;
        let watched=watched(&state,&session)?;if lock(&watched)?.monitor.accepted_hashes()!=&edited {return Err("The external source changed after its stable observation; scan it again before keeping the revision".into());}
        let review=transaction::compare(&session.baseline,&working,&edited);
        if review.conflicts>0 || review.protected_changes>0 {return Ok(Reconciled{accepted:false,review,source:None,reason:"Both revisions are preserved. Conflicting files and scenario/BSP/collision/script changes need native review; Spark has not applied or repaired them.".into()});}
        if review.changes.is_empty(){return Ok(Reconciled{accepted:false,review,source:None,reason:"No new external changes to keep.".into()});}
        if session.revisions.len()>=100{return Err("This handoff retains 100 revisions. Start a fresh handoff; all previous sources remain preserved".into());}
        let revision=uuid::Uuid::new_v4().to_string();let parent=directory.join("revisions");fs::create_dir_all(&parent).map_err(error)?;let revision_root=parent.join(&revision);fs::create_dir(&revision_root).map_err(error)?;let output=revision_root.join("tags");
        transaction::reconcile(&session.baseline,&current,&external,&output,&working,&edited,false,Arc::new(AtomicBool::new(false))).map_err(error)?;
        if lock(&state.library)?.get(&project_id).map_err(error)?.fingerprint().map_err(error)?!=session.fingerprint{return Err("Map changed during reconciliation. The new source fork is retained but has not replaced the working source".into());}
        let active=ActiveSource{project_id:project_id.clone(),session_id:session.id.clone(),revision_id:revision.clone(),fingerprint:session.fingerprint.clone(),parent_build_id:build.id};
        project::atomic_write(&revision_root.join("revision.json"),&serde_json::to_vec_pretty(&active).map_err(error)?,false).map_err(error)?;
        session.revisions.push(revision);session.baseline=edited;save(&state,&session)?;
        lock(&state.library)?.set_setting(&source_key(&project_id),&Some(active)).map_err(error)?;
        // Refresh this source's baseline without changing any native tag bytes.
        lock(&watched)?.monitor.keep_observed_baseline().map_err(error)?;
        Ok(Reconciled{accepted:true,review,source:Some(output),reason:"Kept a new native working revision. Existing placements, external files, source tags and the last compiled map are preserved. Close native editors, then Build working tag edits.".into()})
    }).await.map_err(error)?
}
pub(super) fn has_running(project_id: &str) -> Reply<bool> {
    // Session membership is checked through receipts by callers; this prevents a
    // new compiler job while a handoff process is still saving its private fork.
    let watches: Vec<_> = lock(registry())?.values().cloned().collect();
    for watch in watches {
        let mut w = lock(&watch)?;
        if w.project_id != project_id {
            continue;
        }
        if let Some(child) = w.child.as_mut() {
            if child.try_wait().map_err(error)?.is_none() {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

#[tauri::command]
pub(super) async fn baboon_restore_start(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    session_id: String,
) -> Reply<String> {
    let owner = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move||{
        let _source_guard=native_operations_native::source_guard()?;
        native_operations_native::require_idle(&app.state::<AppState>())?;
        let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;
        let mut session=load(&state,&session_id,&owner,&project_id)?;
        let p=lock(&state.library)?.get(&project_id).map_err(error)?;
        if p.fingerprint().map_err(error)?!=session.fingerprint{return Err("Open the matching saved project revision before restoring this native source. Both sources and old builds remain preserved.".into());}
        if session.revisions.len()>=100{return Err("Native revision history is full; previous sources remain available.".into());}
        let build=current_build(&state,&p)?;
        let directory=root(&state,&session_id)?;
        let revision=uuid::Uuid::new_v4().to_string();let parent=directory.join("revisions");fs::create_dir_all(&parent).map_err(error)?;
        let revision_root=parent.join(&revision);fs::create_dir(&revision_root).map_err(error)?;
        if session.initial_baseline.is_empty()||transaction::inventory(&directory.join("baseline")).map_err(error)?!=session.initial_baseline{return Err("Starting source has no matching immutable hash inventory. It was not restored; preserve the files and prepare a new verified handoff.".into());}transaction::fork(&directory.join("baseline"),&revision_root.join("tags"),Arc::new(AtomicBool::new(false))).map_err(error)?;
        if lock(&state.library)?.get(&project_id).map_err(error)?.fingerprint().map_err(error)?!=session.fingerprint{return Err("Project changed while restoring. The restoration copy remains available but was not selected.".into());}
        let active=ActiveSource{project_id:project_id.clone(),session_id:session.id.clone(),revision_id:revision.clone(),fingerprint:session.fingerprint.clone(),parent_build_id:build.id};
        project::atomic_write(&revision_root.join("revision.json"),&serde_json::to_vec_pretty(&active).map_err(error)?,false).map_err(error)?;
        session.revisions.push(revision);save(&state,&session)?;
        lock(&state.library)?.set_setting(&source_key(&project_id),&Some(active)).map_err(error)?;
        Ok("Restored the starting native source into a new working revision. The later source revisions, Baboon edits and previous compiled map remain available.".into())
    }).await.map_err(error)?
}
