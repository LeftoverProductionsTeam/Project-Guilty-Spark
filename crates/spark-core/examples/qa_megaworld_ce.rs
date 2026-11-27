//! Real native CE609 or MCC13 assembly and extension acceptance. Player proof is separate.
use spark_core::{bsp_assembly::{self, BspAssembly},library::Library,project::{self,EngineBuildTarget,Project},runtime::{self, RuntimeId, RuntimeRegistration},Result,SparkError};
use std::{fs,io::Read,path::Path,sync::{Arc,atomic::AtomicBool}};

#[derive(serde::Deserialize)]
struct PlacementMove {
    id: String,
    from: [f32; 3],
    to: [f32; 3],
}

fn reviewed_plan(path: &Path, base: &mut Project) -> Result<(BspAssembly, Vec<BspAssembly>)> {
    let source = base.source.as_ref().ok_or_else(|| SparkError::Invalid("Missing base source".into()))?;
    spark_core::reject_links(path)?;
    if path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("json")) {
        let mut bytes = Vec::new();
        const MAX_REVIEW_BYTES: u64 = 4 * 1024 * 1024;
        fs::File::open(path)?.take(MAX_REVIEW_BYTES + 1).read_to_end(&mut bytes)?;
        if bytes.len() as u64 > MAX_REVIEW_BYTES {
            return spark_core::invalid("Reviewed seam receipt exceeds the size limit");
        }
        let receipt: serde_json::Value = serde_json::from_slice(&bytes)?;
        let base_name = source.original_path.file_name().and_then(|name| name.to_str());
        if receipt["schemaVersion"].as_u64() != Some(1) || !receipt["originalSources"].as_array().is_some_and(|originals| {
            originals.iter().any(|entry| entry["sha256"].as_str() == Some(&source.sha256)
                && entry["name"].as_str().zip(base_name).is_some_and(|(recorded, actual)| recorded.eq_ignore_ascii_case(actual)))
        }) {
            return spark_core::invalid("Reviewed seam receipt belongs to a different base cache");
        }
        let plan = receipt.pointer("/recipe/plan")
            .ok_or_else(|| SparkError::Invalid("Reviewed seam receipt has no authored plan".into()))?;
        let inherited = receipt.pointer("/recipe/inheritedConnections")
            .map(|value| serde_json::from_value(value.clone()))
            .transpose()?.unwrap_or_default();
        if let Some(transforms) = receipt.pointer("/recipe/basePlacementMoves") {
            let moves: Vec<PlacementMove> = serde_json::from_value(transforms.clone())?;
            let mut seen = std::collections::BTreeSet::new();
            for movement in moves {
                let id = movement.id;
                if !seen.insert(id.clone()) {
                    return spark_core::invalid("Reviewed placement move has a duplicate object ID");
                }
                let object = base.scene.iter_mut().find(|object| object.id == id)
                    .ok_or_else(|| SparkError::Invalid(format!("Reviewed placement {id} is missing")))?;
                if object.position != movement.from || !movement.to.iter().all(|value| value.is_finite()) {
                    return spark_core::invalid(format!("Reviewed placement {id} has an unexpected pose"));
                }
                object.position = movement.to;
            }
        }
        base.megaworld_layout = receipt.get("layout")
            .map(|value| serde_json::from_value(value.clone())).transpose()?;
        Ok((serde_json::from_value(plan.clone())?, inherited))
    } else {
        let prior = project::load_project(path)?;
        if prior.source.as_ref().map(|source| source.sha256.as_str()) != Some(&source.sha256) {
            return spark_core::invalid("Previous connection belongs to a different base cache");
        }
        let plan = prior.bsp_assembly.ok_or_else(|| SparkError::Invalid("Previous project has no connection".into()))?;
        base.megaworld_layout = prior.megaworld_layout;
        Ok((plan, prior.inherited_bsp_connections))
    }
}

