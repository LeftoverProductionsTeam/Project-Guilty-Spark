//! On-demand dependency inspection and explicit reviewed install/page handoffs.
//! Never downloads or executes an installer/Invader/SDK binary.
use super::*;
use spark_core::dependencies as deps;
use std::io::{Seek, SeekFrom};

#[derive(Default)]
pub(super) struct DependencyInstallState {
    plans: HashMap<String, PendingDependencyAction>,
}
struct PendingDependencyAction {
    view: DependencyActionPlan,
    owner: String,
    created: Instant,
    settings_hash: String,
    project_fingerprint: Option<String>,
}
impl DependencyInstallState {
    /// The caller holds the dependency_install mutex while checking the actual
    /// window, so Destroyed cleanup cannot race an insert after slow probes.
    fn insert_if_window_present(
        &mut self,
        pending: PendingDependencyAction,
        window_present: impl FnOnce(&str) -> bool,
    ) -> Reply<DependencyActionPlan> {
        if !window_present(&pending.owner) {
            return Err(
                "The setup window closed during inspection; no dependency preview was retained"
                    .into(),
            );
        }
        self.plans
            .retain(|_, p| p.created.elapsed() < Duration::from_secs(90));
        if self.plans.len() >= 16 {
            return Err("Close an old dependency preview before preparing another".into());
        }
        let view = pending.view.clone();
        self.plans.insert(view.id.clone(), pending);
        Ok(view)
    }
    fn release(&mut self, owner: &str) {
        self.plans.retain(|_, pending| pending.owner != owner);
    }
}
pub(super) fn release_window(state: &AppState, owner: &str) {
    if let Ok(mut pending) = state.dependency_install.lock() {
        pending.release(owner);
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DependencyActionPlan {
    id: String,
    action_id: String,
    runtime_id: runtime::RuntimeId,
    project_id: Option<String>,
    label: String,
    uri: String,
    executable: PathBuf,
    executable_sha256: String,
    executable_architecture: String,
    arguments: Vec<String>,
    expires_at_unix: u64,
    detail: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DependencyActionResult {
    action_id: String,
    outcome: String,
    detail: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DependencyChoiceResult {
    bootstrap: Option<Bootstrap>,
    opened: Option<OpenProject>,
}

fn probe(
    state: deps::DependencyState,
    detail: impl Into<String>,
    path: Option<&Path>,
) -> deps::DependencyProbe {
    deps::DependencyProbe {
        state,
        detail: detail.into(),
        path: path.map(|p| p.to_string_lossy().into_owned()),
        ..Default::default()
    }
}
/// Read-only PE identity, not publisher authenticity or execution acceptance.
pub(super) fn pe_identity(path: &Path) -> Reply<(PathBuf, String, String)> {
    core::reject_links(path).map_err(error)?;
    if !path.is_file() {
        return Err("Required installed executable is missing".into());
    }
    let path = fs::canonicalize(path).map_err(error)?;
    let mut file = fs::File::open(&path).map_err(error)?;
    let bytes = file.metadata().map_err(error)?.len();
    if !(64..=256 * 1024 * 1024).contains(&bytes) {
        return Err("Executable is outside the inspection size limit".into());
    }
    let mut dos = [0u8; 64];
    file.read_exact(&mut dos).map_err(error)?;
    let offset = u32::from_le_bytes(dos[60..64].try_into().unwrap()) as u64;
    if &dos[..2] != b"MZ"
        || offset < 64
        || offset > 4 * 1024 * 1024
        || offset.checked_add(6).is_none_or(|end| end > bytes)
    {
        return Err("Installed file has no supported PE header".into());
    }
    file.seek(SeekFrom::Start(offset)).map_err(error)?;
    let mut pe = [0u8; 6];
    file.read_exact(&mut pe).map_err(error)?;
    let arch = match u16::from_le_bytes([pe[4], pe[5]]) {
        0x014c => "x86",
        0x8664 => "x86_64",
        _ => return Err("Executable architecture is not supported by this install route".into()),
    };
    if &pe[..4] != b"PE\0\0" {
        return Err("Invalid executable signature".into());
    }
    Ok((
        path.clone(),
        maps::hash_file(&path).map_err(error)?,
        arch.into(),
    ))
}
fn same_directory(a: &Path, b: &Path) -> bool {
    core::reject_links(a).is_ok()
        && core::reject_links(b).is_ok()
        && fs::canonicalize(a)
            .ok()
            .zip(fs::canonicalize(b).ok())
            .is_some_and(|(a, b)| a == b)
}
fn selected_settings(state: &AppState, project: Option<&Project>) -> Reply<Settings> {
    let mut settings = lock(&state.settings)?.clone();
    if let Some(target) = project.and_then(|p| {
        p.active_build_target
            .as_ref()
            .and_then(|id| p.build_targets.iter().find(|t| &t.id == id))
    }) {
        settings.hek_directory = target.hek_directory.clone();
        settings.hek_flavor = target.hek_flavor.clone();
        settings.hek_tags_directory = target.tags_directory.clone();
        settings.invader_directory = target
            .invader_directory
            .clone()
            .or(settings.invader_directory);
    }
    Ok(settings)
}
fn actual_steam(settings: &Settings) -> Installation {
    steam::discover(
        settings.steam_directory.as_deref(),
        settings.mcc_directory.as_deref(),
    )
}
fn steam_probe(installation: &Installation) -> deps::DependencyProbe {
    let Some(path) = installation.steam_executable.as_ref() else {
        return probe(deps::DependencyState::SetupRequired,"Steam was not discovered. Choose its installed folder to enable the official tool install route.",None);
    };
    if !path
        .file_name()
        .is_some_and(|s| s.eq_ignore_ascii_case("steam.exe"))
    {
        return probe(deps::DependencyState::Blocked,"The discovered launch file is not Steam.exe; choose the actual installed Steam client.",Some(path));
    }
    match pe_identity(path){Ok((p,hash,arch))=>deps::DependencyProbe{state:deps::DependencyState::Ready,detail:"Installed Steam.exe path/PE/hash checked. Opening its fixed tool-install URI still requires explicit review; Steam handles login and installation.".into(),path:Some(p.to_string_lossy().into_owned()),sha256:Some(hash),architecture:Some(arch)},Err(e)=>probe(deps::DependencyState::SetupRequired,e,Some(path))}
}
fn kit_probe(settings: &Settings, installation: &Installation) -> deps::DependencyProbe {
    let root = settings
        .hek_directory
        .as_ref()
        .or(installation.editing_tools.as_ref());
    let Some(root) = root else {
        return probe(deps::DependencyState::SetupRequired,"Halo: CE Mod Tools - MCC is missing. In Steam Library enable Tools, install app1532190, then choose the installed kit.",None);
    };
    if !installation
        .editing_tools
        .as_ref()
        .is_some_and(|official| same_directory(root, official))
    {
        return probe(deps::DependencyState::Unverified,"Folder selected, but it does not match the discovered Steam H1A kit. Classic HEK and another game's toolkit cannot substitute.",Some(root));
    }
    let mut missing = vec![];
    let mut tool = None;
    for name in [
        "tool.exe",
        "guerilla.exe",
        "sapien.exe",
        "halo_tag_test.exe",
    ] {
        match pe_identity(&root.join(name)) {
            Ok(value) => {
                if name == "tool.exe" {
                    tool = Some(value)
                }
            }
            Err(_) => missing.push(name),
        }
    }
    if !missing.is_empty() {
        return probe(deps::DependencyState::SetupRequired,format!("Installed kit is missing/invalid: {}. Review Steam installation/repair, then select it again.",missing.join(", ")),Some(root));
    }
    let (path, hash, arch) = tool.unwrap();
    deps::DependencyProbe{state:deps::DependencyState::Ready,detail:"Steam app1532190 and all four editing-tool PE headers checked. Tool CPU architecture is independent of MCC's game ABI. Native source/tool preflight still applies.".into(),path:Some(path.to_string_lossy().into_owned()),sha256:Some(hash),architecture:Some(arch)}
}
fn invader_probe(settings: &Settings) -> deps::DependencyProbe {
    let Some(root) = settings.invader_directory.as_ref() else {
        return probe(deps::DependencyState::SetupRequired,"Choose a separately installed Invader folder. The official release page is offered; Spark does not download or execute an unverified release.",None);
    };
    let mut missing = vec![];
    let mut info = None;
    for name in [
        "invader-info.exe",
        "invader-edit.exe",
        "invader-extract.exe",
    ] {
        match pe_identity(&root.join(name)) {
            Ok(value) => {
                if name == "invader-info.exe" {
                    info = Some(value)
                }
            }
            Err(_) => missing.push(name),
        }
    }
    if !missing.is_empty() {
        return probe(deps::DependencyState::SetupRequired,format!("Required Invader files are missing/invalid: {}. Choose an installed matching toolset; do not substitute renamed files.",missing.join(", ")),Some(root));
    }
    let (path, hash, arch) = info.unwrap();
    deps::DependencyProbe{state:deps::DependencyState::Unverified,detail:"Required files have valid PE headers and a recorded identity; version/source approval and operation-specific preflight remain. Nothing was executed.".into(),path:Some(path.to_string_lossy().into_owned()),sha256:Some(hash),architecture:Some(arch)}
}
fn tags_probe(settings: &Settings) -> deps::DependencyProbe {
    let root = settings
        .hek_tags_directory
        .clone()
        .or_else(|| settings.hek_directory.as_ref().map(|p| p.join("tags")));
    let Some(root) = root else {
        return probe(deps::DependencyState::SetupRequired,"Select matching legal editable tags or extract the installed kit into a fresh working copy; a .map file is not editable source tags.",None);
    };
    let globals = root.join("globals/globals.globals");
    if core::reject_links(&globals).is_err() {
        return probe(
            deps::DependencyState::Blocked,
            "Editable tags cannot resolve through a filesystem link.",
            Some(&root),
        );
    }
    let mut header = [0u8; 64];
    let okay = fs::File::open(&globals)
        .and_then(|mut f| f.read_exact(&mut header))
        .is_ok()
        && &header[60..64] == b"blam"
        && &header[36..40] == b"matg";
    if !okay {
        return probe(deps::DependencyState::SetupRequired,"Matching editable globals tag is missing or invalid. Choose the actual tags root, not a maps/data folder.",Some(&root));
    }
    probe(deps::DependencyState::Unverified,"Editable globals header checked. Complete dependencies and generation compatibility are verified during the selected map's build preflight.",Some(&root))
}
fn resource_probe(project: Option<&Project>, settings: &Settings) -> deps::DependencyProbe {
    let Some(source) = project.and_then(|p| p.source.as_ref()) else {
        return probe(deps::DependencyState::NotApplicable,"This source-authored project uses its selected editable tags; no imported cache resource folder is implied.",None);
    };
    let root = source
        .resource_directory
        .as_ref()
        .or(settings.resource_directory.as_ref());
    let Some(root) = root else {
        return probe(
            if source.cache_version == 13 {
                deps::DependencyState::Unverified
            } else {
                deps::DependencyState::SetupRequired
            },
            if source.cache_version == 13 {
                "This cache may embed its data or use matching MCC packs. Resolve its actual resources before assuming a missing shared map; classic bitmaps.map is a different generation."
            } else {
                "Choose this original Demo/PC/CE map's exact shared bitmaps.map/sounds.map/loc.map where referenced."
            },
            None,
        );
    };
    if !root.is_dir() || core::reject_links(root).is_err() {
        return probe(
            deps::DependencyState::SetupRequired,
            "The selected source resource folder is missing or linked; choose it again.",
            Some(root),
        );
    }
    let expected: Vec<_> = source
        .resource_sha256
        .keys()
        .filter(|key| ["bitmaps.map", "sounds.map", "loc.map"].contains(&key.as_str()))
        .cloned()
        .collect();
    let missing: Vec<_> = expected
        .iter()
        .filter(|name| !root.join(name).is_file())
        .cloned()
        .collect();
    if !missing.is_empty() {
        return probe(deps::DependencyState::SetupRequired,format!("Pinned source resources are missing: {}. Resources from another edition are not substituted.",missing.join(", ")),Some(root));
    }
    probe(deps::DependencyState::Unverified,"Selected source resource folder exists. Recorded pins are not treated as fresh file hashes; the resource picker/build rechecks exact identities. No repeated full resource hashing runs in this guide.",Some(root))
}
fn assets_probe(project: Option<&Project>) -> deps::DependencyProbe {
    let Some(project) = project else {
        return probe(
            deps::DependencyState::NotApplicable,
            "Open a project to inspect model/animation requirements.",
            None,
        );
    };
    let controls = project.gameplay_controls.as_ref();
    let requested = !project.assets.is_empty()
        || !project.animations.is_empty()
        || !project.animation_assignments.is_empty()
        || controls.is_some_and(|c| c.sword_lunge || c.dual_wield);
    if !requested {
        return probe(
            deps::DependencyState::NotApplicable,
            "No custom model/animation or paired-weapon request is authored in this project.",
            None,
        );
    };
    let missing = project
        .assets
        .iter()
        .filter(|asset| !asset.path.is_file())
        .count()
        + project
            .animations
            .iter()
            .filter(|asset| !asset.source_path.is_file() || !asset.data_path.is_file())
            .count();
    if missing > 0 {
        return probe(deps::DependencyState::SetupRequired,format!("{missing} authored model/animation source files are missing. Reconnect the originals in Asset/Machinima setup; names alone are not models or compatible skeletons."),None);
    }
    if controls.is_some_and(|c| c.sword_lunge || c.dual_wield) {
        return probe(deps::DependencyState::Blocked,"Paired native weapons/player sword need an implemented engine adapter plus actual player model and compatible first-person animation graph. Installing a toolkit alone does not provide these missing gameplay contracts.",None);
    }
    probe(deps::DependencyState::Unverified,"Authored source files exist. Exact hashes, skeleton/animation graph compatibility and target compilation remain operation-specific; no automatic retargeting is implied.",None)
}
fn observation(
    app: &tauri::AppHandle,
    state: &AppState,
    runtime_id: runtime::RuntimeId,
    project_id: Option<&str>,
) -> Reply<deps::DependencyObservation> {
    let project = project_id
        .map(|id| lock(&state.library)?.get(id).map_err(error))
        .transpose()?;
    let settings = selected_settings(state, project.as_ref())?;
    let installed = actual_steam(&settings);
    let game = if runtime_id == runtime::RuntimeId::MccSteam {
        if installed.halo1_installed {
            probe(deps::DependencyState::Ready,"Fresh Steam discovery found MCC Halo1. Source assets, editing-kit installation and exact live-game build are independent.",installed.mcc_path.as_deref())
        } else {
            probe(deps::DependencyState::SetupRequired,"Install/enable Halo: CE in the owned MCC installation, then refresh discovery. Finding Steam alone does not load Halo assets.",installed.mcc_path.as_deref())
        }
    } else if runtime_id == runtime::RuntimeId::HaloCustomEdition {
        match ce_setup::discover(state)? {
            Some(found) => probe(deps::DependencyState::Ready, "Custom Edition game, UI cache and resource headers checked. Use Custom Edition setup below to connect the detected folder; native builds and gameplay have separate acceptance.", Some(&found.root)),
            None => probe(deps::DependencyState::SetupRequired, "Choose an existing Custom Edition folder or install the selected community archive below. MCC does not supply the CE executable or its exact resource maps.", None),
        }
    } else {
        let registrations: Vec<runtime::RuntimeRegistration> = lock(&state.library)?
            .setting("runtimeRegistrations")
            .map_err(error)?;
        let registration = registrations.iter().find(|r| r.runtime_id == runtime_id);
        match registration.map(runtime::inspect_registration).transpose(){Ok(Some(found))=>probe(deps::DependencyState::Unverified,"Registered runtime files were inspected; exact startup/content/protocol actions retain their own preflight.",Some(&found.root)),_=>probe(deps::DependencyState::SetupRequired,"Register this exact runtime/platform in Settings → Games & tools. MCC installation is not another engine's executable/content.",None)}
    };
    let community = if matches!(
        runtime_id,
        runtime::RuntimeId::ChupathingyCe | runtime::RuntimeId::OpenCe
    ) {
        probe(deps::DependencyState::Unverified,"Use the selected runtime's owned Xbox-base startup data and exact CE resources when needed. MCC v13 inspection is not proof those prerequisites are present; use Play & servers content preflight.",None)
    } else {
        probe(
            deps::DependencyState::NotApplicable,
            "Not the selected community runtime.",
            None,
        )
    };
    let webview = if cfg!(windows) && !app.webview_windows().is_empty() {
        probe(deps::DependencyState::Ready,"This native Windows webview is active. No additional runtime installer is inferred from Halo/tool CPU architecture.",None)
    } else {
        probe(deps::DependencyState::NotApplicable,"WebView2 applies to native Windows; use the official Microsoft guide for a Windows startup problem.",None)
    };
    let target_mismatch = project
        .as_ref()
        .and_then(|p| {
            p.active_build_target
                .as_ref()
                .and_then(|id| p.build_targets.iter().find(|target| &target.id == id))
        })
        .is_some_and(|target| target.runtime_id != runtime_id);
    let mismatch = || {
        probe(deps::DependencyState::Blocked,"This map's active build target belongs to another runtime. Choose its matching runtime/profile before changing source tags or the editing kit.",None)
    };
    Ok(deps::DependencyObservation {
        runtime_id,
        platform: runtime::platform().into(),
        project_id: project_id.map(str::to_owned),
        steam: steam_probe(&installed),
        game,
        h1a: if target_mismatch {
            mismatch()
        } else {
            kit_probe(&settings, &installed)
        },
        invader: invader_probe(&settings),
        resources: resource_probe(project.as_ref(), &settings),
        editable_tags: if target_mismatch {
            mismatch()
        } else {
            tags_probe(&settings)
        },
        assets: assets_probe(project.as_ref()),
        webview2: webview,
        community_content: community,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> PendingDependencyAction {
        PendingDependencyAction {
            view: DependencyActionPlan {
                id: "review".into(),
                action_id: "h1a.install".into(),
                runtime_id: runtime::RuntimeId::MccSteam,
                project_id: Some("map".into()),
                label: "Review install".into(),
                uri: deps::H1A_INSTALL_URI.into(),
                executable: PathBuf::from("Steam.exe"),
                executable_sha256: "a".repeat(64),
                executable_architecture: "x86".into(),
                arguments: vec![deps::H1A_INSTALL_URI.into()],
                expires_at_unix: 0,
                detail: String::new(),
            },
            owner: "main".into(),
            created: Instant::now(),
            settings_hash: "settings".into(),
            project_fingerprint: Some("mapHash".into()),
        }
    }
    fn current(p: &PendingDependencyAction) -> (PathBuf, String, String) {
        (
            p.view.executable.clone(),
            p.view.executable_sha256.clone(),
            p.view.executable_architecture.clone(),
        )
    }
    #[test]
    fn closed_window_cleanup_preserves_peers_and_prevents_late_preview_insertion() {
        let mut state = DependencyInstallState::default();
        state
            .insert_if_window_present(sample(), |owner| owner == "main")
            .unwrap();
        let mut other = sample();
        other.owner = "other".into();
        other.view.id = "peer-review".into();
        state
            .insert_if_window_present(other, |owner| owner == "other")
            .unwrap();
        state.release("main");
        assert!(!state.plans.contains_key("review"));
        assert!(state.plans.contains_key("peer-review"));
        assert!(state.insert_if_window_present(sample(), |_| false).is_err());
        assert_eq!(state.plans.len(), 1);
        assert!(state.plans.contains_key("peer-review"));
    }
    #[test]
    fn review_rechecks_window_expiry_settings_project_and_file_identity() {
        let p = sample();
        let identity = current(&p);
        let fingerprint = Some("mapHash".into());
        assert!(validate_review(&p, "main", "settings", &fingerprint, &identity).is_ok());
        assert!(
            validate_review(&p, "another-window", "settings", &fingerprint, &identity).is_err()
        );
        assert!(validate_review(&p, "main", "changed", &fingerprint, &identity).is_err());
        assert!(
            validate_review(&p, "main", "settings", &Some("otherMap".into()), &identity).is_err()
        );
        let mut changed = identity.clone();
        changed.1 = "b".repeat(64);
        assert!(validate_review(&p, "main", "settings", &fingerprint, &changed).is_err());
        let mut changed = identity.clone();
        changed.2 = "x86_64".into();
        assert!(validate_review(&p, "main", "settings", &fingerprint, &changed).is_err());
        let mut expired = sample();
        expired.created = Instant::now() - Duration::from_secs(90);
        assert!(validate_review(&expired, "main", "settings", &fingerprint, &identity).is_err());
    }
    #[test]
    fn review_rejects_changed_uri_extra_arguments_and_internal_actions() {
        for (action, uri, args) in [
            (
                "h1a.install",
                "steam://install/1",
                vec!["steam://install/1"],
            ),
            (
                "h1a.install",
                deps::H1A_INSTALL_URI,
                vec![deps::H1A_INSTALL_URI, "-silent"],
            ),
            (
                "invader.choose",
                "invaderDirectory",
                vec!["invaderDirectory"],
            ),
        ] {
            let mut p = sample();
            p.view.action_id = action.into();
            p.view.uri = uri.into();
            p.view.arguments = args.into_iter().map(str::to_owned).collect();
            assert!(validate_review(
                &p,
                "main",
                "settings",
                &Some("mapHash".into()),
                &current(&p)
            )
            .is_err());
        }
    }
    fn write_pe(path: &Path, machine: u16) {
        let mut bytes = vec![0u8; 128];
        bytes[..2].copy_from_slice(b"MZ");
        bytes[60..64].copy_from_slice(&64u32.to_le_bytes());
        bytes[64..68].copy_from_slice(b"PE\0\0");
        bytes[68..70].copy_from_slice(&machine.to_le_bytes());
        fs::write(path, bytes).unwrap();
    }
    #[test]
    fn readonly_header_inspection_separates_tool_architecture_and_hash() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("tool.exe");
        write_pe(&path, 0x014c);
        let first = pe_identity(&path).unwrap();
        assert_eq!(first.2, "x86");
        assert_eq!(first.1, maps::hash_file(&path).unwrap());
        write_pe(&path, 0x8664);
        let second = pe_identity(&path).unwrap();
        assert_eq!(second.2, "x86_64");
        assert_ne!(first.1, second.1);
        write_pe(&path, 0xaa64);
        assert!(pe_identity(&path).is_err());
        fs::write(&path, b"not an executable").unwrap();
        assert!(pe_identity(&path).is_err());
    }
}
#[tauri::command]
pub(super) async fn dependency_report(
    app: tauri::AppHandle,
    runtime_id: runtime::RuntimeId,
    project_id: Option<String>,
) -> Reply<deps::DependencyReport> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        Ok(deps::report(&observation(
            &app,
            &state,
            runtime_id,
            project_id.as_deref(),
        )?))
    })
    .await
    .map_err(error)?
}
fn settings_hash(state: &AppState) -> Reply<String> {
    use sha2::{Digest, Sha256};
    Ok(spark_core::hex_bytes(Sha256::digest(serde_json::to_vec(&*lock(&state.settings)?).map_err(error)?)))
}
fn project_fingerprint(state: &AppState, id: Option<&str>, owner: &str) -> Reply<Option<String>> {
    id.map(|id| {
        check_document_owner(state, id, owner)?;
        lock(&state.library)?
            .get(id)
            .map_err(error)?
            .fingerprint()
            .map_err(error)
    })
    .transpose()
}
fn validate_review(
    pending: &PendingDependencyAction,
    owner: &str,
    settings: &str,
    project: &Option<String>,
    identity: &(PathBuf, String, String),
) -> Reply<()> {
    if pending.owner != owner || pending.created.elapsed() >= Duration::from_secs(90) {
        return Err("Dependency preview belongs to another window or expired".into());
    }
    if settings != pending.settings_hash || project != &pending.project_fingerprint {
        return Err("Setup/project changed since preview; prepare a fresh action".into());
    }
    let allowed = deps::action(&pending.view.action_id).ok_or("Unknown dependency action")?;
    if !matches!(
        allowed.kind,
        deps::DependencyActionKind::InstallH1aViaSteam
            | deps::DependencyActionKind::OpenOfficialPage
    ) || allowed.target.as_deref() != Some(pending.view.uri.as_str())
        || pending.view.arguments != vec![pending.view.uri.clone()]
    {
        return Err("Dependency target differs from the reviewed fixed action".into());
    }
    if identity.0 != pending.view.executable
        || identity.1 != pending.view.executable_sha256
        || identity.2 != pending.view.executable_architecture
    {
        return Err("Launch file changed since dependency review; nothing was opened".into());
    }
    Ok(())
}
pub(super) fn browser_executable() -> Reply<(PathBuf, String, String)> {
    #[cfg(windows)]
    {
        let root = std::env::var_os("SystemRoot")
            .map(PathBuf::from)
            .ok_or("Windows system browser launcher is unavailable")?;
        if !root.is_absolute() {
            return Err("System browser launcher root is not absolute".into());
        }
        return pe_identity(&root.join("explorer.exe"));
    }
    #[cfg(not(windows))]
    {
        Err("Open the displayed authoritative link in your browser; this native launch route is implemented for Windows only".into())
    }
}
#[tauri::command]
pub(super) async fn prepare_dependency_action(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    runtime_id: runtime::RuntimeId,
    project_id: Option<String>,
    action_id: String,
) -> Reply<DependencyActionPlan> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();let fingerprint=project_fingerprint(&state,project_id.as_deref(),&owner)?;
        let report=deps::report(&observation(&app,&state,runtime_id,project_id.as_deref())?);
        let action=report.items.iter().flat_map(|item|&item.actions).find(|a|a.id==action_id).ok_or("This dependency action is not applicable to the selected runtime/project")?;
        let uri=action.target.clone().ok_or("This action opens an internal picker/workspace instead of an external program")?;
        let (executable,hash,arch)=match action.kind {
            deps::DependencyActionKind::InstallH1aViaSteam=>{if uri!=deps::H1A_INSTALL_URI||runtime_id!=runtime::RuntimeId::MccSteam||!cfg!(windows){return Err("Unknown Steam install target".into());}let settings=selected_settings(&state,None)?;let steam=actual_steam(&settings);let path=steam.steam_executable.ok_or("Choose the installed Steam client first")?;if !path.file_name().is_some_and(|s|s.eq_ignore_ascii_case("steam.exe")){return Err("Discovered Steam executable identity is invalid".into());}pe_identity(&path)?},
            deps::DependencyActionKind::OpenOfficialPage=>{if deps::action(&action_id).and_then(|a|a.target).as_deref()!=Some(uri.as_str())||!uri.starts_with("https://"){return Err("Only fixed authoritative HTTPS pages are allowed".into());}browser_executable()?},
            _=>return Err("Use the dependency folder/resource picker for this action".into()),
        };
        let id=uuid::Uuid::new_v4().to_string();let view=DependencyActionPlan{id:id.clone(),action_id:action_id.clone(),runtime_id,project_id,label:action.label.clone(),uri:uri.clone(),executable,executable_sha256:hash,executable_architecture:arch,arguments:vec![uri],expires_at_unix:chrono::Utc::now().timestamp().max(0)as u64+90,detail:if action.kind==deps::DependencyActionKind::InstallH1aViaSteam{"Opens Steam's official app1532190 installation UI. Steam manages any login/download/install after your review. Spark does not download or execute an installer."}else{"Opens this fixed authoritative page in your own browser. Downloading, verifying and selecting a tool remains explicit; no installer or Invader/SDK binary runs."}.into()};
        let ticket=PendingDependencyAction{view,owner,created:Instant::now(),settings_hash:settings_hash(&state)?,project_fingerprint:fingerprint};
        let mut pending=lock(&state.dependency_install)?;
        pending.insert_if_window_present(ticket,|owner|app.get_webview_window(owner).is_some())
    }).await.map_err(error)?
}
#[tauri::command]
pub(super) async fn discard_dependency_action(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    plan_id: String,
) -> Reply<()> {
    let state = app.state::<AppState>();
    let mut pending = lock(&state.dependency_install)?;
    if pending
        .plans
        .get(&plan_id)
        .is_some_and(|p| p.owner != window.label())
    {
        return Err("Dependency preview belongs to another window".into());
    }
    pending.plans.remove(&plan_id);
    Ok(())
}
#[tauri::command]
pub(super) async fn run_dependency_action(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    plan_id: String,
    confirmed: bool,
) -> Reply<DependencyActionResult> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move||{
        if !confirmed{return Err("Review the exact URI, executable and fingerprint before opening it".into());}
        let state=app.state::<AppState>();let pending={let mut state=lock(&state.dependency_install)?;if state.plans.get(&plan_id).is_some_and(|p|p.owner!=owner){return Err("Dependency preview belongs to another window".into());}state.plans.remove(&plan_id).ok_or("Dependency preview expired or was already used")?};
        let allowed=deps::action(&pending.view.action_id).ok_or("Unknown dependency action")?;
        let fresh=deps::report(&observation(&app,&state,pending.view.runtime_id,pending.view.project_id.as_deref())?);
        if !fresh.items.iter().flat_map(|item|&item.actions).any(|action|action.id==pending.view.action_id){return Err("Dependency requirements changed; prepare a fresh action".into());}
        let current=if allowed.kind==deps::DependencyActionKind::InstallH1aViaSteam {
            let settings=selected_settings(&state,None)?;let installation=actual_steam(&settings);let file=installation.steam_executable.ok_or("Steam installation changed")?;pe_identity(&file)?
        }else{browser_executable()?};
        validate_review(&pending,&owner,&settings_hash(&state)?,&project_fingerprint(&state,pending.view.project_id.as_deref(),&owner)?,&current)?;
        let mut command=steam::command(pending.view.executable.to_string_lossy().as_ref());command.args(&pending.view.arguments).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());command.spawn().map_err(error)?;
        Ok(DependencyActionResult{action_id:pending.view.action_id,outcome:"handedOffUnobserved".into(),detail:"The reviewed action was handed to Steam/your browser. Download, installation, verification and successful use have not been observed; refresh setup afterward.".into()})
    }).await.map_err(error)?
}

