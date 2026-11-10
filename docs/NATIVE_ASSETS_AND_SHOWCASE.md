# Native assets and the animated home showcase

This continues `e8b5761` and preserves C35–C39 history, native reconciliation/build safeguards, experimental research and the unfinished direct compiled-map editor.

The later [C55 native asset pass](CONTINUATION_55_NATIVE_ASSETS.md) adds supported QuickForge Alt-drag/copy/paste and native build/readback, source-authored model emission, legal diffuse-free glass, source-aware preview lighting and the Xbox zero-range fog correction. It supersedes the older presentation-lighting description below. Complete local model lighting, engine shader parity and direct imported-terrain reshaping remain open; the historical reports below are retained.

The later [native looping-emitter milestone](NATIVE_LOOPING_EMITTERS.md) adds verified MCC bank-backed sound imports and native QuickForge sound scenery. It supersedes the blanket compiled-emitter gap only for that local source path; native gameplay listening and the broader audio goals remain open.

## 9 November vehicle texture-coordinate repair

The owner reported vehicles still differed from the game. R387 reproduces a real shared-reader failure in the native Windows app: the Warthog has **7,380 wrong UV coordinates**, the Scorpion 4,768, rocket Warthog 8,544 and Banshee 2,098. The Ghost's unit-scale mapping already matches. All required Warthog/Scorpion images and their 4/1 reflection cubes were loaded, so decoding success alone did not detect this error.

Cached model vertices have normalized texture coordinates and separate model U/V factors. The reader omitted those factors. Native CE/MCC/Xbox Warthog factors are approximately 1.999474 × 3.000816; Scorpion 4.14882 × 0.999792. The shared reader in crates/spark-core/src/render.rs now applies validated factors once to PC float and Xbox compressed UVs. Zero retains the documented unit-factor meaning; nonfinite/excessive values fail. Position, topology, normals, rig, LOD selection, shader UV scales, materials and lighting are unchanged. World, Asset Library and large tag previews consume the same corrected mesh.

Read-only format research used Invader commit 696830ff80af227e84e7237c2ef26eb2301ed110: src/tag/hek/definition/gbxmodel.json fields and src/recover/recover_method.cpp model UV restoration. No third-party implementation was copied.

The existing bounded native lifecycle test independently reads the original cache's model factors and selected vertex streams, compares every returned UV, opens actual Vehicle tags through Search tags/class selection, waits for all preview materials and captures Warthog/Scorpion images. The Demo mod has two Warthog-derived carrier objects instead of a stock Scorpion; R393 verifies those exact preserved objects. R392's stock-fixture assumption remains a failed attempt. R386's new-test hash-parameter error was corrected before the genuine R387 failure; neither is acceptance.

| Original source | Cache | Models checked | UV coordinates checked | Mismatches | Accepted native run |
| --- | --- | --- | --- | --- | --- |
| MCC Blood Gulch | 13 | 5 | 25302 | 0 | vehicle-after-r388 |
| Custom Edition Timberland | 609 | 5 | 25302 | 0 | vehicle-ce-r389 |
| Chupathingy Xbox Blood Gulch | 5 | 3 | 14660 | 0 | vehicle-chupa-r390 |
| OpenCE Xbox Blood Gulch | 5 | 3 | 14660 | 0 | vehicle-opence-r391 |
| Zombie Apocalypse Demo | 6 | 2 | 15924 | 0 | vehicle-demo-r393 |

Each accepted run completes 3 real native cases with 0 JavaScript errors, no mocked IPC, all required preview materials, unchanged original hashes and normal app close. Owned build/profile/library scratch is disposed under existing budgets. These are **native editor/source fidelity checks**, not new game-process or human gameplay acceptance.

R388 also passes the full Rust workspace: 908 passed, 9 explicit opt-in ignores. Source-entrypoint check: 1,071 modules / 0 issues. Frontend source is unchanged; frontend 476/browser 271 remains historical R368 evidence, not newly rerun. PC/Xbox geometry regression additionally verifies 2×3 mapping, native zero factors, unchanged geometry/normals/indices and corrupt-factor refusal.

QA app: E/qa-vehicle-uv-r388/GuiltySpark.exe, 49,771,520 bytes, SHA 20b8038e101b51fbaae3577eb94c5c7575c6c59f55fe524371efc5b4151a93a3; runtime-source fingerprint 74e4d46f070c945ff71a47dc9e9879b6712cb5b2fdfbf507733edd447d8c92eb, built from 79588ca plus the reviewed dirty source. This is not an installer or published release. E is the existing external GuiltySpark-Engineering-d49eb02588bf Temp evidence root. R387-before and R388-after native PNGs remain there beside each JSON/log; no Halo bytes enter Git.

