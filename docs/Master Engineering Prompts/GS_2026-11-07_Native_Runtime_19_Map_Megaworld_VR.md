# PROJECT GUILTY SPARK — NATIVE RUNTIME INTEGRATION, 19-MAP MEGAWORLD & VR
**November 7, 2026 — Superseding Engineering Directive**

## THE VISION

**ALL THE TOOLS, AND THEN SOME.**

Guilty Spark must become the complete Halo 1 creation studio: edit anything, create anything, build it, launch it, modify it live, and play it with friends.

**Our primary runtime targets are now:**

1. **ChupathingyCE** — preferred runtime for normal gameplay, campaign co-op, multiplayer, live editing and community integration.
2. **OpenH1 VR** — primary VR runtime, with native stereo rendering, motion controls, tracked interaction and multiplayer.
3. **OpenCE-Faber** — complementary Forge, AI/bot spawning, Firefight, tag-editing and server functionality to integrate through supported interfaces.

MCC, retail CE, Custom Edition, HaloMD, Xbox, OpenCE and other existing supported targets remain in the compatibility roadmap. Do not remove their functionality.

Preserve every earlier directive, source edit, requirement ID, accepted build and original game asset.

**Do not start another competing engine or editor. Integrate the best existing systems into Spark.**

---

## 1. CRITICAL MEGAWORLD CORRECTION — ALL 19 MAPS

The final goal is **all 19 original Halo CE multiplayer maps arranged into one cohesive, physically connected playable world**.

Not two maps. Not nineteen isolated levels. Not a series of loading screens disguised as a MegaWorld.

The complete collection is:

**Original Xbox maps:** Battle Creek, Blood Gulch, Boarding Action, Chill Out, Chiron TL-34, Damnation, Derelict, Hang 'Em High, Longest, Prisoner, Rat Race, Sidewinder and Wizard.

**Halo PC additions:** Danger Canyon, Death Island, Gephyrophobia, Ice Fields, Infinity and Timberland.

### Correct the current geometry

The current Timberland–Sidewinder implementation is fundamentally wrong as a final design.

**We want the maps placed beside one another, their adjoining terrain physically blended together.**

Timberland's forest should naturally transition into rocky foothills, mountains and Sidewinder's snowy landscape.

The primary connection should be continuous, outdoor terrain—not an enormous artificial tunnel separating the maps.

Provide:
- Side-by-side positioning and rotation using actual map boundaries.
- Editable terrain seams with correct elevations and walkable slopes.
- A continuous outdoor Warthog-capable road.
- A secondary infantry cave integrated into the terrain.
- Proper material blending, UVs, lighting, sky, fog and audio transitions.
- Correct collision, portals, visibility and player movement.
- Original level geometry, landmarks, objects and gameplay identity preserved.

**Stop polishing the current giant tunnel as though it is the intended MegaWorld.** Preserve the work as a reversible prototype, then correct the architecture and layout.

### Actual editor functionality

Extend the existing BSP Assembly and Workshop tools to:

1. Load and visualize multiple original maps together.
2. Manipulate their world-space positions without changing the originals.
3. Select adjoining terrain boundaries.
4. Reconstruct editable source geometry where necessary.
5. Generate and manually refine natural joining terrain.
6. Join and validate collision, portals, visibility and materials.
7. Save all 19 map identities and modifications in one durable project.
8. Compile through the appropriate native toolchain.
9. Launch in the target game and verify real traversal.

The **full 19-map Atlas must exist as a usable authoring project**, even while individual region connections are being developed and accepted incrementally.

Different layouts require different connections. Indoor maps need appropriate enclosed transitions, elevators or Forerunner structures; outdoor maps need believable terrain continuity.

Do not force every region into the same tunnel generator.

### Native engine feasibility

Investigate whether the full 19-region world can fit within a single standard Halo structure BSP and the verified memory, cluster, portal, collision and map-size limits of each target runtime.

If not, investigate native engine-side region management and streaming in Chupathingy and OpenH1, with synchronized objects, players, physics, projectiles, AI and vehicles.

**Never label map switching, teleports or scenery-only previews as seamless gameplay.**

