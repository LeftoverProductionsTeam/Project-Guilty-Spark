# MegaWorld seam routes — 8 November 2026

Base: local master `5095e9b9ea0979448cd571d56659b4076e5930a2` plus the preserved uncommitted continuation. This records source authoring acceptance, not a playable 19-region world.

## Creator workflow

1. Open two owned supported maps. In the donor's Project setup, add its matching engine target and verified Editable Halo Tags folder. A runtime map folder alone is not editable native tags.
2. Return to the destination: Level editor → Construction → Connect another map's BSP. Select the donor/BSP and plan a tunnel or adjacent terrain.
3. For adjacent terrain, choose **Start with flat connector** to keep exact source-edge elevations without raised banks. Shoulder width, bank height and route floor points remain editable; increasing bank height shapes the same source strip. Then choose **Make three-route seam**. The existing assembly gains a player tunnel, a wider primary vehicle passage and an open high-ground route. Existing plans remain readable without the optional routes.
4. Select **Connection route** to edit each route's floor points, width, clear height and native material. Use a selected landscape surface for an entrance; adjust ridge access to real canyon-top terrain. Defaults are reviewable drafts, not accepted vehicle or mountain geometry.
5. Apply once, Save, and check every route. Undo/Redo affects this author's assembly edit. Navigation and full application restart retain the source-bound plan.
6. Build a separate native cache with matching tools, inspect its collision/material/portal readback and only then run the human tests below. Original map hashes must remain unchanged.

This extends the existing assembly, Manifold geometry and native compiler paths. It does not create another geometry system. Texture projection and per-route native material references remain part of the source output. It does not reduce arbitrary source polygons or silently omit scenery/resources to claim 19-map capacity.

## Implemented checks

- Optional `highGround` metadata reuses the existing waypoint/width/height/material route representation. It is omitted in legacy plans and never recurses into nested assemblies.
- Independent entrance/exit, dimension, slope, world-bound and route-distinction checks apply to all three routes. Donor rotation/translation moves the route mouths consistently.
- Generated geometry contains all requested routes. Source collision checking returns labeled standing-biped samples for each; reverse routes are checked independently.
- A high-ground route cannot pass by finding the lower tunnel floor. Its actual support must match the authored ridge within 0.12 world units. Regression fixtures reject a missing ridge and a floating ridge even when the lower paths pass.
- Open-sky ridge geometry gets the required sky material handling. Native shader aliases cover all route materials.
- Construction no longer clips its controls inside a second fixed-height scroller. It uses the existing compact paging/search surface.

## Actual desktop evidence

External bounded evidence root **E**: `C:/Users/patri/AppData/Local/Temp/GuiltySpark-Engineering-d49eb02588bf`.

R36 optimized Windows QA app: `E/compact-runtime-app-r36/GuiltySpark.exe`; 49,044,480 bytes; SHA-256 `9f526e39691eecd1f18c153a4c822f4d1e16e4a4d92cc5b8131c259b7d8cb45c`. This dirty-source QA executable is not a sealed release artifact.

`E/native-three-routes-r48/acceptance.json`: complete, three cases, no errors and no mocked IPC. Actual Construction controls created/edited the three routes; Apply, immediate Save, one-action Undo/Redo, workspace return and full process restart passed. Donor Project setup was performed through actual UI controls. Invader extracted only the selected BSP's 69 native dependency files (18,034,422 bytes); no whole SDK was copied.

| Route | Design width | Clear height | Source standing-biped samples |
| --- | ---: | ---: | ---: |
| Primary vehicle passage | 6 | 4 | 423 |
| Player tunnel | 2 | 1.6 | 436 |
| Open high ground | 4.5 | 8 | 460 |

The 1,319 samples checked the derived 32,465-triangle source geometry. The fixture used **Plan connected tunnel**, not the natural-terrain preset; natural mountain blending is a separate gate. Screenshot: `E/native-three-routes-r48/native-three-route-authoring.png`. The viewport still shows the original map until the derived native output is built/opened; the source report is not a picture of a completed playable seam.

Original CE input hashes after the run:

- Timberland: `69d539409004bde866e3fb510d43fa9e155fb8dd0525fe6e2ffe1efe3664e0ea`.
- Sidewinder: `ac8580a914f96249fa10fd95ee10065a4513fd6147f1d1e2d768adae59407b4a`.

R44 passed the UI/source test but recorded false for an overbroad JSON identity comparison. R47 deliberately required deep equality and rejected legitimate newly discovered audio provenance. R48 verifies the source identity plus that exact added classic sound-bank scope against its actual SHA-256. Both original input files are independently rehashed in the final audit. Failed receipts remain evidence, not passes.

## Regressions and acceptance boundaries

- Locked Rust: 851 passed, 9 intentionally ignored (`E/three-route-rust-r35.log`).
- Frontend unit: 459 passed (`E/three-route-unit-r34.log`); offline: 59 passed (`E/three-route-offline-r36.log`).
- Eight combined existing/new BSP browser workflows passed (`E/bsp-combined-r46.log`), including legacy plans, stale replies, donor transforms, own Undo/Save and control reachability at 800×600 and 1500×950.
- Native R45: all eight requested window sizes, 90 dashboard controls each, zero page overflow or scrolling controls; saved 125%/Auto zoom and cache limits survive reload. This is not physical acceptance at every DPI or display size.
- The previous broad browser run had 207 passes and 23 failures. Six BSP cases now pass the combined run; 17 other UI/paging expectations remain to be repaired/retested. No full-suite or release acceptance is claimed.
- All 475 requirement IDs and 25 numbered Master prompts remain; ledger identity SHA-256 `a47797f3d35e6632c7889b0c1e084b56c05212653e01df53a2909fe5d3e9797a`.

