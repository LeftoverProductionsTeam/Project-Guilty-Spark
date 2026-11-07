# PROJECT GUILTY SPARK — CONTINUOUS FEATURE COMPLETION & LEDGER INTEGRATION

## ALL THE TOOLS, AND THEN SOME.
### Finish the editor. Integrate the features. Fix the bugs. Prove the gameplay.

**Owner directive — November 6, 2026**

This expands the previous P0/C71 steering directive. All of its technical fixes, test requirements, safeguards and outstanding acceptance gates remain in force.

**Reviewed remote checkpoint:** `d64f3e7dc65ae1f0c555ad0070a611130912b71c`

Determine actual local HEAD and worktree status before touching the repository. Do not assume remote and local state are identical.

## 1. The mission

Project Guilty Spark is not supposed to become a collection of disconnected tools, a compatibility dashboard, or an enormous project that only passes tests.

It is supposed to be a genuinely integrated Halo 1 creation suite.

The creator should be able to:

**Open a Halo map → inspect its contents → edit geometry, tags, textures and objects → create behavior and gameplay → compile native output → launch Halo → test the result → return to Spark → revise and rebuild → package and share.**

The application should perform as much of the underlying work as genuinely supported, using its own code and compatible native toolchains where appropriate.

Advanced users must retain access to real Halo engine structures, tools, diagnostics and source files.

**A beginner should be able to perform a simple edit without learning twenty separate applications. An expert should be able to build an entire Halo experience without hitting arbitrary limitations imposed by Spark's interface.**

Do not narrow development to bug fixing alone.

From this point forward, pursue three connected engineering objectives:

1. **Reliability:** fix actual bugs, data-loss hazards, incorrect capability reporting, broken UI controls and native-tool failures.
2. **Feature completion:** implement missing functionality from the existing approved prompts and master feature ledger.
3. **Integration:** make independent subsystems work together through complete, usable creator workflows and genuine native Halo output.

The application must become more complete with every meaningful engineering checkpoint.

---

## 2. Preserve everything already achieved

Before modifying source, reconcile:

- `AGENTS.md`
- `docs/ENGINEERING_CONTRACT.md`
- `docs/ACTIVE_TASK.md`
- `docs/PENDING_REQUESTS.md`
- `docs/DIRECTIVE_LEDGER.md`
- `docs/MASTER_FEATURE_LEDGER.csv`
- `docs/ENGINE_SOURCE_ATLAS.md`
- `docs/P0_C71_CONTINUATION_20261106.md`
- `docs/Master Engineering Prompts/README_FIRST.txt`
- `docs/Master Engineering Prompts/MANIFEST.json`
- All numbered engineering prompts #04–#28

Preserve the entire existing codebase, meaningful Git history, unfinished source, accepted native results and previous-good outputs.

### Permanent protections

- One canonical development directory: `D:\Project Guilty Spark`.
- Continue on the existing local `master`.
- No new branches, worktrees, nested repositories or full-project clones.
- No rewriting history, forced pruning or indiscriminate cleanup.
- No GitHub push or public release without authorization.
- Preserve all user-selected Halo installations, ISOs, SDKs, original tags, maps, scripts, research, mods and assets, **including the Halo ISO deliberately stored for Chupathingy inside the project directory**.
- Preserve the previously accepted C49 Windows installer, portable package and source.
- Never modify the only original copy of a game asset or project.
- Keep native compiler writes inside explicitly owned, bounded, disposable workspaces.
- Never automatically copy an entire SDK when a verified dependency subset will suffice.
- Keep recovery files that were refused for deletion. Do not circumvent that refusal.
- No unauthorized game downloads, system changes, security bypasses, public servers or installations.
- Preserve standard Halo compatibility. Optional Spark metadata must never become a required proprietary tag format.

Do not reconstruct removed recovery warehouses or regenerate historical test environments merely because old documentation refers to them.

### Evidence must remain honest

Retain the established acceptance ladder:

1. Implemented in source.
2. Automated tests pass.
3. Independent native readback passes.
4. Native compilation passes.
5. Real Halo runtime loads the result.
6. Human gameplay is accepted.
7. Real multiplayer peers demonstrate the expected behavior.
8. Clean-machine/package acceptance passes.

Never promote one level into another.

A successful commit is not a finished feature. A valid tag is not a playable map. Two local processes are not automatically a two-computer gameplay acceptance test.

---

## 3. Complete the 475-row feature ledger integration

This is now a primary engineering objective, not a deferred documentation task.

The canonical ledger contains **475 requirement records**. The numbered engineering queue contains **25 preserved prompts, #04 through #28**.

Do not add historical snapshot counts together or reinterpret them as unique newly approved features.

### 3A. Reconcile every requirement

For every existing requirement ID, identify:

- The user-requested functionality and its originating prompt.
- The subsystem responsible for implementing it.
- Relevant existing files, functions and native commands.
- The actual application entry point or screen.
- What currently works.
- What is missing, broken, disconnected or unsupported.
- Which Halo engine and build the functionality applies to.
- The actual evidence level reached.
- The next specific implementation or acceptance action.
- Dependencies on another feature, tool, runtime or manual test.

Preserve original IDs and user wording. Link related or overlapping requirements instead of deleting or consolidating their identities.

Use the existing master CSV and directive ledger as authoritative records. A generated searchable cross-reference may supplement them, but must not become a competing source of truth.

### 3B. Trace the actual implementation

For every feature marked implemented or partially implemented, trace a practical path:

**UI control → frontend state → Tauri command → Rust/core implementation → native file/tool/runtime → result shown to the user.**

Find controls that:

- Do nothing.
- Open an unrelated screen.
- Modify only a preview when the user reasonably expects a native change.
- Lose edits across navigation or window changes.
- Advertise operations unsupported by the selected Halo engine.
- Duplicate another workflow unnecessarily.
- Hide an existing working feature.
- Discard information during transfer between editors.
- Display success without validating the result.

Fix these defects and missing connections.

A feature with working backend code but no usable application workflow is **not fully integrated**.

A feature with a working interface but no real backend implementation is **not complete**.

### 3C. Turn missing ledger functionality into source changes

Prioritize incomplete requirements based on:

1. The importance to the original Halo modding vision.
2. Whether existing code can support a genuine implementation.
3. Whether the work completes an end-to-end creator workflow.
4. Whether the feature unlocks multiple other requirements.
5. Whether native evidence can be obtained without unsafe operations.
6. The actual risks and dependencies.

Implement the selected requirement in the existing subsystem.

Add or repair the UI, backend operation, native output and tests as needed. Update the original requirement record only after the change is measured.

Do not spend an engineering session merely relabeling rows, creating new reports or claiming that historical features are integrated.

### 3D. Make feature availability truthful inside Spark

Where appropriate, connect the existing feature catalog, runtime capability reports, tool readiness and UI controls to the same verified implementation facts.

For example, a user should see whether an operation is:

- Ready for this exact Halo target.
- Supported only by a particular native workflow.
- Awaiting a dependency or external tool.
- Supported for inspection but not editing.
- Implemented but awaiting in-game acceptance.
- Research-only or unsupported.

Show the actual next action rather than a vague failure.

Do not load the entire engineering CSV into ordinary application startup or create a heavyweight feature-management framework.

### 3E. Definition of completion

A requirement may be closed only when its exact acceptance criteria are demonstrated.

Where physical hardware, another player or manual game interaction is unavailable, mark that acceptance gate open and continue safe independent implementation elsewhere.

**Do not treat a missing human test as permission to abandon the feature. Do not let it freeze the rest of the ledger.**

---

## 4. Keep the previous bug-fixing objectives

The following items from the previous directive remain required.

### 4A. H1A Standalone game-load failure

Reproduce and isolate the current C71 Standalone exit-code-1 failure.

Test the known-good scenario against the authored door scenario in an equivalent isolated environment.

Inspect the actual `debug.txt` fatal sequence.

Determine whether the test environment is missing required H1A UI/shell resources or whether the authored scenario independently fails.

Use the existing bounded dependency resolver and preflight. Add only verified legal source dependencies with recorded hashes.

