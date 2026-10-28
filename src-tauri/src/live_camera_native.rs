use super::*;
use live::camera;
use windows_sys::Win32::UI::{
    Input::KeyboardAndMouse::GetAsyncKeyState,
    WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId},
};
fn shortcut_input(s: &Session, shortcut: &camera::Shortcut) -> Result<(bool, bool)> {
    let key = 0x70 + i32::from(shortcut.function_key()?) - 1;
    let mut pid = 0;
    unsafe {
        GetWindowThreadProcessId(GetForegroundWindow(), &mut pid);
    }
    let modified = [0x10, 0x11, 0x12, 0x5b, 0x5c]
        .iter()
        .any(|key| unsafe { GetAsyncKeyState(*key) } < 0);
    Ok((
        unsafe { GetAsyncKeyState(key) } < 0,
        pid == s.pid && !modified,
    ))
}

fn fail(message: &str) -> spark_core::SparkError {
    spark_core::SparkError::Invalid(message.into())
}
fn status(data: &NativeCameraData, observed: Option<camera::Info>) -> NativeCameraStatus {
    NativeCameraStatus {
        enabled: data.enabled,
        active: data.enabled && data.error.is_none() && data.state.engaged(),
        restore_pending: !data.enabled && data.state.active(),
        config: data.config.clone(), shortcut:data.shortcut.clone(), observed, error: data.error.clone(),
        detail: "Experimental native third-person camera. Back, shoulder and height translate the authored biped camera track; the engine retains camera rotations, player control and weapon aiming. Camera tracks and weapon flags are shared by matching local tag definitions. Near/far aiming and wall-collision playtests remain required.".into(),
    }
}
pub fn camera_status(s: &Session) -> Result<NativeCameraStatus> {
    let _edit = EditLock::acquire(s)?;
    let p = guarded(s, false)?;
    let data = s
        .camera
        .data
        .lock()
        .map_err(|_| fail("Camera state lock failed"))?;
    Ok(status(&data, camera::info(&p, s.base, &s.identity).ok()))
}
fn restore_data(s: &Session, data: &mut NativeCameraData) -> Result<()> {
    data.enabled = false;
    if !data.state.active() {
        return Ok(());
    }
    if !processes()?.iter().any(|(pid, _)| *pid == s.pid) {
        data.state = camera::State::default();
        return Ok(());
    }
    let p = guarded(s, true)?;
    let _paused = PausedThreads::acquire(s.pid)?;
    camera::apply(&p, s.base, &s.identity, &mut data.state, None)?;
    data.error = None;
    Ok(())
}
pub(super) fn restore_locked(s: &Session) -> Result<()> {
    let mut data = s
        .camera
        .data
        .lock()
        .map_err(|_| fail("Camera state lock failed"))?;
    data.shortcut.enabled = false;
    restore_data(s, &mut data)
}
pub fn camera_shortcut(s: &Session, shortcut: camera::Shortcut) -> Result<NativeCameraStatus> {
    shortcut.function_key()?;
    let _edit = EditLock::acquire(s)?;
    let mut data = s
        .camera
        .data
        .lock()
        .map_err(|_| fail("Camera state lock failed"))?;
    if shortcut.enabled {
        guarded(s, false)?;
        if !data.enabled && data.state.active() {
            return invalid("Restore the pending camera change before enabling its shortcut");
        }
    }
    let (down, _) = shortcut_input(s, &shortcut)?;
    data.shortcut_latch.sample(&shortcut, down, false);
    data.shortcut = shortcut;
    let observed = guarded(s, false)
        .ok()
        .and_then(|p| camera::info(&p, s.base, &s.identity).ok());
    let result = status(&data, observed);
    drop(data);
    drop(_edit);
    start(s);
    Ok(result)
}
fn toggle_data(
    s: &Session,
    data: &mut NativeCameraData,
    config: Option<camera::Config>,
) -> Result<()> {
    if data.enabled {
        restore_data(s, data)?;
    } else {
        if data.state.active() {
            return invalid("Camera restoration needs attention; restore before toggling");
        }
        let config = config.unwrap_or_else(|| data.config.clone());
        config.validate()?;
        let p = guarded(s, true)?;
        let _paused = PausedThreads::acquire(s.pid)?;
        camera::apply(&p, s.base, &s.identity, &mut data.state, Some(&config))?;
        data.config = config;
        data.enabled = true;
    }
    data.error = None;
    Ok(())
}
pub fn camera_toggle(s: &Session, config: Option<camera::Config>) -> Result<NativeCameraStatus> {
    let result = {
        let _edit = EditLock::acquire(s)?;
        let mut data = s
            .camera
            .data
            .lock()
            .map_err(|_| fail("Camera state lock failed"))?;
        toggle_data(s, &mut data, config)?;
        let observed = guarded(s, false)
            .ok()
            .and_then(|p| camera::info(&p, s.base, &s.identity).ok());
        status(&data, observed)
    };
    start(s);
    Ok(result)
}
pub fn camera_configure(
    s: &Session,
    enabled: bool,
    config: camera::Config,
) -> Result<NativeCameraStatus> {
    config.validate()?;
    let result = {
        let _edit = EditLock::acquire(s)?;
        let mut data = s
            .camera
            .data
            .lock()
            .map_err(|_| fail("Camera state lock failed"))?;
        if enabled {
            let p = guarded(s, true)?;
            let _paused = PausedThreads::acquire(s.pid)?;
            camera::apply(&p, s.base, &s.identity, &mut data.state, Some(&config))?;
        } else {
            restore_data(s, &mut data)?;
        }
        data.config = config;
        data.enabled = enabled;
        data.error = None;
        let observed = guarded(s, false)
            .ok()
            .and_then(|p| camera::info(&p, s.base, &s.identity).ok());
        status(&data, observed)
    };
    if enabled {
        start(s);
    }
    Ok(result)
}
pub(super) fn start(s: &Session) {
    if s.camera.started.swap(true, Ordering::AcqRel) {
        return;
    }
    let camera = Arc::downgrade(&s.camera);
    let sprint = Arc::downgrade(&s.sprint);
    let scales = Arc::downgrade(&s.scales);
    let closed = s.closed.clone();
    let (pid, base, created, root, identity) =
        (s.pid, s.base, s.created, s.root.clone(), s.identity.clone());
    std::thread::spawn(move || {
        let mut last_update = std::time::Instant::now();
        loop {
            std::thread::sleep(std::time::Duration::from_millis(40));
            let (Some(camera), Some(sprint), Some(scales)) =
                (camera.upgrade(), sprint.upgrade(), scales.upgrade())
            else {
                break;
            };
            let session = Session {
                closed: closed.clone(),
                pid,
                base,
                created,
                root: root.clone(),
                identity: identity.clone(),
                camera,
                sprint,
                scales,
            };
            let _ = (|| -> Result<()> {
                let _edit = EditLock::acquire(&session)?;
                let mut data = session
                    .camera
                    .data
                    .lock()
                    .map_err(|_| fail("Camera state lock failed"))?;
                let result = (|| -> Result<()> {
                    let shortcut = data.shortcut.clone();
                    let (down, focused) = shortcut_input(&session, &shortcut)?;
                    if data.shortcut_latch.sample(&shortcut, down, focused) {
                        toggle_data(&session, &mut data, None)?;
                    }
                    if !data.enabled
                        || last_update.elapsed() < std::time::Duration::from_millis(120)
                    {
                        return Ok(());
                    }
                    last_update = std::time::Instant::now();
                    let p = guarded(&session, false)?;
                    if camera::needs_update(&p, base, &identity, &data.state, &data.config)? {
                        let p = guarded(&session, true)?;
                        let _paused = PausedThreads::acquire(pid)?;
                        let config = data.config.clone();
                        camera::apply(&p, base, &identity, &mut data.state, Some(&config))?;
                    }
                    Ok(())
                })();
                if let Err(error) = result {
                    let restore = restore_data(&session, &mut data);
                    data.error = Some(format!(
                        "Native camera stopped: {error}. {}",
                        restore.err().map_or(
                            "Original camera data restored or no pending change.".into(),
                            |e| format!("Restore requires attention: {e}")
                        )
                    ));
                }
                Ok(())
            })();
        }
    });
}
