# Project Guilty Spark — Continuation 6 engineering handoff

**Baseline:** exact `Project_Guilty_Spark_07_Halo_Modding_Brain_Continuation_5_SOURCE.zip` delivered in the previous turn.  This is a **full source archive** with no stock game maps, textures, proprietary tools, installers or third-party executables. **Version remains 0.3.0 DEV**, because Windows/Tauri and Halo runtime acceptance have not happened.

## What is implemented in this continuation

### 1. Source mesh assembly and optional welding

- `src/meshAssembly.ts` aligns a user-imported OBJ against a second OBJ by chosen AABB face (+/- X/Y/Z) or exact selected vertex. The user's existing **QuickForge Grid Snap (G) and authored Mesh Snap (M)** toggles remain independent and unchanged.
- **Weld compatible open seams** is a separately opt-in Asset Workshop checkbox. Each candidate pair must have opposite edge orientation, matching position (quantized to 0.00001 editor units), matching UV/normal attributes (within 0.00002), no degenerate or nonmanifold input faces, and a unique correspondence. Two solid *closed* BSPs have no open boundary edge and are **not** welded automatically. Duplicate coincident-but-unconnected source edge paths are refused, to avoid inventing a sealed manifold across UV splits.
- Multiple real source material groups survive the combined mesh, and topology is checked by **actual shared vertex indices**, not position alone. The 3D preview shows the combined geometry; source OBJ and JMS can be downloaded locally. These are intermediate meshes only: **no boolean CSG, compiled collision, portals, lighting, PVS, or verified game-ready BSP**.
- `src/haloJms.ts` exports a Halo 1 **JMS 8200 source file** with material grouping, complete triangle index listing, normal generation when absent, UVs, and explicit Halo editor-to-source coordinate conversion. `bsp-candidate` export refuses any open edge, nonmanifold edge, conflicting winding or degenerate triangle. **Passing topology is necessary but not sufficient for Tool/Invader compilation.**

### 2. Actual cross-map `.tag` extraction, plus isolated staged import

- `crates/spark-core/src/tag_exchange.rs` implements an explicit, user-triggered `invader-info -T is_protected` check followed by `invader-extract --recursive --search <exact-tag.class> --tags <new-managed-folder> --maps <owned-resources> <preserved-source.map>`. Those options were checked against Invader's published README. No overwrite flag or untrusted shell command is used.
- Selection must match a real imported tag ID. Source map SHA-256, cache-version and engine must match the inspected source. Supported tag classes have a strict tag-extension table; unknown classes and protected/synthetic caches are rejected. Original recorded resource cache checksums, filesystem symlinks/junctions and source path safety are checked. Extraction is bounded at verification time to 4,096 output files, 64 MiB per file, and 512 MiB total, with SHA-256 receipts. **External tool execution could produce more data *before* post-extraction verification; run Invader on trusted, owned local maps only.**
- Tag Browser has **Extract real .tag + dependencies (Invader)** and **Cross-map .tag staging** actions. The latter shows extract receipts from *other projects* with the same engine/cache version, rechecks all file hashes, and copies verified bytes into an isolated new managed `tag-imports/<project-id>/<job-id>/tags` directory with `create_new` and a bounded copy. It never overwrites a game tag, imports directly into a scenario, or declares a compiled playable mod. The UI offers an **Open isolated imported tags** button.
- Provenance and rights remain the owner's responsibility; game resources are not included in this ZIP. The underlying Invader commands and native UI **have not been run end to end on Windows** in this environment and must be treated as an unverified integration until tested.

### 3. User interface and safety

- Asset Workshop: real geometry select/preview; another source asset select; explicit face/vertex snap controls; optional open-edge weld; aligned preview; OBJ or JMS export; watertight BSP candidate gate; visible errors and topology counts.
- Tag Browser: separate reference/dependency JSON export, real Invader tag extraction, and same-engine staged transfer between source projects. These actions are separated deliberately because reference JSON, extracted tags, scenario tag edits and compiled maps are different artifacts.
- No changes to stock .map binaries, live game processes, anti-cheat, firewall, server config, or public online sessions. All new output is opt-in and directed to managed working folders or browser downloads.

