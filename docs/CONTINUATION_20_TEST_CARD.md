# Guilty Spark — Continuation 20 owner test card

**Delivery:** complete C19-derived SOURCE ZIP. NOT a ready-to-run Windows app or a tested Halo mod. No compiled game file is provided.

## First action (do only this, then report the result)

**Extract `Project_Guilty_Spark_07_Halo_Modding_Brain_Continuation_20_SOURCE.zip` to a new, empty folder**, separate from older sources and the Halo installation. Tell me whether the files extracted successfully. Then we can take the next test **one step at a time**, beginning with the offline suite and checking the exact prerequisites rather than changing your PC.

## Later acceptance checkpoints — do not attempt all at once

- Offline Node suite `npm run test:offline` (does not modify or launch Halo; needs compatible Node). Attach the console result.
- Rust tooling, only once confirmed installed: `cargo test -p spark-core`. Source contains new synthetic batch and shared-resource tests, but they have **not** been run here.
- Windows Tauri development build only after confirming dependencies, project build instructions and toolchain; do **not** run unknown scripts elevated or alter system settings.
- With an **owned copy** of a classic Demo/PC/CE source map and optionally its exact `bitmaps.map`, test World Editor > Material Lens > **Auto-preview verified materials** on a disposable project. Capture eligible/refused counts; inspect shader surfaces and individual lightmap pages in a real Halo comparison where appropriate. Never replace originals.
- Confirm that Cancel discards late previews, manually assigned textures are not replaced, two BSPs sharing page 0 remain separate, and switching project or changing resource pin discards stale results.
- Record the map/version, source hashes and screenshots in a private QA log. Do **not** upload copyrighted game caches or sensitive local paths to a public repository.
- The playable Test Arena, actual BSP compile/collision/portals, Zombie Apocalypse restoration, and networked Firefight are **separate future gates**, not passed by the texture preview test.

### Key report fields (for later)

Environment, command/test, pass/fail, first complete error, exact project revision, map version, bitmap resource identity, shader/lightmap examples and any unexpected source-file changes. Please report any failure before trying more changes; do not auto-repair game files.
