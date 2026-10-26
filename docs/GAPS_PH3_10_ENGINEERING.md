# Remaining functionality vs. phases 3-10 and the latest requirements

This is a **development gap list**, not a claim of a verbatim, lossless original-spec merge. Full copies of the Phase 3-10 prompts are not present in the source-only ZIP; reconcile their complete texts before declaring the requirement matrix exhaustive.

| Priority | Requirement | Existing source state or current patch | Still needed / acceptance |
| --- | --- | --- | --- |
| P0 | Real Blood Gulch | Collision preview existed; this patch adds experimental untextured render triangles and supported static objects | Real `bloodgulch.map` validation; material/shader/bitmap resolution; lightmaps; sky; all scenery; screenshot comparison with the game |
| P0 | True scenery instead of diamonds | Fallback for static single-node `gbxmodel` added | Verify Gearbox vertex/index offsets on real map, resolve animated/multi-node vehicle, tree and character geometry, report unresolved models individually |
| P0 | Original edit-build-play | Phase 3 JMS/QuickForge code exists | HCEEK discovery, real BSP/scenario compilation, safe output registration, game launch and validated changes |
| P1 | Editable existing BSP | NOT implemented by a renderer | Recover editable source topology from BSP, vertex/edge/face transformations, terrain sculpt, brush edits, non-destructive source project, collision/portals/lightmaps recompilation |
| P1 | Cave systems | NOT implemented | Branching tunnel/room authoring, entrances, linked indoor/outdoor portals, sealed geometry, PVS, collision and pathfinding, in-game validation |
| P1 | Draw-distance improvements | NOT implemented | Separate editor camera far plane from runtime draw-distance; investigate target-specific extensions and limits, fog, clusters/PVS and performance, never claim universal support |
| P1 | Classic Eschaton/HMT/Assembly tags | Basic typed fields, references and class filtering exist | More complete schemas, reflexives/enums/bitfields, comparisons, tag relationship navigation, tag-world selection synchronization |
| P1 | Full local Tool Manager | Existing paths; this patch adds user-approved Invader offline cache | Version/provenance/license management, approved installed-tool discovery, optional cache for other legitimately copyable tools, hash/integrity checks, rollback, offline reuse |
| P1 | Drag and drop map import | Already implemented in `App.tsx` | Full visual asset loading, resource resolution and progress; avoid rewriting the working import |
| P2 | Campaign/Cinematics/Firefight | Partial editor and local wave preview | Real scripts, AI firing positions, timeline, original BSP, in-engine First Contact mission and cinematic verification |
| P2 | High-poly asset workshop | OBJ import exists | glTF/FBX, meshoptimizer, collision, UV/material/texture conversion, Halo tags and game compile |
| P2 | Zombie Apocalypse | 0.2.0 restoration blocked | Missing sound/data integrity, intact spawner behavior, faithful vs derivative builds, runtime conversion and networked AI test |
| P2 | Mota-Lev integration | `SAMPLE CODE` not included in uploaded source-only ZIP | Source/license audit, original vs decompiled separation, safe interoperability with live Mota editor if permission granted |
| P2 | Project sharing and online | Metadata/adapters partly implemented | Versioned packages, second computer import, revisions, rollback, LAN/private online and two-real-client AI synchronization tests |
| P2 | Halo CE UI/sound/theme workshop | Basic interface exists | Local user-supplied bitmap/sound decoders, 4 styles, fully custom layout/sound mapping, persist profiles, legal cache sharing |
| P2 | Mac G4 legacy bridge | Capability planning only | Mac Demo export, validation on actual hardware, safe backup/install, optional simple local-browser transfer UI |
| P2 | Academy/knowledge archives | Partial docs | Interactive Rocket Pistol and original arena tutorial, attributed c20/historical tools, actual editor interactions |
| P2 | Private alpha/release quality | Source v0.3.0, incomplete actual builds | Windows tested installer, permissioned dependencies, manual acceptance inventory, Mac/Linux where possible, security/performance/QA |

## Technical distinction for BSP and caves

A compiled `sbsp` is **not an editable level-source file**. Moving a BSP mesh vertex in the preview is not the same as producing a valid replacement Halo BSP. The editor must reconstruct or import editable source geometry and recompile collision, render geometry, portals, visibility, pathfinding-related data and lightmaps as applicable. Treat a direct visual transform as an editor experiment until toolchain and game results verify it.

## Technical distinction for render distance

Increasing Three.js camera `far` distance only changes Guilty Spark's viewport. It does **not** bypass Halo CE engine draw limits, cluster visibility, fog, streaming or runtime restrictions. Track per-runtime support and tests. Separate historical client extensions from cache/tag data changes.

## Recommended immediate next development sequence

**M1:** Validate and correct the actual render/model decoder against the owner's local Blood Gulch; implement shaders, bitmaps and lightmaps; restore real trees and rocks. **M2:** World selection + tag panel synchronization and persistent transforms. **M3:** HCEEK/Invader game build. Then proceed to BSP source reconstruction/terrain/caves, followed by advanced creation, sharing, authenticity and legacy support according to the full requirements matrix.