#[tauri::command]
pub(super) async fn choose_dependency_path(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    runtime_id: runtime::RuntimeId,
    project_id: Option<String>,
    action_id: String,
) -> Reply<DependencyChoiceResult> {
    let owner = window.label().to_owned();
    let action = deps::action(&action_id).ok_or("Unknown dependency picker")?;
    let initial_fingerprint = {
        let state = app.state::<AppState>();
        let fingerprint = project_fingerprint(&state, project_id.as_deref(), &owner)?;
        if let Some(id) = project_id.as_ref() {
            let project = lock(&state.library)?.get(id).map_err(error)?;
            if matches!(
                action_id.as_str(),
                "h1a.choose" | "tags.choose" | "invader.choose"
            ) && project
                .active_build_target
                .as_ref()
                .and_then(|id| project.build_targets.iter().find(|target| &target.id == id))
                .is_some_and(|target| target.runtime_id != runtime_id)
            {
                return Err("The selected runtime differs from this map's active tool profile. Select the matching profile before changing its tools.".into());
            }
        }
        fingerprint
    };
    if action.kind == deps::DependencyActionKind::ChooseResources {
        let id = project_id.ok_or("Open an imported source map before choosing its resources")?;
        let mcc = {
            let state = app.state::<AppState>();
            let project = lock(&state.library)?.get(&id).map_err(error)?;
            project
                .source
                .as_ref()
                .is_some_and(|s| s.cache_version == 13)
        };
        if mcc {
            return Ok(DependencyChoiceResult {
                bootstrap: None,
                opened: Some(
                    super::connect_mcc_texture_resources(app.clone(), window.clone(), id).await?,
                ),
            });
        }
        let chosen = rfd::AsyncFileDialog::new()
            .set_title("Choose this source map's matching original resources")
            .pick_folder()
            .await;
        let Some(chosen) = chosen else {
            return Ok(DependencyChoiceResult {
                bootstrap: None,
                opened: None,
            });
        };
        let folder = chosen.path().to_path_buf();
        return tauri::async_runtime::spawn_blocking(move || {
            let state = app.state::<AppState>();
            if project_fingerprint(&state, Some(&id), &owner)? != initial_fingerprint {
                return Err(
                    "Map changed while its resource picker was open; select resources again".into(),
                );
            }
            core::reject_links(&folder).map_err(error)?;
            let hashes = project::resource_hashes(&folder).map_err(error)?;
            let mut project = lock(&state.library)?.get(&id).map_err(error)?;
            let source = project
                .source
                .as_mut()
                .ok_or("Project has no imported map source")?;
            source.resource_directory = Some(folder.clone());
            source.resource_sha256 = hashes;
            let mut inspection =
                maps::inspect_map(&source.preserved_path, Some(&folder)).map_err(error)?;
            inspection.header.extended |= source
                .original_path
                .extension()
                .is_some_and(|x| x.eq_ignore_ascii_case("yelo"));
            if inspection.sha256 != source.sha256 {
                return Err("Preserved source changed during resource inspection".into());
            }
            if project_fingerprint(&state, Some(&id), &owner)? != initial_fingerprint {
                return Err("Map changed during resource inspection; nothing was saved".into());
            }
            project.modified_at = chrono::Utc::now().to_rfc3339();
            lock(&state.library)?
                .save(&project, Some(&inspection))
                .map_err(error)?;
            lock(&state.inspections)?.insert(id, Arc::new(inspection.clone()));
            Ok(DependencyChoiceResult {
                bootstrap: None,
                opened: Some(OpenProject {
                    project,
                    inspection: Some(inspection),
                }),
            })
        })
        .await
        .map_err(error)?;
    }
    if action.kind != deps::DependencyActionKind::ChooseSetting {
        return Err("Open the model/animation workspace for this requirement".into());
    }
    let key = action
        .target
        .clone()
        .ok_or("Dependency picker has no fixed setting")?;
    let chosen = rfd::AsyncFileDialog::new()
        .set_title(&action.label)
        .pick_folder()
        .await;
    let Some(chosen) = chosen else {
        return Ok(DependencyChoiceResult {
            bootstrap: None,
            opened: None,
        });
    };
    let folder = chosen.path().to_path_buf();
    core::reject_links(&folder).map_err(error)?;
    if !folder.is_dir() {
        return Err("Choose an existing installed/source folder".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        if project_fingerprint(&state, project_id.as_deref(), &owner)? != initial_fingerprint {
            return Err("Map changed while its tool picker was open; choose the path again".into());
        }
        let mut settings = lock(&state.settings)?.clone();
        match key.as_str() {
            "steamDirectory" => settings.steam_directory = Some(folder.clone()),
            "mccDirectory" => settings.mcc_directory = Some(folder.clone()),
            "invaderDirectory" => settings.invader_directory = Some(folder.clone()),
            "hekDirectory" => {
                if runtime_id != runtime::RuntimeId::MccSteam {
                    return Err("H1A kit selection applies to the MCC profile".into());
                }
                settings.hek_directory = Some(folder.clone());
                settings.hek_flavor = Some("h1aEk".into());
            }
            "hekTagsDirectory" => settings.hek_tags_directory = Some(folder.clone()),
            _ => return Err("Unknown dependency setting".into()),
        }
        // Store a per-map tool choice in that map's active target when present.
        let mut opened = None;
        if let Some(id) = project_id {
            let mut project = lock(&state.library)?.get(&id).map_err(error)?;
            if let Some(index) = project.active_build_target.as_ref().and_then(|active| {
                project
                    .build_targets
                    .iter()
                    .position(|target| &target.id == active)
            }) {
                let target = &mut project.build_targets[index];
                match key.as_str() {
                    "hekDirectory" => {
                        target.hek_directory = Some(folder);
                        target.hek_flavor = Some("h1aEk".into());
                    }
                    "hekTagsDirectory" => target.tags_directory = Some(folder),
                    "invaderDirectory" => target.invader_directory = Some(folder),
                    _ => {}
                }
                project.modified_at = chrono::Utc::now().to_rfc3339();
                lock(&state.library)?.save(&project, None).map_err(error)?;
                opened = Some(OpenProject {
                    project,
                    inspection: None,
                });
            }
        }
        configure(&app, &state, settings)?;
        Ok(DependencyChoiceResult {
            bootstrap: Some(bootstrap_state(&state)?),
            opened,
        })
    })
    .await
    .map_err(error)?
}
