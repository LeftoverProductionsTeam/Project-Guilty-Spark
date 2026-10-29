//! Creates a private C35 UI fixture. Never edits the original cache/resources.
use spark_core::{library::Library, maps, project::Source};
use std::{collections::BTreeMap, fs, path::Path};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        return Err("qa_c35_workspace <fresh-library> <owned-map>".into());
    }
    let root = Path::new(&args[1]);
    if root.exists() {
        return Err("Fixture directory must be new".into());
    }
    let source_hash = maps::hash_file(Path::new(&args[2]))?;
    let lib = Library::open(root)?;
    let (correct, inspection) = lib.import_map(Path::new(&args[2]), None)?;
    let mut wrong = correct.clone();
    wrong.id = uuid::Uuid::new_v4().to_string();
    wrong.title = "Zombie Apocalypse · C35 resource recovery".into();
    let dir = lib.project_dir(&wrong.id)?;
    fs::create_dir_all(&dir)?;
    let preserved = dir.join("source.map");
    fs::copy(&correct.source.as_ref().unwrap().preserved_path, &preserved)?;
    let inbox = root.join("empty-inbox");
    fs::create_dir(&inbox)?;
    wrong.source = Some(Source {
        original_path: inbox.join("restoration-candidate.map"),
        preserved_path: preserved,
        resource_directory: Some(inbox),
        resource_sha256: BTreeMap::new(),
        ..correct.source.clone().unwrap()
    });
    wrong.provenance.description = "Explicit native QA: reproduces missing resource pins on an identical Demo cache imported from an unrelated Inbox. Originals remain unchanged.".into();
    lib.save(&wrong, Some(&inspection))?;
    fs::write(
        root.join("spark-c35-fixture.json"),
        serde_json::to_vec_pretty(&serde_json::json!({
            "schemaVersion":1,"nativeFixture":true,"projectId":wrong.id,"matchingProjectId":correct.id,
            "title":wrong.title,"sourceSha256":source_hash,"originalUnchanged":maps::hash_file(Path::new(&args[2]))? == source_hash
        }))?,
    )?;
    println!("{}", wrong.id);
    Ok(())
}
