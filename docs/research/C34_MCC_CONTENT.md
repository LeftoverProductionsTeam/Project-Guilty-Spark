# C34: owned MCC content prerequisite probe

Research date: **2026-10-28**. Evidence below distinguishes repository declarations, inspected local files, executable launch, content conversion and network compatibility. No upstream engine implementation is copied into Spark by this change.

## Implemented behavior

`mcc_content_probe::probe_installation(selected_root, target)` produces a serializable, read-only report for `MccHalo1`, `SparkInspection`, `ChupathingyCe`, `OpenCe` or `ExperimentalRemix`. It inspects known executable paths and the selected `halo1/maps`, `halo1/prebuild`, `halo1/sound` and `halo1/shaders` trees. It does not search parent directories or other installed games.

Each report separates these operations:

| Operation | What the probe establishes | What it does not establish |
| --- | --- | --- |
| Run MCC | Expected executable/module files and Windows executable signatures | Exact executable profile, actual launch, anti-cheat/session state or a successful game |
| Read MCC assets | v13 header/index bounds, scenario kind, tag classes/external flags and shared-resource header bounds | Full dependency closure, decoding every tag/pack/bank, renderer/audio parity or extraction correctness |
| Build another target | Supplies and missing/unverified prerequisites for the selected target | A universal converter, a foreign runtime boot or a compatible compiler/source tree |
| Join another protocol | Explicitly separate content and network requirements | MCC-to-community/PC/CE/console protocol translation or multiplayer acceptance |

The inventory contains relative paths, file sizes, inspected tag class counts and a **header-only** SHA-256 for recognized MCC maps. That digest is not a full-file identity, ownership authentication or a peer-content fingerprint. Changed size/modification metadata during a read invalidates that file's evidence; modifications preserving both are not detected by this cheap inventory. Execution must use the existing separately validated runtime/tool profile rather than this report.

The bounds are 4,096 directory entries, 512 files, 128 map indexes, four nested levels per inspected tree and 64 MiB total reads. Enumeration and allocation are bounded before collecting file lists. Links/junctions are rejected; inaccessible, linked, malformed or budget-excluded content is not accepted as valid evidence. Incomplete traversal returns `complete: false` and keeps absent prerequisites unverified. Invalid candidates are also unverified rather than reported missing. `complete` means the bounded enumeration completed, not that all assets are valid.

`supplied` describes the explicitly documented inspection level. Pack/bank filenames remain `unverified` payloads. `missing` is scoped to the selected installation and completed inventory. `convertible` is reserved for a subsequently verified conversion profile; this probe does not assign it to v13-to-foreign-runtime conversion. `unsupported` describes an unavailable adapter/format route, not a permanent rejection of that target's roadmap.

## Pinned upstream prerequisites

