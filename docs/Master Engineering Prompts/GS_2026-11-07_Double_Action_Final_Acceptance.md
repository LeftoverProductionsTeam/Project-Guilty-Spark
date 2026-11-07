# PROJECT GUILTY SPARK — DOUBLE ACTION: FINAL ENGINEERING & GAMEPLAY ACCEPTANCE

## MISSION: FINISH BOTH FLAGSHIP WORKFLOWS

Continue Project Guilty Spark from the latest canonical local master checkpoint. Do not restart the initiative, rebuild working systems, create another editor, or abandon the substantial native engineering already completed.

**Two mandatory objectives:**

**TRACK A — ORIGINAL MULTIPLAYER MAP**

Create an original, fully playable Halo multiplayer map from a blank project, entirely through Guilty Spark's user interface.

**TRACK B — MEGAWORLD**

Use Guilty Spark to connect Timberland and Sidewinder through editable, lore-friendly terrain, with a working mountain road and separate infantry cave, then physically traverse the connected world in Halo.

Both experiences must use the same underlying editing tools, asset management, history, native compilation, and gameplay-testing infrastructure.

**The definition of completion is actual gameplay—not successful compilation alone.**

---

## 1. RESUME FROM THE EXACT CHECKPOINT

Inspect the current worktree, master history, active task, engineering ledger, native test evidence, and unfinished local changes before editing anything.

Relevant starting evidence:

- Public master checkpoint: `e01082f35f9389c6175778b7e3f63afdf994f237`.
- `docs/ACTIVE_TASK.md`
- `docs/DOUBLE_ACTION_20261107.md`
- `docs/fixtures/double-action-20261107.json`
- `docs/fixtures/h1a-standalone-shell-inputs.json`
- Existing native asset, workspace lifecycle, BSP assembly, and source-only verification harnesses.

The public revision is a reference, not permission to reset newer local work.

Last verified report:

- 817 Rust tests passed; nine ignored.
- 425 frontend tests passed.
- 205 browser tests passed.
- 12 native Windows window/lifecycle tests passed.
- Real CE-to-MCC scenery and vehicle imports compile and survive application restart.
- MegaWorld's combined MCC BSP builds and passes independent Invader readback.
- Native lightmap failure repaired.
- Verified physically traversable MegaWorld connections: **zero**.
- Original multiplayer map gameplay: **unaccepted**.
- H1A Standalone exits with code 1 on the combined world and a small control scene.
- Full 19-map MegaWorld and 128-player gameplay remain future objectives.

The exact accepted R17 MegaWorld artifact is approximately 82.75 MB, with 16,196 compiled collision triangles, and its preservation hash is recorded in the checkpoint.

Preserve that artifact and its evidence. Do not overwrite previous-good output.

Reconcile local and remote revisions safely. Do not force-push, reset, introduce another worktree, or discard local progress.

## 2. FIRST PRIORITY — RESOLVE THE ACTUAL HALO GAMEPLAY GATE

Stop treating native compilation as the final acceptance step.

The current bottleneck is reaching an observable, interactive Halo scene.

### Establish a known-good runtime baseline

Inspect the installed H1A Standalone executable, its required source/tag environment, launch arguments, working directory, dependencies, logs, and process behavior.

Perform a controlled comparison:

1. Known-good, unmodified source scene with the same installed executable.
2. Small Spark-authored multiplayer control scene.
3. Spark-authored Timberland–Sidewinder combined world.

Use isolated, correctly prepared test environments without modifying original game installations.

Keep the executable identity, input files, startup configuration and environment differences recorded.

**Do not assume the two observed exit-code-1 failures have the same cause.**

Investigate confirmed missing resources, game-mode configuration, shell/UI dependencies, scenario references, and the actual process-exit reason. Separate warnings from fatal errors.

Do not blindly copy SDK trees, disable protections, change system security settings, or suppress validation.

### Choose the correct supported runtime

The retained MegaWorld cache is MCC-format native output. H1A Standalone uses the corresponding loose-tag source workflow; it is not equivalent to loading that compiled MCC cache directly.

If Standalone is unsuitable for the requested test, use a verified supported retail MCC mod workflow or generate a genuinely compatible CE/OpenCE build using the appropriate native toolchain.

Verify format compatibility and dependencies before launching.

Do not claim a successful test in one engine proves compatibility with every Halo runtime.

### Required runtime evidence

Capture:

