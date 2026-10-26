# Project Guilty Spark — 07 Halo Modding Brain — Continuation 24

**Release date:** 2026-10-26  
**Baseline:** exact `Project_Guilty_Spark_07_Halo_Modding_Brain_Continuation_23_SOURCE.zip` (SHA-256 verified before extraction; see top-level `SOURCE_DIFF_FROM_PREVIOUS.txt`).  
**Output:** complete **source** archive, not a compiled application, supported Halo map, in-engine Firefight/Zombies game, or playable multiplayer release.

## Engineering objective

Earlier continuations added an authored BSP edge graph (C23) and Halo Tool WRL import (C9), but two important diagnostic gaps remained:

1. An edge could appear topologically sound under endpoint-only matching while another distinct triangle vertex lay *inside* it. This is a **possible T-junction**, a geometry condition that Halo Tool may warn about. The existing C23 report explicitly stated T-junctions were not checked.
2. Imported WRL compiler diagnostics could be overlaid/framed but not correlated with a source brush. The author had to hunt around the viewport to determine which editable brush might be responsible.

**Authoritative references consulted:**

- [Reclaimers, Halo 1 BSP troubleshooting](https://reclaimers.net/h1/guides/levels/bsp-troubleshooting/): source must generally be a sealed volume; exceptions are material-dependent; errors and WRL diagnostics remain authoritative. Floating faces, T-junctions and different classes of portal failures cannot be diagnosed from an edge graph alone.
- [Reclaimers, Halo 1 Tool structure](https://www.reclaimers.net/h1/h1-ek/h1-tool/): `tool structure <scenario-directory> <bsp-name>` imports JMS to a compiled structure BSP and may emit WRL geometry.
- [Reclaimers, portals and clusters](https://www.reclaimers.net/h1/guides/levels/portals-and-clusters/): correct collision hulls do not imply correct portal planes/visibility clusters; explicit portal semantics still need Halo Tool.

## Implemented and testable code

1. **Bounded vertex-on-edge diagnostic** (`src/haloMeshIntegrity.ts`): the coordinate-edge graph now inspects unique quantized points strictly inside edge segments. Candidate points are selected from per-axis sorted windows along each edge's longest axis, avoiding naive every-vertex-vs-every-edge iteration. A strict 2,000,000 candidate comparison ceiling and `tJunctionScanComplete` flag protect the UI from unbounded work or misleading clean status. Findings include capped sample triangle IDs. No geometry is welded, shifted, triangulated or modified.
2. **Caution-only source gate** (`src/sourcePreflight.ts`): possible T-junctions produce compiler-review warnings. A scan exceeding its budget emits an explicit **INCOMPLETE** warning; zero findings from an incomplete scan are not treated as success. Duplicate, degenerate, nonmanifold and winding source blockers introduced earlier stay intact.
3. **Versioned private evidence** (`src/haloBspSourceReport.ts`): topology report schema bumped to `guiltyspark-halo1-bsp-source-topology/v2`, with candidate count, scan completion, checked budget and capped sample triangle IDs. Schema v1 consumers must update; the exporter never silently pretends v1 represents these fields. Report contains no source positions, tag paths, imported cache bytes or machine paths. Compiler/gameplay validation remains explicitly false.
4. **WRL-to-Brush Finder** (`src/haloWrlSourceMatch.ts` and QuickForge UI): a bounded, read-only heuristic compares up to 192 deterministic samples from a user-selected Halo 1 WRL to the axis-aligned bounds of up to 256 current authored source brushes. It uses a 0.25 editor-unit radius and refuses ambiguous ties from overlapping brushes. Candidates can be selected in the editor without changing geometry. It checks buffer validity and source-brush part coverage. It cannot prove the source of a compiler error or distinguish triangles inside a large brush's AABB. Source changes invalidate the imported WRL and hide candidates; source-identity association is **user asserted, not cryptographically verified**.
5. **Academy / creator guidance**: source topology lesson and Tool WRL troubleshooting lesson now describe candidate T-junctions, incomplete scans, WRL brush matching, and why a Halo Tool build is authoritative.
6. **Regression and limits**: `scripts/test-bsp-tjunction.mjs` and `scripts/test-wrl-brush-match.mjs` exercise exact/coincident vertices, separate flat-shaded geometry, report schema, incomplete bounded scans, ambiguous multi-brush overlap, invalid input, non-assignment to distant brushes and sampling limits. Both are part of `npm run test:offline`.

## Safety, accuracy and limitations

- **Not a repair tool.** No direct edit of stock `.map`, original tags, source buffers or compiler diagnostic files. No guessed material symbols, portal rebuild or terrain CSG.
- **Potential false positives/negatives.** T-junctions within ~5e-6 editor world units are candidate hints, not exact compiler classifications. A truncated scan must be labeled. AABB proximity can associate a WRL error near a room even if the offending triangle belongs to another nearby face; overlapping candidate bounds are explicitly rejected as ambiguous. `WRL` files are not authenticated to a compiler job automatically.
- **Material exceptions.** Some purpose-built planes use special render-only, portal or fog materials. Boundary edges are therefore cautions until author and compiler verify the material semantics; no blanket hole-filling or welding is performed.
- **No engine truth claims.** Validated source graph, WRL overlay and geometry-walk sandbox are not compiled collision, portals/PVS, lightmaps or actual gametype/AI gameplay. Do not overwrite existing Halo installations or original tag roots while testing.

## Verification

- C23 input archive checksum and integrity verified before extraction; source files transferred into a clean C24 folder.
- Complete Node dependency-free offline suite including two new tests ran successfully (45 scripts total).
- Changed pure TypeScript files passed global `tsc --noEmit --strict` with bundler module resolution.
- QuickForge TSX parsed/transpiled without diagnostics. Full frontend production build cannot be claimed without installed frontend dependencies; native Rust/Cargo and Windows runtime unavailable in this environment.
- Bounded diagnostic benchmark at 32,000 triangles (8,000 disjoint synthetic tetrahedra) completed in about 0.30 seconds in this Linux environment, reported `tJunctionScanComplete=false` after exhausting its comparison budget. This is not a user-PC performance guarantee.

## Next priority (unchanged)

Compile an original source QuickForge Test Arena through an **isolated, correctly versioned** Halo CE/H1A editing kit. Inspect `Tool structure` warnings, WRL and generated tags; establish shader/tag dependency closure; get a genuinely playable `.map` with collision, accurate scenario placements and five stock gametypes. Then continue true imported BSP editing, full bitmap/lightmap parity, authored CSG/portals and specific engine-backed Firefight/Zombies, campaign, AI sync and legacy runtime testing. A longer requirement ledger is preserved in `docs/CONTINUATION_24_REQUIREMENT_TRACE.md`.
