//! Opt-in exact owned MCC map/bank audio audit; no game is launched.
use spark_core::{audio, looping_audio, maps, mcc_audio};
use std::{fs, path::PathBuf};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 3 {
        return Err(
            "qa_mcc_audio <owned-MCC.map> <installed-halo1/sound/pc> <fresh-output>".into(),
        );
    }
    let map = PathBuf::from(&args[0]);
    let directory = fs::canonicalize(&args[1])?;
    let output = PathBuf::from(&args[2]);
    fs::create_dir(&output)?;
    let inspection = maps::inspect_map(&map, None)?;
    if inspection.header.version != 13 {
        return Err("An actual MCC cache is required".into());
    }
    let binding = mcc_audio::pin_mcc(&directory)?;
    let tag = inspection
        .tags
        .iter()
        .find(|tag| tag.class == "lsnd" && tag.path.ends_with("vehicles\\warthog_7_engine"))
        .ok_or("Real Warthog looping tag absent")?;
    let looping = looping_audio::inspect(&map, &inspection.sha256, tag.id)?;
    let mut results = vec![];
    for track in &looping.tracks {
        for (phase, id) in [
            ("start", track.start_tag_id),
            ("loop", track.loop_tag_id),
            ("end", track.end_tag_id),
        ] {
            let Some(id) = id else { continue };
            let report = audio::inspect_sound_with_bindings(
                &map,
                &inspection.sha256,
                id,
                None,
                Some(&binding),
            )?;
            fs::write(
                output.join(format!("track-{}-{phase}.json", track.index)),
                serde_json::to_vec_pretty(&report)?,
            )?;
            if report.permutations.iter().any(|sample|!sample.available) {
                return Err(format!("Track {} {phase}: an authored permutation is unavailable: {:?}",track.index,report.permutations.iter().find(|sample|!sample.available).and_then(|sample|sample.reason.as_ref())).into());
            }
            let sample = report
                .permutations
                .iter()
                .find(|p| p.available && p.chain_start)
                .ok_or_else(|| {
                    format!(
                        "Track {} {phase}: {:?}",
                        track.index,
                        report.permutations.first().and_then(|p| p.reason.as_ref())
                    )
                })?;
            let preview = audio::preview_sound_with_bindings(
                &map,
                &inspection.sha256,
                id,
                sample.pitch_range,
                sample.permutation,
                None,
                Some(&binding),
            )?;
            fs::write(
                output.join(format!("track-{}-{phase}.wav", track.index)),
                &preview.bytes,
            )?;
            results.push(serde_json::json!({"track":track.index,"phase":phase,"tagId":id,"availablePermutations":report.permutations.iter().filter(|p|p.available).count(),"sampleSha256":sample.sha256,"previewSha256":preview.sha256,"durationSeconds":sample.duration_seconds,"channels":sample.channels,"sampleRate":sample.sample_rate}));
        }
    }
    if maps::hash_file(&map)? != inspection.sha256 {
        return Err("Source map changed".into());
    }
    let receipt = serde_json::json!({"schemaVersion":1,"sourceSha256":inspection.sha256,"binding":binding,"loopingTagId":tag.id,"tracks":looping.tracks.len(),"results":results,"sourceUnchanged":true,"gameLaunched":false,"gameMemoryTouched":false});
    fs::write(
        output.join("verification.json"),
        serde_json::to_vec_pretty(&receipt)?,
    )?;
    println!("{}", serde_json::to_string(&receipt)?);
    Ok(())
}
