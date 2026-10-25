# Project Guilty Spark

**Halo Modern Evolved · desktop workbench 0.2.0**

A running Tauri 2 / Rust / React application for preserving and inspecting Halo 1 maps, editing audited fields and scenario transforms, previewing real collision geometry, and preparing source-safe builds.

**Zombie Apocalypse is preserved and editable in the workbench, but not yet restored to playable MCC content.** Phase 2 adds runtime adapters, semantic comparison, bounded ZIP import, real embedded audio preview and friends compatibility manifests. The restoration experiment reaches compilation after explicitly omitting two absent sounds, then stops on damaged placements and incompatible legacy tag relationships. No game or two-computer AI test has passed.

![Real menu audio loaded in the Windows desktop app](docs/screenshots/phase2/native-menu-audio.png)

## Open the application

**First manual instruction: open `target/release/GuiltySpark.exe`.**

The build also produces a Windows installer under `target/release/bundle/nsis/` when packaging succeeds. The app uses the installed WebView2 runtime. Normal use does not require administrator privileges.

The project’s local QA library is isolated under `.local/qa-data`; the normal application uses its own per-user app data directory. No game assets are bundled into the executable or repository.

## Implemented

- Steam discovery through the registry/default locations, `libraryfolders.vdf`, and app manifests, including other drives.
- An independent per-user `Inbox` for maps and ZIPs, with stable-file detection and optional automatic builds. MCC discovery is read-only; its additional owned Inbox/Mods folders require the explicit initialization action.
- Bounded classic ZIP inventory, hash-preserved read-only originals, selective map/resource extraction and recorded archive provenance. Executables, DLLs and nested archives are never unpacked or executed.
- Header detection for Xbox 5, reordered Demo/Trial 6, PC/Mac/HaloMD-family 7, MCC 13, and Custom Edition 609. Xbox zlib decompression has bounds limits. OpenSauce/extended maps are read-only or rejected when structures cannot be safely interpreted.
- Actual tag indexes, audited weapon/projectile fields, class-checked projectile reference swaps, selected dependency links, scenario placements, encounters/squads, and compiled script names.
- Real BSP collision meshes, per-BSP selection, perspective/orthographic cameras, orbit/free flight, selection/gizmos, snap, visibility, duplication, undo/redo and persistent transforms. Markers represent scenario placements; full object models and textured BSP rendering are not decoded.
- SQLite library, SHA-256 identity/deduplication, preserved source copies, versioned `.gsproject` descriptors, autosave, exact backups, edit history and creator/provenance records.
- OBJ ingestion, bounded triangulation, mesh previews, material-name and UV-presence indexing, and persistent workshop scenes.
- A real separately installed Invader extraction → rebuild → output inspection/CRC pipeline, with cancellation, timeouts, isolated job directories and structured logs. Incomplete extraction is rejected even when the tool exits with code zero.
- An unchanged-MCC-cache validation path: tag/index, protection, stub count, CRC and SHA checks followed by a byte-identical output copy. This is explicitly not legacy conversion.
- MCC packaging using **an unpublished, exact-scenario Excession metadata template**. Official map metadata is preserved; unknown schemas are not invented. Owned package receipts, hash verification, safe removal, manifest preservation/backups and registration rollback are implemented. Full schema validation and in-game package enumeration remain unverified.
- Steam’s normal `-applaunch 976730` workflow with clear instructions to select the official anti-cheat-disabled launch option. The app does not assert that it selected or verified that mode.
- Versioned runtime adapters for MCC, ChupathingyCE, OpenCE and legacy/preservation profiles. Every capability separates implementation/documentation evidence from actual test status. Registered native executables are inspected without execution; the explicit open action starts the application only. Native deployment, direct-map launch and gameplay are unverified.
- Semantic comparison by normalized tag class/path, audited fields and resolved references, placement slots, collision geometry, script indexes and resource flags. Undecoded payloads remain UNKNOWN.
- Read-only embedded Ogg/Vorbis inspection and preview, including source identity, range, page sequence and CRC validation. Corrupt or external samples remain unavailable.
- Privacy-allowlisted peer manifests and local comparison. “Manifests agree” never means a network session or synchronized AI was verified. No peer computer or Steam account is accessed.

## Verified on this machine

Windows x64 builds and automated tests were run. An owner-installed MCC `a10.map` was inspected read-only: 3,747 tags, 506 placements, 39 encounters, 189 scripts and 367,004 collision triangles. Actual native UI interactions and screenshots were captured.

All supplied Zombie Apocalypse variants were inspected, including real reordered Demo cache 6 and PC/HaloMD cache 7 files. Seven distinct source hashes are in the local application library. The Demo map has 2,825 tags, 197 placements and 5,940 collision triangles. Its automatic Inbox conversion attempt extracts 2,823 tags, then stops on two referenced sound records with out-of-bounds data. The other gameplay variants stop on 196 or 237 resource extraction errors with the supplied resource set. Originals remain unchanged. See the [restoration report](docs/RESTORATION_REPORT.md).

Existing-cache validation passed for the owner-installed MCC `a10.map`, not for Zombie Apocalypse. Rebuilding that installed MCC map correctly failed because 1,471 tags lacked extractable resources. No successful rebuilt or playable cache was claimed from that attempt. The original and preserved source checksums were unchanged.

Phase 2 inventories **67 historical files**, including eight scenario files / seven distinct map hashes and two shared resource caches. All eight import, save/reload and collision bounds checks pass. All seven distinct faithful MCC conversion attempts fail honestly; the three menu caches also contain a corrupt `zamenumusic` asset. Three other intact menu streams decode in the actual Windows WebView. No original EXE/DLL was run.

See the [engineering audit](docs/ENGINEERING_AUDIT.md), [archaeology](docs/ZOMBIE_APOCALYPSE_ARCHAEOLOGY.md), [source/runtime regression matrix](docs/ZOMBIE_REGRESSION_MATRIX.md), [audio and spawner evidence](docs/ZOMBIE_AUDIO_AND_SPAWN_EVIDENCE.md), [runtime compatibility](docs/RUNTIME_COMPATIBILITY.md), [MCC multiplayer feasibility](docs/MCC_MULTIPLAYER_AI_FEASIBILITY.md), [two-computer test plan](docs/MULTIPLAYER_TEST_PLAN.md), and [remaining work](docs/REMAINING_WORK.md).

Further references: [verification](docs/TESTING.md), [limitations](docs/KNOWN_LIMITATIONS.md), [architecture](docs/ARCHITECTURE.md), [build](docs/BUILD.md), [research](docs/RESEARCH.md), [third-party provenance](docs/THIRD_PARTY.md).

## Development

Requires Node 22.12+ (tested with Node 24), pnpm, stable Rust, and [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```powershell
pnpm install --frozen-lockfile
pnpm test
cargo test -p spark-core
pnpm desktop
```

The optional `scripts/bootstrap-rust.mjs` installs Rust only under `.toolchain/`, without changing system PATH. `node scripts/cargo.mjs ...` and `node scripts/desktop.mjs ...` use that installation when present. The optional Invader development installer writes a separate tool copy under `.local/tools/`; that tool is not bundled or redistributed by the release build.

No telemetry, automatic publishing, process memory modification, stock map replacement, executable patching, or anti-cheat configuration changes are performed by Guilty Spark.