Never change the original H1A installation or copy an entire SDK as a workaround.

Retry the **same C71 fixture**.

When the runtime actually loads it, verify the newly authored Enter → Open trigger and door. Then test two-way movement and the separately authored Leave → Close behavior where applicable.

Keep loose-tag Standalone testing separate from actual compiled-cache loading in MCC.

If the game remains blocked, preserve its exact diagnostics and continue an independent feature implementation rather than repeating the same unsuccessful launch.

### 4B. Optional QuickForge build receipt corruption

Reproduce the identified potential failure in `Library::get()` when optional native build-receipt metadata is malformed.

A damaged or stale build receipt must not be trusted, but it should not make an otherwise valid editable project inaccessible when safe recovery is possible.

Repair within the existing library and receipt architecture.

Add focused corruption, restart, missing-receipt and external-writer tests.

### 4C. Build-status truth

Review `quickforge_build_report()` and the QuickForge build-status UI.

A matching project fingerprint alone must not imply that a compiled build still exists or remains valid.

Reuse the existing complete build/output validator.

Test missing, changed and corrupted **disposable test-owned outputs** without touching accepted builds.

The QuickForge and Build workspace interfaces must agree about what is genuinely ready.

### 4D. Save, Undo and recovery

Preserve all recently repaired coordinated Save/Undo behavior.

Regression-test relevant new features for:

- Persistent source identity.
- Immutable Undo snapshot keys.
- Save/Discard/Cancel.
- First Save and process restart.
- External-edit reconciliation.
- Separate window writer ownership.
- Native-owned assets and current build receipts.
- Interrupted operations.
- No implicit full-project copies.

Do not needlessly redesign the newly working recovery architecture.

---

## 5. Finish the existing engineering prompts

The 25 numbered prompts are implementation directives, not a list to mark as received.

Use the actual original prompt text and manifest. Do not queue all 25 as independent Codex messages or attempt to complete every subsystem in a single unbounded run.

Maintain one clear active engineering objective at a time, plus a dependency-aware queue. Advance through genuine implementation milestones while retaining all unmet acceptance requirements.

The user's current direction authorizes **continuing safe, independent feature engineering despite unrelated human-only blockers**. It does not waive a feature's required acceptance or automatically defer every prerequisite in the original prompts.

### #04 — Spark Flow: complete the interface

Finish the previously interrupted UI work.

Improve navigation, contextual workspaces, multiple maps, detachable windows, tab overflow, saved layouts, shortcut consistency, context retention, accessibility and clear operation feedback.

Test actual novice and expert workflows.

Ensure native editing controls remain discoverable and their behavior matches the selected runtime.

Do not redesign the application from scratch.

### #05 — Universal Tool Integration & Synergy

Finish reliable round trips through existing integrations for Blender, Invader, Guerilla, Sapien, Baboon, Mantle and other legitimately supported tools.

Use verified existing tool interfaces and preserve source ownership.

A user should be able to open a compatible tool from Spark, edit a valid native source, save it, return, inspect the changes, reconcile conflicts and continue building.

Do not create duplicate toolchain managers or pretend an unverified external API exists.

### #06 — Complete Native Asset & Tag Studio

Continue beyond the accepted C71 door benchmark.

Implement additional genuine native asset-authoring operations for supported models, collision, physics, weapons, vehicles, bipeds, scenery, equipment, effects, shaders, bitmaps, lightmaps, cubemaps, sound, animation, strings, HUD and scenario references.

Use target-specific validation.

Complete native asset dependency discovery, authoring, compile, independent readback and editable project reuse.

Make unsupported classes explicitly read-only instead of claiming generic serialization support.

### #07 — Halo Map Conversion & Legacy Preservation

Complete the existing source → target → compatibility analysis → native conversion → verification workflow.

Keep original Xbox, retail PC, Custom Edition, MCC, Mac Demo/HaloMD, OpenCE and Chupathingy distinct.

Validate BSP, materials, scripts, collision, audio, animation, AI, gametype objects and resource banks individually.

Implement supported conversions without silently discarding data.