The first mandatory gameplay proof remains Timberland ↔ Sidewinder, including walking both directions, driving a Warthog and firing across the joined region. But this is only the first milestone of the 19-map world.

---

## 2. CHUPATHINGY — FULL SPARK INTEGRATION

Chupathingy is now Spark's preferred standard runtime.

Investigate its actual source and expose as much supported functionality as possible through Spark's existing UI.

Required integration areas:

- **Level Editor:** maps, scenario objects, tags, assets, scripts, BSPs, terrain, lighting and fog.
- **Live Link:** selection, inspection and supported object/property modifications in a running session.
- **Machinima:** camera control, spectator switching, cinematic paths, recording, playback and scene staging.
- **SparkLink:** multiple Spark editors collaborating while observing the same runtime session.
- **Gameplay creation:** custom gametypes, Firefight, original Zombie Apocalypse, Extraction-style objectives and campaign missions.
- **Multiplayer:** servers, lobbies, map downloads, rotations, players, sessions, teams and gametype configuration.
- **AI:** spawning, encounters, teams, movement, damage/death, scripted behavior and synchronization.
- **Asset workflows:** inspect, extract, edit, import, convert, rebuild and reload compatible content.
- **Diagnostics:** runtime versions, logs, map identity, resource readiness, crashes and native errors.

**The long-term goal is bidirectional integration.** Editing a supported object in Spark should affect the running game; a supported in-game edit should be observable in Spark, reconcilable with its source, and undoable safely.

Inspect Chupathingy's actual interfaces and internal engine ownership before choosing a bridge.

For capabilities that are not exposed externally, design the smallest maintainable, versioned, opt-in engine integration. Never assume that access to the repository means an installed binary already exposes an API.

Do not use unsafe memory patching as a universal solution, bypass engine authority or invent unsupported protocol messages.

Respect Chupathingy's licensing, contributor guidelines and Milenko's existing work. Any upstream contribution must be narrow, attributable, tested and separately approved.

---

## 3. OPENH1 VR — FIRST-CLASS INTEGRATION

OpenH1 is now our primary VR target.

**Repository:** https://github.com/OpenH1/OpenH1

Its current implementation already includes OpenXR stereo rendering, six-degree-of-freedom head tracking, tracked controllers, manual reloads, holsters, two-handed weapons, physical interactions and vehicle controls.

Use those implementations. Do not reinvent an entire VR renderer.

**Important verified constraint:** OpenH1's documented native VR builds currently target Linux/OpenXR and Steam Frame. A Windows OpenH1 executable is not automatically a Windows VR executable. Keep that distinction explicit.

### Spark's VR responsibilities

- Discover and validate a compatible OpenH1 VR installation.
- Recognize its actual platform, executable, build and OpenXR requirements.
- Build or hand off native-compatible content.
- Support VR preview and playtesting workflows.
- Connect Spark's Machinima Director to supported VR camera and scene controls.
- Allow live inspection and editing while a VR runtime is active, where an actual interface exists.
- Preserve original headset/controller behavior.
- Respect physical player position, hand-to-world collisions, aiming, weapons and vehicle mechanics.
- Add VR-compatible object placement and editor interaction through supported controls or a properly implemented engine bridge.
- Provide comfort options, usable interaction distances and performance diagnostics.
- Investigate mixed VR and non-VR multiplayer using the target's real network compatibility.

**Do not invent a new VR runtime when OpenH1 already provides the underlying technology.**

Windows VR is a separate engineering/portability objective if there is no verified upstream implementation.

### Mixed-runtime networking

OpenH1 includes ordinary OpenCE-compatible networking and separately versioned enhanced networking.

Chupathingy advertises compatibility with specific OpenCE network revisions.

That does **not** prove every Chupathingy/OpenH1 combination, standard-mode session, VR feature or Forge session is mutually compatible.

Build a real compatibility matrix using exact executable versions and negotiated wire protocols. Prove joins, movement, damage, camera behavior, AI and disconnect/rejoin with actual peers.

Never silently downgrade or disable runtime protections to force a connection.

---

## 4. FABER FORGE, BOTS & FIREFIGHT INTEGRATION

