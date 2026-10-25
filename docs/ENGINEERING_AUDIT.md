# Engineering audit — Phase 2 baseline

Audit date: 2026-10-25. Baseline: `fed1cf5` (clean tracked working tree before this continuation). Reviewed all tracked application/core sources, tests, scripts, configuration, documentation and licensing notes. The supplied historical archive and `SAMPLE CODE` are excluded from source control and releases. Decompiled tool implementations were not incorporated.

## Reproduced baseline

- Rebuilt the unchanged Windows desktop from the lockfiles with Tauri; build passed. New build artifacts use a task-specific C: temporary root because D: has little free space.
- Re-ran all **40 Rust core tests** and **7 frontend unit tests**; all passed.
- Launched the native application with an isolated local library and disconnected Steam configuration. Imported the actual supplied Demo gameplay map, opened its collision BSP and tag editor, and captured real screenshots under `screenshots/phase2/audit-baseline-*.png`.
- No archived executable/DLL, actual game launch, Steam deployment or multiplayer session was used for these baseline checks. The initial run's real MCC discovery, existing-cache validation and failed conversion receipts remain prior evidence, not new gameplay proof.
- Native desktop-inspection helper startup failed in this environment. UI verification used the application's local WebView debugging connection and Playwright, with real native commands and imported data.

## Feature classification at baseline

| Feature | Classification | Evidence and limits |
| --- | --- | --- |
| Native Windows workbench | VERIFIED | Fresh build and running native UI; installer was compiled in Phase 1 but installation/uninstallation was not tested |
| Cache 5/6/7/13/609 identification | VERIFIED, bounded scope | Five-family parser tests; real Demo/PC-derived/MCC files inspected. Real Xbox game compatibility remains untested |
| Source preservation / SQLite library / projects | VERIFIED, bounded scope | Hash/copy/dedup, atomic project backups and roundtrip tests; real source hashes preserved |
| Scenario viewport and transforms | PARTIAL | Actual collision BSP and placement markers, gizmos and undo/redo; no textured render BSP or object-model reconstruction |
| Typed tags / projectile swapping | PARTIAL | Real audited object/weapon/projectile fields and selected references; most tag schemas are inspection-only |
| OBJ workshop | PARTIAL | Mesh ingestion, triangulation and material-name/UV-presence metadata; no Halo model compilation or texture/animation decode |
| AI / scenario inspection | PARTIAL | Encounter/squad/script metadata; no actor schema editor, wave authoring, simulation or AI synchronization |
| Invader build adapter | PARTIAL | Real extraction/rebuild/validation process code and failures observed; no successful supplied legacy conversion at baseline |
| Supplied Zombie Apocalypse faithful restoration | BLOCKED | Missing/mismatched resource data; exact sound ranges below |
| MCC package / manifest / Steam workflow | PARTIAL / IMPLEMENTED–UNTESTED | Owned staging, manifest backup and ordinary Steam launch code exist; metadata validation is a limited contract, not a full official schema or in-game test |
| Native engine launch | PARTIAL | Generic selected executable spawn only; no identity/version/capability validation or map deployment |
| ZIP intake and semantic cross-version comparison | NOT IMPLEMENTED | Absent at baseline |
| Versioned runtime adapters / capability evidence / friends preflight | NOT IMPLEMENTED | A future live-command validation model is not a runtime harness |
| Live editing, multiplayer AI and VR | NOT IMPLEMENTED | No attached runtime, live transport, game state replication or OpenXR device integration |
| macOS / Linux editor builds | IMPLEMENTED / UNTESTED | Portable source and CI configuration exist; neither platform was run here |

`VERIFIED` applies only to the stated tests. A parser fixture, matched checksum or successful compiler invocation is not proof of gameplay.

## Defects found before feature expansion

