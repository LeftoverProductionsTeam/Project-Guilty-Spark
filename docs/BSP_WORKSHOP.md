# Native BSP Workshop

This continuation extends committed C39 (`2155ae1`) in the existing isolated local `master` worktree. It adds source brush construction to the Level Editor. It does not replace QuickForge, native tag editing, the BSP combiner, external editors, or the preserved direct compiled-map prototype.

The source/editor and MCC native compilation milestones are verified. **The required player walkthrough is pending. The complete playable-editor milestone is not accepted yet.**

| Phase | Current evidence |
| --- | --- |
| A: editor/source | Implemented and native-UI tested within the documented convex-brush scope |
| B: operations/validation | Initial room/corridor/solid, extrusion, axis clipping and per-face UV/material scope tested; advanced operations remain open |
| C: native builds | MCC/H1A structure and cache verified; independent clusters/portals/texture readback passed; CE cache blocked |
| D: player validation | Launched in Standalone; walkthrough deferred by the user; no gameplay pass |
| E: existing maps | Preserved as separate unfinished interoperability work |

Implementation files: `crates/spark-core/src/bsp_workshop.rs` owns source validation, booleans and provenance; `quickforge.rs` and `forge_build.rs` extend the existing exporter/compiler and verified playtest path. `src/bspWorkshop.ts`, `components/BspWorkshop.tsx` and `bspWorkshop.css` implement source operations and views. `useWorkshopTextures.ts` uses the existing verified bitmap bridge. `QuickForge.tsx`, `ForgeViewport.tsx`, `sourcePreflight.ts`, `forge.ts`, `App.tsx` and `projectMutation.ts` integrate the editor, WRL, types, preflight and history lease. Tests live in `src/bspWorkshop.test.ts`, `crates/spark-core/tests/bsp_workshop.rs`, the two `qa_bsp_workshop*` examples and `scripts/test-bsp-workshop-native.mjs`.

## Use it

1. Open a QuickForge source project in Level Editor and choose **BSP Workshop**.
2. Convert an existing room/box/ramp source, or choose **Two rooms + corridor + ramp**. Starting the example replaces that document's geometry as one Undo step while retaining authored placements, starts, objectives and game mode. Save another project copy to retain both layouts.
3. Use the four linked views. Room draws playable air; Solid draws geometry that removes air. Overlap a corridor into adjoining rooms to remove the internal walls. Middle-drag pans an orthographic view; wheel zooms. Drag the dividers, or maximize one view and restore the layout.
4. Select a volume and use Move, Rotate, Scale, precise fields, or supported vertex/edge/face drags. Choose a source face for extrusion, material assignment and UV controls. Clip keeps one side of a local axis plane and creates a closing cap.
5. In **Halo material paths & player starts**, assign real shader and sky tags from your matching editing kit. An imported map can supply an exact matching shader/bitmap preview. The preview does not replace the editable shader dependencies required by Halo Tool.
6. Review **Diagnostics**. Disconnected rooms and unsafe starts can be saved while laying out the level, but block native export. Invalid topology/boolean operations refuse the edit. Undo returns to the previous source.
7. Save, then use the existing **Export JMS sources** or **Build & check playtest** controls below the Workshop. Configure the matching kit, source tags and Invader through existing project settings. Every build stages a new owned job and retains logs, source/tool hashes, original source, previous builds and compiler WRL files.

The doorway portal control authors exact quads for the example's openings at X=8 and X=20. Both compile into real portals; the editor does not invent PVS from zone boxes. General portal drawing, arbitrary material symbols and richer surface metadata remain work to do.

## Source and geometry

The optional `quickForge.workshop` version-1 section lives inside the existing project document. Existing documents omit the field and retain their serialized shape. Derived meshes are regenerated; they are not substituted for editable source or sold as a new Halo format.

Each convex brush retains stable brush/face IDs, vertex topology, role, position, rotation, scale, face materials and UV tiling/offset/rotation. Source volumes are unioned; solid volumes are subtracted using the existing Manifold dependency. The generated boundary faces point into the playable region. Native JMS 8200 export retains exact source-face/material associations and interpolated UVs through booleans. The existing exporter performs the 100× Halo source-unit conversion.

Source bounds, positive scale, finite values, convexity, face planarity/winding, manifold edges, material identity, UV bounds, degenerate/short edges, duplicate portals and portal seals are checked. Output receives the existing independent mesh audit. Limits are 64 source brushes, 128 vertices/faces per brush, 32 portals, 64 materials and 32,000 output triangles. Disconnected volumes block export. Geometric diagnostics select the relevant source brush; Tool WRL overlays remain tied to their source revision. Proximity suggestions do not become exact compiler-face attribution.

The renderer batches generated triangles by material and retains triangle-to-source-face picking. Gizmos use the brush centre and matching Z-up transforms. Perspective camera state, orthographic pan/zoom, splits, tool/selection and maximization persist locally per project. The existing anti-aliasing and resolution-scale controls apply. Only exact source-map shaders and verified bounded bitmap batches supply texture previews; missing images remain material colours.

## Transactions and preservation

Every accepted operation enters the existing project history as one edit. A local project lease prevents keyboard/toolbar Undo from racing a geometry gesture or asynchronous validation, including commits triggered by blurring a numeric field. Changed source cancels a stale result. Closing the workspace releases the lease and prevents a late commit. Build/export preflight waits for the geometry operation and current preview/report.

