# Guilty Spark · 07 Halo Modding Brain — Continuation 23

**Date:** 2026-10-26  
**Exact input:** `Project_Guilty_Spark_07_Halo_Modding_Brain_Continuation_22_SOURCE.zip`  
**Verified input SHA-256:** `603a82085dec9146d6da1569919934b9565c2d99f6062cdd126d30c3accc9b83`  
**Artifact:** complete cumulative source, **not** a finished Windows executable or playable compiled Halo map.

## Why this continuation

The classic Halo 1 `Tool structure` pipeline expects properly sealed collision volumes or explicit material exceptions. A visually snapped room is not necessarily a closed manifold, and triangulation/UV splits can produce error reports that are impossible to diagnose from the renderer alone. Continuation 22's independent source audit detected duplicate coincident faces and very short edges, but did **not** expose the full coordinate-edge graph, border/leak candidates, inconsistent orientation, multi-face edges, or disconnected shells.

Documentation consulted:

- Reclaimers BSP troubleshooting: https://reclaimers.net/h1/guides/levels/bsp-troubleshooting/
- Reclaimers Halo 1 Tool structure reference: https://c20.reclaimers.net/h1/h1-ek/h1-tool/
- Reclaimers Halo 1 map building/source dependencies: https://c20.reclaimers.net/h1/maps/

## Actually implemented

1. **Position-derived BSP shell diagnostics**: `src/haloMeshIntegrity.ts` now builds an O(triangles) read-only edge adjacency graph using 1e-6-world-unit quantized positions. This recognizes seams between separately allocated flat-shaded triangles. It counts geometric boundary edges, edges incident to >2 triangles, same-direction adjacent face winding, collapsed/zero-area triangles, duplicate faces, very short edges, and connected/edge-closed/open shell candidates. Counts are full; each kind retains at most sixteen first-triangle examples. Capped at 32,000 triangles, 96,000 vertices and +/-2048 world units. No vertices are welded or changed by the audit.
2. **Source export blocking for concrete faults**: `src/sourcePreflight.ts` blocks source JMS export when it finds duplicates, degenerate triangles, non-manifold edges or inconsistent face winding. Open edges, separate shells and short edges **warn** rather than universally block, because Halo supports particular material-based open-surface exceptions and the audit cannot infer all of their intended use. Existing Rust validation remains required and no native tags/maps are modified.
3. **Workable editor diagnostics**: QuickForge → Geometry & Build now displays the source edge-graph counts and explains their limits. It can select the editable brush holding a representative triangle from each issue category. Selection is a normal editor operation, **not automatic repair** or geometry mutation.
4. **Private source report**: `src/haloBspSourceReport.ts` creates a bounded, schema-versioned JSON document associated with the current validated Rust source SHA-256 and containing counts and triangle indices, no map bytes, mesh positions, asset tag paths, machine paths, user data, secrets or original game assets. It explicitly records that compiler, collision, portal and gameplay verification is `false`, regardless of preflight status. The report cannot be exported from an outdated mesh or missing/malformed source identity.
5. **Guidance/polish**: tool-WRL Academy lesson, Halo vocabulary, 07-brain handoff and README describe the distinction between coordinate-edge prediction and actual Halo structure compiling. Removed a duplicate harmless state setter in the QuickForge wizard.
6. **New regression suite**: `scripts/test-bsp-source-topology.mjs` covers a position-closed tetrahedron with split vertices, a missing face, flipped winding, a three-face edge, a duplicate face, a zero-area triangle, disjoint closed shells, short edges, invalid indices, preflight blocks, and read-only evidence failures. Registered in `npm run test:offline`.

## Meaning and limits of the result

The source shell audit is a **screening** tool. Geometrically coincident vertices may still not be welded in the exported JMS; near-coincident boundaries, T-junctions, self-intersections, brush overlaps, portals, material exceptions, visibility cells, baked lightmaps, AI navigation and engine collision are not certified. An edge-closed shell candidate is **not** proof of a sealed game BSP. The native Rust exporter and `Tool structure` may reject geometry even if the source preview looks clean. WRL compiler errors take precedence. A real build, installed toolchain and Halo CE gameplay test are still the acceptance gate.

The original Phase 3–7 prompt bodies are only **partially recoverable verbatim**. See `ORIGINAL_92_REQUIREMENTS_RECONSTRUCTION.md`, `PHASE3_10_FEATURE_TRACEABILITY.csv`, `PHASE_01_TO_10_ACCEPTANCE.md`, `PROMPT_AND_FEATURE_RECONCILIATION_C21.md`, and this release's `CONTINUATION_23_REQUIREMENT_TRACE.md`. This release does **not** close those original game/engine gates.

## Verification performed here

- Input C22 ZIP SHA-256 matched the recorded checksum, ZIP integrity passed, and extraction rejected absolute/traversal paths.
- 43 `npm run test:offline` scripts passed, including the new topology and export test suite.
- Strict standalone TypeScript checks passed for the changed pure TS modules (`haloMeshIntegrity.ts`, `sourcePreflight.ts`, `haloBspSourceReport.ts`) with bundler resolution.
- TypeScript/JSX syntax transpilation passed for edited React components; this is **not** an installed-dependency frontend production build.
- A synthetic worst-budget source mesh (32,000 triangles in 8,000 independent closed tetrahedra) completed within a local Node benchmark; the benchmark is a diagnostic, not a target-device latency guarantee.

## Not run / still blocked

**Native** Rust/Cargo and Tauri builds, real `Halo Tool`/Invader structure and cache builds, shader and `bitmaps.map` owner-map parity, collision/portals/PVS/AI navigation, deployed Halo CE/MCC runtime and two-client multiplayer. The environment lacks those tools/assets. No executable or compiled `.map` is included or represented as playable.

**Next highest-value milestone:** on an owner-controlled Windows dev machine, compile this exact source, export the new Five-mode Test Arena to an isolated HEK tags+data tree, inspect actual `Tool structure` output and WRL geometry, then prove a generated cache launches with correct Slayer/CTF/King/Oddball/Race behavior. Do not overwrite the installed game's files or the original Halo data.
