# C40 — Native integrity, external companions and verified consolidation

This continuation preserves the existing workbench. It completes specific C37 integrity gaps, integrates a bounded CE companion route and consolidates completed C38/C39/C40 work only after verification. Experimental work, dependency proposals, private fixtures and prior releases remain separate and recoverable.

## 1. Starting repository state

Real repository: `D:\Project Guilty Spark`; the previously mentioned `D:\Project Guilty Spark.local` does not exist. Starting branch `codex/c39-sparklink-live-studio`, HEAD `192b2f5cb8a845b17d48a7def66d96ae631bd67a`, clean. Work proceeds on `codex/c40-companions-and-consolidation`.

Starting local master, integration branch and live remote master all resolve to `8c0bed0fcce3fbff7108b53dcee6ef077f253387`. C37 `bde73ceb00f42f6dce916a93d9d4c0adb8dae207` is already included. C36 `489443d7b892b14bda553ed5f4f8d33480ffe78c` is a real ancestor. The unique completed development commits above master are C38 `45596d5072b1c115c71132b78e7798c3baa547d0` and C39 `192b2f5cb8a845b17d48a7def66d96ae631bd67a`.

The existing isolated worktree `.local/integration-all-continuations` is clean and still owns `codex/integration-all-continuations`. Seven separate Dependabot proposals remain independent; no automatic dependency merge is authorized by this report.

## 2. Preservation before edits

Verified all-ref bundle: `.local/continuation40/state-audit/starting/all-refs.bundle`, SHA-256 `be6bbc342bd7ac23da791a18a690261608cc81c5a56f79ebf3b8619d1744c403`. The starting audit retained staged/unstaged patches and worktree status; both tracked patches are empty and no untracked source was outstanding. Ignored native tests, research, SDK inputs, earlier installers, source archives and manifests remain in place. No reset, history rewrite or destructive cleanup is used.

## 3. C37 status and remaining gaps fixed here

C37 is completed and committed, not recreated. Its [metadata receipt](fixtures/c37-native-acceptance.json) records the genuine founder-operated Baboon 0.3.2 pistol edit from radius 0.1 to 0.5, full-file reconciliation, native H1A compilation and cache readback. The genuine unchanged save was byte-identical. Its 2,240 immutable native input hashes were rechecked. This is historical evidence from that exact approved binary, not a fresh human GUI test in C40.

The remaining detection gap was missed notifications combined with unchanged size/timestamps. C40 adds a rolling streamed SHA-256 audit, capped at **8 MiB and 64 completed files per poll**, throttled to once every **two seconds**. A large file spans polls and retains no open handle between them. A mismatch enters the existing two-observation/1,500 ms stable-save pipeline. Unchanged files do not enter the semantic parser. Metadata scans still discover additions/deletions; notifications remain the fast path. A full sweep is not instantaneous, and latency depends on file order, library size and active polling. Build/reconciliation performs complete source identity checks separately.

The acceptance gate also now rejects changed source with unverified/pending semantic results or without enough native parser checks. A matching CRC alone is insufficient. The header/CRC layer, configured native parser, typed-field comparison, native compiler and gameplay tests retain different meanings. A missing optional CRC can still be parsed as native source; a malformed or mismatching checksum is not silently repaired.

## 4. Native-save acceptance

The [C40 native receipt](fixtures/c40-native-save-integrity.json) records the actual Windows run using executable SHA-256 `5a92f8bf9eb275a16329626f073d48a85d6b40956666824dde0fd187c6351776`:

- A no-op Invader serialization changed **201 bytes** while preserving exposed typed fields; it was accepted as equivalent, without certifying opaque bytes.
- A malformed model-reference length with deliberately **valid CRC** was rejected by the pinned parser and reconciliation. The [native rejection screenshot](fixtures/c40-native-semantic-rejection.png) identifies the validator separately from the unknown writer. No Baboon launch PID was invented.
- A separate CRC failure was detected. Starting bytes were restored to a new source revision; damaged external evidence and the prior accepted source remained intact.
- A valid radius edit **0.1 → 0.225** was detected in **3.22 seconds**, reconciled, compiled by H1A Tool in **31.29 seconds**, and independently reopened with float32 value **0.22499999403953552**. [Native compiled-result screenshot](fixtures/c40-native-valid-edit-compiled.png).
- All **2,240** starting tag hashes matched afterward, the original cache hash was unchanged, scene/tag/QuickForge drafts were retained, the result opened as a separate map tab and no JavaScript errors were recorded.

