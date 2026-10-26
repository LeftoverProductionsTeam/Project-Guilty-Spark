# Project Guilty Spark - Continuation 16 engineering handoff

**Baseline:** The complete `Project_Guilty_Spark_07_Halo_Modding_Brain_Continuation_15_SOURCE.zip` provided in this conversation. **Deliverable:** complete replacement source ZIP, not a binary release. **Preservation:** original Halo cache and resource files are never modified by this new code.

## Engineering problem addressed

The World Editor already renders authentic compiled BSP triangles, retains shader tag IDs, accepts user-selected DDS/PNG texture previews and tracks BSP-specific lightmap pages. However, in the prior version, the native tag reader never populated `shader_environment` (`senv`) and `shader_model` (`soso`) bitmap dependencies. Texture batch matching therefore tended to fall back to shader filenames, which could select the wrong texture, especially in shader collections with a diffuse/base map, detail maps and bump maps.

**Continuation 16 adds genuinely typed, source-cache-derived bitmap provenance:**

- Classic PC/Demo/Custom Edition `senv`: read the primary **Base map** dependency, primary/secondary/micro detail maps, and bump map at independently documented offsets.
- Classic `soso`: read the primary **Diffuse map** dependency, a distinct **Multipurpose map** and the **Detail map**.
- A dependency is accepted only when its compiled 16-byte tag reference contains class `bitm` AND its datum belongs to a `bitm` tag in the very same bounded cache tag index.
- Every supported shader records `primaryBitmapStatus` as `resolved`, `missing`, `invalid` or `unavailable`. Old exported inspections without this field remain readable; their attribution is **legacy-unverified** in the audit.
- Invalid, absent or external/unreadable primary references **cannot** trigger filename fallback. Shader data is never patched. Adding inspected references does not create editable numeric or tag-reference fields.
- `senv`/`soso` dependency offsets are only enabled for Halo cache versions **6, 7 and 609**, and only for direct in-cache shader data. This does **not** claim parity with Xbox, H1A/MCC, OpenSauce or protected formats.

## World Editor / Material Lens

- The panel shows the resolved primary bitmap tag **path**, or the explicit reason why it cannot be resolved. Manual local texture previews are still available for unsupported shader structures.
- New **Export material dependency report (.json)** action includes the original cache SHA-256, cache version, shader IDs/classes, verified primary bitmap tag paths and IDs, other bitmap roles, BSP indices and rendered triangle coverage. No texture pixels, executable files, original map bytes or operating-system file paths are included.
- The exporter checks safe integer ranges and material index bounds, rejects duplicate tag identities and caps material section counts. A malformed cache must not crash the entire World Editor.
- The Modding Academy's material/lightmap lesson explains genuine tag-datum matching, why diffuse and bump maps differ, and how to review the export without confusing preview with actual compiled lighting.

## Offsets and original research / attribution

The numbers below are field offsets from the **beginning of each classic compiled shader tag body**. They were independently derived from source structure sizes and checked against named tag definitions. The application does **not** redistribute or embed any third-party GPL parser implementation.

| Classic shader | Field | Offset |
| --- | --- | --- |
| shader_environment / `senv` | base map | `0x88` |
| `senv` | primary detail map | `0xB8` |
| `senv` | secondary detail map | `0xCC` |
| `senv` | micro detail map | `0xFC` |
| `senv` | bump map | `0x128` |
| shader_model / `soso` | diffuse map | `0xA4` |
| `soso` | multipurpose map | `0xBC` |
| `soso` | detail map | `0xDC` |

The Halo 1 shader parent occupies 40 bytes; compiled `TagDependency` has a four-character class at +0 and its datum at +12.

**Primary original references:**

- Reclaimer project by the **Sigmmma/Reclaimer contributors**, source tag definitions `reclaimer/hek/defs/shdr.py`, `senv.py` and `soso.py`: https://github.com/Sigmmma/reclaimer/tree/master/reclaimer/hek/defs
- **c20/Reclaimers community** Halo CE `shader_environment` and bitmap documentation, including contributions by **Conscars, MosesOfEgypt and SnowyMouse**: https://c20.reclaimers.net/h1/tags/shader/shader_environment/ and https://c20.reclaimers.net/h1/tags/bitmap/
- Halo 1 cache and resource-map structural reference, with original researcher credits: https://c20.reclaimers.net/h1/maps/

