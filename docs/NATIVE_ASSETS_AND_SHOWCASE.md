# Native assets and the animated home showcase

This continues `e8b5761` and preserves C35–C39 history, native reconciliation/build safeguards, experimental research and the unfinished direct compiled-map editor.

The later [C55 native asset pass](CONTINUATION_55_NATIVE_ASSETS.md) adds supported QuickForge Alt-drag/copy/paste and native build/readback, source-authored model emission, legal diffuse-free glass, source-aware preview lighting and the Xbox zero-range fog correction. It supersedes the older presentation-lighting description below. Complete local model lighting, engine shader parity and direct imported-terrain reshaping remain open; the historical reports below are retained.

The later [native looping-emitter milestone](NATIVE_LOOPING_EMITTERS.md) adds verified MCC bank-backed sound imports and native QuickForge sound scenery. It supersedes the blanket compiled-emitter gap only for that local source path; native gameplay listening and the broader audio goals remain open.

## 10 November glass, decals and retained model geometry

The existing shared renderer had two reproduced native composition defects. Model flag8 (alpha-blended decal) must disable the opaque alpha-test rule even when flag4 is clear. Native glass tints the background, adds reflection, then blends diffuse by its alpha. Spark instead added the full diffuse RGB, and could discard faint glass/decal pixels. The native flag reader and cached-metadata guard now retain fractional decal alpha; glass uses its actual diffuse/detail alpha and exact tint dependencies. No brightness, exposure, fallback texture, UV, normal, rig, LOD or original game data was changed by this repair.

For the tested static glass stages, the composition is D*a + (T*background + R)*(1-a). Non-neutral tint or a real background-tint map uses ordered tint/surface passes through the existing material builder; neutral tint remains one draw. Both passes share source images. HaloMesh, BSP Workshop and QuickForge use that same builder. The bounded read-only glass decoder now exposes Background tint map and its independent scale; corrupt floats or truncated bodies fail. Native fields do not become writable tag offsets.

A real React/Three component test also reproduced unnecessary geometry replacement when a texture record completed. The material legend now depends on its actual need and source mesh; changing texture records without changing the native pass layout retains the same geometry. GPU proof: the before check returned different geometry IDs; after, model/completed IDs are identical. Colored glass uses2draws/4rasterized triangles for2source triangles; neutral glass and greenscreen each use1draw/2triangles. Source images are not cloned. This is a specific reuse result, not a measured cold-load or FPS claim.

**Evidence:** intentional red native flag0x8, material and GPU tests precede the fixes. R416 passes911Rust/9explicit opt-in ignores,480frontend, TypeScript/contracts/offline/storage, but its broad browser run fails2navigation cases and is not acceptance. Both unchanged navigation tests pass focused replay. After source freeze, R418 passes480frontend and all273browser cases, including the actual shared model/BSP component, source transparency, reflection/detail order, glow, chroma mode and geometry reuse; TypeScript/contracts/offline/storage also pass. No assertion was relaxed. Earlier source/fixture edits overlapped R416; no precise failure cause is claimed from that timing alone.

| Original source | Cache | Native Windows run | Duration | Original unchanged / errors |
| --- | --- | --- | --- | --- |
| Chupathingy Blood Gulch |5|R417|26.847s|yes /0|
| MCC Blood Gulch |13|R419|24.569s|yes /0|
| CE Timberland |609|R420|28.228s|yes /0|
| OpenCE Blood Gulch |5|R421|23.768s|yes /0|
| Original Zombie Demo |6|R422|28.039s|yes /0|

Each native run independently verifies original model UVs, supported shader partitions, decal flags and glass tint/map metadata, then selects actual Warthog/Scorpion previews through the native Tag editor (Demo uses its two original Warthog-derived objects). All selected supported images load, JavaScript errors remain0, app close is normal and owned scratch is disposed. Other returned models receive source/mesh checks; they are not all selected GPU captures. Chupathingy/OpenCE use the same original map hash: two installation checks do not establish two formats or engine adapters. These are Spark Windows preview checks, not new Halo game playtests or native map compilations.

