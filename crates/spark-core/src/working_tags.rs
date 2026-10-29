//! Compile the current job-owned editable tags without re-extracting source.
//!
//! Native callers must inspect the selected official H1A Tool/Invader generation
//! and bind paths to the user's project before calling this module. This module
//! pins/rechecks the files, validates the parent native receipt/cache, copies tags
//! into a fresh owned job, and retains provenance. It never writes source tags,
//! SDK masters, installed maps, or an existing output job.

use crate::{
    build::{JobEvent, Runner},
    forge_build, invalid, maps,
    project::{self, BuildRecord, Project},
    safe_relative, Result, SparkError,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

const MAX_RECEIPT_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkingTagsInput {
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub bsp_audio: Option<crate::bsp_audio::Request>,
    pub parent_build: BuildRecord,
    pub tags_directory: PathBuf,
    pub scenario_path: String,
    pub scenario_type: u16,
    pub tool: PathBuf,
    pub invader_info: PathBuf,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingTagsReceipt {
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub bsp_audio: Option<crate::bsp_audio::Request>,
    pub schema_version: u32,
    pub job_id: String,
    pub project_id: String,
    pub project_fingerprint: String,
    pub parent_build_id: String,
    pub parent_output_sha256: String,
    pub scenario_path: String,
    pub scenario_type: u16,
    pub workspace: PathBuf,
    pub tags_directory: PathBuf,
    pub input_tag_hashes: Option<TagHashManifest>,
    pub final_tag_hashes: Option<TagHashManifest>,
    #[serde(default)]
    pub input_script_hashes: Option<TagHashManifest>,
    pub tool_identities: BTreeMap<String, String>,
    pub status: String,
    pub build: Option<BuildRecord>,
}

/// Large inventories live beside the compact context receipt. The receipt pins
/// their bytes without loading two full tag trees just to reopen a native tool.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagHashManifest {
    pub relative_path: String,
    pub sha256: String,
    pub file_count: usize,
}

fn save_hash_manifest(
    directory: &Path,
    name: &str,
    hashes: &BTreeMap<String, String>,
) -> Result<TagHashManifest> {
    let relative = safe_relative(name)?;
    if relative.components().count() != 1 {
        return invalid("Inventory manifest must be a single filename");
    }
    let path = directory.join(relative);
    project::atomic_write(&path, &serde_json::to_vec_pretty(hashes)?, false)?;
    Ok(TagHashManifest {
        relative_path: name.into(),
        sha256: maps::hash_file(&path)?,
        file_count: hashes.len(),
    })
}

fn verify_hash_manifest(parent: &Path, manifest: &Option<TagHashManifest>) -> Result<()> {
    let manifest = manifest.as_ref().ok_or_else(|| {
        SparkError::Invalid("Validated working-tag parent has no hash inventory".into())
    })?;
    let relative = safe_relative(&manifest.relative_path)?;
    if relative.components().count() != 1
        || manifest.file_count > 200000
        || !valid_hash(&manifest.sha256)
    {
        return invalid("Parent working-tag inventory identity is invalid");
    }
    let path = checked_file(&parent.join(relative))?;
    if maps::hash_file(&path)? != manifest.sha256 {
        return invalid("Parent working-tag hash inventory changed");
    }
    Ok(())
}

struct Prepared {
    tags: PathBuf,
    source_data: Option<PathBuf>,
    parent_output: PathBuf,
    parent_inspection: maps::MapInspection,
    tools: BTreeMap<String, String>,
}

fn checked_directory(path: &Path) -> Result<PathBuf> {
    crate::reject_links(path)?;
    if !path.is_dir() {
        return invalid("Working-tag directory is missing");
    }
    Ok(fs::canonicalize(path)?)
}

fn checked_file(path: &Path) -> Result<PathBuf> {
    crate::reject_links(path)?;
    if !path.is_file() {
        return invalid("Required working-tag input is not a regular file");
    }
    Ok(fs::canonicalize(path)?)
}

fn read_receipt<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    let path = checked_file(path)?;
    if fs::metadata(&path)?.len() > MAX_RECEIPT_BYTES {
        return invalid("Build receipt exceeds 4 MiB");
    }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn normalize_scenario(value: &str) -> Result<String> {
    let normalized = safe_relative(value)?.to_string_lossy().replace('\\', "/");
    if normalized.to_ascii_lowercase().ends_with(".scenario") {
        return invalid("Scenario path must not contain its tag extension");
    }
    Ok(normalized)
}

fn native_arguments(scenario: &str) -> Result<Vec<String>> {
    // H1A's tag index rejects '/' even when Windows accepts that spelling for
    // filesystem paths. Keep normalized identities separate from native tags.
    let tag = normalize_scenario(scenario)?.replace('/', "\\");
    Ok(vec![
        "-data_dir".into(),
        "data".into(),
        "-tags_dir".into(),
        "tags".into(),
        "-game_root_dir".into(),
        ".".into(),
        "build-cache-file".into(),
        tag,
        "classic".into(),
        "none".into(),
    ])
}

fn same_record(a: &BuildRecord, b: &BuildRecord) -> bool {
    a.id == b.id
        && a.status == b.status
        && a.target == b.target
        && a.sha256 == b.sha256
        && a.project_fingerprint == b.project_fingerprint
        && a.output == b.output
}

fn valid_hash(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|c| c.is_ascii_hexdigit())
}

