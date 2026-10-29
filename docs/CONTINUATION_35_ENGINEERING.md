# C35 — the living workbench

Latest scoped evidence: [rendering repair, compact combined header and class-based tag workflow](C35_RENDERING_AND_WORKFLOW.md), with r11 files. Earlier scoped evidence: [direct viewport tags/assets, editor ambience and thin fullscreen controls](C35_VIEWPORT_WORKFLOW.md), with r10 files; [BSP audio revisions and repaired window drawers](C35_BSP_AUDIO.md), with r9 files; [acknowledged thread release and recovery](C35_THREAD_RELEASE.md), with r8 files; [authored looping audio phases](C35_LOOPING_AUDIO.md), with r7 files; [live-session cleanup and reconnect](C35_LIVE_SESSION_RECOVERY.md), with r6 files. Earlier follow-through: [saved map audio in native Director recordings](C35_DIRECTOR_AUDIO.md), with r5 files; [Director recording, named takes and fixed export dimensions](C35_DIRECTOR_RECORDING.md), with r4 files; [classic bitmap repair and validated Alpine MCC conversion](C35_CONVERSION_RESOURCE_REPAIR.md), with r3 files; and [saved tool edits and desktop snapshot repair](C35_TOOL_EDIT_FOLLOW_THROUGH.md), with r2 files. The r1 results, original failures and artifacts below remain historical and frozen; later reports supersede only their stated gates.

C35 continues master `617d267` on `codex/continuation-35-living-workbench`. It preserves C32–C34, the restoration corpus and frozen earlier artifacts. This is an internal development build, not a completed replacement Halo engine. No remote push, public release or master merge is included.

## Delivered behavior

| Workflow | Result | Practical limit |
|---|---|---|
| Navigation and header | Navigation is an independent drawer. The normal themed top bar is 32 pixels high, with its own collapse chevron and edge reveal; the Window launcher is removed. | F11 uses native fullscreen and a 30-pixel strip. Window/audio/undo/panel controls stay reachable. Ctrl+Shift+Backslash toggles the top bar. |
| Workspace tools | Project setup, Changes, Help, Construction, connection, Objects and Inspector open as drawers. Choose an edge, float, resize, pin space or reset. Layouts persist per map/workspace. | Existing tool contents, source edits, per-map histories, external monitoring and runtime dock remain mounted/available. Broad assistive-technology acceptance remains open. |
| Immersive editing | F11 uses actual native fullscreen. The compact tool strip remains visible; the nine-action Runtime Dock reveals from the bottom edge. Escape closes a drawer before restoring the window and its panels. | Historical r1 fullscreen produced a 2560×1070 map viewport; r9 retains visible window controls in the compact strip. Logical 4K sizing and emulated DPI are distinct from physical high-DPI acceptance. |
| Navigation | RMB + WASD, Q down/E up, Shift boost, MMB pan and RMB-wheel flight speed. Settings remember speed, sensitivity and six unique movement bindings. | Text fields/dialogs do not become camera input. Native focus loss releases held flight input. Controller and broad hardware acceptance remain open. |
| Editing context | Open a map, create a level, connect to a running game or continue a library entry. The new-level wizard survives lazy loading and workspace changes. | Remembered Halo/tool onboarding remains intact; no repeated setup was introduced. |
| Recording Director | Pop out from the prepared editor camera into a separate undecorated native window; dock back into Machinima with the same session. Saved keys, duration/easing, fixed/free/follow/look-at/orbit, roll, FOV, monitor selection and fullscreen are available. | One revision-checked backend camera authority per map. Director reads saved map changes and cannot claim source-edit ownership. An independent MCC engine spectator adapter is **not implemented**. |
| Source/live camera | Editor Render uses actual shared source geometry/materials. Optional live object linking samples the existing exact-map/tag MCC reader at 4 Hz, including a semantic player target. | Live linking was not tested against a running game in C35. Source bind poses are not game animation/effect parity. |
| Recording | Native new-file Save chooser, canvas or permissioned display/window streams, countdown, pause/resume, quality/fps/resolution choices, ordered bounded storage and recoverable partial files. | Contract/storage tests and a native encoder/decoder probe passed. Application Save-picker, initial-frame quality, actual game capture/audio and long-take acceptance remain open. Custom resolution choices are not certified 4K export. |
| Zombie Demo resources | Recover matching original resources from an identical preserved cache; prominent texture-location path. Actual native view loaded 132 shader, 15 lightmap and 59 detail previews plus 308 sky triangles. | No unrelated MCC images substituted. The source audit still has 47 missing/mismatched and 44 unsupported images; complete game appearance/audio parity remains open. |
| Visual map catalog | Six actual releases with credited authors where published, publisher screenshots, edition/category/search filters, dependencies and direct-download selection. | Publisher-only download pages and Steam Workshop remain external routes. No fake popularity or universal conversion claim. |
| Conversion diagnostics | Failed H1A compilation now lists bounded, deduplicated safe relative missing-tag paths and matching-source guidance. | Tool's zero exit code remains insufficient. No failed output becomes playable. |

