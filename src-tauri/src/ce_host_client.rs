//! A local client of one owned CE server, never a caller-selected executable.
//! In-memory copy identities authorize launch; editable JSON receipts do not.
use super::*;
use std::sync::atomic::AtomicU64;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Action {
    Prepare,
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
}
struct Pins {
    game: PathBuf,
    profile: PathBuf,
    files: BTreeMap<String, (u64, String)>,
}
struct Process {
    owned: OwnedProcess,
    // Keep every checked input open without write/delete sharing until exit.
    _inputs: Vec<fs::File>,
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
                return Err("Close or stop this session's current CE playtest first".into());
            }
            let old = self.view()?;
            if matches!(action, Action::Launch) && old.as_ref().is_none_or(|v| v.phase != "ready") {
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
            });
        }
        let began = Instant::now();
        let result: Reply<()> = (|| {
            let inputs = verify(&pins, || self.check(epoch, stopped))?;
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
            view.verified_files = inputs.len();
            view.verified_bytes = pins.files.values().map(|(bytes, _)| bytes).sum();
            view.verification_ms = began.elapsed().as_millis().min(u64::MAX as u128) as u64;
            if matches!(action, Action::Launch) {
                let owned = launch(&pins.game, &pins.profile, port)?;
                view.process_id = Some(owned.child.id());
                view.launch_count += 1;
                view.phase = "open".into();
                view.detail = "CE playtest process opened with this server's exact map and a separate test profile. Complete Halo's first-run/profile prompts if shown. A joined player and gameplay have not been verified.".into();
                *process = Some(Process {
                    owned,
                    _inputs: inputs,
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
        drop(process.take()); // Only this owned child; no process-name/PID search.
        if let Some(view) = lock(&self.view)?.as_mut() {
            view.phase = "stopped".into();
            view.process_id = None;
            view.detail = detail.into();
        }
        Ok(())
    }
    pub(super) fn observe(&self) -> Reply<()> {
        let mut process = lock(&self.process)?;
        let Some(current) = process.as_mut() else {
            return Ok(());
        };
        if let Some(code) = current.owned.child.try_wait().map_err(error)? {
            drop(process.take());
            if let Some(view) = lock(&self.view)?.as_mut() {
                view.phase = "closed".into();
                view.process_id = None;
                view.exit_code = code.code();
                view.detail = format!("CE playtest closed ({code}). The private server remains available; prepare again to retry. Connection and gameplay were not certified by process exit.");
            }
        }
        Ok(())
    }
}

fn verify(pins: &Pins, cancelled: impl Fn() -> Reply<()>) -> Reply<Vec<fs::File>> {
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
        if count != *size || format!("{:x}", digest.finalize()) != *hash {
            return Err(format!("Private input failed integrity: {name}. No client was launched. Stop and prepare a new private server copy."));
        }
        inputs.push(input);
    }
    cancelled()?;
    Ok(inputs)
}
fn launch(game: &Path, profile: &Path, port: u16) -> Reply<OwnedProcess> {
    if !(1024..65535).contains(&port) {
        return Err("Private server has no valid local endpoint".into());
    }
    let mut command = Command::new(game.join("haloce.exe"));
    command
        .current_dir(game)
        .args(["-window", "-vidmode", "1280,720,60", "-novideo"])
        .arg("-path")
        .arg(profile)
        .arg("-connect")
        .arg(format!("127.0.0.1:{port}"))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    // Do not request SW_HIDE. CREATE_NO_WINDOW suppresses a console only;
    // Halo's GUI uses the documented -window option and normal startup state.
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

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, Pins) {
        let directory = tempfile::tempdir().unwrap();
        let game = directory.path().join("game");
        fs::create_dir(&game).unwrap();
        let bytes = b"original native bytes";
        fs::write(game.join("test"), bytes).unwrap();
        let hash = format!("{:x}", Sha256::digest(bytes));
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
        assert_eq!(verify(&pins, || Ok(())).unwrap().len(), 1);
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
