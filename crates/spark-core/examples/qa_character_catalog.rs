//! Read-only native character/dialogue inventory. No audio or map bytes are exported.
use spark_core::maps;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut reports = Vec::new();
    for argument in std::env::args().skip(1) {
        let path = std::path::Path::new(&argument);
        let map = maps::inspect_map(path, path.parent())?;
        let matching = |name: &str| {
            let name = name.to_ascii_lowercase();
            ["monitor", "343", "johnson", "sarge", "cortana", "chief", "cyborg", "marine", "sargeant"].iter().any(|part| name.contains(part))
        };
        reports.push(serde_json::json!({"map":argument,"sha256":map.sha256,
            "models":map.tags.iter().filter(|t|["bipd","scen"].contains(&t.class.as_str())&&matching(&t.path)).map(|t|serde_json::json!({"id":t.id,"class":t.class,"path":t.path,"references":t.references,"variants":spark_core::render::owned_model_variants(path,&map.sha256,&map,t.id).ok()})).collect::<Vec<_>>(),
            "shaders":map.tags.iter().filter(|t|["sotr","soso","sgla","schi","scex"].contains(&t.class.as_str())&&matching(&t.path)).map(|t|serde_json::json!({"id":t.id,"class":t.class,"path":t.path,"status":t.primary_bitmap_status,"preview":t.shader_preview})).collect::<Vec<_>>(),
            "sounds":map.tags.iter().filter(|t|t.class=="snd!"&&matching(&t.path)).map(|t|serde_json::json!({"id":t.id,"path":t.path})).collect::<Vec<_>>() }));
    }
    println!("{}",serde_json::to_string_pretty(&reports)?);
    Ok(())
}
