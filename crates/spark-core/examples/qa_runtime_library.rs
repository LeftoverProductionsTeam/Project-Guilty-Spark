//! Seed one fresh isolated QA library from an explicitly selected accepted job.
//! This is not an IPC import route. It never launches programs or edits originals.
use spark_core::{
    library::Library,
    maps,
    project::{self, BuildRecord},
    safe_relative,
    working_tags::{TagHashManifest, WorkingTagsReceipt},
};
use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
};

const MAX_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const MAX_FILES: usize = 20_000;
fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, Box<dyn std::error::Error>> {
    spark_core::reject_links(path)?;
    if fs::metadata(path)?.len() > 4 * 1024 * 1024 {
        return Err("QA receipt exceeds4MiB".into());
    }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}
fn bounded_files(
    root: &Path,
    relative: &Path,
    files: &mut BTreeMap<PathBuf, u64>,
    bytes: &mut u64,
    depth: usize,
) -> Result<(), Box<dyn std::error::Error>> {
    if depth > 32 {
        return Err("QA tree exceeds32levels".into());
    }
    let path = root.join(relative);
    spark_core::reject_links(&path)?;
    let metadata = fs::metadata(&path)?;
    if metadata.is_dir() {
        for entry in fs::read_dir(&path)? {
            let entry = entry?;
            bounded_files(
                root,
                &relative.join(entry.file_name()),
                files,
                bytes,
                depth + 1,
            )?;
        }
        return Ok(());
    }
    if !metadata.is_file() {
        return Err("QA copy accepts regular files only".into());
    }
    if path.extension().is_some_and(|e| {
        matches!(
            e.to_string_lossy().to_ascii_lowercase().as_str(),
            "exe" | "dll" | "com" | "bat" | "cmd" | "ps1" | "msi" | "sh"
        )
    }) {
        return Err("Executable/script refused by QA copy".into());
    }
    let mut header = [0u8; 4];
    let read = fs::File::open(&path)?.read(&mut header)?;
    if read >= 2 && (&header[..2] == b"MZ" || &header[..2] == b"#!")
        || read == 4 && header == [0x7f, b'E', b'L', b'F']
    {
        return Err("Executable content refused by QA copy".into());
    }
    *bytes = bytes
        .checked_add(metadata.len())
        .ok_or("QA size overflow")?;
    if *bytes > MAX_BYTES || files.len() >= MAX_FILES {
        return Err("QA context exceeds4GiB/20000files".into());
    }
    files.insert(relative.to_path_buf(), metadata.len());
    Ok(())
}
fn inventory(
    job: &Path,
    manifest: &Option<TagHashManifest>,
) -> Result<BTreeMap<String, String>, Box<dyn std::error::Error>> {
    let manifest = manifest
        .as_ref()
        .ok_or("Validated job has no input/final hash inventory")?;
    let relative = safe_relative(&manifest.relative_path)?;
    if relative.components().count() != 1 {
        return Err("Unsafe inventory path".into());
    }
    let path = job.join(relative);
    spark_core::reject_links(&path)?;
    if maps::hash_file(&path)? != manifest.sha256 {
        return Err("Job inventory hash changed".into());
    }
    let hashes: BTreeMap<String, String> = read_json(&path)?;
    if hashes.len() != manifest.file_count || hashes.len() > MAX_FILES {
        return Err("Job inventory count differs".into());
    }
    Ok(hashes)
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() != 3 {
        return Err("Usage: qa_runtime_library <accepted-working-job> <private-project.gsproject> <fresh-library-root>".into());
    }
    let source = PathBuf::from(&args[0]);
    spark_core::reject_links(&source)?;
    let source = fs::canonicalize(source)?;
    let mut project = project::load_project(Path::new(&args[1]))?;
    if let Some(source) = &project.source {
        for path in [&source.original_path, &source.preserved_path] {
            spark_core::reject_links(path)?;
            if maps::hash_file(path)? != source.sha256 {
                return Err("QA imported source identity changed".into());
            }
        }
    }
    let mut record: BuildRecord = read_json(&source.join("receipt.json"))?;
    let mut receipt: WorkingTagsReceipt = read_json(&source.join("working-tags-receipt.json"))?;
    uuid::Uuid::parse_str(&record.id)?;
    if record.status != "validated"
        || record.target != "mcc-cea"
        || receipt.status != "validated"
        || receipt.schema_version != 1
        || receipt.job_id != record.id
        || receipt.project_id != project.id
        || receipt.project_fingerprint != project.fingerprint()?
        || record.project_fingerprint != project.fingerprint()?
        || serde_json::to_value(&receipt.build)? != serde_json::to_value(Some(&record))?
    {
        return Err("Accepted job/project/receipt identities disagree".into());
    }
    let output = record.output.as_ref().ok_or("Accepted output missing")?;
    spark_core::reject_links(output)?;
    let output = fs::canonicalize(output)?;
    let expected_output = source
        .join("output")
        .join(spark_core::mcc::package_map_name(&receipt.scenario_path)?);
    if output != fs::canonicalize(&expected_output)?
        || maps::hash_file(&output)?
            != record
                .sha256
                .as_deref()
                .ok_or("Accepted cache hash missing")?
    {
        return Err("Accepted cache identity/path changed".into());
    }
    let inspected = maps::inspect_map(&output, None)?;
    if inspected.header.version != 13
        || inspected.header.scenario_type != receipt.scenario_type
        || !inspected
            .scenario_path
            .replace('\\', "/")
            .eq_ignore_ascii_case(&receipt.scenario_path.replace('\\', "/"))
    {
        return Err("Accepted cache type/scenario changed".into());
    }
    let tags = fs::canonicalize(&receipt.tags_directory)?;
    if tags != fs::canonicalize(source.join("workspace/tags"))? {
        return Err("Accepted tag context escaped its job".into());
    }
    let _inputs = inventory(&source, &receipt.input_tag_hashes)?;
    let finals = inventory(&source, &receipt.final_tag_hashes)?;
    if receipt.input_script_hashes.is_some() {
        for (relative, hash) in inventory(&source, &receipt.input_script_hashes)? {
            let path = source
                .join("workspace/data")
                .join(safe_relative(&relative)?);
            spark_core::reject_links(&path)?;
            if maps::hash_file(&path)? != hash {
                return Err("Accepted native script source changed".into());
            }
        }
    }
    for (relative, hash) in &finals {
        let path = tags.join(safe_relative(relative)?);
        spark_core::reject_links(&path)?;
        if maps::hash_file(&path)? != *hash {
            return Err("Accepted native tag bytes changed".into());
        }
    }
    let mut files = BTreeMap::new();
    let mut bytes = 0;
    for relative in [
        "receipt.json",
        "working-tags-receipt.json",
        "working-tags-input.json",
        "working-tags-final.json",
        "project.gsproject",
        "output",
        "workspace/tags",
    ] {
        bounded_files(&source, Path::new(relative), &mut files, &mut bytes, 0)?;
    }
    if source.join("workspace/data").is_dir() {
        bounded_files(
            &source,
            Path::new("workspace/data"),
            &mut files,
            &mut bytes,
            0,
        )?;
    }
    if let Some(manifest) = &receipt.input_script_hashes {
        bounded_files(
            &source,
            &safe_relative(&manifest.relative_path)?,
            &mut files,
            &mut bytes,
            0,
        )?;
    }
    let actual_tags = files
        .keys()
        .filter(|p| p.starts_with("workspace/tags"))
        .count();
    if actual_tags != finals.len() {
        return Err("Accepted native tag tree gained/removed files".into());
    }
    let destination = std::path::absolute(&args[2])?;
    spark_core::reject_links(&destination)?;
    if destination.exists() {
        return Err("QA library destination already exists; no overwrite allowed".into());
    }
    let mut ancestor = destination.as_path();
    while !ancestor.exists() {
        ancestor = ancestor
            .parent()
            .ok_or("QA destination has no existing ancestor")?;
    }
    let ancestor = fs::canonicalize(ancestor)?;
    if ancestor.starts_with(&source) {
        return Err("QA destination cannot be inside accepted source".into());
    }
    fs::create_dir(&destination)?;
    let destination = fs::canonicalize(destination)?;
    let job = destination.join("jobs").join(&record.id);
    fs::create_dir_all(&job)?;
    let mut copied_hashes = BTreeMap::new();
    for (relative, size) in &files {
        let from = source.join(relative);
        let to = job.join(relative);
        spark_core::reject_links(&from)?;
        let hash = maps::hash_file(&from)?;
        if fs::metadata(&from)?.len() != *size {
            return Err("QA source changed during inventory".into());
        }
        fs::create_dir_all(to.parent().ok_or("QA output has no parent")?)?;
        let mut input = fs::File::open(&from)?;
        let mut output = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&to)?;
        std::io::copy(&mut input, &mut output)?;
        drop(output);
        if maps::hash_file(&from)? != hash || maps::hash_file(&to)? != hash {
            return Err("QA source/copy changed".into());
        }
        copied_hashes.insert(relative.to_string_lossy().replace('\\', "/"), hash);
    }
    fs::create_dir_all(job.join("workspace/maps"))?;
    record.output = Some(
        job.join("output")
            .join(spark_core::mcc::package_map_name(&receipt.scenario_path)?),
    );
    receipt.workspace = job.join("workspace");
    receipt.tags_directory = receipt.workspace.join("tags");
    receipt.build = Some(record.clone());
    project::atomic_write(
        &job.join("receipt.json"),
        &serde_json::to_vec_pretty(&record)?,
        false,
    )?;
    project::atomic_write(
        &job.join("working-tags-receipt.json"),
        &serde_json::to_vec_pretty(&receipt)?,
        false,
    )?;
    project.builds.retain(|b| b.id != record.id);
    project.builds.push(record.clone());
    let library = Library::open(&destination)?;
    if let Some(source) = &mut project.source {
        let preserved = destination
            .join("projects")
            .join(&project.id)
            .join("source.map");
        fs::create_dir_all(preserved.parent().ok_or("QA source has no parent")?)?;
        let mut input = fs::File::open(&source.preserved_path)?;
        let mut output = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&preserved)?;
        std::io::copy(&mut input, &mut output)?;
        drop(output);
        if maps::hash_file(&source.preserved_path)? != source.sha256
            || maps::hash_file(&preserved)? != source.sha256
        {
            return Err("QA preserved source copy changed".into());
        }
        source.preserved_path = preserved;
    }
    let entry = library.save(&project, None)?;
    if library.get(&project.id)?.fingerprint()? != record.project_fingerprint {
        return Err("Seeded library fingerprint changed".into());
    }
    let summary = serde_json::json!({"schemaVersion":1,"sourceJob":source,"library":std::path::absolute(&args[2])?,"projectId":project.id,"projectPath":entry.project_path,"jobId":record.id,"copiedFiles":files.len(),"copiedBytes":bytes,"cacheSha256":record.sha256,"tagBytesUnchanged":true,"manifestBytesUnchanged":true,"sourceUnchanged":true,"omitted":"Redundant workspace/maps cache and transient Tool logs; output cache preserved.","programsLaunched":false});
    project::atomic_write(
        &destination.join("qa-seed-receipt.json"),
        &serde_json::to_vec_pretty(&summary)?,
        false,
    )?;
    project::atomic_write(
        &destination.join("spark-native-ui-fixture.json"),
        &serde_json::to_vec_pretty(
            &serde_json::json!({"schemaVersion":1,"nativeFixture":true,"projectId":project.id,"workingBuildId":record.id,"title":project.title}),
        )?,
        false,
    )?;
    project::atomic_write(
        &destination.join("qa-copy-hashes.json"),
        &serde_json::to_vec_pretty(&copied_hashes)?,
        false,
    )?;
    println!("{}", serde_json::to_string_pretty(&summary)?);
    Ok(())
}
