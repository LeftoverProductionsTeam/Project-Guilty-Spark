# Source-only storage contract

Owner directive `defb4b8b-0dc4-45fe-a5b0-2a0774caa512`, 5 November 2026, supersedes earlier cleanup instructions and retained-cache policies. It does not waive native compatibility, source preservation, Git-history integrity or publication approval.

The final owner correction `e2ad9798-f784-4f15-b92a-42d480643288` protects **all user-selected Halo runtimes, ISO files, maps, original tags, editing kits and user-created content**, wherever located. Never delete, move, compress, modify or reorganize them during cleanup. Treat them as external read-only resources and account for their allocation separately. Fifty MiB is an investigation threshold, not a deletion rule; required dependencies and source may exceed it.

- Keep one canonical source checkout: application source, necessary dependencies/build configuration, essential tests/documentation and Git history.
- Review historical containers by actual contents. Integrate useful unique source/research into the existing source and ledgers, then remove proven redundant/reproducible copies. Do not make new archives or full snapshots. The only recoverable accepted release or unique work needs a precise owner decision before irreversible removal.
- Use supported output configuration for an external, bounded, owned disposable build/test workspace. Clean completed and safely recoverable abandoned output. Accept rebuild cost; no retained build caches, QA warehouses, browser profiles or duplicated SDKs in source.
- Default map open/preview/edit/close must leave no persistent Spark-owned content. Read installed maps/resources in place. Keep edits in bounded memory until an explicit user save/export. Automatic backups default to zero. Persistent recovery and remembered paths are opt-in; explain crash-loss of unsaved edits. Do not claim control of incidental OS/third-party writes.
- User-initiated native compilation may stage only necessary temporary inputs within a budget and must dispose them. Persistent outputs require the user's selected destination and action.
- Enforce ownership, preflight, budgets, cancellation and cleanup in existing product/build/test paths. Do not use prompt instructions as the enforcement mechanism.
- Verify source builds, native editing/export/readback, Undo/Redo/save, historical integration and unchanged original installations. Measure physical allocation before/during/after repeated workflows. Report source, Git, dependencies and unresolved protected items separately; moving bloat is not reclamation.
- Preserve the interrupted C71 property/import/behavior work and its failed/native evidence. Resume the existing engineering queue after storage/native-integrity gates pass. Local master commits only; no push/publication/history rewrite.

Completion remains open until the actual defaults, cleanup and repeated native workflows pass. An audit or policy file alone is not acceptance.

## Development output

Use `node scripts/cargo.mjs test --workspace --locked`, `pnpm test`, `pnpm test:ui` and `pnpm build`. Their generated output is owned, bounded and external, then disposed. `pnpm desktop` keeps its temporary output only while development is running. To keep an application build, explicitly choose an external destination: `node scripts/desktop.mjs build --export-to "C:/chosen/output"`. An export is not a verified release; the release pipeline still requires clean, committed source and integrity/startup gates.

Tauri's pinned generator writes four incidental ACL schemas beneath `src-tauri/gen/schemas`; the wrapper restores pre-existing bytes and removes newly generated schemas after a completed operation. Abrupt machine/process termination may leave those small third-party outputs; this is not a retained SDK or build cache.

The smallest reproducible native door source is `docs/fixtures/source-only-native-door.json`. Actual compiler/edit/readback evidence is compacted in `source-only-native-validation.json`. Its external Halo kit/tag inputs are selected read-only dependencies, never bundled game content. Historical `.local`/`preserved` paths in older reports describe retired experiments; do not recreate those environments. Recovery warehouses are not an application dependency.

Native compiler verification accepts the original installed `HCEEK.7z` instead of a persistent extracted SDK. `source-only-h1a-inputs.json` declares exactly 1,793 stock inputs (105,215,093 bytes), with paths/hashes and no tag payload. The existing verification runner extracts only those into its bounded disposable operation, checks every file, compiles and reads back, then removes the entire temporary tree. The three old compiled Workshop tags are regenerated from the small authoring fixture. The protected SDK archive is never changed. This path passed real H1A builds, corruption rejection/recovery, valid external edit/rebuild/readback and ten unchanged requests with no additional staging tree.

The redundant 754,292,538-byte Git bundle has 33 reference objects and 450 additional snapshot tree/blob objects already present in canonical Git. The two private Codex references are trees, not missing commits. No source history needed importing. Historical source release archives have their actual source members in Git; their useful release notes are integrated in `source-only-retired-releases.json`. Old generated environments are retired rather than copied into another warehouse. The accepted C49 `cb07581597de` five-file package remains separately verified; it is not a claim that newer source has shipped.

Actual deletion status is governed by `ACTIVE_TASK.md`: automatic review rejected the broad `preserved`/`artifacts` deletion because some older experimental snapshots/trial outputs are byte-unique. That scope is pending a specific owner decision and has not been executed. Ten independently verified superseded release copies were removed after integration commit `12f9d99`. Do not infer warehouse deletion from a policy statement or fixture name.

The existing app still uses its persistent library/save/history defaults. The tested opt-in memory backend has not been activated as the default; no claim of completed RAM-only product behavior is made. Automatic backup retention now defaults to zero while explicit existing choices are preserved.
