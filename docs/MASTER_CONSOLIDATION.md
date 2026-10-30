# Master engineering consolidation — 30 October 2026

The latest **C38–C40 consolidation and ending refs** are recorded in [C40 engineering](CONTINUATION_40_ENGINEERING.md), [its verification receipt](fixtures/c40-verification.json) and [the updated push description](C40_GITHUB_DESCRIPTION.md). The C35–C37 record below is historical and describes the earlier promotion to `8c0bed0`; its earlier test counts and publication state are not the C40 final results. Earlier source histories, experiments and artifacts remain preserved.

C35 R12, C36, One Halo research and C37 were integrated in an isolated worktree. All completed engineering histories are reachable. No tracked source path was deleted, no development history was rewritten and no experimental research was discarded. Seven unvalidated dependency proposals remain separate.

## Commits and integration

- Starting local and remote master: `617d267a8dd8b1c504d47bdaef4c0f338615786e`.
- Frozen C37: `bde73ceb00f42f6dce916a93d9d4c0adb8dae207` on `codex/c37-modders-workbench`.
- Integration branch: `codex/integration-all-continuations`; verified merge tip: `7217982e1169152baea4523c29698e7d67d29ae4`.
- Four explicit non-fast-forward merges: C35 `b742ead070d15be94e02b2d5276ec1cc799498c1`, C36 `ccc344defaa1a0c0e330a19fbe70a8901e72a595`, One Halo `763d038f214d4970b80d296af874dffe32cf49c3`, C37 `7217982e1169152baea4523c29698e7d67d29ae4`.
- No merge conflicts occurred. C37 already contained the earlier engineering commits through ancestry; ordered merges retained that history without reapplying overlapping changes. The integrated runtime source exactly matches frozen C37. Subsequent changes are verification scripts, a QA fixture path fix and documentation.
- After this record is committed and final checks pass, local master is promoted with a normal fast-forward. The delivery's final commit is the reporting commit containing this file; obtain its full identity with `git rev-parse master`. The final local state and graph are also recorded under the private backup folder below.

## Every discovered starting reference

The [machine inventory](fixtures/master-consolidation-refs.json) includes merge bases, all unique commit subjects, changed paths and ancestry checks for every reference. Counts below compare each tip with starting master; overlapping commit counts must not be added together. Fifteen engineering/base/alias refs are contained and seven dependency proposals are excluded. The newly created integration branch is additional to these 22 starting refs. No separate SparkLink branch, tag or stash was present. Its existing collaboration implementation is retained through the earlier engineering ancestry.

| Reference                                            | Starting tip                               | Unique commits | Changed paths | Disposition                                          |
| ---------------------------------------------------- | ------------------------------------------ | -------------: | ------------: | ---------------------------------------------------- |
| `codex/c37-modders-workbench`                        | `bde73ceb00f42f6dce916a93d9d4c0adb8dae207` |             33 |           279 | Merged with explicit non-fast-forward merge          |
| `codex/consolidation-start-20261030T001853Z`         | `617d267a8dd8b1c504d47bdaef4c0f338615786e` |              0 |             0 | Already contained in starting master                 |
| `codex/continuation-33-donor-scenery`                | `be3d3af6062700a768666d6ab5a652b21c668d68` |              0 |             0 | Already contained in starting master                 |
| `codex/continuation-33-hosting-collision`            | `03686e920cbe2dcf71af7f333ed2de448910f408` |              0 |             0 | Already contained in starting master                 |
| `codex/continuation-33-native-gameplay`              | `6610adf80f518d4e6a6e49379c990efe1eff0d14` |              0 |             0 | Already contained in starting master                 |
| `codex/continuation-33-resources-and-community`      | `4da849efaffa9161a369cb1264c260214b5d0d4b` |              0 |             0 | Already contained in starting master                 |
| `codex/continuation-33-world-challenges`             | `520b69c8b8654bd83ad456dce23a8e3a47f409d5` |              0 |             0 | Already contained in starting master                 |
| `codex/continuation-34-runtime-integration`          | `d6bfe25666aad35aa63cd1fdd7082d71ca72119b` |              0 |             0 | Already contained in starting master                 |
| `codex/continuation-35-living-workbench`             | `21804c191a918cbf8bd74efac60dfcec65c9083b` |             24 |           210 | Merged with explicit non-fast-forward merge          |
| `codex/continuation-36-one-halo`                     | `489443d7b892b14bda553ed5f4f8d33480ffe78c` |             31 |           237 | Merged with explicit non-fast-forward merge          |
| `codex/one-halo-mcc-investigation`                   | `c9c92e33b97f9b85fce2fcccbab28e4bb3f2464b` |             32 |           247 | Merged with explicit non-fast-forward merge          |
| `master`                                             | `617d267a8dd8b1c504d47bdaef4c0f338615786e` |              0 |             0 | Already contained in starting master                 |
| `origin/HEAD`                                        | `617d267a8dd8b1c504d47bdaef4c0f338615786e` |              0 |             0 | Already contained in starting master                 |
| `origin/codex/continuation-34-runtime-integration`   | `d6bfe25666aad35aa63cd1fdd7082d71ca72119b` |              0 |             0 | Already contained in starting master                 |
| `origin/dependabot/cargo/rusqlite-0.41.0`            | `6dfce357b41d89ac6da7816ba9c1a90e97f60430` |              1 |             2 | Excluded dependency proposal - unvalidated, retained |
| `origin/dependabot/cargo/sha2-0.11.1`                | `2d8c7bcbed99cbf19fbd0725d44618d5b133e9c0` |              1 |             2 | Excluded dependency proposal - unvalidated, retained |
| `origin/dependabot/npm_and_yarn/lucide-react-1.61.0` | `f8e0387b3a2b429f2fcbecbf10a1587a9eec6786` |              1 |             2 | Excluded dependency proposal - unvalidated, retained |
| `origin/dependabot/npm_and_yarn/three-0.186.1`       | `763013dffdb852fc09625df0344e06626afb4f9d` |              1 |             2 | Excluded dependency proposal - unvalidated, retained |
| `origin/dependabot/npm_and_yarn/typescript-7.0.2`    | `23e8df59a2d9fdbf281028e0e75ce7e23440a7aa` |              1 |             2 | Excluded dependency proposal - unvalidated, retained |
| `origin/dependabot/npm_and_yarn/vite-8.3.5`          | `e5b86647d5eac892c260a5b26ceca1c45593e42f` |              1 |             2 | Excluded dependency proposal - unvalidated, retained |
| `origin/dependabot/npm_and_yarn/vitest-5.0.5`        | `b35386e0ee797f0673bfa5328312bbca25ebec04` |              1 |             2 | Excluded dependency proposal - unvalidated, retained |
| `origin/master`                                      | `617d267a8dd8b1c504d47bdaef4c0f338615786e` |              0 |             0 | Already contained in starting master                 |

