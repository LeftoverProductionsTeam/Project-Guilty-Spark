//! Explicit owner-run native acceptance. Arguments are private local project and
//! tool inputs; this example never discovers/downloads assets or launches Halo.
use spark_core::{maps, project, working_tags};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{atomic::AtomicBool, Arc},
};

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, Box<dyn std::error::Error>> {
    spark_core::reject_links(path)?;
    if fs::metadata(path)?.len() > 4 * 1024 * 1024 {
        return Err("QA input exceeds 4 MiB".into());
    }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() != 8 {
        return Err("Usage: qa_working_tags <private-project.gsproject> <working-input.json> <owned-jobs-root> <new-job-uuid> <expected-spawn-x> <expected-spawn-y> <expected-spawn-z> <private-report.json>".into());
    }
    let project = project::load_project(Path::new(&args[0]))?;
    let input: working_tags::WorkingTagsInput = read_json(Path::new(&args[1]))?;
    let expected: [f32; 3] = [args[4].parse()?, args[5].parse()?, args[6].parse()?];
    if expected.iter().any(|v| !v.is_finite()) {
        return Err("Expected native spawn must be finite".into());
    }
    let parent_path = input
        .parent_build
        .output
        .as_ref()
        .ok_or("Parent output missing")?;
    let parent = maps::inspect_map(parent_path, None)?;
    let old_spawn = parent
        .objects
        .iter()
        .find(|o| o.id == "spawn-0")
        .ok_or("Parent has no first native player start")?
        .position;
    if old_spawn
        .iter()
        .zip(expected)
        .all(|(a, b)| (*a - b).abs() < 0.00001)
    {
        return Err(
            "Acceptance requires a genuine source edit that differs from the parent cache".into(),
        );
    }
    let source_scenario = input
        .tags_directory
        .join(spark_core::safe_relative(&format!(
            "{}.scenario",
            input.scenario_path
        ))?);
    let source_before = maps::hash_file(&source_scenario)?;
    let parent_before = maps::hash_file(parent_path)?;
    let started = std::time::Instant::now();
    let record = working_tags::run_build_from_tags(
        &project,
        &input,
        Path::new(&args[2]),
        &args[3],
        Arc::new(AtomicBool::new(false)),
        |event| {
            println!("{} {}% {}", event.phase, event.progress, event.message);
        },
    )?;
    if record.status != "validated" {
        return Err(format!("Native working-tag build failed: {}", record.message).into());
    }
    let output = record
        .output
        .as_ref()
        .ok_or("Validated record has no output")?;
    let rebuilt = maps::inspect_map(output, None)?;
    let actual = rebuilt
        .objects
        .iter()
        .find(|o| o.id == "spawn-0")
        .ok_or("Rebuilt cache lost first player start")?
        .position;
    if actual
        .iter()
        .zip(expected)
        .any(|(a, b)| (*a - b).abs() > 0.00001)
    {
        return Err(format!(
            "Native source edit did not survive: expected {expected:?}, got {actual:?}"
        )
        .into());
    }
    if rebuilt.header.scenario_type != parent.header.scenario_type {
        return Err("Native scenario type changed".into());
    }
    let source_after = maps::hash_file(&source_scenario)?;
    let parent_after = maps::hash_file(parent_path)?;
    if source_before != source_after || parent_before != parent_after {
        return Err("Native build changed parent cache or editable input source".into());
    }
    let receipt_path = PathBuf::from(&args[2])
        .join(&args[3])
        .join("working-tags-receipt.json");
    let receipt: working_tags::WorkingTagsReceipt = read_json(&receipt_path)?;
    let report = serde_json::json!({
        "schemaVersion":1,"result":"native-compiler-and-field-readback-accepted","gameplay":"not-run","elapsedMs":started.elapsed().as_millis(),
        "projectId":project.id,"projectFingerprint":project.fingerprint()?,"parentBuildId":input.parent_build.id,
        "parentSha256Before":parent_before,"parentSha256After":parent_after,"sourceScenarioSha256Before":source_before,"sourceScenarioSha256After":source_after,
        "field":"player_starting_locations[0].position","parentValue":old_spawn,"expectedValue":expected,"compiledValue":actual,
        "scenarioType":rebuilt.header.scenario_type,"scenarioPath":rebuilt.scenario_path,"cacheVersion":rebuilt.header.version,
        "tags":rebuilt.tags.len(),"collisionTriangles":rebuilt.mesh.indices.len()/3,"build":record,"provenance":receipt,
    });
    project::atomic_write(
        Path::new(&args[7]),
        &serde_json::to_vec_pretty(&report)?,
        false,
    )?;
    println!("Native working-tag field readback accepted; report saved. No game launch or gameplay acceptance.");
    Ok(())
}
