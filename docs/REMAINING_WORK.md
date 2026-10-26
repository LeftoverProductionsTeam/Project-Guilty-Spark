# Remaining work

> **Continuation 32 (2026-10-26):** Windows 0.3.1 builds and opens. 154 Rust / 41 frontend / 59 offline-script / 9 browser tests pass. Actual native arena editing, pointer placement/cancellation, tag edit persistence and selected-tag extraction were exercised. The first original Tool-compiled/playable map is still blocked by the missing kit and complete editable tags. World-material batch previews refused 24 requested images; one intermittent 3D-label `removeChild` exception remains unresolved. Use `CONTINUATION_32_ENGINEERING.md` and `MASTER_FEATURE_LEDGER.csv` for current evidence; the historical Phase 2/continuation lists below are retained.

> **Continuation 25 status (2026-10-26):** Native Halo Tool gameplay acceptance remains the highest-priority blocker. QuickForge now invalidates old Tool text logs after source edits and exports a path-free user-associated compiler triage JSON, but does not generate valid collision/portals/PVS or certify compiler execution. Keep `CONTINUATION_25_REQUIREMENT_TRACE.md` and `CONTINUATION_25_TEST_CARD.md` with this source. No Windows/Cargo/Halo Tool/gameplay testing occurred for this continuation.

Updated 2026-10-25 for Phase 2. Implemented inspection/editing does not complete the restoration. This list separates missing source data, target-engine work and tests not yet executed.

## 1. Resolve the faithful restoration blockers

| Work                                | Current evidence                                                                                                              | Completion condition                                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recover two missing event sounds    | Demo `scorpion` and `hill_occupied` ranges lie outside supplied `sounds.map`; related PC/MD tags do not supply matching bytes | Recover verifiable original audio or document an explicitly approved recovery-edition substitution/omission. Similar names/lengths are insufficient. |
| Recover damaged scenery placement 0 | Name index `5984` and type index `10704` are invalid; intended object unknown                                                 | Establish authored object/transform from reliable evidence, or record an intentional derivative deviation.                                           |
| Reauthor mixed-class placements     | Scenery palette has weapon references and a used `Hiding Marine` biped; diagnostic compile stops here                         | Preserve intended appearance/behavior using supported target placements and gameplay evidence.                                                       |
| Preserve zombie spawners            | Item collections lead to weapon triggers referencing vehicle containers with built-in actors                                  | Implement supported target behavior retaining the intended spawn cycle; do not delete the mechanism to get a clean compile.                          |
| Match historical resource sets      | Demo, PC and MD resource offsets differ; exact-byte deduplication does not establish semantic interchangeability              | Record correct source/resource identities and complete extraction for each retained candidate.                                                       |

The labelled recovery experiment extracted 2,823 retained tags after omitting two sounds, then failed all three diagnostic compile attempts. It produced no MCC cache. Faithful restoration and a modified recovery edition must remain distinguishable. See [audio and spawner evidence](ZOMBIE_AUDIO_AND_SPAWN_EVIDENCE.md) for exact hashes, commands, deviations and errors.

## 2. Complete a real build, package and game-load path

1. Resolve source defects/resources, then complete extraction and compilation without silently suppressing remaining errors. Validate the generated cache, output identity and resource completeness against the actual saved project.
2. Obtain an official unpublished Excession metadata template for the exact scenario. Extend checking against the applicable official schema, required shared metadata/images and version compatibility. No exact template or successful restoration package is available.
3. Exercise owned package installation, registration, rollback/removal and actual MCC enumeration. Record the official Steam anti-cheat-disabled selection and map load separately; a launch request or structurally valid cache is insufficient.
4. Test the restored loop: zombie spawning, actors, weapons, damage/death, pickups, placements, sound events and progression. Record deliberate adaptations and regressions. Collision rendering and menu audio preview do not replace gameplay observations.
5. For a native target, separately install/register a known compatible ChupathingyCE or OpenCE build with correct map family/resources. Registration and generic application launch do not deploy a map or prove product identity/playability. Add deployment/direct-map support only from verified runtime contracts.

Archived EXE/DLL execution, header relabeling, invented package schemas, stock-map substitution and simulated gameplay do not satisfy these conditions.

## 3. Execute multiplayer acceptance on two computers

