//! Owner-bound review -> isolated CE tagset. No automatic selection or remote tools.
use super::core::ce_source_recovery as recovery;
use super::*;

#[derive(Default)]
pub(super) struct RecoveryState {
    plans: HashMap<String, Pending>,
    jobs: HashMap<String, Job>,
}
struct Pending {
    owner: String,
    project: String,
    target: String,
    fingerprint: String,
    created: Instant,
    plan: recovery::Plan,
}
struct Job {
    created: Instant,
    owner: String,
    project: String,
    cancel: Arc<AtomicBool>,
    view: Arc<Mutex<Status>>,
    receipt: Arc<Mutex<Option<recovery::Receipt>>>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Preview {
    plan_id: String,
    project_id: String,
    target_id: String,
    #[serde(flatten)]
    plan: recovery::Plan,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Status {
    job_id: String,
    project_id: String,
    target_id: String,
    fingerprint: String,
    status: String,
    message: String,
    source_tags: PathBuf,
    tags_directory: Option<PathBuf>,
    receipt_path: Option<PathBuf>,
    files: usize,
}
fn context(
    state: &AppState,
    owner: &str,
    project_id: &str,
    target_id: &str,
) -> Reply<(Project, PathBuf)> {
    check_document_owner(state, project_id, owner)?;
    if lock(&state.forge_session)?
        .as_ref()
        .is_some_and(|s| s.project_id == project_id)
    {
        return Err("Leave the shared editor session before creating or selecting a different CE base tagset".into());
    }
    let project = lock(&state.library)?.get(project_id).map_err(error)?;
    let target = project
        .build_targets
        .iter()
        .find(|t| t.id == target_id)
        .ok_or("CE target no longer exists")?;
    if project.active_build_target.as_deref() != Some(target_id)
        || target.runtime_id != core::runtime::RuntimeId::HaloCustomEdition
        || target.builder != "invader-ce"
    {
        return Err("Select this Custom Edition build target before reviewing its source".into());
    }
    let tags = target
        .tags_directory
        .clone()
        .ok_or("Choose this CE target's extracted editable tags folder first")?;
    Ok((project, tags))
}
fn executable(project: &Project, id: &str) -> Reply<PathBuf> {
    if !["invaderNative", "invaderRepair"].contains(&id) {
        return Err("This CE recovery has no such native tool".into());
    }
    let target = project
        .build_targets
        .iter()
        .find(|t| Some(&t.id) == project.active_build_target.as_ref())
        .ok_or("Select a CE build target")?;
    let folder = target
        .invader_directory
        .as_ref()
        .ok_or("Choose this CE target's reviewed Invader folder")?;
    let tool = core::tool_ecosystem::tool(id).map_err(error)?;
    let file = folder.join(
        tool.filename
            .as_deref()
            .ok_or("Native tool has no filename")?,
    );
    core::reject_links(&file).map_err(error)?;
    if fs::metadata(&file).map_err(error)?.len() > 256 * 1024 * 1024
        || Some(maps::hash_file(&file).map_err(error)?) != tool.sha256
    {
        return Err(
            "This executable differs from the reviewed Invader release. No process was started."
                .into(),
        );
    }
    Ok(file)
}
pub(super) fn release_window(state: &AppState, owner: &str) {
    if let Ok(mut jobs) = state.ce_recovery.lock() {
        jobs.plans.retain(|_, p| p.owner != owner);
        for job in jobs.jobs.values().filter(|j| j.owner == owner) {
            job.cancel.store(true, Ordering::Relaxed);
        }
    }
}
#[tauri::command]
pub(super) async fn prepare_ce_source_recovery(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    target_id: String,
) -> Reply<Preview> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let _gate = native_operations_native::source_guard()?;
        let state = app.state::<AppState>();
        native_operations_native::require_idle(&state)?;
        let (project, tags) = context(&state, &owner, &project_id, &target_id)?;
        executable(&project, "invaderNative")?;
        executable(&project, "invaderRepair")?;
        let plan = recovery::review(&tags).map_err(error)?;
        check_document_owner(&state, &project_id, &owner)?;
        let id = uuid::Uuid::new_v4().to_string();
        let mut jobs = lock(&state.ce_recovery)?;
        jobs.plans.retain(|_, p| {
            p.created.elapsed() < Duration::from_secs(180)
                && !(p.owner == owner && p.project == project_id)
        });
        if jobs.plans.len() >= 16 {
            return Err("Close an unused source recovery review first".into());
        }
        jobs.plans.insert(
            id.clone(),
            Pending {
                owner,
                project: project_id.clone(),
                target: target_id.clone(),
                fingerprint: project.fingerprint().map_err(error)?,
                created: Instant::now(),
                plan: plan.clone(),
            },
        );
        Ok(Preview {
            plan_id: id,
            project_id,
            target_id,
            plan,
        })
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub(super) async fn create_ce_source_recovery(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    plan_id: String,
    confirmed: bool,
) -> Reply<Status> {
    if !confirmed {
        return Err(
            "Review the seven behaviour changes before creating this separate CE tagset".into(),
        );
    }
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let _gate = native_operations_native::source_guard()?;
        let state = app.state::<AppState>();
        native_operations_native::require_idle(&state)?;
        let (project_id, target_id) = {
            let reviews = lock(&state.ce_recovery)?;
            let p = reviews.plans.get(&plan_id).ok_or("Source recovery review expired")?;
            if p.owner != owner { return Err("Source recovery review belongs to another window".into()); }
            (p.project.clone(), p.target.clone())
        };
        let (project, _) = context(&state, &owner, &project_id, &target_id)?;
        let fingerprint = project.fingerprint().map_err(error)?;
        let pending = {
            let mut reviews = lock(&state.ce_recovery)?;
            let p = reviews.plans.get(&plan_id).ok_or("Source review was already consumed")?;
            if p.fingerprint != fingerprint || p.created.elapsed() > Duration::from_secs(180) { return Err("The project changed or review expired. Save and review the source again.".into()); }
            reviews.plans.remove(&plan_id).ok_or("Source review was already consumed")?
        };
        let id = uuid::Uuid::new_v4().to_string();
        let cancel = Arc::new(AtomicBool::new(false));
        let view = Status { job_id: id.clone(), project_id: project_id.clone(), target_id, fingerprint, status: "copying".into(), message: "Copying reviewed source; originals and previous builds stay intact".into(), source_tags: pending.plan.source_tags.clone(), tags_directory: None, receipt_path: None, files: pending.plan.files };
        let shared = Arc::new(Mutex::new(view.clone()));
        let receipt_store = Arc::new(Mutex::new(None));
        {
            let mut recoveries = lock(&state.ce_recovery)?;
            if recoveries.jobs.len() >= 8 {
                let oldest = recoveries.jobs.iter().filter(|(_, j)| j.view.lock().is_ok_and(|v| v.status != "copying")).min_by_key(|(_, j)| j.created).map(|(id, _)| id.clone());
                if let Some(id) = oldest { recoveries.jobs.remove(&id); }
            }
            if recoveries.jobs.len() >= 8 { return Err("Too many source recovery jobs are active".into()); }
            let mut jobs = lock(&state.jobs)?;
            if !jobs.is_empty() { return Err("Another build started; wait before recovering this source".into()); }
            jobs.insert(id.clone(), cancel.clone());
            recoveries.jobs.insert(id.clone(), Job { created: Instant::now(), owner, project: project_id.clone(), cancel: cancel.clone(), view: shared.clone(), receipt: receipt_store.clone() });
        }
        let worker = app.clone(); let initial = view.clone();
        drop(_gate);
        tauri::async_runtime::spawn_blocking(move || {
            let state = worker.state::<AppState>();
            let result = (|| -> Reply<recovery::Receipt> {
                let _gate = native_operations_native::source_guard()?;
                let base = state.root.join("ce-source-recoveries");
                core::reject_links(&base).map_err(error)?; fs::create_dir_all(&base).map_err(error)?;
                recovery::create(&pending.plan, &base.join(&id), cancel, |recipe| {
                    let run = || -> Reply<recovery::NativeRecord> {
                        let executable = executable(&project, if recipe.tool == recovery::Tool::Edit { "invaderNative" } else { "invaderRepair" })?;
                        let sha = maps::hash_file(&executable).map_err(error)?;
                        let (success, stdout, stderr) = native_operations_native::run(&executable, &recipe.args)?;
                        if !success { return Err(format!("Native CE source recovery refused the candidate: {stderr}")); }
                        if maps::hash_file(&executable).map_err(error)? != sha { return Err("Native tool changed during recovery".into()); }
                        Ok(recovery::NativeRecord { recipe: recipe.clone(), executable_sha256: sha, stdout, stderr })
                    };
                    run().map_err(core::SparkError::Invalid)
                }).map_err(error)
            })();
            let mut status = initial;
            match result {
                Ok(receipt) => { if let Ok(mut saved) = receipt_store.lock() { *saved = Some(receipt.clone()); } status.status = "ready".into(); status.message = "Separate CE source ready: three tags / seven fields corrected. Select it explicitly, then compile and test the game.".into(); status.receipt_path = receipt.tags_directory.parent().map(|p| p.join("ce-source-recovery.json")); status.tags_directory = Some(receipt.tags_directory); },
                Err(message) => { status.status = "failed".into(); status.message = message; }
            }
            if let Ok(mut current) = shared.lock() { *current = status.clone(); }
            event(&worker, JobEvent { job_id: id.clone(), project_id, phase: if status.status == "ready" { "completed" } else { "failed" }.into(), severity: if status.status == "ready" { "info" } else { "error" }.into(), message: status.message, progress: 100, timestamp: chrono::Utc::now().to_rfc3339() });
            if let Ok(mut jobs) = state.jobs.lock() { jobs.remove(&id); };
        });
        Ok(view)
    }).await.map_err(error)?
}
#[tauri::command]
pub(super) fn ce_source_recovery_status(
    state: tauri::State<AppState>,
    window: tauri::WebviewWindow,
    project_id: String,
    job_id: String,
) -> Reply<Status> {
    check_document_owner(&state, &project_id, window.label())?;
    let jobs = lock(&state.ce_recovery)?;
    let job = jobs
        .jobs
        .get(&job_id)
        .ok_or("Source recovery is no longer available in this window")?;
    if job.owner != window.label() || job.project != project_id {
        return Err("Source recovery belongs to another window or project".into());
    }
    let view = lock(&job.view)?.clone();
    Ok(view)
}

#[tauri::command]
pub(super) async fn check_ce_source_recovery(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    job_id: String,
) -> Reply<Status> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move||{
        let _gate=native_operations_native::source_guard()?;
        let state=app.state::<AppState>();
        native_operations_native::require_idle(&state)?;
        let(view,receipt)={
            let jobs=lock(&state.ce_recovery)?;
            let job=jobs.jobs.get(&job_id).ok_or("Source recovery is no longer available in this window")?;
            if job.owner!=owner||job.project!=project_id{return Err("Source recovery belongs to another window or project".into());}
            let view=lock(&job.view)?.clone();
            let receipt=lock(&job.receipt)?.clone().ok_or("Source recovery has not passed verification")?;
            (view,receipt)
        };
        let(project,_)=context(&state,&owner,&project_id,&view.target_id)?;
        if view.status!="ready"||project.fingerprint().map_err(error)?!=view.fingerprint{return Err("The project changed since recovery. Keep the recovered folder, save and review this target again before selecting it.".into());}
        recovery::verify(&receipt).map_err(error)?;
        Ok(view)
    }).await.map_err(error)?
}
