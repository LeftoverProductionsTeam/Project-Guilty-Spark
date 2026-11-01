# Project Guilty Spark

A Halo 1 creation and preservation workbench with a visual level editor, native tag tools, verified builds, machinima and private collaborative editing.

**0.4.0 · C44 engineering checkpoint.** Windows is the verified native platform. C44 improves measured map switching by about 10.6% with complete rendering-resource signatures preserved, fixes reflection-face caching and adds exact-build read-only OpenCE AI diagnostics. Zombie Apocalypse's native AI recovery remains open. [Current measurements, evidence and limits](docs/CONTINUATION_44_ENGINEERING.md). C43's durable windows, BSP Atlas and two-region CE world remain intact; its new physical walkthrough is still pending.

[Get started](docs/GETTING_STARTED.md) · [Current capabilities](docs/CURRENT_FEATURES.md) · [Build on Windows](docs/BUILD_WINDOWS.md) · [Full backlog](docs/MASTER_FEATURE_LEDGER.md) · [Community credits](COMMUNITY_CREDITS.md)

## Current capabilities

| Workspace | Available workflow | Evidence and boundaries |
| --- | --- | --- |
| Map library | Compact map tiles/list, remembered search, preserved imports, variants, supported downloads, linked runtime assets and independent map tabs/windows. Animated native monitor showcase. | [Workbench follow-through](docs/C41_WORKBENCH_FOLLOW_THROUGH.md), [native showcase](docs/NATIVE_ASSETS_AND_SHOWCASE.md) |
| Level editor / QuickForge | Fly, select and group objects; edit transforms/tags in drawers; drag verified assets; use collision-aware End snapping, keyboard undo/redo and per-map state. New shapes use owned Halo material defaults independently from compilation. | [Default materials](docs/C42_TOOLS_AND_DEFAULTS.md), [connected source workflow](docs/WORKBENCH_INTEGRATION.md) |
| BSP Workshop / Atlas | Four linked views, convex brush editing, face materials/UVs, rooms, corridors, ramps and source collision. Inspect owned original BSP regions and build a reviewed two-region connection through native H1A/CE tools. | [C43 native world, inventory and traversal gate](docs/CONTINUATION_43_ENGINEERING.md), [Workshop](docs/BSP_WORKSHOP.md) |
| Tag editor / Smart Edit | Collapsible class/tag tree, typed fields and dependency navigation. Save reviewed existing MCC Halo 1 scalar/placement changes directly into a separate validated cache copy. | [Smart Edit workflow and supported cells](docs/SMART_EDIT_WORKFLOWS.md) |
| Native source tools | Recursive tag extraction/staging, Baboon/Invader handoff, semantic external-save checks, recoverable source revisions and isolated native compilation. | [C37 integrity and recovery](docs/CONTINUATION_37_ENGINEERING.md), [C38 native operations](docs/CONTINUATION_38_ENGINEERING.md) |
| Asset library | Actual model previews, supported recursive scenery imports, material-assigned closed OBJ scenery/collision, sound audition and editor emitters. | [Native import acceptance](docs/NATIVE_ASSETS_AND_SHOWCASE.md) |
| Renderer / sound | Source models/materials, supported reflections, lightmaps, decals, sky/fog and quality controls; compatible-runtime image previews, verified spatial rehearsal and bounded original-loop native MCC QuickForge builds. | [C44 measured rendering](docs/CONTINUATION_44_ENGINEERING.md), [original bitmap resources](docs/ORIGINAL_BITMAP_RESTORATION.md), [native looping emitters](docs/NATIVE_LOOPING_EMITTERS.md) |
| SparkLink | Private TLS invitations, roles, ordered revisions, conflicts, per-author undo, durable recovery and frozen source builds. A reviewed external native tool can edit a private tag copy while three Spark processes continue editing. | [Shared external-tool acceptance and limits](docs/C42_SHARED_EXTERNAL_EDITING.md), [original native-content scope](docs/C39_NATIVE_CONTENT_ACCEPTANCE.md) |
| Machinima / Creator | Camera paths, actor/animation rehearsal, detached Recording Director, editor WebM/audio takes and native script source workflows. | [Recording](docs/C35_DIRECTOR_RECORDING.md), [native camera/script boundaries](docs/NATIVE_GAMEPLAY_AND_AUDIO.md) |
| Games & tools / Online | Four Halo cards, visible tool downloads/setup, discovered and explicitly selected app launchers, managed map editing, compact hosting and matching CE clients. | [C42 launcher and material fixes](docs/C42_TOOLS_AND_DEFAULTS.md), [earlier game acceptance](docs/C41_WORKBENCH_FOLLOW_THROUGH.md) |
| Learning center / windows | Compact task guides, glossary and Academy lessons; remembered selections and Back/Forward. Pop out every workspace, open another map view and transfer editing with durable acknowledged undo/redo and crash recovery. | [C43 window history and ownership](docs/CONTINUATION_43_ENGINEERING.md), [earlier layout acceptance](docs/C41_LEARNING_AND_WINDOWS.md) |

The desktop Features & workflows page contains short instructions and operation-specific limits. [Current features](docs/CURRENT_FEATURES.md) separates accepted editor/compiler results from remaining game/runtime work.

## Start with an owned map

