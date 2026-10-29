# Verification record

## Current C36 evidence

Continue the actual C35 R12 source at `21804c191a918cbf8bd74efac60dfcec65c9083b`. Fresh baseline: 471 Rust passed / five opt-in ignored, 216 frontend tests in 44 files, 77 browser tests and 59 offline checks. C36: 480 Rust passed / seven opt-in ignored, 216 frontend, 79 browser and 59 offline; TypeScript and the Windows release/NSIS build pass. Two owned-asset BSP detail tests were separately opted into and passed. [Exact current evidence and limits](CONTINUATION_36_ENGINEERING.md); [metadata-only receipt](fixtures/c36-native-preservation-verification.json).

The new focused tests reproduce unintended signed-zero byte changes, preserve opaque native bytes/reference padding, resolve repacked native identities, reject ambiguous schemas/targets and refuse unproven painted-detail serialization. Fresh actual Windows workflows cover the Portability Lab, CE-to-MCC compilation, Invader no-op/edit/rebuild, Director VP8/Opus recording and source-backed rendering/audio. No Halo game or community client was executed during these checks. Earlier verification below remains historical.

```powershell
node scripts/cargo.mjs test --workspace --locked
node node_modules/typescript/bin/tsc -b
node node_modules/vitest/vitest.mjs run
node node_modules/@playwright/test/cli.js test --reporter=line
node --run test:offline
node scripts/desktop.mjs build
```

Opt-in native procedures require a fresh private QA directory and lawfully owned content. `scripts/test-portability-native.mjs` uses the frozen C35 executable, real CE/MCC maps, matching editable SDK tags, Invader and H1A Tool; it records actual tool output and refuses incomplete builds. `scripts/test-working-tags-native.mjs` consumes a fresh `qa_runtime_library` replica. The rendering, main-track audio and Director-recording native scripts use separate libraries/profiles. Read each script's named arguments; do not substitute a synthetic fixture for a game/compiler acceptance claim. Game bytes, screenshots/audio/video, tool binaries and QA libraries remain outside the source archive.

Recorded 2026-10-25 on Windows x64. Tests are separated from actual game acceptance.

## Automated checks

Phase 2: **74 Rust tests** pass (72 core + 2 native readiness tests), **21 frontend unit tests** pass, and **8 Playwright tests** pass (3 browser boundaries/accessibility + 5 synthetic IPC contracts). TypeScript and Clippy across the workspace/all targets with warnings denied pass. Rustfmt is applied. These checks do not establish game compatibility. The audit baseline was independently reproduced before changes with 40 Rust + 7 frontend tests and a fresh native release build.

New tests cover classic ZIP metadata/CRC limits and malicious paths, embedded audio/source/range integrity, runtime registration and inventories, privacy manifest validation, explicit untested AI status, resource identity changes, stale/tampered build readiness, read-only copies, complete package receipts, truncated zero-exit tool output, malformed scenario blocks and semantic comparison. The real corpus runner asserts the known version/tag/placement/triangle counts for every supplied map hash. The generated ZIP fixture is labelled separately from the historical material; no historical ZIP was supplied.

## Phase 2 native release and corpus evidence

Actual Tauri release UI checks used an isolated library under `C:/Users/patri/AppData/Local/Temp/GuiltySpark-phase2/native-final-library`, initially with Steam disconnected. Real APIs and WebView rendering were used; no mock data or game launches were involved.

| Check | Result |
| --- | --- |
| Generated ZIP containing the supplied Demo map, UI and two resources, plus an inert executable exclusion fixture | PASS: original ZIP hash/read-only copy preserved; two scenarios imported through the actual local Inbox watcher; executable not extracted |
| All eight supplied scenario paths | PASS: seven distinct source hashes in one native library; saved/reopened projects and real collision data |
| Demo viewport | PASS: 2,825 tags, 197 placements, 5,940 collision triangles; screenshot from actual release |
| Semantic Compare | PASS: Demo versus apocolypse actual tag membership, audited values/references and scenario differences displayed; undecoded coverage stays UNKNOWN |
| Menu audio | PASS: real intro + two loop permutations decode in WebView at stereo 44.1 kHz, 88.806 / 74.984 / 84.014 seconds; no audio auto-play |
| Corrupt menu sound | PASS rejection: `sounds/music/zamenumusic` fails Ogg validation and cannot load a preview |
| Launch readiness / friends preflight | PASS gating: unbuilt Demo cannot launch as a verified package and self-comparison remains BLOCKED |
| Real focused-draft close | PASS: Windows close request committed acceleration-scale draft 3 before closing; project JSON readback confirmed it; QA edit restored afterward |
| Read-only Steam/MCC discovery | PASS: installed build ID 19905945; metadata/byte/mtime snapshots of manifest, stock Blood Gulch and all existing owned MCC files unchanged |
| Installed MCC map inventory | PASS: 30 scenario/header entries and one shared-resource entry read without deployment; valid headers are not gameplay proof |
| Zero-map ZIP handling | PASS: archive preserved with receipt/import report and visible rejection; no silent success |
| Faithful conversions | FAIL as reported for all seven unique maps; gameplay sources fail missing resources, menus fail corrupt Ogg during compile |
| Opt-in recovery experiment | PASS extraction of 2,823 retained tags after explicit missing-audio omission; subsequent compile remains BLOCKED by damaged/mixed-class placements; no playable output |
| Official Excession schema/package enumeration | BLOCKED: no official exact-scenario template supplied; limited contract/receipt tests are not an official schema test |
| MCC co-op, native-runtime gameplay and two-computer AI | UNTESTED: no game or second computer used |

