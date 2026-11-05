# Project Guilty Spark — Master Evidence & Requirements Ledger (provisional v8)

**As-of:** 2026-11-04 America/New_York. **Prepared from:** Library canonical 274 finding records + 116 source records; earlier requirements source index; user-supplied Codex transcripts and acceptance reports; public repository/readmes/releases/issues checked 2026-11-04. **Status:** an additive companion/reconciliation deliverable, NOT an overwrite of the authoritative research or the unrecovered 398-record requirements ledger.

## Executive decision

Do not start more parallel feature-building while post-repair source provenance, storage safety, current UI regression acceptance and exact build/game gates remain unresolved. Preserve every feature promise and previous-good snapshot; do a source/function/UI audit before prioritizing implementation. Report what the installed target engine actually proves, not merely what automated tests or UI previews report.

## Record-count and provenance reconciliation

| Record set | Count | Meaning / status |
|---|---:|---|
| Phases 3–10 reconstruction | 92 | Historical subset, not exhaustive; source index says inspected. |
| Older requirements crosswalk | 122 | Historical report, original exact source still to reconcile. |
| Oct 28 requirements/evidence | 223 | Historical checkpoint, not unique features. |
| Oct 30 requirements/evidence | 342 | Historical checkpoint, not unique features. |
| Oct 31 mixed requirements/evidence | 398 | Reported as preserving 391 prior IDs. Original canonical file still needs recovery. |
| Original engineering queue | 25 | Numbered directives #4–#28; backup preserves source distinctions. |
| Canonical research findings | 274 | Verified directly against Library JSONL and SQLite in this pass. |
| Canonical source records | 116 | Verified directly against Library SQLite in this pass. |
| Canonical workflows | 32 | Verified directly against Library SQLite. |
| Canonical tool profiles | 17 | Verified directly against Library SQLite. |
| Nov 4 proposed new research | 5 | IDs UI-044, UI-045, INVADER-009, UI-046, PROJECT-009. Not persisted canonically. |
| Proposed research total | 279 | DRAFT ONLY: existing 274 unchanged + 5 new, not 279 accepted features. |

**Do not add these counts.** Mixed source, evidence, workflow, product feature, and historical row counts have different units. Net founder-approved unique features remain UNKNOWN until original requirement IDs, source wording and code are reconciled.

## Evidence and status vocabulary

- **Founder requirement:** requested behavior; not implementation. **Research finding:** upstream observation/limit/opportunity; not necessarily a Spark bug. **Codex report:** tests/run results attributed to the pasted local transcript, not a fresh independently inspected local checkout.
- **Evidence ladder:** request → source exists → unit/desktop automated pass → independent native tag readback → native compile → game launched → human gameplay → second real game client/physical machine → clean-machine packaged release. Preserve every ladder rung and exact target/runtime.
- **Status labels:** HUMAN PASS (SCOPED), SCOPED TESTED, PARTIAL TESTED, IN PROGRESS, P0 active repair, EXPERIMENTAL, RESEARCH, PRESERVE/TEST, RELEASE PENDING. None is a global completion claim.
- **Temporal labels:** superseded snapshot, historical fixed/closed, unverified-current applicability, active blocker, proposed-not-imported. Do not delete older record IDs; add aliases/supersession links and dated test provenance.

## Current engineering and product requirement families (provisional, NOT 398 atomic rows)

