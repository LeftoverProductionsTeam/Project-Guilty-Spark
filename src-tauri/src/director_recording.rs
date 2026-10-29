//! Bounded, ordered chunks from this Director's permissioned MediaRecorder.
use super::*;
use spark_core as core;
use std::io::Write;
#[derive(Default)]
pub(super) struct RecordingState {
    files: HashMap<String, Arc<Mutex<RecordingFile>>>,
    owners: HashMap<String, String>,
}
struct RecordingFile {
    owner: String,
    project: String,
    target: PathBuf,
    partial: PathBuf,
    file: Option<fs::File>,
    sequence: u64,
    bytes: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RecordingView {
    id: String,
    path: PathBuf,
    bytes: u64,
    sha256: Option<String>,
}
#[tauri::command]
pub(super) async fn director_record_open(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
) -> Reply<Option<RecordingView>> {
    let owner = window.label().to_owned();
    director_native::validate_recorder_window(&app.state::<AppState>(), &owner, &project_id)?;
    let choice = rfd::AsyncFileDialog::new()
        .set_title("Save Director recording — choose a new WebM file")
        .add_filter("WebM video", &["webm"])
        .set_file_name("Spark-cinematic.webm")
        .save_file()
        .await;
    let Some(choice) = choice else {
        return Ok(None);
    };
    let target = choice.path().to_path_buf();
    tauri::async_runtime::spawn_blocking(move || {
        if app.get_webview_window(&owner).is_none() {
            return Err("Director closed while choosing the recording file".into());
        }
        let state = app.state::<AppState>();
        core::reject_links(&target).map_err(error)?;
        if target.exists()
            || !target
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("webm"))
        {
            return Err("Choose a new .webm filename; existing files are never overwritten".into());
        }
        let parent =
            fs::canonicalize(target.parent().ok_or("Output folder missing")?).map_err(error)?;
        let name = target.file_name().ok_or("Output filename missing")?;
        let target = parent.join(name);
        let id = uuid::Uuid::new_v4().to_string();
        let partial = parent.join(format!(".spark-recording-{id}.webm.partial"));
        let file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&partial)
            .map_err(error)?;
        let mut records = lock(&state.recordings)?;
        if records.files.len() >= 4 || records.owners.contains_key(&owner) {
            drop(file);
            let _ = fs::remove_file(&partial);
            return Err("This window already has an active recording".into());
        }
        if let Err(reason) = director_native::recording_flag(&state, &owner, &project_id, true) {
            drop(file);
            let _ = fs::remove_file(&partial);
            return Err(reason);
        }
        records.owners.insert(owner.clone(), id.clone());
        records.files.insert(
            id.clone(),
            Arc::new(Mutex::new(RecordingFile {
                owner,
                project: project_id,
                target: target.clone(),
                partial,
                file: Some(file),
                sequence: 0,
                bytes: 0,
            })),
        );
        Ok(Some(RecordingView {
            id,
            path: target,
            bytes: 0,
            sha256: None,
        }))
    })
    .await
    .map_err(error)?
}
fn append(record: &mut RecordingFile, owner: &str, sequence: u64, bytes: &[u8]) -> Reply<u64> {
    if record.owner != owner
        || record.sequence != sequence
        || bytes.is_empty()
        || bytes.len() > 256 * 1024
        || record.bytes.saturating_add(bytes.len() as u64) > 8 * 1024 * 1024 * 1024
    {
        return Err(
            "Recording owner, chunk order or storage limit failed; partial output retained".into(),
        );
    }
    record
        .file
        .as_mut()
        .ok_or("Recording already finalized")?
        .write_all(bytes)
        .map_err(error)?;
    record.bytes += bytes.len() as u64;
    record.sequence += 1;
    Ok(record.bytes)
}
#[tauri::command]
pub(super) async fn director_record_append(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: String,
    sequence: u64,
    bytes: Vec<u8>,
) -> Reply<u64> {
    let owner = window.label().to_owned();
    if bytes.len() > 256 * 1024 {
        return Err("Recording chunk exceeds 256 KiB".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let file = lock(&state.recordings)?
            .files
            .get(&id)
            .cloned()
            .ok_or("Recording is no longer active")?;
        let mut file = lock(&file)?;
        append(&mut file, &owner, sequence, &bytes)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub(super) async fn director_record_finish(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: String,
    failed: bool,
) -> Reply<RecordingView> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let entry=lock(&state.recordings)?.files.get(&id).cloned().ok_or("Recording is no longer active")?;let mut record=lock(&entry)?;if record.owner!=owner{return Err("Recording belongs to another window".into());}let result=(||{let file=record.file.take().ok_or("Recording already finalized")?;file.sync_all().map_err(error)?;drop(file);if failed||record.bytes==0{return Err(format!("Recording was interrupted or empty; partial retained: {}",record.partial.display()));}let sha=maps::hash_file(&record.partial).map_err(error)?;core::reject_links(&record.target).map_err(error)?;fs::hard_link(&record.partial,&record.target).map_err(|e|format!("Recording could not publish without overwriting a file ({e}); recoverable partial: {}",record.partial.display()))?;fs::remove_file(&record.partial).map_err(error)?;Ok(RecordingView{id:id.clone(),path:record.target.clone(),bytes:record.bytes,sha256:Some(sha)})})();let _=director_native::recording_flag(&state,&owner,&record.project,false);let mut records=lock(&state.recordings)?;records.files.remove(&id);records.owners.remove(&owner);result}).await.map_err(error)?
}
pub(super) fn release_window(state: &AppState, owner: &str) {
    let entry = if let Ok(mut records) = state.recordings.lock() {
        let id = records.owners.remove(owner);
        id.and_then(|id| records.files.remove(&id))
    } else {
        None
    };
    if let Some(entry) = entry {
        if let Ok(mut record) = entry.lock() {
            if let Some(file) = record.file.take() {
                let _ = file.sync_all();
            }
            let _ = director_native::recording_flag(state, owner, &record.project, false);
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn chunks_are_owned_ordered_bounded_and_do_not_replay() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("owned.partial");
        let mut record = RecordingFile {
            owner: "director".into(),
            project: "map".into(),
            target: temp.path().join("output.webm"),
            partial: path.clone(),
            file: Some(
                fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&path)
                    .unwrap(),
            ),
            sequence: 0,
            bytes: 0,
        };
        assert!(append(&mut record, "other", 0, b"wrong").is_err());
        assert_eq!(append(&mut record, "director", 0, b"first").unwrap(), 5);
        assert!(append(&mut record, "director", 0, b"replayed").is_err());
        assert!(append(&mut record, "director", 1, &vec![0; 256 * 1024 + 1]).is_err());
        assert_eq!(append(&mut record, "director", 1, b"next").unwrap(), 9);
        drop(record.file.take());
        assert_eq!(fs::read(path).unwrap(), b"firstnext");
    }
}
