
use crate::{
    build::{self, JobEvent, Runner, Toolchain}, invalid,
    maps::{self, MapInspection}, project::{self, BuildRecord, Project},
    storage::{Category, Store}, Result, SparkError,
};
use serde_json::Value;
use std::{fs, path::{Path, PathBuf}, sync::atomic::{AtomicBool, Ordering}};

const MIB: u64 = 1024 * 1024;
const KIT_SHA256: &str = "c492789e96dbe845891e0c0973bfb526a21230f570559e6f9fb695b8d2ca0afa";

pub fn selected(project: &Project) -> bool {
    project.shape_draft.as_ref().is_some_and(|draft| draft.vehicle_mount.is_some())
}

pub struct Tools {
    node: PathBuf,
    blender: PathBuf,
    kit: PathBuf,
    invader: PathBuf,
    identities: Vec<(PathBuf, String)>,
}

fn missing(message: &str) -> SparkError {
    SparkError::Invalid(message.into())
}

pub fn prepare(project: &Project, inspection: &MapInspection, toolchain: &Toolchain, node: &Path, blender: &Path) -> Result<Tools> {
    project.validate()?;
    project::validate_edits(project, inspection)?;
    let source = project.source.as_ref().ok_or_else(|| missing("Open the preserved MCC map that owns the vehicle"))?;
    if source.cache_version != 13 || inspection.header.scenario_type != 1 || inspection.sha256 != source.sha256
        || fs::metadata(&source.preserved_path)?.len() > 256 * MIB
    {
        return invalid("Vehicle attachment builds require a preserved MCC multiplayer map within 256 MiB");
    }
    if !project.tag_edits.is_empty() || !project.assets.is_empty() || !project.powerups.is_empty()
        || project.bsp_assembly.is_some() || project.native_lighting.is_some() || project.firefight.is_some()
        || project.conversion_profile.as_deref().is_some_and(|profile| profile != "faithful")
        || !project.animation_assignments.is_empty() || !project.tag_duplicates.is_empty()
        || !project.tag_renames.is_empty() || !project.native_asset_imports.is_empty()
        || !crate::native_audio::fingerprint_inputs(project).is_empty()
        || serde_json::to_value(&project.scene)? != serde_json::to_value(&inspection.objects)?
    {
        return invalid("Build the other native edits and open their compiled map before attaching a plow. The attachment build preserves the selected cache’s existing tags and placements.");
    }
    if project.active_build_target.as_ref().is_some_and(|id| !project.build_targets.iter().any(|target| {
        &target.id == id && target.runtime_id == crate::runtime::RuntimeId::MccSteam
    })) {
        return invalid("Select the MCC build target for this vehicle attachment");
    }
    let kit = crate::conversion::native_tool(toolchain)
        .ok_or_else(|| missing("Prepare the installed Halo CE Editing Kit for MCC in Build"))?;
    let invader = toolchain.invader_directory.clone().ok_or_else(|| missing("Connect Invader under Games & tools"))?;
    let mut inputs = vec![kit.clone(), node.to_owned(), blender.to_owned()];
    for name in ["invader-extract", "invader-info", "invader-edit", "invader-bitmap", "invader-recover"] {
        inputs.push(build::tool_path(toolchain, name).ok_or_else(|| missing(&format!("{name} is required for vehicle attachment builds")))?);
    }
    let identities = inputs.into_iter().map(|path| {
        crate::reject_links(&path)?;
        if !path.is_absolute() || !path.is_file() { return invalid("Choose installed physical tool binaries"); }
        Ok((path.clone(), maps::hash_file(&path)?))
    }).collect::<Result<Vec<_>>>()?;
    if identities[0].1 != KIT_SHA256 {
        return invalid("This attachment build requires the verified Halo CE Editing Kit compiler for MCC");
    }
    Ok(Tools { node: node.into(), blender: blender.into(), kit, invader, identities })
}

