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
