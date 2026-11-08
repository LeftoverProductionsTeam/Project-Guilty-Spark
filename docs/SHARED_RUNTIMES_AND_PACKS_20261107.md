# Shared runtimes, presentation packs and workspace walkthrough

This continuation preserves local master205b4e7 and the unfinished natural Timberland–Sidewinder source work. Current implementation is under final native verification; no full game, VR, multiplayer or19-map traversal acceptance follows from setup.

## One content library, multiple engines

Games & tools → **Get runtimes · one shared Halo library**:

1. Choose OpenCE, Chupathingy, Faber or OpenH1 and an existing compatible connected content library. A new empty shared library is also available; its owned Xbox maps must be supplied before playing.
2. **Download selected engine** fetches the fixed publisher release through Spark's existing bounded HTTPS downloader.
3. Review the package size and publisher SHA-256 result, then **Install & connect engine**.
4. The normal runtime selector chooses the engine for the next launch. It does not replace or terminate a running match.

Maps and resource banks are referenced in one place. Each engine retains matching binaries/support files below the managed Runtimes/engines directory, with the existing private save/log/cache controls. Stock Custom Edition and MCC retain their native layouts and legitimate installation routes. User-supplied installations are never overwritten or removed. Spark does not download Halo maps, ISOs or resource banks.

The installed-package receipt records every extracted file's hash. Repeated installation reuses only files matching that exact receipt, never overwriting a changed engine. Faber ships two identical32,739,328-byte executables: Spark verifies that identity and keeps halo.exe once. All bundled notices are retained; the catalog links each publisher/source repository. Spark downloads separate applications; no engine code was imported into Spark.

Pinned Windows packages and checked digests: [catalog fixture](fixtures/managed-runtime-packages-20261107.json). The fixture separates inspected archives from native installation and game/headset proof. Current OpenH1 build1845 is a Windows desktop package; the published VR package remains Linux-specific.

## Per-profile presentation packs

Games & tools → **Visual & audio packs** uses actual local mod.toml manifests and the engine's native load_order.toml format. Choices are saved per engine profile; only a deliberate launch applies that profile's disabled list. Shared-root engines can have different choices. Native priority, comments, dependencies and unknown settings remain intact; external changes require review.

**Get / install packs** accepts a publisher's direct HTTPS ZIP or a locally downloaded ZIP. Spark reviews one native data pack, bounds extraction, validates paths/CRC/content identity, preserves publisher notices, refuses executables/gameplay tags and never replaces an existing pack folder. Abandoned completed downloads can be discarded; failed extraction rolls back only owned staging. A downloaded ZIP is removed after successful checked extraction, without deleting the publisher's local source ZIP.

Uncompressed Textures, Tasteful Enhancements and Uncompressed Audio are suggested categories, not invented installed packs. Their original links arrived as “unknown”; no verified author URL or actual pack was available. The generic install workflow does not claim to acquire those three automatically. Payload appearance/audio is checked by the target engine and still requires genuine content acceptance. These controls are verified only against reviewed OpenCE/Faber/OpenH1 pack loaders; Chupathingy, stock CE and MCC are not assigned an invented compatible implementation.

## Optional walkthrough

Settings & tools → **Interface Studio → Appearance → Guided workspace walkthrough**.

This opt-in preference opens the existing Help drawer, explains the current workspace and provides Previous/Next navigation through setup, maps, assets, geometry, native output, online/collaboration and creative workspaces. Buttons use the existing workspace navigator and normal keyboard activation. **Turn off walkthrough** persists the opt-out; the same setting restarts it. It does not perform edits, launch tools or certify unfinished gameplay.

## OpenH1 integration boundary

The owner supplied OpenH1-Windows and OpenH1-Linux-VR in the protected Runtimes folder. The Windows executable and assets are separate from the Linux ELF/OpenXR package; native Linux VR cannot run as a Windows executable. The maintainer's message offers future Windows support and reports Linux testing, not an accepted Windows VR build.

Source research refreshed to OpenH1 [8dab273211544f1b4752a3793c7129d505ed6ae5](https://github.com/OpenH1/OpenH1/tree/8dab273211544f1b4752a3793c7129d505ed6ae5). Internal tracking, grab, editor-camera functions and presentation-only mods_reload do not constitute a published external Forge API. source/editor/editor_stubs.c leaves game_in_editor false and editor updates/rendering unimplemented at that pin. A versioned, opt-in maintainer-side source-editing boundary is still needed; Spark must retain authoritative project/history/native builds. No guessed socket, remote console, memory patch, new renderer or Windows engine port was implemented.

The corrected full [VR integration directive](Master%20Engineering%20Prompts/GS_2026-11-07_OpenH1_VR_Editor_Integration.md) remains open. Blood Gulch immersive flight, Warthog placement, source save/build and actual headset playtest require distinct proof. Existing CE-to-MCC native vehicle authoring is not OpenH1 VR acceptance.

## Megaworld and remaining gates

The latest [owner steering](Master%20Engineering%20Prompts/GS_2026-11-07_Shared_Runtimes_Walkthrough_Driveable_Megaworld.md) requires Warthog travel through all19 source regions, mountain routes, natural tunnels/caves and compatible doors. The Atlas is planning and the terrain ribbon is source geometry; neither establishes physical traversal. The next native gate remains the first Timberland–Sidewinder seam's shader staging/compilation, then game collision/vehicle/human return traversal. Verified physical region connections remains0.

Geometry reduction must retain recognizable source detail, UV/material density, native collision, portal visibility and budgets, with losses reviewed explicitly. No global decimation, separate-map loading marketed as seamless streaming or whole-feature acceptance is claimed.

## Verification

Pending final native run. Full Rust on current functional code:843 passed,9 ignored,56 suite results; frontend445 passed. Four focused UI workflows pass. A mechanical property-order mismatch in the old guidance contract was corrected without weakening its assertions. Exact native/browser/source identities and final outcomes will be recorded in the compact receipt after verification.

