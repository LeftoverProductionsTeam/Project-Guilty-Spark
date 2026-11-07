# PROJECT GUILTY SPARK — MEGAWORLD GEOMETRY & RANDOM TELEPORTER WEB

**Continue the existing 19-map MegaWorld, Chupathingy and OpenH1 VR directive. This is an implementation correction, not a new project.**

The latest hex-cluster Atlas is a good start, but **a saved layout is not a connected world**. We need Codex to move from positioning maps to building and testing actual playable connections.

## 1. All 19 maps, edge to edge

Use a two-ring hexagonal cluster as the initial planning layout: **3–4–5–4–3 regions**.

All 19 original multiplayer maps must be included, preserving their recognizable terrain, landmarks, gameplay objects and native assets.

Arrange neighboring map boundaries so they can be joined into natural terrain. The hexagonal structure represents adjacency, not artificial hex-shaped level geometry.

**Implement the actual BSP joining workflow:**

- Inspect source terrain boundaries, heights, materials and playable space.
- Reconstruct editable edge geometry where necessary.
- Blend adjoining terrain into continuous outdoor landscapes or appropriate indoor connections.
- Create intersecting routes: vehicle roads, infantry caves, mountain passes and Forerunner structures.
- Provide elevated sniper positions with real cross-region sightlines.
- Connect neighboring regions in multiple directions, not only through one entrance.
- Rebuild and validate native collision, sealed world geometry, portals, lightmaps, visibility and materials.
- Preserve the original 19 maps and all previous successful outputs.

**Do not solve this by constructing enormous tunnels between distant maps.**

Timberland and Sidewinder remain the first physical seam test. Their wooded and snowy terrain should become one cohesive landscape.

## 2. Randomized 19-map teleporter web

Add a second traversal network independent of the physical terrain connections.

Each region should support configurable teleporter entrances and validated destinations across the other regions.

Implement:

- Random destinations selected from an explicitly authored destination pool.
- Configurable weights, exclusions and destination rules.
- Safe arrival flags checked for floor support, clearance and gameplay eligibility.
- Protection against immediately triggering another teleporter.
- Optional return routes and discoverable teleporter connections.
- Host-authoritative destination selection and synchronization to clients.
- Preserved vehicle/passenger behavior where supported and validated.
- Editable teleporter markers and route visualization in Spark.
- Persistent configuration, Undo/Redo, Save and native rebuild.

Investigate stock Halo `netgame_flag` types `6` and `7`, the existing teleport channels, HaloScript `object_teleport`, and supported random functions.

Stock paired teleporters are not automatically a randomized network. Implement additional logic where required without breaking conventional teleporters.

For multiplayer, the host must choose the destination and all clients must observe the same result. Do not let each client independently choose a random region.

If a destination belongs to an unloaded BSP, it must not be selected until the runtime can safely load and synchronize that region. Do not describe a loading transition as seamless traversal.

## 3. Chupathingy and OpenH1 VR

Keep **Chupathingy as the primary desktop/gameplay runtime** and **OpenH1 VR as our immersive creation runtime**.

Both need compatible MegaWorld content through verified native interfaces.

In OpenH1 VR, creators should eventually be able to fly over the 19-map Atlas, inspect and shape supported seams, place cave entrances and teleporters, configure destinations, drop assets and modify supported tags from the headset.

Reuse Spark's existing BSP Workshop, Asset Library, native editing and project history. VR and desktop must edit the same authoritative project.

Do not claim in-headset support before real headset acceptance.

Faber Forge and AI spawning remain integration objectives, without treating their internal engine functions as a ready-made shared API.

## 4. Actual acceptance — no more layout-only milestones

After preserving the current work and finishing the running native Atlas test:

**First prove one natural physical seam.**

Build Timberland and Sidewinder side by side, with no artificial giant tunnel as the main route. Independently compile/read back the result and verify a player crossing in both directions, a Warthog traveling the primary road, and a cross-region sniper hit.

**Then prove one randomized teleport.**

Using the actual game, activate a teleporter, verify the host selects a valid destination, and confirm a connected client arrives at that same destination without loops or invalid placement.

**Then expand both systems.**

Apply the proven geometry connection workflow across the 19-map adjacency graph, and the teleporter network across all eligible regions. Track each native connection and teleport separately with game/peer evidence.

The final Atlas must show physical edges, passage types, actual compiled status, teleport links, unverified connections and native/runtime limits.

## 5. Execution discipline

Use the current local master and existing source owners. Preserve the committed prototype, green-screen work, runtime settings, 475 requirements, original assets, ISO, C49 release, Undo history and all active changes.

Do not reset, start another worktree, duplicate editors, silently change game installations or push upstream.

Make focused source changes, run relevant tests, then verify real native outcomes. Do not spend the entire session on documentation, repeatedly rerun unchanged failures, or confuse a screenshot with gameplay acceptance.

**The goal is one physically connected 19-map Halo world, with multiple natural routes, mountains, caves and sniper positions, plus an interconnected random teleporter network—all editable through Spark and eventually in OpenH1 VR.**

**Finish the underlying engineering. Prove the result in Halo.**