| Family | Founder scope | Last reported evidence / limit | Classification | Next acceptance |
|---|---|---|---|---|
| PROJECT/REPO / Canonical repo & storage / Single master worktree and root checkout reported after consolidation; later runaway isolated .local and repair work unresolved / P0 active repair / Identify real HEAD, dirty/untracked files, each blob owner and preserved C49/C63 sources; disk budget and no source deletion. |
| PROVENANCE / Requirements & evidence lineage / 398 historical mixed ledger reportedly preserved 391 older IDs; not recovered/recatalogued / P0 missing audit / Recover exact atomic rows; compare all 25 original prompts, 92 phase rows and later decisions without destructive dedupe. |
| UI-FLOW / Spark Flow navigation & UX / C69 menus, restore and tab/header fixes reported; user saw highlighted-tab and crowding regressions / P0 visual review / Run screenshot/interaction audit of actual current build at 800, 880, 1366, 1920 px and DPI scales. |
| UI-SESSION / Workspace restart and multiwindow / Separate tabs, camera, source history, settings and ownership restored in app harness; physical monitor reconfiguration open / PARTIAL TESTED / Power-cycle/restart, three windows/two monitors/disconnect, mixed dirty maps, focus, Undo, save. |
| UI-PREVIEW / Preview lifecycle, caching and native material parity / Warm preview retention and zero hidden MCC polls reported; model/shader visual mismatch and overall RAM stability open / PARTIAL TESTED / Cold/warm per-asset timings, peak RAM/VRAM, shade/reflection parity, unload only on map close. |
| UX-GUIDES / Guided workflows and examples / 63 guided workflows and 95 demo/test artifacts inventoried; not 95 accepted human journeys / PARTIAL TESTED / Every visible demo button has an accessible real wizard/tool path and measurable native result. |
| HALO-SOURCE / Source Guardian and native provenance / Native hashes and guarded builds reported; current source function coverage and rollback uncertain / PARTIAL TESTED / Original hash preserved, correct map identity, explicit source/build/game revision and fail-closed staging. |
| SDK-RESOURCE / SDK copies, resource maps & extraction / Demo Zombie extraction accidentally used MCC Inbox; fixed preflight planned; massive tag clone problem reported / P0 active repair / Resource bank identity checks, quota, graph-bounded copies, crash cleanup and no recursive job copy. |
| EDITOR-TAGS / Tag Inspector / source-native editing / Typed field editing, dependency readback and valid sound tag compile reports; full object lifecycle remains unproven / PARTIAL TESTED / Independent Guerilla/Baboon readback after modification, source checks and game playback. |
| EDITOR-ASSETS / Native Asset & Tag Studio / Explicit full directive, inspector integration in progress; Blender roundtrip not yet accepted / IN PROGRESS / Import one real supported object/asset, dependency graph, edit and export, native build, game, external re-open. |
| WORKSHOP / BSP Workshop source geometry / Draw/name rooms and ramps, face/edge selection, seam join, Undo/Save, Tool compile+collision readback reported / PARTIAL TESTED / General imported terrain, UV auto tiling, arbitrary caves/tunnels, portals and player travel. |
| DOOR-TRIGGER / Door and Logic/Events interaction / C63 isolated trigger was corrected; human two-way walk and return through door passed in H1A Standalone / HUMAN PASS (SCOPED) / Maintain two-sided repeated behavior, independently reopen native tags, conclude external edit and document user UI path. |
| SCRIPT / HaloScript & reusable events / Door-entry native script generated and compiled; broader missions/checkpoints/object events pending / PARTIAL TESTED / Custom human-authored scripts preserved and imported, valid source/generated script comparison. |
| MEGAWORLD / Timberland–Sidewinder merge / Atlas, native map compiled and CE loaded; no human two-way traversal on combined world / COMPILATION ONLY / Find/mark entrances, return route, scenery/portal/lightmap/collision human validation. |
| MEGA-4 / Four-region continuous world / Ambition; giant BSP, BSP switching and streaming are separate mechanisms / RESEARCH / Incremental human-accepted four-region build; do not advertise streaming without engine evidence. |
| NATIVE-CONVERT / Retail PC/CE/Xbox/Mac Demo/MCC format adapters / Real format-specific readers and CE→MCC compiles reported; all target gameplay fidelity unproven / PARTIAL TESTED / Independent per-target maps, sound/bitmap/animation fidelity, native output readback and gameplay. |
| MAC-LEGACY / Mac Demo/HaloMD original creator workflow / First-class legacy source identity requested; modern native Apple Silicon editing requirement; no accepted package / PRESERVE/RESEARCH / Legitimate legacy map open/edit/build conversion without hard dependency on Windows ESCHATON/SwordEdit. |
| LIVE-LINK / MCC object live transforms / Scoped exact-build transforms/scaling/readback reported; no CE universal live write proof / SCOPED TESTED / Typed allowlisted adapters; no arbitrary writes or anti-cheat bypass. |
| SPARKLINK / Concurrent creator source editing / Three local processes, conflicts, history transfer, crash recovery and revisions reported / PARTIAL TESTED / Two physical PCs edit/undo/conflict/disconnect/reconnect/frozen native build. |
| AI-SYNC / Shared multiplayer AI lifecycle / Read-only OpenCE diagnostics, multiple-peer movement/firing and damage/death experiments reported / EXPERIMENTAL / Two real clients combat/health/target/death/cleanup/reconnect and late join, telemetry parity. |
| FIREFIGHT / Wave survival Creator / Solo two-wave round-controller simulation/native work reported; full human shared victory not accepted / EXPERIMENTAL / Human firefight encounter attack, scoring, defeat/victory, then two peers. |
| ZOMBIE / Original Zombie Apocalypse restoration / Original Demo assets; controlled carrier release work reported; automatic release/round completion still open / EXPERIMENTAL / Stable carrier physics, player survival gameplay, native CE and MCC separately. |
| CAMPAIGN / First Contact and Mission Director / Mission source/timeline pieces in progress; complete playable campaign not accepted / IN PROGRESS / Human insertion/objective/combat/cinematic/extraction/finish playthrough. |
| GAMETYPES / Slayer/CTF/KOTH/Oddball/Race/flags / Native placement and hill workflows required; no end-to-end mode acceptance inferred / PRESERVE/TEST / Test actual game mode objects, native variant and networked rule behavior. |
| MULTIPLAYER / Host/join/Community Maps / Managed CE host/join with player movement/collision reported; other protocols per-runtime / SCOPED TESTED / Two users, version+map hash, authorized download, map voting and safe join. |
| RECORDING / Machinima/Recording Director / Editor camera/takes/timeline and detachable windows reported; native/live/encoded output independent / PARTIAL TESTED / Save 30s take, reopen and produce valid native camera/script or consented capture. |
| CROSS-PLATFORM / Windows/Mac/Linux packages / Old C49 Windows installer/portable candidate; native macOS/Linux/Apple Silicon package acceptance unknown / RELEASE PENDING / Clean Windows installation; native Mac/Linux editor build/install with tool capability fallback. |
| ENGINE-FRONTIER / 128 players, 6 co-op, local split screen, VR / Goals retained; version-dependent capabilities, no shipped Spark acceptance / RESEARCH / Isolated pinned-engine benchmarks and disabled unsupported UI. |
| COMMUNITY / Credits, guide provenance & collaboration / Community tool comparisons and agreements; incorporation without authorship/licensing claims / IN PROGRESS / Credits, link to official upstream, integration permission, available contracts, version pins. |

