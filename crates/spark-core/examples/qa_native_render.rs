//! Read-only owned-map render/audio acceptance. Emits counts and identities,
//! never proprietary geometry, pixels or samples. No game playback claim.
use spark_core::{appearance, audio, bitmap_preview as bitmap, maps};
use std::{collections::BTreeSet, path::PathBuf, time::Instant};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path=PathBuf::from(std::env::args_os().nth(1).ok_or("usage: qa_native_render <owned-map>")?);
    let started=Instant::now();
    let inspection=maps::inspect_map(&path,None)?;
    let resource=std::env::args_os().nth(2).map(PathBuf::from);
    let resource_hash=resource.as_ref().map(|p|maps::hash_file(p)).transpose()?;
    let resource_args=resource.as_deref().zip(resource_hash.as_deref());
    let inspect_ms=started.elapsed().as_secs_f64()*1000.;
    let render=inspection.render_mesh.as_ref().ok_or_else(||format!("Native render BSP was not recovered: {}",serde_json::to_string(&inspection.diagnostics).unwrap_or_default()))?;
    if render.indices.is_empty() {return Err("Native render BSP has no triangles".into());}
    let mut wanted=BTreeSet::new();
    for mesh in std::iter::once(render).chain(inspection.model_meshes.values()) {
        for range in &mesh.material_ranges {
            if let Some(shader)=inspection.tags.iter().find(|t|t.id==range.shader_tag_id){
                for reference in &shader.references {if reference.class=="bitm"&&matches!(reference.label.as_str(),"Base map"|"Diffuse map"|"Primary detail map"|"Detail map"){wanted.insert((reference.target_id,0usize));}}
            }
            if range.has_lightmap_uvs&&range.lightmap_page>=0 {if let Some(id)=range.lightmap_bitmap_tag_id{wanted.insert((id,range.lightmap_page as usize));}}
        }
    }
    let requests:Vec<_>=wanted.iter().map(|&(bitmap_tag_id,image_index)|bitmap::OwnedBitmapRequest{bitmap_tag_id,image_index}).collect();
    let mut images=vec![];
    let decoded=Instant::now();
    // Match the application's bounded batched transport instead of hashing a
    // campaign file again for each individual lightmap page.
    for group in requests.chunks(8) {
        let batch=bitmap::preview_owned_bitmap_batch_with_resources(&path,&inspection.sha256,&inspection,group,resource_args)?;
        for item in batch.items {images.push(serde_json::json!({"id":item.bitmap_tag_id,"image":item.image_index,"path":inspection.tags.iter().find(|t|t.id==item.bitmap_tag_id).map(|t|&t.path),"error":item.error,"preview":item.preview.map(|p|serde_json::json!({"width":p.width,"height":p.height,"format":p.format,"source":p.source_kind,"identity":p.source_sha256}))}));}
    }
    let bitmap_ms=decoded.elapsed().as_secs_f64()*1000.;
    let mut cubes=vec![];let mut cube_ids=BTreeSet::new();
    for tag in &inspection.tags {for reference in &tag.references{if reference.class=="bitm"&&reference.label.to_ascii_lowercase().contains("reflection"){cube_ids.insert(reference.target_id);}}}
    for id in cube_ids {let result=bitmap::preview_owned_cube(&path,&inspection.sha256,&inspection,id,resource_args);cubes.push(serde_json::json!({"id":id,"result":result.map(|p|serde_json::json!({"faces":p.faces.len(),"width":p.faces.first().map(|f|f.width)})).map_err(|e|e.to_string())}));}
    let mut sounds=vec![];
    for tag in inspection.tags.iter().filter(|t|t.class=="snd!"&&t.path.contains("ambience")).take(3){
        let report=audio::inspect_sound(&path,&inspection.sha256,tag.id);
        sounds.push(match report {Ok(report)=>{let sample=report.permutations.iter().find(|p|p.available).map(|p|audio::preview_sound(&path,&inspection.sha256,tag.id,p.pitch_range,p.permutation).map(|p|serde_json::json!({"mime":p.mime,"bytes":p.bytes.len(),"hash":p.sha256,"source":p.source_sha256})).map_err(|e|e.to_string()));serde_json::json!({"path":tag.path,"permutations":report.permutations,"sample":sample})},Err(error)=>serde_json::json!({"path":tag.path,"error":error.to_string()})});
    }
    let source_appearance=appearance::inspect(&path,&inspection.sha256,&inspection).map(|a|serde_json::json!({"sky":a.sky_path,"skyTriangles":a.sky_mesh.as_ref().map(|m|m.indices.len()/3),"environment":a.environment,"warnings":a.warnings})).map_err(|e|e.to_string());
    let after=maps::hash_file(&path)?;
    if after!=inspection.sha256{return Err("Owned map changed during the read-only acceptance test".into());}
    let model_materials:Vec<_>=inspection.model_meshes.iter().map(|(id,mesh)|serde_json::json!({"path":inspection.tags.iter().find(|t|t.id==*id).map(|t|&t.path),"triangles":mesh.indices.len()/3,"materials":mesh.material_ranges.iter().filter_map(|r|inspection.tags.iter().find(|t|t.id==r.shader_tag_id)).map(|t|serde_json::json!({"id":t.id,"path":t.path,"class":t.class,"references":t.references,"metadata":t.shader_preview})).collect::<Vec<_>>()})).collect();
    println!("{}",serde_json::to_string_pretty(&serde_json::json!({"path":path,"sha256":after,"version":inspection.header.version,"sourceUnchanged":true,"inspectMs":inspect_ms,"bitmapMs":bitmap_ms,"totalMs":started.elapsed().as_secs_f64()*1000.,"bspParts":render.parts.len(),"renderTriangles":render.indices.len()/3,"renderVertices":render.positions.len()/3,"modelTypes":inspection.model_meshes.len(),"models":model_materials,"images":images,"cubes":cubes,"sounds":sounds,"appearance":source_appearance,"diagnostics":inspection.diagnostics,"gameplayAudioVerified":false}))?);
    Ok(())
}
