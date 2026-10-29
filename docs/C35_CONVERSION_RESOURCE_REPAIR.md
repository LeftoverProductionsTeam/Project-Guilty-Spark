# C35 r3 — classic bitmap repair and Alpine conversion

Continue `9815868` on `codex/continuation-35-living-workbench`. This pass retains the existing workbench, drawers, Director, external-tool workflow and all previous source/release artifacts. It addresses Alpine's actual conversion blocker with a reusable exact-path dependency workflow.

## Workflow

1. Open an imported Custom Edition map in **Build & playtest**, with the installed MCC H1A kit, Invader and an editable SDK tagset selected. Without an original classic `bitmaps.map`, Spark checks every indexed bitmap's exact editable tag path before copying the SDK. It distinguishes missing files from invalid existing tags; an MCC texture pack is not accepted as classic tag data.
2. Select a folder containing the matching original `.bitmap` tags and choose **Save & review matching bitmap tags**. Review the exact paths and sizes. This saves the map's configuration and prepares a short-lived, window/map/configuration-bound review. It does not copy or modify source files.
3. Choose **Create separate repaired tagset**. Spark creates a new owned SDK copy, adds only the reviewed missing files, verifies source/output hashes, and writes an inventory and receipt. It never overwrites the selected SDK or classic source folders. Progress uses the existing job UI and cancellation. An incomplete copy remains a failed source job. A ready tagset is **not a playable map**.
4. Choose **Use repaired tagset for this map**, then **Save & refresh checks**. Only this map's active MCC build target changes, through its ordinary undo/history path. Other targets, scene objects, tag edits and source identity remain intact. Switching maps cannot adopt a late review for another map. Completed source-tagset receipts can be recovered after reopening Spark.
5. Some CE multiplayer maps also depend on a CE-specific startup UI collection. **Use MCC multiplayer UI dependencies** explicitly replaces that derived collection with the installed MCC SDK version during conversion. Custom entries underneath that collection are not retained; the conversion manifest records the original/replacement hashes. This option accepts CE multiplayer caches only. Historical hash-pinned Yoyorast/Bigass compatibility remains intact. Custom HUD/UI behavior still needs in-game testing.
6. Run **Convert map to MCC**. Only the native extraction/compiler/cache-validation pipeline can produce a validated build. Open that result in a separate map tab. Install/package and actual gameplay remain distinct checks.

The bitmap workflow is bounded to 128 missing files / 256 MiB, 64 MiB per bitmap, with existing SDK staging limits. It rejects wrong tag class/version/header, unsafe paths, duplicate paths, links, changes after review, stale configuration, nested output inside an original source folder and existing output directories. It does not prove that an arbitrary same-named bitmap is the author's intended image. Select the matching source; visual and gameplay checks remain necessary. Invalid existing SDK files require repairing or choosing that SDK separately.

## Actual source and native challenge

Alpine's original author cache is 62,644,912 bytes, SHA-256 `eb9b3693e74e674182d732f340127ef84d3574083821a8d3d95b234d9cb1c39e`, CE v609 with 2,676 tags. The selected MCC SDK supplies **427 of 430** indexed bitmap tags. Three exact files are missing:

| Relative editable tag                                             |  Bytes | SHA-256                                                            |
| ----------------------------------------------------------------- | -----: | ------------------------------------------------------------------ |
| `powerups/active camoflage/bitmaps/camoflage.bitmap`              | 87,664 | `3e4ca8ec89d3b468fbd7ecec53437c1974a4588ba27dc631038d2ceb4a433adc` |
| `powerups/over shield/bitmaps/overshield.bitmap`                  | 87,664 | `873e74d7922611911b2879ee466713cb8ed79737cd72da96bff0317dca75503f` |
| `scenery/c_field_generator/bitmaps/c_field_generator_dust.bitmap` |  3,028 | `862c5843d42313c7dcd1f40990cc9916df634f734b77b838bd94c93c5bf635ef` |

