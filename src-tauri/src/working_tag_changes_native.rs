//! Window-owned, read-only watches for validated derived tool workspaces.
use super::*;
use notify::Watcher;
use spark_core::working_tag_changes::{Hashes, TagChangeMonitor, TagChanges};
const MAX_WATCHES: usize = 8;
#[derive(Default)]
pub(super) struct WorkingTagChangesState {
    watches: HashMap<String, Arc<Mutex<Watch>>>,
}
struct Watch {
    owner: String,
    project: String,
    build: String,
    fingerprint: String,
    monitor: TagChangeMonitor,
    _native: notify::RecommendedWatcher,
    dirty: Arc<AtomicBool>,
    resync: Arc<AtomicBool>,
    started: Instant,
    scanned: Instant,
    touched: Instant,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WatchReport {
    watch_id: String,
    project_id: String,
    build_id: String,
    tags_directory: PathBuf,
    #[serde(flatten)]
    changes: TagChanges,
}
fn report(id: &str, watch: &Watch) -> WatchReport {
    WatchReport {
        watch_id: id.into(),
        project_id: watch.project.clone(),
        build_id: watch.build.clone(),
        tags_directory: watch.monitor.root().to_path_buf(),
        changes: watch.monitor.report(),
    }
}
fn baseline(job: &Path) -> Reply<Option<Hashes>> {
    let file = job.join("working-tags-receipt.json");
    if !file.is_file() {
        return Ok(None);
    }
    let receipt: core::working_tags::WorkingTagsReceipt =
        serde_json::from_slice(&bounded_read(&file, 4 * 1024 * 1024)?).map_err(error)?;
    let manifest = receipt
        .final_tag_hashes
        .ok_or("Working build has no final tag inventory")?;
    let relative = core::safe_relative(&manifest.relative_path).map_err(error)?;
    if relative.components().count() != 1
        || manifest.file_count > core::working_tag_changes::MAX_FILES
    {
        return Err("Working tag inventory is outside monitoring limits".into());
    }
    let path = job.join(relative);
    core::reject_links(&path).map_err(error)?;
    let bytes = bounded_read(&path, 4 * 1024 * 1024)?;
    use sha2::Digest;
    if format!("{:x}", sha2::Sha256::digest(&bytes)) != manifest.sha256 {
        return Err("Compiled working tag inventory was changed; restore its original receipt before monitoring".into());
    }
    let hashes: Hashes = serde_json::from_slice(&bytes).map_err(error)?;
    core::working_tag_changes::validate_baseline(&hashes).map_err(error)?;
    if hashes.len() != manifest.file_count {
        return Err("Compiled working tag inventory count changed".into());
    }
    Ok(Some(hashes))
}
fn observe(root: &Path) -> Reply<(notify::RecommendedWatcher, Arc<AtomicBool>, Arc<AtomicBool>)> {
    let dirty = Arc::new(AtomicBool::new(false));
    let resync = Arc::new(AtomicBool::new(false));
    let signal = dirty.clone();
    let lost = resync.clone();
    let mut watcher =
        notify::recommended_watcher(move |event: notify::Result<notify::Event>| match event {
            Ok(event) if !event.kind.is_access() => {
                signal.store(true, Ordering::Release);
            }
            Err(_) => {
                lost.store(true, Ordering::Release);
                signal.store(true, Ordering::Release);
            }
            _ => {}
        })
        .map_err(error)?;
    watcher
        .watch(root, notify::RecursiveMode::Recursive)
        .map_err(error)?;
    Ok((watcher, dirty, resync))
}
fn get_watch(state: &AppState, id: &str, owner: &str) -> Reply<Arc<Mutex<Watch>>> {
    let watch = lock(&state.working_tag_changes)?
        .watches
        .get(id)
        .cloned()
        .ok_or("Working tag watch expired; reconnect it")?;
    if lock(&watch)?.owner != owner {
        return Err("Working tag watch belongs to another window".into());
    }
    Ok(watch)
}
pub(super) fn release_window(state: &AppState, owner: &str) {
    if let Ok(mut watches) = state.working_tag_changes.lock() {
        watches
            .watches
            .retain(|_, watch| watch.lock().is_ok_and(|w| w.owner != owner));
    }
}
#[tauri::command]
pub(super) async fn working_tag_watch_start(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
) -> Reply<WatchReport> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        check_document_owner(&state, &project_id, &owner)?;
        let project = lock(&state.library)?.get(&project_id).map_err(error)?;
        let fingerprint = project.fingerprint().map_err(error)?;
        let build = current_build(&state, &project)?;
        let tags = runtime_workbench::compiled_tags(&state, &project, &build)?;
        {
            let mut registry = lock(&state.working_tag_changes)?;
            registry.watches.retain(|_, watch| {
                watch
                    .lock()
                    .is_ok_and(|w| w.touched.elapsed() < Duration::from_secs(120))
            });
            for (id, watch) in &registry.watches {
                let mut w = lock(watch)?;
                if w.owner == owner
                    && w.project == project_id
                    && w.build == build.id
                    && w.fingerprint == fingerprint
                {
                    w.touched = Instant::now();
                    return Ok(report(id, &w));
                }
            }
            if registry.watches.len() >= MAX_WATCHES {
                return Err("Working tag monitoring supports eight active map windows".into());
            }
        }
        // Subscribe first: writes during the baseline read cause a stable-save retry.
        let (native, dirty, resync) = observe(&tags)?;
        let monitor =
            TagChangeMonitor::new(&tags, baseline(&state.root.join("jobs").join(&build.id))?)
                .map_err(error)?;
        check_document_owner(&state, &project_id, &owner)?;
        if app.get_webview_window(&owner).is_none()
            || lock(&state.library)?
                .get(&project_id)
                .map_err(error)?
                .fingerprint()
                .map_err(error)?
                != fingerprint
        {
            return Err("Map changed while connecting tool-save monitoring; reconnect it".into());
        }
        let watch = Watch {
            owner,
            project: project_id,
            build: build.id,
            fingerprint,
            monitor,
            _native: native,
            dirty,
            resync,
            started: Instant::now(),
            scanned: Instant::now(),
            touched: Instant::now(),
        };
        let id = uuid::Uuid::new_v4().to_string();
        let result = report(&id, &watch);
        let mut registry = lock(&state.working_tag_changes)?;
        // A second caller may have connected while this baseline was read.
        for (existing_id,existing) in &registry.watches {
            let mut connected=lock(existing)?;
            if connected.owner==watch.owner&&connected.project==watch.project&&connected.build==watch.build&&connected.fingerprint==watch.fingerprint {
                connected.touched=Instant::now();return Ok(report(existing_id,&connected));
            }
        }
        if registry.watches.len() >= MAX_WATCHES {
            return Err("Working tag monitoring supports eight active map windows".into());
        }
        registry.watches.insert(id, Arc::new(Mutex::new(watch)));
        Ok(result)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub(super) async fn working_tag_watch_poll(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    watch_id: String,
    force: bool,
) -> Reply<WatchReport> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let watched = get_watch(&state, &watch_id, &owner)?;
        // Do not hold the registry mutex over file I/O or hashing.
        let mut watch = lock(&watched)?;
        check_document_owner(&state, &watch.project, &owner)?;
        if lock(&state.library)?
            .get(&watch.project)
            .map_err(error)?
            .fingerprint()
            .map_err(error)?
            != watch.fingerprint
        {
            return Err(
                "Saved map changed; reconnect working tag monitoring to its current build".into(),
            );
        }
        watch.touched = Instant::now();
        let scan = force
            || watch.dirty.swap(false, Ordering::AcqRel)
            || watch.scanned.elapsed() > Duration::from_secs(30)
            || watch.monitor.report().status == "saving";
        if scan {
            let now = watch.started.elapsed().as_millis().min(u64::MAX as u128) as u64;
            let rehash = force || watch.resync.swap(false, Ordering::AcqRel);
            watch.monitor.scan(now, rehash).map_err(error)?;
            watch.scanned = Instant::now();
        }
        Ok(report(&watch_id, &watch))
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub(super) async fn working_tag_watch_stop(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    watch_id: String,
) -> Reply<()> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        get_watch(&state, &watch_id, &owner)?;
        lock(&state.working_tag_changes)?.watches.remove(&watch_id);
        Ok(())
    })
    .await
    .map_err(error)?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_notification_observes_an_actual_file_save() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.weapon");
        fs::write(&path, b"original").unwrap();
        let (_watch, dirty, _resync) = observe(dir.path()).unwrap();
        fs::write(path, b"saved-changed").unwrap();
        let deadline = Instant::now() + Duration::from_secs(4);
        while !dirty.load(Ordering::Acquire) && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(
            dirty.load(Ordering::Acquire),
            "native filesystem event was not observed"
        );
    }
    #[test]
    fn compiled_inventory_cannot_be_replaced_or_escape_its_job() {
        let dir = tempfile::tempdir().unwrap();
        assert!(baseline(dir.path()).unwrap().is_none());
        let tags = Hashes::from([("test.weapon".into(), "a".repeat(64))]);
        let bytes = serde_json::to_vec(&tags).unwrap();
        fs::write(dir.path().join("inventory.json"), &bytes).unwrap();
        let mut receipt = serde_json::json!({"schemaVersion":1,"jobId":"job","projectId":"map","projectFingerprint":"fingerprint","parentBuildId":"parent","parentOutputSha256":"a".repeat(64),"scenarioPath":"levels/test","scenarioType":1,"workspace":dir.path(),"tagsDirectory":dir.path(),"inputTagHashes":null,"finalTagHashes":{"relativePath":"inventory.json","sha256":maps::hash_file(&dir.path().join("inventory.json")).unwrap(),"fileCount":1},"toolIdentities":{},"status":"validated","build":null});
        let path = dir.path().join("working-tags-receipt.json");
        fs::write(&path, serde_json::to_vec(&receipt).unwrap()).unwrap();
        assert_eq!(baseline(dir.path()).unwrap().unwrap(), tags);
        fs::write(dir.path().join("inventory.json"), b"{}").unwrap();
        assert!(baseline(dir.path()).is_err());
        receipt["finalTagHashes"]["relativePath"] = "../inventory.json".into();
        fs::write(path, serde_json::to_vec(&receipt).unwrap()).unwrap();
        assert!(baseline(dir.path()).is_err());
    }
}
