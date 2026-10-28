# Rotated four-map challenge and connection workflow

This pass extends the preserved [three-map world](THREE_MAP_WORLD_AND_PERFORMANCE.md) with Battle Creek. Timberland, Sidewinder, Blood Gulch and a 90-degree Battle Creek section compile into one derived MCC world. Earlier projects and releases remain preserved.

## Native result

The fourth connection has an approximately 88.6-world-unit tunnel and retains 30 Battle Creek scenery placements: 287 scenery placements in total. All seven new scenery model types resolve in the native editor. Six source-matched SDK model-class corrections occur only in isolated tag copies.

The source export has 25,116 input collision triangles and 49,622 output triangles. Native compilation regenerates collision, portals and lightmaps. The final cache's actual collision has 25,112 triangles. All three authored tunnel routes pass against that final cache, at 423, 440 and 356 sample points respectively. This checks earlier routes again after extending the world.

The initial automatic Battle Creek mouth and several alternate orientations failed clearance. The accepted case moves the mouth onto an authored floor before rotating the section. Spark rejects blocked paths; the planner does not automatically solve every entrance.

Native desktop checks and SDK tagset loading are recorded in [the verification fixture](fixtures/four-map-challenge-verification.json). A manual walkthrough of all three tunnels and retail MCC cache loading remain untested. Route sampling does not test scenery collision, biped physics, game modes or multiplayer. The editor's material/lightmap preview is not proof of complete engine rendering parity.

## Connection controls

1. Select a donor and section, then **Plan connected tunnel**. The draft names the map it actually connects and shows its tunnel length and bend count.
2. Choose matching editable tags and adjust the route. **Rotate around tunnel entrance** keeps the mouth fixed while changing yaw; ordinary section movement still moves the mouth.
3. **Apply connection**, then **Check tunnel clearance**. Failures identify the segment and world coordinates. Moving a point or changing the section clears obsolete results and errors.
4. **Build & playtest connection**, inspect **Open compiled map**, then test the route in Halo.

Selecting a different donor preserves the current draft until another plan completes. Checking/building that draft requires its matching selection. **Return to current draft** restores its donor and section. **Reset draft to applied connection** restores the last applied connection without changing other project edits.

Delayed planning and clearance responses cannot resurrect a discarded draft, overwrite newer edits or surface an obsolete failure after leaving the workspace. Older saved connection identities are normalized without losing unapplied drafts. Rotation-pivot choice remains part of each map's editor context.

Donor gameplay objects, starts, objectives, scripts and named bindings remain separate from scenery. Full environment/audio transplantation, universal shader fidelity and runtime BSP replacement remain open work.

## Recheck multiple compiled routes

The owner-run native example accepts 1–16 connection projects whose routes use the final world's coordinates:

~~~powershell
node scripts/cargo.mjs run -p spark-core --locked --example qa_bsp_assembly -- --verify-cache "compiled.map" "first-connection.gsproject" "second-connection.gsproject"
~~~

It reads true BSP collision from a hash-matched cache snapshot and stops at the first failing route. A successful result records the cache hash, project-file hashes and sample counts. It does not infer coordinate transforms for unrelated projects or certify gameplay.

## Verification

239 Rust tests, 91 frontend tests, 59 offline scripts and 21 browser tests passed. The Windows executable and NSIS installer built successfully. All 67 restoration originals remain unchanged and read-only. Owned map/tag assets and local challenge data stay outside source releases.
