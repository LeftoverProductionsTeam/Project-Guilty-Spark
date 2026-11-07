# PROJECT GUILTY SPARK
## ALL THE TOOLS, AND THEN SOME.
### November 7, 2026 — Original Vision Preservation, Arena Evolved Integration & Complete Creator Workflow Engineering

**MISSION: Build the ultimate all-in-one Halo 1 modding and creation suite. Preserve the original founder-approved vision, finish what already exists, and incorporate newly verified community developments without architectural drift.**

**Founding product definition:** Everything Halo 1 in one package. All the tools and all the glue, plus capabilities the original tools never offered.

Guilty Spark must let a creator open a Halo map, inspect and change anything supported, build environments and gameplay, integrate native tools, compile real game content, launch compatible engines, collaborate, record machinima, share creations and play with friends—all through one coherent studio.

**Primary slogan: ALL THE TOOLS, AND THEN SOME.**

Secondary messaging such as "One Halo. Every World. Every Tool. Together." and "Make Halo Yours" may support this identity. They must not replace its original product meaning.

This directive extends the existing project. It does not reset or replace any prior engineering prompt.

---

## 1. PERMANENT ANTI-DRIFT RULES

Before modifying code, inspect the actual local repository, current HEAD, Git status, existing source, active checkpoint and unfinished changes.

Consult these authoritative sources:

- `docs/MASTER_FEATURE_LEDGER.md` and its cumulative requirement CSV
- `docs/Master Engineering Prompts/`, including preserved prompts #04–#28
- `docs/ACTIVE_TASK.md`
- `docs/CURRENT_FEATURES.md`
- `docs/DOUBLE_ACTION_20261107.md`
- `docs/RUNTIME_INTEGRATION_20261107.md`
- `docs/ENGINE_SOURCE_ATLAS.md`
- Original Guilty Spark project discussions and founder-approved specifications available in the project
- The current source code, tests, native evidence and actual runtime behavior

The November 7 checkpoint records **475 cumulative requirement IDs and 25 numbered prompts**. Verify these against the actual local checkout. Historical counts such as 92, 122 and 398 are different snapshots or record types—not counts to add together.

Preserve every prior requirement, including unfinished requirements that current source code has not implemented.

Do not treat newer summaries as permission to discard older goals.

**Hard constraints:**

1. Spark remains an independent, MIT-licensed, open-source product.
2. Spark is the main creator workspace; engines and utilities are integrated through appropriate interfaces.
3. No single third-party engine, community project or external editor becomes a mandatory foundation for every feature.
4. Do not replace completed implementations with duplicates.
5. Do not create another competing project, editor, network stack, asset warehouse or build system when existing Spark systems can be extended.
6. Preserve the existing lightweight, RAM-first editing architecture, coordinated Save, durable history, source identities and guarded native compilation.
7. Preserve original Halo game folders, maps, assets, ISO/XISO files, SDK inputs, mods and user-selected runtime directories—even if they are inside the repository or unusually large.
8. Preserve Git history, stashes, recovery evidence, source backups and the accepted C49 release.
9. No automatic deletion based on file size or location.
10. No unapproved push, upstream PR, public release, installer replacement, security bypass or modification of original game installations.
11. Never label something playable, synchronized, compatible or production-ready solely because automated tests or native compilation passed.
12. Do not lose the founder's long-term ambition merely because one runtime currently cannot support it.

**Architectural rule: One creator workflow, many compatible native targets.**

---

## 2. NEW VERIFIED RESEARCH — HALO CE: ARENA EVOLVED

Research the newly discovered project:

https://github.com/PeterRichardsonGolf/Halo-CE-Arena-Evolved

https://github.com/PeterRichardsonGolf/Halo-CE-Arena-Evolved/releases/tag/v0.7.7-beta

Use the versioned source corresponding to the examined release and verify the latest release again before integration.

### Verified November 7 development

Arena Evolved 0.7.7-beta was released November 7, 2026.

It is an independent OpenCE-derived native Halo CE runtime that can use legitimately installed Steam MCC Halo CE multiplayer maps and Workshop content without converting them into another format first.

