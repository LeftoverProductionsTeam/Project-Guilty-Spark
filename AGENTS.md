# Permanent Spark repository policy

- The canonical development directory is `D:\Project Guilty Spark`. Work on local `master` there. Existing registered worktrees may be inspected solely to complete the explicitly authorized consolidation; do not start new feature work in them.
- Never create a branch or worktree automatically. Never clone Spark inside Spark or make a disposable full-project source copy. User instructions can explicitly authorize a different operation.
- Preserve every unique source edit, research result, meaningful commit, original map/tag and previous-good build. Verify provenance and hashes before changing storage. Do not reset, force-delete branches, indiscriminately clean Git, rewrite history or weaken repository rules.
- Before consolidation/removal, inspect all worktrees, branches, staged/unstaged/untracked source and commits not reachable from master. Preserve unfinished source in exact, hash-verified recovery records. A clean worktree or old name alone is not permission to delete it.
- Only remove reviewed redundant worktrees/branches after their work is proven preserved and the removal is explicitly authorized. Retain remote-tracking refs and historical tags. Never push or publish without authorization.
- Use the canonical root `.toolchain` and `node_modules`, `target/` for Cargo output, `artifacts/` for bounded generated runs/logs/captures, and `tools/` for registered local tools. Do not recreate the obsolete repository `.local` directory. Protected projects, unique evidence and releases belong in `preserved/` or their existing verified user-owned locations, never disposable caches.
- Generated jobs need explicit ownership, bounded storage/lifetime, active-job protection and safe interruption recovery. Reject staging inside its own source, never recursively copy Spark or follow reparse points, and reuse unchanged validated dependencies when safe. A small test must not copy an entire SDK. Native compilation may need an isolated writable tag tree; preserve input hashes and native correctness. Never use writable hardlinks for tool-edited tags.
- Before/after storage repair, measure the affected roots and inspect repository health. Delete only authorized, verified generated/redundant content; changed, unique, ambiguous, active and accepted-release files remain protected until their ownership and preservation are established. Retention warnings are not deletion authority.
- Preserve the existing native validators, recovery, source identities and distinct compiled-map/source-build/geometry workflows. Test actual user entrypoints; decoder counts, compiler exit codes and simulations do not prove rendering, audible game playback or gameplay.

## Active-task continuity and interruption recovery

- Before starting/resuming engineering, read `docs/ACTIVE_TASK.md`, `docs/PENDING_REQUESTS.md` and the bounded `docs/DIRECTIVE_LEDGER.md`. Reconcile them with actual Git status, source, running processes and evidence; a checkpoint is a recovery guide, never proof that an operation finished. Explicit user priorities override stale records.
- Preserve valid edits, original inputs and previous-good builds. Validate partial files and abandoned native outputs before reuse. Resume the last safe unfinished objective; never repeat an approved deletion or regenerate a complete tag library merely because a turn was interrupted.
- Update the compact checkpoint at meaningful milestones, before risky/long native operations and before voluntarily ending incomplete work. Use `scripts/active-task.mjs` for atomic updates with one bounded previous valid copy; reference evidence instead of copying logs. Record objective/status, revisions, changed work, acceptance, results, failures, active operations, last safe checkpoint and the exact next action.
- Preserve received directive identities, complete available instructions and unfinished acceptance criteria. Intake, queue consumption, archiving, a ledger entry or a local commit never establishes implementation or acceptance. Report manual requeue only when actual missing instructions are established.
- Keep this file-based safeguard lightweight: no new branch/worktree/database, daemon, hooks, scheduler changes, queue injection, automatic cleanup or rollback. Codex's application queue is outside repository control.

## Permanent engineering contract

- Read and apply `docs/ENGINEERING_CONTRACT.md` for every initiative. Preserve the complete requirements/research ledger and current implementations; inspect actual HEAD and unfinished work first.
- Keep implemented source, automated tests, native readback, native compilation, game loading, human gameplay, real game-peer acceptance and clean-machine release acceptance distinct. Select the highest-impact missing native gate within the active task and use existing components and available native tools.
- Standard exported Halo tags/maps must remain independently compatible. Do not invent native fields/classes, disguise cache formats, force Spark extensions or silently discard data. Optional authoring sidecars are separate.
- Maintain runtime-specific contracts and upstream/license provenance. No security bypasses, unauthorized proprietary downloads or arbitrary remote tool execution. Optional installations, large downloads, game-install changes, public servers and publication require explicit authorization. Never infer permission to push/publish from a local commit.

## Completion principles and independent work

- **Implementation incomplete:** continue feasible engineering in the existing implementation.
- **Automated acceptance incomplete:** continue reproducible tests and fixes.
- **Awaiting human verification:** record the exact missing evidence and preserve the unverified requirement; never claim a pass. Do not block unrelated, safely executable engineering or require a deferral approval merely to continue it. Respect requests to leave questions until the user returns.
- **Technically blocked:** identify the real dependency, preserve unfinished work and continue independent requirements where practical. Avoid repeated unchanged retries.
- **Accepted:** only when required evidence genuinely exists. Keep source, automated, native, human, game-peer and release evidence distinct.
- Use one clear current objective and the existing bounded checkpoint/ledger (at most 32 KiB/32 current directive records). Keep later or blocked criteria visible while progressing safe independent work; do not silently discard them or execute the entire historical queue during a bounded repair.
- Codex's queue delivers messages when a response ends; repository policy cannot control that scheduler. Do not build queue machinery, treat receipt as completion or endlessly repeat bookkeeping. Prefer actual source repair and validation, updating records only at meaningful milestones. Preserve all native validation, recovery and publication restrictions.