fn parent_native_identity(
    project: &Project,
    input: &WorkingTagsInput,
    parent: &Path,
    tool_hash: &str,
) -> Result<Option<PathBuf>> {
    let working_receipt = parent.join("working-tags-receipt.json");
    let forge_receipt = parent.join("quickforge-receipt.json");
    let conversion_receipt = parent.join("conversion-manifest.json");
    let workspace = if working_receipt.exists() {
        let receipt: WorkingTagsReceipt = read_receipt(&working_receipt)?;
        if receipt.schema_version != 1
            || receipt.job_id != input.parent_build.id
            || receipt.project_id != project.id
            || receipt.project_fingerprint != project.fingerprint()?
            || receipt.status != "validated"
            || receipt
                .build
                .as_ref()
                .is_none_or(|b| !same_record(b, &input.parent_build))
            || receipt.tool_identities.get("haloTool").map(String::as_str) != Some(tool_hash)
        {
            return invalid("Parent working-tag native identity/receipt no longer matches");
        }
        verify_hash_manifest(parent, &receipt.input_tag_hashes)?;
        verify_hash_manifest(parent, &receipt.final_tag_hashes)?;
        if receipt.input_script_hashes.is_some() {
            verify_hash_manifest(parent, &receipt.input_script_hashes)?;
        }
        receipt.workspace
    } else if forge_receipt.exists() {
        let receipt: forge_build::QuickForgeBuildReceipt = read_receipt(&forge_receipt)?;
        if receipt.schema_version != 1
            || receipt.job_id != input.parent_build.id
            || receipt.project_id != project.id
            || receipt.project_fingerprint != project.fingerprint()?
            || receipt.status != "validated"
            || receipt
                .build
                .as_ref()
                .is_none_or(|b| !same_record(b, &input.parent_build))
            || receipt.tool_identities.get("haloTool").map(String::as_str) != Some(tool_hash)
        {
            return invalid("Parent QuickForge native identity/receipt no longer matches");
        }
        receipt
            .sources
            .ok_or_else(|| SparkError::Invalid("Parent native source workspace is missing".into()))?
            .directory
    } else if conversion_receipt.exists() {
        let receipt: serde_json::Value = read_receipt(&conversion_receipt)?;
        let source = project.source.as_ref().ok_or_else(|| {
            SparkError::Invalid("Native conversion parent has no preserved source".into())
        })?;
        if receipt.get("schemaVersion").and_then(|v| v.as_u64()) != Some(1)
            || receipt.get("compilerSha256").and_then(|v| v.as_str()) != Some(tool_hash)
            || receipt.get("sourceSha256").and_then(|v| v.as_str()) != Some(source.sha256.as_str())
            || receipt.get("sourcePreserved").and_then(|v| v.as_bool()) != Some(true)
        {
            return invalid("Parent conversion native compiler/source identity no longer matches");
        }
        parent.to_path_buf()
    } else {
        return invalid("Parent has no validated native H1A compiler provenance; an mcc-cea target label alone is insufficient");
    };
    let workspace = checked_directory(&workspace)?;
    if !workspace.starts_with(parent) {
        return invalid("Parent native source workspace escaped its job");
    }
    let data = workspace.join("data");
    if data.exists() {
        let data = checked_directory(&data)?;
        if !data.starts_with(parent) {
            return invalid("Parent native script source escaped its job");
        }
        Ok(Some(data))
    } else {
        Ok(None)
    }
}

fn preserved_source(project: &Project) -> Result<()> {
    if let Some(source) = &project.source {
        if maps::hash_file(&checked_file(&source.preserved_path)?)? != source.sha256 {
            return invalid("Preserved original changed; working-tag build refused");
        }
    }
    Ok(())
}

