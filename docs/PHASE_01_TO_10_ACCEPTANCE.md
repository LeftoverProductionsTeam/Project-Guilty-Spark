# Project Guilty Spark — Ten-phase acceptance and limitations (2026-10-25/26)

**Current delivery:** Cumulative source updated through Continuation 25, directly based on the SHA-verified Continuation 24 full-source ZIP. C25 adds source-bound compiler-log staleness and sanitized Tool/WRL triage; no new native/compiler/gameplay acceptance gate was closed. Earlier C19 findings remain historical baseline evidence, not current completeness claims. The historical table was written in Continuation 3; all entries are cumulative, not replacements. This remains a source-only engineering snapshot, not a completed ten-phase product, installer, multiplayer server, or verified Halo gameplay build.

## Ten-phase status, explicitly separated from gameplay proof

| Phase | Major requested scope | Evidence in this source ZIP | Truthful status |
| --- | --- | --- | --- |
| 01 — Foundations | Preserve and identify Halo archives/maps; create projects and source hashes | Existing bounded cache reader, SQLite library, immutable source copies | PARTIAL, untested this turn in Windows |
| 02 — Editor & restoration | Tag editor, asset previews, Halo Demo/Zombie Apocalypse restoration | Existing Tag Editor, sound and model inspection, restoration investigations | PARTIAL, full historical restoration blocked |
| 03 — QuickForge | Original map geometry, brush builds, game modes, Firefight/Zombies | Room/ramp/JMS pipeline plus new terrain sculpting and hollow tunnel; deterministic Firefight simulation and new HSC wave exporter | PARTIAL; no compiled in-engine waves or Zombies game mode |
| 04 — Living Workbench | True 3D Halo BSP, textures, campaign, cinematic, smart assets | Existing bounded actual BSP and model render; new local DXT1/3/5 user-supplied texture previews, project-backed mission and cinematic HSC authoring with dormant activation and read-only scenario-binding checks | PARTIAL; C17 internal top mip and C18 bounded indexed external-raw preview under exact source/resource SHA constraints; external tag bodies, full lightmaps and playable campaign remain absent |
| 05 — Finish the Fight | Verified game build, gameplay, QA and release | Build receipts, regression scripts, new offline tests and source-pack validation | BLOCKED on real compiler/toolchain and installed Halo runtime tests |
| 06 — Great Reclamation | Toolchain fabric, legacy source/tools, Academy tutorials | Runtime-aware HEK/H1A/Invader adapters, native tool inventory, 16 guided Academy lesson paths and an attributed forum tutorial index | PARTIAL; verified integrated native Tool operations and full end-to-end tutorials remain missing |
| 07 — Reality Forge | True BSP editing, source-to-game, collision, terrain & caves | New editable QuickForge heightfield/tunnel meshes and tests; **compiled BSP geometry remains read-only** | PARTIAL; CSG/welding/collision/portals/PVS/navigable game map unimplemented |
| 08 — LAN Party | Packages, friend multiplayer, server management, game networking | SHA-256 package proof, read-only CE map scan, custom game-type design workshop, safe stock CE init.txt and portable private-session handoff | PARTIAL; native blam.lst writing, verified server launch/join, full game-type editor and networked AI remain missing |
| 09 — Combat Evolved | Native game-derived art/sounds, Theme Forge and polish | Four Halo-inspired palettes, local audio, BSP UV/lightmap-preview mapping with disambiguation, external named-authored tutorials | PARTIAL; a limited internal + uniquely indexed external-raw bitmap top-mip preview is authored; full external tag decoding, shader simulation and visual parity remain missing |
| 10 — Time Machine | Mac Demo/G4 map export/bridge and legacy compatibility | Existing version-aware inspection and published capability matrix | BLOCKED; no PowerPC exporter and no G4 hardware game proof |

**Do not reinterpret PARTIAL as feature complete.** All original 92 granular requests and the requirement-by-requirement evidence remain in `ORIGINAL_92_REQUIREMENTS_RECONSTRUCTION.md` and `PHASE3_10_FEATURE_TRACEABILITY.csv`. Earlier full verbatim Codex prompt bodies were not all recoverable, so the 92-row document is a documented functional reconstruction, not a literal 100%-verified transcript of all ten prompts.

