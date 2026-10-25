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
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedRoot {
    pub root: PathBuf,
    pub inbox: PathBuf,
    pub mods: PathBuf,
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
        let v: Value = serde_json::from_slice(&fs::read(marker)?)?;
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
fn normalized_path(s: &str) -> String {
    s.trim()
        .trim_matches('"')
        .trim_end_matches(['\\', '/'])
        .replace('/', "\\")
        .to_lowercase()
}
pub fn manifest_contains(manifest: &Path, root: &Path) -> Result<bool> {
    if !manifest.exists() {
        return Ok(false);
    }
    let (text, _, _) = decode_manifest(&fs::read(manifest)?)?;
    let path = root.to_string_lossy();
    Ok(text
        .lines()
        .any(|s| normalized_path(s) == normalized_path(&path)))
}
pub fn register_root(manifest: &Path, root: &Path) -> Result<Option<PathBuf>> {
    reject_links(manifest)?;
    reject_links(root)?;
    let value = fs::canonicalize(root)?
        .to_string_lossy()
        .trim_start_matches("\\\\?\\")
        .to_string();
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
            fs::read(manifest)?
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
            fs::read(manifest)?
        } else {
            vec![]
        };
        if current != original {
            return invalid("ModManifest changed during registration; retry to preserve the other writer's entries");
        }
        let backup = atomic_write(manifest, &bytes, true)?;
        if !manifest_contains(manifest, root)? {
            if let Some(ref backup) = backup {
                atomic_write(manifest, &fs::read(backup)?, false)?;
            } else {
                fs::remove_file(manifest)?;
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
    let info: Value = serde_json::from_slice(&fs::read(root.join("ModInfo.json"))?)?;
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
            let data: Value = serde_json::from_slice(&fs::read(root.join(file))?)?;
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
    if crate::steam::is_mcc_running() {
        return invalid("Close MCC before installing local mod content");
    }
    let inspection = maps::inspect_map(map, None)?;
    if inspection.header.version != 13 {
        return invalid("Only a validated version-13 MCC cache can enter a local package");
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
        let mut info: Value = serde_json::from_slice(&fs::read(&info_path)?)?;
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
pub fn verify_package(root: &ManagedRoot, project: &Project) -> Result<PackageReceipt> {
    let package = root.mods.join(&project.id);
    reject_links(&package)?;
    let r: PackageReceipt =
        serde_json::from_slice(&fs::read(package.join(".guilty-spark-owned.json"))?)?;
    if r.owner != OWNER
        || r.project_id != project.id
        || r.project_fingerprint != project.fingerprint()?
    {
        return invalid(
            "Package belongs to a different project revision; rebuild it before launching",
        );
    }
    for (file, hash) in &r.files {
        let rel = safe_relative(file)?;
        let path = package.join(rel);
        reject_links(&path)?;
        if maps::hash_file(&path)? != *hash {
            return invalid(format!("Owned package file changed: {file}"));
        }
    }
    Ok(r)
}
pub fn remove_package(root: &ManagedRoot, project: &Project) -> Result<()> {
    if crate::steam::is_mcc_running() {
        return invalid("Close MCC before removing a mod package");
    }
    let package = root.mods.join(&project.id);
    reject_links(&package)?;
    let receipt: PackageReceipt =
        serde_json::from_slice(&fs::read(package.join(".guilty-spark-owned.json"))?)?;
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
