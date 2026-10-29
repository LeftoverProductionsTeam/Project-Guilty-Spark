//! External editors save an original/working map; Spark imports a new immutable
//! revision after a stable-save check. No executable is launched by this module.
use super::*;
use spark_core::external_changes as changes;

pub(super) struct ExternalChangesState {
    started: Instant,
    watches: HashMap<String, Watch>,
    bindings: HashMap<(String, String), PathBuf>,
}
impl Default for ExternalChangesState {
    fn default() -> Self {
        Self {
            started: Instant::now(),
            watches: HashMap::new(),
            bindings: HashMap::new(),
        }
    }
}
struct Watch {
    owner: String,
    project_id: String,
    resources: Option<PathBuf>,
    monitor: changes::MapChangeMonitor,
    touched: Instant,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ExternalWatchReport {
    watch_id: String,
    project_id: String,
    path: PathBuf,
    status: String,
    candidate: Option<changes::ExternalCandidate>,
    message: String,
}
fn report(id: &str, watch: &Watch) -> ExternalWatchReport {
    let value = watch.monitor.report();
    ExternalWatchReport {
        watch_id: id.into(),
        project_id: watch.project_id.clone(),
        path: value.path,
        status: value.status,
        candidate: value.candidate,
        message: value.message,
    }
}
fn prune(state: &mut ExternalChangesState) {
    state
        .watches
        .retain(|_, watch| watch.touched.elapsed() < Duration::from_secs(90));
    let active: std::collections::HashSet<_> = state
        .watches
        .values()
        .map(|w| (w.owner.clone(), w.project_id.clone()))
        .collect();
    if state.bindings.len() > changes::MAX_WATCHES * 2 {
        state.bindings.retain(|key, _| active.contains(key));
    }
}

#[tauri::command]
pub(super) async fn external_map_watch_start(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
) -> Reply<ExternalWatchReport> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        check_document_owner(&state, &project_id, &owner)?;
        let project = lock(&state.library)?.get(&project_id).map_err(error)?;
        let source = project
            .source
            .as_ref()
            .ok_or("This workspace has no external map source to watch")?;
        let mut watches = lock(&state.external_changes)?;
        prune(&mut watches);
        if let Some((id, watch)) = watches
            .watches
            .iter_mut()
            .find(|(_, w)| w.owner == owner && w.project_id == project_id)
        {
            watch.touched = Instant::now();
            return Ok(report(id, watch));
        }
        if watches.watches.len() >= changes::MAX_WATCHES {
            return Err("External map monitoring is limited to 32 open maps".into());
        }
        let path = watches
            .bindings
            .get(&(owner.clone(), project_id.clone()))
            .cloned()
            .unwrap_or_else(|| source.original_path.clone());
        core::reject_links(&path).map_err(error)?;
        if path == source.preserved_path {
            return Err(
                "Preserved source copies are immutable; choose an external working map".into(),
            );
        }
        let clock = watches.started.elapsed().as_millis().min(u64::MAX as u128) as u64;
        let monitor = changes::MapChangeMonitor::new(
            &path,
            &source.sha256,
            source.cache_version,
            &source.scenario_path,
            clock,
        )
        .map_err(error)?;
        let resources = source
            .resource_directory
            .clone()
            .or_else(|| path.parent().map(Path::to_path_buf));
        let watch = Watch {
            owner,
            project_id,
            resources,
            monitor,
            touched: Instant::now(),
        };
        let id = uuid::Uuid::new_v4().to_string();
        let view = report(&id, &watch);
        watches.watches.insert(id, watch);
        Ok(view)
    })
    .await
    .map_err(error)?
}

#[tauri::command]
pub(super) async fn external_map_watch_poll(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    watch_id: String,
    force_metadata: Option<bool>,
) -> Reply<ExternalWatchReport> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut watches = lock(&state.external_changes)?;
        let clock = watches.started.elapsed().as_millis().min(u64::MAX as u128) as u64;
        let watch = watches
            .watches
            .get_mut(&watch_id)
            .ok_or("External map monitor closed; reopen its map to watch again")?;
        if watch.owner != owner {
            return Err("External map monitor belongs to another window".into());
        }
        watch.touched = Instant::now();
        if force_metadata.unwrap_or(false) {
            watch.monitor.scan_now(clock, watch.resources.as_deref());
        } else {
            watch.monitor.poll(clock, watch.resources.as_deref());
        }
        Ok(report(&watch_id, watch))
    })
    .await
    .map_err(error)?
}