## New implemented and testable code

1. `src/haloDds.ts`: bounded and tested top-mip DXT1/BC1, DXT3/BC2, DXT5/BC3 texture decode from a user-selected DDS. Rejects DX10, unsupported format, truncation and excessive allocation.
2. `src/haloTexture.ts`, `src/components/World.tsx`: manually assign local DDS/PNG/JPEG/WebP to real BSP material shader tag IDs. Preview only; files remain on the user's machine, not serialized into projects. Continuation 3 adds exact local file-name mapping to bitmap-tag dependencies without guessing. No real shader/lightmap or automatic source cache extraction.
3. `crates/spark-core/src/quickforge.rs`, `src/terrain.ts`, `src/components/QuickForge.tsx`: editable heightfield terrain with raised/lowered/flattened/smoothed cells, and a manifold annular tunnel primitive. Source geometry is authored under QuickForge; original compiled BSP caches are **never** rewritten. A tunnel connected to a room/map still requires CSG, collision, portals and compile proof.
4. `src/haloScript.ts`, `src/components/CreatorStudio.tsx`: export Halo 1 mission, cinematic and finite Firefight `.hsc` files with scenario-binding dependency manifests. Manual beats are gated on explicit `gs_complete_N` commands; AI waits for positive live counts before clearing. These files are **not** HaloScript-compiled or deployed to a game.
5. `src/sourceZip.ts`: deterministic strict small ZIP creation for one-click download of `.hsc` plus manifest JSON. Source-only and has no ability to modify a game install.
6. `crates/spark-core/src/creative.rs`: optional trigger volume, timer and camera marker fields; project persistence validated. Creator Studio stays outside compiled-cache fingerprints because it is not yet consumed by the game build, preserving old build receipts.
7. Tests added: `scripts/test-dds.mjs`, `scripts/test-terrain.mjs`, `scripts/test-haloscript.mjs`, `scripts/test-source-zip.mjs`, `crates/spark-core/tests/terrain_caves.rs` (the Rust tests **not executed here**).

## Current validation evidence

- Baseline smoke test: **PASS** (24 offline checks), with no game files needed.
- New DDS, terrain, HaloScript, ZIP, shader mapping, cave join and scenario binding suites: **PASS** when run with installed Node 22 TypeScript strip-types.
- TypeScript syntax parsing/transpilation of `src/**/*.ts(x)`: **PASS** (parsing only, **not** a full dependency-resolved typecheck).
- Independent JS/Python geometry topology reproduction: terrain and tunnel have zero open, nonmanifold, or degenerate edges on the specified fixtures. **Not a Rust runtime/game collision proof**.
- Rust `cargo test`, actual HCEEK `tool.exe`/Invader compile, browser/Vite/Tauri build, GPU/UI screenshots, Halo runtime, PowerPC G4 and 2+ game clients: **NOT RUN**. Rust/Cargo and project NPM dependencies unavailable in this execution environment.

## What would make the ten-phase claim true?

Build a real user-approved tag/compiler pipeline that stages source data, generates the intended scenario AI/animation/BSP/lightmaps/collision, compiles against the intended licensed engine version and proves loading on that engine; recover the original Zombie Apocalypse/First Contact data and validate gameplay; test network state across two real clients (including AI), add managed server lifecycle, portable mod package rollback and authentic UI art/audio asset extraction. Only tests against the target versions and user-owned game data can raise those from BLOCKED to VERIFIED.

## Safety and license guardrails

Never overwrite `.map` in Halo installation, modify MCC's anti-cheat, open firewall ports, add permanent game service, execute remote admin, redistribute Halo textures/sounds or include unlicensed third-party source. All new exports are opt-in, sanitized, local source files and include `gameplayVerified:false` receipts.

## Continuation 3 research and preflight corrections

See [`LEGACY_FORUM_RESEARCH_AND_GAP_RECONCILIATION.md`](LEGACY_FORUM_RESEARCH_AND_GAP_RECONCILIATION.md) and [`CONTINUATION_3_CHANGELOG.md`](CONTINUATION_3_CHANGELOG.md) for old forum tool references, ten-phase/later gaps, code changes, and hard source-to-game gates. Corrected H1 dormant script syntax; source-only texture/binding/cave checks are **not** compiled gameplay. Rust/Windows/manual engine gates remain open.


