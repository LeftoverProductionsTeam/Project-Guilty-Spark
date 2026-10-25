# Known limitations

The desktop workbench runs. The full Halo Modern Evolved vision and Zombie Apocalypse end-to-end acceptance are **not complete**.

## Conversion and integration

- The owner supplied multiple original restoration candidates. All were inspected, and all distinct gameplay variants were attempted with Invader. No variant has yet been converted and played in MCC. The closest candidate is Demo cache 6: two referenced sound records have out-of-bounds sample data. Other variants have 196 or 237 extraction errors with the supplied resources. See [exact findings](RESTORATION_REPORT.md).
- Real extraction of the installed MCC `a10.map` produced 1,471 missing-resource errors with Invader 0.55.0, despite exit status zero. Guilty Spark now treats those errors as fatal and stops before compilation. Stock remastered sounds/bitmaps are not reconstructed from the cache alone.
- Existing unedited MCC cache validation works and preserves bytes; it does not count as legacy conversion or an in-game load test.
- Excession metadata must already exist for the exact scenario. Packaging does not generate an invented map schema. Full schema validation, required shared metadata/image completeness, version compatibility, and actual MCC enumeration remain pending.
- The official Halo editing tools are detected when present, but an executable adapter for their `tool.exe` build workflow is not implemented. The Invader adapter is the implemented build backend.
- Steam launch is implemented using the ordinary app workflow. Specific launch-option selection, anti-cheat state and map loading are not forced or verified.
- External ChupathingyCE/OpenCE launch is implemented; map copying, runtime discovery/version probing, server browsing and network compatibility are not integrated.

## Editors

- BSP previews show actual collision geometry, with per-BSP selection and wireframe by default. Render geometry, textures, shader previews and complete object models are not decoded.
- Only an audited set of object/weapon/projectile fields and known references are editable. Unknown data remains in the source and is handled by installed extractors. Cached projectile velocities are shown in cache units per tick.
- Existing Halo position/rotation edits are supported. Duplication, deletion and scale persist in the editor but block Halo cache builds because adding/removing reflexive elements is not implemented. Halo player spawns support yaw only.
- AI/squad and compiled script metadata are read-only. No encounter simulation, wave editor, trigger editing, script source decompiler/compiler UI or visual scripting engine is implemented.
- OBJ parsing supports standard vertices, faces/negative indices, fan triangulation, UV-presence indexing and material names. Concave polygons must be triangulated in a DCC tool. UV coordinates, external MTL/textures, collision generation, glTF, sound and animation decoding are not implemented.
- `.gsproject` files reference separately preserved source/assets. Reopening a descriptor checks and re-ingests available references; it cannot restore missing files from the descriptor alone.
- Undo/redo uses 100 in-memory snapshots; edit descriptions persist, but the complete undo stack does not survive restart.
- Geometry thumbnails are locally cached projections of real mesh data; there is no screenshot-attachment manager or archived-image gallery.

## Stability and platform scope

- Cache reads are bounded to 768 MiB; tag data to 128 MiB; geometry, reflexive and allocation limits apply. Maps above those limits require a streaming/extended adapter.
- Folder watching uses native events plus stable-file polling. It rejects invalid files and will retry only after size/time changes or an explicit manual import. A copy paused for several seconds can be inspected before completion and temporarily fail.
- Sources, project/config files and generated package paths are checked for integrity/ownership. Long-running tool execution is isolated by directories and time limits rather than an OS sandbox. Child-process tree termination is not implemented.
- The library uses atomic file writes and SQLite WAL, but the file save and database-summary update are not one cross-resource transaction. A crash at that boundary may require reimporting a descriptor to refresh the index. Project backup retention is not yet bounded.
- macOS/Linux CI workflows are supplied but were not executed here. Windows binaries are unsigned. No production telemetry or remote services are integrated.
- No live game edits, process-memory writes, multiplayer AI replication, VR rendering, OpenXR device integration or VR multiplayer interactions are implemented.

Source files and ownership-checked output are favored over silently modifying stock files or pretending unavailable runtime features work.
