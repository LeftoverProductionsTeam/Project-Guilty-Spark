# Add checked Custom Edition setup and verify the integrated workbench test build

Custom Edition setup previously required an already registered runtime. Spark now detects an installed game, connects an explicitly selected folder, or downloads the project's pinned community archive into a separate managed installation. Setup includes progress/cancellation, complete archive identity checking, bounded Windows extraction, required content checks and remembered registration. Bundled setup/update programs never execute; existing game files stay intact.

The native acceptance imports the downloaded CE Blood Gulch, verifies 2,455 tags and preserves the existing installation's 127 files. Real private CE dedicated-engine trials report stock Blood Gulch and a fresh reviewed-source Workshop map compiled through the final packaged Spark executable in `openplaying`. The automated client trial did not join and remains a recorded failure.

The continuation audits the older feature checklist against the committed workbench, refreshes native compiler/renderer/asset/collaboration checks and prepares a Windows installer, portable ZIP and source archive. See `docs/TEST_BUILD_READINESS.md` and its sanitized receipt for exact identities, tests and remaining gates.

Validation: Windows `cargo test --workspace --locked` (570 passed, seven opt-in ignored), 253 frontend tests, 103 browser contracts, 59 offline scripts, TypeScript and Windows/NSIS builds. Native editor and engine observations are recorded separately; there is no claim of complete shader/audio parity, general direct compiled-map editing, successful client multiplayer, game-peer replication or every planned runtime/platform feature.

C35–C39 history, original source safeguards and unfinished root research remain preserved. No proprietary Halo files are included in release artifacts, and no direct push, force-push or repository ruleset change is part of this continuation.
