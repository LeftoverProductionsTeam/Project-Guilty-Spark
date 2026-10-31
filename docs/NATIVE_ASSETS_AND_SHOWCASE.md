# Native assets and the animated home showcase

This continues `e8b5761` and preserves C35–C39 history, native reconciliation/build safeguards, experimental research and the unfinished direct compiled-map editor.

## Workflow

Home renders the actual monitor from an owned installed MCC campaign cache directly over the page. It has a transparent background, source textures/reflections, presentation lighting and gentle cursor response. An available Chief/character stays visible while that source loads in the background. Spark does not bundle Halo art.

The monitor automatically plays **idle overlay**. Hover or focus its controls to pause/resume or select **monitor_talking-loop** or **stand unarmed idle**. These are native skeletal clips, separate from the cursor-facing presentation rotation. Reduced-motion preferences start playback paused. The base idle is an authored pose; selecting the talking clip does not play speech.

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
