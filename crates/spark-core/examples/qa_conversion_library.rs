//! Seed a fresh private CE conversion UI library without altering the owned map.
use spark_core::{library::Library, maps};
use std::{fs, path::Path};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 2 {
        return Err("qa_conversion_library <fresh-library> <owned-CE-cache>".into());
    }
    let root = Path::new(&args[0]);
    if root.exists() {
        return Err("QA library must be new".into());
    }
    let hash = maps::hash_file(Path::new(&args[1]))?;
    let library = Library::open(root)?;
    let (project, inspection) = library.import_map(Path::new(&args[1]), None)?;
    if inspection.header.version != 609 {
        return Err("This fixture requires an actual Custom Edition cache".into());
    }
    fs::write(
        root.join("spark-conversion-ui-fixture.json"),
        serde_json::to_vec_pretty(
            &serde_json::json!({"schemaVersion":1,"nativeFixture":true,"projectId":project.id,"title":project.title,"sourceSha256":hash,"sourceCacheVersion":609}),
        )?,
    )?;
    if maps::hash_file(Path::new(&args[1]))? != hash {
        return Err("Original source changed".into());
    }
    println!("{}", project.id);
    Ok(())
}
