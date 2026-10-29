# C36: native Halo portability, preservation gates and reviewed conversions

Add Portability Lab and native Engine Preflight to the existing build workflow, preserving native Halo files and keeping Spark metadata outside them. Fix unintended signed-zero byte changes, verify compiler inputs, report semantic conversion differences and stop unproven painted-detail BSP saves. Real Invader/H1A conversion, native tag round trips and C35 Director/render/audio regressions pass. Separate private OpenCE/Chupathingy game trials demonstrate asymmetric exact-release interoperability with explicit state/phase discrepancies; MCC converted-map loading, complete combat/AI parity and the broader gameplay backlog remain open.

## Why

Creators need to know which native data can safely move between editions and what a compiler changed. Existing byte patching could rewrite untouched negative-zero coordinates, compiler success did not explain semantic differences and BSP environment saves could damage painted detail objects. Community invitations also rejected Chupathingy's documented protected format.

## Changes

- Reuse existing exact Halo 1 runtime profiles in **Build & playtest → Portability Lab**. Add cited source-bound findings, compiler readiness, untouched-byte verification, report export and owned validated-build comparison.
- Preserve semantically unchanged native cells and verify every byte outside reviewed edit spans. Native formats remain ordinary Halo tags; no mandatory new tag class, interchange format or game protocol.
- Inventory loose native inputs before/after H1A Tool and withhold changed-input output. Write readable/JSON semantic reports resolving native class/path/reference identities independently of relocated datums.
- Add bounded native BSP detail snapshots and block painted-detail audio serialization before writing where exact Z preservation cannot be established.
- Route exact protected Chupathingy invitations only to that runtime; keep password/crypto in the client.
- Add separate Warthog Xbox identity, community feedback form, current policy/setup/compatibility/limits/credits and cumulative ledger updates.

## Verified scope

Windows x64 Spark UI, owner-local CE Alpine, MCC Blood Gulch/A30 and a canonical QuickForge native scenario, installed Invader and official H1A Tool. Actual CE-to-MCC compilation retained all **11,664 native compiler input tags** and produced explicit differences: 4,844 unchanged audited fields, 19 changes, 1,082 unpaired fields and 47 CE UI omissions. One real native no-op save was byte-identical; a controlled spawn edit preserved every unrelated byte and survived external-save detection, review, rebuild and separate-map readback.

Actual A30 production-path guard preserved **89,233 painted instances** by refusing before serialization. Fresh Director VP8/Opus takes independently match real Ghost intro/loop/end clips. Native rendering/header/tag-tree checks and automatic MCC ADPCM/multitrack/mute/drawer tests pass on the delivered executable.

Checks: **480 Rust passed / 7 opt-in ignored**, with both new owned-BSP tests separately passed; **216 frontend / 44 files**, **79 browser**, **59 offline**, TypeScript and Windows EXE/NSIS build pass. Local success does not certify hosted master CI. [Detailed results](CONTINUATION_36_ENGINEERING.md) and [metadata receipt](fixtures/c36-native-preservation-verification.json).

## Compatibility, multiplayer and limits

Only the existing imported-cache MCC converter is implemented. Full native class/animation/script/limit schemas, all-engine conversion, retail game load and visual/audio equivalence remain open. Nine sound-distance pairs and the explicit MCC UI omissions need runtime review. The native tag no-op fixture is one canonical scenario, not a universal serializer guarantee. The painted-detail gate covers Spark's BSP audio writer; generic Sapien saves and exact native detail editing remain unverified.

Publisher-signed OpenCE build-329 and Chupathingy v0.8.1c ran with owned Xbox data, separate roots and loopback-only private configuration. Same-runtime pairs and OpenCE-host/Chupathingy-client joined and simulated Blood Gulch; the opposite direction was refused as host32/client39. Logs retain interpolation, phase and inventory differences rather than claiming perfect state parity. Native hooks exercise impact damage and forced death/respawn, not trigger input or projectile flight. [Exact trial scope and reproduction](C36_COMMUNITY_NATIVE_TESTS.md).

Spark's listing/invitation-to-client flow and authenticated cross-version resolution remain separate. Protected invitations are not MCC wire translation. AI agreement, eight-player campaign/Firefight, game-peer edits and 128-player gameplay are unaccepted. Four-map game traversal, procedural UV authoring and the existing advanced gameplay backlog remain in the full ledger.

## Safety and performance

Originals, the Xbox image and SDK masters remain untouched; QA uses isolated libraries/profiles and derived files. Twenty-nine C35 release files are frozen. All 319 prior ledger IDs remain, with 17 added C36 records. No public hosting, router/firewall changes, MCC memory writes, anti-cheat/authentication bypass or third-party engine implementation was introduced.

Same-fixture C35/C36 opening and compatibility measurements vary across sequential/reverse-order runs; no optimization claim. Native compiler integrity checks add **18.46 seconds** of full-tree I/O in the recorded **131.86-second** conversion. Large-chunk, full-system/GPU/network and long-session profiling remain open.

## Credits and next acceptance

C20/Reclaimers research, Invader and existing Halo tool authors, OpenCE, Chupathingy and Warthog retain attribution and their exact CC BY-SA/GPL/AGPL boundaries. No game assets, native tools, private QA media or staged clients are redistributed. See [community credits](../COMMUNITY_CREDITS.md).

Next: load/play the converted Alpine output in matching H1A Standalone, review sound/UI differences, accept visible/human play through Spark's actual join route and observe AI actors independently across clients. Continue exact painted-detail/native schema work, four-map runtime acceptance and native-compatible procedural UV authoring. This branch does not silently merge master, tag or publish a public release.
