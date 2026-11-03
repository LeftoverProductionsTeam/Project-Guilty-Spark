# C60 — release and technical debt closure

Date: November 3, 2026. Continues local master `67ef43bfe1576089a459ee9d1eb115f00de74921` (C59). No restart, reset, branch deletion, force push or tag rewrite. The separately dirty C41 root checkout and all experimental work remain untouched. Final commit identity is recorded in the local committed-source receipt; the commit is deliberately not embedded in its own content.

**Outcome:** repaired a reproduced library-refresh race, reduced redundant native work, consolidated two existing ownership boundaries, re-ran complete source/native regressions, and re-verified the exact accepted C49 Windows candidate. **Distribution is not public yet.** The owner chose to upload the prepared bundle; no GitHub draft, asset attachment, About/topics write or publication is claimed.

[Metadata receipt](fixtures/c60-release-maintenance.json) · [Push / upload handoff](C60_PUSH_NOTES.md). Private detailed logs, screenshots, original snapshots, benchmarks and candidate copies are retained under `.local/c60-release-maintenance-20261103` in the integration worktree.

## Repaired and reused code

The old global `refresh()` issued a full bootstrap for every notification, with no freshness fence. Native inbox import emits imported/library-changed notifications, and a later call could finish before an earlier one. The new snapshot could then be replaced by the older reply. A deliberately delayed synthetic browser test reproduces that overwrite on C59 and passes on C60; the edited map remains at its authored value throughout.

`latestRefresh.ts` now orders invalidations with one in-flight read and one coalesced trailing request. Superseded replies are not published, latest errors remain visible, a failed read can retry, and closing/remounting an owner prevents late publication. It retains no persistent cached output. Focused-map build metadata uses the same queue and cannot enter a different active map. A save receipt fences any already-running global read; an idle ordinary save still updates only its library entry. Error handling no longer leaves background refresh rejections unobserved.

| Area reviewed | Before → after, lines | Decision and evidence |
| --- | --- | --- |
| `src-tauri/src/app.rs` | 3,232 → 3,143 | Five existing window/lease commands moved to `workspace_windows.rs`, beside placement/recovery. Only function visibility and registration paths changed. A normalized comparison verifies the function bodies are identical. The history-lock release before UI dispatch, one-writer lease, rollback, Live MCC cleanup and source-tool guards are preserved. |
| `src/App.tsx` | 1,755 → 1,763 | A real ordering fix adds bounded refresh ownership. Splitting arbitrary UI sections solely to reduce the line count would not repair the race. Existing document/history and incremental receipt handling are reused. |
| `QuickForge.tsx` | 3,821 → 3,780 | Two repeated preview-source resource branches now use `openMapPreviewSource`. Exact native cache format and pins decide resource admission; hosting preferences do not. No cache was added. Native hash validation and explicit missing-resource behavior remain; another returned source identity is rejected. Caller lifetime/resource-scope guards remain. |
| `World.tsx` | 2,282 → 2,282 | Retained. Rendering, picking, source-bound materials and retained-map lifecycles are coupled intentionally; no demonstrated safe removal justified a broad renderer rewrite. |
| Core `quickforge.rs` | 2,085 → 2,085 | Retained. Native source/collision/material builders and validation are not redundant with visual meshes. |
| Global styles | 3,927 → 3,927 | Retained. Repeated selectors include intentional responsive/override rules; spelling matches are not deletion proof. The full native layout audit passes. |
| Capability catalogs | Retained | Runtime/format admission, tool launch, rendering support, Live Link writes and gameplay evidence are distinct gates. Merging them into one support Boolean would weaken correctness. |

The current lexical audit covers 933 tracked source/config/script files, 4,015 discovered functions, 3,657 import/use references and 1,118 literal IPC calls. **All 255 registered IPC names remain identical.** The earlier baseline was 927 / 4,009 / 3,633 / 1,121. These are inventory counts, not semantic dead-code proof.

Previously named candidates were rechecked across application, Rust, scripts, tests and native registrations:

- `LiveLab`, `dragWindow` and `Breadcrumb` were already absent before C60; they were not removed again or counted as new work.
- `launch_native` is a registered explicit-refusal compatibility command. It stays registered; arbitrary execution is not restored.
- Public Rust `hosting_plan`, `read_cache`, `parse_maps` and `pair_recipe` remain. No local caller is insufficient to discard a public downstream interface.
- `live_mcc_apply` remains an internal reviewed helper with its Smart Edit caller; the unsafe public overlap removed in C51 stays absent.

No production feature/API or validation/recovery code was deleted. The proven duplication removed is repeated resource-selection branching and concurrent whole-library reads. The 472-row requirements CSV remains exactly **1,001,461 bytes**, SHA-256 `aad57672fe87c3cd2077df325b18d353ddf573a0c73b7f7940142b2403794c51`.

## Comparable performance observations

