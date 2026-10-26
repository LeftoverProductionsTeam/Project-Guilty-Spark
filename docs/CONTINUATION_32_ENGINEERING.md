# Continuation 32 — native readiness and source pipeline repairs

Date: 2026-10-26. Cumulative application version: **0.3.1**.

## Baseline and what changed in the supplied update

The Git history still ends at Phase 2 commit `67cfcdf`. The supplied working tree is the much larger Continuation 31 source, with uncommitted additions. It was retained and extended in place.

All **429** records in the supplied source manifest matched the working files before repairs. Both manifests matched each other; their SHA-256 was `76595d0618ca7720a456beccd833b80b3aadf231dfe3d03c1371c600d5c4cbcd`. The observed C31 ZIP SHA-256 was `757bec2a554b1c35141ecd0efbffc8cee05c3aae54663accb581b748b2f09dce`. The ZIP was no longer present at its observed Downloads location when independent extraction verification was attempted. Its container/extraction check is therefore **NOT RUN**; the 429 source-file hash comparisons did pass. No replacement archive or historical checksum was invented.

Relative to Phase 2, your update adds actual BSP render streams, static/bind-pose model meshes, shader/bitmap/lightmap provenance and bounded bitmap previews; expanded QuickForge terrain/cave and game-mode source tools; selected binary-tag extraction/staging, lineage and migration review; Creator Studio/HaloScript source; multiplayer/server handoffs; theme/media profiles; optional legacy companions; Community Maps; Academy, onboarding, search and 19 workspace guide contexts. Many are source-authoring or preview operations. The historical reports themselves explicitly leave compiler, gameplay and multiplayer gates open.

## Repairs implemented in C32

- Fixed two Rust compilation errors in `tag_exchange.rs`: invalid comma-separated declarations and an incorrect string replacement argument.
- Fixed four TypeScript errors: the R3F line/SVG intrinsic collision, an out-of-scope environment error callback, a nullable clicked face index, and an incomplete typed renderer fixture.
- Restored the original `sealedArena` creation alias while preserving the newer explicit template allowlist.
- Corrected the terrain seam regression test to count its terrain parts separately from the retained 12-triangle enclosing room. The terrain generator was already producing those surfaces correctly.
- Added compiler-side shader basename ambiguity checks across shader classes/paths. A valid full dependency path alone cannot guarantee which shader Halo Tool chooses from a JMS basename.
- Rechecked preserved cache/resource identity after selected-tag extraction and rechecked target/source identities before committing a staged tag copy. Added a transfer regression for hashes, overwrite refusal and unchanged targets.
- Replaced internal palette HTML5 drags with pointer gestures. Tauri's Windows WebView2 file-drop integration otherwise intercepts HTML5 drag/drop. Native map/archive file drops remain enabled. Verified pointer placement and Escape cancellation in the running Windows application.
- Added a sealed-room boundary check before palette placement mutates the project. Wall/roof/exterior drops are refused; room rotation is respected. Objective placements receive the same small floor clearance as other markers. Manual authoring can still retain incomplete projects for repair.
- Fixed material-inspector flex/scroll layout so preview controls no longer overlap the following empty-state panel.
- Kept workspace accessible names concise and supplied help as descriptions. Updated browser tests for first-run onboarding and the newer Live Lab scope; added keyboard search/focus coverage.
- Restored ignored local caches, historical archives/game data and generated native resources. Added explicit source packaging, manifest verification and a living requirements ledger.

## Verification

