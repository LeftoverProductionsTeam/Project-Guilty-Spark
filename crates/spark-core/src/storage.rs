//! One bounded ledger for newly generated native copies. Legacy sources and
//! accepted builds are never inferred disposable from their location or age.
use crate::{invalid, project, reject_links, Result, SparkError};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
const MIB: u64 = 1024 * 1024;
const MAX_RECORDS: usize = 2048;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Limits {
    pub preview_bytes: u64,
    pub staging_bytes: u64,
    pub diagnostics_bytes: u64,
    pub compiler_bytes: u64,
    pub total_bytes: u64,
    pub per_operation_bytes: u64,
    pub minimum_free_bytes: u64,
    pub abandoned_days: u32,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            preview_bytes: 512 * MIB,
            staging_bytes: 16 * 1024 * MIB,
            diagnostics_bytes: 256 * MIB,
            compiler_bytes: 8 * 1024 * MIB,
            total_bytes: 24 * 1024 * MIB,
            per_operation_bytes: 8 * 1024 * MIB,
            minimum_free_bytes: 4 * 1024 * MIB,
            abandoned_days: 7,
        }
    }
}
impl Limits {
    pub fn validate(&self) -> Result<()> {
        if [
            self.preview_bytes,
            self.staging_bytes,
            self.diagnostics_bytes,
            self.compiler_bytes,
            self.total_bytes,
            self.per_operation_bytes,
        ]
        .iter()
        .any(|v| *v == 0 || *v > 4 * 1024 * 1024 * MIB)
            || self.abandoned_days > 3650
        {
            return invalid(
                "Storage limits must be positive, at most 4 TiB, and retention at most 3650 days",
            );
        }
        Ok(())
    }
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Category {
    Preview,
    Staging,
    Diagnostics,
    Compiler,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub category: Category,
    pub path: PathBuf,
    pub source: Option<PathBuf>,
    pub source_revision: Option<String>,
    pub state: String,
    pub reserved_bytes: u64,
    pub logical_bytes: u64,
    pub allocated_bytes: Option<u64>,
    pub modified: u64,
    pub protected: bool,
    pub description: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub snapshot: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub root: PathBuf,
    pub limits: Limits,
    pub entries: Vec<Entry>,
    pub accounted_bytes: u64,
    pub free_bytes: Option<u64>,
    pub legacy_note: &'static str,
}
#[derive(Clone)]
pub struct Store {
    root: PathBuf,
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn fail(text: impl Into<String>) -> SparkError {
    SparkError::Invalid(text.into())
}
fn read_json<T: serde::de::DeserializeOwned>(file: &Path) -> Result<T> {
    reject_links(file)?;
    let f = fs::File::open(file)?;
    if f.metadata()?.len() > 4 * MIB {
        return invalid("Storage metadata exceeds 4 MiB; retained data was not changed");
    }
    let mut bytes = vec![];
    f.take(4 * MIB + 1).read_to_end(&mut bytes)?;
    Ok(serde_json::from_slice(&bytes)?)
}
fn lock(file: &Path) -> Result<fs::File> {
    reject_links(file)?;
    let f = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(file)?;
    f.try_lock()
        .map_err(|_| fail("Storage is in use by another operation; retry shortly"))?;
    Ok(f)
}
fn write<T: Serialize>(file: &Path, value: &T) -> Result<()> {
    project::atomic_write(file, &serde_json::to_vec(value)?, false)?;
    Ok(())
}
/// Inspect actual JSON string values, not their escaped serialization. Both a
/// referenced tree and a referenced file inside it protect an owned candidate.
/// Windows drive/UNC and verbatim spellings must identify the same source.
pub fn document_references_path(document: &serde_json::Value, target: &Path) -> bool {
    fn key(value: &str) -> Option<String> {
        if value.len() > 32768 || value.chars().any(char::is_control) {
            return None;
        }
        let mut text = value.replace('\\', "/");
        if text
            .get(..8)
            .is_some_and(|p| p.eq_ignore_ascii_case("//?/UNC/"))
        {
            text = format!("//{}", &text[8..]);
        } else if text.starts_with("//?/") {
            text = text[4..].to_owned();
        }
        let drive = text.as_bytes().get(1) == Some(&b':')
            && text.as_bytes().first().is_some_and(u8::is_ascii_alphabetic)
            && text.as_bytes().get(2) == Some(&b'/');
        let unc = text.starts_with("//");
        if !drive && !text.starts_with('/') {
            return None;
        }
        let mut parts = Vec::new();
        for part in text.split('/') {
            match part {
                "" | "." => {}
                ".." => {
                    parts.pop();
                }
                _ => parts.push(part),
            }
        }
        let prefix = if drive {
            ""
        } else if unc {
            "//"
        } else {
            "/"
        };
        let text = format!("{prefix}{}", parts.join("/"));
        Some(if drive || unc || cfg!(windows) {
            text.to_lowercase()
        } else {
            text
        })
    }
    fn overlaps(a: &str, b: &str) -> bool {
        a == b
            || a.strip_prefix(b).is_some_and(|tail| tail.starts_with('/'))
            || b.strip_prefix(a).is_some_and(|tail| tail.starts_with('/'))
    }
    let canonical = fs::canonicalize(target).ok();
    let Some(target) = key(&canonical.as_deref().unwrap_or(target).to_string_lossy()) else {
        return true;
    };
    let mut pending = vec![document];
    while let Some(value) = pending.pop() {
        match value {
            serde_json::Value::String(value) => {
                if key(value).is_some_and(|path| overlaps(&path, &target)) {
                    return true;
                }
                // Resolve aliases/short paths if present, without creating or
                // changing anything. Lexical identity still works if missing.
                if let Ok(path) = fs::canonicalize(value) {
                    if key(&path.to_string_lossy()).is_some_and(|path| overlaps(&path, &target)) {
                        return true;
                    }
                }
            }
            serde_json::Value::Array(values) => pending.extend(values),
            serde_json::Value::Object(values) => pending.extend(values.values()),
            _ => {}
        }
    }
    false
}
impl Store {
    /// QA libraries under the canonical checkout share one ledger. Installed
    /// applications use their selected data root. No new checkout is created.
    fn location(output: &Path) -> Result<PathBuf> {
        reject_links(output)?;
        let absolute = std::path::absolute(output)?;
        let parent = absolute
            .parent()
            .ok_or_else(|| fail("Generated output has no parent"))?;
        let repository = parent
            .ancestors()
            .find(|p| p.join("Cargo.toml").is_file() && p.join("AGENTS.md").is_file());
        let library = parent
            .ancestors()
            .find(|p| p.join("library.sqlite3").is_file());
        let root = if let Some(repo) = repository {
            repo.join(".local/storage-v1")
        } else if let Some(library) = library {
            library.join("storage-v1")
        } else {
            parent.join(".spark-storage-v1")
        };
        Ok(root)
    }
    pub fn for_output(output: &Path) -> Result<Self> {
        Self::open(&Self::location(output)?)
    }
    pub fn existing_for_output(output: &Path) -> Result<Option<Self>> {
        let root = Self::location(output)?;
        if root.is_dir() {
            Ok(Some(Self {
                root: fs::canonicalize(root)?,
            }))
        } else {
            Ok(None)
        }
    }
    pub fn open(root: &Path) -> Result<Self> {
        reject_links(root)?;
        fs::create_dir_all(root)?;
        let store = Self {
            root: fs::canonicalize(root)?,
        };
        fs::create_dir_all(store.root.join("leases"))?;
        Ok(store)
    }
    pub fn root(&self) -> &Path {
        &self.root
    }
    pub fn tool_budget(&self, cwd: &Path) -> Result<Option<ToolBudget>> {
        let cwd = fs::canonicalize(cwd)?;
        let _guard = lock(&self.root.join("catalog.lock"))?;
        let row = self
            .entries()?
            .into_iter()
            .filter(|e| {
                e.state == "active"
                    && e.path.is_dir()
                    && fs::canonicalize(&e.path).is_ok_and(|root| cwd.starts_with(root))
            })
            .max_by_key(|e| e.path.components().count());
        Ok(row.map(|e| ToolBudget {
            path: e.path,
            bytes: e.reserved_bytes,
            minimum_free: self
                .limits()
                .map(|l| l.minimum_free_bytes)
                .unwrap_or(u64::MAX),
        }))
    }
    fn entries(&self) -> Result<Vec<Entry>> {
        let file = self.root.join("entries.json");
        if !file.exists() {
            return Ok(vec![]);
        }
        let rows: Vec<Entry> = read_json(&file)?;
        if rows.len() > MAX_RECORDS {
            return invalid("Storage ledger exceeds its supported bound; review completed entries");
        }
        for row in &rows {
            uuid::Uuid::parse_str(&row.id).map_err(|_| fail("Invalid storage entry identity"))?;
            reject_links(&row.path)?;
        }
        Ok(rows)
    }
    pub fn limits(&self) -> Result<Limits> {
        let file = self.root.join("limits.json");
        let value = if file.exists() {
            read_json(&file)?
        } else {
            Limits::default()
        };
        value.validate()?;
        Ok(value)
    }
    pub fn set_limits(&self, value: &Limits) -> Result<()> {
        value.validate()?;
        let _guard = lock(&self.root.join("catalog.lock"))?;
        write(&self.root.join("limits.json"), value)
    }
    pub fn overview(&self) -> Result<Overview> {
        let _guard = lock(&self.root.join("catalog.lock"))?;
        let entries = self.entries()?;
        let accounted_bytes = entries
            .iter()
            .filter(|e| e.parent_id.is_none())
            .map(cost)
            .sum();
        Ok(Overview{root:self.root.clone(),limits:self.limits()?,entries,accounted_bytes,free_bytes:free_bytes(&self.root),legacy_note:"This ledger bounds new managed operations. Historical jobs, original sources, research and accepted builds remain protected and require a separate inventory; absence from this list never authorizes deletion."})
    }
    pub fn reserve(
        &self,
        path: &Path,
        source: Option<&Path>,
        bytes: u64,
        category: Category,
        description: &str,
    ) -> Result<Lease> {
        reject_links(path)?;
        let path = std::path::absolute(path)?;
        if path.exists() {
            return invalid("Storage reservations require a new owned output path");
        }
        let _guard = lock(&self.root.join("catalog.lock"))?;
        let mut entries = self.entries()?;
        let limits = self.limits()?;
        let parent = entries
            .iter()
            .filter(|e| e.state == "active" && path.starts_with(&e.path))
            .max_by_key(|e| e.path.components().count())
            .cloned();
        let total = entries
            .iter()
            .filter(|e| e.parent_id.is_none())
            .map(cost)
            .sum::<u64>();
        let category_bytes = entries
            .iter()
            .filter(|e| e.parent_id.is_none() && e.category == category)
            .map(cost)
            .sum::<u64>();
        let cap = match category {
            Category::Preview => limits.preview_bytes,
            Category::Staging => limits.staging_bytes,
            Category::Diagnostics => limits.diagnostics_bytes,
            Category::Compiler => limits.compiler_bytes,
        };
        let additional = if parent.is_some() { 0 } else { bytes };
        if let Some(parent) = &parent {
            let claimed = entries
                .iter()
                .filter(|e| e.parent_id.as_deref() == Some(&parent.id))
                .map(|e| e.reserved_bytes)
                .sum::<u64>();
            if claimed.saturating_add(bytes) > parent.reserved_bytes {
                return invalid(
                    "Native child staging exceeds its parent job reservation; no files were copied",
                );
            }
        }
        if entries.len() >= MAX_RECORDS
            || bytes > limits.per_operation_bytes
            || total.saturating_add(additional) > limits.total_bytes
            || category_bytes.saturating_add(additional) > cap
        {
            return invalid(format!("Storage budget would be exceeded before copying. This operation reserves {} MiB; {} MiB is already accounted. Review Storage & Cache or raise its limit. Active sources and previous-good builds were not removed.",bytes/MIB,total/MIB));
        }
        if free_bytes(&self.root)
            .is_some_and(|free| free < bytes.saturating_add(limits.minimum_free_bytes))
        {
            return invalid(format!("Not enough free disk space: reserve {} MiB plus {} MiB safety space before native staging",bytes/MIB,limits.minimum_free_bytes/MIB));
        }
        if entries.iter().any(|e| e.path == path) {
            return invalid("Generated output already has a storage owner");
        }
        let id = uuid::Uuid::new_v4().to_string();
        let held = lock(&self.root.join("leases").join(format!("{id}.lock")))?;
        entries.push(Entry {
            id: id.clone(),
            category,
            path: path.clone(),
            source: source.map(Path::to_owned),
            source_revision: None,
            state: "active".into(),
            reserved_bytes: bytes,
            logical_bytes: 0,
            allocated_bytes: None,
            modified: now(),
            protected: false,
            description: description.chars().take(240).collect(),
            parent_id: parent.map(|e| e.id),
            snapshot: String::new(),
        });
        write(&self.root.join("entries.json"), &entries)?;
        Ok(Lease {
            store: self.clone(),
            id,
            path,
            held: Some(held),
            finished: false,
        })
    }
    fn update(
        &self,
        id: &str,
        state: &str,
        protected: bool,
        revision: Option<String>,
    ) -> Result<()> {
        let _guard = lock(&self.root.join("catalog.lock"))?;
        let mut entries = self.entries()?;
        let row = entries
            .iter_mut()
            .find(|e| e.id == id)
            .ok_or_else(|| fail("Storage reservation disappeared"))?;
        let measured = measure(&row.path)?;
        row.logical_bytes = measured.logical_bytes;
        row.allocated_bytes = measured.allocated_bytes;
        row.snapshot = measured.fingerprint;
        row.state = state.into();
        row.protected = protected;
        row.modified = now();
        row.source_revision = revision;
        // Keep the conservative reservation if an output grew beyond the estimate;
        // the next operation is refused. Callers also enforce their per-file bounds.
        if row.path.exists() {
            row.reserved_bytes = measured
                .allocated_bytes
                .unwrap_or(measured.logical_bytes)
                .max(measured.logical_bytes);
        }
        write(&self.root.join("entries.json"), &entries)
    }
    pub fn refresh_inactive(&self) -> Result<()> {
        let _guard = lock(&self.root.join("catalog.lock"))?;
        let mut rows = self.entries()?;
        for row in &mut rows {
            if row.state != "active" {
                continue;
            }
            let Ok(_lease) = lock(&self.root.join("leases").join(format!("{}.lock", row.id)))
            else {
                continue;
            };
            // Only the caller's own native operation can certify adoption. A stopped
            // process leaves a failed, reviewable output; it never becomes accepted.
            let m = measure(&row.path)?;
            row.logical_bytes = m.logical_bytes;
            row.allocated_bytes = m.allocated_bytes;
            row.snapshot = m.fingerprint;
            row.state = "failed".into();
            row.modified = now();
            if row.path.exists() {
                row.reserved_bytes = m
                    .allocated_bytes
                    .unwrap_or(m.logical_bytes)
                    .max(m.logical_bytes);
            }
        }
        write(&self.root.join("entries.json"), &rows)
    }
    /// Preview only; every destructive UI operation must bind to this exact plan.
    pub fn cleanup_plan(&self) -> Result<CleanupPlan> {
        let _guard = lock(&self.root.join("catalog.lock"))?;
        let mut eligible = vec![];
        let mut protected = vec![];
        let age = self.limits()?.abandoned_days as u64 * 86400;
        let rows = self.entries()?;
        for row in &rows {
            let held = lock(&self.root.join("leases").join(format!("{}.lock", row.id)));
            let protected_parent = row.parent_id.as_ref().is_some_and(|id| {
                rows.iter()
                    .any(|p| &p.id == id && (p.protected || p.state == "active"))
            });
            let protected_child = rows
                .iter()
                .any(|child| child.parent_id.as_deref() == Some(&row.id) && child.protected);
            let referenced_source = rows.iter().any(|other| {
                other.id != row.id
                    && other.source.as_ref().is_some_and(|source| {
                        document_references_path(&serde_json::json!(source), &row.path)
                    })
            });
            let possible = held.is_ok()
                && !row.protected
                && !protected_parent
                && !protected_child
                && !referenced_source
                && (row.state == "failed"
                    || row.state == "active" && now().saturating_sub(row.modified) >= age
                    || row.category == Category::Preview && row.state == "ready");
            // Accepted trees can contain thousands of files. Never walk protected
            // output merely to decide that it is protected.
            let can = possible
                && !row.snapshot.is_empty()
                && measure(&row.path).is_ok_and(|m| m.fingerprint == row.snapshot);
            if can {
                eligible.push(row.clone());
            } else {
                protected.push(row.id.clone());
            }
        }
        let parents = eligible
            .iter()
            .map(|e| e.id.clone())
            .collect::<std::collections::BTreeSet<_>>();
        eligible.retain(|e| !e.parent_id.as_ref().is_some_and(|id| parents.contains(id)));
        eligible.sort_by_key(|e| e.modified);
        let bytes = eligible.iter().map(cost).sum();
        let token = crate::hex_bytes(sha2::Sha256::digest(serde_json::to_vec(&eligible)?));
        Ok(CleanupPlan {
            token,
            eligible,
            protected,
            bytes,
        })
    }
    pub fn cleanup(&self, plan: &CleanupPlan, ids: &[String], confirmed: bool) -> Result<u64> {
        if !confirmed {
            return invalid("Preview and confirm the selected generated files before cleanup");
        }
        if ids.is_empty() {
            return Ok(0);
        }
        let latest = self.cleanup_plan()?;
        if latest.token != plan.token {
            return invalid("Storage changed after preview; inspect the new cleanup plan");
        }
        let _guard = lock(&self.root.join("catalog.lock"))?;
        let mut entries = self.entries()?;
        let mut removed = 0u64;
        for id in ids {
            let row = latest
                .eligible
                .iter()
                .find(|e| &e.id == id)
                .ok_or_else(|| {
                    fail("Selected entry is protected or was not in the cleanup preview")
                })?;
            if entries.iter().any(|other| {
                other.id != *id
                    && (((other.path.starts_with(&row.path) || row.path.starts_with(&other.path))
                        && (other.protected || other.state == "active"))
                        || other.source.as_ref().is_some_and(|source| {
                            document_references_path(&serde_json::json!(source), &row.path)
                        }))
            }) {
                return invalid("An accepted/active output or source dependency now references this temporary folder; cleanup refused");
            }
            let _lease = lock(&self.root.join("leases").join(format!("{id}.lock")))?;
            reject_links(&row.path)?;
            // Only outputs created under a successful reserve() are admitted. The
            // marker binds the absolute path; unknown/legacy directories have no marker.
            let marker = marker(&row.path);
            let owner: Owner = read_json(&marker)?;
            if owner.id != *id || owner.path != row.path || owner.store != self.root {
                return invalid("Generated output ownership changed; cleanup refused");
            }
            let measured = measure(&row.path)?;
            if measured.logical_bytes != row.logical_bytes || measured.fingerprint != row.snapshot {
                return invalid("Generated output changed since preview; cleanup refused");
            }
            if row.path.is_dir() {
                fs::remove_dir_all(&row.path)?;
            } else if row.path.is_file() {
                fs::remove_file(&row.path)?;
            }
            fs::remove_file(marker)?;
            removed += measured.allocated_bytes.unwrap_or(measured.logical_bytes);
            entries.retain(|e| e.id != *id);
            entries.retain(|e| !e.path.starts_with(&row.path));
            write(&self.root.join("entries.json"), &entries)?;
        }
        Ok(removed)
    }
}
pub struct ToolBudget {
    path: PathBuf,
    bytes: u64,
    minimum_free: u64,
}
impl ToolBudget {
    pub fn check(&self) -> Result<()> {
        if estimate_tree(&self.path)? > self.bytes {
            return invalid("Native tool exceeded its owned job's disk reservation. The isolated writer was stopped, its output is rejected, and original sources/previous-good builds remain intact");
        }
        if free_bytes(&self.path).is_some_and(|free| free < self.minimum_free) {
            return invalid("Disk safety space was reached during native work. The isolated job is rejected; original source and accepted builds are retained");
        }
        Ok(())
    }
}
use sha2::Digest;
fn cost(row: &Entry) -> u64 {
    row.reserved_bytes
        .max(row.allocated_bytes.unwrap_or(row.logical_bytes))
        .max(row.logical_bytes)
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupPlan {
    pub token: String,
    pub eligible: Vec<Entry>,
    pub protected: Vec<String>,
    pub bytes: u64,
}
#[derive(Serialize, Deserialize)]
struct Owner {
    id: String,
    path: PathBuf,
    store: PathBuf,
}
fn marker(path: &Path) -> PathBuf {
    path.with_file_name(format!(
        ".spark-owned-{}.json",
        path.file_name().unwrap_or_default().to_string_lossy()
    ))
}
pub struct Lease {
    store: Store,
    id: String,
    path: PathBuf,
    held: Option<fs::File>,
    finished: bool,
}
impl Lease {
    pub fn mark_owned(&self) -> Result<()> {
        write(
            &marker(&self.path),
            &Owner {
                id: self.id.clone(),
                path: self.path.clone(),
                store: self.store.root.clone(),
            },
        )
    }
    pub fn finish(mut self, protected: bool, revision: Option<String>) -> Result<()> {
        self.mark_owned()?;
        self.store.update(&self.id, "ready", protected, revision)?;
        self.finished = true;
        self.held.take();
        Ok(())
    }
    pub fn adopt(&mut self, target: &Path) -> Result<()> {
        reject_links(target)?;
        let target = std::path::absolute(target)?;
        if target.parent() != self.path.parent() || target.exists() {
            return invalid("Generated adoption requires a new sibling directory");
        }
        let _guard = lock(&self.store.root.join("catalog.lock"))?;
        let mut rows = self.store.entries()?;
        let row = rows
            .iter_mut()
            .find(|e| e.id == self.id)
            .ok_or_else(|| fail("Storage reservation disappeared"))?;
        fs::rename(&self.path, &target)?;
        let old = marker(&self.path);
        self.path = target.clone();
        row.path = target;
        self.mark_owned()?;
        write(&self.store.root.join("entries.json"), &rows)?;
        if old.exists() {
            fs::remove_file(old)?;
        }
        Ok(())
    }
}
impl Drop for Lease {
    fn drop(&mut self) {
        if !self.finished {
            let _ = self.mark_owned();
            let _ = self.store.update(&self.id, "failed", false, None);
        }
        self.held.take();
    }
}
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Measurement {
    pub logical_bytes: u64,
    pub allocated_bytes: Option<u64>,
    pub files: usize,
    pub fingerprint: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSizes {
    pub folders: Vec<(PathBuf, Measurement)>,
    pub total: Measurement,
    pub skipped_links: usize,
}
/// Read-only size snapshot for connected game directories. Walk overlapping
/// roots once and count each physical file once in the combined allocation.
/// These informational results deliberately have no cleanup fingerprint.
pub fn measure_folders(roots: &[PathBuf]) -> Result<FolderSizes> {
    if roots.len() > 64 {
        return invalid("Measure at most 64 connected Halo folders at once");
    }
    let mut roots = roots
        .iter()
        .map(|root| {
            reject_links(root)?;
            let root = fs::canonicalize(root)?;
            if !root.is_dir() {
                return invalid("Connected Halo storage must be a directory");
            }
            Ok(root)
        })
        .collect::<Result<Vec<_>>>()?;
    roots.sort();
    roots.dedup();
    let empty = || Measurement {
        allocated_bytes: Some(0),
        ..Default::default()
    };
    let mut result = FolderSizes {
        folders: roots.iter().cloned().map(|root| (root, empty())).collect(),
        total: empty(),
        skipped_links: 0,
    };
    let mut physical = vec![std::collections::BTreeSet::new(); roots.len()];
    let mut total_physical = std::collections::BTreeSet::new();
    let mut reference_count = 0usize;
    let mut seen_directories = std::collections::BTreeSet::new();
    let mut pending = roots
        .iter()
        .cloned()
        .map(|root| (root, 0usize))
        .collect::<Vec<_>>();
    while let Some((path, depth)) = pending.pop() {
        let meta = fs::symlink_metadata(&path)?;
        let mut linked = meta.file_type().is_symlink();
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            linked |= meta.file_attributes() & 0x400 != 0;
        }
        if linked {
            result.skipped_links += 1;
            continue;
        }
        if meta.is_dir() {
            if !seen_directories.insert(path.clone()) {
                continue;
            }
            if depth > 64 || seen_directories.len() > 200000 {
                return invalid("Halo folder scan exceeds its directory/depth bound");
            }
            for entry in fs::read_dir(path)? {
                if pending.len() >= 200000 {
                    return invalid("Halo folder scan exceeds its pending-entry bound");
                }
                pending.push((entry?.path(), depth + 1));
            }
        } else if meta.is_file() {
            result.total.files += 1;
            if result.total.files > 200000 {
                return invalid(
                    "Halo folder scan exceeds 200000 files; inspect its directories separately",
                );
            }
            result.total.logical_bytes = result
                .total
                .logical_bytes
                .checked_add(meta.len())
                .ok_or_else(|| fail("Halo storage size overflow"))?;
            let id = file_identity(&path);
            let allocation = allocated_bytes(&path);
            if let Some(id) = id {
                if total_physical.insert(id) {
                    result.total.allocated_bytes = result
                        .total
                        .allocated_bytes
                        .zip(allocation)
                        .map(|(a, b)| a.saturating_add(b));
                }
            } else {
                result.total.allocated_bytes = None;
            }
            for (index, (root, measured)) in result.folders.iter_mut().enumerate() {
                if !path.starts_with(root.as_path()) {
                    continue;
                }
                reference_count += 1;
                if reference_count > 1000000 {
                    return invalid("Halo folder overlap exceeds the bounded accounting budget; inspect fewer folders at once");
                }
                measured.files += 1;
                measured.logical_bytes = measured
                    .logical_bytes
                    .checked_add(meta.len())
                    .ok_or_else(|| fail("Halo folder size overflow"))?;
                if let Some(id) = id {
                    if physical[index].insert(id) {
                        measured.allocated_bytes = measured
                            .allocated_bytes
                            .zip(allocation)
                            .map(|(a, b)| a.saturating_add(b));
                    }
                } else {
                    measured.allocated_bytes = None;
                }
            }
        } else {
            return invalid(
                "Halo storage contains a non-regular file; no complete total was certified",
            );
        }
    }
    Ok(result)
}
pub fn measure(root: &Path) -> Result<Measurement> {
    reject_links(root)?;
    if !root.exists() {
        return Ok(Measurement::default());
    }
    let mut pending = vec![root.to_owned()];
    let mut out = Measurement {
        allocated_bytes: Some(0),
        ..Default::default()
    };
    let mut identities = vec![];
    let mut allocated_ids = std::collections::BTreeSet::new();
    let mut directories = 0usize;
    while let Some(p) = pending.pop() {
        reject_links(&p)?;
        let m = fs::metadata(&p)?;
        if m.is_dir() {
            directories += 1;
            if directories > 200000 {
                return invalid("Storage inventory exceeds directory budget");
            }
            for entry in fs::read_dir(p)? {
                pending.push(entry?.path());
            }
            if pending.len() > 200000 {
                return invalid("Storage inventory exceeds directory budget");
            }
        } else if m.is_file() {
            out.files += 1;
            if out.files > 200000 {
                return invalid("Storage inventory exceeds 200000 files");
            }
            out.logical_bytes = out
                .logical_bytes
                .checked_add(m.len())
                .ok_or_else(|| fail("Storage byte count overflow"))?;
            let id = file_identity(&p);
            match id {
                Some(id) => {
                    if allocated_ids.insert(id) {
                        out.allocated_bytes = out
                            .allocated_bytes
                            .zip(allocated_bytes(&p))
                            .map(|(a, b)| a.saturating_add(b));
                    }
                }
                None => out.allocated_bytes = None,
            }
            identities.push((
                p.strip_prefix(root)
                    .unwrap_or(&p)
                    .to_string_lossy()
                    .into_owned(),
                m.len(),
                m.modified()?
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos()
                    .to_string(),
                id,
            ));
        } else {
            return invalid("Storage inventory contains a special file");
        }
    }
    identities.sort();
    out.fingerprint = crate::hex_bytes(sha2::Sha256::digest(serde_json::to_vec(&identities)?));
    Ok(out)
}
pub fn estimate_copy(files: usize, bytes: u64) -> u64 {
    bytes.saturating_add((files as u64).saturating_mul(65536))
}
/// Conservative metadata-only polling estimate; full allocation/fingerprint
/// inventories are reserved for adoption, recovery and explicit inspection.
pub fn estimate_tree(root: &Path) -> Result<u64> {
    reject_links(root)?;
    if !root.exists() {
        return Ok(0);
    }
    let mut pending = vec![(root.to_owned(), 0usize)];
    let (mut files, mut bytes, mut dirs) = (0usize, 0u64, 0usize);
    while let Some((path, depth)) = pending.pop() {
        let m = fs::symlink_metadata(&path)?;
        let mut link = m.file_type().is_symlink();
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            link |= m.file_attributes() & 0x400 != 0;
        }
        if link {
            return invalid("Native writer introduced a linked path; storage accounting refused");
        }
        if m.is_dir() {
            dirs += 1;
            if depth > 32 || dirs > 200000 {
                return invalid("Native writer exceeded directory/depth limits");
            }
            for item in fs::read_dir(path)? {
                if pending.len() >= 200000 {
                    return invalid("Native writer exceeded pending directory limits");
                }
                pending.push((item?.path(), depth + 1));
            }
        } else if m.is_file() {
            files += 1;
            if files > 200000 {
                return invalid("Native writer exceeded file limits");
            }
            bytes = bytes
                .checked_add(m.len())
                .ok_or_else(|| fail("Native writer byte count overflow"))?;
        } else {
            return invalid("Native writer introduced a non-regular file");
        }
    }
    Ok(estimate_copy(files, bytes))
}
/// Bounded append-only diagnostic output. Old logs are counted and retained,
/// never truncated or swept to make room. Validation still consumes the real
/// native process output independently of this presentation log.
pub fn append_diagnostic(root: &Path, name: &str, line: &[u8]) -> Result<()> {
    use std::io::Write;
    if !name.ends_with(".jsonl") || uuid::Uuid::parse_str(name.trim_end_matches(".jsonl")).is_err()
    {
        return invalid("Diagnostic filename must be a native job UUID");
    }
    reject_links(root)?;
    fs::create_dir_all(root)?;
    let store = Store::for_output(&root.join("budget-probe"))?;
    let limit = store.limits()?.diagnostics_bytes;
    let _guard = lock(&root.join(".append.lock"))?;
    let mut total = 0u64;
    let mut count = 0;
    for item in fs::read_dir(root)? {
        let path = item?.path();
        if path.extension().is_none_or(|ext| ext != "jsonl") {
            continue;
        }
        count += 1;
        if count > 20000 {
            return invalid("Diagnostic file count exceeds its budget; prior logs were retained");
        }
        reject_links(&path)?;
        total = total.saturating_add(fs::metadata(path)?.len());
    }
    let path = root.join(name);
    reject_links(&path)?;
    let prior = if path.exists() {
        fs::metadata(&path)?.len()
    } else {
        0
    };
    if line.len() > 65536
        || prior.saturating_add(line.len() as u64) > 4 * MIB
        || total.saturating_add(line.len() as u64) > limit
    {
        return invalid(
            "Diagnostic storage limit reached; no previous log was deleted or truncated",
        );
    }
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?
        .write_all(line)?;
    Ok(())
}
#[cfg(windows)]
fn wide(path: &Path) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    path.as_os_str().encode_wide().chain([0]).collect()
}
#[cfg(windows)]
pub fn free_bytes(path: &Path) -> Option<u64> {
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetDiskFreeSpaceExW(
            path: *const u16,
            available: *mut u64,
            total: *mut u64,
            free: *mut u64,
        ) -> i32;
    }
    let mut free = 0;
    let ok = unsafe {
        GetDiskFreeSpaceExW(
            wide(path).as_ptr(),
            &mut free,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    (ok != 0).then_some(free)
}
#[cfg(not(windows))]
pub fn free_bytes(_path: &Path) -> Option<u64> {
    None
}
#[cfg(windows)]
fn allocated_bytes(path: &Path) -> Option<u64> {
    use std::os::windows::io::AsRawHandle;
    #[repr(C)]
    struct Standard {
        allocation: i64,
        end: i64,
        links: u32,
        delete_pending: u8,
        directory: u8,
    }
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetFileInformationByHandleEx(
            handle: *mut std::ffi::c_void,
            class: u32,
            info: *mut std::ffi::c_void,
            size: u32,
        ) -> i32;
    }
    let f = fs::File::open(path).ok()?;
    let mut info = Standard {
        allocation: 0,
        end: 0,
        links: 0,
        delete_pending: 0,
        directory: 0,
    };
    let ok = unsafe {
        GetFileInformationByHandleEx(
            f.as_raw_handle(),
            1,
            (&mut info as *mut Standard).cast(),
            std::mem::size_of::<Standard>() as u32,
        )
    };
    (ok != 0 && info.allocation >= 0).then_some(info.allocation as u64)
}
#[cfg(not(windows))]
fn allocated_bytes(path: &Path) -> Option<u64> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        fs::metadata(path).ok().map(|m| m.blocks() * 512)
    }
    #[cfg(not(unix))]
    {
        let _ = path;
        None
    }
}
#[cfg(windows)]
fn file_identity(path: &Path) -> Option<(u64, u64)> {
    use std::os::windows::io::AsRawHandle;
    #[repr(C)]
    struct Information {
        attributes: u32,
        creation: [u32; 2],
        access: [u32; 2],
        write: [u32; 2],
        volume: u32,
        size_high: u32,
        size_low: u32,
        links: u32,
        index_high: u32,
        index_low: u32,
    }
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetFileInformationByHandle(
            handle: *mut std::ffi::c_void,
            information: *mut Information,
        ) -> i32;
    }
    let f = fs::File::open(path).ok()?;
    let mut information = Information {
        attributes: 0,
        creation: [0; 2],
        access: [0; 2],
        write: [0; 2],
        volume: 0,
        size_high: 0,
        size_low: 0,
        links: 0,
        index_high: 0,
        index_low: 0,
    };
    let ok = unsafe { GetFileInformationByHandle(f.as_raw_handle(), &mut information) };
    (ok != 0).then_some((
        information.volume as u64,
        (u64::from(information.index_high) << 32) | u64::from(information.index_low),
    ))
}
#[cfg(not(windows))]
fn file_identity(path: &Path) -> Option<(u64, u64)> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        fs::metadata(path).ok().map(|m| (m.dev(), m.ino()))
    }
    #[cfg(not(unix))]
    {
        let _ = path;
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn connected_halo_scan_reports_junctions_without_walking_or_certifying_them() {
        let root = tempfile::tempdir().unwrap();
        let halo = root.path().join("halo");
        let outside = root.path().join("other");
        fs::create_dir(&halo).unwrap();
        fs::create_dir(&outside).unwrap();
        fs::write(halo.join("own.map"), b"own map").unwrap();
        fs::write(outside.join("unrelated.map"), b"must not be counted").unwrap();
        let link = halo.join("linked");
        let output = crate::steam::command("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", "New-Item -ItemType Junction -Path $env:SPARK_USAGE_LINK -Target $env:SPARK_USAGE_SOURCE | Out-Null"])
            .env("SPARK_USAGE_LINK", &link)
            .env("SPARK_USAGE_SOURCE", &outside)
            .output().unwrap();
        assert!(output.status.success());
        let result = measure_folders(std::slice::from_ref(&halo));
        let selected_link = measure_folders(std::slice::from_ref(&link));
        fs::remove_dir(&link).unwrap();
        let result = result.unwrap();
        assert_eq!(result.skipped_links, 1);
        assert_eq!(result.total.files, 1);
        assert_eq!(result.total.logical_bytes, 7);
        assert!(result.total.fingerprint.is_empty());
        assert!(selected_link.is_err());
        assert_eq!(
            fs::read(outside.join("unrelated.map")).unwrap(),
            b"must not be counted"
        );
    }
    #[test]
    fn connected_halo_totals_do_not_double_count_overlaps_or_shared_physical_files() {
        let root = tempfile::tempdir().unwrap();
        let installation = root.path().join("halo");
        let maps = installation.join("maps");
        fs::create_dir_all(&maps).unwrap();
        fs::write(installation.join("halo.exe"), vec![1u8; 10000]).unwrap();
        fs::write(maps.join("sound.map"), vec![2u8; 20000]).unwrap();
        fs::hard_link(maps.join("sound.map"), maps.join("shared.map")).unwrap();
        let single = measure(&installation).unwrap();
        let group = measure_folders(&[maps.clone(), installation.clone(), maps]).unwrap();
        assert_eq!(group.folders.len(), 2);
        assert_eq!(group.total.files, 3);
        assert_eq!(group.total.logical_bytes, 50000);
        assert_eq!(group.total.allocated_bytes, single.allocated_bytes);
        assert_eq!(
            group
                .folders
                .iter()
                .find(|(p, _)| p.ends_with("maps"))
                .unwrap()
                .1
                .logical_bytes,
            40000
        );
        assert_eq!(
            fs::read(installation.join("halo.exe")).unwrap(),
            vec![1u8; 10000]
        );
    }
    #[test]
    fn deeply_nested_qa_libraries_use_the_same_repository_budget() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("Cargo.toml"), "# fixture repository").unwrap();
        fs::write(root.path().join("AGENTS.md"), "Preserve source").unwrap();
        let mut nested = root.path().to_owned();
        for _ in 0..20 {
            nested.push("q");
        }
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join("library.sqlite3"), b"fixture library marker").unwrap();
        let shallow = Store::for_output(&root.path().join("jobs/job")).unwrap();
        let deep = Store::for_output(&nested.join("jobs/job")).unwrap();
        assert_eq!(shallow.root(), deep.root());
    }
    #[test]
    fn saved_source_references_protect_equivalent_windows_paths_and_settings() {
        let target = Path::new(r"D:\Spark\jobs\candidate");
        for reference in [
            r"\\?\D:\SPARK\jobs\candidate\tags\door.device_machine",
            "d:/spark/jobs/candidate/./tags",
            r"D:\Spark\jobs\candidate",
            r"D:\Spark\jobs",
        ] {
            assert!(document_references_path(
                &serde_json::json!({"source": {"tags": reference}}),
                target
            ));
        }
        assert!(!document_references_path(
            &serde_json::json!({"path": r"D:\Spark\jobs\candidate-other"}),
            target
        ));
        assert!(document_references_path(
            &serde_json::json!([r"\\?\UNC\SERVER\Share\tags\door"]),
            Path::new(r"\\server\share\tags")
        ));
        let root = tempfile::tempdir().unwrap();
        let library = crate::library::Library::open(root.path()).unwrap();
        library
            .set_setting(
                "futureRuntimeSetting",
                &serde_json::json!({"sdk": r"\\?\D:\Spark\jobs\candidate\tags"}),
            )
            .unwrap();
        assert!(library.settings_reference_path(target).unwrap());
        assert!(!library
            .settings_reference_path(Path::new(r"D:\Spark\jobs\other"))
            .unwrap());
    }
    #[test]
    fn failed_output_used_as_another_operations_source_is_not_disposable() {
        let d = tempfile::tempdir().unwrap();
        let store = Store::open(&d.path().join("ledger")).unwrap();
        let source = d.path().join("failed-source");
        let source_lease = store
            .reserve(
                &source,
                None,
                1024 * 1024,
                Category::Staging,
                "failed source",
            )
            .unwrap();
        fs::create_dir(&source).unwrap();
        fs::write(source.join("recoverable.tag"), b"keep").unwrap();
        drop(source_lease);
        let earlier_plan = store.cleanup_plan().unwrap();
        let source_id = earlier_plan.eligible[0].id.clone();
        let output = d.path().join("dependent-job");
        let job = store
            .reserve(
                &output,
                Some(&source.join("recoverable.tag")),
                1024 * 1024,
                Category::Staging,
                "dependent source",
            )
            .unwrap();
        fs::create_dir(&output).unwrap();
        drop(job);
        assert!(!store
            .cleanup_plan()
            .unwrap()
            .eligible
            .iter()
            .any(|row| row.id == source_id));
        assert!(store.cleanup(&earlier_plan, &[source_id], true).is_err());
        assert_eq!(fs::read(source.join("recoverable.tag")).unwrap(), b"keep");
    }
    #[test]
    fn tool_budget_rejects_unreserved_growth_and_read_only_checks_create_nothing() {
        let d = tempfile::tempdir().unwrap();
        let readonly = d.path().join("original");
        fs::create_dir(&readonly).unwrap();
        assert!(Store::existing_for_output(&readonly.join("probe"))
            .unwrap()
            .is_none());
        assert_eq!(fs::read_dir(&readonly).unwrap().count(), 0);
        let store = Store::open(&d.path().join("ledger")).unwrap();
        let out = d.path().join("job");
        let lease = store
            .reserve(&out, None, 65536, Category::Staging, "bounded writer")
            .unwrap();
        fs::create_dir(&out).unwrap();
        lease.mark_owned().unwrap();
        let budget = store.tool_budget(&out).unwrap().unwrap();
        fs::write(out.join("too-large"), vec![1u8; 131072]).unwrap();
        assert!(budget.check().is_err());
        drop(lease);
        assert_eq!(store.overview().unwrap().entries[0].state, "failed");
    }
    #[test]
    fn repeated_operations_stop_before_copying_and_changed_previews_are_refused() {
        let d = tempfile::tempdir().unwrap();
        let store = Store::open(&d.path().join("ledger")).unwrap();
        let mut limits = Limits::default();
        limits.total_bytes = 65536;
        limits.staging_bytes = 65536;
        limits.minimum_free_bytes = 0;
        store.set_limits(&limits).unwrap();
        let out = d.path().join("native-job");
        let lease = store
            .reserve(&out, None, 65536, Category::Staging, "accepted fixture")
            .unwrap();
        fs::create_dir(&out).unwrap();
        fs::write(out.join("tag"), vec![42u8; 65536]).unwrap();
        lease.finish(true, Some("fixture".into())).unwrap();
        for i in 0..10 {
            let target = d.path().join(format!("repeated-{i}"));
            assert!(store
                .reserve(&target, None, 1, Category::Staging, "must refuse")
                .is_err());
            assert!(!target.exists());
        }
        limits.total_bytes = 2 * 1024 * 1024;
        limits.staging_bytes = 2 * 1024 * 1024;
        store.set_limits(&limits).unwrap();
        let failed = d.path().join("failed");
        let lease = store
            .reserve(&failed, None, 65536, Category::Staging, "failed fixture")
            .unwrap();
        fs::create_dir(&failed).unwrap();
        fs::write(failed.join("tag"), b"old").unwrap();
        drop(lease);
        let plan = store.cleanup_plan().unwrap();
        assert_eq!(plan.eligible.len(), 1);
        fs::write(failed.join("new-user-data"), b"keep").unwrap();
        assert!(store
            .cleanup(&plan, &[plan.eligible[0].id.clone()], true)
            .is_err());
        assert_eq!(fs::read(failed.join("new-user-data")).unwrap(), b"keep");
    }
    #[test]
    fn physical_allocation_deduplicates_hardlinks() {
        let d = tempfile::tempdir().unwrap();
        let a = d.path().join("a");
        fs::write(&a, vec![7u8; 10000]).unwrap();
        let one = measure(d.path()).unwrap();
        fs::hard_link(&a, d.path().join("b")).unwrap();
        let two = measure(d.path()).unwrap();
        assert_eq!(two.files, 2);
        assert_eq!(two.logical_bytes, 20000);
        assert_eq!(two.allocated_bytes, one.allocated_bytes);
        assert!(two.allocated_bytes.unwrap() >= 10000);
    }
    // A real child process holds the same on-disk lease that a second Spark
    // process sees. This test doubles as a crash fixture when launched by parent.
    #[test]
    fn native_lease_child() {
        let Some(root) = std::env::var_os("SPARK_LEASE_CHILD_ROOT") else {
            return;
        };
        let root = PathBuf::from(root);
        let store = Store::open(&root.join("ledger")).unwrap();
        let out = root.join("child-output");
        let lease = store
            .reserve(&out, None, 65536, Category::Staging, "real process lease")
            .unwrap();
        fs::create_dir(&out).unwrap();
        fs::write(out.join("partial"), b"not adopted").unwrap();
        lease.mark_owned().unwrap();
        fs::write(root.join("ready"), b"ready").unwrap();
        let mut input = String::new();
        std::io::stdin().read_line(&mut input).unwrap();
        drop(lease);
    }
    #[test]
    fn cross_process_lease_and_crash_recovery_keep_active_outputs() {
        let d = tempfile::tempdir().unwrap();
        let mut child = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "storage::tests::native_lease_child",
                "--nocapture",
            ])
            .env("SPARK_LEASE_CHILD_ROOT", d.path())
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
        while !d.path().join("ready").is_file() && std::time::Instant::now() < deadline {
            if child.try_wait().unwrap().is_some() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
        if !d.path().join("ready").is_file() {
            let _ = child.kill();
            let _ = child.wait();
            panic!("real lease process did not become ready");
        }
        let store = Store::open(&d.path().join("ledger")).unwrap();
        store.refresh_inactive().unwrap();
        assert_eq!(store.overview().unwrap().entries[0].state, "active");
        assert!(store.cleanup_plan().unwrap().eligible.is_empty());
        child.kill().unwrap();
        child.wait().unwrap();
        store.refresh_inactive().unwrap();
        let plan = store.cleanup_plan().unwrap();
        assert_eq!(plan.eligible.len(), 1);
        assert!(d.path().join("child-output/partial").exists());
        assert_eq!(store.overview().unwrap().entries[0].state, "failed");
    }
    #[test]
    fn quotas_leases_restart_and_preview_protect_native_source() {
        let d = tempfile::tempdir().unwrap();
        let store = Store::open(&d.path().join("ledger")).unwrap();
        let mut limits = Limits::default();
        limits.total_bytes = 1024;
        limits.staging_bytes = 1024;
        limits.minimum_free_bytes = 0;
        store.set_limits(&limits).unwrap();
        let out = d.path().join("job");
        let lease = store
            .reserve(&out, None, 1024, Category::Staging, "controlled failure")
            .unwrap();
        fs::create_dir(&out).unwrap();
        fs::write(out.join("temp"), b"source-independent").unwrap();
        lease.mark_owned().unwrap();
        assert!(store
            .reserve(
                &d.path().join("other"),
                None,
                1,
                Category::Staging,
                "refused"
            )
            .is_err());
        assert!(store.cleanup_plan().unwrap().eligible.is_empty());
        drop(lease);
        let restarted = Store::open(store.root()).unwrap();
        let plan = restarted.cleanup_plan().unwrap();
        assert_eq!(plan.eligible.len(), 1);
        assert!(restarted
            .cleanup(&plan, &[plan.eligible[0].id.clone()], false)
            .is_err());
        assert!(restarted
            .cleanup(&plan, &[plan.eligible[0].id.clone()], true)
            .is_ok());
        assert!(!out.exists());
    }
    #[test]
    fn previous_good_and_unknown_directories_never_become_cache() {
        let d = tempfile::tempdir().unwrap();
        let store = Store::open(&d.path().join("ledger")).unwrap();
        let out = d.path().join("accepted");
        let lease = store
            .reserve(&out, None, 1024 * 1024, Category::Staging, "native source")
            .unwrap();
        fs::create_dir(&out).unwrap();
        fs::write(out.join("tag"), b"good").unwrap();
        lease.finish(true, Some("a".repeat(64))).unwrap();
        let unknown = d.path().join("old-job");
        fs::create_dir(&unknown).unwrap();
        assert!(store.cleanup_plan().unwrap().eligible.is_empty());
        assert_eq!(fs::read(out.join("tag")).unwrap(), b"good");
        assert!(unknown.exists());
    }
}