Manual saves, existing autosave/snapshot mechanisms and isolated compiler jobs retain the project and earlier artifacts. A failed export does not overwrite the previous-good JMS. Save/reopen and invalid-operation recovery were tested. Workshop-specific hard power-loss/crash acceptance has not been performed.

Native admitted source is not converted by the Workshop controls. Workshop mutations in a connected shared session are disabled in the interface; Workshop synchronization is not a new C39 acceptance claim. C38 Baboon/Invader reconciliation, native integrity gates, typed shared transactions and compiler preparation stay in place. No raw binary patch transport or remote tool execution was added.

## Exact acceptance

[Machine-readable evidence](fixtures/bsp-workshop-native.json) records the tested executable, source, JMS and cache hashes.

- Real Windows Spark/WebView process, fresh private library, actual native IPC and GPU: four views, maximize/restore, drawing a source volume, transform Undo/Redo, clipping, corrupt topology refusal and save/reopen passed. No mesh/IPC mocks supplied the native acceptance.
- The same GUI test assigned legal SDK material/sky paths, authored two portals and ran the production build from the interface. H1A Tool structure, scenario configuration, radiosity, cache compilation and native format/CRC checks passed. The build took **14.275 seconds** on this machine; this is a small warm local build, not a general performance promise.
- That GUI-built cache was imported as a separate source and its exact shader bitmap was decoded and rendered back in the Workshop. This proves the tested texture route, not full shader/lighting parity.
- A separate CLI build of the same layout passed. Its JMS hash matches the GUI build. Independent Invader readback of **both** generated BSP tags reported **three clusters and two cluster portals**.
- Standalone initially exposed the native filename-length assertion. The verified-playtest helper now keeps the existing temporary short content alias alive for the whole game process. Standalone remained responding and logged the scenario’s netgame validation. No rendered game frame or player movement was verified. The user deferred the player walkthrough; traversal/material acceptance remains unverified; retail MCC cache loading is also untested.
- Custom Edition's separately extracted owned cache produced the structure but **failed** the final Invader cache build: `ActorVariant::grenade_type is out of range (28786 >= 4)` in `vehicles/warthog/warthog gunner.actor_variant`. The extracted input and staged tag have the same SHA-256. The Workshop did not change that dependency. No guessed value, removed dependency or disabled compiler check was used to turn the failure into a pass. A valid CE source tagset/reviewed recovery is still needed.

Regression results: **531 Rust tests passed, seven existing opt-in tests ignored; 234 frontend tests passed in 49 files; 59 offline scripts passed; TypeScript and the Windows release build passed.** All 88 browser interaction/IPC-contract regressions also passed. Native tests remain distinct from browser IPC-contract tests and historical C39 three-process acceptance.

All **146** inventoried files in the separate unfinished root checkout were rehashed unchanged. C35–C40 history and the direct compiled-map research remain intact. No original game cache, SDK master tag tree or external tool was modified or bundled into public artifacts. Runtime diagnostic logs are separate from source tags.

## Still open

- Actual player movement through both doorways, floor support, ramp traversal and material inspection; then retail MCC cache acceptance and an independently validated Custom Edition build/playtest.
- General portal drawing, face deletion/merge, arbitrary clip planes, concave source editing, source material symbols and full surface metadata.
- Original JMS import and honest reconstructed/source-backed editing of existing BSPs; metadata/detail/environment reconciliation when recompilation remaps surfaces or clusters.
- General BSP-combiner interoperability and larger-scene performance acceptance. Workshop object placement and bounded native custom scenery now pass the [connected-source acceptance](WORKBENCH_INTEGRATION.md).
- Workshop shared editing admission, dedicated crash/power-loss testing, complete render/audio parity, live BSP replacement and game-peer replication.
- **Direct compiled-map editing remains a separate open workflow. Native loose-tag and Workshop builds do not complete it.**

The [integration follow-through](WORKBENCH_INTEGRATION.md) adds shared object/geometry views, native OBJ scenery, floor/history/recovery tests, new CE failure evidence and the current regression counts. Earlier results above remain historical evidence.

## Repeat the native checks

`node scripts/test-bsp-workshop-native.mjs <built Spark.exe> <fresh acceptance root> [H1A kit source-tags Invader]` uses a real private desktop process. The optional tool paths enable the full GUI build and compiled-texture readback.

`node scripts/cargo.mjs run -p spark-core --example qa_bsp_workshop --locked -- <H1A kit> <owned tags> <Invader> <fresh acceptance directory>` runs the production compiler. `--ce` selects the separate reviewed CE-source profile; it does not suppress incompatibilities.

On Windows, `qa_bsp_workshop_playtest <acceptance.json> <H1A kit>` verifies source/build identities and runs Standalone until the game is closed. A running helper should be copied outside the Cargo output before launching another compilation, because Windows locks its executable. A successful launch or exit does not record a walkthrough pass.

Technical references: [JMS](https://c20.reclaimers.net/general/source-data/jms/), [Halo materials](https://c20.reclaimers.net/h1/source-data/h1-materials/), [portals](https://c20.reclaimers.net/h1/guides/levels/portals-and-clusters/), [box-level workflow](https://c20.reclaimers.net/h1/guides/levels/box-level/), [Standalone boundaries](https://c20.reclaimers.net/h1/h1-ek/h1-standalone-build/), [Hammer++ inspiration](https://ficool2.github.io/HammerPlusPlus-Website/features.html).
