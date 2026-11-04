# C67 — Source Guardian native project recovery

Starting revision: `fb75023f3896b4ae9a2f0236ee0576fcc59bf059`, clean local `master`. This pass preserves C63, C66, the existing 475-row requirements CSV, historical research and the sealed C49 Windows candidate. No branch, worktree, remote publication, installation or accumulated-data cleanup was performed.

Verified implementation commit: `5ad68243127239046a9cbd61b318900ac9476d1c`. The following seal changes only documentation and checkpoint metadata. Final desktop executable SHA-256: `c62f77745ea16be59f3d32d9082a52657322b42fd08c9b67a1c9b2067f96574b` (development acceptance build, not a release installer).

## Working user workflow

Open a preserved map → **Preservation record → Recover a Halo Project** → choose the scenario or an asset → **Review recovery** → **Recover into a separate project** → **Open recovered project**.

Review is read-only and identifies the source edition, source SHA-256, exact installed tools, resource identities, dependency coverage, blockers and reconstruction limits. Scenario recovery extracts all cache tags; an asset recovers its recursive native dependencies. Standard `tags/` and supported reconstructed `data/` outputs are independent of Spark. The optional report records provenance; it is not a native Halo dependency or a permission flag.

Repeated requests verify and reuse an unchanged result instead of producing another tag tree. The result is remembered per map and recovery root. Edited recovered files remain accessible, but their old validation cannot be reused. Native compilation of recovered projects is demonstrated by the benchmark and compatible external tools; this pass does **not** add one-click recovered-source adoption/reconciliation/build controls to the application.

## Native acceptance

Evidence root: `.local/artifacts/c67-recovery-20261104`. All trials use real installed native tools, separate owned directories and the existing staging/storage contracts. No mock compiler, full SDK copy or original game-folder edit is used.

| Gate | Observed result | Evidence |
| --- | --- | --- |
| Desktop application | Actual WebView buttons and Tauri IPC review/recover an asset and a full scenario; map/root state survives navigation; no page errors; final app repeat/reuse and operation-indicator completion pass | `native-ui-third/acceptance.json`, `native-ui-sealed/acceptance.json`, screenshots |
| Asset recovery | 23 native tags, 901,692 bytes; independent Invader parsing and recursive closure; one reconstructed 106,829-byte JMS | `native-second/acceptance.json` |
| Corruption handling | Truncated recovered model refused by Spark and actual Invader; exact saved bytes restore valid recovery; original maps unchanged | `native-second/corrupt-fixture`, acceptance |
| Native model import | Recovered JMS independently compiled with H1A `tool model`; resulting native model parsed by Invader | `native-second/model-compile`, acceptance |
| Whole scenario recovery | 1,795 native tags / 83,089,423 bytes; 139 reconstructed files / 13,609,700 bytes | `native-ui-third`, managed recovery report |
| Native cache compilation | H1A Tool builds a version-13 MCC cache from recovered inputs, with both script names, five placements and 66 collision triangles; native CRC matches | `native-cache-second/acceptance.json` |
| Independent cache comparison | All 1,795 class/path identities retained, zero missing; source/output each have 66 render and 66 collision triangles | `cache-readback/acceptance.json` |
| Actual C67 game execution | **Not tested** | No new game-load, human, multiplayer or release claim |

Exact source cache SHA-256: `b53c7543526c709c53344e814a746c0687c3f6ed7691d720e4764c54c0549103`.

Recompiled model SHA-256: `e78c6476fa7fdbff6c960876e45817bb43d6004026770c2a0386bc947764adda`.

Recovered-project cache: `.local/artifacts/c67-recovery-20261104/native-cache-second/workspace/maps/c66_bounded_native_door.map`, SHA-256 `eec9b92fd42ff64828103b82f1fa15d50f229fd41db08b2e01592cfab15cd4e3`.

