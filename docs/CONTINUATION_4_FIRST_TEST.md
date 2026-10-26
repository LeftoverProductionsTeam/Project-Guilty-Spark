# Continuation 4 — first owner acceptance test

### Gate C4-01 (read-only, no Halo installation needed)

**Purpose:** Prove the new source pack passes on the owner's Windows Node 22 environment before compiling or changing any game data.

**Step 1:** Extract the source ZIP into a brand-new empty folder that is not inside a Halo game installation. Do not overwrite the previous Guilty Spark snapshot.

After the owner confirms extraction, the next proposed test is to open a terminal inside `Project-Guilty-Spark-v0.3-DEV` and run `npm run test:offline`. That is a developer test only, not a game launch. The results should show ten `PASS` groups; preserve the full output (including any failures). Do not proceed to a map/game build if the offline suites fail.

**Expected evidence:** local directory path, `node --version`, all test group names and exit code. **Rollback:** delete only the newly extracted test folder; no installed Halo content should have been changed.

**Following gates** (not to be claimed as verified yet): Cargo Rust tests, full dependency-resolved TypeScript check, Tauri app startup, source-map render with actual Halo fixtures, HCEEK Tool output, offline singleplayer gameplay, two-client multiplayer, actual G4 run.