/// Call from a spawn_blocking task on native WindowEvent::Destroyed as well as
/// normal JS cleanup, so a crashed WebView cannot keep file monitors alive.
pub(super) fn release_window(state: &AppState, label: &str) {
    if let Ok(mut state) = state.external_changes.lock() {
        state.watches.retain(|_, watch| watch.owner != label);
        state.bindings.retain(|(owner, _), _| owner != label);
    }
}

#[tauri::command]
pub(super) async fn external_map_watch_stop(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    watch_id: String,
) -> Reply<()> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut watches = lock(&state.external_changes)?;
        if let Some(watch) = watches.watches.get(&watch_id) {
            if watch.owner != owner {
                return Err("External map monitor belongs to another window".into());
            }
        }
        if let Some(watch) = watches.watches.remove(&watch_id) {
            watches.bindings.remove(&(watch.owner, watch.project_id));
        }
        Ok(())
    })
    .await
    .map_err(error)?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ExternalRevision {
    previous_project_id: String,
    watched_path: PathBuf,
    opened: OpenProject,
    deduplicated: bool,
}

struct Staging {
    directory: PathBuf,
    file: PathBuf,
}
impl Drop for Staging {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.file);
        let _ = fs::remove_dir(&self.directory);
    }
}

#[tauri::command]
pub(super) async fn external_map_change_import(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    watch_id: String,
    candidate_sha256: String,
) -> Reply<ExternalRevision> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut watches = lock(&state.external_changes)?;
        let watch = watches
            .watches
            .get_mut(&watch_id)
            .ok_or("External save candidate expired; reopen the map")?;
        if watch.owner != owner {
            return Err("External map monitor belongs to another window".into());
        }
        check_document_owner(&state, &watch.project_id, &owner)?;
        let previous = lock(&state.library)?
            .get(&watch.project_id)
            .map_err(error)?;
        if previous.source.as_ref().map(|s| s.sha256.as_str())
            != Some(watch.monitor.source_sha256())
        {
            return Err("The source project identity changed; reopen its monitor".into());
        }
        let staging_root = state.root.join("external-change-staging");
        core::reject_links(&staging_root).map_err(error)?;
        fs::create_dir_all(&staging_root).map_err(error)?;
        let directory = staging_root.join(uuid::Uuid::new_v4().to_string());
        fs::create_dir(&directory).map_err(error)?;
        let staging = Staging {
            file: directory.join(
                if watch
                    .monitor
                    .path()
                    .extension()
                    .is_some_and(|e| e.eq_ignore_ascii_case("yelo"))
                {
                    "revision.yelo"
                } else {
                    "revision.map"
                },
            ),
            directory,
        };
        watch
            .monitor
            .snapshot_candidate(&candidate_sha256, &staging.file, watch.resources.as_deref())
            .map_err(error)?;
        let library = lock(&state.library)?;
        let deduplicated = library
            .list()
            .map_err(error)?
            .iter()
            .any(|e| e.sha256.as_deref() == Some(&candidate_sha256));
        let (mut project, inspection) = library
            .import_map(&staging.file, watch.resources.as_deref())
            .map_err(error)?;
        if inspection.sha256 != candidate_sha256 {
            return Err(
                "Imported external revision has a different identity; no tab was replaced".into(),
            );
        }
        if !deduplicated {
            if let Some(source) = project.source.as_mut() {
                source.original_path = watch.monitor.path().to_path_buf();
            }
            project.provenance = previous.provenance.clone();
            let mut title = previous.title.clone();
            while title.len() > 170 {
                title.pop();
            }
            project.title = format!("{title} · external revision");
            library.save(&project, Some(&inspection)).map_err(error)?;
        }
        let watched_path = watch.monitor.path().to_path_buf();
        let previous_project_id = watch.project_id.clone();
        watch
            .monitor
            .acknowledge(&candidate_sha256)
            .map_err(error)?;
        watches
            .bindings
            .insert((owner, project.id.clone()), watched_path.clone());
        lock(&state.inspections)?.insert(project.id.clone(), Arc::new(inspection.clone()));
        Ok(ExternalRevision {
            previous_project_id,
            watched_path,
            opened: OpenProject {
                project,
                inspection: Some(inspection),
            },
            deduplicated,
        })
    })
    .await
    .map_err(error)?
}
