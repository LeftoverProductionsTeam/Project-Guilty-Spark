//! Owned CE GUI startup. Explicit SW_SHOWNORMAL; bind the suspended process to
//! its kill-on-close job before allowing any client code to execute.
use super::*;
use std::os::windows::{
    ffi::OsStrExt,
    io::{AsRawHandle, FromRawHandle, OwnedHandle},
    process::ExitStatusExt,
};
use std::{
    ffi::{OsStr, OsString},
    process::ExitStatus,
};
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, RECT, WAIT_OBJECT_0, WAIT_TIMEOUT},
    System::Threading::*,
    UI::WindowsAndMessaging::*,
};

/// Read-only observation of this owned child only. Window creation/visibility
/// is distinct from process launch, first-run completion and a joined player.
pub(super) fn visible_window(pid: u32) -> Option<bool> {
    struct Probe {
        pid: u32,
        visible: bool,
    }
    unsafe extern "system" fn visit(window: HWND, data: LPARAM) -> i32 {
        let probe = &mut *(data as *mut Probe);
        let mut owner = 0;
        GetWindowThreadProcessId(window, &mut owner);
        if owner == probe.pid && IsWindowVisible(window) != 0 && IsIconic(window) == 0 {
            let mut bounds: RECT = std::mem::zeroed();
            if GetWindowRect(window, &mut bounds) != 0
                && bounds.right > bounds.left
                && bounds.bottom > bounds.top
            {
                probe.visible = true;
            }
        }
        1
    }
    let mut probe = Probe {
        pid,
        visible: false,
    };
    (unsafe { EnumWindows(Some(visit), &mut probe as *mut Probe as LPARAM) } != 0)
        .then_some(probe.visible)
}