The notification-path timing above is not a worst-case bound for the rolling missed-event sweep. The genuine human Baboon edited-save proof remains the separate C37 receipt and exact binary identity.

The production acceptance runner is `scripts/test-native-save-integrity.mjs`. It uses copied native source, a private Spark library, the approved Baboon profile and pinned Invader; it does not manufacture a second human Baboon GUI save. It distinguishes equivalent binary normalization from malformed native structures with valid CRC, retains rejected bytes, restores a new source revision and compiles an intentional valid edit with native cache readback.

## 5. Tool and writer evidence

Live save reports include observed revision/time, current file size/mtime, before/after stable hashes and bounded changed paths. Prepared Baboon associations include its reviewed version, executable path/hash and a last launched PID only when Spark observed that launch. Guerilla/Sapien associations are limited to running launches for the exact map and source folder, with their selected executable hash. Product versions that were not independently queried are labeled accordingly.

**Actual writer confidence remains unknown for filesystem events.** A handoff, PID, open tool, temporal correlation or read-only Invader validator is not direct write attribution. The UI labels these as associated tools and retains the failure findings separately. There is no OS-wide process-write tracing claim. Known findings distinguish Baboon's scoped passes, pinned Invader normalization, historical Eschaton crash reports and a CE/H1A painted-detail preservation warning without naming an unproven defective Sapien binary or generalizing to Halo 3/Reach.

## 6. OpenCE Mantle — External Companion

