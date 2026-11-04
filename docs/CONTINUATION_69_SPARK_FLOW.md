# C69 — Retained workflows, native windows and Windows CI repair

This continues `e3ae8fa` in the sole canonical local master. It extends the existing document owners, window manager, workspace panels, source history, renderer and tool workflows. The full Spark Flow directive remains partially open; the newer specialist-tool directive is preserved in [pending requests](PENDING_REQUESTS.md). No push, release upload, installation or cleanup occurred.

## User workflows

- **Open work** in the top bar/application menu, or **Ctrl+Shift+P**, lists actual Spark windows, maps, source-bound Recent Places, native jobs and external handoffs. Choose the workspace for this window; focus an existing matching view or explicitly open another. Source write ownership remains independent of view metadata.
- Back/Forward and Recent Places retain the map's selected object/tag, BSP face, volume, camera and scroll. Navigation never adds source Undo entries. Pin and reorder map tabs without modifying either map. The 23 existing workspace routes and learning aliases remain available.
- Hidden visited workspaces remain mounted through the existing retention system. Their rendering pauses; closed maps release their views. Existing graphics budgets still retire old contexts, and a rebuilt context must draw before reporting readiness.
- **Layout → Window layout name** saves named arrangements; restore checks source identities and recovers off-screen placement. Restore-on-launch is optional. This does not yet reproduce every child window's entire tab set, camera, maximize or fullscreen state.
- **Settings → Interface Studio → Window → Show desktop Spark companion** enables an optional small portrait/shortcut. It opens the same Open work hub, remembers placement and can be hidden. It has no editor, source document, build process or 3D renderer. The default is off.
- Content transitions are short and optional; reduced motion disables animation. Shield loading follows actual geometry/material/lighting/animation/first-frame readiness. Errors stop loading and expose Retry. Community Maps uses compact Browse / Download & import / Archives & help tabs; existing sources, credits and validation remain intact.

## GitHub failure

The supplied Windows failure occurred in archive-test cleanup **before Cargo**, not Rust compilation. Test temporary directories compared raw Windows paths against resolved paths; a junction/verbatim spelling reproduced 17 cleanup errors. The new owned test-directory helper pins the canonical root, parent and filesystem identity, refuses changed/replaced/unowned roots, and uses Windows long paths only for that owned test tree.

The archive suite passes **20/20 with an ordinary temporary root and 20/20 through an NTFS directory alias**. The focused native-storage contract passes. Production vault/removal guards and CI failure checks were not weakened. A hosted GitHub rerun remains unverified because nothing was pushed.

## Real desktop and native acceptance

Private evidence: `.local/artifacts/c69-spark-flow-20261104/`. The bounded [receipt](fixtures/c69-spark-flow.json) records identities and measurements without shipping Halo data.

| Gate | Observed result |
|---|---|
| Independent native windows | Two actual Tauri windows keep independent workspace roles and selections while following one authoritative project revision. Default open focuses an existing role; another view is explicit. |
| Editing and navigation | Source draft, same Canvas, Undo/Redo and immediate saved edits survive workspace changes; two maps stay isolated. Numeric wheel input does not change a focused transform. |
| Recent Places | Actual BSP `face-0`, `room-a` and the exact top-view zoom survive Recent Places and Back/Forward without adding source edits. |
| Native preview | Pistol reaches first usable frame with 787 triangles, two diffuse bindings, one source cube and no reported material gaps; returning uses the same preview. This is scoped visual evidence, not complete game-rendering parity. |
| Native pause/retention | Minimized model and level view issue zero measured GL clears over 650 ms, then resume the same Canvas. Existing lifecycle tests retire a third warm renderer without losing documents/history. |
| Window restoration | Two named layouts preserve roles, source guards and native placement. Synthetic off-screen placement recovers. One physical monitor was available; disconnecting a second monitor is unverified. |
| Optional companion | Real separate native window, no Canvas/App document, same command hub, saved hide preference and off-screen recovery pass. |
| Native failure/retry | A four-byte change only in an owned QA cache removes its model geometry. The real reader reports `Model contains no geometry`, shield loading stops, Retry makes a fresh native read and refuses unchanged corruption; the good source renders again. The injected writer is explicitly QA. |
| Native authoring/build | Actual asset-drawer pointer drop, two device/trigger bindings, behavior copy, Ctrl+C/V, one-action Undo/Redo, immediate Save/reopen and protected handwritten scripts pass. Navigation to Creator Studio exposes the actual running native job without changing its frozen build source. |
| External edit | Real Invader no-op and radius `0.9 → 0.5` save, live detection, semantic reconciliation and rebuild pass. Deliberate QA truncation is rejected; all 1,801 baseline tags and original scripts remain intact. Manual Baboon GUI edited-save was not performed in C69. |

