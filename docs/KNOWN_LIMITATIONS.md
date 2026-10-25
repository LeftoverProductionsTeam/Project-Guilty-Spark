# Known limitations

Updated 2026-10-25 for Phase 2. The desktop workbench runs, but the full Halo Modern Evolved vision and Zombie Apocalypse end-to-end acceptance are **not complete**. File inspection, application tests, documented runtime capabilities and observed gameplay are separate evidence categories.

## Zombie Apocalypse restoration

- All supplied variants are restoration candidates. No supplied gameplay variant has been successfully rebuilt, packaged and played in MCC. The strongest extraction candidate has a Demo version-6 cache layout; its README identifies the bundle as the Win32 Beta. Cache version alone does not establish Mac provenance.
- The faithful Demo build remains blocked by two missing custom event sounds, `scorpion` and `hill_occupied`. Their declared external ranges are outside the supplied `sounds.map`. Matching names, byte lengths or another complete stream do not establish interchangeable audio. Related PC/MD variants also require matching resources.
- A labelled recovery experiment omitted only the two confirmed event-sound dependencies and extracted all **2,823 retained tags**. Diagnostic compile attempts then exposed scenery placement 0's invalid name index `5984` and palette index `10704`. Its intended original object is unknown. Diagnostic changes affect derived files only and are not the default build workflow.
- Compilation subsequently stopped on mixed-class scenery palette entries, including the used `Hiding Marine` biped. The source also implements zombie spawning through item collections and weapon triggers referencing vehicle containers with built-in actors. These are authored mechanics. A target-engine adaptation needs deliberate reauthoring and gameplay tests; deleting the marine or spawner chains would not restore the mod.
- No output MCC map was produced by the experiment. Missing audio, damaged placement recovery, mixed-class placements and weapon-to-vehicle spawners remain distinct blockers. Changing the scenario type or cache-version number does not solve them.
- Three complete UI Vorbis streams decoded successfully in native WebView QA. This does not repair the missing gameplay event sounds, emulate the original menu or establish target-game playback. An additional declared UI stream fails Ogg validation and remains unavailable.

See [audio and spawner evidence](ZOMBIE_AUDIO_AND_SPAWN_EVIDENCE.md) for hashes, dependencies, deviations and compile results. The [restoration record](RESTORATION_REPORT.md) contains the earlier candidate inventory and faithful-path extraction attempts.

## Conversion, packages and runtime integration

- Invader is the implemented build backend. Halo editing tools are detected when present, but an adapter for their `tool.exe` build workflow is not implemented. Complete extraction and target-specific validation are required for each map.
- Extraction of installed MCC `a10.map` reported 1,471 missing-resource errors with Invader 0.55.0 despite exit status zero. The adapter treats these errors as fatal. Existing unedited MCC cache validation preserves source bytes; it is not legacy conversion or an in-game load test.
- MCC packaging requires an existing official Excession metadata template for the exact scenario. No suitable template is installed for this restoration. Current checks are not a full official-schema validator; required shared metadata/images, version compatibility, package enumeration and an actual generated-map load remain unverified. No successful restoration package is claimed.
- Steam opening uses the official launch workflow. The user selects the intended anti-cheat mode manually. A launch request does not prove the selected mode, package loading or gameplay.
- ChupathingyCE, OpenCE, Halo PC and Halo Custom Edition have explicit registration, executable-header/hash inspection, map/resource inventory and a generic application-launch action. Runtime kind and manually entered build/network versions remain user declarations. Registration does not install an engine, deploy a mod, choose a map or prove the binary's product identity. No native game installation or gameplay acceptance was established by this work.
- Native launch supplies no guessed direct-map arguments. Automatic native identity/version detection, native mod deployment, direct-map launch and server browsing remain absent. Header/hash inspection does not prove complete tags/resources or playability. Version 7 alone cannot distinguish PC retail, Mac retail or HaloMD provenance.
- Mac Retail, Mac Demo, PC Trial, HaloMD and Xbox profiles describe preservation scope; they do not provide executable adapters. Platform combinations have separate support/test states. Documented upstream support is not a local test result.

See [runtime compatibility](RUNTIME_COMPATIBILITY.md) for the full evidence model and launch boundaries.

## Editors and comparison

