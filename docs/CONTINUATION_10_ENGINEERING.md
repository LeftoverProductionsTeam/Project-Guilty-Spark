# Project Guilty Spark — Continuation 10 engineering handoff

**Input:** Continuation 9 full-source archive, preserved byte-for-byte outside this working directory.  
**Scope:** source code only, additive continuation; no stock maps or third-party executables shipped.  
**Evidence standard:** A browser/Node unit test does not certify a native Rust build, a Halo `structure` compile, live game collision or networked AI.

## Implemented in this source continuation

| Area | New source change | Actual verification gate |
|---|---|---|
| First run | `src/firstRun.ts`, `GettingStarted.tsx`, five task-first onboarding paths, user-facing status, desktop requirements | Node 22 tests; browser interaction still needs manual test |
| UI discoverability | Contextual sidebar hover hints, dedicated Community Thanks navigation, runtime tool cards and consented actions | TS/TSX syntax parser; full React render still unverified |
| Modding Academy | 12 lessons including native editing-tool workflows, separate game acceptance, clear actions and explanations | Offline lesson checks, not a completed interactive game tutorial |
| Community memory | `communityCredits.ts` and `CommunityThanks.tsx`, curated source-linked attribution, local nomination validation/export and provenance labeling | Nomination tests, no network posting, no guarantee of exhaustiveness |
| Toolchain | Runtime-specific integrated tool identity inspection (size+SHA-256) and read-only Invader `-i` information command, bounded output and timeout | Native Rust source only, not compiled or executed with actual Invader here |
| External GUI tools | Windows-only opt-in launch of known Sapien, Guerilla, Invader Qt and H1A GUI executable names from configured roots | Requires real Windows tool installation; GUI is *beside*, not *inside* the webview |
| BSP lighting | Actual secondary lightmap UVs and page numbers read from bounded classic PC/Demo BSP material streams | Synthetic Rust tests added; Cargo unavailable; actual Halo map test needed |
| Editor lightmaps | Optional local DDS/PNG/JPEG/WebP lightmap page preview, exact numbered batch matching with conflict rejection | Pure matcher tests; actual in-window image inspection pending |
| QA | Read-only map report includes lightmap page coverage and explicitly excludes Halo shader/gameplay verification | Offline smoke tests |

### Native tool safety contract

1. User chooses a runtime and configures *installed* compatible tools themselves.
2. No automatic download, no arbitrary shell input, no unreviewed flags, no tool injection into an active Halo process.
3. Tool inventory is separate from explicitly authorized process execution. Only Invader's documented `-i` is a direct embedded-console command in this continuation.
4. Native GUI editors continue as distinct processes and can modify their own tag trees; user must consent and back up a working copy.
5. Existing managed build/extraction jobs must preserve their isolated roots, hashes, receipts, and compatibility gates. Do not point them at the stock game directory.
6. The native binary-size and hash checks do **not** prove trust, safety or compatibility; an unknown executable may be malicious. Use only trusted distribution sources.

### BSP lightmap limitations

The BSP material stores **render vertices** (56 bytes each) and **lightmap vertices** (20 bytes each). The read-only parser bounds-checks the cached pointer inside the BSP region and treats invalid, compressed, or absent secondary data as unavailable. It records the actual signed page index (`-1` means unlit). The Three.js preview associates local page images only when real UVs exist, and cannot claim full Halo 1 `shader_environment`, detail-map, fog, radiosity or shadow behavior. Unlit materials have no invented lightmap.

**No claim of playable geometry:** source terrain/cave alignment and live editor collision are NOT equivalent to correctly compiled game collision, cluster portals, PVS, AI pathfinding or in-game behavior. Existing WRL diagnostic overlay remains a troubleshooting aid, not an automatic repair.

## Critical remaining engineering gates (not implemented or not engine-tested)

1. Native **bitmap/resource cache extraction** with accurate bitmap metadata, permutations, color space, swizzles/DXT, lightmap atlases, shader types, water/sky/weather, and real-map fixtures; currently manually selected local assets and read-only UVs.
2. Imported BSP **source reconstruction**, non-destructive terrain/cave CSG with sealed rooms and guaranteed manifold geometry, collision/portal/PVS/nav/lighting compilation; requires source tag tree and Tool/Sapien validation.
3. End-to-end **First Contact campaign** with real scenario tags, compiled HaloScript, AI encounters, cameras, checkpoints, dialogue and gameplay; source exports alone are not playable.
4. In-engine **Firefight/Zombie Apocalypse**, enemy squad spawns, damage/scoring/rounds, original restoration provenance and a matched gameplay runtime.
5. Multiplayer transport/authentication/map-version negotiation and real **AI synchronization** appropriate to each engine; two physical clients and gameplay proof needed.
6. Per-runtime reproducible build and play receipts for Windows/Tauri, HEK classic vs H1A MCC, alternate CE runtimes, demo and PowerPC legacy hardware.
7. Full Theme Forge, authentic menu sound/bitmap extraction, native asset import/optimization, sandboxed mod packages/install/rollback and collaborative scenarios.
8. Publish and maintain an open, source-linked community contributor register without claiming every participant is known or rights to redistribute their work.

## Testing instructions

- `npm run test:offline`: dependency-free verification using Node 22 type stripping.
- `tsc --noEmit ...` on new pure TS logic (or `npm run check` after installing dependencies from a trusted lockfile).
- `cargo test --locked` and `cargo check --locked` in an environment with Rust; in this environment no Cargo is installed.
- On Windows, verify tool inventory and *only then* try the explicit read-only Invader `-i` command. Inspect logs and ensure any launched GUI remains independent.
- With the owner's own Halo map and local images, confirm secondary UV/page mapping visually in World; do not change the source cache.
- Run actual Tool `structure`, check collision/portals/WRL, load in a matching runtime, and independently test network AI with more than one client before promoting feature status.

### Feature status

**New pure logic:** offline tested. **New React UI:** syntax-checked / runtime untested. **Rust parser/command additions:** code and synthetic Rust tests only / native compile unverified. **All ten Codex phases:** NOT COMPLETE. No generated code here substitutes for native engines or imported source data.

### Source references

- [c20 Halo BSP tag reference](https://c20.reclaimers.net/h1/tags/scenario_structure_bsp/)
- [c20 overview of official/community mod tools](https://c20.reclaimers.net/general/mod-tools/)
- [Microsoft MCC tools overview](https://learn.microsoft.com/en-us/halo-master-chief-collection/general/overview-tools)
- [Invader upstream README and documented `-i` switch](https://github.com/SnowyMouse/invader)
- [MEK overview and credits](https://c20.reclaimers.net/h1/community-tools/mek/)

**Responsiveness hardening:** native executable hashing and the bounded, explicitly requested Invader information subprocess are invoked via `tauri::async_runtime::spawn_blocking`, keeping the Tauri UI thread responsive even when a large local executable is inspected. This path still needs a native Cargo compile and Windows interaction test.

**Offline suite:** 27 separately invoked Node scripts (23 preserved from Continuation 9, four added). Pass counts below refer to test *scripts*, not individual assertions. All 67 TS/TSX source files also pass syntax transpilation, and five pure logic modules pass standalone strict typechecking with the repository's TS extension setting. These are not substitutes for full package-dependent typechecking.
