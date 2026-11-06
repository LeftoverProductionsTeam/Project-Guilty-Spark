use super::*;
#[tauri::command]
pub(super) async fn runtime_texture_source(app:tauri::AppHandle,window:tauri::WebviewWindow,runtime_id:runtime::RuntimeId)->Reply<OpenProject>{
    material_preview_source(app,window,vec![runtime_id,runtime::RuntimeId::MccSteam,runtime::RuntimeId::HaloCustomEdition,runtime::RuntimeId::HaloPc]).await.map(|(_,open)|open)
}
async fn material_preview_source(app:tauri::AppHandle,window:tauri::WebviewWindow,runtimes:Vec<runtime::RuntimeId>)->Reply<(runtime::RuntimeId,OpenProject)>{
    let handle=app.clone();
    let (selected,open)=tauri::async_runtime::spawn_blocking(move||{
        let state=handle.state::<AppState>();
        // Community runtimes may use an owned PC/MCC material source for editor
        // preview. This does not change the stricter native build material route.
        let (selected,path)=asset_sources_native::default_material_map_for(&state,&runtimes)?;
        let (project,inspection)=lock(&state.library)?.preview_map(&path,path.parent()).map_err(error)?;
        lock(&state.inspections)?.insert(project.id.clone(),Arc::new(inspection.clone()));
        Ok::<_,String>((selected,OpenProject{project,inspection:Some(inspection)}))
    }).await.map_err(error)??;
    let open=if open.project.source.as_ref().is_some_and(|s|s.cache_version==13){connect_mcc_texture_resources(app,window,open.project.id).await?}
    else {texture_resources_native::auto_connect(app,window,open.project.id.clone()).await?.unwrap_or(open)};
    Ok((selected,open))
}

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub(super) struct MapTextureSource {
    identity:core::source_identity::SourceIdentity,
    runtime_id:runtime::RuntimeId,
    open:OpenProject,
}
fn source_context(state:&AppState,project:&Project,inspection:&MapInspection)->Reply<core::source_identity::SourceIdentity>{
    let mut identity=core::source_identity::describe(project,inspection).map_err(error)?;
    identity.runtime_installations=runtime_connections::source_installations(state,&identity.source)?;
    let origins=identity.runtime_installations.iter().filter(|entry|entry.original_location).collect::<Vec<_>>();
    identity.runtime_origin=if origins.len()==1{Some(origins[0].origin.clone())}else{None};
    Ok(identity)
}
#[tauri::command]
pub(super) async fn map_texture_source(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String,source_sha256:String)->Reply<MapTextureSource>{
    let handle=app.clone();
    let identity=tauri::async_runtime::spawn_blocking(move||{
        let state=handle.state::<AppState>();let project=lock(&state.library)?.get(&project_id).map_err(error)?;
        let inspection=inspect(&state,&project)?;
        let identity=source_context(&state,&project,&inspection)?;
        if identity.source.sha256!=source_sha256||maps::hash_file(&identity.source.preserved_path).map_err(error)?!=source_sha256 {
            return Err("Map texture source changed before resource discovery".into());
        }
        Ok::<_,String>(identity)
    }).await.map_err(error)??;
    let (runtime_id,open)=material_preview_source(app,window,identity.candidate_preview_runtimes.clone()).await?;
    Ok(MapTextureSource{identity,runtime_id,open})
}

#[tauri::command]
pub(super) async fn inspect_map_source(app:tauri::AppHandle,project_id:String)->Reply<core::source_identity::SourceIdentity>{
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let project=lock(&state.library)?.get(&project_id).map_err(error)?;
        let inspection=inspect(&state,&project)?;let identity=source_context(&state,&project,&inspection)?;
        if maps::hash_file(&identity.source.preserved_path).map_err(error)?!=identity.source.sha256{return Err("Preserved map changed before source identification".into());}Ok(identity)
    }).await.map_err(error)?
}

