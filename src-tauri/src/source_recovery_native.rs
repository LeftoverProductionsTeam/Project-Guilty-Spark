//! Local explicit Source Guardian entrypoints. No arbitrary command or remote
//! writer is accepted; both review and execution bind the preserved source.
use super::*;
use spark_core::source_recovery;

#[tauri::command]
pub(super) async fn review_project_recovery(
    app: tauri::AppHandle,
    project_id: String,
    tag_id: u32,
) -> Reply<source_recovery::RecoveryPlan> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let project = lock(&state.library)?.get(&project_id).map_err(error)?;
        let inspection = inspect(&state, &project)?;
        let project = native_resources_native::for_project(&state, &project, &inspection)?;
        source_recovery::review(
            &project,
            &inspection,
            &editing_tools(&state, &project)?,
            tag_id,
        )
        .map_err(error)
    })
    .await
    .map_err(error)?
}

#[tauri::command]
pub(super) async fn recover_halo_project(
    app: tauri::AppHandle,
    project_id: String,
    tag_id: u32,
    plan_identity: String,
) -> Reply<source_recovery::RecoveryReceipt> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let project = lock(&state.library)?.get(&project_id).map_err(error)?;
        let inspection = inspect(&state, &project)?;
        let project = native_resources_native::for_project(&state, &project, &inspection)?;
        let tools = editing_tools(&state, &project)?;
        let id = uuid::Uuid::new_v4().to_string();
        let cancel = Arc::new(AtomicBool::new(false));
        {
            let mut jobs = lock(&state.jobs)?;
            if !jobs.is_empty() {
                return Err("A native build, extraction or recovery is already running".into());
            }
            jobs.insert(id.clone(), cancel.clone());
        }
        let result = source_recovery::recover(
            &project,
            &inspection,
            &tools,
            &state.root,
            &id,
            tag_id,
            &plan_identity,
            cancel,
            |value| event(&app, value),
        )
        .map_err(error);
        if let Ok(mut jobs) = state.jobs.lock() {
            jobs.remove(&id);
        }
        event(&app,JobEvent{job_id:id,project_id:project.id,phase:if result.is_ok(){"recovered"}else{"recovery-failed"}.into(),severity:if result.is_ok(){"success"}else{"warning"}.into(),
            message:match &result {Ok(_)=>"Native recovery checks completed; compilation and gameplay remain separate.".into(),Err(problem)=>problem.chars().take(4096).collect()},progress:100,timestamp:chrono::Utc::now().to_rfc3339()});
        result
    })
    .await
    .map_err(error)?
}

#[tauri::command]
pub(super) async fn inspect_project_recovery(
    app: tauri::AppHandle,
    recovery_id: String,
) -> Reply<source_recovery::RecoveryReceipt> {
    tauri::async_runtime::spawn_blocking(move || {
        core::source_recovery::load(&app.state::<AppState>().root, &recovery_id).map_err(error)
    })
    .await
    .map_err(error)?
}
