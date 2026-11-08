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
