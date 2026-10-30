//! Read-only looping-track inventory from an owned map. No bytes exported or game launched.
use spark_core::{audio, looping_audio, maps, Result};
use std::path::Path;
fn main() -> Result<()> {
    let file = std::env::args()
        .nth(1)
        .ok_or_else(|| spark_core::SparkError::Invalid("Provide an owned map path".into()))?;
    let file = Path::new(&file);
    let map = maps::inspect_map(file, file.parent())?;
    let mut reports = vec![];
    for tag in map.tags.iter().filter(|tag| tag.class == "lsnd").take(128) {
        let report = looping_audio::inspect(file, &map.sha256, tag.id)?;
        let mut phases = vec![];
        for track in &report.tracks {
            for (kind, id) in [
                ("start", track.start_tag_id),
                ("loop", track.loop_tag_id),
                ("end", track.end_tag_id),
            ] {
                if let Some(id) = id {
                    let sound = audio::inspect_sound(file, &map.sha256, id)?;
                    phases.push(serde_json::json!({"track":track.index,"phase":kind,"tagId":id,"path":sound.tag_path,"permutations":sound.permutations}));
                }
            }
        }
        reports.push(serde_json::json!({"metadata":report,"phases":phases}));
    }
    println!(
        "{}",
        serde_json::to_string_pretty(
            &serde_json::json!({"sourceSha256":map.sha256,"loops":reports})
        )?
    );
    Ok(())
}
