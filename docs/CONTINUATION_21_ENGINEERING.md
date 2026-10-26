# Project Guilty Spark — 07 Halo Modding Brain — Continuation 21

**2026-10-26 | baseline:** verified full-source `Project_Guilty_Spark_07_Halo_Modding_Brain_Continuation_20_SOURCE.zip`, SHA-256 `63f5218c15cf6313e15d97227ceda3e7a2ce1cfddd2349c04f623355a8b35ac2`. This is a cumulative source snapshot, NOT a compiled `.exe`, usable Halo map, or certification of any target engine. Root `SOURCE_DIFF_FROM_PREVIOUS.txt` records the exact source delta.

## Goal and actual delivered work

The next testable gap after C20's 24-image SHA-pinned read-only bitmap batch is honest **map-source-to-game-type acceptance** plus a way to distinguish real source-mesh diagnostics from actual engine-certified BSP geometry. These changes build on existing QuickForge, Material Lens and Creator Studio rather than inventing a new launcher or removing any previous feature.

### 1. Guilty Spark · Five-mode Test Arena

- `crates/spark-core/src/quickforge.rs` adds original, editable `guiltySparkTestArena` source. The existing room, ramp and four cover brushes are retained; the preset places four `allGames` team-assigned starts, one flag per CTF team, **two four-corner convex hill groups** (so normal King and moving-hill/Crazy King can be attempted), an Oddball spawn at usage 0, ordered Race checkpoints 0–3, and a paired teleport entrance/exit at channel 0.
- Default for direct native calls is Halo Custom Edition; the UI's explicitly selected runtime overrides it. One-click selection appears in QuickForge's new-map wizard. Contains no shipped weapons, vehicles, stock textures, licensed Halo tags, compiled BSP, actual game variant or copied map.
- `crates/spark-core/tests/quickforge_gametypes.rs` extends Rust regressions, including netgame flag command generation. **Rust tests were authored but NOT executed in this environment**: Cargo and rustc are not installed. Do not describe generated commands as native-tool-verified until run with the exact installed `invader-edit` and Halo editing kit in an isolated workspace.

### 2. Bounded read-only compiled BSP render preflight

- `src/bspRenderAudit.ts` analyzes the existing native-inspection render mesh (not a fabricated cube or authoring-source proxy). Checks index and coordinate bounds, degenerate triangles, overlapping material ranges, uncovered triangles, exact shader tag IDs/classes, primary UV validity, secondary lightmap UV presence, BSP-local page/bitmap tag identity and inconsistent page references. All reports carry the inspected cache SHA-256, source-read-only scope, unverified engine acceptance flags and no private source path or bitmap/mesh bytes.
- Hard caps: 250,000 triangles, 16,384 material spans, 131,072 inspected tag entries, 128 *listed* findings. Totals still count all diagnostics, including the omitted count. Oversized/malformed structures refuse the report instead of exhausting the UI.
- `src/components/World.tsx` displays the audit against the **entire inspected render mesh** (not only the visible/selected BSP) and offers an explicit local JSON export, refusing stale cache identities. A clean result does NOT certify collision, portals/PVS, baked lighting, radiance, shaders, gameplay or compiled map validity. Real source tags are not edited by this action.

### 3. Real-world test plan without false passes

- `src/haloModeTestPlan.ts` creates a deterministic JSON manual QA plan for all **five original multiplayer modes**: Slayer, CTF, Oddball, King of the Hill and Race. Each has four NOT-RUN tests: Sapien/source review, Tool/compilation, actual game, and two-client gameplay. The exporter records source marker status separately, explicitly marks compiled/gameplay/network verification false, and includes no asset paths or map bytes.
- QuickForge exports that plan. Creator Studio Playtest Lab has **Seed five-mode tests**, which creates up to twenty manually fillable NOT-RUN entries. It is idempotent on case IDs, never wipes existing user evidence, never marks a test passed and refuses unbounded record counts/invalid identifiers. Tests are authoring assignments, not simulation of game scoring/networking.
- Scripts `scripts/test-bsp-render-audit.mjs` and `scripts/test-five-mode-test-plan.mjs` added to the dependency-free `npm run test:offline` chain.
- `src/tutorialAcademy.ts` now includes observable Five-mode Test Arena selection and source-only lessons for exporting the manual QA plan and inspecting BSP render diagnostics. These lessons never auto-pass game validation.

