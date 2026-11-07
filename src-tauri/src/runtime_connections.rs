//! Read-only, bounded detection of the reviewed portable Halo clients. Detection
//! does not register or launch them. A separate user action rechecks the exact
//! executable identity before storing an ordinary runtime registration.
use super::*;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Detected {
    runtime_id: runtime::RuntimeId,
    pub(super) root: PathBuf,
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
        // Publisher build343 ZIP SHA4804ccee… independently matched to this executable.
        "cd249f7ffd94c21b7f8bec1efc3e734753c48cf45d56d16f21a4ef53bcf07dd9" => Some((runtime::RuntimeId::OpenCe, "343")),
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
/// Expand only known client folder names near explicitly linked/provenance roots.
/// No recursive drive crawl; an installed app need not share the games' cwd.
fn nearby_roots(anchors: impl IntoIterator<Item=PathBuf>) -> Vec<PathBuf> {
    let mut roots=Vec::new();let mut seen=std::collections::HashSet::new();
    for anchor in anchors {
        for parent in anchor.ancestors().take(6) {
            let names=["Halo Custom Edition","opencehalo-windows-release","chupathingyce-windows64-release","OpenCE","ChupathingyCE","Chupathingy"];
            let children=names.into_iter().map(|name|parent.join(name))
                .chain(names.into_iter().map(|name|parent.join("Runtimes").join(name)));
            for candidate in std::iter::once(parent.to_path_buf()).chain(children) {
                if seen.insert(candidate.clone()) {roots.push(candidate);if roots.len()==256{return roots;}}
            }
        }
    }
    roots
}
pub(super) fn discover(state: &AppState) -> Reply<Vec<Detected>> {
    let mut found = Vec::new();
    if let Some(ce) = ce_setup::discover(state)? {
        let (executable, hash, _) = dependency_install::pe_identity(&ce.root.join("haloce.exe"))?;
        found.push(Detected { runtime_id: runtime::RuntimeId::HaloCustomEdition, executable, executable_sha256: hash,
            data_root: ce.root.clone(), root: ce.root.clone(), version: None, content_ready: ce_setup::require_startup(&ce.root).is_ok(),
            detail: "Custom Edition executable, native UI and resource indexes found. Connection does not launch the game or establish live-link.".into() });
    }
    let mut anchors:Vec<PathBuf>={
        let library=lock(&state.library)?;
        let linked:Vec<PathBuf>=library.setting("assetSourceFolders").map_err(error)?;
        let registered:Vec<runtime::RuntimeRegistration>=library.setting("runtimeRegistrations").map_err(error)?;
        let mut anchors:Vec<PathBuf>=linked.into_iter().take(16).chain(registered.into_iter().take(8).map(|item|item.root)).collect();
        for entry in library.list().map_err(error)?.into_iter().take(8) {
            if let Ok(project)=library.get(&entry.id) {if let Some(source)=project.source {if let Some(parent)=source.original_path.parent(){anchors.push(parent.to_path_buf());}}}
        }
        anchors
    };
    anchors.extend([std::env::current_dir().ok(),std::env::current_exe().ok().and_then(|file|file.parent().map(Path::to_path_buf))].into_iter().flatten());
    for root in nearby_roots(anchors) {
        if !found.iter().any(|item|item.runtime_id==runtime::RuntimeId::HaloCustomEdition)&&root.join("haloce.exe").is_file() {
            if let Ok(ce)=ce_setup::inspect_root(&root) {
                let (executable,hash,_)=dependency_install::pe_identity(&ce.root.join("haloce.exe"))?;
                found.push(Detected{runtime_id:runtime::RuntimeId::HaloCustomEdition,root:ce.root.clone(),data_root:ce.root.clone(),executable,executable_sha256:hash,version:None,content_ready:ce_setup::require_startup(&ce.root).is_ok(),detail:"Custom Edition found near a linked folder or preserved map source. Connection does not launch it or establish live-link.".into()});
            }
        }
        if root.join("halo.exe").is_file() {if let Ok(candidate)=community(&root) {
            if !found.iter().any(|old|old.runtime_id==candidate.runtime_id){found.push(candidate);}
        }}
        if found.len()==3 {break;}
    }
    Ok(found)
}
pub(super) fn owned_map_roots(state:&AppState)->Reply<Vec<(PathBuf,String)>>{
    let mut roots=vec![];
    if let Some(mcc)=lock(&state.installation)?.mcc_path.clone(){roots.push((mcc.join("halo1/maps"),"MCC Halo 1".into()));}
    for item in discover(state)?{if item.content_ready{
        roots.extend(runtime::map_directories(item.runtime_id).iter().map(|(folder,_)|
            (item.data_root.join(folder),item.runtime_id.name().into())));
    }}
    Ok(roots)
}
/// Size reporting reuses connected/detected installations and linked content;
/// it never registers, launches or rewrites a runtime.
pub(super) fn storage_roots(state: &AppState) -> Reply<Vec<(PathBuf, String)>> {
    let mut roots = vec![];
    if let Some(root) = lock(&state.installation)?.mcc_path.clone() { roots.push((root, "MCC installation".into())); }
    let library = lock(&state.library)?;
    let registrations: Vec<runtime::RuntimeRegistration> = library.setting("runtimeRegistrations").map_err(error)?;
    let linked: Vec<PathBuf> = library.setting("assetSourceFolders").map_err(error)?;
    drop(library);
    for registration in registrations.into_iter().take(24) {
        roots.push((registration.root, registration.runtime_id.name().into()));
        if let Some(data) = registration.data_root { roots.push((data, format!("{} content", registration.runtime_id.name()))); }
    }
    for detected in discover(state)? {
        roots.push((detected.root, detected.runtime_id.name().into()));
        roots.push((detected.data_root, format!("{} content", detected.runtime_id.name())));
    }
    roots.extend(linked.into_iter().take(16).map(|path| {
        let name = format!("Linked Halo folder · {}", path.file_name().unwrap_or_default().to_string_lossy()); (path, name)
    }));
    if let Some(path) = lock(&state.settings)?.resource_directory.clone() { roots.push((path, "Connected Halo resources".into())); }
    Ok(roots)
}
/// Provenance uses original byte identity and installation roots, never the
/// selected hosting runtime. Missing/changed originals or ambiguous shared
/// roots leave provenance unknown; the preserved map remains inspectable.
fn canonical_local(path:&Path)->Option<PathBuf>{
    core::library::validate_local_input_path(path).ok()?;core::reject_links(path).ok()?;fs::canonicalize(path).ok()
}
fn original_in_maps(runtime_id:runtime::RuntimeId,root:&Path,original:&Path)->bool{
    runtime::map_directories(runtime_id).iter().any(|(folder,_)|
        canonical_local(&root.join(folder)).is_some_and(|maps|original.starts_with(maps)))
}
pub(super) fn source_installations(state:&AppState,source:&project::Source)->Reply<Vec<core::source_identity::RuntimeInstallation>>{
    let original=canonical_local(&source.original_path).filter(|path|path.is_file());
    let original=original.filter(|path|maps::hash_file(path).ok().as_deref()==Some(&source.sha256));
    let belongs=|runtime_id:runtime::RuntimeId,root:&Path| original.as_ref().is_some_and(|original|original_in_maps(runtime_id,root,original));
    let mut matches=vec![];
    if let Some(mcc)=lock(&state.installation)?.mcc_path.clone(){
        matches.push(core::source_identity::RuntimeInstallation{
            original_location:belongs(runtime::RuntimeId::MccSteam,&mcc),
            cache_family_matches:core::source_identity::runtime_family_matches(runtime::RuntimeId::MccSteam,source.cache_version),
            origin:core::source_identity::RuntimeOrigin{runtime_id:runtime::RuntimeId::MccSteam,root:mcc,executable_sha256:None}});
    }
    let registrations:Vec<runtime::RuntimeRegistration>=lock(&state.library)?.setting("runtimeRegistrations").map_err(error)?;
    for registration in registrations.into_iter().take(24){
        if let Ok(installation)=runtime::inspect_registration(&registration){
            if installation.validation==runtime::TestStatus::Pass {
                if matches.iter().any(|entry|entry.origin.runtime_id==registration.runtime_id&&entry.origin.root==installation.root){continue;}
                matches.push(core::source_identity::RuntimeInstallation{
                    original_location:belongs(registration.runtime_id,&installation.data_root),
                    cache_family_matches:core::source_identity::runtime_family_matches(registration.runtime_id,source.cache_version),
                    origin:core::source_identity::RuntimeOrigin{runtime_id:registration.runtime_id,root:installation.root,executable_sha256:installation.executable_sha256}});
            }
        }
    }
    Ok(matches)
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
        let reports=runtime_reports(&state)?;
        let _=app.emit("spark:runtime-connections-changed",());
        Ok(reports)
    }).await.map_err(error)?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn original_custom_map_membership_is_native_family_specific_and_not_a_sibling_prefix(){
        let root=tempfile::tempdir().unwrap();
        for folder in ["maps","custom_maps","maps_ce","maps_md","maps_pc","maps_other"]{
            fs::create_dir(root.path().join(folder)).unwrap();
            let file=root.path().join(folder).join("owned.map");fs::write(&file,b"path membership only").unwrap();
            let original=fs::canonicalize(file).unwrap();
            assert_eq!(original_in_maps(runtime::RuntimeId::OpenCe,root.path(),&original),matches!(folder,"maps"|"custom_maps"|"maps_ce"));
            assert_eq!(original_in_maps(runtime::RuntimeId::ChupathingyCe,root.path(),&original),folder!="maps_other");
            assert!(!original_in_maps(runtime::RuntimeId::MccSteam,root.path(),&original));
        }
        let other=tempfile::tempdir().unwrap();let file=other.path().join("outside.map");fs::write(&file,b"outside").unwrap();
        assert!(!original_in_maps(runtime::RuntimeId::OpenCe,root.path(),&fs::canonicalize(file).unwrap()));
    }
    #[test]
    fn linked_and_source_roots_discover_known_siblings_without_a_matching_process_directory(){
        let anchor=PathBuf::from("owned/maps/zombie/maps");let roots=nearby_roots([anchor.clone(),anchor]);
        for child in ["Halo Custom Edition","OpenCE","ChupathingyCE","opencehalo-windows-release","chupathingyce-windows64-release"] {assert!(roots.contains(&PathBuf::from("owned").join(child)));}
        for child in ["Halo Custom Edition","OpenCE","Chupathingy"] {assert!(roots.contains(&PathBuf::from("owned/Runtimes").join(child)));}
        assert_eq!(roots.iter().collect::<std::collections::HashSet<_>>().len(),roots.len());
        assert!(nearby_roots((0..100).map(|n|PathBuf::from(format!("owned-{n}/maps")))).len()<=256);
    }
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

/// Reuse the connected CE source, or existing bounded discovery, without changing registrations.
pub(super) fn ce_resource_source(state:&AppState)->Reply<PathBuf>{
    let profiles:Vec<runtime::RuntimeRegistration>=lock(&state.library)?.setting("runtimeRegistrations").map_err(error)?;
    if profiles.len()>24{return Err("Runtime profile limit exceeded".into());}
    if let Some(ce)=profiles.iter().find(|p|p.runtime_id==runtime::RuntimeId::HaloCustomEdition){
        return runtime::inspect_registration(ce).map(|i|i.data_root).map_err(error);
    }
    discover(state)?.into_iter().find(|p|p.runtime_id==runtime::RuntimeId::HaloCustomEdition&&p.content_ready).map(|p|p.data_root)
        .ok_or("Connect your owned Custom Edition installation in Games & tools. Xbox and MCC resources cannot substitute for its three CE banks.".into())
}
