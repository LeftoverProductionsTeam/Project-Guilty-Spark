//! Exact-path classic bitmap fallback audit and a separate, owned repaired tagset.
//! Does not overwrite the selected SDK, rewrite shaders, or certify a game cache.
use crate::{
    forge_build, invalid,
    maps::{self, Tag},
    project, reject_links, safe_relative, Result, SparkError,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};
const MAX_BITMAP_BYTES: u64 = 64 * 1024 * 1024;
pub const MAX_REPAIR_FILES: usize = 128;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BitmapNeed {
    pub path: String,
    pub reason: String,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BitmapAudit {
    pub required: usize,
    pub available: usize,
    pub missing: Vec<BitmapNeed>,
    pub invalid: Vec<BitmapNeed>,
    pub list_truncated: bool,
}
impl BitmapAudit {
    pub fn blocked(&self) -> bool {
        !self.missing.is_empty() || !self.invalid.is_empty() || self.list_truncated
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BitmapCandidate {
    pub path: String,
    pub source: PathBuf,
    pub bytes: u64,
    pub sha256: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagsetRepairPlan {
    pub source_sha256: String,
    pub sdk_tags: PathBuf,
    pub source_tags: PathBuf,
    pub files: Vec<BitmapCandidate>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagsetRepairReceipt {
    pub schema_version: u32,
    pub status: String,
    pub source_sha256: String,
    pub original_sdk: PathBuf,
    pub tags_directory: PathBuf,
    pub files: Vec<BitmapCandidate>,
    pub sdk_files: usize,
    pub sdk_inventory_sha256: String,
    pub source_preserved: bool,
    pub playable_output: bool,
}
fn bitmap_file(path: &Path) -> Result<u64> {
    reject_links(path)?;
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() || metadata.len() < 172 || metadata.len() > MAX_BITMAP_BYTES {
        return invalid("Expected an editable bitmap tag between 172 bytes and 64 MiB");
    }
    let mut header = [0u8; 64];
    fs::File::open(path)?.read_exact(&mut header)?;
    if &header[36..40] != b"bitm"
        || &header[60..64] != b"blam"
        || u16::from_be_bytes([header[56], header[57]]) != 7
        || u32::from_be_bytes(header[44..48].try_into().unwrap()) != 64
    {
        return invalid("Expected a Halo 1 editable .bitmap tag (bitm / version 7 / blam), not a cache, DDS or MCC texture pack");
    }
    Ok(metadata.len())
}
pub fn audit(tags: &[Tag], sdk: &Path) -> Result<BitmapAudit> {
    reject_links(sdk)?;
    if !sdk.is_dir() {
        return invalid("Select the extracted editable SDK tags folder before checking classic bitmap dependencies");
    }
    let mut audit = BitmapAudit::default();
    let mut paths = BTreeSet::new();
    for tag in tags.iter().filter(|t| t.external && t.class == "bitm") {
        let relative = format!("{}.bitmap", tag.path.replace('\\', "/"));
        safe_relative(&relative)?;
        if !paths.insert(relative.to_ascii_lowercase()) {
            return invalid("Two indexed bitmap tags claim the same fallback path");
        }
        audit.required += 1;
        let file = sdk.join(safe_relative(&relative)?);
        if !file.exists() {
            if audit.missing.len() < MAX_REPAIR_FILES {
                audit.missing.push(BitmapNeed {
                    path: relative,
                    reason: "Indexed CE bitmap is absent from the selected fallback tagset".into(),
                });
            } else {
                audit.list_truncated = true;
            }
        } else if let Err(error) = bitmap_file(&file) {
            if audit.invalid.len() < MAX_REPAIR_FILES {
                audit.invalid.push(BitmapNeed {
                    path: relative,
                    reason: error.to_string(),
                });
            } else {
                audit.list_truncated = true;
            }
        } else {
            audit.available += 1;
        }
    }
    Ok(audit)
}
pub fn review(
    source_sha256: &str,
    sdk: &Path,
    source_tags: &Path,
    audit: &BitmapAudit,
) -> Result<TagsetRepairPlan> {
    if source_sha256.len() != 64
        || !source_sha256.bytes().all(|b| b.is_ascii_hexdigit())
        || audit.missing.is_empty()
        || !audit.invalid.is_empty()
        || audit.list_truncated
    {
        return invalid("Repair needs a complete, bounded list of missing indexed bitmap tags; repair invalid SDK files separately");
    }
    reject_links(sdk)?;
    reject_links(source_tags)?;
    let sdk = fs::canonicalize(sdk)?;
    let source = fs::canonicalize(source_tags)?;
    if !source.is_dir() {
        return invalid("Choose the original classic editable tags folder");
    }
    let mut files = Vec::new();
    let mut unique = BTreeSet::new();
    let mut bytes = 0u64;
    for need in &audit.missing {
        let relative = safe_relative(&need.path)?;
        if !need.path.ends_with(".bitmap") || !unique.insert(need.path.to_ascii_lowercase()) {
            return invalid("Repair bitmap paths must be unique");
        }
        if sdk.join(&relative).exists() {
            return invalid(
                "The SDK dependency changed since inspection; refresh the dependency check",
            );
        }
        let file = source.join(relative);
        let size = bitmap_file(&file).map_err(|error| {
            SparkError::Invalid(format!(
                "Missing or invalid matching source {}: {error}",
                need.path
            ))
        })?;
        bytes += size;
        if files.len() >= MAX_REPAIR_FILES || bytes > 256 * 1024 * 1024 {
            return invalid("Bitmap repairs are bounded to 128 files / 256 MiB");
        }
        files.push(BitmapCandidate {
            path: need.path.clone(),
            source: file,
            bytes: size,
            sha256: maps::hash_file(&source.join(safe_relative(&need.path)?))?,
        });
    }
    Ok(TagsetRepairPlan {
        source_sha256: source_sha256.into(),
        sdk_tags: sdk,
        source_tags: source,
        files,
    })
}
pub fn create(
    plan: &TagsetRepairPlan,
    destination: &Path,
    cancel: &AtomicBool,
    mut progress: impl FnMut(usize, usize, u64, u64),
) -> Result<TagsetRepairReceipt> {
    if plan.files.is_empty() || plan.files.len() > MAX_REPAIR_FILES {
        return invalid("No bounded bitmap repair was reviewed");
    }
    reject_links(destination)?;
    if destination.exists() {
        return invalid(
            "A repaired tagset needs a fresh directory; existing files are never replaced",
        );
    }
    if cancel.load(Ordering::Relaxed) {
        return invalid("Tagset repair cancelled");
    }
    let parent = destination
        .parent()
        .ok_or_else(|| SparkError::Invalid("Repair output parent is missing".into()))?;
    reject_links(parent)?;
    let resolved = fs::canonicalize(parent)?.join(
        destination
            .file_name()
            .ok_or_else(|| SparkError::Invalid("Repair output filename is missing".into()))?,
    );
    if resolved.starts_with(fs::canonicalize(&plan.sdk_tags)?)
        || resolved.starts_with(fs::canonicalize(&plan.source_tags)?)
    {
        return invalid("Repaired output must be outside both original tag folders");
    }
    // Validate every reviewed source before copying a large SDK tree.
    let mut unique = BTreeSet::new();
    let mut total = 0u64;
    for file in &plan.files {
        let relative = safe_relative(&file.path)?;
        if !file.path.ends_with(".bitmap")
            || !unique.insert(file.path.to_ascii_lowercase())
            || file.source != plan.source_tags.join(&relative)
            || plan.sdk_tags.join(&relative).exists()
        {
            return invalid(
                "Repair context changed; refresh and review the exact missing paths again",
            );
        }
        total += bitmap_file(&file.source)?;
        if total > 256 * 1024 * 1024
            || bitmap_file(&file.source)? != file.bytes
            || maps::hash_file(&file.source)? != file.sha256
        {
            return invalid("A reviewed bitmap source changed; no repaired tagset was accepted");
        }
    }
    fs::create_dir(destination)?;
    let tags = destination.join("tags");
    let hashes = forge_build::stage_tags(&plan.sdk_tags, &tags, cancel, |a, b, c, d| {
        progress(a, b, c, d)
    })?;
    for file in &plan.files {
        if cancel.load(Ordering::Relaxed) {
            return invalid("Tagset repair cancelled; incomplete copy retained");
        }
        let target = tags.join(safe_relative(&file.path)?);
        reject_links(&target)?;
        if target.exists() {
            return invalid(
                "Repair would overwrite an existing SDK tag; no repaired tagset was accepted",
            );
        }
        fs::create_dir_all(
            target
                .parent()
                .ok_or_else(|| SparkError::Invalid("Bitmap parent unavailable".into()))?,
        )?;
        let mut input = fs::File::open(&file.source)?;
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)?;
        let copied = std::io::copy(&mut input.by_ref().take(MAX_BITMAP_BYTES + 1), &mut output)?;
        if copied != file.bytes
            || maps::hash_file(&file.source)? != file.sha256
            || maps::hash_file(&target)? != file.sha256
        {
            return invalid("A bitmap changed during repair; incomplete copy retained");
        }
        output.sync_all()?;
    }
    let inventory = destination.join("input-sdk-tags.json");
    project::atomic_write(&inventory, &serde_json::to_vec_pretty(&hashes)?, false)?;
    let receipt = TagsetRepairReceipt {
        schema_version: 1,
        status: "ready-source-tagset".into(),
        source_sha256: plan.source_sha256.clone(),
        original_sdk: plan.sdk_tags.clone(),
        tags_directory: tags,
        files: plan.files.clone(),
        sdk_files: hashes.len(),
        sdk_inventory_sha256: maps::hash_file(&inventory)?,
        source_preserved: true,
        playable_output: false,
    };
    project::atomic_write(
        &destination.join("tagset-repair-receipt.json"),
        &serde_json::to_vec_pretty(&receipt)?,
        false,
    )?;
    Ok(receipt)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn bitmap(path: &Path) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let mut data = vec![0; 180];
        data[36..40].copy_from_slice(b"bitm");
        data[60..64].copy_from_slice(b"blam");
        data[56..58].copy_from_slice(&7u16.to_be_bytes());
        data[44..48].copy_from_slice(&64u32.to_be_bytes());
        fs::write(path, data).unwrap();
    }
    fn tag(path: &str) -> Tag {
        Tag {
            id: 1,
            index: 0,
            class: "bitm".into(),
            path: path.into(),
            external: true,
            data_offset: None,
            fields: vec![],
            references: vec![],
            primary_bitmap_status: None,
            shader_preview: None,
        }
    }
    #[test]
    fn indexed_paths_are_exact_and_embedded_bitmaps_do_not_require_fallbacks() {
        let d = tempfile::tempdir().unwrap();
        bitmap(&d.path().join("present.bitmap"));
        let mut embedded = tag("embedded");
        embedded.external = false;
        let result = audit(&[tag("present"), tag("missing"), embedded], d.path()).unwrap();
        assert_eq!(result.required, 2);
        assert_eq!(result.available, 1);
        assert_eq!(result.missing[0].path, "missing.bitmap");
    }
    #[test]
    fn existing_invalid_tags_are_not_silently_replaced() {
        let d = tempfile::tempdir().unwrap();
        fs::write(d.path().join("bad.bitmap"), b"DDS wrong generation").unwrap();
        let result = audit(&[tag("bad")], d.path()).unwrap();
        assert_eq!(result.invalid.len(), 1);
        assert!(review(&"a".repeat(64), d.path(), d.path(), &result).is_err());
    }
    #[test]
    fn reviewed_bitmap_repair_copies_a_new_tagset_and_preserves_sources() {
        let d = tempfile::tempdir().unwrap();
        let sdk = d.path().join("sdk");
        let source = d.path().join("classic");
        fs::create_dir(&sdk).unwrap();
        bitmap(&sdk.join("keep.bitmap"));
        bitmap(&source.join("missing.bitmap"));
        let result = audit(&[tag("missing")], &sdk).unwrap();
        let plan = review(&"a".repeat(64), &sdk, &source, &result).unwrap();
        let out = d.path().join("new");
        let receipt = create(&plan, &out, &AtomicBool::new(false), |_, _, _, _| {}).unwrap();
        assert_eq!(receipt.status, "ready-source-tagset");
        assert!(!receipt.playable_output);
        assert!(!sdk.join("missing.bitmap").exists());
        assert_eq!(
            maps::hash_file(&source.join("missing.bitmap")).unwrap(),
            maps::hash_file(&out.join("tags/missing.bitmap")).unwrap()
        );
        assert!(create(&plan, &out, &AtomicBool::new(false), |_, _, _, _| {}).is_err());
    }
    #[test]
    fn changed_review_source_is_rejected_before_sdk_staging() {
        let d = tempfile::tempdir().unwrap();
        let sdk = d.path().join("sdk");
        fs::create_dir(&sdk).unwrap();
        let source = d.path().join("classic");
        bitmap(&source.join("missing.bitmap"));
        let plan = review(
            &"a".repeat(64),
            &sdk,
            &source,
            &audit(&[tag("missing")], &sdk).unwrap(),
        )
        .unwrap();
        fs::write(source.join("missing.bitmap"), b"changed").unwrap();
        let out = d.path().join("new");
        assert!(create(&plan, &out, &AtomicBool::new(false), |_, _, _, _| {}).is_err());
        assert!(!out.exists());
    }
    #[test]
    fn traversal_duplicate_paths_and_wrong_classes_are_refused() {
        let d = tempfile::tempdir().unwrap();
        assert!(audit(&[tag("../escape")], d.path()).is_err());
        assert!(audit(&[tag("same"), tag("SAME")], d.path()).is_err());
        let source = d.path().join("source");
        bitmap(&source.join("missing.bitmap"));
        let file = source.join("missing.bitmap");
        let mut bytes = fs::read(&file).unwrap();
        bytes[36..40].copy_from_slice(b"weap");
        fs::write(file, bytes).unwrap();
        let result = audit(&[tag("missing")], d.path()).unwrap();
        assert!(review(&"a".repeat(64), d.path(), &source, &result).is_err());
    }
    #[test]
    fn cancellation_does_not_change_the_original_sdk() {
        let d = tempfile::tempdir().unwrap();
        let sdk = d.path().join("sdk");
        fs::create_dir(&sdk).unwrap();
        let source = d.path().join("classic");
        bitmap(&source.join("missing.bitmap"));
        let plan = review(
            &"a".repeat(64),
            &sdk,
            &source,
            &audit(&[tag("missing")], &sdk).unwrap(),
        )
        .unwrap();
        assert!(create(
            &plan,
            &d.path().join("new"),
            &AtomicBool::new(true),
            |_, _, _, _| {}
        )
        .is_err());
        assert!(!sdk.join("missing.bitmap").exists());
    }
    #[test]
    fn nested_repair_output_never_creates_a_folder_inside_either_source() {
        let d = tempfile::tempdir().unwrap();
        let sdk = d.path().join("sdk");
        fs::create_dir(&sdk).unwrap();
        let source = d.path().join("classic");
        bitmap(&source.join("missing.bitmap"));
        let plan = review(
            &"a".repeat(64),
            &sdk,
            &source,
            &audit(&[tag("missing")], &sdk).unwrap(),
        )
        .unwrap();
        for root in [&sdk, &source] {
            let nested = root.join("new");
            assert!(create(&plan, &nested, &AtomicBool::new(false), |_, _, _, _| {}).is_err());
            assert!(!nested.exists());
        }
    }
}
