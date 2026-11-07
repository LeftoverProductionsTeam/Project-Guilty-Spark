# PROJECT GUILTY SPARK — DOUBLE-ACTION ENGINEERING DIRECTIVE

## TWO FLAGSHIP ACCOMPLISHMENTS. ONE UNIFIED EDITOR.

**Mission:** Prove Guilty Spark can create an original, playable Halo multiplayer map AND build a connected MegaWorld from existing Halo maps.

These are two product acceptance tracks, not competing projects.

**Track A — Original Multiplayer Map Creator**

**Track B — MegaWorld: The Great Canyon**

Both must share Spark's existing geometry editor, asset library, native compiler, project persistence, history, map inspection, gametype authoring and testing infrastructure.

Do not implement duplicate editing engines to satisfy the demonstrations.

Continue safely from the latest local checkpoint and reconcile published master without discarding unpushed work. Preserve all existing requirements, prompts, assets, sources, original Halo game installations and accepted releases. Do not push or publish without authorization.

## TRACK A — BUILD AN ORIGINAL MULTIPLAYER MAP FROM SCRATCH

### Required user workflow

A creator opens Spark and chooses:

**File → New → Multiplayer Map**

This is the intended user-facing workflow. If the commands do not exist, implement them by connecting the existing project and editor systems.

The creator should then be able to:

1. Choose the target Halo runtime and a blank map template.
2. Open the 3D level editor with an editable world.
3. Sculpt terrain and construct cliffs, valleys, platforms, buildings and bases.
4. Drag rooms, stairs, ramps, walls and other geometry into the level and edit their dimensions and surfaces.
5. Carve a playable cave or tunnel into the terrain.
6. Paint or assign native materials and configure lighting, sky and fog.
7. Browse assets from connected Halo runtime directories.
8. Drag a scenery object, weapon and vehicle from another map into the world.
9. Automatically prepare compatible native dependencies and conversions.
10. Place red and blue team starting positions, neutral spawns, weapons, vehicles and respawn points.
11. Place CTF flags and King of the Hill objectives using their actual Halo-native structures.
12. Configure supported multiplayer rules and perform diagnostics.
13. Save, Undo/Redo, Save As, close and reopen the project.
14. Choose **Build & Playtest**, automatically executing the applicable installed Halo tools.
15. Launch the real map in a compatible Halo engine and test it with at least two actual game clients.

### Flagship demonstration

Build a small original map containing:

- Two opposing bases.
- Sculpted outdoor terrain.
- A canyon with a working vehicle road.
- A cave connecting two areas.
- A bridge, stairs and ramps.
- Imported scenery and a working Warthog.
- Native weapon and player spawns.
- Red and blue team starts.
- CTF flags and at least one King of the Hill objective.

The resulting map must be a real compiled Halo map, not merely a Spark preview.

### Track A acceptance

**PASS only when:**

- A user can perform the full workflow through Spark's actual UI.
- The native build contains the correct geometry, collision, tags and scenario records.
- Both game clients load the same authored map.
- Both players can move, fight, die and respawn correctly.
- Teams and supported objectives operate correctly in the selected gametype.
- The road, cave, ramps, bridge and imported objects function in-game.
- The original project survives Save/restart with usable Undo/Redo history.

Verify Slayer, CTF and King of the Hill behavior separately. Do not infer gametype compatibility from object placement alone.

A successful browser test, a model preview or a clean compiler exit is not sufficient.

## TRACK B — MEGAWORLD: THE GREAT CANYON

### Final objective

Create one logically connected world incorporating all 19 original Halo CE multiplayer maps.

The regions must feel intentionally designed together, with authentic Halo terrain, plausible Forerunner infrastructure and meaningful transitions.

Use the established full-world layout as the design basis. Preserve recognizable map identities and original assets wherever possible.

The ultimate experience should allow players to cross between regions along canyon roads, caves, bridges, mountain passes, maintenance corridors and underground facilities.

### Required user workflow

A creator opens Spark and chooses:

**File → New → MegaWorld**

The creator should be able to:

1. Select two or more existing maps from connected runtime directories.
2. Add them to the MegaWorld Atlas and see their actual world geometry.
3. Arrange, rotate and position each region within a shared world coordinate system.
4. Select source terrain boundaries and inspect the proposed connection.
5. Open the existing BSP Workshop from that selection.
6. Sculpt new terrain between the maps, or reconstruct a bounded editable source section where the original cache is not directly editable.
7. Form natural canyon walls, roads, cave entrances, tunnels and ramps.
8. Blend native materials, UVs, fog, lighting and environmental transitions.
9. Inspect collision, visibility, portals, resource dependencies and walkable slopes.
10. Add scenery, vehicles and multiplayer objectives using the same workflows as Track A.
11. Save and reopen the combined project without losing donor identities or source edits.
12. Build a compatible native world and independently inspect its geometry and scenario data.
13. Launch it in Halo, physically enter the second region and return to the first.

All editing capabilities must be reachable through clearly labeled, contextual Spark controls—not exclusively through scripts, manually edited JSON or external tools.

### First major playable proof

Use **Timberland → Sidewinder**.

Create a natural transition where Timberland's wooded terrain rises into rocky mountain slopes and a snow-covered Sidewinder entrance.

Provide both:

- A vehicle-capable mountain road.
- A separate cave or tunnel usable by infantry.