## Remaining native and gameplay gates

At the earlier R48 checkpoint, the three-route fixture had **not passed native compilation or loaded in Halo**; R157 below supersedes that native-stage status. A previous natural-seam compiler trial stopped with Windows filesystem error 3 during staging/namespace work. Its exact failing path remains to be isolated; do not blindly retry or recreate an SDK tree.

After native compilation/readback succeeds, test each seam independently: walk the player cave both ways; drive and turn a Warthog through its separate route both ways; remain on the continuous canyon-top route between regions; and fire from useful sniper positions into both regions while testing visibility/portals. Check scenery collision, entrance approaches, vehicle headroom/turn radius, lighting and materials. A design width or biped sample is not vehicle acceptance; open sky is not a sniper line-of-sight test.

Human-verified cross-region connections: **0**. Verified Warthog seam routes: **0**. Native 19-region combined geometry: **0**. Propagate accepted route recipes through the existing 19-source cluster only after the first real seam passes. [Human plan H19](HUMAN_TEST_PLAN.md).

## Natural-seam repair follow-through

The exact owner directive `607600b0` is retained in `Master Engineering Prompts/GS_2026-11-08_Make_Megaworld_Seam_Work.md`. The older R36/R48 evidence above is retained as history, not current native compilation acceptance.

R52/R54 established that the failure was Spark's preflight conditioning, before Halo Tool. A 0.015-world-unit floor bias overlapped the original native floor and generated tiny wedge triangles; material28 reached256 bounded refinements with quality0.00165549. Neither the150,000triangle ceiling nor256iteration bound was raised. The source now keeps exact floor heights. Flat terrain uses only endpoints and an exact source-material boundary (two or three cross-sections), while shaped shoulders use bounded four-unit stations.

Two further genuine defects were isolated rather than concealed: an elevated free-space union inside existing sky did not create supporting ground, and a nonplanar floor quad twisted at a simultaneous bend/grade change. The ridge now subtracts a bounded support solid from the existing free-space model. Only nonplanar graded miters use a centerline split with closed matching end caps (20triangles); flat boxes remain12triangles. Automatic portal search spans collinear XY runs across grade waypoints while retaining the actual waypoint elevations. Authored portal segment identities and XY bends stay separate. Source vertices, material boundaries and affine UVs remain fixed by triangle conditioning.

R63:59focused Rust passes,2intentional ignores. The regression fixtures include the exact ramp-miter floor failure, missing/floating ridge rejection, portal isolation across a grade change, generated-material-local conditioning and unchanged non-target material indices/UVs.

R64 uses the real owned Timberland/Sidewinder sources and Spark's current frontend route generator, then the real native reader/Manifold source builder. Flat three-route source passed three times with identical JMS SHA-256 `368d822fabbb160966f1639ee8b3ab500e47ee35ebbb093f2048dcbb6de0ceb1`:31,910output triangles,18,760input collision triangles,526standing-biped samples and6portal cuts. Shaped shoulders passed with32,110output triangles, the same526samples/6cuts and JMS SHA-256 `42b0527a417603dda60f8a8778b38af2db221fe5c1bc997f672160fcbad4f950`. Flat-primary alone uses31,595output triangles: the three-route fixture adds315triangles; shaped banks add another200. These are source topology counts, not GPU budgets or Warthog acceptance.

Actual route samples: primary133(width6.5/height4), infantry195(width2/height1.6), high-ground198(width4/height8). Source-generation timings include warm-file-cache reads and native source generation, with concurrent regression/build CPU load; they are not comparable before/after app performance measurements. Native compiler output, visible joined-boundary screenshots and actual traversal remain distinct pending gates until the new native run finishes.

R59full browser found231passes/3failures. R64focused retest passes all three: fullscreen Escape, Atlas paging/Undo/immediate Save and editable flat-connector Save/Undo. Closed Maps menus no longer consume Escape; Save assertions wait for its real acknowledged result. The final full browser run remains in progress at this checkpoint.


## Chupathingy acceptance target (8 November)

The owner moved the active build/game test to **Chupathingy**, retaining standard CE609 output rather than relabeling MCC caches. Project setup now admits a reviewed CE base tagset with the existing H1A structural authoring / Invader CE profile. Build & playtest identifies Chupathingy explicitly. Other build targets and original inputs remain available.

R86 passed the locked Rust workspace (861 tests, 9 explicit ignores), TypeScript, 469 frontend tests, offline regressions and storage ownership checks. Its current-source optimized Windows QA app is `E/chupa-seam-app-r86/GuiltySpark.exe`, 49,136,128 bytes, SHA-256 `6a5af417512874d21ee73a68e8a81921307cf813fbc34d6b47c823bbd488b96f`, runtime-source fingerprint `217d465e5ee28d38b5da0c772e085409edf5e9935aa2495447c80803900c576b`. It is a dirty-source QA executable, not a release.

