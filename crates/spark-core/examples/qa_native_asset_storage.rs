//! Real recursive extraction/import/build acceptance with dependency staging.
//! No game launch, full SDK copy or source mutation.
use spark_core::{
    build::Toolchain,
    forge_build::{self, ForgeToolchain},
    library::Library,
    maps, native_asset_imports, project, storage, tag_exchange, Result, SparkError,
};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc, Mutex},
    time::Instant,
};
fn run() -> Result<()> {
    let args: Vec<PathBuf> = std::env::args_os().skip(1).map(PathBuf::from).collect();
    if args.len() != 6 {
        return Err(SparkError::Invalid("qa_native_asset_storage <accepted-project> <native-cache> <base-tags> <H1A-kit> <Invader> <fresh-output>".into()));
    }
    spark_core::reject_links(&args[5])?;
    fs::create_dir(&args[5])?;
    let output = &args[5];
    let original_project_sha = maps::hash_file(&args[0])?;
    let original_cache_sha = maps::hash_file(&args[1])?;
    // Metadata for the complete tree, fresh hashes for actual admitted inputs.
    let base_size = storage::measure(&args[2])?;
    let log = Mutex::new(
        fs::OpenOptions::new()
            .create_new(true)
            .append(true)
            .open(output.join("native-events.jsonl"))?,
    );
    let event = |value: spark_core::build::JobEvent| {
        let _ = writeln!(
            log.lock().unwrap(),
            "{}",
            serde_json::to_string(&value).unwrap()
        );
    };
    let library = Library::open(&output.join("library"))?;
    let root = output.join("library");
    let (source, inspection) = library.import_map(&args[1], None)?;
    let source_tag = inspection
        .tags
        .iter()
        .find(|tag| tag.class == "mach")
        .ok_or_else(|| {
            SparkError::Invalid("Accepted native cache has no machine to import".into())
        })?;
    let mut target = project::load_project(&args[0])?;
    target.id = uuid::Uuid::new_v4().to_string();
    target.title = "C66 recursive imported door".into();
    target.builds.clear();
    target.native_asset_imports.clear();
    target
        .quick_forge
        .as_mut()
        .ok_or_else(|| SparkError::Invalid("Accepted BSP source required".into()))?
        .name = target.title.clone();
    let tools = Toolchain {
        invader_directory: Some(args[4].clone()),
        h1a_directory: Some(args[3].clone()),
        base_tags_directory: Some(args[2].clone()),
        ..Default::default()
    };
    let started = Instant::now();
    let extracted = tag_exchange::extract_selected_tag(
        &source,
        &inspection,
        &tools,
        &root,
        &uuid::Uuid::new_v4().to_string(),
        source_tag.id,
        Arc::new(AtomicBool::new(false)),
        &event,
    )?;
    project::atomic_write(
        &output.join("extraction.json"),
        &serde_json::to_vec_pretty(&extracted)?,
        false,
    )?;
    let after_first_extraction = storage::measure(&root.join("tag-exchanges"))?;
    let repeated_id = uuid::Uuid::new_v4().to_string();
    let repeated = tag_exchange::extract_selected_tag(
        &source,
        &inspection,
        &tools,
        &root,
        &repeated_id,
        source_tag.id,
        Arc::new(AtomicBool::new(false)),
        &event,
    )?;
    let after_repeat = storage::measure(&root.join("tag-exchanges"))?;
    if repeated.job_id != extracted.job_id
        || after_first_extraction.fingerprint != after_repeat.fingerprint
    {
        return Err(SparkError::Invalid(
            "Unchanged recursive extraction created another source tree".into(),
        ));
    }
    let binding = native_asset_imports::prepare(
        &target,
        &source,
        &inspection,
        &extracted,
        &tools,
        &root,
        &uuid::Uuid::new_v4().to_string(),
        source_tag.id,
        &AtomicBool::new(false),
        &event,
    )?;
    let placements = &mut target.quick_forge.as_mut().unwrap().placements;
    let mut placed = 0;
    for door in placements
        .iter_mut()
        .filter(|item| item.tag_class == "mach")
    {
        door.tag_path = binding.native_path.replace('/', "\\");
        door.source_project_id = Some(source.id.clone());
        door.source_sha256 = Some(inspection.sha256.clone());
        door.tag_id = Some(source_tag.id);
        placed += 1;
    }
    if placed != 1 {
        return Err(SparkError::Invalid(
            "Select the accepted one-door fixture; do not change unrelated placements".into(),
        ));
    }
    target.native_asset_imports.push(binding.clone());
    target.validate()?;
    let saved = output.join("project.gsproject");
    project::save_project(&saved, &target)?;
    if project::load_project(&saved)?.fingerprint()? != target.fingerprint()? {
        return Err(SparkError::Invalid(
            "Imported source identity changed on Save/reopen".into(),
        ));
    }
    let source_files = native_asset_imports::available_files(&root, &target)?;
    let build_id = uuid::Uuid::new_v4().to_string();
    let receipt = forge_build::run_job(
        &target,
        &ForgeToolchain {
            hek_directory: Some(args[3].clone()),
            hek_tags_directory: Some(args[2].clone()),
            invader_directory: Some(args[4].clone()),
            hek_flavor: Some("h1aEk".into()),
        },
        &root.join("jobs"),
        &build_id,
        false,
        vec![],
        Arc::new(AtomicBool::new(false)),
        &event,
    )?;
    project::atomic_write(
        &output.join("build-receipt.json"),
        &serde_json::to_vec_pretty(&receipt)?,
        false,
    )?;
    let build = receipt
        .build
        .as_ref()
        .filter(|_| receipt.status == "validated")
        .ok_or_else(|| {
            SparkError::Invalid(format!(
                "Imported native build did not validate: {:?}",
                receipt.blockers
            ))
        })?
        .clone();
    let compiled = maps::inspect_map(build.output.as_ref().unwrap(), None)?;
    native_asset_imports::verify_compiled(&target, &compiled)?;
    spark_core::native_logic::verify_compiled(target.quick_forge.as_ref().unwrap(), &compiled)?;
    let machine = compiled
        .tags
        .iter()
        .find(|tag| tag.class == "mach" && tag.path.replace('\\', "/") == binding.native_path)
        .ok_or_else(|| SparkError::Invalid("Compiled cache omitted the imported door".into()))?;
    let baseline_radius = source_tag
        .fields
        .iter()
        .find(|field| field.label == "Bounding radius")
        .map(|field| field.value.clone());
    let compiled_radius = machine
        .fields
        .iter()
        .find(|field| field.label == "Bounding radius")
        .map(|field| field.value.clone());
    if baseline_radius.is_none() || baseline_radius != compiled_radius {
        return Err(SparkError::Invalid(
            "Independent native cache readback disagrees with the imported source field".into(),
        ));
    }
    let inputs: std::collections::BTreeMap<String, String> = serde_json::from_slice(&fs::read(
        root.join("jobs").join(&build_id).join("input-tags.json"),
    )?)?;
    for (relative, expected) in &inputs {
        if maps::hash_file(&args[2].join(spark_core::safe_relative(relative)?))? != *expected {
            return Err(SparkError::Invalid(
                "An admitted original SDK input changed".into(),
            ));
        }
    }
    let staging: serde_json::Value = serde_json::from_slice(&fs::read(
        root.join("jobs").join(&build_id).join("staging-plan.json"),
    )?)?;
    if staging["stagedBytes"]
        .as_u64()
        .is_none_or(|bytes| bytes > 256 * 1024 * 1024)
    {
        return Err(SparkError::Invalid(
            "The controlled imported-door fixture copied too much native source".into(),
        ));
    }
    target.builds.push(build.clone());
    let after_first_build = storage::measure(&root.join("jobs"))?;
    let mut repeated_builds = vec![];
    for _ in 0..10 {
        let id = uuid::Uuid::new_v4().to_string();
        let time = Instant::now();
        let reused = forge_build::run_job(
            &target,
            &ForgeToolchain {
                hek_directory: Some(args[3].clone()),
                hek_tags_directory: Some(args[2].clone()),
                invader_directory: Some(args[4].clone()),
                hek_flavor: Some("h1aEk".into()),
            },
            &root.join("jobs"),
            &id,
            false,
            vec![],
            Arc::new(AtomicBool::new(false)),
            |_| {},
        )?;
        if reused.job_id != build_id
            || root.join("jobs").join(id).exists()
            || reused.build.as_ref().and_then(|b| b.sha256.as_ref()) != build.sha256.as_ref()
        {
            return Err(SparkError::Invalid(
                "Unchanged imported source created another native tree or changed output".into(),
            ));
        }
        repeated_builds.push(time.elapsed().as_millis());
    }
    let after_repeated_builds = storage::measure(&root.join("jobs"))?;
    if after_first_build.fingerprint != after_repeated_builds.fingerprint {
        return Err(SparkError::Invalid(
            "Unchanged imported builds grew their native jobs".into(),
        ));
    }
    if base_size.fingerprint != storage::measure(&args[2])?.fingerprint
        || original_project_sha != maps::hash_file(&args[0])?
        || original_cache_sha != maps::hash_file(&args[1])?
    {
        return Err(SparkError::Invalid(
            "An original input changed during the recursive import trial".into(),
        ));
    }
    let report = serde_json::json!({"complete":true,"nativeCompilation":true,"gameplayRetested":false,
        "fixture":"Accepted two-room layout, real recursively extracted namespaced door, dependency-staged base",
        "sourceCache":args[1],"sourceCacheSha256":original_cache_sha,"sourceProjectSha256":original_project_sha,
        "baseTags":args[2],"baseStorage":base_size,"originalsUnchanged":true,"originalVerification":"Admitted SDK hashes, whole-tree metadata fingerprint and original map/project hashes","extraction":extracted,
        "repeatedExtractionReused":true,"afterFirstExtraction":after_first_extraction,"afterRepeatedExtraction":after_repeat,
        "binding":binding,"importedFiles":source_files.len(),"placements":placed,"compiledBoundingRadius":compiled_radius,
        "scripts":compiled.scripts,"build":build,"staging":staging,"afterFirstBuild":after_first_build,"afterTenRepeatedBuilds":after_repeated_builds,"repeatedBuildsMs":repeated_builds,"additionalNativeTreesDuringReuse":0,"durationMs":started.elapsed().as_millis(),
        "workflowStorage":storage::measure(output)?,"ledger":storage::Store::for_output(&root.join("jobs/next"))?.overview()?,
        "limitations":["Native readback, not new gameplay acceptance.","One imported native machine graph; broader custom assets and prepared shared revisions need their own acceptance."]});
    project::atomic_write(
        &output.join("acceptance.json"),
        &serde_json::to_vec_pretty(&report)?,
        false,
    )?;
    println!("{}", report);
    Ok(())
}
fn main() {
    if let Err(error) = run() {
        eprintln!("Native imported-asset storage acceptance: {error}");
        std::process::exit(1);
    }
}