Dependency proposals change dependency manifests/locks and were not completed, regression-verified engineering continuations. Each remains unchanged in its remote-tracking ref and verified bundle. They require separate compatibility reviews; this report does not claim every available branch was merged.

Worktrees: the original checkout at `D:/Project Guilty Spark` and isolated `D:/Project Guilty Spark/.local/integration-all-continuations`. No other active Spark editing chat was found. C37 was committed before integration and its branch remains frozen. Original refs were checked against the backup snapshot before master promotion.

## Features retained

- C33/C34: existing map/tag editing, native build and recovery, BSP/tunnel/collision and visibility systems, live-edit safety, downloads/dependency setup, hosting and collaboration code. Their gameplay and scaling limits remain in the ledger.
- C35 R12: native geometry/material/decal/teleporter handling, editor ambience and multitrack sound, compact themed headers/drawers, window controls, per-map workflows and detachable Recording Director.
- C36: Portability Lab, native preflight, untouched-byte checks, native compiler input preservation, semantic reports, painted-detail protection and community-runtime evidence.
- One Halo: private native discovery, protocol investigation, MCC boundary research and reproducible experiments. Actual MCC-to-Chupathingy/OpenCE session admission is not implemented or proven.
- C37: pinned Baboon handoff, retained native source revisions, conflict-aware reconciliation, stable-save monitoring, native integrity/structure checks, explicit writer uncertainty and compact QuickForge session controls.

All 342 evidence-ledger records and historical credits remain. Requirements are not completion counts. Disabled or incomplete research was not enabled to make the merge appear complete. The [Universal Workbench continuation](UNIVERSAL_WORKBENCH_BACKLOG.md) remains queued.

## Combined regressions

| Verification                                 | Result                                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Rust workspace, Windows, locked dependencies | 494 passed; 0 failed; 7 opt-in ignored in the standard run                                                  |
| Additional owned campaign BSP cases          | 2 passed separately; 89,233 painted instances / 282 cells; destructive serialization blocked before writing |
| Frontend                                     | 216 passed in 44 files                                                                                      |
| Browser                                      | 79 passed with original test limits                                                                         |
| Offline                                      | 59 scripts passed                                                                                           |
| TypeScript                                   | Passed                                                                                                      |
| Windows release / NSIS                       | Both built successfully                                                                                     |
| Per-merge focused checks                     | C35 225 core tests; C36 230 core tests; One Halo 5 private-discovery tests; TypeScript at each merge        |

Seven opt-in cases remain ignored by default; the two BSP cases were explicitly run afterward. The other owner/session/provider/powerup/campaign/UI probes are not counted as passes. Hosted CI was not claimed green.

The first browser run had ten navigation timeouts during cold development-server startup alongside the first release build. A complete rerun after that build passed all 79 without disabling tests or raising their limits. Initial configuration/target-selection errors and failed native attempts remain in private logs. The combined native runner was corrected to reopen saved maps through the library rather than assert unimplemented startup-tab restoration. The integrity UI check explicitly selects its source map before inspecting a warning. Recording fixtures now canonicalize their source root, fixing genuinely broken relative paths across checkouts; the recording runner uses a unique replica title and waits for its native viewport. An auxiliary viewport capture was corrected to require stable completed material loading rather than accept an initial empty frame. These are recorded corrections, not invented successful trials.

