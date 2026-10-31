# Edit where you are; publish through a verified route

Open an owned map in **Map library**. Use **Tag editor** for the class/tag tree or **Level editor** for the 3D map. Both views edit the same project and keep the original map separate. Switching tools keeps your draft, undo history and camera.

## A small compiled-map edit

1. Open an MCC Halo 1 map. In Tag editor, expand a class, select a tag and change an exposed supported field. For example, select `weapons/pistol/pistol` in Weapon and change Bounding radius.
2. Expand **Save a map copy** below the fields. The same control is in the object-tag drawer and Build & playtest.
3. Leave **Save method → Automatic**, choose the intended output runtime and select **Review save plan**. This saves the project draft, then shows its native intentions, available methods, tools, validation and recovery.
4. If **Direct map copy** is available, choose **Save validated map copy**. Spark writes a new owned output, fixes its MCC checksum using the reviewed Invader utility, checks every byte outside the planned cells, runs independent cache checks and reopens the output. It does not extract tags or run a compiler.
5. Choose **Open edited copy in a new tab**. The original tab retains its draft. The copy has its own source identity and project. A validated output still needs a matching-game load test before gameplay is accepted.

The first direct writer is deliberately specific: Windows, unextended/uncompressed MCC Halo 1 cache 13; internal object Bounding radius/Acceleration scale, weapon Ready time/Autoaim range, and supported existing scenery, vehicle, player-start and netgame-item transforms. Player starts and netgame items support yaw only. Imported-cache per-instance scale, reference replacement, new arrays/models, arbitrary BSP changes and other cache editions are not direct operations.

## Native source edits

Use **Complete native tag editing**, **Baboon**, or **Invader · native checks & reviewed edits** for compatible owned working tags. Dependencies & setup explains the matching kit and editable base tags. Accepted native edits become independent complete source revisions; they are not overwritten by cache regeneration.

The save plan can choose **Build working tags** for an accepted native revision, or **Extract & rebuild** for a compatible imported MCC cache with supported source edits and complete tools. The existing H1A Tool, dependency, integrity, source-identity and compilation checks remain authoritative. A pending cache edit is not silently omitted from a working-tag build. Manual method selection cannot bypass a blocker.

An external file with a valid payload CRC can still be semantically invalid. Spark keeps the stable-save, bounded content-audit, parser and reconciliation checks. Reports distinguish actual writer evidence from a known tool launch association. A valid serializer normalization is not automatically labeled corruption. [Native integrity and recovery](CONTINUATION_40_ENGINEERING.md), [tool behavior findings](COMPATIBLE_TOOLS.md).

## Visual map edits

Select an object in the map or Objects drawer. Drag the rendered transform gizmo, or enter coordinates in Transform. Object tags opens in a drawer without replacing the viewport. Tag changes and dependency navigation use the same project as the full Tag editor.

For supported existing persistent placements in MCC 13, the save plan can publish a direct copy. Adding objects, swapping models, importing custom meshes, editing BSP topology or applying preview atmosphere is a different operation. Source/compiler guards refuse unsupported publication. QuickForge source geometry and verified BSP assembly keep their existing build workflows, collision/portal checks and source preservation.

## Assets and audio

The existing Asset library can place source-linked previews from open maps, import custom OBJ and WAV/OGG, and retain source provenance. Native QuickForge tag placements use the matching source compiler. Arbitrary imported-cache/custom-model compilation and actual game acceptance are not established by seeing a preview. Full rendering, animation, acoustic and event parity remain separate goals.

## Temporary edits in a running MCC session

Use **QuickForge session → Live Halo adapter** in the official anti-cheat-disabled test environment. The installed executable/module must match the existing reviewed profile; build and load the matching scenario first. Bind a selected placement to an actual existing game object. Apply changed positions manually, or explicitly enable continuous bound updates.

Each update now uses a typed Smart Edit live plan. It binds the saved project, process/session, map identity, datum/tag identity, before position and desired position. It expires after ten seconds and rechecks the existing adapter's stationary/detached-object and readback gates. No direct-map save silently writes game memory.

Before/after positions and observed outcomes are appended to `live-edit-journal/<project-id>.jsonl` under Spark's data directory. The journal has a 32 MiB limit and refuses new attempts before it fills. A prepared entry with no observed outcome is unconfirmed. A final journal error is reported alongside the actual returned memory receipts. Move objects back or reload the original map to restore positions; disconnect does not restore them. Save/publish the authoring map separately for persistence. Spawning, live BSP replacement and game-peer replication are not granted by this route.

## Missing tools and unavailable routes

Direct copies need the separately installed reviewed Invader 0.55.0 CRC/info executables, not a loose-tag project or SDK. Select that Invader directory in **Settings → Dependencies & setup**. Other binary versions remain unavailable until reviewed. Tool downloads, where offered by the existing setup flow, retain their own explicit selection and verification.

Source routes also need the matching legal editing kit and complete editable tags. For MCC: Steam → Library → include Tools → **Halo: CE Mod Tools - MCC**. Configure it in Dependencies & setup; keep stock/SDK inputs preserved. A CE target is not an MCC cache writer, and a runtime name does not establish conversion support.

The route report tells you what is missing and which existing workflow applies. It never substitutes a placeholder model, strips an unknown field or labels a source export as a playable map. [Exact operation matrix](COMPATIBILITY_MATRIX.md).
