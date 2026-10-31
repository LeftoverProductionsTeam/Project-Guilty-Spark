//! Bounded, on-demand map discovery. Discovery never copies or decodes map payloads.
use super::*;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Candidate {
    id: String,
    name: String,
    location: String,
    cache_version: Option<u32>,
    engine: String,
    archive: bool,
    bytes: u64,
    #[serde(skip)]
    path: PathBuf,
    #[serde(skip)]
    modified: Option<std::time::SystemTime>,
}
#[derive(Default)]
pub(super) struct Catalog {
    rows: BTreeMap<String, Candidate>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Inventory {
    maps: Vec<Candidate>,
    notices: Vec<String>,
    elapsed_ms: u64,
}
fn scan(roots: &[(PathBuf, String, usize)]) -> Inventory {
    let began = Instant::now();
    let mut result = Inventory {
        maps: vec![],
        notices: vec![],
        elapsed_ms: 0,
    };
    let mut seen = BTreeSet::new();
    let mut visited = 0usize;
    let mut entries = 0usize;
    'roots: for (root, label, depth) in roots {
        if !root.is_dir() {
            continue;
        }
        let mut pending = vec![(root.clone(), 0usize)];
        while let Some((folder, level)) = pending.pop() {
            if core::reject_links(&folder).is_err() {
                continue;
            }
            let Ok(canonical) = fs::canonicalize(&folder) else {
                continue;
            };
            if !seen.insert(canonical.to_string_lossy().to_ascii_lowercase()) {
                continue;
            }
            visited += 1;
            if visited > 2048
                || entries > 20000
                || result.maps.len() >= 1024
                || began.elapsed() > Duration::from_secs(12)
            {
                result.notices.push("Discovery reached its bounded scan limit. Link a more specific folder to see additional maps.".into());
                break 'roots;
            }
            let Ok(children) = fs::read_dir(&folder) else {
                continue;
            };
            for entry in children.flatten() {
                entries += 1;
                if entries > 20000 {
                    break;
                }
                let path = entry.path();
                if core::reject_links(&path).is_err() {
                    continue;
                }
                let Ok(meta) = entry.metadata() else {
                    continue;
                };
                if meta.is_dir() {
                    if level < *depth && pending.len() < 2048 {
                        pending.push((path, level + 1));
                    }
                    continue;
                }
                if !meta.is_file() || meta.len() > 2 * 1024 * 1024 * 1024 {
                    continue;
                }
                let ext = path
                    .extension()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_ascii_lowercase();
                if !["map", "yelo", "zip"].contains(&ext.as_str()) {
                    continue;
                }
                let archive = ext == "zip";
                let header = if archive {
                    None
                } else {
                    match maps::inspect_header(&path) {
                        Ok(h) if !h.name.is_empty() => Some(h),
                        _ => continue,
                    }
                };
                let Ok(canonical) = fs::canonicalize(&path) else {
                    continue;
                };
                let id = spark_core::hex_bytes(Sha256::digest(canonical.to_string_lossy().to_ascii_lowercase().as_bytes()));
                result.maps.push(Candidate {
                    id,
                    name: path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into_owned(),
                    location: label.clone(),
                    cache_version: header.as_ref().map(|h| h.version),
                    engine: header
                        .map(|h| h.engine)
                        .unwrap_or_else(|| "ZIP archive".into()),
                    archive,
                    bytes: meta.len(),
                    path: canonical,
                    modified: meta.modified().ok(),
                });
            }
        }
    }
    result
        .maps
        .sort_by(|a, b| (&a.location, &a.name).cmp(&(&b.location, &b.name)));
    result.maps.dedup_by(|a, b| a.id == b.id);
    result.elapsed_ms = began.elapsed().as_millis() as u64;
    result
}
fn roots(state: &AppState) -> Reply<Vec<(PathBuf, String, usize)>> {
    let installation = lock(&state.installation)?.clone();
    let library = lock(&state.library)?;
    let registrations: Vec<runtime::RuntimeRegistration> =
        library.setting("runtimeRegistrations").map_err(error)?;
    let linked: Vec<PathBuf> = library.setting("assetSourceFolders").map_err(error)?;
    let mut roots = vec![(state.root.join("inbox"), "Spark downloads".into(), 3)];
    if let Some(mcc) = installation.mcc_path {
        roots.push((mcc.join("halo1/maps"), "MCC Halo 1".into(), 1));
    }
    for registration in registrations {
        roots.push((
            registration.data_root.unwrap_or(registration.root),
            registration.runtime_id.name().into(),
            3,
        ));
    }
    for folder in linked.into_iter().take(16) {
        roots.push((
            folder.clone(),
            format!(
                "Linked · {}",
                folder.file_name().unwrap_or_default().to_string_lossy()
            ),
            3,
        ));
    }
    if let Some(profile) = std::env::var_os("USERPROFILE") {
        roots.push((
            PathBuf::from(profile).join("Downloads"),
            "Downloads".into(),
            3,
        ));
    }
    for entry in library.list().map_err(error)? {
        if let Ok(project) = library.get(&entry.id) {
            if let Some(source) = project.source {
                if let Some(parent) = source.original_path.parent() {
                    roots.push((parent.to_path_buf(), "Linked map folder".into(), 0));
                }
            }
        }
    }
    drop(library);
    // Portable installations next to Spark are common; never recursively scan the drive.
    for start in [
        std::env::current_dir().ok(),
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(Path::to_path_buf)),
    ]
    .into_iter()
    .flatten()
    {
        for parent in start.ancestors().take(8) {
            let ce = parent.join("Halo Custom Edition");
            if ce.join("haloce.exe").is_file() {
                roots.push((ce.join("maps"), "Halo Custom Edition".into(), 1));
            }
        }
    }
    Ok(roots)
}
#[tauri::command]
pub(super) async fn discover_asset_sources(app: tauri::AppHandle) -> Reply<Inventory> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        state.startup.wait()?;
        let found = scan(&roots(&state)?);
        lock(&state.asset_sources)?.rows = found
            .maps
            .iter()
            .map(|c| (c.id.clone(), c.clone()))
            .collect();
        Ok(found)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub(super) async fn link_asset_source_folder(app: tauri::AppHandle) -> Reply<Option<Inventory>> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(folder) = rfd::FileDialog::new()
            .set_title("Link a Halo maps or downloads folder")
            .pick_folder()
        else {
            return Ok(None);
        };
        core::reject_links(&folder).map_err(error)?;
        let state = app.state::<AppState>();
        {
            let library = lock(&state.library)?;
            let mut linked: Vec<PathBuf> = library.setting("assetSourceFolders").map_err(error)?;
            if !linked.contains(&folder) {
                if linked.len() >= 16 {
                    return Err("The linked folder limit is 16".into());
                }
                linked.push(folder);
            }
            library
                .set_setting("assetSourceFolders", &linked)
                .map_err(error)?;
        }
        let found = scan(&roots(&state)?);
        lock(&state.asset_sources)?.rows = found
            .maps
            .iter()
            .map(|c| (c.id.clone(), c.clone()))
            .collect();
        Ok(Some(found))
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub(super) async fn open_asset_source(
    app: tauri::AppHandle,
    source_id: String,
) -> Reply<Vec<OpenProject>> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let candidate = lock(&state.asset_sources)?
            .rows
            .get(&source_id)
            .cloned()
            .ok_or("Refresh asset sources before opening this map")?;
        core::reject_links(&candidate.path).map_err(error)?;
        let meta = fs::metadata(&candidate.path).map_err(error)?;
        if meta.len() != candidate.bytes || meta.modified().ok() != candidate.modified {
            return Err(
                "The discovered file changed; refresh asset sources before importing it".into(),
            );
        }
        if candidate.archive {
            return import_file(&state, &candidate.path);
        }
        // A map's adjacent resources take precedence over unrelated global preferences.
        let (project, inspection) = lock(&state.library)?
            .import_map(&candidate.path, candidate.path.parent())
            .map_err(error)?;
        lock(&state.inspections)?.insert(project.id.clone(), Arc::new(inspection.clone()));
        Ok(vec![OpenProject {
            project,
            inspection: Some(inspection),
        }])
    })
    .await
    .map_err(error)?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn discovery_is_header_only_bounded_and_excludes_shared_resources_and_executables() {
        let folder = tempfile::tempdir().unwrap();
        fs::write(folder.path().join("setup.exe"), b"MZ").unwrap();
        fs::write(folder.path().join("broken.map"), b"not a cache").unwrap();
        fs::write(folder.path().join("mod.zip"), b"not opened until selected").unwrap();
        let found = scan(&[(folder.path().to_path_buf(), "Selected".into(), 0)]);
        assert_eq!(found.maps.len(), 1);
        assert!(found.maps[0].archive);
        assert_eq!(found.maps[0].location, "Selected");
    }
}

pub(super) fn default_material_map(
    state: &AppState,
    runtime: runtime::RuntimeId,
) -> Reply<PathBuf> {
    let version=match runtime {runtime::RuntimeId::MccSteam=>13,runtime::RuntimeId::HaloCustomEdition=>609,runtime::RuntimeId::HaloPc=>7,_=>return Err("Default native source materials need a compatible MCC, CE or PC source map. Link the matching runtime's map folder.".into())};
    let found = scan(&roots(state)?);
    found
        .maps
        .into_iter()
        .find(|c| c.cache_version == Some(version) && c.name.eq_ignore_ascii_case("bloodgulch.map"))
        .map(|c| c.path)
        .ok_or(
            "Link this runtime’s owned Blood Gulch map to supply its exact grass and metal shaders"
                .into(),
        )
}
