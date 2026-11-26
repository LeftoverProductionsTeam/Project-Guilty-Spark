use super::*;
use spark_core as core;
use core::megaworld::Atlas;
fn cached(state:&AppState)->Reply<Option<Atlas>>{
    let file=state.root.join("megaworld-atlas.json");core::reject_links(&file).map_err(error)?;
    if !file.is_file(){return Ok(None);}if fs::metadata(&file).map_err(error)?.len()>8*1024*1024{return Err("Atlas metadata exceeds 8 MiB".into());}
    serde_json::from_slice(&fs::read(file).map_err(error)?).map(Some).map_err(error)
}
#[tauri::command]
pub(super) async fn megaworld_atlas(app:tauri::AppHandle)->Reply<Atlas>{
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();state.startup.wait()?;let roots=runtime_connections::owned_map_roots(&state)?;
        let mut inputs=vec![];
        for (root,runtime) in roots{core::reject_links(&root).map_err(error)?;if !root.is_dir(){continue;}
            for entry in fs::read_dir(root).map_err(error)?{let path=entry.map_err(error)?.path();if path.extension().is_some_and(|e|e.eq_ignore_ascii_case("map"))&&!path.file_stem().is_some_and(|n|["bitmaps","sounds","loc","ui"].iter().any(|s|n.eq_ignore_ascii_case(s))){inputs.push((path,runtime.clone()));}}
        }
        inputs.sort();inputs.dedup();let previous=cached(&state)?;let atlas=core::megaworld::inventory(&inputs,previous.as_ref()).map_err(error)?;
        project::atomic_write(&state.root.join("megaworld-atlas.json"),&serde_json::to_vec(&atlas).map_err(error)?,false).map_err(error)?;Ok(atlas)
    }).await.map_err(error)?
}
fn burial_source(state: &AppState, atlas: Option<&Atlas>, region: &core::megaworld::LayoutRegion)
    -> Reply<(PathBuf, Arc<MapInspection>)> {
    let saved = {
        let library = lock(&state.library)?;
        library.list().map_err(error)?.into_iter()
            .find(|entry| entry.sha256.as_ref() == Some(&region.cache_sha256))
            .map(|entry| library.get(&entry.id))
            .transpose().map_err(error)?
    };
    if let Some(project) = saved {
        let source = project.source.as_ref().ok_or("The chosen region no longer has an owned source")?;
        let map = inspect(state, &project)?;
        return Ok((source.preserved_path.clone(), map));
    }
    let path = atlas.and_then(|atlas| atlas.regions.iter().find(|row| row.id == region.region_id))
        .and_then(|row| row.source_paths.iter().find(|path| path.is_file()))
        .ok_or("Open the region’s owned source or scan its installation before reviewing burial")?;
    core::reject_links(path).map_err(error)?;
    let map = maps::inspect_map(path, path.parent()).map_err(error)?;
    Ok((path.clone(), Arc::new(map)))
}

#[tauri::command]
pub(super) async fn review_atlas_burial(
    app: tauri::AppHandle, layout: core::megaworld::Layout,
    surface_id: String, interior_id: String, clearance: f64,
) -> Reply<core::megaworld::BurialReview> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        state.startup.wait()?;
        layout.validate().map_err(error)?;
        let surface = layout.regions.iter().find(|region| region.region_id == surface_id)
            .ok_or("Choose a surface region from the saved layout")?;
        let interior = layout.regions.iter().find(|region| region.region_id == interior_id)
            .ok_or("Choose an underground region from the saved layout")?;
        let atlas = cached(&state)?;
        let (surface_path, surface_map) = burial_source(&state, atlas.as_ref(), surface)?;
        let (interior_path, interior_map) = burial_source(&state, atlas.as_ref(), interior)?;
        core::megaworld::review_burial(surface, interior, (&surface_path, &surface_map),
            (&interior_path, &interior_map), clearance).map_err(error)
    }).await.map_err(error)?
}

#[tauri::command]
pub(super) async fn import_megaworld_region(app:tauri::AppHandle,region_id:String)->Reply<OpenProject>{
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();let atlas=cached(&state)?.ok_or("Scan installed map regions first")?;
        let region=atlas.regions.iter().find(|r|r.id==region_id).ok_or("Region is not in the verified Atlas")?;
        let path=region.source_paths.iter().find(|p|p.is_file()).ok_or("Original region source is unavailable")?;
        if maps::hash_file(path).map_err(error)?!=region.cache_sha256{return Err("Atlas source changed; rescan before importing".into());}
        let (project,inspection)=lock(&state.library)?.import_map(path,path.parent()).map_err(error)?;
        if inspection.sha256!=region.cache_sha256||inspection.mesh.parts.get(region.bsp_index).is_none(){return Err("Imported region identity differs from the Atlas".into());}
        Ok(OpenProject{project,inspection:Some(inspection)})
    }).await.map_err(error)?
}
