//! Bounded, read-only appearance metadata diagnostic. Does not export pixels.
use spark_core::{appearance, maps};
use std::path::Path;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if !(2..=4).contains(&args.len()) { return Err("Usage: inspect_appearance <owned source map> [BSP index] [cluster index]".into()); }
    let path=Path::new(&args[1]);let inspection=maps::inspect_map(path,None)?;
    let bsp_index = args.get(2).map(|value| value.parse()).transpose()?;
    let cluster_index = args.get(3).map(|value| value.parse()).transpose()?;
    let a=appearance::inspect_bsp_cluster(path,&inspection.sha256,&inspection,bsp_index,cluster_index)?;
    let mut bounds=([f32::INFINITY;3],[f32::NEG_INFINITY;3]);
    if let Some(mesh)=&a.sky_mesh {for v in mesh.positions.chunks_exact(3){for axis in 0..3 {bounds.0[axis]=bounds.0[axis].min(v[axis]);bounds.1[axis]=bounds.1[axis].max(v[axis]);}}}
    let shaders: Vec<_>=inspection.tags.iter().filter(|tag|a.sky_mesh.as_ref().is_some_and(|m|m.material_ranges.iter().any(|r|r.shader_tag_id==tag.id))).collect();
    println!("{}",serde_json::to_string_pretty(&serde_json::json!({"sourceSha256":a.source_sha256,"skyPath":a.sky_path,"skyReferenceCount":a.sky_reference_count,
        "environment":a.environment,"fogMaximumDensity":a.fog_maximum_density,"skyBounds":bounds,"shaders":shaders,"warnings":a.warnings}))?);
    Ok(())
}
