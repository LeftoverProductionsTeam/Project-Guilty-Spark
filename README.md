<div align="center">

# PROJECT GUILTY SPARK

### ALL THE TOOLS, AND THEN SOME.

**Build bigger Halo worlds. Create together. Play what you make.**

A native **Halo 1 creation studio** for Forge and BSP authoring, MegaWorld worldbuilding, real-time collaboration, assets, tags, conversion, Live Link and machinima.

[![Windows preview](https://img.shields.io/badge/Windows_x64-Download_preview-89d9e8?logo=windows)](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/releases/tag/v0.4.1-preview.5)
[![Build](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/actions/workflows/build.yml/badge.svg)](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-56c5b0.svg)](LICENSE)

**[Download](#download) · [Flagship features](#build-beyond-the-map) · [Get started](docs/GETTING_STARTED.md) · [Roadmap](ROADMAP.md)**

</div>

## Build beyond the map

**One Halo. Every World. Every Tool. Together.** Build native spaces, connect your creations and keep the whole workflow in one studio.

| Flagship | What you can create | Status |
| --- | --- | --- |
| **[Halo MegaWorld](docs/MEGAWORLD_SEAM_ROUTES_20261108.md)** | Plan a 19-map world; join compatible BSP regions with an infantry tunnel, vehicle road and elevated ridge. The Timberland–Sidewinder prototype compiles and loads in Chupathingy. Full 19-region construction and human/Warthog traversal remain open. | **In development** |
| **[Native Forge & BSP Workshop](docs/DEMO_WORKFLOWS.md)** | Shape rooms, stairs, ramps and corridors in four linked views. Edit supported faces, edges, vertices, UVs and materials; place native objects, doors and triggers; compile through a matching Halo toolchain. | **Available now** — supported source workflows |
| **[Multiplayer AI synchronization](docs/C51_RUNTIME_AND_FLAGSHIPS.md)** | Bring native encounters and host-authoritative AI into shared Halo experiences. Actor-lifecycle and peer experiments exist; consistent multiplayer combat, vehicles and shared victory still need acceptance. | **In development** |
| **[Firefight & original Zombie Apocalypse](docs/FIREFIGHT_ENGINE.md)** | Author wave plans and native encounter/script source, and restore the original Zombie Apocalypse mechanics. Solo Firefight compilation/readback passes; complete human survival, scoring and multiplayer rounds remain open. | **In development** |
| **[Universal Halo editing & conversion](docs/COMPATIBILITY_MATRIX.md)** | Inspect source-native maps, tags, models, bitmaps and sounds; use proven bounded cache edits or reconstruct loose tags and rebuild for supported targets. Each format keeps its own identity and limits. | **Available now** — conversion routes vary |
| **[Live Link & Live Rebuild](docs/CHUPATHINGY_DEDICATED_20261108.md)** | Preview supported object changes on validated MCC builds. Rebuild and reload a Spark-owned Chupathingy session with revision checks and previous-good recovery. BSP rebuilds require a map/session reload. | **Available now** — exact-runtime operations |
| **[Real-time SparkLink collaboration](docs/CONTINUATION_59_WORKSPACE.md)** | Edit shared source across independent Spark processes: BSP changes, native tag fields, assets, author-owned Undo, conflicts, disconnect recovery and frozen native builds. Physical two-computer LAN/VPN acceptance remains open. | **Available now** — tested on one computer |
| **[Multiplayer Hub](docs/CHUPATHINGY_DEDICATED_20261108.md)** | Choose a runtime, find compatible games, prepare native content or host an isolated private session. Host, Join and editor collaboration have distinct workflows. | **Available now** — supported providers |
| **[Campaign creation & machinima](docs/DEMO_WORKFLOWS.md)** | Author mission beats, supported HaloScript interactions, camera keys, named takes and reversible editor greenscreen. A full campaign playthrough and complete capture pipeline remain in development. | **Available now** — authoring tools |

**Research:** OpenH1 VR Forge, larger cooperative sessions, high-player-count worlds and true engine-level region streaming. These have separate hardware, runtime and gameplay gates.

![Guilty Spark editing a real Halo map in its native Windows application](docs/screenshots/c60/native-mcc-map.png)

*Actual Windows application capture. Native content, interactive editing and one workspace for the full creation process.*

## Your worlds, connected

![Native shared-region prototype with original Halo material previews](docs/screenshots/20261107/shared-native-regions.png)

*Two-region development prototype. A compiled connection is distinct from a human-accepted journey, and from a completed 19-map world.*

- **Create in native Halo source.** Keep structural geometry, collision, portals, materials, scenario references and scripts tied to the matching build pipeline.
- **Work across maps and monitors.** Detach eligible tabs and drawers, retain inactive editors, keep per-project history and recover interrupted sessions.
- **Move assets through the whole workflow.** Discover → inspect → preview → import → transform → validate → build → playtest, with explicit support and dependency checks.
- **Keep originals intact.** Source Guardian, content identities, staged builds and previous-good recovery protect user-owned maps and tags.

See the [current capabilities](docs/CURRENT_FEATURES.md), [complete feature ledger](docs/MASTER_FEATURE_LEDGER.md), [hands-on guides](docs/DEMO_WORKFLOWS.md) and [human test plan](docs/HUMAN_TEST_PLAN.md) for exact workflows and acceptance limits.

## Download

**Windows 10/11 x64 · 0.4.1 Preview 5 · built November 10, 2026**

**[Download the Windows installer](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/releases/download/v0.4.1-preview.5/Project_Guilty_Spark_0.4.1_windows_x64_Setup.exe)** · **[Portable ZIP](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/releases/download/v0.4.1-preview.5/Project_Guilty_Spark_0.4.1_windows_x64_Portable.zip)** · **[All release files & checksums](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/releases/tag/v0.4.1-preview.5)**

These are actual public GitHub Release downloads. The installer, portable ZIP, source archive and manifest were downloaded anonymously and checked against their SHA-256 records. Source commit: **d832af36cb55ecd55d6c0730c24c13f90594424c**. All nine release gates passed; the portable and installed applications both reached the native workspace, and installation/uninstallation passed on the development host.

This is an **unsigned development preview** requiring Microsoft WebView2. Clean-machine/upgrade acceptance remains open. Linux and macOS packages are separate, unverified targets. No Halo games, maps, resource banks, runtime binaries or proprietary editing-kit content are bundled.

[Exact build, checksums and acceptance report](docs/RELEASE_CANDIDATE_20261108.md) · [Repeatable release process](docs/RELEASING.md) · [Build from source](docs/BUILD_WINDOWS.md)

## Start creating

1. **Connect your Halo.** Use your own legitimate runtime/content directories, or configure isolated managed engine packages with your shared content library.
2. **Open a map or create editable source.** Pick a supported native workflow and follow its guide in **Learning center → Guides**.
3. **Make a change, save, build and playtest.** Spark keeps saved source, compiled output and the running game distinct.

**Chupathingy is the preferred standard runtime.** MCC Halo 1, Custom Edition, OpenCE, Faber and OpenH1 use separate profiles and compatibility contracts. Retail PC, Xbox and legacy Mac/Demo content retain supported source-preservation and conversion routes. Selecting a hosting runtime never changes a map's source identity.

OpenH1 is the immersive research target; its Windows build is **not verified for SteamVR**. SparkLink is editor collaboration, Live Link controls supported game state, and gameplay networking belongs to the chosen engine.

[Setup guide](docs/GETTING_STARTED.md) · [Runtime compatibility](docs/RUNTIME_COMPATIBILITY.md) · [Shared library & runtime setup](docs/SHARED_RUNTIMES_AND_PACKS_20261107.md)

## Specialist tools, part of your studio

Use the appropriate tool from Spark's existing **Games & Tools** workflow: **Guerilla**, **Sapien**, **Halo Tool**, **Invader**, **Baboon**, **Blender + Halo addon**, **Mantle**, **OpenTool**, **Reclaimer/Mozzarilla** and **Excession**, where their edition, source and interface are supported.

Source-aware handoffs connect external edits to reconciliation, native validation and rebuilding. Installation, automation and round-trip coverage differ by tool; see [compatible tools](docs/COMPATIBLE_TOOLS.md).

## Help build what comes next

Guilty Spark is open source under the [MIT License](LICENSE). Modders, engine developers, artists, testers and tool authors are welcome.

**[Report an issue](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/issues/new/choose) · [Contribute](CONTRIBUTING.md) · [Roadmap](ROADMAP.md) · [Community credits](COMMUNITY_CREDITS.md)**

Implemented source, automated checks, native compilation, game loading, human gameplay and real-peer acceptance are recorded separately. Operation 110 and the full product mandate remain in progress; working tools ship alongside clearly labeled development and research goals.

Halo and its assets belong to their respective owners. Guilty Spark is an independent community project. Use legitimately obtained files and respect the [asset and copyright policy](docs/ASSET_AND_COPYRIGHT_POLICY.md).

<div align="center">

**MAKE HALO YOURS.**

*One Halo. Every World. Every Tool. Together.*

</div>
