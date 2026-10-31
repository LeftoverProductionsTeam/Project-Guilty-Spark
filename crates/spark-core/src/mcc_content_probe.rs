//! Bounded, read-only inventory of a user-selected MCC Halo 1 installation.
//!
//! This is a content prerequisite probe, not a launcher, converter or network
//! adapter. Reports contain relative paths only. File presence and a valid tag
//! index never grant gameplay, resource-decoding or cross-protocol acceptance.
use crate::{binary::Reader, invalid, maps, reject_links, Result, SparkError};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet, VecDeque},
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::Path,
};

const MAX_ENTRIES: usize = 4096;
const MAX_FILES: usize = 512;
const MAX_DEPTH: usize = 4;
const MAX_READ_BYTES: usize = 64 * 1024 * 1024;
const MAX_CACHE_COUNT: usize = 128;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProbeTarget {
    MccHalo1,
    SparkInspection,
    ChupathingyCe,
    OpenCe,
    ExperimentalRemix,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PrerequisiteStatus {
    Supplied,
    Missing,
    Convertible,
    Unverified,
    Unsupported,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProbeOperation {
    RunMcc,
    ReadMccAssets,
    BuildOtherTarget,
    JoinOtherProtocol,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prerequisite {
    pub id: String,
    pub status: PrerequisiteStatus,
    pub supplies: Vec<String>,
    pub detail: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationReport {
    pub operation: ProbeOperation,
    pub status: PrerequisiteStatus,
    pub detail: String,
    pub prerequisites: Vec<Prerequisite>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheInventory {
    pub version: u32,
    pub name: String,
    pub build: String,
    pub scenario_type: u16,
    pub tag_count: usize,
    pub tag_classes: BTreeMap<String, usize>,
    pub external_tag_classes: BTreeMap<String, usize>,
    /// SHA-256 of the 2048-byte header, not the complete map or its provenance.
    pub header_sha256: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentFile {
    pub relative_path: String,
    pub kind: String,
    pub bytes: u64,
    pub status: PrerequisiteStatus,
    pub detail: String,
    pub cache: Option<CacheInventory>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchPin {
    pub project: String,
    pub revision: String,
    pub source: String,
    pub license_notice: String,
    pub evidence: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentProbe {
    pub schema_version: u32,
    pub target: ProbeTarget,
    pub source_generation: String,
    pub complete: bool,
    pub entries_visited: usize,
    pub bytes_read: usize,
    pub files: Vec<ContentFile>,
    pub operations: Vec<OperationReport>,
    pub limitations: Vec<String>,
    pub next_loader_slice: String,
    pub research: Vec<ResearchPin>,
}

#[derive(Default)]
struct Budget {
    entries: usize,
    bytes: usize,
    caches: usize,
    incomplete: bool,
}

fn bounded_read(
    file: &mut File,
    offset: u64,
    bytes: usize,
    budget: &mut Budget,
) -> Result<Vec<u8>> {
    if bytes > MAX_READ_BYTES.saturating_sub(budget.bytes) {
        budget.incomplete = true;
        return invalid("Read-only inventory byte budget reached");
    }
    let len = file.metadata()?.len();
    if offset.checked_add(bytes as u64).is_none_or(|end| end > len) {
        return invalid("Content inventory range escapes its file");
    }
    budget.bytes += bytes;
    file.seek(SeekFrom::Start(offset))?;
    let mut buffer = vec![0; bytes];
    file.read_exact(&mut buffer)?;
    Ok(buffer)
}

fn cache_inventory(file: &mut File, budget: &mut Budget) -> Result<CacheInventory> {
    if budget.caches == MAX_CACHE_COUNT {
        budget.incomplete = true;
        return invalid("Read-only cache-count budget reached");
    }
    budget.caches += 1;
    let header_bytes = bounded_read(file, 0, 2048, budget)?;
    let header = maps::parse_header(&header_bytes, file.metadata()?.len())?;
    if header.compressed || header.extended || header.version != 13 {
        return invalid("Selected MCC installation contains a non-v13, compressed or extended cache; no format or dependency was guessed");
    }
    let index = bounded_read(file, header.tag_offset as u64, 0x28, budget)?;
    let r = Reader(&index);
    if r.u32(0x24)? != 0x74616773 {
        return invalid("Cache tag-index signature is invalid");
    }
    let array = r.u32(0)?;
    let base = array
        .checked_sub(0x28)
        .ok_or_else(|| SparkError::Invalid("MCC tag-index base underflows".into()))?;
    let count = r.u32(12)? as usize;
    if count == 0 || count > maps::MAX_TAGS {
        return invalid("Cache tag count is empty or exceeds the audited limit");
    }
    let table_bytes = count
        .checked_mul(32)
        .ok_or_else(|| SparkError::Invalid("Cache tag-index length overflows".into()))?;
    let relative = array
        .checked_sub(base)
        .ok_or_else(|| SparkError::Invalid("Cache table pointer precedes its base".into()))?
        as usize;
    if relative
        .checked_add(table_bytes)
        .is_none_or(|end| end > header.tag_size as usize)
    {
        return invalid("Cache tag table escapes the declared tag-data region");
    }
    let table = bounded_read(
        file,
        header.tag_offset as u64 + relative as u64,
        table_bytes,
        budget,
    )?;
    let r = Reader(&table);
    let mut ids = BTreeSet::new();
    let mut classes = BTreeMap::new();
    let mut external = BTreeMap::new();
    for i in 0..count {
        let at = i * 32;
        let class = r.fourcc(at)?;
        if class.contains('?') || !ids.insert(r.u32(at + 12)?) {
            return invalid("Cache tag index has an invalid class or duplicate identifier");
        }
        let flag = r.u32(at + 24)?;
        if flag > 1 {
            return invalid("Cache tag index has an invalid external-resource flag");
        }
        for pointer_at in [at + 16, at + 20] {
            // External data indexes and BSP pointers use a different address space.
            if pointer_at == at + 20 && (flag == 1 || class == "sbsp") {
                continue;
            }
            let pointer = r.u32(pointer_at)?;
            let offset = pointer.checked_sub(base).ok_or_else(|| {
                SparkError::Invalid("Cache tag pointer precedes its tag-data base".into())
            })?;
            if offset >= header.tag_size {
                return invalid("Cache tag pointer escapes its tag-data region");
            }
        }
        *classes.entry(class.clone()).or_insert(0) += 1;
        if flag == 1 {
            *external.entry(class).or_insert(0) += 1;
        }
    }
    Ok(CacheInventory {
        version: header.version,
        name: header.name,
        build: header.build,
        scenario_type: header.scenario_type,
        tag_count: count,
        tag_classes: classes,
        external_tag_classes: external,
        header_sha256: crate::hex_bytes(Sha256::digest(header_bytes)),
    })
}

fn kind(path: &str) -> &'static str {
    let path = path.to_ascii_lowercase();
    let name = path.rsplit('/').next().unwrap_or("");
    if matches!(name, "bitmaps.map" | "sounds.map" | "loc.map") {
        "resourceMap"
    } else if path.ends_with(".map") {
        "scenarioCache"
    } else if path.ends_with(".exe") || name == "halo1.dll" {
        "runtimeBinary"
    } else if path.ends_with(".imeta") {
        "textureIndex"
    } else if path.ends_with(".ipak") {
        "texturePack"
    } else if path.ends_with(".fsb") {
        "audioBank"
    } else if path.contains("/shaders/") || path.contains("/shaders_2_cache/") {
        "shaderResource"
    } else if path.ends_with(".s3dpak") || path.ends_with(".mlmd") || path.ends_with(".fmeta") {
        "anniversaryResource"
    } else {
        "otherResource"
    }
}

fn inspect_file(root: &Path, relative: &str, budget: &mut Budget) -> ContentFile {
    let mut record = ContentFile {
        relative_path: relative.into(),
        kind: kind(relative).into(),
        bytes: 0,
        status: PrerequisiteStatus::Unverified,
        detail: String::new(),
        cache: None,
    };
    let result = (|| -> Result<()> {
        let path = root.join(relative);
        reject_links(&path)?;
        let mut file = File::open(&path)?;
        let before = file.metadata()?;
        if !before.is_file() {
            return invalid("Content inventory accepts regular files only");
        }
        record.bytes = before.len();
        if record.kind == "scenarioCache" {
            let cache = cache_inventory(&mut file, budget)?;
            record.detail = "MCC v13 header and tag-index bounds inspected; tag payloads, dependency closure and gameplay remain unverified".into();
            record.cache = Some(cache);
            record.status = PrerequisiteStatus::Supplied;
        } else if record.kind == "resourceMap" {
            let bytes = bounded_read(&mut file, 0, 16, budget)?;
            let r = Reader(&bytes);
            let expected = match relative
                .rsplit('/')
                .next()
                .unwrap_or("")
                .to_ascii_lowercase()
                .as_str()
            {
                "bitmaps.map" => 1,
                "sounds.map" => 2,
                _ => 3,
            };
            let names = r.u32(4)? as u64;
            let index = r.u32(8)? as u64;
            let count = r.u32(12)? as u64;
            if r.u32(0)? != expected
                || names < 16
                || index < names
                || count == 0
                || count > 65_535
                || index
                    .checked_add(count * 12)
                    .is_none_or(|end| end > record.bytes)
            {
                return invalid("Resource-map header/type or index bounds are invalid");
            }
            record.status = PrerequisiteStatus::Supplied;
            record.detail = format!("Selected MCC resource header: type {expected}, {count} entries; generation comes from the selected installation, entry identities and dependency matches remain unverified");
        } else if record.kind == "runtimeBinary" {
            let bytes = bounded_read(&mut file, 0, 2, budget)?;
            if bytes != b"MZ" {
                return invalid("Selected runtime file has no Windows executable signature");
            }
            record.status = PrerequisiteStatus::Supplied;
            record.detail = "Windows executable signature present; complete build identity, ownership, launch suitability and execution are not established".into();
        } else {
            // A filename is inventory evidence, not a claim that a proprietary
            // pack/bank has been decoded or mapped to its corresponding tag.
            record.detail = "Present in selected installation; payload, content identity and resource-to-tag matching have not been decoded by this probe".into();
        }
        let after = file.metadata()?;
        if before.len() != after.len() || before.modified().ok() != after.modified().ok() {
            return invalid("Content changed during the read-only inventory; probe again before using this evidence");
        }
        Ok(())
    })();
    if let Err(error) = result {
        record.status = PrerequisiteStatus::Unverified;
        record.cache = None;
        // Avoid exposing installation paths in errors from I/O or link checks.
        record.detail = match error {
            SparkError::Invalid(message)
                if !message.contains(&root.to_string_lossy().to_string()) =>
            {
                message
            }
            _ => {
                "File was unreadable, changed or used a link; it supplies no validated prerequisite"
                    .into()
            }
        };
    }
    record
}

fn requirement(
    id: &str,
    status: PrerequisiteStatus,
    supplies: Vec<String>,
    detail: &str,
) -> Prerequisite {
    Prerequisite {
        id: id.into(),
        status,
        supplies,
        detail: detail.into(),
    }
}

fn evaluate(target: ProbeTarget, files: &[ContentFile], complete: bool) -> Vec<OperationReport> {
    let supplied = |file: &&ContentFile| file.status == PrerequisiteStatus::Supplied;
    let paths = |predicate: &dyn Fn(&ContentFile) -> bool| {
        files
            .iter()
            .filter(supplied)
            .filter(|f| predicate(f))
            .map(|f| f.relative_path.clone())
            .collect::<Vec<_>>()
    };
    let maps = paths(&|file| file.cache.is_some());
    let ui = paths(&|file| {
        file.relative_path.eq_ignore_ascii_case("halo1/maps/ui.map")
            && file
                .cache
                .as_ref()
                .is_some_and(|cache| cache.scenario_type == 2)
    });
    let launch = paths(&|file| {
        file.relative_path
            .eq_ignore_ascii_case("MCC/Binaries/Win64/MCC-Win64-Shipping.exe")
    });
    let halo = paths(&|file| file.relative_path.eq_ignore_ascii_case("halo1/halo1.dll"));
    let file_paths = |category: &str| {
        files
            .iter()
            .filter(|f| f.kind == category)
            .map(|f| f.relative_path.clone())
            .collect::<Vec<_>>()
    };
    let found = |values: &[String]| {
        if !values.is_empty() {
            PrerequisiteStatus::Supplied
        } else if complete {
            PrerequisiteStatus::Missing
        } else {
            PrerequisiteStatus::Unverified
        }
    };
    let examined = |values: &[String], has_candidate: bool| {
        if values.is_empty() && has_candidate {
            PrerequisiteStatus::Unverified
        } else {
            found(values)
        }
    };
    let uncertain_cache = files
        .iter()
        .any(|file| file.kind == "scenarioCache" && file.cache.is_none());
    let map_status = examined(&maps, uncertain_cache);
    let ui_status = examined(
        &ui,
        files
            .iter()
            .any(|file| file.relative_path.eq_ignore_ascii_case("halo1/maps/ui.map")),
    );
    let launch_status = examined(
        &launch,
        files.iter().any(|file| {
            file.relative_path
                .eq_ignore_ascii_case("MCC/Binaries/Win64/MCC-Win64-Shipping.exe")
        }),
    );
    let halo_status = examined(
        &halo,
        files
            .iter()
            .any(|file| file.relative_path.eq_ignore_ascii_case("halo1/halo1.dll")),
    );
    let all_class = |class: &str| {
        paths(&|f| {
            f.cache
                .as_ref()
                .is_some_and(|c| c.tag_classes.get(class).is_some_and(|n| *n > 0))
        })
    };
    let mut assets = vec![
        requirement("mcc-v13-caches", map_status, maps.clone(), "Header and tag-index evidence only; cache dependencies, all tag payloads and renderer/audio parity need their existing readers and native acceptance."),
        requirement("mcc-startup-ui", ui_status, ui, "An MCC UI cache is not a compatible Xbox startup UI. No widget execution or native boot is performed."),
    ];
    for (id, class) in [
        ("embedded-models", "mod2"),
        ("embedded-animations", "antr"),
        ("embedded-sounds", "snd!"),
        ("embedded-localization", "ustr"),
        ("embedded-shaders", "senv"),
        ("embedded-fonts", "font"),
        ("embedded-globals", "matg"),
        ("embedded-ui-widgets", "DeLa"),
    ] {
        let values = all_class(class);
        assets.push(requirement(id, examined(&values, uncertain_cache), values, "Tag class appears in a bounded MCC index; payload decoding, all references and target ABI compatibility remain unverified."));
    }
    for (id, category) in [
        ("mcc-texture-indexes", "textureIndex"),
        ("mcc-texture-packs", "texturePack"),
        ("mcc-audio-banks", "audioBank"),
        ("mcc-shader-resources", "shaderResource"),
    ] {
        let values = file_paths(category);
        let status = if values.is_empty() {
            found(&values)
        } else {
            PrerequisiteStatus::Unverified
        };
        assets.push(requirement(id, status, values, "Files are present when listed; this probe does not validate proprietary pack/bank payloads, language coverage or exact tag matches."));
    }
    for (id, relative) in [
        ("mcc-singleplayer-bitmaps", "halo1/maps/bitmaps.map"),
        (
            "mcc-multiplayer-bitmaps",
            "halo1/maps/custom_edition/bitmaps.map",
        ),
        (
            "mcc-multiplayer-sounds",
            "halo1/maps/custom_edition/sounds.map",
        ),
        (
            "mcc-multiplayer-localization",
            "halo1/maps/custom_edition/loc.map",
        ),
    ] {
        let values = paths(&|file| file.relative_path.eq_ignore_ascii_case(relative));
        let status = examined(
            &values,
            files
                .iter()
                .any(|file| file.relative_path.eq_ignore_ascii_case(relative)),
        );
        assets.push(requirement(id, status, values, "Expected resource-map location and bounded header are inspected separately. Complete hashes, payload/entry identities and per-map dependency matching remain unverified; the MCC loc.map is not accepted by the reviewed experimental loader."));
    }
    let mut launch_requirements = vec![
        requirement("mcc-executable", launch_status, launch.clone(), "Present executable signature is not a verified executable profile or permission to attach to a running session."),
        requirement("halo1-module", halo_status, halo.clone(), "Halo 1 module is required independently of the MCC launcher."),
    ];
    launch_requirements.push(requirement("native-launch-acceptance", PrerequisiteStatus::Unverified, vec![], "This read-only probe does not launch MCC, attach, establish mod-session suitability or certify a running build."));
    let foreign = matches!(
        target,
        ProbeTarget::ChupathingyCe | ProbeTarget::OpenCe | ProbeTarget::ExperimentalRemix
    );
    let mut build = vec![requirement("editable-source-and-compiler", PrerequisiteStatus::Unverified, vec![], "Compiled MCC caches do not supply a complete editable source tree or a matching compiler. Use a separate SDK/source setup and dependency-checked build profile.")];
    if foreign {
        build.push(requirement("native-xbox-base-data", if complete { PrerequisiteStatus::Missing } else { PrerequisiteStatus::Unverified }, vec![], "This MCC installation does not supply the Xbox v5 startup/base set required by the reviewed upstream boot route. Select separately owned Xbox data through that runtime's importer; no disc or source-data ownership is inferred."));
        build.push(requirement("ce-resource-generation", PrerequisiteStatus::Unsupported, paths(&|f| f.kind == "resourceMap"), "MCC bitmaps/sounds/loc filenames do not establish Custom Edition resource identity. Matching CE resources are separately required for upstream CE-map import; do not substitute MCC resources."));
        build.push(requirement("mcc-loader", if target == ProbeTarget::ExperimentalRemix { PrerequisiteStatus::Unverified } else { PrerequisiteStatus::Unsupported }, maps.clone(), if target == ProbeTarget::ExperimentalRemix { "Pinned Remix source implements an experimental v13 solo loader and separate MCC resources. Spark has neither integrated nor game-tested it; its original Xbox startup remains a separate prerequisite." } else { "The reviewed target documents Xbox base data and optional classic PC/CE maps, not a complete MCC-data boot path. Spark supplies no v13-to-Xbox/CE converter or target loader." }));
    }
    vec![
        OperationReport { operation: ProbeOperation::RunMcc, status: if launch_status == PrerequisiteStatus::Missing || halo_status == PrerequisiteStatus::Missing { PrerequisiteStatus::Missing } else { PrerequisiteStatus::Unverified }, detail: "Detect the installed MCC executable separately from content reading; native launch is untested by this probe.".into(), prerequisites: launch_requirements },
        OperationReport { operation: ProbeOperation::ReadMccAssets, status: map_status, detail: "Bounded read-only cache/index inventory is available for the listed v13 files. This does not certify full rendering, audio, extraction or gameplay.".into(), prerequisites: assets },
        OperationReport { operation: ProbeOperation::BuildOtherTarget, status: if foreign && target != ProbeTarget::ExperimentalRemix { PrerequisiteStatus::Unsupported } else { PrerequisiteStatus::Unverified }, detail: "A new runtime needs its own loader or complete source conversion, matching startup data and native testing; changing a header is insufficient.".into(), prerequisites: build },
        OperationReport { operation: ProbeOperation::JoinOtherProtocol, status: if foreign { PrerequisiteStatus::Unsupported } else { PrerequisiteStatus::Unverified }, detail: "Content ownership, cache readability and Steam identity do not translate game protocols. Networking needs an explicit exact-build adapter and matching peer content.".into(), prerequisites: vec![requirement("target-network-adapter", if foreign { PrerequisiteStatus::Unsupported } else { PrerequisiteStatus::Unverified }, vec![], if target == ProbeTarget::ExperimentalRemix { "Reviewed Remix MCC support is solo-only; its docs explicitly exclude the referenced GulchCE MCC network extension. No Spark cross-protocol adapter exists." } else { "An MCC client does not join Chupathingy/OpenCE/PC/CE/console peers merely by selecting their data. No protocol translation is supplied by this content probe." })] },
    ]
}

/// Inspect only the MCC Halo 1 subtree and known launch paths of the selected
/// installation. No extraction, writes, executable launch, process inspection,
/// network request, full-pack hash or automatic parent-directory discovery.
pub fn probe_installation(root: &Path, target: ProbeTarget) -> Result<ContentProbe> {
    reject_links(root)?;
    if !root.is_dir() {
        return invalid("Select an existing MCC installation directory");
    }
    reject_links(&root.join("halo1"))?;
    if !root.join("halo1").is_dir() {
        return invalid("Select the MCC installation root containing its halo1 directory");
    }
    let mut budget = Budget::default();
    let mut paths = BTreeSet::new();
    let mut limitations = vec!["Only the selected installation is searched. Ownership, complete file identity, full dependency closure and native gameplay are not authenticated.".into()];
    for known in [
        "mcclauncher.exe",
        "MCC/Binaries/Win64/MCC-Win64-Shipping.exe",
        "halo1/halo1.dll",
    ] {
        if root.join(known).exists() {
            paths.insert(known.to_owned());
        }
    }
    let mut queue = VecDeque::new();
    for folder in [
        "halo1/maps",
        "halo1/prebuild",
        "halo1/sound",
        "halo1/shaders",
    ] {
        if root.join(folder).exists() {
            queue.push_back((folder.to_owned(), 0usize));
        }
    }
    while let Some((relative, depth)) = queue.pop_front() {
        let directory = root.join(&relative);
        if reject_links(&directory).is_err() {
            budget.incomplete = true;
            limitations.push(format!("Skipped linked directory: {relative}"));
            continue;
        }
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(_) => {
                budget.incomplete = true;
                limitations.push(format!("Could not enumerate directory: {relative}"));
                continue;
            }
        };
        // Bound enumeration before collecting/sorting so a hostile directory
        // cannot allocate arbitrarily. Sort the selected entries for stable reports.
        let mut children = Vec::new();
        for entry in entries {
            if budget.entries == MAX_ENTRIES {
                budget.incomplete = true;
                break;
            }
            budget.entries += 1;
            match entry {
                Ok(entry) => children.push(entry),
                Err(_) => budget.incomplete = true,
            }
        }
        children.sort_by_key(|entry| entry.file_name());
        for entry in children {
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                budget.incomplete = true;
                continue;
            };
            let child = format!("{relative}/{name}");
            if crate::safe_relative(&child).is_err() || reject_links(&entry.path()).is_err() {
                budget.incomplete = true;
                limitations.push(format!("Skipped unsafe or linked entry beneath {relative}"));
                continue;
            }
            let metadata = match entry.metadata() {
                Ok(metadata) => metadata,
                Err(_) => {
                    budget.incomplete = true;
                    continue;
                }
            };
            if metadata.is_dir() {
                if depth < MAX_DEPTH {
                    queue.push_back((child, depth + 1));
                } else {
                    budget.incomplete = true;
                }
            } else if metadata.is_file() {
                if paths.len() < MAX_FILES {
                    paths.insert(child);
                } else {
                    budget.incomplete = true;
                }
            }
        }
        if budget.entries == MAX_ENTRIES {
            break;
        }
    }
    let mut files = Vec::new();
    for path in paths {
        files.push(inspect_file(root, &path, &mut budget));
    }
    if budget.incomplete {
        limitations.push(format!("Inventory incomplete: limits are {MAX_ENTRIES} entries, {MAX_FILES} files, {MAX_CACHE_COUNT} cache indexes, depth {MAX_DEPTH}, {MAX_READ_BYTES} bytes. Missing prerequisites outside the visited set remain unverified."));
    }
    let complete = !budget.incomplete;
    let operations = evaluate(target, &files, complete);
    Ok(ContentProbe {
        schema_version: 1,
        target,
        source_generation: "mcc-halo1-v13-selected-installation".into(),
        complete,
        entries_visited: budget.entries,
        bytes_read: budget.bytes,
        files,
        operations,
        limitations,
        next_loader_slice: "For an MCC-only community-runtime boot, implement and validate startup UI/global/font/localization loading first, then exact external bitmap/audio identity, model/animation/shader normalization, scenario/collision/script loading and native acceptance. The experimental solo loader is a research lead; code provenance/license review, Spark integration and native tests remain outstanding. Target network replication is a separate slice.".into(),
        research: research_pins(),
    })
}

pub fn research_pins() -> Vec<ResearchPin> {
    vec![
        ResearchPin { project: "Chupathingy".into(), revision: "c5a07c69589ab8d40180fc99eac993bc06b06ebb".into(), source: "https://github.com/ChupathingyCE/chupathingyce/blob/c5a07c69589ab8d40180fc99eac993bc06b06ebb/README.md".into(), license_notice: "Repository declares GPL-3.0-or-later; inherited engine source and bundled notices need provenance/license review before reuse. Proprietary game data is separate.".into(), evidence: "Upstream-declared Xbox base data; optional maps_ce requires matching Custom Edition bitmaps.map, sounds.map and loc.map. No MCC-only boot acceptance.".into() },
        ResearchPin { project: "OpenCE".into(), revision: "f2597b704d59e66257dba7629f22a0f78f5f3d09".into(), source: "https://github.com/OpenCommunityEdition/OpenCE/blob/f2597b704d59e66257dba7629f22a0f78f5f3d09/README.md".into(), license_notice: "Repository declares AGPL-3.0; this does not independently authenticate rights in inherited engine source or proprietary game data.".into(), evidence: "Upstream-declared owned Xbox ISO/XISO import and Xbox base maps; PC/CE maps are not accepted as the base set. No MCC-only boot acceptance.".into() },
        ResearchPin { project: "Experimental HaloCE Decomp Remix".into(), revision: "f9ef816e9a15d94070b4c8f62a616436f8eb8349".into(), source: "https://github.com/moistman42069/HaloCE-DecompRemix-VR-PC-Android/blob/f9ef816e9a15d94070b4c8f62a616436f8eb8349/docs/mcc_maps.md".into(), license_notice: "Repository declares AGPL-3.0 and attributes the MCC lead to GulchCE/chestahh under CC0; notices/source provenance still require review before code reuse. No upstream code is copied here.".into(), evidence: "Independent experimental v13 loader with separate MCC resource matching; this port documents MCC solo-only and an independent Xbox base startup. Not a certified Spark backend or cross-protocol adapter.".into() },
    ]
}
