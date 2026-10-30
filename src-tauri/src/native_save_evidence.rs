//! Filesystem notifications identify changed paths, not the process that wrote
//! them. Preserve launch associations without promoting them to blame.
use super::core::working_tag_changes::TagChangeMonitor;
use super::*;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ToolAssociation {
    pub tool: String,
    pub version: String,
    pub executable: PathBuf,
    pub executable_sha256: String,
    pub process_id: Option<u32>,
    pub basis: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FileEvidence {
    path: String,
    kind: String,
    previous_sha256: Option<String>,
    observed_sha256: Option<String>,
    bytes: Option<u64>,
    modified_unix_ms: Option<u64>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SaveEvidence {
    observed_at: String,
    revision: u64,
    writer_confidence: &'static str,
    explanation: &'static str,
    associations: Vec<ToolAssociation>,
    files: Vec<FileEvidence>,
    list_truncated: bool,
}
pub(super) fn collect(
    monitor: &TagChangeMonitor,
    associations: Vec<ToolAssociation>,
) -> SaveEvidence {
    let report = monitor.report();
    let files = report
        .changes
        .into_iter()
        .map(|change| {
            let path = monitor.root().join(&change.path);
            let meta = core::reject_links(&path)
                .ok()
                .and_then(|_| fs::metadata(path).ok());
            FileEvidence {
                previous_sha256: monitor.baseline_hashes().get(&change.path).cloned(),
                observed_sha256: monitor.accepted_hashes().get(&change.path).cloned(),
                bytes: meta.as_ref().map(|m| m.len()),
                modified_unix_ms: meta
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis().min(u64::MAX as u128) as u64),
                path: change.path,
                kind: change.kind,
            }
        })
        .collect();
    SaveEvidence {
        observed_at: chrono::Utc::now().to_rfc3339(), revision: report.revision,
        writer_confidence: "unknown",
        explanation: "Tool associations describe a prepared handoff or Spark-observed launch, not a confirmed file writer. Filesystem events contain no writer PID; a read-only validator is not the writer. Hashes describe the last stable observation, while file metadata may reflect a newer save.",
        associations, files, list_truncated: report.list_truncated,
    }
}