R86/R87 did not compile the combined map: the test fixture first used Invader's unsupported recursive scenario path, then hit native filename limits during direct whole-cache extraction. The revised fixture reuses Spark's existing source-pinned Source Guardian scenario recovery and short native paths. Missing-tag and compiler checks remain mandatory. R91 is the current native rerun; no success is inferred here.

Independent runtime control R90 ran **two real Chupathingy 0.9.0c processes** on one computer with copied publisher-verified binaries and owned stock Xbox Blood Gulch input. Both exited normally. Existing native-log analysis reports an actual join, bidirectional packet counters, two machine-player identities and no classified native faults. Human play, AI combat, rendering/audio fidelity, complete inventory parity, two-computer acceptance and the new combined cache remain unverified. `E/chupa-private-baseline-r90/execution.json` and `E/chupa-private-baseline-r90-analysis.json` bind the actual evidence. An earlier 1GiB test reservation correctly stopped R89 when two engine caches exceeded it; R90 explicitly reserves 3GiB within the unchanged 4GiB per-run policy, then disposes binaries, maps, profiles and caches. Logs and compact receipts remain.

The established architecture-fitting **Plan connected tunnel** remains. Optional bounded seam sections add source-hashed edge picks, independent names, rectangular/arched/open-road shapes, width/head-clearance/roof-facet controls, exact draft preview and connector-only triangle counts. These reuse native CSG, native material identities and portals. Core and browser contract tests do not establish native edge-picking, compiler or gameplay acceptance. Human H19 remains open.


## R157 — three-route native CE seam compilation and Chupathingy load

The new source slices visibility portals from the **actual closed joined air volume**, using the existing Manifold kernel. Rectangular outdoor cuts did not span overlapping road/ridge space: R154 built collision but Tool rejected a portal that did not define two closed spaces. Exact failed source and diagnostics remain in E/chupa-seam-diagnostic-r154.json and its bounded JMS. Legacy tunnel portals and all structural/native error checks remain enforced.

R157 passes six actual Windows cases: File/New from the two originals; native donor setup; shared source preview; width edit/Undo/Redo/immediate Save/full restart; real Halo Tool structure/radiosity and Invader CE compilation; independent collision/material/CRC readback; private Chupathingy0.9.0c map loading; and opening the compiled map in Spark. These are six harness cases, not six traversed connections.

- Connector only: **193 triangles**. Full source: **32,084**; preview render: **15,768**; compiled collision: **16,124**. Sky/portal and collision source are deliberately separate from the incremental rendered connector budget.
- Independent native process verifies **524 route samples**, CRC mismatch0 and the actual connected BSP reference. Biped sampling does not prove vehicle handling or human traversal.
- Native output: CE609,77,674,656bytes, SHA-2564959ad0f7ce739a68241fb8cd918cd781b730f672f51196a7507ce76c3f79d0b. Compile/readback stage325,054ms. This is one measured run, not a before/after speed claim.
- Compiled Spark viewport:137source shaders,7lightmap bindings,17source cubemaps; real materials/textures loaded before the screenshot. Both source-map hashes remain unchanged. Donor preparation recovers69recursive dependency files/18,034,422bytes, not a complete SDK.
- Private Chupathingy session reports the exact accepted map SHA and actual game ticks. Its engine/configuration/CE banks are isolated; no original installation is edited. The playtest is stopped normally by the existing control. **Human traversal remains unverified.**

Exact evidence: [compact native fixture](fixtures/native-terrain-seam-20261108.json), E/chupa-portal-native-r157.json and its exported source/compiled screenshots/private cache. The old nested terrain-proposal nativeCompilation:false is its initial proposal state; the completed top-level nativeCompilation record is authoritative. Future receipts retain the final compiled plan explicitly. The old closeup-named capture is an overview; it is not a close entrance or human-clearance image.

Keep H19 open: player cave both ways, Warthog road/turning/headroom, continuous canyon-top access, sniper visibility/projectile collision and interactive doors. Human-verified physically traversable connections: **0**. This is not native acceptance of the19-map cluster or streaming.

## 17 November — source-edge arch continuation (parent 939cea8)

Preserved R157's accepted three-route terrain build. Reproduced a separate optional-section defect: a narrow portal and a wider overlapping arch exported four partial/duplicate cuts. `bsp_assembly::add_portals` now reuses the existing closed-air slice and shared-cut handling whenever authored sections exist. The regression requires two distinct shared cuts spanning the true arch side and roof; it failed before the repair and passes afterward. Legacy section-free and terrain behavior stays on the existing paths. This is source geometry evidence, not native compilation of the optional section.

The same creator workflow had missing keyboard preview updates: arch facets had no key-release handler, and width/head-clearance omitted vertical arrows and Page Up/Down. All three now use the same supported range keys. The existing browser case proves width/facets/head-clearance changes reach the draft-preview request, leave saved source unchanged until Apply, then persist through Save and revert together through Undo/Save. The shared feature guide matches these controls. Native desktop edge picking/full restart remains OPEN under the recorded external control blocker.