- Establish a single-runtime, single-map baseline. Record exact engine build/network identifiers, deployed map/resource/package hashes, mode and validation on both computers.
- Follow [MULTIPLAYER_TEST_PLAN.md](MULTIPLAYER_TEST_PLAN.md): host/client roles, actor spawning/movement, damage, death/respawn, progression, disconnects and sustained sessions. MCC campaign co-op, MCC custom-multiplayer AI, native multiplayer and native campaign co-op require separate evidence.
- Do not infer MCC/native or mixed native-runtime compatibility from README claims or matching manifests. Unknown build/network/resource requirements remain blocked until resolved.
- Friends preflight performs local manifest comparison only. A passing report says **Manifests agree**, retains `gameplayVerified: false` and does not test networking. Imported declarations are self-reported.

**No two-computer MCC or native gameplay session has been executed.** [MCC_MULTIPLAYER_AI_FEASIBILITY.md](MCC_MULTIPLAYER_AI_FEASIBILITY.md) is research, not a working networked-AI extension.

## 4. Extend partial editors with auditable target support

| Area            | Implemented boundary                                                         | Still required                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| World           | Collision BSP and source transforms                                          | Textured render BSP, shaders/models, supported placement creation/deletion/scale and target rebuild validation                     |
| Tags/AI         | Audited field overlays and actor-variant/item/unit/spawner dependencies      | Complete actor definitions, encounter/squad/wave authoring and target semantics                                                    |
| Scripts         | Compiled signature/index inspection                                          | Script bodies, source authoring/decompilation where feasible, compilation and gameplay tests                                       |
| Assets          | OBJ import and geometry preview                                              | Texture/UV/material workflows, collision, glTF/animation and asset-to-Halo compilation                                             |
| Menu/audio      | Bounded embedded Vorbis inspection/preview with unavailable samples explicit | External-codec/resources, menu/widget rendering/behavior and in-game audio validation                                              |
| Compare/library | Decoded semantic differences and exact-byte deduplication                    | Semantic version grouping, placement matching across reordered arrays, deeper payload comparisons and reviewed restoration patches |
| Live Lab        | Disconnected status and rebuild fallback                                     | Real bridge/transport, capability negotiation, acknowledged commands, bounded failures and observed live edits                     |
| VR              | No runtime implementation                                                    | Supported OpenXR/runtime path, rendering/input and separate gameplay/network acceptance                                            |

Preserve unknown source bytes and distinguish unsupported/untested states as support expands. Disabled controls, upstream feature flags and mocks are not completed integrations.

## 5. Strengthen platform and release evidence

- Keep **21 unit / 8 browser** frontend results separate from native QA. Five browser tests use synthetic IPC; three cover browser boundaries/accessibility. Fresh native checks, real audio decoding and release-build evidence belong in [TESTING.md](TESTING.md) with exact tested scope.
- Run macOS/Linux CI and native smoke cases on those platforms. Verify runtime-specific installation/resource locations instead of assuming Windows results transfer.
- Add child-process-tree cancellation, bounded backup retention and interrupted file/index-update recovery. Attribute external tools/versions; process directories and timeouts are not an OS sandbox.
- Extend archive and large-cache formats with explicit limits and hostile-input coverage. Current ZIP preservation is bounded classic ZIP; nested archives, ZIP64 and other formats are not silently supported.
- Sign Windows binaries and verify clean install/upgrade/uninstall before claiming release readiness.

See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) for current boundaries and [RUNTIME_COMPATIBILITY.md](RUNTIME_COMPATIBILITY.md) for runtime evidence and restrictions.

## Continuation 3 - new source-level checks and unclosed release gates

See [the historical forum and ten-phase gap reconciliation](LEGACY_FORUM_RESEARCH_AND_GAP_RECONCILIATION.md) and [Continuation 3 change log](CONTINUATION_3_CHANGELOG.md). A local shader image matcher, cave-port alignment calculation, and imported-AI encounter/squad preflight were added and tested offline. The generated Halo CE mission and Firefight files are now dormant and require explicit reviewed activation; **none of these establish real map textures, collision-welded caves, valid compiled scenarios or synchronized multiplayer**. These release gates remain **OPEN**.


## Continuation 4 follow-up: new gates still open

Source-only cave-to-cave seam joining, uncompressed RGBA/BGRA DDS, TIFF source export and script ZIP staging are present as described in [`CONTINUATION_4_ENGINEERING.md`](CONTINUATION_4_ENGINEERING.md). None creates an actual connected Halo BSP with collision/portals/PVS, automatic `bitmaps.map` extraction, or a real compiled AI scenario. **Compiler builds containing cave tunnels remain blocked** until the room-cut/portal/collision gates are met. The full campaign, in-engine Firefight/Zombie Apocalypse, networked AI, authentic Halo resource renderer and remaining ten-phase features must still be implemented and tested against actual licensed fixtures.

