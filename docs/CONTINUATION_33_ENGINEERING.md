# Continuation 33 engineering record

C33 continues the existing C32 checkout on `codex/continuation-33-resources-and-community`, based on `ff14c9c`. Earlier requirements, source files, restoration variants and historical ledgers remain. It does not restart the project.

## What changed

- Exact source-bound bitmap resource lookup fixes Demo external-resource refusals and RGB565 lightmaps. Alpha/luminance DDS decoding, repeat sampling, mip filters, source material details, authored sky/fog metadata and player-start views improve classic-map rendering. Full engine parity and MCC ipak decoding remain incomplete.
- Independent game and kit detection includes the installed MCC CE SDK and explicit Steam Library → Tools installation guidance. Per-project CE and MCC targets retain their own tags/tool folders. MCC native tags now compile through H1A Tool; CE uses Invader gbx-custom with a reviewed CE tagset.
- Actual owned weapon/item world models replace diamond placeholders. Ninety authored netgame equipment entries are recovered in the supplied Zombie Apocalypse map. Spawn previews use a proved source Spartan biped/model dependency. Missing models remain unavailable.
- Shared and embedded map sounds support bounded Vorbis, PCM and Xbox ADPCM previews. The native custom player advances and produces nonzero decoded audio. A game event/spatial sound mixer is not implemented.
- Transform controls attach to the actual selected group rather than Drei's empty wrapper. Translation uses world axes; rotation uses the selected object's local basis. Stable memoized pivots and selection guards preserve a drag across preview updates.
- Ctrl+Z/Ctrl+Y/Ctrl+Shift+Z work with numeric editors, while text fields retain native text undo. Project history defaults to 100, configurable from 1 to 1000. Shared changes rebase across undo snapshots per property/axis.
- Transparent frameless Windows chrome uses themed curved controls, resizing, maximize/restore and the existing guarded close/save workflow. WebGL sprite labels remove the reproduced independent DOM-root cleanup race. MMB pan and RMB flight are retained.
- Whole-window transparency and color tint include chrome, viewport and dialogs, persist across reloads, and have a Ctrl+Alt+O visibility reset. First boot saves a preferred Halo, leads to tools, then opens how-to/glossary. Completed native onboarding is remembered even if WebView local storage is cleared.
- Periodic, manual, pre-build, pre-upgrade and pre-session snapshots preserve source-bound metadata with hashes, retention and restore checks.
- A bounded collision BVH reduces candidate work in the source walk sandbox. Real H1A Tool generated and verified collision/PVS for the original room. A separate contained-tunnel compiler probe generated 108 surfaces, 46 BSP nodes and 20 leaves. Arbitrary cave/room CSG remains blocked in the application.
- Real recursive assault-rifle extraction and compatible staged import processed 255 files / 7,829,983 bytes, with source preservation and readback hashes. A damaged melee dependency in the supplied custom pistol is refused even when Invader exits zero. Staging is not a binary map merge.
- An editor director rehearsal lets a source Spartan move with arrows/Q/E while RMB/WASD controls the camera independently. Bounded pose/camera JSON recording is marked as a source rehearsal, without game playback or animation claims.
- The [experimental MCC live adapter](LIVE_ADAPTER.md) implements checked Windows process reads, typed position writes and uniform scale for the reviewed MCC build. Vehicle sizing couples shared contact geometry, mass, inertia, antigravity lengths and suspension animation depths. The actual Blood Gulch session verified move/restore and the owner confirmed corrected 2× Warthog tire contact/driving. Private two-editor QuickForge source sessions have independent local game bindings; two-computer game replication remains unverified.
- Native weapon/equipment sizing updates the shared item tag and matching dropped models. This corrects the real engine's per-update overwrite of object-only scale writes. Shotgun and frag-grenade 0.5×/2× UI checks, Ctrl+Z/Ctrl+Y and authored-size restoration pass. Held/mounted and first-person size are separate unsupported paths. A 0.5× Warthog data pass was restored without claiming manual handling acceptance.

## Actual engine and restoration evidence

The supplied Demo map SHA-256 remains `b38f35508188872b2535888193de80f766d92d3b8d53a8ada7be4fc9808a996d`. All 67 original restoration files remain unchanged and read-only. No archived restoration executable was run.

The owner-installed HCEEK build is 2023.07.17.176677.1-QFE1. Its legal content was extracted into an ignored QA workspace, with all 14,294 archive entries checked for traversal/links. No SDK tags, maps, bitmaps or sounds are in the source release.

Real compilation exposed two errors that source tests missed: long absolute Tool roots hit its internal path buffer assertion, and Invader's classic input parser could not compile the SDK's native model dependencies. The production runner now uses relative roots inside its isolated job and the matching H1A Tool cache compiler for MCC. The original room's cache passed inspection, CRC, protection and stub checks. This establishes compiler output; it does not establish in-game physics or gameplay.

An H1A Standalone process loaded BloodGulch and recorded startup/map-load entries. It was not connected to Spark. Later, the owner launched retail MCC and authorized direct checks. Spark identified 2,425 tags and 142 live objects in Blood Gulch, moved/read back/restored an actual scenery object, and resized all 12 vehicles sharing Warthog physics. The first size trial revealed tire sinking. Coupling the four suspension animation channels corrected it; the owner confirmed correct tires and driving at 2×. Readback alone was not accepted as driving proof. Standalone camera/network limits and remaining runtime gaps are documented in the adapter guide.

## Validation and practical limits

Current automated results and native checks are in [the test card](CONTINUATION_33_TEST_CARD.md) and [machine-readable verification](fixtures/continuation33-verification.json). Actual source-sample audio playback, shader pixels, first-person view placement, custom window controls, label lifecycle, source weapon/Spartan rendering and detached actor/camera rehearsal have native evidence. Two editor processes and real TCP source exchange are tested independently of Halo networking.

Known limitations remain: incomplete shader/sky/indoor-cluster/PVS fidelity, MCC resource containers, arbitrary animated model/permutation support, game sound events/spatial mixing, general BSP extension CSG and AI navigation, full tag binary merge/cross-engine conversion, Firefight/Zombie runtime restoration, animated live machinima, CE/Chimera adapter, native Mac/Linux acceptance, and two-computer game replication. Do not advertise these as complete or error-free.

## Community and delivery

Root community, contributor, security, support, credits and licensing documents; issue forms; PR template; pinned CI; dependency notices; setup/build/architecture guides; screenshots and a versioned compatibility table were added. All earlier historical requirements remain in the cumulative ledger. Remote CI, GitHub repository settings, Discussions and social-image configuration are pending the founder's push. No remote push or PR was made. See [GitHub handoff](GITHUB_HANDOFF.md).
