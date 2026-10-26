# Project Guilty Spark - Continuation 11: BSP lightmap identity and shader provenance

**Baseline:** The complete Continuation 10 source archive. Changes are confined to the editor, local file-attribution helpers, tutorial and tests. No game executable, stock map, extracted proprietary texture, or third-party editor is bundled or modified.

## Implemented and offline verified

| Engineering problem | Implementation | Evidence |
| --- | --- | --- |
| Different BSPs reuse the same lightmap page number | Use the identity `(bsp index, page index)` throughout inventory, Three.js material selection, user upload state, UI and batch resolver | `scripts/test-halo-lightmap.mjs`; `scripts/test-lightmap-batch.mjs` |
| `page_0.png` may point to multiple different images in the same map | Reject a page-only filename when more than one BSP exposes it, require `bsp_0_page_0.png`, `bsp_1_page_0.png`, etc. | Batch resolver regression cases including duplicate and conflicting files |
| Corrupt or absent secondary UVs could activate a lightmap | Only attach a material lightmap when its buffer is complete, finite, bounded, and the specific cached material advertises second UVs | `materialLightmapKey` and numeric validation tests |
| Loading an image while switching maps may apply pixels to the wrong cache | Discard the loaded image and dispose its graphics resources if the map SHA-256 changed mid-load | World Editor code; graphical interaction awaits Windows QA |
| Shader name collisions or bump/detail-only tag references can produce a false diffuse mapping | Refuse ambiguous basename matching across tag folders and never treat an unverified bump/detail dependency as a base map | `scripts/test-shader-matching.mjs` |
| Users need to know what 'BSP' and 'lightmap page' mean | New 13th Academy lesson and explicit hover text on numbered lightmap selection | `scripts/test-academy.mjs` |

**Use in World Editor:** select a classic cached map, inspect its source render mesh, expand the Material Lens panel, then select locally owned DDS/PNG/JPEG/WebP images. For one BSP, `page_0.png` remains supported; if more than one BSP has page 0, use `bsp_0_page_0.png` and `bsp_1_page_0.png`. BSP numbering in filenames is **zero-based**; the UI displays **BSP 1**, **BSP 2** for readability. Files are loaded in memory for this session only and never included in the source ZIP or saved project file.

## What this does NOT implement

- Automatic Halo `bitmaps.map` extraction. Halo shader base/detail/bump resources still require real tag/data decoding or trusted separately installed extractors and supported local file selection. The conservative shader matcher uses verified tag references **when those references have actually been parsed**; this source does **not** claim that all `senv` dependencies are parsed.
- Actual Halo shader blending, full lightmap atlas extraction, radiosity, fog, water, skies, reflection, skybox movement, animation or texture/color-space parity. The Three.js preview is not the game rasterizer.
- Rebuilding imported BSPs, collision BSP, render BSP, PVS/portals, lighting, AI, multiplayer netcode or game-runtime map loading. Those remain the product's highest-priority engineering tasks; see `PHASE_01_TO_10_ACCEPTANCE.md` and `REMAINING_WORK.md`.
- A native Rust/Tauri compile or Windows graphics test. This environment has Node/TypeScript but no installed Rust toolchain and no local Halo game/test fixture.

## Acceptance / safety gates still required

1. Run `npm run test:offline` from a clean extraction; verify lightmap and shader regressions pass.
2. On a development Windows PC, run full `pnpm check`, `pnpm test`, `cargo test --locked`, and `pnpm desktop`; repair any integration/type errors without updating licensed Halo files.
3. Import an owned Halo 1 scenario with **two BSPs** whose local lightmaps both contain page 0. Attach `bsp_0_page_0.png` and `bsp_1_page_0.png`, switch BSPs, and confirm different images remain attached. Select `page_0.png` in batch mode: it must be rejected for ambiguity.
4. Test source switching during a slow local image load; ensure stale pixels aren't attached to the new map.
5. Compare a verified game screenshot with the editor and document the rendering differences. No green in-app lightmap state should be labeled game-tested based on this preview.
6. When BSP source rebuilding and gameplay tests eventually exist, verify compiler result, actual collision, lightmap placement and AI behavior **inside the matching engine** before marking those phases complete.

## Historic technical references

- [c20 - Halo 1 maps and engine/cache variants](https://c20.reclaimers.net/h1/maps/). Resource maps and tag spaces differ by runtime; cache indices alone cannot be treated as portable source assets.
- [c20 - shader_environment](https://c20.reclaimers.net/h1/tags/shader/shader_environment/). Halo terrain shaders combine base, detail, bump and lighting inputs; one texture does not represent the full shader.
- [c20 - BSP lightmaps](https://c20.reclaimers.net/h1/tags/scenario_structure_bsp/lightmaps/). Halo caches use baked-lighting data and lighting-specific geometry semantics.
- [Halo Maps archive - Aether (2009), TheFieryScythe](https://www.halomaps.org/hce/detail.cfm?fid=4312). Historical benchmark for texture/lightmap extraction and portal/fog-plane transfer; Guilty Spark does not bundle or copy its binaries or code.
- [Open Carnage - Kavawuvi cache format documentation](https://opencarnage.net/index.php?/topic/6693-halo-map-file-structure-revision-212/). The original tooling community's cache research provides a reference for pointer and resource-space design.

**Evidence language:** Tested *source helpers* and *read-only UI code*; real-game fidelity remains unverified. The original ten-phase requirements, including Zombie Apocalypse, First Contact and networked AI, are not retired or marked complete.