## Actual native evidence

[Metadata-only receipt](fixtures/continuation35-native-ui-verification.json) records the exact tested executable, displays, snapshots and acceptance limits. `scripts/test-living-workbench-native.mjs` drives only the built Spark application through its private WebView debug connection, using a new, explicitly marked QA library. The user's normal AppData library, SDK masters and game session are excluded.

The final harness checks:

- A real Zombie Apocalypse Demo cache with missing resource pins recovers the identical original `bitmaps.map`, without changing either source file. Authored scene objects and tag edits remain unchanged.
- Actual native client sizes 1280×720, 1366×768, 1920×1080, 2560×1440 and 3840×2160. The larger windows are logical size tests, not five physical monitor tests. Browser layout checks also emulate 100/125/150/200-percent DPI.
- Header and navigation overlays preserve viewport dimensions. F11 reaches native fullscreen; tool drawers can open over the fullscreen map. Escape dismisses a revealed tool before leaving fullscreen, and the Inspector retains its floating position/size.
- Director composition survives docking/reopening. Stale revisions and wrong-project Director updates are refused. Saving a map in the editor refreshes its detached read-only view. The prepared camera, rather than a second viewport restore/frame routine, controls the detached view.
- Director movement across the three connected displays, including negative desktop coordinates; all reported scale 1. Hot-unplug/replug and physical mixed-DPI acceptance remain open.
- Native top-level focus moves to the main editor while Director render timestamps keep advancing. This checks Spark background rendering, **not** Halo actor control or engine camera independence.
- A short VP8 WebM canvas probe at 1920×1080 decodes visible map detail while the other editor has focus. It contains no audio. Its first decoded frame had zero image variation, whereas the one-second frame contained map detail. This is retained as an open startup-quality gate, not hidden by a successful later frame. The QA harness saves this private probe directly; it does **not** validate or bypass the application's Save chooser.
- The actual Alpine author release downloads through the normal native importer and opens as CE v609 with 2,676 tags and at least 28 source shader previews. This is not MCC gameplay acceptance.

Renderer FPS/frame-time and draw/geometry/texture counts in the receipt are short snapshots, not a repeatable benchmark or CPU/GPU/VRAM accounting. Vite still reports its large main-chunk warning. No measured startup or long-take performance improvement is claimed.

The material audit in `qa_map_materials` proved 453 external image ranges and 142 internal images, with original terrain/sky DDS decoding. Native recovery used:

| Original | SHA-256 |
|---|---|
| Zombie Demo `bloodgulch.map`, 52,164,642 bytes | `b38f35508188872b2535888193de80f766d92d3b8d53a8ada7be4fc9808a996d` |
| Original `bitmaps.map`, 82,697,130 bytes | `5357828124ed03b9b47dad563434465af742075ae1c991f6bb733320996f1bea` |
| Imported Alpine cache | `eb9b3693e74e674182d732f340127ef84d3574083821a8d3d95b234d9cb1c39e` |

Private screenshots, video, full compiler logs, caches and copied SDK trees remain under `.local/continuation35/` and are excluded from source packaging.

## Real conversion challenge: Alpine → MCC

The catalog points to Conscars' actual [Alpine release](https://github.com/csauve/alpine/releases/tag/1.0.0), with author attribution and CC BY-NC 4.0 source-license guidance from the author's repository. Download/import succeeded. Two full native conversion attempts used fresh isolated staging, installed Invader, H1A Tool and the existing 11,544-tag SDK baseline. No MCC or Standalone playtest was launched.

H1A Tool exited zero but explicitly failed to load the scenario. Its real log identifies three missing classic bitmap tags:

```text
powerups/active camoflage/bitmaps/camoflage.bitmap
powerups/over shield/bitmaps/overshield.bitmap
scenery/c_field_generator/bitmaps/c_field_generator_dust.bitmap
```

