//! Explicit review -> private tagset copy. Never changes SDK master tags or a project.
use super::*;
use spark_core::conversion_resources as resources;
#[derive(Default)]
pub(super) struct RepairState {
    plans: HashMap<String, Pending>,
    jobs: HashMap<String, RepairJob>,
}
struct Pending {
    owner: String,
    project: String,
    fingerprint: String,
    plan: resources::TagsetRepairPlan,
    created: Instant,
}
struct RepairJob {
    owner: String,
    project: String,
    cancel: Arc<AtomicBool>,
    view: Arc<Mutex<RepairStatus>>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RepairPreview {
    plan_id: String,
    project_id: String,
    expires_at_unix: i64,
    #[serde(flatten)]
    plan: resources::TagsetRepairPlan,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RepairStatus {
    job_id: String,
    project_id: String,
    status: String,
    message: String,
    receipt: Option<resources::TagsetRepairReceipt>,
}
fn context(
    state: &AppState,
    project_id: &str,
    owner: &str,
) -> Reply<(Project, resources::BitmapAudit, PathBuf)> {
    check_document_owner(state, project_id, owner)?;
    let project = lock(&state.library)?.get(project_id).map_err(error)?;
    let inspection = inspect(state, &project)?;
    let tools = project_tools(state, &project)?;
    let audit = build::fallback_bitmap_audit(&project, &inspection, &tools)
        .map_err(error)?
        .ok_or("No indexed classic bitmap fallback repair is needed for this source/runtime")?;
    let sdk = tools
        .base_tags_directory
        .ok_or("Select the legal extracted SDK tags first")?;
    core::reject_links(&sdk).map_err(error)?;
    Ok((project, audit, fs::canonicalize(sdk).map_err(error)?))
}
fn validate_pending(pending: &Pending, owner: &str, project: &Project, sdk: &Path) -> Reply<()> {
    if pending.owner != owner {
        return Err("Bitmap repair review belongs to another window".into());
    }
    if pending.created.elapsed() > Duration::from_secs(180)
        || pending.project != project.id
        || pending.fingerprint != project.fingerprint().map_err(error)?
        || pending.plan.sdk_tags != sdk
    {
        return Err(
            "Bitmap repair context changed or review expired; review the source folder again"
                .into(),
        );
    }
    Ok(())
}
pub(super) fn release_window(state: &AppState, owner: &str) {
    if let Ok(mut repairs) = state.conversion_repairs.lock() {
        repairs.plans.retain(|_, p| p.owner != owner);
        for job in repairs.jobs.values() {
            if job.owner == owner {
                job.cancel.store(true, Ordering::Relaxed);
            }
        }
    }
}
#[tauri::command]
pub(super) async fn prepare_bitmap_tagset_repair(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    source_tags: String,
) -> Reply<RepairPreview> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let (project, audit, sdk) = context(&state, &project_id, &owner)?;
        let source = Path::new(&source_tags);
        if !source.is_absolute() {
            return Err(
                "Choose an absolute path to the original classic editable tags folder".into(),
            );
        }
        let plan = resources::review(
            &project
                .source
                .as_ref()
                .ok_or("Open a classic source map")?
                .sha256,
            &sdk,
            source,
            &audit,
        )
        .map_err(error)?;
        check_document_owner(&state, &project_id, &owner)?;
        let id = uuid::Uuid::new_v4().to_string();
        let mut repairs = lock(&state.conversion_repairs)?;
        repairs.plans.retain(|_, p| {
            p.created.elapsed() < Duration::from_secs(180)
                && !(p.owner == owner && p.project == project_id)
        });
        if repairs.plans.len() >= 16 {
            return Err("Close an unused bitmap repair review first".into());
        }
        repairs.plans.insert(
            id.clone(),
            Pending {
                owner,
                project: project_id.clone(),
                fingerprint: project.fingerprint().map_err(error)?,
                plan: plan.clone(),
                created: Instant::now(),
            },
        );
        Ok(RepairPreview {
            plan_id: id,
            project_id,
            expires_at_unix: chrono::Utc::now().timestamp() + 180,
            plan,
        })
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub(super) async fn create_bitmap_tagset_repair(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    plan_id: String,
    confirmed: bool,
) -> Reply<RepairStatus> {
    if !confirmed {
        return Err("Review the matching bitmap files before creating a separate tagset".into());
    }
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();
        let project_id={let repairs=lock(&state.conversion_repairs)?;let p=repairs.plans.get(&plan_id).ok_or("Bitmap repair review expired")?;if p.owner!=owner{return Err("Bitmap repair review belongs to another window".into());}p.project.clone()};
        let(project,audit,sdk)=context(&state,&project_id,&owner)?;
        let pending={let mut repairs=lock(&state.conversion_repairs)?;let p=repairs.plans.get(&plan_id).ok_or("Bitmap repair review expired")?;validate_pending(p,&owner,&project,&sdk)?;
            let reviewed=p.plan.files.iter().map(|f|f.path.as_str()).collect::<Vec<_>>();let missing=audit.missing.iter().map(|f|f.path.as_str()).collect::<Vec<_>>();if reviewed!=missing||!audit.invalid.is_empty()||audit.list_truncated{return Err("The missing bitmap list changed; refresh and review it again".into());}repairs.plans.remove(&plan_id).ok_or("Bitmap review was already consumed")?};
        let id=uuid::Uuid::new_v4().to_string();let cancel=Arc::new(AtomicBool::new(false));
        {let mut jobs=lock(&state.jobs)?;if !jobs.is_empty(){return Err("Another build or staging job is running; wait for it before creating the tagset".into());}jobs.insert(id.clone(),cancel.clone());}
        let view=RepairStatus{job_id:id.clone(),project_id:project_id.clone(),status:"copying".into(),message:"Creating a separate tagset; the selected SDK stays unchanged".into(),receipt:None};let shared=Arc::new(Mutex::new(view.clone()));
        {let mut repairs=lock(&state.conversion_repairs)?;repairs.jobs.retain(|_,j|j.view.lock().is_ok_and(|v|v.status=="copying"));if repairs.jobs.len()>=8{lock(&state.jobs)?.remove(&id);return Err("Too many tagset repair jobs are active".into());}repairs.jobs.insert(id.clone(),RepairJob{owner,project:project_id.clone(),cancel:cancel.clone(),view:shared.clone()});}
        let worker=app.clone();let root=state.root.clone();
        tauri::async_runtime::spawn_blocking(move||{
            let result=(||->Reply<resources::TagsetRepairReceipt>{let base=root.join("tagset-repairs");core::reject_links(&base).map_err(error)?;fs::create_dir_all(&base).map_err(error)?;resources::create(&pending.plan,&base.join(&id),&cancel,|done,total,bytes,total_bytes|{event(&worker,JobEvent{job_id:id.clone(),project_id:project_id.clone(),phase:"dependency-staging".into(),severity:"info".into(),message:format!("Copied {done}/{total} SDK tags · {}/{} MiB",bytes/1048576,total_bytes/1048576),progress:(5+done*85/total.max(1))as u8,timestamp:chrono::Utc::now().to_rfc3339()});}).map_err(error)})();
            let status=match result{Ok(receipt)=>RepairStatus{job_id:id.clone(),project_id:project_id.clone(),status:"ready".into(),message:"Separate tagset is ready. Select it for this map, then run the native conversion".into(),receipt:Some(receipt)},Err(message)=>RepairStatus{job_id:id.clone(),project_id:project_id.clone(),status:"failed".into(),message,receipt:None}};
            if let Ok(mut current)=shared.lock(){*current=status.clone();}
            event(&worker,JobEvent{job_id:id.clone(),project_id,phase:if status.status=="ready"{"completed"}else{"failed"}.into(),severity:if status.status=="ready"{"info"}else{"error"}.into(),message:status.message,progress:100,timestamp:chrono::Utc::now().to_rfc3339()});if let Ok(mut jobs)=worker.state::<AppState>().jobs.lock(){jobs.remove(&id);}
        });Ok(view)
    }).await.map_err(error)?
}
#[tauri::command]
pub(super) async fn bitmap_tagset_repair_status(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    job_id: String,
) -> Reply<RepairStatus> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        check_document_owner(&state, &project_id, &owner)?;
        uuid::Uuid::parse_str(&job_id).map_err(error)?;
        if let Some(job) = lock(&state.conversion_repairs)?.jobs.get(&job_id) {
            if job.owner != owner || job.project != project_id {
                return Err("Bitmap repair job belongs to another map/window".into());
            }
            return Ok(lock(&job.view)?.clone());
        }
        let folder = state.root.join("tagset-repairs").join(&job_id);
        let path = folder.join("tagset-repair-receipt.json");
        core::reject_links(&path).map_err(error)?;
        let receipt: resources::TagsetRepairReceipt =
            serde_json::from_slice(&bounded_read(&path, 1024 * 1024)?).map_err(error)?;
        core::reject_links(&receipt.tags_directory).map_err(error)?;
        let inventory = folder.join("input-sdk-tags.json");
        core::reject_links(&inventory).map_err(error)?;
        if maps::hash_file(&inventory).map_err(error)? != receipt.sdk_inventory_sha256 {
            return Err(
                "Saved repaired tagset inventory changed; review the original sources again".into(),
            );
        }
        let project = lock(&state.library)?.get(&project_id).map_err(error)?;
        if receipt.status != "ready-source-tagset"
            || receipt.schema_version != 1
            || receipt.playable_output
            || project.source.as_ref().map(|s| s.sha256.as_str())
                != Some(receipt.source_sha256.as_str())
            || fs::canonicalize(folder.join("tags")).map_err(error)?
                != fs::canonicalize(&receipt.tags_directory).map_err(error)?
        {
            return Err("Saved repaired tagset does not match this source map".into());
        }
        Ok(RepairStatus {
            job_id,
            project_id,
            status: "ready".into(),
            message: "Recovered the separate source tagset; it is not a playable map".into(),
            receipt: Some(receipt),
        })
    })
    .await
    .map_err(error)?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repair_reviews_are_bound_to_the_map_window_and_saved_configuration() {
        let project = Project::new("test");
        let pending = Pending {
            owner: "main".into(),
            project: project.id.clone(),
            fingerprint: project.fingerprint().unwrap(),
            plan: resources::TagsetRepairPlan {
                source_sha256: "a".repeat(64),
                sdk_tags: PathBuf::from("sdk"),
                source_tags: PathBuf::from("classic"),
                files: vec![],
            },
            created: Instant::now(),
        };
        assert!(validate_pending(&pending, "main", &project, Path::new("sdk")).is_ok());
        assert!(validate_pending(&pending, "other", &project, Path::new("sdk")).is_err());
        let mut changed = project.clone();
        changed.conversion_profile = Some("zombie-recovery".into());
        assert!(validate_pending(&pending, "main", &changed, Path::new("sdk")).is_err());
        assert!(validate_pending(&pending, "main", &project, Path::new("different")).is_err());
    }
}
