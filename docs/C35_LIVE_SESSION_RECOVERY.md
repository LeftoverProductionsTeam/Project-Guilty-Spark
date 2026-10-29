# C35 r6 — Live-session cleanup, reconnect and stale edit handling

Continue `1f87ccf` on `codex/continuation-35-living-workbench`. This pass repairs cleanup and connection ownership around the existing experimental MCC adapter. It preserves the source editors, map conversion, Director audio and earlier release artifacts.

## User workflow

Open **Level editor → Live mode → Game connection**. If the game snapshot becomes unavailable but Spark retains a session, **Release previous live session** remains available. **Check previous session** reads only Spark's local restoration records; it does not open or write the game. Missing resources or an unavailable map viewer do not hide this cleanup route.

The result distinguishes **restored**, **obsolete records retired**, **no temporary changes**, and **already disconnected**. A verified current target uses the existing restoration operations. A positively observed process exit, replaced process lifetime, unloaded/replaced Halo 1 module or changed map identity retires the old records without writing old values into a replacement target. A failed observation or restoration retains the remaining records and reports an error for retry. Object position edits are not undone by disconnect.

On a cleanup attempt, automatic camera/sprint controls and the scale keeper stop requesting changes. Pending cleanup blocks new writable process access; only the existing journal-owned restore paths bypass that new-edit gate, and they retain the usual lifetime/module/map/readback checks. The connected view explains pending cleanup and pauses editor move/size/undo controls. Park and exit affected vehicles before retrying a same-map shared-physics restore.

Each connection receives a new ID, including reconnects to the same PID, process creation time and map. Cleanup, object moves/resizes and QuickForge position batches carry their observed connection ID. Old windows cannot apply those requests to a new connection. Bindings retain their original connection, and live undo/history resets when it changes. A late receipt from the old connection is not added to the new history, and its queued undo is discarded. Offline live controls no longer intercept the map editor's undo shortcut. These IDs are local operation preconditions, not game-peer authority or network authentication.

## Engineering changes

`live_cleanup.rs` separates observation, current-target restoration, obsolete-record retirement and final close. An unknown observation never selects retirement. Retirement acquires all affected local state locks before clearing journals; successful close occurs only after the selected operation succeeds. The existing typed byte-write, offset/profile, readback and rollback implementations are retained.

The Windows lifetime probe requests query/wait access, compares actual creation time and checks process completion. Failed access is not proof of exit: an absent PID requires completed process enumeration. Module absence likewise requires completed enumeration; enumeration failures remain errors. These checks follow the documented [process handle/lifetime model](https://learn.microsoft.com/en-us/windows/win32/procthread/process-handles-and-identifiers) and [module enumeration error reporting](https://learn.microsoft.com/en-us/windows/win32/toolhelp/module-walking). The scale keeper now checks stop/closed state before queued work as well as on loop entry.

The native disconnect API returns its actual result rather than a UI-generated “original vehicle physics restored” message. A separate lightweight status API keeps retained state visible after sample failure; its mutex work runs in a blocking worker rather than the UI command thread. The desktop emits a local session-change event, and the client rejects an absent/malformed cleanup receipt. Move/resize/batch IPC now requires `expectedSession`; clients should use `sessionToken` from the sampled live status. Internal experimental APIs remain version specific.

## Evidence

**431 Rust tests pass, with five explicit opt-in tests ignored; 179 frontend tests in 37 files; 59 browser tests; 59 offline checks.** TypeScript, Vite, release Rust and NSIS pass. The existing large Vite main-chunk warning remains.

Five cleanup-planner tests cover every retirement reason, unknown access, restoration failure, ordering and no-change cleanup. Windows tests use a private PowerShell child to query its actual creation time, reject a mismatched creation time, observe completed module absence and observe real exit. The child is hidden, ends through its owned input pipe, and is reaped by the test. It is not MCC, and no process-memory write or thread suspension is used. A separate local-session test checks fresh connection IDs, stale-token refusal, controller quiescence, the pending-write gate and idempotent cleanup without opening a target process.

Browser contracts exercise reachable cleanup when sampling fails, busy-state coordination, competing-window rejection, retained records after uncertain cleanup, retry with the new ID, same-map reconnect history reset and a late receipt with a queued undo. These tests use explicitly synthetic game observations; they do not establish gameplay restoration.

The actual packaged desktop also accepts the new idle cleanup/status API, returns an idempotent already-disconnected result and refuses move/resize requests missing their connection ID before any game attachment. The real-map Director regression saves/decode-checks a VP8/Opus take with Alpine's actual wind sample, checks silence beyond its saved range, and rechecks cancellation, pause/resume, background recording, fixed dimensions, reopening and source preservation. [Metadata-only acceptance](fixtures/c35-live-session-recovery-native-verification.json) identifies the exact tested executable and scopes. All owned caches, video, screenshots, full logs and private QA libraries stay outside the source archive.

## Remaining gates

A new full MCC gameplay test of disconnect/reconnect, process exit, module unloading, map changes and failed-restoration retry remains required. Identical map reloads that reuse all observed identity fields remain an existing limitation. This pass does not replace broad thread suspension with an engine-owned update boundary, acknowledge every resume result, bound elapsed pause time or recover from abnormal writer termination; those [transport audit gates](research/C34_LIVE_WRITE_AUDIT.md) remain open.

Native dual wield/sword/lunge, arbitrary live spawning/BSP replacement, game-peer replication, foreign-runtime lobby translation, expanded-player acceptance and full rendering/audio parity remain in the [319-row cumulative ledger](MASTER_FEATURE_LEDGER.md). Fresh r6 development artifacts preserve r1–r5. The owner handles pushing; no remote push, master merge, installation or public release is included.