Existing acceptance examples now support a deterministic real rendered-edge branch (`qa_bsp_assembly --edge-section 12 ...`) and explicit raw source recovery (`qa_megaworld_ce ... recover ...`). They call the existing edge/entrance checks and Source Guardian; no duplicate writer, SDK copy or automatic stock-tag repair was added. The edge fixture models subsequent creator reshaping through the established landings. Its selected original edges, transformations, three attempted layouts and exact errors are retained in the existing native-terrain fixture.

**Unresolved geometry:** the initial near-overlapping arch exhausted the unchanged 256-refinement budget (material26,16,764 triangles); a laterally separated straight route correctly refused a step above0.12 near153.32,45.70,-21.08; the authored branch still exhausted conditioning at16,882 triangles. Its exact failing roof points are in the fixture. An identical-shader material-sharing experiment did not resolve that geometry and was removed. No quality/triangle/clearance checks were weakened. The added arch section has not reached Halo Tool or game acceptance. Repair the actual roof/junction geometry before trying another native section build.

**Native baseline, separate from that arch:** the unchanged primary tunnel generates44 connector triangles /32,109 full source triangles,2 portals and423 standing-biped route samples. Source Guardian recovered2,437 base files/77,572,742bytes plus69 donor files/18,034,422bytes. Real Halo Tool structure and lightmaps completed, including42 donor scenery placements. CE cache compilation then correctly failed: `vehicles/scorpion/headlights scorpion.lens_flare` reflection0 refers to bitmap2 in the one-image `headlight_lens_flare.bitmap`. The exact three tag hashes and referenced bitmap match the existing optional, explicitly reviewed [CE source recovery](CE_SOURCE_RECOVERY.md) profile. No non-lossless correction was applied implicitly. Use Project setup → Map tools & tags → Engine build targets → Stock CE source recovery to review, create and select the corrected copy before a positive cache rerun. This failed raw-input build is not a new validated CE cache or Chupathingy load.

Final focused checks:79 shared-BSP Rust tests pass;2 installed MCC painted-detail fixtures explicitly ignored because their owned inputs were not supplied. Frontend7, expanded browser1, TypeScript and both native examples compile pass. Initial example compilation exposed a private-API call; the fixture now uses the public inspected render mesh and recompiles successfully. All2,506 recovered input-file hashes and both original maps/three resource banks remain unchanged. No app/game was launched, no release was built/published, and no human traversal was accepted. Machine-readable source/native hashes and exact failure coordinates: [existing native fixture](fixtures/native-terrain-seam-20261108.json), `edgeSectionContinuation20261117`. All475 requirements/M1–M6 remain active.

Owned QA Node17603/run-U2tZRe was closed after all writers settled:1,933,265,960 logical bytes disposed; peak1,957,455,356; last sampled allocation1,909,313,696bytes. Disposal allocation was unavailable, so these are not a claim of exact physical space reclaimed. Run root absent; active runs[]/issues[]. No replacement archive or retained build cache.


## 17 November — native arch repair and Windows readback (parent 54c1984)

The exact authored branch that previously exhausted256 refinements now compiles without moving its selected edges or transformations. Generated roof needles need conforming longest-edge bisection, including adjacent faces with separate material/UV identities; interior splitting could not improve the long constrained edge. Existing quality0.002,256-refinement and150,000-triangle limits remain. The exact six-face roof regression fails before the repair and passes afterward with source vertices, per-material area, winding and affine UV seams retained.

Halo Tool then exposed opposing collision-cap faces after f32 narrowing (red edges505/509). The existing collision pipeline now rebuilds only affected rounded closed solids through the existing Manifold implementation; it does not delete individual faces. Native portal slicing also retained fourteen redundant near-collinear vertices. Precision-bounded contour cleanup preserves all nine analytic arch corners and refuses lost holes/openings. An ineffective portal-offset experiment was removed; authored visibility planes are unchanged.

Final arch output:194 connector /32,460 full source triangles,42 donor scenery,8 source portal cuts. Real Tool structure/lightmaps and CE609 cache build pass. Independent compiled readback finds16,342 collision triangles,8clusters,8cluster portals,10lightmap groups,869capsule samples in each direction and68 original player-start capsules without reported issues. Cache SHA-256:8534a9b1c271f05cb188de8c52ccf0535a3aff7d889473725bef16d82330ab78,77,745,028bytes; CRC0xF2E8FD32. Remaining structural warnings:1solid-leaf split,1nearly-coplanar and62unearthed edges; Invader reports49cache-build warnings. These remain visible, not final geometry/gameplay acceptance.

Raw recovered source still correctly fails the known stock CE defects. The existing native example now accepts explicit recover-known-stock, calling the existing reviewed recovery profile and pinned tools to create a separate non-lossless3-tag/7-field corrected fork. Raw2,437base files and69donor files, source maps and resource banks stay unchanged. No edited tags are silently replaced; no second writer, full SDK copy or implicit application selection is added.

Final focused shared-BSP suite:83pass/0fail/2explicit installed-MCC-detail skips; triangulation9 and CE-profile3 pass. The real current-source Windows app builds offline with the existing tauri/custom-protocol feature, embedded TypeScript/Vite frontend and native backend. Actual native CDP preview has3passes, no mocked IPC/errors,134required primary shaders loaded,9bound lightmap pages and normal owned-window shutdown. App SHA-256:a084779c28372f9ad0832ff90818d723e5bbc21c4b1f4992a6d33bd5e8a4da7a,67,667,456bytes. This is a test executable, not a release.