Research-only routes must remain honestly labeled until native tool and gameplay acceptance exists.

### #08 — Community Field Intelligence & Native Diagnostics

Translate verified community findings into improvements to the existing renderer, scenario validator, Source Guardian, BSP tools and native build diagnostics.

Investigate common issues from SwordEdit, Sapien, Halo Tool, Foundry and community editors.

Support useful detection and correction of malformed geometry, portal problems, missing resources, lighting/fog issues, invalid dependencies and unsupported native operations.

Preserve the original sources. Compile only inside safe staged output.

### #09 — Megaworld & Native BSP Mastery

Finish the existing Timberland–Sidewinder integration.

The compiled connection is not enough.

Verify visible accessible entrances, correct collision, portals, scenery, materials and actual **outbound and return player traversal**.

Then complete additional native editor operations:

- Vertex, edge and face editing.
- Extrusion, clipping and geometric cuts.
- Terrain sculpting, tunnels, caves and arches.
- Roads, bridges and ramps.
- Surface materials, UVs and shader assignments.
- Source-derived lighting and fog controls.
- BSP alignment, seams, collision and portals.
- Lightmap rebuilding and AI navigation implications.

Preserve correct Halo 1 material suffix semantics and never silently substitute visual geometry for valid collision geometry.

Distinguish multiple resident BSPs, engine BSP switching, separate map transitions and genuinely concurrent large-world streaming.

Only begin larger four-region acceptance when its prerequisites are genuinely established.

### #10 — Campaign Creation & Mission Director

Complete one real campaign mission using existing QuickForge, World, HaloScript, encounters, triggers, camera and native scenario tools.

Use **First Contact** as the retained benchmark.

Implement insertion, objectives, navigation, encounters, interactions, checkpoints where supported, cinematic transitions and a genuine end state.

Keep handwritten HaloScript intact and preserve target-specific limits.

The benchmark needs actual playable mission evidence, not just generated scripts.

### #11 — Firefight Creator & Complete Gameplay

Extend the existing native Firefight designer and controller into a usable mode.

Implement waves, encounter composition, reinforcements, difficulty, scoring, lives, cleanup, intermission, victory and defeat.

Ensure native AI spawn and cleanup cannot leave the round permanently blocked by stale actors or corpses.

Finish supported solo gameplay first where appropriate.

Shared Firefight must use the verified target runtime's actual networking and round authority.

### #12 — Original Zombie Apocalypse Restoration

Restore the user's original MacGamingMods Zombie Apocalypse rather than inventing a generic replacement.

Preserve the original recovered assets, carrier mechanics, actors, sounds, scripts and provenance.

Finish automatic carrier release safely.

Validate physics, actor ownership, movement, AI combat, damage, death, cleanup, round progression and survivor gameplay.

Create compatible CE/MCC variants only through supported native routes.

Do not claim completion from controlled release tests alone.

### #13 — Machinima & Recording Director

Finish the integrated cinematic workflow.

Support camera placement, movement, paths, takes, scene events, actor references and editable recording sequences.

Prove Save/reopen/replay of a real authored take.

Keep editor-only playback, native game cameras, live capture and actual exported video clearly distinguished.

### #14 — SparkLink: Multiple Creators, One Live Project

Build upon the existing three-process native editing evidence.

Finish genuine cross-computer collaboration, consistent source revisions, author-owned Undo, conflicts, offline recovery, external tool edits and frozen native builds.

Do not confuse editor synchronization with the game's multiplayer state.

### #15 — Universal Live Link

Extend the existing exact-build MCC operations only through individually verified runtime adapters.

Support typed operations, source ownership, reversibility and authoritative state.

Distinguish observing a running Halo process from safely writing to it.

Do not invent generic engine memory-write interfaces.

### #16 — AI Synchronization & Co-op Completion

Continue the existing OpenCE/Chupathingy actor lifecycle research.

Implement actual bounded, authoritative synchronization where supported: actor creation, movement, targeting, attacks, damage, death, animation, seats, cleanup, objectives, late joining and reconnects.

Test real game peers and multiple rounds.

