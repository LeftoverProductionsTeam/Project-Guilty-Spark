# Project Guilty Spark — Continuation 4 engineering handoff

**Date:** 2026-10-25 / 2026-10-26 (US Eastern)  
**Baseline:** `Project_Guilty_Spark_07_Halo_Modding_Brain_Continuation_3_SOURCE.zip`, preserved as an earlier external artifact.  
**Version:** 0.3.0 developer source + Continuation 4; no installer or game-play verification.

## Summary

Continuation 4 makes **real source-level engineering progress**, particularly on creating sealed tunnel-to-tunnel geometry, texture source preparation, and producing Halo 1 Editing Kit-style script layouts. It does **not** finish the ten-phase product. Source code and ZIP validity are not evidence that Halo can run a map or network AI.

### 1. BSP geometry and caves: source junctions, not game junctions

- `crates/spark-core/src/quickforge.rs`: matching `caveTunnel` rims (outer **and** inner polygons, matching vertex positions, unique 1:1 pairing, opposite outward normals) omit both redundant annular end caps during **JMS source mesh** generation. Adjacent segments now share a sealed orientation-correct source seam. A diagnostic `TUNNEL_SOURCE_SEAM` explains the bounded result; ambiguous and incompatible joins fail closed. Geometry validation exempts only exactly joined, plane-touching tunnel AABBs from its overlap blocker.
- `src/caveJoinAnalysis.ts` / `src/components/QuickForge.tsx`: frontend reports exact rim matches and source-weld eligibility, while `compileReady` and `gameplayVerified` remain **false**.
- `crates/spark-core/tests/terrain_caves.rs`: regressions added for merged source triangle counts, preserved manifold edge topology, rotated/offset nonmatches, compiler gate and source-only export.
- **Fail-closed game-build gate:** `export_sources` includes a cave-to-room CSG/collision/PVS/navigation blocker, so source JMS can be exported but a QuickForge *playable build* cannot be declared ready. This is intentional until tested room/tunnel CSG union, Portal/PVS, collision, lightmaps, AI navigation and actual Halo runtime load are implemented. Original compiled BSP caches are immutable.

### 2. Local texture source pipeline

- `src/haloDds.ts`: bounded read-only DXT1/3/5 and standard RGBA8/BGRA8 top-mip DDS decoding, including row-pitch, dimensions, alpha/channel-mask and volume/cubemap safety checks.
- `src/haloTiff.ts`: **new** deterministic baseline TIFF 6.0 RGBA8 encoder, one uncompressed strip, RGB photometric, 8 bits per sample, explicit straight alpha (`ExtraSamples=2`), top-left orientation and bounded pixels.
- `src/components/World.tsx`: user-selected `.dds` to `.tif` source download action. It never writes into an installed game. Assigning the DDS to an actual shader-tag region remains a **preview** only.
- `scripts/test-tiff.mjs`: TIFF metadata/row/alpha/bounds/determinism and DDS→TIFF regression checks. An independent Pillow decode of a sample confirmed exact RGBA pixels and alpha.
- **Not yet implemented:** automatic decode of Halo `.bitmap` tag/image resources including `bitmaps.map`, bitmap permutations, shader combinations, diffuse+lightmap compositing, alpha blending, sky/weather/water animation, baked lightmap extraction, and Tool/Invader bitmap-import receipt. Conversion to a well-formed `.tif` is not proof the Halo compiler accepts it.

### 3. Campaign/Firefight script source staging

- `src/hceekSourcePack.ts`: **new** source-tree exporter places mission, cinematic and Firefight HaloScript files under `data/levels/quickforge/<scenario-slug>/scripts/`, with reviewed optional startup activation, JSON dependency manifests, requirements and explicit `gameplayVerified:false`. Does not place files in a game or call Tool.
- `src/sourceZip.ts`: safe deterministic virtual-path ZIP writer with traversal, duplicates, file-size and total-size limits. The existing flat source ZIP remains unchanged.
- `src/components/CreatorStudio.tsx`: dropdown for startup activation and a button to download the source tree for an eligible QuickForge singleplayer Firefight/Zombie authoring project. No runtime calls.
- `scripts/test-hceek-staging.mjs`: scenario slug compatibility, path checks, activation and deterministic output tests. ZIP/CRC verified with an independent ZIP reader.
- **Not yet implemented:** generating actual `.scenario` AI encounters, squad palette, hints/navigation, cutscene point tags, native infection rules, run-time score/lives, compiled script binaries or actual gameplay. H1/MCC engine version and licenses remain a hard build dependency.

