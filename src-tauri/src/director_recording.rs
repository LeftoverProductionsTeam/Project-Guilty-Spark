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
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RecordingView {
    id: String,
    path: PathBuf,
    bytes: u64,
    sha256: Option<String>,
}
fn recording_name(name: &str) -> Reply<()> {
    // Apply the shared component rules without imposing Halo tag paths' UTF-8
    // byte cap on Unicode media filenames. Controls remain controls for admission.
    let component:String=name.chars().map(|c|if c.is_ascii()||c.is_control(){c}else{'x'}).collect();
    let relative = core::safe_relative(&component).map_err(error)?;
    if name.encode_utf16().count() > 160
        || relative.components().count() != 1
        || !Path::new(name)
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("webm"))
    {
        return Err("Use a single new .webm filename, up to 160 characters".into());
    }
    Ok(())
}
fn recording_target(target: &Path) -> Reply<PathBuf> {
    if !target.is_absolute() {
        return Err("Choose an absolute recording folder that already exists".into());
    }
    recording_name(
        target
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or("Recording filename is invalid")?,
    )?;
    core::reject_links(target).map_err(error)?;
    if target.exists() {
        return Err("Choose a new .webm filename; existing files are never overwritten".into());
    }
    let parent =
        fs::canonicalize(target.parent().ok_or("Output folder missing")?).map_err(error)?;
    if !parent.is_dir() {
        return Err("Choose an existing recording folder".into());
    }
    Ok(parent.join(target.file_name().ok_or("Output filename missing")?))
}
#[tauri::command]
pub(super) async fn director_record_open(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    output_directory: Option<String>,
    file_name: Option<String>,
) -> Reply<Option<RecordingView>> {
    let owner = window.label().to_owned();
    director_native::validate_recorder_window(&app.state::<AppState>(), &owner, &project_id)?;
    let name = file_name.as_deref().unwrap_or("Spark-cinematic.webm");
    recording_name(name)?;
    let target = if let Some(folder) = output_directory.filter(|folder| !folder.trim().is_empty()) {
        let folder = Path::new(&folder);
        if !folder.is_absolute() || folder.as_os_str().len() > 4096 {
            return Err(
                "Enter an absolute recording folder, or leave it empty to choose a file".into(),
            );
        }
        folder.join(name)
    } else {
        let choice = rfd::AsyncFileDialog::new()
            .set_title("Save Director recording — choose a new WebM file")
            .add_filter("WebM video", &["webm"])
            .set_file_name(name)
            .save_file()
            .await;
        let Some(choice) = choice else {
            return Ok(None);
        };
        choice.path().to_path_buf()
    };
    tauri::async_runtime::spawn_blocking(move || {
        if app.get_webview_window(&owner).is_none() {
            return Err("Director closed while choosing the recording file".into());
        }
        let state = app.state::<AppState>();
        let target = recording_target(&target)?;
        let parent = target.parent().ok_or("Output folder missing")?;
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
fn finish_record(record: &mut RecordingFile, id: &str, failed: bool) -> Reply<RecordingView> {
    let file = record.file.take().ok_or("Recording already finalized")?;
    file.sync_all().map_err(error)?;
    drop(file);
    core::reject_links(&record.partial).map_err(error)?;
    let metadata = fs::metadata(&record.partial).map_err(error)?;
    if !metadata.is_file() || metadata.len() != record.bytes {
        return Err(format!(
            "Recording storage length changed; partial retained: {}",
            record.partial.display()
        ));
    }
    if record.bytes == 0 {
        fs::remove_file(&record.partial).map_err(error)?;
        return Err("Recording cancelled before video was written. No file was saved.".into());
    }
    if failed {
        return Err(format!(
            "Recording was interrupted; partial retained: {}",
            record.partial.display()
        ));
    }
    let sha = maps::hash_file(&record.partial).map_err(error)?;
    core::reject_links(&record.target).map_err(error)?;
    fs::hard_link(&record.partial, &record.target).map_err(|e| {
        format!(
            "Recording could not publish without overwriting a file ({e}); recoverable partial: {}",
            record.partial.display()
        )
    })?;
    fs::remove_file(&record.partial).map_err(error)?;
    Ok(RecordingView {
        id: id.into(),
        path: record.target.clone(),
        bytes: record.bytes,
        sha256: Some(sha),
    })
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
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let entry = lock(&state.recordings)?
            .files
            .get(&id)
            .cloned()
            .ok_or("Recording is no longer active")?;
        let mut record = lock(&entry)?;
        if record.owner != owner {
            return Err("Recording belongs to another window".into());
        }
        let result = finish_record(&mut record, &id, failed);
        let _ = director_native::recording_flag(&state, &owner, &record.project, false);
        let mut records = lock(&state.recordings)?;
        records.files.remove(&id);
        records.owners.remove(&owner);
        result
    })
    .await
    .map_err(error)?
}
pub(super) fn release_window(state: &AppState, owner: &str) {
    let entry = if let Ok(mut records) = state.recordings.lock() {
        let id = records.owners.remove(owner);
        id.and_then(|id| records.files.remove(&id).map(|file| (id, file)))
    } else {
        None
    };
    if let Some((id, entry)) = entry {
        if let Ok(mut record) = entry.lock() {
            if record.file.is_some() {
                let _ = finish_record(&mut record, &id, true);
            }
            let _ = director_native::recording_flag(state, owner, &record.project, false);
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn owned_record(root: &Path) -> RecordingFile {
        let partial = root.join("owned.partial");
        RecordingFile {
            owner: "director".into(),
            project: "map".into(),
            target: root.join("take.webm"),
            file: Some(
                fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&partial)
                    .unwrap(),
            ),
            partial,
            sequence: 0,
            bytes: 0,
        }
    }
    #[test]
    fn explicit_targets_require_new_safe_names_in_existing_absolute_folders() {
        let temp = tempfile::tempdir().unwrap();
        assert!(recording_target(&temp.path().join("new.webm")).is_ok());
        assert!(recording_name(&format!("{}.webm","映画".repeat(40))).is_ok());
        assert!(recording_target(Path::new("relative.webm")).is_err());
        assert!(recording_target(&temp.path().join("missing/new.webm")).is_err());
        for name in [
            "../escape.webm",
            "nested/take.webm",
            "take.map",
            "NUL.webm",
            "take:stream.webm",
            "take.webm ",
        ] {
            assert!(recording_name(name).is_err(), "{name}");
        }
        let existing = temp.path().join("existing.webm");
        fs::write(&existing, b"original take").unwrap();
        assert!(recording_target(&existing).is_err());
        assert_eq!(fs::read(existing).unwrap(), b"original take");
    }
    #[test]
    fn successful_recordings_publish_exact_bytes_and_hash_and_remove_only_the_owned_partial() {
        let temp = tempfile::tempdir().unwrap();
        let mut record = owned_record(temp.path());
        append(&mut record, "director", 0, b"first sample").unwrap();
        append(&mut record, "director", 1, b" second").unwrap();
        let view = finish_record(&mut record, "id", false).unwrap();
        assert_eq!(fs::read(&view.path).unwrap(), b"first sample second");
        assert_eq!(view.bytes, 19);
        assert_eq!(view.sha256.unwrap(), maps::hash_file(&view.path).unwrap());
        assert!(!record.partial.exists());
        assert!(finish_record(&mut record, "id", false).is_err());
    }
    #[test]
    fn countdown_cancellation_removes_only_an_empty_owned_reservation() {
        let temp = tempfile::tempdir().unwrap();
        let mut record = owned_record(temp.path());
        fs::write(temp.path().join("keep.webm"), b"keep").unwrap();
        assert!(finish_record(&mut record, "id", true)
            .unwrap_err()
            .contains("No file was saved"));
        assert!(!record.partial.exists());
        assert!(!record.target.exists());
        assert_eq!(fs::read(temp.path().join("keep.webm")).unwrap(), b"keep");
    }
    #[test]
    fn interrupted_or_changed_nonempty_files_are_retained_without_publishing() {
        let temp = tempfile::tempdir().unwrap();
        let mut record = owned_record(temp.path());
        append(&mut record, "director", 0, b"recover").unwrap();
        assert!(finish_record(&mut record, "id", true).is_err());
        assert_eq!(fs::read(&record.partial).unwrap(), b"recover");
        assert!(!record.target.exists());
        let other = tempfile::tempdir().unwrap();
        let mut changed = owned_record(other.path());
        fs::write(&changed.partial, b"external bytes").unwrap();
        assert!(finish_record(&mut changed, "id", true)
            .unwrap_err()
            .contains("length changed"));
        assert_eq!(fs::read(changed.partial).unwrap(), b"external bytes");
    }
    #[test]
    fn a_destination_created_during_capture_is_never_overwritten() {
        let temp = tempfile::tempdir().unwrap();
        let mut record = owned_record(temp.path());
        append(&mut record, "director", 0, b"new take").unwrap();
        fs::write(&record.target, b"keep existing").unwrap();
        assert!(finish_record(&mut record, "id", false).is_err());
        assert_eq!(fs::read(record.target).unwrap(), b"keep existing");
        assert_eq!(fs::read(record.partial).unwrap(), b"new take");
    }
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