## Continuation 4 — measured delta (2026-10-26)

**No phase has been promoted to complete.** Phase 03/07 now include actual source mesh cap removal for strictly matched cave-to-cave rims, with `TUNNEL_SOURCE_SEAM` provenance, manifold source tests and an explicit build blocker for unimplemented room CSG/collision/PVS/navigation. Phase 04/09 now include local DDS DXT1/3/5, RGBA8/BGRA8 decoding and bounded TIFF 6.0 source export, independently decoded for alpha and colors. Phase 04/05 now include a reviewed HCEEK `data/.../scripts` ZIP for singleplayer mission/cinematic/finite AI wave **source** only, not compiled tags. Phase 08 network AI remains BLOCKED on real engine code and two-client evidence. Read [`CONTINUATION_4_ENGINEERING.md`](CONTINUATION_4_ENGINEERING.md) for full changes and remaining work.

## Continuation 5 — source-only snaps and cross-map exchange (2026-10-26)

**Still no fully completed phase.** Based on the exact Continuation 4 ZIP, Phase 03/07 now add *toggleable grid and authored-mesh placement snapping*: cardinal rectangular face alignment and exact topology-checked cave-rim alignment. Only the existing cave-rim source-cap removal is an actual source mesh join; all rectangular contacts and cave-to-room BSP connections still fail gameplay readiness. Phase 02/04/06 now add SHA-256-bound tag/dependency reference exchange between two preserved maps, and a documented isolated Invader extraction argument plan. This exchanges reference **metadata**, not extracted `.tag` payloads. Phase 04/09 add opt-in real BSP/static-model/OBJ Workshop mesh export and cross-project OBJ re-import with UV/normals and shader ID provenance, but **no native BSP import/compile**. Phase 05 gains three regression suites and an independent OBJ reader check. Phase 08's live multiplayer AI and Phase 10's legacy G4 exporter remain blocked. All other rows and 92 original reconstruction requirements remain active.

See [`CONTINUATION_5_ENGINEERING.md`](CONTINUATION_5_ENGINEERING.md) for file-level changes, test evidence, source/engine distinctions and the acceptance sequence.


## Continuation 6 — source mesh alignment/welding and actual tag staging (2026-10-26)

**All ten phases still remain PARTIAL/BLOCKED as described above; no feature is promoted to verified gameplay.** Phase 02/06 adds optional real Invader `.tag` + dependency extraction for preserved source cache files, and exact engine/version plus source-file-hash-bound staged copying between distinct local projects, without any scenario edits or installation writes. Phase 03/04/07 adds optional face/vertex assembly and open-boundary welding of imported OBJ meshes with UV, winding, topology and material checks; a Halo 1 JMS 8200 source exporter and watertightness gate; and an in-editor combined-mesh preview. Earlier independently toggleable G (grid) and M (authored mesh) snapping remains intact.

**Still blocked:** automatic genuine Halo bitmap/lightmap/shader rendering, compiled BSP and cave-to-room CSG, First Contact playable campaign/AI/cinematics, in-engine Firefight/Zombie Apocalypse, 2+ client AI/networking, compatible engine installers, complete historical archive restoration, Halo-classic Theme Forge, and Mac G4. The new native Invader backend, Rust tests, Windows/Tauri build, HCEEK compilation and gameplay are not executable/verified here. See [`CONTINUATION_6_ENGINEERING.md`](CONTINUATION_6_ENGINEERING.md) for exact safeguards, source deltas and acceptance.

## Continuation 7 - live authoring, terrain collision simulation, toolkit routing and Academy (2026-10-26)

**No phase is marked complete or game-verified by this snapshot.** The exact baseline is Continuation 6. New inspectable code improves Phase 03/07 through exact-heightfield terrain source seam removal, toggleable terrain-border Mesh Snap (M), and first-person source-triangle collision/gravity preview rebuilt when QuickForge geometry changes. Phase 06 gains runtime-aware HEK vs H1A tool selection, guarded native external GUI launch, correct generation-specific Tool arguments, and nine task-based Academy lessons. Phase 09 gains additional descriptive hover/focus help and an in-editor Halo vocabulary glossary. Phases 04, 05, 08 and 10 remain blocked on authentic source import/compilation, playable scenarios, real engine networking and legacy target hardware.