fn retained_mode_receipt(directory: &Path, expected_sha256: &str) -> Result<()> {
    spark_core::reject_links(directory)?;
    let project_path = directory.join("compiled.gsproject");
    let acceptance = directory.join("acceptance.json");
    let map = directory.join("timberland.map");
    for input in [&project_path, &acceptance, &map] {
        spark_core::reject_links(input)?;
    }
    let receipt: serde_json::Value = serde_json::from_slice(&fs::read(acceptance)?)?;
    let build: project::BuildRecord = serde_json::from_value(receipt["build"].clone())?;
    let project = project::load_project(&project_path)?;
    if build.status != "validated" || build.target != "mcc-cea"
        || build.sha256.as_deref() != Some(expected_sha256)
        || project.fingerprint()? != build.project_fingerprint
    {
        return spark_core::invalid("Retained map, project and native validation receipt do not match");
    }
    let export = spark_core::build::MapExport {
        project_id: project.id.clone(),
        build_id: build.id,
        project_fingerprint: build.project_fingerprint,
        sha256: expected_sha256.to_owned(),
        bytes: fs::metadata(&map)?.len(),
        output: map,
        cache_version: 13,
        runtime_id: RuntimeId::MccSteam,
        reused: true,
    };
    let (path, mode) = spark_core::build::write_map_export_mode(&export, &project)?;
    println!("{}", serde_json::json!({"modeReceipt": path, "mode": mode, "cacheSha256": expected_sha256}));
    Ok(())
}