## UI/UX recovery audit — work was interrupted and resumed

Reported work: duplicate runtime dropdown removal; icon-based runtime cards; tab restyle iterations; Work/Tools/View/Studio dropdown compaction; window-specific tab/camera/ownership restoration; inactivity-aware polling; current help/demo catalog reuse. Reported test counts and UI state differed by checkpoint; none makes the latest screenshots universally accepted.

**Mandatory inspection grid:**

- Compare current screenshots to the user-preferred smooth rectangular tabs, no accent stripe, glow or header highlight. Give tabs the available bar width; contextual menus must stay accessible.
- Review information architecture: Home, World, Workshop, Tag Inspector, Asset Studio, Community Maps, Games & Tools, Host/Join/Collaborate and Recording Director. Remove duplicate entry points only when underlying feature parity is preserved.
- One authoritative runtime selection; label source edition, compile target, gameplay host/runtime and revision separately. Never conflate runtime with original map identity.
- Inspect controls for dead clicks, inaccessible dropdowns, misleading names, overlapping UI, broken hierarchy, controls hidden at 800×600 and 1366×768, and 100/125/150% DPI.
- Test standalone, pop-out, two native windows, multiple monitors, mixed dirty maps, keyboard navigation, screen readers/contrast, focus and right-click/menu clipping.
- Open/close/restart different maps/windows and confirm restored camera, undo ownership, layouts, active/inactive tabs, fullscreen state and Audio preferences without save races.
- Inspect Community Maps density; transparent tooltips/hints; readable launch/setup cards; no developer notes in consumer runtime choices.
- Follow each UI element to its backend operation, exact native Halo data class, validation and actual game acceptance level. A preview is not a native edit.
- Profile cold/warm Home/corner monitor preview, shaders, vehicle textures/reflections, Spartan pose, retained models and background work. No cross-runtime cache contamination; no repeated reads after navigation.
- Audit all 63 guides and 95 native demo/test artifacts as reported. A demo with only an engineering script must not appear as a click-through creator workflow.

