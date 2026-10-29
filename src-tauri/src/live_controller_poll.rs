//! Local controller scheduling only: no game handles, suspension or writes.
//! Preparation releases the state mutex before acquiring the shared edit lock.
use spark_core::{Result, SparkError};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};

#[derive(Debug, PartialEq, Eq)]
pub(super) enum Outcome {
    Closed,
    Idle,
    Worked,
}

pub(super) fn run<S, Ticket, Guard>(
    closed: &AtomicBool,
    state: &Mutex<S>,
    label: &str,
    prepare: impl FnOnce(&mut S) -> Result<Option<Ticket>>,
    acquire_edit: impl FnOnce() -> Result<Guard>,
    current: impl FnOnce(&S, &Ticket) -> bool,
    update: impl FnOnce(&mut S, Ticket) -> Result<()>,
) -> Result<Outcome> {
    if closed.load(Ordering::Acquire) {
        return Ok(Outcome::Closed);
    }
    let ticket = {
        let mut data = state
            .lock()
            .map_err(|_| SparkError::Invalid(format!("{label} state lock failed")))?;
        if closed.load(Ordering::Acquire) {
            return Ok(Outcome::Closed);
        }
        prepare(&mut data)?
    };
    let Some(ticket) = ticket else {
        return Ok(Outcome::Idle);
    };
    if closed.load(Ordering::Acquire) {
        return Ok(Outcome::Closed);
    }
    let _edit = acquire_edit()?;
    if closed.load(Ordering::Acquire) {
        return Ok(Outcome::Closed);
    }
    let mut data = state
        .lock()
        .map_err(|_| SparkError::Invalid(format!("{label} state lock failed")))?;
    if closed.load(Ordering::Acquire) {
        return Ok(Outcome::Closed);
    }
    if !current(&data, &ticket) {
        return Ok(Outcome::Idle);
    }
    update(&mut data, ticket)?;
    Ok(Outcome::Worked)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    struct State {
        enabled: bool,
        pending: bool,
        error: Option<String>,
        revision: u64,
    }
    fn state(enabled: bool) -> Mutex<State> {
        Mutex::new(State {
            enabled,
            pending: enabled,
            error: None,
            revision: 0,
        })
    }

    #[test]
    fn disabled_and_pending_polls_do_not_acquire_edit_or_touch_transport() {
        let closed = AtomicBool::new(false);
        let state = state(false);
        {
            let mut data = state.lock().unwrap();
            data.pending = true;
            data.error = Some("restore pending".into());
        }
        for _ in 0..100 {
            assert_eq!(
                run(
                    &closed,
                    &state,
                    "Test",
                    |s| Ok(s.enabled.then_some(())),
                    || -> Result<()> { panic!("idle poll acquired edit lock") },
                    |s, _| s.enabled,
                    |_, _| panic!("idle poll touched transport")
                )
                .unwrap(),
                Outcome::Idle
            );
        }
        let data = state.lock().unwrap();
        assert!(data.pending);
        assert_eq!(data.error.as_deref(), Some("restore pending"));
    }

    #[test]
    fn queued_enabled_poll_cannot_reapply_after_disable_and_one_restore() {
        let closed = AtomicBool::new(false);
        let state = state(true);
        let restores = Cell::new(0);
        let transport = Cell::new(0);
        let outcome = run(
            &closed,
            &state,
            "Test",
            |s| Ok(s.enabled.then_some(())),
            || {
                // A preceding explicit disable owns the edit lock before this poll.
                // try_lock also proves preparation released the local state mutex.
                let mut data = state
                    .try_lock()
                    .expect("local mutex held while acquiring edit lock");
                data.enabled = false;
                if data.pending {
                    restores.set(restores.get() + 1);
                    data.pending = false;
                }
                Ok(())
            },
            |s, _| s.enabled,
            |_, _| {
                transport.set(transport.get() + 1);
                Ok(())
            },
        )
        .unwrap();
        assert_eq!(outcome, Outcome::Idle);
        for _ in 0..100 {
            run(
                &closed,
                &state,
                "Test",
                |s| Ok(s.enabled.then_some(())),
                || -> Result<()> { panic!("disabled poll acquired edit lock") },
                |s, _| s.enabled,
                |_, _| {
                    transport.set(transport.get() + 1);
                    Ok(())
                },
            )
            .unwrap();
        }
        assert_eq!(restores.get(), 1);
        assert_eq!(transport.get(), 0);
    }

    #[test]
    fn closed_polls_skip_preparation_and_a_close_while_queued_skips_transport() {
        let closed = AtomicBool::new(true);
        let state = state(true);
        assert_eq!(
            run(
                &closed,
                &state,
                "Test",
                |_| -> Result<Option<()>> { panic!("closed preparation") },
                || -> Result<()> { panic!("closed edit lock") },
                |_, _| true,
                |_, _| panic!("closed transport")
            )
            .unwrap(),
            Outcome::Closed
        );
        closed.store(false, Ordering::Release);
        assert_eq!(
            run(
                &closed,
                &state,
                "Test",
                |s| Ok(s.enabled.then_some(())),
                || {
                    closed.store(true, Ordering::Release);
                    Ok(())
                },
                |_, _| panic!("closed state recheck"),
                |_, _| panic!("queued closed transport")
            )
            .unwrap(),
            Outcome::Closed
        );
    }

    #[test]
    fn stale_shortcut_ticket_is_discarded_after_a_newer_configuration() {
        let closed = AtomicBool::new(false);
        let state = state(false);
        assert_eq!(
            run(
                &closed,
                &state,
                "Test",
                |s| Ok(Some(s.revision)),
                || {
                    state.try_lock().unwrap().revision += 1;
                    Ok(())
                },
                |s, ticket| s.revision == *ticket,
                |_, _| panic!("stale shortcut toggled transport")
            )
            .unwrap(),
            Outcome::Idle
        );
    }

    #[test]
    fn enabled_poll_executes_once_and_lock_failures_preserve_pending_state() {
        let closed = AtomicBool::new(false);
        let state = state(true);
        let reads = Cell::new(0);
        assert_eq!(
            run(
                &closed,
                &state,
                "Test",
                |s| Ok(s.enabled.then_some(())),
                || Ok(()),
                |s, _| s.enabled,
                |_, _| {
                    reads.set(reads.get() + 1);
                    Ok(())
                }
            )
            .unwrap(),
            Outcome::Worked
        );
        assert_eq!(reads.get(), 1);
        assert!(run(
            &closed,
            &state,
            "Test",
            |s| Ok(s.enabled.then_some(())),
            || -> Result<()> { Err(SparkError::Invalid("busy".into())) },
            |_, _| true,
            |_, _| panic!("failed lock touched transport")
        )
        .is_err());
        assert!(state.lock().unwrap().pending);
    }
}
