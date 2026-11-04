//! Local storage accounting/cleanup. Source data, legacy jobs and accepted
//! releases never gain cache status from a pathname. No remote tool actions.
use super::*;
use sha2::Digest;
use spark_core::storage::{self, CleanupPlan, Limits, Overview};
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Folder {
    id: String,
    label: String,
    group: &'static str,
    path: PathBuf,
    measurement: Option<storage::Measurement>,
    policy: &'static str,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Report {
    managed: Overview,
    folders: Vec<Folder>,
    cleanup: CleanupPlan,
    note: &'static str,
}
fn store(state: &AppState) -> Reply<storage::Store> {
    storage::Store::for_output(&state.root.join("jobs").join("storage-inspection")).map_err(error)
}
fn folders(state: &AppState, manager: &storage::Store) -> Reply<Vec<Folder>> {
    let mut candidates = vec![
        ("Projects & preserved originals", state.root.join("projects"), "Permanent source; never automatic cleanup"),
        ("Existing native jobs", state.root.join("jobs"), "Mixed accepted source, builds and temporary data; only explicitly owned ledger entries are eligible"),
        ("Recovered/imported tags", state.root.join("tag-exchanges"), "Recovered source dependencies; retained"),
        ("Imported archives", state.root.join("archives"), "Original archives; retained"),
    ];
    if let Some(tags) = lock(&state.settings)?.hek_tags_directory.clone() {
        candidates.push(("Shared SDK tags", tags, "Shared original input; retained"));
    }
    if let Some(root) = manager
        .root()
        .parent()
        .and_then(Path::parent)
        .filter(|root| root.join("Cargo.toml").is_file())
    {
        candidates.push((
            "Research/recovery archives",
            root.join(".local/archives"),
            "Requires content/provenance review; retained",
        ));
        candidates.push((
            "Shared Rust compiler output",
            root.join(".local/build/cargo"),
            "Compiler intermediates and accepted applications; no blanket deletion",
        ));
    }
    let mut listed: Vec<(String, PathBuf, &'static str, &'static str)> = candidates
        .into_iter()
        .map(|(label, path, policy)| (label.into(), path, policy, "spark"))
        .collect();
    listed.extend(
        runtime_connections::storage_roots(state)?
            .into_iter()
            .map(|(path, label)| {
                (
                    label,
                    path,
                    "Installed/linked Halo files; protected from Spark cleanup",
                    "halo",
                )
            }),
    );
    let mut result: Vec<Folder> = vec![];
    for (label, path, policy, group) in listed {
        if !path.is_dir() || core::reject_links(&path).is_err() {
            continue;
        }
        let path = fs::canonicalize(path).map_err(error)?;
        if let Some(existing) = result.iter_mut().find(|folder| folder.path == path) {
            if !existing.label.contains(&label) {
                existing.label.push_str(" · ");
                existing.label.push_str(&label);
            }
            if group == "halo" {
                existing.group = group;
            }
            continue;
        }
        let id = core::hex_bytes(sha2::Sha256::digest(path.to_string_lossy().as_bytes()));
        result.push(Folder {
            id,
            label,
            group,
            path,
            policy,
            measurement: None,
        });
    }
    Ok(result)
}
fn measurement_guard() -> Reply<std::sync::MutexGuard<'static, ()>> {
    static MEASUREMENT: std::sync::OnceLock<Mutex<()>> = std::sync::OnceLock::new();
    MEASUREMENT
        .get_or_init(|| Mutex::new(()))
        .try_lock()
        .map_err(|_| "Another folder is being measured. Wait for it to finish.".into())
}
fn require_no_external_writers() -> Reply<()> {
    // A compiler/editor may outlive an interrupted Spark process. Recovery is
    // accounting only, but it must not certify a moving tree for later cleanup.
    #[cfg(windows)]
    {
        let output = core::steam::command("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", "@(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -eq 'tool' -or $_.ProcessName -eq 'Baboon' -or $_.ProcessName -like 'invader-*' }).Count"])
            .output().map_err(error)?;
        if !output.status.success() || String::from_utf8_lossy(&output.stdout).trim() != "0" {
            return Err("Close native compiler/editor processes before reviewing interrupted jobs or cleaning temporary native files".into());
        }
    }
    Ok(())
}
#[tauri::command]
pub(super) async fn storage_overview(app: tauri::AppHandle) -> Reply<Report> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let manager = store(&state)?;
        Ok(Report {
            managed: manager.overview().map_err(error)?,
            folders: folders(&state, &manager)?,
            cleanup: manager.cleanup_plan().map_err(error)?,
            note: "Open a folder for measured totals. Folder totals overlap managed entries; do not add them. Allocation counts file data, not filesystem/MFT overhead. Historical/source data is preserved. GPU memory is separate from disk budgets.",
        })
    }).await.map_err(error)?
}
#[tauri::command]
pub(super) async fn storage_measure_folder(
    app: tauri::AppHandle,
    folder_id: String,
) -> Reply<Folder> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = measurement_guard()?;
        let state = app.state::<AppState>();
        let manager = store(&state)?;
        let mut folder = folders(&state, &manager)?.into_iter().find(|folder| folder.id == folder_id)
            .ok_or("Choose a current folder from Storage & Cache; arbitrary paths cannot be inspected here")?;
        folder.measurement = Some(storage::measure(&folder.path).map_err(error)?);
        Ok(folder)
    }).await.map_err(error)?
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct HaloUsage {
    folders: Vec<Folder>,
    total: storage::Measurement,
    skipped_links: usize,
    measured_at: String,
}
#[tauri::command]
pub(super) async fn storage_measure_halos(app: tauri::AppHandle) -> Reply<HaloUsage> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = measurement_guard()?;
        let state = app.state::<AppState>();
        let manager = store(&state)?;
        let mut folders: Vec<_> = folders(&state, &manager)?
            .into_iter()
            .filter(|folder| folder.group == "halo")
            .collect();
        let measurement = storage::measure_folders(
            &folders
                .iter()
                .map(|folder| folder.path.clone())
                .collect::<Vec<_>>(),
        )
        .map_err(error)?;
        for folder in &mut folders {
            folder.measurement = measurement
                .folders
                .iter()
                .find(|(path, _)| *path == folder.path)
                .map(|(_, value)| value.clone());
        }
        Ok(HaloUsage {
            folders,
            total: measurement.total,
            skipped_links: measurement.skipped_links,
            measured_at: chrono::Utc::now().to_rfc3339(),
        })
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub(super) async fn storage_set_limits(app: tauri::AppHandle, limits: Limits) -> Reply<Overview> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let manager = store(&state)?;
        manager.set_limits(&limits).map_err(error)?;
        manager.overview().map_err(error)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub(super) async fn storage_cleanup(
    app: tauri::AppHandle,
    plan: CleanupPlan,
    ids: Vec<String>,
    confirmed: bool,
) -> Reply<u64> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _source = native_operations_native::source_guard()?;
        native_operations_native::require_idle(&state)?;
        require_no_external_writers()?;
        let manager = store(&state)?;
        let actual = manager.cleanup_plan().map_err(error)?;
        if actual.token != plan.token {
            return Err("Storage changed after review. Inspect it again before cleanup.".into());
        }
        let settings = serde_json::to_value(lock(&state.settings)?.clone()).map_err(error)?;
        let library = lock(&state.library)?;
        let projects = library.list().map_err(error)?.into_iter().map(|entry| {
            serde_json::to_value(library.get(&entry.id).map_err(error)?).map_err(error)
        }).collect::<Reply<Vec<_>>>()?;
        for entry in actual.eligible.iter().filter(|e| ids.contains(&e.id)) {
            if storage::document_references_path(&settings, &entry.path)
                || library.settings_reference_path(&entry.path).map_err(error)?
                || projects.iter().any(|project| storage::document_references_path(project, &entry.path))
            {
                return Err("A saved project or tool/runtime setting still references this generated folder. Its data was retained.".into());
            }
        }
        // Hold the library lock through removal so this process cannot save a
        // new reference between the final review and the ownership checks.
        manager.cleanup(&plan, &ids, confirmed).map_err(error)
    }).await.map_err(error)?
}
#[tauri::command]
pub(super) async fn storage_recover_accounting(app: tauri::AppHandle) -> Reply<Overview> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _source = native_operations_native::source_guard()?;
        native_operations_native::require_idle(&state)?;
        require_no_external_writers()?;
        let manager = store(&state)?;
        manager.refresh_inactive().map_err(error)?;
        manager.overview().map_err(error)
    })
    .await
    .map_err(error)?
}