fn physical_arg(path: &Path) -> Result<String> {
    let path = path.to_str().ok_or_else(|| missing("Native attachment inputs need valid Unicode paths"))?;
    Ok(path.strip_prefix(r"\\?\").unwrap_or(path).to_owned())
}

pub fn run(
    project: &Project, inspection: &MapInspection, tools: &Tools, jobs: &Path, id: &str,
    cancel: &AtomicBool, event: &(dyn Fn(JobEvent) + Send + Sync),
) -> Result<BuildRecord> {
    let source = project.source.as_ref().ok_or_else(|| missing("The vehicle’s preserved source is missing"))?;
    let draft = project.shape_draft.as_ref().filter(|draft| draft.vehicle_mount.is_some())
        .ok_or_else(|| missing("Apply and save a reviewed vehicle mount before building"))?;
    let runner = Runner { id, project: &project.id, cancel, event };
    let bytes = fs::metadata(&source.preserved_path)?.len();
    // Halo Tool opens nested classic tag paths through a legacy file API.
    // Use a short physical scratch path while charging the normal app ledger.
    let suffix = id.get(..12).ok_or_else(|| missing("Invalid attachment job identity"))?;
    let work = std::env::temp_dir().join(format!("gs-va-{suffix}"));
    let out = jobs.join(id);
    let store = Store::for_output(&out)?;
    let lease = store.reserve(&work, Some(&source.preserved_path), 6 * bytes + 96 * MIB, Category::Staging, "Vehicle attachment native work")?;
    fs::create_dir_all(&work)?;
    lease.mark_owned()?;
    let mut terminal = true;
    let result = (|| {
        let worker = work.join("worker");
        fs::create_dir(&worker)?;
        for (file, contents) in [
            ("scripts/native-warthog-worker.mjs", include_str!("../../../scripts/native-warthog-worker.mjs")),
            ("scripts/native-warthog-build.mjs", include_str!("../../../scripts/native-warthog-build.mjs")),
            ("scripts/native-rigid-part-material.mjs", include_str!("../../../scripts/native-rigid-part-material.mjs")),
            ("scripts/native-rigid-part-collision.mjs", include_str!("../../../scripts/native-rigid-part-collision.mjs")),
            ("scripts/vehicle-collision-union.py", include_str!("../../../scripts/vehicle-collision-union.py")),
            ("src/plowMesh.ts", include_str!("../../../src/plowMesh.ts")),
            ("src/haloRiggedJms.ts", include_str!("../../../src/haloRiggedJms.ts")),
            ("src/haloJms.ts", include_str!("../../../src/haloJms.ts")),
            ("src/haloInterchangePrecision.ts", include_str!("../../../src/haloInterchangePrecision.ts")),
            ("src/meshAssembly.ts", include_str!("../../../src/meshAssembly.ts")),
        ] {
            let output = worker.join(file);
            fs::create_dir_all(output.parent().unwrap())?;
            project::atomic_write(&output, contents.as_bytes(), false)?;
        }
        let saved = work.join("project.gsproject");
        project::save_project(&saved, project)?;
        let project_sha256 = maps::hash_file(&saved)?;
        for (file, expected) in &tools.identities {
            if maps::hash_file(file)? != *expected { return invalid("An attachment build tool changed after preflight"); }
        }
        let mut args = vec!["worker/scripts/native-warthog-worker.mjs".into()];
        for path in [&source.preserved_path, &tools.kit, &tools.invader, &tools.blender, &saved] {
            args.push(physical_arg(path)?);
        }
        terminal = false;
        let result = runner.run_managed(&tools.node, &args, &work, "vehicle-attachment", 25, Some(&store))?;
        let line = result.lines().rev().find_map(|line| line.strip_prefix("SPARK_ATTACHMENT "))
            .ok_or_else(|| missing("The attachment worker did not return a verified completion"))?;
        terminal = true;
        let result: Value = serde_json::from_str(line)?;
        if let Some(message) = result["error"].as_str() { return invalid(message); }
        let receipt = &result["receipt"];
        let cache = &receipt["privateMap"];
        let built = work.join("attachment.map");
        let output_sha256 = maps::hash_file(&built)?;
        let draft_id = draft.id.to_string();
        if receipt["mapSha256"].as_str() != Some(source.sha256.as_str())
            || receipt["shapeDraft"]["id"].as_str() != Some(draft_id.as_str())
            || receipt["shapeDraft"]["savedProjectSha256"].as_str() != Some(project_sha256.as_str())
        {
            return invalid("The attachment worker did not compile the exact saved source and draft");
        }
        // Node writes integral coordinates as JSON integers. Review the
        // decoded mount so 0 and 0.0 express the same authored position.
        let compiled_mount: Option<project::VehicleMount> = serde_json::from_value(receipt["shapeDraft"]["vehicleMount"].clone())?;
        if compiled_mount != draft.vehicle_mount {
            return invalid("The native receipt changed the reviewed vehicle or its mounting coordinates");
        }
        if cache["sha256"].as_str() != Some(output_sha256.as_str())
            || cache["crcMismatch"].as_u64() != Some(0)
            || cache["vehicleReferencesVerified"].as_bool() != Some(true)
            || !receipt["collision"]["warnings"].as_array().is_some_and(Vec::is_empty)
        {
            return invalid("The rebuilt attachment did not pass native cache, collision or dependency readback");
        }
        if !cache["scenario"].as_str().is_some_and(|scenario| scenario.eq_ignore_ascii_case(&inspection.scenario_path)) {
            return invalid("The attachment was compiled for a different scenario");
        }
        for (file, expected) in &tools.identities {
            if maps::hash_file(file)? != *expected { return invalid("An attachment build tool changed during compilation"); }
        }
        if cancel.load(Ordering::Relaxed) { return invalid("Vehicle attachment build was cancelled"); }
        let final_lease = store.reserve(&out, Some(&source.preserved_path), bytes.saturating_mul(2) + 16 * MIB, Category::Compiler, "Validated vehicle attachment cache")?;
        fs::create_dir_all(&out)?;
        final_lease.mark_owned()?;
        let scenario = crate::safe_relative(&inspection.scenario_path)?;
        let cache_directory = out.join("output");
        fs::create_dir(&cache_directory)?;
        let output = cache_directory.join(scenario.file_name().ok_or_else(|| missing("Invalid MCC scenario name"))?).with_extension("map");
        fs::copy(built, &output)?;
        if maps::hash_file(&output)? != output_sha256 { return invalid("Copied attachment cache differs from the verified output"); }
        let record = BuildRecord {
            id: id.into(), timestamp: chrono::Utc::now().to_rfc3339(), status: "validated".into(),
            target: "mcc-cea".into(), output: Some(output), sha256: Some(output_sha256),
            message: "Validated vehicle attachment. Launch the rebuilt map to check driving and blade contact.".into(),
            project_fingerprint: project.fingerprint()?,
        };
        project::atomic_write(&out.join("vehicle-attachment.json"), &serde_json::to_vec_pretty(receipt)?, false)?;
        project::atomic_write(&out.join("receipt.json"), &serde_json::to_vec_pretty(&record)?, false)?;
        final_lease.finish(true, Some(record.project_fingerprint.clone()))?;
        Ok(record)
    })();
    if terminal {
        if let Err(problem) = lease.finish_disposable() {
            runner.emit("storage", format!("Attachment scratch retained for verified cleanup: {problem}"), 98, "warning");
        }
    }
    if let Ok(record) = &result { runner.emit("validated", &record.message, 100, "success"); }
    result
}