The release includes:

- Dedicated-server hosting, management and map rotations
- MCC, Workshop, Custom Edition and Xbox-disc-derived content support
- Map availability negotiation and map downloads
- Bot-populated multiplayer games and automatic human-seat replacement
- Server browser, map voting, moderation and administration
- Expanded gametypes, weapons, fireteams and bot behavior
- Cross-client interoperability on shared network protocol 41

The published compatibility notes describe gameplay with compatible OpenCE and ChupathingyCE clients.

**Critical distinction:** This is interoperability between compatible OpenCE-derived game runtimes, with MCC content support inside Arena Evolved. It does not demonstrate direct network crossplay between an unmodified MCC executable and OpenCE.

Different runtimes still require compatible maps, gametypes, network behavior and assets.

Arena-exclusive gameplay extensions are not automatically supported by ordinary OpenCE or Chupathingy clients. Matching custom content may be mandatory.

Arena Evolved 0.7.7 also documents an intermittent in-progress map-download join failure. Record and test this limitation rather than assuming downloads are reliable.

Its source is AGPL-3.0-or-later, while Chupathingy uses GPL-3.0-or-later and Spark uses MIT. Respect the exact provenance and licensing of every component.

**Do not copy AGPL engine implementation into Spark's MIT codebase or assume compatibility because the source is public.** Prefer independently implemented adapters, supported file formats, documented commands and separate executable processes. Any closer code integration requires an explicit licensing review.

### Engineering conclusion

Arena Evolved is a promising **additional first-class runtime target**.

It is not a replacement for MCC, OpenCE, ChupathingyCE, Faber, Mantle, or Spark's own editor.

Investigate which of its working capabilities Spark can safely expose through our existing runtime management and creator workflows.

---

## 3. IMPLEMENT ARENA EVOLVED AS A FIRST-CLASS SPARK RUNTIME

Reuse the existing runtime connection, profile, source catalog, launch, multiplayer and asset systems.

Known starting points include:

- `src-tauri/src/runtime_connections.rs`
- `src-tauri/src/runtime_workbench.rs`
- Existing runtime adapters and content-probing modules
- Existing Games & Tools and Online interfaces
- Existing map import, conversion, builder and native testing infrastructure

Identify the actual owning functions and call sites before making edits.

### Required capabilities

**Runtime discovery and setup**

Recognize a reviewed Arena Evolved installation without misidentifying another `halo.exe`. Inspect explicit release identity, executable and content paths, version information and applicable network compatibility.

Preserve OpenCE, Chupathingy, Faber, MCC and other existing runtime registrations.

Do not move or overwrite installed game data.

An unknown or unverified binary must not be silently trusted.

**MCC content integration**

Discover legitimately installed MCC Halo CE map and Workshop content through supported paths.

Distinguish source file identity, game-compatible format, resource dependencies, runtime ownership and online compatibility.

Do not interpret "Arena Evolved can load MCC assets" as "every OpenCE build can load every MCC map."

Reuse existing safe map cataloging, imports, source preservation and readback.

**Playtest integration**

Allow the creator to choose Arena Evolved as an eligible Build & Playtest target where native output is actually compatible.

Validate content readiness, target version and supported gametype.

Offer an explicit, reviewed launch action using the installed runtime. Preserve the normal Spark project and its history.

**Hosting and multiplayer**

Integrate compatible dedicated server discovery, hosting and join workflows into Spark's existing multiplayer hub.

Investigate server rotation, map vote, bot settings, server logs and administrative capabilities.

Use documented interfaces only. Do not invent command-line flags, APIs, memory addresses or runtime capabilities.

Preserve security boundaries and user consent for network/community services.

**Content distribution**

Investigate approved map sharing and verified downloads.

Preserve author attribution, original filenames where required, resource identity, bounded transfer checks and conflicting files.

Never assume a remotely advertised map or archive is safe. Validate downloaded content before offering installation.

**Deliverable:** One usable Arena Evolved runtime path that works through existing Spark screens, with explicit version-specific evidence and regression tests. If the installed runtime is unavailable, finish safe adapter-level code and tests, then leave gameplay acceptance pending.