| Check | Result and scope |
|---|---|
| TypeScript project check | PASS |
| Frontend unit tests | **41 PASS** |
| Offline Node scripts | **59 PASS**; these are source logic/contracts, not engine tests |
| Rust workspace tests | **154 PASS**, including native command support tests |
| Browser tests | **9 PASS**, including synthetic IPC contracts; these do not replace native tests |
| Windows Tauri release build | PASS, 0.3.1; app opened in WebView2 |
| Actual Demo world | 2,825 tags, 197 placements, **5,503 render triangles**, **31 model types** decoded in native app |
| Native arena editing | Five-mode template, 32 starts, 21 objectives; resize, undo/redo, autosave/reopen, reference placement and source export exercised |
| Native palette drag | PASS; Escape cancellation PASS; exterior placement refusal added |
| Native Tag Editor | Actual numeric projectile field edit persisted/reopened, then original value restored |
| Actual binary tag extraction | `weapons\pistol\bullet.damage_effect`, 736 bytes; SHA-256 `dde3c8444b332ab4f176bf8ce03b7fa4260b12dc94660992d256150dbbe9772c`; separately installed Invader checksum readback **matched** |
| Original historical corpus | All **67** files retain their expected bytes and read-only attributes, including hidden supporting files |
| Halo Tool/BSP/map compilation | **BLOCKED**: no discovered HEK/H1A tool or selected complete editable base tags |
| Game load/five game modes/AI/multiplayer | **NOT RUN** |
| macOS/Linux/PowerPC | **NOT RUN** |

Machine-readable evidence: [verification record](fixtures/continuation32-verification.json). Actual screenshots: [arena](screenshots/continuation32/native-arena-final.png), [world](screenshots/continuation32/native-world-verified-materials.png), [tag edit](screenshots/continuation32/native-tag-edit.png).

## Failures and remaining risks

The initial C31 build failed with the two Rust/four TypeScript errors above. Four stale template integration tests and one terrain count test then failed; those are repaired. Seven initial browser tests failed against changed onboarding/navigation/Live Lab contracts; the updated nine-test suite passes.

The actual world-material batch **refused all 24 requested diffuse/lightmap images** as outside the verified classic preview subset. An independent internal bitmap request returned a 256×256 preview, but this does not establish world texture support. Native screenshots show geometry with approximate editor materials. Authentic shader/lightmap parity remains unresolved.

One native navigation pass recorded an intermittent `NotFoundError: removeChild` from the 3D label lifecycle. Later navigation did not reproduce it. Its cause and repair remain open; C32 does not claim an error-free native UI. Touch palette dragging, all DPI/accessibility combinations and long editing sessions also remain unverified.

The build attempt correctly produced a blocked receipt, with missing sky/shader/kit/tag dependencies. A source JMS and a generated command plan are not a compiled BSP or playable map. No stock map was replaced, no historical executable was run, and no game/network/EAC action was taken. The historical Zombie Apocalypse restoration defects and multiplayer AI limitations remain open.

## Requirements and next engineering gate

[The living ledger](MASTER_FEATURE_LEDGER.md) retains all 92 reconstructed rows, all 86 rows actually present in the supplied crosswalk, and 16 current directive families. The older reference to 122 is historical; it is not asserted as the row count of the supplied CSV or a completion total. Missing historical source documents are not fabricated.

Next gate: supply a separately installed compatible HEK/H1A kit and complete legal editable tags, select its exact generation, and compile the existing smallest original arena in an isolated job. Retain structure/scenario/lightmap/cache logs, then test Slayer before the five-mode arena. Test game loading, collision, objectives and two-client play separately.

## Research that informed the change

- [c20 material naming](https://c20.reclaimers.net/h1/source-data/h1-materials/): Tool matches shader basenames across tag classes; this directly motivated the new ambiguity guard. No shader source or game assets were copied.
- [c20 Halo Tool](https://c20.reclaimers.net/h1/h1-ek/h1-tool/): retain generation-specific arguments and defer cancellation during sensitive tag-writing phases. Official kit binaries remain external.
- [Invader upstream](https://github.com/SnowyMouse/invader): existing separately installed 0.55 tools were used for selected-tag extraction/checksum verification. No external executable is bundled in the source/app release.
- Installed Tauri configuration schema documents that Windows file-drop support replaces WebView2 HTML5 drag/drop. This motivated pointer-driven internal drags without changing OS settings or disabling source-file drops.

Existing MacGamingMods, Fonzie/Fonzeh and community credits remain in the original archaeology, Academy and continuation documents. No decompiled `SAMPLE CODE` implementation was incorporated.
