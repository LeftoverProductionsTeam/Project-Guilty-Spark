//! Compile the current job-owned editable tags without re-extracting source.
//!
//! Native callers must inspect the selected H1A Tool or reviewed CE Invader build
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
use sha2::{Digest,Sha256};
use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

const MAX_RECEIPT_BYTES: u64 = 4 * 1024 * 1024;

/// One explicitly reviewed new module, never a replacement for recovered source.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ScriptAttachment { pub filename:String, pub content:String, pub sha256:String }
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ScriptAttachmentIdentity { pub filename:String, pub sha256:String }
fn parse_controller_binding(content:&str)->Result<Option<crate::firefight::NativeControllerBinding>> {
        let line=content.lines().next().unwrap_or("").trim_start_matches('\u{feff}');
        let Some(json)=line.strip_prefix("; Spark source encounter bindings: ") else{return Ok(None);};
        let binding:crate::firefight::NativeControllerBinding=serde_json::from_str(json)?;binding.validate()?;Ok(Some(binding))
}
impl ScriptAttachment {
    fn controller_binding(&self)->Result<Option<crate::firefight::NativeControllerBinding>> {parse_controller_binding(&self.content)}
    fn relative_path(&self,scenario:&str)->Result<PathBuf> {
        let stem=self.filename.strip_suffix(".hsc").ok_or_else(||SparkError::Invalid("Attach a canonical .hsc module".into()))?;
        if stem.is_empty()||stem.len()>31||stem.eq_ignore_ascii_case("global_scripts")||!stem.bytes().all(|c|c.is_ascii_alphanumeric()||b"_-".contains(&c)) {
            return invalid("New script module needs a safe unique name of 1–31ASCII letters, digits, underscores or hyphens; global_scripts cannot be attached");
        }
        if self.content.trim().is_empty()||self.content.len()>1024*1024||self.content.chars().any(|c|c.is_control()&&!matches!(c,'\r'|'\n'|'\t'))||!valid_hash(&self.sha256)||crate::hex_bytes(Sha256::digest(self.content.as_bytes()))!=self.sha256 {
            return invalid("New script source must be reviewed UTF8 text within 1 MiB and match its SHA256");
        }
        Ok(Path::new(scenario).parent().unwrap_or(Path::new("")).join("scripts").join(&self.filename))
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkingTagsInput {
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub script_attachment:Option<ScriptAttachment>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub expected_encounter:Option<crate::native_operations::Operation>,
    /// Explicit source compilation; the default rebuild keeps existing compiled scripts.
    #[serde(default)]
    pub compile_scripts:bool,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub expected_tag_identity:Option<String>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub bsp_audio: Option<crate::bsp_audio::Request>,
    pub parent_build: BuildRecord,
    pub tags_directory: PathBuf,
    pub scenario_path: String,
    pub scenario_type: u16,
    /// Exact parent-pinned H1A Tool (mcc-cea) or Invader build (gbx-custom).
    /// Callers must admit the corresponding native source/profile first.
    pub tool: PathBuf,
    pub invader_info: PathBuf,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingTagsReceipt {
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub attached_script:Option<ScriptAttachmentIdentity>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub controller_binding:Option<crate::firefight::NativeControllerBinding>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub expected_encounter:Option<crate::native_operations::Operation>,
    #[serde(default,skip_serializing_if="Vec::is_empty")]
    pub compiled_script_modules:Vec<String>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub reviewed_tag_identity:Option<String>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub bsp_audio: Option<crate::bsp_audio::Request>,
    pub schema_version: u32,
    pub job_id: String,
    pub project_id: String,
    pub project_fingerprint: String,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub source_parent_fingerprint:Option<String>,
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
    parent_controller_binding:Option<crate::firefight::NativeControllerBinding>,
    source_project:Project,
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

// The parent receipt/cache, never the selected hosting runtime, chooses the
// native compiler contract. Keep the existing H1A default and standard CE route.
fn native_profile(target: &str) -> Result<(&'static str, u32, &'static str)> {
    match target {
        "mcc-cea" => Ok(("mcc-cea", 13, "haloTool")),
        "gbx-custom" => Ok(("gbx-custom", 609, "invaderBuild")),
        _ => invalid("Working-tag builds require a validated H1A or standard Custom Edition native parent"),
    }
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

/// Resolve an immutable native input snapshot without declaring its cache
/// compiled for newer authoring rules. Only recovered Firefight metadata may differ.
pub fn source_parent_project(project: &Project, build: &BuildRecord, jobs_root: &Path) -> Result<Project> {
    project.validate()?;
    let _ = native_profile(&build.target)?;
    if build.status != "validated"
        || !project.builds.iter().any(|record| same_record(record, build))
    {
        return invalid("Native source parent is not in this project's validated history");
    }
    if build.project_fingerprint == project.fingerprint()? {
        return Ok(project.clone());
    }
    if project.source.is_none() || project.quick_forge.is_some() {
        return invalid("Only recovered source can retain a native parent across Firefight authoring edits; editable geometry must use its normal build");
    }
    uuid::Uuid::parse_str(&build.id)
        .map_err(|_| SparkError::Invalid("Native source parent ID is invalid".into()))?;
    let root = checked_directory(jobs_root)?;
    let directory = checked_directory(&root.join(&build.id))?;
    if directory == root || !directory.starts_with(&root) {
        return invalid("Native parent escaped its owned job root");
    }
    let snapshot = checked_file(&directory.join("project.gsproject"))?;
    if !snapshot.starts_with(&directory) {
        return invalid("Native project snapshot escaped its job");
    }
    let mut parent = project::load_project(&snapshot)?;
    if parent.id != project.id || parent.fingerprint()? != build.project_fingerprint {
        return invalid("Native project snapshot does not match its original compiled revision");
    }
    let mut before = serde_json::to_value(&parent)?;
    let mut after = serde_json::to_value(project)?;
    for key in ["firefight", "history", "builds", "modifiedAt"] {
        // Project's serialized representation is a struct/object. Only these
        // authoring and bookkeeping fields may differ, including on Undo.
        before.as_object_mut().ok_or_else(|| SparkError::Invalid("Invalid native project snapshot".into()))?.remove(key);
        after.as_object_mut().ok_or_else(|| SparkError::Invalid("Invalid current project snapshot".into()))?.remove(key);
    }
    if before != after {
        return invalid("Geometry, tags, assets, paths or other source inputs changed; Firefight-only parent reuse was refused");
    }
    parent.builds = project.builds.clone();
    Ok(parent)
}

fn valid_hash(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|c| c.is_ascii_hexdigit())
}

fn parent_native_identity(
    project: &Project,
    input: &WorkingTagsInput,
    parent: &Path,
    tool_hash: &str,
) -> Result<(Option<PathBuf>,Option<crate::firefight::NativeControllerBinding>)> {
    let (_, _, compiler_key) = native_profile(&input.parent_build.target)?;
    let mut controller_binding=None;
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
            || receipt.tool_identities.get(compiler_key).map(String::as_str) != Some(tool_hash)
        {
            return invalid("Parent working-tag native identity/receipt no longer matches");
        }
        verify_hash_manifest(parent, &receipt.input_tag_hashes)?;
        verify_hash_manifest(parent, &receipt.final_tag_hashes)?;
        if receipt.input_script_hashes.is_some() {
            verify_hash_manifest(parent, &receipt.input_script_hashes)?;
        }
        controller_binding=receipt.controller_binding;
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
            || receipt.tool_identities.get(compiler_key).map(String::as_str) != Some(tool_hash)
        {
            return invalid("Parent QuickForge native identity/receipt no longer matches");
        }
        receipt
            .sources
            .ok_or_else(|| SparkError::Invalid("Parent native source workspace is missing".into()))?
            .directory
    } else if conversion_receipt.exists() {
        if input.parent_build.target != "mcc-cea" {
            return invalid("This conversion receipt describes H1A compiler provenance, not a standard CE native source build");
        }
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
        return invalid("Parent has no matching validated native compiler provenance; a target label alone is insufficient");
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
        Ok((Some(data),controller_binding))
    } else {
        Ok((None,controller_binding))
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
    let (_, cache_version, compiler_key) = native_profile(&input.parent_build.target)?;
    let source_project=source_parent_project(project,&input.parent_build,jobs_root)?;
    let authoring_pending=source_project.fingerprint()?!=project.fingerprint()?;
    if authoring_pending&&!input.compile_scripts{return invalid("Firefight authoring rules changed. Attach/review the matching controller and explicitly compile scripts; a tag-only rebuild cannot apply them");}
    if input.parent_build.status != "validated"
        || input.parent_build.project_fingerprint != source_project.fingerprint()?
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
    if let Some(attachment)=&input.script_attachment {
        if !input.compile_scripts{return invalid("Attaching source requires explicit script compilation; a tag-only rebuild cannot attach it");}
        let _=attachment.relative_path(&scenario)?;
        let _=attachment.controller_binding()?;
    }
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
    if let Some(expected)=&input.expected_encounter {
        expected.validate("scnr",&format!("{scenario}.scenario"))?;
        if !matches!(expected,crate::native_operations::Operation::AppendEncounter{..}){return invalid("Working-tag encounter expectation is not a reviewed append");}
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
        || parent_inspection.header.version != cache_version
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
        (compiler_key, &input.tool),
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
    let (source_data,parent_controller_binding) = parent_native_identity(&source_project, input, &parent, &tools[compiler_key])?;
    if let Some(binding)=&parent_controller_binding{binding.verify_map(&parent_inspection)?;}
    if input.compile_scripts {
        if source_data.is_none()&&input.script_attachment.is_none(){return invalid("This working source has no recovered HaloScript directory. Recover/review the original source modules first; compiled script bytecode is retained");}
        for (key,name) in [("invaderEdit","invader-edit"),("invaderScript","invader-script")] {
            let path=checked_file(&input.invader_info.with_file_name(if cfg!(windows){format!("{name}.exe")}else{name.into()}))?;
            if fs::metadata(&path)?.len()>256*1024*1024{return invalid("Native script tool exceeds its identity-check limit");}
            tools.insert(key.into(),maps::hash_file(&path)?);
        }
    }
    preserved_source(project)?;
    Ok(Prepared {
        tags,
        source_data,
        parent_controller_binding,
        source_project,
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

/// Compile only this scenario's reviewed modules, preserving its original native
/// script/global names. This does not execute game scripts or claim semantic parity.
fn compile_script_sources(
    input:&WorkingTagsInput, prepared:&Prepared, tags:&Path, workspace:&Path,
    sources:&BTreeMap<String,String>, runner:&Runner<'_>,
    invoke:&impl Fn(&Runner<'_>,&Path,&[String],&Path,&str,u8)->Result<String>,
)->Result<Vec<String>> {
    let scenario=normalize_scenario(&input.scenario_path)?;
    let tag=format!("{scenario}.scenario");
    let edit=input.invader_info.with_file_name(if cfg!(windows){"invader-edit.exe"}else{"invader-edit"});
    let compiler=input.invader_info.with_file_name(if cfg!(windows){"invader-script.exe"}else{"invader-script"});
    let read_names=|field:&str,limit:usize|->Result<Vec<String>> {
        recheck_tools(input,&prepared.tools)?;
        let count=invoke(runner,&edit,&["-t".into(),tags.to_string_lossy().into_owned(),"-C".into(),field.into(),tag.clone()],workspace,"script-readback",42)?
            .trim().parse::<usize>().map_err(|_|SparkError::Invalid(format!("Native {field} count unavailable")))?;
        if count>limit{return invalid(format!("Native {field} exceeds the selected scenario capacity"));}
        if count==0{return Ok(vec![]);}
        let output=invoke(runner,&edit,&["-t".into(),tags.to_string_lossy().into_owned(),"-G".into(),format!("{field}[*].name"),tag.clone()],workspace,"script-readback",42)?;
        let names=output.lines().map(str::to_owned).collect::<Vec<_>>();
        if names.len()!=count||names.iter().any(|name|name.is_empty()||name.chars().any(char::is_control)) {return invalid(format!("Native {field} names do not match their source array"));}
        Ok(names)
    };
    let scripts=read_names("scripts",1024)?;
    let globals=read_names("globals",512)?;
    let original_modules=read_names("source_files",16)?;
    if (!scripts.is_empty()||!globals.is_empty())&&original_modules.is_empty(){return invalid("Original script/global bytecode has no recovered module inventory; attaching source cannot replace it");}
    crate::source_recovery::validate_output_names(&original_modules.join("\n"))?;
    let mut original_keys=std::collections::BTreeSet::new();
    if original_modules.iter().any(|name|!original_keys.insert(name.to_ascii_lowercase())) {return invalid("Original HaloScript module names collide; recover/reconcile them before compilation");}
    // Preserve native script signatures as well as names in the final cache check.
    let mut original_names=scripts.clone();original_names.sort();
    let mut cache_names=prepared.parent_inspection.scripts.iter().map(|script|script.name.clone()).collect::<Vec<_>>();cache_names.sort();
    if original_names!=cache_names{return invalid("Working scenario script names differ from its accepted parent cache; reconcile the native source before recompiling HaloScript");}
    let directory=Path::new(&scenario).parent().unwrap_or(Path::new("")).join("scripts");
    let prefix=format!("{}/",directory.to_string_lossy().replace('\\',"/"));
    let mut modules=vec![];
    let mut module_keys=std::collections::BTreeSet::new();
    for path in sources.keys().filter(|path|path.starts_with(&prefix)) {
        let relative=path.strip_prefix(&prefix).unwrap();
        if relative.contains('/') {return invalid("Scenario HaloScript modules must be direct files in its scripts directory");}
        let Some(name)=relative.strip_suffix(".hsc") else {return invalid("Use canonical .hsc filenames before compiling scenario scripts");};
        crate::source_recovery::validate_output_names(name)?;
        if name.len()>31 || !name.is_ascii() || name.chars().any(char::is_control) || name.eq_ignore_ascii_case("global_scripts") || !module_keys.insert(name.to_ascii_lowercase()) {
            return invalid("Scenario script module names must be unique safe ASCII names of at most31bytes; global_scripts belongs at the data root");
        }
        modules.push(name.to_owned());
    }
    let has_global=original_modules.iter().any(|name|name=="global_scripts");
    if has_global&&!sources.contains_key("global_scripts.hsc") {return invalid("Original global_scripts.hsc is missing; no script compilation was attempted");}
    for name in original_modules.iter().filter(|name|name.as_str()!="global_scripts") {
        if !modules.contains(name){return invalid(format!("Original script module {name}.hsc is missing; recover/review it before recompiling"));}
    }
    if modules.is_empty() || modules.len()+usize::from(has_global)>16 {return invalid("Script compilation needs1–16complete source modules within the native scenario limit");}
    let mut args=vec!["-g".into(),native_profile(&input.parent_build.target)?.0.into(),"-t".into(),tags.to_string_lossy().into_owned(),"-d".into(),workspace.join("data").to_string_lossy().into_owned()];
    // Never adopt an unrelated global_scripts.hsc implicitly.
    if !has_global{args.push("-E".into());}
    for name in &modules {args.extend(["-x".into(),name.clone()]);}
    args.push(scenario);
    recheck_tools(input,&prepared.tools)?;
    let output=invoke(runner,&compiler,&args,workspace,"scripts",46)?;
    if output.lines().any(|line|line.trim().to_ascii_lowercase().starts_with("error:")){return invalid("Native HaloScript compiler reported errors; the candidate and previous-good cache remain separate");}
    recheck_tools(input,&prepared.tools)?;
    let final_scripts=read_names("scripts",1024)?;
    let final_globals=read_names("globals",512)?;
    let mut expected_modules=modules.clone();if has_global{expected_modules.push("global_scripts".into());}
    let mut final_modules=read_names("source_files",16)?;expected_modules.sort();final_modules.sort();
    let retained=|before:&[String],after:&[String]| {
        before.iter().all(|name|after.iter().filter(|other|*other==name).count()>=before.iter().filter(|other|*other==name).count())
    };
    if expected_modules!=final_modules || !retained(&scripts,&final_scripts) || !retained(&globals,&final_globals) {
        return invalid("Script compilation lost original native scripts/globals or changed the selected module inventory; no new cache was adopted");
    }
    if script_hashes(Some(&workspace.join("data")),runner.cancel)?!=*sources {return invalid("Staged HaloScript sources changed during compilation");}
    Ok(expected_modules)
}

/// Rehash the whole bounded tree, so additions/removals during staging/compile
/// are rejected as well as changes to files that happened to be enumerated first.
pub(crate) fn tree_hashes(root: &Path, cancel: &AtomicBool) -> Result<BTreeMap<String, String>> {
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
    let (_, _, compiler_key) = native_profile(&input.parent_build.target)?;
    for (key, path) in [
        (compiler_key, &input.tool),
        ("invaderInfo", &input.invader_info),
    ] {
        if expected.get(key) != Some(&maps::hash_file(&checked_file(path)?)?) {
            return invalid("Selected tool executable changed during the working-tag build");
        }
    }
    for (key,name) in [("invaderEdit","invader-edit"),("invaderScript","invader-script")] {
        if let Some(hash)=expected.get(key) {
            let path=input.invader_info.with_file_name(if cfg!(windows){format!("{name}.exe")}else{name.into()});
            if hash!=&maps::hash_file(&checked_file(&path)?)?{return invalid("Selected native script/audio tool changed during the working-tag build");}
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
    let staging=crate::native_staging::inventory(&prepared.tags,&cancel)?;
    let estimate=crate::storage::estimate_copy(staging.files.len(),staging.bytes).saturating_add(1024*1024*1024);
    let storage_lease=crate::storage::Store::for_output(&directory)?.reserve(&directory,Some(&prepared.tags),estimate,crate::storage::Category::Staging,"Reviewed native working-tag rebuild; isolated full-source fallback")?;
    crate::reject_links(&directory)?;
    fs::create_dir(&directory)?; // exclusive: existing jobs are never reused
    storage_lease.mark_owned()?;
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
        attached_script:None,
        controller_binding:prepared.parent_controller_binding.clone(),
        expected_encounter:input.expected_encounter.clone(),
        compiled_script_modules:vec![],
        reviewed_tag_identity:input.expected_tag_identity.clone(),
        bsp_audio: input.bsp_audio.clone(),
        schema_version: 1,
        job_id: job_id.into(),
        project_id: project.id.clone(),
        project_fingerprint: fingerprint.clone(),
        source_parent_fingerprint:if prepared.source_project.fingerprint()?!=fingerprint{Some(prepared.source_project.fingerprint()?)}else{None},
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
    let mut staged_scripts=input_scripts.clone();
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
        if let Some(expected)=&input.expected_tag_identity {
            if &inventory_identity(&input_hashes)?!=expected{return invalid("Native working tags no longer match the reviewed edit plan; no compiler ran. Review the new source revision before building");}
        }
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
        fs::create_dir_all(workspace.join("data"))?;
        for (relative, expected) in &input_scripts {
            let source = prepared
                .source_data
                .as_ref()
                .unwrap()
                .join(safe_relative(relative)?);
            let target = workspace.join("data").join(safe_relative(relative)?);
            fs::create_dir_all(target.parent().unwrap())?;
            crate::native_staging::copy_file(&source,&target,fs::metadata(&source)?.len(),Some(expected),&cancel)?;
        }
        if script_hashes(prepared.source_data.as_deref(), &cancel)? != input_scripts {
            return invalid("Native script sources changed during staging");
        }
        if let Some(attachment)=&input.script_attachment {
            let relative=attachment.relative_path(&receipt.scenario_path)?;
            let key=relative.to_string_lossy().replace('\\',"/");
            if staged_scripts.keys().any(|path|path.eq_ignore_ascii_case(&key)) {
                return invalid("A source module with this name already exists. Edit/review its original source through Open script source folder; attachment never replaces it");
            }
            let target=workspace.join("data").join(&relative);
            crate::reject_links(&target)?;
            if target.exists(){return invalid("Script attachment would replace an existing staged file");}
            fs::create_dir_all(target.parent().unwrap())?;
            project::atomic_write(&target,attachment.content.as_bytes(),false)?;
            if maps::hash_file(&target)?!=attachment.sha256{return invalid("Attached script bytes differ from the reviewed source");}
            staged_scripts.insert(key,attachment.sha256.clone());
            // The complete selected-scenario source set is reconciled below.
            receipt.attached_script=Some(ScriptAttachmentIdentity{filename:attachment.filename.clone(),sha256:attachment.sha256.clone()});
        }
        if script_hashes(Some(&workspace.join("data")),&cancel)?!=staged_scripts{return invalid("Staged script inventory differs from the original modules and reviewed attachment");}
        if input.compile_scripts {
            let script_directory=Path::new(&receipt.scenario_path).parent().unwrap_or(Path::new("")).join("scripts");
            let prefix=format!("{}/",script_directory.to_string_lossy().replace('\\',"/"));
            let mut controller=None;
            for (relative,hash) in staged_scripts.iter().filter(|(path,_)|path.starts_with(&prefix)&&!path[prefix.len()..].contains('/')) {
                let path=checked_file(&workspace.join("data").join(safe_relative(relative)?))?;
                let mut bytes=vec![];fs::File::open(path)?.take(8*1024*1024+1).read_to_end(&mut bytes)?;
                if bytes.len()>8*1024*1024{return invalid("Controller source exceeded the existing script-file bound");}
                let beginning=bytes.strip_prefix(&[0xef,0xbb,0xbf]).unwrap_or(&bytes);
                if !beginning.starts_with(b"; Spark source encounter bindings: "){continue;}
                if crate::hex_bytes(Sha256::digest(&bytes))!=*hash{return invalid("Controller module changed after staging");}
                let source=std::str::from_utf8(&bytes).map_err(|_|SparkError::Invalid("Bound controller metadata needs valid UTF8 source".into()))?;
                let binding=parse_controller_binding(source)?.ok_or_else(||SparkError::Invalid("Controller metadata disappeared".into()))?;
                let known_parent=prepared.parent_controller_binding.as_ref().is_some_and(|parent|parent.source_sha256==binding.source_sha256);
                if input.scenario_type!=0||(!known_parent&&!project.source.as_ref().is_some_and(|source|source.sha256==binding.source_sha256)&&input.parent_build.sha256.as_deref()!=Some(binding.source_sha256.as_str())) {
                    return invalid("Controller source identity differs from the reviewed map/native lineage; no compiler ran");
                }
                if controller.is_some(){return invalid("Multiple bound controller modules need explicit source reconciliation; no compiler ran");}
                controller=Some(binding);
            }
            // A tag-only rebuild, or a removed authoring comment, cannot silently
            // drop an accepted native actor/count readback requirement.
            if controller.is_some(){receipt.controller_binding=controller;}
        }
        if prepared.source_project.fingerprint()?!=fingerprint {
            let binding=receipt.controller_binding.as_ref().ok_or_else(||SparkError::Invalid("Changed Firefight authoring needs a reviewed bound controller; no compiler ran".into()))?;
            if binding.rules.as_ref()!=project.firefight.as_ref()||binding.rules.is_none(){return invalid("Controller source was generated for different Firefight rules. Export/review the current controller before compiling");}
        }
        if !staged_scripts.is_empty() {
            receipt.input_script_hashes = Some(save_hash_manifest(
                &directory,
                "working-scripts-input.json",
                &staged_scripts,
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
        if input.compile_scripts {
            receipt.compiled_script_modules=compile_script_sources(input,&prepared,&tags,&workspace,&staged_scripts,&runner,&invoke)?;
            project::atomic_write(&directory.join("working-tags-receipt.json"),&serde_json::to_vec_pretty(&receipt)?,false)?;
        }
        let (engine, cache_version, _) = native_profile(&input.parent_build.target)?;
        let args = if cache_version == 13 {
            native_arguments(&receipt.scenario_path)?
        } else {
            // Same CE compiler interface as QuickForge. All resources are
            // embedded from reviewed native tags; no shared-bank guessing.
            vec!["-g".into(),engine.into(),"-t".into(),tags.to_string_lossy().into_owned(),
                "-m".into(),output_dir.to_string_lossy().into_owned(),"--resource-usage".into(),
                "none".into(),receipt.scenario_path.clone()]
        };
        // Use Runner's existing protected write phase: cancellation/timeout is
        // observed after native Tool exits, never by forcefully killing it.
        let log = invoke(&runner, &input.tool, &args, &workspace, "scenario", 50)?;
        if cache_version == 13 && !crate::conversion::native_compile_succeeded(&log) {
            return invalid("H1A Tool did not confirm successful cache compilation; zero exit status is insufficient");
        }
        if cache_version == 609 && log.lines().any(|line| {
            let line=line.trim_start().to_ascii_lowercase();
            line.starts_with("error:") || line.starts_with("error ") || line.contains("### error") || line.contains("exception halt")
        }) {
            return invalid("CE native compiler reported an error; no output was adopted");
        }
        if cancel.load(Ordering::Relaxed) {
            return invalid("Build cancelled after native Tool completed");
        }
        recheck_tools(input, &prepared.tools)?;
        let name = crate::mcc::package_map_name(&receipt.scenario_path)?;
        let compiled = checked_file(&if cache_version == 13 { workspace.join("maps").join(&name) } else { output_dir.join(&name) })?;
        let compiled_hash = maps::hash_file(&compiled)?;
        let output = output_dir.join(&name);
        if cache_version == 13 { fs::copy(&compiled, &output)?; }
        let inspected = maps::inspect_map(&output, None)?;
        let sound_classes=crate::audio_rules::verify(&output,&inspected)?;
        project::atomic_write(&workspace.join("native-sound-classes.json"),&serde_json::to_vec_pretty(&sound_classes)?,false)?;
        if inspected.sha256 != compiled_hash
            || inspected.header.version != cache_version
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
        if let Some(expected)=&input.expected_encounter{expected.verify_compiled_encounter(&inspected)?;}
        if let Some(binding)=&receipt.controller_binding{binding.verify_map(&inspected)?;}
        if input.compile_scripts {
            for script in &prepared.parent_inspection.scripts {
                let expected=prepared.parent_inspection.scripts.iter().filter(|other|other.name==script.name&&other.script_type==script.script_type&&other.return_type==script.return_type).count();
                let actual=inspected.scripts.iter().filter(|other|other.name==script.name&&other.script_type==script.script_type&&other.return_type==script.return_type).count();
                if actual<expected{return invalid(format!("Compiled cache lost an original HaloScript signature: {}",script.name));}
            }
            if script_hashes(Some(&workspace.join("data")),&cancel)?!=staged_scripts{return invalid("Staged HaloScript source changed before cache adoption");}
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
            id: job_id.into(), timestamp: chrono::Utc::now().to_rfc3339(), status: "validated".into(), target: input.parent_build.target.clone(),
            sha256: Some(maps::hash_file(&output)?), output: Some(output), project_fingerprint: fingerprint,
            message: if let Some(attachment)=&receipt.attached_script {
                format!("Added reviewed module {} (SHA256 {}) in separate native source; original modules and script signatures retained. Native compilation/readback passed, gameplay remains untested.",attachment.filename,attachment.sha256)
            } else if input.compile_scripts {
                "Reviewed scenario HaloScript and current working tags compiled in separate staging; source/tool identities, original script signatures and native cache checks passed. Game behavior and peers remain untested.".into()
            } else {
                "Current working tags compiled without re-extraction; source identities and native cache checks passed. Existing compiled scripts are retained; edited .hsc files require Compile scripts & build. Gameplay and peers remain untested.".into()
            },
        },
        Err(e) => BuildRecord {
            id: job_id.into(), timestamp: chrono::Utc::now().to_rfc3339(), status: if cancel.load(Ordering::Relaxed) { "cancelled" } else { "failed" }.into(), target: input.parent_build.target.clone(),
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
    if record.status=="validated"{storage_lease.finish(true,Some(record.project_fingerprint.clone()))?;}else{drop(storage_lease);}
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

fn inventory_identity(hashes:&BTreeMap<String,String>)->Result<String> {
    Ok(crate::hex_bytes(Sha256::digest(serde_json::to_vec(hashes)?)))
}
/// Content identity of the same complete, bounded native tree staged by the
/// compiler. This is application provenance, not a new native tag format.
pub fn source_identity(root:&Path,cancel:&AtomicBool)->Result<String> {
    inventory_identity(&tree_hashes(root,cancel)?)
}

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
            audio_resources: None,
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
            script_attachment:None,
            expected_encounter:None,
            compile_scripts:false,
            expected_tag_identity:None,
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
    fn changed_reviewed_native_tree_never_reaches_the_compiler() {
        let mut c=case();c.input.expected_tag_identity=Some(source_identity(&c.input.tags_directory,&AtomicBool::new(false)).unwrap());
        fs::write(c.input.tags_directory.join("edited.weapon"),b"different source after review").unwrap();
        let id=uuid::Uuid::new_v4().to_string();
        let record=run_with(&c.project,&c.input,&c.jobs,&id,Arc::new(AtomicBool::new(false)),|_|{},|_,_,_,_,_,_|panic!("changed reviewed source ran a compiler")).unwrap();
        // Post-staging refusals produce a durable failed job, just like the
        // other build failures. They must never publish an output or success.
        assert_eq!(record.status,"failed");
        assert!(record.output.is_none());
        assert!(record.sha256.is_none());
        assert!(record.message.contains("reviewed edit plan"));
        let receipt:WorkingTagsReceipt=serde_json::from_slice(&fs::read(c.jobs.join(&id).join("working-tags-receipt.json")).unwrap()).unwrap();
        assert_eq!(receipt.status,"failed");
        assert_eq!(receipt.reviewed_tag_identity,c.input.expected_tag_identity);
        assert_eq!(fs::read(c.input.tags_directory.join("edited.weapon")).unwrap(),b"different source after review");
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