### 4. What tests mean, and do not mean

| Test | Evidence / expected state |
| --- | --- |
| Node 22 `npm run test:offline` | **10 suites PASS**, includes previous tests and new TIFF/CE source-tree tests |
| Independent TIFF image decode | **PASS** via Pillow, test sample with four distinct RGBA pixels |
| TypeScript/TSX syntax parse | **PASS**, 47 modules; no dependency-resolved type check |
| Offline geometry edge topology reproduction | **PASS**, matched tunnel pair with no open/nonmanifold edges in separate Python reproduction |
| ZIP/CRC and source-file SHA-256 verification | **PASS** on final packaged source archive, not a gameplay test |
| `cargo test`, actual Rust runtime mesh output, typecheck via full npm deps | **NOT RUN** (toolchain/dependencies not available here) |
| HCEEK bitmap/script/JMS compiling and game load | **NOT RUN**; no installed authorized Tool/Sapien/Invader fixtures |
| Real Halo multiplayer AI / Zombie Apocalypse | **NOT RUN**; requires a supported runtime and 2+ clients |
| PowerPC Mac Demo legacy test | **NOT RUN**, requires actual G4 and compatible engine/resources |

All earlier product requirements remain active. See `ORIGINAL_92_REQUIREMENTS_RECONSTRUCTION.md`, `PHASE_01_TO_10_ACCEPTANCE.md`, `REMAINING_WORK.md`, and historical research document. Original word-for-word Codex Phase 3–7 prompts are not completely recoverable in the available archive, so traceability is functional rather than a literal verified transcript.

### 5. Relevant community / tool references

- [Halo 1 editing source types — c20 Reclaimers](https://c20.reclaimers.net/h1/source-data/) — `.jms`, `.tif`, `.hsc`, separate compiled tags.
- [Halo 1 bitmap tags — c20 Reclaimers](https://c20.reclaimers.net/h1/tags/bitmap/) — bitmap metadata/resources and the difference between a tag and a standalone image.
- [Invader toolkit — SnowyMouse](https://github.com/SnowyMouse/invader) — image import formats and tag/compile tooling to research and integrate with documented licenses.
- [Halo Custom Edition mapping guide — HaloMods classic archive](https://www.halomods.info/viewtopic.php?t=80787) — historical `tool structure`, `bitmaps`, `build-cache-file` workflow.
- [HEK BSP Tag Converter 2.0 — Halo Maps (2006)](https://halomaps.org/hce/detail.cfm?fid=1609) — historical example of OBJ/material/bitmap extraction; no executables or source included here.

### 6. Required next engineering gates, in order

1. Compile Rust and full frontend on a clean Windows PC, then run the new Rust tunnel regression tests and inspect any failures before using Tool.
2. With user-owned legal Halo test fixtures, implement a bounded `bitmap`/resource-map decoder and map actual shader references to image data, lightmaps and UV channels; compare pixel output with known tool exports.
3. Produce **watertight joined room↔tunnel** source CSG with collision and portal visibility, confirm actual Tool structure/lightmap compile and game load; preserve source hash and error logs.
4. Generate scenario tags, squad/encounter paths, camera markers and compile scripts in a disposable HCEEK workspace; demonstrate one end-to-end **First Contact** playthrough.
5. Restore Zombie Apocalypse behavior with original source authorizations and evidence; distinguish local campaign AI from native/networked multiplayer AI.
6. Build a supported runtime-specific host/join protocol and **two-client** game tests for AI state, damage, deaths, respawns and disconnects; never treat matching manifests as network proof.
7. Complete share/install/update/rollback, verified tool selection, creator tutorials, polished game-derived local interface, and explicit supported target exports including PowerPC Demo and MCC.

Safety rules: never overwrite Halo stock maps or installed assets, change firewall/anti-cheat settings, run archived community binaries automatically, or distribute proprietary Halo game data. Preserve all earlier source and data snapshots for rollback.
