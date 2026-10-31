# C41 final integration and verification

This continuation starts at local master `5d67390a2b0819145fb148f589593ae65308e938`. It integrates the preserved unfinished C41 Smart Edit source into the newer native-asset, rendering, BSP and CE workflows, merges all seven unique dependency branches, fixes object-tag dependency navigation and standalone first-load texture/default-material gaps, and updates the README and current feature catalog. It does **not** declare the full roadmap complete.

The [public metadata receipt](fixtures/c41-final-consolidation.json) records exact capabilities, identities, timings, failures and boundaries without distributing game payloads or private invitations.

## Source and branch preservation

- All 20 existing non-master local engineering/base/alias tips were already ancestors of starting master. They did not require replaying their code.
- The original C41 checkout had 42 uncommitted source/document/test files plus 104 owned CE runtime files. All 146 were copied, hashed and verified before integration; the original checkout, branch and files remain unchanged.
- Commit `229fe2f3c2af821ce8bc1b4621fcc344fe66e7d3`, under `refs/preservation/20261031-smart-edit-source`, freezes all 42 source files. Native game payloads remain private and outside Git.
- Merge `edebfac` joins that snapshot to master. Thirteen overlapping files were resolved individually: newer BSP Workshop, native asset imports, bitmap previews, persistent collaboration, tool launch commands and CE source/hosting behavior survive alongside Smart Edit. Generated ledgers combine both sets of requirements.
- The seven unique fetched Dependabot commits are retained as merge parents: rusqlite 0.41.0, SHA-2 0.11.1, Lucide React 1.61.0, Three 0.186.1, TypeScript 7.0.2, Vite 8.3.5 and Vitest 5.0.5. Three type definitions and the React/Vite plugin are aligned with the combined versions; the combined pnpm lock passes frozen installation.
- SHA-2's new output wrapper needs explicit hex conversion. A shared lowercase byte encoder preserves existing 64-character identities, including leading zeroes. Known SHA-256 vectors, old native fixtures, preserved source hashes, build receipts and fresh native acceptance verify compatibility.
- All **30 initially captured local/remote branch tips** are ancestors of local master. A later audit sees **24 non-alias branch references**: six remote dependency references were removed outside the consolidation commands, but all seven dependency commits remain merge parents. No branch was deleted, rebased or force-pushed by this work. All 391 previous ledger IDs survive; seven C41 records bring the total to 398.

The complete pre-fetch all-reference Git bundle, root dirty-file copies and final preservation audit remain under `.local/20261031-final-consolidation` in the integration worktree. Original private research directories and failed attempts remain intact. Repository protections and CI safeguards are unchanged.

## Direct cache and native-source acceptance

The final bundled Windows executable runs against owned MCC Blood Gulch, a fresh private native-source replica, installed Invader and real H1A Tool. No mocked IPC or game-memory edits are used.

1. Change pistol Bounding radius through the actual tag UI. Review and execute the direct MCC plan. Exactly **four scalar bytes plus four checksum bytes** change; a complete comparison verifies every other byte. No extraction or compiler runs on this route. Independent Invader CRC checks and native semantic reopening pass.
2. Reject a changed saved revision, unsupported projectile-reference edit, mismatched runtime and legacy direct-write request. Manual method selection does not bypass the direct allowlist.
3. Verify the vehicle field appears in both the full Tag editor and object drawer. Navigate to its actual model dependency. Fix the discovered root-request replay bug; a new browser regression also changes another session control while preserving the selected dependency.
4. Perform an actual rendered X-axis gizmo drag: scenery moves from X **37.9339** to **38.14475**, with Y/Z preserved. The native edited copy reopens at that position and retains the separate vehicle field edit.
5. From the same native parent, compare direct output with an actual extraction/rebuild and an accepted working-tag build. All expose radius **0.22499999403953552**. Their binary hashes legitimately differ. A later direct save does not hide the current native source build from its tools.
6. Verify the original MCC map and all **2,240 native source files** remain byte-identical.

