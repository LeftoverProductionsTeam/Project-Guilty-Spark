//! Opt-in, read-only diagnostic against an explicitly selected owned map.
use spark_core::{maps,render};
fn main()->Result<(),Box<dyn std::error::Error>>{
    let path=std::path::PathBuf::from(std::env::args_os().nth(1).ok_or("usage: qa_model_collision <owned-map>")?);
    let inspection=maps::inspect_map(&path,None)?;
    if inspection.header.compressed{return Err("This diagnostic requires an uncompressed owned cache".into());}
    let header=inspection.header.clone();let bytes=std::fs::read(&path)?;let sha=maps::hash_file(&path)?;
    if sha!=inspection.sha256{return Err("Map changed during inspection".into());}
    let mut rows=vec![];
    for tag in inspection.tags.iter().filter(|t|matches!(t.class.as_str(),"vehi"|"scen"|"weap"|"eqip"|"bipd")).take(64){
        let model=render::object_model_mesh(&bytes,&header,&inspection.tags,tag.id,0);
        let collision=render::object_collision_mesh(&bytes,&header,&inspection.tags,tag.id);
        let bounds=|mesh:&maps::MeshData|{let mut min=[f32::INFINITY;3];let mut max=[f32::NEG_INFINITY;3];for p in mesh.positions.chunks_exact(3){for i in 0..3{min[i]=min[i].min(p[i]);max[i]=max[i].max(p[i]);}}serde_json::json!({"min":min,"max":max,"triangles":mesh.indices.len()/3})};
        rows.push(serde_json::json!({"path":tag.path,"class":tag.class,"model":model.as_ref().map(|(_,m)|bounds(m)).map_err(|e|e.to_string()),"collision":collision.as_ref().map(|m|m.as_ref().map(bounds)).map_err(|e|e.to_string())}));
    }
    if maps::hash_file(&path)?!=sha{return Err("Original map changed".into());}
    println!("{}",serde_json::to_string_pretty(&serde_json::json!({"sourceSha256":sha,"cacheVersion":header.version,"originalUnchanged":true,"objects":rows}))?);Ok(())
}