## Actual native acceptance

The [metadata-only receipts](fixtures/master-consolidation-verification.json) identify every tested executable and input hash. All six integrated native runners used application SHA-256 `dc0621d4dee1d51e217411980f6d4f83abc6585537e393422f0c46ecd05c215b`.

1. **Genuine Baboon:** the founder edited pistol radius 0.1 to 0.5 in Baboon 0.3.2, saved and closed it. Exactly that exposed native field differed; reconciliation, H1A compilation and reopened value 0.5 passed. All 2,240 initial native hashes matched. This earlier genuine GUI stage has its own application hash in the receipt; the integrated integrity/compiler path was then retested separately.
2. **Save integrity and recovery:** a harmless 201-byte Invader normalization exposed identical typed values and was accepted. A deliberately malformed dependency with a valid CRC was rejected by the pinned parser and reconciliation. A separate CRC failure was detected. The controlled corrupt writer was the QA process, not evidence of a Baboon/Invader defect. Recovery retained damaged evidence and prior accepted source. A fresh 0.1-to-0.225 edit compiled and reopened as float32 0.224999994. All 2,240 baseline files matched. Detection measured 3.80 seconds; build/readback 41.45 seconds in this run.
3. **One combined workflow:** open native source, edit/save a weapon, import a real native weapon, create its item collection, add a scenario equipment placement at [2, 0, 0.1], compile, reopen both saved maps and verify preservation. Four external changes passed native validation. The compiled imported radius and placement matched, all four existing objects/player starts survived, every compiler input tag byte matched and the old cache/project overlay remained intact. All 2,240 original source files matched. Native build time was 24.69 seconds. A separate reopen confirmed a visible rendered viewport and completed material loading. This is a native loose-tag workflow, not arbitrary OBJ placement compilation or campaign-object acceptance.
4. **Rendering/window workflow:** real Zombie Demo and MCC Blood Gulch, native shader/bitmap provenance, decals, teleporter, object/tag drawers, multiple maps and actual fullscreen/window controls passed the existing native regression. Captures were visually inspected. This is editor preview evidence, not complete engine appearance parity.
5. **Sound:** MCC classic ADPCM resources were found without a folder picker. Both Warthog main tracks were imported/saved as one undoable group. Mute/solo layout passed at 280/360/520-pixel drawer widths. Production mixer output had two voices, relative error about 9.4e-8 and muted RMS zero. Physical listening, CELT support and game acoustics are separate limits.
6. **Director:** a real native UI take with saved non-synthetic map audio was independently decoded. Pause/resume, background rendering, clean view, cancellation, protected output names, wrong-window refusal and saved preferences passed. Video was 1920x658, 67 decoded frames, with Opus audio; sound beyond its saved distance was silent. No OS capture picker, microphone, system audio or game capture was tested.
7. **Portability:** actual CE Alpine-to-MCC compilation passed in 186.27 seconds. All 11,664 native compiler input tags remained byte-identical. Semantic comparison retained 4,844 audited fields, reported 19 field changes, 1,082 unpaired audited fields and 47 missing tags. Those differences remain visible; this is not a lossless conversion claim. Original maps stayed unchanged.

## Integrity, backups and recovery

Verified starting backup: `D:/Project Guilty Spark/.local/consolidation-backups/20261030T001853Z`. It contains the integration-start reference snapshot, all-ref starting bundle and uncommitted source copies. The final 57-file C37 precommit snapshot has SHA-256 inventory under `c37-final-uncommitted`.

The `post-c37` subfolder contains `all-refs-post-c37.bundle`, bundle heads/verification, complete branch/path audit, worktrees, stashes and graph. It records a complete history including C37. A separate mirror was cloned from that bundle and passed full object verification. Final reporting/master state and another all-ref bundle are recorded under `final` after promotion. No branch or research directory was deleted. Public receipts contain metadata; proprietary maps, tags, the Xbox image, tools, SDKs, raw audio/video and damaged native fixtures remain private.

The [complete merge graph](fixtures/master-consolidation-merge-graph.txt) is the pre-promotion source-history snapshot. The reporting commit follows its four merge commits. Final delivery records the promoted master hash and final graph.

## Publication and remaining limits

The non-interactive GitHub authentication probe failed because no usable saved credential could be obtained. Credentials were not changed. No remote update or public release is claimed; README, changelog, architecture, support notes, feature ledger and [push/PR description](MASTER_CONSOLIDATION_GITHUB_DESCRIPTION.md) are prepared in the verified local source. After signing Git in locally, use:

```powershell
git push -u origin codex/integration-all-continuations
git push origin master
```

If master requires a PR, push the integration branch and use the prepared description instead of bypassing protection. No force operation is needed.

No new Halo game loading, collision traversal, MCC cross-play, independent-client SparkLink agreement, 128-player match, arbitrary live spawning/BSP replacement, dual-wield/sword/lunge acceptance or complete render/audio parity was performed. Existing capability gates remain. Saved map tabs must be reopened from the library at startup. These are explicit future acceptance/work items, not discarded engineering work or blockers hidden by the consolidation.