Two complete independent fresh-profile runs per executable use profiler v4, the same owned MCC and CE Blood Gulch sources, 1440×900 initial viewport and identical 1428×888 map work area. Windows filesystem caches are **not flushed**. Process-cold and warm-process starts are separate. Both executables are optimized embedded builds:

- C59 baseline SHA-256: `6ff7e2b869efdf6e5fe979c336b80128ea0d331911a65b766ec84fbdf291ca7b`.
- C60 tested SHA-256: `195070aba1f3f12346996d6d9c1d99323620ba9a0e6b89513e113254e23c1ecf`.

| Observation | C59 median | C60 median |
| --- | ---: | ---: |
| Process-cold native shell | 1,298 ms | 1,116 ms |
| Process-cold fully textured/reflected Home showcase | 7,207 ms | 5,731 ms |
| Warm-process native shell | 875 ms | 886 ms |
| Warm-process showcase ready | 3,436 ms | 3,440 ms |
| First complete MCC map view | 9,001 ms | 8,963 ms |
| First complete CE map view | 6,006 ms | 6,064 ms |
| Repeated map switching, eight samples per executable | 950 ms | 959 ms |
| Large installed-map asset catalog | 3,316 ms | 3,345 ms |
| Warm return to Home | 1,129 ms | 982 ms |
| Repeated native `open_project` round trip | 98.3 ms | 101.3 ms |
| Rendering | 59.88 FPS | 59.70 FPS |

These small samples show **mixed results**, not a general startup, map, IPC or frame-rate speedup. The first baseline is retained; faster cold observations are not treated as isolated causal proof. Texture/resource resolution and geometry/shader counts remain part of complete readiness. Warm switches require **zero repeated bitmap decodes and zero repeated reflection requests** in both builds; existing revision/resource-keyed reuse was preserved rather than invented anew.

The demonstrated reduction is a real native 40-notification burst, with actual events and IPC rather than a mocked backend. After a separately retained settling trial, both warm trials show:

| Burst work | C59 | C60 |
| --- | ---: | ---: |
| Full library bootstrap reads | 40 | 2 |
| Focused-map metadata reads | 40 | 2 |

That is **95% fewer reads** for each stream, bounded concurrency and stale-publication protection. The quiescence measurement includes a fixed quiet-period observation; it is not a claim of 95% lower user latency. Continuous new mutations still require fresh reads.

### Quality and memory boundaries

The comparison refuses mismatched source hashes, shader identities, complete material signatures, models, geometry, decals, reflection bindings, resolution or renderer effects. Both maps retain 5,503 native render triangles, 68 native model types, 159 source shaders and 73 reflection assignments. The tested MCC view retains all eight authored decals. This is source/preview parity between the two Spark builds; it does not claim full Halo engine parity. Current screenshots come from actual native app tests, not generated artwork.

At the settled repeated-map phase, median owned process-tree resident memory is **1,807 → 1,926 MiB**, private memory **1,823 → 1,937 MiB**, dedicated GPU allocation **361.8 → 362.4 MiB**, machine-normalized process CPU **3.22 → 3.48%**, and sampled 3D engine usage **15.5 → 15.5%**. Memory is not improved and a whole-process budget remains open. GPU samples are owned-process observations, not an isolated whole-machine GPU benchmark or complete peak-allocation proof.

A separate one→three→one native-window workload records resident memory **1,234→2,267→1,128 MiB** on C59 and **1,758→2,327→1,238 MiB** on C60. Dedicated GPU samples are **138.7→334.0→309.2 MiB** and **142.3→326.0→300.8 MiB**. These single-run samples are variable and do not establish a global RAM cap or full immediate GPU reclamation. Native functional checks separately verify zero actual GL clears while inactive/minimized, resumption of the same canvas, two warm map contexts per window, and document/history retention after a third context is retired.

## Native build preservation

Three independent Spark processes use separate project directories and actual source transactions. The fresh test passes simultaneous BSP UI edits, author-specific Undo/Redo, actual drag ghosts, conflicts, viewer/build permissions, reconnect after editor lease expiry, 240 sustained commits, host process termination with two genuine offline edits, exact pending-operation recovery, durable rollover, revoked-participant refusal and same-computer Radmin convergence.

A frozen shared revision **247** compiles with the actual H1A toolchain in **125.734 seconds** while newer revision 248 remains independent. The resulting cache has version 13, 58 collision triangles, two portals and 2,239 inspected tags; SHA-256 `f94cbbbbf0643fb5accb2211f5930273e547891e48c1617ec285b706d8ca4b1e`. Game execution is not part of that test.

A separate production CE→MCC conversion completes in **288.835 seconds**, including extraction, staging, native compilation and validation. This is one current measurement, **not** a controlled before/after improvement. The native conversion pipeline was not changed by C60. Source CE 609 SHA-256 `81764a451b60d93cb3f2471c4efb6e7bc313e1c2f7105e0184f297e2a0ab475c` rebuilds to MCC 13 SHA-256 `6ce8de58af57901a68bc77007cdd9dc1ee65a2bee76cbd3866e4af110ae71c77`, identical to the prior accepted C58 conversion output. Both readbacks retain 5,503 render and 5,940 collision triangles, 68 model types and 186 inspected placements. The explicit `mcc-multiplayer-ui` profile is preserved; UI adaptation is not advertised as lossless. No new retail MCC game-load/playthrough or audible game test is claimed.

