//! Disconnect planning. Unknown observations preserve journals; obsolete targets are never restored.
use serde::Serialize;
use spark_core::Result;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RetiredTarget {
    ProcessEnded,
    ProcessReplaced,
    ModuleUnloaded,
    ModuleReplaced,
    MapChanged,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Target {
    Current,
    Retired(RetiredTarget),
}
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Outcome {
    Restored,
    Retired,
    NoChanges,
    AlreadyDisconnected,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub outcome: Outcome,
    pub retired_target: Option<RetiredTarget>,
    pub detail: String,
}
impl Report {
    pub fn already_disconnected() -> Self {
        Self {
            outcome: Outcome::AlreadyDisconnected,
            retired_target: None,
            detail: "Live session is already disconnected.".into(),
        }
    }
}
pub fn run(
    pending: bool,
    observe: impl FnOnce() -> Result<Target>,
    restore: impl FnOnce() -> Result<()>,
    retire: impl FnOnce() -> Result<()>,
    close: impl FnOnce(),
) -> Result<Report> {
    let report = if !pending {
        retire()?;
        Report { outcome: Outcome::NoChanges, retired_target: None,
            detail: "Disconnected. No temporary camera, sprint or shared-size changes needed restoration. Object position edits are not undone by disconnect.".into() }
    } else {
        match observe()? {
            Target::Current => {
                restore()?;
                Report { outcome: Outcome::Restored, retired_target: None,
                    detail: "Disconnected. Temporary camera, sprint and shared-size data restored. Object position edits are not undone by disconnect.".into() }
            }
            Target::Retired(reason) => {
                retire()?;
                let target = match reason {
                    RetiredTarget::ProcessEnded => "The original Halo process ended",
                    RetiredTarget::ProcessReplaced => {
                        "The original Halo process lifetime was replaced"
                    }
                    RetiredTarget::ModuleUnloaded => "The original Halo 1 module unloaded",
                    RetiredTarget::ModuleReplaced => "The original Halo 1 module was replaced",
                    RetiredTarget::MapChanged => "Halo loaded a different map identity",
                };
                Report { outcome: Outcome::Retired, retired_target: Some(reason),
                    detail: format!("Disconnected. {target}; obsolete restoration records were retired. No old values were written into the replacement session.") }
            }
        }
    };
    close();
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    #[test]
    fn every_obsolete_target_retires_without_running_restore() {
        for reason in [
            RetiredTarget::ProcessEnded,
            RetiredTarget::ProcessReplaced,
            RetiredTarget::ModuleUnloaded,
            RetiredTarget::ModuleReplaced,
            RetiredTarget::MapChanged,
        ] {
            let journal = Cell::new(true);
            let closed = Cell::new(false);
            let report = run(
                true,
                || Ok(Target::Retired(reason)),
                || panic!("obsolete target write"),
                || {
                    journal.set(false);
                    Ok(())
                },
                || closed.set(true),
            )
            .unwrap();
            assert_eq!(report.outcome, Outcome::Retired);
            assert_eq!(report.retired_target, Some(reason));
            assert!(!journal.get());
            assert!(closed.get());
            assert!(!report.detail.contains("data restored"));
        }
    }
    #[test]
    fn unknown_access_never_becomes_obsolete_or_successful() {
        let closed = Cell::new(false);
        let result = run(
            true,
            || spark_core::invalid("access denied"),
            || panic!("unknown target write"),
            || panic!("unknown journal erased"),
            || closed.set(true),
        );
        assert!(result.unwrap_err().to_string().contains("access denied"));
        assert!(!closed.get());
    }
    #[test]
    fn failed_restoration_retains_pending_state_and_does_not_close() {
        let pending = Cell::new(true);
        let closed = Cell::new(false);
        assert!(run(
            true,
            || Ok(Target::Current),
            || spark_core::invalid("park and exit vehicle"),
            || {
                pending.set(false);
                Ok(())
            },
            || closed.set(true)
        )
        .is_err());
        assert!(pending.get());
        assert!(!closed.get());
    }
    #[test]
    fn current_target_restores_before_closing_and_does_not_retire() {
        let restored = Cell::new(false);
        let report = run(
            true,
            || Ok(Target::Current),
            || {
                restored.set(true);
                Ok(())
            },
            || panic!("current journal erased"),
            || assert!(restored.get()),
        )
        .unwrap();
        assert_eq!(report.outcome, Outcome::Restored);
        assert!(report.detail.contains("position edits are not undone"));
    }
    #[test]
    fn no_changes_disconnects_without_opening_any_process() {
        let report = run(
            false,
            || panic!("unnecessary process probe"),
            || panic!("unnecessary write"),
            || Ok(()),
            || {},
        )
        .unwrap();
        assert_eq!(report.outcome, Outcome::NoChanges);
    }
}
