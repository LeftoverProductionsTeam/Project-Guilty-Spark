# Verification record

Recorded 2026-10-25 on Windows x64. Tests are separated from actual game acceptance.

## Automated checks

40 Rust core tests and 7 frontend unit tests pass. Rustfmt, TypeScript checking, and Clippy for the core and desktop targets with warnings denied pass. The browser-preview Playwright test passes against installed Edge. These checks do not establish game compatibility.

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