## Continuation 5 engineering delta (2026-10-26)

QuickForge now offers independently toggleable grid and source-mesh snaps; proven exact cave rings can be aligned for the existing source-cap removal. Rectangular faces **align only**, and the Rust validator still blocks unverified solid-brush contacts. Tag Browser and QuickForge now exchange cache-provenance-bound tag reference/dependency JSON, **not binary tag data**, and World/Asset Workshop export indexed OBJ geometry for import to another asset project. This moves editor interoperability forward but does not close any game-level requirements. Outstanding critical tasks remain automatic bitmap/lightmap parsing, source reconstruction and collision/portal-safe BSP compilation, scenario/AI scripting integration, in-engine Zombies/Firefight, multiplayer AI replication, live server tests and every ten-phase release gate. Read `CONTINUATION_5_ENGINEERING.md` for exact acceptance criteria and tests.

## After Continuation 7: critical unsolved engineering gates

1. Complete **authentic native renderer resource decode** (all required Halo shader families, bitmap raw-data caches, lightmaps, sky/water/fog/particles and animation), and test against user-owned real caches.
2. Reconstruct **editable BSP source** from imported compiled map, including watertight terrain extensions and real cave-to-room Boolean cuts. Compile tested collision/portals/PVS/lightmaps and valid navigation; inspect Tool WRL outputs. Current source seam joins and walk sandbox are not equivalent.
3. Add scenario object/AI encounter tags, trigger devices, checkpoint/cinematic bindings, HaloScript compilation, then prove a start-to-finish First Contact run.
4. Rebuild Zombie Apocalypse in an actual supported engine, with verified actor spawns, scoring/waves and correct infection/survival rules. Test on multiple real clients with runtime-specific AI networking; never claim standard MCC synchronization.
5. Verify Windows Cargo/Tauri/React app builds, new external tool launching and generation-appropriate Tool commands. No binaries, owners' game tags or release installer were tested here.
6. Continue Halo CE bitmap/sound-backed themes and UI controls, guided Rocket Pistol edit-build-play, source sharing and PowerPC/Mac Demo export/hardware tests.

Keep the original 92-item requirements audit: no historical prompt item can be silently removed or marked implemented by a documentation-only change.

## Continuation 9: compiler-error recovery integration

Added read-only Halo Tool WRL 1.0 import/overlay and Tool-log classification, plus a duplicate-face safety gate in both UI and Rust validation. Still needed: automatic per-build WRL/log collection from isolated Halo Tool jobs; renderer-integrated selection of the implicated authored brush/triangle; geometric CSG fixes rather than merely annotating errors; live engine/Halo collision proof. These are *future* requirements, not shipped claims. See `CONTINUATION_9_ENGINEERING.md`.


## Continuation 10 open gates

- True Halo shader/bitmap/lightmap resource extraction and lighting fidelity remain unimplemented. Secondary compiled UVs and user-picked images are source preview improvements only.
- BSP source CSG, rooms/cave openings, collision/PVS/portals, scenario compilation and real in-game AI, Zombie Apocalypse and multiplayer remain blocked/unverified.
- GUI tool embedding into the Tauri renderer is not provided: native GUI tools run beside Spark. Only controlled CLI jobs and output can run inside its UI.
- Rust/Cargo compilation, Windows application, actual Halo Tool build and multi-client runtime verification are required.

## Continuation 11 result and open rendering blockers

Continuation 11 fixes local lightmap identity and shader-name ambiguity without changing map bytes. BSP lightmap address is now `(BSP index, page index)`, not merely a page number. The matching and UI code are covered by offline tests. **Still open:** decode genuine Halo bitmap tag/resource bytes and shader hierarchies, establish source/cached lightmap atlas relationships and color-space behavior using real owner-provided fixtures, and validate the result against the original game. Then proceed with importable BSP source reconstruction, collision and portals, playable scenario builds, native Firefight/Zombie Apocalypse and multiplayer AI synchronization. Reference: `docs/CONTINUATION_11_ENGINEERING.md`.

## Continuation 12 findings: historical scenario errors and environment fidelity