#[tauri::command]
pub(super) async fn compatible_bitmap_targets(app:tauri::AppHandle,project_id:String,runtime_project_id:String,requests:Vec<core::bitmap_preview::OwnedBitmapRequest>)->Reply<Vec<core::bitmap_preview::CompatibleBitmapTarget>>{
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();
        let library=lock(&state.library)?;let source=library.get(&project_id).map_err(error)?;let runtime=library.get(&runtime_project_id).map_err(error)?;drop(library);
        let a=source.source.as_ref().ok_or("Missing preserved source")?;let b=runtime.source.as_ref().ok_or("Missing runtime source")?;
        let source_inspection=inspect(&state,&source)?;let target_inspection=inspect(&state,&runtime)?;
        core::bitmap_preview::compatible_runtime_targets(&a.preserved_path,&source_inspection,&b.preserved_path,&target_inspection,&requests).map_err(error)
    }).await.map_err(error)?
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Defaults {
    source: OpenProject,
    materials: Vec<quickforge::ForgeMaterial>,
    bindings: Vec<core::native_asset_imports::Binding>,
}
#[tauri::command]
pub(super) async fn prepare_default_halo_materials(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
) -> Reply<Defaults> {
    let owner = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();check_document_owner(&state,&project_id,&owner)?;
        if lock(&state.forge_session)?.as_ref().is_some_and(|s|s.project_id==project_id){return Err("Prepare original native materials before joining SparkLink".into());}
        let target=lock(&state.library)?.get(&project_id).map_err(error)?;
        let document=target.quick_forge.as_ref().ok_or("Default source materials belong to a QuickForge/BSP Workshop project")?;
        let path=asset_sources_native::default_material_map(&state,document.runtime_id)?;
        let (source,inspection)=lock(&state.library)?.import_map(&path,path.parent()).map_err(error)?;
        lock(&state.inspections)?.insert(source.id.clone(),Arc::new(inspection.clone()));
        let source=native_resources_native::for_project(&state,&source,&inspection)?;
        let tools=editing_tools(&state,&source)?;
        let choices=[("surface","levels/test/bloodgulch/shaders/cap_metal",[0.35,0.4,0.42]),("grass","levels/test/bloodgulch/shaders/blood ground",[0.3,0.42,0.23])];
        let job=uuid::Uuid::new_v4().to_string();let cancel=Arc::new(AtomicBool::new(false));
        {let mut jobs=lock(&state.jobs)?;if !jobs.is_empty(){return Err("Wait for the current native job before preparing default materials".into());}jobs.insert(job.clone(),cancel.clone());}
        let result:Reply<Defaults>=(||{
            let mut bindings=vec![];let mut materials=vec![];
            for (material,path,color)in choices {
                let tag=inspection.tags.iter().find(|t|t.class=="senv"&&t.path.replace('\\',"/").eq_ignore_ascii_case(path)).ok_or("The selected source map does not contain the exact native grass/metal shader")?;
                let id=uuid::Uuid::new_v4().to_string();let extraction=uuid::Uuid::new_v4().to_string();
                let receipt=tag_exchange::extract_selected_tag(&source,&inspection,&tools,&state.root,&extraction,tag.id,cancel.clone(),|mut e|{e.project_id=project_id.clone();e.job_id=job.clone();e.progress=e.progress.min(95);event(&app,e);}).map_err(error)?;
                let binding=core::native_asset_imports::prepare(&target,&source,&inspection,&receipt,&tools,&state.root,&id,tag.id,&cancel,|mut e|{e.job_id=job.clone();event(&app,e);}).map_err(error)?;
                materials.push(quickforge::ForgeMaterial{id:material.into(),name:if material=="grass"{"halo_grass"}else{"halo_metal"}.into(),shader_path:Some(binding.native_path.clone()),color});bindings.push(binding);
            }
            let mut checked=document.clone();checked.materials=materials.clone();quickforge::validate_document(&checked).map_err(error)?;
            check_document_owner(&state,&project_id,&owner)?;
            if lock(&state.forge_session)?.as_ref().is_some_and(|s|s.project_id==project_id){return Err("The project joined a session during preparation; no default materials were committed".into());}
            Ok(Defaults{source:OpenProject{project:source,inspection:Some(inspection)},materials,bindings})
        })();
        if let Ok(mut jobs)=state.jobs.lock(){jobs.remove(&job);}
        event(&app,JobEvent{job_id:job,project_id,phase:if result.is_ok(){"materials-ready"}else{"materials-unavailable"}.into(),message:match &result{Ok(_)=>"Native grass and metal shaders and their dependencies are ready for source authoring".into(),Err(reason)=>reason.clone()},progress:100,severity:if result.is_ok(){"success"}else{"warning"}.into(),timestamp:chrono::Utc::now().to_rfc3339()});
        result
    }).await.map_err(error)?
}