**Current UX verdict:** automated restoration improvements reported, but **user-visible final design acceptance remains OPEN**, and interrupted/resumed changes need an actual source+binary+screen comparison. Do not treat old C54/C63 UI reviews as present-tense proof.

## Research proposed delta (five new source-backed candidates, not inserted into Library canonical)

| ID | Priority | External finding | Spark action |
|---|---|---|---|
| UI-044 | P1 | MCC profile controls can become inaccessible on smaller screens | Ensure all context-sensitive setup controls remain reachable through responsive layout, scrolling and keyboard navigation. |
| UI-045 | P2 | Repeated native compiler commands create avoidable authoring friction | Audit existing Spark build presets, typed arguments, per-kit command history and working-directory handling before considering optional local terminal integration. |
| INVADER-009 | P1 | Extraction can obscure sound-class-dependent source defaults | Track explicit versus inferred or compiled-default values; preserve provenance and warn where original source semantics cannot be reconstructed reliably. |
| UI-046 | P1 | Bounded asynchronous bitmap browsing is an established competitor capability | Benchmark existing Spark retained preview and bitmap library paths against viewport-only decoding, mip-aware thumbnails, bounded cache eviction and reuse of source-index results. |
| PROJECT-009 | P2 | General-purpose Blam framework integration can exceed resource-conscious workstation budgets | Prefer verified interoperability and selective architectural lessons; do not introduce a heavyweight compiler, renderer or full SDK tree without measured benefit and explicit approval. |

Recheck 2026-11-04: Osoyoos issues #85 and #86 are open; Invader issue #185 is open. These are UPSTREAM sources. Baboon caching and Blam framework requirements are DOCUMENTED competitor information, not current Spark defects. Source links are embedded in `GS_RESEARCH_DELTA_PROPOSED_20261104.jsonl`.

## Research temporal / outdated-classification audit

An automated conservative label was applied to each of the original **274 records**, plus the five proposed records; underlying canonical `source_status`, `spark_status` and descriptions remain unchanged. These labels classify existing evidence and do **not** assert that all 279 upstream links were re-opened or all Spark bugs were reproduced.

| Temporal class | Records | Meaning |
|---|---:|---|
| `DOCUMENTED_EXTERNAL_NOT_TESTED_IN_SPARK` | 86 | External documented behavior; exact Spark applicability unknown. |
| `UNVERIFIED_CURRENT_APPLICABILITY` | 46 | No current independent applicability check. |
| `ENGINE_LIMIT_CHECK_EXACT_TARGET` | 39 | Engine constraint specific to target/toolchain; do not generalize to every runtime. |
| `HISTORICAL_FIXED_REGRESSION_ONLY` | 36 | Upstream issue already fixed in identified historical version; keep regression fixture, not an open bug claim. |
| `UPSTREAM_OPEN_AT_LAST_REVIEW_RECHECK_VERSION` | 28 | Open at last checked date; recheck if actionable; no Spark reproduction implied. |
| `COMPETITOR_CAPABILITY_VERSION_PIN_REQUIRED` | 24 | Documented other-tool feature; benchmark exact version and avoid novelty claim. |
| `SPARK_OLD_CHECKPOINT_NEEDS_CURRENT_HEAD` | 8 | User-supplied Spark snapshot; verify against the restored local repository. |
| `UPSTREAM_PLANNED_UNVERIFIED_SHIPPING` | 7 | Roadmap/proposal, not proof a pinned released binary ships it. |
| `HISTORICAL_CLOSED_RECHECK_BEFORE_BUG_CLAIM` | 5 | Issue closed; cannot infer current defect from the old report. |

