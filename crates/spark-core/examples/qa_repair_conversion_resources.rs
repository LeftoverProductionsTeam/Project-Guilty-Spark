//! Owner-selected classic sources -> separate repaired SDK; no game/native compiler launch.
use spark_core::{conversion_resources as repair, maps};
use std::{path::Path, sync::atomic::AtomicBool};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 4 {
        return Err("qa_repair_conversion_resources <owned-CE-map> <SDK-tags> <matching-classic-tags> <fresh-output>".into());
    }
    let inspection = maps::inspect_map(Path::new(&args[0]), None)?;
    if inspection.header.version != 609 {
        return Err("This acceptance expects a classic CE cache".into());
    }
    let audit = repair::audit(&inspection.tags, Path::new(&args[1]))?;
    eprintln!("{}", serde_json::to_string(&audit)?);
    let plan = repair::review(
        &inspection.sha256,
        Path::new(&args[1]),
        Path::new(&args[2]),
        &audit,
    )?;
    let receipt = repair::create(
        &plan,
        Path::new(&args[3]),
        &AtomicBool::new(false),
        |done, total, bytes, _| {
            if done == 0 || done == total || done % 1000 == 0 {
                eprintln!("{done}/{total} SDK tags copied · {} MiB", bytes / 1048576);
            }
        },
    )?;
    if maps::hash_file(Path::new(&args[0]))? != inspection.sha256 {
        return Err("Original map changed".into());
    }
    println!("{}", serde_json::to_string_pretty(&receipt)?);
    Ok(())
}