- **Source/preview vs engine**: Saved sun/ambient/sky/fog controls modify only the Three.js editor and a clearly non-compilable environment-intent handoff. Implement a runtime-specific sky/fog tag authoring workflow, sanctioned rebuild/radiosity and in-game evidence before claiming any atmosphere change is playable.
- **Legacy risk ledger**: Native and UI source preflight now reject same-mode duplicate spawns and conflicting class/path origins; advisory checks cover missing cache resources, unsupported multiplayer AI and excessive authored waves. Real spawn-clearance, resource dependency closure, collision accuracy, online joins and actual AI performance still require H1 Tool/Sapien and multiple client tests. See `docs/LEGACY_SCENARIO_FAILURES.md`.
- **Export integrity**: Native source export uses an isolated sibling staging folder with readback and JMS hashing; source code has Rust regression tests but no compiled/Windows confirmation. Test interrupted, permission-denied, invalid-JSON and concurrent export scenarios on Windows before accepting it as production-safe.
- **Unresolved original milestones**: automatic authentic bitmap/shader/lightmap extraction, editable imported BSP topology, room/cave CSG with verified collision/portals/PVS, First Contact compiled campaign, game-side Firefight/Zombies, replicated AI/networking and all original ten-phase hard gates remain OPEN. No earlier requirements have been removed.


## Continuation 13: multiplayer usability and native barriers

- Creator Studio now has a per-runtime private-session planner with read-only stock Halo CE multiplayer map inspection and hash proof, a custom design-only Game Type Workshop, session preflight, scenario objectives advisories, and isolated review-only source ZIP handoff. Test engine-specific multiplayer variant names and actual dedicated server `init.txt` startup on a real Windows CE installation. **No automatic hosting, join or player synchronization currently works.**
- A full native custom game-type editor needs a read-only, license-safe parser for the actual versioned CE `blam.lst` binary structure and verified checksum/CRC behavior before any savegame creation. Changing any design rule should invalidate prior native-variant confirmation. Never overwrite or silently patch an original game type.
- Record a real two-client playtest of map selection, rotations, stock modes and a user-created variant; add a separate, verified AI networking adapter before claiming networked Zombie Apocalypse. MCC is not interchangeable with old CE AI techniques.
- The original tutorial authors and source URLs are recorded in `ORIGINAL_FORUM_TUTORIAL_AUTHORS.md`; Academy lessons link out to those historical writers, separately from project-written guided exercises. Do not mark every creator as documented or claim archives are exhaustive.
- The earlier native blockers remain: accurate Halo bitmap/shader/lightmap decoding, editable imported BSP source reconstruction with collision and portals/PVS, playable campaign/First Contact, Firefight, AI multiplayer synchronization, legacy hardware/export and verified Windows/Rust/Tauri/Tool builds.

## Continuation 14: native Halo CE game-type data gates

- Source editor now handles all five stock Halo CE game modes and King hill marker polygons. It blocks two-point hills and invalid netgame usage IDs, and preserves compatible old usage-ID data. Drag-to-place polygons are authored source, not in-game scoring volumes.
- Review generated Invader `netgame_flags[*].type`, `.usage_id`, `player_starting_locations[*].type_0` setter names **against the installed invader-edit and chosen HEK generation**. Do not apply source plans to any existing scenario/tag folder until command contract and exact tool version are verified in an isolated staging root.
- Run the newly added `crates/spark-core/tests/quickforge_gametypes.rs` when Cargo is available, then real Halo Tool/Sapien builds and per-mode in-game gameplay tests. Record KOTH scoring and Crazy King selection, CTF spawn eligibility, Oddball placement, Race checkpoint progression, and Slayer starts. Current JS offline checks are not substitutes.
- Additional scenario authoring remains pending: native `race_vehicle`, teleporter channels, explicit game-object triggers beyond existing markers, weapon/item collection parity, scripting/campaign pathfinding, GPU shader fidelity, linked BSP collision/portals and two-machine synchronized multiplayer AI. See `CONTINUATION_14_ENGINEERING.md` and `BLAM_H1_MULTIPLAYER_SCENARIO_FIELD_GUIDE.md`.

## Continuation 15 status (2026-10-26)
Source-only native netgame flags now cover Race vehicle and linked teleport_from/teleport_to markers, plus CTF spawn eligibility checks and safe index-gap repair. This is not a completed Halo 1 compiler, collision/portal rebuilder, playable campaign, in-engine Firefight/Zombies or networked AI subsystem. No formerly unverified engine gate is closed by this change. See `CONTINUATION_15_ENGINEERING.md`.

## After Continuation 17: bitmap pipeline acceptance and critical remaining work