Do not build a second multiplayer application.

---

## 4. FINISH THE ACTIVE DOUBLE ACTION — DO NOT ABANDON IT

The current high-priority engineering objective is already defined.

**Track A: Build a real original Halo multiplayer map.**

**Track B: Build and play the first physically connected MegaWorld.**

These projects must share the same editor, asset imports, native build system, source handling and runtime integrations.

### Track A — Original multiplayer map

Continue the existing:

**File → New → Multiplayer Map**

The accepted target is a creator-built two-base canyon map with editable terrain, road, bridge, ramps, cave, scenery, native weapons, a drivable Warthog, player spawns, CTF flags and King of the Hill objectives.

Use existing geometry and asset tools.

Verify Save, Undo/Redo, full application restart, native compilation and independent native readback.

Then require actual compatible game-client acceptance: map loaded by two clients; movement, combat, death, respawn, vehicle handling and Slayer/CTF/KOTH behavior verified separately.

The earlier CE boulder and Warthog imports prove valuable asset-authoring steps. They do not complete the original multiplayer map.

### Track B — MegaWorld: The Great Canyon

Continue the existing:

**File → New → MegaWorld**

First prove a **Timberland–Sidewinder** physical connection with:

- A vehicle-capable mountain road
- A separate infantry cave or tunnel
- Preserved original terrain and map identity
- Correct native collision, portals, materials and visibility
- Actual player traversal in both directions
- A Warthog driven across the connection
- A verified cross-region sniper hit

The existing combined H1A map compiles and passes independent readback, but the checkpoint still records **zero accepted physically traversable connections**.

Do not describe this as completed MegaWorld gameplay.

### Current Standalone blocker

The combined world and a smaller native control both encounter H1A Standalone exit code 1.

No common fatal cause has yet been established.

Investigate the installed kit, isolated runtime shell dependencies, missing UI resources and recorded log evidence using the existing bounded source-game preflight.

Do not assume the compiled BSP is faulty merely because Standalone exits.

Do not suppress the normal-exit acceptance requirement, fabricate a GUI result or bypass Computer Use permissions.

Preserve the exact compiled R17 artifact and its provenance.

If native-window approval or physical gameplay is unavailable, record that gate and continue independently actionable Track A/Track B source work.

Once two-region play is real, extend toward four regions and ultimately the founder's **19-map MegaWorld**.

Engine streaming, multi-BSP world management and 128-human-player multiplayer are separate research and gameplay milestones; none is proved by large map files, bot capacity or a successful cache build.

---

## 5. THE COMPLETE CREATOR SUITE REMAINS IN SCOPE

All existing feature families remain active requirements, subject to their original acceptance criteria.

### Maps, tags and assets

Provide an Eschaton/HMT/Assembly-quality tag experience integrated with SwordEdit/SparkEdit/Sapien-style world authoring.

Support safe typed field, reference and reflexive editing; dependency-aware native import/export; compatible map cache changes; and supported loose-tag rebuilds.

Allow real cross-map and cross-runtime asset drag-and-drop with automatic dependency resolution and explicit conversions where necessary.

Preserve original assets, native tag behavior, animation hierarchy, texture coordinates, materials, sounds, scripts and collision.

### 3D world creation

Maintain and expand genuinely editable terrain, BSP, vertex/edge/face operations, rooms, architecture, terrain sculpting, caves, tunnels, material painting, shader/bitmap workflows, lighting, fog, weather, water, portals, visibility and lightmaps.

A wireframe or reconstructed mesh preview alone does not prove a usable native world editor.

Imported compiled BSPs must not be advertised as structurally editable until the actual editing/building route exists.

### Gameplay and gametypes

Create, configure, compile and test native Slayer, CTF, King of the Hill, Race, Oddball, territories, team objectives, weapons, vehicles, teleporter placement, scripts and other compatible game mechanics.

Preserve the goal of custom gametype creation instead of merely selecting a predefined mode.

### Zombie Apocalypse

