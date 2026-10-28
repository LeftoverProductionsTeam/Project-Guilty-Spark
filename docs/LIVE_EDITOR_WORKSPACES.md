# Level Editor, live MCC visuals and map workspaces

This extends C33 without replacing existing projects or restoration sources. The original C33 release and verification record remain separate.

## Editing

**Level editor** uses one adaptive viewer. **Auto**, **Source** and **Running Halo** choose the context; imported maps and QuickForge geometry share its controls. Running Halo connects to a loaded supported MCC Halo 1 session launched with anti-cheat disabled. Each map retains its tool, tag selection, inspector state, camera and independent build targets when switching workspaces. The newer acceptance record is in [Reclamation and workflow polish](RECLAMATION_AND_WORKFLOW_POLISH.md); the artifact counts below describe the frozen workspace release.

**Preserve and open the running map** obtains the installed cache and pins its resources. Binding checks source SHA, scenario, tag-data checksum, tag count and actual live object tag paths. The tag checksum differs from the cache-header CRC. A same-name variant is insufficient.

Hold RMB + WASD/R/F to fly; Shift boosts. Select real existing objects to move or uniformly resize them. Frame scene focuses the selected object. The existing-instance palette moves an instance onto a picked map surface; it does not clone it. Held/mounted children are excluded. Ctrl+Z/Y/Shift+Z use acknowledged operations; undo requested during a pending write waits for the receipt. History survives editor-tab switches and defaults to 100, with a user setting.

Shared item/vehicle sizes retain scope confirmation and physics guards. Arbitrary creation/deletion, rotation, live BSP replacement/cutting, game camera hooks and network peer replication remain unavailable. QuickForge tunnels/extensions need validated collision compilation and reload. A source preview does not certify an in-game tunnel.

## Map appearance

World, Live and Machinima share MCC v13 BSP vertex decoding, real models, classic shader metadata and authored sky, sun, ambient and atmospheric fog. Verified material pixels come from the owner's MCC packs; actual baked lightmap pages remain internal cache reads. Render geometry is the default when available.

The independent reader checks zlib chunk tables and imeta entries in `common.ipak`, `inplace1.ipak` and `inplace2.ipak`. It pins hashes, requires a unique canonical texture key, rejects source-key collisions, and requires identical map/global pack records before reading pixels. It bounds dimensions, encoding, spans, headers and decompressed lengths. Changed resources are refused. No game content is redistributed.

Limits remain explicit: 256 MiB resident textures, 64 MiB decoded per operation and 16 MiB native top mips per batch. Missing/unsupported formats appear in diagnostics. Animation, reflections, particles, spatial audio events and every engine effect are not claimed to match gameplay.

Owned Blood Gulch evidence: 2,425 tags; checksum 1767224648; 5,503 render triangles; 79 material regions; 5,762 lightmap UV pairs; 68 model identities; 183 sky triangles; 25 successful BSP texture/lightmap requests including all 15 baked pages. Sun, ambient and fog values come from its sky tag.

Final native loading reached 128 shader textures, 60 detail layers and all 15 lightmaps. The unused Gravity Rifle prototype bitmap has no exact map-imeta entry and remains explicitly unavailable. No placeholder texture is substituted.

## Maps, windows and assets

Each document tab keeps its own project, inspection, meshes, dirty state, undo and redo. Late asset loads/save acknowledgements route by project identity. Closing a tab saves first; failure keeps it open. Window close saves all its documents.

The external-window icon saves and hands a document to another frameless window. A per-process edit lease prevents simultaneous edits of that project by two windows. Closing a child preserves other windows and their live connection; the last normal close restores temporary shared sizes. This is not a cross-process file-lock protocol.

**Transfer assets** selects another preserved source, including a map open in another window. Halo placements transfer into QuickForge with source project, SHA, tag class/path/identity retained. Actual models and dependencies load from that source. Compiled-cache tag merging still requires recursive extraction, staging and rebuilding. Registered OBJ copies are hash-verified and reparsed, receive fresh identities, and create independent placements. Undo removes the placement; the verified asset remains available.

## Machinima and themes

**Machinima** shares project shots with Creator Studio. It offers camera-key capture/duplicate/reorder/delete, smooth/linear/cut transitions, seek/play/pause/stop/loop/speed, position/target/FOV/roll, path/frustums, thirds/safe/center guides, aspect presets, depth of field, take JSON and shot-list CSV. QuickForge retains its independent real Spartan source rehearsal and collision.

PNG and silent WebM export the actual editor canvas without surrounding UI. Video is bounded to 120 seconds, 1920 × 1080 and 128 MiB. Guides are excluded; hide path gizmos for clean free-camera capture. These are source captures, not live MCC camera/animation control.

**Interface Studio → Dark Glow** adds two editable glow colors and intensity. Text stays white against dark surfaces. Preferences persist with transparency, tint and custom window controls.

## Research credits

Original decoder code was informed by public format facts without copying or bundling third-party implementations:

- [SnowyMouse's Halo map structure](https://gist.github.com/SnowyMouse/39168bddd597549038a35d78aee39513).
- [Gravemind2401's Reclaimer](https://github.com/Gravemind2401/Reclaimer), including texture container/chunk layout research.
- [Zatarita's Saber editing toolkit](https://github.com/Zatarita/SeT), including ipak/imeta research.

Local research copies, SDK/game content and decoded pixels are excluded from source packaging. The workspace extension verification fixture records the new tests; the earlier C33 test card describes its frozen release.

## Validation and artifacts

The [extension test record](fixtures/workspaces-extension-verification.json) records 196 Rust, 75 frontend, 59 offline and 12 browser checks, plus 11 native acceptance checks on the running MCC Blood Gulch session. The native run verified 3D dragging, resize/undo restoration, free flight, textured lighting, camera/DOF, actual PNG/WebM downloads, two open documents, a real transferred pistol with undo/redo and child-window handoff/closure. The 67 restoration originals remain unchanged and read-only.

New local artifacts use distinct filenames so the earlier C33 release stays intact:

- `releases/GuiltySpark-C33-0.4.0-workspaces.exe`
- `releases/Project Guilty Spark_0.4.0_workspaces_x64-setup.exe`
- `releases/Project_Guilty_Spark_Continuation_33_Live_Workspaces_SOURCE.zip`

Hashes are recorded beside the artifacts. Native evidence: [Live MCC](screenshots/workspaces/native-mcc-live-textured.png), [Machinima](screenshots/workspaces/native-machinima.png), [map transfer](screenshots/workspaces/native-map-asset-transfer.png).