Native screenshots: [player spawn](screenshots/workspaces/native-arch-spawn-20261117.png) and [Frame scene overview](screenshots/workspaces/native-arch-overview-20261117.png). The overview is a spaced two-map tunnel/arch fixture, not a blended three-route terrain world. The spawn camera does not show the arch. No successful before-image exists because that exact pre-repair geometry failed compilation. Native mouse edge picking, close entrance continuity, reshape/Apply/full restart, arch game loading and human/Warthog/projectile/door tests stay OPEN. R157 remains intact. The separate three-route terrain UI/compile/private-game regression is recorded below when terminal.

The first development-only app invocation omitted the existing embedded-protocol feature and failed at the unavailable development URL; the invocation was corrected without changing product build architecture. Its error handler also dereferenced a missing admitted app page. The existing lifecycle harness now preserves the primary startup diagnostic, avoids that TypeError and stops only its owned failed-start process. An intentional negative repeat has one expected startup timeout, no secondary close error and all owned writers exited. A subsequent embedded native run passes. Full P0 Save37944/42-edit and all475/M1–M6 remain open; the Computer Use plugin failure does not block the independently working native CDP harness. Exact hashes and scope: existing fixture archRepair20261117.


### Three-route terrain regression — native UI and compilation passed; game adapter blocked

The same embedded app completed actual File/New source selection, source-bound donor setup, both-region native preview, width editing, Undo/Redo, immediate Save/reopen and joined-source clearance (4cases including native compilation).287connector /32,154total source triangles and524source samples; real CE609 output77,708,800bytes, SHA-256f386173d01244c0f766bffaed01a3d7d5553646e51db1a56b6c543c2501b114ff. Independent Invader scenario/BSP/CRC/material checks and a separate compiled collision process pass (16,230collision triangles,524samples). Both Timberland and Sidewinder terrain bitmap references survive. This is not vehicle physics or full native process-restoration proof.

Private Chupathingy loading did NOT pass: installed executablec16096a841422b2597a3c5f26d8b16be7dd6a2914f678c7ea4b36e31ec3a3050 differs from the reviewed v0.9.0c adapter's fa9997520ebb2d8406fbe31db7146e1354b75569da1172c6dbf7717b9ee2b86b. Spark displayed the exact refusal and created no session. The harness timed out polling null; it now includes the existing visible error in that diagnostic. No identity checks were weakened, runtime overwritten or unrelated game restarted. The overall end-to-end run remains FAILED at this specific game gate.

Reused the successful compiled cache in a fresh read-only native preview, without repeating the build:3actual control cases pass,136required primary shaders/7bound lightmap pages, no errors/mocked IPC, normal close and unchanged cache hash. [Source authoring overview](screenshots/workspaces/native-terrain-source-20261117.png) and [compiled native overview](screenshots/workspaces/native-terrain-compiled-20261117.png) are real1500x950windows. They are overview comparisons, not close-entrance continuity or natural-blending/human-traversal acceptance. Preserve R157 and H19 independently. Exact evidence: fixture terrainRegression20261117. Both original maps and bitmaps/sounds/loc banks are rehashed unchanged.


## 24 November - Current CE terrain road compile

Local master f3f750a rebuilt the default Timberland–Sidewinder terrain road from the same hash-verified owner-installed CE donor maps. The existing qa_megaworld_ce example used its explicit recover-known-stock and terrain options with the installed H1A Tool and pinned Invader editing/repair tools. That profile forks the recovered tags and applies its previously reviewed stock corrections. Native geometry, lightmaps and CE609 compilation succeeded. Invader independently returned zero for CRC mismatch, protected cache and stubs. Spark read back 16,086 collision triangles, 133 standing-route samples, one resident BSP and 42 donor scenery placements. Cache SHA-256 d6034ef44f7c23ef6057888b5720d520a7bca5c55fe2411721c1b52f2ef35f64, CRC FF1F58C1. Original map hashes rechecked unchanged. Owned scratch was removed (973,612,713 logical bytes).

The terrain option generates an initial open road. The earlier authored cave and ridge were outside this run. The installed Chupathingy still hashes to c16096a841422b2597a3c5f26d8b16be7dd6a2914f678c7ea4b36e31ec3a3050, differing from the reviewed adapter binary above. No session ran. The remaining priority is actual two-way foot and Warthog traversal on the authored three-route plan before expansion to four regions.


## 24 November - Replay the authored road, cave and ridge

The existing qa_megaworld_ce command now accepts the local JSON evidence receipt in place of the previous .gsproject. Its base, donor and donor bank identities must match before native source extraction. The command rebinds the authored plan to the imported donor and preserves its geometry. Swapping in Blood Gulch for either original was refused before extraction in separate native negative checks.

The explicit recover-known-stock path compiled the saved 6.5-unit road, 2-unit infantry cave and 4-unit high-ground route with H1A Tool and Invader. CE609 cache SHA-256 0f86e1609d26f386d048e5642a60cf97a29f4ce3d96e058e344ceecbd0a49881. Invader reported zero CRC mismatches, protected status and stubs. Spark independently read back 16,124 collision triangles, one resident BSP, 42 donor scenery placements and 524 standing clearance samples: 133 road, 193 infantry cave and 198 ridge. The compiled receipt now reports those rows individually. Both originals and all three bank hashes matched the retained inputs. All 21 focused BSP tests passed. Owned scratch cleanup completed, disposing 1,115,676,705 logical bytes.

