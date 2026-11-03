//! Read-only semantic/structural comparison of two owner-selected native caches.
//! Counts and decoded field matches do not certify rendering, scripts or gameplay.
use spark_core::{maps,portability};
use std::{collections::BTreeMap,path::Path};
fn summary(map:&maps::MapInspection)->serde_json::Value {
    let mut classes=BTreeMap::<&str,usize>::new();
    for tag in &map.tags{*classes.entry(&tag.class).or_default()+=1;}
    serde_json::json!({"sha256":map.sha256,"version":map.header.version,"scenario":map.scenario_path,
        "scenarioType":map.header.scenario_type,"build":map.header.build,"classes":classes,"placements":map.objects.len(),
        "renderTriangles":map.render_mesh.as_ref().map(|m|m.indices.len()/3),"collisionTriangles":map.mesh.indices.len()/3,
        "modelTypes":map.model_meshes.len(),"diagnostics":map.diagnostics})
}
fn main()->Result<(),Box<dyn std::error::Error>> {
    let args=std::env::args().skip(1).collect::<Vec<_>>();
    if args.len()!=2{return Err("qa_conversion_readback <owned-source.map> <converted-output.map>".into());}
    let a=maps::inspect_map(Path::new(&args[0]),None)?;let b=maps::inspect_map(Path::new(&args[1]),None)?;
    let semantic=portability::compare(&a,&b)?;
    if maps::hash_file(Path::new(&args[0]))?!=a.sha256||maps::hash_file(Path::new(&args[1]))?!=b.sha256{return Err("Selected cache changed during comparison".into());}
    println!("{}",serde_json::to_string_pretty(&serde_json::json!({"schemaVersion":1,"source":summary(&a),"target":summary(&b),"semantic":semantic,"filesUnchanged":true,"visualParityVerified":false,"gameplayVerified":false}))?);
    Ok(())
}