QA: E/qa-vehicle-glass-r417/GuiltySpark.exe,49,762,816B, SHAbf3d601fd0c9331a93bb6d6e4ca0d6ed96832a0fecfa76a7e45ab18e65fc681d; runtime fingerprint0a326214db9771492fa7f45a649a72b4daed8ab1c477e55e58893758b3648f92. It was built from31af61a plus the reviewed production diff, not a clean-source release. Windows build200.038s; parent peak1,910,620,833logicalB, disposed1,845,940,221B. R418 disposes26,475,018B; later native runs dispose their bounded profiles/libraries. No SDK tree, original installation, accepted release or GitHub artifact was replaced.

Exact receipts/logs: E/vehicle-glass-r416, vehicle-glass-r417, vehicle-glass-r418, vehicle-glass-mcc-r419, vehicle-glass-ce-r420, vehicle-glass-opence-r421 and vehicle-glass-demo-r422 (.json/.log). Actual native before/after captures: vehicle-coverage-chupa-r412-native-vehicle-warthog.png and vehicle-glass-r417-native-vehicle-warthog.png; MCC equivalents R410/R419. No Halo pixels are committed. Source research was read-only: OpenCE899219cc0a14b03bc12f0517a1e9ee4c37158af8 rasterizer_xbox_models.c decal state and rasterizer_xbox_transparent_geometry.c glass stages; Invadere8b58542fd1e0a239d0fbc689ac4e55b80e79442 glass schema. No engine implementation was imported.

**User path:** open the owned map → Work → Tag editor → search its vehicle path and select Vehicle → choose the result; orbit/zoom and Materials remain available. World/Asset Library use the same repaired material path. H29 remains open for stable game-matched local lighting, reflection/glass details, animations and dashboard FunctionOut values. The four smet dashboard triangles and original Demo carrier's3179ligh triangles remain explicit unsupported coverage. These source fixes do not certify full game appearance or close the475-requirement/M1–M6 mandate.

## 10 November native vehicle detail and reflection order

Original Scorpion shaders set shader_model's detail-after-reflection flag. Spark discarded it and always combined detail first. The shared parser now preserves the read-only flag, and the existing shared material renderer follows it. World, Asset Library and large tag previews retain one material path. UVs, normals, source colours, reflection cubes, lighting and alpha remain intact; no exposure adjustment, generic replacement material or native-tag mutation was introduced. Other shader classes do not reinterpret their first flag; old serialized previews default to false.