pub(super) struct Child {
    process: OwnedHandle,
    id: u32,
    _job: ProcessJob,
}
fn terminated(process: &OwnedHandle) {
    unsafe {
        TerminateProcess(process.as_raw_handle() as _, 1);
        WaitForSingleObject(process.as_raw_handle() as _, 5000);
    }
}
impl Child {
    pub(super) fn launch(
        executable: &Path,
        arguments: &[OsString],
        directory: &Path,
    ) -> Reply<Self> {
        let application = wide(executable.as_os_str())?;
        let cwd = wide(directory.as_os_str())?;
        let mut command = command_line(executable.as_os_str(), arguments)?;
        let mut startup: STARTUPINFOW = unsafe { std::mem::zeroed() };
        startup.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
        startup.dwFlags = STARTF_USESHOWWINDOW;
        startup.wShowWindow = 1; // SW_SHOWNORMAL, rather than inherited/default visibility.
        let mut info: PROCESS_INFORMATION = unsafe { std::mem::zeroed() };
        let created = unsafe {
            CreateProcessW(
                application.as_ptr(),
                command.as_mut_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                0,
                CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW | CREATE_SUSPENDED,
                std::ptr::null(),
                cwd.as_ptr(),
                &startup,
                &mut info,
            )
        };
        if created == 0 {
            return Err(error(std::io::Error::last_os_error()));
        }
        // Every returned handle acquires an owner immediately, including error paths.
        let process = unsafe { OwnedHandle::from_raw_handle(info.hProcess as _) };
        let thread = unsafe { OwnedHandle::from_raw_handle(info.hThread as _) };
        let job = match ProcessJob::attach_handle(process.as_raw_handle() as _) {
            Ok(job) => job,
            Err(e) => {
                terminated(&process);
                return Err(e);
            }
        };
        let child = Self {
            process,
            id: info.dwProcessId,
            _job: job,
        };
        if unsafe { ResumeThread(thread.as_raw_handle() as _) } == u32::MAX {
            return Err(error(std::io::Error::last_os_error()));
        }
        Ok(child)
    }
    pub(super) fn id(&self) -> u32 {
        self.id
    }
    pub(super) fn try_wait(&self) -> Reply<Option<ExitStatus>> {
        match unsafe { WaitForSingleObject(self.process.as_raw_handle() as _, 0) } {
            WAIT_TIMEOUT => Ok(None),
            WAIT_OBJECT_0 => {
                let mut code = 0;
                if unsafe { GetExitCodeProcess(self.process.as_raw_handle() as _, &mut code) } == 0
                {
                    return Err(error(std::io::Error::last_os_error()));
                }
                Ok(Some(ExitStatus::from_raw(code)))
            }
            _ => Err(error(std::io::Error::last_os_error())),
        }
    }
}
impl Drop for Child {
    fn drop(&mut self) {
        terminated(&self.process);
    }
}
fn wide(value: &OsStr) -> Reply<Vec<u16>> {
    let mut result: Vec<u16> = value.encode_wide().collect();
    if result.contains(&0) {
        return Err("NUL in CE startup path or argument".into());
    }
    result.push(0);
    Ok(result)
}
fn command_line(executable: &OsStr, arguments: &[OsString]) -> Reply<Vec<u16>> {
    let mut result = Vec::new();
    for (index, value) in std::iter::once(executable)
        .chain(arguments.iter().map(OsString::as_os_str))
        .enumerate()
    {
        if index != 0 {
            result.push(32);
        }
        result.push(34);
        let mut slashes = 0;
        for unit in value.encode_wide() {
            if unit == 0 {
                return Err("NUL in CE startup argument".into());
            }
            if unit == 92 {
                slashes += 1;
                continue;
            }
            result.extend(std::iter::repeat_n(
                92,
                slashes * if unit == 34 { 2 } else { 1 },
            ));
            slashes = 0;
            if unit == 34 {
                result.push(92);
            }
            result.push(unit);
        }
        result.extend(std::iter::repeat_n(92, slashes * 2));
        result.push(34);
        if result.len() > 16384 {
            return Err("CE startup command exceeds its bound".into());
        }
    }
    result.push(0);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn command_paths_and_arguments_keep_their_native_boundaries() {
        let args = [
            OsString::from("D:\\Halo work\\profile\\"),
            OsString::from("a\"b"),
            OsString::from(""),
            OsString::from("127.0.0.1:1234"),
        ];
        let line = String::from_utf16(
            &command_line(OsStr::new("D:\\Halo work\\haloce.exe"), &args).unwrap(),
        )
        .unwrap();
        assert_eq!(line, "\"D:\\Halo work\\haloce.exe\" \"D:\\Halo work\\profile\\\\\" \"a\\\"b\" \"\" \"127.0.0.1:1234\"\0");
        assert!(wide(OsStr::new("bad\0argument")).is_err());
    }
    #[test]
    fn native_gui_child_receives_explicit_normal_startup_and_exits() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(
            directory.path().join("startup-probe.request"),
            b"owned subprocess startup test",
        )
        .unwrap();
        let exe = std::env::current_exe().unwrap();
        let args = [
            "--exact",
            "app::ce_host_native::client::gui::tests::startup_child_probe",
            "--nocapture",
        ]
        .map(OsString::from);
        let child = Child::launch(&exe, &args, directory.path()).unwrap();
        let began = Instant::now();
        while child.try_wait().unwrap().is_none() {
            assert!(began.elapsed() < Duration::from_secs(10));
            std::thread::sleep(Duration::from_millis(10));
        }
        let result: serde_json::Value =
            serde_json::from_slice(&fs::read(directory.path().join("startup-probe.json")).unwrap())
                .unwrap();
        assert_eq!(result["show"], 1);
        assert_eq!(result["explicitShow"], true);
        assert_eq!(result["standardHandlesProvided"], false);
        assert_eq!(
            result["ownedWindowVisibility"],
            serde_json::json!([false, true, false])
        );
    }
    #[test]
    fn startup_child_probe() {
        if !std::env::args().any(|a| a == "--exact")
            || !Path::new("startup-probe.request").is_file()
        {
            return;
        }
        let mut startup: STARTUPINFOW = unsafe { std::mem::zeroed() };
        startup.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
        unsafe {
            GetStartupInfoW(&mut startup);
        }
        let window = unsafe {
            CreateWindowExW(
                0,
                wide(OsStr::new("STATIC")).unwrap().as_ptr(),
                wide(OsStr::new("Spark owned visibility probe"))
                    .unwrap()
                    .as_ptr(),
                WS_OVERLAPPEDWINDOW,
                0,
                0,
                160,
                100,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null(),
            )
        };
        assert!(!window.is_null());
        let hidden = visible_window(std::process::id()).unwrap();
        unsafe {
            ShowWindow(window, SW_SHOWNORMAL);
        }
        let shown = visible_window(std::process::id()).unwrap();
        unsafe {
            ShowWindow(window, SW_HIDE);
        }
        let hidden_again = visible_window(std::process::id()).unwrap();
        unsafe {
            DestroyWindow(window);
        }
        fs::write("startup-probe.json", serde_json::to_vec(&serde_json::json!({
            "show": startup.wShowWindow, "explicitShow": startup.dwFlags & STARTF_USESHOWWINDOW != 0,
            "standardHandlesProvided": startup.dwFlags & STARTF_USESTDHANDLES != 0,
            "ownedWindowVisibility": [hidden,shown,hidden_again],
        })).unwrap()).unwrap();
    }
}
