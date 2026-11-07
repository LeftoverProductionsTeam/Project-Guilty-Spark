# PROJECT GUILTY SPARK — 19-MAP MEGAWORLD, CHUPATHINGY & OPENH1 VR FORGE
**Superseding Engineering Directive — November 7, 2026**

## MISSION

**ALL THE TOOLS, AND THEN SOME.**

Guilty Spark must become the complete Halo 1 modding studio, with full desktop and in-game VR authoring.

Our primary targets are now:

1. **ChupathingyCE:** Preferred standard runtime for gameplay, co-op, multiplayer, native editing integration and machinima.
2. **OpenH1 VR:** Primary immersive editing and VR gameplay runtime. We must create a fully functional in-game VR level editor.
3. **OpenCE-Faber:** Forge, AI spawning, Firefight and runtime tag-editing integration partner.

All previous MCC, classic CE, Xbox, Mac Demo, Linux/macOS, community-engine and native-format goals remain preserved.

Our objective is not simply to launch these runtimes from Spark. **Spark must be able to author, inspect, modify, build and synchronize supported game content through them.**

Do not create competing systems where the existing engines or Spark components already provide working capabilities.

---

## 1. OPENH1 VR — COMPLETE IN-GAME LEVEL EDITOR

**This is now a major engineering priority.**

Repository: https://github.com/OpenH1/OpenH1

Build an actual **Guilty Spark VR Forge Workspace** inside OpenH1.

The experience should be similar to combining Halo Forge, Sapien, SwordEdit and Spark's Level Editor inside a VR headset.

A creator should be able to put on their headset, enter editing mode, fly around an existing Halo map, select objects and terrain, place assets, change tag properties, create gameplay encounters, and save those modifications without repeatedly exiting the game.

### VR movement and interaction

Implement:

- Six-degree-of-freedom editor flight using OpenH1's existing OpenXR tracking and input systems.
- Independent head movement and editor navigation.
- Smooth movement, adjustable speed, precision movement, snap/smooth turning, and comfort settings.
- Optional editor-only noclip with a clear distinction from normal gameplay.
- Controller raycasting for selecting world objects and terrain.
- Direct hand grabbing, moving, rotating, duplicating and deleting objects.
- Two-handed manipulation, axis constraints, grid snapping and surface snapping.
- Visual gizmos, object outlines, placement ghosts and collision feedback.
- Undo/Redo, object locking, multi-selection and grouped editing.
- Easy switching between VR Forge, normal gameplay and machinima modes.

Do not overwrite normal player inputs or interfere with OpenH1's existing hand interactions, weapon handling or vehicle controls.

**Editing mode must be explicitly enabled.** It must not grant cheats or unauthorized modifications during ordinary multiplayer.

### In-headset asset browser

Create a comfortable VR asset palette linked to Spark's existing native Asset Library.

Creators should be able to browse and spawn:

- Weapons, ammunition and equipment.
- Vehicles, including Warthogs, Ghosts, Banshees and Scorpions.
- Scenery, trees, rocks, structures and Forerunner objects.
- Bipeds, actors and AI encounters.
- Doors, switches, machines and triggers.
- Multiplayer objectives, flags, hills, teleporters and spawn points.
- Lights, sounds, effects and supported environmental elements.
- Imported custom assets from compatible Halo source libraries.

Show previews, native tag identity, source map, dependencies and placement restrictions.

Use verified tag definitions and supported engine spawning functions. Preserve native object identities and do not invent tag classes.

### Live VR tag editor

**Creators must be able to point at an object, select it and modify its supported tags while still wearing the headset.**

Build a floating, readable VR inspector with:

- Tag hierarchy and search.
- Typed numeric and reference fields.
- Object properties, transforms and metadata.
- Weapon damage, ammunition, firing and projectile settings where runtime-safe.
- Biped and actor properties, teams and supported AI settings.
- Vehicle physics and handling where supported.
- Shader, lighting, fog, material and sound controls.
- Device, trigger, objective and scenario bindings.
- Native dependency/reference navigation.
- Undo/Redo and explicit Save/Apply behavior.

**Do not pretend every tag field can be safely hot-edited.**

