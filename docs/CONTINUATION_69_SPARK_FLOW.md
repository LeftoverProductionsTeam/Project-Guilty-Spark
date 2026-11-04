# C69 — Retained workflows, native windows and Windows CI repair

This continues `e3ae8fa` in the sole canonical local master. It extends the existing document owners, window manager, workspace panels, source history, renderer and tool workflows. The full Spark Flow directive remains partially open; the newer specialist-tool directive is preserved in [pending requests](PENDING_REQUESTS.md). No push, release upload, installation or cleanup occurred.

## User workflows

- **Work** in the top bar, **Open work** in the application menu, or **Ctrl+Shift+P**, lists actual Spark windows, maps, source-bound Recent Places, native jobs and external handoffs. Choose the workspace for this window; focus an existing matching view or explicitly open another. Source write ownership remains independent of view metadata.
- Back/Forward and Recent Places retain the map's selected object/tag, BSP face, volume, camera and scroll. Navigation never adds source Undo entries. Pin and reorder map tabs without modifying either map. The 23 existing workspace routes and learning aliases remain available.
- Hidden visited workspaces remain mounted through the existing retention system. Their rendering pauses; closed maps release their views. Existing graphics budgets still retire old contexts, and a rebuilt context must draw before reporting readiness.
- **View → Window layout name** saves named arrangements; restore checks source identities and recovers off-screen placement. Restore-on-launch is optional. The follow-through below verifies complete per-window tab sets/order, views, writer ownership and native maximize/fullscreen state through an actual process restart.
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

At this initial checkpoint, complete per-window session restoration was still open; the follow-through below closes that measured gate. Physical multi-monitor disconnect, manual external GUI edits, the DCC round trip, new native gameplay, cross-computer collaboration, full rendering/audio parity, AI/Firefight/Zombie and Megaworld traversal, and actual release publication remain separate acceptance gates. The accepted C49 Windows installer/portable/source set remains unchanged; C69 is a development build, not a replacement release.

## November 4 follow-through — restoration and compact navigation

Continues policy commit `16d9c95` and preserves all C70 work. Private evidence is `.local/artifacts/c71-native-asset-studio-20261104/`; its directory name reflects receipt of the later directive, not advancement to that initiative. The full Spark Flow directive remains **awaiting human acceptance**, and later initiatives remain pending.

- Existing window storage/capture now retains source-bound per-window places, complete tab sets/order, native window modes and the actual writer of an inactive map. Capture waits for bounded acknowledgments; old layouts remain recoverable on refusal. A saved view cannot grant source ownership.
- Two demonstrated timing defects are repaired: closing a detached panel returns its map in the background without restoring a stale navigation choice, and startup restoration orders successfully loaded maps without dropping the final queued load from a not-yet-committed React ref. Source history and the distinct document owners remain authoritative.
- The title bar uses the existing Tools, View, Work and Studio menus. Runtime selection, collaboration, Find tools and Help remain in Studio; fullscreen, pop-out, editor audition and saved layouts remain in View. Existing shortcuts and native close/minimize/maximize controls remain available.
- Map tabs use smooth rectangular surfaces capped at 180 pixels. A dedicated blank title-bar region remains draggable. When space runs out, the active map remains visible and the existing Maps dropdown exposes every open map; keyboard navigation waits for the newly selected tab to be mounted and visible.
- The Orb contains regular compact Home/first-setup rows, the current workspace title and one checked selected entry. No extra header Home button or oversized menu cards remain. The Spark control overrides the demonstrated Dark Glow button background in idle/hover/open states and has no native title-tooltip box. All five themes and windows down to 800 pixels were checked.

### Actual desktop evidence

The final embedded Windows development executable is SHA-256 `7001020924fb91783d31e3e0ff64bdada47ef9cacf9efb08ab0f5b0abcc47cfa`. `restart-drag-dropdown/acceptance.json` passes eight case groups, `lifecycle-drag-dropdown/acceptance.json` passes eight cases and `flow-drag-dropdown/acceptance.json` passes fourteen cases. These run genuine Tauri/WebView processes with separate owned libraries/profiles and real IPC. They do not play Halo or certify a release.

