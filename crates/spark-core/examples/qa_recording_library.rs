//! Seed one new private recording fixture from an owned cache. No game/tool launch.
use spark_core::{library::Library, maps};
use std::{fs, path::Path};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 2 {
        return Err("qa_recording_library <fresh-library> <owned-map>".into());
    }
    let root = Path::new(&args[0]);
    if root.exists() {
        return Err("Use a fresh recording QA library".into());
    }
    let sha = maps::hash_file(Path::new(&args[1]))?;
    let library = Library::open(root)?;
    let (project, inspection) = library.import_map(Path::new(&args[1]), None)?;
    fs::write(
        root.join("spark-recording-fixture.json"),
        serde_json::to_vec_pretty(
            &serde_json::json!({"schemaVersion":1,"nativeFixture":true,"projectId":project.id,"title":project.title,"sourceSha256":sha,"cacheVersion":inspection.header.version}),
        )?,
    )?;
    if maps::hash_file(Path::new(&args[1]))? != sha {
        return Err("Original source changed".into());
    }
    println!("{}", project.id);
    Ok(())
}
