//! Read-only owner-selected installation inventory and comparable warm repeat.
use spark_core::{megaworld,project,Result};
use std::{fs,path::PathBuf};
fn main()->Result<()>{
    let args=std::env::args().skip(1).collect::<Vec<_>>();
    if args.len()!=2{return spark_core::invalid("qa_megaworld_atlas <owned-roots.json> <fresh-output-folder>");}
    let roots:Vec<(PathBuf,String)>=serde_json::from_slice(&fs::read(&args[0])?)?;
    let out=PathBuf::from(&args[1]);fs::create_dir(&out)?;let mut inputs=vec![];
    for (root,runtime) in roots{spark_core::reject_links(&root)?;for item in fs::read_dir(root)?{let file=item?.path();if file.extension().is_some_and(|e|e.eq_ignore_ascii_case("map"))&&!file.file_stem().is_some_and(|n|["bitmaps","sounds","loc","ui"].iter().any(|s|n.eq_ignore_ascii_case(s))){inputs.push((file,runtime.clone()));}}}
    inputs.sort();let cold=megaworld::inventory(&inputs,None)?;project::atomic_write(&out.join("atlas-cold.json"),&serde_json::to_vec_pretty(&cold)?,false)?;
    let warm=megaworld::inventory(&inputs,Some(&cold))?;project::atomic_write(&out.join("atlas-warm.json"),&serde_json::to_vec_pretty(&warm)?,false)?;
    println!("{} cache entries; {} unique source regions; {} failures; initial {} ms / repeat {} ms",warm.caches.len(),warm.regions.len(),warm.caches.iter().filter(|m|m.error.is_some()).count(),cold.elapsed_ms,warm.elapsed_ms);Ok(())
}
