# PROJECT GUILTY SPARK — COMPLETE CREATOR WORKFLOWS & NATIVE ACCEPTANCE

## One Halo. Every World. Every Tool. Together.

Continue from the actual local master, reconciling safely with published GitHub revision `34b7c57` and all unfinished work. Preserve every verified accomplishment, all 475 requirement IDs, 25 original engineering prompts, source/history, original Halo content and accepted C49 release.

**NEW PRIORITY: MAJOR, USER-VISIBLE ACCOMPLISHMENTS ONLY.**

Stop treating isolated backend functions, visual previews, registered commands and passing unit tests as completed features.

Our objective is a genuinely unified Halo 1 modding application where someone can perform a complete operation without needing to understand the collection of tools and formats behind it.

## 1. Define what a complete feature actually means

Every feature exposed to a creator needs a traceable workflow:

**Discover → Open → Configure → Perform → Preview → Save → Reopen → Build/Export → Verify → Use in Halo.**

Not every operation needs a game launch, but every operation must reach its appropriate real-world endpoint.

For example:

- A map-inspection feature must correctly inspect real owned map data.
- A tag editor must write and independently reread the intended native field.
- A visual placement must survive Save, restart, native compilation and scenario extraction.
- An audio editor must distinguish audible preview from sound actually installed in a playable map.
- A game feature must execute in a real compatible Halo engine.
- A multiplayer feature must demonstrate actual communication with another game client.

Every visible enabled control should lead to a meaningful supported action.

Unsupported or incomplete features must be clearly identified, with their requirements and limitations visible to the user.

Do not hide unfinished features to improve coverage numbers, and do not claim that a backend function is complete merely because the corresponding UI exists.

## 2. FIRST MAJOR DELIVERABLE — TRUE CROSS-MAP AND CROSS-RUNTIME ASSET IMPORT

Make the existing Asset Library a reliable gateway for moving supported Halo content between maps and compatible runtimes.

### Required creator journey

A user should be able to:

1. Open a source map from one Halo runtime.
2. Open a destination map associated with another runtime.
3. Browse source assets by category, map, and searchable name.
4. See the real asset preview and its origin.
5. Drag the asset directly into the destination's 3D world.
6. See correct placement feedback and edit its properties.
7. Preserve required native tag dependencies, models, shaders, bitmaps, audio, collision and animations as applicable.
8. Save, close and reopen the project.
9. Compile or export to the selected compatible target.
10. Independently verify the actual destination tags, scenario placements and dependencies.
11. Load and test the resulting content in the destination game where an available supported runtime permits it.

Use the existing `ViewportAssetLibrary.tsx`, `useViewportAssetDrop.ts`, `nativeAssetImport.ts`, `World.tsx`, `QuickForge.tsx`, `native_asset_imports.rs`, native compiler and source-history implementations.

**Do not create another asset library or importer when existing components can be extended.**

### Cross-runtime compatibility

Investigate explicit source-to-target translations for:

- Halo PC retail
- Halo Custom Edition
- MCC Halo 1 Anniversary and its official editing tools
- Original Xbox
- Legacy Mac / HaloMD
- OpenCE, OpenCE-Faber and Chupathingy-compatible content

Do not presume that identical-looking tags or maps have interchangeable binary layouts.

Maintain a capability matrix by source runtime, destination runtime, asset class, required dependencies and conversion status.

Distinguish native import, target-specific conversion, read-only support, unsupported content and research-only routes.

Start with one demonstrable cross-runtime pairing, preferably a real Halo Custom Edition donor asset transferred into a distinct MCC H1A authoring project, if exact source and conversion prerequisites permit it.

A second distinct source/destination pair should establish that the workflow is not accidentally hardcoded to one fixture.

For the first successful pairing, preserve an independently checked native output and an actual GUI screen recording or screenshots showing the drag operation.

### Supported asset families

Build on the existing source handling for scenery, vehicles, weapons, equipment, bipeds, machines, sounds and shaders.

Expand only where valid native translation is understood and independently testable.

Check dependency closure, source provenance, target tag limits, external resource requirements and cache-format differences.

Visual placement, editor-only objects, imported native assets and compiled scenario objects must never be silently confused.

An unsupported scaled, replaced or removed object must produce a clear explanation rather than a false successful build.

## 3. VERIFY THE ACTUAL INTERFACE, NOT JUST THE BACKEND

Extend the existing browser and actual Windows/Tauri acceptance systems.

Test actual user interaction:

- Pointer-down on a real asset in the library.
- Pointer movement across the interface.
- Dragging into the world viewport.
- Correct world-space raycast and intended placement coordinates.
- Visible pending/importing/success/failure feedback.
- Native dependency preparation.
- Inspector modification and selection.
- Copy, duplicate, Undo and Redo.
- Save/restart and native output verification.

Also check cancellation, dragging outside the viewport, switching maps during import, losing focus, another window owning the document, missing donor content, incompatible resources and a failed compiler.

The harness must establish that a user can accomplish the task through the actual UI.

Backend IPC may prepare fixtures, but must not substitute for the interaction being accepted.

A green simulated browser test must never be reported as a successful native Halo build or actual gameplay.

## 4. FULL APPLICATION WORKFLOW COVERAGE

Use the existing canonical 475-entry requirements ledger as the foundation for a complete feature-to-workflow crosswalk.

Do not invent 475 completed features or replace the ledger with another massive database.

For each user-facing feature family, establish:

- The UI entrypoint and how the user discovers it.
- The actual state owner and native operation.
- Required prerequisites and runtime compatibility.
- What a successful user operation changes.
- The appropriate independent acceptance test.
- Current implementation status and missing evidence.
- A specific next action if it is unfinished.

Cover the complete studio, including map inspection and editing; tags and recursive imports; BSP creation and connected geometry; materials, fog, lighting and radiosity; collision and portals; game objects, spawn points and gametype objectives; audio and animations; logic, HaloScript and AI; Firefight and survival; machinima and recording; live editing; multiple windows and collaboration; native tools; compilation, conversion, launch, hosting, multiplayer and packaging.

Audit the real navigation flow as well as the code. Identify unreachable features, duplicate workflows, hidden actions, misleading labels, dead buttons, missing results, overwritten settings and controls that appear operational but do not produce native output.

**A feature is not accepted until its complete advertised workflow is accepted.**

## 5. MAKE THE TEST HARNESS A PRODUCT COMPLETENESS GATE

Extend existing tests rather than building a second QA framework.

Maintain separate evidence levels:

**Level A — UI and source behavior:** Actual controls, validation, selection, state, navigation and persistence work.

**Level B — Native desktop behavior:** Real Tauri IPC, filesystem transactions, source ownership, Undo/Redo and restart recovery work without mock IPC.

**Level C — Native Halo artifact:** The output is built with a supported tool and independently reread, with the expected tags, placements, scripts and resources present.

**Level D — Real Halo runtime:** A compatible game actually loads the output, and the tested feature works with observed player interaction.

**Level E — Multiplayer acceptance:** Two or more actual game clients demonstrate the relevant synchronized behavior.

**Level F — Clean-machine release:** An independently installed application performs the supported workflow without hidden developer-machine dependencies.

Only advance a feature to the level supported by evidence.

Add or reuse deterministic representative test fixtures, not giant copied game installations. Keep fixtures and detailed outputs in bounded, owned external test directories.

Support automated UI/source tests in CI. Run resource-heavy licensed-tool, game and multi-computer tests only where legitimate prerequisites exist.

Never weaken tests, skip important validation, invent test receipts or treat an unavailable game as a pass.

Preserve test recordings, independent artifact hashes and concise failure evidence.

## 6. NEXT PLAYABLE MILESTONE — FIREFIGHT CREATOR

Once the cross-map native asset workflow is proven, reuse it to deliver the first genuinely playable custom Firefight scenario.

Study the pinned OpenCE-Faber implementation and its documented Forge spawn markers, deployment options and map export.

Integrate the relevant compatible capabilities through Spark's existing Firefight editor and native pipeline.

The creator should place real AI encounter spawns, choose supported deployment behavior, author two waves, build a valid map and fight those enemies in a compatible runtime.

A simulated wave, generated script ZIP or successful compiler run is not gameplay completion.

Record Faber-specific functionality separately from standard Custom Edition compatibility and Chupathingy interoperability.

Do not import AGPL engine implementation into the MIT project without a compatible licensing approach.

## 7. SUBSEQUENT MAJOR MILESTONES

After one complete playable Firefight journey:

**MegaWorld:** Import two genuinely distinct BSP regions, build a physically connected native world, prove player traversal in both directions, then integrate the normal asset and gameplay workflows into that connected world.

**Multiplayer and AI synchronization:** Verify a hosted native session, a second actual game client, shared map identity, movement and game state. Then test synchronized AI and Firefight, using the selected engine's real protocol instead of assumed universal compatibility.

**128-player ambitions:** Preserve this as an experimental community-engine target. A declared capacity or changed player-limit constant is not a 128-player acceptance. Require real load, network, gameplay and stability measurements.

**Creator-ready release:** Produce a clean-machine installation that can perform at least one complete native map-edit/build workflow using explicitly configured, legitimately installed external Halo tools.

## 8. NON-NEGOTIABLE ENGINEERING RULES

Work on the canonical source and existing implementations.

Do not create duplicate UI frameworks, asset engines, requirement databases, nested repositories, branches or worktrees.

Do not modify or delete original Halo games, maps, SDKs, ISOs, protected source assets, recovery history or previous-good builds.

Maintain exact source and artifact identity. Keep game files and temporary compilation in bounded isolated workspaces.

Never pretend that importing a file, displaying a preview, compiling a cache or launching an executable proves that the authored feature works in-game.

Do not change security protections or bypass licensing, ownership or native-build validation to force acceptance.

No push, release or public publication without authorization.

## 9. DELIVERABLES FOR EACH MAJOR CHECKPOINT

Return:

1. **One major new creator capability** that works through the real interface.
2. **A reproducible end-to-end acceptance** using real applicable Halo content and native tools.
3. **Independent output evidence**, not just internal application assertions.
4. **The exact runtime and asset compatibility boundaries.**
5. **Honest failed/unverified gates**, including what is required to prove them.
6. **An updated existing feature ledger**, preserving all original requirement identities.
7. **The next highest-impact missing creator capability**, not another cosmetic polish cycle.

Do not spend the majority of a checkpoint generating reports. The tests and documentation exist to prove engineering progress, not replace it.

## THE STANDARD

**Guilty Spark should be one doorway to everything needed to modernly mod Halo 1.**

If a feature is visible and advertised as working, its creator workflow must actually work.

If it requires conversion, guide the creator through the real conversion.

If it is unsupported, explain exactly why.

If it produces game content, verify the native artifact—and ultimately the game behavior.

**Make the tools work together. Finish the complete creator journeys. Prove the results.**