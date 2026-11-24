use super::*;
use spark_core::{batch_edit as batch, storage};
use std::{collections::HashSet, io::Read};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Preview {
    rows: Vec<ReviewRow>,
    review_sha256: Option<String>,
    recoverable: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReviewRow {
    project_id: String,
    edit: Option<batch::Row>,
    problem: Option<String>,
}

fn saved(state: &AppState, id: &str) -> Reply<Project> {
    let library = lock(&state.library)?;
    let project = library.saved_project(id).map_err(error)?;
    if library.get(id).map_err(error)?.fingerprint().map_err(error)? != project.fingerprint().map_err(error)? {
        return Err("Save the current native edits in this map and review again".into());
    }
    Ok(project)
}

fn prepare_one(state: &AppState, id: &str, rule: &batch::Rule) -> Reply<(batch::Row, Project, Arc<MapInspection>, Toolchain)> {
    let project = saved(state, id)?;
    let inspection = inspect(state, &project)?;
    let tools = project_tools(state, &project)?;
    let (row, draft) = batch::prepare(&project, &inspection, &tools, rule).map_err(error)?;
    Ok((row, draft, inspection, tools))
}

fn validate_selection(ids: &[String], minimum: usize) -> Reply<()> {
    if !(minimum..=batch::MAX_MAPS).contains(&ids.len()) || ids.iter().collect::<HashSet<_>>().len() != ids.len() {
        return Err(format!("Select {minimum}–{} distinct saved maps", batch::MAX_MAPS));
    }
    Ok(())
}

fn prepare(state: &AppState, ids: &[String], rule: &batch::Rule) -> Reply<Preview> {
    validate_selection(ids, 2)?;
    let mut rows = Vec::new();
    let mut accepted: Vec<batch::Row> = Vec::new();
    let mut names = HashSet::new();
    for id in ids {
        let result = prepare_one(state, id, rule).and_then(|(row, _, _, _)| {
            if accepted.first().is_some_and(|first| first.kind != row.kind || first.unit != row.unit) {
                return Err("The native field type or unit differs across the selected maps".into());
            }
            if !names.insert(row.map_name.clone()) {
                return Err("Two selected maps would produce the same output filename".into());
            }
            Ok(row)
        });
        let (edit, problem) = match result {
            Ok(row) => { accepted.push(row.clone()); (Some(row), None) }
            Err(problem) => (None, Some(problem)),
        };
        rows.push(ReviewRow { project_id: id.clone(), edit, problem });
    }
    let review_sha256 = if accepted.len() == ids.len() { Some(batch::receipt_hash(rule, &accepted).map_err(error)?) } else { None };
    Ok(Preview { rows, review_sha256, recoverable: false })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FieldSearch {
    fields: Vec<FieldAvailability>,
    unreadable_maps: Vec<ReviewRow>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FieldAvailability {
    #[serde(flatten)]
    field: batch::Match,
    matching_project_ids: Vec<String>,
}

#[tauri::command]
pub(super) async fn search_batch_fields(app: tauri::AppHandle, ids: Vec<String>, query: String) -> Reply<FieldSearch> {
    validate_selection(&ids, 1)?;
    if query.len() > 192 { return Err("Search is limited to 192 bytes".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let first = inspect(&state, &saved(&state, &ids[0])?)?;
        let mut fields: Vec<_> = batch::search(&first, &query).into_iter()
            .filter(|field| field.present_in(&first.tags))
            .map(|field| FieldAvailability { field, matching_project_ids: vec![ids[0].clone()] })
            .collect();
        drop(first);
        let mut unreadable_maps = Vec::new();
        for id in &ids[1..] {
            match saved(&state, id).and_then(|project| inspect(&state, &project)) {
                Ok(map) => {
                    for result in &mut fields {
                        if result.field.present_in(&map.tags) {
                            result.matching_project_ids.push(id.clone());
                        }
                    }
                }
                Err(problem) => unreadable_maps.push(ReviewRow { project_id: id.clone(), edit: None, problem: Some(problem) }),
            }
        }
        fields.sort_by_key(|row| std::cmp::Reverse(row.matching_project_ids.len()));
        Ok(FieldSearch { fields, unreadable_maps })
    }).await.map_err(error)?
}

#[tauri::command]
pub(super) async fn preview_numeric_batch(app: tauri::AppHandle, ids: Vec<String>, rule: batch::Rule) -> Reply<Preview> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut preview = prepare(&state, &ids, &rule)?;
        if let Some(revision) = &preview.review_sha256 {
            let root = state.root.join("map-batches");
            if let Some(store) = storage::Store::existing_for_output(&root.join(".pending")).map_err(error)? {
                preview.recoverable = recovery_path(&store, &root, revision)?.is_some();
            }
        }
        Ok(preview)
    }).await.map_err(error)?
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildResult {
    project_id: String,
    status: String,
    detail: String,
    output: Option<String>,
    sha256: Option<String>,
}

const RECEIPT: &str = "receipt.json";

fn recovery_path(store: &storage::Store, root: &Path, revision: &str) -> Reply<Option<PathBuf>> {
    core::reject_links(root).map_err(error)?;
    if !root.is_dir() { return Ok(None); }
    let root = fs::canonicalize(root).map_err(error)?;
    Ok(store.overview().map_err(error)?.entries.into_iter().filter(|entry| {
        entry.category == storage::Category::Staging && entry.state == "recoverable"
            && !entry.protected && entry.source_revision.as_deref() == Some(revision)
            && entry.path.parent() == Some(root.as_path())
            && entry.path.file_name().and_then(|name| name.to_str())
                .and_then(|name| name.strip_prefix(".pending-"))
                .is_some_and(|id| uuid::Uuid::parse_str(id).is_ok_and(|uuid| uuid.to_string() == id))
    }).max_by_key(|entry| entry.modified).map(|entry| entry.path))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecoveryReceipt {
    schema_version: u8,
    review_sha256: String,
    results: Vec<BuildResult>,
}

fn read_recovery(stage: &Path, preview: &Preview, rule: &batch::Rule, revision: &str) -> Reply<Vec<BuildResult>> {
    let path = stage.join(RECEIPT);
    core::reject_links(&path).map_err(error)?;
    let file = fs::File::open(&path).map_err(error)?;
    let mut bytes = Vec::new();
    const MAX_RECEIPT: u64 = 256 * 1024;
    file.take(MAX_RECEIPT + 1).read_to_end(&mut bytes).map_err(error)?;
    if bytes.len() as u64 > MAX_RECEIPT { return Err("Batch recovery receipt exceeds its supported size".into()); }
    let receipt: RecoveryReceipt = serde_json::from_slice(&bytes).map_err(error)?;
    if receipt.schema_version != 1 || receipt.review_sha256 != revision
        || receipt.results.is_empty() || receipt.results.len() > preview.rows.len() {
        return Err("Batch recovery receipt does not match the reviewed plan".into());
    }
    let mut projects = HashSet::new();
    for result in &receipt.results {
        let row = preview.rows.iter().find(|row| row.project_id == result.project_id)
            .and_then(|row| row.edit.as_ref()).ok_or("Recovered project is absent from the reviewed plan")?;
        if result.status != "verified" || !projects.insert(&result.project_id)
            || result.output.as_deref() != Some(row.map_name.as_str()) {
            return Err("Recovered results have duplicate or unexpected map identities".into());
        }
        batch::verify_compiled(&stage.join(&row.map_name), rule, row,
            result.sha256.as_deref().ok_or("Recovered map is missing its verified hash")?).map_err(error)?;
    }
    verify_publish_inputs(stage, &receipt.results)?;
    Ok(receipt.results)
}

fn verify_publish_inputs(stage: &Path, results: &[BuildResult]) -> Reply<()> {
    let expected = results.iter().map(|row| {
        let name = row.output.as_deref().ok_or("A batch map has no staged output")?;
        let sha = row.sha256.as_deref().ok_or("A batch map has no verified checksum")?;
        Ok::<_, String>((name, sha))
    }).collect::<Reply<HashMap<_, _>>>()?;
    if expected.len() != results.len() || expected.is_empty() {
        return Err("The batch has missing or duplicate output names".into());
    }
    let mut checked = 0;
    for entry in fs::read_dir(stage).map_err(error)? {
        let entry = entry.map_err(error)?;
        let name = entry.file_name();
        if name == RECEIPT {
            core::reject_links(&entry.path()).map_err(error)?;
            if !entry.file_type().map_err(error)?.is_file() {
                return Err("Batch receipt is not a regular file".into());
            }
            continue;
        }
        let sha = name.to_str().and_then(|name| expected.get(name))
            .ok_or("An unexpected file appeared in the staged batch")?;
        core::reject_links(&entry.path()).map_err(error)?;
        if !entry.file_type().map_err(error)?.is_file() || maps::hash_file(&entry.path()).map_err(error)? != *sha {
            return Err(format!("Staged batch map changed before publication: {}", name.to_string_lossy()));
        }
        checked += 1;
    }
    if checked != expected.len() {
        return Err("A verified map is missing from the staged batch".into());
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Outcome {
    batch_id: String,
    published: bool,
    recoverable: bool,
    rows: Vec<BuildResult>,
    problem: Option<String>,
}

impl Outcome {
    fn ready_to_publish(&mut self, cancel: &AtomicBool) -> bool {
        if cancel.load(Ordering::Relaxed) {
            self.problem.get_or_insert_with(|| "Batch cancelled".into());
        }
        self.problem.is_none()
    }
}

#[tauri::command]
pub(super) async fn build_numeric_batch(
    app: tauri::AppHandle,
    ids: Vec<String>,
    rule: batch::Rule,
    review_sha256: String,
    batch_id: String,
) -> Reply<Outcome> {
    if uuid::Uuid::parse_str(&batch_id).map_err(error)?.to_string() != batch_id {
        return Err("Expected a canonical batch job UUID".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let cancel = Arc::new(AtomicBool::new(false));
        {
            let _source_guard = native_operations_native::source_guard()?;
            let mut jobs = lock(&state.jobs)?;
            if !jobs.is_empty() { return Err("Wait for the active native build or cancel it".into()); }
            jobs.insert(batch_id.clone(), cancel.clone());
        }
        let result = build(&app, &state, &batch_id, &ids, &rule, &review_sha256, cancel);
        lock(&state.jobs)?.remove(&batch_id);
        result
    }).await.map_err(error)?
}

fn build(
    app: &tauri::AppHandle,
    state: &AppState,
    batch_id: &str,
    ids: &[String],
    rule: &batch::Rule,
    review_sha256: &str,
    cancel: Arc<AtomicBool>,
) -> Reply<Outcome> {
    let preview = prepare(state, ids, rule)?;
    if preview.review_sha256.as_deref() != Some(review_sha256) {
        return Err("The saved map revision, field, tool configuration or inputs changed. Review the full batch again.".into());
    }
    let root = state.root.join("map-batches");
    let new_stage = root.join(format!(".pending-{batch_id}"));
    let destination = root.join(batch_id);
    core::reject_links(&root).map_err(error)?;
    fs::create_dir_all(&root).map_err(error)?;
    if destination.exists() || new_stage.exists() { return Err("This batch job already exists".into()); }
    let limit = ids.iter().try_fold(0u64, |bytes, id| {
        let source = saved(state, id)?.source.ok_or("A saved input is missing")?;
        let size = fs::metadata(&source.preserved_path).map_err(error)?.len();
        Ok::<_, String>(bytes.saturating_add(size.saturating_mul(2)).saturating_add(64*1024*1024))
    })?;
    if limit > 16 * 1024_u64.pow(3) { return Err("Batch output reservation exceeds 16 GiB. Select fewer maps.".into()); }
    let store = storage::Store::for_output(&new_stage).map_err(error)?;
    let reservation = storage::estimate_copy(ids.len() + 1, limit);
    let (mut lease, recovered) = if let Some(path) = recovery_path(&store, &root, review_sha256)? {
        let lease = store.resume_staging(&path, reservation, review_sha256).map_err(error)?;
        let recovered = read_recovery(&lease.owned_staging_root().map_err(error)?, &preview, rule, review_sha256)?;
        (lease, recovered)
    } else {
        let lease = store.reserve(&new_stage, None, reservation, storage::Category::Staging,
            "Multi Map Batch Editing: reviewed MCC maps and receipt").map_err(error)?;
        fs::create_dir(&new_stage).map_err(error)?;
        lease.mark_owned().map_err(error)?;
        (lease, Vec::new())
    };
    let stage = lease.owned_staging_root().map_err(error)?;
    let mut staged_bytes = recovered.iter().try_fold(0u64, |bytes, row| {
        let file = row.output.as_ref().ok_or("A recovered map has no output name")?;
        Ok::<_, String>(bytes.saturating_add(fs::metadata(stage.join(file)).map_err(error)?.len()))
    })?;
    if staged_bytes > limit { return Err("Recovered batch exceeds the reserved output budget".into()); }
    let mut outcome = Outcome { batch_id: batch_id.into(), published: false, recoverable: false, rows: Vec::new(), problem: None };
    for item in &preview.rows {
        let id = &item.project_id;
        if let Some(previous) = recovered.iter().find(|row| &row.project_id == id) {
            let mut row = previous.clone();
            row.detail = "Reused verified map after native readback".into();
            outcome.rows.push(row);
            continue;
        }
        let mut result = BuildResult { project_id: id.clone(), status: "pending".into(), detail: String::new(), output: None, sha256: None };
        if outcome.problem.is_some() || cancel.load(Ordering::Relaxed) {
            result.status = "not built".into();
            result.detail = "Batch stopped before this map began".into();
        } else {
            let attempt = (|| -> Reply<(String, String)> {
                let (row, draft, inspection, tools) = prepare_one(state, id, rule)?;
                let expected = item.edit.as_ref().ok_or("Missing reviewed edit")?;
                if batch::receipt_hash(rule, std::slice::from_ref(&row)).map_err(error)?
                    != batch::receipt_hash(rule, std::slice::from_ref(expected)).map_err(error)? {
                    return Err("This map changed after review".into());
                }
                let job_id = uuid::Uuid::new_v4().to_string();
                let jobs_root = state.root.join("jobs");
                let record = build::run_batch_map(&draft, &inspection, &tools, &jobs_root, &job_id, cancel.clone(), |mut entry| {
                    entry.job_id = batch_id.to_string();
                    event(app, entry);
                }).map_err(error)?;
                if record.status != "validated" { return Err(record.message); }
                let output = record.output.ok_or("Validated compiler output is missing")?;
                let sha = record.sha256.ok_or("Validated compiler hash is missing")?;
                let transfer = (|| -> Reply<(tempfile::NamedTempFile, u64)> {
                    if cancel.load(Ordering::Relaxed) { return Err("Cancelled before staging".into()); }
                    batch::verify_compiled(&output, rule, &row, &sha).map_err(error)?;
                    let source = fs::File::open(output).map_err(error)?;
                    let size = source.metadata().map_err(error)?.len();
                    if staged_bytes.saturating_add(size) > limit {
                        return Err("Compiled batch exceeds the reserved output budget".into());
                    }
                    let mut dest = tempfile::NamedTempFile::new_in(&stage).map_err(error)?;
                    let copied = std::io::copy(&mut source.take(size + 1), &mut dest).map_err(error)?;
                    dest.as_file().sync_all().map_err(error)?;
                    if copied != size || maps::hash_file(dest.path()).map_err(error)? != sha {
                        return Err("Staged map hash did not match native readback".into());
                    }
                    Ok((dest, size))
                })();
                let cleanup = store.dispose_completed(&jobs_root.join(job_id)).map_err(error);
                let (dest, size) = transfer?;
                cleanup?;
                dest.persist_noclobber(stage.join(&row.map_name)).map_err(error)?;
                staged_bytes += size;
                Ok((row.map_name, sha))
            })();
            match attempt {
                Ok((file, sha)) => {
                    result.status = "verified".into();
                    result.detail = "Native compile and numeric readback passed".into();
                    result.output = Some(file);
                    result.sha256 = Some(sha);
                }
                Err(problem) => {
                    result.status = if cancel.load(Ordering::Relaxed) { "cancelled".into() } else { "failed".into() };
                    result.detail = problem.clone();
                    outcome.problem = Some(problem);
                }
            }
        }
        outcome.rows.push(result);
    }
    if outcome.ready_to_publish(&cancel) {
        let verified = prepare(state, ids, rule)?;
        if verified.review_sha256.as_deref() != Some(review_sha256) {
            outcome.problem = Some("A reviewed source changed during compilation".into());
        }
    }
    if outcome.ready_to_publish(&cancel) {
        verify_publish_inputs(&lease.owned_staging_root().map_err(error)?, &outcome.rows)?;
    }
    // Cancellation and visibility share the job lock. Once publication
    // starts, cancel_build must not acknowledge a cancellation of this job.
    let mut jobs = lock(&state.jobs)?;
    if outcome.ready_to_publish(&cancel) {
        let receipt = serde_json::to_vec_pretty(&serde_json::json!({
            "schemaVersion": 1, "batchId": batch_id, "target": "mcc-cea",
            "rule": rule, "review": preview, "results": outcome.rows,
        })).map_err(error)?;
        project::atomic_write(&stage.join(RECEIPT), &receipt, false).map_err(error)?;
        lease.adopt(&destination).map_err(error)?;
        lease.finish(true, Some(review_sha256.into())).map_err(error)?;
        outcome.published = true;
        jobs.remove(batch_id);
    } else {
        drop(jobs);
        let verified: Vec<_> = outcome.rows.iter().filter(|row| row.status == "verified").cloned().collect();
        if verified.is_empty() {
            lease.finish_disposable().map_err(error)?;
        } else {
            verify_publish_inputs(&lease.owned_staging_root().map_err(error)?, &verified)?;
            let receipt = RecoveryReceipt { schema_version: 1, review_sha256: review_sha256.into(), results: verified };
            project::atomic_write(&stage.join(RECEIPT), &serde_json::to_vec(&receipt).map_err(error)?, false).map_err(error)?;
            lease.finish_recoverable(review_sha256.into()).map_err(error)?;
            outcome.recoverable = true;
        }
    }
    Ok(outcome)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancellation_blocks_publication_of_an_incomplete_batch() {
        let cancel = AtomicBool::new(false);
        let mut outcome = Outcome {
            batch_id: "batch".into(),
            published: false,
            recoverable: false,
            rows: vec![BuildResult {
                project_id: "b30".into(),
                status: "not built".into(),
                detail: "Batch stopped before this map began".into(),
                output: None,
                sha256: None,
            }],
            problem: None,
        };
        assert!(outcome.ready_to_publish(&cancel));
        cancel.store(true, Ordering::Relaxed);
        assert!(!outcome.ready_to_publish(&cancel));
        assert_eq!(outcome.problem.as_deref(), Some("Batch cancelled"));
        assert_eq!(outcome.rows[0].status, "not built");
        assert!(!outcome.published);

        outcome.problem = Some("Compiler returned a diagnostic".into());
        assert!(!outcome.ready_to_publish(&cancel));
        assert_eq!(outcome.problem.as_deref(), Some("Compiler returned a diagnostic"));
    }

    #[test]
    fn publication_rechecks_every_payload_and_rejects_unexpected_content() {
        let root = tempfile::tempdir().unwrap();
        let results = ["a10.map", "b30.map"].map(|name| {
            let path = root.path().join(name);
            fs::write(&path, name.as_bytes()).unwrap();
            BuildResult {
                project_id: name.into(),
                status: "verified".into(),
                detail: String::new(),
                output: Some(name.into()),
                sha256: Some(maps::hash_file(&path).unwrap()),
            }
        });
        verify_publish_inputs(root.path(), &results).unwrap();

        let b30 = root.path().join("b30.map");
        fs::write(&b30, b"changed bytes").unwrap();
        assert!(verify_publish_inputs(root.path(), &results).unwrap_err().contains("changed"));
        fs::remove_file(&b30).unwrap();
        assert!(verify_publish_inputs(root.path(), &results).unwrap_err().contains("missing"));
        fs::write(&b30, b"b30.map").unwrap();
        fs::write(root.path().join("other.map"), b"unreviewed").unwrap();
        assert!(verify_publish_inputs(root.path(), &results).unwrap_err().contains("unexpected"));
    }
}
