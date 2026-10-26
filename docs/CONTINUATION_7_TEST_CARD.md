# Continuation 7 owner test card (one action at a time)

**Prerequisites:** Windows PC with Node 22+, safe local filesystem space; optional installed Rust/Tauri prerequisites and separately licensed Halo Editing Kit for later tests. Keep all original .map and installed Halo folders untouched. Use a NEW extracted project directory.

## Test 01 - offline source logic (do this first)

1. Extract the full Continuation 7 ZIP into a new directory, separate from your current Guilty Spark source and Halo installation.
2. Open PowerShell in the extracted `Project-Guilty-Spark-v0.3-DEV` directory.
3. Run exactly: `npm run test:offline`
4. Expected: **19** independent lines beginning `PASS:`; no new package installation, file edits or game launches are required.
5. If a test fails: do not alter any Halo file. Copy the full failing command, first stack trace and Node version, then stop. Leave the extracted folder intact for analysis. To roll back, simply remove this new extracted source directory later; your previous continuation is unaffected.

**Only after Test 01 is confirmed:** inspect Rust and UI build prerequisites, perform source geometry tests, and then test the installed Halo toolchain. Do not combine these into an unattended first run.

## Subsequent manual owner acceptance (NOT performed here)

- `C7-UI-01`: QuickForge launch and project roundtrip; keyboard focus and hover descriptions visible. Do not claim success until actual Windows UI screenshots/test logs.
- `C7-LIVE-02`: Create a sculpted terrain tile. First person + Source collision on: walk onto top, slope and wall. Toggle off and verify free motion. In-game collision not implied.
- `C7-TERRAIN-03`: Two identical 8-step 12x12 terrain tiles with equal boundary heights. Enable Mesh Snap, drop to within 1 unit of flush edges; verify source-seam badge and generated triangle reduction. Modify a boundary height and verify seam disappears; verify source remains intact.
- `C7-CAVE-04`: Two exact opposite-facing cave annular rims should source-join; mismatched ring segments, offset, or three-way intersections should refuse weld. No cave-to-room portal claim.
- `C7-TOOL-05`: Set appropriate kit generation in Preferences, inspect native tool list; authorize ONLY a preinstalled GUI in a separate working copy; verify no original game data was modified. For classic HEK ensure generated Tool arguments do not include `-data_dir`.
- `C7-ACADEMY-06`: Work through preserve source > create arena > terrain > Rocket Pistol; observe step descriptions and manually gated gameplay checks.
- `C7-BUILD-07`: Compiler and halo gameplay proof ONLY after prior stages, with validated `.jms`, proper tag dependencies, target runtime match, WRL inspections and game load. No silent stock-map overwrite.
- `C7-MP-08`: Network AI and 2-player sync remain NOT TESTED / blocked; no public matchmaking or anti-cheat modifications.
