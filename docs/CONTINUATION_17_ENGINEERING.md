# Project Guilty Spark — Continuation 17 engineering handoff

**Baseline:** exact Continuation 16 full-source ZIP (SHA-256 `898bbbd96d6c612b4c161136a12746c6ca57edac68870ffdb8f222a449a62898`). **Delivery:** full source only, not a compiled Windows installer or a playable Halo map. Earlier source files and the ten-phase requirements inventory are retained.

## Implemented: first read-only native bitmap-pixel previews

Continuation 16 resolved the actual `senv` base-map and `soso` diffuse-map **tag IDs**. Continuation 17 adds a deliberately limited native path from a resolved `bitm` tag **to actual top-mip pixels in the preserved classic map**, rather than only finding a matching filename:

- `crates/spark-core/src/bitmap_preview.rs` reads the *same bounded, SHA-256-verified preserved source snapshot* used by the original cache reader. It requires that the selected tag ID is a real `bitm` from that exact inspection; source identity is checked again before any bytes are returned.
- Supports linear **2D, one-slice, internal-to-the-map** `DXT1`, `DXT3`, `DXT5`, `x8r8g8b8` and `a8r8g8b8` first mipmaps (DDS equivalents BC1/BC2/BC3 and 32-bit BGRA). Values/flags, bitmap array count, tag-memory pointers, raw file offsets and declared pixel lengths are individually validated.
- Limits dimensions to 4096 per edge / 16 Mpixels, first-mip raw payload to 16 MiB, bitmap array count to 2048. No unchecked arithmetic, absolute file output, process launch or cache mutation. Refuses unsupported/swizzled/3D/cubemap/MCC/external raw data rather than guessing offsets.
- `src-tauri/src/app.rs` provides `preview_owned_cache_bitmap`, restricted to the selected project's preserved source. The command performs its work outside the UI thread. It doesn't accept an arbitrary filename/path from the renderer.
- `src/ownedBitmapPreview.ts` validates the **tag ID, source SHA-256, dimensions, format, base64 payload and returned DDS header** before the existing bounded DXT/32-bit decoder exposes pixels to Three.js.
- World Editor Material Lens has a per-shader **Preview bitmap from map (internal)** action for resolved, nonexternal bitmap tags. It displays temporary textures in the 3D preview; user-selected local DDS/PNG images remain the fallback. Textures never enter the persistent project format. The selected project ID as well as the map hash is checked before an asynchronous assignment is committed.
- The Modding Academy explains what the action does and the external-resource limitation.

## Proof and limitations

| Check | Status |
| --- | --- |
| Existing complete offline suite (`npm run test:offline`) | PASSED here |
| New DDS response identity, metadata mismatch, invalid base64 and synthetic red-pixel tests | PASSED here |
| TypeScript/TSX source parsing; isolated strict TypeScript check for new decoder wrapper | PASSED here |
| Native Rust unit tests for internal DXT3/BGRA, invalid raw pointers, flags, resource cases and on-disk SHA integrity | Added; **NOT EXECUTED**, because Rust/Cargo is unavailable here |
| Actual classic Halo PC/Demo/Custom Edition cache pixel rendering | **NOT TESTED** with original Halo assets |
| Complete Tauri app / Windows startup and visual shader fidelity | **NOT TESTED** |
| Automatic `bitmaps.map` tag metadata and raw resource decoding | **NOT IMPLEMENTED**; user can supply their own extracted local image |
| Lightmap pixel extraction, all pixel formats, shader blending/water/sky, transparency and animation | **NOT IMPLEMENTED** |
| Playable BSP, portal/collision rebuilding, First Contact, AI waves, Zombie Apocalypse/multiplayer sync | **NOT IMPLEMENTED / UNVERIFIED** as described in ten-phase matrix |

These are **small, testable engineering changes**, not proof of a finished Halo renderer. A real-map test must demonstrate texture orientation, alpha, gamma and correct base-map attribution against the actual engine before those outcomes may be marked verified.

## Independent source-format references and original researchers

- **SnowyMouse/Kavawuvi**, *Halo map structure*, cache and resource-map layout: https://gist.github.com/SnowyMouse/39168bddd597549038a35d78aee39513
- **c20 Reclaimers contributors**, Halo 1 bitmap field formats, flags and `pixel data offset`: https://c20.reclaimers.net/h1/tags/bitmap/
- **Sigmmma/Reclaimer contributors** (`bitm.py` field layout; independently interpreted and not copied as executable parser code): https://github.com/Sigmmma/reclaimer/blob/master/reclaimer/hek/defs/bitm.py
- **c20 Reclaimers**, map resource dependencies and recommended tag/source rebuild workflow: https://c20.reclaimers.net/h1/maps/

The old forums identify a conflict between historical resource-map *type enumeration* conventions; in the absence of an actual verified original `bitmaps.map` fixture, this continuation refuses external pixel data entirely. The source implementation is independent and does not include historical GPL code or copyrighted game textures.

## First owner test (on a separate copy of the source)

1. Extract the Continuation 17 source ZIP to a **new directory**; keep Continuation 16 and original game maps unchanged.
2. On Windows with the project's specified Node/Rust/Tauri dependencies, run `npm run test:offline`, `npm run check`, and native `cargo test -p spark-core`; record the first failure verbatim. **Do not copy exports into a real Halo installation yet.**
3. Launch the app, import a legally owned classic Halo PC/CE or Demo map, select World Editor > Material Lens, and open a shader whose **Primary bitmap** shows an exact tag path.
4. If its bitmap is internal, choose **Preview bitmap from map (internal)**. For stock bitmaps stored externally, confirm it reports the external dependency and still accepts a manually selected exported image. Compare against a known base/diffuse texture, not its detail or bump partner.
5. Switch projects during an intentionally slow bitmap read; confirm the prior project's image is never shown on the new map. Reopen the first project and confirm the source checksum and original file have not changed.
6. Record evidence: map version, shader class + ID, bitmap class + ID, whether resource data was internal/external, expected visual result and actual screenshot. Do not redistribute the original cache or copyrighted bitmap pixels.

**Release gate:** native compilation + real original-cache pixel validation before calling this automatic bitmap feature engine verified. All ten original Codex phases remain open to their respective acceptance tests.
