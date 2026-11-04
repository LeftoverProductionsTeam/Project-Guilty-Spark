# Reproduce Spark's demos

Open **Menu → Learning center → Guides**. Search for a demo or choose a category. Each entry has its requirements, numbered actions, a button to open the appropriate workspace, and a separate supported-scope section. Eight guide choices appear per page; search, category and your place are remembered. **Features & workflows** uses the same catalog.

The catalog currently contains **63 workflows**. It is maintained in `src/featureCatalog.ts`, rather than a separate help-only list. Opening a guide never inserts example geometry, changes your source, launches Halo, or marks a test passed. A source-only operation directs you to create/open an editable source map when the current map is compiled-only.

## Make your own named rooms and hallway

1. **Map library → Create a map → Custom blank → Level editor → BSP Workshop**. Choose **Start with one room**, or inspect **Two rooms + corridor + ramp** in a separate source project. Loading that example replaces its source geometry as one Undo step.
2. Select **Room**, set **New volume height / depth**, and drag its footprint in Top view. Use **Corridor** to draw playable passage space overlapping both rooms. A **Ramp** is solid geometry inside that playable space.
3. Click the volume under **Named volumes**, change **Volume name**, and press Enter. Those are the same saved names used for the demo's rooms and corridor. They organize structural source; compilation joins them into a BSP, rather than spawning independently movable “room objects” in Halo.
4. **Face**, **Edge** and **Vertex** select source components from the closest surface. Their centered world axes move the selected vertices. **Extrude face** adds source extension. Invalid convexity or topology is refused by the existing native validator.
5. **Join source faces** connects two different playable-space volumes with matching, opposed rectangular faces. Choose the target volume/face and create a corridor. It overlaps both mouths and uses the existing native boolean/source pipeline. Different profiles require a narrower Corridor drawn into both rooms; this is not general imported-terrain welding.
6. New shapes use **World-sized texture tiling**. Their UVs follow world distance as the source scales or extends. Existing documents retain their previous local UV behavior until explicitly changed. Assign real compatible Halo shader paths; UV tiling does not invent missing native materials.
7. Use **Diagnostics**, set **Halo material paths & player starts**, save, and open the existing **Build settings → Build & check playtest** route. Native tools rebuild collision and structural data. Inspect the compiled output, then test movement in the matching Halo runtime.

The Workshop's compact **Build the demos · step by step** section exposes these actions and buttons for the existing asset drawer and build settings. Rename, drawing, a source-face move and corridor creation each retain one-action Undo/Redo and immediate Save.

## Demo entrypoints

| Demo family | Search in Guides | User-facing route |
| --- | --- | --- |
| Four-view source rooms, hallway, ramp, faces and UVs | Rooms, corridors & named BSP volumes | Level editor → BSP Workshop |
| Stock machine door and two-sided trigger | Door & two-way trigger demo | Objects & gameplay → Asset library → Doors & devices; Inspector → Properties → Logic / Events |
| Pair of owned maps and tunnel | Connect two owned maps with a tunnel | Level editor → Construction → Connect another map's BSP |
| Original region inventory and planning | Megaworld Atlas & region planning | BSP Workshop → Megaworld Atlas |
| Native tag handoff, stable-save checks and rebuilding | Baboon / Invader edit-and-reconcile demo | Tag editor → Complete native tag editing; Build working tag edits |
| Dragging scenery and its dependencies | Drag models with native dependencies | Asset library → owned source → drag preview onto compatible source map |
| Native source collaboration and external tools | SparkLink native source collaboration | SparkLink; matching complete local source; explicit creator roles |
| Sound audition and editor ambience | Sound events and spatial mixing | Map sounds / Asset library; editor controls remain separate from native properties |
| Native compiled loop attachment | Native map sound emitters | Editable MCC QuickForge → Map sounds → Include original loop in map |
| Scene cameras and independent recording window | Detached Recording Director | Level editor → Recording Director; Recording output drawer |
| Native encounter, combat and Firefight research | Native actor & multiplayer AI lab | AI & scenario; matching companion Sapien; Firefight rules → native source → native build |
| Historical carrier/seated-zombie mechanism | Original Zombie Apocalypse recovery | Compare variants; Tag editor references; isolated native conversion/build |
| Runtime setup, local hosts and compatible game joining | Online category | Choose runtime, then Host / Join; SparkLink is editor collaboration |
| Map copies, tag edits, exports and conversion | Tags & assets / Build & playtest categories | Existing Smart Edit, native source and conversion routes, with edition-specific limits |
| Retained Home and local character assets | Animated native Halo showcase | HOME → Home model / Showcase animation |

Every other catalog capability, including transforms, copying, animations, custom assets, UI editing, snapshots, server handoffs and learning tools, is searchable in the same picker. A guide links to existing controls; it does not create a competing workspace or editor.

## Engineering coverage and acceptance

`docs/fixtures/demo-workflow-coverage.json` maps all **95 currently inventoried native QA examples and desktop acceptance scripts** to a catalog workflow or an explicit diagnostic/research boundary. A regression enumerates the actual files and refuses an unmapped addition. These are development artifacts; users do not need a developer command to perform a supported app workflow.

The audit does not promote a private diagnostic into a shipped game feature. It deliberately retains these limits:

- Source room drawing, naming, source-component picking, corridor joining, history, Save/reopen and native compilation have their own UI acceptance. The C63 stock-door outbound/return human pass was in **H1A Standalone**, not retail MCC.
- Two-way Timberland–Sidewinder player traversal, a complete all-Halo open world, arbitrary imported-landscape sculpting and structural direct compiled-map editing remain unfinished.
- Native actor/peer observations and script-driven round tests are separate from human-cleared Firefight, complete AI replication, original Zombie Apocalypse carrier release and universal runtime support.
- Three local Spark processes do not prove two-computer LAN/VPN acceptance. SparkLink source synchronization is not Halo gameplay replication.
- Decoder or compiler success does not prove complete visual parity or audible native game playback.

Keep maps, game data, screenshots containing owned content and native build outputs in the local evidence/library, outside public release packages. Historical failures and accepted builds remain preserved.
