# Original bitmap restoration and tag previews

Continues `1d5077f` without restarting the workbench. This pass improves read-only image interpretation and inspection; native source transactions, Baboon/Invader reconciliation, compilation, C35–C39 history and experimental research remain intact.

## C41 first-load follow-through

When a classic map has unavailable external pixels, the viewer can open the selected installed runtime's owned Blood Gulch resources independently. It matches unique native bitmap paths, image index/count, dimensions and encoding, then verifies the runtime's own pinned pixels. Embedded images always win; changed-resource verification failures do not authorize substitution. Source tag IDs, original resource pins and extraction/compiler bindings remain unchanged. Runtime selection invalidates cached viewport material attempts.

Real desktop acceptance imports the exact Zombie Demo map alone in a fresh download folder, configures no original pack or compiler tools, and opens the normal editor. It loads **124 shader materials**, including **75 compatible MCC previews**, and **15 embedded lightmaps**. The eight other shader materials still need the original pack; connecting it reloads **132 materials with zero runtime substitutions**. The map and preserved copy remain byte-identical. Missing external cubemap reflections remain explicit and are not guessed.

The same test opens an unconfigured arena: its surfaces acquire the actual owned metal shader, terrain can use the owned grass shader, and both native preview materials render without compiler tools or extraction. Custom assigned shaders remain intact. Native builds still need prepared imports or a matching tagset/toolchain. See [native first-load test](../scripts/test-runtime-textures-native.mjs) and [consolidation evidence](FINAL_CONSOLIDATION_C41.md). Earlier exact-original image coverage and test counts below describe their historical run.

## What is now readable

| Exact original Zombie Demo resource coverage | Before | Now |
| --- | ---: | ---: |
| Verified external images | 453 | **510** |
| Unproven external images | 47 | **2** |
| Outside the flat preview path | 44 | **32** |
| Embedded flat images | 142 | 142 |

The gain is **12 original packed-color images** plus **45 original shared-pixel references**. The 32 remaining non-flat cases are **27 cubemaps** and **five volume textures**. Cubemaps have a separate reflection reader; this count does not mean those reflections are all unavailable. Volume textures remain outside the flat bitmap preview.

Native `A1R5G5B5` and `A4R4G4B4` pixels now travel through bounded source reading, standard DDS headers, source/resource identity checks and the shared browser decoder. One-bit and four-bit alpha are retained. Incorrect masks, alpha flags, pitch, dimensions, truncation and false response identities remain refusals.

The two still-unproven images are `shield charge rings+` and `shield charge flares+`. Their exact image names are absent from the original index, and no complete matching native image array supplies the required witness. They remain explicit refusals. Their bytes have not been invented, renamed or borrowed from an unrelated map.

## Why the shared-pixel proof is narrow

Many historical duplicate tags reuse original pixel data while having different tag names. A missing name alone is insufficient to accept a resource range. The new reader requires all of the following:

- The exact preserved source snapshot and pinned resource hash must pass their existing checks.
- Another internally described bitmap in **that same source map** must have an identical complete image array: frame count, class, dimensions, depth/type, format, flags, registration, mip count, raw file offsets and complete declared spans.
- The witness's generation-defined image key must exist uniquely, and the original strict resource-span check must pass for the requested frame and full declared range.
- An existing selected name with a bad span, or a duplicate key, cannot be bypassed through an alias. No suffix trimming, substring search, visual match, cross-map donor, arbitrary-offset read or missing-hash fallback is introduced.

The 48-byte native records are **not deduplicated or rewritten**. Per-tag IDs and runtime/editor pointers in bytes 32–47 are never dereferenced to choose pixels. All pixel-relevant bytes in every frame must match. The immutable source/resource checks and final same-handle resource hash remain in place. The optional preview provenance identifies the actual original resource bitmap used.