1. Choose your Halo once in Start here. Connect the installed game and matching tools in Settings; Spark remembers them.
2. Import a map or supported ZIP into Map library. Open Level editor or Tag editor; both share that map’s saved project and history.
3. Find assets in the right-side library. Supported native imports review the exact source and recursive dependencies before a build. Missing resources lead to setup or source selection.
4. Save the project. For an existing supported MCC field/placement edit, expand **Save a map copy → Review save plan**. For source geometry or supported imports, use the matching native build.
5. Inspect the separate validated output, then test it in its matching game. Compiler/cache validation and game acceptance are recorded separately.

**Navigation:** Back/Forward restores the previous map, workspace and Settings section. Ctrl+Z undoes edits; Ctrl+Y / Ctrl+Shift+Z redoes them. History defaults to 100 and is configurable. F11 uses one fullscreen mode; drawers remain movable/resizable and can be reopened without replacing the map. Workspaces and Recording Director can pop out for multiple displays.

For MCC tools: Steam → Library → include Tools → **Halo: CE Mod Tools - MCC**. Direct MCC map copies require the separately installed reviewed Invader CRC/info tools. Custom Edition can use a connected installation or the optional checked separate installation flow. Source files and build dependencies vary by map and target.

## What remains open

- Direct compiled-map writing beyond the reviewed unextended/uncompressed MCC Halo 1 cache-13 scalar fields and existing transforms. Arbitrary references, tag-array growth, BSP relocation and other editions need their own writers and acceptance.
- Universal conversion between every runtime. Existing MCC/CE source and conversion paths have map/tool-specific dependencies; a runtime selector is not a converter.
- Arbitrary live spawning, live BSP replacement, game-peer editor/AI replication and an MCC-to-community lobby protocol bridge.
- Complete engine rendering/audio parity, compressed animation coverage, lighting/fog baking and general source reconstruction. [Original-loop sound emitters](docs/NATIVE_LOOPING_EMITTERS.md) now have bounded MCC QuickForge compilation and exact native sample acceptance; custom audio/event baking and in-game listening remain open.
- Fully accepted dual-wield firing, player energy-sword lunge, third-person aim correction, expanded campaign/Firefight/player counts and new live-session gameplay acceptance.
- Cross-runtime Zombie Apocalypse gameplay acceptance. The latest private CE conversion loads and joins, but the owner reports no zombies. AI recovery, missing original cues and other runtime gates remain open. [Latest recovery evidence](docs/C41_LEARNING_AND_WINDOWS.md#runtime-connections-and-retained-gameplay-research).

All **398 requirement/evidence rows** remain in the [cumulative ledger](docs/MASTER_FEATURE_LEDGER.csv). Historical C35–C39 source, failed experiments and later research remain preserved. [Engineering backlog](docs/UNIVERSAL_WORKBENCH_BACKLOG.md) · [Exact compatibility matrix](docs/COMPATIBILITY_MATRIX.md).

## Build and verify

Use Node 24, pnpm 11.25.0, current stable Rust, the Windows MSVC build tools and WebView2. Halo native acceptance additionally needs your installed game, matching source data and editing tools.

~~~powershell
pnpm install --frozen-lockfile
cargo test --workspace --locked
pnpm check
pnpm test
pnpm test:offline
pnpm exec playwright install msedge
pnpm test:ui
node scripts/desktop.mjs build
~~~

The latest local checks pass **611 Rust tests (7 opt-in tests ignored), 275 frontend tests, 136 browser checks, 59 offline scripts and two interface-probe tests**. TypeScript, the Windows executable and NSIS installer build. The [C42 native test](docs/C42_SHARED_EXTERNAL_EDITING.md) also covers simultaneous Invader/world edits, retained Baboon serialization, corrupt saves, host recovery and actual native compilation. These are local results, not a claim that hosted GitHub CI has rerun. The retained [map-loading performance pass](docs/C41_MAP_LOADING_PERFORMANCE.md) measures **8.6% faster repeated map switching and 25.1% faster catalog preparation** across three native runs per executable, with identical rendering content and resolution. C42 synchronization timings are a separate workload and do not establish a new before/after loading improvement. The earlier [startup improvements](docs/C41_STARTUP_FOLLOW_THROUGH.md) and [audio, performance and CE safeguards](docs/C41_NATIVE_AUDIO_PERFORMANCE.md) remain preserved.

The [home showcase polish](docs/NATIVE_ASSETS_AND_SHOWCASE.md#c41-clarity-and-loading-polish) sharpens the actual monitor, reduces its lighting/glow, extends its left-facing mouse response and shares source preparation across visits. Native animation, textures and reflections remain active; load timings and the later executable identity have their own evidence.

## Project and community

Built with Tauri 2, Rust, React and Three.js. Spark uses standard native Halo files and matching external tools; its project/recovery metadata stays outside native tags.

Project Guilty Spark builds on more than twenty years of Halo community research, editors, documentation and preservation. [Credits](COMMUNITY_CREDITS.md) · [Contributing](CONTRIBUTING.md) · [Roadmap](ROADMAP.md) · [Report a problem](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/issues/new/choose).

GitHub repository protections remain unchanged. Publication is owner-controlled; local consolidation does not imply a remote push or successful hosted CI.
