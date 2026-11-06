# PROJECT GUILTY SPARK — CONTINUATION DIRECTIVE
## P0 Stabilization, Native Authoring, Multiplayer Correctness and Discord Research

**Current reviewed remote HEAD:** `1d1de2b07860852779c7c5e4ef3991535e513cf2`

**Latest hosted CI:** `42226991630` — Windows native and Linux core/web successful.

**Canonical workspace:** `D:\Project Guilty Spark`, local master.

**Primary objective:** Finish the current P0 stability and recovery gates, then complete one end-to-end C71 native Halo authoring workflow. Integrate the new Discord findings into runtime-specific diagnostics without derailing active engineering.

### 0. Resume existing work, not a new project

First inspect actual local HEAD, Git status, running operations, active scratch ownership, pending changes and last safe checkpoint.

Read and reconcile:

- AGENTS.md
- docs/ACTIVE_TASK.md
- docs/PENDING_REQUESTS.md
- docs/DIRECTIVE_LEDGER.md
- docs/ENGINEERING_CONTRACT.md
- docs/MASTER_FEATURE_LEDGER.csv
- docs/P0_RELEASE_STABILIZATION.md
- docs/CONTINUATION_69_SPARK_FLOW.md
- docs/OVERNIGHT_ENGINEERING_20261105.md
- docs/ENGINE_SOURCE_ATLAS.md

Preserve all 475 recorded requirements, 25 numbered engineering prompts #04–#28, historical source/evidence, unique work, accepted C49 distribution and all protected user data.

Do not create new branches, worktrees, clones, recovery warehouses or duplicate framework implementations.

Do not assume that the reviewed remote commit is the current local checkout.

### 1. Finish P0 storage, Save and interruption safety

Inspect the actual implementations of:

- Library::workspace
- Library::save_explicit
- workspace_history::Session
- Tauri save_project/update_project
- Native import publication/rollback
- Source-referenced OBJ/audio/animation handling
- Native job scratch ownership and retention

**Specific issue:** `update_project_document` saves the persistent descriptor before separately checkpointing Undo recovery. Reproduce failures before, between and after these operations.

Prove:

- A failed Save never silently loses earlier accepted work.
- A descriptor/history mismatch has a deterministic recovery path.
- A concurrent external edit cannot be overwritten without explicit reconciliation.
- Unsaved RAM edits are not misrepresented as crash-safe.
- Closing, returning, detaching and discarding views respects authoritative document ownership.
- File replacement, source mutation, hardlinks and interrupted writes fail safely.
- No ordinary map open implicitly copies entire SDKs or map libraries.

Complete outstanding tests for ten archive imports, ten independently finished native compiler jobs, tool/process cancellation, window lifetime, orphaned imports, durable history retention and active-writer interruptions.

Report logical bytes, allocated bytes, owned temporary output and actual reclamation separately.

Do not bypass a refusal to delete protected recovery data. Never automatically purge an ambiguous file.

### 2. Complete a targeted function-level code audit

Map functions, callers, state ownership, external dependencies, side effects and tests for the production subsystems, prioritizing:

- src-tauri/src/app.rs
- src-tauri/src/runtime_workbench.rs
- src/App.tsx
- src/components/QuickForge.tsx
- src/components/World.tsx
- crates/spark-core/src/library.rs
- crates/spark-core/src/workspace_history.rs
- crates/spark-core/src/build.rs
- crates/spark-core/src/native_logic.rs
- crates/spark-core/src/runtime_adapters.rs
- crates/spark-core/src/animations.rs

Produce a navigable inventory of remaining production source files and functions, with call-site references.

Identify duplicate implementations, stale capability descriptions, unreachable or misleading controls, unbounded processing, state races, unsupported native operations and hidden failures.

**Confirmed review targets:**

1. Investigate the split Save/Undo checkpoint publication.
2. Resolve the scope of `scenarioPlacementWriterMissing` and the general World-scene compilation gap.
3. Distinguish preview-only workshop assets from supported native-build asset paths.
4. Correct the stale Firefight hosting text claiming that no generated scripts exist.
5. Review large integration components for coherent ownership and testability.

Don't split large files merely to reduce line counts. Repair actual responsibility or lifecycle problems with narrowly tested changes.

### 3. Finish one real Native Asset & Tag Studio workflow

Reuse the current C63/C68/C70/C71 implementations.