The [author's build guide](https://github.com/csauve/alpine#building-the-map) identifies its base/classic tagset dependencies. The test obtained the three exact regular files from the linked [classic tagset archive](https://www.dropbox.com/s/j6fb3ox6z1xmzzq/fresh_mp_sp_custom_edition_tagset.7z?dl=1). Archive identity: **367,632,376 bytes**, SHA-256 `bedd626c5fde43cc8713996d2f7d20bb125d3ef9f15f9e59395e2806d377f626`. Installed `tar.exe` read only those bounded members to stdout; no archived executable or script was run. The downloaded archive, three files, owned maps and SDK copies stay private and are excluded from source packaging. The author's map/source license is not applied to third-party stock tags.

The core challenge copied **11,544 SDK files / 1,822,259,786 bytes** into a fresh source-tagset folder and added the three files. Original SDK inputs and the classic files are retained. The repaired bitmap audit passes all 430 indexed paths.

This exposed a second genuine native compiler failure: a missing CE `var_kill_penalty.unicode_string_list` beneath `ui/ui_tags_loaded_multiplayer_scenario_type.tag_collection`. That failed job is retained. Enabling the explicit MCC multiplayer UI profile resolves that dependency through the existing native SDK-UI adapter. It does not silently strip custom effects to force a build.

The actual CLI conversion then passed H1A Tool and cache/tag/index/CRC validation. Its MCC v13 output SHA-256 is `3cb1fe9c6471d02694d34e7d62984532c1aafa076a14ce1a336aecc8eb9fed9a`. The earlier bitmap and UI failures remain retained evidence. No header-only conversion or zero-exit shortcut is accepted.

## Desktop verification and polish

`scripts/test-conversion-repair-native.mjs` uses a fresh `qa_conversion_library` fixture, the actual release executable and the installed native tools. It tests the repair review/copy/target-selection/conversion/open-result workflow through the actual desktop UI, and verifies every original SDK input against the copy's inventory. Metadata-only results are in [the native receipt](fixtures/c35-conversion-repair-native-verification.json). Private screenshots, source folders and complete logs remain under `.local/continuation35/alpine-source-r3/`. No Halo process, normal AppData library or game memory is involved.

The final native desktop trial passes the whole workflow: 430/430 bitmap paths, a separate 11,544-file SDK copy plus three repairs, explicit UI selection, native conversion, a second map tab and actual source preservation. The 125,690,255-byte MCC multiplayer cache has 2,629 tags and the same SHA-256 as the CLI result. The viewer loads 179 shader, 27 lightmap and 108 detail previews plus 483 sky triangles, with no pending material tasks. It is still an editor preview. All 11,544 original SDK inputs, the three classic files and the original/preserved cache are verified unchanged; Spark scene/tag edits are retained. The copy took about 60.41 seconds and conversion about 73.99 seconds in this run, not a repeatable performance benchmark. No game was launched.

The UI tests caught a real save/refresh lifecycle defect: resetting the audit to null unmounted the repair panel and discarded its pending review. The panel now survives same-map checks, while conversion is disabled until fresh checks complete. A map change resets the workflow. **Save & refresh checks** also removes the previous dead end where an unsaved target change could never enable conversion using the saved native configuration.

The first actual desktop build also exposed ten extraction failures on UI tag paths longer than the Windows filename buffer. Invader returned zero, but Spark correctly rejected the job. Extraction now reuses the temporary owned-job DOS mapping already used for native compilation and namespace tools. Only existing absolute paths inside the job are rebased; external resources keep their original paths, and only the created mapping is removed after the tool finishes. A Windows regression writes a deep tag through the alias, verifies readback in the real long directory and checks external arguments remain unchanged. The failed desktop job is retained. A later harness-only comparison also needed to normalize an absent optional QuickForge field to null; it did not indicate a product mutation. The complete trial was rerun successfully.

Compatibility filesystem work runs off the native UI thread. Repair polling is serialized and stops on terminal status; re-review replaces the window's old pending review instead of consuming the review limit. Source paths wrap, the missing-file list is bounded and the workflow adds no permanent editor toolbar. Build acceptance text now uses the actual map title instead of always naming Zombie Apocalypse.

Current local regression totals: **419 Rust passed / five opt-in ignored; 152 frontend passed in 33 files; 56 browser passed; 59 offline checks passed**. TypeScript, release Rust, Vite and NSIS are checked separately. The existing Vite main-chunk warning remains. Compiler/UI tests do not establish retail MCC map loading, authored HUD behavior, AI synchronization, collision traversal or rendering/audio parity.

## Remaining acceptance

Load the converted Alpine map in anti-cheat-disabled MCC and check spawn/game modes, HUD/UI, scenery, textures/lightmaps, sound events and collision. Package readiness requires the correct Excession metadata; a structurally validated cache is not an installed or gameplay-accepted package. The wider [cumulative engine backlog](MASTER_FEATURE_LEDGER.md), including native dual wield/sword, arbitrary live allocation/BSP replacement, game-peer replication and protocol translation, remains open. This pass closes the demonstrated source-dependency/compiler blocker only.

Fresh r3 executable, installer and source ZIP use separate names under `releases/`, with artifact JSON and SHA-256 sidecars. Earlier r1/r2 releases stay frozen. The owner handles pushing; no remote push, master merge, installation or public release is performed.