**User path:** Open the owned map → Work → Tag editor → search its vehicle path and select Vehicle class → select the result. The large preview and that map's Level Editor use corrected coordinates automatically. Materials shows original shader/bitmap references; orbit and wheel zoom remain available. No new setting or conversion is required.

**Still open:** matched in-game lighting/reflection/LOD/material comparison, vehicle animation states and gameplay. Four runtime source-map previews do not certify four engine adapters or game-renderer parity. H29 records the human comparison; existing M2/M3–M6 gates and all 475 requirement identities remain open where previously unaccepted.

## Workflow

Home renders the actual monitor from an owned installed MCC campaign cache directly over the page. It has a transparent background, source textures/reflections, presentation lighting and gentle cursor response. The C41 polish prioritizes an available monitor source directly; Chief/other characters remain fallbacks when that source is unavailable. Spark does not bundle Halo art.

The monitor automatically plays **idle overlay**. Hover or focus its controls to pause/resume or select **monitor_talking-loop** or **stand unarmed idle**. These are native skeletal clips, separate from the cursor-facing presentation rotation. Reduced-motion preferences start playback paused. The base idle is an authored pose; selecting the talking clip does not play speech.

## C41 clarity and loading polish

The home presentation uses **1.5–2× canvas density** with antialiasing, a smaller bloom radius/strength, source-color grading and softer key/fill light. Its resting pose turns toward the left side of the page and its mouse-follow range now reaches both sides. Other model-inspection lighting, authored animation data and map environments retain their existing controls.

A bounded source-identity promise cache shares background preparation with the home view. An existing preserved `c40` source is opened before scanning/reimporting its installed counterpart. Returning to the library reuses the chosen immutable identity; native model/texture readers still apply their existing hash and resource checks. No GPU objects or unchecked pixels are cached by this resolver. Missing-source results are retryable, and separate installations have separate cache keys.

The [real desktop check](../scripts/test-home-showcase-native.mjs) verifies the same 1,126-triangle owned monitor, original texture/reflection, progressing native animation, actual render-buffer density, left/right screen heading and preserved source identity after a workspace round trip. Native screenshots were visually inspected. One fresh-load observation improved from **4,959 to 4,313 ms**; the return visit improved from **1,651 to 899 ms**. These are single local observations, not percentiles or a promise for every machine. Model discovery still reads and verifies owned files.

The native invoke binding is immutable, so the failed attempt to count its calls remains a failed diagnostic. No zero-call native claim is based on an empty trace. Three separate unit tests verify deduplication, preserved-source priority and missing/changed-installation retry policy. [Exact polish receipt](fixtures/c41-home-showcase-polish.json). The earlier broad native acceptance below remains historical; the C41 integration report and its separate executable identity preserve the six-suite consolidation evidence.

In **Asset library → Installed maps & downloads**, select a source and choose **Load assets**. Discovery covers registered runtimes, linked folders, Downloads and Spark's inbox. It reads bounded headers; asset payloads load on selection. Sources are preserved without replacing the current map or its unsaved draft. ZIP contents still pass the existing strict archive importer.

Drag an actual model preview into QuickForge or a supported source-map view. Spark extracts the exact native tag and recursive dependencies, copies them to a new private namespace, rewrites references with local Invader and checks native readback. The receipt and placement form one undoable edit. Failure leaves the map unchanged and retains staging evidence. Sound previews remain auditionable; native sound closures can be staged, but editor emitters are not compiled Halo sound-scenery placements.

New QuickForge source prepares real Blood Gulch grass/metal shaders from an owned matching runtime. Terrain uses grass; ordinary brushes use metal. Both QuickForge and BSP Workshop use the shared Halo material renderer. Missing source/tools produce a setup message instead of an invented texture or unrelated resource substitution. Neutral inspection lighting does not change a user's explicit environment or bake game lightmaps.

## Actual native acceptance

`scripts/test-assets-startup-native.mjs` runs a real Windows Spark/WebView/GPU process with native IPC and installed Halo tools. The final fresh run is `.local/native-assets-acceptance-i`. Its [public metadata receipt](fixtures/native-assets-showcase-native.json) contains no Halo payloads or session credentials.

