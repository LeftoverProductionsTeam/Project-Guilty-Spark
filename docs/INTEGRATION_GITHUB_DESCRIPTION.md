# Suggested title

Integrate BSP Workshop object authoring and validated native custom scenery

# Description

Workshop levels previously left object placement disconnected, and custom OBJ placements stopped native builds. This change keeps geometry and objects in one source project and compiles bounded closed static OBJ scenery into real Halo model/collision/scenario tags in a fresh owned build.

- Shared Workshop/object surface renderer, hierarchy entries, compact transforms in degrees, material binding, source-floor End snapping and retained Undo/Redo/reopen state.
- Explicit UV, closed/wound collision, shader, transform and size budgets; original source hashes and native render/collision readback.
- Derived-mesh reuse with fresh per-revision validation; indexed exact shared-resource lookup preserves ambiguity/range/hash refusal.
- Descriptor network/device-path admission before file access, transactional independent project imports, bounded OBJ material groups, receipt-to-console scenario binding and final compiled-output identity checking.
- Session-specific TLS guest credentials with ephemeral legacy identities, while same-session durable recovery retains authors/history.
- Classic game-folder setup fills executable/data location; installed CE 1.10 is inventoried. README, workflow evidence and open backlog updated.

## Validation

- Windows locked workspace: 543 passed, 7 existing opt-in tests ignored. Frontend: 237 tests/49 files; browser: 88 tests; offline: 59 scripts. TypeScript and native release build passed.
- Actual app/IPC/GPU: OBJ import/material assignment/place/End/Undo/Redo/switch/save/reopen; real H1A model/collision/BSP/lightmap/cache build and native readback.
- Corrupt isolated OBJ save rejected, prior valid cache unchanged, exact source recovery exported. A separate real native build changed after all three verification queries is rejected by the final hash guard; the deliberate writer is the private QA harness.
- C39 regression: three independent native processes/private directories, simultaneous tag/publication/placement convergence, permissions/conflicts/individual Undo/deduplication/revocation, frozen native compilation while editing continues, abrupt host recovery and original-source preservation.
- Real owned legacy-to-TLS credential reuse reproduced before the fix and rejected afterward; ordinary same-session/recovery authorship retained.
- 29-brush/462-triangle preview+validation: warm median 10.8 to 4.5 ms, p95 13.7 to 7.4 ms on this PC. All 146 preserved root research files unchanged.

## Limits and integration

Static OBJ scenery is local source authoring; general custom binary publication, animated assets, direct compiled-map editing, game-peer replication, arbitrary live BSP/object operations and complete rendering/audio parity remain open. Compiler/readback checks do not claim game loading or the deferred player walkthrough. CE installed maps pass read-only inventory; its extracted-source build still fails a lens-flare dependency after an explicitly non-lossless isolated enum-repair experiment. The broad security audit remains partial (82/1380 initial scoped files), with five locally corrected mechanisms and a retained managed checkpoint.

Full evidence: [native integration report](WORKBENCH_INTEGRATION.md), [selected native metadata](fixtures/workbench-integration-native.json).

Work remains on local master as requested. No remote push, force push, ruleset change or automated merge was attempted. Publish through the repository's permitted review workflow; branch protection remains in force. C35–C40 source history and unfinished research are retained.

The active master checkout is the existing `.local/c39-native-collaboration` worktree. The separate root research checkout is untouched; use the master worktree for this handoff.
