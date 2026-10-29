//! Bookkeeping for the existing experimental pause transport, not an engine update boundary.
//! Callers hold the process-lifetime edit lock. Only recorded successful increments are released.
use serde::Serialize;
use spark_core::{invalid, Result, SparkError};
use std::{collections::HashSet, sync::Mutex};
use windows_sys::Win32::{
    Foundation::*,
    System::{Diagnostics::ToolHelp::*, Threading::*},
};

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub pending_threads: usize,
    pub issue: Option<String>,
}
pub(super) enum Released {
    Decremented(u32),
    Ended,
}
pub(super) trait Backend {
    type Thread;
    fn enumerate(&self, pid: u32) -> Result<Vec<u32>>;
    fn open(&self, pid: u32, tid: u32) -> Result<Self::Thread>;
    fn suspend(&self, thread: &Self::Thread) -> Result<u32>;
    fn release(&self, thread: &Self::Thread) -> Result<Released>;
}
struct Owned<T> {
    thread: T,
    tid: u32,
    previous: u32,
}
struct Journal<T> {
    pending: Vec<Owned<T>>,
    issue: Option<String>,
}
pub(super) struct Recovery<B: Backend = Native> {
    backend: B,
    journal: Mutex<Journal<B::Thread>>,
}
impl<B: Backend + Default> Default for Recovery<B> {
    fn default() -> Self {
        Self::new(B::default())
    }
}
impl<B: Backend> Recovery<B> {
    fn new(backend: B) -> Self {
        Self {
            backend,
            journal: Mutex::new(Journal {
                pending: vec![],
                issue: None,
            }),
        }
    }
    fn journal(&self) -> std::sync::MutexGuard<'_, Journal<B::Thread>> {
        self.journal.lock().unwrap_or_else(|poisoned| {
            let mut journal = poisoned.into_inner();
            journal.issue = Some(
                "Thread release bookkeeping needs attention after an interrupted operation.".into(),
            );
            journal
        })
    }
    pub(super) fn status(&self) -> Status {
        let journal = self.journal();
        Status {
            pending_threads: journal.pending.len(),
            issue: journal.issue.clone(),
        }
    }
    fn note(&self, message: String) {
        self.journal().issue = Some(message);
    }
    /// Normal and error paths must acknowledge release before returning the operation result.
    pub(super) fn run<T>(&self, pid: u32, operation: impl FnOnce() -> Result<T>) -> Result<T> {
        if self.status().pending_threads != 0 {
            return invalid("Thread release is incomplete. Use Release previous live session before any further data operation.");
        }
        let mut guard = Guard {
            recovery: self,
            owned: vec![],
        };
        if let Err(error) = guard.acquire(pid) {
            return combine(Err(error), guard.finish());
        }
        let result = operation();
        combine(result, guard.finish())
    }
    fn release_owned(&self, owned: &mut Vec<Owned<B::Thread>>) -> Result<()> {
        let mut first = None;
        while let Some(entry) = owned.pop() {
            let result = self.backend.release(&entry.thread);
            let problem = match result {
                Ok(Released::Ended) => None,
                Ok(Released::Decremented(previous)) if previous == entry.previous + 1 => None,
                Ok(Released::Decremented(previous)) => Some(format!(
                    "Thread {} release observed suspend count {previous}, expected {}. No additional resume was attempted.",
                    entry.tid, entry.previous + 1)),
                Err(error) => {
                    let message = format!("Thread {} release was not acknowledged: {error}. Its owned increment is retained for retry.", entry.tid);
                    self.journal().pending.push(entry);
                    Some(message)
                }
            };
            if first.is_none() {
                first = problem;
            }
        }
        if let Some(message) = first {
            self.note(message.clone());
            return invalid(message);
        }
        Ok(())
    }
    /// Retained handles identify the original threads even after PID/TID reuse or a map change.
    /// A successful decrement is never retried, including counts that reveal another owner.
    pub(super) fn retry(&self) -> Result<()> {
        let mut pending = std::mem::take(&mut self.journal().pending);
        self.release_owned(&mut pending)
    }
    pub(super) fn clear_after_cleanup(&self) -> Result<()> {
        let mut journal = self.journal();
        if !journal.pending.is_empty() {
            return invalid("Thread release is still incomplete; its records cannot be retired.");
        }
        journal.issue = None;
        Ok(())
    }
    #[cfg(test)]
    pub(super) fn fixture_issue(&self) {
        self.note("Synthetic thread release fault for the session write-gate test.".into());
    }
}
fn combine<T>(operation: Result<T>, release: Result<()>) -> Result<T> {
    match (operation, release) {
        (Ok(value), Ok(())) => Ok(value),
        (Err(error), Ok(())) => Err(error),
        (Ok(_), Err(error)) => invalid(format!("The live data operation completed, but thread release is incomplete: {error}. Further edits are blocked; use Release previous live session.")),
        (Err(operation), Err(release)) => invalid(format!("{operation}; {release}")),
    }
}
struct Guard<'a, B: Backend> {
    recovery: &'a Recovery<B>,
    owned: Vec<Owned<B::Thread>>,
}
impl<B: Backend> Guard<'_, B> {
    fn acquire(&mut self, pid: u32) -> Result<()> {
        let mut ids = HashSet::new();
        for _ in 0..4 {
            let mut added = 0;
            for tid in self.recovery.backend.enumerate(pid)? {
                if ids.contains(&tid) {
                    continue;
                }
                if self.owned.len() >= 512 {
                    return invalid("MCC thread count exceeds the experimental pause bound.");
                }
                let thread = self.recovery.backend.open(pid, tid)?;
                let previous = self.recovery.backend.suspend(&thread)?;
                self.owned.push(Owned {
                    thread,
                    tid,
                    previous,
                });
                if previous != 0 {
                    let message = format!("Thread {tid} was already paused by another owner. No live data operation was run. Cleanup attempts only Spark's additional increments.");
                    self.recovery.note(message.clone());
                    return invalid(message);
                }
                ids.insert(tid);
                added += 1;
            }
            if added == 0 && !self.owned.is_empty() {
                return Ok(());
            }
        }
        invalid("MCC threads changed during preparation; no live data operation was run.")
    }
    fn finish(&mut self) -> Result<()> {
        self.recovery.release_owned(&mut self.owned)
    }
}
impl<B: Backend> Drop for Guard<'_, B> {
    fn drop(&mut self) {
        // Unwinding has no return channel. release_owned still retains failures and blocks new edits.
        let _ = self.finish();
    }
}

