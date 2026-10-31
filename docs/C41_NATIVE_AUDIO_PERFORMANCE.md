# C41 native audio, performance and runtime follow-through

Continues the committed `c5bd78e` foundation in the existing local master worktree. Source recovery, C35–C39 history, native transactions, Baboon/Invader reconciliation, Smart Edit, SparkLink, four-view BSP Workshop and the earlier research/release artifacts remain preserved.

## Native audio acceptance

The actual Windows application imports an original MCC loop, recovers its pinned classic ADPCM samples, stages the complete recursive native dependencies and compiles a QuickForge sound-scenery attachment through Invader and H1A Tool. Cache readback verifies its original loop relationship and exact `[2, 3, 1]` placement. Twenty-five encoded permutations from two native sound dependencies are hash-compared with the original bank. A compiled sample decodes to 186,549 frames with nonzero energy. All 2,240 owner-supplied base-tag files remain unchanged.

Native inclusion and import form one undoable edit. Editor mute, volume, pitch and event audition remain rehearsal settings. They cannot silently rewrite the authored sound or its native build identity. A deliberately damaged managed import refuses rebuilding and leaves the previously accepted cache intact. Deliberate QA corruption is not blamed on an unobserved external tool.

The native sound-class audit also rejects a genuine compiler-produced candidate containing a music-class loop in both sound scenery and BSP background sound. That unsafe candidate is never launched. The implementation checks these supported attachment routes; it does not certify arbitrary script-triggered or dynamic game sound behavior. See [Halo sound-scenery known issues](https://c20.reclaimers.net/h1/tags/sound_scenery/#known-issues).

[Native audio evidence](fixtures/c41-native-loop-emitter.json) records exact source, tool, sample and compiled-output identities. **Actual target-game listening remains unverified.** Native tag/sample/placement acceptance is not evidence of audible MCC playback, acoustic parity or game-peer replication. [Usage and limits](NATIVE_LOOPING_EMITTERS.md).

## Performance acceptance

The repeatable native profiler uses real desktop IPC, fresh independent project/WebView directories, owned maps, the native animated monitor and actual texture/geometry decoding. Final before/after results are recorded in [the performance receipt](fixtures/c41-native-performance.json). Process-cold runs do not flush the Windows disk cache. Warm runs reuse only their own library and WebView profile.

Map readiness requires zero pending materials and a stable signature including every authored decal. Comparison requires matching source hashes, native mesh/model/object counts, map canvas resolution, effects, resident geometries and visible-pass triangles. Zombie Apocalypse retains 124 shader materials, 75 compatible installed-MCC bindings, 15 embedded lightmaps and eight decals; its missing original cubemaps remain explicit. Blood Gulch retains all source content and increases accepted reflection bindings from 65 to 68.

Two independent fresh-profile runs per executable produced these medians on the same Windows computer. The map canvas remains **1426 × 616**, with identical atmosphere/effects and visible geometry. These small-sample observations are not a performance guarantee.

| Measurement | Before | After | Interpretation |
| --- | ---: | ---: | --- |
| Process-cold shell | 0.988 s | 1.330 s | 0.342 s slower |
| Warm-process shell | 0.660 s | 0.751 s | 0.091 s slower |
| Process start to ready showcase | 5.620 s | 5.949 s | 0.329 s slower |
| Warm process to ready showcase | 3.235 s | 3.275 s | Essentially unchanged |
| Showcase initialization after shell | 4.527 s | 4.501 s | Essentially unchanged |
| First fully textured MCC Blood Gulch | 9.059 s | 8.017 s | 11.5% faster |
| First fully textured Zombie Apocalypse | 6.708 s | 5.564 s | 17.1% faster |
| Repeated map switches, eight samples | 5.694 s | 4.593 s | 19.3% faster |
| Bitmap decoding, total across four switches | 3.654 s | 2.763 s | 24.4% less decode time |
| Native reflection requests, four switches | 160 | 42 | 73.8% fewer requests |
| Catalog, 150 of 1,082 actual assets shown | 4.221 s | 4.097 s | Small change; no major catalog speedup claimed |
| Open-project native request | 2.584 s | 2.775 s | Slower; native validation remains enabled |
| Polling native round trip | 2.11 ms | 2.28 ms | No IPC latency improvement claimed |
| Sampled render rate | 55.8 fps | 60.0 fps | Same map resolution/geometry; bounded local sample |

Settled process-tree memory after repeat switching rose from **1,207.7 to 1,362.5 MiB private bytes** and **1,373.7 to 1,513.3 MiB working set**. At that checkpoint, machine-normalized owned CPU rose from **1.68% to 2.09%**, owned GPU 3D counters from **4% to 9%**, and dedicated GPU allocation from **121.6 to 128.3 MiB**. Sampling, WebView allocation and retained resources affect these observations. This pass improves resource reuse and map latency; it does **not** establish lower startup time, CPU, GPU or memory use. Startup and catalog preparation remain optimization work.

The bounded 64 MiB decoded-pixel cache reuses only identical DDS bytes after current source/resource identity validation. Callers receive independent pixel buffers. Resource changes invalidate stale pixels. Reflection loading retains successful cubes and explicit failures during incremental material arrival, then retries on a new source/resource epoch. Original resource/hash checks are not skipped.

CPU, RAM and GPU counters cover the owned process tree at settled checkpoints, not peaks or isolated whole-machine hardware performance. Increased cache memory is a tradeoff, not automatically a memory improvement. Earlier incomplete, premature-readiness, reduced-reflection and mismatched-viewport trials remain preserved and are excluded from accepted comparisons.

## Custom Edition diagnosis

Read-only health diagnostics inspect only the explicitly owned CE child, with bounded native dialog reads and timeouts. Captions alone are not accepted as a game menu. Fatal messages are selectable in Spark and remain captured after their dialog closes. Warnings remain visible for the user to review; Spark does not dismiss them.

Two concrete startup failures were identified:

1. The private copy omitted the installed `config.txt`. Spark now copies and verifies that exact graphics/device configuration, and preflight names a missing, empty or oversized file. Original game files are unchanged.
2. CE reported missing/corrupt `shaders\vsh.bin` even though its installed encrypted shader inputs were present and byte-identical. Static inspection of the owner's exact executable shows that it opens `vsh.enc` using `GENERIC_READ` and sharing mode zero, then emits the `.bin` error label when loading fails. Spark's retained data-read handle prevented this exclusive read.

The four exact native encrypted shader data files now use verified read-only **private copies** and a byte/attribute audit after client exit. Executables, maps and all other admitted files retain their existing write/delete-blocking handles. The exception does not admit arbitrary shader names or DLLs. It requires all four bounded shader resources before launch. No original installation, registry, driver, security setting or game executable was changed.

Read-only file attributes are not a security boundary against someone deliberately changing those attributes. Such a changed shader candidate fails the exit audit and the next full preparation/launch integrity check. A proposed attribute-only Windows handle was experimentally rejected because it failed to block writes; that research and its failing result remain preserved. See Microsoft's [file sharing contract](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew).

Native health observed a top-level `Halo` window without a fatal error or warning for ten minutes after the correction. The owner still could not confirm a visible usable game; the timed trial had ended before the reply. A user-started shortcut and private Workshop host were then prepared so the next test can start from Explorer. The owner deferred gameplay while preparing Xbox/community-runtime content. That follow-up's Spark page closed before manual acceptance, and its owned host stopped; a resumed join test requires a fresh host. **The visible menu, a genuine joined player and BSP collision/traversal remain unaccepted.** Dedicated native status continues to distinguish a loaded map from zero observed players. The two-room/corridor/ramp BSP retains genuine Tool/Invader compilation and cache readback; that does not establish a successful walkthrough.

## Community runtimes

The user's extracted OpenCE build 335 and Chupathingy 0.8.1d portable files match their respective publisher-digest-verified download archives. This establishes exact extracted files, not installation or game readiness. Required Xbox/Custom Edition content has not been admitted for these new copies, and no new community-runtime game connection is claimed. Their game-data setup is separate from ordinary CE and MCC. [Metadata-only verification](fixtures/c41-installed-community-runtimes.json).

## Usability and preservation

- Title-bar double-click maximizes/restores through Tauri's native drag-region behavior. Interactive controls remain excluded. The unused outer gutter and native rectangular shadow are removed while the curved app surface remains. Native maximize/restore and zero-gutter geometry were tested; desktop compositing could not be independently inspected through the unavailable desktop helper.
- Asset sources, type/search filters and imports use a compact toolbar; model cards retain actual lazy previews, drag operations and explicit paths. Sound audition controls remain available. Shared workspace spacing and CE hosting diagnostics are condensed.
- The original root checkout remains on its prior branch. Its original 146 dirty files are byte-identical to their preserved backups. The user's additional extracted runtime files are reported separately and are not deleted. All 30 captured branch tips and all 24 current non-alias references remain ancestors of local master; all 391 earlier ledger IDs remain in the 398-row ledger.
- Direct structural compiled-map editing remains unfinished in the master backlog. Loose-tag/compiler success does not complete it. Universal conversion, arbitrary live spawning/BSP replacement, full audiovisual parity and gameplay replication remain open.

## Release boundary

The final executable passed **603 locked Windows Rust tests** with seven opt-in cases ignored, **269 frontend tests**, **126 browser checks**, **59 offline scripts**, two interface-probe tests and TypeScript. Actual desktop native frame/maximize, asset/import/animation/build, original-loop audio and **31 CE lifecycle cases** pass. The CE cases preserve all 127 original game files and the 2,455 reviewed native tags. [Metadata receipt](fixtures/c41-audio-performance-validation.json).

Validation and artifact identities are recorded with this continuation's release evidence. The local worktree stays on master according to the owner's requested workflow. No direct remote master push, force push, ruleset change, remote CI success, GitHub About publication or clean-machine installer execution is claimed.
