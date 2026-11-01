//! Read-only, bounded detection of the reviewed portable Halo clients. Detection
//! does not register or launch them. A separate user action rechecks the exact
//! executable identity before storing an ordinary runtime registration.
use super::*;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Detected {
    runtime_id: runtime::RuntimeId,
    root: PathBuf,
    executable: PathBuf,
    data_root: PathBuf,
    executable_sha256: String,
    version: Option<String>,
    content_ready: bool,
    detail: String,
}

fn community_identity(hash: &str) -> Option<(runtime::RuntimeId, &'static str)> {
    // Exact binaries from the publisher-digest-verified releases recorded in
    // docs/fixtures/c41-installed-community-runtimes.json. Names alone never
    // identify halo.exe as OpenCE or Chupathingy.
    match hash {
        "788fb4095664b9417f64f9d40a5668e6d0775823407e9d5a7b517587536766a0" => Some((runtime::RuntimeId::OpenCe, "335")),
        "b2f8ea992ed4031461bc638f8af80c08ec8905c5f73c97c483e86f25273b18d4" => Some((runtime::RuntimeId::ChupathingyCe, "0.8.1d")),
        _ => None,
    }
}
fn community(root: &Path) -> Reply<Detected> {
    core::reject_links(root).map_err(error)?;
    let root = fs::canonicalize(root).map_err(error)?;
    let (executable, hash, _) = dependency_install::pe_identity(&root.join("halo.exe"))?;
    let (runtime_id, version) = community_identity(&hash).ok_or("Portable client is not a reviewed OpenCE/Chupathingy executable")?;
    let data_root = if root.join("data/maps").is_dir() { root.join("data") } else { root.clone() };
    core::reject_links(&data_root).map_err(error)?;
    let ui = data_root.join("maps/ui.map");
    let content_ready = core::reject_links(&ui).is_ok() && maps::inspect_header(&ui).is_ok_and(|header| header.version == 5);
    Ok(Detected { runtime_id, root, executable, data_root, executable_sha256: hash, version: Some(version.into()), content_ready,
        detail: if content_ready { "Reviewed client and Xbox UI cache found. Connection records paths only; game compatibility and live-link remain separate checks." } else { "Reviewed client found. Its original Xbox maps/ui.map is missing or incompatible; complete the owned-content setup first." }.into() })
}
fn discover(state: &AppState) -> Reply<Vec<Detected>> {
    let mut found = Vec::new();
    if let Some(ce) = ce_setup::discover(state)? {
        let (executable, hash, _) = dependency_install::pe_identity(&ce.root.join("haloce.exe"))?;
        found.push(Detected { runtime_id: runtime::RuntimeId::HaloCustomEdition, executable, executable_sha256: hash,
            data_root: ce.root.clone(), root: ce.root.clone(), version: None, content_ready: ce_setup::require_startup(&ce.root).is_ok(),
            detail: "Custom Edition executable, native UI and resource indexes found. Connection does not launch the game or establish live-link.".into() });
    }
    let linked: Vec<PathBuf> = lock(&state.library)?.setting("assetSourceFolders").map_err(error)?;
    let mut roots: Vec<PathBuf> = linked.into_iter().take(16).collect();
    for start in [std::env::current_dir().ok(), std::env::current_exe().ok().and_then(|file| file.parent().map(Path::to_path_buf))].into_iter().flatten() {
        for parent in start.ancestors().take(6) {
            for folder in ["opencehalo-windows-release", "chupathingyce-windows64-release", "OpenCE", "ChupathingyCE"] {
                roots.push(parent.join(folder));
            }
        }
    }
    let mut seen = std::collections::HashSet::new();
    for root in roots.into_iter().take(64) {
        if !root.join("halo.exe").is_file() || !seen.insert(root.clone()) { continue; }
        if let Ok(candidate) = community(&root) {
            if !found.iter().any(|old| old.runtime_id == candidate.runtime_id) { found.push(candidate); }
        }
    }
    Ok(found)
}
#[tauri::command]
pub(super) async fn discover_halo_connections(app: tauri::AppHandle) -> Reply<Vec<Detected>> {
    tauri::async_runtime::spawn_blocking(move || discover(&app.state::<AppState>())).await.map_err(error)?
}
#[tauri::command]
pub(super) async fn connect_detected_halo(app: tauri::AppHandle, runtime_id: runtime::RuntimeId, executable_sha256: String) -> Reply<Vec<runtime::RuntimeReport>> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let selected = discover(&state)?.into_iter().find(|item| item.runtime_id == runtime_id && item.executable_sha256 == executable_sha256).ok_or("Detected runtime changed or is unavailable. Recheck connections before connecting.")?;
        if !selected.content_ready { return Err(selected.detail); }
        let registration = runtime::RuntimeRegistration { id: uuid::Uuid::new_v4().to_string(), runtime_id, root: selected.root,
            executable: selected.executable, data_root: Some(selected.data_root), version: selected.version, network_version: None };
        let checked = runtime::inspect_registration(&registration).map_err(error)?;
        if checked.executable_sha256.as_deref() != Some(executable_sha256.as_str()) { return Err("Runtime changed during connection; no registration was saved".into()); }
        let library = lock(&state.library)?;
        let mut registrations: Vec<runtime::RuntimeRegistration> = library.setting("runtimeRegistrations").map_err(error)?;
        // Connecting a detected candidate must not replace a user's custom root.
        if registrations.iter().any(|old| old.runtime_id == runtime_id) { return Err("This runtime already has a saved installation. Review it in runtime setup before changing it.".into()); }
        registrations.push(registration);
        library.set_setting("runtimeRegistrations", &registrations).map_err(error)?;
        drop(library);
        runtime_reports(&state)
    }).await.map_err(error)?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unrelated_named_binaries_and_changed_identity_never_become_reviewed_clients() {
        assert!(community_identity(&"a".repeat(64)).is_none());
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("halo.exe"), b"MZnot a reviewed client").unwrap();
        let before = fs::read(directory.path().join("halo.exe")).unwrap();
        assert!(community(directory.path()).is_err());
        assert_eq!(before, fs::read(directory.path().join("halo.exe")).unwrap());
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }
}
