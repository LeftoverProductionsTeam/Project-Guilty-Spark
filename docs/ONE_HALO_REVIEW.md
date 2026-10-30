# GitHub-ready review text

## Suggested title

One Halo: verify private native discovery and investigate the MCC H1 session boundary

## Concise summary

Adds an opt-in, bounded Chupathingy LAN discovery probe and read-only MCC H1 interface inspection. Real private tests verify discovery and show that unmodified Chupathingy v0.8.1c rejects MCC-only cache-13 startup. Actual MCC cross-play remains unimplemented; the report identifies the missing current-build game-side session/replication binding.

## PR description

Spark can discover community sessions and edit reviewed MCC objects, but neither capability makes the actual MCC H1 client a Chupathingy participant. This change isolates that engine integration problem without changing existing community protocols, client compatibility policy or native Halo tags.

- Implement the native search/advertisement wire in original Rust with strict bounds, endpoint/nonce validation, separate format/discovery/game versions and no retained session keys or join tokens.
- Add an opt-in CLI and publisher-pinned private native QA harness. A real v0.8.1c host answered the corrected probe; a separate MCC-only bootstrap test produced the source-backed UI cache-13 refusal. Inputs stayed unchanged and the native processes exited normally.
- Add a bounded PE32+ import/export reader that inspects owned MCC files without loading DLLs, calling exports or attaching to the game. Cover malformed input with synthetic fixtures and run those parser tests in CI.
- Document pinned sources, actual call paths, the twelve-layer protocol comparison, bridge candidates, ownership/license boundaries, gate status and the next passive admission-trace experiment. Include distribution-safe metadata and diagnostic excerpts.

Validation: `cargo test --workspace --locked` — 485 passed, 0 failed, 7 existing opt-in tests ignored; Node parser tests — 2 passed; discovery example built. Private native discovery and the expected MCC-content rejection were exercised separately.

**Acceptance limit:** Gate 1 passed. Gate 2 has no verified supported MCC H1 session/transport binding; actual MCC admission, paired map loading, spawning, movement, combat, vehicles, results and reconnect/stability remain untested. A factory export, UDP response or community client using other owned assets is not counted as MCC cross-play. OpenCE expansion is deferred until that engine path exists. No game binaries/assets or upstream engine source are distributed, and no live game patches were applied.

Review only on `codex/one-halo-mcc-investigation`, based on `489443d`. Do not publish a cross-play release or merge this as a completed interoperability feature. Existing C35/C36 features and releases remain preserved.