The initial visible plan took **1,936 ms**; the complete first direct UI save took **7,794 ms**. Extraction/rebuild took **24,520 ms**, and the accepted working-tag build took **38,548 ms**. These are observations on this machine under concurrent acceptance load, not general performance promises. Automatic resource discovery completed before review; a later source-binding change still invalidates its old plan and requires review.

The writer remains restricted to reviewed internal MCC Halo 1 cache-13 scalar cells and supported existing placement transforms. General references, array growth, custom-model insertion, BSP relocation, other-edition direct writers and game-load acceptance remain unfinished. Native loose-tag compilation is not their completion evidence.

## C37–C39 safeguards and shared content

The genuine native integrity regression uses pinned Invader and a prepared Baboon handoff context:

- A 201-byte serializer rewrite preserves inspected native fields and is accepted as equivalent within the documented parser/precision boundary.
- A deliberately malformed dependency-length write has a valid payload checksum but fails native semantic parsing, reconciliation and build admission. The controlled writer is the QA process. Baboon is shown as a handoff association; no false accusation that Baboon or Invader wrote those malformed bytes is made.
- The broken candidate remains recoverable evidence. Baseline bytes and the prior accepted source remain intact. A genuine Invader radius edit then reconciles, compiles through H1A Tool and reopens at the intended native value.
- Stable-save warnings remain active with the handoff dialog closed. All 2,240 source files verify unchanged. Historical founder-operated Baboon GUI acceptance remains historical; no new human Baboon save is claimed.

Three real independent Spark processes, three separate libraries and one physical Windows computer repeat the shared native-content challenge. The native tag author, validated scenery publisher and world-placement author converge at **revision 3**, with actual models in all three viewports. The run verifies participant-specific undo, referenced-asset conflicts, same-field conflicts, corrupt-byte refusal, duplicate acknowledgments, permissions, revocation and synchronization across workspace changes.

H1A Tool compiles frozen **revision 13** while editing advances to **14**. Native readback verifies pistol radius **0.2750000059604645**, the published model's **31 triangles**, and placement **[3, 2, 0.1]**. Abrupt host recovery restores revision 14, exact asset bytes, author identities and history; replay stays deduplicated. Each participant's 2,240 original native files and the template/map remain unchanged.

The first complete three-author workflow took **7,691 ms**. Six subsequent edits measured **76–894 ms**, median **882 ms**, including native IPC and React consumption. Frozen compilation took **40,368 ms**; recovery took **11,255 ms**. Concurrent native suites were active. This is local TLS behavior on one machine, not a WAN or game-peer benchmark.

Native sharing remains limited to the supported pistol field and complete admitted scenery templates with matching local dependencies. General binary uploads, arbitrary source schemas, remote tools, game-side delivery, expanded player counts and game-peer AI/editor replication remain separate work.

## Rendering, assets and CE regression

The same final application passes actual Windows/WebView/GPU tests for source reflection resources, native monitor idle/talking vertex animation, pause/clip control, owned default surface materials, recursive scenery drag/import with undo/redo, native QuickForge compilation and a matching MCC source-map addition. Changed imports are refused and previous builds stay intact. This is bounded renderer/native-content evidence, not complete engine presentation parity.

A separate fresh first-load test copies only Zombie Demo's map into a download folder. With no original bitmap pack or compiler tools configured, the real editor renders **124 shader materials**, including **75 compatible installed-MCC images**, plus **15 embedded lightmaps** in **9,644 ms**. Exact unique paths and native flat-image layouts are required; embedded images retain priority. Source pins remain empty. Connecting its genuine original pack restores **132 shader materials and zero substitutions**, and clears the original-cubemap reflection warnings. The eight other materials and missing external cubemaps need original resources. No native build/extraction binding is inferred from viewer compatibility.