fn prepare(
    project: &Project,
    input: &WorkingTagsInput,
    jobs_root: &Path,
    job_id: &str,
) -> Result<Prepared> {
    project.validate()?;
    for id in [job_id, input.parent_build.id.as_str()] {
        uuid::Uuid::parse_str(id)
            .map_err(|_| SparkError::Invalid("Working-tag job ID is not a UUID".into()))?;
    }
    if job_id == input.parent_build.id {
        return invalid("Working-tag build needs a fresh job");
    }
    if input.parent_build.status != "validated"
        || input.parent_build.target != "mcc-cea"
        || input.parent_build.project_fingerprint != project.fingerprint()?
        || !project
            .builds
            .iter()
            .any(|b| same_record(b, &input.parent_build))
    {
        return invalid(
            "Working-tag parent does not belong to the current validated project revision",
        );
    }
    if input.scenario_type > 2 {
        return invalid("Unknown scenario type; campaign, multiplayer and UI remain distinct");
    }
    let scenario = normalize_scenario(&input.scenario_path)?;
    if !scenario.eq_ignore_ascii_case(&normalize_scenario(&project.scenario_path()?)?) {
        return invalid("Working-tag scenario differs from the current project");
    }
    let root = checked_directory(jobs_root)?;
    let parent = checked_directory(&root.join(&input.parent_build.id))?;
    if !parent.starts_with(&root) || parent == root {
        return invalid("Parent job escaped the owned job root");
    }
    let tags = checked_directory(&input.tags_directory)?;
    if !tags.starts_with(&parent) || tags == parent {
        return invalid("Working tags must remain inside their own validated parent job; SDK masters are not inputs");
    }
    let scenario_file = checked_file(&tags.join(safe_relative(&format!("{scenario}.scenario"))?))?;
    let globals = checked_file(&tags.join("globals/globals.globals"))?;
    if !scenario_file.starts_with(&tags)
        || !globals.starts_with(&tags)
        || fs::metadata(&scenario_file)?.len() < 64
        || fs::metadata(&globals)?.len() < 64
    {
        return invalid("Complete editable scenario/globals source tags are required");
    }
    let parent_output =
        checked_file(
            input.parent_build.output.as_ref().ok_or_else(|| {
                SparkError::Invalid("Parent has no validated output cache".into())
            })?,
        )?;
    let output_root = checked_directory(&parent.join("output"))?;
    if !parent_output.starts_with(output_root) {
        return invalid("Parent cache escaped its owned output directory");
    }
    let expected = input
        .parent_build
        .sha256
        .as_deref()
        .filter(|s| valid_hash(s))
        .ok_or_else(|| SparkError::Invalid("Parent cache hash is missing or invalid".into()))?;
    let parent_inspection = maps::inspect_map(&parent_output, None)?;
    if parent_inspection.sha256 != expected
        || parent_inspection.header.version != 13
        || parent_inspection.header.scenario_type != input.scenario_type
        || parent_inspection.header.extended
        || parent_inspection
            .header
            .build
            .contains("synthetic parser fixture")
        || !normalize_scenario(&parent_inspection.scenario_path)?.eq_ignore_ascii_case(&scenario)
    {
        return invalid(
            "Parent cache snapshot, engine, scenario or type no longer matches its native build",
        );
    }
    let record: BuildRecord = read_receipt(&parent.join("receipt.json"))?;
    if !same_record(&record, &input.parent_build) {
        return invalid("Parent cache receipt differs from the selected project build");
    }
    let mut tools = BTreeMap::new();
    for (key, file) in [
        ("haloTool", &input.tool),
        ("invaderInfo", &input.invader_info),
    ] {
        let path = checked_file(file)?;
        if fs::metadata(&path)?.len() > 256 * 1024 * 1024 {
            return invalid("Selected build tool exceeds the identity-check limit");
        }
        tools.insert(key.into(), maps::hash_file(&path)?);
    }
    if let Some(request) = &input.bsp_audio {
        let metadata = crate::bsp_audio::inspect(&parent_output, expected)?;
        crate::bsp_audio::validate(request, &input.parent_build.id, &metadata, &tags)?;
        let edit = checked_file(&input.invader_info.with_file_name(if cfg!(windows) {"invader-edit.exe"} else {"invader-edit"}))?;
        tools.insert("invaderEdit".into(), maps::hash_file(&edit)?);
    }
    let source_data = parent_native_identity(project, input, &parent, &tools["haloTool"])?;
    preserved_source(project)?;
    Ok(Prepared {
        tags,
        source_data,
        parent_output,
        parent_inspection,
        tools,
    })
}

/// Only engine script sources are carried forward. Original JMS/textures and
/// unrelated data are not copied merely to rebuild already-compiled BSP tags.
fn script_hashes(root: Option<&Path>, cancel: &AtomicBool) -> Result<BTreeMap<String, String>> {
    let Some(root) = root else {
        return Ok(BTreeMap::new());
    };
    let root = checked_directory(root)?;
    let mut stack = vec![(root.clone(), 0usize)];
    let mut hashes = BTreeMap::new();
    let mut bytes = 0u64;
    let mut entries = 0usize;
    while let Some((directory, depth)) = stack.pop() {
        if depth > 32 {
            return invalid("Native script source exceeds 32 directories");
        }
        for entry in fs::read_dir(directory)? {
            if cancel.load(Ordering::Relaxed) {
                return invalid("Build cancelled");
            }
            entries += 1;
            if entries > 200000 {
                return invalid("Native script source scan exceeds 200000 entries");
            }
            let entry = entry?;
            let path = entry.path();
            crate::reject_links(&path)?;
            let metadata = entry.metadata()?;
            if metadata.is_dir() {
                stack.push((path, depth + 1));
                continue;
            }
            if !metadata.is_file() {
                return invalid("Native script source contains a nonregular file");
            }
            if !path
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("hsc"))
            {
                continue;
            }
            bytes = bytes
                .checked_add(metadata.len())
                .ok_or_else(|| SparkError::Invalid("Native script size overflow".into()))?;
            if metadata.len() > 8 * 1024 * 1024 || bytes > 64 * 1024 * 1024 || hashes.len() >= 4096
            {
                return invalid("Native scripts exceed 8 MiB/file, 64 MiB total or 4096 sources");
            }
            let relative = path
                .strip_prefix(&root)
                .map_err(|_| SparkError::Invalid("Native script escaped its root".into()))?
                .to_string_lossy()
                .replace('\\', "/");
            safe_relative(&relative)?;
            hashes.insert(relative, maps::hash_file(&path)?);
        }
    }
    Ok(hashes)
}

/// Rehash the whole bounded tree, so additions/removals during staging/compile
/// are rejected as well as changes to files that happened to be enumerated first.
fn tree_hashes(root: &Path, cancel: &AtomicBool) -> Result<BTreeMap<String, String>> {
    let root = checked_directory(root)?;
    let mut stack = vec![(root.clone(), 0usize)];
    let mut hashes = BTreeMap::new();
    let mut bytes = 0u64;
    while let Some((directory, depth)) = stack.pop() {
        if depth > 32 {
            return invalid("Working tag tree exceeds 32 directories");
        }
        for entry in fs::read_dir(directory)? {
            if cancel.load(Ordering::Relaxed) {
                return invalid("Build cancelled");
            }
            let entry = entry?;
            let path = entry.path();
            crate::reject_links(&path)?;
            let meta = entry.metadata()?;
            if meta.is_dir() {
                stack.push((path, depth + 1));
                continue;
            }
            if !meta.is_file() {
                return invalid("Only regular files are accepted in editable tags");
            }
            bytes = bytes
                .checked_add(meta.len())
                .ok_or_else(|| SparkError::Invalid("Working tag size overflow".into()))?;
            if meta.len() > 2 * 1024 * 1024 * 1024
                || bytes > 16 * 1024 * 1024 * 1024
                || hashes.len() >= 200000
            {
                return invalid(
                    "Working tag inventory exceeds 2 GiB/file, 16 GiB total or 200000 files",
                );
            }
            let relative = path
                .strip_prefix(&root)
                .map_err(|_| SparkError::Invalid("Working tag escaped its root".into()))?
                .to_string_lossy()
                .replace('\\', "/");
            safe_relative(&relative)?;
            hashes.insert(relative, maps::hash_file(&path)?);
        }
    }
    Ok(hashes)
}