| Check               | Result                                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Startup             | Ready observed by 653 ms after native initialization began; twelve independent status calls took 2.64–4.66 ms on this machine. A branded launch surface appears before the main bundle.                                                                    |
| Discovery           | 52 map/archive candidates found without decoding full payloads during scanning.                                                                                                                                                      |
| Source reflection   | Warthog hull: six exact 64×64 DXT1 cube faces, authored perpendicular/parallel brightness 0.7/1.0, with source/resource identity checks.                                                                                             |
| Home model          | 1,126 native triangles, native texture/reflection, transparent canvas. Real GPU screenshots were inspected.                                                                                                                          |
| Skeletal playback   | Two bones; idle overlay and talking loop each have 55 frames at 30 Hz; base idle has ten. Skinned vertex positions change during idle, pause freezes playback, the talking clip can be selected, and a wrong source hash is refused. |
| Default materials   | Both exact shader previews load in the normal QuickForge viewport; their three/five-tag native closures compile with the map.                                                                                                        |
| Preview drag        | Real pointer drag imports the five-tag boulder closure and places it. Ctrl+Z removes both binding and placement; Ctrl+Y restores both.                                                                                               |
| QuickForge build    | Native tools produce a structurally validated MCC v13 cache. Readback finds the imported scenery at `[1.5, -1.5, 0.01]` and twelve BSP collision triangles.                                                                          |
| Source-map addition | Reopen that generated map, provide its actual matching editable tag tree, import another boulder and rebuild. Native readback finds its new tag and placement `[-3, 2, 0.01]`. The original cache remains unchanged.                 |
| Changed import      | A controlled changed byte in a managed tag is detected and the next build is refused. Exact recovery bytes and the previous validated output remain intact.                                                                          |

No JavaScript or detected shader-program errors were recorded. No Halo game was launched by this acceptance.

A separate C39 regression uses three independent Spark processes and three separate 2,240-tag source trees on one PC. Native pistol editing, admitted scenery publication and placement converge at revision 13. A frozen build completes while editing reaches 14. Readback finds radius `0.275`, the 31-triangle published model and placement `[3, 2, 0.1]`. Host termination/recovery retains acknowledged state, authors, history and exact asset bytes. Build: 37.30 seconds; recovery: 11.31 seconds. Seven synchronization samples range from 63.82 ms to 6.99 s, median 886.72 ms, including native IPC/UI consumption. These are local-machine measurements, not WAN or game-peer results.

That run is retained at `.local/native-assets-c39-final/run-2026-10-31T04-48-11-812Z`. Its executable hash is recorded separately: it precedes the later animation reader and source-preservation follow-up, which do not change the collaboration protocol or admitted binary-publication scope.

## Preserved safeguards and failure evidence

Local imports accept registered source identities and fixed local tool recipes. They refuse an active SparkLink session. No unsafe raw-patch broadcast or remote tool execution is introduced; existing negotiated collaborative publication remains separate.

Imports retain exact source/receipt hashes, bounded inventories, link/path rejection, create-new copies, native dependency verification and build-time rechecks. New native scenario objects grant **no additional writable byte range** in the preserved extraction cache: native scenario compilation authors them later. A regression proves byte-identical extraction input and continued refusal of unbound/scaled additions.

Earlier attempts remain retained. Actual Invader refactoring reported per-file copy errors under long Windows paths despite exiting zero; Spark refused the result. The fixed recipe now uses the existing owned short-path alias and also checks per-tag errors. Other attempts exposed an invalid material identifier, missing viewport binding and an old preservation check rejecting a legitimate later native addition. These were fixed while retaining source-hash, payload, compiler and byte-footprint checks. Test timing/configuration mistakes remain failed attempts in their original receipts.

## Remaining gates

- Native animation preview currently supports bounded **uncompressed PC-family Halo 1** streams with exact skeleton matching. Compressed streams, replacement-channel blending, world-relative clips, full game state machines and animation sound events remain open. Missing animation never becomes a fabricated idle.
- Scenery import/build is accepted for the tested MCC QuickForge and matching native source-map rebuild. Other registered classes and cross-runtime combinations need their own real-map acceptance. Existing-object replacement/deletion and per-instance game scale remain separate.
- Source-map rebuilding requires matching editable scenario/dependencies and a compatible compiler. Shared MCC texture packs cannot recreate missing source. Native loose-tag/source success does not complete Eschaton/Assembly-style direct `.map` editing.
- Glass/water/effects, every resource layout, complete renderer/audio parity, compiled sound emitters, actual CE/MCC game loading/traversal, arbitrary live spawning/BSP replacement and game-peer replication retain their independent gates.

The animation reader was independently implemented from the [published native structures](https://github.com/SnowyMouse/invader/blob/master/src/tag/hek/definition/model_animations.json), with installed native-reader and owned-payload checks. No external implementation or proprietary animation frames are bundled in Spark source.

Windows locked workspace: **556 passed, seven existing opt-in cases ignored**. Frontend: **246 passed in 52 files**. Browser interaction/IPC contracts: **90 passed**. Offline contracts, TypeScript and the release build are checked separately. Mocked browser contracts are not counted as native GPU, import or multiplayer evidence.

Work remains on local master as requested. No push, force push, protected-branch bypass, rules change or automated merge was attempted. [Descriptive handoff](NATIVE_ASSETS_GITHUB_DESCRIPTION.md).
