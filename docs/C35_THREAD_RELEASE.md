# C35 r8 — Acknowledged thread release and recoverable edit failures

Continue `c13e1de` on `codex/continuation-35-living-workbench`. This repairs error handling around the existing experimental MCC pause transport. It adds no memory offsets, engine calls, arbitrary write endpoints or new gameplay capability. Original maps, editing kits and r1–r7 artifacts are retained.

## What changes for the user

A camera, sprint or shared-size operation now returns success only after its recorded thread releases are acknowledged. An operation can already have changed data when release subsequently fails; the error says so, and further edits in that connection are blocked. Existing restoration records remain available.

With the game snapshot available, the connected editor shows the release issue, disables object/size/undo, sprint and camera write controls, and offers **Retry thread release & disconnect**. When sampling is unavailable, **Game connection → Retry thread release & cleanup** shows the number of retained releases. The same observed connection ID is required. Retry releases only recorded increments before continuing the existing map-data cleanup. An uncertain retry retains its handles and the session; checking status performs no process or memory operation.

Read-only status still exposes the recovery token if a local data journal is poisoned. Disconnect first stops new writes and retries the independent thread journal, then attempts the local camera/sprint/size cleanup. Unavailable data state remains an explicit blocker; this does not reset or invent a damaged restoration journal.

## Engineering

All nine existing pause sites for camera apply/restore/update, sprint update/restore and scale/respawn/reset use `live_thread_pause::Recovery::run`. Preparation and the operation result are combined with explicit release results. Successful suspend increments are tracked with their original owned kernel handles; release runs in reverse order, including partial preparation and operation errors. A release failure cannot turn an applied operation into an unqualified success receipt.

Windows [SuspendThread](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-suspendthread) and [ResumeThread](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-resumethread) return prior suspend counts. Spark records its own successful increment and makes one corresponding decrement attempt. A failed API call retains the handle for retry. A completed thread is retired after its handle signals termination. A successful API return is never retried to force the count to zero: an unexpected zero or another owner's remaining count reports a fault. A pre-existing pause refuses the data operation, and cleanup removes only Spark's additional increments. No claim is made that other owners' threads are running.

The native backend checks completed enumeration, the target process of every opened thread and the existing four-pass / 512-thread bounds. Thread handles additionally request synchronization access for termination checks. Pausing Spark's own process is refused. No raw handle or generic PID/thread-resume command is exposed to the frontend. The existing exact-profile, process lifetime, module, map/object, connection-ID, readback and rollback checks remain in place.

An unwind guard still attempts release and records failures, but the normal result path no longer relies on an unobservable destructor. The thread journal is independent of local data locks. Normal application close still uses the existing cleanup path; uncertain cleanup retains the session instead of reporting completion.

## Evidence

**448 Rust tests pass / five explicit opt-in tests ignored; 190 frontend tests in 39 files; 64 browser tests; 59 offline checks.** TypeScript and Windows Vite/release-Rust/NSIS builds pass. The existing large Vite main-chunk warning remains.

Thirteen new Rust tests include eight simulated-backend failure cases, three actual Windows child-process cases and two session/status integration cases. They cover reverse release, open/pause/enumeration errors, combined operation/release errors, retained-handle retry, another owner's count, changed counts, unwind with a poisoned caller lock, thread bounds, observed thread exit and a blocked data-edit gate. A poisoned data journal retains a visible recovery token and cannot reopen new writes.

The native tests use hidden, owned PowerShell children and the actual Windows thread APIs. One injects a failure **before** calling ResumeThread, retains that real handle, then retries through the real API and observes normal child exit. Another verifies that a separate owner's increment remains until that owner removes it. The third terminates only its owned child to verify completed-thread retirement and checks self-pause refusal. These tests neither open MCC nor write process memory. They do not reproduce a real Windows ResumeThread failure or prove game timing.

Two browser contracts use synthetic sessions to verify retained retry counts/tokens and disabled connected object/sprint/camera writes while disconnect remains available. The packaged desktop independently verifies the idle `threadRelease` API and repeats the real-map Director phase-recording regression. Exact executable/test-binary identities and scoped results are in the [metadata-only receipt](fixtures/c35-thread-release-native-verification.json). Private libraries, owned content, recordings and full logs remain excluded from source packaging.

The accepted Windows executable is SHA-256 `d375ec76be1602e6960bd35defcb51719f3094aa65178b96ca2fef2a1ee91dda`. Its native idle API reports zero pending thread releases and no issue. The 10.8-second Ghost track take independently matches intro/loop/end source waveforms at 0.9822 / 0.9829 / 0.9884; the distant take has zero decoded RMS/peak. Named-take cancellation, pause/resume, background capture, fixed dimensions, file protection, reopening and original source preservation pass again. These are editor regression results, not new game-thread evidence.

## Remaining gates

Broad target-thread suspension remains the experimental mechanism. These changes do not provide an engine-owned apply boundary, a wall-clock pause deadline, positive private-session attestation, protection against thread creation during enumeration, cross-process recovery journals, abandoned-writer recovery or survival of abnormal Spark termination. Pending handles and the fault gate belong to this Spark connection; this is not a durable or universal process-wide recovery guarantee. Full poisoned-data restoration is also not implemented.

A new controlled MCC test is still required for camera, sprint, resizing, disconnect/reconnect and failure behavior on the reviewed game build. No MCC launch, game-memory write, gameplay acceptance or performance improvement is claimed in this pass. Native dual wield/sword/lunge, arbitrary live spawning/BSP replacement, peer replication and complete rendering/audio parity remain in the [319-row ledger](MASTER_FEATURE_LEDGER.md). The owner handles pushing; this is a local development build, with no master merge, installation or public release.
