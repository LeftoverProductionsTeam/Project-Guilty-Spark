use super::*;
#[tauri::command]
pub(super) async fn prepare_native_asset_import(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    source_project_id: String,
    source_sha256: String,
    tag_id: u32,
) -> Reply<core::native_asset_imports::Binding> {
    let owner = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;
        if lock(&state.forge_session)?.as_ref().is_some_and(|s|s.project_id==project_id){return Err("Recursive map-tag imports are local source transactions. Leave the shared session before importing; use SparkLink's negotiated native publication for collaboration.".into());}
        let (target,source)={let library=lock(&state.library)?;(library.get(&project_id).map_err(error)?,library.get(&source_project_id).map_err(error)?)};
        let preserved=source.source.as_ref().ok_or("Asset source has no preserved Halo map")?;
        if preserved.sha256!=source_sha256{return Err("The dragged asset's source hash changed before extraction".into());}
        let inspection=inspect(&state,&source)?;
        let tools=editing_tools(&state,&source)?;
        let id=uuid::Uuid::new_v4().to_string();let extraction=uuid::Uuid::new_v4().to_string();
        let cancel=Arc::new(AtomicBool::new(false));
        {let mut jobs=lock(&state.jobs)?;if !jobs.is_empty(){return Err("Wait for the active build or asset import before dropping another native asset".into());}jobs.insert(id.clone(),cancel.clone());}
        let result:Reply<core::native_asset_imports::Binding>=(||{
            event(&app,JobEvent{job_id:id.clone(),project_id:project_id.clone(),phase:"asset-extract".into(),message:"Extracting the selected tag and its real recursive dependencies".into(),progress:5,severity:"info".into(),timestamp:chrono::Utc::now().to_rfc3339()});
            let receipt=tag_exchange::extract_selected_tag(&source,&inspection,&tools,&state.root,&extraction,tag_id,cancel.clone(),|mut e|{e.project_id=project_id.clone();e.job_id=id.clone();event(&app,e);}).map_err(error)?;
            let binding=core::native_asset_imports::prepare(&target,&source,&inspection,&receipt,&tools,&state.root,&id,tag_id,&cancel,|e|event(&app,e)).map_err(error)?;
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
