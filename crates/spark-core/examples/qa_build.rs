use spark_core::{
    build::{self, JobEvent, Toolchain},
    library::Library,
};
use std::{
    fs::OpenOptions,
    io::Write,
    path::Path,
    sync::{atomic::AtomicBool, Arc, Mutex},
};
fn main() -> spark_core::Result<()> {
    let a: Vec<String> = std::env::args().collect();
    if a.len() < 4 {
        eprintln!("Usage: qa_build <isolated data dir> <owned map> <Invader dir>");
        std::process::exit(2)
    }
    let root = std::fs::canonicalize({
        std::fs::create_dir_all(&a[1])?;
        &a[1]
    })?;
    let lib = Library::open(&root)?;
    let resources = a.get(4).map(std::fs::canonicalize).transpose()?;
    let (p, i) = lib.import_map(Path::new(&a[2]), resources.as_deref())?;
    let tools = Toolchain {
        invader_directory: Some(std::fs::canonicalize(&a[3])?),
        resource_directory: resources,
        ..Default::default()
    };
    let id = uuid::Uuid::new_v4().to_string();
    let log = Mutex::new(
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(root.join("adapter-test.jsonl"))?,
    );
    let last = Mutex::new(String::new());
    let record = build::run_build(
        &p,
        &i,
        &tools,
        &root.join("jobs"),
        &id,
        Arc::new(AtomicBool::new(false)),
        |event: JobEvent| {
            let mut phase = last.lock().unwrap();
            if *phase != event.phase {
                println!("{} {}%", event.phase, event.progress);
                *phase = event.phase.clone();
            }
            if event.severity == "error" {
                println!("{}", event.message);
            }
            writeln!(
                log.lock().unwrap(),
                "{}",
                serde_json::to_string(&event).unwrap()
            )
            .ok();
        },
    )?;
    println!("{}", serde_json::to_string_pretty(&record)?);
    if record.status != "validated" {
        std::process::exit(1)
    }
    Ok(())
}