fn recheck_tools(input: &WorkingTagsInput, expected: &BTreeMap<String, String>) -> Result<()> {
    for (key, path) in [
        ("haloTool", &input.tool),
        ("invaderInfo", &input.invader_info),
    ] {
        if expected.get(key) != Some(&maps::hash_file(&checked_file(path)?)?) {
            return invalid("Selected tool executable changed during the working-tag build");
        }
    }
    Ok(())
}

fn run_with(
    project: &Project,
    input: &WorkingTagsInput,
    jobs_root: &Path,
    job_id: &str,
    cancel: Arc<AtomicBool>,
    on_event: impl Fn(JobEvent) + Send + Sync,
    invoke: impl Fn(&Runner<'_>, &Path, &[String], &Path, &str, u8) -> Result<String>,
) -> Result<BuildRecord> {
    if cancel.load(Ordering::Relaxed) {
        return invalid("Build cancelled");
    }
    let prepared = prepare(project, input, jobs_root, job_id)?;
    let directory = checked_directory(jobs_root)?.join(job_id);
    crate::reject_links(&directory)?;
    fs::create_dir(&directory)?; // exclusive: existing jobs are never reused
    let workspace = directory.join("workspace");
    fs::create_dir(&workspace)?;
    for folder in ["data", "maps"] {
        fs::create_dir(workspace.join(folder))?;
    }
    let tags = workspace.join("tags");
    let output_dir = directory.join("output");
    fs::create_dir(&output_dir)?;
    let fingerprint = project.fingerprint()?;
    let runner = Runner {
        id: job_id,
        project: &project.id,
        cancel: &cancel,
        event: &on_event,
    };
    let mut receipt = WorkingTagsReceipt {
        bsp_audio: input.bsp_audio.clone(),
        schema_version: 1,
        job_id: job_id.into(),
        project_id: project.id.clone(),
        project_fingerprint: fingerprint.clone(),
        parent_build_id: input.parent_build.id.clone(),
        parent_output_sha256: prepared.parent_inspection.sha256.clone(),
        scenario_path: normalize_scenario(&input.scenario_path)?,
        scenario_type: input.scenario_type,
        workspace: workspace.clone(),
        tags_directory: tags.clone(),
        input_tag_hashes: None,
        final_tag_hashes: None,
        input_script_hashes: None,
        tool_identities: prepared.tools.clone(),
        status: "failed".into(),
        build: None,
    };
    project::save_project(&directory.join("project.gsproject"), project)?;
    let mut input_hashes = BTreeMap::new();
    let input_scripts = script_hashes(prepared.source_data.as_deref(), &cancel)?;
    let result = (|| -> Result<PathBuf> {
        runner.emit("working-tags", "Copying current editable job tags; no source extraction/regeneration will overwrite native tool edits", 5, "info");
        input_hashes = forge_build::stage_tags(
            &prepared.tags,
            &tags,
            &cancel,
            |done, total, bytes, total_bytes| {
                runner.emit(
                    "tag-staging",
                    format!(
                        "Prepared {done}/{total} working tags · {}/{} MiB",
                        bytes / (1024 * 1024),
                        total_bytes / (1024 * 1024)
                    ),
                    (5 + done * 30 / total.max(1)) as u8,
                    "info",
                );
            },
        )?;
        if tree_hashes(&prepared.tags, &cancel)? != input_hashes {
            return invalid(
                "Working tags changed during staging; close/save the native editor and try again",
            );
        }
        receipt.input_tag_hashes = Some(save_hash_manifest(
            &directory,
            "working-tags-input.json",
            &input_hashes,
        )?);
        for (relative, expected) in &input_scripts {
            let source = prepared
                .source_data
                .as_ref()
                .unwrap()
                .join(safe_relative(relative)?);
            let target = workspace.join("data").join(safe_relative(relative)?);
            fs::create_dir_all(target.parent().unwrap())?;
            let mut input_file = fs::File::open(&source)?;
            let mut output_file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&target)?;
            std::io::copy(&mut input_file, &mut output_file)?;
            drop(output_file);
            if maps::hash_file(&source)? != *expected || maps::hash_file(&target)? != *expected {
                return invalid("Native script changed during staging");
            }
        }
        if script_hashes(prepared.source_data.as_deref(), &cancel)? != input_scripts {
            return invalid("Native script sources changed during staging");
        }
        if !input_scripts.is_empty() {
            receipt.input_script_hashes = Some(save_hash_manifest(
                &directory,
                "working-scripts-input.json",
                &input_scripts,
            )?);
        }
        recheck_tools(input, &prepared.tools)?;
        project::atomic_write(
            &directory.join("working-tags-receipt.json"),
            &serde_json::to_vec_pretty(&receipt)?,
            false,
        )?;
        if let Some(request) = &input.bsp_audio {
            let metadata = crate::bsp_audio::inspect(&prepared.parent_output, &receipt.parent_output_sha256)?;
            let edit = input.invader_info.with_file_name(if cfg!(windows) {"invader-edit.exe"} else {"invader-edit"});
            if maps::hash_file(&edit)? != prepared.tools["invaderEdit"] { return invalid("Invader edit changed after audio inspection"); }
            crate::bsp_audio::apply(request, &metadata, &tags, &edit, &runner, &workspace)?;
            if maps::hash_file(&edit)? != prepared.tools["invaderEdit"] { return invalid("Invader edit changed during audio editing"); }
        }
        let args = native_arguments(&receipt.scenario_path)?;
        // Use Runner's existing protected write phase: cancellation/timeout is
        // observed after native Tool exits, never by forcefully killing it.
        let log = invoke(&runner, &input.tool, &args, &workspace, "scenario", 50)?;
        if !crate::conversion::native_compile_succeeded(&log) {
            return invalid("H1A Tool did not confirm successful cache compilation; zero exit status is insufficient");
        }
        if cancel.load(Ordering::Relaxed) {
            return invalid("Build cancelled after native Tool completed");
        }
        recheck_tools(input, &prepared.tools)?;
        let name = crate::mcc::package_map_name(&receipt.scenario_path)?;
        let compiled = checked_file(&workspace.join("maps").join(&name))?;
        let compiled_hash = maps::hash_file(&compiled)?;
        let output = output_dir.join(&name);
        fs::copy(&compiled, &output)?;
        let inspected = maps::inspect_map(&output, None)?;
        if inspected.sha256 != compiled_hash
            || inspected.header.version != 13
            || inspected.header.extended
            || inspected.header.scenario_type != input.scenario_type
            || !normalize_scenario(&inspected.scenario_path)?
                .eq_ignore_ascii_case(&receipt.scenario_path)
            || (!prepared.parent_inspection.mesh.indices.is_empty()
                && inspected.mesh.indices.is_empty())
        {
            return invalid("Working-tag output has changed bytes, wrong engine/scenario/type or lost parent BSP collision");
        }
        if prepared
            .parent_inspection
            .scripts
            .iter()
            .any(|script| !inspected.scripts.iter().any(|s| s.name == script.name))
        {
            return invalid("Working-tag compilation lost an original scenario script; this output was not accepted");
        }
        if let Some(request) = &input.bsp_audio {
            let before = crate::bsp_audio::inspect(&prepared.parent_output, &receipt.parent_output_sha256)?;
            let after = crate::bsp_audio::inspect(&output, &inspected.sha256)?;
            crate::bsp_audio::verify_output(&before, &after, request)?;
            if inspected.mesh.positions != prepared.parent_inspection.mesh.positions || inspected.mesh.indices != prepared.parent_inspection.mesh.indices { return invalid("BSP audio rebuild changed collision geometry"); }
            project::atomic_write(&directory.join("bsp-audio-verification.json"), &serde_json::to_vec_pretty(&serde_json::json!({"source":before,"output":after,"collisionUnchanged":true,"gameplayAccepted":false}))?, false)?;
        }
        for check in ["crc32_mismatched", "is_protected", "stub_count"] {
            recheck_tools(input, &prepared.tools)?;
            let value = invoke(
                &runner,
                &input.invader_info,
                &[
                    "-T".into(),
                    check.into(),
                    output.to_string_lossy().into_owned(),
                ],
                &workspace,
                "verify",
                85,
            )?;
            if !["false", "0"].contains(&value.trim().to_ascii_lowercase().as_str()) {
                return invalid(format!(
                    "Working-tag output {check} verification failed: {value}"
                ));
            }
        }
        if tree_hashes(&prepared.tags, &cancel)? != input_hashes {
            return invalid("Working tags changed during compilation; no source edit was overwritten and the output was not accepted");
        }
        if maps::hash_file(&prepared.parent_output)? != receipt.parent_output_sha256 {
            return invalid("Parent cache changed during the working-tag build");
        }
        if maps::hash_file(&output)? != inspected.sha256 {
            return invalid("Compiled cache changed during validation");
        }
        preserved_source(project)?;
        if script_hashes(prepared.source_data.as_deref(), &cancel)? != input_scripts {
            return invalid(
                "Native script sources changed during compilation; output not accepted",
            );
        }
        recheck_tools(input, &prepared.tools)?;
        let final_hashes = tree_hashes(&tags, &cancel)?;
        receipt.final_tag_hashes = Some(save_hash_manifest(
            &directory,
            "working-tags-final.json",
            &final_hashes,
        )?);
        Ok(output)
    })();
    let record = match result {
        Ok(output) => BuildRecord {
            id: job_id.into(), timestamp: chrono::Utc::now().to_rfc3339(), status: "validated".into(), target: "mcc-cea".into(),
            sha256: Some(maps::hash_file(&output)?), output: Some(output), project_fingerprint: fingerprint,
            message: "Current working tags compiled without re-extraction; source identities, scenario type, index/CRC/protection/stubs and original script names verified. Game loading, gameplay and peers remain untested.".into(),
        },
        Err(e) => BuildRecord {
            id: job_id.into(), timestamp: chrono::Utc::now().to_rfc3339(), status: if cancel.load(Ordering::Relaxed) { "cancelled" } else { "failed" }.into(), target: "mcc-cea".into(),
            sha256: None, output: None, project_fingerprint: fingerprint, message: e.to_string(),
        },
    };
    receipt.status = record.status.clone();
    receipt.build = Some(record.clone());
    project::atomic_write(
        &directory.join("working-tags-receipt.json"),
        &serde_json::to_vec_pretty(&receipt)?,
        false,
    )?;
    project::atomic_write(
        &directory.join("receipt.json"),
        &serde_json::to_vec_pretty(&record)?,
        false,
    )?;
    runner.emit(
        &record.status,
        &record.message,
        100,
        if record.status == "validated" {
            "success"
        } else {
            "error"
        },
    );
    Ok(record)
}