**Repository:** https://github.com/SutlabSol/OpenCE-Faber

Faber is valuable because it already implements significant functionality we want.

Investigate and reuse its concepts and supported interfaces:

- In-game 3D Forge monitor mode.
- Runtime object placement, transformation, cloning and deletion.
- Native tag catalogs, extraction and `.ftag` handling.
- Actor spawning through `forge_ai_spawn_unit_live()`.
- Multiplayer Forge synchronization.
- Map export and source reconciliation.
- Firefight encounter spawning.
- AI versus player-slot bots.
- Firefight spawn markers and their round/wave filters.
- Scenario gametype markers.
- Server Director, server status and appropriately authorized control interfaces.

Specific implementation landmarks include:

`port/forge/src/forge_3d_mode.c`  
`port/forge/src/forge_ai.c`  
`port/forge/src/forge_network.c`  
`port/forge/src/forge_runtime_tags.c`  
`port/linux/game/firefight_spawner.c`  
`port/linux/game/bots.c`

Faber's Forge is currently Windows-specific. Its Forge protocol uses a separate session version (`FORGE_NETWORK_VERSION`, currently `0x462C`) rather than simply behaving like an ordinary OpenCE game.

Therefore:

**Do not assume Faber Forge works inside Chupathingy or OpenH1 without new, explicitly compatible integration.**

Investigate three supported routes:

1. Use existing native Faber editing and export workflows.
2. Define a reviewed external interface for live Forge operations, if feasible.
3. Implement an equivalent capability in Chupathingy/OpenH1 only where the engine permits it and the work is properly licensed and approved.

Do not directly copy AGPL/GPL implementation into Spark's MIT codebase without resolving licensing and distribution implications.

### AI spawning must actually work

Separate:
- Multiplayer player-slot bots.
- Native Halo scenario actors.
- Forge-created actors.
- Firefight wave spawners.
- Zombie and Extraction gameplay entities.

These are not interchangeable.

Prove that spawned AI initializes, moves, navigates, targets, fights, takes damage, dies and is correctly synchronized to other players.

For the 19-map world, investigate what navigation/pathfinding and streamed encounter state would require across connected regions.

---

## 5. COMPLETE THE CREATOR WORKFLOWS

One editor, not disconnected tools with a launcher around them.

A creator should be able to:

**Open an original Halo map → inspect and edit it → import assets → place AI, vehicles, weapons and objectives → save → build → launch in Chupathingy or OpenH1 → edit supported content live → record machinima → package the result → play with friends.**

This must extend to:

- Campaign scripting and mission direction.
- Firefight creator and encounter controls.
- Original Zombie Apocalypse mechanics.
- Extraction-style gameplay with objectives, loot/extraction zones, failure states and round authority.
- CTF, Slayer, KOTH, Race, Oddball and compatible custom modes.
- Multiplayer hosting and map distribution.
- Collaboration with multiple Spark instances.
- Native asset and tag editing.
- Lighting, fog, sound and shaders.
- Cinematic cameras and recording.

Also finish the previously requested **Machinima greenscreen mode**: green BSP/environment while weapons, bipeds and vehicles retain normal rendering and correct depth/occlusion. Implement it as a reversible render/capture feature without corrupting map materials.

Preserve the pending top-bar correction: File, Tools, Maps and map tabs should sit to the left outside Spark's logo glow.

Neither greenscreen nor UI polish should displace the current geometry and runtime acceptance work.

---

## 6. RUNTIME ADAPTER ARCHITECTURE

Extend Spark's existing runtime integration rather than building another launcher, editor or state database.

Each runtime needs a truthful, version-pinned capability profile describing:

- Installed executable and source/build identity.
- Supported input maps, tags and resources.
- Native build/export targets.
- Live object and tag operations.
- Forge capabilities.
- AI and bots.
- Camera/recording capabilities.
- Multiplayer and co-op networking.
- VR availability.
- Runtime-specific limitations and required permissions.

A capability must be marked as **implemented and verified**, **partially supported**, **research-only** or **unsupported**.

Separate offline content compatibility, native build compatibility, runtime execution and live editing. One does not prove another.

