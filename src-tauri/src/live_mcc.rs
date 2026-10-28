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
#[derive(Default)]
pub struct ScaleSession {
    state: Mutex<scaling::ScaleState>,
    error: Mutex<Option<String>>,
    keeper_started: AtomicBool,
}
#[derive(Default)]
struct NativeSprintData {enabled:bool,config:live::sprint::Config,state:live::sprint::State,error:Option<String>}
#[derive(Default)]
pub struct NativeSprintSession {data:Mutex<NativeSprintData>,started:AtomicBool}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct NativeSprintStatus {pub enabled:bool,pub sprinting:bool,pub restore_pending:bool,pub config:live::sprint::Config,pub observed:Option<live::sprint::Info>,pub error:Option<String>,pub detail:String}
#[derive(Default)]
struct NativeCameraData {enabled:bool,config:live::camera::Config,state:live::camera::State,error:Option<String>,shortcut:live::camera::Shortcut,shortcut_latch:live::camera::ShortcutLatch}
#[derive(Default)]
pub struct NativeCameraSession {data:Mutex<NativeCameraData>,started:AtomicBool}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct NativeCameraStatus {pub enabled:bool,pub active:bool,pub restore_pending:bool,pub config:live::camera::Config,pub shortcut:live::camera::Shortcut,pub observed:Option<live::camera::Info>,pub error:Option<String>,pub detail:String}
#[derive(Clone)]
pub struct Session {
    closed: Arc<AtomicBool>,
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
    pub pid: u32,
    pub snapshot: live::Snapshot,
    pub experimental: bool,
    pub active_vehicle_physics: bool,
    pub active_shared_scales: bool,
    pub scale_keeper_error: Option<String>,
    pub detail: String,
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
    fn module(pid: u32) -> Result<(u64, PathBuf)> {
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
                return Ok((
                    entry.modBaseAddr as u64,
                    PathBuf::from(wide(&entry.szExePath)),
                ));
            }
            more = unsafe { Module32NextW(snapshot.0, &mut entry) };
        }
        invalid("MCC is running, but Halo 1 is not loaded. Enter the intended Halo 1 map first.")
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
    // A short, bounded data transaction must not expose half a mass/inertia
    // update to the physics step. Every successful suspend is paired with one
    // resume, including preparation errors and unwinding. No remote code runs.
    struct PausedThreads {
        handles: Vec<Process>,
    }
    impl Drop for PausedThreads {
        fn drop(&mut self) {
            for thread in self.handles.iter().rev() {
                unsafe {
                    ResumeThread(thread.0);
                }
            }
        }
    }
    impl PausedThreads {
        fn acquire(pid: u32) -> Result<Self> {
            let mut guard = Self { handles: vec![] };
            let mut ids = std::collections::HashSet::new();
            for _ in 0..4 {
                let raw = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) };
                if raw == INVALID_HANDLE_VALUE {
                    return Err(failed("Cannot enumerate MCC threads"));
                }
                let snapshot = Process(raw);
                let mut entry: THREADENTRY32 = unsafe { std::mem::zeroed() };
                entry.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
                let mut more = unsafe { Thread32First(snapshot.0, &mut entry) };
                let mut added = 0;
                while more != 0 {
                    if entry.th32OwnerProcessID == pid && !ids.contains(&entry.th32ThreadID) {
                        if guard.handles.len() >= 512 {
                            return invalid("MCC thread count exceeds the scale transaction bound");
                        }
                        let handle = unsafe {
                            OpenThread(
                                THREAD_SUSPEND_RESUME | THREAD_QUERY_LIMITED_INFORMATION,
                                0,
                                entry.th32ThreadID,
                            )
                        };
                        if handle.is_null() {
                            return Err(failed("Cannot prepare an atomic MCC physics edit"));
                        }
                        let thread = Process(handle);
                        if unsafe { GetProcessIdOfThread(thread.0) } != pid
                            || unsafe { SuspendThread(thread.0) } == u32::MAX
                        {
                            return Err(failed(
                                "MCC thread pause was refused; no scale data was changed",
                            ));
                        }
                        guard.handles.push(thread);
                        ids.insert(entry.th32ThreadID);
                        added += 1;
                    }
                    more = unsafe { Thread32Next(snapshot.0, &mut entry) };
                }
                if added == 0 && !guard.handles.is_empty() {
                    return Ok(guard);
                }
            }
            invalid("MCC threads changed during preparation; no scale data was changed")
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
    fn guarded(s: &Session, writable: bool) -> Result<Process> {
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
        Ok(Status{pid:s.pid,snapshot,experimental:true,active_vehicle_physics:vehicle_active,active_shared_scales:s.scales_active(),scale_keeper_error:s.scales.error.lock().map_err(|_|spark_core::SparkError::Invalid("Scale keeper lock failed".into()))?.clone(),detail:"Experimental MCC Halo 1 adapter: object positions and uniform scale with readback. World items share their authored size tag. Vehicles couple shared contact spheres, suspension, mass and inertia; park and exit matching vehicles first. Driving and peer replication require game checks.".into()})
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
        let paused = PausedThreads::acquire(s.pid)?;
        let result = scaling::resize(&process, s.base, &s.identity, &mut state, operation);
        drop(paused);
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
        if s.scales.keeper_started.swap(true, Ordering::AcqRel) {
            return;
        }
        let weak = Arc::downgrade(&s.scales);
        let sprint_weak=Arc::downgrade(&s.sprint);
        let camera_weak=Arc::downgrade(&s.camera);
        let closed=s.closed.clone();
        let (pid, base, created, root, identity) =
            (s.pid, s.base, s.created, s.root.clone(), s.identity.clone());
        std::thread::spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_millis(300));
            let Some(scales) = weak.upgrade() else { break };
            let Some(sprint)=sprint_weak.upgrade()else{break};
            let Some(camera)=camera_weak.upgrade()else{break};
            let session = Session {
                closed:closed.clone(),
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
                let process = guarded(&session, true)?;
                let mut state = session.scales.state.lock().map_err(|_| {
                    spark_core::SparkError::Invalid("Scale state lock failed".into())
                })?;
                if scaling::needs_synchronization(&process, base, &identity, &state)? {
                    let _paused = PausedThreads::acquire(pid)?;
                    scaling::synchronize_respawns(&process, base, &identity, &mut state)?;
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
    pub fn disconnect(s: &Session) -> Result<()> {
        let _edit = EditLock::acquire(s)?;
        if s.closed.load(Ordering::Acquire){return Ok(());}
        let result=(||->Result<()>{
        sprint_control::restore_locked(s)?;
        camera_control::restore_locked(s)?;
        let mut state = s
            .scales
            .state
            .lock()
            .map_err(|_| spark_core::SparkError::Invalid("Scale state lock failed".into()))?;
        if !state.active() {
            return Ok(());
        }
        // An ended process or reloaded map owns fresh data. Never restore old
        // addresses into it. Temporary tag edits do not modify map files.
        if !processes()?.iter().any(|(pid, _)| *pid == s.pid) {
            *state = scaling::ScaleState::default();
            return Ok(());
        }
        let process = guarded(s, true)?;
        if live::snapshot(&process, s.base)?.identity != s.identity {
            *state = scaling::ScaleState::default();
            return Ok(());
        }
        let _paused = PausedThreads::acquire(s.pid)?;
        scaling::reset(&process, s.base, &s.identity, &mut state)
        })();
        if result.is_ok(){s.closed.store(true,Ordering::Release);}
        result
    }
    #[cfg(test)]
    mod tests {
        use super::*;
        use live::Memory;
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
pub fn disconnect(_: &Session) -> Result<()> {
    Ok(())
}