`src/liveCollision.ts` is **not** the Halo physics system. `TERRAIN_SOURCE_SEAM` / cave source joins do **not** certify collision tags, portals, PVS or nav data. `toolchain_inventory`/GUI launch have not been tested with actual Windows executables. `cargo test` and full Tauri/Vite build not run here. See [`CONTINUATION_7_ENGINEERING.md`](CONTINUATION_7_ENGINEERING.md), [`HALO_MODDING_PHILOSOPHY_AND_ACADEMY.md`](HALO_MODDING_PHILOSOPHY_AND_ACADEMY.md) and [`CONTINUATION_7_TEST_CARD.md`](CONTINUATION_7_TEST_CARD.md) for explicit acceptance tests and code locations.

## Continuation 8 — input, usability and safe source-data preflight (2026-10-26)

**No phase promoted to completed or gameplay-verified.** Phase 03/07 usability now adds Unreal-like viewport RMB+WASD flight with bounded camera math and mouse release, while retaining independently toggleable grid/mesh snaps and selected-object colored XYZ transforms. Phase 03/05 now adds same-document geometry/validation evidence gating for QuickForge build/source export; Phase 04 source interchange rejects incomplete UV/normal OBJ buffers and malformed triangles. Phase 06/09 adds the tenth Academy lesson and contextual hover help. Existing authored terrain/cave mesh seams and local source-collision walk preview remain non-gameplay source simulations. The real imported BSP editing, automatic Halo resource decoding, valid BSP/portal/collision rebuild, First Contact, in-engine Zombie Apocalypse, multiplayer AI and legacy G4 export blockers remain as listed above.

See [`CONTINUATION_8_ENGINEERING.md`](CONTINUATION_8_ENGINEERING.md) and [`CONTINUATION_8_TEST_CARD.md`](CONTINUATION_8_TEST_CARD.md). Original 92 granular requirements remain active and historically incomplete prompt bodies are not represented as fully recovered.

### Continuation 9 update — 2026-10-26

- **Phase 3 / QuickForge collision checks:** Added independent coordinate-based duplicate-face detection, tiny-edge warnings, and mirrored native validator checks. **Source implementation; native compile and real Tool verification pending.**
- **Phase 5 & 7 / Debuggability and quality gates:** New VRML 1.0 WRL read-only error overlay, local Tool log classification, and stale-evidence rejection. **Node tests pass; real Windows editor rendering and actual Tool diagnostic compatibility pending.**
- **Phase 6 / Modding Academy:** Added an eleven-lesson Tool error/repair/rebuild tutorial with action descriptions and clear tooltips. **Source implementation and offline checks; hands-on UX validation pending.**
- **Phase 8 / Playtest Lab:** WRL and compiler output can be reviewed locally, but automated native game launch/QA evidence remains **incomplete**.
- **Phases 4, 9, 10 and uncompleted aspects of phases 1–3, 5–8:** All previously reported gaps remain open, including genuine automatic Halo resource decoding, arbitrary BSP CSG/portal rebuilding, playable scripted missions/Firefight/Zombies, multiplayer AI, and tested legacy export. **The ten phases are NOT completed.**

See `CONTINUATION_9_ENGINEERING.md` and `ORIGINAL_92_REQUIREMENTS_RECONSTRUCTION.md` for the verified scope and remaining work.


## Continuation 10 additional coverage — NOT a completion certification

- **Phases 1–2:** First-run preservation workflow and sourced community credits added; actual older map format/runtime tests still required.
- **Phase 3:** QuickForge existing editable primitives/collision sandbox retained, but still no compiled playable arena acceptance.
- **Phase 4:** Creator/cinematic source authors retained; no playable campaign compiler proof.
- **Phase 5:** Explicit truthfulness and QA evidence strengthened; Windows and gameplay release gates outstanding.
- **Phase 6:** Select compatible tool per runtime; inspect configured binary inside Spark and run bounded Invader `-i`. Command-line build/extraction in managed workspaces, GUI external beside Spark.
- **Phase 7:** Real secondary BSP UV stream parsing and manual lighting preview. Imported BSP rebuild and gameplay validation blocked.
- **Phase 8:** No new multiplayer wire protocol or synchronized AI; two-client proof still blocked.
- **Phase 9:** Community history/credits and onboarding polish; **not** authentic Halo menu bitmap/sound import or full Theme Forge.
- **Phase 10:** No new PowerPC/G4 build/test; legacy export gate unverified.

