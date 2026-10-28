//! Read-only visual evidence for an owned cache. Prints counts, never asset bytes.
use spark_core::maps;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = std::env::args()
        .nth(1)
        .ok_or("Expected a local owned .map path")?;
    let i = maps::inspect_map(std::path::Path::new(&path), None)?;
    eprintln!("collision: {} vertices, {} triangles; source scripts: {}",i.mesh.positions.len()/3,i.mesh.indices.len()/3,i.scripts.len());
    let models:Vec<_>=i.model_meshes.iter().map(|(id,m)|serde_json::json!({"tag":i.tags.iter().find(|t|t.id==*id).map(|t|&t.path),"vertices":m.positions.len()/3,"triangles":m.indices.len()/3,"materials":m.material_ranges.len()})).collect();
    let appearance = spark_core::appearance::inspect(std::path::Path::new(&path), &i.sha256, &i)?;
    let mut textures = vec![];
    if let Some(directory) = std::env::args().nth(2) {
        let directory = std::path::Path::new(&directory);
        let hashes = spark_core::mcc_textures::pin(directory, &i.header.name)?;
        let mut wanted = std::collections::BTreeSet::new();
        for range in i.render_mesh.iter().flat_map(|m| &m.material_ranges) {
            if let Some(shader) = i.tags.iter().find(|t| t.id == range.shader_tag_id) {
                for r in shader.references.iter().filter(|r| {
                    [
                        "Base map",
                        "Diffuse map",
                        "Primary detail map",
                        "Secondary detail map",
                        "Micro detail map",
                        "Bump map",
                    ]
                    .contains(&r.label.as_str())
                }) {
                    wanted.insert((r.target_id, 0usize));
                }
            }
            if let Some(id) = range.lightmap_bitmap_tag_id {
                if range.lightmap_page >= 0 {
                    wanted.insert((id, range.lightmap_page as usize));
                }
            }
        }
        let requests: Vec<_> = wanted
            .into_iter()
            .map(
                |(bitmap_tag_id, image_index)| spark_core::bitmap_preview::OwnedBitmapRequest {
                    bitmap_tag_id,
                    image_index,
                },
            )
            .collect();
        for batch in requests.chunks(24) {
            let result = spark_core::bitmap_preview::preview_mcc_bitmap_batch(
                std::path::Path::new(&path),
                &i.sha256,
                &i,
                batch,
                directory,
                &hashes,
            )?;
            for item in result.items {
                textures.push(serde_json::json!({"path":i.tags.iter().find(|t|t.id==item.bitmap_tag_id).map(|t|&t.path),"image":item.image_index,"preview":item.preview.map(|p|serde_json::json!({"width":p.width,"height":p.height,"format":p.format})),"error":item.error}));
            }
        }
    }
    println!(
        "{}",
        serde_json::to_string_pretty(
            &serde_json::json!({"sha256":i.sha256,"version":i.header.version,"scenario":i.scenario_path,"tagChecksum":i.tag_checksum,"decals":i.decals,"tags":i.tags.len(),"render":i.render_mesh.as_ref().map(|m|serde_json::json!({"vertices":m.positions.len()/3,"triangles":m.indices.len()/3,"materials":m.material_ranges.len(),"lightmapUvs":m.lightmap_uvs.len()/2})),"models":models,"diagnostics":i.diagnostics,"appearance":{"environment":appearance.environment,"warnings":appearance.warnings,"skyTriangles":appearance.sky_mesh.map(|m|m.indices.len()/3)},"textures":textures})
        )?
    );
    Ok(())
}
