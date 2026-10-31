//! Owned, window-scoped, loopback-only classic CE dedicated processes.
//! No public listing, arbitrary console commands, binary patches or remote tools.
use super::*;
use sha2::{Digest, Sha256};
use spark_core::ce_host as ce;
use std::{
    collections::BTreeMap,
    io::Write,
    net::{Ipv4Addr, SocketAddrV4, UdpSocket},
    process::{Child, Command},
};

const MAX_COPY_BYTES: u64 = 512 * 1024 * 1024;
const MAX_FILES: usize = 512;

#[path = "ce_host_client.rs"]
mod client;

#[derive(Default)]
pub(super) struct HostRegistry {
    jobs: HashMap<String, Arc<Job>>,
}
struct Job {
    stop: AtomicBool,
    view: Mutex<View>,
    client: client::State,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct View {
    id: String,
    phase: String,
    detail: String,
    map: String,
    game_type: ce::GameType,
    maximum_players: u8,
    name: String,
    requested_port: u16,
    port: u16,
    process_id: Option<u32>,
    executable_sha256: String,
    map_sha256: String,
    source_build: Option<BuildProvenance>,
    session_directory: Option<PathBuf>,
    copied_bytes: u64,
    status: Option<ce::Status>,
    observations: u64,
    elapsed_ms: u64,
    console_tail: String,
    client: Option<client::View>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Catalog {
    executable_sha256: String,
    maps: Vec<MapChoice>,
    project_id: Option<String>,
    project_issue: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MapChoice {
    name: String,
    sha256: String,
    source_build: Option<BuildProvenance>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildProvenance {
    #[serde(flatten)]
    source: ce::ProjectBuild,
    project_title: String,
    project_fingerprint: String,
}
struct PinnedMap {
    file: PathBuf,
    source_build: Option<BuildProvenance>,
}
fn active(view: &View) -> bool {
    !matches!(view.phase.as_str(), "stopped" | "failed")
}
fn current(registry: &HostRegistry, owner: &str) -> Reply<Option<View>> {
    registry
        .jobs
        .get(owner)
        .map(|job| session_view(job))
        .transpose()
}
fn session_view(job: &Job) -> Reply<View> {
    let mut view = lock(&job.view)?.clone();
    view.client = job.client.view()?;
    Ok(view)
}
fn owned_job(registry: &HostRegistry, owner: &str, id: &str) -> Reply<Arc<Job>> {
    registry
        .jobs
        .get(owner)
        .filter(|job| job.view.lock().is_ok_and(|view| view.id == id))
        .cloned()
        .ok_or_else(|| {
            "This private server belongs to another window or is no longer current".into()
        })
}
fn stop(registry: &HostRegistry, owner: &str, id: &str) -> Reply<()> {
    let job = owned_job(registry, owner, id)?;
    job.stop.store(true, Ordering::Relaxed);
    let mut view = lock(&job.view)?;
    if active(&view) {
        view.phase = "stopping".into();
        view.detail = "Stopping this window's private server…".into();
        view.status = None;
    }
    drop(view);
    job.client
        .stop("Private server stopped; its matching playtest was closed")?;
    Ok(())
}
pub(super) fn release_window(state: &AppState, owner: &str) {
    if let Ok(mut registry) = state.ce_hosts.lock() {
        if let Some(job) = registry.jobs.remove(owner) {
            job.stop.store(true, Ordering::Relaxed);
            let _ = job.client.stop("The owning Spark window closed");
        }
    }
}
fn cancelled(job: &Job) -> Reply<()> {
    if job.stop.load(Ordering::Relaxed) {
        Err("Private server stopped".into())
    } else {
        Ok(())
    }
}
fn runtime_root(state: &AppState) -> Reply<PathBuf> {
    if !cfg!(windows) {
        return Err("The classic CE dedicated host currently requires Windows".into());
    }
    let registration = runtime_registration(state, runtime::RuntimeId::HaloCustomEdition)?;
    let installed = runtime::inspect_registration(&registration).map_err(error)?;
    core::reject_links(&installed.root).map_err(error)?;
    let root = fs::canonicalize(&installed.root).map_err(error)?;
    let data = fs::canonicalize(&installed.data_root).map_err(error)?;
    if root != data {
        return Err("For this CE host, register the game folder containing its maps folder".into());
    }
    ce_setup::inspect_root(&root)?;
    Ok(root)
}
fn server_identity(root: &Path) -> Reply<String> {
    let (_, hash, architecture) = dependency_install::pe_identity(&root.join("haloceded.exe"))?;
    if architecture != "x86" {
        return Err("Select the actual x86 Custom Edition dedicated executable".into());
    }
    Ok(hash)
}
fn map_file(root: &Path, name: &str) -> Reply<PathBuf> {
    checked_map_file(&root.join("maps").join(format!("{name}.map")), name)
}
fn checked_map_file(file: &Path, name: &str) -> Reply<PathBuf> {
    if !ce::map_selector(name) {
        return Err("Invalid native map selector".into());
    }
    core::reject_links(file).map_err(error)?;
    let header = maps::inspect_header(file).map_err(error)?;
    if header.version != 609 || header.scenario_type != 1 || header.name != name || header.extended
    {
        return Err("Choose an unextended native CE version-609 multiplayer map with its original filename. Header rewriting is not conversion.".into());
    }
    Ok(file.into())
}
fn map_identity(root: &Path, name: &str) -> Reply<String> {
    maps::hash_file(&map_file(root, name)?).map_err(error)
}
fn project_build(state: &AppState, source: &ce::ProjectBuild) -> Reply<PinnedMap> {
    source.validate().map_err(error)?;
    let project = lock(&state.library)?
        .get(&source.project_id)
        .map_err(error)?;
    let build = verified_build(state, &project, &source.build_id)?;
    if build.target != "gbx-custom" {
        return Err("Build this saved project for Custom Edition before hosting it; another runtime's output cannot substitute".into());
    }
    let file = build
        .output
        .as_ref()
        .ok_or("Validated CE build has no output")?;
    let header = maps::inspect_header(file).map_err(error)?;
    checked_map_file(file, &header.name)?;
    Ok(PinnedMap {
        file: file.clone(),
        source_build: Some(BuildProvenance {
            source: source.clone(),
            project_title: project.title,
            project_fingerprint: build.project_fingerprint,
        }),
    })
}
fn resolve_map(state: &AppState, root: &Path, request: &ce::Request) -> Reply<PinnedMap> {
    match &request.source_build {
        Some(source) => project_build(state, source),
        None => Ok(PinnedMap {
            file: map_file(root, &request.map)?,
            source_build: None,
        }),
    }
}
fn check_request(root: &Path, request: &ce::Request, file: &Path) -> Reply<()> {
    request.validate().map_err(error)?;
    if server_identity(root)? != request.executable_sha256
        || maps::hash_file(&checked_map_file(file, &request.map)?).map_err(error)?
            != request.map_sha256
    {
        return Err("The selected CE executable or map changed. Refresh before starting; no server was launched.".into());
    }
    Ok(())
}
fn available_ports(requested: u16) -> Reply<u16> {
    for _ in 0..32 {
        let game = UdpSocket::bind((Ipv4Addr::LOCALHOST, requested)).map_err(|_| {
            "The private game port is already in use; choose another port".to_string()
        })?;
        let port = game.local_addr().map_err(error)?.port();
        if port < 1024 || port == u16::MAX {
            continue;
        }
        if let Ok(_query) = UdpSocket::bind((Ipv4Addr::LOCALHOST, port + 1)) {
            return Ok(port);
        }
        if requested != 0 {
            break;
        }
    }
    Err("The game/query port pair is not available; choose another port".into())
}
fn selected(relative: &str, map: &str) -> bool {
    [
        "haloceded.exe",
        "haloce.exe",
        "Keystone.dll",
        "ksimeui.dll",
        "Eula.dll",
        "Eula.rtf",
        "strings.dll",
        "msvcr71.dll",
        "binkw32.dll",
        "ogg.dll",
        "vorbis.dll",
        "vorbisfile.dll",
    ]
    .contains(&relative)
        || (relative.starts_with("shaders/")
            && ce_setup::selected_member(&format!("Halo Custom Edition/{relative}")))
        || [
            "maps/ui.map",
            "maps/bitmaps.map",
            "maps/sounds.map",
            "maps/loc.map",
        ]
        .contains(&relative)
        || relative == format!("maps/{map}.map")
        || client::selected(relative)
}
fn collect(
    root: &Path,
    relative: &Path,
    map: &str,
    files: &mut Vec<(String, u64)>,
    seen: &mut usize,
) -> Reply<()> {
    core::reject_links(&root.join(relative)).map_err(error)?;
    for entry in fs::read_dir(root.join(relative)).map_err(error)? {
        *seen += 1;
        if *seen > 4096 {
            return Err("CE installation exceeds the bounded host inventory".into());
        }
        let entry = entry.map_err(error)?;
        let path = relative.join(entry.file_name());
        let name = path
            .to_str()
            .ok_or("CE host paths must be valid text")?
            .replace('\\', "/");
        let metadata = fs::symlink_metadata(entry.path()).map_err(error)?;
        if metadata.is_dir()
            && (matches!(
                name.as_str(),
                "maps" | "shaders" | "controls" | "content" | "content/Gallery"
            ) || name.starts_with("shaders/"))
        {
            collect(root, &path, map, files, seen)?;
        } else if selected(&name, map) {
            core::safe_relative(&name).map_err(error)?;
            core::reject_links(&entry.path()).map_err(error)?;
            if !metadata.is_file() {
                return Err("CE host input must be an ordinary file".into());
            }
            files.push((name, metadata.len()));
            if files.len() > MAX_FILES {
                return Err("CE host file count exceeds its limit".into());
            }
        }
    }
    Ok(())
}
fn copy_checked(source: &Path, target: &Path, bytes: u64, job: &Job) -> Reply<String> {
    core::reject_links(source).map_err(error)?;
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(1); // Sharing reads only: no concurrent writer/delete during the copy.
    }
    let mut input = options.open(source).map_err(error)?;
    if input.metadata().map_err(error)?.len() != bytes {
        return Err("CE source size changed before copying".into());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(error)?;
    }
    core::reject_links(target).map_err(error)?;
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .map_err(error)?;
    let mut count = 0u64;
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        cancelled(job)?;
        let n = input.read(&mut buffer).map_err(error)?;
        if n == 0 {
            break;
        }
        count += n as u64;
        if count > bytes {
            return Err("CE source grew during copying".into());
        }
        digest.update(&buffer[..n]);
        output.write_all(&buffer[..n]).map_err(error)?;
    }
    if count != bytes {
        return Err("CE source was truncated during copying".into());
    }
    output.sync_all().map_err(error)?;
    let hash = format!("{:x}", digest.finalize());
    if maps::hash_file(target).map_err(error)? != hash {
        return Err("Private game copy failed readback".into());
    }
    Ok(hash)
}
fn snapshot(
    root: &Path,
    directory: &Path,
    request: &ce::Request,
    input: &PinnedMap,
    job: &Job,
) -> Reply<PathBuf> {
    let mut files = Vec::new();
    collect(root, Path::new(""), &request.map, &mut files, &mut 0)?;
    let map_relative = format!("maps/{}.map", request.map);
    // The native build can share a filename with a stock map. Explicit source
    // selection replaces only the new private copy, never the installed cache.
    files.retain(|(name, _)| name != &map_relative);
    files.push((
        map_relative.clone(),
        fs::metadata(&input.file).map_err(error)?.len(),
    ));
    if files.len() > MAX_FILES {
        return Err("CE host file count exceeds its limit".into());
    }
    let bytes: u64 = files.iter().map(|(_, size)| size).sum();
    if bytes > MAX_COPY_BYTES {
        return Err("Private CE game copy exceeds 512 MiB".into());
    }
    core::reject_links(directory).map_err(error)?;
    fs::create_dir_all(directory.parent().ok_or("Missing host parent")?).map_err(error)?;
    fs::create_dir(directory).map_err(error)?;
    lock(&job.view)?.session_directory = Some(directory.into());
    let game = directory.join("game");
    fs::create_dir(&game).map_err(error)?;
    let mut hashes = BTreeMap::new();
    for (name, bytes) in files {
        let source = if name == map_relative {
            input.file.clone()
        } else {
            root.join(&name)
        };
        let hash = copy_checked(&source, &game.join(&name), bytes, job)?;
        hashes.insert(name, hash);
        lock(&job.view)?.copied_bytes += bytes;
    }
    if hashes.get("haloceded.exe") != Some(&request.executable_sha256)
        || hashes.get(&format!("maps/{}.map", request.map)) != Some(&request.map_sha256)
    {
        return Err("CE executable/map changed during preparation; nothing was launched".into());
    }
    // Validate the actual copied resource indices, UI and shaders too.
    // Both processes use the same checked copy, with separate writable profiles.
    for (name, kind) in [("bitmaps.map", 1), ("sounds.map", 2), ("loc.map", 3)] {
        let bytes = maps::read_range(&game.join("maps").join(name), 0, 16).map_err(error)?;
        let count = u32::from_le_bytes(bytes[12..16].try_into().unwrap()) as u64;
        let index = u32::from_le_bytes(bytes[8..12].try_into().unwrap()) as u64;
        let length = fs::metadata(game.join("maps").join(name))
            .map_err(error)?
            .len();
        if u32::from_le_bytes(bytes[..4].try_into().unwrap()) != kind
            || count == 0
            || count > 65535
            || index < 16
            || index.checked_add(count * 12).is_none_or(|end| end > length)
        {
            return Err("Copied CE shared resource index is invalid".into());
        }
    }
    let header = maps::inspect_header(&game.join("maps/ui.map")).map_err(error)?;
    if header.version != 609 || header.scenario_type != 2 {
        return Err("Copied CE UI cache is invalid".into());
    }
    map_identity(&game, &request.map)?;
    project::atomic_write(
        &directory.join("copied-files.json"),
        &serde_json::to_vec_pretty(&hashes).map_err(error)?,
        false,
    )
    .map_err(error)?;
    project::atomic_write(
        &directory.join("init.txt"),
        request.configuration().map_err(error)?.as_bytes(),
        false,
    )
    .map_err(error)?;
    fs::create_dir(directory.join("profile")).map_err(error)?;
    job.client.bind(&game, directory, hashes)?;
    Ok(game)
}
fn query(port: u16) -> Reply<ce::Status> {
    let socket = UdpSocket::bind((Ipv4Addr::LOCALHOST, 0)).map_err(error)?;
    socket
        .connect(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port))
        .map_err(error)?;
    socket
        .set_read_timeout(Some(Duration::from_millis(450)))
        .map_err(error)?;
    socket.send(b"\\status\\").map_err(error)?;
    let mut buffer = [0u8; ce::MAX_STATUS_BYTES + 1];
    let bytes = socket.recv(&mut buffer).map_err(error)?;
    ce::parse_status(&buffer[..bytes]).map_err(error)
}
fn console_reader(mut pipe: impl Read + Send + 'static, tail: Arc<Mutex<Vec<u8>>>) {
    std::thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        while let Ok(n) = pipe.read(&mut buffer) {
            if n == 0 {
                break;
            }
            if let Ok(mut bytes) = tail.lock() {
                bytes.extend_from_slice(&buffer[..n]);
                if bytes.len() > 32768 {
                    let excess = bytes.len() - 32768;
                    bytes.drain(..excess);
                }
            }
        }
    });
}

