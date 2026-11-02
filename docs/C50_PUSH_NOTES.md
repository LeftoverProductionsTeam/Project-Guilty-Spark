# C50 handoff and descriptive push notes

All source work remains on local `master`. Nothing was force-pushed, remotely merged or published. Preserve repository rules; a normal push rejection must be reported and resolved through the repository's allowed process.

Suggested commit/push summary:

**C50: preserve editor state, compact workflows and verify native acceptance gates**

Description:

- Retain and pause map editors across workspace changes; keep visible shader animation and responsive camera input while static BSP views stop drawing.
- Compact tools, inspectors, comparisons, sound previews and settings. Preserve accessible overflow actions, keyboard editing, owned-resource previews and multi-window workflows.
- Add supported native custom tag names with reference-aware rebuilding, undo/redo and strict source preservation.
- Fix the actual window-history handoff race without relaxing writer ownership; verify crash recovery and independent-map histories.
- Record paired native performance, original sound-emitter compilation/readback, 25-route rendered UI coverage, three-process BSP collaboration and bounded cache acceptance.
- Preserve failed Zombie carrier research and the pending two-way tunnel walkthrough. Keep editor synchronization separate from game-peer replication and structural compiled-map editing.
- Retain the sealed C49 0.4.1 installer, portable ZIP, source, hashes and draft-only release process.

Validation: 636 Rust passed / eight owner opt-ins ignored; 308 frontend; 143 browser; 59 offline chains; 10 Python + six Node release checks; native UI/pop-out/history, Atlas, original audio and three-process Workshop acceptances. The intermediate browser audio timeout and all failed native research remain recorded. [Exact limits and measurements](CONTINUATION_50_ENGINEERING.md).

## User-controlled distribution

1. Push the verified local source normally when ready. Do not force-push or weaken branch protection. If GitHub rejects it, retain the local checkpoint and use the process required by its rules.
2. In GitHub Actions, run `.github/workflows/release.yml` against **`cb07581597de11e83d1c10bafad526e8b031f27e`** for the accepted C49 Windows candidate. Select a new unused versioned preview identifier, enable draft preparation and leave Linux disabled until verified. This commit is already pushed and has a successful CI run.
3. Verify that the new draft Release has its actual NSIS installer, complete portable ZIP, manifest and checksums. Review its download/hash verification results. Actions artifacts alone are not distribution.
4. Publish only after the owner's explicit approval. Anonymous installer download verification is required before marking public distribution complete.

The exact local assets are under `.local/releases/C49-preview-cb07581/`. Do not attach a C50 development executable under the sealed C49 identity or overwrite the existing `alpha` tag. Authenticated draft assets cannot currently be inspected from this session; public Releases is still empty. The README intentionally links to GitHub Releases, with that limitation stated.