Screenshots: [world](screenshots/phase2/native-world.png), [comparison](screenshots/phase2/native-compare.png), [menu audio](screenshots/phase2/native-menu-audio.png), [runtime discovery](screenshots/phase2/native-runtimes.png). Metadata-only [corpus inventory](fixtures/zombie-corpus-inventory.json), [matrix](ZOMBIE_REGRESSION_MATRIX.md), and [recovery evidence](ZOMBIE_AUDIO_AND_SPAWN_EVIDENCE.md) record exact sources and limits. Local detailed QA outputs are in the Phase 2 temporary root; no extracted game bytes are committed.

A final fresh-library corpus inspection repeated all eight source-path checks after resource fingerprint/snapshot changes. SHA-256 and size readback of **all 67 original files** matched the inventory. Original files and managed preserved copies carry read-only flags; no content bytes were rewritten. The final release also restored the isolated close-save test overlay and rechecked manifest blocking/explicit untested AI status.

The following native/MCC results describe the earlier Phase 1 baseline unless explicitly marked Phase 2.

The development watcher excludes native sources, Rust outputs, local tools and supplied archives. Inspection of the running Vite watch list found no entries under those directories; the browser check passed after this fix. This prevents native builds from making the web preview watch locked executable outputs.

The Rust core suite covers all five cache-family headers, the actual reordered Demo header, malformed/truncated files, invalid pointers/counts/flags, source preservation/hashing, missing resources, 5,000 randomized header mutations, project roundtrips/backups, SQLite persistence, semantic numeric/reference edits, scenario position/spawn yaw patching, immutable source identity, asset re-ingestion, traversal/device-path rejection, non-default Steam libraries, ownership-safe folder initialization, manifest locking/encoding/backups/preservation, OBJ parsing, and live-protocol capability rejection.

The frontend unit suite covers semantic overlays, numeric validation, scene editing, undo/redo, redo-branch reset, merge of build completion without losing unsaved changes, and vector validation.

Run:

```powershell
cargo test -p spark-core
pnpm test
pnpm check
```

## Actual native UI checks

Using the real Tauri Windows WebView, not mocked filesystem results:

- Launch and Steam/MCC detection on a non-default D: library.
- Open an owner-installed real Halo 1 map and render its collision geometry.
- Select a placement, edit its position, undo, redo and restore it.
- Edit a real weapon field, undo it, swap an existing projectile reference, and undo it.
- Navigate library, tag, scenario, build/readiness and settings workspaces.
- Generate a library preview from real imported geometry.
- Capture [library](screenshots/library.png), [world editor](screenshots/world-editor.png), [tag editor](screenshots/tag-editor.png), [scenario inspection](screenshots/scenario.png), and [build/playtest](screenshots/build-playtest.png).

`scripts/smoke-ui.mjs` connects only to the explicitly started QA app on localhost. It does not launch MCC or modify stock game data.

The initial native smoke test passed 10 checks with zero page errors against the installed MCC cache. An additional 10 release-app checks passed with zero page errors using the owner-supplied restoration library: actual Inbox file detection/deduplication, automatic conversion attempt, source hashes, build results for all four distinct gameplay variants, disabled launch while unvalidated, real Demo collision geometry, placement undo/redo, weapon/reference editing, and saving an actual edit/reopening it/resetting it to its original value. See `scripts/verify-restoration-desktop.mjs` and the [restoration report](RESTORATION_REPORT.md). Library/world/tag/build screenshots show the supplied Demo candidates; the scenario screenshot shows the earlier installed MCC map with its real encounter hierarchy.

## Real cache / external-tool results

Owner-installed `halo1/maps/a10.map`:

| Check                                            | Observed result                                                                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Header                                           | Version 13, 108,001,588 bytes                                                                                                                |
| Tag index                                        | 3,747 tags, 336 audited editable fields                                                                                                      |
| Scenario                                         | 506 placements, 39 AI encounters, 189 compiled scripts                                                                                       |
| Geometry                                         | 180,444 collision vertices, 367,004 triangles across real BSPs                                                                               |
| Source SHA-256                                   | `08cd04eb76fbd61e57016fb592d95491905c61e021702a45e1359a4551abe15b`                                                                           |
| Invader 0.55.0 protection / CRC mismatch / stubs | All returned zero                                                                                                                            |
| Existing-cache validation                        | Passed; output hash equals source hash; no conversion performed                                                                              |
| Extract/rebuild                                  | Extraction reported 1,471 missing-resource errors; now rejected even though exit status was zero. No output was marked validated or playable |

The first adapter attempt exposed the zero-exit/incomplete-extraction behavior. The implementation was corrected and the repeated test stopped before compilation with the missing-resource diagnostics. The remaining dependency is original source resource data or official editing-kit assets, not a renamed header.

## Pending integration

No Excession exact-scenario template is installed here. Package metadata validation is a limited contract check, not a full official-schema validator. Actual MCC mod enumeration, anti-cheat-disabled launch selection and loading a generated package remain untested. Steam is not launched automatically during QA.

The original restoration archive is now supplied. Detection, indexing, real geometry/editor operations and automatic Inbox conversion attempts were exercised. Dependency resolution is blocked on real extraction errors; successful conversion, registration, MCC selection and gameplay remain **PENDING**. Synthetic fixtures are not accepted as proof and are blocked from game build/export.
