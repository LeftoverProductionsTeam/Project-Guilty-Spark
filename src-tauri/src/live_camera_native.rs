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
struct CameraPollTicket {
    revision: u64,
    toggle: bool,
}
fn prepare_poll(
    data: &mut NativeCameraData,
    update_due: bool,
    input: impl FnOnce(&camera::Shortcut) -> Result<(bool, bool)>,
) -> Result<Option<CameraPollTicket>> {
    // Inactive F6 remains available, but only keyboard/focus state is sampled.
    // Neither the shared edit mutex nor a game process is needed for this.
    let toggle = if data.shortcut.enabled {
        let shortcut = data.shortcut.clone();
        let (down, focused) = input(&shortcut)?;
        data.shortcut_latch.sample(&shortcut, down, focused)
    } else {
        false
    };
    Ok(
        (toggle || (data.enabled && update_due)).then_some(CameraPollTicket {
            revision: data.poll_revision,
            toggle,
        }),
    )
}
fn current_poll(data: &NativeCameraData, ticket: &CameraPollTicket) -> bool {
    data.poll_revision == ticket.revision && (ticket.toggle || data.enabled)
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
    data.poll_revision = data.poll_revision.wrapping_add(1);
    data.enabled = false;
    if !data.state.active() {
        return Ok(());
    }
    if !processes()?.iter().any(|(pid, _)| *pid == s.pid) {
        data.state = camera::State::default();
        return Ok(());
    }
    let p = guarded_restore(s)?;
    s.scales.thread_release.run(s.pid, ||
        camera::apply(&p, s.base, &s.identity, &mut data.state, None))?;
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
    if shortcut.enabled { editing_allowed(s)?; }
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
    data.poll_revision = data.poll_revision.wrapping_add(1);
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
    data.poll_revision = data.poll_revision.wrapping_add(1);
    if data.enabled {
        restore_data(s, data)?;
    } else {
        if data.state.active() {
            return invalid("Camera restoration needs attention; restore before toggling");
        }
        let config = config.unwrap_or_else(|| data.config.clone());
        config.validate()?;
        let p = guarded(s, true)?;
        s.scales.thread_release.run(s.pid, ||
            camera::apply(&p, s.base, &s.identity, &mut data.state, Some(&config)))?;
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
        data.poll_revision = data.poll_revision.wrapping_add(1);
        if enabled {
            let p = guarded(s, true)?;
            s.scales.thread_release.run(s.pid, ||
                camera::apply(&p, s.base, &s.identity, &mut data.state, Some(&config)))?;
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
    let connection_id = s.connection_id.clone();
    let (pid, base, created, root, identity) =
        (s.pid, s.base, s.created, s.root.clone(), s.identity.clone());
    std::thread::spawn(move || {
        let mut last_update = std::time::Instant::now();
        loop {
            std::thread::sleep(std::time::Duration::from_millis(40));
            if closed.load(Ordering::Acquire) {
                break;
            }
            let (Some(camera), Some(sprint), Some(scales)) =
                (camera.upgrade(), sprint.upgrade(), scales.upgrade())
            else {
                break;
            };
            let session = Session {
                closed: closed.clone(),
                connection_id: connection_id.clone(),
                pid,
                base,
                created,
                root: root.clone(),
                identity: identity.clone(),
                camera,
                sprint,
                scales,
            };
            let update_due = last_update.elapsed() >= std::time::Duration::from_millis(120);
            let polled = controller_poll::run(
                &closed,
                &session.camera.data,
                "Camera",
                |data| {
                    prepare_poll(data, update_due, |shortcut| {
                        shortcut_input(&session, shortcut)
                    })
                },
                || EditLock::acquire(&session),
                current_poll,
                |data, ticket| {
                    let result = (|| -> Result<()> {
                        if ticket.toggle {
                            toggle_data(&session, data, None)?;
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
                            let config = data.config.clone();
                            session.scales.thread_release.run(pid, ||
                                camera::apply(&p, base, &identity, &mut data.state, Some(&config)))?;
                        }
                        Ok(())
                    })();
                    if let Err(error) = result {
                        let restore = restore_data(&session, data);
                        data.error = Some(format!(
                            "Native camera stopped: {error}. {}",
                            restore.err().map_or(
                                "Original camera data restored or no pending change.".into(),
                                |e| format!("Restore requires attention: {e}")
                            )
                        ));
                    }
                    Ok(())
                },
            );
            if matches!(polled, Ok(controller_poll::Outcome::Closed)) {
                break;
            }
        }
    });
}

#[cfg(test)]
mod poll_tests {
    use super::*;
    #[test]
    fn inactive_camera_keeps_f6_edges_without_requesting_idle_transport() {
        let mut data = NativeCameraData::default();
        assert!(prepare_poll(&mut data, true, |_| Ok((false, true)))
            .unwrap()
            .is_none());
        let ticket = prepare_poll(&mut data, true, |_| Ok((true, true)))
            .unwrap()
            .unwrap();
        assert!(ticket.toggle);
        assert!(current_poll(&data, &ticket));
        assert!(prepare_poll(&mut data, true, |_| Ok((true, true)))
            .unwrap()
            .is_none());
        data.poll_revision += 1;
        assert!(
            !current_poll(&data, &ticket),
            "queued F6 cannot override a newer explicit configure"
        );
    }
    #[test]
    fn camera_updates_only_when_enabled_and_due_without_erasing_pending_errors() {
        let mut data = NativeCameraData::default();
        data.shortcut.enabled = false;
        data.error = Some("restore pending".into());
        assert!(prepare_poll(&mut data, true, |_| panic!(
            "disabled shortcut sampled input"
        ))
        .unwrap()
        .is_none());
        assert_eq!(data.error.as_deref(), Some("restore pending"));
        data.enabled = true;
        assert!(prepare_poll(&mut data, false, |_| panic!(
            "disabled shortcut sampled input"
        ))
        .unwrap()
        .is_none());
        let ticket = prepare_poll(&mut data, true, |_| {
            panic!("disabled shortcut sampled input")
        })
        .unwrap()
        .unwrap();
        assert!(!ticket.toggle);
        assert!(current_poll(&data, &ticket));
        data.enabled = false;
        assert!(!current_poll(&data, &ticket));
    }
}