Do not implement a second independent AI simulator where the native engine already has a functioning model.

Preserve six-player campaign co-op as an explicit goal, subject to verified runtime support.

### #17 — Multiplayer Hub, Hosting & Community Games

Complete runtime-appropriate Host, Join, Collaborate and game-mode workflows.

Support genuine scenario objects and rules for Slayer, CTF, Oddball, King of the Hill, Race and supported custom modes.

Verify map/protocol identity, player counts, server compatibility, join errors, round progression and actual two-player interactions.

A one-player server connection is not full multiplayer acceptance.

### #18–#21 — PlayBridge & Community Integration

Advance the original PlayBridge, Island Warfare, Community Unity and One Halo Community directives using existing source identities, networking, map discovery and creator workflows.

Integrate:

- Supported community-map discovery.
- Safe import and dependency preflight.
- Compatible runtime selection.
- Real join routing.
- Map/game-mode packaging.
- Creator attribution and rights.
- Optional sharing and feedback.
- Reopening shared content as legitimate editable source where supported.

Preserve account-free offline usage.

Do not create a new social network, uncontrolled download service or mandatory proprietary backend.

Build the genuine **Create → Share → Discover → Play → Edit → Rebuild** loop where permissions and tool support allow.

### #22 — Installer, First Run & Smart Tool Setup

Finish a normal Windows user experience:

Install → Welcome → Detect owned Halo installations → Verify resources → Select compatible tools → Open a project → Edit → Build.

Test startup, updates, permissions, file associations when opted in, uninstall, recovery and preservation.

Never silently modify system security settings, game installations or unrelated user data.

Keep current C49 accepted packages intact until their successors receive separate acceptance.

### #23 — Advanced Halo Engine Frontier

Retain and investigate:

- Six-player campaign co-op.
- The longer-term eight-player aspiration.
- 128-player multiplayer.
- Four-way local split-screen.
- Multi-region streaming.
- VR and tracked interaction.

Use actual pinned engine capabilities, budgets, performance and game-peer evidence.

Do not make these mandatory blockers for the editor, supported conventional gameplay or release work.

Research claims are not implemented features.

### #24 — Final Universal Halo 1 Integration

Complete missing connections between existing editors, native tools, compatibility reports, game launching and asset systems.

A user should not have to export and reimport the same data unnecessarily just to move between two Spark screens.

Use a consistent document identity, source provenance, native dependency contract, build status and error-reporting path.

Complete at least one genuine creator workflow from start to finish for each supported authoring family.

### #25 — Product Quality, Platforms & Release

Fix real product defects identified by functional and endurance testing.

Measure startup, heavy map load, render responsiveness, storage, memory and native tool lifecycle.

Test malformed inputs, unavailable tools, interruptions and user-facing recovery behavior.

Keep platform support and published releases tied to exact accepted source revisions.

### #26 — The Creator's Gauntlet

Execute the original complete acceptance sequence:

**Launch → Create → Edit → Import → Author → Compile → Launch Halo → Play → Return → Revise → Rebuild → Package.**

Use actual desktop UI automation, compatible native tools and real game evidence.

Fix failures in production implementations, rerun their relevant steps, then repeat full creator journeys.

Do not substitute simulated results or an internal test-only shortcut for the actual user interface.

### #27 — Mac Legacy Edition

Preserve the original MacGamingMods vision.

Implement a native Apple Silicon-capable Spark editor for legally owned Halo Mac Demo, Halo Mac Full and HaloMD content within the existing shared codebase.

It must genuinely edit and export supported native content without requiring Windows-only editing utilities for its claimed core operations.

Existing game emulation may remain an optional playtest path, not a dependency of the editor.

Observe the prerequisite gates in the original directive, but prepare reusable cross-platform architecture and independently testable parsing/editing improvements when safe.

### #28 — Cross-Platform Native Independence & Final Releases

Work toward genuine Windows, Linux and macOS applications.

For supported core editing capabilities, move essential functionality into Spark's own shared implementation rather than requiring an external Windows-only editor merely to perform a basic operation.

Keep specialist tools available as optional integrations.