| Finding | Baseline location | Required correction |
| --- | --- | --- |
| Browse discards unsaved settings | `Workspaces.tsx` draft reset plus `App.tsx` unconditional action refresh | Preserve drafts when selecting paths; refresh only after applying preferences |
| Stale asynchronous build response can affect another project | `App.tsx` library-change handler / `editor.ts` builds reducer | Check project identity before merging history |
| Dependency graph ignores reference edits | `Tags.tsx` graph resolves original target IDs | Resolve the same semantic overlays as the reference list |
| Free-fly F also frames the scene | `World.tsx` keyboard handlers | Keep fly descent and orbit framing distinct |
| Immediate close can lose a recent edit | `App.tsx` delayed autosave without close guard | Commit focused input, serialize saves and retain window on failure |
| Cancelled export reports success | `App.tsx` action success handling | Respect a null/cancelled native result |
| Readiness drops diagnostic errors; old build appears current | `Build.tsx` report and history selection | Surface all failures and identify the build matching the saved project fingerprint |
| Inspection silently ignores malformed spawn/encounter/script arrays | `maps.rs` conditional reflexive parsing | Distinguish absent from malformed; surface or reject invalid structures |
| File allocation bound/hash can disagree with inspected snapshot | `maps.rs` metadata/read/hash sequence | Read a bounded snapshot and derive identity from those inspected bytes |
| Extraction errors can be lost after output limit | `build.rs` capped output capture | Continue error detection or fail explicitly on truncated tool output |
| Package receipt can omit required files | `mcc.rs` package verification | Require map, metadata, valid receipt identity, hashes and current build binding |
| Metadata matching can find a scenario in an unrelated string | `mcc.rs` recursive string matching | Require a documented/verified metadata location; do not claim full-schema validation |
| Manifest reads allocate before limits; verification errors bypass rollback | `mcc.rs` manifest helpers | Bounded reads and rollback on every verification failure |
| Package removal can leave partially deleted content | `mcc.rs` removal | Verify first and stage owned removal before cleanup |
| Startup/settings can create game directories | `app.rs` configure calls initialize | Read-only discovery; an explicit deployment step must initialize managed game folders |
| Native launcher accepts any existing file | `app.rs` launch_native | Explicit installed-runtime registration, identity/hash checks, honest capability and launch-plan reporting |
| Steam editing-kit discovery misses HCEEK; non-Windows launcher is assumed | `steam.rs` discovery | Check actual supported install/launcher evidence rather than folder-label assumptions |

These are audit findings. Their resolution and verification are recorded by subsequent commits/tests, not inferred from this document's existence.

## Restoration evidence and provenance correction

The version-6 bundle readme explicitly identifies **Zombie Apocalypse Win32 Beta**, credits Patrick Davis / Fonzie / AnonDavis, and records its historical origin. Cache version 6 alone cannot distinguish Mac Demo from Windows Trial/Demo. The ZAMD readme contains separate contributor credits and revisions. The archaeology report records the complete supplied inventory.

In the Demo gameplay map, `scorpion.sound` requests 1,952,503 external bytes beginning at offset 79,916,792. The supplied `sounds.map` is exactly 79,916,792 bytes long: this sample starts at EOF. `hill_occupied.sound` requests 3,877,619 bytes at offset 83,794,412, also outside that resource. These sizes suggest custom content under stock tag names; no track identity is assumed.

A matching-length embedded `game_over` Vorbis stream is a recovery candidate for investigation, not proof that it is the intended missing `hill_occupied` audio. Two of the previously noted repeated sound IDs are cached self-references, so repeated raw IDs must not be described as distinct external dependents. Faithful restoration remains blocked on absent data; any derivative with omitted/replaced audio must record that deviation explicitly.

## Boundaries retained for Phase 2

Actual game-directory deployment and game launch require a separate explicit step. No archived EXE/DLL is executed. Native runtime discovery does not execute guessed command-line probes. MCC co-op, MCC custom multiplayer, and native multiplayer remain separate capabilities. Unit tests, upstream code and matching peer manifests never constitute a two-computer gameplay test.

Third-party package licenses and the separately installed Invader adapter are documented in `THIRD_PARTY.md`. Upstream runtime source declarations do not establish redistribution rights for Halo-derived game code or assets. No such runtime is embedded in Guilty Spark.
