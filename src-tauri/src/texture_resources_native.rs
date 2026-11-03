//! Read-only candidate review and exact-pin location recovery. Compatibility
//! resources for the renderer never become extraction/build resources here.
use super::*;
use spark_core::bitmap_preview::BitmapResourceCompatibility;
use std::collections::{BTreeMap, HashSet};

const MAX_CANDIDATES: usize = 12;
const IMPORTED_COPY_RESOURCES:&str="Beside another verified copy of this map";

/// Explicitly linked asset folders also contain resources beside maps that
/// have not been opened yet. Bound this walk; never scan arbitrary drives,
/// follow links, or enter build/cache folders to discover a resource pack.
fn linked_resource_folders(roots:&[PathBuf])->Vec<PathBuf>{
    let mut result=vec![];let mut visited=HashSet::new();let mut entries=0usize;
    let mut pending=roots.iter().take(16).cloned().map(|root|(root,0usize)).collect::<Vec<_>>();
    while let Some((folder,depth))=pending.pop(){
        if visited.len()>=128||entries>=2048||result.len()>=MAX_CANDIDATES{break;}
        if core::library::validate_local_input_path(&folder).is_err()||core::reject_links(&folder).is_err(){continue;}
        let Ok(canonical)=fs::canonicalize(&folder)else{continue};if !visited.insert(canonical){continue;}
        if ["bitmaps.map","sounds.map"].iter().any(|name|{let file=folder.join(name);core::reject_links(&file).is_ok()&&file.is_file()}){result.push(folder.clone());}
        if depth>=3{continue;}
        let Ok(children)=fs::read_dir(&folder)else{continue};
        let mut children=children.take(2048-entries).filter_map(Result::ok).collect::<Vec<_>>();entries+=children.len();children.sort_by_key(|entry|entry.file_name());
        for entry in children.into_iter().rev(){
            let name=entry.file_name();let name=name.to_string_lossy();
            if name.starts_with('.')||matches!(name.to_ascii_lowercase().as_str(),"node_modules"|"target"|"dist"){continue;}
            if entry.file_type().is_ok_and(|kind|kind.is_dir()&&!kind.is_symlink()){pending.push((entry.path(),depth+1));}
        }
    }result
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Candidate {
    path: PathBuf,
    reason: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ReviewedCandidate {
    #[serde(flatten)]
    candidate: Candidate,
    sha256: Option<String>,
    coverage: Option<BitmapResourceCompatibility>,
    error: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CandidateReview {
    project_id: String,
    source_sha256: String,
    candidates: Vec<ReviewedCandidate>,
}

// Path admission happens before any automatic metadata/open call. In
// particular a stale descriptor cannot make discovery probe a remote share.
fn candidate_file(root: &Path) -> Option<PathBuf> {
    let text = root.to_string_lossy();
    if !root.is_absolute() && (text.contains(':') || text.starts_with(['/', '\\'])) {
        return None;
    }
    let directory = std::path::absolute(root).ok()?;
    core::library::validate_local_input_path(&directory).ok()?;
    core::reject_links(&directory).ok()?;
    let file = directory.join("bitmaps.map");
    core::reject_links(&file).ok()?;
    if !file.is_file() {
        return None;
    }
    fs::canonicalize(file).ok()
}

/// Shared folder discovery only. Bitmap and sound readers keep separate
/// format, exact-pin, sample/span and coverage admission below this boundary.
pub(super) fn resource_roots(state: &AppState, project: &Project) -> Reply<Vec<(PathBuf,&'static str)>> {
    let mut roots: Vec<(PathBuf, &str)> = vec![];
    if let Some(source) = &project.source {
        if let Some(path) = &source.resource_directory {
            roots.push((path.clone(), "Previously selected resources"));
        }
        if let Some(path) = source.original_path.parent() {
            roots.push((path.to_owned(), "Beside the original map"));
        }
        let library = lock(&state.library)?;
        let origins:Vec<PathBuf>=library.setting(&format!("mapResourceOrigins.{}",project.id)).map_err(error)?;
        for folder in origins.into_iter().take(8){roots.push((folder,IMPORTED_COPY_RESOURCES));}
        for entry in library
            .list()
            .map_err(error)?
            .into_iter()
            .filter(|entry| {
                entry.id != project.id && entry.sha256.as_deref() == Some(source.sha256.as_str())
            })
            .take(24)
        {
            if let Ok(other) = library.get(&entry.id) {
                if let Some(other) = other.source {
                    if let Some(path) = other.resource_directory {
                        roots.push((path, "Resources used by an identical preserved map"));
                    }
                    if let Some(path) = other.original_path.parent() {
                        roots.push((path.to_owned(), "Beside an identical preserved map"));
                    }
                }
            }
        }
    }
    if let Some(path) = lock(&state.settings)?.resource_directory.clone() {
        roots.push((path, "Configured resource folder"));
    }
    if let Some(path) = lock(&state.installation)?.mcc_path.clone() {
        roots.push((
            path.join("halo1/maps"),
            "MCC legacy resources; coverage must be checked",
        ));
        roots.push((
            path.join("halo1/maps/custom_edition"),
            "MCC Custom Edition compatibility resources",
        ));
    }
    let registrations: Vec<runtime::RuntimeRegistration> = lock(&state.library)?
        .setting("runtimeRegistrations")
        .map_err(error)?;
    for registration in registrations.into_iter().take(24) {
        for (folder,_) in runtime::map_directories(registration.runtime_id) {
            roots.push((registration.root.join(folder), "Registered Halo installation"));
            if let Some(path) = &registration.data_root {
                roots.push((path.join(folder), "Registered runtime data"));
            }
        }
    }
    let linked:Vec<PathBuf>=lock(&state.library)?.setting("assetSourceFolders").map_err(error)?;
    for folder in linked_resource_folders(&linked){roots.push((folder,"Inside a linked map/asset folder"));}
    let mut seen=HashSet::new();
    Ok(roots.into_iter().filter_map(|(root,reason)|{
        let directory=std::path::absolute(&root).ok()?;
        core::library::validate_local_input_path(&directory).ok()?;core::reject_links(&directory).ok()?;
        if !directory.is_dir(){return None;}
        let canonical=fs::canonicalize(&directory).ok()?;
        // Keep the recorded spelling for existing pin-location guards; the
        // canonical identity is used only for deduplication.
        seen.insert(canonical).then_some((root,reason))
    }).collect())
}
pub(super) fn candidates(state: &AppState, project: &Project) -> Reply<Vec<Candidate>> {
    let mut seen = HashSet::new();
    Ok(resource_roots(state,project)?
        .into_iter()
        .filter_map(|(root, reason)| {
            let file = candidate_file(&root)?;
            seen.insert(file.clone()).then(|| Candidate {
                path: file,
                reason: reason.into(),
            })
        })
        .take(MAX_CANDIDATES)
        .collect())
}

fn review_one(
    source: &project::Source,
    inspection: &MapInspection,
    candidate: Candidate,
) -> ReviewedCandidate {
    let mut result = ReviewedCandidate {
        candidate,
        sha256: None,
        coverage: None,
        error: None,
    };
    let checked = (|| -> Reply<BitmapResourceCompatibility> {
        let file = &result.candidate.path;
        core::library::validate_local_input_path(file).map_err(error)?;
        core::reject_links(file).map_err(error)?;
        if fs::metadata(file).map_err(error)?.len() > 2 * 1024 * 1024 * 1024 {
            return Err("Bitmap resource exceeds 2 GiB".into());
        }
        let hash = maps::hash_file(file).map_err(error)?;
        result.sha256 = Some(hash.clone());
        core::bitmap_preview::verify_resource_for_source(
            &source.preserved_path,
            &source.sha256,
            inspection,
            file,
            &hash,
        )
        .map_err(error)
    })();
    match checked {
        Ok(coverage) => result.coverage = Some(coverage),
        Err(message) => result.error = Some(message),
    }
    result
}

fn automatic_coverage(coverage: &BitmapResourceCompatibility) -> bool {
    coverage.verified_images > 0 && coverage.missing_or_mismatched_images == 0
}
fn candidate_coverage(coverage:&BitmapResourceCompatibility,reason:&str)->bool{
    automatic_coverage(coverage)||(reason==IMPORTED_COPY_RESOURCES&&coverage.verified_images>0)
}

// All recorded classic pins must agree; one matching bitmap must never
// silently replace a different pinned sound or string resource.
fn matches_pins(expected: &BTreeMap<String, String>, actual: &BTreeMap<String, String>) -> bool {
    !expected.is_empty()
        && expected.iter().all(|(name, hash)| {
            ["bitmaps.map", "sounds.map", "loc.map"].contains(&name.as_str())
                && actual.get(name) == Some(hash)
        })
}

pub(super) fn save_binding(
    app: &tauri::AppHandle,
    owner: &str,
    before: &[u8],
    project: Project,
) -> Reply<OpenProject> {
    let state = app.state::<AppState>();
    let source = project.source.as_ref().ok_or("Source disappeared")?;
    // Reinspect at the new location instead of returning stale resource diagnostics.
    let mut inspection =
        maps::inspect_map(&source.preserved_path, source.resource_directory.as_deref())
            .map_err(error)?;
    if inspection.sha256 != source.sha256 {
        return Err("Preserved map changed during resource recovery".into());
    }
    inspection.header.extended |= source
        .original_path
        .extension()
        .is_some_and(|x| x.eq_ignore_ascii_case("yelo"));
    let library = lock(&state.library)?;
    check_document_owner(&state, &project.id, owner)?;
    if serde_json::to_vec(&library.get(&project.id).map_err(error)?).map_err(error)? != before {
        return Err(
            "Project changed while checking resources; retry without discarding your edits".into(),
        );
    }
    library.save(&project, Some(&inspection)).map_err(error)?;
    drop(library);
    lock(&state.inspections)?.insert(project.id.clone(), Arc::new(inspection.clone()));
    let _ = app.emit("spark:project-saved", &project.id);
    Ok(OpenProject {
        project,
        inspection: Some(inspection),
    })
}

#[tauri::command]
pub(super) async fn review_bitmap_resource_candidates(
    app: tauri::AppHandle,
    project_id: String,
) -> Reply<CandidateReview> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let project = lock(&state.library)?.get(&project_id).map_err(error)?;
        let source = project.source.as_ref().ok_or("Open a preserved Halo map")?;
        if ![6, 7, 609].contains(&source.cache_version) {
            return Err("MCC uses its installed ipak texture resources".into());
        }
        let inspection = inspect(&state, &project)?;
        let candidates = candidates(&state, &project)?
            .into_iter()
            .map(|candidate| review_one(source, &inspection, candidate))
            .collect();
        Ok(CandidateReview {
            project_id,
            source_sha256: source.sha256.clone(),
            candidates,
        })
    })
    .await
    .map_err(error)?
}

