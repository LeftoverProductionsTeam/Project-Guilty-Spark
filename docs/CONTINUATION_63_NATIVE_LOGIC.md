# C63 — A functioning native door, from authoring to player traversal

Continues local master from `9d03f10c86f43e0ebf26a2c2b2adde8a42ecb1ae` (C62). Existing C63 work, original maps, four worktrees, prior failures, research and sealed releases are preserved. No branch, remote push or publication is part of this continuation.

## Actual gameplay result

The owner verified the revised **Halo 1 MCC Editing Kit Standalone** test: **“Opens both ways; crossed and returned; closed normally.”** The question explicitly required walking into the far room, letting the door close, and returning through it.

This is a human test of the Standalone runtime loading the native loose-tag source from the exact validated build below. It is **not** retail MCC loading the packaged cache, CE/OpenCE/Chupathingy gameplay, multiplayer replication or general campaign completion.

| Identity | Accepted value |
| --- | --- |
| Build | `2785b92d-63c3-4995-a0c2-2ff250c704c4` |
| Project fingerprint | `9d06a485defe15a173b6ea3da52801a2449ebdc037ff6a785c19edbf5e40f52a` |
| Native cache | `c63_native_logic_benchmark.map` |
| Cache SHA-256 | `4fc40e656e24cc9ca7461325c0290ef93cf95f63c3a6d69af4bd4efddfb3f99e` |
| Stock SDK door SHA-256 | `7ba01243af80e594f284992b39b4125095e39e7f4c702c8c87674b6c19fabdf8` — unchanged |
| Native Tool SHA-256 | `c492789e96dbe845891e0c0973bfb526a21230f570559e6f9fb695b8d2ca0afa` |

Private evidence is under `.local/c63-universal-halo-20261103/`: `door-two-way-playtest-result.json`, `door-two-way-build/2785b92d-63c3-4995-a0c2-2ff250c704c4/quickforge-receipt.json`, `door-two-way-playtest.log` and `two-way-independent-readback-second/acceptance.json`. The wrapper exited normally with code zero. These folders contain owned game content and are not release assets.

## Why the previous tests failed

1. **Red door never opened.** Invader inserted a standard trigger volume with native type `fixed`, while Spark supplied oriented corner/basis/extents data. Independent readback exposed that mismatch. The exporter now explicitly writes **`rotational`** and checks it with the real native editor before compilation. No door flag, animation or physics workaround was used.
2. **Outbound worked, return failed.** The first corrected source still contained a one-shot event and a trigger entirely on the first side of the door. The accepted authoring copy centers the trigger on the door at `[14, 0, 1.5]`, spans `[6, 3, 3]`, and repeats after exit. Existing user-authored Once settings are not silently migrated. The fitting action is explicit and undoable.

The early failure (`door-playtest-failed.json`) and partial result (`door-corrected-playtest-result.json`) remain intact. The large blue box seen during debugging was the runtime's `debug_trigger_volumes` overlay, not exported geometry. The ordinary playtest path does not enable it; the opt-in QA helper supports `--debug`.

Independent extraction of the accepted cache with Invader, followed by native tag-editor reads, confirms one machine, one named volume, one object name, the real stock door reference, two compiled scripts, `rotational` volume type, corner `[11, -1.5, 0]`, extents `[6, 3, 3]`, machine position `[14, 0, 0]`, yaw zero and unassigned power/position groups (`65535`, native NONE). The cache hash is unchanged after extraction. This checks compiled structure independently of Spark's own parser.

## Author a door in Spark

1. Open an editable QuickForge/BSP Workshop project. In **Asset library**, select a compatible source map containing device machines and choose **Doors & devices**. Campaign sources such as a10 contain actual doors.
2. Drag a door preview onto the map. The existing recursive extraction/import path binds its real native dependencies. Select the placement to open Inspector **Logic / Events**.
3. Drag **Trigger volume** from the same asset drawer, or add it from Logic / Events. Move/resize its box in Properties or with the existing tools. It is an editor volume, not a collision block.
4. Choose the trigger and door, then **Cover both sides → Enter → Open**. The fit is a starting preset; resize it for the actual doorway. New simple connections re-arm after the player leaves. Enable **Once** only for intentional one-time events. **Leave → Close**, timers, delays, power and an optional position condition use the same native source generator.
5. Review **Native HaloScript** or opt into editing it. Save, then use the normal native build/playtest pipeline. Generated metadata stays in the project/source plan; exported tags contain ordinary Halo scenario fields and compiled scripts.

Door appearances, animation timing, automatic operation and gameplay depend on the native device tag and runtime. This acceptance covers the stock small a10 door and the named trigger path, not every machine or event combination.

## Integration and recovery

- Logic is optional schema-versioned project metadata. Existing maps without it retain their serialization and workflows. References use instance IDs; native names are bounded and deterministic. Removing selected instances removes their authoring references; duplication creates fresh identities without duplicating event bindings.
- Ordinary `machines`, `machine_palette`, `object_names`, `trigger_volumes` and `.hsc` source feed the existing native compiler. A newly created name table is checked empty before the bounded native name insertion. No cache-only object type/index fields are invented.
- Missing `invader-script`, invalid references, nonfinite volumes, protected existing names and malformed HSC refuse the build. Readback checks the native volume type and compiled script names. Cancellation cannot interrupt native tag-writing phases halfway through a write.
- Shared source sessions merge the optional logic graph atomically and reject concurrent conflicting graph edits. This adds no raw binary broadcasts or remote execution and supplies no new game-peer replication acceptance.
- A real Undo→immediate Save race was found in the desktop test. Undo now commits the authoritative document render synchronously before a following Save reads it. The deterministic browser test and native saved-file readback verify the undone dimensions, not merely the visible input.
- There is one active runtime selector in the header. It uses the same per-map hosting choice as the tool dock; it never changes source-cache decoding identity. Onboarding presents four emblem cards with short descriptions, uses, features and independent connection status. Legacy import/export choices remain separate.