Select an already accepted small native fixture—prefer the independent door/trigger/object scenario.

Complete:

1. Create or import a verified native-compatible asset.
2. Open it in the actual Inspector or authoring workspace.
3. Modify supported geometry, material or native properties.
4. Assign supported object behavior or HaloScript logic.
5. Undo, redo and Save.
6. Close and reopen with exact source identity and history.
7. Stage only required verified dependencies.
8. Compile with the correct installed Halo toolchain.
9. Independently inspect/reopen generated native tags and compiled map.
10. Load the compiled result in a compatible game when possible.
11. Prove the authored object works, or leave the exact game gate explicitly unaccepted.

Preserve ordinary Halo tags and maps. Do not require proprietary Spark extensions.

Do not replace the original handwritten scripts, original asset, ISO or SDK.

A correct preview, source parser or compiler exit code is not sufficient to claim real gameplay acceptance.

### 4. Integrate new Discord findings as ENGINE-SPECIFIC research

The observations are community reports, not proven Spark defects.

#### A. Biped and multiplayer state synchronization

Discord reports uncertainty about player biped switching synchronizing between peers.

C20 documents that Halo 1 scripting, AI and several device states are not generally synchronized by the normal Gearbox protocol. Custom Edition workarounds cannot be assumed to work in MCC H1A.

Audit existing SparkLink, multiplayer, native Firefight, OpenCE and Chupathingy interfaces.

Keep separate:

- Shared editor state.
- Halo game object replication.
- Player-controlled biped identity.
- AI and animation lifecycle.
- Authoritative round state.

Use only genuine version-pinned engine interfaces.

Test actual peer-visible identity, position, animation, damage, death, cleanup, respawn, late join and reconnect where the installed engine supports them.

Never report two independent local observations as a completed two-computer gameplay acceptance test.

Do not add a second AI simulator or invent a generic Halo network bridge.

#### B. HaloScript versus Megalo

Discord reports that the Reach-era HaloScript workflow cannot detect the needed round-end event, preventing reliable cleanup of custom mode variables.

Do not assume Halo 3/Reach Megalo APIs exist in Halo 1.

Inspect `src/haloScript.ts`, `crates/spark-core/src/native_logic.rs`, the gametype scenario planner and native Firefight controller.

Create or update a target-specific lifecycle capability matrix:

- Round initialization.
- Start event or equivalent controlled initialization.
- Victory/defeat.
- Explicitly supported round reset.
- Object/AI cleanup.
- Player death and respawn.
- Disconnect/reconnect.
- Persistent versus round-local variables.
- Multiplayer synchronization authority.

Unsupported events must be refused or clearly marked rather than silently mapped to another engine's behavior.

The existing solo native Firefight controller is valid within its accepted scope. Do not advertise a multiplayer controller until native peer acceptance passes.

Preserve existing CTF, Oddball, Slayer, King of the Hill and Race placement validation.

#### C. Animation dependency and lifecycle safety

Discord reports a Halo 3 animation graph copied into a Halo Reach editing kit, together with separate map-load and death-event crashes.

These reports are not evidence that the graph caused either crash.

Use them as adversarial examples for Halo 1 native asset correctness:

- Exact target engine generation.
- Object/model/animation dependency closure.
- Node names, order, parent hierarchy and rig checksums.
- Required damage/death/respawn animations.
- Original source hashes and native tag class validation.
- Runtime-specific validation and independent readback.

Do not create an H3-to-Reach converter as part of the Halo 1 initiative.

Test accepted Halo 1 animation changes through startup, idle, movement, damage, death and respawn where feasible.

#### D. Original Xbox and Warthog

Review the verified upstream project:

`https://github.com/ChupathingyCE/warthog-xbox`

Spark already has a Warthog Xbox discovery/profile descriptor. Reuse it rather than creating another runtime registry.

Upstream documents original Xbox play, Custom Edition maps, system link, online participation and a 32-player test-build limit. Memory/feature support is build- and hardware-dependent.

Determine precisely what Spark already supports for this profile:

- Read-only source/cache inspection.
- Original Xbox cache identity.
- Warthog Custom Edition map suitability.
- Resource and dependency validation.
- 64 MiB versus 128 MiB memory considerations.
- Build-version compatibility.
- Executable integration versus descriptive profile.
- Actual game startup and diagnostic collection.
- Safe source-to-game export, only where independently supported.

