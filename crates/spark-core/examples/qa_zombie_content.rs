//! Read-only content acceptance metadata for an owned historical cache.
//! Uses the existing bounded readers; emits no game pixels or sound bytes.
use spark_core::{audio, maps};
use std::{collections::BTreeMap, path::Path};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let path = Path::new(
        args.first()
            .ok_or("qa_zombie_content <map> [original-resources]")?,
    );
    let resources = args.get(1).map(Path::new);
    let i = maps::inspect_map(path, resources)?;
    let resource_path = resources
        .map(|p| p.join("sounds.map"))
        .filter(|p| p.is_file());
    let resource_hash = resource_path
        .as_ref()
        .map(|p| maps::hash_file(p))
        .transpose()?;
    let mut classes = BTreeMap::<String, usize>::new();
    for tag in &i.tags {
        *classes.entry(tag.class.clone()).or_default() += 1;
    }
    let sounds: Vec<_> = i.tags.iter().filter(|tag| tag.class == "snd!" &&
        ["sound/dialog/multiplayer1/scorpion", "sound/dialog/multiplayer1/hill_occupied"]
        .contains(&tag.path.to_ascii_lowercase().replace('\\', "/").as_str()))
        .map(|tag| serde_json::json!({"id":tag.id,"path":tag.path,"inspection":
            audio::inspect_sound_with_resources(path,&i.sha256,tag.id,resource_path.as_deref().zip(resource_hash.as_deref())).map_err(|e|e.to_string())})).collect();
    let mechanics: Vec<_> = i.tags.iter().filter(|tag|
        ["weap", "vehi", "bipd", "actv"].contains(&tag.class.as_str()) &&
        (tag.path.to_ascii_lowercase().contains("zombie") || tag.path.to_ascii_lowercase().contains("spawner")))
        .map(|tag|serde_json::json!({"id":tag.id,"class":tag.class,"path":tag.path,"fields":tag.fields,"references":tag.references})).collect();
    let result = serde_json::json!({"schemaVersion":1,"sourceSha256":i.sha256,"header":i.header,
        "scenarioPath":i.scenario_path,"classes":classes,"scripts":i.scripts,"encounters":i.encounters,
        "objects":i.objects,"decals":i.decals,"resources":i.resources,"diagnostics":i.diagnostics,
        "bsp":i.render_mesh.as_ref().map(|m|serde_json::json!({"vertices":m.positions.len()/3,"triangles":m.indices.len()/3,"materials":m.material_ranges,"parts":m.parts})),
        "collisionTriangles":i.mesh.indices.len()/3,"modelTypes":i.model_meshes.len(),"mechanics":mechanics,"challengedSounds":sounds});
    if maps::hash_file(path)? != i.sha256 {
        return Err("Source changed during content inspection".into());
    }
    if let Some((resource, expected)) = resource_path.as_deref().zip(resource_hash.as_deref()) {
        if maps::hash_file(resource)? != expected {
            return Err("Sound bank changed during content inspection".into());
        }
    }
    println!("{}", serde_json::to_string_pretty(&result)?);
    Ok(())
}
