//! Owner-run native pipeline acceptance of a saved source project and its edits.
use spark_core::{
    build::{self, Toolchain},
    library::Library,
    maps, project,
};
use std::{
    fs,
    path::Path,
    sync::{atomic::AtomicBool, Arc},
};
fn main() -> spark_core::Result<()> {
    let a: Vec<_> = std::env::args().collect();
    if a.len() != 7 {
        eprintln!("qa_build_project <data root> <saved project> <Invader> <H1A kit> <SDK tags> <result JSON>");
        std::process::exit(2);
    }
    let root = fs::canonicalize(&a[1])?;
    let lib = Library::open(&root)?;
    let mut p = project::load_project(Path::new(&a[2]))?;
    let source = p.source.as_ref().unwrap();
    let i = maps::inspect_map(&source.preserved_path, source.resource_directory.as_deref())?;
    lib.save(&p, Some(&i))?;
    let tools = Toolchain {
        invader_directory: Some(fs::canonicalize(&a[3])?),
        h1a_directory: Some(fs::canonicalize(&a[4])?),
        base_tags_directory: Some(fs::canonicalize(&a[5])?),
        ..Default::default()
    };
    let job = uuid::Uuid::new_v4().to_string();
    let events = root.join("jobs").join(&job).join("qa-events.jsonl");
    let record = build::run_build(
        &p,
        &i,
        &tools,
        &root.join("jobs"),
        &job,
        Arc::new(AtomicBool::new(false)),
        |e| {
            use std::io::Write;
            if let Ok(mut file) = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&events)
            {
                let _ = writeln!(file, "{}", serde_json::to_string(&e).unwrap_or_default());
            }
            if e.severity == "error"
                || e.phase == "validated"
                || matches!(
                    e.phase.as_str(),
                    "bsp-structure" | "bsp-lightmaps" | "bsp-clearance"
                )
            {
                eprintln!("{} {}", e.phase, e.message);
            }
        },
    )?;
    fs::write(&a[6], serde_json::to_vec_pretty(&record)?)?;
    if record.status != "validated" {
        eprintln!("{}", record.message);
        std::process::exit(1);
    }
    p.builds.push(record.clone());
    lib.save(&p, Some(&i))?;
    project::save_project(Path::new(&a[2]), &p)?;
    println!("{}", serde_json::to_string_pretty(&record)?);
    Ok(())
}
