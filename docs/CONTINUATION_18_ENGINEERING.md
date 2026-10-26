# Project Guilty Spark — Continuation 18 engineering handoff

**Source baseline:** exact `Project_Guilty_Spark_07_Halo_Modding_Brain_Continuation_17_SOURCE.zip`. Delivery is an additive source continuation, **not** a compiled or gameplay-proven Halo map. The original uploaded Halo files remain read-only.

## Engineering objective

Continuation 16 resolved real classic `senv`/`soso` primary bitmap IDs. Continuation 17 added native top-mipmap decoding for **internal** `bitm` pixels. In classic PC/Custom Edition many stock pixels live in `bitmaps.map`. The unsafe shortcut would be to take a bitmap's external offset and read arbitrary bytes at that location from a supposedly compatible resource file. That is exactly what this release **does not** do.

## Implemented

- `crates/spark-core/src/resource_map.rs`: independently written, bounded reader for Halo 1's **16-byte resource-map header** and 12-byte index entries, including relative path offsets, explicit count limits, checked spans, path sanitization and file SHA-256 validation. It reads only the user-selected, exact-name `bitmaps.map` file referenced by the current project's recorded resource hashes; it will not silently use a global resource folder. A second SHA-256 pass uses the same already-open handle to detect source changes during the operation.
- **Resource Index Audit**: `audit_owned_bitmap_resources` returns index count, matching/absent/duplicate exact bitmap paths, the pinned resource hash, and an explicit warning. It does not dump or distribute texture pixels or local resource paths. Available in World Editor → Material Lens → **Verify selected bitmaps.map index** after choosing the project's matching resource directory under Build.
- **Conditional pixel read**: for an internally represented classic PC/CE `bitm` whose image record sets `external` (`0x100`), the top-mip reader may read external raw pixels only when the matching SHA-256-pinned resource index has **one exact case-insensitive, slash-normalized bitmap tag path** and both the selected mipmap and declared raw extent are completely inside that entry's bounded byte range. All arithmetic is checked. It still uses the existing first-mip-only DXT1/3/5, BGRX/BGRA reader. No byte writes or stock-map replacement.
- The TypeScript response bridge rejects wrong project/cache or resource hashes, different bitmap IDs, malicious source-kind values, malformed DDS payloads and invalid audit metadata. Async results are discarded on project switching. No image bytes are serialized into projects or export packages.
- The Modding Academy's material lesson now teaches external resource auditing and the distinction between *external raw pixels* and *external tag metadata*.

## Conservative compatibility and limitations

| Case | C18 behavior |
| --- | --- |
| Classic Demo, PC or CE internal 2D first mip | Existing C17 read-only preview retained |
| PC/CE external raw pixels, internal bitmap tag body, unique exact indexed resource span, pinned SHA | Source path added; **native/real-map unverified** |
| External tag *body* (`tag.external == true`) | Refused: tag metadata relocation requires different loading logic |
| Resource path absent, duplicated, sanitized path invalid, raw offset outside exact entry | Refused, no fallback to fuzzy filename or offset guessing |
| Resource hash changed, bad index, wrong file name, unselected resource set | Refused |
| External resource header `kind` value 0/1 | Both documented conventions accepted as *candidates*; not independently trusted for pixel provenance |
| MCC H1A ipaks, compressed/protected, swizzled, cube/3D, BC7 | Still unsupported |
| Full shader behavior, lightmap pixel loading, color-space fidelity, engine radiosity | Still unimplemented/unverified |

**Research uncertainty:** The [SnowyMouse map structure reference](https://gist.github.com/SnowyMouse/39168bddd597549038a35d78aee39513) describes bitmap resource type code `0`; the current [c20 Halo 1 maps guide](https://c20.reclaimers.net/h1/maps/) documents `1`. This release avoids selecting an arbitrary convention, but a type value + matching path does not prove a layout without actual test assets. The bridge may refuse valid stock resources whose raw data isn't indexed under the exact tag path. That is the intended safe failure mode.

## Evidence and required tests

- New TypeScript response/metadata tests: `scripts/test-resource-bridge.mjs`, included in `npm run test:offline`.
- Added Rust source-level synthetic tests for bounded header/index parsing, exact path matching, offset containment, malformed/truncated files, traversal attempts, source SHA mismatch and an external bitmap preview. **Those Rust tests are not claimed as executed unless Cargo actually runs.**
- Need a Windows build: `npm run test:offline`, `npm run check`, `cargo test -p spark-core`, `npm run desktop` with the project's dependency and editing-kit prerequisites. Then test **legally owned** classic PC/CE resource maps against an independently verified original texture, including negative fixtures and resource-swapping checks. Do not distribute the source game files.
- The practical first owner test is to open a classic map, select Build → Choose source resources, select its genuine matching original `bitmaps.map` directory, then World Editor → Material Lens → Verify selected bitmaps.map index. Record whether the resource path matches the selected bitmap. If unavailable or ambiguous, continue with an explicitly exported local DDS/PNG. The original game installation must remain unchanged.

## Unfinished priorities

1. Real original resource fixture evidence, full external bitmap **tag metadata** loading, engine-correct pixel orientation/format and BSP lightmaps.
2. Editable imported BSP-to-JMS reconstruction, collision and portal/PVS compilation verified in Tool/Sapien.
3. Playable First Contact mission with compiled AI encounters, scripts and cameras.
4. Actual in-engine Firefight and Zombie Apocalypse behavior.
5. Private multiplayer session/variant end-to-end tests and genuine AI state replication across multiple clients.

Do **not** label the ten Codex phases complete based solely on offline mocks, syntactic source checks or a rendered texture. All gameplay acceptance gates remain open.
