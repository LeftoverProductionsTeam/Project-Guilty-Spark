//! Bounded, opt-in roundtrip of an owned JMA through Spark's production parser/exporter.
use spark_core::{animations, maps};
use std::{fs, io::Write, path::PathBuf};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 3 || args[1].len() != 64 || !args[1].bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("qa_animation_source <owned.jma> <exact-sha256> <new.jma>".into());
    }
    let source = PathBuf::from(&args[0]);
    let meta = fs::symlink_metadata(&source)?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > animations::MAX_SOURCE_BYTES {
        return Err("Expected bounded owned animation source".into());
    }
    let expected = args[1].to_ascii_lowercase();
    if maps::hash_file(&source)? != expected { return Err("Animation source identity differs".into()); }
    let text = fs::read_to_string(&source)?;
    let clip = animations::parse_jma(&text, "stand idle")?;
    let output = animations::jma_source(&clip)?;
    if maps::hash_file(&source)? != expected { return Err("Animation source changed during roundtrip".into()); }
    spark_core::reject_links(std::path::Path::new(&args[2]))?;
    fs::OpenOptions::new().write(true).create_new(true).open(&args[2])?.write_all(output.as_bytes())?;
    println!("{}", serde_json::to_string(&serde_json::json!({
        "sourceSha256": expected, "outputSha256": maps::hash_file(std::path::Path::new(&args[2]))?,
        "nodes": clip.nodes, "frames": clip.frame_count, "fps": clip.fps,
        "sourceUnchanged": true, "nativeCompilerExecuted": false
    }))?);
    Ok(())
}
