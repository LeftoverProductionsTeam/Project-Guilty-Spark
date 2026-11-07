//! Reuse native content without merging incompatible cache formats.
//! Only missing verified CE banks are copied; originals are never changed.
use crate::{invalid, maps, reject_links, resource_map, Result, SparkError};
use serde::Serialize;
use std::{
    fs,
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};
const RESOURCES: [(&str, u32); 3] = [("bitmaps.map", 1), ("sounds.map", 2), ("loc.map", 3)];
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedCeResources {
    pub copied: Vec<String>,
    pub reused: Vec<String>,
    pub bytes_copied: u64,
    pub source_ui_sha256: String,
    pub resource_sha256: std::collections::BTreeMap<String, String>,
}
fn directory(path: &Path) -> Result<PathBuf> {
    reject_links(path)?;
    if !path.is_dir() {
        return invalid("Content folder does not exist");
    }
    Ok(fs::canonicalize(path)?)
}
fn native_ui(root: &Path, version: u32) -> Result<String> {
    let path = root.join("maps/ui.map");
    reject_links(&path)?;
    if maps::inspect_header(&path)?.version != version {
        return invalid(format!(
            "Expected native version-{version} maps/ui.map; source formats cannot be substituted"
        ));
    }
    maps::hash_file(&path)
}
fn verified(path: &Path, hash: &str, kind: u32) -> Result<fs::File> {
    let (file, _) = match kind {
        1 => resource_map::open_verified(path, hash)?,
        2 => resource_map::open_verified_sound(path, hash)?,
        3 => resource_map::open_verified_localization(path, hash)?,
        _ => return invalid("Unknown native resource type"),
    };
    Ok(file)
}
struct Staged(Vec<PathBuf>);
impl Drop for Staged {
    fn drop(&mut self) {
        for path in &self.0 {
            let _ = fs::remove_file(path);
        }
    }
}
/// Explicit local setup only: no downloads, source replacement or source hardlinks.
pub fn prepare_ce_resources(
    shared_root: &Path,
    ce_installation: &Path,
) -> Result<PreparedCeResources> {
    let shared = directory(shared_root)?;
    let ce = directory(ce_installation)?;
    let source_ui_sha256 = native_ui(&ce, 609)?;
    native_ui(&shared, 5)?;
    let destination = shared.join("maps_ce");
    reject_links(&destination)?;
    if destination.exists() && !destination.is_dir() {
        return invalid("maps_ce is not a directory");
    }
    let mut inputs = Vec::new();
    let mut hashes = std::collections::BTreeMap::new();
    let mut total = 0u64;
    // Check every source and existing target before any file is written.
    for (name, kind) in RESOURCES {
        let source = ce.join("maps").join(name);
        reject_links(&source)?;
        let size = fs::metadata(&source)?.len();
        total = total
            .checked_add(size)
            .ok_or_else(|| SparkError::Invalid("CE resource size overflow".into()))?;
        if total > 2 * 1024 * 1024 * 1024 {
            return invalid("CE resources exceed the 2 GiB setup bound");
        }
        let hash = maps::hash_file(&source)?;
        verified(&source, &hash, kind)?;
        let target = destination.join(name);
        reject_links(&target)?;
        let reuse = if target.exists() {
            if !target.is_file() || maps::hash_file(&target)? != hash {
                return invalid(format!("maps_ce/{name} differs from the connected CE source; it was not overwritten. Select the matching resource library."));
            }
            true
        } else {
            false
        };
        hashes.insert(name.to_string(), hash.clone());
        inputs.push((name, kind, source, hash, size, reuse));
    }
    fs::create_dir_all(&destination)?;
    reject_links(&destination)?;
    let mut staged = Staged(Vec::new());
    let mut publish = Vec::new();
    let mut result = PreparedCeResources {
        copied: vec![],
        reused: vec![],
        bytes_copied: 0,
        source_ui_sha256,
        resource_sha256: hashes,
    };
    for (name, kind, source, hash, size, reuse) in &inputs {
        if *reuse {
            result.reused.push(name.to_string());
            continue;
        }
        let part = destination.join(format!(".spark-ce-{}-{}.part", uuid::Uuid::new_v4(), name));
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&part)?;
        staged.0.push(part.clone());
        let mut input = verified(source, hash, *kind)?;
        input.seek(SeekFrom::Start(0))?;
        let copied = std::io::copy(
            &mut std::io::Read::by_ref(&mut input).take(*size),
            &mut output,
        )?;
        output.flush()?;
        output.sync_all()?;
        drop(output);
        if copied != *size || maps::hash_file(&part)? != *hash || maps::hash_file(source)? != *hash
        {
            return invalid("CE resource changed during setup; incomplete staging was rejected");
        }
        publish.push((part, destination.join(name), *name, *size));
    }
    if native_ui(&ce, 609)? != result.source_ui_sha256 {
        return invalid("CE source identity changed during setup");
    }
    // Publish our completed copy without replacing a competing file. The link
    // never targets the original source, and the staging name is then removed.
    // Unsupported filesystems fail instead of falling back to overwriting rename.
    for (part, target, name, size) in publish {
        if let Err(error) = fs::hard_link(&part, &target) {
            return invalid(format!("Could not safely publish maps_ce/{name}: {error}. Existing files stay; retry reuses completed matching banks."));
        }
        result.copied.push(name.into());
        result.bytes_copied += size;
    }
    for (name, kind, source, hash, _, _) in inputs {
        if maps::hash_file(&source)? != hash {
            return invalid("CE source changed after resource setup");
        }
        verified(&destination.join(name), &hash, kind)?;
    }
    Ok(result)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedMap {
    pub relative_path: String,
    pub sha256: String,
    pub reused: bool,
}
/// Admit only a source-pinned, already imported native cache. No header rewriting
/// or executable payload can cross this boundary; a same-named different map stays.
pub fn install_map(
    shared_root: &Path,
    source: &Path,
    expected_sha256: &str,
    name: &str,
    version: u32,
) -> Result<PreparedMap> {
    if name.is_empty()
        || name.len() > 64
        || !name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c))
    {
        return invalid("Server map name is not a safe native filename");
    }
    let folder = match version {
        5 => "maps",
        609 => "maps_ce",
        _ => return invalid("This map requires an independent conversion, not a file relocation"),
    };
    let root = directory(shared_root)?;
    native_ui(&root, 5)?;
    reject_links(source)?;
    if fs::metadata(source)?.len() > 768 * 1024 * 1024 {
        return invalid("Downloaded map exceeds the 768 MiB setup bound");
    }
    let header = maps::inspect_header(source)?;
    if header.version != version
        || !header.name.eq_ignore_ascii_case(name)
        || header.scenario_type != 1
    {
        return invalid("Downloaded map identity does not match the selected multiplayer game; it stays in the library");
    }
    let hash = maps::hash_file(source)?;
    if hash != expected_sha256 {
        return invalid("Imported map changed before setup");
    }
    let dir = root.join(folder);
    reject_links(&dir)?;
    let target = dir.join(format!("{name}.map"));
    reject_links(&target)?;
    let relative_path = format!("{folder}/{name}.map");
    if target.exists() {
        if target.is_file() && maps::hash_file(&target)? == hash {
            return Ok(PreparedMap {
                relative_path,
                sha256: hash,
                reused: true,
            });
        }
        return invalid("A different map already has this name. It was preserved; choose a matching library or review it in Spark");
    }
    fs::create_dir_all(&dir)?;
    reject_links(&dir)?;
    let part = dir.join(format!(".spark-map-{}.part", uuid::Uuid::new_v4()));
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&part)?;
    let _staged = Staged(vec![part.clone()]);
    let input = fs::File::open(source)?;
    let size = input.metadata()?.len();
    let copied = std::io::copy(&mut input.take(size), &mut output)?;
    output.flush()?;
    output.sync_all()?;
    drop(output);
    if copied != size || maps::hash_file(&part)? != hash || maps::hash_file(source)? != hash {
        return invalid("Downloaded map changed during setup");
    }
    fs::hard_link(&part, &target).map_err(|e| {
        SparkError::Invalid(format!(
            "Map could not be safely published without overwriting: {e}"
        ))
    })?;
    Ok(PreparedMap {
        relative_path,
        sha256: hash,
        reused: false,
    })
}
