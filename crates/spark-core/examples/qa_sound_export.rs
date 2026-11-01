//! Opt-in export of complete, verified owned sound permutations for native QA.
//! Does not modify tags, resample, launch a tool/game or claim listening acceptance.
use spark_core::{audio, maps};
use std::{collections::BTreeSet, fs, io::Write, path::PathBuf};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if !(4..=19).contains(&args.len())
        || args[1].len() != 64
        || !args[1].bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err("qa_sound_export <owned.map> <exact-sha256> <fresh-output> <tag-path> [up to 16]".into());
    }
    let map = PathBuf::from(&args[0]);
    let expected = args[1].to_ascii_lowercase();
    let inspection = maps::inspect_map(&map, None)?;
    if inspection.sha256 != expected {
        return Err("Owned source identity differs; no output was created".into());
    }
    let normalize = |s: &str| s.replace('\\', "/").to_ascii_lowercase();
    let mut names = BTreeSet::new();
    let mut tags = Vec::new();
    for requested in &args[3..] {
        let name = normalize(requested);
        if !names.insert(name.clone()) {
            return Err("Duplicate requested sound path".into());
        }
        let matches: Vec<_> = inspection.tags.iter()
            .filter(|tag| tag.class == "snd!" && normalize(&tag.path) == name).collect();
        if matches.len() != 1 {
            return Err(format!("Expected one real source sound: {requested}").into());
        }
        tags.push(matches[0]);
    }
    let output = PathBuf::from(&args[2]);
    spark_core::reject_links(&output)?;
    fs::create_dir(&output)?;
    let mut results = Vec::new();
    let mut total_bytes = 0usize;
    for (index, tag) in tags.into_iter().enumerate() {
        let sound = audio::inspect_sound(&map, &expected, tag.id)?;
        if sound.permutations.is_empty() || sound.permutations.iter().any(|p| !p.available) {
            fs::OpenOptions::new().write(true).create_new(true)
                .open(output.join(format!("refused-sound-{index}.json")))?
                .write_all(&serde_json::to_vec_pretty(&sound)?)?;
            let reason = sound.permutations.iter().find_map(|p| p.reason.as_deref()).unwrap_or("No permutations");
            return Err(format!("Incomplete source sound: {}: {reason}", tag.path).into());
        }
        let mut exports = Vec::new();
        let requests: Vec<_> = sound.permutations.iter().map(|p| (p.pitch_range, p.permutation)).collect();
        // Native long sounds can contain many linked chunks. Bound each batch
        // and keep all chunks; the complete source is validated on every batch.
        let mut previews = Vec::new();
        for batch in requests.chunks(256) {
            previews.extend(audio::preview_sound_batch(&map, &expected, tag.id, batch)?);
        }
        for (item, preview) in sound.permutations.iter().zip(previews) {
            total_bytes = total_bytes.checked_add(preview.bytes.len()).ok_or("Export size overflow")?;
            if total_bytes > 256 * 1024 * 1024 {
                return Err("Sound export batch exceeds 256 MiB".into());
            }
            let extension = match preview.mime.as_str() {
                "audio/ogg" => "ogg",
                "audio/wav" => "wav",
                _ => return Err("Unsupported verified sound output".into()),
            };
            let file = format!("sound-{index}-pitch-{}-permutation-{}.{}", item.pitch_range, item.permutation, extension);
            let mut destination = fs::OpenOptions::new().write(true).create_new(true).open(output.join(&file))?;
            destination.write_all(&preview.bytes)?;
            exports.push(serde_json::json!({"file": file, "bytes":preview.bytes.len(), "sha256":preview.sha256,
                "sourceSampleSha256":preview.source_sample_sha256, "pitchRange":item.pitch_range,
                "permutation":item.permutation, "chainStart":item.chain_start, "nextPermutation":item.next_permutation,
                "name":item.name,"channels":item.channels,"sampleRate":item.sample_rate,"durationSeconds":item.duration_seconds}));
        }
        results.push(serde_json::json!({"tagId":tag.id,"path":tag.path,"inspection":sound,"exports":exports}));
    }
    if maps::hash_file(&map)? != expected {
        return Err("Owned source changed during export".into());
    }
    let receipt = serde_json::json!({"schemaVersion":1,"sourceSha256":expected,"sourceUnchanged":true,
        "results":results,"gameLaunched":false,"resampled":false,"playbackAccepted":false,
        "boundary":"Each linked permutation is exported separately; its chain index is preserved in metadata. Ogg validation does not claim compressed packets have been decoded."});
    fs::OpenOptions::new().write(true).create_new(true).open(output.join("sound-export.json"))?
        .write_all(&serde_json::to_vec_pretty(&receipt)?)?;
    println!("{}", serde_json::to_string(&receipt)?);
    Ok(())
}
