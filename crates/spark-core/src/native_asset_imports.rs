//! Managed recursive native tag imports. Never merge into an original tag tree.
use crate::{
    build::{self, Runner, Toolchain},
    invalid, maps,
    project::{self, Project},
    quickforge, reject_links, safe_relative,
    tag_exchange::{self, ExtractedFile, TagExtractReceipt},
    Result, SparkError,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
    sync::atomic::AtomicBool,
};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Binding {
    pub id: String,
    pub source_project_id: String,
    pub source_sha256: String,
    pub tag_id: u32,
    pub tag_class: String,
    pub tag_path: String,
    pub native_path: String,
    pub receipt_sha256: String,
    pub file_count: usize,
}
/// Extraction reads the preserved native cache, not the editor's overlay.
/// Refuse draft tag changes instead of silently importing the previous bytes.
pub fn require_native_source(source: &Project) -> Result<()> {
    if !source.tag_edits.is_empty()
        || !source.tag_renames.is_empty()
        || !source.tag_duplicates.is_empty()
    {
        return invalid("This source has tag changes that are not in its native map yet. In Tag editor, open Native Output, save a validated map copy, and open that copy before dragging the edited asset. The original map and existing imports are unchanged.");
    }
    Ok(())
}
/// An already imported closure may be reused before another extraction, but
/// only after checking current source state and the immutable owned receipt.
pub fn reuse(
    target: &Project,
    source: &Project,
    inspection: &maps::MapInspection,
    binding: &Binding,
    root: &Path,
) -> Result<Binding> {
    require_native_source(source)?;
    let tag = inspection.tags.iter().find(|tag| tag.id == binding.tag_id)
        .ok_or_else(|| SparkError::Invalid("Imported source tag is unavailable".into()))?;
    if binding.source_project_id != source.id
        || binding.source_sha256 != inspection.sha256
        || source.source.as_ref().map(|s| s.sha256.as_str()) != Some(inspection.sha256.as_str())
        || binding.tag_class != tag.class || binding.tag_path != tag.path
    {
        return invalid("The existing asset import belongs to another source revision");
    }
    receipt(root, target, binding)?;
    Ok(binding.clone())
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Receipt {
    schema_version: u32,
    target_project_id: String,
    source_project_id: String,
    source_sha256: String,
    source_tag_id: u32,
    source_tag_path: String,
    source_tag_class: String,
    native_path: String,
    extraction_job_id: String,
    files: Vec<ExtractedFile>,
    tools: BTreeMap<String, String>,
}
fn folder(root: &Path, target: &str, id: &str) -> Result<PathBuf> {
    for id in [target, id] {
        uuid::Uuid::parse_str(id)
            .map_err(|_| SparkError::Invalid("Invalid native asset import identity".into()))?;
    }
    let folder = root.join("asset-imports").join(target).join(id);
    reject_links(&folder)?;
    Ok(folder)
}
fn native_path(id: &str, path: &str, class: &str) -> String {
    let original = path.replace('\\', "/").to_ascii_lowercase();
    let prefix = format!("gs_assets_{}", id.replace('-', ""));
    if class == "senv" {
        let (directory, name) = original.rsplit_once('/').unwrap_or(("", &original));
        format!(
            "{prefix}/{directory}/gs_{}_{}",
            &id.replace('-', "")[..12],
            name
        )
    } else {
        format!("{prefix}/{original}")
    }
}
pub fn validate(bindings: &[Binding]) -> Result<()> {
    if bindings.len() > 128 {
        return invalid("Native asset imports are limited to 128 distinct assets per project");
    }
    let mut seen = BTreeSet::new();
    for b in bindings {
        for id in [&b.id, &b.source_project_id] {
            uuid::Uuid::parse_str(id)
                .map_err(|_| SparkError::Invalid("Invalid native asset import UUID".into()))?;
        }
        if !seen.insert(&b.id) || b.file_count == 0 || b.file_count > 4096 {
            return invalid("Invalid or duplicate native asset import");
        }
        for hash in [&b.source_sha256, &b.receipt_sha256] {
            if hash.len() != 64 || !hash.bytes().all(|c| c.is_ascii_hexdigit()) {
                return invalid("Native asset import is missing its content hash");
            }
        }
        safe_relative(&b.tag_path)?;
        safe_relative(&b.native_path)?;
        tag_exchange::extension(&b.tag_class)?;
        let expected = native_path(&b.id, &b.tag_path, &b.tag_class);
        if b.native_path.replace('\\', "/") != expected {
            return invalid("Native asset import namespace differs from its identity");
        }
    }
    Ok(())
}
pub fn root_file(binding: &Binding) -> Result<String> {
    Ok(format!(
        "{}.{}",
        binding.native_path.replace('\\', "/"),
        tag_exchange::extension(&binding.tag_class)?
    ))
}
pub fn find<'a>(
    project: &'a Project,
    source: &crate::maps::SourceModelReference,
) -> Option<&'a Binding> {
    project.native_asset_imports.iter().find(|b| {
        b.source_project_id == source.project_id
            && b.source_sha256 == source.source_sha256
            && b.tag_id == source.tag_id
            && b.tag_class == source.class
            && b.tag_path == source.path
    })
}
pub fn allowed_addition(
    project: &Project,
    object: &crate::maps::SceneObject,
    inspection: &maps::MapInspection,
) -> bool {
    object.source_offset.is_none()
        && object.rotation_offset.is_none()
        && object.asset_id.is_none()
        && object.scale == [1.; 3]
        && object.visible
        && !inspection.objects.iter().any(|old| old.id == object.id)
        && object
            .source_model
            .as_ref()
            .and_then(|s| find(project, s))
            .is_some_and(|b| {
                matches!(
                    b.tag_class.as_str(),
                    "scen" | "vehi" | "bipd" | "weap" | "eqip" | "itmc" | "mach"
                )
            })
}
pub fn rewrite_document(
    project: &Project,
    document: &mut quickforge::QuickForgeDocument,
) -> Result<()> {
    validate(&project.native_asset_imports)?;
    for placement in &mut document.placements {
        if let Some(binding) = project.native_asset_imports.iter().find(|b| {
            placement.source_project_id.as_ref() == Some(&b.source_project_id)
                && placement.source_sha256.as_ref() == Some(&b.source_sha256)
                && placement.tag_id == Some(b.tag_id)
                && placement.tag_class == b.tag_class
                && placement.tag_path == b.tag_path
        }) {
            placement.tag_path = binding.native_path.replace('/', "\\");
        }
    }
    Ok(())
}
fn copy_new(source: &Path, target: &Path, files: &[ExtractedFile]) -> Result<()> {
    for file in files {
        let relative = safe_relative(&file.path)?;
        let from = source.join(&relative);
        let to = target.join(&relative);
        reject_links(&from)?;
        reject_links(&to)?;
        if maps::hash_file(&from)? != file.sha256 || fs::metadata(&from)?.len() != file.bytes {
            return invalid("An extracted native tag changed; import refused");
        }
        fs::create_dir_all(to.parent().unwrap())?;
        crate::native_staging::copy_file(
            &from,
            &to,
            file.bytes,
            Some(&file.sha256),
            &AtomicBool::new(false),
        )?;
    }
    Ok(())
}
/// Copies extracted source before native refactoring. All tool recipes are local and fixed.
pub fn prepare(
    target: &Project,
    source: &Project,
    inspection: &maps::MapInspection,
    extracted: &TagExtractReceipt,
    tools: &Toolchain,
    root: &Path,
    id: &str,
    tag_id: u32,
    cancel: &std::sync::atomic::AtomicBool,
    on_event: impl Fn(build::JobEvent) + Send + Sync,
) -> Result<Binding> {
    require_native_source(source)?;
    let runner = Runner {
        id,
        project: &target.id,
        cancel,
        event: &on_event,
    };
    target.validate()?;
    let tag = inspection
        .tags
        .iter()
        .find(|t| t.id == tag_id)
        .ok_or_else(|| SparkError::Invalid("Import source tag is missing".into()))?;
    if !matches!(
        tag.class.as_str(),
        "scen" | "vehi" | "bipd" | "weap" | "eqip" | "itmc" | "mach" | "snd!" | "lsnd" | "senv"
    ) {
        return invalid("This native asset class has no verified automatic import workflow yet");
    }
    if extracted.source_project_id != source.id || extracted.source_sha256 != inspection.sha256 {
        return invalid("Extraction does not belong to the selected source asset");
    }
    let checked = tag_exchange::load_receipt(root, &extracted.job_id)?;
    if checked.files != extracted.files
        || tag_exchange::inventory(&checked.tag_root)?.0 != checked.files
    {
        return invalid("Recursive extraction inventory changed before native import");
    }
    if checked.files.iter().any(|file| file.path.len() + 43 > 254) {
        return invalid("This dependency path is too long for a namespaced native Halo tag; shorten the editable source path before importing");
    }
    let directory = folder(root, &target.id, id)?;
    if directory.exists() {
        return invalid("Native import folder already exists");
    }
    crate::native_staging::destination(&checked.tag_root, &directory)?;
    let lease = crate::storage::Store::for_output(&directory)?.reserve(
        &directory,
        Some(&checked.tag_root),
        crate::storage::estimate_copy(checked.files.len(), checked.total_bytes)
            .saturating_mul(2)
            .saturating_add(16 * 1024 * 1024),
        crate::storage::Category::Staging,
        "Namespaced native asset source and reference readback",
    )?;
    fs::create_dir_all(&directory)?;
    lease.mark_owned()?;
    let tags = directory.join("tags");
    fs::create_dir(&tags)?;
    copy_new(&checked.tag_root, &tags, &checked.files)?;
    let prefix = format!("gs_assets_{}", id.replace('-', ""));
    let refactor = build::tool_path(tools, "invader-refactor").ok_or_else(|| {
        SparkError::Invalid(
            "Install Invader with invader-refactor for recursive native asset imports".into(),
        )
    })?;
    let dependency = build::tool_path(tools, "invader-dependency").ok_or_else(|| {
        SparkError::Invalid(
            "invader-dependency is required to verify recursive native asset imports".into(),
        )
    })?;
    let edit = build::tool_path(tools, "invader-edit").ok_or_else(|| {
        SparkError::Invalid("invader-edit is required to read back the imported tag".into())
    })?;
    let mut identities = BTreeMap::new();
    for (name, path) in [
        ("refactor", &refactor),
        ("dependencies", &dependency),
        ("reader", &edit),
    ] {
        reject_links(path)?;
        identities.insert(name.into(), maps::hash_file(path)?);
    }
    // Top-level directory moves rewrite all dependent references with Invader's parser.
    // One bounded argument per source directory avoids Windows command-line length limits.
    let roots = checked
        .files
        .iter()
        .map(|file| file.path.split('/').next().unwrap().to_string())
        .collect::<BTreeSet<_>>();
    if roots.len() > 128 {
        return invalid("Recursive import has too many independent source roots");
    }
    for file in &checked.files {
        let destination = tags.join(safe_relative(&format!("{prefix}/{}", file.path))?);
        reject_links(&destination)?;
        fs::create_dir_all(destination.parent().unwrap())?;
    }
    for top in roots {
        let destination = format!("{prefix}/{top}");
        let args = if tags.join(&top).is_dir() {
            vec![
                "-M".into(),
                "move".into(),
                "-t".into(),
                tags.to_string_lossy().into_owned(),
                "-r".into(),
                top,
                destination,
            ]
        } else {
            vec![
                "-M".into(),
                "move".into(),
                "-t".into(),
                tags.to_string_lossy().into_owned(),
                "-T".into(),
                top,
                destination,
            ]
        };
        let output = runner.run(&refactor, &args, &directory, "asset-references", 74)?;
        if output
            .lines()
            .any(|line| line.trim().to_ascii_lowercase().starts_with("error:"))
        {
            return invalid("Native refactoring reported a per-tag error despite its exit status; no placement was committed");
        }
    }
    let original_native = format!(
        "{prefix}/{}",
        tag.path.replace('\\', "/").to_ascii_lowercase()
    );
    let native_path = native_path(id, &tag.path, &tag.class);
    if native_path != original_native {
        let ext = tag_exchange::extension(&tag.class)?;
        let output = runner.run(
            &refactor,
            &[
                "-M".into(),
                "move".into(),
                "-t".into(),
                tags.to_string_lossy().into_owned(),
                "-T".into(),
                format!("{original_native}.{ext}"),
                format!("{native_path}.{ext}"),
            ],
            &directory,
            "asset-references",
            78,
        )?;
        if output
            .lines()
            .any(|line| line.trim().to_ascii_lowercase().starts_with("error:"))
        {
            return invalid("Native shader rename reported a per-tag error");
        }
    }
    let relative = format!("{native_path}.{}", tag_exchange::extension(&tag.class)?);
    let fields = runner.run(
        &edit,
        &[
            "-t".into(),
            fs::canonicalize(&tags)?.to_string_lossy().into_owned(),
            "-L".into(),
            relative.clone(),
        ],
        &directory,
        "asset-native-readback",
        80,
    )?;
    if fields.trim().is_empty() {
        return invalid("The native reader returned no tag fields");
    }
    runner.run(
        &dependency,
        &[
            "-t".into(),
            fs::canonicalize(&tags)?.to_string_lossy().into_owned(),
            "-r".into(),
            relative,
        ],
        &directory,
        "asset-dependencies",
        83,
    )?;
    let (files, _) = tag_exchange::inventory(&tags)?;
    if files.len() != checked.files.len()
        || files
            .iter()
            .any(|file| !file.path.starts_with(&format!("{prefix}/")))
    {
        return invalid(
            "Native refactoring changed the closure inventory or escaped its namespace",
        );
    }
    if tag_exchange::inventory(&checked.tag_root)?.0 != checked.files {
        return invalid("Original extracted tags changed during native refactoring");
    }
    let receipt = Receipt {
        schema_version: 1,
        target_project_id: target.id.clone(),
        source_project_id: source.id.clone(),
        source_sha256: inspection.sha256.clone(),
        source_tag_id: tag_id,
        source_tag_path: tag.path.clone(),
        source_tag_class: tag.class.clone(),
        native_path: native_path.clone(),
        extraction_job_id: checked.job_id,
        files,
        tools: identities,
    };
    let bytes = serde_json::to_vec_pretty(&receipt)?;
    project::atomic_write(&directory.join("import.json"), &bytes, false)?;
    let binding = Binding {
        id: id.into(),
        source_project_id: source.id.clone(),
        source_sha256: inspection.sha256.clone(),
        tag_id,
        tag_class: tag.class.clone(),
        tag_path: tag.path.clone(),
        native_path,
        receipt_sha256: crate::hex_bytes(Sha256::digest(&bytes)),
        file_count: receipt.files.len(),
    };
    validate(std::slice::from_ref(&binding))?;
    lease.finish(true, Some(binding.receipt_sha256.clone()))?;
    Ok(binding)
}
fn receipt(root: &Path, project: &Project, binding: &Binding) -> Result<(PathBuf, Receipt)> {
    validate(std::slice::from_ref(binding))?;
    let directory = folder(root, &project.id, &binding.id)?;
    let path = directory.join("import.json");
    reject_links(&path)?;
    if fs::metadata(&path)?.len() > 2 * 1024 * 1024
        || maps::hash_file(&path)? != binding.receipt_sha256
    {
        return invalid("Native import receipt changed; no map build is allowed");
    }
    let receipt: Receipt = serde_json::from_slice(&fs::read(&path)?)?;
    if receipt.schema_version != 1
        || receipt.target_project_id != project.id
        || receipt.source_project_id != binding.source_project_id
        || receipt.source_sha256 != binding.source_sha256
        || receipt.source_tag_id != binding.tag_id
        || receipt.source_tag_path != binding.tag_path
        || receipt.source_tag_class != binding.tag_class
        || receipt.native_path != binding.native_path
        || receipt.files.len() != binding.file_count
    {
        return invalid("Native asset import receipt identity mismatch");
    }
    let tags = directory.join("tags");
    if tag_exchange::inventory(&tags)?.0 != receipt.files {
        return invalid("Imported native tags changed or are incomplete; rebuild the asset import before compiling");
    }
    Ok((tags, receipt))
}
pub fn available_files(root: &Path, project: &Project) -> Result<BTreeSet<String>> {
    Ok(source_hashes(root, project)?.into_keys().collect())
}
/// Revalidate project-owned import receipts and every immutable native input.
/// The returned hashes authorize reuse, never a timestamp or source filename.
fn validated_inputs(root: &Path, project: &Project) -> Result<BTreeMap<String, ExtractedFile>> {
    let mut files = BTreeMap::new();
    for binding in &project.native_asset_imports {
        let (_, receipt) = receipt(root, project, binding)?;
        let prefix = format!("gs_assets_{}/", binding.id.replace('-', ""));
        for file in receipt.files {
            if !file.path.starts_with(&prefix) || files.insert(file.path.clone(), file).is_some() {
                return invalid(
                    "Native import source escaped its identity or repeats an owned path",
                );
            }
        }
    }
    Ok(files)
}
pub fn source_hashes(root: &Path, project: &Project) -> Result<BTreeMap<String, String>> {
    Ok(validated_inputs(root, project)?.into_iter().map(|(path, file)| (path, file.sha256)).collect())
}
/// The exact receipt- and payload-verified imports that `stage` will copy.
/// Admission can count these bytes without copying tags or repeating private paths.
pub fn staging_inventory(root: &Path, project: &Project) -> Result<crate::native_staging::Inventory> {
    let mut bytes = 0u64;
    let mut files = vec![];
    for (path, file) in validated_inputs(root, project)? {
        bytes = bytes.checked_add(file.bytes).ok_or_else(|| SparkError::Invalid("Native import staging size overflow".into()))?;
        files.push(crate::native_staging::File { path, bytes: file.bytes });
    }
    Ok(crate::native_staging::Inventory { files, bytes })
}
pub fn stage(
    root: &Path,
    project: &Project,
    destination: &Path,
) -> Result<BTreeMap<String, String>> {
    let mut hashes = BTreeMap::new();
    for binding in &project.native_asset_imports {
        let (tags, receipt) = receipt(root, project, binding)?;
        let prefix = format!("gs_assets_{}", binding.id.replace('-', ""));
        if receipt
            .files
            .iter()
            .any(|file| !file.path.starts_with(&format!("{prefix}/")))
        {
            return invalid("Native import files escaped their owned namespace");
        }
        let path = destination.join(&prefix);
        let bytes = receipt.files.iter().map(|file| file.bytes).sum();
        let lease = crate::storage::Store::for_output(&path)?.reserve(
            &path,
            Some(&tags),
            crate::storage::estimate_copy(receipt.files.len(), bytes),
            crate::storage::Category::Staging,
            "Native asset compiler inputs",
        )?;
        copy_new(&tags, destination, &receipt.files)?;
        for file in &receipt.files {
            hashes.insert(file.path.clone(), file.sha256.clone());
        }
        if tag_exchange::inventory(&tags)?.0 != receipt.files {
            return invalid("Native asset import changed during build staging");
        }
        lease.finish(false, Some(binding.receipt_sha256.clone()))?;
    }
    Ok(hashes)
}
pub fn verify_compiled(project: &Project, compiled: &maps::MapInspection) -> Result<()> {
    for binding in &project.native_asset_imports {
        let used = project.scene.iter().any(|o| {
            o.source_model
                .as_ref()
                .and_then(|source| find(project, source))
                .is_some_and(|b| b.id == binding.id)
        }) || project.quick_forge.as_ref().is_some_and(|doc| {
            doc.placements.iter().any(|p| {
                p.source_project_id.as_ref() == Some(&binding.source_project_id)
                    && p.source_sha256.as_ref() == Some(&binding.source_sha256)
                    && p.tag_id == Some(binding.tag_id)
            })
        });
        if !used {
            continue;
        }
        if binding.tag_class == "mach" {
            let requested:Vec<_>=project.scene.iter().filter(|object|object.source_model.as_ref().and_then(|source|find(project,source)).is_some_and(|value|value.id==binding.id)).collect();
            if !requested.is_empty() {
                let native=compiled.tags.iter().find(|tag|tag.class=="mach"&&tag.path.replace('\\',"/").eq_ignore_ascii_case(&binding.native_path));
                let placed:Vec<_>=compiled.objects.iter().filter(|object|object.kind=="Machine"&&object.tag_id==native.map(|tag|tag.id)).collect();
                if native.is_none()||placed.len()!=requested.len() {
                    return invalid("Compiled scenario lost an imported native machine placement");
                }
                // Match each output at most once, including coincident copies.
                let mut remaining=placed;
                for object in requested {
                    let Some(index)=remaining.iter().position(|output|output.position.iter().zip(object.position).all(|(a,b)|(*a-b).abs()<=0.0001)&&output.rotation.iter().zip(object.rotation).all(|(a,b)|((*a-b+std::f32::consts::PI).rem_euclid(std::f32::consts::TAU)-std::f32::consts::PI).abs()<=0.0001)) else {
                        return invalid("Compiled native machine transform differs from its authored placement");
                    };
                    remaining.remove(index);
                }
            }
        }
        if !compiled.tags.iter().any(|tag| {
            tag.class == binding.tag_class
                && tag
                    .path
                    .replace('\\', "/")
                    .eq_ignore_ascii_case(&binding.native_path)
        }) {
            // Unplaced sound source tags are retained in the project, not falsely certified as in-game emitters.
            if matches!(binding.tag_class.as_str(), "snd!" | "lsnd") {
                continue;
            }
            return invalid(format!(
                "The compiled cache omitted imported native asset {}",
                binding.tag_path
            ));
        }
    }
    Ok(())
}
/// Add source-bound placements through the native scenario schema, never cache offsets.
pub(crate) fn append_scenario(
    project: &Project,
    inspection: &maps::MapInspection,
    tags: &Path,
    edit: &Path,
    workspace: &Path,
    runner: &Runner,
) -> Result<()> {
    let scenario = format!("{}.scenario", inspection.scenario_path);
    let run = |tag: &str, mut args: Vec<String>| -> Result<String> {
        let mut command = vec![
            "-t".into(),
            fs::canonicalize(tags)?.to_string_lossy().into_owned(),
        ];
        command.append(&mut args);
        command.push(tag.into());
        runner.run(edit, &command, workspace, "asset-placement", 70)
    };
    let count = |array: &str| -> Result<usize> {
        let output = run(&scenario, vec!["-C".into(), array.into()])?;
        let value = output.trim().parse::<usize>().map_err(|_| {
            SparkError::Invalid("Native scenario reader returned an invalid array count".into())
        })?;
        if value >= 4096 {
            return invalid("Scenario placement array reached its checked limit");
        }
        Ok(value)
    };
    let set = |args: &mut Vec<String>, field: String, value: String| {
        args.extend(["-S".into(), field, value]);
    };
    let vector = |v: [f32; 3]| format!("{:.6},{:.6},{:.6}", v[0], v[1], v[2]);
    for object in project.scene.iter().filter(|o| o.source_model.is_some()) {
        if !allowed_addition(project, object, inspection) {
            return invalid("Only unchanged, visible, unit-scale imported source placements can be compiled into this map; replacements need a separate native removal plan");
        }
        let binding = find(project, object.source_model.as_ref().unwrap()).unwrap();
        let reference = root_file(binding)?.replace('/', "\\");
        if inspection.header.scenario_type == 1
            && matches!(binding.tag_class.as_str(), "weap" | "eqip" | "itmc")
        {
            let collection = if binding.tag_class == "itmc" {
                reference
            } else {
                uuid::Uuid::parse_str(&object.id).map_err(|_| {
                    SparkError::Invalid("Imported placement UUID is invalid".into())
                })?;
                let tag = format!(
                    "spark_placements/{}/{}.item_collection",
                    project.id.replace('-', ""),
                    object.id.replace('-', "")
                );
                let file = tags.join(safe_relative(&tag)?);
                reject_links(&file)?;
                if file.exists() {
                    return invalid("Generated native item namespace already exists");
                }
                fs::create_dir_all(file.parent().unwrap())?;
                run(
                    &tag,
                    vec![
                        "-N".into(),
                        "-I".into(),
                        "permutations".into(),
                        "1".into(),
                        "end".into(),
                        "-S".into(),
                        "permutations[0].weight".into(),
                        "1".into(),
                        "-S".into(),
                        "permutations[0].item".into(),
                        reference,
                        "-S".into(),
                        "default_spawn_time".into(),
                        "30".into(),
                    ],
                )?;
                tag
            };
            let index = count("netgame_equipment")?;
            let prefix = format!("netgame_equipment[{index}]");
            let mut args = vec![
                "-I".into(),
                "netgame_equipment".into(),
                "1".into(),
                "end".into(),
            ];
            set(
                &mut args,
                format!("{prefix}.position"),
                vector(object.position),
            );
            set(
                &mut args,
                format!("{prefix}.facing"),
                object.rotation[0].to_string(),
            );
            set(&mut args, format!("{prefix}.team_index"), "0".into());
            set(&mut args, format!("{prefix}.spawn_time"), "30".into());
            set(&mut args, format!("{prefix}.type_0"), "all_games".into());
            set(&mut args, format!("{prefix}.item_collection"), collection);
            run(&scenario, args)?;
        } else {
            let (array, palette) =
                match binding.tag_class.as_str() {
                    "scen" => ("scenery", "scenery_palette"),
                    "vehi" => ("vehicles", "vehicle_palette"),
                    "bipd" => ("bipeds", "biped_palette"),
                    "weap" => ("weapons", "weapon_palette"),
                    "eqip" => ("equipment", "equipment_palette"),
                    "mach" => ("machines", "machine_palette"),
                    _ => return invalid(
                        "This asset needs a native scenario translation that is not implemented",
                    ),
                };
            let pi = count(palette)?;
            let index = count(array)?;
            let prefix = format!("{array}[{index}]");
            let mut args = vec![
                "-I".into(),
                palette.into(),
                "1".into(),
                "end".into(),
                "-I".into(),
                array.into(),
                "1".into(),
                "end".into(),
            ];
            set(&mut args, format!("{palette}[{pi}].name"), reference);
            set(&mut args, format!("{prefix}.type"), pi.to_string());
            set(&mut args, format!("{prefix}.name"), "-1".into());
            if binding.tag_class == "mach" {
                // Same standard native device defaults as QuickForge: no
                // inherited group index from an unrelated source scenario.
                set(&mut args, format!("{prefix}.power_group"), "-1".into());
                set(&mut args, format!("{prefix}.position_group"), "-1".into());
            }
            set(
                &mut args,
                format!("{prefix}.position"),
                vector(object.position),
            );
            // Imported World SceneObject rotations already use Halo Y/P/R,
            // as read by maps.rs and displayed by World's native ZYX basis.
            // QuickForge placements have an independent intrinsic XYZ format.
            set(
                &mut args,
                format!("{prefix}.rotation"),
                vector(object.rotation),
            );
            if binding.tag_class == "vehi" {
                set(&mut args, format!("{prefix}.body_vitality"), "1".into());
                set(
                    &mut args,
                    format!("{prefix}.multiplayer_team_index"),
                    "0".into(),
                );
                for mode in ["slayer", "ctf", "king", "oddball"] {
                    for flag in ["default", "allowed"] {
                        set(
                            &mut args,
                            format!("{prefix}.multiplayer_spawn_flags.{mode}_{flag}"),
                            "1".into(),
                        );
                    }
                }
            }
            run(&scenario, args)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_import_never_silently_discards_authored_tag_changes() {
        let clean=Project::new("Native cache source");
        require_native_source(&clean).unwrap();
        let mut edited=clean.clone();
        edited.tag_edits.push(project::TagEdit{tag_id:42,field_key:"bounding-radius".into(),value:serde_json::json!(0.75)});
        assert!(require_native_source(&edited).unwrap_err().to_string().contains("validated map copy"));
        let mut renamed=clean.clone();
        renamed.tag_renames.push(crate::tag_renames::TagRename{source_tag_id:42,path:"my/door".into()});
        assert!(require_native_source(&renamed).is_err());
        let mut duplicated=clean.clone();
        duplicated.tag_duplicates.push(crate::tag_duplicates::TagDuplicate{id:uuid::Uuid::new_v4().to_string(),source_tag_id:42,owner_tag_id:43,path:"my/door".into()});
        assert!(require_native_source(&duplicated).is_err());
        assert_eq!(edited.tag_edits[0].value,serde_json::json!(0.75));
        require_native_source(&clean).unwrap();
    }
    #[test]
    fn reusable_import_inputs_require_exact_receipt_bytes_owned_paths_and_fresh_file_hashes() {
        // Identity fixture only. Real Invader extraction/compilation is covered
        // by qa_native_asset_storage, never inferred from these payload bytes.
        let root = tempfile::tempdir().unwrap();
        let mut project = Project::new("Import identity");
        let id = uuid::Uuid::new_v4().to_string();
        let path = native_path(&id, "scenery/rock", "scen");
        let directory = folder(root.path(), &project.id, &id).unwrap();
        let tags = directory.join("tags");
        let file = tags.join(format!("{path}.scenery"));
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&file, b"source identity").unwrap();
        let mut receipt = Receipt {
            schema_version: 1,
            target_project_id: project.id.clone(),
            source_project_id: uuid::Uuid::new_v4().to_string(),
            source_sha256: "a".repeat(64),
            source_tag_id: 42,
            source_tag_path: "scenery/rock".into(),
            source_tag_class: "scen".into(),
            native_path: path.clone(),
            extraction_job_id: uuid::Uuid::new_v4().to_string(),
            files: tag_exchange::inventory(&tags).unwrap().0,
            tools: BTreeMap::new(),
        };
        let receipt_file = directory.join("import.json");
        let bytes = serde_json::to_vec(&receipt).unwrap();
        fs::write(&receipt_file, &bytes).unwrap();
        project.native_asset_imports.push(Binding {
            id,
            source_project_id: receipt.source_project_id.clone(),
            source_sha256: receipt.source_sha256.clone(),
            tag_id: 42,
            tag_class: "scen".into(),
            tag_path: "scenery/rock".into(),
            native_path: path,
            receipt_sha256: crate::hex_bytes(Sha256::digest(&bytes)),
            file_count: 1,
        });
        let expected = BTreeMap::from([(
            receipt.files[0].path.clone(),
            receipt.files[0].sha256.clone(),
        )]);
        assert_eq!(source_hashes(root.path(), &project).unwrap(), expected);
        let planned = staging_inventory(root.path(), &project).unwrap();
        assert_eq!(planned.files.len(), 1);
        assert_eq!(planned.bytes, b"source identity".len() as u64);
        assert_eq!(planned.files[0].path, receipt.files[0].path);
        fs::write(&file, b"changed payload").unwrap();
        assert!(source_hashes(root.path(), &project).is_err());
        assert!(staging_inventory(root.path(), &project).is_err(), "Admission must rehash payloads, not trust old receipt sizes");
        fs::write(&file, b"source identity").unwrap();
        fs::write(&receipt_file, b"changed receipt").unwrap();
        assert!(source_hashes(root.path(), &project).is_err());
        assert!(staging_inventory(root.path(), &project).is_err());
        fs::write(&receipt_file, &bytes).unwrap();
        assert_eq!(source_hashes(root.path(), &project).unwrap(), expected);
        project
            .native_asset_imports
            .push(project.native_asset_imports[0].clone());
        assert!(source_hashes(root.path(), &project).is_err());
        assert!(staging_inventory(root.path(), &project).is_err());
        project.native_asset_imports.pop();
        fs::rename(&file, tags.join("outside.scenery")).unwrap();
        receipt.files = tag_exchange::inventory(&tags).unwrap().0;
        let bytes = serde_json::to_vec(&receipt).unwrap();
        fs::write(&receipt_file, &bytes).unwrap();
        project.native_asset_imports[0].receipt_sha256 = crate::hex_bytes(Sha256::digest(bytes));
        assert!(source_hashes(root.path(), &project).is_err());
    }
    #[test]
    fn namespaces_identity_and_receipt_content_are_required_and_fingerprinted() {
        let mut project = Project::new("Native import");
        let before = project.fingerprint().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let mut binding = Binding {
            id: id.clone(),
            source_project_id: uuid::Uuid::new_v4().to_string(),
            source_sha256: "a".repeat(64),
            tag_id: 42,
            tag_class: "scen".into(),
            tag_path: "scenery/rock".into(),
            native_path: format!("gs_assets_{}/scenery/rock", id.replace('-', "")),
            receipt_sha256: "b".repeat(64),
            file_count: 5,
        };
        validate(std::slice::from_ref(&binding)).unwrap();
        project.native_asset_imports.push(binding.clone());
        assert_ne!(before, project.fingerprint().unwrap());
        binding.native_path = "scenery/rock".into();
        assert!(validate(&[binding]).is_err());
        let root = tempfile::tempdir().unwrap();
        assert!(available_files(root.path(), &project).is_err());
    }
}
