# 07 Halo Modding Brain — Continuation 25 consolidated prompt / missing-feature ledger

**Scope of recovery:** retained source includes `ORIGINAL_92_REQUIREMENTS_RECONSTRUCTION.md`, `PHASE3_10_FEATURE_TRACEABILITY.csv`, `PHASE_01_TO_10_ACCEPTANCE.md`, `LEGACY_FORUM_RESEARCH_AND_GAP_RECONCILIATION.md`, `PROMPT_AND_FEATURE_RECONCILIATION_C21.md`, and the C22–C24 engineering notes. The **verbatim text** of all original Phase 3–7 prompts was not recoverable; do not claim it was. These are reconstructed functional requirements, not a guarantee that every original word is represented or implemented. Nothing absent is silently abandoned.

| Discussed capability | Available source-facing work through C25 | Still missing / acceptance gate |
| --- | --- | --- |
| One unified Halo editor, not a launcher | Tauri/Rust/React workbench combining tag, world, QuickForge, assets, scripts, QA | Native Windows build and end-to-end cohesive workflow, not just multiple panes |
| Eschaton/HMT-style tag edit and reference swaps | Bounded typed tag reader, a handful of audited fields/reference checks | Full Blam tag class schemas, class-safe serialization, cache-to-tag roundtrip |
| SwordEdit/Sapien-like scenario editing | WASD/RMB flight, 3-axis gizmos, source brushes, props, placements, undo/redo | Real imported scenario/BSP topological edit + compiler-tested roundtrip and MotaLev-style regression suite |
| Real BSP render, texture, shaders | Classic material IDs, verified first-mip bitmap previews, bounded resource map support | Complex shader graphs, external metadata bodies, cubemaps, complete mipmaps, faithful GPU rendering |
| Import OBJ, world meshes, terrain, cave tunnels | OBJ/JMS source, terrain sculpt, exact seam analysis, source topology, T-junction audit | Proven CSG joins, full collision hull, portal/PVS and lightmap bake, real Halo Tool import |
| Diagnostic and corruption avoidance | WRL parser/overlay, brush proximity finder, source edge graph, C25 source-bound Tool logs and private triage | Verified compiler-job provenance, automatic location-specific repair, test against real failing owner map |
| King of the Hill, CTF, Slayer, Race, Oddball | Four-corner hills, flags, Oddball, Race, teleporters, 32-start Test Arena, spawn audit, manual QA ledger | Actual mode scoring, hill boundaries, flag/ball/race spawn and two-client outcomes |
| Authorable lighting/sun/fog, water/weather | Editor previews and source intent exports | Real Halo sky/fog/water tags, radiosity, reflections, in-engine appearance parity |
| Build and play in one click | Isolated source staging, CLI plan, version gating, receipts, error logs, cache inspection | First genuine Tool-compiled original Test Arena, verified map/load/gameplay and safe artifact promotion |
| Save/share mod packages and friends LAN | ZIP/source manifests, MCC packaging receipts, server planning, QA cases | Compatible live server session, installed package validation, true multi-client integration |
| Firefight AI waves and Zombie Apocalypse restoration | Wave configuration, HSC source scaffolds, archival investigation, opt-in source script pack | Actual scenario encounters, navigation, enemy spawning, game rules and verified owner mod restoration |
| First Contact campaign/cinematics | Mission beat, camera and script scaffolds | Full scenario, cutscenes/dialogue, valid actors, working in-engine vertical slice |
| 6-player co-op, 128-player multiplayer | High-level capability and compatibility research | Engine modification, packet replication, protocol, bandwidth/safety limits and real-world testing |
| Multiplayer AI sync / zombie game modes | Explicitly identified stock Halo CE multiplayer AI limitations | Engine-specific AI replication, ownership, deterministic simulation and multi-client tests |
| Real Halo UI themes, sounds, old modding feel | User-owned audio inspection, interface editing, original community credits and Academy | Locally imported, rights-cleared Halo textures/sounds with render/audio parity; no copyrighted bundle |
| macOS Demo, Mac Retail, HaloMD, Xbox, Windows CE, MCC, Linux, Apple Silicon, PowerPC G4 | Read-only cache classification, version-aware capability registry, source adapters | Separate executable/ABI/cache-endian and game-runtime acceptance for each; no blanket cross-version map compatibility |
| Split-screen PC, VR hands/head, modern graphics | Long-term design requirements | Distinct rendering, input, camera/network and compatibility engineering; not an existing feature |

## What this release actually advances

**C25 scope:** one genuine fix (Tool text logs are no longer shown as current after source edit) and one bounded, private cross-diagnostic workflow (Tool log + WRL + source preflight triage). This does **not** close a compiler, gameplay, BSP authoring or multiplayer feature. The earlier C19–C24 batch bitmap, five-mode preset, spawn audits, WRL matching and topology protections are preserved.

## Highest-priority sequence

1. Prove a native Windows/Cargo/React build launches and saves/loads an untouched sample project.
2. Isolate matching Halo Editing Kit and owner-provided source tags, run `structure` on an original Test Arena. Keep raw Tool logs/WRLs in the local working folder, report hashes and remediate exact errors. Never force-kill a running native tag writer.
3. Verify generated BSP tag integrity, collision, portals/PVS, sky/lightmaps, correct source asset references and a genuine playable cache.
4. Test five stock game modes locally; run two-client netgame QA and preserve independently observed results.
5. Restore **Zombie Apocalypse** and implement actual Firefight encounters only after the original-mission and engine-specific AI behavior are verified.
6. Pursue complete texture/shader fidelity, BSP imports/CSG, campaign vertical slice, vintage runtimes and ambitious co-op/VR/netcode separately, each with its own acceptance fixtures.

**Safety:** originals read-only, stage in a new isolated directory, inspect hashes before/after, no automatic overwrite of installed Halo or owner map assets. A green UI source check or private diagnostic JSON must never stand in for Halo compiler/game evidence.