**The requirement matrix remains open.** See `CONTINUATION_10_ENGINEERING.md` for testable acceptance and remaining issues.

### Continuation 11 (BSP-specific materials and tutorial)

Phase 4/9 preview correctness advances: the local lightmap loader now keys pages by **both** BSP index and cached page index, refuses ambiguous filename-only assignments, uses only actual validated secondary UVs and refuses to substitute bump/detail textures for base color. Phase 6/Academy adds a guided lightmap and shader lesson. New offline tests cover these correctness properties. **Status stays PARTIAL**: there is no native Halo bitmap decoding, complete shader parity, imported BSP recompilation, collision/portal proof, playable campaign, runtime Firefight/Zombie Apocalypse, or multiplayer AI synchronization. The full ten-phase work remains open.


## Continuation 12 — scenario reliability, fog and lighting authoring (2026-10-26)

**No phase promoted to completed or engine-verified.** Phase 3/7 extends QuickForge with live bounded sun/ambient/linear fog authoring, a saved optional profile shared with the native schema, source-only environment handoff JSON and an isolated transactional JMS source export. Phase 2/5 adds preflight checks against overlapping eligible spawns and inconsistent tag source identity; extra advisories cover missing resource maps, Firefight spawn budgets and unresolved MP AI. Phase 6/9 adds 2 tutorial paths and legacy editor failure research. A read-only lighting/fog comparison also exists in World Editor. Native build, automatic cache texture extraction, valid room/cave collision rebuild, campaign, true Firefight/Zombie Apocalypse and networked AI are still **BLOCKED/UNVERIFIED**. Read `CONTINUATION_12_ENGINEERING.md` and `LEGACY_SCENARIO_FAILURES.md`.


## Continuation 13 acceptance — multiplayer and historical Academy

- **Verified offline:** new stock Halo Custom Edition `scenarioType=1` / cache-version-609 source map inspection filters; rules/name/rotation preflight; safe custom design persistence and required native game-type confirmation; source-only scenario objective suggestions; source-only private server ZIP; original named forum author index; strict TS core checks.
- **Only designed, not executable:** the Game Type Workshop rules are saved design intents. Halo CE custom variant `blam.lst` bytes are not created or altered. No network server or port is opened. A user declaration that they saved a variant in Halo is not proof the binary is valid.
- **New manual test:** in the Windows desktop app register Halo Custom Edition, scan its installed maps, choose a hash-verified multiplayer map and stock Slayer, export the *review-only* private-session ZIP. Compare its SHA-256 and `init.txt`; test on a separately configured authorized dedicated server and two real clients.
- **Still open for all phases:** native Rust/Tauri compilation; real Halo runtime rendering; collision/portal-safe imported BSP editing and cave connections; complete scenario compilation; native AI Firefight/Zombie Apocalypse; multiplayer AI synchronization; original Mac Demo PowerPC export.
- **Sources:** `docs/CONTINUATION_13_ENGINEERING.md`, `docs/ORIGINAL_FORUM_TUTORIAL_AUTHORS.md`, original source audits and historical links.

## Continuation 14 — Blam netgame flag groundwork (not phase completion)

- **Phase 03 / QuickForge:** Added all-five-classic-mode source readiness matrix, drag-and-drop King hill convex polygons, per-marker edits and editor-only visuals. Source-only React logic and Node regression tests pass. No real collision scoring volume has been built.
- **Phase 05 / failure prevention:** Rust source command planner now rejects unsafe KOTH and repeated/out-of-range CTF/Oddball/Race usage IDs, and preserves legacy QuickForge markers. Added Rust integration tests but **did not run them** because Cargo is unavailable here.
- **Phase 06 / Academy:** Added the hands-on multiplayer objective lesson, glossary and attributed Xzzy/HEK research references. Tests for lesson data pass; real user walkthrough not performed.
- **Phase 07–08 / runtime and multiplayer:** The source-oriented readiness checklist is surfaced in the multiplayer planning workflow, but neither native custom game-type binary creation nor Halo server start/join, multiplayer AI replication or real game testing is implemented.
- **Phases 01–02, 04, 09, 10:** Existing source work remains; no full phase is certified complete and no prior blockers have been retired. See `CONTINUATION_14_ENGINEERING.md`.

