//! Real native CE609 or MCC13 assembly and extension acceptance. Player proof is separate.
use spark_core::{bsp_assembly::{self, BspAssembly},library::Library,project::{self,EngineBuildTarget,Project},runtime::RuntimeId,Result,SparkError};
use std::{fs,io::Read,path::Path,sync::{Arc,atomic::AtomicBool}};

fn reviewed_plan(path: &Path, base: &Project) -> Result<(BspAssembly, Vec<BspAssembly>)> {
    let source = base.source.as_ref().ok_or_else(|| SparkError::Invalid("Missing base source".into()))?;
    if path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("json")) {
        spark_core::reject_links(path)?;
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
        Ok((serde_json::from_value(plan.clone())?, inherited))
    } else {
        let prior = project::load_project(path)?;
        if prior.source.as_ref().map(|source| source.sha256.as_str()) != Some(&source.sha256) {
            return spark_core::invalid("Previous connection belongs to a different base cache");
        }
        let plan = prior.bsp_assembly.ok_or_else(|| SparkError::Invalid("Previous project has no connection".into()))?;
        Ok((plan, prior.inherited_bsp_connections))
    }
}

fn main()->Result<()>{
    let mut a=std::env::args().skip(1).collect::<Vec<_>>();
    let mcc = a.first().is_some_and(|arg| arg == "--mcc13");
    if mcc { a.remove(0); }
    let partition_structure = a.first().is_some_and(|arg| arg == "--partition-structure");
    let partition_scenario = a.first().is_some_and(|arg| arg == "--partition-scenario-probe");
    let partition_lighting = a.first().is_some_and(|arg| arg == "--partition-lighting-probe");
    if partition_structure || partition_scenario || partition_lighting { a.remove(0); }
    if a.len()!=7{return spark_core::invalid("qa_megaworld_ce [--mcc13] [--partition-structure | --partition-scenario-probe | --partition-lighting-probe] <base CE.map> <donor CE.map> <reviewed CE tags, recover, or recover-known-stock> <H1A kit> <Invader> <fresh output> <previous project, reviewed JSON receipt, auto, or terrain>");}
    let out=Path::new(&a[5]);fs::create_dir(out)?;let lib=Library::open(&out.join("library"))?;
    let (mut p,i)=lib.import_map(Path::new(&a[0]),Path::new(&a[0]).parent())?;
    let (donor,j)=lib.import_map(Path::new(&a[1]),Path::new(&a[1]).parent())?;
    let recovered = matches!(a[2].as_str(), "recover" | "recover-known-stock");
    let recipe_path = Path::new(&a[6]);
    let reviewed = if matches!(a[6].as_str(), "auto" | "terrain") {
        None
    } else {
        let (plan, inherited_connections) = reviewed_plan(recipe_path, &p)?;
        p.inherited_bsp_connections = inherited_connections;
        let source = donor.source.as_ref().ok_or_else(|| SparkError::Invalid("Missing donor source".into()))?;
        if plan.donor_source.sha256 != source.sha256 || plan.donor_bsp_index != 0
            || plan.donor_source.resource_sha256 != source.resource_sha256 {
            return spark_core::invalid("Previous donor cache, BSP or resource banks differ from this native build");
        }
        plan.validate()?;
        Some(plan)
    };
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
    let mut plan = match a[6].as_str() {
        "terrain" => bsp_assembly::plan_terrain(&p,&i,&donor,&j,0,donor_tags)?,
        "auto" => bsp_assembly::plan(&p,&i,&donor,&j,0,donor_tags)?,
        _ => {
            let mut known = reviewed.ok_or_else(|| SparkError::Invalid("Missing reviewed connection".into()))?;
            known.donor_project_id.clone_from(&donor.id);
            known.donor_source = donor.source.clone().ok_or_else(|| SparkError::Invalid("Missing donor source".into()))?;
            if recovered || recipe_path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("json")) {
                known.donor_tags_directory = donor_tags;
            } else {
                spark_core::reject_links(&known.donor_tags_directory)?;
                known.donor_tags_directory = fs::canonicalize(&known.donor_tags_directory)?;
            }
            known
        }
    };
    if matches!(a[6].as_str(), "auto" | "terrain") { plan.include_donor_scenery = true; }
    plan.validate()?;
    p.title = format!("{} + {} · CE", p.title, plan.donor_title);
    while p.title.len() > 180 { p.title.pop(); }
    p.bsp_assembly=Some(plan);
    let target=EngineBuildTarget{id:uuid::Uuid::new_v4().to_string(),name:if mcc { "MCC13 from reviewed CE source" } else { "Reviewed CE source for Chupathingy" }.into(),runtime_id:if mcc { RuntimeId::MccSteam } else { RuntimeId::ChupathingyCe },builder:if mcc { "h1a-tool" } else { "invader-ce" }.into(),hek_directory:Some(fs::canonicalize(&a[3])?),hek_flavor:Some("h1aEk".into()),tags_directory:Some(tags),invader_directory:Some(fs::canonicalize(&a[4])?),ce_compatible_tagset:true,open_sauce:false};p.active_build_target=Some(target.id.clone());p.build_targets.push(target);
    project::save_project(&out.join("connection.gsproject"),&p)?;lib.save(&p,Some(&i))?;
    let id=uuid::Uuid::new_v4().to_string();let log=out.join("native-events.jsonl");
    if partition_structure || partition_scenario || partition_lighting {
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
    let record=spark_core::megaworld_build::run(&p,&i,&out.join("library/jobs"),&id,Arc::new(AtomicBool::new(false)),|event|{
        use std::io::Write;if let Ok(mut file)=fs::OpenOptions::new().create(true).append(true).open(&log){let _=writeln!(file,"{}",serde_json::to_string(&event).unwrap());}eprintln!("{}: {}",event.phase,event.message);
    })?;
    p.builds.push(record.clone());lib.save(&p,Some(&i))?;project::save_project(&out.join("compiled.gsproject"),&p)?;
    project::atomic_write(&out.join("acceptance.json"),&serde_json::to_vec_pretty(&serde_json::json!({"build":record,"projectId":p.id,"gameplayVerified":false,"streaming":false}))?,false)?;
    println!("Validated {} cache {}",record.target,record.sha256.unwrap());Ok(())
}