pub(super) async fn auto_connect(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
) -> Reply<Option<OpenProject>> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        check_document_owner(&state, &project_id, &owner)?;
        let mut project = lock(&state.library)?.get(&project_id).map_err(error)?;
        let source = project.source.as_ref().ok_or("No map source")?;
        if ![6, 7, 609].contains(&source.cache_version) {
            return Ok(None);
        }
        let pinned = source.resource_sha256.contains_key("bitmaps.map");
        // The normal path does no repeated hashing. Preview reads still check
        // the pins. A changed existing file is not permission to replace it.
        if pinned
            && source
                .resource_directory
                .as_ref()
                .is_some_and(|root| root.is_absolute() && candidate_file(root).is_some())
        {
            return Ok(None);
        }
        let before = serde_json::to_vec(&project).map_err(error)?;
        let candidates = candidates(&state, &project)?;
        let inspection = inspect(&state, &project)?;
        for candidate in candidates {
            let folder = candidate
                .path
                .parent()
                .ok_or("Resource directory unavailable")?
                .to_owned();
            if pinned {
                let Ok(hashes) = project::resource_hashes(&folder) else {
                    continue;
                };
                if !matches_pins(&source.resource_sha256, &hashes) {
                    continue;
                }
                // Verify that this exact original pack still proves at least
                // one external image. Incomplete original packs remain partial.
                if review_one(source, &inspection, candidate)
                    .coverage
                    .is_none()
                {
                    continue;
                }
                let updated = project.source.as_mut().ok_or("Source disappeared")?;
                if let Some(audio) = updated.audio_resources.as_mut().filter(|audio| {
                    audio.kind == "classic"
                        && Some(&audio.directory) == updated.resource_directory.as_ref()
                }) {
                    if matches_pins(&audio.sha256, &hashes) {
                        audio.directory = folder.clone();
                    }
                }
                updated.resource_directory = Some(folder);
            } else {
                // Explicitly importing an identical map from its own resource
                // folder has the same selection semantics as its first import.
                // Preserve that choice even when unused legacy images are
                // missing. Each decoded image still requires its exact native
                // path/span/hash; this is never proof of a complete pack/build.
                let reason=candidate.reason.clone();
                let reviewed = review_one(source, &inspection, candidate);
                let Some(coverage) = reviewed.coverage.filter(|coverage|candidate_coverage(coverage,&reason)) else {
                    continue;
                };
                let hashes = project::resource_hashes(&folder).map_err(error)?;
                if hashes.get("bitmaps.map") != Some(&coverage.resource_sha256) {
                    return Err("Resource changed during discovery".into());
                }
                if !source.resource_sha256.is_empty()
                    && !matches_pins(&source.resource_sha256, &hashes)
                {
                    continue;
                }
                let updated = project.source.as_mut().ok_or("Source disappeared")?;
                updated.resource_directory = Some(folder);
                updated.resource_sha256 = hashes;
            }
            project.modified_at = chrono::Utc::now().to_rfc3339();
            return save_binding(&app, &owner, &before, project).map(Some);
        }
        Ok(None)
    })
    .await
    .map_err(error)?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recovery_requires_all_original_pins_and_does_not_trust_a_partial_runtime_match() {
        let expected = BTreeMap::from([
            ("bitmaps.map".into(), "bitmap".into()),
            ("sounds.map".into(), "sound".into()),
        ]);
        assert!(!matches_pins(
            &expected,
            &BTreeMap::from([("bitmaps.map".into(), "bitmap".into())])
        ));
        let mut changed = expected.clone();
        changed.insert("sounds.map".into(), "other".into());
        assert!(!matches_pins(&expected, &changed));
        assert!(matches_pins(&expected, &expected));
        assert!(!matches_pins(&BTreeMap::new(), &expected));
        let mut coverage = BitmapResourceCompatibility {
            cache_generation: 6,
            resource_sha256: "pin".into(),
            verified_images: 1,
            missing_or_mismatched_images: 499,
            unsupported_images: 44,
            internal_images: 142,
            shared_native_images:0,cubemap_images:0,volume_images:0,
        };
        assert!(!automatic_coverage(&coverage));
        assert!(!candidate_coverage(&coverage,"Installed runtime resources"));
        assert!(candidate_coverage(&coverage,IMPORTED_COPY_RESOURCES));
        coverage.missing_or_mismatched_images = 0;
        assert!(automatic_coverage(&coverage));
        coverage.verified_images = 0;
        assert!(!automatic_coverage(&coverage));
        assert!(!candidate_coverage(&coverage,IMPORTED_COPY_RESOURCES));
    }
    #[test]
    fn automatic_discovery_refuses_network_device_and_stream_paths_before_opening() {
        for path in [
            r"\\host\share",
            r"\\?\UNC\host\share",
            r"\\.\pipe\x",
            r"C:\maps\NUL",
            r"C:\maps\file:stream",
            "https://example.com/maps",
        ] {
            assert!(candidate_file(Path::new(path)).is_none(), "{path}");
        }
    }
    #[test]
    fn linked_asset_folders_find_unopened_map_resources_without_entering_builds_or_deep_trees(){
        let root=tempfile::tempdir().unwrap();
        for child in ["owned/maps","target/ignored/maps",".local/ignored/maps","too/deep/for/maps"]{
            let folder=root.path().join(child);fs::create_dir_all(&folder).unwrap();fs::write(folder.join("bitmaps.map"),b"probe only").unwrap();
        }
        let found=linked_resource_folders(&[root.path().to_path_buf(),root.path().to_path_buf()]);
        assert_eq!(found,vec![root.path().join("owned/maps")]);
        assert!(linked_resource_folders(&[PathBuf::from(r"\\host\share")]).is_empty());
    }
}