## Genuine desktop authoring

`native-ui-twelfth/acceptance.json` records actual WebView/Tauri IPC, not mocked commands. It includes pointer coordinates and camera pose for **both** the Asset-library native-door drop and the trigger drop, the recursive native import, transformed placement, repeatable two-sided setup, one-action Undo/Redo, immediate Undo→Save, reopen, editable HSC and the actual H1A Tool build. Its original source cache remains unchanged.

- Development application SHA-256: `412210178af810797dc8f9bb6804bf717a1e48c4aa2fc601aaa6c49b090bb767`.
- Independent UI-authored native build: `b29909c6-bf23-4f0d-88bd-36add584dbc1`.
- UI-authored cache SHA-256: `8358ef30b169c5d540dc46fad1a917401bc574eb2a2c20f634c3366bd56952fb`.
- Full build and acceptance polling: 271,323 ms. Complete owner tag copying, hashing, compiler validation and rendering were retained. This is a debug acceptance timing, **not** a before/after performance improvement.

Earlier automation failures and their screenshots are retained. They include a 240-second timeout during full SDK staging, drawer interception of a redundant navigation click, and the actual Undo/Save ordering bug. The current harness uses a 15-minute native build limit, explicit phase failure detection and the real visible UI flow; it does not skip compiler inputs or replace native commands.

The source-map door preview still reports one unsupported/missing `cryo glass` material. Complete renderer parity is not promoted by this door/gameplay result.

## External edits and regressions

The final round trip passes in `native-readback-final/acceptance.json`, carrying forward the preserved real external-save observations and accepted source revision from the third attempt. The final application also independently repeats the corruption/refusal/recovery check. A real Invader no-op save retains identical decoded semantics (byte-identical: true). A deliberately truncated 12-byte save is detected in 26744 ms and **reconciliation refuses it**. The immutable starting tag is unchanged; the test restores those exact bytes before the real semantic edit. Filesystem evidence correctly says **writer unknown**; the fixture, not Baboon/Invader, injected the damage.

The real Invader edit changes only the exposed bounding-radius value from 0.9 to 0.5. The accepted revision preserves the authored machine/trigger/scripts and the previous cache. Procedural regeneration correctly refuses to discard the accepted native edits. The existing **Build working tag edits** route produces native cache `028ae591-6fec-4f15-aacd-7546e2d5f92e` (SHA-256 `3504cd8f59ed31279c10d4907b20d4bdb499fce3e511d8039d573d80c8e0153b`), and Spark reads back radius **0.5** with both original compiled script names. All **11,564 starting tag files** are re-hashed unchanged; the valid external file and accepted revision remain identical. The owner added a Room A extrusion while that build ran. Opening it as the current revision was correctly refused by the stale-build guard. Final readback imports the exact older cache into a separate library and never writes or rolls back that new geometry. This external revision has no additional human gameplay claim.

The previous external attempt remains preserved: direct CLI reads failed on a 281-character imported-tag path. The harness now uses Windows' native extended path form, without renaming/removing dependencies. It resumes only the same unchanged prepared handoff with zero accepted revisions and matching initial tag hash. No repeated SDK copy or fabricated receipt is needed. The earlier interrupted first round trip and its accepted valid edit remain intact.

Final regressions: **676 Rust passed / eight opt-in ignored (45 suites); 371 frontend (88 files); 159 browser; 59 offline programs**, plus TypeScript, Vite/embedded development build and the updated QA example check. The first full browser run retained one 30-second Web Audio evaluation timeout; that exact test passes alone and the complete serial rerun passes all 159. Existing Three.js/Vite warnings remain; no production audio behavior or timeout was changed to force this result. The eight ignored tests require explicit local-game/source/internet selection and are not counted as passed.

The metadata receipt records the final external-edit and regression outcomes. The isolated round trip uses the production Baboon handoff/reconciliation path with a real Invader CLI save. Deliberate QA corruption must be attributed to the fixture, not Baboon or Invader. Preparing Baboon is not proof of a manual Baboon GUI edit.

The native authoring and reconciliation harnesses are opt-in, require explicitly selected owned tags/tools, and write only to isolated diagnostic libraries. `qa_bsp_workshop --logic` now generates the repeatable two-sided benchmark. `--snapshot` rebuilds an exact frozen project into a fresh directory without replacing its live accepted native revision. `qa_workshop_playtest` holds the temporary native content mapping until the game exits; it cannot certify player actions.

## Remaining gates

Keep retail MCC cache loading, other-runtime door acceptance, full native material parity, manual Baboon GUI edited-save acceptance, physical monitor changes, separate-computer SparkLink and game-peer replication separate. The unfinished direct compiled-map structural editor, Megaworld return traversal, full AI lifecycle and human Firefight acceptance remain in the master backlog. The C49 0.4.1 release candidate is unchanged; C63 is a development build, not a new installer or public release.
