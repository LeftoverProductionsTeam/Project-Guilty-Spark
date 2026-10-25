use std::path::Path;
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let Some(path) = args.get(1) else {
        eprintln!("Usage: cargo run -p spark-core --example inspect -- <map> [resources folder]");
        std::process::exit(2)
    };
    match spark_core::maps::inspect_map(Path::new(path),args.get(2).map(Path::new)){Ok(i)=>println!("{}",serde_json::to_string_pretty(&serde_json::json!({"header":i.header,"sha256":i.sha256,"scenario":i.scenario_path,"tags":i.tags.len(),"editableFields":i.tags.iter().map(|t|t.fields.len()).sum::<usize>(),"objects":i.objects.len(),"geometryVertices":i.mesh.positions.len()/3,"geometryTriangles":i.mesh.indices.len()/3,"encounters":i.encounters.len(),"scripts":i.scripts.len(),"diagnostics":i.diagnostics})).unwrap()),Err(e)=>{eprintln!("{e}");std::process::exit(1)}}
}