### Known outdated, superseded, misleading or incomplete statements

The following are **audit annotation IDs**, NOT newly counted master requirement IDs. Nothing is deleted. Where a fix is reported, the fix is scoped to its fixture and source evidence.

| Audit ID | Former assertion to avoid | Current grounded correction | Disposition |
|---|---|---|---|
| STALE-001 | The Oct 31 count of 398 means 398 finished or approved features. | 398 reportedly counted mixed requirements and evidence rows; deduplicated approved requirements unknown. | RECLASSIFY_COUNT |
| STALE-002 | Research v6 with 260 findings is latest. | 274/116/32/17 canonical pass7 is newer; 5 proposed additions have not been persisted. | SUPERSEDED_CHECKPOINT |
| STALE-003 | The five Nov 4 discoveries are already in the database. | 274 unchanged; five were supplied as unimported candidate delta (expected 279 after reconciliation). | NOT_PERSISTED |
| STALE-004 | The C63 red door remains broken. | Isolated corrected two-way Standalone passage was human reported as passing; external-edit full round trip was not closed by that test. | FIXED_ISOLATED_REGRESSION |
| STALE-005 | Standalone success proves the same gameplay in MCC. | Standalone door acceptance is exact-fixture/target-specific and does not establish MCC parity. | EVIDENCE_OVERCLAIM |
| STALE-006 | C49 Windows 0.4.1 is the current code. | C49 artifact is a preserved older release; much later C63/C69 and storage/UI work was reported locally. | SUPERSEDED_CODE_SNAPSHOT |
| STALE-007 | C61 hash 9d03f10 or C69 hash 4de3c97 is definitely current HEAD. | Both are historical reported checkpoints; later reported commits include 440dab1 and 16d9c95 and uncommitted changes. | STALE_HEAD_REFERENCE |
| STALE-008 | A past source audit already validated every file/function. | The requested exhaustive post-repair inventory and actual callsite/UI route audit is still pending. | NOT_YET_AUDITED |
| STALE-009 | Spark Flow and tabs are fully approved. | Restore/ownership/polling automated checks improved, but user reported styling regressions and crowding; interrupted/resumed UI work needs an end-to-end visual audit. | PARTIAL_UI_ACCEPTANCE |
| STALE-010 | One runtime dropdown in multiple locations is acceptable or still present. | A duplicate bottom runtime selector was reportedly removed; more header reorganization followed, so current actual UI must be inspected. | FIX_REPORTED_VISUAL_REVERIFY |
| STALE-011 | Successful CI or browser tests prove all desktop and native gameplay. | Automated suites and desktop harness cover important parts; human and second-PC acceptance are separate. | EVIDENCE_OVERCLAIM |
| STALE-012 | The old 138–139 GiB scan is the current storage size; space problem solved. | Later user-visible context reported approximately 147 GB in nested .local with over 635k files. One approved duplicate subset (1.68 GB) was removed, prevention not fully reverified. | STALE_STORAGE_MEASUREMENT |
| STALE-013 | A nested .local tree proves the repository source was deleted or recursively cloned. | Logs attribute much of growth to isolated SDK/test-job copies; source damage was not established. | UNPROVEN_CAUSE |
| STALE-014 | All 63 guided workflows have human gameplay acceptance. | 63 guide entries and 95 artifacts were reportedly cataloged, with a smaller number of native desktop/playtest checks. | TEST_SCOPE_OVERCLAIM |
| STALE-015 | C63 external Invader reconciliation is unquestionably complete. | Valid edits/corrupt rejection and native build progress reported; stale-build guard and output receipt issues prevented clean end-to-end signoff at intermediate checkpoints. | PARTIAL_ACCEPTANCE |
| STALE-016 | Synchronized AI movement proves complete two-player Firefight. | Observed AI identity/movement/combat work does not close shared health/death/round completion/late join on independent machines. | EVIDENCE_OVERCLAIM |
| STALE-017 | Timberland–Sidewinder compilation proves human two-way travel. | Compiled geometry and CE loading are not a recorded human round trip for that combined world. | EVIDENCE_OVERCLAIM |
| STALE-018 | 128 players, six-player co-op, four-player split-screen, four-region streaming and VR are shipped. | Ambitions remain research and version-pinned engine projects; source support or network config alone is not acceptance. | RESEARCH_ONLY |
| STALE-019 | Mac/Linux/Apple Silicon first-party packages are already validated. | Cross-platform independence is a requirement; clean native installed/launch/editor workflows are not established. | NOT_SHIPPED |
| STALE-020 | Chupathingy v0.8.1b is the newest stable version. | Public releases show stable v0.8.1d dated 2026-10-30; a newer Oct 31 nightly is explicitly pre-release. | VERSION_SUPERSEDED |
| STALE-021 | Chupathingy online co-op is future-only. | Project source-linked pass7 and current public materials document internet co-op; version-specific two-client acceptance remains necessary. | COMPETITOR_CAPABILITY_UPDATE |
| STALE-022 | Baboon v0.3.0 is the latest stable; older v0.3.0 bugs still apply unchanged. | Public releases show v0.3.2 stable dated 2026-10-08 and a separate dev build; v0.3.1/0.3.2 contain prior fixes. | VERSION_SUPERSEDED |
| STALE-023 | Closed Invader #141, Reclaimer #14 or animation addon #55 reports are current open defects. | Pass7 explicitly labels these historical closed issues; exact installed-version reproduction is not established. | HISTORICAL_CLOSED |
| STALE-024 | Osoyoos #85/#86 and Invader #185 are confirmed Spark defects. | They are upstream open issue/enhancement reports, not reproduced failures in current Spark. | SCOPE_MISATTRIBUTION |
| STALE-025 | Baboon preview caching and command launchers are exclusive Spark features. | Baboon and Osoyoos document comparable primitives; Spark potential differentiation is end-to-end source/build/play/return fidelity. | COMPETITIVE_OVERCLAIM |
| STALE-026 | Native map preview textures/vehicles/SPARTAN model posing already match in-game perfectly. | User explicitly reported inaccurate vehicle shaders/reflections/textures and model posing; user-facing visual proof outstanding. | OPEN_QUALITY_DEFECT |
| STALE-027 | GitHub public master is necessarily the same as local active work. | Public README is a prior checkpoint and later local work was reportedly not pushed. | SOURCE_DIVERGENCE |
| STALE-028 | Tool Integrations and Native Asset Studio were never requested. | Both have explicit complete directives and reported partial/in-progress work; a prompt omission does not supersede either. | PRESERVE_SCOPE |
| STALE-029 | One renderer means all Halo formats can use one identical decode path. | Shared scheduling/cache/lifecycle are desirable, but edition-specific readers, material semantics and native targets remain different. | DESIGN_CLARIFICATION |
| STALE-030 | All data beneath .local can be deleted safely. | Some job data, accepted maps, test evidence and original assets may be needed; one truncated bitmap copy was preserved as interruption evidence. | UNSAFE_ASSUMPTION |

