# C38 — Source-aware native workbench

Started at verified consolidation `8c0bed0fcce3fbff7108b53dcee6ef077f253387`, on `codex/c38-universal-workbench`. Master, experimental branches and the seven dependency proposals remain intact. C39 SparkLink is a subsequent continuation from this verified work.

## Implemented

The desktop allowlist, runtime recommendations and source-aware tool page now share `crates/spark-core/data/tool_ecosystem.json`. Finding an executable, matching the runtime, having suitable native source and verifying a reviewed binary are separate checks. The existing advanced launchers remain available; research profiles cannot grant execution.

Three managed Invader operations are added for Windows and owned, validated MCC H1 working tags:

| Operation | Actual native program | Boundary |
| --- | --- | --- |
| Recursive dependency check | `invader-dependency -r` | Read-only traversal, bounded output, exact relative paths and missing-reference reporting; exit zero alone is insufficient. |
| Object bounding-radius edit | `invader-edit -S bounding_radius` | An isolated one-tag candidate, one exposed field difference, native parser/header/class/CRC checks, explicit acceptance. |
| Known lens-flare repair | `invader-bludgeon -T broken-lens-flare-function-scale` | Only the documented malformed raw value of 360 radians; the pinned reader displays this as about 20626.480625 degrees. The resulting exposed value must be zero and no other exposed field may differ. A normal 360-degree rotation is ineligible. |

The release is Invader `0.55.0.r4134.33518109`. Exact binary hashes are in the catalog. Broad “repair everything”, arbitrary flags, guessed fields and automatic corruption repair are not exposed.

## Preservation and recovery

Preview never edits the current tag tree. Accepting copies the current complete source into a new owned revision, changes only the reviewed tag and verifies every file hash. Recovery creates another revision containing the exact prior tag and all other current files. Same-tag overlap, tampered candidates, stale project/build identity, changed tool identity and a running native build refuse selection.

C37 Baboon selections remain compatible. An Invader revision records the Baboon revision it observed. A later accepted Baboon revision supersedes it; a later Invader operation starts from that Baboon source. Publication rechecks the saved map, build list and source selector. Shared source-operation guards serialize acceptance, recovery, Baboon reconciliation and build startup. Complete native files remain native; journals and selection metadata are outside them.

The QuickForge export path now uses the same native-source preservation guard as regeneration. General Blender/Tool geometry reimport plus scenario/BSP authoring-data merging remains unimplemented. A protected refusal is not a completed geometry importer.

History retains up to 32 operation previews per map and 100 revisions per preview. No historical evidence is deleted automatically. Full source forks are bounded cold operations, not content-addressed incremental staging.

## Workflow

1. Open a map with a validated MCC working-tag build.
2. Open **Tag editor → Invader · native checks & reviewed edits**. A QuickForge project can select tags from its validated build without creating a second project.
3. Choose a native tag. Check dependencies, preview an eligible field edit, or open that selected tag through Baboon.
4. Review the exposed field difference and accept a new source revision.
5. Use **Runtime & Tools → Build working tag edits** to compile a separate cache. Open its result for inspection and a runtime test.

Retained previews are available after reopening the UI. Recovery can restore an accepted tag even after a subsequent native build, provided that tag still matches the accepted candidate. The last compiled cache is retained.

Working-source monitoring now rebinds when the source directory changes under the same build ID. Source changes from Baboon and managed operations refresh the existing dock rather than requiring a map reopen.

## Tool ecosystem and licensing

Nine existing routes are preserved and three managed operations added. Eight other tool profiles—Blender Halo Asset Toolset, Osoyoos, Mozzarilla/MEK, Refinery/MEK, Reclaimer, Assembly, Excession and Foundry—remain **upstream research**, with source and license context. Links are not integrations. No upstream executable, parser implementation, tag definition or asset is redistributed.

See [compatible tools and setup](COMPATIBLE_TOOLS.md). The prior genuine Baboon 0.1 → 0.5 pistol save, native compilation and readback remain independently recorded in [C37 acceptance](fixtures/c37-native-acceptance.json). Fresh C38 interoperation tests do not claim a new human Baboon edit.

## Evidence and limits

The opt-in runner is `scripts/test-native-operations.mjs`. It requires a fresh `qa_runtime_library` replica and explicitly supplied installed tools and a user-owned legacy cache. It drives the real packaged Windows app, native programs and H1A compiler. Its receipt reports source tests, UI actions, native output and gameplay separately.

The [fresh native receipt](fixtures/c38-native-operations.json) records successful missing-dependency detection, tampered-candidate refusal, independent-file preservation during recovery, pinned lens repair, Baboon/Invader revision precedence, compilation and post-build recovery. All 2240 selected source tags match the compiler input byte for byte. Compiled pistol radius is `0.550000011920929`; original source/cache and Spark draft are unchanged. The painted-BSP opt-in regression also passed on the owned source fixture. The genuine human Baboon save is historical C37 evidence; the new interoperation test used Invader in an isolated Baboon fork and says so explicitly.

Measured on this machine: tool discovery 421 ms, recursive dependency check 4.38 s, one-tag preview 347 ms, complete-source acceptance 23.9 s and native build 44.0 s. Full verified source forks remain the largest cold cost. [1500-pixel native UI](screenshots/continuation38/native-tools-1500.png) and [1024-pixel native UI](screenshots/continuation38/native-tools-1024.png) show retained native history in the packaged WebView; these are CSS viewport checks, not a new OS DPI or game acceptance.

The full source suite passes **502 Rust tests** with seven opt-in cases excluded by default; one owned painted-BSP opt-in was run separately. Frontend tests pass **216 / 44 files** and **59 offline scripts** pass. The quiescent full browser result is recorded in the verification fixture. Earlier cold/contended browser attempts and failed native development attempts remain private evidence, including the caught staging-backup and angle-unit defects. No failed run is counted as a pass.

Invader's traversal can flag legacy `.model` references in an H1A source tree that H1A Tool previously compiled. Spark reports those unresolved native references for review. It does not label the writing program corrupt, silently substitute another class or infer runtime failure. Native compiler and game checks remain distinct.

No new game launch, game-peer replication, rendering/audio parity or cross-play acceptance is claimed by this continuation. Excession is not installed here, so new official Excession package validation is pending. The general ecosystem handoffs, geometry reimport, universal repairs and broader gameplay/network backlog remain open. [SparkLink](UNIVERSAL_WORKBENCH_BACKLOG.md) continues the same source model.
