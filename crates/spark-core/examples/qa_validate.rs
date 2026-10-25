use spark_core::{
    build::{self, Toolchain},
    library::Library,
};
use std::path::Path;
fn main() -> spark_core::Result<()> {
    let a: Vec<String> = std::env::args().collect();
    if a.len() != 4 {
        eprintln!("Usage: qa_validate <isolated data dir> <owned MCC map> <Invader dir>");
        std::process::exit(2)
    }
    std::fs::create_dir_all(&a[1])?;
    let root = std::fs::canonicalize(&a[1])?;
    let lib = Library::open(&root)?;
    let (p, i) = lib.import_map(Path::new(&a[2]), None)?;
    let tools = Toolchain {
        invader_directory: Some(std::fs::canonicalize(&a[3])?),
        resource_directory: None,
    };
    let id = uuid::Uuid::new_v4().to_string();
    let record = build::validate_existing_mcc(
        &p,
        &i,
        &tools,
        &root.join("jobs"),
        &id,
        std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        |e| println!("{}: {}", e.phase, e.message),
    )?;
    println!("{}", serde_json::to_string_pretty(&record)?);
    Ok(())
}