- **Bitmap 1 — native acceptance:** compile the `bitmap_preview` Rust tests and desktop action; inspect an actual owned internal DXT1/DXT3/DXT5 and 32-bit bitmap in Demo/PC/CE, compare pixels and alpha to Halo. Current coverage is only a bounded *first mipmap*; this is not complete texture support.
- **Bitmap 2 — resources:** independently verify original `bitmaps.map` resource index and source-cache dependencies using owned real fixtures before enabling read-only external metadata or raw-pixel reads. Verify paths and hashes, reject ambiguous types, and handle format mismatch conservatively. Stock PC art will remain largely untextured until then.
- **Bitmap 3 — full renderer:** decode other formats, images/sprites/cubes/mips, blend detail/bump/multipurpose layers and lightmaps with correct UV, gamma, sky, fog and transparency. Require in-game screenshot parity.
- **BSP, campaign and AI:** recover/author editable sources and compile valid room-to-cave collision, portals, PVS and AI pathfinding. Complete and playtest First Contact, actual Firefight/Zombies encounters and real multi-client AI state in a specific capable engine. Neither source scripts nor the walk sandbox prove these.
- **Runtime and QA:** native Windows/Mac/Linux compilation, independent Tool/Invader run receipts, multiplayer hosting/joining and network version verification, original-map non-mutation and rollback proofs.

## Continuation 18 — external bitmap resources

- Read-only index inspection and conditional, SHA-256-pinned external **raw first mipmap** reads are source-implemented for classic PC/CE only; require an exact unique path and enclosing indexed byte span. This is not general `bitmaps.map` tag-body extraction and may reject valid legacy resource layouts until tested against original resources.
- Must obtain legally owned, matching real `bitmaps.map` fixtures and verify resource type convention, path/index placement, flag usage, compressed pixel orientation, mip dimensions and native Rust behavior. Do **not** mark automatic stock resource decoding VERIFIED from synthetic tests alone.
- Full external `bitm` tag metadata, BSP lightmap pixels, transparent/additive/animated materials, sky/fog/water engine effects and full shader graph remain incomplete.
- BSP collision/portals/PVS, playable First Contact, in-game Firefight/Zombies and networked AI sync continue to be BLOCKED/UNVERIFIED.


## Continuation 19 — still-open core engineering gates

- Verify the source-only `sbsp` lightmap dependency parsing and non-zero page
  selection in a compiled Windows/Rust application against **original,
  owner-supplied** PC/CE maps and their matching `bitmaps.map`; compare textures
  and lightmap orientation with the Halo runtime. External tag *metadata*,
  swizzled bitmaps, cubemaps, MCC ipaks and full shader effects still need
  format-specific implementations.
- Replace repeated whole-cache reads with a single provenance-checked native
  batch decoder once original-map fixtures establish performance and safety.
  C19 deliberately caps serial previews at six operations per click.
- Reconstruct imported BSP edit source and prove real H1 Tool-compiled
  collision, cave openings, exact portals, PVS, sky/fog and radiosity.
- Compile and complete First Contact and genuine in-engine Firefight/Zombie
  Apocalypse. Prove real host/join, native variants and AI synchronization on
  multiple clients. None of these are delivered by C19's render preview.
- Native Cargo test/build, Tauri/Windows UI QA, map load and multiplayer
  acceptance require user-installed tools and legal local game files.

## C20 checkpoint: remaining critical proof and engineering tasks (2026-10-26)

C20 adds a read-only classic source-bitmap **batch** (1–24 distinct images, 16 MiB native top-mips and 64 MiB decoded RGBA per operation). This does not fix external `bitm` tag-body relocation, MCC ipaks, the Halo shader pipeline or actual engine radiosity. **First verify native Rust/Cargo and Tauri build** with exact user-owned map/resource fixtures, then verify first-mip orientation, DXT results and each BSP lightmap page against Halo. Any disputed pixel offset must fail rather than infer a resource. See `CONTINUATION_20_ENGINEERING.md`.

After this: implement the genuine BSP import/compile/collision/portal/PVS loop; run a playable Test Arena for all five CE modes with valid KOTH hill markers; restore Zombie Apocalypse triggers, waves/sounds and First Contact gameplay; verify Firefight and two-client multiplayer AI in each claimed target. Preserve original scenario failure context and explicit third-party permissions. Neither a successful source export nor a material preview meets the in-engine acceptance gate.

## Continuation 21 incremental gates (2026-10-26)

