# Project Guilty Spark — Continuation 12 engineering handoff

**Baseline**: The complete, byte-for-byte Continuation 11 **SOURCE ZIP** supplied in the prior turn. This is a follow-on **source release**, not a Windows binary or a 100% complete Halo editor.

## Newly implemented

| Area | Change | Verified here |
| --- | --- | --- |
| Environment source intent | New optional `environment` on QuickForge documents: ambient/sun colors and powers, light direction, sky preview color, fog color/on/off/near/far; bounded on BOTH TypeScript and native Rust schema | Offline environment test; Rust source inspection only |
| QuickForge live rendering | Three.js ambient/directional lighting and linear distance fog update when the saved QuickForge environment is edited; toggle to original editor lights | TSX parsed; Windows GPU UI not tested |
| World Editor preview | Separate local light/fog preview for inspection of user-owned maps. It never edits cached `.sky` / `.fog` tags | TSX parsed; real-map render not tested |
| Handoff plan | `environment-intent.json` in each native QuickForge source export, marked `AUTHORING_ONLY_NOT_COMPILED`; a standalone manual JSON preview export from UI | Offline JSON test; native filesystem export not executed here |
| Scenario regression ledger | Checks same-mode overlapping starts, conflicting tag source hashes for the same class/path, unsynced MP biped placement, missing source map resources, excess AI wave budgets, and unbuilt cave integration | Offline scenario test; Rust source adds two hard build blockers |
| Corruption-resistant native source export | Staging sibling directory, write/readback project, output JMS checksum, command/intent JSON checks, rename only after success, never intentionally overwrite existing target | Rust tests added; **not compiled here** |
| Academy and UX | 2 new guided lessons (environment + historic failure checks), glossary, color/sun/fog controls and explanatory hover text | Academy and TS parser tests |

## Why Halo treats environment differently

- A `.sky` tag contains the sky model, atmospheric fog, indoor/outdoor radiosity ambient colors and powers and directional lights. See [Reclaimers sky](https://c20.reclaimers.net/h1/tags/sky/).
- A `.fog` tag affects BSP fog planes; it does **not** control atmospheric sky fog in general. See [Reclaimers fog](https://c20.reclaimers.net/h1/tags/fog/).
- The editor's instantaneous shadows and linear fog are visual aids. Halo's baked radiosity and lighting cannot be regenerated without the real toolchain. A nondefault environment profile becomes a **game-build blocker** until the real sky/fog tags and lightmaps have been applied and verified. **JMS source export is still allowed.**
- A completed source folder contains no Halo-owned sky textures, sound files or copyrighted assets. No existing map files are modified.

## Explicit remaining ten-phase gates

1. Automatic real `bitmaps.map` resource/bitmap decode, shader/bitmap dependency extraction and faithful diffuse/detail/bump/alpha/lightmap rendering.
2. Editing *imported* compiled BSP topologies; robust room-to-cave CSG; sealing, collision BSP, portals/PVS, navigation and full in-game physics across all supported Halo 1 engines.
3. A complete native scenario/tag pipeline, gameplay-tested arena, First Contact campaign, cinematics and mission scripting.
4. Real AI encounters, finite Firefight/Zombie Apocalypse gameplay, multiplayer AI host authority and two-client synchronization/revision validation.
5. Side-by-side and managed tool UX across edition-specific kits, package sharing/rollback, authentic local Halo CE UI art/audio extraction, complete tutorials and legacy PowerPC Demo exports.
6. Native Rust compile, complete TypeScript/React/Vite build, Tauri desktop launch, Halo Tool/Invader execution, in-game map tests and hardware/online tests.

**No ten-phase completion claim is made.** See `ORIGINAL_92_REQUIREMENTS_RECONSTRUCTION.md`, `PHASE_01_TO_10_ACCEPTANCE.md`, `REMAINING_WORK.md` and `LEGACY_SCENARIO_FAILURES.md`.

## Safe owner acceptance (one step at a time)

1. In a new separate folder, extract the full Continuation 12 archive. Do not overwrite an installed Halo game, original map, or previous source release.
2. On a Windows dev machine with the project dependencies and required Rust toolchain installed, run `npm run test:offline`, `pnpm check`, `cargo test --locked`, and the normal Tauri development build. Fix any native build errors before advancing to game files.
3. In QuickForge, create a fresh arena, open Properties → Materials & world settings → Environment lighting & fog; change sun elevation and enable fog. Check the sky/distance preview, save, reopen and verify the settings persist.
4. Add or import a conflicting tag identity / duplicate eligible player start; ensure preflight blocks source builds. Verify original source map hashes are unchanged.
5. Export new JMS source to an unused directory. Confirm `environment-intent.json` is marked uncompiled, `source-export.json` has final paths and a stable JMS hash; attempting the exact same destination again must refuse without modifying the original output.
6. Only on a separately managed legal copy of the relevant Halo editing kit: edit the real `.sky` or `.fog`, compile radiosity/structure, and perform a matching engine gameplay test. Do not infer lighting accuracy from editor colors.

## Verification detail (this source snapshot)

- `npm run test:offline`: **27/27 dependency-free test groups passed** (Node 22), including new environment and scenario-safety tests.
- Global TypeScript parser: **72 `.ts` / `.tsx` files parsed with zero syntax errors**, including the editor components.
- `tsc --noEmit --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler src/environment.ts src/scenarioSafety.ts`: **passed**.
- Rust-native regression source includes environment roundtrips, invalid numeric values, duplicated active spawns, incompatible extracted-tag source provenance and staged source export readback/overwrite rejection. **Those Rust tests were not run**: Cargo/rustc are unavailable here.
- Full React dependency typecheck, WebGL interaction, Windows/Tauri desktop launch, installed Halo tools, original maps, game collision and two-client multiplayer **were not tested** and must not be inferred from the offline suite.