## Validation performed (truthful)

| Verification | Result |
| --- | --- |
| Original C20 baseline ZIP SHA-256 | Matched pinned SHA-256 (see root diff) |
| Node `npm run test:offline` | **PASSED**, 39 PASS result lines, includes new diagnostics/plan regressions and older suites |
| Standalone strict TypeScript checking of `bspRenderAudit.ts` + `haloModeTestPlan.ts` | **PASSED** with global `tsc` (no installed frontend dependencies) |
| JSX syntax transpilation of modified React components | See `CONTINUATION_21_VALIDATION.txt` |
| Cargo Rust tests / Tauri or Windows `.exe` | **NOT RUN** — no installed Cargo/rustc and no frontend dependency install in this environment |
| Actual source map, real `bitmaps.map`, Halo Tool or invader-edit, in-engine play, two-PC test | **NOT RUN** — no owner-owned target assets/toolchains here |

No file in an installed Halo game or system partition was opened, overwritten or modified. No game binary/asset, user secrets or third-party copyrighted tools were bundled. Development test data is synthetic and cannot replace an owner test. Preserved C20 functionality is intended to remain intact, but an unexecuted native test cannot prove it.

## Prompt/requirement integrity

The canonical historical 92-requirement reconstruction is `ORIGINAL_92_REQUIREMENTS_RECONSTRUCTION.md`. Full verbatim text of some Phase 3–7 original prompts cannot be recovered; the complete work is tracked **functionally, not word-for-word**. `PHASE3_10_FEATURE_TRACEABILITY.csv`, `PHASE_01_TO_10_ACCEPTANCE.md`, earlier continuation reports, and `PROMPT_AND_FEATURE_RECONCILIATION_C21.md` preserve the rest of the feature ledger.

## Still critical and unshipped

1. **Native acceptance:** Cargo/Windows/Tauri build, real source fixture provenance and exact Tool/Invader CLI setter/output contracts. No smoke test substitutes for real game loading.
2. **Actual graphics and level compilation:** trustworthy external bitmap tag metadata, complete shader layers/texture classes, per-BSP lightmap pixels, sky/fog game tags, imported-source editable BSP, true collision, portal/PVS validation and clean Halo Tool output.
3. **Game proof:** run the source test arena through all five Halo 1 modes and demonstrate score changes, proper CTF spawns, movable King hills, Race vehicle/checkpoints and two-client joins. No game-mode test has yet passed.
4. **Zombie Apocalypse / Firefight / First Contact:** historical owner-provided Demo sources, authentic AI spawner behavior/sounds, proper script, campaign geometry/navigation and original map restoration, real AI encounter execution and actual campaign playthrough. Full original Halo modding workflows remain unfinished.
5. **Long range:** verified multiplayer AI networking and co-op (engine-specific), custom gametype storage, distributed mods, dedicated server interaction, live editing/testing, split-screen/VR, vintage Mac Demo/HaloMD/G4 target builds, permissions/attribution and editor theme assets from the owner's own files.

## Safe owner handoff

Start with `CONTINUATION_21_TEST_CARD.md`. Extract C21 into a **new empty directory**. Do not replace installed Halo files, current source trees, original game archives or even a prior Guilty Spark extraction. Confirm the extracted source and the first result before proceeding to the next one-at-a-time step.

References: https://c20.reclaimers.net/h1/engine/game-modes/ ; https://c20.reclaimers.net/h1/tags/scenario/ ; https://c20.reclaimers.net/h1/tags/scenario_structure_bsp/ ; https://c20.reclaimers.net/h1/guides/levels/bsp-troubleshooting/ . These are format/engine references, NOT evidence that this package ran Halo.
