//! A local client of one owned CE server, never a caller-selected executable.
//! In-memory copy identities authorize launch; editable JSON receipts do not.
use super::*;
use std::sync::atomic::AtomicU64;

#[cfg(windows)]
#[path = "ce_gui_process.rs"]
mod gui;
#[cfg(windows)]
type ClientChild = gui::Child;
#[cfg(not(windows))]
struct ClientChild(OwnedProcess);
#[cfg(not(windows))]
impl ClientChild {
    fn id(&self) -> u32 {
        self.0.child.id()
    }
    fn try_wait(&mut self) -> Reply<Option<std::process::ExitStatus>> {
        self.0.child.try_wait().map_err(error)
    }
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
enum Mode {
    Setup,
    Playtest,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Action {
    Prepare,
    Setup,
    Launch,
    Stop,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct View {
    phase: String,
    detail: String,
    process_id: Option<u32>,
    game_directory: PathBuf,
    profile_directory: PathBuf,
    executable_sha256: String,
    verified_files: usize,
    verified_bytes: u64,
    verification_ms: u64,
    launch_count: u64,
    exit_code: Option<i32>,
    connection_verified: bool,
    mode: Option<Mode>,
    elapsed_ms: u64,
    visible_window: Option<bool>,
    startup_error: Option<String>,
    startup_warning: Option<String>,
    window_summary: Option<String>,
}
struct Pins {
    game: PathBuf,
    profile: PathBuf,
    files: BTreeMap<String, (u64, String)>,
}
struct Process {
    child: ClientChild,
    began: Instant,
    mode: Mode,
    // Executables, maps and ordinary resources stay pinned against writes.
    // CE opens its four encrypted shader data files with share mode zero;
    // those isolated copies are read-only and audited again when it exits.
    _inputs: Inputs,
    pins: Arc<Pins>,
}
#[derive(Debug)]
struct Inputs {
    _shared: Vec<fs::File>,
    verified_files: usize,
}
fn exclusive_shader(name: &str) -> bool {
    ce_setup::EXCLUSIVE_SHADER_FILES.contains(&name)
}
fn verify_exclusive_shaders(pins: &Pins) -> Reply<()> {
    for (name, (size, hash)) in &pins.files {
        if !exclusive_shader(name) { continue; }
        let file = pins.game.join(name);
        core::reject_links(&file).map_err(error)?;
        let metadata = fs::metadata(&file).map_err(error)?;
        if !metadata.is_file() || metadata.len() != *size || !metadata.permissions().readonly()
            || maps::hash_file(&file).map_err(error)? != *hash {
            return Err(format!("Private shader input changed: {name}. Stop and prepare a new private copy; gameplay integrity was not certified."));
        }
    }
    Ok(())
}
#[derive(Default)]
pub(super) struct State {
    pins: Mutex<Option<Arc<Pins>>>,
    view: Mutex<Option<View>>,
    process: Mutex<Option<Process>>,
    operation: Mutex<()>,
    epoch: AtomicU64,
}

pub(super) fn selected(name: &str) -> bool {
    if [
        "controls/Controls.dll",
        "controls/loader.dll",
        "controls/controls.ini",
    ]
    .contains(&name)
    {
        return true;
    }
    // Only Halo's resolution-specific chat resources, not scripts or plugins.
    let sizes = [
        "480", "576", "600", "720", "768", "864", "900", "960", "1024", "1050", "1080", "1200",
        "1440", "1600", "2160",
    ];
    sizes.iter().any(|size| {
        name == format!("content/{size}editbox.ksml")
            || name == format!("content/{size}log.ksml")
            || name.eq_ignore_ascii_case(&format!("content/Gallery/editbox{size}.png"))
    })
}

impl State {
    pub(super) fn bind(
        &self,
        game: &Path,
        session: &Path,
        hashes: BTreeMap<String, String>,
    ) -> Reply<()> {
        if lock(&self.pins)?.is_some() {
            return Err("A matching client cannot change its server snapshot".into());
        }
        let mut files = BTreeMap::new();
        for (name, hash) in hashes {
            files.insert(
                name.clone(),
                (fs::metadata(game.join(name)).map_err(error)?.len(), hash),
            );
        }
        if !files.contains_key("haloce.exe") {
            return Err("The private copy is missing its registered CE client".into());
        }
        *lock(&self.pins)? = Some(Arc::new(Pins {
            game: game.into(),
            profile: session.join("client-profile"),
            files,
        }));
        Ok(())
    }
    pub(super) fn view(&self) -> Reply<Option<View>> {
        Ok(lock(&self.view)?.clone())
    }
    fn check(&self, epoch: u64, stopped: &AtomicBool) -> Reply<()> {
        if stopped.load(Ordering::Relaxed) || self.epoch.load(Ordering::Relaxed) != epoch {
            Err("Matching client action cancelled; nothing new was launched".into())
        } else {
            Ok(())
        }
    }
    pub(super) fn perform(&self, action: Action, port: u16, stopped: &AtomicBool) -> Reply<()> {
        let _operation = self
            .operation
            .try_lock()
            .map_err(|_| "A matching client action is already in progress")?;
        let epoch = self.epoch.load(Ordering::Relaxed);
        let pins = lock(&self.pins)?
            .clone()
            .ok_or("Wait for the private game copy to finish")?;
        {
            let process = lock(&self.process)?;
            self.check(epoch, stopped)?;
            if process.is_some() {
                return Err("Close or stop this session's current CE window first".into());
            }
            let old = self.view()?;
            if matches!(action, Action::Launch | Action::Setup)
                && old.as_ref().is_none_or(|v| v.phase != "ready")
            {
                return Err("Prepare this session's matching client before launching it".into());
            }
            let launches = old.map_or(0, |v| v.launch_count);
            *lock(&self.view)? = Some(View {
                phase: "checking".into(),
                detail: "Checking the frozen map, shared resources and client files…".into(),
                process_id: None,
                game_directory: pins.game.clone(),
                profile_directory: pins.profile.clone(),
                executable_sha256: pins.files["haloce.exe"].1.clone(),
                verified_files: 0,
                verified_bytes: 0,
                verification_ms: 0,
                launch_count: launches,
                exit_code: None,
                connection_verified: false,
                mode: None,
                elapsed_ms: 0,
                visible_window: None,
                startup_error: None,
                startup_warning: None,
                window_summary: None,
            });
        }
        let began = Instant::now();
        let result: Reply<()> = (|| {
            let inputs = verify(&pins, || self.check(epoch, stopped))?;
            ce_setup::require_startup(&pins.game)?;
            let (_, hash, architecture) =
                dependency_install::pe_identity(&pins.game.join("haloce.exe"))?;
            if architecture != "x86" || hash != pins.files["haloce.exe"].1 {
                return Err("The copied client is not the matching x86 CE executable".into());
            }
            core::reject_links(&pins.profile).map_err(error)?;
            if !pins.profile.exists() {
                fs::create_dir(&pins.profile).map_err(error)?;
            }
            if !fs::metadata(&pins.profile).map_err(error)?.is_dir() {
                return Err("Matching client profile must be its owned directory".into());
            }
            // Stop/cancel and spawn are serialized by the same short process lock.
            let mut process = lock(&self.process)?;
            self.check(epoch, stopped)?;
            let mut view = lock(&self.view)?;
            let view = view.as_mut().ok_or("Missing matching client state")?;
            view.verified_files = inputs.verified_files;
            view.verified_bytes = pins.files.values().map(|(bytes, _)| bytes).sum();
            view.verification_ms = began.elapsed().as_millis().min(u64::MAX as u128) as u64;
            if matches!(action, Action::Launch | Action::Setup) {
                let mode = if matches!(action, Action::Setup) {
                    Mode::Setup
                } else {
                    Mode::Playtest
                };
                let child = launch(&pins.game, &pins.profile, port, mode)?;
                view.process_id = Some(child.id());
                view.launch_count += 1;
                view.phase = "open".into();
                view.mode = Some(mode);
                view.detail = match mode {
                    Mode::Setup => "CE setup process started in the separate test profile. Waiting for its game window; complete Halo's own prompts only if it appears. This step does not request a game connection.",
                    Mode::Playtest => "CE playtest process started with this server's exact map and a separate test profile. Waiting for its game window; a joined player and gameplay have not been verified.",
                }.into();
                *process = Some(Process {
                    child,
                    began: Instant::now(),
                    mode,
                    _inputs: inputs,
                    pins: pins.clone(),
                });
            } else {
                view.phase = "ready".into();
                view.detail = "Matching map, shared resources and client verified. Launch the CE playtest when ready; your normal Halo saves stay separate.".into();
            }
            Ok(())
        })();
        if let Err(detail) = &result {
            let _process = lock(&self.process)?;
            // An older operation must not overwrite a newer Stop result.
            if self.epoch.load(Ordering::Relaxed) == epoch {
                if let Some(view) = lock(&self.view)?.as_mut() {
                    view.phase = "failed".into();
                    view.detail = detail.clone();
                    view.process_id = None;
                }
            }
        }
        result
    }
    pub(super) fn stop(&self, detail: &str) -> Reply<()> {
        let mut process = lock(&self.process)?;
        self.epoch.fetch_add(1, Ordering::Relaxed);
        let pins = process.as_ref().map(|p| p.pins.clone());
        drop(process.take()); // Only this owned child; no process-name/PID search.
        let integrity = pins.map_or(Ok(()), |p| verify_exclusive_shaders(&p));
        if let Some(view) = lock(&self.view)?.as_mut() {
            view.phase = "stopped".into();
            view.process_id = None;
            view.visible_window = None;
            view.startup_error = None;
            view.startup_warning = None;
            view.window_summary = None;
            view.detail = integrity.as_ref().err().cloned().unwrap_or_else(|| detail.into());
        }
        integrity
    }
    pub(super) fn observe(&self) -> Reply<()> {
        let mut process = lock(&self.process)?;
        let Some(current) = process.as_mut() else {
            return Ok(());
        };
        let elapsed = current.began.elapsed();
        if let Some(view) = lock(&self.view)?.as_mut() {
            view.elapsed_ms = elapsed.as_millis().min(u64::MAX as u128) as u64;
            #[cfg(windows)]
            { if let Some(observed) = gui::observe_window(current.child.id()) {
                view.visible_window = Some(observed.visible);
                // A fatal dialog can close before the next status request.
                // Retain its captured message until the next explicit action.
                view.startup_error = observed.startup_error.or_else(|| view.startup_error.take());
                view.startup_warning = observed.startup_warning;
                view.window_summary = Some(observed.summary);
            } }
            if let Some(detail) = &view.startup_error {
                view.detail = format!("Halo reported a startup error: {detail}. This dialog is not a playable game or a joined client. Stop playtest before retrying.");
            } else if let Some(detail) = &view.startup_warning {
                view.detail = format!("Halo is waiting at a startup warning: {detail}. Review it in the Halo window; Spark does not dismiss warnings automatically. A playable game and a joined client remain unverified.");
            } else if view.visible_window == Some(false) && elapsed >= Duration::from_secs(15) {
                view.detail = "Halo's process is running, but no visible game window was detected. Check the taskbar in case it is minimized. If no window appears, Stop playtest, then Check CE installation before retrying. First-run completion and a player join are not verified.".into();
            } else if matches!(current.mode, Mode::Playtest) && elapsed >= Duration::from_secs(30) {
                view.detail = "CE is still running; a player join has not been verified. If startup is waiting, stop this window and use First-run help → Open CE setup to finish the test profile, then retry. You can also use Halo's Multiplayer → Direct IP with the address above.".into();
            } else if view.visible_window == Some(true) {
                view.detail = match current.mode {
                    Mode::Setup => "A CE window was detected. Complete Halo's own license/profile prompts, then close Halo and prepare the playtest. First-run completion is not certified by window visibility.",
                    Mode::Playtest => "A CE window was detected with the matching client running. A joined player and gameplay remain unverified.",
                }.into();
            } else {
                view.detail = "CE process is running; waiting for its game window. A visible game, completed startup and a joined player have not been verified.".into();
            }
        }
        if let Some(code) = current.child.try_wait()? {
            let integrity = verify_exclusive_shaders(&current.pins);
            drop(process.take());
            if let Some(view) = lock(&self.view)?.as_mut() {
                view.phase = "closed".into();
                view.process_id = None;
                view.visible_window = None;
                view.exit_code = code.code();
                view.detail = integrity.err().unwrap_or_else(|| format!("CE playtest closed ({code}). The private server remains available; prepare again to retry. Connection and gameplay were not certified by process exit."));
            }
        }
        Ok(())
    }
}

fn verify(pins: &Pins, cancelled: impl Fn() -> Reply<()>) -> Reply<Inputs> {
    let mut found = BTreeMap::new();
    fn inventory(
        root: &Path,
        relative: &Path,
        found: &mut BTreeMap<String, u64>,
        seen: &mut usize,
    ) -> Reply<()> {
        core::reject_links(&root.join(relative)).map_err(error)?;
        for entry in fs::read_dir(root.join(relative)).map_err(error)? {
            *seen += 1;
            if *seen > 4096 {
                return Err("Private game inventory exceeds its bound".into());
            }
            let entry = entry.map_err(error)?;
            let path = relative.join(entry.file_name());
            core::reject_links(&entry.path()).map_err(error)?;
            let metadata = fs::symlink_metadata(entry.path()).map_err(error)?;
            if metadata.is_dir() {
                if path.components().count() > 3 {
                    return Err("Unexpected directory in the private game copy".into());
                }
                inventory(root, &path, found, seen)?;
            } else if metadata.is_file() {
                let name = path
                    .to_str()
                    .ok_or("Invalid private game filename")?
                    .replace('\\', "/");
                core::safe_relative(&name).map_err(error)?;
                found.insert(name, metadata.len());
                if found.len() > MAX_FILES {
                    return Err("Private game inventory exceeds its bound".into());
                }
            } else {
                return Err("Unexpected private game input".into());
            }
        }
        Ok(())
    }
    inventory(&pins.game, Path::new(""), &mut found, &mut 0)?;
    if found.len() != pins.files.len()
        || found
            .iter()
            .any(|(name, size)| pins.files.get(name).is_none_or(|p| p.0 != *size))
    {
        return Err("Private game files changed or an unapproved file was added. Stop this server and prepare a new private copy.".into());
    }
    let mut inputs = Vec::new();
    for (name, (size, hash)) in &pins.files {
        cancelled()?;
        let file = pins.game.join(name);
        core::reject_links(&file).map_err(error)?;
        let mut options = fs::OpenOptions::new();
        options.read(true);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            options.share_mode(1);
        }
        let mut input = options.open(&file).map_err(error)?;
        if input.metadata().map_err(error)?.len() != *size {
            return Err(format!("Private input changed: {name}"));
        }
        let mut digest = Sha256::new();
        let mut buffer = [0u8; 65536];
        let mut count = 0u64;
        loop {
            cancelled()?;
            let n = input.read(&mut buffer).map_err(error)?;
            if n == 0 {
                break;
            }
            count += n as u64;
            if count > *size {
                return Err(format!("Private input grew: {name}"));
            }
            digest.update(&buffer[..n]);
        }
        if count != *size || spark_core::hex_bytes(digest.finalize()) != *hash {
            return Err(format!("Private input failed integrity: {name}. No client was launched. Stop and prepare a new private server copy."));
        }
        if exclusive_shader(name) {
            // Only exact encrypted shader DATA names need CE's exclusive read.
            // Set the private copy read-only before releasing the data-read pin.
            let mut permissions = input.metadata().map_err(error)?.permissions();
            permissions.set_readonly(true);
            fs::set_permissions(&file, permissions).map_err(error)?;
        } else {
            inputs.push(input);
        }
    }
    cancelled()?;
    Ok(Inputs { _shared: inputs, verified_files: pins.files.len() })
}
fn arguments(profile: &Path, port: u16, mode: Mode) -> Reply<Vec<std::ffi::OsString>> {
    if !(1024..65535).contains(&port) {
        return Err("Private server has no valid local endpoint".into());
    }
    let mut arguments: Vec<std::ffi::OsString> =
        // The same-machine dedicated engine can already own UDP 2303 even
        // when its requested game port differs. Never reuse CE's client-port
        // default: zero asks the engine for its own random client endpoint.
        ["-window", "-vidmode", "1280,720,60", "-novideo", "-cport", "0", "-path"]
            .map(Into::into)
            .into();
    arguments.push(profile.as_os_str().to_owned());
    if matches!(mode, Mode::Playtest) {
        arguments.extend([
            std::ffi::OsString::from("-connect"),
            format!("127.0.0.1:{port}").into(),
        ]);
    }
    Ok(arguments)
}
fn launch(game: &Path, profile: &Path, port: u16, mode: Mode) -> Reply<ClientChild> {
    if game.parent().map(fs::canonicalize).transpose().map_err(error)?!=profile.parent().map(fs::canonicalize).transpose().map_err(error)?||profile.file_name().is_none_or(|n|n!="client-profile"){return Err("CE playtest profile must stay inside its owned game session".into());}
    // CE's legacy argument parser truncates long absolute option values even
    // below Windows' own path limit. The fixed cwd and sibling guard keep these
    // short relative paths confined to exactly the same owned directories.
    let arguments = arguments(&Path::new("..").join("client-profile"), port, mode)?;
    #[cfg(windows)]
    {
        gui::Child::launch(&game.join("haloce.exe"), &arguments, game)
    }
    #[cfg(not(windows))]
    {
        let mut command = Command::new(game.join("haloce.exe"));
        command
            .current_dir(game)
            .args(arguments)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        Ok(ClientChild(OwnedProcess {
            child: command.spawn().map_err(error)?,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn menu_setup_does_not_request_a_join_and_playtest_keeps_the_fixed_local_endpoint() {
        let profile = Path::new("owned profile");
        let menu = arguments(profile, 12345, Mode::Setup).unwrap();
        assert_eq!(menu.last().unwrap(), profile.as_os_str());
        assert!(!menu.iter().any(|a| a == "-connect" || a == "-devmode"));
        let game = arguments(profile, 12345, Mode::Playtest).unwrap();
        assert_eq!(game[game.len() - 2], "-connect");
        assert_eq!(game.last().unwrap(), "127.0.0.1:12345");
        // A host's query/game sockets can include 2303. Both entry paths must
        // ask CE for an independent endpoint rather than collide with it.
        for args in [&menu, &game] {
            let at = args.iter().position(|value| value == "-cport").unwrap();
            assert_eq!(args[at + 1], "0");
            assert_eq!(args.iter().filter(|value| *value == "-cport").count(), 1);
        }
        assert!(arguments(profile, 0, Mode::Playtest).is_err());
    }
    fn fixture() -> (tempfile::TempDir, Pins) {
        let directory = tempfile::tempdir().unwrap();
        let game = directory.path().join("game");
        fs::create_dir(&game).unwrap();
        let bytes = b"original native bytes";
        fs::write(game.join("test"), bytes).unwrap();
        let hash = spark_core::hex_bytes(Sha256::digest(bytes));
        let pins = Pins {
            game,
            profile: directory.path().join("profile"),
            files: BTreeMap::from([("test".into(), (bytes.len() as u64, hash))]),
        };
        (directory, pins)
    }
    #[test]
    fn byte_identity_and_inventory_are_required_not_editable_receipts() {
        let (_directory, pins) = fixture();
        assert_eq!(verify(&pins, || Ok(())).unwrap().verified_files, 1);
        fs::write(pins.game.join("test"), b"corrupted native data").unwrap();
        assert!(verify(&pins, || Ok(())).unwrap_err().contains("integrity"));
        fs::write(pins.game.join("test"), b"original native bytes").unwrap();
        fs::write(pins.game.join("winmm.dll"), b"unapproved plugin").unwrap();
        assert!(verify(&pins, || Ok(())).unwrap_err().contains("unapproved"));
    }
    #[test]
    fn stop_interrupts_old_actions_and_verification_holds_read_only_handles() {
        let (_directory, pins) = fixture();
        let state = State::default();
        let stopped = AtomicBool::new(false);
        state.stop("cancel").unwrap();
        assert!(state.check(0, &stopped).is_err());
        assert!(verify(&pins, || state.check(0, &stopped)).is_err());
        let files = verify(&pins, || Ok(())).unwrap();
        #[cfg(windows)]
        assert!(fs::write(pins.game.join("test"), b"replaced").is_err());
        drop(files);
        fs::write(pins.game.join("test"), b"original native bytes").unwrap();
    }
    #[cfg(windows)]
    #[test]
    fn native_exclusive_shader_reads_keep_other_inputs_pinned_and_detect_shader_changes() {
        use std::os::windows::fs::OpenOptionsExt;
        let (_directory, mut pins) = fixture();
        fs::create_dir(pins.game.join("shaders")).unwrap();
        let name = "shaders/vsh.enc";
        let shader = pins.game.join(name);
        let bytes = b"isolated encrypted shader fixture";
        fs::write(&shader, bytes).unwrap();
        pins.files.insert(name.into(), (bytes.len() as u64, spark_core::hex_bytes(Sha256::digest(bytes))));
        let inputs = verify(&pins, || Ok(())).unwrap();
        assert_eq!(inputs.verified_files, 2);
        assert_eq!(inputs._shared.len(), 1);
        let mut read = fs::OpenOptions::new().read(true).share_mode(0).open(&shader).unwrap();
        let mut actual = Vec::new();
        read.read_to_end(&mut actual).unwrap();
        assert_eq!(actual, bytes);
        drop(read);
        assert!(fs::write(&shader, b"changed").is_err());
        assert!(fs::write(pins.game.join("test"), b"changed").is_err());
        verify_exclusive_shaders(&pins).unwrap();
        // Read-only data copies are not a security boundary against someone
        // deliberately changing their attributes. Such a candidate must fail
        // the exit audit and the next launch's full byte-identity check.
        let mut permissions = fs::metadata(&shader).unwrap().permissions();
        permissions.set_readonly(false);
        fs::set_permissions(&shader, permissions).unwrap();
        fs::write(&shader, b"corrupted encrypted shader bytes").unwrap();
        assert!(verify_exclusive_shaders(&pins).unwrap_err().contains("shader input changed"));
        drop(inputs);
        assert!(verify(&pins, || Ok(())).is_err());
        assert!(!exclusive_shader("shaders/arbitrary.enc"));
        assert!(!exclusive_shader("shaders/vsh.dll"));
    }
    #[test]
    fn only_known_chat_resources_are_admitted() {
        assert!(selected("controls/Controls.dll"));
        assert!(selected("content/720editbox.ksml"));
        assert!(selected("content/Gallery/editbox720.PNG"));
        for name in [
            "controls/new.dll",
            "content/init.txt",
            "content/720editbox.exe",
            "content/Gallery/arbitrary.dll",
        ] {
            assert!(!selected(name));
        }
    }
}