## Verification and evidence

- `npm run test:offline`: **15 suites PASS** on Node v22 (includes source mesh weld, safe snapping, source interchange, HSC, texture and source ZIP tests).
- Independent OBJ load using `trimesh`: a generated four-vertex/two-triangle source mesh loads (library may duplicate vertices for per-face material groups). Independent structural parse of corresponding JMS 8200 fixture: PASS.
- TypeScript/TSX syntax parsing of all project source files: PASS. This is NOT `tsc -b` typechecking (project dependencies unavailable).
- ZIP SHA-256 manifest, CRC, independent clean-extraction tests: see `SOURCE_MANIFEST_SHA256.txt` and the separately delivered ZIP checksum.
- **NOT RUN:** `cargo test`, Rust/Tauri compile, Windows editor startup, actual Invader executable, HCEEK Tool BSP compile, Halo runtime map load, game UI screenshot QA, 2/4-player synchronization. No installed Rust/Cargo toolchain or full frontend dependency set in this environment.

## Phase 01–10 coverage and open blockers

| Phase | New work | Still required for true completion |
| --- | --- | --- |
| 01 Foundations | Hash-bound isolated tag transfer | Complete platform setup and native release tests |
| 02 Editor/restoration | Real `.tag` dependency extraction adapter | End-to-end restoration of historic Halo Demo/Zombie Apocalypse tags/audio |
| 03 QuickForge | External OBJ/JMS welded source mesh geometry | Compile a valid playable arena, working Firefight/Zombie gameplay |
| 04 Living Workbench | Source geometry + material preservation | Automatic classic shader/bitmap/lightmap extraction, real original BSP sculpt/CSG, playable First Contact campaign/cinematics |
| 05 Finish the Fight | More offline topology tests and safe receipts | Full native/Windows/engine/QA regression, installation tests, evidence |
| 06 Great Reclamation | Invader extraction and tag staging | Version-tested adapters/rights review, tutorial academy, universal tool registry |
| 07 Reality Forge | Narrowly validated, opt-in open seam weld | Real collision/portals/PVS/nav/lighting rebuild and Tool/Invader compilation |
| 08 LAN Party | No runtime change | Live host/join/server management, player synchronization, AI protocol for supported engines and 2–4-client tests |
| 09 Combat Evolved | Material-preserving OBJ/JMS source interchange | Fully authentic locally sourced Halo CE themes, shader renderer, UI/sound workshops |
| 10 Time Machine | No runtime change | Tested Mac Demo/G4 export + legacy LAN bridge; actual G4 playback proof |

**There is NO certification that all ten phases are fully programmed.** These remain original project requirements, not delivered finished subsystems. See `PHASE_01_TO_10_ACCEPTANCE.md`, `ORIGINAL_92_REQUIREMENTS_RECONSTRUCTION.md` and `REMAINING_WORK.md`. Missing full prompt bodies in the archival Codex export cannot honestly be reconstructed word-for-word.

## Owner acceptance — step 1 only

Create a *new* extraction directory for this ZIP. Do not overwrite the prior Continuation 5 source folder and do not put the ZIP inside the Halo or MCC game installation. Run `npm run test:offline` after extraction using Node 22+; wait for results before continuing to any native tool setup. The manual Windows/Invader and two-client test plan will be guided one action at a time to avoid accidental game-file modification.

## Verified public references

- Halo 1 source formats & tutorial: https://c20.reclaimers.net/h1/source-data/ and https://c20.reclaimers.net/h1/guides/levels/box-level/
- Invader command options, tag formats, copyright/rights caveat: https://github.com/SnowyMouse/invader/blob/master/README.md
- Historical BSP Tag Converter capabilities (not integrated/executed): https://www.halomaps.org/hce/detail.cfm?fid=2029
- Aether original BSP/lightmap extraction reference (not integrated/executed): https://halomaps.org/hce/detail.cfm?fid=4312
