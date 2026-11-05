use super::*;
fn source_for_import(state:&AppState,id:&str)->Reply<Project>{
    let _history=lock(&state.window_history)?;
    let library=lock(&state.library)?;
    let mut source=library.get(id).map_err(error)?;
    if let Some(history)=core::workspace_history::read(&library.project_dir(id).map_err(error)?.join("window-history"),&source).map_err(error)? {
        if let Some(current)=history.snapshots.iter().find(|item|item.key==history.head.current) {
            source.tag_edits=current.project.tag_edits.clone();
            source.tag_renames=current.project.tag_renames.clone();
            source.tag_duplicates=current.project.tag_duplicates.clone();
        }
    }
    Ok(source)
}
#[tauri::command]
pub(super) async fn prepare_native_asset_import(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    source_project_id: String,
    source_sha256: String,
    tag_id: u32,
    existing: Option<core::native_asset_imports::Binding>,
) -> Reply<core::native_asset_imports::Binding> {
    let owner = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;
        if lock(&state.forge_session)?.as_ref().is_some_and(|s|s.project_id==project_id){return Err("Recursive map-tag imports are local source transactions. Leave the shared session before importing; use SparkLink's negotiated native publication for collaboration.".into());}
        // Read authored tag drafts from the same durable history used by the
        // editor. A saved map alone may lag an unsaved edit in another window.
        let target=lock(&state.library)?.get(&project_id).map_err(error)?;
        let source=source_for_import(&state,&source_project_id)?;
        let preserved=source.source.as_ref().ok_or("Asset source has no preserved Halo map")?;
        if preserved.sha256!=source_sha256{return Err("The dragged asset's source hash changed before extraction".into());}
        core::native_asset_imports::require_native_source(&source).map_err(error)?;
        let inspection=inspect(&state,&source)?;
        if let Some(binding)=existing {
            if binding.tag_id!=tag_id{return Err("The existing import identifies another source tag".into());}
            let reused=core::native_asset_imports::reuse(&target,&source,&inspection,&binding,&state.root).map_err(error)?;
            core::native_asset_imports::require_native_source(&source_for_import(&state,&source_project_id)?).map_err(error)?;
            return Ok(reused);
        }
        let source=native_resources_native::for_project(&state,&source,&inspection)?;
        let tools=editing_tools(&state,&source)?;
        let id=uuid::Uuid::new_v4().to_string();let extraction=uuid::Uuid::new_v4().to_string();
        let cancel=Arc::new(AtomicBool::new(false));
        {let mut jobs=lock(&state.jobs)?;if !jobs.is_empty(){return Err("Wait for the active build or asset import before dropping another native asset".into());}jobs.insert(id.clone(),cancel.clone());}
        let result:Reply<core::native_asset_imports::Binding>=(||{
            event(&app,JobEvent{job_id:id.clone(),project_id:project_id.clone(),phase:"asset-extract".into(),message:"Extracting the selected tag and its real recursive dependencies".into(),progress:5,severity:"info".into(),timestamp:chrono::Utc::now().to_rfc3339()});
            let receipt=tag_exchange::extract_selected_tag(&source,&inspection,&tools,&state.root,&extraction,tag_id,cancel.clone(),|mut e|{e.project_id=project_id.clone();e.job_id=id.clone();event(&app,e);}).map_err(error)?;
            let binding=core::native_asset_imports::prepare(&target,&source,&inspection,&receipt,&tools,&state.root,&id,tag_id,&cancel,|e|event(&app,e)).map_err(error)?;
            core::native_asset_imports::require_native_source(&source_for_import(&state,&source_project_id)?).map_err(error)?;
            check_document_owner(&state,&project_id,&owner)?;
            if lock(&state.forge_session)?.as_ref().is_some_and(|s|s.project_id==project_id){return Err("The project joined a shared session during extraction; no local placement was committed".into());}
            event(&app,JobEvent{job_id:id.clone(),project_id:project_id.clone(),phase:"asset-imported".into(),message:format!("{} real native tags copied, references updated and read back. Ready for placement and a native build.",binding.file_count),progress:100,severity:"success".into(),timestamp:chrono::Utc::now().to_rfc3339()});
            Ok(binding)
        })();
        if let Ok(mut jobs)=state.jobs.lock(){jobs.remove(&id);}
        if let Err(reason)=&result{event(&app,JobEvent{job_id:id,project_id,phase:"asset-import-failed".into(),message:reason.clone(),progress:100,severity:"error".into(),timestamp:chrono::Utc::now().to_rfc3339()});}
        result
    }).await.map_err(error)?
}