- New five-mode arena is a QuickForge source preset only. Validate native generated scenario commands against the actual Halo CE editing kit in an isolated tree, compile an authentic `.map` and verify all stock mode scores, CTF team spawns, four-corner KOTH scoring and moving hills, Oddball, Race and teleporting in-engine. Every case begins NOT RUN.
- New read-only BSP render preflight verifies internal material/UV/index consistency only. It does not prove valid collision, portals/PVS, source geometry topology, actual lightmap rendering, passable cave mouths, or successful Halo Tool compilation. No old SwordEdit/MotaLev corruption is automatically repaired by this report.
- Native Windows/Rust toolchains and owner-supplied game fixtures remain missing from this validation environment. Regression suites in Node are synthetic; run native unit tests, Tauri build and Windows UI checks before packaging a release executable.
- Preserve the 92-item requirements matrix and original prompts where obtainable, and do not label unverified engine targets as implemented. New release handoff: `CONTINUATION_21_ENGINEERING.md`.

## Continuation 22 research-derived acceptance gates (2026-10-26)

1. Validate on a Windows developer box: cargo unit tests, Tauri build, actual Halo Tool/Invader argument behavior; inspect missing or unsupported Rust compilation before declaring safe release.
2. Validate `tool structure` deferred cancellation and ten-minute soft timeout using an **isolated synthetic script fixture** or disposable generated tag worktree, never a real installed game's tags. Confirm that writers naturally exit and later phases remain stopped. Do not kill live Halo Tool writer to test this.
3. Check 32 authored Test Arena starts in Sapien, then a real CE 16-player test (do not assume it is needed for all personal maps), CTF wrong-team spawn behavior and all five modes. Record actual scored results and start locations.
4. Show real compiles: sealed source JMS, shader tag dependencies, BSP collision/portals/PVS, radiosity, compiled map hash, in-game first-person navigation and a second client. This is the **blocking milestone** before additional broad feature promises.
5. Native networked AI in stock H1 is not synchronized. Treat custom CE workarounds as engine-specific and not applicable to H1A MCC; OpenCE feature claims must be separately verified in a pinned engine build.
6. Review verified format-specific tag extraction and license before reusing MEK/Invader/Reclaimer/OpenCE binaries. Do not bundle third-party assets or claim lossless round trips.

Research and primary source citations: `ONLINE_RESEARCH_GAP_AUDIT_C22.md`.


## Continuation 23 — unresolved Halo BSP truth gates

- The new QuickForge coordinate-based manifold/boundary/winding/degenerate source audit is **not a real weld**, actual topology-union/CSG or geometry-to-portal compiler. It does not detect all T-junctions, self-intersections, material-driven holes, invalid lightmaps, fog plane or PVS conditions.
- Validate real Tool `structure`, WRL, closed collision, and spawned game objects against the first *compiled and Halo-loaded* Test Arena before accepting any existing BSP and original source geometry. Confirm native Rust/Cargo and Tauri first; they were not available for C23.
- Source-only safety improvements do not meet the original requirements for actual rendered bitmap/shader fidelity, resource body extraction, First Contact, Firefight/Zombies, two-client synced AI, VR, cross-platform and legacy-map parity.


## Continuation 24 — still-open acceptance gates

- **T-junction diagnostics:** bounded screen only; `tJunctionScanComplete=false` must remain visible and must not be mistaken for a zero-finding clean bill. No automatic weld, real plane intersection or BSP builder exists.
- **WRL brush matching:** user-selected imported compiler file can be matched approximately against current authored brush AABBs, but overlapping or changed sources must be rejected/invalidated; no validated compiler provenance or true triangle fault attribution.
- **Real level compiler:** correctly closed gameplay collision geometry, portal/PVS, shader/lightmap dependencies, scenario tag round-trip, `Tool structure` success and a playable map remain the immediate blocker.
- **Vision:** full Eschaton + SwordEdit replacement, Zombie Apocalypse, First Contact campaign, Firefight, online AI sync, Mac/CE/MD/Demo and MCC parity, split-screen/VR and the additional original 92 requirements are **still open**, not delivered by C24.

### Continuation 26 update

Safe source-only tunnel rim snaps and blocked uncut room walls; OBJ/JMS text-precision guards and independent OBJ structural output validation; user-owned SHA-pinned bitmap header previews in Interface Studio. **Not yet implemented/tested:** general source Boolean tunnel cuts; compiled BSP collision/portals/PVS, true lossless binary tag/BSP import/export; actual Windows/native Halo Tool/in-game proof; complete Halo UI sprite atlas panels. All prior remaining engineering tasks continue unless explicitly marked closed by evidence.