The same normal QuickForge workspace assigns actual owned metal/grass shader paths to previously unconfigured surfaces and renders **two native material previews**, with zero native imports and no configured compiler tools. Custom shader paths remain unchanged. Preparing build dependencies still uses the existing native import/tool pipeline. Failed first-load test attempts involved incorrect tab/title assumptions; they remain preserved and are not reported as passes.

The private CE suite passes **30 native cases**, covering real dedicated-server status in all five stock modes, exact private client files, cancellation, ownership, missing first-run files, menu-only setup, current project output selection, same-filename Workshop compilation, stale/corrupted/redirected output refusal and normal/abrupt cleanup. All **127 original game files** and **2,455 reviewed source tags** remain unchanged.

The scoped client observation lasts five seconds; the separate menu-only setup observation lasts approximately 59 seconds. The server still observes **zero joined players**. The owner again reported **no usable Halo window**. New read-only observation of the owned child checks window visibility, minimization and positive bounds; a missing-window UI warning offers CE checks and independent Stop controls. A genuine hidden/shown/hidden owned-window regression and the UI warning test pass. The native CE setup trial reports an OS-visible window, which does not prove that the owner can see a menu or complete first-run prompts. Visual completion, a real join, collision walkthrough and gameplay remain unaccepted. Existing longer zero-player trials are preserved.

## Combined verification and delivery

| Check | Result |
| --- | --- |
| Windows `cargo test --workspace --locked` | 595 passed; 7 existing opt-in tests ignored |
| TypeScript 7 build/check | Passed |
| Vitest 5 frontend | 259 passed |
| Browser/UI regression | 125 passed |
| Offline source/workflow scripts | 59 passed |
| Native interface-probe tests | 2 passed |
| pnpm frozen dependency lock | Passed |
| Optimized Windows executable / NSIS | Built |
| Genuine direct/source, integrity, three-process, asset/GPU, first-load/default-texture and CE suites | Passed within the scopes above |

Consolidated integration executable SHA-256: `9ccd6ed9939e38686e92deffae560652db5e17528a41b6854f4caf5bac74b886`. All six final integration receipts above bind this exact executable. Source and portable archives retain independent checksum verification. Clean-machine installation and hosted GitHub CI are not claimed.

The later home-presentation follow-through uses executable `1d68543d24ceb5769dd3303fe9c3d758555cab9aaa39ee95075532af7be17410`. It sharpens/softens/reorients the native monitor and shares source preparation across library visits. Its own native home check and full asset/animation/import/native-build regression pass, as do 262 frontend tests, 125 browser checks, TypeScript and 59 offline scripts. Core/native transaction/protocol code is unchanged by this UI follow-through; the six-suite results retain the integration executable identity above. [Exact presentation and timing evidence](NATIVE_ASSETS_AND_SHOWCASE.md#c41-clarity-and-loading-polish).

## Publication and next work

Local master resides in `D:\Project Guilty Spark\.local\c39-native-collaboration`. The original root checkout still retains its old C41 branch and all dirty work, so publishing must use the verified master worktree. These engineering commands do not push, merge remotely or change/bypass repository rules. During the run a separate push advanced remote master to `3a9dddb` (the remote tracking reflog records 10:11 EDT); a fresh read-only remote check confirms it. The final verification/fix commits in this handoff are additional local work for the owner to publish through the existing repository controls.

The README, [current features](CURRENT_FEATURES.md), in-app catalog, C41 evidence and direct-edit backlog are updated. The GitHub connector did not expose a working repository operation, and the browser helper failed again during the final retry. [About text](REPOSITORY_ABOUT.md) is ready to paste; changing the README does not update that separate online metadata field.

Next priorities are matching-game load/traversal, a genuine CE join, expanded native schemas/direct writers, gameplay acceptance and the independent live/game-peer/protocol work. [Full backlog](UNIVERSAL_WORKBENCH_BACKLOG.md). The existing protected-branch publication process still applies.