## Regression matrix

| Gate | Fresh result |
| --- | --- |
| Rust workspace, locked | 664 passed; 8 opt-in cases ignored |
| Frontend | 365 passed |
| Browser UI/contracts | 155 passed; synthetic IPC cases labeled separately |
| Offline regression scripts | 59 passed |
| Native diagnostics script tests | 37 passed |
| Release package / draft contracts | 10 Python tests + 6 Node tests passed; simulated HTTP contracts are not remote publication |
| TypeScript / optimized embedded app | Passed |
| Native window/history/lifecycle | 8 lifecycle + 8 history cases, frame/maximize/fullscreen check, 4 rollover cases |
| Native workspace audit | 23 routes + 2 geometry views, 126 size/subview states; no clipped controls or header collision |
| Native shared source and compiler | Real three-process test, compile/readback and crash/reconnection recovery passed |
| Preserved C49 Windows candidate | Exact files/hashes/source archive verify; extracted portable and newly installed payload both load their initial workspace; owned test installation removed normally |

Ignored cases are recorded, not counted as passed: read-only live community HTTPS listing; a running reviewed MCC camera-disconnect session; owned painted campaign BSP audio serialization; owned BSP detail serialization; custom power-up native cache build; campaign tag duplication/UI cache build; native looping-emitter rename build; and selected installed-MCC inventory. Their opt-in data/runtime gates remain distinct from this run. No new human gameplay, game audio listening, two-computer networking or physical monitor-disconnect acceptance was performed.

## Release status and public documentation

The original sealed C49 files in `.local/releases/C49-preview-cb07581` remain unchanged. The exact upload set and hashes are in [C60 handoff](C60_PUSH_NOTES.md). Both extracted portable and installed application re-opened successfully. Installation changed exactly Tauri's `UNK`→`NSS` marker (three bytes), and all other executable bytes match. The installer test refused the possibility of overwriting existing installations/shortcuts, used its own derived directory and was uninstalled normally afterward. This is local Windows acceptance, not an independent clean end-user machine or hosted CI result.

`recheck-windows.mjs` re-verifies a sealed older candidate by its complete executable/manifest identity rather than comparing it against a newer frontend directory. Its original full acceptance remains in its sealed manifest. New builds still use the existing stricter source/build/installer acceptance workflow.

Fresh GitHub API responses at **2026-11-03 12:53 UTC** show the C49 source commit exists, public releases are empty, remote master is `83a0b2ba9abbf96bc108bb43ff86d0af2ad4adb6`, and the intended preview tag is absent publicly. The reported remote master is an ancestor of the local C59 foundation. Anonymous API calls cannot inspect private drafts. The GitHub connector and browser helper are unavailable and Git has no usable saved login; the owner chose the locally prepared bundle. No remote metadata/write success is asserted.

The existing manual `release.yml` still builds a known pushed commit, runs tests and actual Windows package acceptance, prepares a **draft pre-release**, uploads real Release assets and re-downloads/hashes them. Optional Linux failure does not block accepted Windows. No script publishes, rewrites a prior tag or weakens repository rules. Owner approval and subsequent anonymous download verification are required before public release completion. Linux AppImage/Debian and macOS have no accepted native build/startup result in this pass.

README now puts all nine requested flagships first with explicit status, separates current-source features from C49's old snapshot, uses fresh native map/BSP screenshots and points Downloads to GitHub Releases while exposing the pending upload. Compatibility, onboarding, roadmap and cumulative release notes are updated. About text/topics are prepared for the owner; no remote update is claimed.

## Highest-impact open engineering gates

1. Attach the verified Windows release assets, approve publication, then pass actual anonymous installer/portable download verification.
2. Complete the player's two-way Timberland–Sidewinder traversal. There are still **zero player-verified region connections**; four-region/Megaworld gameplay remains gated.
3. Finish real human Firefight engagement, complete AI lifecycle/vehicle/shared-state parity between game peers, and automatic original Zombie carrier release. Preserve runtime-specific failures instead of extending simulator claims.
4. Finish structural direct compiled-map editing and general imported-terrain geometry authoring with native collision/portal rebuilds. Loose-tag tests do not close that backlog.
5. Verify non-MCC live-write adapters and complete runtime-specific game/asset conversions. Live Link, SparkLink source collaboration and game-peer replication remain separate.
6. Establish a whole-process/multi-window RAM budget and longer endurance acceptance; do not call two retained GPU contexts a global memory cap.
7. Accept actual two-computer LAN/VPN, physical multi-monitor recovery and an authorized production Steam identity. Spacewar remains refused in release builds.
8. Complete in-game native audio listening, pending opt-in source-format tests, Linux/macOS startup/packages and the full campaign playthrough.