Introduce a bounded read-only compatibility report where useful. Never claim that Warthog is ordinary retail Xbox Halo or that Warthog's 32-player limit proves the 128-player Spark goal.

For console black-screen/crash diagnosis, distinguish bad tag dependencies, cache construction, resource shortage and unsupported runtime generation. Compare known-good and modified source hashes, and capture available diagnostics.

Do not install, patch, jailbreak, configure network security or overwrite console files automatically. Preserve every supplied game image, especially the Chupathingy Halo ISO.

No proprietary SDK downloads, third-party source copying or unapproved console operations.

#### E. Rendering and debug UI research

The Halo 3 editing-kit gamma and debug-text discussion is outside Spark's current Halo 1 critical path.

Record the insight only: source textures, gamma/color-space transforms, compiler output and actual game rendering should be verified distinctly.

Do not import unrelated Halo 3 patches or create another rendering pipeline.

### 5. Resume interrupted UI quality work

Run the actual native-app flows across Home, Library, World, Forge, Asset Studio, Inspector, Logic/Events, Build, multiplayer and Settings.

Review:

- Dead or misleading controls.
- Unclear native-build support.
- Map tab overflow and window focus.
- Writer ownership and detached-window return.
- Layout restoration and multiple displays.
- Keyboard navigation and accessibility.
- Numeric input commits and Undo behavior.
- Source/project changes during asynchronous work.
- GPU/texture lifetime and minimized-window behavior.
- Save/Discard/Cancel clarity.
- First-run usability for a novice Halo modder.
- Advanced workflows without unnecessary repetitive steps.

Confirm the previously interrupted C69 work is still integrated after the P0 changes.

Make targeted corrections using existing components. Preserve one coherent, customizable interface and authentic user-provided Halo assets where permitted.

Do not confuse browser mock results with actual Tauri acceptance.

### 6. Preserve all other project goals

Keep existing work and acceptance identities for:

- Native Mac Demo/HaloMD editing without mandatory Windows tools.
- CE/MCC/OpenCE/Chupathingy compatibility.
- BSP sculpting, terrain, caves, UVs, portals and lighting.
- Timberland–Sidewinder two-way traversal and later four-region Megaworld.
- Original Zombie Apocalypse automatic release and gameplay.
- Firefight combat/HUD/shared rounds.
- First Contact campaign and cinematics.
- Real two-computer SparkLink.
- Native sound and MCC looping-audio playback.
- Complete map and gametype editing.
- Mac/Linux/Windows native packages.
- Clean-machine installer and tool setup.
- Community distribution and actual game-peer acceptance.
- Six-player co-op, 128-player gameplay, split-screen and VR research.

The C63 two-way scripted door test does NOT close Megaworld's separate two-way traversal gate.

Do not implement the entire backlog during this P0/C71 continuation. Record dependent tasks and keep advancing independently testable work.

### 7. Testing and honest acceptance

Run the relevant full Rust, frontend, TypeScript, browser, offline, storage and repository-health tests.

Add focused tests for confirmed bugs and new edge cases.

Validate in the real embedded Windows application where possible, followed by native compiler/readback and genuine gameplay when available.

Do not weaken failing assertions, fake telemetry, manufacture game-peer results, or claim that an engine feature exists merely because upstream source contains it.

Reconcile local results with the successful hosted CI at `1d1de2b`. Keep Linux/macOS native package verification separate.

No new public release, GitHub push, network service, game download, system modification or install without explicit authorization.

Commit only safely validated local source changes.

### 8. Required report

Produce a concise but technically substantial report containing:

1. Exact starting and ending source revisions and Git status.
2. Function/subsystem responsibility inventory.
3. Confirmed defects versus unverified risks.
4. P0 fixes and interruption/recovery acceptance.
5. C71 complete native workflow results.
6. UI findings and real regressions repaired.
7. Discord research findings and applicability by Halo engine.
8. Actual native compilation, readback and gameplay evidence.
9. Test totals, ignored tests, failures and blocked gates.
10. Disk usage and generated scratch accounting.
11. Preserved historical requirement IDs and revised evidence levels.
12. The one highest-impact next engineering action.

**Do not respond with only research, bookkeeping or another proposed roadmap when safe implementation and reproducible testing can continue.**

The priority is stability, authentic native output and complete creator workflows—not more disconnected features.

**Project mission: One Halo. Every World. Every Tool. Together.**