# C51 — Native lifecycle, Firefight round source and flagship presentation

Started on clean local `master` at **`c3b4fe5601f019fa57fdf988596a99b8f89a3f0b`**, the committed C50 foundation. The older separately dirty root checkout was not reset or switched. Source, historical branches, C35–C39 work, private archives, prior native results and sealed C49 packages are preserved. C51 does not restart the project or turn editor/compiler evidence into gameplay acceptance.

## Native Zombie lifecycle: correction and new evidence

The older C50 analyzer followed only the active/network actor table. Dead actors leave that table. Its minimum health of 1 therefore did **not** establish failed damage/death. The complete native object census shows health `-0.31`, damage flags `12` (including the publisher source's dead bit), unparented corpses and later absence. Historical raw observations and old reports remain intact; the correction is appended, not erased.

`scripts/analyze-carrier-census.mjs` now joins complete **salted** unit IDs across active actors and detailed object/corpse snapshots. It separates healthy unparented samples from corpse release, nonlethal damage, animation-frame progress and final sampled absence. It refuses incomplete readback and unknown executable/PDB flag layouts. Five independent synthetic diagnostic tests cover death-table transitions, recycled slots, healthy exit, incomplete evidence and unknown layouts. They are parser tests, not simulated game acceptance.

The genuine live-exit fault is a missing animation reference. Reviewed native source has no stand-seat exit animation (`units[0].animations[8].animation = 65535`). The exact publisher implementation of `unit_try_and_exit_seat` refuses that case. A separate experimental source copy binds the slot to **38, `stand unarmed idle%0`**, an existing same-skeleton animation. Native Invader readback confirms the reference/name. Apart from the tag checksum, only the reference's two bytes change; animation payload is retained. Visual suitability is unaccepted.

| Native candidate | Actual observation | Boundary |
| --- | --- | --- |
| Stable-inertia base + exit binding + commanded exit | Two separate OpenCE processes/runs, three cycles each. Each actor leaves alive, moves under active AI control, advances animation, takes native damage, dies and is subsequently absent. | One process at a time; scripted exit/damage/death; headless and dummy audio. Not human combat or an accepted original weapon loop. |
| Same binding, exit command removed | All three actors have zero healthy unparented observations. Native damage/death/cleanup still occur. | Automatic carrier release is not repaired merely by supplying the animation. |
| Two real OpenCE host/client processes using the controlled candidate | Three shared actual actor IDs, movement/seat observations and clean process exits. | Native dependency clears and health/animation differences remain; the strict analyzer refuses full shared-AI acceptance. One physical PC, no late join/reconnect or human play. |

The controlled cache SHA is **`79589da5b185bac21ed6b5ad02037041cc24c39ca70f6f8a4ce46479529edd49`**. The automatic-exit counterexample is **`1d6bb62223f69342504407b035837321923c023500dda742faf55b12e02d2ad3`**. Original recovered source is unchanged. No normal conversion profile silently enables the experimental graph edit.

The existing weapon→projectile→effect translation already exists in recovered C47 source and is preserved. Finishing that original weapon-driven invisible-carrier mechanism, rather than substituting ordinary actor placement, is still the restoration gate. Two missing original audio cues and exact-runtime compatibility faults remain explicit.

## Firefight: extend the existing exporter, not a second subsystem

`exportHaloCeFirefightRound` reuses the finite Firefight authoring/export foundation. The Firefight workspace can export a source ZIP containing native HSC, its status/activation manifest and an encounter plan. No game, executable, native tag or proprietary payload is included.

The opt-in source provides:

- Exact per-encounter spawn counts, bounded spawn/wave waits, native round/wave/state globals, wave-clear points and cleared-actor counts.
- A continuous start/restart controller which resets only its owned named encounters and score.
- One bound player biped per round, so respawning does not mask a one-life defeat.
- Native encounter activation during the round and release of forced activation afterwards.
- Refusal of unsupported multiplayer/lives/revive/scaling/supply overrides, unsafe numbers and native score overflow. The manifest explicitly requires a singleplayer/campaign scenario.

This is a **source export**, not a one-click native Firefight build or a complete game-side bridge. Existing broad build blockers remain. Real encounter placement, firing/navigation data, safe collision, player combat, HUD/medals, richer rules and cooperative gameplay require further engineering and acceptance.

Native Invader script compilation and classic Halo Tool produce real separate caches. The exact generated controller used by the final active-encounter test has SHA **`58c787a01c5c454d655bfe485846b411e709a394bd6620f863af824738a81130`**.

| Native test | Result | What it proves |
| --- | --- | --- |
| Two waves of 2/3 actors, completion and restart | Actual native primitive HSC globals reach score **1,000**, cleared **5**, state **4**, then reset and repeat to test-completed **2**. | Native controller progression and restart. A **separate QA script** causes deaths; this is not player combat. Cache `ed23fb21…`. |
| Controller expects two actors, native encounter has one | State **5**, score **0**, cleared **0**. Previous-good source/cache remain. | An incomplete spawn cannot award a wave or win. |
| No forced-death test script | Compiled separately and run. The wave does not complete; an actor leaves valid ground and the controller times out without score. A native singleplayer/campaign variant is retained too. | Placement/physics/AI acceptance is still blocked. A passing controller test does not certify a playable Firefight round. |

Read-only QA resolves `scenario`, `hs_global`, `hs_global_datum` and the actual external-global array extent from the exact publisher PDB. It only emits primitive `gs_ff_` state; it does not dereference script pointer values or write game memory. Native observer and game must both exit normally with a complete, rechecked footer before the run is admitted as complete evidence. The historical private C50 launcher can report mechanical completion despite an observer failure; the first C51 nested-layout failure is retained and excluded. Successful runs are independently checked from their receipts and footer.

## Xbox a10, resource discovery and retained editors

The new directive's reported Xbox exclusion is older than committed C50. C51 preserves and tests that reader rather than reimplementing it. The actual installed Chupathingy `a10.map` retains SHA **`f7461e5b6eaf0314c4f03a1c6e43752b06ae3e4782b70b240a8c15e5f634b3ce`**:

- Cache 5, **364,774** native render triangles, **nine** BSP parts and **70** native model types.
- **425** requested base/detail/lightmap images, **zero** failures; internal pixels retain exact source identity.
- **17** six-face reflection previews and **three** actual decoded sound previews.
- Shader/model/material references and native lightmap metadata remain in the readback. Remaining unaudited tags/engine parity warnings remain explicit.

This reader diagnostic is a debug build: inspection **9,164.5 ms**, image batches **215,802.8 ms**, total **326,280.3 ms**, including repeated full-source verification and subsequent reflection/audio work. It is not a release application startup, GPU or in-game playback timing. The native application uses its existing bounded batching/caches; no textures, models, decals, validation or original hash checks are removed to make a timing look faster.

C50's retained/paused per-map editor, inactive shortcut gating, bounded inspection/decoded-pixel caches, external-save handling and window history remain. No unlimited retained-scene cache is added. The current four-runtime discovery/UI acceptance is recorded separately from each engine's editing/networking capability.

## Megaworld and other flagship boundaries

The exact two-region CE cache (`c84a1ed4…`) is reused in an isolated hold. Native server load and one joined player are observed again. No new human two-way walk reply is received during the hold; its timed end is not a traversal pass. The prior successful two-room Workshop gameplay report remains a different, preserved acceptance.

All twelve tracks, actual code changes, native/gameplay boundaries and next concrete milestones are in [the flagship/runtime matrix](C51_RUNTIME_AND_FLAGSHIPS.md). [The roadmap](../ROADMAP.md) orders ten dependency-driven next challenges. Expanded player counts, streaming, VR, direct compiled-map structure editing, actual native audio listening and cross-computer/Steam sharing are not relabeled complete.

## Presentation, UI and verification

README now leads with identity, eight flagship areas and available/active/research labels; then evidence, the four-runtime matrix, actual Release status, genuine screenshots, workflows, roadmap, community and development. Home and Features share one compact flagship model. Features keeps a distinct title so Back/Forward has an unambiguous destination. Native round export explains its scope. Hero text is adjusted after visual inspection.

The native UI test uses a real executable, actual installed runtime discovery/registration, owned animated/textured/reflected monitor data, exact loaded-JavaScript comparison, four size/DPI cases and real Workshop source creation through UI buttons. It does not mock IPC or launch games/tools. Captures are genuine editor views, not game acceptance. Initial test failures and their corrected runs are retained. Full final regression, source and performance receipts are appended below after final verification.

The existing 438 ledger records and original 92-item reconstruction remain intact; C51 appends scoped evidence records. GitHub About/topics/social-preview instructions are [ready to paste](C51_GITHUB_PRESENTATION.md). Authenticated metadata editing is unavailable. Anonymous verification sees public master `f247cba`, no topics and **no public releases**; there is no remote push or publication claim.

## Distribution and protected artifacts

C49 remains sealed at `.local/releases/C49-preview-cb07581/`, source **`cb07581597de11e83d1c10bafad526e8b031f27e`**, version **0.4.1**:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `Project_Guilty_Spark_0.4.1_windows_x64_Setup.exe` | 10,107,686 | `6e0c3efb53ced11dde522492ea341a019c93976d3ca0c16ae28ae180da334749` |
| `Project_Guilty_Spark_0.4.1_windows_x64_Portable.zip` | 13,941,863 | `ff6c9e4dea48126680c2a9b8536dfb2185fab5ac445c7d4f306b9bed52e07069` |
| `Project_Guilty_Spark_0.4.1_cb07581597de_Source.zip` | 26,186,072 | `c6ea81b25bfae352d76df58557a82daef44b72ba11bf778d0e2eee9f56ae03f0` |

Installer, portable, source, manifest and checksum file are freshly rehashed without replacement. C51's development executable is a different tested source snapshot, **not a new 0.4.1 release package**. No new C51 NSIS/portable/source release bundle or verified Linux package is claimed. The draft-only workflow and publication approval gate are unchanged. The owner still needs to push source and run/approve verified GitHub distribution; repository rules are not bypassed.

Private QA is bounded under `.local/c51-flagship-20261102` with short separate native source roots. Failed variants, raw engine logs, original hashes and prior-good builds remain. No archive cleanup or original game installation changes are performed.

## Primary technical references

- [Exact OpenCE build-335 unit implementation](https://github.com/OpenCommunityEdition/OpenCE/blob/da8d455623cf50002e6a798b1980068fd3ca0292/source/units/units.c) — native exit preconditions and completion.
- [Exact native object flags](https://github.com/OpenCommunityEdition/OpenCE/blob/da8d455623cf50002e6a798b1980068fd3ca0292/source/objects/objects.h) — death classification.
- [Exact HSC runtime](https://github.com/OpenCommunityEdition/OpenCE/blob/da8d455623cf50002e6a798b1980068fd3ca0292/source/hs/hs_runtime.c) — typed global storage, not guessed offsets.
- [Halo 1 scripting reference](https://c20.reclaimers.net/h1/scripting/) — encounter activation and native script semantics.

Upstream implementation files are inspected privately, not vendored as Spark code or game content. Publisher executable/PDB identities remain exact: `788fb409…` / `b3755a3d…`.
