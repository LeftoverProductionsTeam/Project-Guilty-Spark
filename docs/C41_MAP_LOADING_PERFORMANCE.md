# C41 map-loading performance pass

Continues local master `68dc2c0` and its existing startup, native audio, source transactions and renderer. All previous measurements and release artifacts remain preserved.

## Changes

World reflection loading now groups up to four requested cubemaps into one short-lived native read transaction. Each transaction hashes one exact preserved map snapshot, opens the exact indexed shared bitmap file once, verifies its hash before/after indexing and verifies the same handle again after all face reads. It never reuses a file based only on its timestamp or skips a source check. Incorrect source identities reject the whole transaction; individual unsupported or missing cubes remain explicit refusals. A final resource-integrity failure rejects every result.

The editor checks the complete ordered response before creating textures. Incrementally arriving shaders join the next bounded batch. Successes and failures are deduplicated only within their exact source/resource epoch, and retired epochs cannot admit late GPU textures. The existing 16-cube/64 MiB resident limit and 64 MiB decoded-pixel cache remain unchanged. The single-cube API remains available for other previews and uses the same native reader.

The asset drawer also opts into the existing parallel source-inspection/texture-preparation path. Newly imported MCC sources can prepare their preview resources while preserving the map. Existing resource choices and newer edits retain the native binding guard. Already prepared sources avoid an immediate second connection/pinning pass; every actual preview still performs its normal native checks.

## Measurements

The [performance receipt](fixtures/c41-map-loading-performance.json) contains three complete runs per executable, alternated before/after, using separate fresh libraries and WebView profiles. Both builds use 1440×900/DPR 1 for home and the same 1428×888 map work area, with a 1426×616 rendered canvas. Readiness requires settled materials, all authored decals and a stable signature for at least 750 ms. These are process-cold runs with the Windows disk cache left intact.

All six runs are included. The first baseline took 11.077 seconds to the ready monitor, including an unusually slow 8.010-second source-open request; the other baseline startups took 4.167 and 4.033 seconds. Its cause was not established and it has not been discarded or used to claim a startup improvement.

| Measurement, median | Before | After | Interpretation |
| --- | ---: | ---: | --- |
| Repeated map switching, both maps | 4.583 s | 4.187 s | **8.6% faster** |
| Repeated MCC Blood Gulch load | 4.899 s | 4.315 s | **11.9% faster** |
| Repeated Zombie Apocalypse load | 4.087 s | 4.045 s | Effectively unchanged |
| Catalog, 150 visible of 1,082 assets | 4.221 s | 3.163 s | **25.1% faster** |
| First fully textured MCC Blood Gulch | 7.814 s | 7.659 s | Small 2.0% change |
| First fully textured Zombie Apocalypse | 5.387 s | 5.332 s | Small 1.0% change |
| Process start to ready monitor | 4.167 s | 4.252 s | No startup gain |
| Warm process to ready monitor | 2.810 s | 2.819 s | Unchanged |
| Process-cold shell | 1.108 s | 1.189 s | 81 ms slower in these samples |
| Reflection transactions across four switches | 42 | 16 | **61.9% fewer**; final runs used 16, 16 and 18 |
| Bitmap decode time across four switches | 2.791 s | 2.810 s | Unchanged |
| Settled rendering | 60.00 FPS | 59.98 FPS | Unchanged |

The strongest gains are catalog preparation and revisiting MCC content. First-load extraction/decoding and startup remain further optimization targets. These local samples are not a performance guarantee or a statistical significance claim.

Settled repeat-switch private memory measured 1,371.7 → 1,344.0 MiB and working set 1,536.3 → 1,513.4 MiB by median. The ranges overlap substantially: private memory was 1,313.3–1,384.6 MiB before and 1,297.1–1,459.1 MiB after. No general memory reduction is claimed. GPU 3D utilization remained 8% by median, dedicated GPU memory 127.9 → 128.5 MiB, and sampled process-tree CPU was 2.05% → 1.76% of machine capacity. These are settled observations, not peak-allocation or isolated whole-machine benchmarks.

## Rendering and native acceptance

Every source hash, shader-ID digest, native mesh count, visible-pass triangle count, resident geometry count, environment/effect setting and canvas size matches across all six runs. Blood Gulch retains **151 materials, 15 lightmaps, eight decals and 68 reflection bindings**. Zombie Apocalypse retains **124 materials, 75 compatible MCC bindings, 15 embedded lightmaps, eight decals and eight reflection bindings**. Its 43 missing original cube diagnostics stay explicit. No textures, decals, meshes, reflections or shader features are omitted to shorten readiness.

The [native validation receipt](fixtures/c41-map-loading-validation.json) records the tested application SHA-256, `aeb585c30adb495e3af45fd49c658e758c7c9b58e7e2fa733c790f8ee89a6ce6`, and these results:

- **606 locked Windows Rust tests pass**, with seven existing opt-in cases ignored. New checks compare all six faces against single-cube readback, preserve requested order, reject same-size resource corruption, refuse changed sources and retain exact index-path matching.
- **274 frontend tests, 126 browser checks, 59 offline suites and two interface probes pass**. TypeScript and optimized Windows/NSIS builds pass. Queue tests cover incremental arrivals, deduplicated refusals, retirement, retries after a new epoch and memory/count limits.
- Real desktop/native IPC confirms identical single/batch reflection faces, the animated 1,126-triangle monitor with three native clips, default grass/metal, recursive asset drag/import, undo/redo, model/collision/cache compilation and changed-import refusal with the previous-good build intact.
- The original-loop audio challenge passes again through Invader and Halo Tool: 25 exact source sample permutations, native loop attachment at `[2,3,1]`, compiled-sample readback, 2,240 unchanged base tags and rejection of a damaged import while retaining the accepted build. In-game listening remains unverified.

OpenCE and Chupathingy were checked read-only after profiling. Each now has 24 Xbox-format map headers, including `bloodgulch.map` and `ui.map`; OpenCE's existing log shows menu initialization. No new game launch or joined-player test was performed, and the user's runtime folders/configurations were left unchanged.

All 146 original dirty files still match their retained backups, and all 30 captured branch tips and 24 current non-alias references are contained in local master. User-added runtime files remain untouched. C35–C39 history, experimental research, prior releases and the unfinished direct structural compiled-map workflow remain preserved. CE gameplay traversal, actual MCC audio listening, game-peer replication and full runtime/rendering parity remain separate gates. Remote publication and a clean-machine installer run are not claimed.
