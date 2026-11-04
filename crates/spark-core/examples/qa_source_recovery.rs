//! Real cache -> recovered native tags/JMS -> isolated Halo Tool model compile.
//! No SDK copy, game launch, original mutation or manufactured gameplay result.
use spark_core::{
    build::Toolchain, library::Library, maps, native_staging, project, source_recovery, storage,
    Result, SparkError,
};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{atomic::AtomicBool, Arc, Mutex},
    time::Instant,
};
fn require(ok: bool, message: &str) -> Result<()> {
    if !ok {
        return spark_core::invalid(message);
    }
    Ok(())
}
fn process(exe: &Path, args: &[String], cwd: &Path, log: &Path) -> Result<String> {
    let output = spark_core::steam::command(exe.to_str().unwrap())
        .args(args)
        .current_dir(cwd)
        .stdin(std::process::Stdio::null())
        .output()?;
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    project::atomic_write(log, text.as_bytes(), false)?;
    require(
        output.status.success(),
        &format!("Native process failed; inspect {}", log.display()),
    )?;
    Ok(text)
}
fn cache_build(args: &[PathBuf]) -> Result<()> {
    require(args.len()==5,"qa_source_recovery --cache <managed-library> <recovery-id> <Invader> <H1A-kit> <fresh-output>")?;
    let receipt = source_recovery::load(&args[0], args[1].to_str().unwrap())?;
    let scenario = receipt
        .plan
        .requested_tag
        .strip_suffix(".scenario")
        .ok_or_else(|| SparkError::Invalid("A scenario-root recovery is required".into()))?;
    let original = maps::inspect_map(&receipt.plan.source_path, None)?;
    require(
        original.sha256 == receipt.plan.source_sha256,
        "Original recovery cache changed",
    )?;
    spark_core::reject_links(&args[4])?;
    fs::create_dir(&args[4])?;
    let output = &args[4];
    let stage = output.join("workspace");
    let cancel = AtomicBool::new(false);
    let tags = native_staging::inventory(&receipt.tags_directory, &cancel)?;
    let data = native_staging::inventory(&receipt.data_directory, &cancel)?;
    let reserve =
        storage::estimate_copy(tags.files.len() + data.files.len(), tags.bytes + data.bytes)
            .saturating_add(
                fs::metadata(&receipt.plan.source_path)?
                    .len()
                    .saturating_mul(2),
            )
            .saturating_add(64 * 1024 * 1024);
    let lease = storage::Store::for_output(&stage)?.reserve(
        &stage,
        Some(&receipt.directory),
        reserve,
        storage::Category::Staging,
        "QA full recovered native scenario compilation; no SDK copy",
    )?;
    fs::create_dir(&stage)?;
    lease.mark_owned()?;
    native_staging::copy(
        &receipt.tags_directory,
        &stage.join("tags"),
        &tags,
        &cancel,
        |_, _, _, _| {},
    )?;
    native_staging::copy(
        &receipt.data_directory,
        &stage.join("data"),
        &data,
        &cancel,
        |_, _, _, _| {},
    )?;
    #[cfg(windows)]
    let alias = spark_core::native_workspace::Alias::new(&stage)?;
    #[cfg(windows)]
    let cwd = alias.path();
    #[cfg(not(windows))]
    let cwd = stage.as_path();
    let global_source = spark_core::native_logic::ensure_h1a_global_source(&stage)?;
    let tool = args[3].join(if cfg!(windows) { "tool.exe" } else { "tool" });
    let started = Instant::now();
    let log = process(
        &tool,
        &[
            "-data_dir".into(),
            "data".into(),
            "-tags_dir".into(),
            "tags".into(),
            "-game_root_dir".into(),
            ".".into(),
            "build-cache-file".into(),
            scenario.replace('/', "\\"),
            "classic".into(),
            "none".into(),
        ],
        cwd,
        &output.join("halo-tool-cache.log"),
    )?;
    require(
        !log.to_lowercase().contains("### error")
            && !log.to_lowercase().contains("exception halt")
            && spark_core::build::native_compile_errors(&log).is_empty(),
        "Native compiler reported an incomplete recovered cache",
    )?;
    let cache = stage
        .join("maps")
        .join(format!("{}.map", original.header.name));
    let compiled = maps::inspect_map(&cache, None)?;
    require(
        compiled.header.version == 13 && compiled.header.name == original.header.name,
        "Recovered cache has the wrong native edition/scenario",
    )?;
    let scripts = |inspection: &maps::MapInspection| {
        inspection
            .scripts
            .iter()
            .map(|script| script.name.clone())
            .collect::<std::collections::BTreeSet<_>>()
    };
    require(
        scripts(&compiled) == scripts(&original),
        "Recovered script identities were lost during native compilation",
    )?;
    require(
        compiled.objects.len() == original.objects.len()
            && compiled.mesh.indices.len() == original.mesh.indices.len(),
        "Recovered placement/collision counts differ from the source cache",
    )?;
    source_recovery::load(&args[0], &receipt.id)?;
    require(
        maps::hash_file(&receipt.plan.source_path)? == receipt.plan.source_sha256,
        "Recovered build changed its original map",
    )?;
    let crc = process(
        &args[2].join(if cfg!(windows) {
            "invader-info.exe"
        } else {
            "invader-info"
        }),
        &[
            "-T".into(),
            "crc32_mismatched".into(),
            cache.to_string_lossy().into(),
        ],
        cwd,
        &output.join("invader-cache-readback.log"),
    )?;
    require(
        ["0", "false"].contains(&crc.trim()),
        "Recovered cache CRC does not match its native header",
    )?;
    lease.finish(true, Some(receipt.plan.source_sha256.clone()))?;
    project::atomic_write(
        &output.join("acceptance.json"),
        &serde_json::to_vec_pretty(
            &serde_json::json!({"complete":true,"mockedNativeTools":false,"recoveryId":receipt.id,"sourceSha256":receipt.plan.source_sha256,"recoveredNativeTags":tags.files.len(),"reconstructedDataFiles":data.files.len(),"nativeCache":cache,"nativeCacheSha256":maps::hash_file(&cache)?,"cacheVersion":compiled.header.version,"sourceScenario":scenario,"nativeScriptNames":scripts(&compiled),"sceneObjects":compiled.objects.len(),"collisionTriangles":compiled.mesh.indices.len()/3,"crc32Mismatched":false,"generatedCompilerSupport":global_source,"haloToolSha256":maps::hash_file(&tool)?,"nativeCompilationMs":started.elapsed().as_millis(),"recoveredInputsUnchanged":true,"originalMapUnchanged":true,"gameLoaded":false,"humanGameplayAccepted":false,"limitations":["Native compiler/cache readback, not actual game execution or two-way traversal","Counts and script names are not complete behavioral equivalence","Review the retained native compiler warnings; compiler-only UI dependencies can be absent from a map cache"]}),
        )?,
        false,
    )?;
    println!(
        "Recovered native scenario compiled/read back: {}",
        cache.display()
    );
    Ok(())
}
fn readback(args: &[PathBuf]) -> Result<()> {
    require(args.len()==4,"qa_source_recovery --readback <original-cache> <rebuilt-cache> <Invader> <fresh-diagnostics>")?;
    spark_core::reject_links(&args[3])?;
    fs::create_dir(&args[3])?;
    let source = maps::inspect_map(&args[0], None)?;
    let rebuilt = maps::inspect_map(&args[1], None)?;
    let identities = |inspection: &maps::MapInspection| {
        inspection
            .tags
            .iter()
            .map(|tag| {
                (
                    tag.class.clone(),
                    tag.path.replace('\\', "/").to_ascii_lowercase(),
                )
            })
            .collect::<std::collections::BTreeSet<_>>()
    };
    let before = identities(&source);
    let after = identities(&rebuilt);
    let missing = before.difference(&after).cloned().collect::<Vec<_>>();
    let crc = process(
        &args[2].join(if cfg!(windows) {
            "invader-info.exe"
        } else {
            "invader-info"
        }),
        &[
            "-T".into(),
            "crc32_mismatched".into(),
            args[1].to_string_lossy().into(),
        ],
        &args[3],
        &args[3].join("native-crc.log"),
    )?;
    let report = serde_json::json!({"complete":missing.is_empty()&&["0","false"].contains(&crc.trim()),"sourceSha256":source.sha256,"rebuiltSha256":rebuilt.sha256,"sourceTags":before.len(),"rebuiltTags":after.len(),"missingNativeTagIdentities":missing,"sourceRenderTriangles":source.render_mesh.as_ref().map(|mesh|mesh.indices.len()/3),"rebuiltRenderTriangles":rebuilt.render_mesh.as_ref().map(|mesh|mesh.indices.len()/3),"sourceCollisionTriangles":source.mesh.indices.len()/3,"rebuiltCollisionTriangles":rebuilt.mesh.indices.len()/3,"crc32Mismatched":!["0","false"].contains(&crc.trim()),"gameLoaded":false,"visualAudioFidelityVerified":false,"limitation":"Native identities/counts/CRC are not complete payload or gameplay equivalence"});
    project::atomic_write(
        &args[3].join("acceptance.json"),
        &serde_json::to_vec_pretty(&report)?,
        false,
    )?;
    require(
        report["complete"] == true,
        "Recovered cache lost original native tag identities or failed CRC",
    )?;
    println!(
        "All {} original native tag identities retained; target CRC valid",
        before.len()
    );
    Ok(())
}
fn run() -> Result<()> {
    let args = std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .collect::<Vec<_>>();
    if args.first().is_some_and(|arg| arg == Path::new("--cache")) {
        return cache_build(&args[1..]);
    }
    if args
        .first()
        .is_some_and(|arg| arg == Path::new("--readback"))
    {
        return readback(&args[1..]);
    }
    require(
        args.len() == 4,
        "qa_source_recovery <owned-compiled-map> <Invader-directory> <H1A-kit> <fresh-output>",
    )?;
    spark_core::reject_links(&args[3])?;
    fs::create_dir(&args[3])?;
    let output = &args[3];
    let started = Instant::now();
    let original = maps::hash_file(&args[0])?;
    let root = output.join("library");
    let library = Library::open(&root)?;
    let (source, inspection) = library.import_map(&args[0], None)?;
    let tag = inspection
        .tags
        .iter()
        .find(|tag| tag.class == "mach")
        .ok_or_else(|| {
            SparkError::Invalid("The controlled native map needs a real device_machine".into())
        })?;
    let tools = Toolchain {
        invader_directory: Some(args[1].clone()),
        ..Default::default()
    };
    let log = Mutex::new(
        fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(output.join("native-events.jsonl"))?,
    );
    let event = |event: spark_core::build::JobEvent| {
        let _ = writeln!(
            log.lock().unwrap(),
            "{}",
            serde_json::to_string(&event).unwrap()
        );
    };
    let plan = source_recovery::review(&source, &inspection, &tools, tag.id)?;
    project::atomic_write(
        &output.join("review.json"),
        &serde_json::to_vec_pretty(&plan)?,
        false,
    )?;
    require(
        plan.blockers.is_empty(),
        &format!("Recovery preflight: {:?}", plan.blockers),
    )?;
    require(
        !root.join("recoveries").exists() && !root.join("tag-exchanges").exists(),
        "Review wrote recovery/extraction output",
    )?;
    let stale = source_recovery::recover(
        &source,
        &inspection,
        &tools,
        &root,
        &uuid::Uuid::new_v4().to_string(),
        tag.id,
        &"0".repeat(64),
        Arc::new(AtomicBool::new(false)),
        &event,
    );
    require(
        stale.is_err() && !root.join("tag-exchanges").exists(),
        "Stale plan wrote native output",
    )?;
    let first = Instant::now();
    let receipt = source_recovery::recover(
        &source,
        &inspection,
        &tools,
        &root,
        &uuid::Uuid::new_v4().to_string(),
        tag.id,
        &plan.identity,
        Arc::new(AtomicBool::new(false)),
        &event,
    )?;
    let recovery_ms = first.elapsed().as_millis();
    let before = storage::measure(&root)?;
    let repeated = Instant::now();
    let reused = source_recovery::recover(
        &source,
        &inspection,
        &tools,
        &root,
        &uuid::Uuid::new_v4().to_string(),
        tag.id,
        &plan.identity,
        Arc::new(AtomicBool::new(false)),
        &event,
    )?;
    let reuse_ms = repeated.elapsed().as_millis();
    let after = storage::measure(&root)?;
    require(
        reused.reused && reused.id == receipt.id && before.logical_bytes == after.logical_bytes,
        "Recovery reuse created duplicate native data",
    )?;
    require(
        !receipt.recovered_data.is_empty(),
        "No genuine native source data was reconstructed",
    )?;
    let model = receipt
        .native_tags
        .iter()
        .find(|file| file.path.ends_with(".gbxmodel"))
        .ok_or_else(|| SparkError::Invalid("Recovered asset has no native model".into()))?;
    let stage = output.join("model-compile");
    let lease = storage::Store::for_output(&stage)?.reserve(
        &stage,
        Some(&receipt.directory),
        32 * 1024 * 1024,
        storage::Category::Staging,
        "QA recovered JMS native model compile",
    )?;
    fs::create_dir(&stage)?;
    lease.mark_owned()?;
    let cancel = AtomicBool::new(false);
    let mut inventory = native_staging::inventory(&receipt.tags_directory, &cancel)?;
    inventory.files.retain(|file| file.path != model.path);
    inventory.bytes = inventory.files.iter().map(|file| file.bytes).sum();
    native_staging::copy(
        &receipt.tags_directory,
        &stage.join("tags"),
        &inventory,
        &cancel,
        |_, _, _, _| {},
    )?;
    let data = native_staging::inventory(&receipt.data_directory, &cancel)?;
    native_staging::copy(
        &receipt.data_directory,
        &stage.join("data"),
        &data,
        &cancel,
        |_, _, _, _| {},
    )?;
    #[cfg(windows)]
    let alias = spark_core::native_workspace::Alias::new(&stage)?;
    #[cfg(windows)]
    let cwd = alias.path();
    #[cfg(not(windows))]
    let cwd = stage.as_path();
    let model_folder = Path::new(&model.path)
        .parent()
        .unwrap()
        .to_string_lossy()
        .replace('/', "\\");
    let tool = args[2].join(if cfg!(windows) { "tool.exe" } else { "tool" });
    let native_started = Instant::now();
    let tool_log = process(
        &tool,
        &[
            "-data_dir".into(),
            "data".into(),
            "-tags_dir".into(),
            "tags".into(),
            "-game_root_dir".into(),
            ".".into(),
            "model".into(),
            model_folder,
        ],
        cwd,
        &output.join("halo-tool-model.log"),
    )?;
    require(
        !tool_log.to_lowercase().contains("### error")
            && !tool_log.to_lowercase().contains("exception halt"),
        "Halo Tool reported a model import failure",
    )?;
    let compiled = stage
        .join("tags")
        .join(spark_core::safe_relative(&model.path)?);
    require(
        compiled.is_file() && fs::metadata(&compiled)?.len() > 64,
        "Halo Tool did not produce a native model from recovered JMS",
    )?;
    let edit = args[1].join(if cfg!(windows) {
        "invader-edit.exe"
    } else {
        "invader-edit"
    });
    let parsed = process(
        &edit,
        &["-t".into(), "tags".into(), "-H".into(), model.path.clone()],
        cwd,
        &output.join("compiled-model-readback.log"),
    )?;
    require(
        parsed.lines().any(|line| line.starts_with("0x")),
        "Native parser did not read the new compiled model",
    )?;
    let native_compile_ms = native_started.elapsed().as_millis();
    // Prove changed/truncated recovery output cannot reuse old acceptance.
    let recovered_file = receipt
        .tags_directory
        .join(spark_core::safe_relative(&model.path)?);
    let good = fs::read(&recovered_file)?;
    fs::write(&recovered_file, &good[..12])?;
    let refused = source_recovery::load(&root, &receipt.id)
        .err()
        .ok_or_else(|| SparkError::Invalid("Corrupt recovered output was accepted".into()))?
        .to_string();
    require(
        source_recovery::directory(&root, &receipt.id)? == receipt.directory,
        "A modified recovered project became inaccessible",
    )?;
    let fault = output.join("corrupt-fixture");
    fs::create_dir(&fault)?;
    fs::write(fault.join("truncated.gbxmodel"), &good[..12])?;
    let corrupt = spark_core::steam::command(edit.to_str().unwrap())
        .args(["-t", fault.to_str().unwrap(), "-H", "truncated.gbxmodel"])
        .output()?;
    project::atomic_write(
        &output.join("corrupt-native-readback.log"),
        &[corrupt.stdout, corrupt.stderr].concat(),
        false,
    )?;
    require(
        !corrupt.status.success(),
        "Independent native parser accepted truncated model",
    )?;
    fs::write(&recovered_file, &good)?;
    source_recovery::load(&root, &receipt.id)?;
    require(
        maps::hash_file(&args[0])? == original
            && maps::hash_file(&source.source.as_ref().unwrap().preserved_path)? == original,
        "Original/preserved source changed",
    )?;
    lease.finish(true, Some(original.clone()))?;
    project::atomic_write(
        &output.join("acceptance.json"),
        &serde_json::to_vec_pretty(&serde_json::json!({
            "complete":true,"mockedNativeTools":false,"sourceSha256":original,"plan":plan,"recovery":receipt,
            "reviewReadOnly":true,"stalePlanRefusedBeforeExtraction":true,"recoveryMs":recovery_ms,"reuseMs":reuse_ms,
            "reuseCreatedNoDuplicateNativeData":true,"reusedId":reused.id,"nativeCompilationMs":native_compile_ms,
            "nativeCompiledModel":compiled,"nativeCompiledModelSha256":maps::hash_file(&compiled)?,"haloToolSha256":maps::hash_file(&tool)?,
            "corruptRecoveredOutputRefused":refused,"independentParserRejectedTruncation":true,"restoredValidRecovery":true,
            "originalSourceUnchanged":true,"totalMs":started.elapsed().as_millis(),"gameplayAccepted":false,
            "limitations":["Native model reconstruction/import, not a complete map-cache gameplay test","No original authoring history/color plates reconstructed","Not a new human test of the C63 external-edited door revision"]
        }))?,
        false,
    )?;
    println!(
        "Real native recovery/model compilation accepted: {}",
        output.display()
    );
    Ok(())
}
fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