Official [source](https://github.com/SutlabSol/OpenCE-Mantle) and [releases](https://github.com/SutlabSol/OpenCE-Mantle/releases); reviewed v0.7.0 at `ccedcec379bb4e4bbfe815297fec9fbf8913bf5d`. The release and a selected installed binary's identity are distinct. The tagged README contains older version text.

Mantle is added to the existing canonical Rust/TypeScript tool catalog. It is a Windows **Halo Custom Edition PC cache 609** companion. Runtime selection and actual source cache version are checked independently. Wrong-runtime cards are hidden; incompatible map formats do not expose the dedicated Mantle workflow. No MCC, Xbox, Demo, retail PC, HaloMD or universal `.map` support is inferred.

Users manually select an installed application. Spark checks PE format, canonical path and registered SHA-256, refuses managed-library paths and common installer filenames, and checks again before an explicitly confirmed launch. The dedicated registrations are separate from the generic historical-companion catalog. No download, auto-install or auto-launch occurs.

The reviewed Electron entry point supplies no established Windows map/project CLI contract. The launch plan has **zero arguments**. Spark supplies no original map or native-source path. Users open an isolated copy inside Mantle. Unit and browser contracts verify the gates and cancellation behavior; actual Mantle application startup, edit/reconcile, conversion and save correctness remain **unverified** without an approved installed binary. Upstream claimed features are not advertised as Spark-tested capabilities.

No Mantle implementation, generated definitions, assets or UI are copied into Spark. Upstream's GPL-3.0 generated-definition/combined-distribution context is linked; any future reuse needs a separate license review.

## 7. leftknut research candidate

The canonical catalog retains a candidate for reported OBJ/scenery import, triangulation, collision, basic UVs and bitmap painting. Official name/repository, license, executable and runtime/cache evidence are missing. No guessed URL, binary, command line or launcher is offered. The borrowed BSP combiner is untested and the reported Forge startup failure has no independently established cause. leftknut/Pyro game-source Forge/Firefight work stays separate from cache/tag authoring.

## 8. Unified workflows and compact UI

The existing workspaces and drawers are retained. The new tool card lives in **Tools for this map**; save evidence is collapsed inside the existing integrity panel and wraps long paths/hashes. There is no replacement shell or competing viewer.

| Workflow                    | Supported boundary                                                                 | Required later evidence                                                            |
| --------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Bounded direct-cache fields | Existing typed overlays and validated derived cache output                         | Exact target map/game acceptance; not arbitrary tag/scenario growth                |
| Native loose tags           | Isolated Baboon/Invader edits, whole-file revisions, recovery and native build     | Opaque semantics and each gameplay target remain separately verified               |
| 3D/source/BSP               | Existing model/source import, authored brushes, assembly and native compiler gates | Fresh full-world portals, collision, tunnel traversal, vehicle and lighting checks |
| Game-engine changes         | Existing exact-build runtime adapters and investigated game-source projects        | No universal runtime, peer translation or completed Forge/Firefight claim          |

## 9. Runtime and content boundaries

| Target                        | Current evidence                                                                              | Open acceptance                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| MCC H1 / H1A kit              | Native isolated tag workflows and compiler/cache readback; prior scoped live adapter evidence | Fresh game-load and gameplay regressions, arbitrary spawn/BSP replacement, peer replication |
| Custom Edition PC             | Native format/conversion and source-aware kit boundaries; Mantle dedicated route for 609      | Actual Mantle save and target-game tests per mod                                            |
| OpenCE / Chupathingy          | Existing source/content/invitation investigation retained                                     | Real client/server and AI acceptance; not MCC wire translation                              |
| Xbox / retail / Demo / HaloMD | Existing detected formats, preservation and runtime-specific reports                          | Runtime-specific compiler, transport and gameplay proof; Mantle not certified               |

Painted detail-object source is still guarded conservatively. Rounded float output is not exact Z preservation. Rendering, materials, decals, teleporter effects, skeleton/animation and CELT/audio parity retain their existing exact-format limits. Neither these source changes nor browser tests prove complete engine rendering/audio parity.

## 10. Combined verification

Development verification passes **518 Rust tests / seven opt-in ignored**, **222 frontend tests in 46 files**, **82 browser cases**, **59 offline scripts** and TypeScript. The opted-in real A30 painted-BSP read/preservation guard passes separately. The Windows executable and NSIS installer build successfully. [Machine-readable results](fixtures/c40-verification.json). Final isolated integration revalidation is recorded after execution. Browser IPC/format fixtures are synthetic contracts; actual Windows native compilation and game tests are separate.

A fresh [C40 SparkLink native receipt](fixtures/c40-sparklink-native.json) also passes on the same development executable: three actual processes and separate libraries on **one physical PC**, local invitation-pinned TLS, real owned Warthog models/transforms, UI edits, per-author keyboard undo/redo, conflicts, viewer/build permissions, retained drafts and actual host-process crash/rejoin. H1A Tool built frozen revision 14 in **18.94 seconds** while editing continued at revision 15; opening the result verified its frozen source. Recovery took **7.37 seconds**. Six observed propagation samples ranged from **508 to 893 ms**, including IPC/UI convergence. All 2,240 input files and owned source caches were unchanged. This is shared editor source evidence, not three-machine networking, native tag sharing, binary asset transfer or Halo game-peer replication.

## 11. Consolidation and ending refs

Master is advanced only after the completed development ancestry is consolidated in the isolated integration worktree and its combined checks pass. Ending branch/SHA, merge ancestry and recovery bundle are recorded after verification. Experimental branches and dependency proposals are preserved independently.

## 12. Artifacts and remote state

Earlier C38/C39 frozen artifacts remain untouched. New versioned C40 executable/installer/source archive identities are recorded in the release manifest after verification. No game maps/tags, tool binaries, private libraries or session credentials belong in the source archive.

The live remote check at start returned master `8c0bed0fcce3fbff7108b53dcee6ef077f253387`. A local merge is not a remote update. The GitHub connector was unavailable; no credentials are requested or printed. The founder's earlier self-push preference remains in effect; the final handoff supplies a descriptive push summary and exact command.

## 13. Blockers and remaining engineering

No approved installed Mantle binary; leftknut identity/runtime evidence missing; no new real Halo gameplay/peer session in this pass. All historical unresolved requirements remain in the cumulative feature ledger. Full protected-map recovery, arbitrary live spawning/BSP replacement, game-peer edits, complete rendering/audio parity, dual wield/sword/lunge acceptance, eight-player campaign and 128-player multiplayer are not declared complete.

## 14. Next milestone

Use the stable native-source pipeline for a small **real playable AI/Firefight encounter**, compile for one explicit owned runtime, load it in Halo and verify player/AI behavior, collision, sounds and recovery before expanding player counts or engine bridges. Separately, test Mantle on an isolated CE 609 map once its installed binary is approved, comparing no-op and intentional saves and retaining tool/version/hash evidence. Extend SparkLink to native semantic tag/asset collaboration only with its own source/dependency acceptance; C39 source synchronization is not game-peer replication.