No game session ran. Two-way pedestrian and Warthog traversal, dynamic scenery clearance, doors, sightlines and expansion from two regions remain open.


## 24 November - Native two-way Warthog trial setup

Run prepare-megaworld-walkthrough.mjs with the Invader folder, the exact validated native job directory, a fresh managed output path, and --drive <compiled.gsproject>. It confirms the parent CE cache hash and three authored routes, overlays only the scenario, and places the two original stock Warthogs enabled by default in Slayer and CTF at opposite approaches. Native readback verifies both original vehicle slots, type, team, eight spawn flags, position and rotation. The existing 68 start slots keep their gametype settings.

The guided CE609 test map gsmegaroad.map SHA-256 is 59542651cd6bba4d447acea25cbe2e62299f7b19526d27ef0e95f3df50aed47d. Against parent cd24914cd931eb42b9e50a9c77991d8b651f9ada2ef48c6fe7bf3fcff35fe33c the native BSP extracted byte-identically. The CRC passed. Warthog slots 7 and 9 face east and west at (42.312,32.849,-21.075) and (68.100,36.049,-21.075). The independent collision check found 16,124 triangles, 68 clear starts and 524 samples each way.

The first return check erroneously reversed the authored terrain seam and tripped its east-west source validation. The fix reverses sample order for every route, including seam sections, while keeping authored orientation. Twelve clearance and 21 assembly tests passed. Originals and all three resource banks rehashed exactly. The compile workspace and its alias were cleaned; only a bounded read-only handoff copy was staged for the companion. Actual game driving, walking, doors and peer acceptance remain open.


## 24 November - Local Forerunner traversal handoff

Replayed the reviewed three-route plan after the 0f86e160 build workspace had been retired. The newly compiled CE609 parent 98c1693d2979ee9cfbae07d6937eef15a025abd2745725ff52d0a3655c95d21d passed native compile, lightmaps and readback with zero CRC mismatches, zero stubs and unprotected status. The independently extracted BSP in the guided map matches that parent byte for byte. The guided map passed CRC readback with 68 start slots and verified Warthog slots 7 and 9 on opposite approaches. The compiler still reports unearthed edges and portal-divide warnings. Runtime visibility, traversal and collision remain open.

The sole retained map is gsmegaroad.map, 77,695,844 bytes, SHA-256 bb36c99c4f9acbcb57a67cf715ca344762ce6864a644b2057dff38b565aa66ae. Find the local read-only copy and traversal.json under %TEMP%\GuiltySpark-Traversal-Handoff\ce609-YQiEeZ\ready. The receipt pins the three original Custom Edition banks, ordered waypoints and both headings for each route, and both Warthog poses. The copy and all three banks were independently rehashed. The production checkout kept no map copies or build output. The final managed compile retired 1,065,006,789 logical bytes of scratch. Next acceptance is two-way foot traversal on each route and Warthog driving in both directions, including guest driving in private Forerunner.


## 24 November - Three-region native extension

The Forerunner integration contract verifies real two-peer road, cave and ridge round trips on exact CE609 ce043863cd80e26ce0b95f5449a33d80c6e796909f90ce1ae668bae817a993c2, including guest Warthog driving in both directions. Spark extended that exact input to Blood Gulch and retained the resulting read-only CE609 4733768fb91989cc5db1edb96dfc49091946da0198de3e51c92fa2617b33a286 at %TEMP%\GuiltySpark-Traversal-Handoff\extension-t0HCkE\ready\bloodgulch.map. Independent readback checked 524 samples across the three original routes and 440 along the new tunnel. The adjacent-terrain proposal was refused at an unsupported outdoor floor. The first Battle Creek proposal hit a blocking surface near (458.16,-33.77,-18.27) while checking the editable connector. Its revised entrance is still under verification.

Spark now preserves inherited route plans when opening a native CE assembly build and checks them during later connection builds. Managed native receipts seal the compiled loose tag inventory so the matching source can be reused when adding a region. Exact-build and modified-tag regression, desktop compile check, and frontend types passed. An inventory of installed CE sources independently found all 19 named multiplayer maps. These checks do not establish gameplay for the Blood Gulch extension or later regions.


## 24 November - Four-region native world and directed extensions

Moving the Battle Creek entrance to the original northwest ground-level start cleared the former native obstruction. Timberland, Sidewinder, Blood Gulch and Battle Creek compiled into one resident CE609 BSP. Exact SHA-256 f66931cdd82bb15655868a39d3b1a5682d8baa088f1da01bd3efafd47a280251, with 25,032 collision triangles and 13.33 of 23.00 MiB CE tag space. Independent readback passed 524 samples on the accepted road, cave and ridge, 440 to Blood Gulch, and 356 to Battle Creek. Pins for the two-region baseline, the three-region parent and the protected source banks held. Local artifact and source-bound route plans are under %TEMP%\GuiltySpark-Traversal-Handoff\four-regions-CahbDv\ready.

