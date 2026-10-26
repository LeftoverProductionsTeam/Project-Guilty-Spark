# QuickForge architecture — Phase 3

QuickForge extends the existing Tauri/Rust/React application and schema-1 `.gsproject` format. It does not replace the preservation library, World workspace, Tag Editor, Compare or runtime adapters.

## Authoring and authority

`Project.quickForge` is an optional versioned document containing original brush geometry, materials, source-backed tag placements, player starts, objectives, game mode, target runtime and build quality. `Project.firefight` independently stores survival rules so imported scenarios can retain their original map source while carrying a separate authored mode. Older descriptors still load. Both documents contribute to the build fingerprint; authoring edits invalidate previous build/package readiness.

Rust validates bounded documents before persistence. Geometry remains editable source: brush dimensions and transforms generate new triangles and JMS. The application never resizes compiled BSP collision data by patching offsets. The frontend requests the same native mesh generator used for export and renders original brush surfaces. Imported Halo assets retain their actual class, path, datum ID, source project and SHA-256. Their viewport markers are references, not decoded Halo model previews.

The existing SQLite library stores summaries; project descriptors use atomic writes and exact backups. Source archives and preserved map copies remain immutable. Exported descriptors preserve authoring data but do not grant a recipient access to local source projects or copyrighted tags.

## Geometry and scenario pipeline

`quickforge.rs` owns brush generation, mesh validation, spawn checks, JMS 8200 output and scenario command plans. `forge_build.rs` owns isolated source exports, compiler preflight, bounded tag staging, tool invocation, cancellation and receipts. The existing build runner supplies timeout, bounded process output and structured progress events. See [BSP pipeline](QUICKFORGE_BSP_PIPELINE.md).

Each job writes to a fresh UUID directory under application data. It records authoring JSON, a reopenable project descriptor, JMS, a scenario command plan and a QuickForge receipt. A compiler run copies the owner-selected editable tag tree into that job: no hardlinks into the Editing Kit, no compiler outputs in stock map folders. Tag files and compiler binaries are hashed. Every generated expected output must exist, and the finished cache must pass structural/scenario/engine/CRC/protection checks before a validated build record exists.

Source export, blocked preflight, failed compilation, cancellation and structural validation have different receipt states. Only a validated artifact can enter the existing package workflow. Packaging still needs exact-scenario Excession metadata; source export alone cannot make a package or launch a map. Game loading, collision behavior and multiplayer are separate manual acceptance gates.

## Firefight and multiplayer boundaries

The deterministic Firefight director is an authoring simulation with explicit actor acknowledgements, deaths, time progression, lives and scores. Its JSON is not Halo script bytecode. No game-side event bridge or replicated wave protocol has been integrated. Firefight builds therefore stop with a specific blocker instead of compiling a multiplayer map that silently omits the mode.

Runtime hosting plans expose documented menu steps and evidence. They do not invent command-line hosting flags or claim a lobby was created. Privacy-allowlisted peer manifests may include game mode, expected player count and gameplay configuration SHA-256. Matching manifests remain a local agreement check, not observed networking.

## Current limits

The first geometry path is sealed room shells with closed box/ramp/stair solids. It is not a general CSG Boolean editor: arbitrary openings, room union, arches, terrain and asset model baking need additional geometry and compiler work. Placement markers are not actual model thumbnails. Compiler automation requires a separately installed HCEEK and complete legally available editable tags. Tool directory overrides are documented but require validation against the installed HCEEK version. Native build and multiplayer acceptance must not be inferred from source-command tests.