Use native format validators and actual platform tests.

Do not claim completed packages, clean-machine acceptance or public releases until tested.

---

## 6. Implement the feature ledger as complete creator journeys

Do not approach each requirement as an isolated checkbox.

Select concrete end-to-end benchmarks that exercise many real capabilities together.

### Benchmark A — Native Multiplayer Arena

Create or edit a playable arena through Spark.

Produce valid geometry, collision, materials, lighting, spawns, weapons and equipment.

Author valid Slayer, CTF, Oddball, King of the Hill and Race objects where supported.

Compile using the correct native workflow.

Test gameplay and game-mode behavior in a compatible Halo engine.

Preserve the editable source.

### Benchmark B — Native Asset Modification

Open a supported existing asset.

Inspect and modify a native property, material, animation, model or behavior.

Build the correct source or direct-map copy.

Import the validated result into a second project.

Compile and independently verify it.

Load and observe the change in Halo when possible.

### Benchmark C — Megaworld

Open the existing Timberland–Sidewinder candidate.

Complete entrance, collision, BSP, portal and material validation.

Verify actual travel to the second region and return.

Edit the source through Spark, rebuild and retest.

Preserve the earlier successful source and output.

### Benchmark D — Campaign and Firefight

Create a real scripted level with encounters, objectives, devices, triggers and player interactions.

Complete solo native play first.

Extend shared gameplay only using supported runtime-specific networking.

Prove victory, defeat, cleanup and repeatability.

### Benchmark E — Original Zombie Apocalypse

Restore original zombie mechanics and native content.

Complete automatic release and survivor interaction.

Verify damage, death, waves, audio and gameplay in an actual supported engine.

### Benchmark F — Community Creator Loop

Import a permitted source project.

Make edits, build and package it.

Verify another compatible client can receive, load or join it.

Return to Spark with the same editable project and revision history.

### Benchmark G — Mac Legacy and Clean-Machine Release

On a genuinely supported native platform:

Install the application, open an owned compatible Halo map, edit it, save/export valid output and reopen it.

No hidden Windows tool dependencies.

No modification of the original source.

Each benchmark should close multiple linked ledger requirements, but only to the evidence level actually reached.

---

## 7. Work continuously without becoming trapped by one blocker

The previous P0 continuation produced valuable repairs, but the project has more work to do.

Use the following engineering discipline.

### When a bug is reproducible

Fix it in the existing implementation, add a regression test and validate the affected workflow.

### When a feature is incomplete but implementable

Implement the next meaningful native operation. Do not stop at inventory, design notes or test harness changes.

### When a native tool or gameplay gate is blocked

Record exact evidence and dependencies. Preserve the source and previous-good result.

Continue an unrelated, safe ledger requirement that can make real progress.

Return when the blocked dependency becomes available or can be resolved.

### When the feature already exists in source

Test the actual user path and native result.

Connect missing frontend/backend/UI pieces.

Remove misleading workflow duplication only after verifying that no supported behavior will be lost.

### When an operation is unsupported by the target engine

Report the actual limitation.

Preserve the original user's goal in the ledger.

Research legitimate alternatives and compatible runtimes without faking support.

### When a feature is fully accepted

Record its exact implementation, target runtime, evidence, test and resulting revision.

Move to the next highest-impact missing requirement.

**Do not create another permanent planning process, scheduler, independent controller, audit framework or queue manager.**

Use the existing engineering ledger and lightweight active-task checkpoint.

The objective is repeated, meaningful implementation progress—not perpetual bookkeeping.

---

## 8. Prioritize the next engineering cycles

Use a dependency-aware sequence rather than allowing the last error message to determine the entire roadmap.

**Immediate priorities:**

1. Isolate and repair the H1A Standalone shell-resource/game-load failure through the existing native preflight.
2. Complete the new C71 door's actual gameplay acceptance when possible.
3. Repair and test malformed optional QuickForge build receipt handling.
4. Ensure validated build status requires real current output integrity, not just matching metadata.
5. Finish the feature-ledger-to-source/UI/backend/acceptance crosswalk for every original requirement.
6. Select and implement the highest-impact missing native asset or general World-scene operation.
7. Improve the actual creator workflow so supported edits flow between Tag Inspector, Asset Library, QuickForge, BSP Workshop, Logic/Events and Build without redundant manual handoffs.
8. Continue the next independently implementable requirements from the original ordered prompts.

