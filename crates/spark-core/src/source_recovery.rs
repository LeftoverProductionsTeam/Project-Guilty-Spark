//! Source Guardian orchestration. Standard Halo tags/data stay independent of
//! this optional report. Invader is invoked as a separate installed program;
//! none of its GPL implementation is incorporated here.
use crate::{
    build::{self, JobEvent, Runner, Toolchain},
    invalid,
    maps::{self, MapInspection},
    native_staging,
    project::{self, Project},
    reject_links, safe_relative, storage,
    tag_exchange::{self, ExtractedFile},
    Result, SparkError,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

const TOOLS: [&str; 5] = [
    "invader-extract",
    "invader-info",
    "invader-edit",
    "invader-dependency",
    "invader-recover",
];
const MAX_REPORT: u64 = 8 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryPlan {
    pub schema_version: u32,
    pub identity: String,
    pub project_id: String,
    pub source_sha256: String,
    pub source_path: PathBuf,
    pub source_edition: String,
    pub source_version: u32,
    pub tag_id: u32,
    pub requested_tag: String,
    pub scope: String,
    pub indexed_tags: usize,
    /// Only relationships the cache reader actually understands; not a full
    /// recursive extraction claim. Independent native traversal follows later.
    pub observed_dependencies: Vec<String>,
    pub resources: BTreeMap<String, String>,
    pub tool_hashes: BTreeMap<String, String>,
    pub blockers: Vec<String>,
    pub limitations: Vec<String>,
}

fn signature<T: Serialize>(value: &T) -> Result<String> {
    Ok(Sha256::digest(serde_json::to_vec(value)?)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

/// Read-only review, bound to source bytes rather than the selected game host.
/// Local inspection remains available even when native recovery is unsupported.
pub fn review(
    project: &Project,
    inspection: &MapInspection,
    tools: &Toolchain,
    tag_id: u32,
) -> Result<RecoveryPlan> {
    let source = project.source.as_ref().ok_or_else(|| {
        SparkError::Invalid("Open a preserved Halo map to review recovery".into())
    })?;
    crate::source_identity::validate(source, inspection)?;
    reject_links(&source.preserved_path)?;
    if maps::hash_file(&source.preserved_path)? != source.sha256 {
        return invalid("Preserved source bytes changed; recovery review refused");
    }
    let tag = inspection
        .tags
        .iter()
        .find(|t| t.id == tag_id)
        .ok_or_else(|| SparkError::Invalid("Recovery root tag is not in this source map".into()))?;
    safe_relative(&tag.path)?;
    if tag.path.starts_with('-') {
        return invalid("Recovery tag cannot begin with a tool option");
    }
    let ext = tag_exchange::extension(&tag.class)?;
    let requested_tag = format!("{}.{}", tag.path.replace('\\', "/"), ext);
    safe_relative(&requested_tag)?;
    let mut plan = RecoveryPlan { schema_version:1, identity:String::new(), project_id:project.id.clone(),
        source_sha256:source.sha256.clone(), source_path:source.preserved_path.clone(),
        source_edition:crate::source_identity::format_contract(project, inspection).edition.into(),
        source_version:source.cache_version, tag_id, requested_tag, scope:if tag.class=="scnr" {"All native cache tags (scenario project recovery)"} else {"Selected asset and recursive native dependencies"}.into(),
        indexed_tags:inspection.tags.len(), observed_dependencies:vec![], resources:BTreeMap::new(), tool_hashes:BTreeMap::new(), blockers:vec![],
        limitations:vec![
            "Recovered native tags are reconstructed from this compiled cache, not the exact original authoring project. Unsaved Spark overlays are not applied.".into(),
            "Model JMS and script/string source can be recovered where the installed backend supports it. Original Blender/Max history, original bitmap color plates, script comments and stripped source cannot be promised.".into(),
            "BSP collision/render data may survive in native tags; this recovery does not reconstruct editable BSP JMS, AI navigation authoring or original lightmap source.".into(),
            "Recovery validates native parsing and dependency closure. Compilation, visual/audio fidelity and actual gameplay are separate checks. Partial folders, archives and broken-project repair use separate workflows and are not covered by this cache recovery.".into(),
        ]};
    if ![5, 6, 7, 609, 13].contains(&source.cache_version) || inspection.header.extended {
        plan.blockers.push("This cache can be inspected, but this native extraction backend does not support its format/extension. No output will be written.".into());
    }
    if inspection.header.build.contains("synthetic parser fixture") {
        plan.blockers
            .push("Synthetic parser fixtures cannot be recovered as game content".into());
    }
    let mut seen = BTreeSet::new();
    let mut pending = vec![tag_id];
    while let Some(id) = pending.pop() {
        if !seen.insert(id) {
            continue;
        }
        if let Some(t) = inspection.tags.iter().find(|t| t.id == id) {
            if id != tag_id {
                plan.observed_dependencies
                    .push(format!("{} [{}]", t.path, t.class));
            }
            pending.extend(t.references.iter().map(|r| r.target_id));
        } else {
            plan.blockers.push(format!(
                "Known native reference {id:08X} is unresolved in the source index"
            ));
        }
    }
    plan.observed_dependencies.sort();
    for name in TOOLS {
        if let Some(binary) = build::tool_path(tools, name) {
            reject_links(&binary)?;
            plan.tool_hashes
                .insert(name.into(), maps::hash_file(&binary)?);
        } else {
            plan.blockers.push(format!(
                "Locate installed {name} in Games & Tools before recovery"
            ));
        }
    }
    if let Some(directory) = source
        .resource_directory
        .as_deref()
        .or(tools.resource_directory.as_deref())
        .or_else(|| source.preserved_path.parent())
    {
        reject_links(directory)?;
        // Viewer-only resource substitutions never become compiler authority.
        if [6, 7, 609].contains(&source.cache_version) {
            match crate::native_resources::review(source, inspection, directory) {
                Ok(binding) => plan.resources = binding.hashes,
                Err(problem) => plan.blockers.push(problem.to_string()),
            }
        } else if source.cache_version == 13 {
            for resource in inspection.resources.iter().filter(|r| r.required) {
                let file = directory.join(safe_relative(&resource.name)?);
                if file.is_file() {
                    plan.resources
                        .insert(resource.name.clone(), maps::hash_file(&file)?);
                } else {
                    plan.blockers.push(format!(
                        "Original native resource {} is missing",
                        resource.name
                    ));
                }
            }
        }
    } else {
        plan.blockers
            .push("No original native resource directory is connected".into());
    }
    // Also bind the extraction backend's exact pinned resource identity. MCC
    // preview pack keys are interpreted by the existing extraction path only.
    for (key, value) in &source.resource_sha256 {
        plan.resources
            .insert(format!("recorded:{key}"), value.clone());
    }
    plan.identity = signature(&plan)?;
    Ok(plan)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryReceipt {
    pub schema_version: u32,
    pub id: String,
    pub plan: RecoveryPlan,
    pub directory: PathBuf,
    pub tags_directory: PathBuf,
    pub data_directory: PathBuf,
    pub extraction_id: String,
    pub native_tags: Vec<ExtractedFile>,
    pub recovered_data: Vec<ExtractedFile>,
    pub native_tag_fidelity: String,
    pub data_fidelity: String,
    pub native_readback: BTreeMap<String, String>,
    pub dependency_closure: Vec<String>,
    pub source_recovery_gaps: Vec<String>,
    pub tools: BTreeMap<String, String>,
    pub status: String,
    pub reused: bool,
    pub native_compilation_verified: bool,
    pub gameplay_verified: bool,
}

/// Invader batch editing can exit zero after per-tag failures. Require one
/// actual parser/CRC result for every expected path, without requesting a save.
pub fn readback_summary(output: &str, files: &[ExtractedFile]) -> Result<BTreeMap<String, String>> {
    let mut result = BTreeMap::new();
    let mut crc = None;
    for line in output.lines().map(str::trim) {
        if line.starts_with("0x")
            && line.len() == 10
            && line[2..].bytes().all(|b| b.is_ascii_hexdigit())
        {
            crc = Some(line.to_owned());
        } else if let Some(path) = line.strip_prefix("Successfully edited ") {
            let path = path.replace('\\', "/").to_ascii_lowercase();
            safe_relative(&path)?;
            let value = crc.take().ok_or_else(|| {
                SparkError::Invalid("Native parser omitted a tag readback checksum".into())
            })?;
            if result.insert(path, value).is_some() {
                return invalid("Native parser repeated a recovery path");
            }
        }
    }
    let expected = files
        .iter()
        .map(|f| f.path.to_ascii_lowercase())
        .collect::<BTreeSet<_>>();
    if result.keys().cloned().collect::<BTreeSet<_>>() != expected
        || expected.len() != files.len()
        || crc.is_some()
        || !build::extraction_errors(output).is_empty()
    {
        return invalid("Independent native readback did not validate every recovered tag; recovery was not adopted");
    }
    Ok(result)
}

fn validate_receipt(root: &Path, receipt: &RecoveryReceipt) -> Result<()> {
    uuid::Uuid::parse_str(&receipt.id)
        .map_err(|_| SparkError::Invalid("Invalid recovery ID".into()))?;
    let directory = root.join("recoveries").join(&receipt.id);
    if receipt.schema_version != 1
        || receipt.directory != directory
        || receipt.tags_directory != directory.join("tags")
        || receipt.data_directory != directory.join("data")
    {
        return invalid("Recovery receipt has a different managed destination");
    }
    for (folder, expected) in [
        (&receipt.tags_directory, &receipt.native_tags),
        (&receipt.data_directory, &receipt.recovered_data),
    ] {
        reject_links(folder)?;
        if tag_exchange::inventory(folder)?.0 != *expected {
            return invalid("Recovered project files changed; old validation cannot be reused. Edited source is preserved.");
        }
    }
    if receipt.native_readback.len() != receipt.native_tags.len() || receipt.native_tags.is_empty()
    {
        return invalid("Recovery receipt has incomplete native readback");
    }
    let extracted = tag_exchange::load_receipt(root, &receipt.extraction_id)?;
    if extracted.source_project_id != receipt.plan.project_id
        || extracted.source_sha256 != receipt.plan.source_sha256
        || extracted.files != receipt.native_tags
    {
        return invalid("Recovery native tags do not match the original extraction identity");
    }
    Ok(())
}
/// Native model/script names become external-writer filenames. They must be
/// single safe components before any source reconstruction can run.
pub fn validate_output_names(output: &str) -> Result<()> {
    for name in output
        .lines()
        .map(str::trim)
        .filter(|name| !name.is_empty())
    {
        let path = safe_relative(name)?;
        if path.components().count() != 1 || name.starts_with('-') {
            return invalid("Native source filename is not a safe single component; source reconstruction refused");
        }
    }
    Ok(())
}
fn read_report(root: &Path, id: &str) -> Result<RecoveryReceipt> {
    uuid::Uuid::parse_str(id).map_err(|_| SparkError::Invalid("Invalid recovery ID".into()))?;
    let path = root
        .join("recoveries")
        .join(id)
        .join("recovery-report.json");
    reject_links(&path)?;
    if fs::metadata(&path)?.len() > MAX_REPORT {
        return invalid("Recovery report exceeds 8 MiB");
    }
    let receipt: RecoveryReceipt = serde_json::from_slice(&fs::read(path)?)?;
    if receipt.id != id {
        return invalid("Recovery report ID mismatch");
    }
    let directory = root.join("recoveries").join(id);
    if receipt.schema_version != 1
        || receipt.directory != directory
        || receipt.tags_directory != directory.join("tags")
        || receipt.data_directory != directory.join("data")
    {
        return invalid("Recovery report has an unexpected managed location");
    }
    Ok(receipt)
}
/// Opening an owned recovered folder remains possible after a legitimate edit.
/// Old validation is refused separately; it is never permission to hide files.
pub fn directory(root: &Path, id: &str) -> Result<PathBuf> {
    let receipt = read_report(root, id)?;
    reject_links(&receipt.directory)?;
    Ok(receipt.directory)
}
pub fn load(root: &Path, id: &str) -> Result<RecoveryReceipt> {
    let receipt = read_report(root, id)?;
    validate_receipt(root, &receipt)?;
    Ok(receipt)
}

/// Explicit recovery request. Original cache/resources and immutable extracted
/// tags are never edited. Failed/partial output remains isolated for diagnosis.
pub fn recover(
    project: &Project,
    inspection: &MapInspection,
    tools: &Toolchain,
    root: &Path,
    id: &str,
    tag_id: u32,
    reviewed_identity: &str,
    cancel: Arc<AtomicBool>,
    on_event: impl Fn(JobEvent) + Send + Sync,
) -> Result<RecoveryReceipt> {
    uuid::Uuid::parse_str(id).map_err(|_| SparkError::Invalid("Invalid recovery job ID".into()))?;
    let plan = review(project, inspection, tools, tag_id)?;
    if plan.identity != reviewed_identity {
        return invalid(
            "Source, tools or resources changed since recovery review; review the plan again",
        );
    }
    if !plan.blockers.is_empty() {
        return invalid(plan.blockers.join("\n"));
    }
    let base = root.join("recoveries");
    reject_links(&base)?;
    // A repeated request is a fresh hash check, not another extracted/project
    // tree. Changed recovered projects remain untouched and are never reused.
    if base.is_dir() {
        for entry in fs::read_dir(&base)?.take(128) {
            let path = entry?.path();
            let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
                continue;
            };
            if uuid::Uuid::parse_str(name).is_ok() {
                if let Ok(mut old) = load(root, name) {
                    if old.plan.identity == plan.identity {
                        old.reused = true;
                        return Ok(old);
                    }
                }
            }
        }
    }
    let extracted = tag_exchange::extract_selected_tag(
        project,
        inspection,
        tools,
        root,
        id,
        tag_id,
        cancel.clone(),
        &on_event,
    )?;
    let directory = base.join(id);
    let pending = base.join(format!(".pending-{id}"));
    if directory.exists() || pending.exists() {
        return invalid("Recovery destination already exists; no existing files were overwritten");
    }
    fs::create_dir_all(&base)?;
    let mut lease = storage::Store::for_output(&pending)?.reserve(
        &pending,
        Some(&plan.source_path),
        storage::estimate_copy(extracted.files.len(), extracted.total_bytes)
            .saturating_add(512 * 1024 * 1024),
        storage::Category::Staging,
        "Source Guardian: separate native project recovery",
    )?;
    fs::create_dir(&pending)?;
    lease.mark_owned()?;
    let result = (|| -> Result<RecoveryReceipt> {
        let log = Mutex::new((
            fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(pending.join("recovery-events.jsonl"))?,
            0usize,
            None::<String>,
        ));
        let emit = |value: JobEvent| {
            if let Ok(mut log) = log.lock() {
                if log.2.is_none() {
                    match serde_json::to_vec(&value) {
                        Ok(mut line) => {
                            line.push(b'\n');
                            if log.1 + line.len() > 4 * 1024 * 1024 {
                                log.2=Some("Recovery diagnostic log exceeded 4 MiB; prior evidence retained".into());
                            } else {
                                log.1 += line.len();
                                if let Err(error) = log.0.write_all(&line) {
                                    log.2 = Some(error.to_string());
                                }
                            }
                        }
                        Err(error) => log.2 = Some(error.to_string()),
                    }
                }
            }
            on_event(value);
        };
        let tags = pending.join("tags");
        let data = pending.join("data");
        fs::create_dir(&data)?;
        let inventory = native_staging::inventory(&extracted.tag_root, &cancel)?;
        native_staging::copy(
            &extracted.tag_root,
            &tags,
            &inventory,
            &cancel,
            |_, _, _, _| {},
        )?;
        let (files, _) = tag_exchange::inventory(&tags)?;
        if files != extracted.files {
            return invalid("Recovered tag copy differs from verified extracted source");
        }
        let runner = Runner {
            id,
            project: &project.id,
            cancel: &cancel,
            event: &emit,
        };
        let executable = |name: &str| {
            build::tool_path(tools, name)
                .ok_or_else(|| SparkError::Invalid(format!("Recovery tool {name} disappeared")))
        };
        let mut versions = BTreeMap::new();
        for name in TOOLS {
            let output = runner.run(
                &executable(name)?,
                &["-i".into()],
                &pending,
                "recovery-tools",
                20,
            )?;
            versions.insert(
                name.into(),
                output
                    .lines()
                    .next()
                    .unwrap_or("Unknown version")
                    .to_owned(),
            );
        }
        let readback = runner.run(
            &executable("invader-edit")?,
            &[
                "-t".into(),
                tags.to_string_lossy().into(),
                "-H".into(),
                "-b".into(),
                "*".into(),
            ],
            &pending,
            "recovery-readback",
            40,
        )?;
        let native_readback = readback_summary(&readback, &files)?;
        let dependencies = runner.run(
            &executable("invader-dependency")?,
            &[
                "-t".into(),
                tags.to_string_lossy().into(),
                "-r".into(),
                plan.requested_tag.clone(),
            ],
            &pending,
            "recovery-dependencies",
            55,
        )?;
        let closure = native_staging::dependency_paths(&dependencies, &tags, &plan.requested_tag)?;
        let mut gaps=vec!["Original bitmap color plates and DCC authoring history are not restored from compiled tags. Native bitmap pixels remain in the recovered .bitmap tags.".into()];
        // Only operations the installed backend actually implements. No attempt
        // to invent BSP/animation/sound authoring source from other tag data.
        for extension in [
            "gbxmodel",
            "model",
            "scenario",
            "tag_collection",
            "ui_widget_collection",
            "string_list",
            "unicode_string_list",
            "hud_message_text",
        ] {
            if !files
                .iter()
                .any(|f| f.path.ends_with(&format!(".{extension}")))
            {
                continue;
            }
            if let Some(field) = match extension {
                "gbxmodel" | "model" => Some("regions[*].permutations[*].name"),
                "scenario" => Some("source_files[*].name"),
                _ => None,
            } {
                for file in files
                    .iter()
                    .filter(|file| file.path.ends_with(&format!(".{extension}")))
                {
                    let names = runner.run(
                        &executable("invader-edit")?,
                        &[
                            "-t".into(),
                            tags.to_string_lossy().into(),
                            "-G".into(),
                            field.into(),
                            file.path.clone(),
                        ],
                        &pending,
                        "recovery-readback",
                        65,
                    )?;
                    validate_output_names(&names)?;
                }
            }
            let result = runner.run(
                &executable("invader-recover")?,
                &[
                    "-t".into(),
                    tags.to_string_lossy().into(),
                    "-d".into(),
                    data.to_string_lossy().into(),
                    "-b".into(),
                    format!("*.{extension}"),
                ],
                &pending,
                "recovery-data",
                70,
            );
            match result {
                Err(problem) => {
                    if cancel.load(Ordering::Relaxed) {
                        return invalid(
                            "Recovery cancelled; partial output is retained separately",
                        );
                    }
                    gaps.push(format!("{extension} source reconstruction did not fully succeed: {problem}. Consult recovery-events.jsonl; native tags are retained, source output needs review."));
                }
                Ok(output) => {
                    if output.lines().any(|line| line.starts_with("Skipped ")) {
                        gaps.push(format!("Some {extension} source could not be reconstructed. Per-tag details are retained in recovery-events.jsonl. Native tags remain available."));
                    }
                }
            }
        }
        let recovered_data = tag_exchange::inventory(&data)?.0;
        // Native parsers/recovery must be read-only on input tags, and every
        // original identity is rechecked before the separate result is adopted.
        if tag_exchange::inventory(&tags)?.0 != files
            || tag_exchange::inventory(&extracted.tag_root)?.0 != extracted.files
        {
            return invalid("A recovery reader changed native source tags; recovery refused");
        }
        if review(project, inspection, tools, tag_id)?.identity != plan.identity {
            return invalid("Recovery source/tool/resource identity changed during recovery");
        }
        let receipt = RecoveryReceipt {
            schema_version: 1,
            id: id.into(),
            plan: plan.clone(),
            directory: directory.clone(),
            tags_directory: directory.join("tags"),
            data_directory: directory.join("data"),
            extraction_id: extracted.job_id,
            native_tags: files,
            recovered_data,
            native_tag_fidelity: "native-tag-recovered".into(),
            data_fidelity: "structural-reconstruction-not-original-authoring-source".into(),
            native_readback,
            dependency_closure: closure.into_iter().collect(),
            source_recovery_gaps: gaps,
            tools: versions,
            status: "native-tags-recovered-source-reconstruction-limited".into(),
            reused: false,
            native_compilation_verified: false,
            gameplay_verified: false,
        };
        let report = serde_json::to_vec_pretty(&receipt)?;
        if report.len() as u64 > MAX_REPORT {
            return invalid("Recovery report exceeds its bound");
        }
        project::atomic_write(&pending.join("recovery-report.json"), &report, false)?;
        project::atomic_write(&pending.join("RECOVERED-PROJECT.txt"),format!("Source Guardian recovered native Halo project\n\nSource: {}\nSHA-256: {}\nRoot: {}\n\ntags/ contains standard native Halo tags and their recursive dependency closure.\ndata/ contains reconstructed source where supported (JMS/scripts/strings).\nThese folders work independently of Spark. The JSON report is optional provenance, not a game dependency.\n\nNo original DCC history, bitmap color plates, BSP JMS or lossless authoring reconstruction is claimed. Native compilation, visual/audio equivalence and gameplay are separate tests.\n\n{}\n",plan.source_path.display(),plan.source_sha256,plan.requested_tag,receipt.source_recovery_gaps.join("\n")).as_bytes(),false)?;
        let (file, _, log_error) = log
            .into_inner()
            .map_err(|_| SparkError::Invalid("Recovery diagnostic lock failed".into()))?;
        if let Some(problem) = log_error {
            return invalid(problem);
        }
        file.sync_all()?;
        // Close the owned log before Windows adopts its directory.
        drop(file);
        lease.adopt(&directory)?;
        Ok(receipt)
    })();
    if let Err(problem) = &result {
        if pending.is_dir() {
            project::atomic_write(
                &pending.join("recovery-failure.json"),
                &serde_json::to_vec_pretty(
                    &serde_json::json!({"schemaVersion":1,"sourceSha256":plan.source_sha256,"reviewIdentity":plan.identity,"error":problem.to_string(),"accepted":false,"sourcePreservationVerified":maps::hash_file(&plan.source_path).ok().as_ref()==Some(&plan.source_sha256)}),
                )?,
                false,
            )?;
        }
    }
    if result.is_ok() {
        lease.finish(true, Some(plan.source_sha256))?;
    }
    result
}