- Actual game window and rendered level.
- Correct scenario/map identity.
- Working player input and movement.
- Solid floor, walls and objects.
- Normal game startup/shutdown behavior or an explained alternative.
- Screenshots or short recordings.
- Runtime logs, artifact hashes and build identity.

If the Windows control or application approval system prevents interaction, preserve the exact blocker and continue independent source/native work. Never bypass approval or fabricate observed gameplay.

**Deliverable: a reproducible, verified way to launch and interact with Spark-authored native Halo content.**

---

## 3. TRACK A — FINISH THE ORIGINAL MULTIPLAYER MAP

### Required user workflow

The user opens:

**File → New → Multiplayer Map**

Then performs every relevant operation through visible controls in Spark.

Create a new, original outdoor Halo level containing:

- Two opposing red and blue team bases.
- Sculpted terrain with believable elevations.
- Natural cliffs and a central canyon.
- A working Warthog road.
- A playable cave and tunnel.
- At least one bridge.
- Editable stairs and ramps.
- Rock, ground, structure and environmental materials.
- Native sky, lighting and atmospheric settings.
- Imported Halo scenery, weapons and a Warthog.
- Proper player and team spawn positions.
- Working weapon and vehicle placements.
- Native CTF objectives.
- Native King of the Hill locations.
- Slayer-compatible spawning.

Avoid a disposable test box being presented as a finished multiplayer map.

The map should have sensible combat flow, player orientation, multiple approaches, useful vehicle lanes, counterplay against sniper positions, and no obvious unintended dead ends.

### Complete the creator workflow

The user must be able to:

**Create → Sculpt → Build structures → Import assets → Place objects → Configure gametypes → Preview → Undo/Redo → Save → Close → Reopen → Compile → Launch → Play.**

All features must be discoverable from the existing menus, Asset Library, Level Editor, Inspector and Build & Playtest controls.

Dragging a real asset image into the viewport must produce exactly one correctly placed native object.

Native dependency conversion must remain source-aware and reject unsupported formats clearly.

Do not quietly complete missing authoring operations using test-only JSON modifications or direct backend calls.

### Multiplayer acceptance

Launch the actual authored map in a supported multiplayer Halo runtime.

Use at least two real clients and verify:

- Both load the same map and game variant.
- Both spawn on valid geometry.
- Teams and player colors behave correctly.
- Players can see each other.
- Movement and aiming work.
- Shots cause legitimate synchronized damage.
- Death and respawn function.
- Weapons can be collected and used.
- A Warthog can be entered and driven.
- CTF flags can be collected and scored.
- King of the Hill areas register the appropriate players and scoring.
- Slayer gameplay functions independently.

Use separate actual game sessions for gametypes where required.

Bots may supplement the test, but bots alone do not satisfy the two-real-client acceptance.

**TRACK A PASS: A genuinely new multiplayer map is created in Spark and used successfully in an actual multiplayer match.**

---

## 4. TRACK B — FINISH THE PLAYABLE MEGAWORLD CONNECTION

### Preserve the existing native success

Reuse the accepted Timberland–Sidewinder BSP assembly and repaired native lightmap pipeline.

Do not discard the compiled 82.75 MB output, repeat expensive work without necessity, or replace successful source processing with a different unverified framework.

The existing connection's correct native compilation is an established accomplishment.

Now finish the missing creator and gameplay requirements.

### Make the terrain genuinely editable

Users must see both imported regions together within Spark.

Implement or finish the supported source-backed workflow for:

- Selecting original landscape boundaries.
- Positioning and orienting regions.
- Reconstructing editable terrain patches when necessary.
- Moving terrain vertices and faces.
- Raising and lowering ground.
- Smoothing and grading slopes.
- Extending canyon floors and walls.
- Cutting valid terrain openings.
- Building winding vehicle roads.
- Creating walkable caves and tunnels.
- Welding or correctly joining transition geometry.
- Matching native material identities and UVs.
- Blending environmental presentation.
- Validating collision, portals and visibility.

**These must be real native geometry operations, not visual overlays that conceal disconnected collision.**

Where arbitrary edits to imported cache geometry cannot be represented safely, provide an explicit bounded source-reconstruction or replacement-patch workflow.

Expose unsupported operations and preservation limitations honestly.

### The first seamless landscape

Connect Timberland into Sidewinder with:

**Route 1 — Mountain Road**