**Next major product milestones:**

- Native geometry, BSP/material/lighting/fog and game-mode authoring.
- Broader native asset, animation, sound and shader editing.
- Actual Megaworld traversal and reusable environment-editing workflows.
- Playable First Contact, Firefight and original Zombie Apocalypse.
- Engine-specific conversion, real game peers and community integration.
- Cross-platform independent core editing.
- Complete Creator's Gauntlet and clean-machine releases.

This is a prioritization framework, not permission to declare all earlier prompts accepted or skip their specific acceptance dependencies.

Do not try to implement every milestone in one oversized code change.

---

## 9. Test the work rather than accumulating tests

Before implementing a feature:

- Confirm its current source behavior.
- Choose a concrete expected outcome.
- Identify the exact engine and native format.
- Reuse an existing fixture wherever possible.
- Preserve the input and previous-good output.

After implementation:

- Run the focused regression suite.
- Run relevant Rust/TypeScript/frontend/browser/offline tests.
- Test the real desktop interface for UI changes.
- Compile using the actual matching Halo tool where available.
- Independently inspect resulting tags, resources, scenario structures and cache.
- Attempt actual engine acceptance when safe and technically possible.
- Compare source identities, storage and regression results.
- Update the linked feature ledger requirements and evidence.

Keep corruption tests and deletions confined to explicitly owned, disposable test output.

Do not weaken a regression to obtain a green result.

Do not claim that more tests means a feature is more complete.

The number of truly working creator operations is more important than the total number of test assertions.

---

## 10. Deliver usable progress, not only analysis

Each completed engineering checkpoint must identify:

**Source and repository**
- Starting and ending commit.
- Working-tree status.
- Changes made to the existing code.
- Relevant functions and their responsibilities.
- Any new dependencies or native tool requirements.

**Features**
- Original prompt numbers addressed.
- Exact requirement IDs advanced.
- Previously missing functionality actually implemented.
- How the user accesses the functionality in Spark.
- What happens in the native output.
- What's still absent.

**Acceptance**
- Tests passed and failed.
- Actual native compile/readback evidence.
- Actual game result, if obtained.
- Explicit unaccepted manual/game-peer/platform gates.
- Reproduced defects and their fixes.

**Preservation**
- Original game/input integrity.
- Previous-good build integrity.
- Temporary storage generated and disposed.
- Any unresolved recovery, archive or ownership risks.

**Forward progress**
- Highest-priority next feature.
- Exact implementation target.
- Why it is next.
- Any blocked acceptance that can be revisited separately.

Update the existing ledger and checkpoint only to reflect evidence-backed progress.

Commit safe, validated local source milestones without pushing or publishing.

Do not voluntarily end a useful engineering cycle after writing a planning document when practical code implementation and validation can continue.

---

## 11. The standard we're building toward

A creator should eventually be able to open Guilty Spark and:

- Open a supported Halo map.
- Understand its real contents.
- Edit its native tags and assets.
- Manipulate and build the world visually.
- Adjust lighting, fog, shaders and materials.
- Place objects, vehicles, actors and game-mode objectives.
- Create scripts, triggers, campaign missions and custom modes.
- Import assets from other legitimately owned Halo sources.
- Use supported external community tools without losing context.
- Convert and rebuild for another compatible Halo runtime.
- Run and play the result.
- Share it with other players where supported.
- Return to the original editable project.
- Keep all of their work, history and source assets intact.

**One editor. One coherent workflow. Genuine native Halo content.**

No disconnected features. No false compatibility. No unnecessary mandatory dependencies. No abandoned original requirements.

**Keep the fixes we've made. Finish the features we've started. Integrate the full ledger. Continue moving forward.**

# ONE HALO. EVERY WORLD. EVERY TOOL. TOGETHER.