//! Explicit installation of one pinned, user-requested community archive.
//! The archive is data until its complete hash and extracted files are checked.
//! No bundled setup, updater, registration program or game executable is run.
use super::*;
use reqwest::blocking::Client;
use sha2::{Digest, Sha256};
use std::io::Write;
use std::sync::atomic::AtomicU64;

pub(super) const SOURCE: &str =
    "https://archive.org/download/halo-custom-edition-v-1.10/Halo%20Custom%20Edition%20v1.10.7z";
const ARCHIVE_SHA256: &str = "33cf0e24551db62a08239d29077afbf9cdb2aec5c13234022c38ef144d486a3a";
const ARCHIVE_BYTES: u64 = 97_046_282;
const MAX_EXPANDED: u64 = 512 * 1024 * 1024;
const PREFIX: &str = "Halo Custom Edition/";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Installation {
    pub(super) root: PathBuf,
    executable_sha256: String,
    registered: bool,
    startup_issues: Vec<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Status {
    source_url: &'static str,
    archive_sha256: &'static str,
    archive_bytes: u64,
    installation: Option<Installation>,
    can_extract: bool,
    job: Option<JobView>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct JobView {
    id: String,
    phase: String,
    bytes: u64,
    total: u64,
    detail: String,
    root: Option<PathBuf>,
}
struct Job {
    owner: String,
    library_root: PathBuf,
    cancelled: AtomicBool,
    bytes: AtomicU64,
    view: Mutex<JobView>,
}
static JOB: Mutex<Option<Arc<Job>>> = Mutex::new(None);

pub(super) fn release_window(state: &AppState, owner: &str) {
    if let Ok(slot) = JOB.lock() {
        if let Some(job) = slot
            .as_ref()
            .filter(|job| job.owner == owner && job.library_root == state.root)
        {
            job.cancelled.store(true, Ordering::Relaxed);
        }
    }
}

fn check_cancel(job: &Job) -> Reply<()> {
    if job.cancelled.load(Ordering::Relaxed) {
        Err("Installation cancelled; existing installations were not changed".into())
    } else {
        Ok(())
    }
}
fn request_cancel(job: &Job, owner: &str, root: &Path, id: &str) -> Reply<()> {
    if job.owner != owner || job.library_root != root || lock(&job.view)?.id != id {
        return Err("This installation belongs to another window".into());
    }
    if active(&job_view(job)?) {
        job.cancelled.store(true, Ordering::Relaxed);
        phase(
            job,
            "cancelling",
            "Cancelling the current transfer; existing installations stay intact…",
        )?;
    }
    Ok(())
}
fn phase(job: &Job, name: &str, detail: &str) -> Reply<()> {
    let mut view = lock(&job.view)?;
    view.phase = name.into();
    view.detail = detail.into();
    Ok(())
}
fn job_view(job: &Job) -> Reply<JobView> {
    let mut view = lock(&job.view)?.clone();
    view.bytes = job.bytes.load(Ordering::Relaxed);
    Ok(view)
}
fn active(view: &JobView) -> bool {
    !matches!(view.phase.as_str(), "complete" | "failed" | "cancelled")
}
fn tar() -> Reply<PathBuf> {
    if !cfg!(windows) {
        return Err("This Custom Edition installation route currently requires Windows".into());
    }
    let root = std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .ok_or("Windows extraction tool is unavailable")?;
    if !root.is_absolute() {
        return Err("Windows extraction tool root is not absolute".into());
    }
    let file = root.join("System32/tar.exe");
    dependency_install::pe_identity(&file).map(|v| v.0)
}
fn run_tar(tool: &Path, arguments: &[String], job: &Job) -> Reply<String> {
    let mut command = steam::command(tool.to_string_lossy().as_ref());
    let mut child = command
        .args(arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(error)?;
    let out = child.stdout.take().unwrap();
    let err = child.stderr.take().unwrap();
    let output = std::thread::spawn(move || {
        let mut bytes = vec![];
        out.take(256 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    let errors = std::thread::spawn(move || {
        let mut bytes = vec![];
        err.take(64 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    let began = Instant::now();
    let result = loop {
        if let Err(e) = check_cancel(job) {
            let _ = child.kill();
            let _ = child.wait();
            break Err(e);
        }
        if began.elapsed() > Duration::from_secs(60) {
            let _ = child.kill();
            let _ = child.wait();
            break Err(
                "Windows archive extraction timed out; retry or use the browser download".into(),
            );
        }
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => std::thread::sleep(Duration::from_millis(40)),
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(error(e));
            }
        }
    };
    let out = output
        .join()
        .map_err(|_| "Archive output reader stopped")?
        .map_err(error)?;
    let err = errors
        .join()
        .map_err(|_| "Archive error reader stopped")?
        .map_err(error)?;
    let status = result?;
    if out.len() > 256 * 1024 || err.len() > 64 * 1024 {
        return Err("Archive listing exceeded its output bound".into());
    }
    if !status.success() {
        return Err(format!(
            "Windows could not read this 7z archive: {}",
            String::from_utf8_lossy(&err)
        ));
    }
    String::from_utf8(out).map_err(error)
}
fn safe_member(name: &str) -> bool {
    if !name.starts_with(PREFIX)
        || name.len() > 240
        || !name.is_ascii()
        || name.contains(['\\', ':'])
        || name.chars().any(char::is_control)
    {
        return false;
    }
    name.trim_end_matches('/').split('/').all(|part| {
        let stem = part.split('.').next().unwrap_or("").to_ascii_uppercase();
        !part.is_empty()
            && part != "."
            && part != ".."
            && !part.ends_with([' ', '.'])
            && !matches!(
                stem.as_str(),
                "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
            )
            && !(stem.len() == 4
                && (stem.starts_with("COM") || stem.starts_with("LPT"))
                && stem.as_bytes()[3].is_ascii_digit())
    })
}
pub(super) fn selected_member(name: &str) -> bool {
    let Some(local) = name.strip_prefix(PREFIX) else {
        return false;
    };
    if local.ends_with('/') {
        return false;
    }
    let root_files = [
        "haloce.exe",
        "haloceded.exe",
        "binkw32.dll",
        "Keystone.dll",
        "ksimeui.dll",
        "Eula.dll",
        "msvcr71.dll",
        "ogg.dll",
        "strings.dll",
        "vorbis.dll",
        "vorbisfile.dll",
        "config.txt",
        "Eula.rtf",
        "Readme.rtf",
        "xiph_license.txt",
    ];
    root_files.contains(&local)
        || ["controls/Controls.dll", "controls/loader.dll"].contains(&local)
        || (["maps/", "shaders/", "controls/", "content/"]
            .iter()
            .any(|prefix| local.starts_with(prefix))
            && ![".exe", ".dll", ".msi", ".bat", ".cmd"]
                .iter()
                .any(|suffix| local.to_ascii_lowercase().ends_with(suffix)))
}
fn archive_matches(bytes: u64, digest: &str) -> Reply<()> {
    if bytes != ARCHIVE_BYTES || digest != ARCHIVE_SHA256 {
        return Err("Custom Edition download differs from the reviewed archive; it was not extracted or registered".into());
    }
    Ok(())
}
pub(super) fn inspect_root(root: &Path) -> Reply<Installation> {
    core::reject_links(root).map_err(error)?;
    let root = fs::canonicalize(root).map_err(error)?;
    let (_, executable_sha256, architecture) =
        dependency_install::pe_identity(&root.join("haloce.exe"))?;
    if architecture != "x86" {
        return Err("Custom Edition requires its native x86 executable".into());
    }
    for (name, kind) in [("bitmaps.map", 1u32), ("sounds.map", 2), ("loc.map", 3)] {
        let file = root.join("maps").join(name);
        core::reject_links(&file).map_err(error)?;
        let mut handle = fs::File::open(&file).map_err(error)?;
        let mut header = [0u8; 16];
        handle.read_exact(&mut header).map_err(error)?;
        if u32::from_le_bytes(header[..4].try_into().unwrap()) != kind {
            return Err(format!("Custom Edition {name} has the wrong resource type"));
        }
        let length = handle.metadata().map_err(error)?.len();
        let end = u32::from_le_bytes(header[8..12].try_into().unwrap()) as u64;
        let count = u32::from_le_bytes(header[12..16].try_into().unwrap()) as u64;
        if count == 0
            || count > 65_535
            || end < 16
            || end.checked_add(count * 12).is_none_or(|end| end > length)
        {
            return Err(format!(
                "Custom Edition {name} has an invalid resource index"
            ));
        }
    }
    let ui = root.join("maps/ui.map");
    core::reject_links(&ui).map_err(error)?;
    let mut handle = fs::File::open(&ui).map_err(error)?;
    let mut header = [0u8; 2048];
    handle.read_exact(&mut header).map_err(error)?;
    if &header[..4] != b"daeh"
        || u32::from_le_bytes(header[4..8].try_into().unwrap()) != 609
        || &header[2044..] != b"toof"
    {
        return Err("Custom Edition requires a real version-609 ui.map".into());
    }
    core::reject_links(&root.join("shaders")).map_err(error)?;
    if !root.join("shaders").is_dir() {
        return Err("Custom Edition shaders folder is missing".into());
    }
    Ok(Installation {
        startup_issues: startup_issues(&root),
        root,
        executable_sha256,
        registered: false,
    })
}
fn startup_issues(root: &Path) -> Vec<String> {
    let mut issues = Vec::new();
    for name in [
        "Eula.dll",
        "Keystone.dll",
        "ksimeui.dll",
        "msvcr71.dll",
        "controls/Controls.dll",
        "controls/loader.dll",
    ] {
        if !dependency_install::pe_identity(&root.join(name))
            .is_ok_and(|(_, _, architecture)| architecture == "x86")
        {
            issues.push(name.into());
        }
    }
    let license = root.join("Eula.rtf");
    if core::reject_links(&license).is_err()
        || !fs::metadata(&license).is_ok_and(|m| m.is_file() && (1..=256 * 1024).contains(&m.len()))
    {
        issues.push("Eula.rtf".into());
    }
    issues
}
pub(super) fn require_startup(root: &Path) -> Reply<()> {
    let issues = startup_issues(root);
    if issues.is_empty() {
        Ok(())
    } else {
        Err(format!("Custom Edition startup files are missing or invalid: {}. Connect a complete installation or use Settings → Dependencies & setup → Install separate copy. Existing server/source files were not changed.", issues.join(", ")))
    }
}
fn registration(root: &Path) -> runtime::RuntimeRegistration {
    runtime::RuntimeRegistration {
        id: uuid::Uuid::new_v4().to_string(),
        runtime_id: runtime::RuntimeId::HaloCustomEdition,
        root: root.into(),
        executable: root.join("haloce.exe"),
        data_root: Some(root.into()),
        version: None,
        network_version: None,
    }
}
fn register(state: &AppState, found: &Installation) -> Reply<()> {
    let registration = registration(&found.root);
    runtime::inspect_registration(&registration).map_err(error)?;
    let library = lock(&state.library)?;
    let mut registrations: Vec<runtime::RuntimeRegistration> =
        library.setting("runtimeRegistrations").map_err(error)?;
    registrations.retain(|r| r.runtime_id != runtime::RuntimeId::HaloCustomEdition);
    registrations.push(registration);
    library
        .set_setting("runtimeRegistrations", &registrations)
        .map_err(error)
}
pub(super) fn discover(state: &AppState) -> Reply<Option<Installation>> {
    let registrations: Vec<runtime::RuntimeRegistration> = lock(&state.library)?
        .setting("runtimeRegistrations")
        .map_err(error)?;
    if let Some(registration) = registrations
        .iter()
        .find(|r| r.runtime_id == runtime::RuntimeId::HaloCustomEdition)
    {
        if let Ok(mut found) = inspect_root(&registration.root) {
            found.registered = true;
            return Ok(Some(found));
        }
    }
    let mut candidates = vec![];
    for key in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(root) = std::env::var_os(key) {
            candidates.push(PathBuf::from(root).join("Microsoft Games/Halo Custom Edition"));
        }
    }
    for start in [
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(Path::to_path_buf)),
        std::env::current_dir().ok(),
    ]
    .into_iter()
    .flatten()
    {
        for ancestor in start.ancestors().take(6) {
            candidates.push(ancestor.join("Halo Custom Edition"));
        }
    }
    for candidate in candidates {
        if let Ok(found) = inspect_root(&candidate) {
            return Ok(Some(found));
        }
    }
    Ok(None)
}
fn install(app: &tauri::AppHandle, job: &Job) -> Reply<PathBuf> {
    let state = app.state::<AppState>();
    let parent = state.root.join("runtimes");
    core::reject_links(&parent).map_err(error)?;
    fs::create_dir_all(&parent).map_err(error)?;
    core::reject_links(&parent).map_err(error)?;
    let stage = parent.join(format!("ce-staging-{}", lock(&job.view)?.id));
    fs::create_dir(&stage).map_err(error)?;
    let archive = stage.join("custom-edition.7z");
    phase(
        job,
        "downloading",
        "Downloading the selected 92.6 MiB community archive…",
    )?;
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(180))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            let url = attempt.url();
            if attempt.previous().len() >= 4
                || url.scheme() != "https"
                || url.port_or_known_default() != Some(443)
                || !url
                    .host_str()
                    .is_some_and(|host| host == "archive.org" || host.ends_with(".archive.org"))
            {
                attempt.error("Archive redirect is outside the reviewed HTTPS host")
            } else {
                attempt.follow()
            }
        }))
        .user_agent("Project-Guilty-Spark/0.4 Custom Edition setup")
        .build()
        .map_err(error)?;
    let mut response = client
        .get(SOURCE)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(error)?;
    if response
        .content_length()
        .is_some_and(|size| size != ARCHIVE_BYTES)
    {
        return Err("Custom Edition archive size changed; extraction refused".into());
    }
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&archive)
        .map_err(error)?;
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    let mut bytes = 0u64;
    loop {
        check_cancel(job)?;
        let count = response.read(&mut buffer).map_err(error)?;
        if count == 0 {
            break;
        }
        bytes += count as u64;
        if bytes > ARCHIVE_BYTES {
            return Err("Custom Edition archive exceeded its reviewed size".into());
        }
        file.write_all(&buffer[..count]).map_err(error)?;
        digest.update(&buffer[..count]);
        job.bytes.store(bytes, Ordering::Relaxed);
    }
    file.sync_all().map_err(error)?;
    drop(file);
    archive_matches(bytes, &format!("{:x}", digest.finalize()))?;
    check_cancel(job)?;
    // Keep a read-only sharing handle across listing/extraction so another
    // Windows process cannot replace or change the just-verified archive.
    let mut archive_options = fs::OpenOptions::new();
    archive_options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        archive_options.share_mode(1);
    }
    let archive_guard = archive_options.open(&archive).map_err(error)?;
    phase(
        job,
        "extracting",
        "Archive identity checked. Extracting game files into a new private folder…",
    )?;
    let tool = tar()?;
    let tool_hash = maps::hash_file(&tool).map_err(error)?;
    let archive_path = archive.to_string_lossy().into_owned();
    let listing = run_tar(&tool, &["-tf".into(), archive_path.clone()], job)?;
    let names: Vec<_> = listing.lines().collect();
    if names.is_empty() || names.len() > 2048 || names.iter().any(|name| !safe_member(name)) {
        return Err(
            "Unsafe or unexpected Custom Edition archive member; nothing registered".into(),
        );
    }
    let kinds = run_tar(&tool, &["-tvf".into(), archive_path.clone()], job)?;
    if kinds.lines().any(|line| !line.starts_with(['-', 'd'])) {
        return Err("Linked/special archive files are not installable".into());
    }
    let selected: Vec<_> = names
        .into_iter()
        .filter(|name| selected_member(name))
        .map(str::to_owned)
        .collect();
    if selected.len() > 512 || selected.iter().map(String::len).sum::<usize>() > 24_000 {
        return Err("Game archive selection exceeded its bound".into());
    }
    if maps::hash_file(&archive).map_err(error)? != ARCHIVE_SHA256
        || maps::hash_file(&tool).map_err(error)? != tool_hash
    {
        return Err("Archive or extraction tool changed before extraction".into());
    }
    let mut arguments = vec![
        "-xf".into(),
        archive_path,
        "-C".into(),
        stage.to_string_lossy().into_owned(),
        "--".into(),
    ];
    arguments.extend(selected.clone());
    run_tar(&tool, &arguments, job)?;
    drop(archive_guard);
    check_cancel(job)?;
    phase(
        job,
        "checking",
        "Checking extracted game, resources and native map headers…",
    )?;
    let mut inventory = std::collections::BTreeMap::new();
    let mut total = 0u64;
    for name in &selected {
        let path = stage.join(name);
        core::reject_links(&path).map_err(error)?;
        let metadata = fs::metadata(&path).map_err(error)?;
        if !metadata.is_file() {
            return Err("Extracted game entry is not a regular file".into());
        }
        total = total
            .checked_add(metadata.len())
            .ok_or("Extracted size overflow")?;
        if total > MAX_EXPANDED {
            return Err("Extracted game exceeded its size bound".into());
        }
        inventory.insert(name.clone(), maps::hash_file(&path).map_err(error)?);
    }
    let found = inspect_root(&stage.join("Halo Custom Edition"))?;
    require_startup(&found.root)?;
    dependency_install::pe_identity(&found.root.join("haloceded.exe"))?;
    let receipt = serde_json::json!({"schemaVersion":1,"sourceUrl":SOURCE,"archiveSha256":ARCHIVE_SHA256,"archiveBytes":bytes,
        "publisherAuthenticated":false,"extractorSha256":tool_hash,"files":inventory,"gameplayVerified":false,"createdAt":chrono::Utc::now().to_rfc3339()});
    fs::write(
        stage.join("spark-ce-install.json"),
        serde_json::to_vec_pretty(&receipt).map_err(error)?,
    )
    .map_err(error)?;
    check_cancel(job)?;
    let destination = parent.join(format!("custom-edition-{}", lock(&job.view)?.id));
    fs::rename(&stage, &destination).map_err(error)?;
    let found = inspect_root(&destination.join("Halo Custom Edition"))?;
    register(&state, &found)?;
    Ok(found.root)
}
#[tauri::command]
pub(super) async fn custom_edition_setup(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Reply<Status> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let job = lock(&JOB)?
            .as_ref()
            .filter(|job| job.owner == owner && job.library_root == state.root)
            .map(|job| job_view(job))
            .transpose()?;
        Ok(Status {
            source_url: SOURCE,
            archive_sha256: ARCHIVE_SHA256,
            archive_bytes: ARCHIVE_BYTES,
            installation: discover(&state)?,
            can_extract: tar().is_ok(),
            job,
        })
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub(super) async fn install_custom_edition(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    confirmed: bool,
) -> Reply<JobView> {
    if !confirmed {
        return Err("Choose Install Custom Edition to download this community archive".into());
    }
    tar()?;
    let state = app.state::<AppState>();
    let mut slot = lock(&JOB)?;
    if slot
        .as_ref()
        .is_some_and(|job| job_view(job).is_ok_and(|view| active(&view)))
    {
        return Err("A Custom Edition installation is already running".into());
    }
    // Destroyed cleanup takes this same mutex. A window closed during the
    // initial tool inspection must not leave an orphan background download.
    if app.get_webview_window(window.label()).is_none() {
        return Err("The setup window closed before installation started".into());
    }
    let job = Arc::new(Job {
        owner: window.label().into(),
        library_root: state.root.clone(),
        cancelled: AtomicBool::new(false),
        bytes: AtomicU64::new(0),
        view: Mutex::new(JobView {
            id: uuid::Uuid::new_v4().to_string(),
            phase: "queued".into(),
            bytes: 0,
            total: ARCHIVE_BYTES,
            detail: "Preparing a separate Custom Edition installation…".into(),
            root: None,
        }),
    });
    let view = job_view(&job)?;
    *slot = Some(job.clone());
    drop(slot);
    tauri::async_runtime::spawn_blocking(move || match install(&app, &job) {
        Ok(root) => {
            if let Ok(mut view) = job.view.lock() {
                view.phase = "complete".into();
                view.detail = "Custom Edition installed and connected. Open Online or Find tools to launch it; game play remains a separate test.".into();
                view.root = Some(root);
            }
        }
        Err(e) => {
            let _ = phase(
                &job,
                if job.cancelled.load(Ordering::Relaxed) {
                    "cancelled"
                } else {
                    "failed"
                },
                &e,
            );
        }
    });
    Ok(view)
}
#[tauri::command]
pub(super) fn cancel_custom_edition_setup(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    job_id: String,
) -> Reply<()> {
    let slot = lock(&JOB)?;
    let job = slot.as_ref().ok_or("Installation is no longer available")?;
    request_cancel(job, window.label(), &app.state::<AppState>().root, &job_id)
}
#[tauri::command]
pub(super) async fn connect_custom_edition(
    app: tauri::AppHandle,
    choose_folder: bool,
    expected_sha256: Option<String>,
) -> Reply<Installation> {
    let folder = if choose_folder {
        rfd::AsyncFileDialog::new()
            .set_title("Choose Halo Custom Edition (contains haloce.exe and maps)")
            .pick_folder()
            .await
            .map(|f| f.path().to_path_buf())
            .ok_or("Folder selection cancelled")?
    } else {
        discover(&app.state::<AppState>())?
            .ok_or("Custom Edition is no longer detected; choose its folder")?
            .root
    };
    tauri::async_runtime::spawn_blocking(move || {
        let mut found = inspect_root(&folder)?;
        if !choose_folder && expected_sha256.as_deref() != Some(&found.executable_sha256) {
            return Err("Detected Custom Edition changed; refresh before connecting it".into());
        }
        register(&app.state::<AppState>(), &found)?;
        found.registered = true;
        Ok(found)
    })
    .await
    .map_err(error)?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_reviewed_game_members_are_selected() {
        for name in [
            "haloce.exe",
            "haloceded.exe",
            "maps/bloodgulch.map",
            "shaders/pshader.bin",
            "msvcr71.dll",
            "Eula.dll",
            "controls/Controls.dll",
            "controls/loader.dll",
        ] {
            assert!(selected_member(&format!("{PREFIX}{name}")));
        }
        for name in [
            "Setup/setup.exe",
            "GSArcade.exe",
            "haloupdate.exe",
            "Uninstal.exe",
            "redist/msxmlenu.msi",
            "maps/autorun.exe",
            "content/test.cmd",
            "maps/",
        ] {
            assert!(!selected_member(&format!("{PREFIX}{name}")));
        }
    }
    #[test]
    fn traversal_and_windows_aliases_are_refused() {
        for name in [
            "Halo Custom Edition/maps/",
            "Halo Custom Edition/haloce.exe",
        ] {
            assert!(safe_member(name));
        }
        for name in [
            "Halo Custom Edition/../haloce.exe",
            "Halo Custom Edition/maps/C:NUL",
            "Halo Custom Edition/CON.bin",
            "Halo Custom Edition/maps/a. ",
            "Halo Custom Edition/maps\\escape",
            "Halo Custom Edition//a",
            "/Halo Custom Edition/a",
            "Halo Custom Edition/maps/LPT1.txt",
            "Halo Custom Edition/maps/a\n",
        ] {
            assert!(!safe_member(name), "{name}");
        }
    }
    #[test]
    fn changed_truncated_or_oversized_archives_never_extract() {
        assert!(archive_matches(ARCHIVE_BYTES, ARCHIVE_SHA256).is_ok());
        assert!(archive_matches(ARCHIVE_BYTES - 1, ARCHIVE_SHA256).is_err());
        assert!(archive_matches(ARCHIVE_BYTES + 1, ARCHIVE_SHA256).is_err());
        assert!(archive_matches(ARCHIVE_BYTES, &"0".repeat(64)).is_err());
    }
    #[test]
    fn another_window_library_or_job_cannot_cancel_installation() {
        let job = Job {
            owner: "owner".into(),
            library_root: PathBuf::from("owned-library"),
            cancelled: AtomicBool::new(false),
            bytes: AtomicU64::new(0),
            view: Mutex::new(JobView {
                id: "job".into(),
                phase: "downloading".into(),
                bytes: 0,
                total: ARCHIVE_BYTES,
                detail: String::new(),
                root: None,
            }),
        };
        for (owner, root, id) in [
            ("other", "owned-library", "job"),
            ("owner", "other-library", "job"),
            ("owner", "owned-library", "other-job"),
        ] {
            assert!(request_cancel(&job, owner, Path::new(root), id).is_err());
            assert!(!job.cancelled.load(Ordering::Relaxed));
            assert_eq!(job_view(&job).unwrap().phase, "downloading");
        }
        request_cancel(&job, "owner", Path::new("owned-library"), "job").unwrap();
        assert!(check_cancel(&job).is_err());
        assert_eq!(job_view(&job).unwrap().phase, "cancelling");
    }
}
