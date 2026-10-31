//! Boot progress stays independent from library/settings locks so the window can paint.
use serde::Serialize;
use std::sync::{Condvar, Mutex};
use std::time::{Duration, Instant};
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Status {
    pub phase: String,
    pub completed: u8,
    pub total: u8,
    pub ready: bool,
    pub elapsed_ms: u64,
}
pub(super) struct Startup {
    status: Mutex<Status>,
    changed: Condvar,
    began: Instant,
}
impl Default for Startup {
    fn default() -> Self {
        Self {
            status: Mutex::new(Status {
                phase: "Opening your saved workbench".into(),
                completed: 0,
                total: 3,
                ready: false,
                elapsed_ms: 0,
            }),
            changed: Condvar::new(),
            began: Instant::now(),
        }
    }
}
impl Startup {
    pub fn progress(&self, completed: u8, phase: &str) {
        if let Ok(mut state) = self.status.lock() {
            if !state.ready {
                state.completed = completed.min(2);
                state.phase = phase.into();
            }
        }
    }
    pub fn finish(&self) {
        if let Ok(mut state) = self.status.lock() {
            state.completed = 3;
            state.ready = true;
            state.phase = "Workbench ready".into();
            self.changed.notify_all();
        }
    }
    pub fn snapshot(&self) -> Result<Status, String> {
        let mut state = self
            .status
            .lock()
            .map_err(|_| "Startup progress is unavailable")?
            .clone();
        state.elapsed_ms = self.began.elapsed().as_millis().min(u64::MAX as u128) as u64;
        Ok(state)
    }
    pub fn wait(&self) -> Result<(), String> {
        let state = self
            .status
            .lock()
            .map_err(|_| "Startup state is unavailable")?;
        let (state, _) = self
            .changed
            .wait_timeout_while(state, Duration::from_secs(120), |s| !s.ready)
            .map_err(|_| "Startup state is unavailable")?;
        if !state.ready {
            return Err("Local Halo discovery is still running. Restart Spark if the selected folder is unavailable.".into());
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn actual_phase_completion_wakes_bootstrap_and_cannot_move_backwards_after_ready() {
        let state = std::sync::Arc::new(Startup::default());
        state.progress(1, "Find Halo");
        assert_eq!(state.snapshot().unwrap().completed, 1);
        let waiting = state.clone();
        let worker = std::thread::spawn(move || waiting.wait());
        state.progress(2, "Connect maps");
        state.finish();
        worker.join().unwrap().unwrap();
        state.progress(0, "stale event");
        let result = state.snapshot().unwrap();
        assert!(result.ready);
        assert_eq!(result.completed, result.total);
    }
}