Detailed follow-up and owner actions for each correction are in `GS_OUTDATED_CLAIMS_V8.jsonl`.

## Current version snapshot — DO NOT hard-code forever

- Chupathingy: GitHub releases dated 2026-10-30 show **v0.8.1d latest stable**; an Oct 31 nightly is a **pre-release**. Release notes describe compatibility with OpenCE network 41 as well as an older build-244 path. Test actual game session/protocol; network version compatibility is not blanket mod compatibility.
- Baboon: GitHub releases show **v0.3.2 latest stable** dated 2026-10-08 and an Oct 31 unsigned dev build. Historical v0.3.0/v0.3.1 bugs need exact version context; licensing/security warnings on dev builds matter.
- Osoyoos #85/#86: public GitHub issue pages were **open** when checked 2026-11-04. #85 concerns H2 MCC small-screen profile overflow; #86 is a configurable-console enhancement request. Neither proves Spark is affected.
- Invader #185: public GitHub issue was **open** when checked 2026-11-04, originally Oct 2020, concerning compiled/defaulted values on extraction, notably sound classes. Reproduce on the exact installed version before raising a Spark defect.
- Reclaimer #14, Invader #141, Blender/Halo addon #55 and old Chupathingy v0.8.1b defect fixes are *historical or closed* per the canonical source-linked research; keep as regression evidence, not live defect lists.
- Public Project Guilty Spark README at GitHub still describes older C62-centered source/release evidence; later C63/C69 and storage/UI work was reported **locally**. Do not use public master alone as current local HEAD.