Format reference: Invader [696830ff80af227e84e7237c2ef26eb2301ed110, shader_model.json](https://github.com/SnowyMouse/invader/blob/696830ff80af227e84e7237c2ef26eb2301ed110/src/tag/hek/definition/shader_model.json). OpenCE899219cc0a14b03bc12f0517a1e9ee4c37158af8 source/rasterizer/xbox/rasterizer_xbox_models.c was reviewed read-only; no engine implementation was imported.

R399 genuinely fails real WebGL: flag toggling leaves pixel pairs88/88,76/76,145/145 across three detail functions. R400 and full R401 pass independently calculated88/56,76/28,145/177. Without reflection both orders remain24/24. Partial masks produce68/60 for PC-blue and Xbox-red conventions; alpha255 and existing transparency/glow/culling checks remain.

| Original source | Cache | Models / UV coordinates | soso references / after-reflection | Native evidence |
| --- | --- | --- | --- | --- |
| MCC Blood Gulch |13|5 /25302|24 /4|R401; strengthened R407|
| CE Timberland |609|5 /25302|24 /4|R402|
| Chupathingy Xbox Blood Gulch |5|3 /14660|15 /4|R403|
| OpenCE Xbox Blood Gulch |5|3 /14660|15 /4|R404|
| Original Zombie Apocalypse Demo |6|2 /15924|5 /0 on supported Warthog|R406; second carrier geometry/UV-only|

All checked UV mismatches are0. Each run uses actual Work → Tag editor → Search tags → Vehicle → model selection, preview material loading, Level Editor and independent original-cache readback. Source ordering flags match every checked soso slot. Chupathingy/OpenCE caches have the same hash; these are two installation checks, not independent formats.

**Demo limitation:** R405 failed the assumption that every vehicle has a model shader. The original rwarthog instead declares15 ligh references to effects\lights\coop teleport, with no supported material ranges. R406 explicitly records unsupported-original-non-shader-references rather than fabricating shaders or promoting UV recovery into rendered fidelity. Its other Warthog retains5 model shaders. An unrelated original bottle-glass reflection lacks an exact resource-index path and remains unavailable; fuzzy substitution is refused.

R401 full current-source regression passes909Rust tests/9explicit opt-in ignores,476frontend,271browser, TypeScript,1071source-module contracts, offline regressions and storage ownership. Fresh Windows build183.305s; native MCC24.513s, CE26.176s, Chupa22.776s, OpenCE22.296s, Demo25.706s; strengthened MCC23.972s. R406/R407 wrapper and child complete with0JavaScript errors, unchanged originals and disposed owned temporary data. No full SDK is staged for this read-only preview path.

QA E/qa-vehicle-order-r401/GuiltySpark.exe:49,772,544B, SHAc1a7feacee7096a3dd5a95d35d721b93f8f488d056bffe3a5a0335e7cecee2af; runtime-source fingerprint adae9e70c7c272c9303deb4b2a9a979bf9a6d2a325c1d423ee2696c12feb3316. Built from7b01cea plus this reviewed production diff; this is not a clean-source installer/release. E is the existing external Temp GuiltySpark-Engineering-d49eb02588bf root. JSON/log basenames: vehicle-material-r401, vehicle-order-ce-r402, vehicle-order-chupa-r403, vehicle-order-opence-r404, vehicle-order-demo-r406, vehicle-order-mcc-r407. R405 remains a failed fixture attempt.

Native screenshots: E/vehicle-after-r388-native-vehicle-scorpion.png before this ordering repair; E/vehicle-order-mcc-r407-native-vehicle-scorpion.png after. Corresponding native-vehicle-warthog.png and owned-native-bsp.png show the shared source-material path. No proprietary content is packaged in Git.

This accepts the demonstrated UV/ordering defects and native editor checks. Matched actual-game reflection, local lighting, glass, geometry/LOD and animation comparison remains H29. No new game/native-compilation acceptance is inferred; the accepted native build/recovery pipeline remains protected.

### Material coverage follow-through — 10 November

R408 reproduces a second defect in the actual Windows application: unsupported geometry reported0material gaps. Independent original-cache triangle-strip readback identifies4Warthog dashboard triangles (2each for native smet meter engine and meter speedometer), and3179/3179triangles on the Demo light-referencing zombie carrier. The source is unchanged; this failure remains recorded.

The existing nativeShaderTextures module now counts uncovered source-material triangles, merging overlap only once and reporting malformed attribution as unknown. NativeModelPreview displays a compact nonfatal status below its view controls, distinguishes missing supported shaders from unsupported geometry, and suppresses this render-material warning in Collision view. Source geometry, materials, lighting, native tags, exports and game files are unchanged. This diagnostic does not implement dynamic native meter rendering or replace the invalid carrier references.

R409 passes479frontend tests,272browser tests, TypeScript,1071source contracts, offline and storage regressions; the focused browser journey preserves a27field edit, context navigation, one model read and Undo back to10. New coverage cases test absent, partial, overlapping and malformed ranges. The unchanged Rust source retains R401's909passes/9explicit opt-in ignores; full Rust was not repeated for this frontend-only follow-through. Fresh Windows build181.567s and actual Demo preview25.587s pass.

Strengthened native checks independently rebuild original strip triangle counts and the exact supported per-shader partition, then compare actual mesh assignments and visible warnings. Unsupported attribution cannot excuse dropping any supported source material. R410MCC23.192s, R411CE26.404s, R412Chupa24.453s, R413OpenCE22.740s and R414Demo26.190s all complete with0UVmismatches,0JavaScript errors, unchanged original hashes and disposed owned scratch. Warthog and Rocket Warthog each have4unsupported meter triangles; checked Scorpion/Ghost/Banshee ranges are fully attributed. Demo carrier remains3179unsupported light-referencing triangles. Actual large Warthog/Scorpion previews have0missing supported shader images. Chupa/OpenCE original files are identical-format/hash installation checks.

Current QA E/qa-vehicle-coverage-r409/GuiltySpark.exe49,772,544B, SHA2ecf88c436ec6801f080b941338e62b244ff790da04c8ba200125b659c21496a, runtime-source fingerprint fc53edfda41add69b27eda01980249deca5325cba4a6564301355be7825c70a3. Built from93d7a66 plus this reviewed UI diff; not an installer/release. E/vehicle-coverage-r409.json/log and vehicle-coverage-{mcc-r410,ce-r411,chupa-r412,opence-r413,demo-r414}.json/log retain the exact scope. R409 parent disposes1,872,441,440logical bytes after a1,937,234,348byte peak; no Spark test process remains. Actual native warning screenshots are E/vehicle-coverage-r409-native-vehicle-warthog.png and ...-rwarthog.png, plus R410stock screenshots. No game-source pixels/assets enter Git.

**Still open:** native dynamic meter rendering, source-local lighting/reflection/glass/animation parity against matching game views (H29), and the broader native/game/peer/platform ledger. Warning correctness is not a rendered-fidelity pass for unsupported surfaces.

### R415 actual Chupathingy game observation — 10 November

After the source fixes in 3e34299/93d7a66 and coverage diagnostic a09f01c, Computer Use reached a real windowed Chupathingy0.9.0c/b506ba74 Blood Gulch match. Actual controls used: Multiplayer → Split Screen; create/select the isolated New001 profile; select Blood Gulch → Slayer → Start Game. The native UI reports one player. Game logs independently report the owned data root,1806map tags, all machines loaded, host ticks and the NVIDIA OpenGL renderer. This is a local game, not a two-player or public-server result.

The engine's existing cheat_all_vehicles diagnostic was invoked only inside this disposable offline session, then E entered a nearby Warthog side seat. The real game visibly rendered its rear hull, turret, interior and highlights. Its third-person transition and subsequent first-person view were observed, but the densely spawned diagnostic vehicles moved; no stable matched-angle/lighting comparison, normal vehicle-driving acceptance or full visual-parity pass follows. Screenshots were displayed in the Computer Use conversation; no independent game screenshot file was exported. H29 remains open.

The first manual fixture lacked the menu's carousel.map and correctly produced a native missing-map error naming levels/test/carousel/carousel. The corrected bounded fixture stages only17 pinned runtime members plus bloodgulch.map, ui.map and carousel.map. A requested local:bloodgulch:slayer debug startup did not automatically enter gameplay in this installed build; the actual entry was the mouse/keyboard UI above. Fullscreen capture returned stale frames; the documented F11 windowed switch restored current capture. Neither issue is relabeled a product rendering failure or a successful automatic launch.

R415 exits0 at its declared600-second native limit. Its original runtime members, config.toml and all three original maps retain identical SHA256 hashes. Owned scratch is disposed:898,522,542logical bytes /898,590,456allocated file bytes, peak898,526,990logical bytes under the unchanged1GiB reservation. Exact bounded receipt: E/vehicle-game-local-r415.json. Earlier manual game trial also exits0 and verifies originals; its owned877,906,814logical bytes are disposed. The separate Spark manual session ended exit1 and disposed78,411,382logical bytes; it is not a normal-close/Save acceptance result. No runtime, original map, SDK, release package or production source was modified by these observations.

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