Actual shutdown/restart preserves two independent two-map tab sets, different Creator panes and BSP selections/cameras, source Undo snapshots, an inactive-map child writer, saved theme/animation settings and native maximize/fullscreen. Six actual maps occupy a 1,075.94-pixel strip without scrolling; at a 900-pixel native window they become one active tab plus a six-map dropdown, leaving a 54-pixel explicit drag region. Native keyboard switching focuses the selected map. Screenshots `six-map-header.png`, `narrow-map-dropdown.png` and `orb-current-workspace.png` were visually inspected.

The current whole browser suite passes **163 tests**. Frontend tests pass **400 tests / 93 files**, TypeScript/embedded optimized build pass, the exact **59 offline programs** pass, and continuity/repository helper tests pass **8/8**. The preserved locked Rust run is **711 passed / eight ignored**; no Rust production code changed after that run. The hosted GitHub path-alias failure remains repaired and locally verified as recorded above; no remote rerun or publication is claimed.

The tested working tree includes the preserved unfinished C70 tool/DCC work. The C69 commit is staged separately from its 15 tracked edits and three new files. Binary evidence therefore identifies the full working-tree application and its recovery manifest, not a clean C69-only release artifact.

### Measured activity repair

Comparable owned-profile trials `flow-final-profile` and `flow-activity-final` each run 120 three-workspace cycles / 360 switches after warming the same native map and model. Existing activity context now stops retained hidden LiveForge/object-inspector UI polling and keyboard handlers. It does not stop native keepers or change session cleanup.

| Measurement | Before | After |
| --- | ---: | ---: |
| Hidden MCC sample IPC calls | 132 | 0 |
| New model/bitmap/cubemap reads | 0 | 0 |
| Navigation sequence | 85.495 s | 86.384 s |
| GC-normalized WebView heap, first → last | 163,806,836 → 171,550,208 B | 164,155,876 → 171,827,664 B |
| Owned app/WebView private bytes, first → last | 2,101,473,280 → 2,232,377,344 B | 2,315,706,368 → 2,354,487,296 B |
| Dedicated GPU bytes, first → last | 370,548,736 → 440,315,904 B | 461,070,336 → 439,660,544 B |

Eight processes remained present in both trials. Short idle one-core CPU samples were 1.35% and 0.68%; starting memory conditions differ and the samples are noisy. These measurements establish removal of unnecessary hidden polling, not a general speedup or long-horizon leak closure. Both heaps grew about 7.4 MiB. The final 18-cycle smoke also retains the same preview with no heavy decode reads and rejects the deliberately corrupted owned model on Retry.

Earlier failed runs remain explicitly failed: stale removed-Home selectors, insufficient menu/editor-readiness waits, a closed-pop-out trial, a premature pause assertion, the real stale-tab return race and queued-load ordering defect, an ordinary non-embedded build, and a refused already-existing evidence destination. The final runs keep every content/history/native-readback assertion. No failure was relabeled as success and no SDK was regenerated.

All 15 protected C49/C63 artifacts, the 475-row requirements ledger, canonical engine research and the three pending C70 source files pass the final hash check. The read-only storage report records 169,674,587,411 logical / 168,466,232,113 unique file bytes before the last native cohort, with no read errors and one canonical master/worktree. QA WebView profiles, owned inputs and shared compilation output have grown; the existing 80-GiB review warning does not authorize deletion. Original inputs, accepted releases and failed evidence remain intact.

Next acceptance remains the human C69 creator journey/manual external-editor handoff, physical monitor removal and longer resource endurance. C70's actual DCC/compiler round trip and the complete Native Asset & Tag Studio directive remain preserved pending; no manual requeue is needed, and no next initiative has been started by this follow-through.
