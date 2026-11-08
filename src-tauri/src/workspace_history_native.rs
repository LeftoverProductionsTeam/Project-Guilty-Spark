use super::*;
use spark_core as core;
use core::workspace_history::{self, Head, Snapshot, View};
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub(super) struct Status { pub writable:bool, pub owner:Option<String>, pub history:Option<View> }
#[tauri::command]
pub(super) fn inspection_cache_status(state:State<AppState>)->Reply<serde_json::Value>{Ok(lock(&state.inspections)?.stats())}
#[tauri::command]
pub(super) async fn read_workspace_history(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String)->Reply<Status>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();
    let mut guard=lock(&state.window_history)?;
    let library=lock(&state.library)?;let p=library.get(&project_id).map_err(error)?;
    let mut history=guard.read(&library.project_dir(&project_id).map_err(error)?.join("window-history"),&p).map_err(error)?;
    // Match the existing editor reducer: accepted resources, assets and build
    // receipts cannot be removed by restoring an older authored snapshot.
    if let Some(history)=&mut history{for snapshot in &mut history.snapshots{snapshot.project.source=p.source.clone();snapshot.project.assets=p.assets.clone();snapshot.project.builds=p.builds.clone();}}
    let owner=lock(&state.document_owners)?.get(&project_id).cloned();
    Ok(Status{writable:owner.as_deref()==Some(window.label()),owner,history})}).await.map_err(error)?
}
#[tauri::command]
pub(super) async fn commit_workspace_history(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String,revision:u64,head:Head,snapshots:Vec<Snapshot>)->Reply<u64>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();
    let mut guard=lock(&state.window_history)?;
    let library=lock(&state.library)?;let p=library.get(&project_id).map_err(error)?;
    let directory=library.project_dir(&project_id).map_err(error)?.join("window-history");
    let writable=lock(&state.document_owners)?.get(&project_id).map(String::as_str)==Some(window.label());
    if !writable{let retained=guard.retain_draft(&p,revision,&head,&snapshots).map_err(error)?;return Err(format!("Editing moved to another window. Retained {retained}"));}
    if p.source.is_some(){let inspection=inspect(&state,&p)?;for item in &snapshots{project::validate_edits(&item.project,&inspection).map_err(error)?;}}
    let revision=match guard.commit(&directory,&p,revision,head.clone(),snapshots.clone()){Ok(revision)=>revision,Err(reason)=>{let retained=guard.retain_draft(&p,revision,&head,&snapshots).map_err(error)?;return Err(format!("{reason} Retained {retained}"));}};
    let current=guard.read(&directory,&p).map_err(error)?.and_then(|view|view.snapshots.into_iter().find(|snapshot|snapshot.key==head.current)).map(|snapshot|snapshot.project).unwrap_or(p);
    // New documents need one explicit Save before automatic recovery has a
    // durable library entry through which it can be reopened after a crash.
    if library.is_saved(&project_id).map_err(error)?&&current.effective_automatic_backup_retention(lock(&state.settings)?.snapshot_retention).map_err(error)?>0{guard.checkpoint(&directory,&current).map_err(error)?;}
    let _=window.app_handle().emit("spark:window-history",serde_json::json!({"projectId":project_id,"revision":revision,"owner":window.label()}));
    Ok(revision)}).await.map_err(error)?
}
#[tauri::command]
pub(super) async fn retain_workspace_draft(app:tauri::AppHandle,project_id:String,revision:u64,head:Head,snapshots:Vec<Snapshot>)->Reply<String>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let _guard=lock(&state.window_history)?;let library=lock(&state.library)?;let p=library.get(&project_id).map_err(error)?;
    let directory=library.project_dir(&project_id).map_err(error)?.join("window-history");
    workspace_history::retain_draft(&directory,&p,revision,&head,&snapshots).map(|path|path.to_string_lossy().into_owned()).map_err(error)}).await.map_err(error)?
}
#[tauri::command]
pub(super) fn take_project_document(state:State<AppState>,window:tauri::WebviewWindow,id:String)->Reply<()> {
    let _guard=lock(&state.window_history)?;
    let _=lock(&state.library)?.get(&id).map_err(error)?;
    if runtime_workbench::has_running(&state,&id)?{return Err("Close the active native tool before handing editing to another window".into());}
    shared_editing::claim_owner(&state,&id,window.label())?;
    lock(&state.document_owners)?.insert(id.clone(),window.label().into());
    let _=window.app_handle().emit("spark:window-history",serde_json::json!({"projectId":id,"owner":window.label()}));Ok(())
}

#[tauri::command]
pub(super) fn set_inspection_cache_budget(state:tauri::State<'_,AppState>,bytes:usize)->Reply<serde_json::Value>{
    let mut cache=lock(&state.inspections)?;cache.set_budget(bytes)?;Ok(cache.stats())
}
