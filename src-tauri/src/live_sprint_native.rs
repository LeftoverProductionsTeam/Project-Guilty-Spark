// Product keyboard sampling only; never simulates input or changes system bindings.
use super::*;
use live::sprint;
use windows_sys::Win32::UI::{
    Input::KeyboardAndMouse::GetAsyncKeyState,
    WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId},
};
fn fail(message: &str) -> spark_core::SparkError {
    spark_core::SparkError::Invalid(message.into())
}
fn virtual_key(key: &str) -> Result<i32> {
    let key = match key {
        "ShiftLeft" => 0xa0,
        "ShiftRight" => 0xa1,
        "ControlLeft" => 0xa2,
        "ControlRight" => 0xa3,
        "AltLeft" => 0xa4,
        "AltRight" => 0xa5,
        "Space" => 0x20,
        _ if key.len() == 4 && key.starts_with("Key") => i32::from(key.as_bytes()[3]),
        _ if key.len() == 6 && key.starts_with("Digit") => i32::from(key.as_bytes()[5]),
        _ => return invalid("Unsupported native sprint key"),
    };
    Ok(key)
}
fn held(s: &Session, key: &str) -> Result<bool> {
    let mut pid = 0;
    unsafe {
        GetWindowThreadProcessId(GetForegroundWindow(), &mut pid);
    }
    Ok(pid == s.pid && unsafe { GetAsyncKeyState(virtual_key(key)?) } < 0)
}
fn result(data: &NativeSprintData, observed: Option<sprint::Info>) -> NativeSprintStatus {
    NativeSprintStatus{enabled:data.enabled,sprinting:data.enabled && data.error.is_none() && data.state.active(),restore_pending:!data.enabled && data.state.active(),config:data.config.clone(),observed,error:data.error.clone(),detail:"Experimental native player-speed sprint. The game owns movement, gravity and collision; Spark changes only your player's multiplier while the hotkey and forward movement are held. Native animation-rate acceptance remains pending.".into()}
}
pub fn sprint_status(s: &Session) -> Result<NativeSprintStatus> {
    let _edit = EditLock::acquire(s)?;
    let p = guarded(s, false)?;
    let data = s
        .sprint
        .data
        .lock()
        .map_err(|_| fail("Sprint state lock failed"))?;
    let observed = sprint::info(&p, s.base, &s.identity).ok();
    Ok(result(&data, observed))
}
fn restore_data(s: &Session, data: &mut NativeSprintData) -> Result<()> {
    data.enabled = false;
    if !data.state.active() {
        return Ok(());
    }
    if !processes()?.iter().any(|(pid, _)| *pid == s.pid) {
        data.state = sprint::State::default();
        return Ok(());
    }
    let p = guarded(s, true)?;
    let _paused = PausedThreads::acquire(s.pid)?;
    sprint::reset(&p, s.base, &s.identity, &mut data.state)?;
    data.error = None;
    Ok(())
}
pub(super) fn restore_locked(s: &Session) -> Result<()> {
    let mut data = s
        .sprint
        .data
        .lock()
        .map_err(|_| fail("Sprint state lock failed"))?;
    restore_data(s, &mut data)
}
pub fn sprint_configure(
    s: &Session,
    enabled: bool,
    config: sprint::Config,
) -> Result<NativeSprintStatus> {
    config.validate()?;
    virtual_key(&config.hotkey)?;
    let status = {
        let _edit = EditLock::acquire(s)?;
        restore_locked(s)?;
        let observed = if enabled {
            Some(sprint::info(&guarded(s, false)?, s.base, &s.identity)?)
        } else {
            guarded(s, false)
                .ok()
                .and_then(|p| sprint::info(&p, s.base, &s.identity).ok())
        };
        let mut data = s
            .sprint
            .data
            .lock()
            .map_err(|_| fail("Sprint state lock failed"))?;
        data.config = config;
        data.enabled = enabled;
        data.error = None;
        result(&data, observed)
    };
    if enabled {
        start(s);
    }
    Ok(status)
}
fn start(s: &Session) {
    if s.sprint.started.swap(true, Ordering::AcqRel) {
        return;
    }
    let weak = Arc::downgrade(&s.sprint);
    let scales_weak = Arc::downgrade(&s.scales);
    let camera_weak = Arc::downgrade(&s.camera);
    let closed = s.closed.clone();
    let (pid, base, created, root, identity) =
        (s.pid, s.base, s.created, s.root.clone(), s.identity.clone());
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(40));
        let (Some(sprint), Some(scales), Some(camera)) =
            (weak.upgrade(), scales_weak.upgrade(), camera_weak.upgrade())
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
            scales,
            sprint,
            camera,
        };
        let _ = (|| -> Result<()> {
            let _edit = EditLock::acquire(&session)?;
            let mut data = session
                .sprint
                .data
                .lock()
                .map_err(|_| fail("Sprint state lock failed"))?;
            if !data.enabled {
                return Ok(());
            }
            let update = (|| -> Result<()> {
                let p = guarded(&session, false)?;
                let down = data.enabled && held(&session, &data.config.hotkey)?;
                if sprint::needs_update(&p, base, &identity, &data.state, &data.config, down)? {
                    let p = guarded(&session, true)?;
                    let _paused = PausedThreads::acquire(pid)?;
                    let config = data.config.clone();
                    sprint::tick(&p, base, &identity, &mut data.state, &config, down)?;
                }
                Ok(())
            })();
            if let Err(error) = update {
                let restore = restore_data(&session, &mut data);
                data.error = Some(format!(
                    "Native sprint stopped: {error}. {}",
                    restore.err().map_or(
                        "Original speed restored or no pending change.".into(),
                        |e| format!("Restore requires attention: {e}")
                    )
                ));
            }
            Ok(())
        })();
    });
}
