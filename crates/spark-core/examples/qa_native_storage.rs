//! Controlled native acceptance using existing user-provided source. No game
//! is launched, no installation is changed, and accepted fixtures stay intact.
use spark_core::{
    forge_build::{self, ForgeToolchain},
    maps, project, storage, tool_transaction, Result, SparkError,
};
use std::{
    fs,
    path::PathBuf,
    sync::{atomic::{AtomicBool,Ordering}, Arc},
    time::Instant,
};
fn run() -> Result<()> {
    let args = std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .collect::<Vec<_>>();
    if args.len() != 5 {
        return Err(SparkError::Invalid("qa_native_storage <accepted project> <SDK tags> <kit> <Invader> <fresh evidence directory>".into()));
    }
    let mut p = project::load_project(&args[0])?;
    let original_hash = maps::hash_file(&args[0])?;
    let old_builds = p.builds.clone();
    p.id = uuid::Uuid::new_v4().to_string();
    p.title = "C66 bounded native door".into();
    p.quick_forge
        .as_mut()
        .ok_or_else(|| SparkError::Invalid("Accepted Workshop source required".into()))?
        .name = p.title.clone();
    p.builds.clear();
    // The accepted project owns a separately imported door namespace in its
    // original library. This focused staging fixture uses the SDK stock tag at
    // its original path, records that adaptation, and never edits that library.
    let rebound = p.native_asset_imports.clone();
    for binding in &rebound {
        let original = format!(
            "{}.{}",
            binding.tag_path.replace('\\', "/"),
            spark_core::tag_exchange::extension(&binding.tag_class)?
        );
        if !args[1]
            .join(spark_core::safe_relative(&original)?)
            .is_file()
        {
            return Err(SparkError::Invalid(format!(
                "Fixture SDK tag missing: {original}"
            )));
        }
        for placement in &mut p.quick_forge.as_mut().unwrap().placements {
            if placement.tag_path.replace('\\', "/") == binding.native_path {
                placement.tag_path = binding.tag_path.clone();
                placement.source_project_id = None;
                placement.source_sha256 = None;
                placement.tag_id = None;
            }
        }
    }
    p.native_asset_imports.clear();
    p.validate()?;
    spark_core::reject_links(&args[4])?;
    fs::create_dir(&args[4])?;
    let jobs = args[4].join("jobs");
    fs::create_dir(&jobs)?;
    project::save_project(&args[4].join("project.gsproject"), &p)?;
    let reopened = project::load_project(&args[4].join("project.gsproject"))?;
    if reopened.fingerprint()? != p.fingerprint()? {
        return Err(SparkError::Invalid("Save/reopen changed source".into()));
    }
    let tools = ForgeToolchain {
        hek_directory: Some(args[2].clone()),
        hek_tags_directory: Some(args[1].clone()),
        invader_directory: Some(args[3].clone()),
        hek_flavor: Some("h1aEk".into()),
    };
    let log = std::sync::Mutex::new(
        fs::OpenOptions::new()
            .create_new(true)
            .append(true)
            .open(args[4].join("native-events.jsonl"))?,
    );
    let event = |event: spark_core::build::JobEvent| {
        use std::io::Write;
        let _ = writeln!(
            log.lock().unwrap(),
            "{}",
            serde_json::to_string(&event).unwrap()
        );
    };
    let initial = storage::measure(&args[4])?;
    let time = Instant::now();
    let id = uuid::Uuid::new_v4().to_string();
    let receipt = forge_build::run_job(
        &p,
        &tools,
        &jobs,
        &id,
        false,
        vec![],
        Arc::new(AtomicBool::new(false)),
        event,
    )?;
    let cold_ms = time.elapsed().as_millis();
    project::atomic_write(
        &args[4].join("first-receipt.json"),
        &serde_json::to_vec_pretty(&receipt)?,
        false,
    )?;
    let build = receipt
        .build
        .clone()
        .filter(|_| receipt.status == "validated")
        .ok_or_else(|| {
            SparkError::Invalid(format!("Native acceptance blocked: {:?}", receipt.blockers))
        })?;
    if std::env::var("SPARK_QA_BUILD_ONLY").as_deref() == Ok("1") {
        let record = serde_json::json!({"nativeCompilation":true,"completeWorkflow":false,"mode":"fresh-build-only","filesystemCondition":"Warm local filesystem; fresh owned job; no concurrent regression build","freshBuildMs":cold_ms,"build":build,"storage":storage::measure(&args[4])?});
        project::atomic_write(
            &args[4].join("fresh-build.json"),
            &serde_json::to_vec_pretty(&record)?,
            false,
        )?;
        println!("{}", record);
        return Ok(());
    }
    // Request cancellation only after actual native structure output. The
    // production runner must wait for the staged tag writer to exit naturally.
    let active_cancel=Arc::new(AtomicBool::new(false));let saw_writer=AtomicBool::new(false);
    let cancel_events=std::sync::Mutex::new(Vec::new());let cancel_root=args[4].join("cancelled-jobs");
    let cancelled=forge_build::run_job(&p,&tools,&cancel_root,&uuid::Uuid::new_v4().to_string(),false,vec![],active_cancel.clone(),|e|{
        if e.phase=="structure"&&!e.message.starts_with("tool.exe ")&&!e.message.starts_with("tool ") {
            saw_writer.store(true,Ordering::Relaxed);active_cancel.store(true,Ordering::Relaxed);
        }
        if e.phase=="structure"||e.phase=="cancelled"{cancel_events.lock().unwrap().push(e);}
    })?;
    if !saw_writer.load(Ordering::Relaxed)||cancelled.status!="cancelled"||cancelled.build.is_some()||!cancelled.blockers.iter().any(|text|text.contains("after native tag write completed"))||maps::hash_file(build.output.as_ref().unwrap())?!=*build.sha256.as_ref().unwrap(){return Err(SparkError::Invalid("Active native writer cancellation did not preserve the previous-good build and natural Tool completion".into()));}
    let cancellation=serde_json::json!({"status":cancelled.status,"realStructureOutputObserved":true,"nativeWriterFinishedNaturally":true,"newBuildAdopted":false,"previousGoodBuildUnchanged":true,"events":cancel_events.into_inner().unwrap()});
    p.builds.push(build.clone());
    let sources = receipt.sources.as_ref().unwrap();
    let baseline = storage::measure(&args[4])?;
    let mut repeated = vec![];
    for n in 1..=10 {
        let time = Instant::now();
        let request = uuid::Uuid::new_v4().to_string();
        let reused = forge_build::run_job(
            &p,
            &tools,
            &jobs,
            &request,
            false,
            vec![],
            Arc::new(AtomicBool::new(false)),
            |_| {},
        )?;
        if reused.job_id != id
            || reused.build.as_ref().and_then(|b| b.sha256.as_ref()) != build.sha256.as_ref()
            || jobs.join(&request).exists()
        {
            return Err(SparkError::Invalid(
                "Unchanged request created another native tree or changed output".into(),
            ));
        }
        repeated.push(serde_json::json!({"request":n,"durationMs":time.elapsed().as_millis(),"reusedJob":reused.job_id}));
    }
    let after = storage::measure(&args[4])?;
    let output = build.output.as_ref().unwrap();
    let inspection = maps::inspect_map(output, None)?;
    spark_core::native_logic::verify_compiled(p.quick_forge.as_ref().unwrap(), &inspection)?;
    let staged = sources.directory.join("tags");
    let input_hashes: std::collections::BTreeMap<String, String> =
        serde_json::from_slice(&fs::read(jobs.join(&id).join("input-tags.json"))?)?;
    for (relative, hash) in &input_hashes {
        if maps::hash_file(&args[1].join(spark_core::safe_relative(relative)?))? != *hash {
            return Err(SparkError::Invalid("Original native input changed".into()));
        }
    }
    if maps::hash_file(&args[0])? != original_hash {
        return Err(SparkError::Invalid("Accepted project changed".into()));
    }
    let accepted = old_builds
        .iter()
        .filter_map(|b| b.output.as_ref().zip(b.sha256.as_ref()))
        .map(|(path, hash)| {
            Ok(serde_json::json!({"path":path,"sha256":maps::hash_file(path)?,"expected":hash}))
        })
        .collect::<Result<Vec<_>>>()?;
    // Source contract detects mutations before a cached build can be returned.
    let staged_inventory = tool_transaction::inventory(&staged)?;
    let library = spark_core::library::Library::open(&args[4].join("reopen-library"))?;
    let (opened, _) = library.import_map(output, None)?;
    let imports_before = storage::measure(&args[4].join("reopen-library/projects"))?;
    let (reopened, _) = library.import_map(output, None)?;
    let imports_after = storage::measure(&args[4].join("reopen-library/projects"))?;
    if opened.id != reopened.id || imports_before.fingerprint != imports_after.fingerprint {
        return Err(SparkError::Invalid(
            "Reopening identical native map duplicated preserved source".into(),
        ));
    }
    let roundtrip = args[4].join("external-roundtrip");
    fs::create_dir(&roundtrip)?;
    let edited = roundtrip.join("edited-tags");
    let base = tool_transaction::fork(&staged, &edited, Arc::new(AtomicBool::new(false)))?;
    let door = p
        .quick_forge
        .as_ref()
        .unwrap()
        .placements
        .iter()
        .find(|item| item.tag_class == "mach")
        .ok_or_else(|| SparkError::Invalid("Door fixture has no native machine".into()))?;
    let relative = format!("{}.device_machine", door.tag_path.replace('\\', "/"));
    let tag_file = edited.join(spark_core::safe_relative(&relative)?);
    let native_edit = |args: &[&str]| -> Result<std::process::Output> {
        let output =
            spark_core::steam::command(args_for_executable(&tools)?.to_string_lossy().as_ref())
                .args(["-t", fs::canonicalize(&edited)?.to_str().unwrap()])
                .args(args)
                .arg(&relative)
                .output()?;
        Ok(output)
    };
    let edit = native_edit(&["-S", "bounding_radius", "0.5"])?;
    if !edit.status.success() {
        return Err(SparkError::Invalid(format!(
            "Actual Invader edit failed: {}",
            String::from_utf8_lossy(&edit.stderr)
        )));
    }
    let valid = fs::read(&tag_file)?;
    let readback = native_edit(&["-G", "bounding_radius"])?;
    let parser = native_edit(&["-L"])?;
    if !parser.status.success()
        || !readback.status.success()
        || String::from_utf8_lossy(&readback.stdout)
            .trim()
            .parse::<f32>()
            .ok()
            != Some(0.5)
    {
        return Err(SparkError::Invalid(
            "Actual edited native field failed independent readback".into(),
        ));
    }
    let valid_hashes = tool_transaction::inventory(&edited)?;
    if valid_hashes.get(&relative) == base.get(&relative) {
        return Err(SparkError::Invalid(
            "Invader did not make a genuine semantic edit".into(),
        ));
    }
    fs::write(&tag_file, b"corrupted interrupted external save")?;
    let corrupt = tool_transaction::inventory(&edited)?;
    let invalid = spark_core::native_tag_integrity::Cache::default().scan(
        &edited,
        &base,
        &corrupt,
        u64::MAX,
    )?;
    let parser_rejected = !native_edit(&["-L"])?.status.success();
    if !invalid.blocked() || !parser_rejected {
        return Err(SparkError::Invalid(
            "Corrupted external save was not rejected".into(),
        ));
    }
    fs::write(&tag_file, &valid)?;
    if tool_transaction::inventory(&edited)? != valid_hashes {
        return Err(SparkError::Invalid(
            "External recovery did not restore the exact valid source".into(),
        ));
    }
    let merged = roundtrip.join("reconciled-tags");
    let reconciliation = tool_transaction::reconcile(
        &base,
        &staged,
        &edited,
        &merged,
        &base,
        &valid_hashes,
        true,
        Arc::new(AtomicBool::new(false)),
    )?;
    if reconciliation.changes.len() != 1 || tool_transaction::inventory(&staged)? != base {
        return Err(SparkError::Invalid(
            "Native reconciliation changed its parent or included unrelated edits".into(),
        ));
    }
    let mut changed = p.clone();
    changed.builds.clear();
    changed.quick_forge.as_mut().unwrap().name = "C66 edited native door".into();
    let mut changed_tools = tools.clone();
    changed_tools.hek_tags_directory = Some(merged.clone());
    let changed_id = uuid::Uuid::new_v4().to_string();
    let changed_receipt = forge_build::run_job(
        &changed,
        &changed_tools,
        &jobs,
        &changed_id,
        false,
        vec![],
        Arc::new(AtomicBool::new(false)),
        event,
    )?;
    project::atomic_write(
        &args[4].join("edited-receipt.json"),
        &serde_json::to_vec_pretty(&changed_receipt)?,
        false,
    )?;
    let changed_build = changed_receipt
        .build
        .as_ref()
        .filter(|_| changed_receipt.status == "validated")
        .ok_or_else(|| {
            SparkError::Invalid(format!(
                "Edited native build failed: {:?}",
                changed_receipt.blockers
            ))
        })?;
    let changed_inspection = maps::inspect_map(changed_build.output.as_ref().unwrap(), None)?;
    spark_core::native_logic::verify_compiled(
        changed.quick_forge.as_ref().unwrap(),
        &changed_inspection,
    )?;
    let machine = changed_inspection
        .tags
        .iter()
        .find(|tag| {
            tag.class == "mach"
                && tag
                    .path
                    .replace('\\', "/")
                    .eq_ignore_ascii_case(&door.tag_path.replace('\\', "/"))
        })
        .ok_or_else(|| SparkError::Invalid("Compiled edited door missing".into()))?;
    let radius = machine
        .fields
        .iter()
        .find(|field| field.label == "Bounding radius")
        .and_then(|field| field.value.as_f64());
    if radius.is_none_or(|r| (r - 0.5).abs() > 0.000001) {
        return Err(SparkError::Invalid(
            "Compiled native door does not retain the actual external edit".into(),
        ));
    }
    let report = serde_json::json!({"complete":true,"nativeCompilation":true,"activeWriterCancellation":cancellation,"gameplayRetested":false,"filesystemCondition":"Warm local filesystem; fresh owned native job, no OS cache flush", "acceptedDoorSourceUnchanged":true,"fixtureImportsReboundToExistingSdkTags":rebound,"freshBuildMs":cold_ms,"initial":initial,"afterFirstBuild":baseline,"afterTenUnchangedRequests":after,"repeat":repeated,"additionalNativeTreesDuringReuse":0,"sameAllocatedAfterRepeats":baseline.allocated_bytes==after.allocated_bytes,"inputFilesFreshlyVerified":input_hashes.len(),"compiledTags":staged_inventory.len(),"scripts":inspection.scripts,"build":build,"acceptedBuilds":accepted,"reopenSameMap":{"projectId":opened.id,"sameSourceAllocation":imports_before.allocated_bytes==imports_after.allocated_bytes},"externalEdit":{"writer":"Installed Invader -S bounding_radius 0.5","nativeParserAcceptedValidEdit":true,"corruptSaveBlocked":invalid.blocked(),"nativeParserRejectedCorruption":parser_rejected,"validBytesRecoveredExactly":true,"parentUnchanged":tool_transaction::inventory(&staged)?==base,"reconciliation":reconciliation,"compiledBoundingRadius":radius,"editedBuild":changed_build},"completeWorkflowStorage":storage::measure(&args[4])?,"storage":storage::Store::for_output(&jobs.join("next"))?.overview()?});
    project::atomic_write(
        &args[4].join("acceptance.json"),
        &serde_json::to_vec_pretty(&report)?,
        false,
    )?;
    println!("{}", serde_json::to_string(&report)?);
    Ok(())
}
fn args_for_executable(tools: &ForgeToolchain) -> Result<PathBuf> {
    tools
        .invader_directory
        .as_ref()
        .map(|p| {
            p.join(if cfg!(windows) {
                "invader-edit.exe"
            } else {
                "invader-edit"
            })
        })
        .ok_or_else(|| SparkError::Invalid("Missing native editor".into()))
}
fn main() {
    if let Err(error) = run() {
        eprintln!("Native storage acceptance: {error}");
        std::process::exit(1);
    }
}