| Project | Revision inspected | Content prerequisite and scope |
| --- | --- | --- |
| [Chupathingy README](https://github.com/ChupathingyCE/chupathingyce/blob/c5a07c69589ab8d40180fc99eac993bc06b06ebb/README.md) | `c5a07c69589ab8d40180fc99eac993bc06b06ebb` | Its documented base import is an owned Xbox ISO/XISO; the base `maps` must include compatible Xbox UI data. PC and CE imports occupy separate folders. CE maps require matching CE bitmap, sound and localization resource files. No MCC-only boot route is established. |
| [OpenCE README](https://github.com/OpenCommunityEdition/OpenCE/blob/f2597b704d59e66257dba7629f22a0f78f5f3d09/README.md) | `f2597b704d59e66257dba7629f22a0f78f5f3d09` | Requires the user's Xbox ISO/XISO for the base map set. PC maps placed in that base folder are rejected; custom maps are separate. This does not establish an MCC-data bootstrap. |
| [Experimental Remix MCC documentation](https://github.com/moistman42069/HaloCE-DecompRemix-VR-PC-Android/blob/f9ef816e9a15d94070b4c8f62a616436f8eb8349/docs/mcc_maps.md) | `f9ef816e9a15d94070b4c8f62a616436f8eb8349` | Contains an independent experimental v13 loader and MCC-specific resource selection. Its leading port-specific notice limits MCC support to solo play; later inherited GulchCE networking sections do not establish support in this port. The documented base Xbox startup remains separate. |

The experimental resource route keeps MCC singleplayer bitmap resources distinct from MCC multiplayer bitmap/sound resources. Package overrides are authoritative; exact dependency matches must be unambiguous and complete. It explicitly rejects `loc.map` and CE resource substitution. The probe inventories the matching installed MCC paths without extracting, copying or claiming to have resolved every reference. This is an upstream implementation lead, not an integrated or certified Spark loader. The [pinned README](https://github.com/moistman42069/HaloCE-DecompRemix-VR-PC-Android/blob/f9ef816e9a15d94070b4c8f62a616436f8eb8349/README.md) still labels MCC maps experimental.

Chupathingy's repository declares GPL-3.0-or-later; OpenCE and Remix declare AGPL-3.0. Remix attributes its MCC lead to GulchCE/chestahh under CC0. These repository notices do not independently establish provenance or rights for every inherited engine file or any proprietary game content. Review actual source history, notices, applicable obligations and distributable boundaries before integrating code. Spark only records factual prerequisites and links here. Ownership, asset format, source provenance and game protocol are separate questions.

## Native read-only evidence

An explicitly selected local owned MCC installation was inventoried on Windows. The full report stays private at `.local/continuation34/mcc-content-inventory.json`; no owned maps, extracted data, personal installation paths or proprietary test fixtures are added to the repository.

The complete bounded inventory visited **212 entries**, listed **203 files**, and read **2,667,446 bytes**. It inspected **30 valid v13 map indexes**, including the startup UI and Blood Gulch, plus **four valid shared-resource headers**. Model, animation, sound, localization, shader, font/global and UI-widget classes are reported by index rather than inferred from map names. The file inventory includes **31 texture indexes**, **three texture packs**, **14 FSB banks** and **33 shader files**; payload matching/decoding remains unverified. Anniversary metadata is inventoried separately and is not counted as sound banks.

This passes local filesystem/index acceptance only. It neither launches MCC nor boots Chupathingy/OpenCE/Remix, and establishes no campaign, rendering, audio, multiplayer or cross-protocol acceptance.

## Next loader slice

The first missing MCC-only community-runtime slice is **base startup from owned MCC UI/globals/fonts/localization without an Xbox map set**. Inventorying a playable level cannot satisfy this. Establish a minimal explicit startup dependency graph, exact resource identities, ABI/semantic translation and a native startup test before advertising it. Subsequent slices are external bitmap/audio resolution, model/animation/shader normalization, complete scenario/collision/script behavior and native game comparisons. Authoritative multiplayer/protocol work remains a separate target adapter with matching peer-content evidence.

## Regression checks

Synthetic fixtures cover v13 tag class inventory, bounds/corruption rejection, startup UI identity, invalid-versus-missing candidates, read-only source preservation, generation separation, experimental loader versus network status, explicit installation selection, report path privacy and incomplete file limits. The native test is ignored by default and runs only when an owner supplies `SPARK_MCC_CONTENT_ROOT`; optional `SPARK_MCC_CONTENT_REPORT` selects a private output path. Unix link-rejection coverage is conditional on that platform.

Separately, the supplied Windows CI log identified `mcc_steam` registration tests failing at `manifest_contains` after a successful registration. The exact condition was reproduced locally by passing a canonical Windows root (`\\?\D:\...`): registration removed the verbatim prefix when writing, while lookup retained it. Shared path-spelling normalization now treats ordinary and verbatim drive/UNC paths equivalently; UNC normalization retains its leading share separators. Existing UTF-8/UTF-16 preservation/backup and lock tests remain intact. A native canonical-root registration/readback/idempotence regression and bidirectional drive/UNC comparison tests pass. This is a reproduced cause matching the supplied failure; no unseen CI run or exact upstream job SHA is inferred.