Restore the original Zombie Apocalypse project faithfully, including its native asset dependencies, animations, spawning/release behavior, weapons, encounters and intended gameplay.

Deliver actual playable survival combat, not merely an actor spawn test.

Target compatibility with selected engines through explicit conversions and verified runtime capabilities.

### Firefight, AI and co-op

Complete host-authoritative AI encounters, movement, targeting, damage, deaths, score, waves, cleanup, rejoin and late-join behavior.

Differentiate local actor simulation from remote peer synchronization.

Investigate and deliver real shared Firefight encounters and custom campaign co-op through supported runtime interfaces.

Preserve the six-player co-op ambition as an engineering target, not a claimed existing capability.

### Extraction gameplay

Retain the founder's Marathon-style Halo extraction experience.

The intended creator workflow should eventually support:

- PvE/PvP encounters
- Deployable player objectives
- Loot, inventory and extraction mechanics
- Appropriate persistent progression
- AI-controlled opposition
- Multiplayer session state
- Authorable maps, events, scripts and gametype rules

Implement through native or explicitly supported runtime extensions. Do not misrepresent ordinary Halo 1 gametype flags as a completed extraction system.

### In-game live creation

Preserve Spark's goal of live modding in compatible runtimes.

Creators should ultimately be able to select supported live game objects, inspect properties, modify them, validate results, persist edits and synchronize intended changes without destroying the active match.

Use version-specific, permission-aware engine interfaces. Do not employ indiscriminate memory patching or bypass MCC's protections.

Preserve offline, local and safely supported multiplayer editing modes.

### Machinima and recording

Complete Recording Director, free camera, detachable views, shot/take management, capture, animation and event tools.

Integrate with compatible native engines while retaining Spark-owned project and recording metadata.

### Multiplayer and community

Preserve the integrated game browser, direct join, dedicated server management, map downloading, map voting, custom matches, split-screen on PC and multiplayer creator workflows.

Research 128-player human gameplay and large connected worlds as explicit long-term runtime engineering, not an extrapolation from Arena Evolved bot counts.

### Platform independence

Preserve Windows, Linux and native Apple Silicon goals.

Restore the useful Halo Mac Demo, Halo Full and HaloMD editing experience as a first-class part of the product.

Retain Xbox, Gearbox PC retail, Custom Edition, MCC, OpenSauce, OpenCE, ChupathingyCE, Faber, Mantle and other supported/runtime-research targets.

Use one common Spark experience with truthful target-specific capabilities.

No proprietary Halo tag extensions. Use standard native content and explicit Spark sidecars when project-only metadata is needed.

---

## 6. RESPECT AND COLLABORATE WITH THE HALO COMMUNITY

The project stands on decades of contributions from the original Xbox, Halo CE, MacGamingMods and modern Halo modding communities.

Recognize the work of Milenko and the ChupathingyCE contributors, OpenCE maintainers, Arena Evolved developers, Invader, Baboon, community editors and the original modding pioneers.

Inspect upstream documentation and contribution requirements before preparing changes.

**Collaboration principles:**

- Spark remains independently useful.
- Share genuinely reusable bug fixes and improvements upstream where appropriate.
- Respect existing protocol, licensing, platform and contributor requirements.
- Keep upstream changes focused, reviewed, understandable and tested.
- Do not submit huge unreviewed AI-generated PRs.
- Do not make acceptance of an upstream PR a prerequisite for Spark's own development.
- Never present upstream code or research as an original Spark invention.

Where Chupathingy features require its Delta protocol, inspect the documented extension and compatibility mechanisms before designing an adapter.

Preserve crossplay and fallback behavior.

Do not change another project's network wire protocol or compatibility requirements without upstream coordination.

---

## 7. PRODUCT UX — ONE STUDIO, NOT A TOOL LAUNCHER

Audit the actual user experience against the founder's original promise.

A new modder should be able to discover and complete useful work without learning a collection of disconnected programs.

An advanced user must retain detailed native controls, exact values, diagnostics and specialist-tool access.

Reuse existing Spark navigation, compact UI conventions, editable workspaces, asset browser, Inspector, Game & Tools screens and Learning Center.

