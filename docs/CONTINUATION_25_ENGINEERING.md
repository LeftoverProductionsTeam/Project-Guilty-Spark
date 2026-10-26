# Project Guilty Spark — 07 Halo Modding Brain — Continuation 25

**Date:** October 26, 2026. **Baseline:** full, checksum-verified Continuation 24 source ZIP, SHA-256 `35f8f385cfb0f523836bcc622d058f3da832c1d1454d876204684523dd70c564`. **Deliverable:** cumulative SOURCE ZIP, not a Windows binary or playable Halo CE map.

## Why this increment

C24 can read Tool .wrl diagnostic geometry and find nearby source brushes, but Halo Tool text log state remained visible after the QuickForge source changed. That could mislead a map author into treating stale compiler errors from another source revision as current evidence. In a project that aims to preserve original content and avoid broken BSP builds, making diagnostic provenance clear is more important than a cosmetic feature.

## Implemented

1. **Tool-log revision binding** — `QuickForge.tsx` now records the SHA-256 of the active validated source when the user opens a Tool `.txt`/`.log` file. The entire asynchronous import is rejected if QuickForge source changes while reading. After a later edit or pending geometry validation, the imported log's findings are hidden with a conspicuous stale-evidence warning. A new native build and explicit reimport are required to associate fresh diagnostics.
2. **Sanitized compiler-triage report** — `src/haloCompilerTriage.ts` accepts one source validation and optional user-imported Tool log/WRL, then builds `guiltyspark-halo1-compiler-triage/v1`. Export includes only the source SHA-256, source preflight counts, bounded classifier codes and first-line indices, WRL region/edge/face totals, bounded brush-association **counts** and review actions. It does not export raw messages, paths, IDs, coordinates, map bytes, assets, or logs. Source revision mismatch fails closed.
3. **Conservative triage state** — No warnings or zero parser findings never becomes a pass. The report explicitly marks Tool execution, compiled BSP, collision, portals and gameplay as `false`. The only labels are *source export blocked*, *compiler errors observed* and *diagnostics need review*. User-supplied log/WRL association is labeled **user asserted**, not a cryptographic link to one compiler job.
4. **QuickForge UI** — Imported logs are protected by the same stale-source semantics as WRL overlays. A new **Compiler triage** section summarizes counts, prioritized repair suggestions, and offers **Export sanitized compiler triage** for owner review. Underlying Tool file and WRL continue to be read-only.
5. **Modding Academy** — The WRL troubleshooting lesson now includes current-source Tool log import and privacy-preserving triage export.
6. **Release guidance and feature reconciliation** — Updated top-level README release header and added C25 requirement/gap handoff and Windows test card. Preserved all historical requirements and prior handoffs.

## Important limits and nonclaims

- A source hash is real for the current QuickForge validation, but the chosen `.wrl` / Tool log contains **no cryptographically proven job binding**. Their attribution is explicitly selected by the author. Logs and WRLs may even come from different compiler attempts. The new report does NOT claim those agree.
- The Tool log classifier recognizes known patterns and records how many errors or warnings remain unclassified; it does not reconstruct the full program state, exit status, output tag health or command arguments.
- This change does **not** generate Halo collision, fix malformed portals/PVS or deliver a runnable five-mode map. No original map, installed game path, shader tag or Tool output was modified.
- This source archive does not bundle Halo assets, Halo Tool, Invader executables or game binaries; use lawful, separately installed and version-compatible tools.

## Research and decision references

- [Reclaimers — Halo 1 level creation](https://www.reclaimers.net/h1/guides/levels/) places source geometry, structure compile, tag work, and engine tests in an iterative pipeline.
- [Reclaimers — BSP troubleshooting](https://reclaimers.net/h1/guides/levels/bsp-troubleshooting/) documents open/sealed hull requirements, material exceptions and Tool diagnostics.
- [Reclaimers — Portal/PVS errors](https://c20.reclaimers.net/h1/guides/levels/bsp-troubleshooting/) notes that collision and source topology do not alone validate visibility clusters.
- [Invader](https://github.com/SnowyMouse/invader) documents engine-specific cache builders and warns that it is not a universally complete replacement for the original Halo Tool.

## Offline verification gates

- Baseline C24 ZIP checksum and zip integrity verified before modifying source.
- `scripts/test-compiler-triage.mjs` tests known/unknown compiler messages, source-hash mismatch refusals, malformed metadata guards, WRL summary, zero-error non-attestation, bounded code handling and private-string exclusion from export.
- `npm run test:offline` executes 46 dependency-free scripts (including the new one), with no failed assertions in this environment.
- Global `tsc --noEmit --strict` passed for `src/haloCompilerTriage.ts` and its pure type dependencies; QuickForge TSX, Academy and triage module passed TypeScript transpiler syntax diagnostics. A production React/Tauri app build remains untested here because frontend dependencies and Rust/Cargo are not installed.
- Real Windows app, Tool structure, compiled BSP, Halo CE gameplay and multi-client testing are **NOT RUN**. No source-only automated test can substitute for those acceptance gates.

## Next engineering gates

**Gate A:** run a clean native Windows/Tauri build and open QuickForge; validate stale log/WRL behavior. **Gate B:** compile the original Test Arena in an isolated, matching Halo CE/H1A tag tree; collect real Tool exit status, `.wrl`, tagged output identity, cache checksum and source hash. **Gate C:** prove collision and all five stock game modes in-engine with two-client testing. Only then advance imported BSP reconstruction, exact textures, radiosity, authored portals, custom AI, Zombie Apocalypse, First Contact and cross-engine features.
