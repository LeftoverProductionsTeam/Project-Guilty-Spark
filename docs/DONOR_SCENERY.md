# Scenery in connected BSP maps

The BSP connection workflow can now retain the donor map's source scenery. This is an optional extension of the [connected-world build](RECLAMATION_AND_WORKFLOW_POLISH.md); existing projects keep their previous geometry-only behavior and build fingerprint until the option is enabled.

## Use it

1. Open the destination map in Level Editor and expand **Connect another map's BSP**.
2. Plan a connection to a preserved single-BSP donor and select matching editable donor tags.
3. Enable **Include donor source scenery**, apply the connection and check its source clearance. The report includes the scenery count.
4. Build with the MCC editing kit. Use **Open compiled map** to inspect the actual resulting models, then playtest the scenario.

Scenery follows the donor's translation and yaw. The build retains its permutation, difficulty exclusions and automatic-placement flag. Source object names are not bound into the destination scenario. Changing position or yaw clears the previous clearance result.

## Native build

Only actual `scen` placements with supported source GBX models are included. Dependencies are staged and hash checked in the isolated job, then namespaced before they enter the destination palette. Source maps and editable source tags remain unchanged.

Some supplied SDK scenery tags use generic `.model` references while the matching files are `.gbxmodel`. Spark corrects only the isolated copy, after matching the original cache's model path and GBX class. An unrelated model path is refused. The receipt records the original reference, derived reference and source/prepared hashes. Broken recursive dependencies report the actual tag path before file staging.

Native namespace renames use the same temporary short-workspace mechanism as Halo Tool. Every dependency must reach its expected namespaced destination and pass a copy hash check. A successful rename-tool exit that silently omitted a long collision or shader path is rejected before lightmapping.

The compiled-cache acceptance checks the scenery count, each namespaced scenery and model identity, position, yaw/pitch/roll, permutation and placement flags. Angle setters use native radians; readback compares the actual cache values. A missing or changed result fails the build and identifies the differing field. Native collision, portals, lightmaps and tunnel clearance retain their existing checks.

## Acceptance and limits

Measured results are recorded in [the donor-scenery verification fixture](fixtures/donor-scenery-verification.json). The test uses a separate derived Timberland + Sidewinder project; the previous geometry-only map, project and releases remain preserved.

The two-map case passed native compilation and SDK loading with 42 retained donor placements, 210 total scenery placements and all ten donor model types resolved. The subsequent [three-map/performance pass](THREE_MAP_WORLD_AND_PERFORMANCE.md) extends that compiled world with Blood Gulch.

This supports single-BSP donor scenery, with a 512-placement import budget. Multi-BSP section assignment, player-appearance scenery flags, donor actors, weapons, vehicles, objectives, scripts and named-object bindings remain separate work. The source dependency set must match the owned map.

Tunnel clearance samples BSP collision. They do not establish that a scenery object cannot obstruct a doorway; inspect the compiled view and walk both entrances in game. SDK loading, manual traversal and retail MCC acceptance are recorded independently.
