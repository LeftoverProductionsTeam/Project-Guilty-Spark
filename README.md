# Project Guilty Spark

A Halo 1 creation and preservation workbench with a visual level editor, native tag tools, verified builds, machinima and private collaborative editing.

**0.4.0 · C41 integrated development build.** Windows is the verified native platform. Original maps and SDK sources remain separate from edited projects and generated outputs.

[Get started](docs/GETTING_STARTED.md) · [Current capabilities](docs/CURRENT_FEATURES.md) · [Build on Windows](docs/BUILD_WINDOWS.md) · [Full backlog](docs/MASTER_FEATURE_LEDGER.md) · [Community credits](COMMUNITY_CREDITS.md)

## Current capabilities

| Workspace | Available workflow | Evidence and boundaries |
| --- | --- | --- |
| Map library | Preserve owned maps, compare variants, download supported map/ZIP releases, discover linked runtime assets, and open independent map tabs/windows. Animated native monitor showcase. | [Native assets and showcase](docs/NATIVE_ASSETS_AND_SHOWCASE.md) |
| Level editor / QuickForge | Fly, select and group objects; edit transforms/tags in drawers; drag verified assets; use collision-aware End snapping, keyboard undo/redo and per-map state. | [Connected source workflow](docs/WORKBENCH_INTEGRATION.md) |
| BSP Workshop | Four linked views, convex brush editing, extrusion/clipping, face materials/UVs, rooms, corridors, ramps and source collision. Native H1A/CE compiler paths. | [Workshop and traversal gates](docs/BSP_WORKSHOP.md) |
| Tag editor / Smart Edit | Collapsible class/tag tree, typed fields and dependency navigation. Save reviewed existing MCC Halo 1 scalar/placement changes directly into a separate validated cache copy. | [Smart Edit workflow and supported cells](docs/SMART_EDIT_WORKFLOWS.md) |
| Native source tools | Recursive tag extraction/staging, Baboon/Invader handoff, semantic external-save checks, recoverable source revisions and isolated native compilation. | [C37 integrity and recovery](docs/CONTINUATION_37_ENGINEERING.md), [C38 native operations](docs/CONTINUATION_38_ENGINEERING.md) |
| Asset library | Actual model previews, supported recursive scenery imports, material-assigned closed OBJ scenery/collision, sound audition and editor emitters. | [Native import acceptance](docs/NATIVE_ASSETS_AND_SHOWCASE.md) |
| Renderer / sound | Source models/materials, supported reflections, lightmaps, decals, sky/fog and quality controls; automatic compatible-runtime image previews when original external pixels are absent; verified audio and spatial rehearsal. | [Original and compatible bitmap resources](docs/ORIGINAL_BITMAP_RESTORATION.md), [audio scope](docs/C35_MCC_AUDIO_AND_WORKFLOW.md) |
| SparkLink | Private TLS invitations, roles, ordered revisions, conflicts, per-author undo, durable recovery and frozen source builds. Bounded native field/publication/placement workflow across three real processes. | [Exact shared-content acceptance](docs/C39_NATIVE_CONTENT_ACCEPTANCE.md) |
| Machinima / Creator | Camera paths, actor/animation rehearsal, detached Recording Director, editor WebM/audio takes and native script source workflows. | [Recording](docs/C35_DIRECTOR_RECORDING.md), [native camera/script boundaries](docs/NATIVE_GAMEPLAY_AND_AUDIO.md) |
| Online | Runtime-aware invitations, community listings, checked private CE dedicated hosting, saved-project output selection and exact matching-client preparation/startup. | [Private host](docs/CUSTOM_EDITION_PRIVATE_HOST.md), [matching client](docs/CE_MATCHING_CLIENT_PLAYTEST.md), [first-run help](docs/CE_STARTUP_AND_FIRST_RUN.md) |

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
- Complete engine rendering/audio parity, compressed animation coverage, native sound emitters, lighting/fog baking and general source reconstruction.
- Fully accepted dual-wield firing, player energy-sword lunge, third-person aim correction, expanded campaign/Firefight/player counts and new live-session gameplay acceptance.
- A genuine CE client join, visual first-run acceptance and Workshop collision walkthrough. Dedicated-server status and a client process launch do not prove these.

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

The latest local consolidated checks pass **595 Rust tests (7 opt-in tests ignored), 259 frontend tests, 125 browser checks and 59 offline scripts**. The Windows executable and NSIS installer build. These are local results, not a claim that hosted GitHub CI has rerun. Exact native receipts, final package identities, branch preservation and unresolved gates are recorded in the [C41 integration report](docs/FINAL_CONSOLIDATION_C41.md).

## Project and community

Built with Tauri 2, Rust, React and Three.js. Spark uses standard native Halo files and matching external tools; its project/recovery metadata stays outside native tags.

Project Guilty Spark builds on more than twenty years of Halo community research, editors, documentation and preservation. [Credits](COMMUNITY_CREDITS.md) · [Contributing](CONTRIBUTING.md) · [Roadmap](ROADMAP.md) · [Report a problem](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/issues/new/choose).

GitHub repository protections remain unchanged. Publication is owner-controlled; local consolidation does not imply a remote push or successful hosted CI.