fn main()->Result<()>{
    let mut a=std::env::args().skip(1).collect::<Vec<_>>();
    if a.first().is_some_and(|arg| arg == "--retained-mode-receipt") {
        if a.len() != 3 {
            return spark_core::invalid("qa_megaworld_ce --retained-mode-receipt <checkpoint-directory> <map sha256>");
        }
        return retained_mode_receipt(Path::new(&a[1]), &a[2]);
    }
    let mcc = a.first().is_some_and(|arg| arg == "--mcc13");
    if mcc { a.remove(0); }
    let reviewed_runtime = if a.first().is_some_and(|arg| arg == "--reviewed-forerunner") {
        if !mcc || a.len() < 2 {
            return spark_core::invalid("A reviewed Forerunner registration requires an MCC13 replay");
        }
        a.remove(0);
        let file = a.remove(0);
        spark_core::reject_links(Path::new(&file))?;
        let mut bytes = Vec::new();
        const MAX_REGISTRATION_BYTES: u64 = 128 * 1024;
        fs::File::open(file)?.take(MAX_REGISTRATION_BYTES + 1).read_to_end(&mut bytes)?;
        if bytes.len() as u64 > MAX_REGISTRATION_BYTES {
            return spark_core::invalid("Reviewed Forerunner registration exceeds 128 KiB");
        }
        let registration: RuntimeRegistration = serde_json::from_slice(&bytes)?;
        runtime::inspect_registration(&registration)?;
        let review = registration.reviewed_companion
            .ok_or_else(|| SparkError::Invalid("The registration has no reviewed Forerunner capabilities".into()))?;
        spark_core::megaworld_build::GameplayLimits::for_review(&review)?;
        Some((registration.id, review))
    } else { None };
    let partition_structure = a.first().is_some_and(|arg| arg == "--partition-structure");
    let partition_scenario = a.first().is_some_and(|arg| arg == "--partition-scenario-probe");
    let partition_lighting = a.first().is_some_and(|arg| arg == "--partition-lighting-probe");
    if partition_structure || partition_scenario || partition_lighting { a.remove(0); }
    let regional_preset = if a.first().is_some_and(|arg| arg == "--regional-preset") {
        if a.len() < 2 { return spark_core::invalid("Missing regional connection preset"); }
        a.remove(0);
        let value = match a.remove(0).as_str() {
            "surface" => bsp_assembly::RegionalConnectionPreset::SurfaceLandBridge,
            "underground" => bsp_assembly::RegionalConnectionPreset::UndergroundTunnel,
            "underground-infantry" => bsp_assembly::RegionalConnectionPreset::UndergroundInfantryTunnel,
            _ => return spark_core::invalid("Choose surface, underground or underground-infantry"),
        };
        Some(value)
    } else { None };
    let donor_tags_override = if a.first().is_some_and(|arg| arg == "--donor-tags") {
        if a.len() < 2 { return spark_core::invalid("Missing reviewed donor tags path"); }
        a.remove(0);
        let path = a.remove(0);
        spark_core::reject_links(Path::new(&path))?;
        Some(fs::canonicalize(path)?)
    } else { None };
    let road_candidates = if a.first().is_some_and(|arg| arg == "--preserved-road-candidates") {
        if a.len() < 2 || !mcc || regional_preset.is_some() {
            return spark_core::invalid("Preserved-road candidates require a reviewed MCC13 plan");
        }
        a.remove(0);
        let path = a.remove(0);
        spark_core::reject_links(Path::new(&path))?;
        let mut bytes = Vec::new();
        fs::File::open(path)?.take(32 * 1024 + 1).read_to_end(&mut bytes)?;
        if bytes.len() > 32 * 1024 {
            return spark_core::invalid("Preserved-road candidate input exceeds its review budget");
        }
        let candidates: Vec<[[f64; 3]; 2]> = serde_json::from_slice(&bytes)?;
        if candidates.is_empty() || candidates.len() > 24 {
            return spark_core::invalid("Review between one and 24 proposed road landings");
        }
        Some(candidates)
    } else { None };
    if a.len()!=7{return spark_core::invalid("qa_megaworld_ce [--mcc13 [--reviewed-forerunner <registration.json>]] [--partition-structure | --partition-scenario-probe | --partition-lighting-probe] [--regional-preset <surface|underground|underground-infantry>] [--donor-tags <reviewed donor tags>] [--preserved-road-candidates <points.json>] <base CE.map> <donor CE.map> <reviewed CE tags, recover, or recover-known-stock> <H1A kit> <Invader> <fresh output> <previous project, reviewed JSON receipt, auto, or terrain>");}
    let out=Path::new(&a[5]);fs::create_dir(out)?;let lib=Library::open(&out.join("library"))?;
    let (mut p,i)=lib.import_map(Path::new(&a[0]),Path::new(&a[0]).parent())?;
    let (donor,j)=lib.import_map(Path::new(&a[1]),Path::new(&a[1]).parent())?;
    let recovered = matches!(a[2].as_str(), "recover" | "recover-known-stock");
    let recipe_path = Path::new(&a[6]);
    let mut reviewed = if matches!(a[6].as_str(), "auto" | "terrain") {
        None
    } else {
        let (plan, inherited_connections) = reviewed_plan(recipe_path, &mut p)?;
        p.inherited_bsp_connections = inherited_connections;
        let source = donor.source.as_ref().ok_or_else(|| SparkError::Invalid("Missing donor source".into()))?;
        if plan.donor_source.sha256 != source.sha256 || plan.donor_bsp_index != 0
            || plan.donor_source.resource_sha256 != source.resource_sha256 {
            return spark_core::invalid("Previous donor cache, BSP or resource banks differ from this native build");
        }
        plan.validate()?;
        Some(plan)
    };
    if let Some(candidates) = road_candidates {
        let plan = reviewed.as_mut().filter(|plan| plan.open_road && plan.preserve_donor_bsp
            && plan.atlas_from_region_id.is_some()).ok_or_else(|| SparkError::Invalid(
                "Candidates must retain both BSPs of a reviewed Atlas road".into()))?;
        let cancelled = AtomicBool::new(false);
        let mut accepted = None;
        let material_missing = !i.tags.iter().any(|tag| tag.class == "senv"
            && tag.path.replace('\\', "/").eq_ignore_ascii_case(&plan.tunnel_shader_path.replace('\\', "/")));
        for (index, points) in candidates.into_iter().enumerate() {
            plan.tunnel_points = points.to_vec();
            if material_missing {
                match bsp_assembly::retained_road_shader(&p, &i, plan) {
                    Ok(shader) => plan.tunnel_shader_path = shader,
                    Err(error) => {
                        eprintln!("Native connector material rejected road {}: {error}", index + 1);
                        continue;
                    }
                }
            }
            p.bsp_assembly = Some(plan.clone());
            match bsp_assembly::generate_preserved_connector(&p, &i, &cancelled) {
                Ok(_) => {
                    eprintln!("Native connector preview accepted road {} at {points:?}", index + 1);
                    project::atomic_write(&out.join("reviewed-road.json"), &serde_json::to_vec_pretty(&*plan)?, false)?;
                    accepted = Some(points);
                    break;
                }
                Err(error) => eprintln!("Native connector preview rejected road {} at {points:?}: {error}", index + 1),
            }
        }
        if accepted.is_none() { return spark_core::invalid("No proposed road passed the native connector preview"); }
    }
    // Use the existing source-bound extraction/receipts instead of copying an
    // SDK when verifying a joined pair of owner-installed original caches.
    let (tags, donor_tags) = if recovered {
        let inputs = out.join("source-inputs");
        fs::create_dir(&inputs)?;
        let tools = spark_core::build::Toolchain { invader_directory: Some(fs::canonicalize(&a[4])?), ..Default::default() };
        let recover = |project: &project::Project, inspection: &spark_core::maps::MapInspection, class: &str| -> Result<std::path::PathBuf> {
            let tag = inspection.tags.iter().find(|tag| tag.class == class)
                .ok_or_else(|| spark_core::SparkError::Invalid(format!("Original cache lacks {class}")))?;
            Ok(spark_core::tag_exchange::extract_selected_tag(project, inspection, &tools, &inputs, &uuid::Uuid::new_v4().to_string(), tag.id, Arc::new(AtomicBool::new(false)), |event| eprintln!("{}: {}", event.phase, event.message))?.tag_root)
        };
        let source = recover(&p, &i, "scnr")?;
        let tags = if a[2] == "recover-known-stock" {
            // Explicit QA-only opt-in to the existing non-lossless profile.
            // Originals and the raw extraction stay untouched; unknown bytes
            // or tools cannot enter this correction. The app still requires
            // its independent review/confirmation/selection controls.
            let plan = spark_core::ce_source_recovery::review(&source)?;
            project::atomic_write(&out.join("stock-ce-review.json"), &serde_json::to_vec_pretty(&plan)?, false)?;
            eprintln!("Explicit reviewed stock CE correction in a separate QA fork: {}", serde_json::to_string(&plan.corrections)?);
            let receipt = spark_core::ce_source_recovery::create(&plan, &out.join("stock-ce-copy"), Arc::new(AtomicBool::new(false)), |recipe| {
                let id = if recipe.tool == spark_core::ce_source_recovery::Tool::Edit { "invaderNative" } else { "invaderRepair" };
                let release = spark_core::tool_ecosystem::tool(id)?;
                let executable = Path::new(&a[4]).join(release.filename.as_deref().ok_or_else(|| spark_core::SparkError::Invalid("Reviewed tool filename unavailable".into()))?);
                spark_core::reject_links(&executable)?;
                let sha = spark_core::maps::hash_file(&executable)?;
                if release.sha256.as_deref() != Some(sha.as_str()) { return spark_core::invalid("Native recovery tool differs from its reviewed release"); }
                let result = spark_core::steam::command(executable.to_string_lossy().as_ref()).args(&recipe.args).current_dir(out).stdin(std::process::Stdio::null()).output()?;
                if !result.status.success() { return spark_core::invalid(format!("Native source correction failed: {}", String::from_utf8_lossy(&result.stderr))); }
                if spark_core::maps::hash_file(&executable)? != sha { return spark_core::invalid("Native recovery tool changed during execution"); }
                Ok(spark_core::ce_source_recovery::NativeRecord { recipe: recipe.clone(), executable_sha256: sha, stdout: String::from_utf8_lossy(&result.stdout).into_owned(), stderr: String::from_utf8_lossy(&result.stderr).into_owned() })
            })?;
            spark_core::ce_source_recovery::verify(&receipt)?;
            receipt.tags_directory
        } else { source };
        (tags, recover(&donor, &j, "sbsp")?)
    } else { let tags = fs::canonicalize(&a[2])?; (tags.clone(), tags) };
    let use_selected_donor_tags = donor_tags_override.is_some();
    let donor_tags = donor_tags_override.unwrap_or(donor_tags);
    let mut plan = match a[6].as_str() {
        "terrain" => bsp_assembly::plan_terrain(&p,&i,&donor,&j,0,donor_tags)?,
        "auto" => bsp_assembly::plan(&p,&i,&donor,&j,0,donor_tags)?,
        _ => {
            let mut known = reviewed.ok_or_else(|| SparkError::Invalid("Missing reviewed connection".into()))?;
            known.donor_project_id.clone_from(&donor.id);
            known.donor_source = donor.source.clone().ok_or_else(|| SparkError::Invalid("Missing donor source".into()))?;
            if recovered || use_selected_donor_tags || recipe_path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("json")) {
                known.donor_tags_directory = donor_tags;
            } else {
                spark_core::reject_links(&known.donor_tags_directory)?;
                known.donor_tags_directory = fs::canonicalize(&known.donor_tags_directory)?;
            }
            if regional_preset.is_some() {
                let [start, end] = [known.tunnel_points[0], *known.tunnel_points.last().unwrap()];
                let direction = (end[1] - start[1]).atan2(end[0] - start[0]).to_degrees();
                let mut fresh = bsp_assembly::plan_from_bsp(
                    &p, &i, &donor, &j, known.base_bsp_index, 0, known.donor_tags_directory, direction, regional_preset,
                )?;
                fresh.include_donor_scenery = known.include_donor_scenery;
                fresh
            } else {
                known
            }
        }
    };
    if matches!(a[6].as_str(), "auto" | "terrain") { plan.include_donor_scenery = true; }
    if regional_preset.is_some() && matches!(a[6].as_str(),"auto"|"terrain") {
        return spark_core::invalid("Use a reviewed inherited connection recipe to exercise a regional preset");
    }
    plan.validate()?;
    p.title = format!("{} + {} · CE", p.title, plan.donor_title);
    while p.title.len() > 180 { p.title.pop(); }
    p.bsp_assembly=Some(plan);
    p.megaworld_runtime_registration_id = reviewed_runtime.as_ref().map(|(id, _)| id.clone());
    let target=EngineBuildTarget{id:uuid::Uuid::new_v4().to_string(),name:if mcc { "MCC13 from reviewed CE source" } else { "Reviewed CE source for Chupathingy" }.into(),runtime_id:if mcc { RuntimeId::MccSteam } else { RuntimeId::ChupathingyCe },builder:if mcc { "h1a-tool" } else { "invader-ce" }.into(),hek_directory:Some(fs::canonicalize(&a[3])?),hek_flavor:Some("h1aEk".into()),tags_directory:Some(tags),invader_directory:Some(fs::canonicalize(&a[4])?),ce_compatible_tagset:true,open_sauce:false};p.active_build_target=Some(target.id.clone());p.build_targets.push(target);
    project::save_project(&out.join("connection.gsproject"),&p)?;lib.save(&p,Some(&i))?;
    let id=uuid::Uuid::new_v4().to_string();let log=out.join("native-events.jsonl");
    if partition_structure || partition_scenario || partition_lighting {
        if reviewed_runtime.is_some() {
            return spark_core::invalid("The reviewed Forerunner target is used by full native replay builds");
        }
        let jobs = out.join("library/jobs");
        let cancel = Arc::new(AtomicBool::new(false));
        let event = |event: spark_core::build::JobEvent| eprintln!("{}: {}", event.phase, event.message);
        let result = if partition_structure {
            spark_core::megaworld_build::preview_partitions(&p, &i, &jobs, &id, cancel, event)?
        } else {
            spark_core::megaworld_build::probe_partition_scenario(&p, &i, &jobs, &id, partition_lighting, cancel, event)?
        };
        project::atomic_write(&out.join("partition-structure.json"), &serde_json::to_vec_pretty(&result)?, false)?;
        return Ok(());
    }
    let record=spark_core::megaworld_build::run_with_reviewed_runtime(&p,&i,&out.join("library/jobs"),&id,Arc::new(AtomicBool::new(false)),|event|{
        use std::io::Write;if let Ok(mut file)=fs::OpenOptions::new().create(true).append(true).open(&log){let _=writeln!(file,"{}",serde_json::to_string(&event).unwrap());}eprintln!("{}: {}",event.phase,event.message);
    }, reviewed_runtime.as_ref().map(|(_, review)| review))?;
    p.builds.push(record.clone());lib.save(&p,Some(&i))?;project::save_project(&out.join("compiled.gsproject"),&p)?;
    project::atomic_write(&out.join("acceptance.json"),&serde_json::to_vec_pretty(&serde_json::json!({"build":record,"projectId":p.id,"gameplayVerified":false,"streaming":false}))?,false)?;
    println!("Validated {} cache {}",record.target,record.sha256.unwrap());Ok(())
}