Two private Forerunner peers loaded the exact four-region cache on executable 6929b8d3ffb7bf80f713b6094bcdf25989bdb9fe8f50aa4d5fca210579af2226. Both observed the same player positions through guest tick 540, and the host ran to tick 660. Both exited zero and original inputs rehashed exactly. This verifies native peer admission. Physical travel on the new Blood Gulch and Battle Creek paths remains open.

Spark now drafts tunnels in six horizontal directions using native walkable collision patches near the selected side. The existing owner QA entrypoint can replay earlier route plans beside the latest connection in a single validated build. All 21 focused assembly tests and frontend types passed. The Ice Fields southwest draft passed source clearance and entered native compilation.


## 24 November - Rat Race makes five native regions

The northwestern infantry tunnel to Rat Race compiled with native structure and lightmaps. Its 2-unit width and 1.6-unit headroom target infantry. Source clearance rejected the southwest draft before compilation. The accepted CE609 map contains five regions and 27,272 collision triangles. Independent CE readback passed 1,684 samples across six paths, CRC 4779CFB8, zero stubs and zero protection flags. The 90,113,492-byte map has SHA-256 b88e52011c8cd513b5f5f9741a0fa49f67e8bf8c9b6940ebd3c26adb278d4bfe. Find the read-only map, all four source-bound route plans and verification.json in %TEMP%\GuiltySpark-Traversal-Handoff\five-regions-muG0Y7\ready. The parent map and original Rat Race source rehashed to their exact input identities.

Two isolated Forerunner peers on source 2f964860 and executable SHA-256 1f61cf95a10f82029b32422016954b9fd053dda3101650dbdd3a5de68ae31777 admitted the exact cache to a private Slayer session. Both showed both player positions through guest tick 510. The host reached tick 630 and both exited zero without a fatal diagnostic. The run verified map admission and player replication at spawn. Physical route traversal and Chupathingy admission are open for this revision.

Later extension builds now stage aliases for base shaders while preserving the already staged base dependency paths. This prevents repeated namespace growth as more regions are added. The Rat Race build and 86 focused BSP tests passed, with four existing tests ignored. Danger Canyon and Ice Fields still fail Halo Tool structure with exit 13. Exact Ice Fields JMS comparison found the tiny render-only triangle (0.0097 cm altitude) separately from three rejected collision edges across two-sided material boundaries. Removing the two-sided compiler flags produced eight edge-update errors and was reverted. The retained workflow cleans all owned build and loopback scratch.


## 24 November - Wizard and native BSP transition readback

Wizard compiled and baked at bearing 240 in Timberland, Sidewinder, Blood Gulch, Battle Creek and Rat Race’s existing world. The six-region CE609 SHA-256 is ee2c7b1fc264cdba0f55233ff0b77dffd5455dfdbd079034e3caa489cd982995 (93,131,676 bytes). Independent readback found 30,010 collision triangles and passed 2,030 samples on seven paths. Compiled tag data plus the largest BSP consumes 15,400,820 of 24,117,248 bytes (14.69 of 23.00 MiB). The four- and five-region caches used 13.33 and 13.99 MiB. The read-only six-region map, route plans and receipt are in %TEMP%\GuiltySpark-Traversal-Handoff\six-regions-OoHdp8\ready.

Forerunner 376af46d at executable SHA-256 87606ab108d796632914925d6e22d25f2c7ffbe4aeca0fef3df3f31732270d51 admitted the exact cache. The guest confirmed matching host map size and hash, and reached tick 540. The host reached 660. Both exited successfully with no fatal diagnostics. The guest and host test uses loopback and does not cover physical traversal of the newer regions.

