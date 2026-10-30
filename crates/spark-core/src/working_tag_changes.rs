//! Read-only reconciliation of an owned editable tag tree. Never patches a cache.
use crate::{invalid, maps, reject_links, safe_relative, Result, SparkError};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

pub const MAX_FILES: usize = 20_000;
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_TREE_BYTES: u64 = 16 * 1024 * 1024 * 1024;
const STABLE_MS: u64 = 1500;
pub type Hashes = BTreeMap<String, String>;
#[derive(Clone, Debug, PartialEq, Eq)]
struct Stamp {
    bytes: u64,
    modified: u128,
    created: u128,
}
type Inventory = BTreeMap<String, Stamp>;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TagChange {
    pub path: String,
    pub kind: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagChanges {
    pub status: String,
    pub basis: String,
    pub revision: u64,
    pub total_files: usize,
    pub changed_files: usize,
    pub changes: Vec<TagChange>,
    pub list_truncated: bool,
    pub hashes_read_last_scan: usize,
}
pub struct TagChangeMonitor {
    root: PathBuf,
    basis: String,
    baseline: Hashes,
    hashes: Hashes,
    stamps: Inventory,
    pending: Option<(Inventory, u64)>,
    rehash: bool,
    revision: u64,
    hashes_read: usize,
    dirty_paths: BTreeSet<String>,
}
fn inventory(root: &Path) -> Result<Inventory> {
    reject_links(root)?;
    let mut files = BTreeMap::new();
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    let mut bytes = 0u64;
    let mut directories=0usize;
    while let Some((directory, depth)) = stack.pop() {
        directories+=1;
        if directories>MAX_FILES{return invalid("Working tag monitoring exceeds 20000 directories");}
        if depth > 32 {
            return invalid("Working tag monitoring exceeds 32 directory levels");
        }
        reject_links(&directory)?;
        for entry in fs::read_dir(directory)? {
            let path = entry?.path();
            reject_links(&path)?;
            let meta = fs::symlink_metadata(&path)?;
            if meta.is_dir() {
                stack.push((path, depth + 1));
                continue;
            }
            if !meta.is_file() {
                return invalid("Only regular working tag files can be monitored");
            }
            bytes = bytes
                .checked_add(meta.len())
                .ok_or_else(|| SparkError::Invalid("Tag tree size overflow".into()))?;
            if files.len() >= MAX_FILES || meta.len() > MAX_FILE_BYTES || bytes > MAX_TREE_BYTES {
                return invalid("Working tag monitoring is limited to 20000 files, 2 GiB/file and 16 GiB total; build validation remains separate");
            }
            let relative = path
                .strip_prefix(root)
                .map_err(|_| SparkError::Invalid("Working tag escaped its root".into()))?
                .to_string_lossy()
                .replace('\\', "/");
            safe_relative(&relative)?;
            let modified = meta
                .modified()?
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let created = meta
                .created()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .unwrap_or_default()
                .as_nanos();
            files.insert(
                relative,
                Stamp {
                    bytes: meta.len(),
                    modified,
                    created,
                },
            );
        }
    }
    Ok(files)
}
pub fn validate_baseline(hashes: &Hashes) -> Result<()> {
    if hashes.len() > MAX_FILES {
        return invalid("Compiled tag inventory exceeds the monitor file limit");
    }
    for (path, hash) in hashes {
        safe_relative(path)?;
        if hash.len() != 64
            || !hash
                .bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        {
            return invalid("Compiled tag inventory has an invalid SHA-256");
        }
    }
    Ok(())
}
impl TagChangeMonitor {
    pub fn new(root: &Path, baseline: Option<Hashes>) -> Result<Self> {
        reject_links(root)?;
        if !root.is_dir() {
            return invalid("Working tags directory is unavailable");
        }
        let root = fs::canonicalize(root)?;
        let stamps = inventory(&root)?;
        let mut hashes = Hashes::new();
        for path in stamps.keys() {
            hashes.insert(
                path.clone(),
                maps::hash_file(&root.join(safe_relative(path)?))?,
            );
        }
        if inventory(&root)? != stamps {
            return invalid(
                "Working tags are being saved; retry once the native tool finishes saving",
            );
        }
        if let Some(ref baseline) = baseline {
            validate_baseline(baseline)?;
        }
        let basis = if baseline.is_some() {
            "compiledBuild"
        } else {
            "watchStarted"
        }
        .into();
        let baseline = baseline.unwrap_or_else(|| hashes.clone());
        let hashes_read = hashes.len();
        Ok(Self {
            root,
            basis,
            baseline,
            hashes,
            stamps,
            pending: None,
            rehash: false,
            revision: 0,
            hashes_read,
            dirty_paths: BTreeSet::new(),
        })
    }
    pub fn root(&self) -> &Path {
        &self.root
    }
    pub fn accepted_hashes(&self) -> &Hashes { &self.hashes }
    pub fn baseline_hashes(&self) -> &Hashes { &self.baseline }
    pub fn keep_observed_baseline(&mut self) -> Result<()> {
        if self.pending.is_some() || !self.dirty_paths.is_empty() || self.rehash {
            return invalid("Wait for a stable native source before keeping its baseline");
        }
        self.baseline=self.hashes.clone();
        self.basis="acceptedNativeRevision".into();
        Ok(())
    }
    /// Native file events invalidate content identity even if an editor restores
    /// both length and timestamps. Debounce from the newest event, and hash only
    /// the named files instead of the entire kit on every save.
    pub fn mark_changed(&mut self, paths: impl IntoIterator<Item = String>) -> Result<()> {
        let mut changed = false;
        for path in paths {
            safe_relative(&path)?;
            if self.dirty_paths.len() >= MAX_FILES { self.rehash = true; }
            else { self.dirty_paths.insert(path); }
            changed = true;
        }
        if changed { self.pending = None; }
        Ok(())
    }
    pub fn report(&self) -> TagChanges {
        let mut changes = Vec::new();
        let mut count = 0;
        for (path, hash) in &self.hashes {
            if self.baseline.get(path) != Some(hash) {
                count += 1;
                if changes.len() < 128 {
                    changes.push(TagChange {
                        path: path.clone(),
                        kind: if self.baseline.contains_key(path) {
                            "modified"
                        } else {
                            "added"
                        }
                        .into(),
                    });
                }
            }
        }
        for path in self.baseline.keys() {
            if !self.hashes.contains_key(path) {
                count += 1;
                if changes.len() < 128 {
                    changes.push(TagChange {
                        path: path.clone(),
                        kind: "removed".into(),
                    });
                }
            }
        }
        TagChanges {
            status: if self.pending.is_some() {
                "saving"
            } else if count > 0 {
                "changed"
            } else {
                "unchanged"
            }
            .into(),
            basis: self.basis.clone(),
            revision: self.revision,
            total_files: self.hashes.len(),
            changed_files: count,
            list_truncated: count > changes.len(),
            changes,
            hashes_read_last_scan: self.hashes_read,
        }
    }
    /// Metadata is cheap. Hash only changed entries after two stable observations.
    /// Explicit rehash also catches files whose timestamps and size were restored.
    pub fn scan(&mut self, now_ms: u64, rehash: bool) -> Result<TagChanges> {
        self.hashes_read = 0;
        self.rehash |= rehash;
        let next = inventory(&self.root)?;
        if next == self.stamps && !self.rehash && self.pending.is_none() && self.dirty_paths.is_empty() {
            return Ok(self.report());
        }
        match &self.pending {
            Some((candidate, since))
                if *candidate == next && now_ms.saturating_sub(*since) >= STABLE_MS => {}
            Some((candidate, _)) if *candidate == next => return Ok(self.report()),
            _ => {
                self.pending = Some((next, now_ms));
                return Ok(self.report());
            }
        }
        let mut hashes = Hashes::new();
        for (path, stamp) in &next {
            let hash = if !self.rehash && !self.dirty_paths.contains(path) && self.stamps.get(path) == Some(stamp) {
                self.hashes.get(path).cloned().ok_or_else(|| {
                    SparkError::Invalid("Working tag hash state is incomplete".into())
                })?
            } else {
                self.hashes_read += 1;
                maps::hash_file(&self.root.join(safe_relative(path)?))?
            };
            hashes.insert(path.clone(), hash);
        }
        if inventory(&self.root)? != next {
            self.pending = None;
            return invalid("Working tags changed while being read; waiting for a stable save");
        }
        if self.hashes != hashes {
            self.revision = self
                .revision
                .checked_add(1)
                .ok_or_else(|| SparkError::Invalid("Working tag revision limit".into()))?;
        }
        self.hashes = hashes;
        self.stamps = next;
        self.pending = None;
        self.rehash = false;
        self.dirty_paths.clear();
        Ok(self.report())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    fn saved(root: &Path, name: &str, bytes: &[u8], seconds: u64) {
        let file = root.join(name);
        if let Some(parent) = file.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(&file, bytes).unwrap();
        fs::File::options()
            .write(true)
            .open(file)
            .unwrap()
            .set_times(
                fs::FileTimes::new()
                    .set_modified(UNIX_EPOCH + std::time::Duration::from_secs(seconds)),
            )
            .unwrap();
    }
    #[test]
    fn stable_add_modify_remove_restore_and_unchanged_polls_are_read_only() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        saved(root, "a.weapon", b"original", 100);
        saved(root, "b.scenery", b"keep", 100);
        let mut monitor = TagChangeMonitor::new(root, None).unwrap();
        assert_eq!(monitor.report().basis, "watchStarted");
        assert_eq!(monitor.scan(0, false).unwrap().hashes_read_last_scan, 0);
        saved(root, "a.weapon", b"new-data", 200);
        saved(root, "new/item.equipment", b"added", 200);
        fs::remove_file(root.join("b.scenery")).unwrap();
        assert_eq!(monitor.scan(10, false).unwrap().status, "saving");
        assert_eq!(monitor.scan(1000, false).unwrap().changed_files, 0);
        let report = monitor.scan(1600, false).unwrap();
        assert_eq!(report.changed_files, 3);
        assert_eq!(report.hashes_read_last_scan, 2);
        assert_eq!(report.revision, 1);
        assert_eq!(fs::read(root.join("a.weapon")).unwrap(), b"new-data");
        assert_eq!(monitor.scan(2000, false).unwrap().hashes_read_last_scan, 0);
        saved(root, "a.weapon", b"original", 300);
        saved(root, "b.scenery", b"keep", 300);
        fs::remove_file(root.join("new/item.equipment")).unwrap();
        monitor.scan(2100, false).unwrap();
        assert_eq!(monitor.scan(3700, false).unwrap().status, "unchanged");
    }
    #[test]
    fn continuous_partial_saves_never_replace_the_last_stable_report() {
        let dir = tempdir().unwrap();
        saved(dir.path(), "test.weapon", b"before", 100);
        let mut m = TagChangeMonitor::new(dir.path(), None).unwrap();
        saved(dir.path(), "test.weapon", b"first", 200);
        m.scan(0, false).unwrap();
        saved(dir.path(), "test.weapon", b"second", 300);
        assert_eq!(m.scan(1800, false).unwrap().status, "saving");
        assert_eq!(m.scan(3100, false).unwrap().revision, 0);
        assert_eq!(m.scan(3400, false).unwrap().changed_files, 1);
    }
    #[test]
    fn compiled_baseline_detects_edits_before_the_watcher_started() {
        let dir = tempdir().unwrap();
        saved(dir.path(), "test.weapon", b"before", 100);
        let original = maps::hash_file(&dir.path().join("test.weapon")).unwrap();
        saved(dir.path(), "test.weapon", b"after", 200);
        let m = TagChangeMonitor::new(
            dir.path(),
            Some(BTreeMap::from([("test.weapon".into(), original)])),
        )
        .unwrap();
        assert_eq!(m.report().basis, "compiledBuild");
        assert_eq!(m.report().changed_files, 1);
    }
    #[test]
    fn explicit_scan_rehashes_a_same_stamp_save_and_noop_saves_do_not_become_changes() {
        let dir = tempdir().unwrap();
        saved(dir.path(), "a.weapon", b"aaaa", 100);
        let mut m = TagChangeMonitor::new(dir.path(), None).unwrap();
        saved(dir.path(), "a.weapon", b"bbbb", 100);
        m.scan(0, true).unwrap();
        let report = m.scan(1600, false).unwrap();
        assert_eq!(report.changed_files, 1);
        assert_eq!(report.hashes_read_last_scan, 1);
        saved(dir.path(), "a.weapon", b"aaaa", 200);
        m.scan(2000, false).unwrap();
        assert_eq!(m.scan(3600, false).unwrap().changed_files, 0);
    }
    #[test]
    fn file_events_detect_preserved_timestamps_without_rehashing_the_whole_tree() {
        let dir = tempdir().unwrap();
        saved(dir.path(), "a.weapon", b"aaaa", 100);
        saved(dir.path(), "b.scenery", b"keep", 100);
        let mut monitor = TagChangeMonitor::new(dir.path(), None).unwrap();
        saved(dir.path(), "a.weapon", b"bbbb", 100);
        monitor.mark_changed(["a.weapon".into()]).unwrap();
        assert_eq!(monitor.scan(0, false).unwrap().status, "saving");
        saved(dir.path(), "a.weapon", b"cccc", 100);
        monitor.mark_changed(["a.weapon".into()]).unwrap();
        monitor.scan(1200, false).unwrap();
        assert_eq!(monitor.scan(1800, false).unwrap().revision, 0);
        let report = monitor.scan(2800, false).unwrap();
        assert_eq!(report.changed_files, 1);
        assert_eq!(report.hashes_read_last_scan, 1);
        assert_eq!(monitor.scan(3000, false).unwrap().hashes_read_last_scan, 0);
        assert!(monitor.mark_changed(["../escape.weapon".into()]).is_err());
    }
    #[test]
    fn invalid_baselines_and_missing_roots_are_rejected() {
        assert!(validate_baseline(&BTreeMap::from([(
            "../escape.weapon".into(),
            "a".repeat(64)
        )]))
        .is_err());
        assert!(validate_baseline(&BTreeMap::from([("ok.weapon".into(), "fake".into())])).is_err());
        let d = tempdir().unwrap();
        assert!(TagChangeMonitor::new(&d.path().join("missing"), None).is_err());
    }
    #[test]
    fn changed_list_is_bounded_without_hiding_the_total() {
        let dir = tempdir().unwrap();
        let mut m = TagChangeMonitor::new(dir.path(), None).unwrap();
        for n in 0..130 {
            saved(dir.path(), &format!("{n}.weapon"), b"new", 100);
        }
        m.scan(0, false).unwrap();
        let report = m.scan(1600, false).unwrap();
        assert_eq!(report.changed_files, 130);
        assert_eq!(report.changes.len(), 128);
        assert!(report.list_truncated);
    }
}
