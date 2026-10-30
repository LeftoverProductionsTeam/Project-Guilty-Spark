//! Windows transport for the MCC Halo 1 adapter. No remote thread, DLL injection,
//! code patch, protection change, guessed build or anti-cheat modification.
use live::scaling;
use serde::Serialize;
use spark_core::{invalid, live_adapter as live, maps, Result};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
#[path = "live_controller_poll.rs"]
#[cfg(any(windows, test))]
mod controller_poll;
#[path = "live_cleanup.rs"]
mod cleanup;
#[path = "live_thread_pause.rs"]
#[cfg(windows)]
mod thread_pause;
pub use cleanup::Report as DisconnectReport;
#[derive(Default)]
pub struct ScaleSession {
    #[cfg(windows)]
    thread_release: thread_pause::Recovery,
    state: Mutex<scaling::ScaleState>,
    error: Mutex<Option<String>>,
    keeper_started: AtomicBool,
    keeper_stop: AtomicBool,
}
#[derive(Default)]
struct NativeSprintData {enabled:bool,config:live::sprint::Config,state:live::sprint::State,error:Option<String>}
#[derive(Default)]
pub struct NativeSprintSession {data:Mutex<NativeSprintData>,started:AtomicBool}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct NativeSprintStatus {pub enabled:bool,pub sprinting:bool,pub restore_pending:bool,pub config:live::sprint::Config,pub observed:Option<live::sprint::Info>,pub error:Option<String>,pub detail:String}
#[derive(Default)]
struct NativeCameraData {enabled:bool,config:live::camera::Config,state:live::camera::State,error:Option<String>,shortcut:live::camera::Shortcut,shortcut_latch:live::camera::ShortcutLatch,poll_revision:u64}
#[derive(Default)]
pub struct NativeCameraSession {data:Mutex<NativeCameraData>,started:AtomicBool}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct NativeCameraStatus {pub enabled:bool,pub active:bool,pub restore_pending:bool,pub config:live::camera::Config,pub shortcut:live::camera::Shortcut,pub observed:Option<live::camera::Info>,pub error:Option<String>,pub detail:String}
#[derive(Clone)]
pub struct Session {
    closed: Arc<AtomicBool>,
    connection_id: String,
    pub pid: u32,
    pub base: u64,
    pub created: u64,
    pub root: PathBuf,
    pub identity: live::MapIdentity,
    pub scales: Arc<ScaleSession>,
    pub sprint:Arc<NativeSprintSession>,
    pub camera:Arc<NativeCameraSession>,
}
impl Session {
    fn token(&self) -> String { format!("{}:{}:{}", self.pid, self.created, self.connection_id) }
    fn scales_active(&self)->bool {
        self.scales
            .state
            .lock()
            .map_or(true, |state| state.active())
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    #[cfg(windows)]
    pub thread_release: thread_pause::Status,
    pub pid: u32,
    pub session_token: String,
    pub cleanup_pending: bool,
    pub snapshot: live::Snapshot,
    pub experimental: bool,
    pub active_vehicle_physics: bool,
    pub active_shared_scales: bool,
    pub scale_keeper_error: Option<String>,
    pub detail: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupStatus {
    #[cfg(windows)]
    pub thread_release: thread_pause::Status,
    pub has_session: bool,
    pub session_token: Option<String>,
    pub pending: Vec<&'static str>,
    pub detail: String,
}
pub fn cleanup_status(session: Option<&Session>) -> Result<CleanupStatus> {
    let Some(session) = session.filter(|s| !s.closed.load(Ordering::Acquire)) else {
        return Ok(CleanupStatus { #[cfg(windows)] thread_release: Default::default(), has_session: false, session_token: None, pending: vec![], detail: "No previous live session.".into() });
    };
    let mut pending = vec![];
    #[cfg(windows)]
    let thread_release = session.scales.thread_release.status();
    #[cfg(windows)]
    if thread_release.issue.is_some() || thread_release.pending_threads > 0 { pending.push("thread release"); }
    match session.scales.state.lock() { Ok(state) => { if state.active() { pending.push("shared sizes"); } }, Err(_) => pending.push("shared sizes (state unavailable)") }
    match session.camera.data.lock() { Ok(data) => { if data.state.active() { pending.push("camera"); } }, Err(_) => pending.push("camera (state unavailable)") }
    match session.sprint.data.lock() { Ok(data) => { if data.state.active() { pending.push("sprint"); } }, Err(_) => pending.push("sprint (state unavailable)") }
    let detail = if pending.is_empty() { "A previous live session is retained. Release it before connecting again.".into() }
        else { format!("Previous live session retains temporary {}. Cleanup restores the same target or retires records only when the original target is proven obsolete.", pending.join(", ")) };
    let detail = if pending.iter().any(|part| part.ends_with("(state unavailable)")) { format!("{detail} Some local data journals are unavailable. Recorded thread release can still be retried; data restoration remains blocked.") } else { detail };
    #[cfg(windows)]
    let detail = if let Some(issue) = &thread_release.issue { format!("{detail} {issue} Further live edits are blocked. Release previous live session retries only recorded increments before data cleanup.") } else { detail };
    Ok(CleanupStatus { #[cfg(windows)] thread_release, has_session: true, session_token: Some(session.token()), pending, detail })
}
pub fn check_session_token(session: Option<&Session>, expected: Option<&str>) -> Result<()> {
    if let (Some(session), Some(expected)) = (session, expected) {
        if session.token() != expected {
            return invalid("The live session changed in another Spark window. Refresh the connection before editing or releasing it.");
        }
    }
    Ok(())
}

#[cfg(windows)]
mod windows {
    use super::*;
    use windows_sys::Win32::{
        Foundation::*,
        System::{
            Diagnostics::{Debug::*, ToolHelp::*},
            Memory::*,
            Threading::*,
        },
    };
    mod sprint_control {include!("live_sprint_native.rs");}
    pub use sprint_control::{sprint_configure,sprint_status};
    mod camera_control {include!("live_camera_native.rs");}
    pub use camera_control::{camera_configure,camera_status,camera_shortcut,camera_toggle};
    pub struct Process(HANDLE);
    impl Drop for Process {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
    fn failed(message: &str) -> spark_core::SparkError {
        spark_core::SparkError::Invalid(format!("{message}: {}", std::io::Error::last_os_error()))
    }
    fn wide(s: &[u16]) -> String {
        String::from_utf16_lossy(&s[..s.iter().position(|c| *c == 0).unwrap_or(s.len())])
    }
    fn process_path(p: HANDLE) -> Result<PathBuf> {
        let mut buffer = [0u16; 32768];
        let mut size = buffer.len() as u32;
        if unsafe { QueryFullProcessImageNameW(p, 0, buffer.as_mut_ptr(), &mut size) } == 0 {
            return Err(failed("Cannot read MCC process path"));
        }
        Ok(PathBuf::from(String::from_utf16_lossy(
            &buffer[..size as usize],
        )))
    }
    fn created(p: HANDLE) -> Result<u64> {
        let mut times: [FILETIME; 4] = unsafe { std::mem::zeroed() };
        if unsafe {
            GetProcessTimes(
                p,
                &mut times[0],
                &mut times[1],
                &mut times[2],
                &mut times[3],
            )
        } == 0
        {
            return Err(failed("Cannot identify MCC process lifetime"));
        }
        Ok((u64::from(times[0].dwHighDateTime) << 32) | u64::from(times[0].dwLowDateTime))
    }
    fn processes() -> Result<Vec<(u32, String)>> {
        let raw = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        if raw == INVALID_HANDLE_VALUE {
            return Err(failed("Cannot enumerate running games"));
        }
        let snapshot = Process(raw);
        let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut more = unsafe { Process32FirstW(snapshot.0, &mut entry) };
        let mut found = vec![];
        while more != 0 {
            found.push((entry.th32ProcessID, wide(&entry.szExeFile)));
            more = unsafe { Process32NextW(snapshot.0, &mut entry) };
        }
        if unsafe { GetLastError() } != ERROR_NO_MORE_FILES {
            return Err(failed("Running process enumeration did not complete"));
        }
        Ok(found)
    }
    fn check_anticheat() -> Result<()> {
        if processes()?.iter().any(|(_, name)| {
            let name = name.to_ascii_lowercase();
            name.contains("easyanticheat") || name == "mcc-eac.exe"
        }) {
            return invalid("Anti-cheat is running. Spark will not attach. Close the game and choose MCC’s Anti-Cheat Disabled launch option in Steam.");
        }
        Ok(())
    }
    fn loaded_module(pid: u32) -> Result<Option<(u64, PathBuf)>> {
        let raw = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid) };
        if raw == INVALID_HANDLE_VALUE {
            return Err(failed("Cannot inspect MCC modules"));
        }
        let snapshot = Process(raw);
        let mut entry: MODULEENTRY32W = unsafe { std::mem::zeroed() };
        entry.dwSize = std::mem::size_of::<MODULEENTRY32W>() as u32;
        let mut more = unsafe { Module32FirstW(snapshot.0, &mut entry) };
        while more != 0 {
            if wide(&entry.szModule).eq_ignore_ascii_case("halo1.dll") {
                return Ok(Some((
                    entry.modBaseAddr as u64,
                    PathBuf::from(wide(&entry.szExePath)),
                )));
            }
            more = unsafe { Module32NextW(snapshot.0, &mut entry) };
        }
        if unsafe { GetLastError() } != ERROR_NO_MORE_FILES {
            return Err(failed("MCC module enumeration did not complete"));
        }
        Ok(None)
    }
    fn module(pid: u32) -> Result<(u64, PathBuf)> {
        loaded_module(pid)?.ok_or_else(|| spark_core::SparkError::Invalid(
            "MCC is running, but Halo 1 is not loaded. Enter the intended Halo 1 map first.".into()))
    }
    fn executable(root: &Path) -> PathBuf {
        root.join("MCC/Binaries/Win64/MCC-Win64-Shipping.exe")
    }
    fn open(pid: u32, writable: bool) -> Result<Process> {
        let flags = PROCESS_QUERY_INFORMATION
            | PROCESS_VM_READ
            | if writable {
                PROCESS_VM_WRITE | PROCESS_VM_OPERATION
            } else {
                0
            };
        let p = unsafe { OpenProcess(flags, 0, pid) };
        if p.is_null() {
            return Err(failed("MCC process access was refused"));
        }
        Ok(Process(p))
    }
    // Serialize edits from separate Spark processes. Ownership is scoped to this
    // exact process lifetime, so a recycled Windows PID cannot inherit the lock.
    struct EditLock(Process);
    impl EditLock {
        fn acquire(s: &Session) -> Result<Self> {
            let name: Vec<u16> = format!("Local\\GuiltySpark-MCC-edit-{}-{}", s.pid, s.created)
                .encode_utf16()
                .chain(Some(0))
                .collect();
            let raw = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
            if raw.is_null() {
                return Err(failed("Cannot lock the MCC edit session"));
            }
            let handle = Process(raw);
            let waited = unsafe { WaitForSingleObject(handle.0, 1000) };
            if waited != WAIT_OBJECT_0 && waited != WAIT_ABANDONED {
                return invalid(
                    "Another Spark instance is editing this MCC session; retry after it finishes",
                );
            }
            Ok(Self(handle))
        }
    }
    impl Drop for EditLock {
        fn drop(&mut self) {
            unsafe {
                ReleaseMutex(self.0 .0);
            }
        }
    }
    impl live::Memory for Process {
        fn read(&self, address: u64, size: usize) -> Result<Vec<u8>> {
            if size == 0 || size > 1024 * 1024 {
                return invalid("Invalid live read size");
            }
            let mut data = vec![0; size];
            let mut got = 0;
            if unsafe {
                ReadProcessMemory(
                    self.0,
                    address as _,
                    data.as_mut_ptr().cast(),
                    size,
                    &mut got,
                )
            } == 0
                || got != size
            {
                return Err(failed("Cannot read the current Halo session"));
            }
            Ok(data)
        }
        fn write(&self, address: u64, bytes: &[u8]) -> Result<()> {
            if ![1, 4, 12].contains(&bytes.len()) {
                return invalid(
                    "Live writes require a reviewed scalar, flags byte or vector field",
                );
            }
            let mut info: MEMORY_BASIC_INFORMATION = unsafe { std::mem::zeroed() };
            if unsafe {
                VirtualQueryEx(
                    self.0,
                    address as _,
                    &mut info,
                    std::mem::size_of_val(&info),
                )
            } == 0
                || info.State != MEM_COMMIT
                || !([PAGE_READWRITE, PAGE_WRITECOPY].contains(&info.Protect))
                || address
                    .checked_add(bytes.len() as u64)
                    .is_none_or(|end| end > (info.BaseAddress as u64) + info.RegionSize as u64)
            {
                return invalid("Live data is not an ordinary writable page");
            }
            let mut wrote = 0;
            if unsafe {
                WriteProcessMemory(
                    self.0,
                    address as _,
                    bytes.as_ptr().cast(),
                    bytes.len(),
                    &mut wrote,
                )
            } == 0
                || wrote != bytes.len()
            {
                return Err(failed("Halo rejected the bounded data write"));
            }
            Ok(())
        }
    }
    pub fn connect(root: &Path, mods_mode: bool) -> Result<Session> {
        if !mods_mode {
            return invalid("Choose MCC’s Anti-Cheat Disabled launch option, then confirm that mode in Spark before connecting");
        }
        check_anticheat()?;
        let candidates: Vec<_> = processes()?
            .into_iter()
            .filter(|(_, name)| name.eq_ignore_ascii_case("MCC-Win64-Shipping.exe"))
            .collect();
        if candidates.len() != 1 {
            return invalid("Expected one running MCC session. Launch MCC with anti-cheat disabled and load Halo 1.");
        }
        let pid = candidates[0].0;
        let process = open(pid, false)?;
        let path = process_path(process.0)?;
        let expected = executable(root);
        if path.canonicalize()? != expected.canonicalize()? {
            return invalid("Running MCC is not from the connected Steam installation");
        }
        if maps::hash_file(&path)? != live::EXE_SHA256 {
            return invalid(
                "This MCC executable has no reviewed adapter profile; refusing to guess offsets",
            );
        }
        let (base, module) = module(pid)?;
        if module.canonicalize()? != root.join("halo1/halo1.dll").canonicalize()?
            || maps::hash_file(&module)? != live::MODULE_SHA256
        {
            return invalid("This Halo 1 module has no reviewed adapter profile");
        }
        let snapshot = live::snapshot(&process, base)?;
        let session = Session {
            closed:Arc::new(AtomicBool::new(false)),
            connection_id: uuid::Uuid::new_v4().to_string(),
            pid,
            base,
            created: created(process.0)?,
            root: root.to_owned(),
            identity: snapshot.identity,
            scales: Arc::new(ScaleSession::default()),
            sprint:Arc::new(NativeSprintSession::default()),
            camera:Arc::new(NativeCameraSession::default()),
        };
        Ok(session)
    }
    fn editing_allowed(s: &Session) -> Result<()> {
        if s.closed.load(Ordering::Acquire) || s.scales.keeper_stop.load(Ordering::Acquire) {
            return invalid("Live session cleanup is pending or completed. Finish releasing the previous session, then reconnect before editing.");
        }
        let release = s.scales.thread_release.status();
        if release.issue.is_some() || release.pending_threads > 0 {
            return invalid("Thread release needs attention. Use Release previous live session before making further live edits.");
        }
        Ok(())
    }
    fn guarded(s: &Session, writable: bool) -> Result<Process> {
        if writable { editing_allowed(s)?; }
        guarded_process(s, writable)
    }
    fn guarded_restore(s: &Session) -> Result<Process> {
        // Only the existing journal-owned restore paths bypass the new-edit gate.
        guarded_process(s, true)
    }
    fn guarded_process(s: &Session, writable: bool) -> Result<Process> {
        if s.closed.load(Ordering::Acquire){return invalid("This live session is disconnected; reconnect before editing");}
        check_anticheat()?;
        let p = open(s.pid, writable)?;
        if created(p.0)? != s.created
            || process_path(p.0)?.canonicalize()? != executable(&s.root).canonicalize()?
            || module(s.pid)?.0 != s.base
        {
            return invalid("MCC restarted or its Halo module changed; reconnect the live adapter");
        }
        Ok(p)
    }
    enum Lifetime { Current(Process), Ended, Replaced }
    fn process_lifetime(pid: u32, expected_created: u64) -> Result<Lifetime> {
        // Query/wait only. A failed access check is never treated as proof of exit.
        let raw = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE, 0, pid) };
        if raw.is_null() {
            let reason = std::io::Error::last_os_error();
            if !processes()?.iter().any(|(found, _)| *found == pid) {
                return Ok(Lifetime::Ended);
            }
            return invalid(format!("Cannot verify the previous Halo process lifetime: {reason}"));
        }
        let process = Process(raw);
        match unsafe { WaitForSingleObject(process.0, 0) } {
            WAIT_OBJECT_0 => return Ok(Lifetime::Ended),
            WAIT_TIMEOUT => {},
            _ => return Err(failed("Cannot query the previous Halo process state")),
        }
        if created(process.0)? != expected_created { return Ok(Lifetime::Replaced); }
        Ok(Lifetime::Current(process))
    }
    fn cleanup_target(s: &Session) -> Result<cleanup::Target> {
        use cleanup::{RetiredTarget as Gone, Target};
        let _lifetime = match process_lifetime(s.pid, s.created)? {
            Lifetime::Ended => return Ok(Target::Retired(Gone::ProcessEnded)),
            Lifetime::Replaced => return Ok(Target::Retired(Gone::ProcessReplaced)),
            Lifetime::Current(process) => process,
        };
        let Some((base, path)) = loaded_module(s.pid)? else {
            return Ok(Target::Retired(Gone::ModuleUnloaded));
        };
        if base != s.base || path.canonicalize()? != s.root.join("halo1/halo1.dll").canonicalize()? {
            return Ok(Target::Retired(Gone::ModuleReplaced));
        }
        let process = guarded(s, false)?;
        if live::snapshot(&process, s.base)?.identity != s.identity {
            return Ok(Target::Retired(Gone::MapChanged));
        }
        Ok(Target::Current)
    }
    fn quiesce_controllers(s: &Session) -> Result<()> {
        let mut camera = s.camera.data.lock().map_err(|_| spark_core::SparkError::Invalid("Camera state lock failed".into()))?;
        let mut sprint = s.sprint.data.lock().map_err(|_| spark_core::SparkError::Invalid("Sprint state lock failed".into()))?;
        camera.enabled = false;
        camera.shortcut.enabled = false;
        camera.shortcut_latch = Default::default();
        camera.poll_revision = camera.poll_revision.wrapping_add(1);
        sprint.enabled = false;
        s.scales.keeper_stop.store(true, Ordering::Release);
        Ok(())
    }
    fn retire_journals(s: &Session) -> Result<()> {
        let mut scales = s.scales.state.lock().map_err(|_| spark_core::SparkError::Invalid("Scale state lock failed".into()))?;
        let mut camera = s.camera.data.lock().map_err(|_| spark_core::SparkError::Invalid("Camera state lock failed".into()))?;
        let mut sprint = s.sprint.data.lock().map_err(|_| spark_core::SparkError::Invalid("Sprint state lock failed".into()))?;
        let mut error = s.scales.error.lock().map_err(|_| spark_core::SparkError::Invalid("Scale keeper lock failed".into()))?;
        s.scales.thread_release.clear_after_cleanup()?;
        *scales = Default::default();
        camera.state = Default::default(); camera.error = None;
        sprint.state = Default::default(); sprint.error = None;
        *error = None;
        Ok(())
    }
    pub fn sample(s: &Session) -> Result<Status> {
        let _edit = EditLock::acquire(s)?;
        let snapshot = live::snapshot(&guarded(s, false)?, s.base)?;
        if snapshot.identity != s.identity {
            return invalid(
                "Halo loaded a different map. Reconnect the live adapter before editing.",
            );
        }
        let vehicle_active = s
            .scales
            .state
            .lock()
            .map_err(|_| spark_core::SparkError::Invalid("Scale state lock failed".into()))?
            .vehicle_active();
        Ok(Status{thread_release:s.scales.thread_release.status(),pid:s.pid,session_token:s.token(),cleanup_pending:s.scales.keeper_stop.load(Ordering::Acquire) || s.scales.thread_release.status().issue.is_some(),snapshot,experimental:true,active_vehicle_physics:vehicle_active,active_shared_scales:s.scales_active(),scale_keeper_error:s.scales.error.lock().map_err(|_|spark_core::SparkError::Invalid("Scale keeper lock failed".into()))?.clone(),detail:"Experimental MCC Halo 1 adapter: object positions and uniform scale with readback. World items share their authored size tag. Vehicles couple shared contact spheres, suspension, mass and inertia; park and exit matching vehicles first. Driving and peer replication require game checks.".into()})
    }
    pub fn gameplay_inventory(s:&Session)->Result<live::GameplayInventory> {
        let _edit=EditLock::acquire(s)?;live::gameplay_inventory(&guarded(s,false)?,s.base,&s.identity)
    }
    pub fn moves(s: &Session, moves: &[live::MoveObject]) -> Result<Vec<live::MoveReceipt>> {
        let _edit = EditLock::acquire(s)?;
        live::move_objects(&guarded(s, true)?, s.base, &s.identity, moves)
    }
    pub fn scale_info(s: &Session, datum: u32) -> Result<scaling::ScaleInfo> {
        let _edit = EditLock::acquire(s)?;
        let state = s
            .scales
            .state
            .lock()
            .map_err(|_| spark_core::SparkError::Invalid("Scale state lock failed".into()))?;
        scaling::info(&guarded(s, false)?, s.base, &s.identity, &state, datum)
    }
    pub fn scale(
        s: &Session,
        operation: &scaling::ScaleOperation,
    ) -> Result<scaling::ScaleReceipt> {
        let _edit = EditLock::acquire(s)?;
        let process = guarded(s, true)?;
        let mut state = s
            .scales
            .state
            .lock()
            .map_err(|_| spark_core::SparkError::Invalid("Scale state lock failed".into()))?;
        let result = s.scales.thread_release.run(s.pid, ||
            scaling::resize(&process, s.base, &s.identity, &mut state, operation));
        drop(state);
        if result.is_ok() {
            *s.scales.error.lock().map_err(|_| {
                spark_core::SparkError::Invalid("Scale keeper lock failed".into())
            })? = None;
            start_keeper(s);
        }
        result
    }
    fn start_keeper(s: &Session) {
        s.scales.keeper_stop.store(false, Ordering::Release);
        if s.scales.keeper_started.swap(true, Ordering::AcqRel) {
            return;
        }
        let weak = Arc::downgrade(&s.scales);
        let sprint_weak=Arc::downgrade(&s.sprint);
        let camera_weak=Arc::downgrade(&s.camera);
        let closed=s.closed.clone();
        let connection_id = s.connection_id.clone();
        let (pid, base, created, root, identity) =
            (s.pid, s.base, s.created, s.root.clone(), s.identity.clone());
        std::thread::spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_millis(300));
            let Some(scales) = weak.upgrade() else { break };
            if closed.load(Ordering::Acquire) || scales.keeper_stop.load(Ordering::Acquire) {
                scales.keeper_started.store(false, Ordering::Release);
                break;
            }
            let Some(sprint)=sprint_weak.upgrade()else{break};
            let Some(camera)=camera_weak.upgrade()else{break};
            let session = Session {
                closed:closed.clone(),
                connection_id: connection_id.clone(),
                pid,
                base,
                created,
                root: root.clone(),
                identity: identity.clone(),
                scales,
                sprint,
                camera,
            };
            if !session.scales_active() {
                continue;
            }
            let result = (|| -> Result<()> {
                let _edit = EditLock::acquire(&session)?;
                if closed.load(Ordering::Acquire) || session.scales.keeper_stop.load(Ordering::Acquire) {
                    return Ok(());
                }
                let process = guarded(&session, true)?;
                let mut state = session.scales.state.lock().map_err(|_| {
                    spark_core::SparkError::Invalid("Scale state lock failed".into())
                })?;
                if scaling::needs_synchronization(&process, base, &identity, &state)? {
                    session.scales.thread_release.run(pid, ||
                        scaling::synchronize_respawns(&process, base, &identity, &mut state))?;
                }
                Ok(())
            })();
            if let Err(error) = result {
                if let Ok(mut slot) = session.scales.error.lock() {
                    *slot=Some(format!("Vehicle respawn synchronization stopped: {error}. Restore vehicle sizes or reload this map before continuing."));
                }
                session
                    .scales
                    .keeper_started
                    .store(false, Ordering::Release);
                break;
            }
        });
    }
    pub fn disconnect(s: &Session) -> Result<DisconnectReport> {
        let _edit = EditLock::acquire(s)?;
        if s.closed.load(Ordering::Acquire){return Ok(DisconnectReport::already_disconnected());}
        // Stop new writes before touching local data locks. A poisoned camera/size lock must
        // not prevent release of increments owned by the independent thread journal.
        s.scales.keeper_stop.store(true, Ordering::Release);
        s.scales.thread_release.retry()?;
        quiesce_controllers(s)?;
        let pending = !cleanup_status(Some(s))?.pending.is_empty();
        cleanup::run(pending, || cleanup_target(s), || {
        sprint_control::restore_locked(s)?;
        camera_control::restore_locked(s)?;
        let mut state = s
            .scales
            .state
            .lock()
            .map_err(|_| spark_core::SparkError::Invalid("Scale state lock failed".into()))?;
        if state.active() {
            // Recheck identity in the existing restore operation after observation.
            let process = guarded_restore(s)?;
            s.scales.thread_release.run(s.pid, ||
                scaling::reset(&process, s.base, &s.identity, &mut state))?;
        }
        s.scales.thread_release.clear_after_cleanup()
        }, || retire_journals(s), || s.closed.store(true, Ordering::Release))
        .map_err(|reason| spark_core::SparkError::Invalid(format!(
            "Live cleanup incomplete. Automatic controllers stopped; remaining restoration records retained: {reason}"
        )))
    }
    #[cfg(test)]
    mod tests {
        use super::*;
        use live::Memory;
        fn local_session(pid: u32, created: u64) -> Session {
            Session {
                closed: Arc::new(AtomicBool::new(false)),
                connection_id: uuid::Uuid::new_v4().to_string(),
                pid, created, base: 0, root: PathBuf::from("unused-lifecycle-fixture"),
                identity: live::MapIdentity { scenario: "lifecycle fixture".into(), checksum: 0,
                    scenario_datum: 0, tag_count: 0, header: 0, object_table: 0, object_data: 0 },
                scales: Arc::new(Default::default()), camera: Arc::new(Default::default()), sprint: Arc::new(Default::default()),
            }
        }
        #[test]
        fn cleanup_closes_an_empty_session_and_rejects_a_replaced_connection_token() {
            let old = local_session(u32::MAX, 1);
            let next = local_session(u32::MAX, 1);
            assert_ne!(old.token(), next.token(), "Reconnect within one process needs a fresh identity");
            assert!(check_session_token(Some(&next), Some(&old.token())).is_err());
            assert!(!next.closed.load(Ordering::Acquire));
            assert!(check_session_token(Some(&old), Some(&old.token())).is_ok());
            assert!(check_session_token(None, Some(&old.token())).is_ok());
            old.camera.data.lock().unwrap().enabled = true;
            old.camera.data.lock().unwrap().shortcut.enabled = true;
            old.sprint.data.lock().unwrap().enabled = true;
            let before = cleanup_status(Some(&old)).unwrap();
            assert!(before.has_session); assert!(before.pending.is_empty());
            assert_eq!(disconnect(&old).unwrap().outcome, cleanup::Outcome::NoChanges);
            assert!(old.closed.load(Ordering::Acquire));
            assert!(old.scales.keeper_stop.load(Ordering::Acquire));
            assert!(editing_allowed(&old).is_err());
            assert!(editing_allowed(&next).is_ok());
            quiesce_controllers(&next).unwrap();
            assert!(!next.closed.load(Ordering::Acquire));
            assert!(editing_allowed(&next).is_err());
            assert!(moves(&next, &[]).unwrap_err().to_string().contains("cleanup is pending"));
            assert!(!old.camera.data.lock().unwrap().enabled);
            assert!(!old.camera.data.lock().unwrap().shortcut.enabled);
            assert!(!old.sprint.data.lock().unwrap().enabled);
            assert!(!cleanup_status(Some(&old)).unwrap().has_session);
            assert_eq!(disconnect(&old).unwrap().outcome, cleanup::Outcome::AlreadyDisconnected);
        }
        #[test]
        fn thread_release_fault_blocks_new_data_edits_and_remains_visible_until_cleanup() {
            let session = local_session(u32::MAX, 1);
            session.scales.thread_release.fixture_issue();
            session.camera.data.lock().unwrap().enabled = true;
            session.sprint.data.lock().unwrap().enabled = true;
            assert!(editing_allowed(&session).unwrap_err().to_string().contains("Thread release"));
            assert!(moves(&session, &[]).unwrap_err().to_string().contains("Thread release"));
            let status = cleanup_status(Some(&session)).unwrap();
            assert!(status.pending.contains(&"thread release"));
            assert_eq!(status.thread_release.pending_threads, 0);
            assert!(status.thread_release.issue.is_some());
            let report = disconnect(&session).unwrap();
            assert_eq!(report.outcome, cleanup::Outcome::Retired);
            assert_eq!(report.retired_target, Some(cleanup::RetiredTarget::ProcessEnded));
            assert!(session.scales.thread_release.status().issue.is_none());
            assert!(session.closed.load(Ordering::Acquire));
            assert!(!session.camera.data.lock().unwrap().enabled);
            assert!(!session.sprint.data.lock().unwrap().enabled);
        }
        #[test]
        fn poisoned_data_journal_keeps_the_recovery_token_visible_and_new_writes_stopped() {
            let session = local_session(u32::MAX, 1);
            session.scales.thread_release.fixture_issue();
            let poisoned = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let _held = session.camera.data.lock().unwrap();
                panic!("synthetic camera journal unwind");
            }));
            assert!(poisoned.is_err());
            let status = cleanup_status(Some(&session)).unwrap();
            assert!(status.has_session);
            assert_eq!(status.session_token, Some(session.token()));
            assert!(status.pending.contains(&"camera (state unavailable)"));
            assert!(status.detail.contains("Recorded thread release can still be retried"));
            assert!(disconnect(&session).unwrap_err().to_string().contains("Camera state lock failed"));
            assert!(session.scales.keeper_stop.load(Ordering::Acquire));
            assert!(!session.closed.load(Ordering::Acquire));
            assert!(editing_allowed(&session).is_err());
            assert!(cleanup_status(Some(&session)).unwrap().has_session);
        }
        #[test]
        fn lifecycle_observes_an_owned_child_lifetime_module_absence_and_exit_without_writes() {
            use std::{io::{BufRead, BufReader}, os::windows::process::CommandExt, process::{Command, Stdio}, time::{Duration, Instant}};
            struct Child(std::process::Child);
            impl Drop for Child {
                fn drop(&mut self) {
                    if self.0.try_wait().ok().flatten().is_none() { let _ = self.0.kill(); }
                    let _ = self.0.wait();
                }
            }
            let mut child = Child(Command::new("powershell.exe")
                .args(["-NoProfile", "-NonInteractive", "-Command", "[Console]::Out.WriteLine('spark-owned-lifecycle-child'); [Console]::In.ReadLine() | Out-Null"])
                .creation_flags(CREATE_NO_WINDOW).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().unwrap());
            let stdout = child.0.stdout.take().unwrap();
            let (send, receive) = std::sync::mpsc::channel();
            std::thread::spawn(move || {
                let mut line = String::new(); let result = BufReader::new(stdout).read_line(&mut line);
                let _ = send.send(result.map(|_| line));
            });
            assert_eq!(receive.recv_timeout(Duration::from_secs(10)).unwrap().unwrap().trim(), "spark-owned-lifecycle-child");
            let pid = child.0.id();
            let query = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
            assert!(!query.is_null()); let query = Process(query); let stamp = created(query.0).unwrap();
            assert!(matches!(process_lifetime(pid, stamp).unwrap(), Lifetime::Current(_)));
            assert!(matches!(process_lifetime(pid, stamp + 1).unwrap(), Lifetime::Replaced));
            let session = local_session(pid, stamp);
            assert_eq!(cleanup_target(&session).unwrap(), cleanup::Target::Retired(cleanup::RetiredTarget::ModuleUnloaded));
            drop(child.0.stdin.take());
            let deadline = Instant::now() + Duration::from_secs(10);
            while child.0.try_wait().unwrap().is_none() {
                assert!(Instant::now() < deadline, "owned child did not finish");
                std::thread::sleep(Duration::from_millis(10));
            }
            assert!(matches!(process_lifetime(pid, stamp).unwrap(), Lifetime::Ended));
            assert_eq!(cleanup_target(&session).unwrap(), cleanup::Target::Retired(cleanup::RetiredTarget::ProcessEnded));
            eprintln!("C35 lifecycle native fixture: matching lifetime, mismatched creation time, completed module absence and process exit passed; no process-memory writes or suspension.");
        }
        #[test]
        #[ignore="Requires the owner's running reviewed MCC Halo 1 session in official mods mode"]
        fn native_camera_disconnect_rejects_a_stale_session(){
            let root=std::env::var_os("SPARK_MCC_TEST_ROOT").expect("Set SPARK_MCC_TEST_ROOT to the installed MCC root");
            let session=connect(Path::new(&root),true).unwrap();
            struct Restore<'a>(&'a Session);impl Drop for Restore<'_>{fn drop(&mut self){let _=disconnect(self.0);}}
            let _restore=Restore(&session);
            let original=live::camera::info(&open(session.pid,false).unwrap(),session.base,&session.identity).unwrap();
            assert!(original.available,"Load a map with a living armed player first");
            assert!(camera_toggle(&session,Some(Default::default())).unwrap().active);
            disconnect(&session).unwrap();
            assert!(camera_toggle(&session,Some(Default::default())).is_err(),"A captured old session must not write after disconnect");
            assert!(camera_shortcut(&session,Default::default()).is_err());
            let restored=live::camera::info(&open(session.pid,false).unwrap(),session.base,&session.identity).unwrap();
            assert_eq!(restored.weapon_third_person,original.weapon_third_person);
            disconnect(&session).unwrap(); // Idempotent and no second restoration.
        }
        #[test]
        fn transport_reads_current_process_without_remote_code() {
            let values = [1.0f32, 2., 3.];
            let p = open(unsafe { GetCurrentProcessId() }, false).unwrap();
            let got = p.read(values.as_ptr() as u64, 12).unwrap();
            assert_eq!(
                got,
                values
                    .iter()
                    .flat_map(|v| v.to_le_bytes())
                    .collect::<Vec<_>>()
            );
        }
    }
}
#[cfg(windows)]
pub use windows::{connect, disconnect, moves, sample, scale, scale_info,gameplay_inventory,sprint_configure,sprint_status,camera_configure,camera_status,camera_shortcut,camera_toggle};
#[cfg(not(windows))]
pub fn camera_status(_: &Session)->Result<NativeCameraStatus>{invalid("Native MCC third-person camera requires Windows")}
#[cfg(not(windows))]
pub fn camera_configure(_: &Session,_:bool,_:live::camera::Config)->Result<NativeCameraStatus>{invalid("Native MCC third-person camera requires Windows")}
#[cfg(not(windows))]
pub fn camera_shortcut(_: &Session,_:live::camera::Shortcut)->Result<NativeCameraStatus>{invalid("Native MCC camera shortcuts require Windows")}
#[cfg(not(windows))]
pub fn camera_toggle(_: &Session,_:Option<live::camera::Config>)->Result<NativeCameraStatus>{invalid("Native MCC camera toggle requires Windows")}
#[cfg(not(windows))]
pub fn sprint_status(_: &Session)->Result<NativeSprintStatus>{invalid("Native MCC sprint requires Windows")}
#[cfg(not(windows))]
pub fn sprint_configure(_: &Session,_:bool,_:live::sprint::Config)->Result<NativeSprintStatus>{invalid("Native MCC sprint requires Windows")}
#[cfg(not(windows))]
pub fn gameplay_inventory(_: &Session)->Result<live::GameplayInventory>{invalid("Live MCC gameplay inspection requires Windows")}
#[cfg(not(windows))]
pub fn connect(_: &Path, _: bool) -> Result<Session> {
    invalid("The MCC live process adapter requires Windows")
}
#[cfg(not(windows))]
pub fn sample(_: &Session) -> Result<Status> {
    invalid("The MCC live process adapter requires Windows")
}
#[cfg(not(windows))]
pub fn moves(_: &Session, _: &[live::MoveObject]) -> Result<Vec<live::MoveReceipt>> {
    invalid("The MCC live process adapter requires Windows")
}
#[cfg(not(windows))]
pub fn scale_info(_: &Session, _: u32) -> Result<scaling::ScaleInfo> {
    invalid("The MCC live process adapter requires Windows")
}
#[cfg(not(windows))]
pub fn scale(_: &Session, _: &scaling::ScaleOperation) -> Result<scaling::ScaleReceipt> {
    invalid("The MCC live process adapter requires Windows")
}
#[cfg(not(windows))]
pub fn disconnect(_: &Session) -> Result<DisconnectReport> {
    Ok(DisconnectReport::already_disconnected())
}