## Continuation 15 update (2026-10-26; source baseline Continuation 14)

Phase 3/8 source-level advancement: explicit Race vehicle and teleporter markers, verified channel readiness logic, one-click pair authoring, Race/teleporter 3D guides, cross-mode CTF spawn checks, plus frontend/native regression sources.

Status remains **PARTIAL** for these phases and **NOT VERIFIED** for real gameplay, PowerPC exports, actual native gametype binaries, and multiplayer AI. No existing row of this acceptance matrix is upgraded to COMPLETE based on offline testing alone. See `CONTINUATION_15_ENGINEERING.md`.

## Continuation 18 — evidence correction

Added `resource_map.rs` for SHA-256-pinned, bounded, read-only `bitmaps.map` index validation and a **conditional** external-raw first-mipmap bridge (`bitmap_preview.rs`). Native command and World UI require exact project-owned resource provenance; the Academy explains why this is not a general shared tag extractor. Published sources disagree about the resource-map type code; both documented codes are treated as candidates for **inspection only**, while raw reads require exact tag path, one index entry and range containment. Node response-protocol tests pass. Rust unit tests are added but **not executed in this environment**. No native engine/gameplay gate closed.


## Continuation 19 (source only, October 26 2026)

Phase 04/09 now include read-only provenance for the `sbsp` lightmap bitmap
TagDependency (per BSP) and a bounded desktop UI queue for previewing verified
base/diffuse images and lightmap image pages. It uses the exact source `bitm`
tag IDs, rejects mismatched/duplicate/unavailable metadata, and never replaces
manually supplied images. User cancellation, project switching and response
image-index validation guard against stale or cross-project textures. The
existing C18 external-resource decoder is reused, not broadened to guessed
layout variants. **None of the 10 phases is promoted to complete.** Rust, Tauri,
original Halo resources, rendering parity, source-to-game BSP/collision, First
Contact, in-engine Firefight/Zombies, multiplayer AI and G4 export remain
unverified or incomplete. See `CONTINUATION_19_ENGINEERING.md`.

## Continuation 20 (2026-10-26) — bounded native bitmap-batch source delta

Phase 04/09 actual classic material-preview code advances with one read-only immutable cache snapshot and at most one double-SHA-pinned resource index across up to 24 exact first-mip images. This replaces C19's repeated serial read pathway. The World Editor supports a combined user-triggered shader/lightmap batch, deduplicated source pairs, exact BSP-specific page keys, separate success/refusal, persistent manual-image priority and safe cancel/project/source-change invalidation. Strict aggregate native raw and frontend decoded memory ceilings apply; the full offline Node suite passes.

**Do not change legacy phase completion claims**: Rust unit tests, native Windows build, live Halo shader/lightmap fidelity, full cross-engine compilation, genuine BSP collision/portals/PVS, First Contact, playable Firefight/Zombie Apocalypse, multiplayer AI and G4 remain unverified or blocked. See `CONTINUATION_20_ENGINEERING.md` and the living `07_HALO_MODDING_BRAIN_HANDOFF.md`.


## Continuation 23 addendum (source-only, no engine gate closed)

The independent BSP mesh topology screening is new under Phase 3's source geometry/export checks and Phase 7's safer map pipeline. C23 documents warning vs block behavior, brush focus and SHA-tied diagnostics in `CONTINUATION_23_ENGINEERING.md`. **No original 10-phase acceptance requirement is newly certified** without a compiled Halo Tool map and live testing. Preserved requirements are inventoried in `CONTINUATION_23_REQUIREMENT_TRACE.md` and `ORIGINAL_92_REQUIREMENTS_RECONSTRUCTION.md`.