/// Explicit native build. Tool files must already have passed the native
/// generation/installation checks; this function never downloads or selects one.
pub fn run_build_from_tags(
    project: &Project,
    input: &WorkingTagsInput,
    jobs_root: &Path,
    job_id: &str,
    cancel: Arc<AtomicBool>,
    on_event: impl Fn(JobEvent) + Send + Sync,
) -> Result<BuildRecord> {
    run_with(
        project,
        input,
        jobs_root,
        job_id,
        cancel,
        on_event,
        |runner, executable, args, cwd, phase, progress| {
            runner.run(executable, args, cwd, phase, progress)
        },
    )
}

pub use run_build_from_tags as run;

#[cfg(test)]
#[path = "../tests/common/mod.rs"]
mod test_fixture;

#[cfg(test)]
mod tests {
    use super::*;
    struct Case {
        _root: tempfile::TempDir,
        jobs: PathBuf,
        project: Project,
        input: WorkingTagsInput,
        bytes: Vec<u8>,
    }
    fn case() -> Case {
        let root = tempfile::tempdir().unwrap();
        let jobs = root.path().join("jobs");
        fs::create_dir(&jobs).unwrap();
        let parent_id = uuid::Uuid::new_v4().to_string();
        let parent = jobs.join(&parent_id);
        fs::create_dir(&parent).unwrap();
        let output = parent.join("output");
        fs::create_dir(&output).unwrap();
        let tags = parent.join("tags");
        fs::create_dir(&tags).unwrap();
        fs::create_dir_all(tags.join("levels/fixture")).unwrap();
        fs::create_dir(tags.join("globals")).unwrap();
        fs::write(tags.join("levels/fixture/fixture.scenario"), vec![0u8; 128]).unwrap();
        fs::write(tags.join("globals/globals.globals"), vec![0u8; 128]).unwrap();
        fs::write(
            tags.join("edited.weapon"),
            b"current authored native tag edit",
        )
        .unwrap();
        let mut bytes = test_fixture::fixture(13);
        bytes[0x40..0x60].fill(0);
        test_fixture::text(&mut bytes, 0x40, "unit structural fixture");
        test_fixture::put_u16(&mut bytes, 0x60, 2); // UI fixture need not contain gameplay collision
        let preserved = root.path().join("preserved.map");
        fs::write(&preserved, &bytes).unwrap();
        let cache = output.join("fixture.map");
        fs::write(&cache, &bytes).unwrap();
        let mut project = Project::new("Working tags regression");
        project.source = Some(project::Source {
            original_path: preserved.clone(),
            preserved_path: preserved.clone(),
            sha256: maps::hash_file(&preserved).unwrap(),
            cache_version: 13,
            engine: "mcc-cea".into(),
            scenario_path: "levels/fixture/fixture".into(),
            archive: None,
            resource_directory: None,
            resource_sha256: BTreeMap::new(),
        });
        let record = BuildRecord {
            id: parent_id,
            timestamp: chrono::Utc::now().to_rfc3339(),
            status: "validated".into(),
            target: "mcc-cea".into(),
            output: Some(cache),
            sha256: Some(maps::hash_file(&preserved).unwrap()),
            message: "Synthetic unit receipt; not gameplay proof".into(),
            project_fingerprint: project.fingerprint().unwrap(),
        };
        project.builds.push(record.clone());
        fs::write(
            parent.join("receipt.json"),
            serde_json::to_vec(&record).unwrap(),
        )
        .unwrap();
        let tool = root.path().join("tool.exe");
        let info = root.path().join("invader-info.exe");
        fs::write(&tool, b"test identity only; never executed").unwrap();
        fs::write(&info, b"test verifier identity only; never executed").unwrap();
        fs::write(parent.join("conversion-manifest.json"), serde_json::to_vec(&serde_json::json!({"schemaVersion":1,"compilerSha256":maps::hash_file(&tool).unwrap(),"sourceSha256":project.source.as_ref().unwrap().sha256,"sourcePreserved":true})).unwrap()).unwrap();
        let input = WorkingTagsInput {
            bsp_audio: None,
            parent_build: record,
            tags_directory: tags,
            scenario_path: "levels/fixture/fixture".into(),
            scenario_type: 2,
            tool,
            invader_info: info,
        };
        Case {
            _root: root,
            jobs,
            project,
            input,
            bytes,
        }
    }
    fn fake_compile(case: &Case, args: &[String], cwd: &Path, phase: &str) -> Result<String> {
        if phase == "scenario" {
            assert_eq!(args[6], "build-cache-file");
            assert_eq!(args[7], "levels\\fixture\\fixture");
            assert_eq!(
                fs::read(cwd.join("tags/edited.weapon"))?,
                b"current authored native tag edit"
            );
            fs::write(cwd.join("maps/fixture.map"), &case.bytes)?;
            Ok("successfully built cache file.\n".into())
        } else {
            assert_eq!(phase, "verify");
            Ok("0\n".into())
        }
    }
    #[test]
    fn stale_bsp_audio_request_is_refused_before_staging_or_tool_execution() {
        let mut c=case();let id=uuid::Uuid::new_v4().to_string();
        c.input.bsp_audio=Some(crate::bsp_audio::Request{parent_build_id:"other-parent".into(),source_sha256:"a".repeat(64),bsp_index:0,bsp_tag:"levels/fixture/fixture.scenario_structure_bsp".into(),bsp_tag_sha256:"b".repeat(64),changes:vec![]});
        let result=run_with(&c.project,&c.input,&c.jobs,&id,Arc::new(AtomicBool::new(false)),|_|{},|_,_,_,_,_,_|panic!("stale audio request ran a tool"));
        assert!(result.is_err());assert!(!c.jobs.join(&id).exists());
    }
    #[test]
    fn staged_working_edits_survive_without_source_extraction_and_chain_provenance() {
        let mut c = case();
        let before = tree_hashes(&c.input.tags_directory, &AtomicBool::new(false)).unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let record = run_with(
            &c.project,
            &c.input,
            &c.jobs,
            &id,
            Arc::new(AtomicBool::new(false)),
            |_| {},
            |_, _, args, cwd, phase, _| fake_compile(&c, args, cwd, phase),
        )
        .unwrap();
        assert_eq!(record.status, "validated");
        assert_eq!(record.target, "mcc-cea");
        assert_ne!(record.output, c.input.parent_build.output);
        assert_eq!(
            tree_hashes(&c.input.tags_directory, &AtomicBool::new(false)).unwrap(),
            before
        );
        let receipt: WorkingTagsReceipt =
            read_receipt(&c.jobs.join(&id).join("working-tags-receipt.json")).unwrap();
        let input: BTreeMap<String, String> = read_receipt(
            &c.jobs
                .join(&id)
                .join(&receipt.input_tag_hashes.as_ref().unwrap().relative_path),
        )
        .unwrap();
        let final_tags: BTreeMap<String, String> = read_receipt(
            &c.jobs
                .join(&id)
                .join(&receipt.final_tag_hashes.as_ref().unwrap().relative_path),
        )
        .unwrap();
        assert_eq!(input, before);
        assert_eq!(final_tags, before);
        assert_eq!(receipt.parent_build_id, c.input.parent_build.id);
        assert_eq!(receipt.scenario_type, 2);
        c.project.builds.push(record.clone());
        c.input.parent_build = record;
        c.input.tags_directory = receipt.tags_directory;
        let next = uuid::Uuid::new_v4().to_string();
        assert!(
            prepare(&c.project, &c.input, &c.jobs, &next).is_ok(),
            "A derived working-tag job is a valid next native editing parent"
        );
        fs::write(
            c.jobs
                .join(&id)
                .join(&receipt.input_tag_hashes.as_ref().unwrap().relative_path),
            b"tampered inventory",
        )
        .unwrap();
        assert!(prepare(&c.project, &c.input, &c.jobs, &next).is_err());
    }
    #[test]
    fn native_tool_arguments_use_backslashes_without_weakening_path_validation() {
        let args = native_arguments("levels/fixture/fixture").unwrap();
        assert_eq!(args[7], "levels\\fixture\\fixture");
        assert!(!args[7].contains('/'));
        for invalid in [
            "../outside",
            "levels//fixture",
            "C:/installed/game",
            "levels/fixture.SCENARIO",
        ] {
            assert!(native_arguments(invalid).is_err());
        }
    }
    #[test]
    fn additions_or_changes_during_compile_fail_without_overwriting_source() {
        for addition in [false, true] {
            let c = case();
            let id = uuid::Uuid::new_v4().to_string();
            let record = run_with(
                &c.project,
                &c.input,
                &c.jobs,
                &id,
                Arc::new(AtomicBool::new(false)),
                |_| {},
                |_, _, args, cwd, phase, _| {
                    let result = fake_compile(&c, args, cwd, phase)?;
                    if phase == "scenario" {
                        fs::write(
                            c.input.tags_directory.join(if addition {
                                "new.weapon"
                            } else {
                                "edited.weapon"
                            }),
                            b"new concurrent author edit",
                        )?;
                    }
                    Ok(result)
                },
            )
            .unwrap();
            assert_eq!(record.status, "failed");
            assert!(record.output.is_none());
            assert!(record
                .message
                .contains("Working tags changed during compilation"));
            assert_eq!(
                fs::read(c.input.tags_directory.join(if addition {
                    "new.weapon"
                } else {
                    "edited.weapon"
                }))
                .unwrap(),
                b"new concurrent author edit"
            );
        }
    }
    #[test]
    fn source_changes_after_staging_are_detected_before_any_compiler_runs() {
        let c = case();
        let id = uuid::Uuid::new_v4().to_string();
        let changed = AtomicBool::new(false);
        let record = run_with(
            &c.project,
            &c.input,
            &c.jobs,
            &id,
            Arc::new(AtomicBool::new(false)),
            |event| {
                if event.phase == "tag-staging"
                    && event.progress == 35
                    && !changed.swap(true, Ordering::Relaxed)
                {
                    fs::write(
                        c.input.tags_directory.join("edited.weapon"),
                        b"saved while staging",
                    )
                    .unwrap();
                }
            },
            |_, _, _, _, _, _| panic!("Source conflict must stop before native execution"),
        )
        .unwrap();
        assert_eq!(record.status, "failed");
        assert!(record.message.contains("changed during staging"));
        assert_eq!(
            fs::read(c.input.tags_directory.join("edited.weapon")).unwrap(),
            b"saved while staging"
        );
    }
    #[test]
    fn parent_job_hsc_sources_are_preserved_but_geometry_data_is_not_recopied() {
        let c = case();
        let parent = c.jobs.join(&c.input.parent_build.id);
        let data = parent.join("data");
        fs::create_dir_all(data.join("levels/fixture/scripts")).unwrap();
        fs::write(
            data.join("global_scripts.hsc"),
            b"(global short qa_counter 0)",
        )
        .unwrap();
        fs::write(
            data.join("levels/fixture/scripts/mission.hsc"),
            b"(script dormant qa_mission (sleep 1))",
        )
        .unwrap();
        fs::write(
            data.join("geometry.jms"),
            b"source geometry is not needed for cache build",
        )
        .unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let record = run_with(
            &c.project,
            &c.input,
            &c.jobs,
            &id,
            Arc::new(AtomicBool::new(false)),
            |_| {},
            |_, _, args, cwd, phase, _| {
                if phase == "scenario" {
                    assert_eq!(
                        fs::read(cwd.join("data/global_scripts.hsc"))?,
                        b"(global short qa_counter 0)"
                    );
                    assert!(cwd
                        .join("data/levels/fixture/scripts/mission.hsc")
                        .is_file());
                    assert!(!cwd.join("data/geometry.jms").exists());
                }
                fake_compile(&c, args, cwd, phase)
            },
        )
        .unwrap();
        assert_eq!(record.status, "validated");
        let receipt: WorkingTagsReceipt =
            read_receipt(&c.jobs.join(&id).join("working-tags-receipt.json")).unwrap();
        assert_eq!(receipt.input_script_hashes.unwrap().file_count, 2);
    }
    #[test]
    fn concurrent_hsc_changes_reject_output_without_restoring_old_source() {
        let c = case();
        let data = c.jobs.join(&c.input.parent_build.id).join("data");
        fs::create_dir(&data).unwrap();
        let script = data.join("global_scripts.hsc");
        fs::write(&script, b"(global short qa_counter 0)").unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let record = run_with(
            &c.project,
            &c.input,
            &c.jobs,
            &id,
            Arc::new(AtomicBool::new(false)),
            |_| {},
            |_, _, args, cwd, phase, _| {
                let result = fake_compile(&c, args, cwd, phase)?;
                if phase == "scenario" {
                    fs::write(&script, b"(global short qa_counter 1)")?;
                }
                Ok(result)
            },
        )
        .unwrap();
        assert_eq!(record.status, "failed");
        assert!(record.message.contains("script sources changed"));
        assert_eq!(fs::read(script).unwrap(), b"(global short qa_counter 1)");
    }
    #[test]
    fn changed_tool_identity_during_native_phase_invalidates_the_output() {
        let c = case();
        let id = uuid::Uuid::new_v4().to_string();
        let record = run_with(
            &c.project,
            &c.input,
            &c.jobs,
            &id,
            Arc::new(AtomicBool::new(false)),
            |_| {},
            |_, _, args, cwd, phase, _| {
                let result = fake_compile(&c, args, cwd, phase)?;
                if phase == "scenario" {
                    fs::write(&c.input.tool, b"tool changed while building")?;
                }
                Ok(result)
            },
        )
        .unwrap();
        assert_eq!(record.status, "failed");
        assert!(record.output.is_none());
        assert!(record.message.contains("tool executable changed"));
    }
    #[test]
    fn wrong_scenario_type_or_failed_crc_never_produces_a_validated_receipt() {
        for wrong_type in [false, true] {
            let mut c = case();
            if wrong_type {
                test_fixture::put_u16(&mut c.bytes, 0x60, 1);
            }
            let id = uuid::Uuid::new_v4().to_string();
            let record = run_with(
                &c.project,
                &c.input,
                &c.jobs,
                &id,
                Arc::new(AtomicBool::new(false)),
                |_| {},
                |_, _, args, cwd, phase, _| {
                    if !wrong_type && phase == "verify" && args[1] == "crc32_mismatched" {
                        Ok("true".into())
                    } else {
                        fake_compile(&c, args, cwd, phase)
                    }
                },
            )
            .unwrap();
            assert_eq!(record.status, "failed");
            assert!(record.sha256.is_none());
        }
    }
    #[test]
    fn stale_project_parent_or_external_sdk_tags_are_refused_before_tools() {
        let mut c = case();
        let id = uuid::Uuid::new_v4().to_string();
        c.input.parent_build.project_fingerprint = "stale".into();
        assert!(prepare(&c.project, &c.input, &c.jobs, &id).is_err());
        c.input.parent_build = c.project.builds[0].clone();
        c.input.tags_directory = c._root.path().to_path_buf();
        assert!(prepare(&c.project, &c.input, &c.jobs, &id).is_err());
    }
    #[test]
    fn native_compiler_receipt_and_parent_cache_hash_cannot_be_replaced_by_labels() {
        let c = case();
        let id = uuid::Uuid::new_v4().to_string();
        fs::write(
            c.jobs
                .join(&c.input.parent_build.id)
                .join("conversion-manifest.json"),
            br#"{"schemaVersion":1,"compilerSha256":"wrong","sourcePreserved":true}"#,
        )
        .unwrap();
        assert!(prepare(&c.project, &c.input, &c.jobs, &id).is_err());
        assert!(prepare(&c.project, &c.input, &c.jobs, &c.input.parent_build.id).is_err());
    }
    #[test]
    fn cancellation_and_existing_output_jobs_never_launch_or_replace_anything() {
        let c = case();
        let id = uuid::Uuid::new_v4().to_string();
        assert!(run_with(
            &c.project,
            &c.input,
            &c.jobs,
            &id,
            Arc::new(AtomicBool::new(true)),
            |_| {},
            |_, _, _, _, _, _| panic!("No tool may run")
        )
        .is_err());
        assert!(!c.jobs.join(&id).exists());
        fs::create_dir(c.jobs.join(&id)).unwrap();
        fs::write(c.jobs.join(&id).join("keep"), b"known-good").unwrap();
        assert!(run_with(
            &c.project,
            &c.input,
            &c.jobs,
            &id,
            Arc::new(AtomicBool::new(false)),
            |_| {},
            |_, _, _, _, _, _| panic!("No tool may run")
        )
        .is_err());
        assert_eq!(
            fs::read(c.jobs.join(&id).join("keep")).unwrap(),
            b"known-good"
        );
    }
}