#[cfg(windows)]
struct ProcessJob(isize);
#[cfg(windows)]
impl ProcessJob {
    fn attach(child: &Child) -> Reply<Self> {
        use std::os::windows::io::AsRawHandle;
        Self::attach_handle(child.as_raw_handle() as _)
    }
    fn attach_handle(process: windows_sys::Win32::Foundation::HANDLE) -> Reply<Self> {
        use windows_sys::Win32::System::JobObjects::*;
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return Err(error(std::io::Error::last_os_error()));
            }
            let job = Self(handle as isize);
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as *const _,
                std::mem::size_of_val(&limits) as u32,
            ) == 0
                || AssignProcessToJobObject(handle, process) == 0
            {
                return Err(format!(
                    "Could not bind the private Halo process lifetime to Spark: {}",
                    std::io::Error::last_os_error()
                ));
            }
            Ok(job)
        }
    }
}
#[cfg(windows)]
impl Drop for ProcessJob {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0 as _);
        }
    }
}
struct OwnedProcess {
    child: Child,
    #[cfg(windows)]
    _job: ProcessJob,
}
impl Drop for OwnedProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
fn launch(game: &Path, directory: &Path, port: u16) -> Reply<OwnedProcess> {
    let mut command = Command::new(game.join("haloceded.exe"));
    command
        .current_dir(game)
        .args(["-ip", "127.0.0.1", "-port", &port.to_string()])
        .arg("-path")
        .arg(directory.join("profile"))
        .arg("-exec")
        .arg(directory.join("init.txt"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(error)?;
    #[cfg(windows)]
    let process_job = match ProcessJob::attach(&child) {
        Ok(job) => job,
        Err(e) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(e);
        }
    };
    Ok(OwnedProcess {
        child,
        #[cfg(windows)]
        _job: process_job,
    })
}
fn persist(job: &Job, began: Instant) -> Reply<()> {
    lock(&job.view)?.elapsed_ms = began.elapsed().as_millis().min(u64::MAX as u128) as u64;
    let view = session_view(job)?;
    if let Some(directory) = &view.session_directory {
        project::atomic_write(
            &directory.join("host-session.json"),
            &serde_json::to_vec_pretty(&view).map_err(error)?,
            false,
        )
        .map_err(error)?;
    }
    Ok(())
}
fn run(
    root: &Path,
    directory: &Path,
    request: &ce::Request,
    input: &PinnedMap,
    job: &Job,
    began: Instant,
) -> Reply<()> {
    cancelled(job)?;
    check_request(root, request, &input.file)?;
    let game = snapshot(root, directory, request, input, job)?;
    {
        let mut view = lock(&job.view)?;
        view.session_directory = Some(directory.into());
        view.phase = "starting".into();
        view.detail =
            "Starting the copied dedicated server; waiting for its native map status…".into();
    }
    persist(job, began)?;
    cancelled(job)?;
    let port = available_ports(request.port)?;
    let mut process = launch(&game, directory, port)?;
    let tail = Arc::new(Mutex::new(Vec::new()));
    if let Some(out) = process.child.stdout.take() {
        console_reader(out, tail.clone());
    }
    if let Some(err) = process.child.stderr.take() {
        console_reader(err, tail.clone());
    }
    {
        let mut view = lock(&job.view)?;
        view.port = port;
        view.process_id = Some(process.child.id());
    }
    let mut last_native = Instant::now();
    let mut ever_observed = false;
    loop {
        job.client.observe()?;
        if job.stop.load(Ordering::Relaxed) {
            if let Some(input) = process.child.stdin.as_mut() {
                let _ = input.write_all(b"quit\r\n");
            }
            for _ in 0..10 {
                if process.child.try_wait().map_err(error)?.is_some() {
                    break;
                }
                std::thread::sleep(Duration::from_millis(40));
            }
            drop(process); // Stop only our Child handle, never a name/PID search.
            return Ok(());
        }
        if let Some(code) = process.child.try_wait().map_err(error)? {
            return Err(format!(
                "Private CE server exited ({code}). Review its retained console output."
            ));
        }
        let observed = query(port).or_else(|_| query(port + 1));
        {
            let mut view = lock(&job.view)?;
            view.console_tail = String::from_utf8_lossy(&lock(&tail)?).replace('\0', "");
            match observed {
                Ok(status) if status.matches(request) => {
                    ever_observed = true;
                    last_native = Instant::now();
                    view.phase = "running".into();
                    view.detail = "Native CE server reports this map loaded. Join from Custom Edition → Multiplayer → Direct IP on this computer. Player movement and gameplay require a separate test.".into();
                    view.status = Some(status);
                    view.observations += 1;
                }
                _ => {
                    view.status = None; // Never present a stale native reply as current readiness.
                    view.phase = if ever_observed {
                        "rechecking"
                    } else {
                        "starting"
                    }
                    .into();
                    view.detail = "Waiting for a matching current native server reply…".into();
                    if last_native.elapsed() > Duration::from_secs(10) {
                        view.phase = "unresponsive".into();
                        view.detail = "The owned process is alive but no matching current map status was received. Stop and inspect the retained output.".into();
                    }
                }
            }
        }
        persist(job, began)?;
        if !ever_observed && began.elapsed() > Duration::from_secs(45) {
            return Err("The server did not report the selected native map within 45 seconds; the owned process was stopped".into());
        }
        for _ in 0..20 {
            if job.stop.load(Ordering::Relaxed) {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }
}

#[tauri::command]
pub(super) async fn ce_host_catalog(
    app: tauri::AppHandle,
    project_id: Option<String>,
) -> Reply<Catalog> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let root = runtime_root(&state)?;
        let executable_sha256 = server_identity(&root)?;
        let registration = runtime_registration(&state, runtime::RuntimeId::HaloCustomEdition)?;
        let inventory = runtime::inventory_maps(&registration).map_err(error)?;
        let mut choices = Vec::new();
        for entry in inventory.maps.iter().filter(|entry| {
            entry.valid && entry.cache_version == Some(609) && entry.scenario_type == Some(1)
        }) {
            let name = Path::new(&entry.relative_path)
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            // Inventory already hashed this bounded file. Check the authored
            // header/name without rehashing every map; start rechecks identity.
            if map_file(&root, &name).is_ok() {
                if let Some(sha256) = &entry.sha256 {
                    choices.push(MapChoice {
                        name,
                        sha256: sha256.clone(),
                        source_build: None,
                    });
                }
            }
            if choices.len() > 512 {
                return Err("Choose a smaller CE maps collection for this host".into());
            }
        }
        let mut project_issue = None;
        if let Some(project_id) = &project_id {
            let result = (|| {
                uuid::Uuid::parse_str(project_id).map_err(error)?;
                let project = lock(&state.library)?.get(project_id).map_err(error)?;
                let build = current_build(&state, &project)?;
                let source = ce::ProjectBuild {
                    project_id: project_id.clone(),
                    build_id: build.id,
                };
                let pinned = project_build(&state, &source)?;
                let header = maps::inspect_header(&pinned.file).map_err(error)?;
                Ok::<_, String>(MapChoice {
                    name: header.name,
                    sha256: maps::hash_file(&pinned.file).map_err(error)?,
                    source_build: pinned.source_build,
                })
            })();
            match result {
                Ok(choice) => choices.insert(0, choice),
                Err(detail) => project_issue = Some(detail),
            }
        }
        Ok(Catalog {
            executable_sha256,
            maps: choices,
            project_id,
            project_issue,
        })
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub(super) async fn ce_host_status(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Reply<Option<View>> {
    current(&*lock(&app.state::<AppState>().ce_hosts)?, window.label())
}
#[tauri::command]
pub(super) async fn ce_host_stop(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    session_id: String,
) -> Reply<()> {
    stop(
        &*lock(&app.state::<AppState>().ce_hosts)?,
        window.label(),
        &session_id,
    )
}
#[tauri::command]
pub(super) async fn ce_host_client_action(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    session_id: String,
    action: client::Action,
) -> Reply<View> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let job = owned_job(&*lock(&state.ce_hosts)?, &owner, &session_id)?;
        match action {
            client::Action::Stop => job.client.stop("Matching CE playtest stopped; the private server is still available")?,
            _ => {
                let view = session_view(&job)?;
                if job.stop.load(Ordering::Relaxed) || view.phase != "running" || view.status.is_none() {
                    return Err("Wait for this private server's matching native map reply before preparing or launching its client".into());
                }
                job.client.perform(action, view.port, &job.stop)?;
            }
        }
        // The session receipt is evidence, not an authority for executable paths or hashes.
        let view = session_view(&job)?;
        if let Some(directory) = &view.session_directory {
            project::atomic_write(&directory.join("host-session.json"), &serde_json::to_vec_pretty(&view).map_err(error)?, false).map_err(error)?;
        }
        Ok(view)
    }).await.map_err(error)?
}
#[tauri::command]
pub(super) async fn ce_host_start(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    request: ce::Request,
) -> Reply<View> {
    let owner = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let root = runtime_root(&state)?;
        request.validate().map_err(error)?;
        let input = resolve_map(&state, &root, &request)?;
        check_request(&root, &request, &input.file)?;
        let mut registry = lock(&state.ce_hosts)?;
        if app.get_webview_window(&owner).is_none() { return Err("The requesting window closed".into()); }
        if current(&registry, &owner)?.is_some_and(|view| active(&view)) { return Err("Stop this window's existing private CE server first".into()); }
        if registry.jobs.values().filter(|job| job.view.lock().is_ok_and(|view| active(&view))).count() >= 4 {
            return Err("Stop an existing private server before opening another".into());
        }
        let id = uuid::Uuid::new_v4().to_string();
        let directory = state.root.join("ce-hosts").join(&id);
        if directory.as_os_str().len() > 200 {
            return Err("This legacy CE server requires a shorter Spark library folder (session path under 200 characters)".into());
        }
        let view = View {
            id, phase: "preparing".into(), detail: "Copying and verifying a private game snapshot…".into(),
            map: request.map.clone(), game_type: request.game_type, maximum_players: request.maximum_players,
            name: request.name.clone(), requested_port: request.port,
            port: request.port, process_id: None, executable_sha256: request.executable_sha256.clone(),
            map_sha256: request.map_sha256.clone(), source_build: input.source_build.clone(),
            session_directory: None, copied_bytes: 0,
            status: None, observations: 0, elapsed_ms: 0, console_tail: String::new(), client: None,
        };
        let job = Arc::new(Job { stop: AtomicBool::new(false), view: Mutex::new(view.clone()), client: client::State::default() });
        registry.jobs.insert(owner, job.clone());
        drop(registry);
        std::thread::spawn(move || {
            let began = Instant::now();
            let result = run(&root, &directory, &request, &input, &job, began);
            let requested_stop = job.stop.load(Ordering::Relaxed);
            job.stop.store(true, Ordering::Relaxed);
            let _ = job.client.stop("The private server ended; its matching playtest was closed");
            if let Ok(mut view) = job.view.lock() {
                view.status = None;
                view.phase = if requested_stop || result.is_ok() { "stopped" } else { "failed" }.into();
                view.process_id = None;
                view.detail = if view.phase == "stopped" { "Private server stopped. Copied inputs and session evidence are retained.".into() }
                    else { result.err().unwrap_or_default() };
            }
            let _ = persist(&job, began);
        });
        Ok(view)
    }).await.map_err(error)?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn job(id: &str) -> Arc<Job> {
        Arc::new(Job {
            stop: AtomicBool::new(false),
            client: client::State::default(),
            view: Mutex::new(View {
                id: id.into(),
                phase: "preparing".into(),
                detail: String::new(),
                map: "bloodgulch".into(),
                game_type: ce::GameType::Slayer,
                maximum_players: 2,
                name: "Spark private".into(),
                requested_port: 0,
                port: 0,
                process_id: None,
                executable_sha256: "a".repeat(64),
                map_sha256: "b".repeat(64),
                source_build: None,
                session_directory: None,
                copied_bytes: 0,
                status: None,
                observations: 0,
                elapsed_ms: 0,
                console_tail: String::new(),
                client: None,
            }),
        })
    }
    #[test]
    fn other_windows_and_stale_session_ids_cannot_stop_the_owner() {
        let owned = job("one");
        let registry = HostRegistry {
            jobs: HashMap::from([("owner".into(), owned.clone())]),
        };
        assert!(current(&registry, "other").unwrap().is_none());
        assert!(stop(&registry, "other", "one").is_err());
        assert!(stop(&registry, "owner", "stale").is_err());
        assert!(!owned.stop.load(Ordering::Relaxed));
        stop(&registry, "owner", "one").unwrap();
        assert!(owned.stop.load(Ordering::Relaxed));
    }
    #[test]
    fn cancelled_copy_cannot_be_accepted_and_preserves_its_source() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source");
        fs::write(&source, b"preserved bytes").unwrap();
        let owned = job("copy");
        owned.stop.store(true, Ordering::Relaxed);
        assert!(copy_checked(&source, &temp.path().join("copy"), 15, &owned).is_err());
        assert_eq!(fs::read(source).unwrap(), b"preserved bytes");
    }
    #[test]
    fn copy_selection_never_includes_console_scripts_installers_or_unrelated_maps() {
        assert!(selected("maps/bloodgulch.map", "bloodgulch"));
        assert!(selected("maps/sounds.map", "bloodgulch"));
        assert!(!selected("maps/sidewinder.map", "bloodgulch"));
        for file in ["init.txt", "config.txt", "setup.exe", "shaders/bad.dll"] {
            assert!(!selected(file, "bloodgulch"));
        }
    }
    #[test]
    fn occupied_game_or_query_port_is_refused() {
        let query = UdpSocket::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = query.local_addr().unwrap().port();
        if port > 1024 && port < 65535 {
            assert!(available_ports(port).is_err());
            let _ = available_ports(port - 1).unwrap_err();
        }
    }
}