Verify the original playable areas survive the modification.

### Track B acceptance

**PASS only when:**

- Both original environments exist in a single playable experience.
- The user creates or edits the actual connection in Spark.
- Native collision, portals and geometry pass independent inspection.
- A real Halo player walks from Timberland to Sidewinder and back.
- A Warthog drives the connected vehicle route successfully.
- Terrain seams do not expose broken floors, visible holes or incorrect collision.
- Materials, lighting and visibility behave appropriately.
- Original donor maps remain unchanged.
- The authored connections survive project restart and rebuilding.

Also create one elevated cross-region sightline and demonstrate that a sniper can hit a valid target across the connection in the actual runtime.

**Do not claim a playable MegaWorld from static collision sampling, compiler readback or a successful server connection alone.**

## FULL 19-MAP EXPANSION

Once the two-region proof passes, expand incrementally through the same user-facing workflows.

First complete the four-region connected prototype, then the larger outdoor regions, followed by underground and interior destinations, until all 19 maps participate in the world.

For every connection, record:

- Source and destination region.
- Terrain transition and route type.
- Native geometry and collision acceptance.
- Human or automated game-player traversal in both directions.
- Visibility and material validation.
- Vehicle feasibility where relevant.
- Resource and performance impact.

The full 19-map milestone is not complete until every region is reachable in a real supported runtime.

Investigate both:

1. A native merged-BSP implementation.
2. A modified OpenCE runtime with multiple BSPs and engine-side region management.

Existing OpenCE campaign co-op synchronizes BSP transitions, but normally follows the host's active BSP. It does not currently prove that 128 players can remain in different regions simultaneously.

If independently streamed regions become necessary, implement and verify synchronized player location, loaded geometry, collisions, AI, vehicles, projectiles, visibility and region transitions.

Do not silently replace physical world travel with teleportation or map loading and call it seamless.

## ONE EDITOR PIPELINE, NOT TWO SPECIAL CASES

The most important requirement is architectural reuse.

The same Spark features must work in a small original multiplayer map and in MegaWorld:

- Terrain sculpting and source reconstruction.
- Editable BSP geometry, face and vertex operations.
- Native caves, tunnels and seam joining.
- Asset Library drag-and-drop and cross-runtime conversion.
- Materials, lighting, fog and atmosphere.
- Weapons, vehicles, spawns and gametype objectives.
- Durable project Save, Undo and recovery.
- Native compilation, launch and independent verification.

If a shared feature succeeds in Track A but fails in Track B, report an integration defect. Do not solve it by creating a second incompatible version.

The existing imported-cache BSP limitation must be addressed honestly. Selecting a native triangle does not automatically provide an editable source surface. Build a safe reconstruction or authored replacement workflow where necessary.

Keep native geometry and resource budgets visible. Do not simply raise hardcoded limits to get oversized maps to compile.

## SHARED USER-WORKFLOW TEST HARNESS

Extend the existing browser, Windows/Tauri and native Halo testing systems.

For **both tracks**, drive the actual user interface:

**Create/Open → Edit → Drag/Place → Configure → Undo/Redo → Save → Restart → Build → Independent Readback → Play in Halo.**

Capture evidence at distinct levels:

**UI acceptance:** Controls are visible, work when clicked or dragged, and provide accurate feedback.

**Desktop acceptance:** Native project state, source ownership and restart recovery work.

**Artifact acceptance:** Halo's native toolchain builds the expected actual geometry, objects, tags, spawns and objectives.

**Runtime acceptance:** A compatible real game loads and the intended player actions work.

**Multiplayer acceptance:** At least two actual clients see and interact with the same authored result.

**Release acceptance:** A clean-machine installation can complete the supported workflow with explicitly configured required tools.

Never replace an actual user gesture with direct IPC and then report it as a UI pass.

Keep independent receipts, screenshots, short recordings, artifact hashes, runtime versions and exact failure reasons.

## FUTURE MODES — COMMON WORLD, DIFFERENT RULES

Design the underlying world and gameplay schemas so the same MegaWorld layout can eventually support:

- PvE co-op and Firefight.
- PvP free-for-all.
- Colored-team PvP.
- PvPvE.
- Extraction with no match timer, persistent equipment and one extraction location.

Separate map construction from game-mode logic.

Research OpenCE's existing host-authoritative AI and multiplayer code. Prefer compatible engine extensions over reproducing its networking inside Spark.

No PvE, Extraction or 128-player acceptance without corresponding real runtime tests.

## REQUIRED CHECKPOINT REPORT

Report only major milestones and actionable blockers.

For each track, provide the exact user workflow performed, game runtime, native artifact, tests, evidence and remaining limitations.

Track A is not complete without an original playable multiplayer match.

Track B is not complete without a user-authored, physically traversable connection between two original Halo maps.

The final objective remains all 19 connected maps, but do not claim that accomplishment prematurely.

**No fake green checks. No duplicate editors. No test-count theater. No replacing real gameplay evidence with promises.**

## SUCCESS DEFINITION

A creator can open Guilty Spark and build a brand-new playable Halo multiplayer map.

The same creator can open a different Spark project, bring together original Halo levels, sculpt a canyon and tunnel between them, build that world, and walk or drive from one classic map into another.

**TWO FLAGSHIP EXPERIENCES. ONE SET OF TOOLS. BOTH ACTUALLY WORK.**