A believable, winding ascent from Timberland's forested landscape into Sidewinder's snowy canyon.

The road must support a Warthog, including appropriate width, turns, clearances and collision.

**Route 2 — Infantry Cave**

A separate cave or tunnel providing a covered alternative route.

The cave must have actual interior geometry, a supported floor, usable entrances, materials and appropriate visibility.

The transitions must preserve Halo's characteristic level design and natural environment continuity.

### Preserve gameplay content

Existing scenery, vehicle placements, weapons, player starts, shaders and related resources should survive wherever supported.

Report exactly which original features cannot be preserved and why.

Never silently discard gameplay objects or overwrite donor maps.

### MegaWorld gameplay acceptance

Build and launch the combined environment in a compatible Halo engine.

Verify:

1. Spawn successfully in Timberland.
2. Walk through the authored connection into Sidewinder.
3. Walk back into Timberland.
4. Enter the separate cave route.
5. Travel through the cave and return.
6. Drive a Warthog across the mountain road.
7. Check both entrances and the connecting terrain for collision failures.
8. Verify that lighting, materials and visibility do not produce unacceptable seams or missing geometry.
9. Create and test an elevated cross-region sniper sightline.
10. Confirm an actual valid projectile hit across that connection.
11. Save, close and reopen the Spark project.
12. Rebuild and confirm the connections remain intact.

Record actual game evidence for each distinct acceptance claim.

Collision samples, portal graphs, native readback and a successful server connection are valuable supporting evidence, but **none independently prove a player traversed the connection**.

**TRACK B PASS: A user connects two classic maps in Spark, compiles them, and walks and drives between them in real Halo.**

---

## 5. SHARED ENGINEERING — ONE COMPLETE TOOLCHAIN

Do not create a parallel editor for MegaWorld.

Both flagship tracks must reuse:

- Existing map documents and workspaces.
- BSP Workshop and QuickForge.
- Asset Library and native asset imports.
- Source-backed geometry editing.
- Shader, material, lighting and fog systems.
- Existing scenario/object placement logic.
- Game-mode configuration.
- Durable Undo/Redo and recovery.
- Native build orchestration.
- Runtime registration and launch.
- Existing independent verification harness.

A successful feature in Track A must also be available in Track B wherever the underlying engine supports it.

Preserve consistent coordinate systems, source identity, project ownership, and native dependency relationships.

Avoid hardcoding the feature to Timberland, Sidewinder or the demonstration map.

The objective is to prove general-purpose editor functionality using these two showcases.

## 6. USER EXPERIENCE MUST BE COMPLETE

Audit the actual UI while implementing the workflows.

Ensure the existing **File | Tools | Maps** menus lead naturally into every required operation.

The relevant project workspace should offer obvious actions for:

- Add and edit terrain.
- Add and modify geometry.
- Import assets.
- Place gameplay objects.
- Configure multiplayer modes.
- Connect maps.
- Edit seams.
- Save/Save As.
- Validate.
- Build and playtest.
- Review exact failures.

Avoid duplicate panels or new commands that only wrap existing functionality without improving usability.

Make sure feature controls work at normal and smaller desktop resolutions, including 1366×768. Avoid clipping critical controls or trapping actions offscreen.

Keep expert diagnostics accessible but do not require users to learn command-line flags for ordinary map creation.

### Essential rule

**No feature counts as complete unless a user can discover it, perform it, save it, reopen it and verify its result.**

---

## 7. TEST THE REAL WORKFLOWS

Extend the existing verification harness rather than building another independent testing system.

The evidence ladder must remain explicit:

1. Source implementation.
2. Focused automated tests.
3. Actual Windows/Tauri UI interaction.
4. Persistence and restart verification.
5. Native Halo compilation.
6. Independent native artifact readback.
7. Real game rendering and interaction.
8. Actual multiplayer acceptance where applicable.

Use real mouse drags, menu selections and editor operations for user-workflow acceptance.

Backend shortcuts may prepare prerequisites, but they must be identified and must not replace the interface interactions under test.

Test normal Save, Undo/Redo, Save As, project reopening, rejected edits, interrupted operations and recovery.

Every positive result must be tied to the exact tested build.

### Failure handling

Do not:

- Change assertions merely to make failures disappear.
- Disable failed test stages.
- Report compilation success as gameplay success.
- Reclassify timed-out or blocked tests as passes.
- Infer successful movement from static geometry.
- Claim two-client multiplayer from a single process.
- Reuse old receipts as evidence of a newer build.