All supported actions should be discoverable, usable, saveable, undoable where appropriate and testable.

Preserve multiwindow ownership, authoritative Undo, crash recovery, saved layouts and actual project state across restart.

Do not hide working features, replace productive workflows with decorative cards or create dead buttons.

A complete feature needs its real UI path, backend operation, native output and the appropriate acceptance evidence.

---

## 8. ACCEPTANCE MATRIX AND SAFETY

For every substantial feature, keep these evidence levels distinct:

**A — Source exists:** Code or schema is present.

**B — UI works:** The real user interaction reaches the correct native operation.

**C — Native output verified:** Standard game content compiles and independent tools validate the result.

**D — Game runtime verified:** The exact generated result loads and behaves correctly in the selected compatible engine.

**E — Multiplayer verified:** Multiple actual clients agree on the relevant behavior, including lifecycle and failure cases.

**F — Product acceptance:** Usable creator workflow, persistence, recovery, documentation and appropriate platform/release validation.

Do not promote a feature based on an unrelated level.

For Arena Evolved specifically, test supported stock gametypes separately from its custom gametypes and packs, and distinguish:

- MCC content availability
- Native AE game launch
- AE-to-AE multiplayer
- AE-to-compatible OpenCE multiplayer
- AE-to-compatible Chupathingy multiplayer
- Map transfer and join recovery
- Native server hosting
- Actual game AI/physics results
- Live editing, if and when a supported interface is established

Record exact executable/build/network versions and content fingerprints.

Never imply that unmodified MCC multiplayer crossplay was tested unless it really was.

Use disposable, owned build/staging outputs. Keep source and original game installs unchanged. Guard all file operations, validate external content, preserve rollback ability and refuse unsafe writes.

Never bypass anti-cheat, system security controls, application approvals or engine access restrictions.

---

## 9. EXECUTION ORDER — DELIVER WORK, NOT ANOTHER AUDIT

**This is an engineering execution directive, not a request for a documentation-only research report.**

Begin by briefly reconciling the actual checkout with its existing active engineering objective. Do not spend the session rebuilding inventories already present.

Then:

**First:** Continue the unfinished Double Action implementation. Resolve independently actionable authoring defects and maintain the legitimate Standalone/gameplay gate.

**Second:** Research and implement the smallest complete Arena Evolved runtime integration through Spark's existing runtime/profile/orchestration architecture. Avoid a parallel launcher or engine subsystem.

**Third:** Prove an actual end-to-end Spark workflow against an installed eligible engine. Prefer a small real Halo map/gameplay test with measurable evidence over a large unverified implementation.

**Fourth:** Continue advancing existing unfinished creator, live-edit, multiplayer, Zombie Apocalypse, Firefight, MegaWorld and cross-platform requirements in dependency order.

When blocked by unavailable game hardware, GUI approval, another player, unsupported engine functionality or an upstream decision, preserve that gate and continue safe, independent work.

Do not repeatedly rerun the same failed experiment without a new diagnostic hypothesis.

Do not claim a prototype succeeded because a test harness accepted its own simulation.

Use existing tests and native acceptance tools. Add regression tests to the relevant owners, not competing QA frameworks.

Make real scoped source changes, run applicable checks, verify original-file preservation and commit accepted local progress without pushing or publishing.

### Required final checkpoint

Report concisely:

1. Starting and ending commit/working-tree state.
2. Actual functions and workflows changed.
3. Concrete user-visible improvements.
4. Tests and native game operations actually performed, including failures.
5. Exact remaining blockers and human acceptance requirements.
6. Any upstream licensing, protocol or contribution issues.
7. Evidence that the 475 existing requirement IDs and 25 preserved prompts remain intact.
8. The next actionable engineering objective.

Do not mark a feature finished until its specific acceptance criteria pass.

Do not sacrifice the founder's full feature set to make the current milestone easier.

**We are building a complete Halo creation studio that brings the best of the community together, preserves twenty-plus years of modding history, and gives creators capabilities the original tools never had.**

**PROJECT GUILTY SPARK**

**ALL THE TOOLS, AND THEN SOME.**
