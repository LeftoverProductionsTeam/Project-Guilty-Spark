//! Local-only smoke-test setup. All source assets remain outside version control.
use spark_core::{library::Library, maps, project};
use std::path::Path;
fn main() -> spark_core::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("Usage: qa_workspace <workspace directory> <owned map> [Invader directory]");
        std::process::exit(2);
    }
    let root = Path::new(&args[1]);
    let lib = Library::open(root)?;
    let (mut p, i) = lib.import_map(Path::new(&args[2]), None)?;
    p.provenance.description="Local QA import of an owner-installed MCC map. Not redistributed. Not the Zombie Apocalypse acceptance test.".into();
    lib.save(&p, Some(&i))?;
    if let Some(invader) = args.get(3) {
        lib.set_setting("preferences",&serde_json::json!({"invaderDirectory":std::fs::canonicalize(invader)?,"autoBuild":false}))?;
    }
    println!(
        "project={} tags={} objects={} vertices={}",
        p.id,
        i.tags.len(),
        p.scene.len(),
        i.mesh.positions.len() / 3
    );
    println!("source_sha256={}", maps::hash_file(Path::new(&args[2]))?);
    let _ = project::PROJECT_VERSION;
    Ok(())
}