Correct actual defects, retain relevant negative evidence and rerun the affected verification.

---

## 8. PROTECT THE PROJECT AND CONTROL STORAGE

All existing preservation rules remain mandatory.

- Work from the canonical `D:\Project Guilty Spark` repository.
- Keep the approved master worktree model.
- No new nested repositories, branches or worktrees.
- Preserve every user-selected runtime, SDK, ISO, map, mod and asset, regardless of size or folder location.
- Preserve C49 releases and all previously accepted binaries.
- Preserve Git history, recoverable Undo data, source archives, research and the existing requirement ledger.
- Preserve all 475 tracked requirement IDs and 25 numbered master prompts.
- Do not remove protected recovery records just because they are large.
- Avoid copying whole Halo installations into temporary build directories.
- Use bounded staging of only required dependencies.
- Clean only owned, verified-disposable generated files.
- Keep previous-good native output and its hashes.
- No silent destructive migrations.
- No security-control bypasses.
- No remote push, release or publication without explicit authorization.

Avoid uncontrolled growth of compiler caches, generated binaries, diagnostic captures or duplicated runtime assets.

Keep storage usage transparent, separating the repository, runtimes, SDKs, recovery data and temporary build artifacts.

**Reliability and preservation take priority over saving a few extra megabytes.**

---

## 9. PRIORITIZE MAJOR ACCOMPLISHMENTS

Do not divert into unrelated requests while these flagship workflows remain unfinished.

Specifically defer expansion into:

- All 19 MegaWorld regions.
- New extraction-mode systems.
- A replacement networking stack.
- 128-player optimization.
- New AI frameworks.
- New rendering engines.
- Additional nonessential UI themes or decorative redesigns.
- Unrelated platform packaging.

Keep those requirements preserved in the ledger.

They become much more valuable after Spark can author and play one original multiplayer map and one connected MegaWorld.

Work on source editing, game launch, runtime compatibility, and native correctness that directly helps the two flagship tracks.

Do not spend an entire run producing only more plans and documentation.

**Implement, compile, test and demonstrate.**

---

## 10. REQUIRED FINAL DELIVERY

At the next checkpoint, return a concise but complete engineering report.

### TRACK A — ORIGINAL MULTIPLAYER MAP

Include:

- Exact implemented UI workflow.
- Authored map description.
- Native build result and artifact identity.
- Supported target engine.
- Actual game launch result.
- Two-client multiplayer results.
- Slayer, CTF and King of the Hill acceptance.
- Screenshots, recordings or reproducible evidence.
- Unfinished requirements, if any.

### TRACK B — MEGAWORLD

Include:

- Exact implemented terrain/connection workflow.
- Original source identity and preservation checks.
- Road and cave geometry evidence.
- Compiled map and native readback.
- Actual game loading result.
- Two-way walking evidence.
- Warthog traversal evidence.
- Cross-region sniper interaction.
- Remaining geometry, lighting or performance blockers.

### ENGINEERING HEALTH

Include:

- Local commit identifier.
- Working-tree status.
- Test totals and ignored tests.
- Runtime versions.
- Current storage allocation and measurement scope.
- Preserved release/source hashes.
- Any remaining blockers requiring owner action.
- Updated requirement and acceptance evidence.

Only report full acceptance for capabilities that were actually demonstrated.

If a real user approval, installation dependency, additional machine or other external condition prevents the final gameplay test, continue all safe independent work first. Then identify the precise unresolved gate, preserve the work and ask only for the single action actually needed.

Do not invent an acceptance result or replace it with optimistic language.

---

# FINAL DIRECTIVE

**FINISH THE DOUBLE ACTION INITIATIVE.**

Deliver two real, end-to-end Halo creator experiences:

**A.** Start with nothing, build an original multiplayer map in Guilty Spark, launch it and play it with another real client.

**B.** Import Timberland and Sidewinder, sculpt a believable canyon road and separate cave between them, compile the connected landscape, then physically walk and drive between the original maps in Halo.

Both demonstrations must be created through Spark's actual UI.

Both must preserve source assets and survive saving, closing and reopening.

Both must use native Halo data and tools.

Both must have independently verifiable results.

**No duplicate systems. No shortcuts disguised as acceptance. No new feature detours.**

**Make the editor work, make the maps compile, make Halo run, and prove the player can actually play what Spark created.**