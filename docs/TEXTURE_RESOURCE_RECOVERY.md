# Original texture recovery and honest resource coverage

**Current follow-up:** [Original bitmap restoration](ORIGINAL_BITMAP_RESTORATION.md) raises verified external coverage to 510, with two unproven images and 32 cases outside flat preview (27 cubes, five volumes). It adds compact native bitmap inspection. The measurements below preserve the earlier `1d5077f` recovery checkpoint rather than rewriting its historical receipt.

This continues committed `b6fbfe8` in the existing isolated integration worktree. Native source transactions, C35–C39 history, Baboon/Invader reconciliation, the compiler pipeline and unfinished research remain intact. Direct compiled-map editing remains an independent unfinished workflow.

## What changed

New map imports save an absolute resource location, including a deliberately selected missing folder. Previously a relative location could be saved and later interpreted from a different working directory. Automatic setup also stopped immediately whenever a bitmap hash already existed, even when its recorded location no longer worked.

Classic texture recovery now examines at most 12 canonical, deduplicated local candidates from the selected project, the original map, identical preserved sources and registered/configured runtimes. Network/device/stream paths and links are refused before automatic filesystem probing. An existing bitmap pin requires **every recorded classic resource hash** to agree. Recovery changes the location, retains those hashes and saved content, reinspects diagnostics, and checks the document owner and unchanged saved project before committing. A present resource whose bytes have changed is left for the normal integrity checks to reject.

Unpinned automatic selection requires a positive external-image match and no missing supported external images. A partial runtime pack can still be connected explicitly after review. This does not create a fuzzy donor-image substitution, new map format, raw binary broadcast or remote tool command.

World previews, source materials, model/reflection previews and bounded model thumbnails now include the resource **location and complete sorted hash set** in their refresh identity. Adding the MCC shared bitmap pin or repairing a same-hash location can retry failed images. Older asynchronous results are discarded. Resource refresh no longer resets the selected BSP, camera or display mode, or replaces the document's edit history with an older project response.

## User workflow

1. Open the map. Embedded images load directly; a recoverable exact original resource location reconnects automatically.
2. Open **Inspector → Halo Textures → Found resources → Check image coverage** for an explicit read-only review. Hashing candidates happens on demand, away from the UI thread.
3. Read the verified, missing/mismatched, unsupported and embedded counts. **Connect partial resources** is an explicit choice, with remaining omissions retained in diagnostics.
4. Use **Locate Halo Textures**, **Choose resource folder** or the collapsed path input when the correct pack is elsewhere. The compact candidate list uses bounded scrolling when necessary.

## Genuine native acceptance

The opt-in [native challenge](../scripts/test-texture-recovery-native.mjs) copies the built executable into a fresh QA directory, uses real native IPC/WebView2/GPU rendering, and restarts that private library to simulate legacy and damaged metadata. It changes no installed or original Halo file. [Public metadata receipt](fixtures/texture-resource-recovery-native.json) records the exact executable and source hashes, timings, refusals and preservation checks.

The exact owned Zombie Apocalypse Demo source is `b38f35508188872b2535888193de80f766d92d3b8d53a8ada7be4fc9808a996d`; its genuine original bitmap pack is `5357828124ed03b9b47dad563434465af742075ae1c991f6bb733320996f1bea`.

| Candidate for that source | Verified external image ranges | Missing/mismatched | Unsupported | Embedded |
| --- | ---: | ---: | ---: | ---: |
| Exact original bitmap pack | 453 | 47 | 44 | 142 |
| Detected MCC legacy pack | 1 | 499 | 44 | 142 |
| MCC Custom Edition compatibility pack | No proven external image ranges | Not certified | Not certified | Map remains independently readable |

These are per-image index/range results, not counts of fully reproduced game materials. The genuine original pack still has incomplete coverage; the earlier negative MCC-pack challenge remains valid and retained.

Accepted native operations:

- A legacy relative resource location recovers to the exact original pack with all pins unchanged. The actual saved field edit and scene placement remain equal to their saved native baseline, including native `f32` quantization.
- The recovered view loads 132 shader assignments and 15 lightmap pages, with actual detail textures, reflection bindings and 308 sky triangles. Reflection bindings are per shader; they are not distinct cubemaps. The existing eight-distinct-cube budget reports explicit omissions in the unrestricted scene.
- Copying those exact resource files into a new private location and connecting through the real drawer clears and reloads material assignments. The camera, **All BSPs** selection and a wireframe mode chosen during the refresh remain intact.
- Ordinary project saving cannot overwrite the native resource pins. A deliberately staged wrong sound pin cannot be accepted merely because the bitmap matches. An unpinned 1/500 MCC compatibility candidate is not selected automatically.
- A byte changed only in the private bitmap copy causes external-image SHA refusal. A genuine embedded image still previews from the preserved map. All original resources and the preserved source map are rehashed unchanged.
- The separate native rendering regression retains actual Zombie and MCC Blood Gulch decal/teleporter image reads, material rendering, fullscreen/window controls and tag-tree workflows. Its exact executable identity is recorded separately if UI-only polish follows it.

Earlier failed QA attempts remain under their original private output directories. They caught comparisons against pre-save signed-zero/float values, a premature fixed reflection-count assumption, an incorrect accessible selector, and the existing guard refusing a test's attempted general-save pin change. The final test compares actual saved native state and stages malformed private descriptors only while its own app is closed. These failures were not converted into successful receipts or used to weaken the production guards.

## Measured performance

One local run on this Windows machine; these are wall-clock observations, not percentile or network-latency guarantees.

| Operation | Measured time |
| --- | ---: |
| Map-open click to saved exact-pin location recovery | 10.09 s |
| Explicit review of the three detected bitmap candidates | 1.06 s |
| Same-pin resource relocation through the drawer and material reload | 6.55 s |

Resource checks run on a background worker; the existing small status/library locks are not held during image-index hashing. Cache identity stores metadata only, capped at 256 source identities. Thumbnails retain their 128-image cache and two-at-a-time rendering limit.

## Verification and remaining gates

Locked Windows Rust workspace: **560 passed, seven existing opt-in tests ignored**. Frontend: **249 passed in 53 files**. Browser contracts: **93 passed**, with the compact resource drawer additionally checked after visual review. All **59 offline contracts**, TypeScript and the Windows release build pass. Synthetic UI tests cover on-demand review, narrow layout, complete resource identities and stale review refusal; they are not counted as native engine evidence.

All **146 preserved root research files** and **2,455 original CE source tags** were rehashed against the retained inventories without a mismatch. All 379 earlier ledger IDs remain, with three explicit texture-recovery records added. No experimental branch or failed native receipt was discarded.

Outstanding work includes the 47 missing/mismatched and 44 unsupported original images, broader exact donor-resource compatibility, remaining reflection/resource budgets, complete shader/audio fidelity, universal runtime conversion, direct compiled-map authoring and real target-game/multiplayer acceptance. This pass does not claim new native Halo compilation, actual game loading or editor-to-game replication; the earlier source/compiler and C39 process evidence retain their own identities and limits.

Changes remain local as requested. No protected-master push, force push, ruleset change or automatic remote merge was attempted. [Descriptive publication handoff](TEXTURE_RECOVERY_GITHUB_DESCRIPTION.md).