Keep Spark's own documents and Undo history authoritative for authoring. An external game's runtime state must be reconciled before becoming a saved source edit.

Use bounded, authenticated, host-authoritative operations for live changes. Preserve game state, reject invalid objects/fields, handle disconnects and avoid arbitrary execution or uncontrolled memory writes.

---

## 7. HOW CODEX MUST EXECUTE THIS

**Stop treating enormous checklists as implementation.**

Start from the current dirty local master. Preserve the road/cave work, ongoing material fix, greenscreen changes, latest native build, checkpoint, original inputs and all 475 existing requirement IDs.

Do not reset, create another worktree, overwrite modified files, push, publish or modify original Halo installations.

**First inspect the current in-progress work and finish or safely checkpoint it.**

Then advance in this order:

### Milestone A — Correct MegaWorld geometry
Produce an accurate top-down 19-map Atlas and a true side-by-side Timberland–Sidewinder terrain-seam implementation. Do not use a giant tunnel as the primary connection. Prove native build/readback and real traversal.

### Milestone B — Chupathingy native creator bridge
Identify an exact supported runtime interface, implement one complete meaningful live-editing round trip and test it in an actual running game.

### Milestone C — OpenH1 VR
Validate the real supported VR build and hardware requirements. Prove a Spark-authored native map launches and works in the VR runtime. Keep non-VR testing separate from headset acceptance.

### Milestone D — Faber capabilities
Implement and prove one supported Forge/object/AI-spawner workflow that can be used from Spark without fabricating cross-engine interoperability.

### Milestone E — Grow the 19-map world
Repeat proven geometry/authoring methods region by region, including indoor transitions. Instrument memory, rendering, collision, visibility and gameplay limits. If engine-side streaming is necessary, prototype and accept it independently before broad expansion.

### Milestone F — Full creator and multiplayer acceptance
Finish the complete user workflows, multiplayer gameplay, VR integration, machinima and game modes. Preserve each target's independently verified limitations.

**For every milestone:**
- Inspect existing implementation first.
- Make actual source changes within existing owners.
- Add regression tests for the specific defect.
- Test using real UI entrypoints.
- Verify native output independently.
- Run actual game/peer/headset tests when available.
- Record passing and failing evidence separately.
- Keep unfinished acceptance visible.
- Commit locally only after an appropriately validated checkpoint.
- Continue to the next safe task without repeating unsuccessful unchanged experiments.

Avoid hours of passive investigation, repeated full test suites without changed inputs, unnecessary rebuilds and endless documentation updates.

If hardware, approvals, engine limits or game access block a native acceptance test, record the exact blocker and continue independent engineering. Do not fake the result.

Use the existing `AGENTS.md`, `ENGINEERING_CONTRACT.md`, `ACTIVE_TASK.md` and requirement ledger. Do not invent another task scheduler or project-management system.

## REQUIRED FINAL ACCEPTANCE

The product goal is not satisfied until:

1. All 19 maps exist in the actual MegaWorld authoring layout.
2. Every intended region connection is represented by valid playable geometry or a separately verified native region-management system.
3. Players can physically travel between all connected regions without misleading transitions.
4. Chupathingy runs verified Spark-authored content and supports the agreed native live-editing workflows.
5. OpenH1 VR runs compatible Spark content with verified headset gameplay.
6. Faber's selected Forge and AI features are actually integrated or their missing interfaces are clearly identified.
7. AI, vehicles, objectives, gametypes, cinematics and multiplayer work in the supported configurations.
8. Actual UI, Save/Undo/Redo, restart, native compilation, game and peer acceptance have been demonstrated.
9. Original content remains untouched and runtime-specific compatibility remains honest.
10. Existing Windows/Mac/Linux editor and release goals remain preserved.

**A successful compiler, passing tests or a rendered overview is not a playable MegaWorld.**

The final product should feel like Halo's worlds, tools and engines have been brought into one creative environment—not like separate software products glued together.

**Build toward all 19 maps, Chupathingy and OpenH1 VR. Finish real creator workflows. Preserve the community's work. And prove the result in Halo.**