These sources describe the format and intended shader behavior; they do **not** certify Guilty Spark's new parser against arbitrary real maps. Inspect and attribute their source licenses independently before any code reuse.

## Validation and acceptance ledger

| Gate | Evidence | Status |
| --- | --- | --- |
| Existing offline editor/export/game-type/collision/safety suites | `npm run test:offline` | PASS in provided environment |
| New native-provenance JavaScript tests | `scripts/test-material-audit.mjs` | PASS with synthetic fixture |
| Rust unit tests for class/datum/base-vs-detail / bounded reads | `crates/spark-core/src/maps.rs` | WRITTEN; NOT RUN (Cargo unavailable) |
| All TS/TSX parsed | TypeScript compiler parser in the packaged environment | PASS (syntax only) |
| Strict isolated TypeScript checks for changed core modules | `tsc --noEmit --strict ...` | PASS |
| Windows React/Tauri startup | Native build and visual UI interaction | NOT RUN |
| Actual Demo/PC/CE map input and `bitmaps.map` pixels | Installed licensed Halo assets required | NOT RUN |
| Real shaders, animated details, radiosity, sky and alpha-test fidelity | Compare against in-engine render | NOT IMPLEMENTED |
| Complete source-to-game build and playtest | Halo Tool/Invader/Sapien/Halo runtime | NOT RUN |
| Networked AI, multiplayer Zombie Apocalypse | Two or more clients in verified supported runtime | NOT IMPLEMENTED / NOT RUN |

## Remaining ten-phase product work

1. **Authentic bitmap extraction and shader rendering:** decode real bitmap raw-data offsets, multiple images/mips, external `bitmaps.map`, DXT and non-DXT formats, sprites/cubemaps, and shader blending. Resource-map availability alone is not proof that pixels are decoded. MCC formats require a different provider.
2. **Editable imported BSP and collision:** reconstruct editable source geometry, preserve materials and normals, weld arbitrary terrain/rooms/caves, build legal collision, portals/PVS and pathfinding; reject holes/T-junctions and verify compiled Halo output. Aligned preview meshes are not equivalent to a rebuilt BSP.
3. **First Contact:** generate complete scenario/tag/object graph, compile HaloScript, AI encounters/camera/cinematics, confirm playable checkpoint flow in target runtime.
4. **Firefight / Zombie Apocalypse:** real in-engine encounters, wave scheduling, scoring, spawn safety and non-fictional player interactions. Script source alone is not an in-game mode.
5. **Multiplayer and game types:** validate all five stock modes with actual client sessions, create/import native custom variants, match map and mode hashes, enforce permissions, and deliver **real synchronized networked AI** only with a suitable runtime-specific implementation.
6. **Operational completion:** complete clean Windows and macOS builds, installed-tool version contracts, actual in-editor GUI actions, reproducible crash logs, tutorials with real credited sources and private-alpha owner acceptance.

## Safe manual Windows test path

1. Extract this ZIP into a **new directory**, never over an existing working tree or Halo installation.
2. Run `npm run test:offline` in the extracted source. Then run the documented desktop build with a supported installed Rust/Node/Editing Kit toolchain.
3. Import a known original Halo CE/PC map and open World Editor > Material Lens. Record the primary bitmap status for several `senv` and `soso` entries. Confirm that the base/diffuse identity agrees with the local Tag Browser.
4. Export the Material Audit and inspect the paths and SHA-256. Try a matching set of local bitmap images, including a shader with different bump and base map filenames. Verify only the base/diffuse image auto-matches.
5. Try a map with an external `senv` (or a cached shader format outside 6/7/609) and confirm **unavailable**, not a guessed or mislabeled texture. Save a screenshot and include any failed tag path (not copyrighted pixels) in the bug report.
6. Only after compiler and gameplay tests should the map or renderer be marked playable or engine-accurate.

**Release status:** source continuation prepared for a Windows build and owner testing. Not an installer, game patch or fully completed ten-phase product.