Classify changes into:

1. **Live-editable:** Can be applied safely to the running engine.
2. **Preview-only:** Can be visualized without changing authoritative game simulation.
3. **Requires native rebuild/reload:** Changes involving BSP geometry, compiled collision, some tag dependencies, scripts and other structural data.
4. **Unsupported:** No verified safe mutation or compilation path.

Use OpenH1's existing mod reload support for applicable visual/audio changes, but recognize that its current implementation does not provide arbitrary gameplay-tag replacement.

For gameplay-affecting edits, implement explicitly validated, versioned engine operations and require authoritative game-state synchronization.

No arbitrary memory writes, unvalidated pointer manipulation or fictional universal tag API.

### VR terrain, BSP and map editing

Connect VR authoring to Spark's existing BSP Workshop and native geometry systems.

Creators should be able to select terrain, mark an area, and perform supported operations such as:

- Place or remove authored geometry.
- Adjust terrain elevation.
- Sculpt hills, valleys and ramps.
- Plan and shape caves or tunnels.
- Build structures, roads and bridges.
- Assign materials and UVs.
- Position lights and environmental effects.
- Edit supported collision and visibility source definitions.

VR should show the authored result immediately where safe, while distinguishing preview geometry from genuine compiled Halo geometry.

For BSP changes, preserve the original map, write reversible source edits, compile in a protected staging workspace, validate native output and load the newly built map through a safe game transition.

**Do not attempt unsafe live replacement of an active structure BSP just to claim real-time editing.**

### Save and persist everything

Every in-game operation needs to reconcile with Spark's existing project state.

Use stable object identities, source hashes, bounded edit transactions and existing durable history.

An edit made in VR should appear in the desktop Spark editor. An edit made in Spark should appear in the connected VR session when that change is supported live.

Support:
- Save, Undo/Redo and process restart.
- Reconciliation of simultaneous desktop/VR edits.
- Explicit conflict handling.
- Recovery from headset or engine disconnects.
- Native source export and compilation.
- Original map preservation.
- Correct author attribution and dependency records.

The headset must provide actual authoring controls, not just a remote viewer of Spark's desktop.

Native builds may use an explicitly paired Spark computer when the required compiler is unavailable on the headset. This must be transparent in the UI.

---

## 2. OPENH1 ENGINE INTEGRATION — TECHNICAL ARCHITECTURE

Investigate these existing OpenH1 components before implementing new ones:

- `port/linux/src/vr.c` and `vr.h` — OpenXR controller and headset state.
- `port/linux/game/vr_grab.c` — existing hand/world interaction.
- `port/linux/game/vr_render.c` — stereo world rendering and camera integration.
- `port/linux/game/world_scene.c` — native world/object scene information.
- `port/linux/game/mods.c` — supported tag-resource reload behavior.
- `port/linux/game/network_objects.c` — engine-owned object synchronization.
- Existing object placement, collision, scenario, tag validation and scripting systems.

Implement the smallest maintainable **engine-side VR Forge component**, connected to Spark's existing authoring code.

The engine integration should own validated runtime operations and VR interaction. Spark should own durable projects, native editing, source compilation, resource management and authoring history.

Design a versioned, capability-negotiated communication interface with explicit pairing and permissions. Local communication should be preferred; LAN connections must require authorization and authentication.

Do not expose arbitrary shell execution, remote memory modification, unrestricted RCON or unauthenticated editing endpoints.

OpenH1's AGPL licensing and Spark's MIT licensing must be respected. Keep implementation ownership and distribution obligations clear. Do not copy GPL/AGPL engine code into Spark's MIT core.

**OpenH1 currently documents Linux/OpenXR and Steam Frame VR builds.** Windows VR support must not be advertised without independently implementing and verifying it.

---

## 3. CHUPATHINGY — PREFERRED STANDARD RUNTIME

Repository: https://github.com/ChupathingyCE/chupathingyce

Continue full Chupathingy integration with Spark's existing components:

- Map inspection, import, extraction and native building.
- Live object inspection, placement and supported tag editing.
- Level Editor, BSP Workshop and game-mode tooling.
- Cinematic cameras, spectator handling and machinima.
- Campaign scripting and co-op tools.
- Multiplayer hosting, server discovery and maps.
- SparkLink collaboration and Live Link.
- Native AI, encounters, actors and gameplay modes.
- Zombie Apocalypse, Firefight and Extraction-style gameplay.
- Runtime diagnostics, resource-bank setup and failure reporting.

Investigate the real engine interfaces and implement maintainable adapters rather than assuming Faber or OpenH1 internals can be called directly.

The long-term objective is for both Chupathingy and OpenH1 to use Spark-authored content, with the richest safe editing functionality each engine supports.

Do not assume they share every multiplayer protocol or runtime feature. Establish exact build-specific compatibility.

Any Chupathingy upstream contribution requires proper testing, attribution, licensing review and separately authorized publication. Respect Milenko and the existing contributors.

---

## 4. FABER FORGE, AI SPAWNERS AND EDITING

Repository: https://github.com/SutlabSol/OpenCE-Faber

Investigate Faber's existing implementations rather than recreating their functionality blindly.

Important areas:

- `port/forge/src/forge_3d_mode.c`
- `port/forge/src/forge_ai.c`
- `port/forge/src/forge_network.c`
- `port/forge/src/forge_runtime_tags.c`
- `port/linux/game/firefight_spawner.c`
- `port/linux/game/bots.c`

Integrate supported capabilities for object spawning and manipulation, AI encounter placement, Firefight wave markers, tag extraction and map export.

Faber's `forge_ai_spawn_unit_live()` and other Forge functions are internal engine functions, not a ready-made external API.

Investigate whether a clean interface could expose selected operations to Spark. Consider appropriate engine-side implementations for OpenH1 and Chupathingy where necessary.

Keep Forge AI actors, Firefight actors, multiplayer bots and Zombie gameplay entities separate.

Faber Forge uses its own network-session protocol. Do not imply its sessions can automatically interoperate with Chupathingy or OpenH1.

---

## 5. MEGAWORLD — ALL 19 ORIGINAL MULTIPLAYER MAPS

The full MegaWorld goal remains **19 classic Halo CE multiplayer maps in one physically connected, deliberately designed world**.

The 13 original Xbox maps plus six Halo PC additions must remain identifiable and usable within the full Atlas.

### Correct the current mistake

Timberland and Sidewinder are not supposed to sit miles apart connected by an enormous tube.

Their adjoining terrain edges must be reconstructed and blended into one continuous landscape.

Timberland's forest should transition into rocky foothills and Sidewinder's snow-covered mountains.

Create an actual outdoor Warthog road, with a separate smaller infantry cave integrated into the landscape.

Implement editable terrain boundaries, matching materials, collision, lighting, visibility, fog and audio.

The complete 19-map Atlas must support arranging, rotating and planning the regions before every individual connection is compiled.

Indoor maps require appropriate architectural connections rather than arbitrary outdoor tunnels.

### VR MegaWorld authoring

VR Forge should eventually allow creators to fly over the full MegaWorld layout, grab and reposition region plans, inspect seams, sculpt supported connection geometry, add world objects and preview sightlines.

Use the same source ownership and native geometry paths as desktop Spark.

A VR preview is not proof that all 19 maps can be loaded simultaneously or played without transitions.

Investigate actual native engine memory, BSP, visibility and resource constraints. If simultaneous region management is needed, prototype the engine-side work separately and prove players, vehicles, AI, physics and projectiles remain correct.

First acceptance remains genuine Timberland ↔ Sidewinder traversal in both directions, followed by Warthog travel and cross-region shooting.

Then expand systematically until all 19 regions are playable, rather than making nineteen unfinished connections at once.

---

## 6. MACHINIMA, GAME MODES AND COMPLETE CREATOR EXPERIENCE

VR Forge and standard Spark must share the established authoring systems.

Include:

- Machinima camera flight, keyframes, cinematic paths, scene staging and takes.
- Greenscreen capture where BSP and environmental rendering turn green but weapons, vehicles and bipeds retain normal rendering, with correct depth.
- Lighting, atmosphere and fog editing.
- Scenario scripts and interactive events.
- Multiplayer gametype markers and objectives.
- Firefight and survival encounter authoring.
- The original Zombie Apocalypse gameplay mechanisms.
- Extraction-style objectives and round systems.
- Asset import, native tag editing and dependency management.
- Online co-editing and runtime session collaboration.