This follows the native field layout in [Invader's published bitmap definition](https://github.com/SnowyMouse/invader/blob/master/src/tag/hek/definition/bitmap.json). Its `unsafe_to_dedupe` marker is respected: this is a read-only pixel relationship, not native structure deduplication or a cache patch. No Halo art or copied external implementation is added to the repository.

## A more useful tag workflow

Select a bitmap in the full **Tag editor**, or follow a bitmap dependency in **Object tags**. The compact preview shows original pixels on a transparency background, dimensions, encoding and verified storage. Previous/next controls use the actual bounded native image count. The image position is retained per map and tag while switching tools.

Shared original pixels carry a provenance note. A changed resource or source refuses the fresh preview; there is no substitute artwork. New frame labels cannot appear above old frame pixels while native loading is pending. Read-only bitmap tags use a short explanation instead of the oversized empty-schema panel, and the drawer omits unused offset/save controls for those tags. This does not implement bitmap authoring or the unfinished direct compiled-map editing workflow.

## Exact acceptance and limits

[Native challenge](../scripts/test-bitmap-restoration-native.mjs) · [Public metadata receipt](fixtures/original-bitmap-restoration-native.json) · [Publication handoff](ORIGINAL_BITMAP_GITHUB_DESCRIPTION.md)

The genuine original inputs remain pinned to source SHA `b38f35508188872b2535888193de80f766d92d3b8d53a8ada7be4fc9808a996d` and bitmap SHA `5357828124ed03b9b47dad563434465af742075ae1c991f6bb733320996f1bea`.

Real Spark/native IPC/WebView2 acceptance checks every recovered image's top-mip bytes against the unchanged original resource span: 45 complete-array shared references and 12 packed images, with both unproven images refused. It inspects actual 1555/4444 bitmap canvases, alpha values and all opaque colors against original words, exercises frame controls and the persisted tag-drawer context, and rejects a deliberately damaged private resource copy while an embedded image remains readable. There is no mocked IPC or fabricated pixel data in this native gate.

Synthetic browser contracts separately cover layout, paging, saved frame state, stale map/resource results and the slow-frame display race. Unit tests reject changed secondary-frame metadata, unequal frame counts, missing witnesses, bad spans, duplicate keys, malformed arrays and nonclassic alias attempts. Lower-level resource checks remain exact and continue to reject missing names without a source-bound witness.

Separate genuine native regressions retain Zombie/MCC world material, lightmap, decal/teleporter, fullscreen/window-control and tag-tree checks, as well as exact-pin location recovery, view-state preservation, wrong-pin refusal and partial-runtime auto-selection refusal. Their executable identities are recorded independently of the final read-only-panel spacing polish.

The final native run read and verified the 59 challenged image requests in 0.92 seconds: 57 exact original top mips returned and two explicit refusals. This is one local wall-clock sample, not a percentile or a game-framerate measurement. Alias discovery reuses one bounded metadata index per batch and reads no extra source maps. Existing 24-image, 16 MiB packed and 64 MiB decoded batch budgets remain unchanged.

Earlier failed native attempts remain preserved. They caught the real stale-frame display race and a test navigating to Level Editor before reopening its map after reload. The production race was fixed; the test now reopens its real map. No failed receipt is marked successful.

Windows locked workspace: **566 passed, seven existing opt-in cases ignored**. Frontend: **253 passed in 54 files**. Browser contracts: **98 passed**, plus the final focused preview/coverage checks. TypeScript, all 59 offline contracts and the Windows release build pass. Preservation inventories and exact timings appear in the public receipt.

Remaining work includes the two unproven images, volume rendering, every shader/effect and cubemap layout, broader runtime/source combinations, full rendering/audio parity, direct compiled-map authoring and actual target-game/game-peer acceptance. This continuation makes no new Halo compilation, game load, network replication or live-runtime claim. Existing source/compiler and C39 results retain their separate evidence and limits. Local master is retained as requested; no remote push, rules change or protected-branch bypass is performed.