/// Windows kernel handles may be used across threads. Keep their owned integer representation
/// inside this module; no raw handle, thread ID or generic resume endpoint is exposed to the UI.
pub(super) struct ThreadHandle(usize);
impl ThreadHandle {
    fn raw(&self) -> HANDLE {
        self.0 as HANDLE
    }
}
impl Drop for ThreadHandle {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.raw());
        }
    }
}
#[derive(Default)]
pub(super) struct Native;
fn failed(message: &str) -> SparkError {
    SparkError::Invalid(format!("{message}: {}", std::io::Error::last_os_error()))
}
/// A thread can end between the liveness probe and ResumeThread. Recheck the original
/// handle after zero/failure, without ever issuing another decrement. A successful
/// zero count remains a mismatch when termination cannot be positively observed.
fn checked_release(
    mut ended: impl FnMut(u32) -> Result<bool>,
    resume: impl FnOnce() -> Result<u32>,
) -> Result<Released> {
    if ended(0)? {
        return Ok(Released::Ended);
    }
    match resume() {
        Ok(0) if matches!(ended(10), Ok(true)) => Ok(Released::Ended),
        Ok(count) => Ok(Released::Decremented(count)),
        Err(_) if matches!(ended(10), Ok(true)) => Ok(Released::Ended),
        Err(error) => Err(error),
    }
}
impl Backend for Native {
    type Thread = ThreadHandle;
    fn enumerate(&self, pid: u32) -> Result<Vec<u32>> {
        if pid == unsafe { GetCurrentProcessId() } {
            return invalid("Refusing to pause Spark's own process.");
        }
        let raw = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) };
        if raw == INVALID_HANDLE_VALUE {
            return Err(failed("Cannot enumerate MCC threads"));
        }
        let snapshot = ThreadHandle(raw as usize);
        let mut entry: THREADENTRY32 = unsafe { std::mem::zeroed() };
        entry.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
        let mut more = unsafe { Thread32First(snapshot.raw(), &mut entry) };
        let mut ids = vec![];
        while more != 0 {
            if entry.th32OwnerProcessID == pid {
                if ids.len() >= 512 {
                    return invalid("MCC thread count exceeds the experimental pause bound.");
                }
                ids.push(entry.th32ThreadID);
            }
            more = unsafe { Thread32Next(snapshot.raw(), &mut entry) };
        }
        if unsafe { GetLastError() } != ERROR_NO_MORE_FILES {
            return Err(failed("MCC thread enumeration did not complete"));
        }
        Ok(ids)
    }
    fn open(&self, pid: u32, tid: u32) -> Result<ThreadHandle> {
        let raw = unsafe {
            OpenThread(
                THREAD_SUSPEND_RESUME
                    | THREAD_QUERY_LIMITED_INFORMATION
                    | SYNCHRONIZATION_SYNCHRONIZE,
                0,
                tid,
            )
        };
        if raw.is_null() {
            return Err(failed("Cannot prepare MCC thread release bookkeeping"));
        }
        let thread = ThreadHandle(raw as usize);
        if unsafe { GetProcessIdOfThread(thread.raw()) } != pid {
            return invalid("MCC thread ownership changed during preparation.");
        }
        Ok(thread)
    }
    fn suspend(&self, thread: &ThreadHandle) -> Result<u32> {
        let count = unsafe { SuspendThread(thread.raw()) };
        if count == u32::MAX {
            return Err(failed("MCC thread pause was refused"));
        }
        Ok(count)
    }
    fn release(&self, thread: &ThreadHandle) -> Result<Released> {
        checked_release(
            |timeout| match unsafe { WaitForSingleObject(thread.raw(), timeout) } {
                WAIT_OBJECT_0 => Ok(true),
                WAIT_TIMEOUT => Ok(false),
                _ => Err(failed("Cannot verify the original paused thread")),
            },
            || {
                let count = unsafe { ResumeThread(thread.raw()) };
                if count == u32::MAX {
                    Err(failed("ResumeThread failed"))
                } else {
                    Ok(count)
                }
            },
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        cell::Cell,
        collections::HashMap,
        sync::{
            atomic::{AtomicBool, Ordering},
            Arc,
        },
    };
    #[test]
    fn exit_between_probe_and_release_is_verified_without_another_resume() {
        for fail_resume in [false, true] {
            let probes = std::cell::RefCell::new(vec![]);
            let resumes = Cell::new(0);
            let result = checked_release(
                |timeout| {
                    probes.borrow_mut().push(timeout);
                    Ok(timeout != 0)
                },
                || {
                    resumes.set(resumes.get() + 1);
                    if fail_resume {
                        invalid("Synthetic exit during resume")
                    } else {
                        Ok(0)
                    }
                },
            )
            .unwrap();
            assert!(matches!(result, Released::Ended));
            assert_eq!(resumes.get(), 1);
            assert_eq!(*probes.borrow(), [0, 10]);
        }
    }
    #[test]
    fn unconfirmed_exit_keeps_mismatches_and_failures_without_repeating_resume() {
        for fail_probe in [false, true] {
            for fail_resume in [false, true] {
                let resumes = Cell::new(0);
                let result = checked_release(
                    |timeout| {
                        if timeout == 0 || !fail_probe {
                            Ok(false)
                        } else {
                            invalid("Unknown thread state")
                        }
                    },
                    || {
                        resumes.set(resumes.get() + 1);
                        if fail_resume {
                            invalid("Resume not acknowledged")
                        } else {
                            Ok(0)
                        }
                    },
                );
                assert_eq!(resumes.get(), 1);
                if fail_resume {
                    assert!(result.is_err());
                } else {
                    assert!(matches!(result, Ok(Released::Decremented(0))));
                }
            }
        }
        assert!(checked_release(
            |_| invalid("Initial thread state unknown"),
            || panic!("unverified resume")
        )
        .is_err());
        assert!(matches!(
            checked_release(
                |timeout| {
                    assert_eq!(timeout, 0);
                    Ok(false)
                },
                || Ok(1)
            ),
            Ok(Released::Decremented(1))
        ));
    }

    #[derive(Default)]
    struct FakeState {
        ids: Vec<u32>,
        counts: HashMap<u32, u32>,
        events: Vec<String>,
        open_failure: Option<u32>,
        suspend_failure: Option<u32>,
        enumerate_failure: Option<usize>,
        enumerations: usize,
        release_failures: HashMap<u32, usize>,
        ended: bool,
    }
    #[derive(Clone)]
    struct Fake(Arc<Mutex<FakeState>>);
    impl Fake {
        fn new(ids: &[u32]) -> Self {
            Self(Arc::new(Mutex::new(FakeState {
                ids: ids.to_vec(),
                counts: ids.iter().map(|id| (*id, 0)).collect(),
                ..Default::default()
            })))
        }
        fn released(&self) -> Vec<String> {
            self.0
                .lock()
                .unwrap()
                .events
                .iter()
                .filter(|e| e.starts_with("release"))
                .cloned()
                .collect()
        }
    }
    impl Backend for Fake {
        type Thread = u32;
        fn enumerate(&self, _: u32) -> Result<Vec<u32>> {
            let mut data = self.0.lock().unwrap();
            data.enumerations += 1;
            if data.enumerate_failure == Some(data.enumerations) {
                return invalid("enumeration incomplete");
            }
            Ok(data.ids.clone())
        }
        fn open(&self, _: u32, tid: u32) -> Result<u32> {
            if self.0.lock().unwrap().open_failure == Some(tid) {
                return invalid("open refused");
            }
            Ok(tid)
        }
        fn suspend(&self, thread: &u32) -> Result<u32> {
            let mut data = self.0.lock().unwrap();
            if data.suspend_failure == Some(*thread) {
                return invalid("pause refused");
            }
            data.events.push(format!("suspend {thread}"));
            let count = data.counts.get_mut(thread).unwrap();
            let old = *count;
            *count += 1;
            Ok(old)
        }
        fn release(&self, thread: &u32) -> Result<Released> {
            let mut data = self.0.lock().unwrap();
            data.events.push(format!("release {thread}"));
            let fail = data.release_failures.entry(*thread).or_default();
            if *fail > 0 {
                *fail -= 1;
                return invalid("resume refused");
            }
            if data.ended {
                return Ok(Released::Ended);
            }
            let count = data.counts.get_mut(thread).unwrap();
            let old = *count;
            *count = count.saturating_sub(1);
            Ok(Released::Decremented(old))
        }
    }
    #[test]
    fn success_and_operation_failure_acknowledge_each_increment_once_in_reverse_order() {
        for fail in [false, true] {
            let backend = Fake::new(&[1, 2]);
            let recovery = Recovery::new(backend.clone());
            let result = recovery.run(7, || {
                assert_eq!(recovery.status().pending_threads, 0);
                if fail {
                    invalid("data apply refused")
                } else {
                    Ok(42)
                }
            });
            if fail {
                assert!(result
                    .unwrap_err()
                    .to_string()
                    .contains("data apply refused"));
            } else {
                assert_eq!(result.unwrap(), 42);
            }
            assert_eq!(backend.released(), ["release 2", "release 1"]);
            assert!(backend
                .0
                .lock()
                .unwrap()
                .counts
                .values()
                .all(|count| *count == 0));
            recovery.retry().unwrap();
            assert_eq!(backend.released().len(), 2);
            assert!(recovery.status().issue.is_none());
        }
    }
    #[test]
    fn acquisition_failures_release_only_successful_increments_and_never_apply() {
        for phase in ["open", "suspend", "enumerate"] {
            let backend = Fake::new(&[1, 2]);
            {
                let mut state = backend.0.lock().unwrap();
                match phase {
                    "open" => state.open_failure = Some(2),
                    "suspend" => state.suspend_failure = Some(2),
                    _ => state.enumerate_failure = Some(2),
                }
            }
            let recovery = Recovery::new(backend.clone());
            assert!(recovery
                .run::<()>(7, || panic!("partial preparation applied data"))
                .is_err());
            assert!(backend
                .0
                .lock()
                .unwrap()
                .counts
                .values()
                .all(|count| *count == 0));
            assert_eq!(
                backend.released(),
                if phase == "enumerate" {
                    vec!["release 2", "release 1"]
                } else {
                    vec!["release 1"]
                }
            );
        }
    }
    #[test]
    fn resume_failure_retains_only_unacknowledged_handles_and_combines_both_errors() {
        let backend = Fake::new(&[1, 2]);
        backend.0.lock().unwrap().release_failures.insert(2, 2);
        let recovery = Recovery::new(backend.clone());
        let error = recovery
            .run::<()>(7, || invalid("data rollback incomplete"))
            .unwrap_err()
            .to_string();
        assert!(
            error.contains("data rollback incomplete")
                && error.contains("release was not acknowledged")
        );
        assert_eq!(recovery.status().pending_threads, 1);
        assert!(recovery.clear_after_cleanup().is_err());
        assert!(recovery
            .run::<()>(7, || panic!("pending release applied data"))
            .is_err());
        assert!(recovery.retry().is_err());
        assert_eq!(recovery.status().pending_threads, 1);
        recovery.retry().unwrap();
        assert_eq!(recovery.status().pending_threads, 0);
        assert!(recovery.status().issue.is_some());
        recovery.clear_after_cleanup().unwrap();
        assert!(recovery.status().issue.is_none());
        assert_eq!(
            backend.released(),
            ["release 2", "release 1", "release 2", "release 2"]
        );
    }
    #[test]
    fn preexisting_foreign_pause_is_preserved_without_running_the_operation() {
        let backend = Fake::new(&[1, 2]);
        backend.0.lock().unwrap().counts.insert(2, 2);
        let recovery = Recovery::new(backend.clone());
        let error = recovery
            .run::<()>(7, || panic!("foreign-paused target edited"))
            .unwrap_err()
            .to_string();
        assert!(error.contains("already paused by another owner"));
        assert_eq!(backend.0.lock().unwrap().counts.get(&2), Some(&2));
        assert_eq!(backend.0.lock().unwrap().counts.get(&1), Some(&0));
        assert!(recovery.status().issue.is_some());
        assert_eq!(recovery.status().pending_threads, 0);
    }
    #[test]
    fn changed_suspend_counts_are_reported_and_never_resumed_to_zero() {
        for external in [0, 2] {
            let backend = Fake::new(&[1]);
            let recovery = Recovery::new(backend.clone());
            let error = recovery
                .run(7, || {
                    backend.0.lock().unwrap().counts.insert(1, external);
                    Ok(())
                })
                .unwrap_err()
                .to_string();
            assert!(error.contains("No additional resume was attempted"));
            assert_eq!(
                backend.0.lock().unwrap().counts[&1],
                external.saturating_sub(1)
            );
            recovery.retry().unwrap();
            assert_eq!(backend.released(), ["release 1"]);
            assert_eq!(recovery.status().pending_threads, 0);
            assert!(recovery.status().issue.is_some());
        }
    }
    #[test]
    fn unwind_releases_owned_increments_and_retains_a_failed_resume() {
        let backend = Fake::new(&[1, 2]);
        backend.0.lock().unwrap().release_failures.insert(2, 1);
        let recovery = Recovery::new(backend.clone());
        let data = Mutex::new(());
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            recovery.run::<()>(7, || {
                let _held = data.lock().unwrap();
                panic!("owned fixture unwind")
            })
        }));
        assert!(data.is_poisoned());
        assert!(result.is_err());
        assert_eq!(backend.released(), ["release 2", "release 1"]);
        assert_eq!(recovery.status().pending_threads, 1);
        recovery.retry().unwrap();
        assert!(backend
            .0
            .lock()
            .unwrap()
            .counts
            .values()
            .all(|count| *count == 0));
    }
    #[test]
    fn terminated_retained_threads_retire_without_a_second_decrement() {
        let backend = Fake::new(&[1]);
        backend.0.lock().unwrap().release_failures.insert(1, 1);
        let recovery = Recovery::new(backend.clone());
        assert!(recovery.run(7, || Ok(())).is_err());
        backend.0.lock().unwrap().ended = true;
        recovery.retry().unwrap();
        assert_eq!(recovery.status().pending_threads, 0);
        recovery.retry().unwrap();
        assert_eq!(backend.released().len(), 2);
    }
    #[test]
    fn thread_bound_and_empty_targets_never_run_an_operation() {
        for ids in [vec![], (1..=513).collect::<Vec<_>>()] {
            let backend = Fake::new(&ids);
            let recovery = Recovery::new(backend.clone());
            assert!(recovery
                .run::<()>(7, || panic!("unbounded target edited"))
                .is_err());
            assert!(backend
                .0
                .lock()
                .unwrap()
                .counts
                .values()
                .all(|count| *count == 0));
            assert_eq!(backend.released().len(), ids.len().min(512));
        }
    }

    struct Child(std::process::Child);
    impl Child {
        fn start() -> Self {
            use std::{
                io::{BufRead, BufReader},
                os::windows::process::CommandExt,
                process::{Command, Stdio},
                time::Duration,
            };
            let mut child=Self(Command::new("powershell.exe").args(["-NoProfile","-NonInteractive","-Command","[Console]::Out.WriteLine('spark-owned-pause-child'); [Console]::In.ReadLine() | Out-Null"])
                .creation_flags(CREATE_NO_WINDOW).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().unwrap());
            let stdout = child.0.stdout.take().unwrap();
            let (send, receive) = std::sync::mpsc::channel();
            std::thread::spawn(move || {
                let mut line = String::new();
                let result = BufReader::new(stdout).read_line(&mut line);
                let _ = send.send(result.map(|_| line));
            });
            assert_eq!(
                receive
                    .recv_timeout(Duration::from_secs(10))
                    .unwrap()
                    .unwrap()
                    .trim(),
                "spark-owned-pause-child"
            );
            child
        }
        fn finish(&mut self) {
            drop(self.0.stdin.take());
            let end = std::time::Instant::now() + std::time::Duration::from_secs(10);
            while self.0.try_wait().unwrap().is_none() {
                assert!(
                    std::time::Instant::now() < end,
                    "Owned pause child did not exit"
                );
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
            assert!(self.0.wait().unwrap().success());
        }
    }
    impl Drop for Child {
        fn drop(&mut self) {
            if self.0.try_wait().ok().flatten().is_none() {
                let _ = self.0.kill();
            }
            let _ = self.0.wait();
        }
    }
    struct FailOnceNative {
        failed: AtomicBool,
    }
    impl Backend for FailOnceNative {
        type Thread = ThreadHandle;
        fn enumerate(&self, pid: u32) -> Result<Vec<u32>> {
            Native.enumerate(pid)
        }
        fn open(&self, pid: u32, tid: u32) -> Result<ThreadHandle> {
            Native.open(pid, tid)
        }
        fn suspend(&self, thread: &ThreadHandle) -> Result<u32> {
            Native.suspend(thread)
        }
        fn release(&self, thread: &ThreadHandle) -> Result<Released> {
            if !self.failed.swap(true, Ordering::AcqRel) {
                return invalid("Injected release failure before calling the Windows API");
            }
            Native.release(thread)
        }
    }
    #[test]
    fn native_owned_child_resume_is_acknowledged_and_one_retained_increment_retries() {
        let mut child = Child::start();
        let recovery = Recovery::new(FailOnceNative {
            failed: AtomicBool::new(false),
        });
        let applied = Cell::new(false);
        let error = recovery
            .run(child.0.id(), || {
                applied.set(true);
                Ok(())
            })
            .unwrap_err()
            .to_string();
        assert!(applied.get());
        assert!(error.contains("release was not acknowledged"));
        assert_eq!(recovery.status().pending_threads, 1);
        recovery.retry().unwrap();
        assert_eq!(recovery.status().pending_threads, 0);
        recovery.clear_after_cleanup().unwrap();
        let value = Recovery::<Native>::default()
            .run(child.0.id(), || Ok(17))
            .unwrap();
        assert_eq!(value, 17);
        child.finish();
        eprintln!("C35 r8 native owned child: actual suspend/resume, injected pre-API failure, retained-handle retry and normal exit passed; no game or process-memory writes.");
    }
    #[test]
    fn native_owned_child_preserves_another_pause_owners_increment() {
        let mut child = Child::start();
        let pid = child.0.id();
        let tid = Native.enumerate(pid).unwrap()[0];
        let thread = Native.open(pid, tid).unwrap();
        assert_eq!(Native.suspend(&thread).unwrap(), 0);
        struct Foreign<'a>(&'a ThreadHandle, bool);
        impl Drop for Foreign<'_> {
            fn drop(&mut self) {
                if self.1 {
                    let _ = Native.release(self.0);
                }
            }
        }
        let mut foreign = Foreign(&thread, true);
        let recovery = Recovery::<Native>::default();
        let error = recovery
            .run::<()>(pid, || panic!("foreign-paused child edited"))
            .unwrap_err()
            .to_string();
        assert!(error.contains("already paused"));
        assert_eq!(recovery.status().pending_threads, 0);
        assert!(matches!(
            Native.release(&thread).unwrap(),
            Released::Decremented(1)
        ));
        foreign.1 = false;
        child.finish();
        eprintln!("C35 r8 native owned child: foreign suspend increment preserved, operation refused and owner-only release count 1 observed.");
    }
    #[test]
    fn native_owned_child_exit_retires_a_failed_release_and_self_pause_is_refused() {
        let mut child = Child::start();
        let recovery = Recovery::new(FailOnceNative {
            failed: AtomicBool::new(false),
        });
        assert!(recovery.run(child.0.id(), || Ok(())).is_err());
        child.0.kill().unwrap();
        child.0.wait().unwrap();
        // A process wait is not the retained thread's completion observation.
        // Synchronize the exact owned handles before certifying completed-exit retirement.
        for entry in &recovery.journal().pending {
            assert_eq!(
                unsafe { WaitForSingleObject(entry.thread.raw(), 10_000) },
                WAIT_OBJECT_0
            );
        }
        recovery.retry().unwrap();
        assert_eq!(recovery.status().pending_threads, 0);
        let own = Recovery::<Native>::default();
        assert!(own
            .run::<()>(unsafe { GetCurrentProcessId() }, || panic!(
                "self pause applied"
            ))
            .unwrap_err()
            .to_string()
            .contains("own process"));
        eprintln!("C35 r8 native owned child: completed thread exit retires its retained handle; Spark self-pause refused.");
    }
}