The native authoring job is `a7a88447-d8b2-4d8a-8b45-8f8764dc5743`, cache SHA-256 `ce027c1b3eadadecec7af07dd4bf578f5620d0bdc9fca2b8bc42c4a8a1f1e2b7`. The reconciled job is `31a637bc-96fb-4375-b7cc-ef0f0f7346c5`, cache SHA-256 `2038e46e7b1f63c0d923daa1f4a2b4a956d380f19e076bdc40ced53457ab5b5e`. Native Tool/Invader compilation and independent scenario/script readback pass. A missing optional `ui\shell\bitmaps\background.bitmap` warning remains recorded. The new cache has not received human gameplay acceptance.

The C63 human result **“Opens both ways; crossed and returned; closed normally”** remains attached only to that earlier Standalone cache. No new player traversal, game peers, retail runtime, clean-machine package or platform acceptance is inferred.

## Measurements and failed trials

One machine, embedded Windows development app, fresh owned WebView profile/library, reused bounded C66 inputs. In the final Flow trial: process-to-bootstrap 967 ms; reload-to-Library heading 886 ms; new workspace window 695 ms; native pistol first frame 424 ms; warm preview return 123 ms. The initial full-map resource work took another 2,916 ms to settle. These are different operations, not a controlled old-versus-new startup comparison.

After warm-up, **18 three-workspace cycles / 54 switches** made **zero new model/bitmap/cube IPC reads**, retained one WebView document and the same preview element. GC-normalized heap samples were 163,311,524; 164,144,108; 164,625,536; 165,307,720 bytes. This short sequence is not an endurance, process-memory or VRAM measurement.

Earlier failed attempts are retained: UI mode/camera commit timing, duplicate map titles, raw fixture import without frontend invalidation, companion closure before keyboard keyup, and invalid native IPC instrumentation. The final measurement uses the existing opt-in profiler with positive controls. Initial bitmap batches belonged to the first whole-map load, so warm navigation is measured after it settles. Temporarily hiding the owned source file legitimately retained its already validated immutable snapshot; the separate malformed cache, not that rename, proves error and Retry behavior. No production native cache was disabled to obtain a pass.

## Regressions and remaining work

Locked Rust workspace: **708 passed, eight ignored**. Frontend: **397 tests / 93 files**. Browser: **163 passed**, plus final focused Flow checks. Offline: the exact **59 programs** from the package script passed. Additional CI native Node tests: **37 passed**; continuity/health Node tests: nine passed. Embedded release compilation passed. Actual native lifecycle: eight cases; expanded Flow: 14 cases; authoring and reconciliation completed independently.

All 15 protected C49/C63 artifacts and the 475-row requirement ledger match their existing hashes. Health reports one canonical master/worktree and no storage read errors. The measured workspace is still about 148.6 GiB logical / 147.5 GiB unique data, above its review budget. No removal was authorized by that warning; failed evidence and previous-good outputs remain preserved.

Open gates include complete per-window session restoration, physical multi-monitor disconnect, manual external GUI edits, the DCC round trip, new native gameplay, cross-computer collaboration, full rendering/audio parity, AI/Firefight/Zombie and Megaworld traversal, and actual release publication. The accepted C49 Windows installer/portable/source set remains unchanged; C69 is a development build, not a replacement release.