Script names: `gs_evt_b9b2bf499f11`, `gs_logic_init`. Identity/count/CRC agreement is **not** complete native-payload, visual, audio or behavioral equivalence. The recovery receipt intentionally keeps `nativeCompilationVerified` and `gameplayVerified` false; separate benchmark evidence establishes compilation of its exact unchanged inputs.

## Defects exposed and repaired

- Pinned Invader's recursive scenario extraction attempted a single-tag compilation with an empty data directory, printed a script error and exited zero. Spark correctly refused this partial extraction. Scenario project recovery now uses supported whole-cache extraction with non-multiplayer globals, preserves all native tags and separates its reuse schema from asset recursion.
- A recovery log left open during Windows directory adoption caused Access Denied. The log is flushed and closed before adoption. Failed isolated output is retained.
- A first H1A recovered-cache build halted in `hs.c` because the conventional global source file was missing. Recovery compilation reuses C63's existing H1A globals preparation, now a shared no-overwrite helper. This generated compiler-support file is explicitly distinguished from recovered original author source.
- Native batch parsing may report a per-file failure without a failing exit status. Adoption now requires one exact native parser checksum/path result for every recovered tag, complete native dependency traversal and unchanged source/tag/tool/resource hashes.
- Native model permutation/script source names are checked before an external recovery writer constructs filenames. Traversal, device names and option-like names are refused.
- Recovery/extraction completion emits a terminal native event, so the application's operation indicator can leave its working state. Late UI results cannot replace a different map/root's selection.

Retained failures include `native-first` (log handle), `native-ui-second` (recursive scenario extraction) and `native-cache-build` (H1A global source). Early harness/build mistakes remain recorded separately; they are not passing trials.

## Fidelity and format boundaries

Native tags are reconstructed from compiled caches. Their data is not claimed byte-identical to the original pre-compilation authoring project. Where the installed backend supports recovery, the data folder includes model JMS, scripts, collections and strings. Original DCC history, bitmap color plates, script comments, editable BSP JMS, AI navigation authoring, original lightmap source and stripped information cannot be promised.

The successful end-to-end fixture is **MCC Halo 1 cache version 13**. Standard Xbox, Demo/PC and Custom Edition paths can be reviewed with their correct native resource prerequisites; C67 does not promote their recovery/compilation/gameplay acceptance without representative tests. Extended or unsupported formats remain inspectable but do not receive invented native output. Caches identified as protected or unknown by the installed extractor remain unsupported for this recovery path; no Spark permission flag is introduced for local inspection.

The successful native compiler still reports absent compiler-only UI roots, meter stencil warnings and missing background/sound-environment cluster associations. Those warnings are retained. No complete UI/audio/visual fidelity or gameplay claim follows from the valid CRC.

## Reused systems and provenance

This is orchestration inside the existing Preservation workspace, not another map reader, editor, resource-discovery system or tool launcher. It reuses source identity, recursive tag extraction, native resource admission, short-path aliases, native staging, storage reservations, cancellation, progress events and compatible tool handoff conventions.

Installed Invader: **0.55.0.r4134.33518109**. Every invoked binary's SHA-256 and reported version is recorded in the recovery plan/report. Extraction binary SHA-256: `ded684bc2730b836719071dcdc505a78e5dca3730f19e9a30527ac725180c138`. H1A Tool SHA-256: `c492789e96dbe845891e0c0973bfb526a21230f570559e6f9fb695b8d2ca0afa`.