## Non-destructive recovery-to-code-audit route (one Codex initiative at a time)

1. Freeze evidence: save actual git HEAD/status/worktrees, current uncommitted UI/asset/storage work, C49 release checksum, C63 accepted door artifacts, research database/ZIP and original prompts. No Git push or client/game mutation.
2. Verify root-level source and dependency graph, then current storage footprint. Do not delete .local wholesale. Attribute files to active jobs, accepted builds, proprietary resources, SDK originals, scratch/duplicate copies and evidence. Only approved hash-verified disposable files may be removed.
3. Prove repair and build sanity: integrity/canonical source paths, nightly test capacities, target-specific native tests, resource bank preflight, disk reservations, atomic canceled/crashed-job cleanup. Report any blockers separately.
4. Recover original 398-record atomic ledger, earlier 92/122/223/342 versions and 25 prompt originals. Preserve all IDs and exact original wording. Create dedup links, not destructive merges, and distinguish founder-approved from research suggestions.
5. Full static code/functions audit: source file/module, public API/function purpose, callers, duplication/dead code, data ownership, tests, actual UI route, native output path, security/memory/disk risks and dependency version. Audit TS/Rust/Tauri/build scripts/installers and current assets; do not refactor merely to tidy.
6. Perform screenshot-driven end-to-end UI audit, including interrupted/resumed work, visual tab regression, focus, small screens, all dialogs, demos and end-to-end save/reopen. Compare actual user-loved style before making redesign decisions.
7. Close native flagship workflows in priority order: safe artifact staging, complete door external-edit return loop, native Blender asset import/edit/build/game, correct extract resources, core BSP and game parity. Keep unrelated engineering paused only while it risks preservation.
8. After core acceptance, test real two-computer SparkLink, real two-player AI/Firefight and Megaworld traversal; preserve experimental 128-player/co-op/VR tracks without blocking releases.
9. Run a real clean-machine installer/portable and native Mac/Linux acceptance per platform, publish an evidence-backed feature matrix. Never claim release ready until the actual package passes.

## Detailed ledger contract for eventually recovering all 398 atomic rows

For each row keep: stable ID; original user wording; conversation/prompt/source/date; requestor (founder/community/research); classification; parent and merged aliases; runtime/OS/formats; priority and risk; latest author-approved scope; exact code file/function/callers; UI control and reachable workflow; toolchain version; source map/hash; acceptance rung with artifacts; implementation disposition; dependencies and blockers; updated_at and reviewer; stale-as-of/supersession reason. Count founder-approved features separately from evidence/test and external findings.

No original requirement is removed or deemed abandoned simply because it was not in the latest prompt. Prompt #4–#28 source provenance and all unreconciled historical rows are mandatory inputs to the eventual complete atomic version.

## Sources, caution and file manifest

- https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark
- https://github.com/ChupathingyCE/chupathingyce/releases
- https://github.com/Zoephie/Baboon/releases
- https://github.com/num0005/Osoyoos-Launcher/issues/85
- https://github.com/num0005/Osoyoos-Launcher/issues/86
- https://github.com/SnowyMouse/invader/issues/185
- https://github.com/ChimpsAtSea/Blam-Creation-Suite

Input snapshots: Library `/Project Guilty Spark Research/SPARK_FINDINGS.jsonl` + `/spark_research.sqlite3` (274/116/32/17), `/2026-11-04_Requirements_Source_Index.md`, November 4 user-supplied transcript excerpts, Library pass7 and Nov4 proposed delta. The local unpublished repository was **not** inspected directly; all post-C62 product claims are attributed to reports, not independent evidence.

Outputs: master Markdown, intact 274+5 proposed JSONL, five-entry delta, all-279 temporal audit, 30-item outdated-claims audit, ZIP, SHA-256 checksums. No update was written to the canonical Library, live local Git repository, Halo install, research SQLite or external service.
