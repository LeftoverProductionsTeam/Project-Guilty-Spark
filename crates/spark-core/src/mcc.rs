//! Source-safe local MCC registration. Excession-produced metadata is preserved verbatim.
//! Microsoft documents the workflow, but does not publish a complete JSON schema. Never invent it.
use crate::{
    invalid, maps,
    project::{atomic_write, Project},
    reject_links, safe_relative, Result, SparkError,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

/// MCC resolves a metadata scenario path to its scenario basename in maps/.
/// The cache-header name may differ from that basename in MCC.
pub fn package_map_name(scenario: &str) -> Result<String> {
    let relative = safe_relative(scenario)?;
    let leaf = relative
        .file_name()
        .and_then(|p| p.to_str())
        .ok_or_else(|| SparkError::Invalid("Scenario path has no filename".into()))?;
    Ok(format!("{leaf}.map"))
}
const ROOT_MARKER: &str = ".guilty-spark-root.json";
const OWNER: &str = "ProjectGuiltySpark/v1";
fn read_bounded(path: &Path, limit: u64) -> Result<Vec<u8>> {
    reject_links(path)?;
    let file = fs::File::open(path)?;
    if file.metadata()?.len() > limit {
        return invalid(format!(
            "{} exceeds its {} byte safety limit",
            path.display(),
            limit
        ));
    }
    let mut bytes = vec![];
    file.take(limit + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit {
        return invalid(format!("{} grew beyond its safety limit", path.display()));
    }
    Ok(bytes)
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedRoot {
    pub root: PathBuf,
    pub inbox: PathBuf,
    pub mods: PathBuf,
}
/// Discovery must not create directories or change a game installation.
pub fn inspect_managed_root(install: &Path) -> Result<Option<ManagedRoot>> {
    let root = install.join("halo1/GuiltySpark");
    reject_links(&root)?;
    if !root.exists() {
        return Ok(None);
    }
    let marker: Value = serde_json::from_slice(&read_bounded(&root.join(ROOT_MARKER), 16 * 1024)?)?;
    if marker.get("owner").and_then(Value::as_str) != Some(OWNER) {
        return invalid("GuiltySpark root belongs to an unknown owner");
    }
    let inbox = root.join("Inbox");
    let mods = root.join("Mods");
    reject_links(&inbox)?;
    reject_links(&mods)?;
    if !inbox.is_dir() || !mods.is_dir() {
        return invalid("Owned MCC root is incomplete; explicitly initialize it before deployment");
    }
    Ok(Some(ManagedRoot { root, inbox, mods }))
}
pub fn initialize(install: &Path) -> Result<ManagedRoot> {
    if !install.join("halo1/maps").is_dir() {
        return invalid("Selected installation does not contain halo1/maps");
    }
    let root = install.join("halo1/GuiltySpark");
    reject_links(&root)?;
    if root.exists() {
        let marker = root.join(ROOT_MARKER);
        if !marker.is_file() {
            return invalid("halo1/GuiltySpark already exists without an ownership marker. Its contents will not be changed.");
        }
        let v: Value = serde_json::from_slice(&read_bounded(&marker, 16 * 1024)?)?;
        if v.get("owner").and_then(Value::as_str) != Some(OWNER) {
            return invalid("GuiltySpark root belongs to an unknown owner");
        }
    } else {
        fs::create_dir(&root)?;
        atomic_write(
            &root.join(ROOT_MARKER),
            &serde_json::to_vec(&serde_json::json!({"owner":OWNER,"schemaVersion":1}))?,
            false,
        )?;
    }
    let inbox = root.join("Inbox");
    let mods = root.join("Mods");
    reject_links(&inbox)?;
    reject_links(&mods)?;
    fs::create_dir_all(&inbox)?;
    fs::create_dir_all(&mods)?;
    Ok(ManagedRoot { root, inbox, mods })
}

fn decode_manifest(bytes: &[u8]) -> Result<(String, bool, bool)> {
    if bytes.len() > 1024 * 1024 {
        return invalid("ModManifest.txt exceeds 1 MiB; registration stopped");
    }
    if bytes.starts_with(&[0xff, 0xfe]) {
        if !bytes.len().is_multiple_of(2) {
            return invalid("Malformed UTF-16 manifest");
        }
        let values: Vec<u16> = bytes[2..]
            .as_chunks::<2>()
            .0
            .iter()
            .map(|c| u16::from_le_bytes(*c))
            .collect();
        let text = String::from_utf16(&values)
            .map_err(|_| SparkError::Invalid("Malformed UTF-16 manifest".into()))?;
        Ok((text, true, false))
    } else {
        let bom = bytes.starts_with(&[0xef, 0xbb, 0xbf]);
        let b = if bom { &bytes[3..] } else { bytes };
        let text = std::str::from_utf8(b)
            .map_err(|_| {
                SparkError::Invalid(
                    "Manifest is neither UTF-8 nor UTF-16LE; it was not changed".into(),
                )
            })?
            .to_string();
        Ok((text, false, bom))
    }
}
/// Rust's Windows canonical paths use the extended-length namespace. MCC's
/// manifest uses ordinary DOS/UNC paths, so preserve the same location in both
/// spellings. In particular, removing only `\\?\` from a UNC path loses its
/// leading share separators. Leave other device namespaces untouched.
fn manifest_path_spelling(value: &str) -> String {
    if let Some(tail) = value.strip_prefix("\\\\?\\") {
        if tail
            .get(..4)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case("UNC\\"))
        {
            return format!("\\\\{}", &tail[4..]);
        }
        let bytes = tail.as_bytes();
        if bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && bytes[2] == b'\\'
        {
            return tail.to_owned();
        }
    }
    value.to_owned()
}
fn normalized_path(s: &str) -> String {
    let value = s.trim().trim_matches('"').replace('/', "\\");
    manifest_path_spelling(&value)
        .trim_end_matches('\\')
        .to_lowercase()
}
pub fn manifest_contains(manifest: &Path, root: &Path) -> Result<bool> {
    if !manifest.exists() {
        return Ok(false);
    }
    let (text, _, _) = decode_manifest(&read_bounded(manifest, 1024 * 1024)?)?;
    // Registration canonicalizes the selected directory. Resolve it here too:
    // Windows temp roots can contain 8.3 aliases (e.g. RUNNER~1), which spelling
    // normalization alone cannot equate with the registered long directory name.
    // Keep lexical lookup for entries whose directories are currently unavailable.
    let resolved = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let path = resolved.to_string_lossy();
    Ok(text
        .lines()
        .any(|s| normalized_path(s) == normalized_path(&path)))
}
pub fn register_root(manifest: &Path, root: &Path) -> Result<Option<PathBuf>> {
    reject_links(manifest)?;
    reject_links(root)?;
    let value = manifest_path_spelling(&fs::canonicalize(root)?.to_string_lossy());
    if value.contains(['\n', '\r', '\0', '"']) {
        return invalid("Mod root cannot contain line breaks or quotes");
    }
    let parent = manifest
        .parent()
        .ok_or_else(|| SparkError::Invalid("Manifest has no parent directory".into()))?;
    fs::create_dir_all(parent)?;
    let lock = parent.join(".guilty-spark-manifest.lock");
    let lock_file=fs::OpenOptions::new().create_new(true).write(true).open(&lock).map_err(|e|SparkError::Invalid(format!("Manifest is locked by another operation ({e}); if the app crashed, remove only .guilty-spark-manifest.lock after closing Guilty Spark")))?;
    let result = (|| {
        let original = if manifest.exists() {
            read_bounded(manifest, 1024 * 1024)?
        } else {
            vec![]
        };
        let (mut text, utf16, bom) = decode_manifest(&original)?;
        if text
            .lines()
            .any(|s| normalized_path(s) == normalized_path(&value))
        {
            return Ok(None);
        }
        let newline = if text.contains("\r\n") {
            "\r\n"
        } else if text.contains('\n') {
            "\n"
        } else {
            "\r\n"
        };
        if !text.is_empty() && !text.ends_with('\n') {
            text.push_str(newline);
        }
        text.push_str(&value);
        text.push_str(newline);
        let bytes = if utf16 {
            let mut out = vec![0xff, 0xfe];
            for v in text.encode_utf16() {
                out.extend_from_slice(&v.to_le_bytes());
            }
            out
        } else {
            let mut out = if bom { vec![0xef, 0xbb, 0xbf] } else { vec![] };
            out.extend_from_slice(text.as_bytes());
            out
        };
        let current = if manifest.exists() {
            read_bounded(manifest, 1024 * 1024)?
        } else {
            vec![]
        };
        if current != original {
            return invalid("ModManifest changed during registration; retry to preserve the other writer's entries");
        }
        let backup = atomic_write(manifest, &bytes, true)?;
        let readback = match read_bounded(manifest, 1024 * 1024) {
            Ok(readback) => readback,
            Err(e) => return invalid(format!("Manifest write could not be verified: {e}. Its current state was not overwritten by a blind rollback. Original backup: {backup:?}")),
        };
        if readback != bytes {
            return invalid(format!("Manifest changed after registration. The other writer's bytes were preserved; original backup: {backup:?}"));
        }
        let verified = decode_manifest(&readback).map(|(text, _, _)| {
            text.lines()
                .any(|line| normalized_path(line) == normalized_path(&value))
        });
        if !matches!(verified, Ok(true)) {
            let restored = if backup.is_some() {
                atomic_write(manifest, &original, false).map(|_| ())
            } else {
                fs::remove_file(manifest).map_err(SparkError::from)
            };
            if let Err(e) = restored {
                return invalid(format!(
                    "Manifest verification and rollback failed: {e}. Original backup: {backup:?}"
                ));
            }
            return invalid("Manifest verification failed; previous configuration restored");
        }
        Ok(backup)
    })();
    drop(lock_file);
    let _ = fs::remove_file(lock);
    result
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateReport {
    pub valid: bool,
    pub title: String,
    pub engine: String,
    pub scenario_matches: bool,
    pub files: Vec<String>,
    pub blockers: Vec<String>,
}
fn gather(root: &Path, current: &Path, out: &mut Vec<PathBuf>, depth: u8) -> Result<()> {
    if depth > 8 {
        return invalid("Package metadata exceeds eight folder levels");
    }
    reject_links(current)?;
    for e in fs::read_dir(current)? {
        let e = e?;
        reject_links(&e.path())?;
        let rel = e.path().strip_prefix(root).unwrap().to_path_buf();
        if e.file_type()?.is_dir() {
            if !["maps", ".git", "node_modules"].contains(&e.file_name().to_string_lossy().as_ref())
            {
                gather(root, &e.path(), out, depth + 1)?;
            }
        } else {
            let ext = e
                .path()
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();
            if ["json", "png", "jpg", "jpeg", "bin", "mvar"].contains(&ext.as_str()) {
                if e.metadata()?.len() > 16 * 1024 * 1024 {
                    return invalid("A metadata file exceeds 16 MiB");
                }
                out.push(rel);
                if out.len() > 512 {
                    return invalid("Template has more than 512 metadata files");
                }
            }
        }
    }
    Ok(())
}
fn contains_scenario(v: &Value, path: &str) -> bool {
    match v {
        Value::String(s) => s
            .trim_end_matches(".scenario")
            .replace('\\', "/")
            .eq_ignore_ascii_case(&path.replace('\\', "/")),
        Value::Array(a) => a.iter().any(|v| contains_scenario(v, path)),
        Value::Object(o) => o.values().any(|v| contains_scenario(v, path)),
        _ => false,
    }
}
pub fn inspect_template(root: &Path, scenario: &str, scenario_type: u16) -> Result<TemplateReport> {
    let mut files = vec![];
    gather(root, root, &mut files, 0)?;
    let info: Value =
        serde_json::from_slice(&read_bounded(&root.join("ModInfo.json"), 16 * 1024 * 1024)?)?;
    let mut blockers = vec![];
    let engine = info
        .get("Engine")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    if engine != "Halo1" {
        blockers.push("Template must be an Excession package for Engine Halo1".into());
    }
    if info
        .pointer("/ModIdentifier/ModGuid")
        .and_then(Value::as_str)
        .and_then(|s| uuid::Uuid::parse_str(s).ok())
        .is_none()
    {
        blockers.push("ModInfo.json lacks a valid ModIdentifier.ModGuid".into());
    }
    if info
        .pointer("/ModIdentifier/HostedModIds/SteamWorkshopId")
        .and_then(Value::as_u64)
        .is_some_and(|n| n != 0)
    {
        blockers
            .push("Use a local unpublished Excession template with no Steam Workshop ID".into());
    }
    let title = info
        .pointer("/Title/Neutral")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    for required in ["ModVersion", "MinAppVersion", "MaxAppVersion"] {
        if !["Major", "Minor", "Patch"].iter().all(|k| {
            info.get(required)
                .and_then(|v| v.get(k))
                .and_then(Value::as_u64)
                .is_some()
        }) {
            blockers.push(format!(
                "Excession metadata needs {required} Major/Minor/Patch"
            ));
        }
    }
    let family = if scenario_type == 1 {
        "multiplayer"
    } else {
        "campaign"
    };
    let mut matches = false;
    for file in &files {
        if file.extension().is_some_and(|e| e == "json")
            && file
                .components()
                .next()
                .is_some_and(|c| c.as_os_str().to_string_lossy().eq_ignore_ascii_case(family))
        {
            let data: Value =
                serde_json::from_slice(&read_bounded(&root.join(file), 16 * 1024 * 1024)?)?;
            matches |= contains_scenario(&data, scenario);
        }
    }
    if !matches {
        blockers.push(format!("No {family} metadata references scenario '{scenario}'. Choose an Excession template configured for this exact scenario. This build preserves the official metadata rather than guessing its schema."));
    }
    if scenario_type == 2 {
        blockers.push("UI cache packaging is not supported".into());
    }
    Ok(TemplateReport {
        valid: blockers.is_empty(),
        title,
        engine,
        scenario_matches: matches,
        files: files
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect(),
        blockers,
    })
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageReceipt {
    pub owner: String,
    pub project_id: String,
    pub build_id: String,
    pub project_fingerprint: String,
    pub files: std::collections::BTreeMap<String, String>,
    pub created_at: String,
}
pub fn package(
    root: &ManagedRoot,
    template: &Path,
    map: &Path,
    project: &Project,
    build_id: &str,
) -> Result<PathBuf> {
    project.validate()?;
    if crate::steam::is_mcc_running() {
        return invalid("Close MCC before installing local mod content");
    }
    let inspection = maps::inspect_map(map, None)?;
    if inspection.header.version != 13
        || inspection.header.extended
        || inspection.header.build.contains("synthetic parser fixture")
    {
        return invalid("Only a validated version-13 MCC cache can enter a local package");
    }
    let fingerprint = project.fingerprint()?;
    let build = project
        .builds
        .iter()
        .find(|b| {
            b.id == build_id && b.status == "validated" && b.project_fingerprint == fingerprint
        })
        .ok_or_else(|| {
            SparkError::Invalid(
                "Packaging requires a recorded validated build of the current project".into(),
            )
        })?;
    if build.sha256.as_deref() != Some(&inspection.sha256) {
        return invalid("Package input does not match the validated build hash");
    }
    if !project.scenario_path()?
            .replace('\\', "/")
            .eq_ignore_ascii_case(&inspection.scenario_path.replace('\\', "/"))
    {
        return invalid("Package map scenario differs from the source project");
    }
    let report = inspect_template(
        template,
        &inspection.scenario_path,
        inspection.header.scenario_type,
    )?;
    if !report.valid {
        return invalid(report.blockers.join("\n"));
    }
    let destination = root.mods.join(&project.id);
    reject_links(&destination)?;
    if destination.exists() {
        return invalid("This project already has a package. Remove its owned package before installing a new build; unknown files are never overwritten.");
    }
    let stage = root.root.join(format!(".package-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&stage)?;
    let result = (|| -> Result<()> {
        for file in &report.files {
            let rel = safe_relative(file)?;
            let to = stage.join(&rel);
            if let Some(p) = to.parent() {
                fs::create_dir_all(p)?;
            }
            fs::copy(template.join(rel), to)?;
        }
        // The only metadata change uses the documented identifier; all map metadata is official-template data.
        let info_path = stage.join("ModInfo.json");
        let mut info: Value = serde_json::from_slice(&read_bounded(&info_path, 16 * 1024 * 1024)?)?;
        info["ModIdentifier"]["ModGuid"] = serde_json::json!(project.id);
        atomic_write(&info_path, &serde_json::to_vec_pretty(&info)?, false)?;
        let maps_dir = stage.join("maps");
        fs::create_dir_all(&maps_dir)?;
        let filename = package_map_name(&inspection.scenario_path)?;
        fs::copy(map, maps_dir.join(&filename))?;
        let mut filelist = vec![];
        gather(&stage, &stage, &mut filelist, 0)?;
        filelist.push(PathBuf::from("maps").join(filename));
        let mut hashes = std::collections::BTreeMap::new();
        for file in filelist {
            hashes.insert(
                file.to_string_lossy().to_string(),
                maps::hash_file(&stage.join(file))?,
            );
        }
        let receipt = PackageReceipt {
            owner: OWNER.into(),
            project_id: project.id.clone(),
            build_id: build_id.into(),
            project_fingerprint: project.fingerprint()?,
            files: hashes,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        atomic_write(
            &stage.join(".guilty-spark-owned.json"),
            &serde_json::to_vec_pretty(&receipt)?,
            false,
        )?;
        if crate::steam::is_mcc_running() {
            return invalid(
                "MCC started during packaging. Install cancelled before content was registered.",
            );
        }
        fs::rename(&stage, &destination)?;
        Ok(())
    })();
    if result.is_err() {
        cleanup_staging(&stage)?;
    }
    result?;
    Ok(destination)
}
fn cleanup_staging(stage: &Path) -> Result<()> {
    if !stage.exists() {
        return Ok(());
    }
    reject_links(stage)?;
    if !stage
        .file_name()
        .is_some_and(|n| n.to_string_lossy().starts_with(".package-"))
    {
        return invalid("Refusing to clean an unknown staging directory");
    }
    fn clear(p: &Path) -> Result<()> {
        reject_links(p)?;
        for e in fs::read_dir(p)? {
            let e = e?;
            reject_links(&e.path())?;
            if e.file_type()?.is_dir() {
                clear(&e.path())?;
            } else {
                fs::remove_file(e.path())?;
            }
        }
        fs::remove_dir(p)?;
        Ok(())
    }
    clear(stage)
}
fn package_inventory(root: &Path, at: &Path, out: &mut Vec<String>, depth: usize) -> Result<()> {
    if depth > 8 || out.len() > 514 {
        return invalid("Owned package exceeds supported inventory limits");
    }
    reject_links(at)?;
    for entry in fs::read_dir(at)? {
        let entry = entry?;
        reject_links(&entry.path())?;
        if entry.file_type()?.is_dir() {
            package_inventory(root, &entry.path(), out, depth + 1)?;
        } else {
            out.push(
                entry
                    .path()
                    .strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/")
                    .to_ascii_lowercase(),
            );
            if out.len() > 514 {
                return invalid("Owned package exceeds supported inventory limits");
            }
        }
    }
    Ok(())
}
pub fn verify_package(root: &ManagedRoot, project: &Project) -> Result<PackageReceipt> {
    project.validate()?;
    let package = root.mods.join(&project.id);
    reject_links(&package)?;
    let r: PackageReceipt = serde_json::from_slice(&read_bounded(
        &package.join(".guilty-spark-owned.json"),
        1024 * 1024,
    )?)?;
    if r.owner != OWNER
        || r.project_id != project.id
        || r.project_fingerprint != project.fingerprint()?
    {
        return invalid(
            "Package belongs to a different project revision; rebuild it before launching",
        );
    }
    let scenario_path = project.scenario_path()?;
    let map_name = package_map_name(&scenario_path)?;
    let map_key = format!("maps/{map_name}").to_ascii_lowercase();
    let mut normalized = std::collections::BTreeMap::new();
    if r.files.len() < 2 || r.files.len() > 513 {
        return invalid(
            "Package receipt must cover metadata and exactly one map, within supported limits",
        );
    }
    for (file, hash) in &r.files {
        let rel = safe_relative(file)?;
        let key = rel
            .to_string_lossy()
            .replace('\\', "/")
            .to_ascii_lowercase();
        if normalized.insert(key, hash).is_some()
            || hash.len() != 64
            || !hash.bytes().all(|c| c.is_ascii_hexdigit())
        {
            return invalid("Package receipt contains duplicate paths or malformed hashes");
        }
        let path = package.join(rel);
        reject_links(&path)?;
        if maps::hash_file(&path)? != *hash {
            return invalid(format!("Owned package file changed: {file}"));
        }
    }
    if !normalized.contains_key("modinfo.json") || !normalized.contains_key(&map_key) {
        return invalid("Package receipt omits required ModInfo.json or the scenario map");
    }
    let mut actual = vec![];
    package_inventory(&package, &package, &mut actual, 0)?;
    actual.retain(|p| p != ".guilty-spark-owned.json");
    if actual.len() != normalized.len() || actual.iter().any(|p| !normalized.contains_key(p)) {
        return invalid("Package files differ from the complete owned receipt");
    }
    let build = project
        .builds
        .iter()
        .find(|b| {
            b.id == r.build_id
                && b.status == "validated"
                && b.project_fingerprint == r.project_fingerprint
        })
        .ok_or_else(|| {
            SparkError::Invalid("Package has no validated build for this project revision".into())
        })?;
    if build.sha256.as_ref() != normalized.get(&map_key).copied() {
        return invalid("Packaged map hash does not match the validated build");
    }
    let map = maps::inspect_map(&package.join("maps").join(map_name), None)?;
    if map.header.version != 13
        || map.header.extended
        || map.header.build.contains("synthetic parser fixture")
        || !map
            .scenario_path
            .replace('\\', "/")
            .eq_ignore_ascii_case(&scenario_path.replace('\\', "/"))
    {
        return invalid("Packaged cache is not the expected MCC scenario");
    }
    let metadata = inspect_template(&package, &map.scenario_path, map.header.scenario_type)?;
    if !metadata.valid {
        return invalid(metadata.blockers.join("\n"));
    }
    for file in metadata.files {
        if !normalized.contains_key(&file.replace('\\', "/").to_ascii_lowercase()) {
            return invalid(format!("Package receipt omits metadata file {file}"));
        }
    }
    let info: Value = serde_json::from_slice(&read_bounded(
        &package.join("ModInfo.json"),
        16 * 1024 * 1024,
    )?)?;
    if info
        .pointer("/ModIdentifier/ModGuid")
        .and_then(Value::as_str)
        != Some(project.id.as_str())
    {
        return invalid("Package metadata identifier does not match the project");
    }
    Ok(r)
}
pub fn remove_package(root: &ManagedRoot, project: &Project) -> Result<()> {
    project.validate()?;
    if crate::steam::is_mcc_running() {
        return invalid("Close MCC before removing a mod package");
    }
    let package = root.mods.join(&project.id);
    reject_links(&package)?;
    let receipt: PackageReceipt = serde_json::from_slice(&read_bounded(
        &package.join(".guilty-spark-owned.json"),
        1024 * 1024,
    )?)?;
    if receipt.owner != OWNER || receipt.project_id != project.id {
        return invalid("This is not Guilty Spark-owned content");
    }
    fn all(root: &Path, at: &Path, out: &mut Vec<PathBuf>) -> Result<()> {
        reject_links(at)?;
        for e in fs::read_dir(at)? {
            let e = e?;
            reject_links(&e.path())?;
            if e.file_type()?.is_dir() {
                all(root, &e.path(), out)?;
            } else {
                out.push(e.path().strip_prefix(root).unwrap().into());
            }
        }
        Ok(())
    }
    let mut actual = vec![];
    all(&package, &package, &mut actual)?;
    for file in &actual {
        if file == Path::new(".guilty-spark-owned.json") {
            continue;
        }
        let key = file.to_string_lossy().to_string();
        let hash = receipt.files.get(&key).ok_or_else(|| {
            SparkError::Invalid(format!(
                "Uninstall stopped: unrelated file {key} is inside the package"
            ))
        })?;
        if maps::hash_file(&package.join(file))? != *hash {
            return invalid(format!(
                "Uninstall stopped: {key} has changed. Preserve your changes before removing it."
            ));
        }
    }
    for file in actual {
        fs::remove_file(package.join(file))?;
    }
    fn empty(p: &Path) -> Result<()> {
        for e in fs::read_dir(p)? {
            let e = e?;
            if e.file_type()?.is_dir() {
                empty(&e.path())?;
            }
        }
        fs::remove_dir(p)?;
        Ok(())
    }
    empty(&package)
}