The new production diagnostic names these dependencies and explains that matching original classic resources or editable tags are needed. Installed MCC texture packs do not supply equivalent classic tag data. No shader was removed or populated with guessed pixels to force a build. [Retained diagnostic metadata](fixtures/continuation35-alpine-conversion.json) records the failed native outcome. The diagnostic was replayed read-only over retained real tool events after adding focused regressions; a third 1.7-GiB staging copy was not needed merely to reword the error.

The `qa_convert` helper now retains complete ordered job events in its fresh output root, so native compiler failures no longer lose the actionable lines.

## Verification and regressions

| Check | Final result |
|---|---|
| `node scripts/cargo.mjs test --workspace --locked` | **400 passed**, five explicit opt-in tests ignored, zero failed |
| `node node_modules/vitest/vitest.mjs run` | **141 passed**, 31 files |
| `node node_modules/@playwright/test/cli.js test --reporter=line` | **53 passed** |
| Existing offline checks | **59 passed** |
| TypeScript, Vite, Rust release and NSIS | Passed; existing Vite chunk-size warning retained |
| Actual native Spark harness | Passed; exact build and scope in the receipt |
| Native game capture, Save chooser, engine/gameplay | Not accepted in C35 |

Native Director tests cover bounded sessions/keys, persistence, owner/revision validation, window placement and ordered recording storage. Frontend tests cover layout isolation, flight controls, catalog identity and recording chunk/failure contracts. Existing onboarding, external-save conflict, multiple-map state, tags, runtime actions and invitation gates remain covered.

The investigation retained earlier failed attempts. A focus-based idle optimization paused a visible Windows editor; native visibility now controls idle behavior instead of top-level focus. Another check caught competing viewport initialization overriding Director composition; externally controlled camera views now skip those restore/frame routines. The harness originally treated `document.hasFocus()` as a native-window test; both WebViews could report true. It now queries actual native focus and requires new render timestamps. An initial scene comparison also confused serialized negative zero with mutation; the final comparison normalizes JSON numbers and still compares all scene/tag content. No failing engine test or compile gate was removed.

The Windows computer-use helper could not initialize its sandbox runtime. No OS capture permission or Save dialog was driven, and no security/privacy picker was bypassed. The [owner test card](CONTINUATION_35_TEST_CARD.md) keeps those steps explicit.

## Preserved engine backlog

The [319-row cumulative ledger](MASTER_FEATURE_LEDGER.md) retains all 303 pre-C35 records and adds 16 distinct C35 requirements; rows are not unique-feature counts or completion totals. Historical C33 gameplay confirmations remain historical, scoped evidence.

The remaining gates include native paired dual wield and independent offhand fire/reload/HUD/animation, usable player sword/lunge, sprint animation and third-person aiming; arbitrary live object allocation/deletion or BSP replacement; game-peer edits/AI replication; MCC-to-community gameplay protocol translation; actual eight-player campaign/Firefight and measured 128-player hosting; complete rendering/audio/event parity; general loose-tag reconciliation; and rebuilt campaign/UI/native conversion gameplay acceptance. The four-map world remains one resident compiled BSP with historical automated collision routes, not new C35 collision or independent region-streaming acceptance.

The next useful engine sequence is one completed Director capture/recording acceptance, then one source-complete converted map with native loading evidence. Runtime allocation, networking and new weapon mechanics need their own pinned engine contracts and actual game/client trials. They are not made complete by adding more UI or descriptors.

## Local artifacts and handoff

Fresh files under `releases/` use C35-specific names; C32–C34 releases remain frozen:

- `GuiltySpark-C35-0.4.0-living-workbench-dev-r1.exe`
- `GuiltySpark-C35-0.4.0-living-workbench-dev-r1-setup.exe`
- `Project_Guilty_Spark_Continuation_35_SOURCE_r1.zip`

The local artifact JSON and `.sha256` sidecars record hashes. The source archive contains both identical SHA-256 manifests and a comparison from `617d267`. Independent ZIP verification checks every source member against both manifests and the workspace, including `.github`, and rejects caches, maps, binaries, SDK data and `latestspark.zip`.

The frozen executable SHA-256 is `299adb982dfc8122db0a2814c08ce29354e788ebe00445408390ac2cb3baa802`; the NSIS installer is `469cee870f978576f80517fb2fcf9806fc2381aa43d79b57a929fb095e85f9f2`. The executable matches the final native QA receipt exactly. These files have not been installed or uploaded.

See the [short push handoff](GITHUB_HANDOFF.md) and [full C35 description](CONTINUATION_35_GITHUB_DESCRIPTION.md). The owner controls pushing. GitHub-hosted CI and public installation remain separate from this local evidence.
