//! Stable-save detection for an explicitly opened external map. Metadata-only
//! polls do not reread unchanged cache data. Preserved project files are never
//! changed here; accepting a candidate must import a new preserved revision.
use crate::{invalid, maps, Result};
use serde::Serialize;
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

pub const STABLE_SAVE_MS: u64 = 2000;
pub const MIN_POLL_MS: u64 = 1500;
pub const MAX_RETRIES: u32 = 3;
pub const MAX_WATCHES: usize = 32;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileStamp {
    pub bytes: u64,
    pub modified_ns: u128,
    pub created_ns: Option<u128>,
}

pub fn file_stamp(path: &Path) -> Result<FileStamp> {
    crate::reject_links(path)?;
    let meta = fs::metadata(path)?;
    if !meta.is_file() || meta.len() > maps::MAX_CACHE_BYTES {
        return invalid("External map is not a regular file within the cache size limit");
    }
    Ok(FileStamp {
        bytes: meta.len(),
        modified_ns: meta
            .modified()?
            .duration_since(UNIX_EPOCH)
            .map_err(|_| {
                crate::SparkError::Invalid(
                    "External map timestamp is before the supported epoch".into(),
                )
            })?
            .as_nanos(),
        created_ns: meta
            .created()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_nanos()),
    })
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalCandidate {
    pub sha256: String,
    pub cache_version: u32,
    pub scenario_path: String,
    pub file_size: u64,
    pub matches_source: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeReport {
    pub path: PathBuf,
    pub status: String,
    pub candidate: Option<ExternalCandidate>,
    pub message: String,
}

pub struct MapChangeMonitor {
    path: PathBuf,
    source_sha256: String,
    known_sha256: String,
    cache_version: u32,
    scenario_path: String,
    observed: Option<FileStamp>,
    checked: Option<FileStamp>,
    stable_since: u64,
    last_poll: Option<u64>,
    retry_at: u64,
    retries: u32,
    candidate_stamp: Option<FileStamp>,
    content_checks: u64,
    report: ChangeReport,
}

fn hash_token(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

impl MapChangeMonitor {
    pub fn new(
        path: &Path,
        source_sha256: &str,
        cache_version: u32,
        scenario_path: &str,
        now_ms: u64,
    ) -> Result<Self> {
        if !hash_token(source_sha256) {
            return invalid("External map source identity is invalid");
        }
        crate::reject_links(path)?;
        if !path.is_absolute()
            || !path
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("map") || e.eq_ignore_ascii_case("yelo"))
        {
            return invalid("External map monitoring requires an absolute .map or .yelo path");
        }
        // Keep the selected pathname: atomic-save rename replaces its file.
        let path = path.to_path_buf();
        let report = ChangeReport {
            path: path.clone(),
            status: "watching".into(),
            candidate: None,
            message:
                "Watching the opened external map; preserved source and Spark edits are unchanged."
                    .into(),
        };
        Ok(Self {
            path,
            source_sha256: source_sha256.into(),
            known_sha256: source_sha256.into(),
            cache_version,
            scenario_path: scenario_path.replace('\\', "/").to_ascii_lowercase(),
            observed: None,
            checked: None,
            stable_since: now_ms,
            last_poll: None,
            retry_at: 0,
            retries: 0,
            candidate_stamp: None,
            content_checks: 0,
            report,
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
    pub fn source_sha256(&self) -> &str {
        &self.source_sha256
    }
    /// Number of stable-file content check attempts (not metadata polls).
    pub fn content_checks(&self) -> u64 {
        self.content_checks
    }
    /// Explicit user metadata refresh; unchanged checked stamps still bypass
    /// hashing, and a new stamp must still satisfy the stable-save debounce.
    pub fn scan_now(&mut self, now_ms: u64, resources: Option<&Path>) -> ChangeReport {
        self.last_poll = None;
        self.poll(now_ms, resources)
    }
    pub fn report(&self) -> ChangeReport {
        self.report.clone()
    }

    fn status(&mut self, state: &str, message: &str) {
        self.report.status = state.into();
        self.report.message = message.into();
        if state != "changed" {
            self.report.candidate = None;
            self.candidate_stamp = None;
        }
    }

    /// `now_ms` is a caller-owned monotonic clock. The first stable observation
    /// checks for a save that happened before watching began; later unchanged
    /// polls do not hash or parse. Failures retry with a bound, then await a new
    /// metadata stamp instead of repeatedly decoding a permanently invalid map.
    pub fn poll(&mut self, now_ms: u64, resources: Option<&Path>) -> ChangeReport {
        if self
            .last_poll
            .is_some_and(|last| now_ms.saturating_sub(last) < MIN_POLL_MS)
        {
            return self.report();
        }
        self.last_poll = Some(now_ms);
        let stamp = match file_stamp(&self.path) {
            Ok(stamp) => stamp,
            Err(_) => {
                self.observed = None;
                self.checked = None;
                self.retries = 0;
                self.status("unavailable","External map is unavailable or is being replaced. Spark keeps its preserved revision and will check again.");
                return self.report();
            }
        };
        if self.observed.as_ref() != Some(&stamp) {
            self.observed = Some(stamp);
            self.stable_since = now_ms;
            self.retry_at = 0;
            self.retries = 0;
            self.status(
                "saving",
                "An external save was detected; waiting for a stable file before inspection.",
            );
            return self.report();
        }
        if self.checked.as_ref() == Some(&stamp)
            || now_ms.saturating_sub(self.stable_since) < STABLE_SAVE_MS
            || now_ms < self.retry_at
            || self.retries >= MAX_RETRIES
        {
            return self.report();
        }
        self.content_checks += 1;
        let inspected = (|| -> Result<Option<maps::MapInspection>> {
            if stamp.bytes < 2048 {
                return invalid("External map save is incomplete");
            }
            let hash = maps::hash_file(&self.path)?;
            if file_stamp(&self.path)? != stamp {
                return invalid("External map changed while hashing");
            }
            if hash == self.known_sha256 {
                return Ok(None);
            }
            let inspection = maps::inspect_map(&self.path, resources)?;
            if inspection.sha256 != hash || file_stamp(&self.path)? != stamp {
                return invalid("External map changed during inspection");
            }
            validate_inspection(&inspection)?;
            Ok(Some(inspection))
        })();
        match inspected {
            Ok(None) => {
                self.checked = Some(stamp);
                self.status("watching","External file matches the last inspected revision. No cache reread is needed until its metadata changes.");
            }
            Ok(Some(inspection)) => {
                self.checked = Some(stamp.clone());
                self.candidate_stamp = Some(stamp.clone());
                self.report.status = "changed".into();
                self.report.message="A complete external map save is ready. Importing it creates a separate preserved source revision.".into();
                self.report.candidate = Some(ExternalCandidate {
                    sha256: inspection.sha256,
                    cache_version: inspection.header.version,
                    scenario_path: inspection.scenario_path.clone(),
                    file_size: stamp.bytes,
                    matches_source: inspection.header.version == self.cache_version
                        && inspection
                            .scenario_path
                            .replace('\\', "/")
                            .eq_ignore_ascii_case(&self.scenario_path),
                });
            }
            Err(_) => {
                self.retries += 1;
                self.retry_at = now_ms.saturating_add(STABLE_SAVE_MS * self.retries as u64);
                self.status("incomplete",if self.retries>=MAX_RETRIES{"The external save could not be validated after three attempts. Spark keeps its preserved revision; a later file change will be checked automatically."}else{"The external file is still incomplete, busy, or invalid. Spark keeps its preserved revision and will retry after the save settles."});
            }
        }
        self.report()
    }

    /// Re-read and validate the exact reported candidate before a caller imports
    /// it. New bytes or a new metadata stamp invalidate the old approval.
    pub fn validate_candidate(
        &self,
        expected_sha256: &str,
        resources: Option<&Path>,
    ) -> Result<maps::MapInspection> {
        if !hash_token(expected_sha256)
            || self.report.candidate.as_ref().map(|c| c.sha256.as_str()) != Some(expected_sha256)
        {
            return invalid("External map candidate expired; wait for a fresh stable-save check");
        }
        let stamp = self.candidate_stamp.as_ref().ok_or_else(|| {
            crate::SparkError::Invalid("External map has no stable candidate".into())
        })?;
        if &file_stamp(&self.path)? != stamp {
            return invalid("External map changed again; wait for the next stable-save check");
        }
        let inspection = maps::inspect_map(&self.path, resources)?;
        validate_inspection(&inspection)?;
        if inspection.sha256 != expected_sha256 || &file_stamp(&self.path)? != stamp {
            return invalid("External map identity changed while accepting the save");
        }
        Ok(inspection)
    }

    /// Freeze bytes for Library::import_map so a second external save cannot
    /// redirect an accepted candidate to a different revision between checks.
    /// Destination must be a fresh caller-owned staging file.
    pub fn snapshot_candidate(
        &self,
        expected_sha256: &str,
        destination: &Path,
        resources: Option<&Path>,
    ) -> Result<()> {
        self.validate_candidate(expected_sha256, resources)?;
        crate::reject_links(destination)?;
        let stamp = self.candidate_stamp.as_ref().unwrap();
        let mut input = fs::File::open(&self.path)?;
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(destination)?;
        let copied = std::io::copy(
            &mut Read::by_ref(&mut input).take(maps::MAX_CACHE_BYTES + 1),
            &mut output,
        )?;
        output.flush()?;
        output.sync_all()?;
        drop(output);
        if copied != stamp.bytes
            || &file_stamp(&self.path)? != stamp
            || maps::hash_file(destination)? != expected_sha256
        {
            return invalid(
                "External map changed while preserving the accepted save; retry after it settles",
            );
        }
        Ok(())
    }

    pub fn acknowledge(&mut self, sha256: &str) -> Result<()> {
        if self.report.candidate.as_ref().map(|c| c.sha256.as_str()) != Some(sha256) {
            return invalid("Cannot acknowledge another external revision");
        }
        self.known_sha256 = sha256.into();
        self.status("watching","External save imported as a preserved revision. Existing Spark edits and their source remain unchanged.");
        Ok(())
    }
}

fn validate_inspection(inspection: &maps::MapInspection) -> Result<()> {
    if inspection.tags.is_empty()
        || inspection.scenario_path.is_empty()
        || inspection.diagnostics.iter().any(|d| d.severity == "error")
    {
        return invalid("External map did not pass structural inspection");
    }
    Ok(())
}
