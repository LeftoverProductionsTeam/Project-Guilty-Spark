//! Bounded classic ZIP preservation/import. Archived executables are never extracted or run.
use crate::{invalid, maps, Result, SparkError};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};
use zip::ZipArchive;

const MAX_ZIP: u64 = 1024 * 1024 * 1024;
const MAX_MEMBER: u64 = 768 * 1024 * 1024;
const MAX_SELECTED: u64 = 2 * 1024 * 1024 * 1024;
const MAX_CENTRAL: u64 = 8 * 1024 * 1024;
const MAX_ENTRIES: usize = 4096;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveEntry {
    pub name: String,
    pub size: u64,
    pub compressed: u64,
    pub classification: String,
    pub sha256: Option<String>,
    pub selected: bool,
    pub diagnostics: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveInventory {
    pub schema_version: u32,
    pub sha256: String,
    pub size: u64,
    pub entries: Vec<ArchiveEntry>,
    pub diagnostics: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveMap {
    pub path: PathBuf,
    pub entry_path: String,
    pub resource_directory: Option<PathBuf>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedArchive {
    pub sha256: String,
    pub original_path: PathBuf,
    pub preserved_path: PathBuf,
    pub root: PathBuf,
    pub inventory: ArchiveInventory,
    pub maps: Vec<ArchiveMap>,
}
#[derive(Debug)]
struct CheckedEntry {
    raw_name: Vec<u8>,
    size: u64,
    compressed: u64,
    local: u64,
    central: u64,
    method: u16,
    crc: u32,
}
fn zip_error(error: zip::result::ZipError) -> SparkError {
    SparkError::Invalid(format!("Invalid or unsupported ZIP: {error}"))
}
fn u16_at(bytes: &[u8], at: usize) -> u16 {
    u16::from_le_bytes(bytes[at..at + 2].try_into().unwrap())
}
fn u32_at(bytes: &[u8], at: usize) -> u32 {
    u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap())
}
fn read_at(file: &mut File, offset: u64, size: usize, limit: u64) -> Result<Vec<u8>> {
    if offset
        .checked_add(size as u64)
        .is_none_or(|end| end > limit)
    {
        return invalid("ZIP structure points outside its allowed region");
    }
    let mut bytes = vec![0; size];
    file.seek(SeekFrom::Start(offset))?;
    file.read_exact(&mut bytes)?;
    Ok(bytes)
}
fn validate_extra(bytes: &[u8]) -> Result<()> {
    let mut at = 0;
    while at < bytes.len() {
        if at + 4 > bytes.len() {
            return invalid("Truncated ZIP extra field");
        }
        let kind = u16_at(bytes, at);
        let length = u16_at(bytes, at + 2) as usize;
        at += 4;
        if kind == 1 {
            return invalid("ZIP64 extra fields are unsupported");
        }
        if at + length > bytes.len() {
            return invalid("ZIP extra field exceeds its record");
        }
        at += length;
    }
    Ok(())
}
/// Validate EOCD and all central/local record bounds before ZipArchive allocates entries.
fn preflight(file: &mut File) -> Result<Vec<CheckedEntry>> {
    let size = file.metadata()?.len();
    if !(22..=MAX_ZIP).contains(&size) {
        return invalid("ZIP must be between 22 bytes and 1 GiB");
    }
    let tail_len = size.min(65557) as usize;
    let tail = read_at(file, size - tail_len as u64, tail_len, size)?;
    let end = (0..=tail.len() - 22)
        .rev()
        .find(|at| {
            tail[*at..*at + 4] == *b"PK\x05\x06"
                && *at + 22 + u16_at(&tail, *at + 20) as usize == tail.len()
        })
        .ok_or_else(|| {
            SparkError::Invalid(
                "Classic ZIP end record is missing or trailing bytes are present".into(),
            )
        })?;
    let eocd = size - tail_len as u64 + end as u64;
    let count = u16_at(&tail, end + 10) as usize;
    let central_size = u32_at(&tail, end + 12) as u64;
    let central_at = u32_at(&tail, end + 16) as u64;
    if u16_at(&tail, end + 4) != 0
        || u16_at(&tail, end + 6) != 0
        || u16_at(&tail, end + 8) as usize != count
    {
        return invalid("Multidisk ZIP archives are unsupported");
    }
    if count == 65535 || central_size == u32::MAX as u64 || central_at == u32::MAX as u64 {
        return invalid("ZIP64 archives are unsupported");
    }
    if count > MAX_ENTRIES || central_size > MAX_CENTRAL {
        return invalid("ZIP exceeds 4096 entries or 8 MiB of central-directory metadata");
    }
    if central_at.checked_add(central_size) != Some(eocd) {
        return invalid("ZIP central directory does not end at the EOCD record");
    }
    let bytes = read_at(file, central_at, central_size as usize, eocd)?;
    let mut at = 0usize;
    let mut entries = Vec::new();
    let mut spans = Vec::new();
    for _ in 0..count {
        if at + 46 > bytes.len() || bytes[at..at + 4] != *b"PK\x01\x02" {
            return invalid("Malformed ZIP central-directory record");
        }
        let flags = u16_at(&bytes, at + 8);
        let method = u16_at(&bytes, at + 10);
        let crc = u32_at(&bytes, at + 16);
        let compressed = u32_at(&bytes, at + 20) as u64;
        let unpacked = u32_at(&bytes, at + 24) as u64;
        let name_len = u16_at(&bytes, at + 28) as usize;
        let extra_len = u16_at(&bytes, at + 30) as usize;
        let comment_len = u16_at(&bytes, at + 32) as usize;
        let local_at = u32_at(&bytes, at + 42) as u64;
        if flags & 0x41 != 0 {
            return invalid("Encrypted ZIP entries are unsupported");
        }
        if ![0, 8].contains(&method) {
            return invalid("Only stored and deflate ZIP members are supported");
        }
        if u16_at(&bytes, at + 34) != 0
            || compressed == u32::MAX as u64
            || unpacked > MAX_MEMBER
            || local_at == u32::MAX as u64
        {
            return invalid("ZIP64/multidisk or oversized ZIP member");
        }
        if name_len == 0
            || name_len > 1024
            || at + 46 + name_len + extra_len + comment_len > bytes.len()
        {
            return invalid("ZIP filename/extra/comment exceeds bounded record limits");
        }
        let mode = u32_at(&bytes, at + 38) >> 16;
        if mode & 0o170000 != 0 && ![0o100000, 0o040000].contains(&(mode & 0o170000)) {
            return invalid("ZIP links and non-regular filesystem objects are forbidden");
        }
        if u32_at(&bytes, at + 38) & 0x400 != 0 {
            return invalid("ZIP reparse-point attributes are forbidden");
        }
        let raw_name = bytes[at + 46..at + 46 + name_len].to_vec();
        validate_extra(&bytes[at + 46 + name_len..at + 46 + name_len + extra_len])?;
        let local = read_at(file, local_at, 30, central_at)?;
        if local[..4] != *b"PK\x03\x04" || u16_at(&local, 6) != flags || u16_at(&local, 8) != method
        {
            return invalid("ZIP local and central headers disagree");
        }
        let local_names = u16_at(&local, 26) as usize;
        let local_extras = u16_at(&local, 28) as usize;
        let local_variable = read_at(file, local_at + 30, local_names + local_extras, central_at)?;
        if local_variable[..local_names] != raw_name {
            return invalid("ZIP local and central filenames disagree");
        }
        validate_extra(&local_variable[local_names..])?;
        let local_crc = u32_at(&local, 14);
        let local_compressed = u32_at(&local, 18) as u64;
        let local_unpacked = u32_at(&local, 22) as u64;
        if flags & 8 == 0 {
            if (local_crc, local_compressed, local_unpacked) != (crc, compressed, unpacked) {
                return invalid("ZIP local and central sizes/CRC disagree");
            }
        } else if ![0, crc].contains(&local_crc)
            || ![0, compressed].contains(&local_compressed)
            || ![0, unpacked].contains(&local_unpacked)
        {
            return invalid("ZIP streaming local header conflicts with central metadata");
        }
        let data_at = local_at + 30 + (local_names + local_extras) as u64;
        let mut end_at = data_at
            .checked_add(compressed)
            .ok_or_else(|| SparkError::Invalid("ZIP data offset overflow".into()))?;
        if end_at > central_at {
            return invalid("ZIP member overlaps central directory");
        }
        if flags & 8 != 0 {
            let first = read_at(file, end_at, 4, central_at)?;
            let skip = if first == b"PK\x07\x08" { 4 } else { 0 };
            let descriptor = read_at(file, end_at + skip, 12, central_at)?;
            if (
                u32_at(&descriptor, 0),
                u32_at(&descriptor, 4) as u64,
                u32_at(&descriptor, 8) as u64,
            ) != (crc, compressed, unpacked)
            {
                return invalid("ZIP data descriptor conflicts with central metadata");
            }
            end_at += skip + 12;
        }
        spans.push((local_at, end_at));
        entries.push(CheckedEntry {
            raw_name,
            size: unpacked,
            compressed,
            local: local_at,
            central: central_at + at as u64,
            method,
            crc,
        });
        at += 46 + name_len + extra_len + comment_len;
    }
    if at != bytes.len() {
        return invalid("ZIP central-directory count/size mismatch");
    }
    spans.sort_unstable();
    if spans.first().is_some_and(|s| s.0 != 0) {
        return invalid("Self-extracting/prepended ZIP payloads are unsupported");
    }
    if spans.windows(2).any(|s| s[0].1 > s[1].0) {
        return invalid("ZIP members have overlapping local/data regions");
    }
    Ok(entries)
}
fn classify(name: &str, directory: bool) -> (&'static str, bool) {
    if directory {
        return ("directory", false);
    }
    let leaf = name.rsplit('/').next().unwrap_or(name).to_ascii_lowercase();
    if ["bitmaps.map", "sounds.map", "loc.map"].contains(&leaf.as_str()) {
        return ("resource", true);
    }
    let ext = leaf.rsplit('.').next().unwrap_or("");
    match ext {
        "map" => ("scenarioMap", true),
        "yelo" => ("extendedMap", true),
        "exe" | "dll" | "com" | "bat" | "cmd" | "ps1" | "sh" | "so" | "dylib" => {
            ("executableBlocked", false)
        }
        "zip" | "rar" | "7z" => ("nestedArchive", false),
        _ => ("notSelected", false),
    }
}
fn open_checked(path: &Path) -> Result<(ZipArchive<File>, ArchiveInventory)> {
    crate::reject_links(path)?;
    if !fs::metadata(path)?.is_file() {
        return invalid("ZIP source must be a regular file");
    }
    let mut file = File::open(path)?;
    let size = file.metadata()?.len();
    let checked = preflight(&mut file)?;
    let archive = ZipArchive::new(file).map_err(zip_error)?;
    if archive.len() != checked.len() {
        return invalid("ZIP library entry count disagrees with bounded preflight");
    }
    let mut entries = Vec::new();
    let mut names = BTreeMap::new();
    let mut total = 0u64;
    for (index, expected) in checked.iter().enumerate() {
        let entry = archive.by_index_data(index).map_err(zip_error)?;
        if entry.name_raw() != expected.raw_name
            || entry.size() != expected.size
            || entry.compressed_size() != expected.compressed
            || entry.header_start() != expected.local
            || entry.central_header_start() != expected.central
            || entry.compression()
                != if expected.method == 0 {
                    zip::CompressionMethod::Stored
                } else {
                    zip::CompressionMethod::Deflated
                }
            || entry.crc32() != expected.crc
            || entry.encrypted()
        {
            return invalid("ZIP library metadata differs from validated central records");
        }
        let raw = entry.name().map_err(zip_error)?.replace('\\', "/");
        let directory = raw.ends_with('/');
        let name = raw.strip_suffix('/').unwrap_or(raw.as_str());
        let relative = crate::safe_relative(name)?;
        if relative.components().count() > 32 {
            return invalid("ZIP member path exceeds 32 components");
        }
        let key = name.to_lowercase();
        if names.insert(key.clone(), directory).is_some() {
            return invalid("ZIP duplicate or case-colliding member name");
        }
        let (classification, selected) = classify(name, directory);
        if directory && entry.size() != 0 {
            return invalid("ZIP directory has a data payload");
        }
        if selected {
            total = total
                .checked_add(entry.size())
                .ok_or_else(|| SparkError::Invalid("ZIP selected-size overflow".into()))?;
        }
        if total > MAX_SELECTED {
            return invalid("Selected ZIP maps/resources exceed 2 GiB");
        }
        entries.push(ArchiveEntry {
            name: name.into(),
            size: entry.size(),
            compressed: entry.compressed_size(),
            classification: classification.into(),
            sha256: None,
            selected,
            diagnostics: if classification == "executableBlocked" {
                vec!["Executable inventoried only; extraction and execution are prohibited.".into()]
            } else {
                vec![]
            },
        });
    }
    for name in names.keys() {
        let mut cursor = name.as_str();
        while let Some((parent, _)) = cursor.rsplit_once('/') {
            if names.get(parent) == Some(&false) {
                return invalid("ZIP file/directory path collision");
            }
            cursor = parent;
        }
    }
    // Rewind metadata parsing left the reader at arbitrary offsets; ZipArchive seeks for each read.
    let inventory = ArchiveInventory { schema_version: 1, sha256: maps::hash_file(path)?, size, entries,
        diagnostics: vec!["Classic ZIP inventory only; no entry was executed. Map validity is checked during selected extraction/import.".into()] };
    Ok((archive, inventory))
}
pub fn inventory(path: &Path) -> Result<ArchiveInventory> {
    Ok(open_checked(path)?.1)
}

struct StageGuard {
    stage: PathBuf,
    parent: PathBuf,
    id: String,
    active: bool,
}
impl Drop for StageGuard {
    fn drop(&mut self) {
        if !self.active {
            return;
        }
        let valid = fs::canonicalize(&self.stage)
            .ok()
            .zip(fs::canonicalize(&self.parent).ok())
            .is_some_and(|(stage, parent)| {
                stage.parent() == Some(parent.as_path())
                    && stage
                        .file_name()
                        .is_some_and(|n| n == format!(".stage-{}", self.id).as_str())
            });
        if valid
            && fs::read_to_string(self.stage.join(".owner"))
                .ok()
                .as_deref()
                == Some(self.id.as_str())
        {
            #[cfg(windows)]
            if let Ok(meta) = fs::metadata(self.stage.join("original.zip")) {
                let mut permissions = meta.permissions();
                // Windows deletion needs its read-only attribute cleared. This block
                // is never compiled on Unix, where no mode widening is necessary.
                #[allow(clippy::permissions_set_readonly_false)]
                permissions.set_readonly(false);
                let _ = fs::set_permissions(self.stage.join("original.zip"), permissions);
            }
            let _ = fs::remove_dir_all(&self.stage);
        }
    }
}
pub fn import_archive(path: &Path, library_root: &Path) -> Result<ImportedArchive> {
    let original_inventory = inventory(path)?;
    crate::reject_links(library_root)?;
    if !library_root.is_dir() {
        return invalid("Library root must exist before ZIP import");
    }
    let parent = library_root.join("archives");
    crate::reject_links(&parent)?;
    fs::create_dir_all(&parent)?;
    let parent = fs::canonicalize(parent)?;
    let id = uuid::Uuid::new_v4().to_string();
    let stage = parent.join(format!(".stage-{id}"));
    let final_root = parent.join(&id);
    fs::create_dir(&stage)?;
    fs::write(stage.join(".owner"), &id)?;
    let mut guard = StageGuard {
        stage: stage.clone(),
        parent: parent.clone(),
        id,
        active: true,
    };
    let preserved = stage.join("original.zip");
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&preserved)?;
    let copied = std::io::copy(&mut File::open(path)?.take(MAX_ZIP + 1), &mut output)?;
    if copied > MAX_ZIP {
        return invalid("Source ZIP grew beyond the size limit during preservation");
    }
    output.sync_all()?;
    drop(output);
    let (mut archive, mut inventory) = open_checked(&preserved)?;
    if inventory.sha256 != original_inventory.sha256 {
        return invalid("Source ZIP changed during preservation; import stopped");
    }
    let content = stage.join("content");
    fs::create_dir(&content)?;
    let mut candidates = Vec::new();
    let mut resource_dirs = BTreeSet::new();
    for index in 0..inventory.entries.len() {
        if !inventory.entries[index].selected {
            continue;
        }
        let item = &mut inventory.entries[index];
        let relative = crate::safe_relative(&item.name)?;
        let target = content.join(&relative);
        let parent_dir = target
            .parent()
            .ok_or_else(|| SparkError::Invalid("ZIP member has no output parent".into()))?;
        crate::reject_links(parent_dir)?;
        fs::create_dir_all(parent_dir)?;
        crate::reject_links(parent_dir)?;
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)?;
        let entry = archive.by_index(index).map_err(zip_error)?;
        let written = std::io::copy(&mut entry.take(item.size + 1), &mut output)?;
        if written != item.size {
            return invalid("ZIP member decompressed size does not match declared size");
        }
        output.sync_all()?;
        drop(output);
        item.sha256 = Some(maps::hash_file(&target)?);
        if item.classification == "resource" {
            resource_dirs.insert(relative.parent().unwrap_or(Path::new("")).to_path_buf());
            continue;
        }
        if item.size < 2048 {
            item.diagnostics.push("Malformed scenario: smaller than the Halo header; preserved but not imported as a map.".into());
            continue;
        }
        let mut header = [0u8; 2048];
        File::open(&target)?.read_exact(&mut header)?;
        match maps::parse_header(&header, item.size) {
            Ok(_) => candidates.push((relative, item.name.clone())),
            Err(error) => item.diagnostics.push(format!(
                "Map header rejected; preserved but not imported as a scenario: {error}"
            )),
        }
    }
    drop(archive);
    let maps = candidates
        .into_iter()
        .map(|(relative, entry_path)| {
            let mut ancestor = relative.parent();
            let mut resources = None;
            while let Some(folder) = ancestor {
                if resource_dirs.contains(folder) {
                    resources = Some(final_root.join("content").join(folder));
                    break;
                }
                ancestor = folder.parent();
            }
            ArchiveMap {
                path: final_root.join("content").join(relative),
                entry_path,
                resource_directory: resources,
            }
        })
        .collect::<Vec<_>>();
    if maps.is_empty() {
        inventory.diagnostics.push("No scenario with a supported Halo header was found; archive is preserved without importing a map.".into());
    }
    let result = ImportedArchive {
        sha256: inventory.sha256.clone(),
        original_path: fs::canonicalize(path)?,
        preserved_path: final_root.join("original.zip"),
        root: final_root.clone(),
        inventory,
        maps,
    };
    let receipt = serde_json::to_vec_pretty(&result)?;
    let mut receipt_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(stage.join("receipt.json"))?;
    receipt_file.write_all(&receipt)?;
    receipt_file.sync_all()?;
    drop(receipt_file);
    let mut permissions = fs::metadata(&preserved)?.permissions();
    permissions.set_readonly(true);
    fs::set_permissions(&preserved, permissions)?;
    fs::rename(&stage, &final_root)?;
    guard.active = false;
    Ok(result)
}