Keep visual/editor capture effects separate from gameplay simulation and native asset data.

Do not let polish work replace native acceptance.

The earlier File/Tools/Maps top-bar correction remains pending and should be completed without interrupting the current verified build path.

---

## 7. EXECUTION RULES — MAKE ACTUAL ENGINEERING PROGRESS

Codex must start by inspecting the **current dirty local master**, not an older public GitHub checkpoint.

Preserve the active dual-route changes, material correction, greenscreen work, accepted native outputs, originals, C49 release, all 475 requirement IDs and all historical directives.

No reset, new worktree, nested repository, forced cleanup, unauthorized installation, game modification, push or release publication.

Reuse `AGENTS.md`, `ENGINEERING_CONTRACT.md`, `ACTIVE_TASK.md` and the existing feature ledger.

**Do not build another project-management system.**

Work through bounded, measurable milestones:

### A — First real VR Forge vertical slice

Implement and test this exact journey:

1. Launch an exact, supported OpenH1 VR build in a headset.
2. Enter Spark VR Forge mode.
3. Fly to a location using headset/controllers.
4. Select a validated native asset from an in-headset palette.
5. Spawn it at a controller-pointed location.
6. Grab it, reposition it, rotate and snap it.
7. Open its tag inspector and make one supported live property edit.
8. Undo/Redo, Save and leave the session.
9. Reopen the project and verify the changes remain.
10. Build or reconcile the supported native output, independently validate it, and return to gameplay with the edited object present.

This is the **first mandatory VR editor acceptance**. A mocked VR pose, a desktop-only object placement or a static render does not pass.

If no headset is available, finish safe code and automated tests, record the missing hardware acceptance and continue independent work. Do not invent a headset result.

### B — VR authoring depth

Extend the proven vertical slice to object groups, supported tag classes, AI, gameplay markers, lighting and native build/reload operations.

### C — Desktop ↔ VR collaboration

Synchronize the same real authored object between Spark desktop and OpenH1 VR. Verify revisions, authoritative ownership, conflicts, disconnect/reconnect and persistence.

### D — Chupathingy runtime editing

Prove a separate native creator round trip in a real Chupathingy process. Keep its adapter and protocol validation independent from OpenH1.

### E — Faber functionality

Validate its Forge and AI-spawner behavior; integrate selected operations through reviewed, version-specific interfaces or separately implemented engine features.

### F — Correct 19-map MegaWorld

Complete the full 19-map authoring layout, natural terrain seams and one genuinely playable joined region before expanding the native connection count. Build onward to all 19 with real game acceptance.

### G — Complete all remaining workflows

Finish Machinima, Firefight, Zombie Apocalypse, Extraction, multiplayer collaboration, other editions, packaging and cross-platform milestones, preserving the existing evidence ladder.

At each milestone, fix defects before adding unrelated features. Run focused regressions first, then relevant native and full suites. Record changes, actual user actions, source hashes, native results, gameplay acceptance and remaining blockers.

**Do not spend hours repeating unchanged failures or updating reports without advancing implementation.**

---

## FINAL ACCEPTANCE STANDARD

Guilty Spark is not finished merely because it has a beautiful editor, compiles maps or launches a game.

A completed VR authoring workflow means a real person can **wear a headset, fly through Halo, select and place an asset, modify supported tags, save, return later, and play with the modification intact**.

A completed runtime integration means Spark and the engine exchange real, validated changes—not only runtime paths or diagnostic labels.

A completed MegaWorld means every intended region is physically traversable with correctly synchronized native geometry and gameplay, across the complete 19-map layout.

**Our goal: OpenH1 becomes the immersive VR creator environment. Chupathingy becomes the preferred standard play-and-mod runtime. Faber's strongest creator systems are integrated where technically and legally feasible. Spark unifies the entire experience.**

No fake acceptance, no unnecessary rewrites, no lost work.

**One Halo. Every World. Every Tool. Together.**