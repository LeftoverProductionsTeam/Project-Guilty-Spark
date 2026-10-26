# Project Guilty Spark — Continuation 15 (2026-10-26)

**Starting source:** the exact Continuation 14 ZIP; this is a **source-only** cumulative continuation. No Halo .map/game install, executable or native gametype binary is bundled or modified. The original project version remains 0.3.0 until a real desktop build is accepted.

## New engineering: Halo CE multiplayer netgame authoring

- Added **Race vehicle starts** (`raceVehicle`, native `race_vehicle`; up to 16) and **teleporter entrances/exits** (`teleportFrom`/`teleportTo`, native `teleport_from`/`teleport_to`). These are `scenario.netgame_flags`, **not** vehicle tags or decorative geometry. The legacy project objective schema is unchanged except for new enum values; previously saved objective records remain readable.
- Linked-teleporter button creates the entrance and exit using **one free channel and one undoable edit**. Independent marker tools allow existing channels to be repaired. Endpoints can be moved with the existing colored XYZ handles. The property editor displays the channel and allows adjustments. Unpaired channels or out-of-range usage IDs fail closed.
- Added **non-colliding 3D Race route and teleporter channel visualization**, individually toggleable from hill overlays. These render-only line segments are **never** saved into the JMS, physics collider or Halo source tags. Invalid/gapped Race checkpoint sequences do not render as if they formed a valid route.
- Halo CE scenario command generator now explicitly maps all seven project kinds to corresponding `netgame_flags[*].type` identifiers and refuses any unknown fallback. Earlier code erroneously mapped every unknown objective to Race track. New native validation rejects unpaired teleporter channels, invalid teleporter indices and more than 16 Race vehicle starts.
- The **all-five-mode readiness matrix** now checks CTF team-specific starts and whether they are closer to their own flag. The native source planner independently refuses the known all-spawns-closer-to-enemy-flag case that can cause the game to fail to find eligible respawn positions.
- Fixed two placement edge cases: adding a Race checkpoint fills the **first unused index** rather than blindly using the array length; placing one missing teleporter endpoint reuses an orphaned compatible channel rather than creating another orphan.
- Expanded Modding Academy's source-only King/CTF/Oddball/Race lesson with Race-vehicle and linked-teleporter walkthroughs, tooltips and glossary entries.

## Engine references (authorship belongs to the original writers)

- c20 / Reclaimers community reference: <https://c20.reclaimers.net/h1/tags/scenario/#netgame-flags>. Documents type IDs 0 (CTF), 2 (Oddball), 3 (Race checkpoint), 4 (Race vehicle), 6 (teleport entrance), 7 (teleport exit), 8 (King hill), usage_id field semantics and the classic 200-flag block limit.
- c20 game-mode analysis: <https://c20.reclaimers.net/h1/engine/game-modes/>. Documents the King **two-point crash**, initial Crazy King hill, and CTF spawn eligibility by flag proximity.
- Original HEK multiplayer-population tutorial (archived): <https://nikon.bungie.org/misc/hek_tutorial/references/level_design/mp_level_design/mp_ld_level_population.html>. Describes the original Sapien game data/object population, netgame flags, and recommendation to save sequential versions. It does **not** prove Guilty Spark's source code compiles.
- Halo Maps 2005 tutorial archive credits named forum writers, including Xzzy for Net Game Flags placement: <https://www.halomaps.org/hce/detail.cfm?fid=1535>. Do not pass new Academy content off as these writers' original work.

## Verification ledger

| Gate | Meaning | Status |
|---|---|---|
| Offline TypeScript core tests and existing regressions | Algorithms, invalid input cases, legacy records | PASS (see supplied test log) |
| New `test-halo-netgame-extra.mjs` | Channel pair, bad/split channels, Race vehicle cap, ID-gap repair, cross-mode CTF starts | PASS |
| Full TS/TSX syntax parser | Syntax only; not runtime behavior | PASS |
| Strict isolated TS checking of game-type logic | Type correctness without missing third-party React modules | PASS |
| ZIP CRC + per-file hashes + clean extraction | The delivered source archive is complete and not silently modified | PASS, post-packaging |
| Cargo / native Rust integration tests | Rust schema/command generator and actual binary compilation | **NOT RUN** — no Rust compiler in environment |
| Full React/Tauri / Windows desktop UI | Render, click/drag, pointer controls, persisted project | **NOT RUN** — dependencies/native Windows missing |
| Tool/Invader tag compilation, Sapien/Tag Test | Exact `type` setter names and scenario behavior | **NOT RUN** — requires matching installed toolchain |
| Game test: five modes, vehicle, teleporter | Player spawn/score/objective behavior in actual Halo CE | **NOT RUN** — requires actual Halo runtime |
| Multiplayer AI sync / Firefight / Zombies | Networked authoritative AI and scoring | **NOT IMPLEMENTED / UNVERIFIED** |

### Do not imply full completion

All original ten Codex phases remain a **product roadmap**, not a completely implemented artifact. Major unsolved dependencies: automatic actual bitmap/shader/lightmap extraction, arbitrary imported BSP editing with sealed collision + portals/PVS + AI pathing, compiled playable First Contact, authentic scripted in-engine Firefight and Zombie Apocalypse, verified hosting/joining and multiplayer AI sync, and full native game-type variant binary support.

### Windows manual tests to run first after an actual build

1. Open a new isolated Halo Custom Edition QuickForge project; ensure old projects still deserialize and show the correct previous objectives.
2. Add linked teleporter pair and move endpoints. Toggle Race / teleport paths. Check both channels match, export to a **new managed source folder**, inspect native `teleport_from/to` setters, and verify the source folder hashes.
3. Deliberately delete one endpoint and confirm both UI preflight and native Rust export reject it. Undo and check the error clears.
4. Place Race vehicle starts and ordered Race checkpoints; delete checkpoint 1 and reinsert it. Verify no duplicate IDs or false route preview. Add a 17th Race vehicle start and verify export is blocked.
5. Construct a CTF layout with all team starts nearer the enemy flag. Confirm the readiness matrix marks it unsafe, then verify the native build plan also rejects it.
6. Only after verified Tool/Sapien compilation, confirm teleport behavior, Race vehicles/checkpoint order, all five stock modes and spawn clearance in the actual CE game; record build hashes and reproduction steps. AI-sync tests remain separate.

**No game or project binary is modified by these code changes; the editable source ZIP is the deliverable.**
