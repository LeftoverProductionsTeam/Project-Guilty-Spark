//! Read-only source audio metadata probe. No bytes are exported or played.
use spark_core::{audio, maps};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let path =
        std::path::PathBuf::from(args.next().ok_or("usage: audio_probe <map> <hex-tag-id>")?);
    let id = u32::from_str_radix(
        args.next()
            .ok_or("missing hex tag ID")?
            .trim_start_matches("0x"),
        16,
    )?;
    let hash = maps::hash_file(&path)?;
    println!(
        "{}",
        serde_json::to_string_pretty(&audio::inspect_sound(&path, &hash, id)?)?
    );
    Ok(())
}