The extraction failure was checked against the pinned upstream [extraction implementation](https://github.com/SnowyMouse/invader/blob/33518109/src/extract/extraction.cpp) and [scenario pre-compilation](https://github.com/SnowyMouse/invader/blob/33518109/src/tag/parser/compile/scenario/pre_compile.cpp), then reproduced with the installed binary. The local read-only research checkout is a different revision, `696830ff80af227e84e7237c2ef26eb2301ed110`; it is not presented as the installed generation. Invader runs as a separate installed GPL program; no third-party engine/tool implementation was copied into Spark. No older research archive replaced canonical research.

## Preservation and measurements

`preservation.json` and `preservation-sealed.json` rehash all 15 selected protected C49/C63 artifacts unchanged. All 475 CSV requirements match the actual starting checkout byte for byte (SHA-256 `1eb0848def039b08b6398c8ea67e8c7e9a5fbce803c0ec417bc2655efe945bf7`; the older C63 paragraph's different hash describes its preceding 472-row prefix). C63 remains the committed ancestor `056bc69`; its historical H1A Standalone human result remains **“Opens both ways; crossed and returned; closed normally.”** C67 does not extend that observation to its new recovered cache or retail MCC. C63's external Invader edit/corrupt-save rejection/restoration/reconcile/rebuild evidence remains complete and intact.

One controlled sequential recovery/reuse pair measured **12.802 s → 3.562 s** with no duplicate native recovery data. Native model import/readback measured **1.088 s**; recovered-cache compile/readback **12.280 s**. The desktop whole-scenario recovery plus verification took **107.087 s** in one trial; the final desktop verification/reuse trial took **22.479 s** under warm conditions. These are scoped measurements, not a general startup/rendering performance claim.

To reproduce, build the current native desktop app and use `scripts/test-source-recovery-native.mjs` with a previously accepted isolated recovery fixture. The native example `qa_source_recovery` takes an owned cache, installed Invader folder, installed H1A kit and a fresh output directory. Its `--cache` mode takes a validated managed recovery library/ID plus those tool folders and a fresh output directory; `--readback` compares the original and resulting caches. Never point a writable benchmark output at a game installation or the only source copy. Reuse the retained accepted fixture instead of extracting another SDK.

The 07:40Z storage-health scan reports 150,660,958,032 logical workspace bytes; C67 then accounted for 836,979,123 logical bytes / 8,646 files. Later evidence adds a small amount. Logical bytes are not NTFS allocation. This pass retains diagnostic/build evidence and does not claim space reclamation. Existing historical paths and the pending C66 prepared-source reuse gap are preserved. No accumulated source/evidence/runtime directory was deleted.

## Regressions and release status

- Complete Rust workspace: **703 passed, 8 ignored**, no failures (`rust-verified.log`). The ignored tests require explicit local/game conditions and are not claimed passed.
- Ignored gates: live provider HTTPS, running MCC camera, owned painted-BSP audio/detail, native power-ups, campaign duplication, native emitter renaming and selected local MCC inventory. C67 does not promote any of those gates.
- Frontend: **387 tests / 92 files passed** (`frontend-final.log`); TypeScript and production frontend build pass.
- Browser: **161 passed** (`browser.log`).
- Offline: **59 passed** (`offline.log`).
- Continuity/health/release Node checks: **8 passed** (`node-checks.log`).
- Native desktop app build and actual recovery UI pass. Existing Vite/Three warnings remain recorded.
- No new installer, portable, Linux, macOS, clean-machine or public GitHub Release acceptance. The accepted C49 release is unchanged.

The new regression cases cover batch zero-exit failures, exact parser coverage, unsafe reconstruction names, folder access after edits versus invalidated acceptance, and preserving authored H1A globals. Existing compiled-map patching, native loose-tag building, geometry authoring, SparkLink and source-integrity safeguards remain in place.

## Remaining work

Next recovery gate: deliberate recovered-source adoption into the existing native editor/handoff/reconcile/build workflow, including legitimate changed-source validation. Partial folders, damaged projects, archives and additional runtime fixtures remain separate unfinished recovery work. Native Error Doctor, first-person animation comparisons, fog/environment authoring, vehicle seat/physics acceptance and interactive beginner testing are not completed by this pass.

The full existing AI, Firefight/Zombie Apocalypse, Live Link, SparkLink, campaign, machinima, Megaworld, direct structural compiled-map editing and release backlog remains open at its recorded evidence levels. C66 reusable prepared shared-source materialization is explicitly retained in `PENDING_REQUESTS.md`. No remote push or publication occurred.
