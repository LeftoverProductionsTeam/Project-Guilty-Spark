# One canonical Spark repository

Develop locally on **master** in **`D:\Project Guilty Spark`**. Do not create routine branches, worktrees, nested Spark clones or full-project test copies. Preserve history, original content, uncommitted source, experimental research and accepted releases. Do not push, publish, force-delete branches, rewrite history or change GitHub protection to bypass a failure.

`AGENTS.md` makes this the permanent engineering instruction. External version-pinned engine/tool research is distinct from another Spark checkout. Preserve its licenses and history; inventory it rather than deleting it as an unexpected folder.

The standing [engineering contract](ENGINEERING_CONTRACT.md) also governs every initiative: native compatibility, runtime-specific support, the eight-stage evidence ladder, content/tool authorization and complete user workflows. Apply it to the current active task; receiving the contract does not erase unfinished work or the requirements ledger.

## Read-only health check

Run `node scripts/repository-health.mjs --storage` from the canonical root. `--root <directory>` selects an existing checkout and `--budget-gib <number>` overrides the warning budget. The command emits JSON; redirect it into a fresh `.local/artifacts` report if needed. It never deletes, installs hooks, changes Git/configuration, checks out a branch or accesses the network. It warns rather than blocking emergency recovery.

The report lists registered worktrees, local branches and their commits outside master, tracked changes, Git object size, nested repositories, regular-file totals, directory sizes, links skipped and scan errors. It distinguishes exact logical bytes from hardlink-unique bytes and available volume space. It does not claim NTFS compressed allocation or infer last use from file modification time.

Storage groups are **Preserve**, **Reusable Cache**, **Regenerable**, **Verified Redundant** or **Requires Review**. Automated classification is conservative; only a separate actual-content/history review can promote something to Verified Redundant. A large generated-looking folder can contain original tags, a previous-good cache or unique failed research.

## Shared inputs and generated output

- The root `.toolchain`, `node_modules` and installed `.local/tools` are reusable dependencies, not extra source checkouts.
- `scripts/cargo.mjs` defaults to `.local/build/cargo`, uses the script's repository for tool discovery, and avoids repeated debug-symbol/incremental caches. Explicit Cargo environment overrides remain available for debugging and platform tests. Accepted executables/symbol archives are never swept with this cache.
- Put new QA/log/capture runs in `.local/artifacts`. Historical native data stays at its recorded physical path: the native source guard rejects ancestor junctions. Optional catalog links may point to that data, but native jobs use the real path. No Git checkout or copied source tree is required there.
- `scripts/maintenance/retention-policy.json` retains configurable review targets: two successful/four failed recent runs per workflow, seven-/thirty-day archive review thresholds, a 4 GiB run warning and 80 GiB total warning. Active, incomplete, unknown and protected source/release records remain protected. These are review budgets, not an automatic pruning service.
- Reuse the verified SDK input cache and installed compiler binaries. A frontend or pointer test need not stage native tags. C66 stages a recursive base subset plus each import's separately verified namespaced closure. Unchanged accepted jobs require fresh source/import/tool/generated-output validation. Prepared shared revisions retain their bounded complete input contract. One imported-door graph is proven, not every custom/runtime graph. Never substitute writable hardlinks, infer unused dependencies or suppress validation. See [C66 lifecycle, measurements and limitations](CONTINUATION_66_STORAGE_AND_RECOVERY.md).
- New native staging and source forks reserve shared disk space before copying. Settings → Storage & Cache exposes limits and explicit ownership/reference-checked cleanup; it never classifies historical or accepted data as disposable from a name/age. Native writer checks are polling safeguards, not filesystem quotas. Permanent source history, legacy outputs and global driver memory have separate owners and remaining audit work.

## Consolidation and removal

1. Finish active builds/reconciliation and commit accepted engineering.
2. Inventory all source states, local branches, worktrees, ignored research and important releases. Hash exact source/archives and preserve a recovery patch/copy before changing a checkout.
3. Verify every required commit is reachable from master. Review unique edits rather than overwriting them with older versions. Preserve exact historical source even when a newer implementation supersedes it.
4. Update the canonical root to the verified master. Reuse dependencies and run affected regressions there.
5. Only after explicit authorization, relocate preserved local data and remove the verified redundant working copies with ordinary Git worktree/branch removal. No forced removal or reset. Leave unique or uncertain material intact and report that specific blocker.
6. Re-run health and Git integrity checks, rehash accepted releases/source recovery and report actual storage before/after. Do not count relocating bytes as disk reclamation.

The November 3 consolidation inventory and exact unfinished C41 source snapshot are private `.local/repository-consolidation-20261103` evidence. All 44 preserved C41 source-file versions were found exactly in master history before root checkout changes; all 20 non-master branch tips were already reachable. The owner explicitly authorized removing the three redundant worktrees and those 20 local branch names after verification. Runtime installations, native maps/tags, research, archives and accepted releases were excluded from removal.
