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
    roots.extend(runtime_connections::owned_map_roots(state)?.into_iter().map(|(path,label)|(path,label,1)));
    Ok(roots)
}
/// One installed copy per stock campaign, preferring recoverable embedded
/// Xbox audio. No drive-wide search, download, game launch or original writes.
pub(super) fn home_voice_sources(state:&AppState)->Reply<Vec<PathBuf>>{
    let mut rows=scan(&roots(state)?).maps;
    rows.retain(|row|!row.archive&&["a10.map","a30.map","a50.map","b30.map","b40.map","c10.map","c20.map","c40.map","d20.map","d40.map"].contains(&row.name.to_ascii_lowercase().as_str()));
    rows.sort_by_key(|row|(if row.cache_version==Some(5){0}else if row.cache_version==Some(13){2}else{1},row.name.clone(),row.id.clone()));
    let mut names=BTreeSet::new();
    Ok(rows.into_iter().filter(|row|names.insert(row.name.to_ascii_lowercase())).map(|row|row.path).collect())
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
    window: tauri::WebviewWindow,
    source_id: String,
    prepare_preview_resources: Option<bool>,
) -> Reply<Vec<OpenProject>> {
    let owner = window.label().to_owned();
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
        // Home can overlap independent pack hashing with source inspection/copy.
        // This is opt-in and only binds a NEW source, never an existing map's
        // selected resources. Every later pixel read still validates its pins.
        let preview = if prepare_preview_resources == Some(true) && candidate.cache_version == Some(13) {
            maps::inspect_header(&candidate.path).ok().filter(|h| h.version == 13)
                .zip(lock(&state.installation)?.mcc_path.clone())
                .map(|(header, root)| (header.name, root.join("halo1/prebuild/paks")))
        } else { None };
        let (imported, prepared) = std::thread::scope(|scope| {
            let worker = preview.map(|(name, directory)| scope.spawn(move || {
                core::mcc_textures::pin(&directory, &name).map(|pins| (name, directory, pins))
            }));
            let imported = (|| -> Reply<_> {
                let library = lock(&state.library)?;
                let existing = library.list().map_err(error)?;
                // Adjacent original resources keep their normal precedence.
                let (project, inspection) = library.import_map(&candidate.path, candidate.path.parent()).map_err(error)?;
                let fresh = !existing.iter().any(|row| row.id == project.id);
                Ok((project, inspection, fresh))
            })();
            let prepared = worker.and_then(|thread| thread.join().ok()).and_then(Result::ok);
            (imported, prepared)
        });
        let (mut project, inspection, fresh) = imported?;
        if let Some((_, directory, hashes)) = prepared.filter(|(name, _, _)|
            fresh && inspection.header.version == 13 && *name == inspection.header.name) {
            if core::bitmap_preview::mcc_uses_external_bitmaps(
                &project.source.as_ref().ok_or("Missing imported source")?.preserved_path,
                &inspection.sha256, &inspection).map_err(error)? {
                let library = lock(&state.library)?;
                let mut latest = library.get(&project.id).map_err(error)?;
                // Retain current edits; a new resource/source choice wins.
                if preview_binding_unchanged(&project, &latest, &inspection.sha256)
                    && check_document_owner(&state, &project.id, &owner).is_ok() {
                    let source = latest.source.as_mut().ok_or("Missing imported source")?;
                    source.resource_directory = Some(directory);
                    source.resource_sha256 = hashes;
                    library.save(&latest, None).map_err(error)?;
                }
                project = latest;
            }
        }
        lock(&state.inspections)?.insert(project.id.clone(), Arc::new(inspection.clone()));
        Ok(vec![OpenProject {
            project,
            inspection: Some(inspection),
        }])
    })
    .await
    .map_err(error)?
}
fn preview_binding_unchanged(imported: &Project, latest: &Project, sha256: &str) -> bool {
    imported.id == latest.id && imported.source.as_ref().zip(latest.source.as_ref()).is_some_and(|(old, new)|
        old.cache_version == 13 && new.cache_version == 13 && old.sha256 == sha256 && new.sha256 == sha256
        && old.preserved_path == new.preserved_path && old.resource_directory == new.resource_directory
        && old.resource_sha256 == new.resource_sha256)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn automatic_preview_binding_preserves_newer_resource_choices_and_map_edits() {
        let mut imported = Project::new("original");
        imported.source = Some(core::project::Source {
            original_path: "original.map".into(), preserved_path: "owned/source.map".into(),
            sha256: "a".repeat(64), cache_version: 13, engine: "MCC".into(),
            scenario_path: "levels/test/map".into(), archive: None, audio_resources: None,
            resource_directory: Some("original-resources".into()), resource_sha256: BTreeMap::new(),
        });
        let mut latest = imported.clone();
        latest.title = "newer user edit".into();
        assert!(preview_binding_unchanged(&imported, &latest, &"a".repeat(64)));
        assert_eq!(latest.title, "newer user edit");
        latest.source.as_mut().unwrap().resource_directory = Some("chosen-resources".into());
        assert!(!preview_binding_unchanged(&imported, &latest, &"a".repeat(64)));
        latest = imported.clone();
        latest.source.as_mut().unwrap().resource_sha256.insert("bitmaps.map".into(), "b".repeat(64));
        assert!(!preview_binding_unchanged(&imported, &latest, &"a".repeat(64)));
        latest = imported.clone();
        latest.source.as_mut().unwrap().preserved_path = "different/source.map".into();
        assert!(!preview_binding_unchanged(&imported, &latest, &"a".repeat(64)));
        assert!(!preview_binding_unchanged(&imported, &imported, &"b".repeat(64)));
    }
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
    if !matches!(runtime,runtime::RuntimeId::MccSteam|runtime::RuntimeId::HaloCustomEdition|runtime::RuntimeId::HaloPc){
        return Err("Default native source materials need a compatible MCC, CE or PC source map. Link the matching runtime's map folder.".into());
    }
    default_material_map_for(state,&[runtime]).map(|(_,path)|path)
}
/// One bounded catalogue scan for a source-derived preview order. The chosen
/// ID is returned with the actual map, rather than copied from a UI preference.
pub(super) fn default_material_map_for(state:&AppState,runtimes:&[runtime::RuntimeId])->Reply<(runtime::RuntimeId,PathBuf)> {
    if runtimes.is_empty()||runtimes.len()>4{return Err("No compatible native material source was requested".into());}
    let found = scan(&roots(state)?);
    for runtime in runtimes {
        let version=match runtime {runtime::RuntimeId::MccSteam=>13,runtime::RuntimeId::HaloCustomEdition=>609,runtime::RuntimeId::HaloPc=>7,_=>continue};
        if let Some(candidate)=found.maps.iter().find(|c|c.cache_version==Some(version)&&c.name.eq_ignore_ascii_case("bloodgulch.map")) {
            return Ok((*runtime,candidate.path.clone()));
        }
    }
    Err("Link an owned matching Blood Gulch map to supply its exact grass and metal shaders".into())
}