Invader compiled a disposable native multiplayer fixture from the verified six-region source, with two BSP references and existing-style trigger volumes bsp0,1 and bsp1,0. Cache cabbd6659a70aee225da11ab2a78412cfd45663070ad61f988b4444c5a580c5d contained the exact resulting 0→1 and 1→0 entries, passed CRC, and reported 16.97 MiB across both BSPs while only 14.69 of 23.00 MiB counted toward resident tag space. The [pinned Invader source](https://github.com/SnowyMouse/invader/blob/696830ff80af227e84e7237c2ef26eb2301ed110/src/tag/parser/compile/scenario/pre_compile.cpp#L800) derives these fields from the ordinary trigger volume names. [Halo 1 BSP documentation](https://c20.reclaimers.net/h1/tags/scenario_structure_bsp/#bsp-transitions) describes one resident BSP and identifies stock multiplayer synchronization as an open limitation for this use. The fixture proves compilation and encoding. Runtime transition and multiplayer synchronization require separate evidence. Spark now retains Invader’s tag-space report in build status and the native receipt. Its focused native world source test passed.

The alternate Ice Fields approach (bearing 300) produced six open edges. A generated collision fan triangle near the tunnel exit measured 0.00227 cm in altitude and accounted for three edges. The other three matched the same translated donor-wall loop as the earlier southwest attempt, where a two-sided surface borders the one-sided hull. Danger Canyon at bearing 120 passed source route clearance and failed native structure with seven open edges, each adjacent to the same two-sided donor material. Three border the sky roof and four border the lower donor surfaces. WRL SHA-256 values are 1d8c15de90b78c5f9821eb3755b8680d451dffb271ffaa37b6cef16638ee3767 and cb52cce38fabb528123541331a6f255cbb139beae1072967301e8a27e84763fb. Use the [WRL repair procedure](https://c20.reclaimers.net/h1/guides/levels/bsp-troubleshooting/#error-edge-is-open-red) to close the structural winding and repair the generated sliver while preserving authored collision properties. The installed HCEEK archive contains both scenarios and native BSP tags. It contains no corresponding original editable JMS for those maps.


## 24 November - Longest and the Danger Canyon structural repair

Longest compiled and baked at bearing 180. Timberland, Sidewinder, Blood Gulch, Battle Creek, Rat Race, Wizard and Longest now share one resident CE609 BSP. Cache SHA-256 1d05ce00c146f6f7a7d7ba0cb0bbe714ba86eda792455ca9d04884f925f08705 is 93,665,520 bytes. Independent readback passed 2,323 samples on eight paths and found 31,870 collision triangles. Invader reported 15.07 of 23.00 MiB tag space (65.54%). The pinned read-only map, route plans and receipt are at %TEMP%\GuiltySpark-Traversal-Handoff\seven-regions-SsP1wt\ready.

Forerunner c55c7c90, executable cb1063473de096a952c83f32fa946efb08d0e70ab2678af8ece0d91e957d6f4b, admitted the exact Longest cache on two private peers. The guest verified the same cache size and hash and reached tick 540. The host reached 660. Both exited without fatal errors. The separate dual-BSP diagnostic cache 9e7cc521247808812df0fc1d026e94285226ec2e5a17b1261c53c0f04f206464 loaded in both peers, but neither exposed an active BSP result. No runtime switch or synchronization acceptance derives from that session.

The two Danger Canyon WRL loops needed three native +seamsealer faces. Halo Tool accepted the disposable structure (SHA-256 98c34a784eb254c08fc746990b62632b717f1a46d4d636f393543c968c506b76) and independent inspection still found the source two-sided material. Spark’s existing connected BSP editor now accepts ordered vertices of reviewed native boundary loops. It validates them against exact merged-mesh edges beside the two-sided donor faces, keeps their original material flags, and includes the repaired collision in preview, native JMS, and route validation. The normal Spark pipeline passed structure with these authored seals. Lighting and final cache readback are pending.

Danger Canyon north fork, exact six-region parent ee2c7b1f, bearing 120. Enter these world-space loops one per seal in Native boundary seals. Apply connection, then Preview joined seam & clearance. The original Tool diagnostics used JMS coordinates at 100 units per world unit.

```text
-134.306445 292.548223 3.471387
-126.299209 282.113164 3.471387
-130.497852 286.307090 3.471387

-128.812197 285.388066 -5.268812
-130.497852 286.307090 -5.651225
-126.299209 282.113164 -6.226707
-128.799453 285.371484 -5.263043
```

Focused BSP checks passed 87 with four existing ignored tests, and frontend types passed. The UI remains subject to desktop interaction verification.


## 24 November - Chill Out and the native lightmap deadline

Chill Out compiled and baked at bearing 120 in the exact seven-region parent. The eight-region CE609 cache SHA-256 is d2f2b2e6c0da30120d323d86efb459182d783d547b3084f2386456a0fb12bac3 (99,416,084 bytes). Independent readback passed 2,628 collision samples across nine paths and found 34,674 collision triangles. Invader reported 15.78 of 23.00 MiB tag space (68.59%). The read-only map, source-bound plans and receipt are at %TEMP%\GuiltySpark-Traversal-Handoff\eight-regions-DyMmJP\ready.

Forerunner 90fec016 at executable SHA-256 58a684cbf62780cd2b81531da5637060693aa7d599facd476c8b08fcf753e855 admitted the exact eight-map cache. Both isolated peers exited normally. The guest confirmed matching host map size and hash and reached tick 510, and the host reached 630. Physical traversal of the newer paths remains open.

The first Chill Out, narrowed Danger Canyon, and Prisoner lightmap runs each finished after Spark’s old ten-minute soft limit. Their remaining compile and readback stages were cancelled. Spark now allows 30 minutes for native lightmap writes with the same between-phase cancellation and storage checks and the same native validation. The corrected Chill Out run reached complete readback and cleaned its disposable output.

Danger Canyon’s initial blue lightmap witness cf41750fa266b3814b1750183945226f17635472ae7452e1cd7723b35247c49f identified two floor wedges on the donor ground shader. The shader’s native simple parameterization flag is enabled. Adjusting the tunnel width to 2.25 world units removed the entrance wedge. Spark now reruns its existing coplanar diagonal repair at export precision and handles a small UV-chart error only on near-collinear render faces, keeping the vertex coordinates, UV values, material and collision faces. The measured same-shader floor quad had a UV error of 0.000320 and alternate triangle altitudes of 188.51 and 126.77 cm. The original blue triangles are absent from exact regenerated source (75,238 triangles). Ten focused triangulation tests passed. The updated full Danger Canyon bake remains under verification.

Ice Fields at bearing 300 passed native structure with its reviewed donor closure and a 2.25-unit passage. The earlier full run stopped in native radiosity. The new run starts from the eight-region cache and captures the lightmap-specific WRL if the solver rejects it again.
