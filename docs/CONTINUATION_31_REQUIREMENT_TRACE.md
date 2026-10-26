# Continuation 31 — requirement reconciliation and missing-work ledger

**Baseline:** exact C30 full source; 92-item original reconstruction and all previous phase files retained. Original phases 3–7 exact prompts could not be completely recovered, so these are the confirmed functional requirements plus the surviving historical descriptions. New C31 behavior must not overwrite or silently mark old phase goals complete.

| Priority | Requested feature / philosophy | Evidence after C31 | Still missing and verification gate |
| --- | --- | --- | --- |
| P0 | Integrated editor, not a launcher | Real Tauri/React workspaces, same source model, optional companions | Native Windows build and in-app editing proof; test actual legacy tool launch separately |
| P0 | BSP extension/caves/tunnels/collision | Editable source, exact-rim repair, topology/T-junction/WRL diagnostics | Arbitrary room-wall Boolean cutting, portal/PVS/lightmap/collision tree regeneration, compiled Halo Tool + gameplay regression |
| P0 | Import/export actual tags and BSPs with no user data loss | Cache inspections, Invader staging, lineage/migration, OBJ/JMS source checks | Lossless cross-edition roundtrip, dependency closure and edit/rebuild/play tests; refuse unknown data rather than promise zero errors |
| P0 | First playable Halo CE Test Arena | QuickForge five-mode authored source, spawn audits and QA plans | Working isolated Tool structure/scenario/lightmap/build; in-game CTF/KOTH/Oddball/Race/Slayer tests |
| P1 | Original Halo modding spirit, 2006–2015 | C27–C31 lore, source citations, author credits, Legacy Workflow Lab | More owner-supplied archives, media provenance, rights, actual legacy runtime testing |
| **P1 C31** | **Modern Halo tooltips and usability** | **19-context Field Guide, evidence-linked explanations, focus/touch/Escape help, better local workspace search, Academy small-build loop** | Native desktop/assistive tech and keyboard audit, controller, screen-size screenshots, more task-aware help inside 3D modes |
| P1 | Owned Halo textures/sounds/theme | SHA-pinned header bitmap, theme profiles, opt-in sound references | Full local `ui.map` sprite layout/compositor, correct shader/lightmap blending, robust theme editor and asset handoff |
| P1 | Download maps for HaloMods | C30 curated HTTPS links, browser/manual download and protected import | Direct safe in-app downloader/live catalog not implemented, archival broken links and actual Windows opening/import unverified |
| P1 | Eschaton, HMT, SwordEdit and other optional companions | C28 optional detection, registration and fingerprinted explicit launch | Verified compatibility tests per executable and runtime; no guarantee legacy binaries boot |
| P1 | Firefight, original Zombie Apocalypse and First Contact | Wave/scenario authoring, HaloScript source/academy, restoration research | Actual AI pathfinding, gameplay loop, compiled missions and network synchronization |
| P1 | Multiplayer AI, six-player co-op, 128-player, split screen | Research and intent preserved | Engine changes, network protocol proofs, 2+ clients/servers and load validation |
| P2 | Halo PC, Demo/G4, Mac/MD, CE, MCC and Linux portability | Cache version-aware inspection, static runtime profiles | Per-platform target export, toolchain and real hardware compatibility matrix (especially PowerPC) |
| P2 | VR interactions/reloads | Concept and research retained | Native engine/input/rendering integration and user-tested prototype |

## C31 verifiable acceptance

- A new or unloaded project shows **Select a project**, not Ready for gameplay, in World/Tags/Build; uninspected source sends user to Library.
- Build with tool-folder path reports **Tool folder recorded**, not compiler success. An asset-only project is not considered a buildable Halo source. Unsaved edits and running jobs add explicit caution.
- The field guide is available in all 19 workspaces and all navigation stays within Spark. It cannot execute installers, download remote maps, modify local game files or bless unknown formats.
- Tooltips display on hover/focus/touch; Escape hides them without losing focus; the next separate hover/focus can reopen. Search cannot select a negative/out-of-range index.
- The Academy small-source loop keeps structure, WRL diagnostics and in-game testing separate and manual. No 'passed gameplay' checkbox is created.

## Remaining hard release gates

1. Real native build and test fixture with permission to use Halo Tool and game assets.
2. One original Halo CE Test Arena compiled into valid tags and a loadable map; review collision/portals/lightmaps and all five game modes in engine.
3. Authentic editable-source reconstruction for imported BSPs; validated portal/PVS/collision round-trips.
4. Historical Zombie Apocalypse restoration with owner-approved source and actual multiplayer test.

No installation, Windows build, real compiled BSP, network session or gameplay test was executed by C31's source-only tests.