- BSP previews show actual **collision geometry**, per-BSP selection and wireframe. Textured render BSP, shader rendering and complete object models are not decoded. Collision preview is not an in-game visual preview.
- Only audited object, weapon and projectile fields and known references are editable. Actor-variant, item-collection, unit and legacy spawner dependencies are inspectable; full actor-definition editing is absent. Unknown source data is preserved. Cached projectile velocities are displayed in cache units per tick.
- Existing source placement position/rotation edits are supported. Duplication, deletion and scale persist in editor scenes but block Halo builds because source reflexive insertion/removal is not implemented. Halo player spawns support yaw only.
- Encounter/squad metadata and compiled script signatures are read-only. There is no wave authoring, encounter simulation, trigger editor, script-body comparison, script-source decompiler/compiler UI or visual scripting engine. Zero indexed encounters/scripts does not mean zero AI.
- The Asset Workshop imports and previews OBJ geometry, including standard vertices, faces/negative indices, fan triangulation, UV-presence indexing and material names. Concave polygons need prior triangulation. UV coordinate editing, MTL/textures, collision generation, glTF, animation editing and asset-to-Halo compilation are absent.
- The sound inspector offers bounded embedded Ogg/Vorbis permutations for supported unextended Demo/PC/Mac/MD/CE layouts. It validates source identity, ranges and container structure before preview; the webview still must decode/play the audio. External, unsupported or invalid samples remain unavailable. This is not a full audio importer, menu renderer or menu-behavior emulator.
- Compare matches normalized class/path identities and compares decoded fields/references, placement slots, encounter/script metadata, resource requirements and collision geometry. Duplicate identities remain unknown. Insertions/reordering can disrupt slot-based placement matching. Full tag/asset payloads, script bodies and UI behavior are not proven equal by matching names. Saved overlays are optional; unsaved changes require saving and refreshing.
- Canonical library deduplication uses exact bytes/checksums. It does not create semantic version groups, infer release lineage or merge related variants. Compare does not automatically choose restoration patches.
- `.gsproject` descriptors reference preserved sources/assets and cannot recover missing content alone. Undo/redo keeps 100 in-memory snapshots; its full stack does not survive restart. Geometry thumbnails are cached projections, not an archive-image gallery or screenshot manager.

## Live editing, multiplayer and VR

- Live Lab reports disconnected because no runtime bridge or transport is attached. Live mutation, runtime spawning, AI dispatch, telemetry acknowledgements and hot reload are unavailable. The fallback is save, rebuild, validate and explicitly test the runtime.
- Friends preflight compares allowlisted manifests locally. Imported build/resource/anti-cheat declarations are self-reported. **Manifests agree** means compared fields align; `gameplayVerified` remains `false`. No network traffic, hosting, joining or AI synchronization is tested.
- No two-computer MCC or native session was tested. MCC campaign co-op, arbitrary custom-multiplayer AI, native multiplayer and native campaign co-op are separate cases. Upstream native replication does not establish behavior for this map; the supplied mod README explicitly disclaims AI synchronization.
- No game process-memory editing, connected MCC multiplayer-AI extension, VR rendering, OpenXR integration or VR multiplayer interaction is implemented. See [MCC multiplayer AI feasibility](MCC_MULTIPLAYER_AI_FEASIBILITY.md) and the **unexecuted** [two-computer test plan](MULTIPLAYER_TEST_PLAN.md).

## Intake, stability and verification scope

- ZIP intake supports bounded classic ZIP, not ZIP64, encrypted/multidisk archives or recursive nested extraction. Limits include 1 GiB archives, 768 MiB selected members, 2 GiB total selected content and 4,096 entries. Unsafe/colliding paths, links, overlapping structures and CRC failures are rejected. Original archives/receipts are retained; executable/DLL/script members are inventoried but never extracted or run.
- Cache reads are bounded to 768 MiB and tag data to 128 MiB; geometry/reflexive/allocation limits apply. Audio previews are capped at 16 MiB per permutation with further count/structure limits. Larger or unsupported formats need dedicated adapters.
- A local application Inbox works independently of MCC. Creating an additional owned MCC Inbox is explicit. Stable-file polling can still inspect a copy paused for several seconds before completion; failures are retried after changes or manual import.
- Source/resource identity and ownership checks do not replace an OS sandbox for external tools. Child-process-tree termination is not implemented.
- Atomic files and SQLite WAL are not one cross-resource transaction; an interrupted file/index update may require descriptor reimport. Backup retention is unbounded.
- **21 frontend unit tests and 8 browser tests pass.** Three browser cases cover browser boundaries/accessibility; five use synthetic IPC. These verify UI behavior, not native execution, real audio playback or game acceptance. Consult [TESTING.md](TESTING.md) for separately recorded native checks and their tested scope.
- macOS/Linux CI workflows were supplied but not executed here. Windows binaries are unsigned. No production telemetry or remote service is integrated into the workbench.
