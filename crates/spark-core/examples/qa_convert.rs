//! Owner-run real MCC conversion acceptance. No SDK/game content is bundled.
use spark_core::{
    build::{self, Toolchain},
    library::Library,
};
use std::{
    fs::OpenOptions,
    io::Write,
    path::Path,
    sync::{atomic::AtomicBool, Arc,Mutex},
};
fn main() -> spark_core::Result<()> {
    let a: Vec<_> = std::env::args().collect();
    if a.len() < 6 {
        eprintln!("qa_convert <fresh data root> <owned map> <Invader> <H1A kit> <SDK tags> [original resources] [zombie-recovery]");
        std::process::exit(2);
    }
    std::fs::create_dir_all(&a[1])?;
    let root = std::fs::canonicalize(&a[1])?;
    let events=Mutex::new(OpenOptions::new().write(true).create_new(true).open(root.join("qa-events.jsonl"))?);
    let lib = Library::open(&root)?;
    let resources = a.get(6).filter(|s| s.as_str() != "-").map(|p| Path::new(p));
    let (mut p, i) = lib.import_map(Path::new(&a[2]), resources)?;
    if a.get(7).map(String::as_str) == Some("zombie-recovery") {
        p.conversion_profile = Some("zombie-recovery".into());
        lib.save(&p, Some(&i))?;
    }
    let tools = Toolchain {
        invader_directory: Some(std::fs::canonicalize(&a[3])?),
        h1a_directory: Some(std::fs::canonicalize(&a[4])?),
        base_tags_directory: Some(std::fs::canonicalize(&a[5])?),
        resource_directory: resources.map(Path::to_path_buf),
    };
    let id = uuid::Uuid::new_v4().to_string();
    let record = build::run_build(
        &p,
        &i,
        &tools,
        &root.join("jobs"),
        &id,
        Arc::new(AtomicBool::new(false)),
        |e| {
            if let Ok(mut file)=events.lock(){if let Err(reason)=writeln!(file,"{}",serde_json::to_string(&e).unwrap_or_default()){eprintln!("Failed to retain native QA diagnostics: {reason}");}}
            if e.severity == "error" || e.phase == "validated" {
                eprintln!("{}: {}", e.phase, e.message);
            }
        },
    )?;
    println!("{}", serde_json::to_string_pretty(&record)?);
    if record.status != "validated" {
        std::process::exit(1);
    }
    Ok(())
}
