# Native assets and the animated home showcase

This continues `e8b5761` and preserves C35–C39 history, native reconciliation/build safeguards, experimental research and the unfinished direct compiled-map editor.

The later [C55 native asset pass](CONTINUATION_55_NATIVE_ASSETS.md) adds supported QuickForge Alt-drag/copy/paste and native build/readback, source-authored model emission, legal diffuse-free glass, source-aware preview lighting and the Xbox zero-range fog correction. It supersedes the older presentation-lighting description below. Complete local model lighting, engine shader parity and direct imported-terrain reshaping remain open; the historical reports below are retained.

The later [native looping-emitter milestone](NATIVE_LOOPING_EMITTERS.md) adds verified MCC bank-backed sound imports and native QuickForge sound scenery. It supersedes the blanket compiled-emitter gap only for that local source path; native gameplay listening and the broader audio goals remain open.

## MCC source-local vehicle lighting and source-owned resources — 10 November

MCC vehicle lighting now uses the same bounded source-local sampler as the classic cache families, only when original native bitmap metadata and the exact verified pack agree. Independent R482 readback pairs667original-map/imeta images;595match 2D shape, not necessarily encoding. The Warthog diffuse has native9mips below base but8usable packed levels including base; these are different contracts. Its original512x512 DXT1 metadata matches. The reader retains original pack dimensions even when a selected lower level is1px. It exposes the original native count only for matching2D, unswizzled base dimensions/encoding and valid packed count. Mismatched metadata never relabels pixels or rejects an otherwise valid packed preview.

A real counterexample is MCC ui/hud/bitmaps/combined/hud_unit_backgrounds image8: native512x128 versus packed256x64. R487 independently reads both records, selects that exact tag in the actual Windows Tag editor, clicks Next bitmap image8times and verifies the256x64preview. Native sampler count remains unavailable. Alpha and visible premultiplied RGB errors are both0. Unassociated RGB differs in1227components after Canvas readback; those invisible/rounded values are not corrupt source. This comparison follows the [HTML Canvas transparency contract](https://html.spec.whatwg.org/multipage/canvas.html#pixel-manipulation); exact original packed-byte assertions remain unchanged.

The existing textureResourceScope module now provides one recorded-source bitmap-bank selector for World, standalone bitmap preview, Workshop, owned-model seeds and compatible-donor textures. A stray optional MCC pin cannot override a classic source bank. Unit coverage exercises both pins together and absent/wrong-edition pins. In R487 the actual Studio selector changes from Chupathingy to CE and back while the same native World canvas, MCCsourceSHA,135applied samples and camera target remain. No game is launched by this hosting preference test.

| Original source; exact current QA | Native run | Eligible probes/applied | Selected Warthog local sample | Fixture duration |
|---|---|---:|---|---:|
| MCC Blood Gulch13 |R487|135/135|yes|34.055s|
| CE Timberland609 |R488|145/145|yes|34.054s|
| Chupathingy Blood Gulch5 |R489|112/112|yes|30.846s|
| OpenCE Blood Gulch5 |R490|112/112|yes|28.683s|
| Original Zombie Demo6 |R491|165/165|no valid floor at modified car|33.040s|

All5runs complete with0JavaScript errors, normal close, unchanged original map/resource hashes and disposed owned scratch. Counts are valid eligible floor probes, not all scene objects. OpenCE/Chupathingy original maps have identical bytes; these are two installation checks, not two distinct formats. Runtime worker times include asynchronous I/O/queue work and are not a cold-start/performance comparison.

R483 passes22bitmap Rust unit tests and4MCC pack integration tests; R485 passes481frontend tests, TypeScript, source contracts, offline and40storage/repository checks, then fresh Windows compilation158.065s. R492 passes all3real-GPU shared-material cases, including exact local RGB53/101/137, glass/detail/reflection order, explicit environment overrides, baked BSP ownership, green-screen and retained geometry. The previous full914Rust/9explicitignored and275browser runs remain separate historical scope; they were not all repeated for this bounded metadata increment.

Current temporary QA: E/qa-vehicle-mcc-r485/GuiltySpark.exe,50,512,896B, SHA4c5305e2372e480aab7eedfc9e9916747603160efa7bd2b5c4f62c4ca78fb117; runtime-source fingerprintf7a713b0683c4f08aa7b4fe186393c613f07eae9c5b0901d16c49bb90d6a5ddb. Built from e70dab2 plus this reviewed increment; exact runtime fingerprint is rechecked before reuse. This is not a release or installer. Receipts/logs: E/vehicle-mcc-contract-r482, vehicle-mcc-match-r483, vehicle-mcc-source-r485, vehicle-mcc-ui-r487, vehicle-source-{ce-r488,chupa-r489,opence-r490,demo-r491} (.json/.log) and vehicle-source-gpu-r492.log.

Native same-source close captures: before E/vehicle-local-mcc-r476-native-vehicle-world-closeup.png (SHA92b4fddf4a8e75a4636b415379c6f19fee2a4d02439710d11d1e68443345d7b2), after E/vehicle-mcc-ui-r487-native-vehicle-world-closeup.png (SHA863eb2c09e9d63a0882219659ab5214efed0ccd502fde1a49a9c87370349efa3). The negative native image screenshot is vehicle-mcc-ui-r487-native-mcc-unaligned-bitmap.png (SHA40aedb657164b01513722e9ee5b9e6488bdaf9f6ce40ad02b1dad6d9c57d7d1f). These are original full app captures, not crops or a pixel-matched game comparison.

Failed fixtures remain recorded: R482 first treated separate BSP data as ordinary tag memory; corrected independent parsing without relaxing bounds. R484 matched both exact and similarly named tag rows; the test now selects the exact row. R485 incorrectly compared invisible/unassociated Canvas RGB; R486 recorded the newly added test result before its container existed. R487 fixes those test defects and retains source byte, image identity, dimensions, alpha and visible-colour checks. No production code changed after the R485 executable. No original writes, SDK tree, replacement archive, new renderer or brightness workaround. Owned test/build disposal is logical byte accounting, not a measured physical disk delta.

**Still open:** H29 matching in-game appearance, native vertex/reflection interpolation, contact shadows, runtime poses/animation/physics, scenery corner averaging and authored mip chains on the actual 3D GPU textures. Four Warthog dashboard meter triangles and3179original Demo carrier light-reference triangles remain unsupported. No new native map compile, game loading, human driving, real-peer or release acceptance follows from this preview increment. The475requirement ledger remains byte-unchanged.

## Applied native vehicle lighting — 10 November

The placed-model startup reader was bypassing the existing object reader and dropping native bounds, brighten flags and change colours that the interactive model preview retained. It now reuses that same reader. World uses the original object/root-bone/placement centre, source BSP incident vectors, exact lightmap page and the floor shader's actual diffuse image and authored lower mip to calculate static ambient, two directional terms and reflection tint. HaloMesh and the existing shared material apply these values without rebuilding geometry. Source emission, glass, authored detail/reflection order, explicit environment overrides, prelit/BSP ownership and green-screen remain separate. No global brightness, replacement texture, native tag write or second renderer was introduced.

The signed-short BSP permutation is interpreted before image selection. Negative invalid remainders are unavailable rather than wrapping into another image; signed zero remains image0. The declared classic mip count includes Xbox padding, so sampling does not infer it from the usable-level count. Invalid optional bounds retain valid model geometry. The bounded worker reuses existing source/revision/resource-keyed caches, at most1024probes,256unique images per phase,8requests per chunk and64MiB decoded pixels. Cancellation prevents a previous source or transform from applying late. An over-budget source is explicitly unavailable, not endlessly pending.

**Historical R466–R480 scope (MCC superseded above):** source-pinned, default-pose centre lighting for supported units/items (vehicles, bipeds, weapons and equipment) on cache5/6/7/609. Scenery's additional native bounds averaging, live pose/physics, contact shadows, native vertex/reflection interpolation and original GPU mip chains remain open. Standalone tag previews use the same material equations but their inspection/source-sky context is not a placed object's floor sample. MCC13 retains the existing verified source-sky path; its pack sampling contract is explicitly unverified. The altered Demo Warthog outside the sampled floor also has no invented local result. Four stock Warthog dynamic-meter triangles and3179Demo carrier light-reference triangles remain unsupported.

R466 passes914Rust workspace tests/9explicit ignores,480frontend tests, TypeScript, source contracts, offline regressions and40storage/repository checks. The final warning-only binding cleanup passes R471's275browser tests (574.798s), fresh Windows build and Chupathingy native workflow. The later signed-index correction passes focused source math and R473's current480frontend/TypeScript/contracts/offline/40storage checks plus a fresh Windows build162.375s. R474 repeats all3real-GPU material cases on that source: local RGB53/101/137, zero-direction27/50/60, explicit override, baked-object/BSP, glass ordering, chroma and lighting-only geometry reuse pass with no shader errors. These are separate scopes, not a claim that every suite reran after every comment.

| Source, exact R473 executable | Native run | Eligible floor probes / applied | Selected Warthog local sample | Fixture duration |
|---|---|---:|---|---:|
| CE Timberland609 |R475|145/145|yes|33.887s|
| MCC Blood Gulch13 |R476|0/0|unverified pack contract|32.054s|
| Original Zombie Demo6 |R477|165/165|no valid floor at modified car|35.044s|
| OpenCE Blood Gulch5 |R478|112/112|yes|29.161s|
| Chupathingy Blood Gulch5 |R479|112/112|yes|28.563s|

All five actual Windows workflows pass source-byte/model/UV/material/native-mip readback, actual Tag editor selection, Objects selection, F framing, Escape deselection and24mouse-wheel gestures into a useful close view. Camera distance changes7.889867→2.303760 without moving its target. Screenshots are original app captures, not crops. All original map/resource hashes remain unchanged, normal application close succeeds,0JavaScript errors and owned staging disposal pass. OpenCE and Chupathingy use the same Xbox cache bytes; two installations do not establish two different formats. Probe counts are eligible valid floors, not complete scene-object coverage. Durations include hashing, readback and interaction and do not establish a speed improvement.

Historical QA R480: E/qa-vehicle-local-r480/GuiltySpark.exe,50,524,672B, SHAdb1e9b57bfdd46cce04090afc1ab2d71a96e119e6e5f71697d410eee317412e5; runtime-source fingerprintb02da9ed3878d3b49734ffa4f67f3fdfae848eab8a5acf9339c02cc0df068108. Fresh Windows build158.598s/current480frontend/TypeScript/contracts/offline/40storage checks and actual Chupathingy28.739s pass after the final explicit-budget-status correction. Actual World112/112eligible samples resolve in2488ms, no errors, normalclose/originalhashes/disposal pass. This is a single asynchronous worker observation including I/O/queue time, not a speed comparison. The final original close PNG SHA is b1bfe0de5bd3c64dade5ebf5154b0193513e6256e29ca74a9d865fb349a1dbc7. Built from752599a plus this reviewed increment, not an installer/release. The matrix above uses the preceding exact R473 binary (SHAbbc694b815c0d8b8b8306167177aa0524cf7638fd30bf9db5c2c88d1700b1e9a/runtimeFPb54037e4dd3d38cca878be783b909047088f2b042928cc4d4c58ea89fc355b6a); only over-budget diagnostics changed afterward.

Actual evidence: E/vehicle-local-final-r480.json/log and its native PNGs, E/vehicle-local-signed-r473.json/log, vehicle-local-gpu-r474.log and vehicle-local-{ce-r475,mcc-r476,demo-r477,opence-r478,chupa-r479}.json/log. Their -native-vehicle-world-closeup.png files show the closer placed vehicles; -native-vehicle-warthog.png and -native-vehicle-scorpion.png show the actual Tag editor. Before: E/vehicle-lighting-frame-r434-native-vehicle-world-warthog.png. Native game observation: E/vehicle-matched-camera-r435-warthog.jpg. F framing is retained separately in -native-vehicle-world-warthog.png. The game image and editor do not have accepted pixel-matched FOV/physics/pose; **H29 remains open**. No new native map compilation, game launch, driving, human or peer acceptance is implied.

Failed attempts remain recorded: R459 admission conflict, R460 geometry-identity fixture sequencing, R461 signed-zero assertion, R463 invalid optional float rejection, R464 JSON/native-f32 assertion, and R465 the genuine missing startup appearance metadata. R462/R466 onward correct these without changing source bytes or weakening image/material validation. R472's wheel path passes but the extra filename was omitted from evidence export; R473 repairs the whitelist and R475–R479 retain real close captures. No replacement archive or SDK tree is generated. R480 disposes1,853,152,900logical bytes of owned build/test output; this is not a measured physical free-space delta. R481 verifies the current QA fingerprint against committed9f36da7 and retires only the4nonrunning manifest/receipt-verified R464/R466/R471/R473 QA executables (202,056,192logicalB), retaining compact manifests/receipts/captures and the current R480 app. Exact retirement receipt: E/vehicle-local-checkpoint-r481.json. Protected originals/releases are untouched; no physical-delta claim.

Read-only references: OpenCE899219cc0a14b03bc12f0517a1e9ee4c37158af8 (AGPLv3), objects/object_lights.c::sample_diffuse_texture/build_distant_lights/lights_distant_lighting_at_point/lights_prepare_for_object_static and structures/structure_bsp_definitions.h::permutation_index; Chupathingy9990568507eede8b81edd5437a4860de5465c408 (GPLv3), corresponding object/unit/item lighting flags; Invadere8b58542fd1e0a239d0fbc689ac4e55b80e79442 bitmap/BSP format definitions. These are version-pinned format/mathematical research; no engine implementation is imported into Spark. Native gameplay fidelity and the475-requirement/M1–M6 mandate remain unfinished.

## Authored bitmap levels — 10 November

The existing native bitmap/resource/MCC reader now exposes genuine selected mip levels, retaining the source SHA, exact tag/image/mip identity, whole original image span and resource pins. Internal truncated chains, resource-entry escapes, invalid levels and duplicate requests are refused. Xbox compressed 2px/1px tails are padding and cannot be presented as original images; PC tails remain valid blocks. MCC pack counts include the base image, independently of classic bitmap counts. No replacement pixels are generated by this inspection path. Cross-runtime substitutes remain explicitly top-only until their lower-level compatibility is independently established.

Use **Tag editor → select a bitmap → Materials → Original texture detail**. Full resolution and original smaller levels use the same bounded decoder/cache; the selection is retained per map, tag and image. Switching context preserves it, and pending requests cannot relabel old pixels. Reflection cubes retain their separate existing top-face workflow. This does not create a second renderer or edit source tags.

| Original source | Native run | Source-declared levels | Usable levels verified | Original packed bytes compared | Native fixture duration |
|---|---|---:|---:|---:|---:|
|Chupathingy Blood Gulch|R454|10|8|174760|27.067s|
|MCC Blood Gulch|R455|8|8|174760|30.190s|
|CE Timberland|R456|10|10|174776|32.247s|
|OpenCE Blood Gulch|R457|10|8|174760|27.004s|
|Original Zombie Demo|R458|10|10|174776|31.288s|

All44 returned levels match independently recovered original bytes. Actual Windows controls select a smaller level, verify the canvas RGBA hash, return through Properties/Materials, retain the selection and return to full resolution. Invalid/duplicate requests fail. Original map/resource hashes remain unchanged; each app closes normally with0JavaScript errors and owned scratch disposed. Chupathingy/OpenCE contain the same Xbox map bytes, so these are separate installation checks, not different native formats. These durations include additional source hashing, byte readback and interaction; they are **not a before/after rendering-speed comparison**.

R454 frozen acceptance:914Rust workspace tests pass,9explicit opt-in ignores;480frontend tests,275browser tests, TypeScript, source contracts, offline regressions and40storage/repository checks pass. Fresh Windows build167.744s; Chupathingy fixture27.067s. R450 previously passes759core/7ignored; R451/R452 expose the missing selector markup, corrected before R453's7focused browser passes. No assertions or byte/source bounds were relaxed. R454 disposes5,134,008,988logical bytes of owned compilation/test output, peak5,197,985,262B; no SDK is extracted. Logical disposal is not a measured physical free-space delta. Later native runs reuse the exact QA app rather than rebuilding.

QA app: E/qa-vehicle-mips-r454/GuiltySpark.exe,50,508,800bytes, SHAb88d13c3e4f91114b70a7e4c3414f3489bb643eb94f96d7fa359d136d4d62671, runtime fingerprint765c498dfda9fee8d293ab7d55ddc4cc06afdddef9943a72786ec68d34e22a61. Built from3a33a75 plus the reviewed implementation; not an installer or published release. Receipts/logs: E/vehicle-mips-full-r454 and vehicle-mips-{mcc-r455,ce-r456,opence-r457,demo-r458}. Native screenshots use the same prefix plus -native-vehicle-original-mip.png; all per-level hashes are in the receipts.

**Vehicle game parity remains open.** World/model materials still use display-generated mipmaps, and native local lightmap/diffuse lighting, reflection tint, contact shadows and runtime animation are not established by a bitmap inspection test. The accepted original-level reader is the dependency for that work, not its completion. H29 remains pending; source-dependent native meter/effect limitations below are unchanged. No new Halo map compilation, game loading, driving, human or peer acceptance is claimed.

Format references remain read-only and version-pinned: Invadere8b58542fd1e0a239d0fbc689ac4e55b80e79442 bitmap_data_size/class bitmap and OpenCE899219cc0a14b03bc12f0517a1e9ee4c37158af8 bitmaps.c::bitmap_2d_address / bitmap_2d_get_pixel. No third-party engine implementation is imported. The original counts/padding and MCC spans are also verified directly from the installed source data.

## Source-local lighting data — 10 November

This is an accepted source-data increment, **not a new visual/game-parity pass**. Independent R440 readback proves original Xbox, MCC, CE and Demo BSP lightmap vertices contain non-unit incident-radiosity vectors which the existing reader discarded. Beneath the diagnostic Blood Gulch Warthog point the vector is approximately[.615502,.116209,.679006], rather than the surface normal. The existing bounded reader now preserves those vectors and their original magnitude; each material declares whether its secondary stream is valid. Missing/corrupt data remains unavailable with aligned zero padding. It never substitutes a geometric normal, and a bad lighting vector does not discard valid diffuse geometry or lightmap UVs. Old metadata remains readable; newly authored/unbaked meshes do not claim native radiosity.

The existing haloLightmap module can query the nearest source floor, its exact BSP/page/shader identity, UVs, interpolated incident vector, direction and accuracy. It rejects missing/invalid data and ambiguous coincident BSPs; it cannot use a lower floor's lighting through an unavailable upper floor. This helper changes no scene colours and retains no new global cache. R445 measures4.413ms on actual Chupathingy IPC geometry; MCC4.207ms, CE5.053ms, OpenCE5.404ms and Demo3.167ms. These are single diagnostic queries, not cold-load/FPS improvements or measured runtime lighting. The altered Demo vehicle lies outside the sampled floor and correctly returns null.

| Original source | Native run | Incident coordinates compared | Valid ranges | Mismatches | Duration |
| --- | --- | ---: | ---: | ---: | ---: |
| Chupathingy Blood Gulch |R445|17370|35|0|24.009s|
| MCC Blood Gulch |R446|17286|35|0|24.831s|
| CE Timberland |R447|26988|95|0|27.089s|
| OpenCE Blood Gulch |R448|17370|35|0|23.614s|
| Original Zombie Demo |R449|17286|35|0|26.120s|

Each real Windows run also retains original vehicle UV/material/reflection assertions, actual source preview controls, normal close,0JavaScript errors, unchanged original hashes and disposed owned scratch. Original-byte calculations are independent of the Rust decoder. Chupathingy/OpenCE use the same source bytes; separate installations do not imply distinct formats. There is no new gameplay, local-shadow, animation, dashboard or exact-renderer acceptance.

R442 passes756 locked spark-core tests,7explicit opt-in ignores, including the actual geometry_tests BSP case. R441 had a wrong test-module filter and ran0tests; it is compile-only evidence. R444 passes480frontend tests, TypeScript, source contracts, offline checks and40storage/repository checks. The broad274browser suite last passed R433 before this source-data increment; it is not presented as a fresh full pass.

The fresh R443 Windows build succeeds in174.870s, but that wrapper requested the incompatible workspace scope and its unchanged guard refuses native vehicle mode before app launch. R445–R449 use the correct native scope and the exact exported app:50,511,360bytes, SHAb3176dd1087fe3cad94edfb87957e9b30068fadec9923112d1d65f0de6479ca8; runtime fingerprintd33d924787fc4cc7adb1be7c23e7ee4dd814be82d9f343dbd9db82fac3980be9. It is a QA app from14b6b1e plus reviewed source, not a release. Evidence: E/vehicle-source-radiosity-r440.json, vehicle-radiosity-r441/r442.log, vehicle-radiosity-r443.json/log, vehicle-radiosity-frontend-r444.json/log and vehicle-radiosity-{chupa-r445,mcc-r446,ce-r447,opence-r448,demo-r449}.json/log. No SDK was extracted for previews; all owned build/test payloads were disposed.

Read-only format reference: Invadere8b58542fd1e0a239d0fbc689ac4e55b80e79442 scenario_structure_bsp lightmap vertices (20B PC/8B Xbox). OpenCE899219cc0a14b03bc12f0517a1e9ee4c37158af8 object_lights.c sample_lightmap/sample_diffuse_texture/lights_distant_lighting_at_point and bitmaps.c::bitmap_2d_get_pixel establish that object lighting additionally needs actual lightmap/diffuse pixels and mip selection. Spark currently previews top mips and generates display mipmaps; those are not automatically the authored lower mips used by native sampling. **Next: recover/validate the required original mips, then apply and compare local vehicle lighting.** No third-party engine implementation was imported.

## Placed-object source lighting — 10 November

The actual World code only enabled native-material lighting when an explicit editor environment override existed. Its placed vehicles therefore bypassed the verified source sky which the large tag preview already used. World now opts source objects into that existing environment/material path. Baked lightmaps retain ownership of BSP/prelit-object illumination, sky geometry remains exempt, reflection is still added separately, and an unavailable source sky does not authorize a replacement rig. No source colours, sky values, exposure, normal data, native tags or original maps are changed.

The new real HaloMesh/SceneEnvironment GPU regression first fails: source-lit object160 instead of64. After the fix it yields64 while unverified-source160, baked BSP96, prelit object96, explicit override48 and greenscreen[0,255,0] remain independently checked. Each sample uses1draw/2triangles. The same geometry ID survives lighting-availability changes. An initial fixture incorrectly omitted its lightmap-page declaration; that setup was corrected before the red/green acceptance, without changing the expected pixels.

R432 fresh Windows build202.835s and native Chupathingy26.262s pass. R434 strengthens actual Objects drawer selection → F framing → full viewport/drawing-buffer checks:1482×704CSS and1482×704buffer; camera[34.137,-95.8342,4.08644], target[29.137,-90.8342,.58644], source Vehicle-0 at[29.137,-90.8342,.286439]. Its26.467s run passes native source identity, actual sky ambient/sun values, UV/material/glass readback and normal close with0errors and unchanged original hashes. An earlier R432 screenshot caught a transient drawer-resize buffer; R434 waits for the measured complete viewport rather than accepting that frame. No production resize workaround was introduced.

The actual private Chupathingy R435 test then loads that camera through the native console. Its telemetry confirms[34.1,-95.8,4.1]. Window request1482×704; observer FoV1.369533rad follows the pinned native0.75×0.85vertical-tangent conversion for the editor's55-degree vertical view. The native capture provides a comparable source vehicle/viewpoint; rendered physics/pose, local lighting/shadows and exact engine parity are still open. Exit0, original17members/3maps/config unchanged, owned877,538,807logical/877,601,608allocatedB disposed. No public server, installed-game change, human/vehicle-driving or peer acceptance is inferred.

Actual images: E/vehicle-lighting-frame-r434-native-vehicle-world-warthog.png and E/vehicle-matched-camera-r435-warthog.jpg. The latter is the unmodified native helper JPEG276,671B, SHA8c1b4100191aa48c43479764bfc5f01e8306faf16905dc7f79596e824957a1f5, not a lossless pixel-parity test. Camera/source/format findings remain in vehicle-matched-camera-r435.json. No proprietary pixels are committed.

Current QA E/qa-vehicle-lighting-r432/GuiltySpark.exe:49,762,816B, SHA795ffce4eee20b643e57eb16eacae3ad1e54c27ac7b15f7b4dac2f25fae13332; runtime fingerprint0a1462e402aa7c0eca9ddbd222243b5852e6864fe7f3043959f88496aec729a5. Built fromee12b9e plus this reviewed source diff, not a clean release. R433 passes480frontend/274browser, TypeScript/contracts/offline/storage;26,470,807logicalB of output disposed. Rust production source unchanged; prior911passed/9opt-in ignores is not rerun acceptance.

R436 MCC24.599s, R437 CE27.210s, R438 OpenCE23.872s and R439 original Demo26.468s also pass the same source-matched Windows app. Each terminal receipt has complete:true,0JavaScript errors, normal close, unchanged original source hashes and disposed owned scratch. Actual placed-Warthog selection/framing and verified source-sky values are checked for the stock fixtures; Demo retains its source-specific material limitations. Chupathingy/OpenCE share source bytes, so these are separate installation checks, not independent format or game acceptance. Exact receipts: E/vehicle-lighting-{mcc-r436,ce-r437,opence-r438,demo-r439}.json/log.

**User path:** Work → Level editor → Tools → Objects → search and select the placed vehicle → F to frame. Work → Tag editor selects the same original model/material path for orbit/zoom. H29 retains separate local-lighting, reflection, dynamic-meter, physics and animation checks; no whole-directive or release acceptance is claimed.

## Native glass angular response — 10 November follow-through

A second reproducible glass defect was found against the exact installed Chupathingy0.9.0c/b506ba74 native shaders. Flat glass uses squared, signed camera-axis facing, then interpolates the eighth-power reflection cube and original cube by the authored endpoint colour. Spark had used opaque-model linear facing and multiplicative tint. Only the existing shared glass branch changes. Opaque model/environment reflection, source UVs, normals, images, lighting, exposure and geometry remain intact.

The real WebGL test fails before the repair: a 128-grey reflection at cosine0.5 gives97 instead of112; authored colour[0,.25,1] gives[0,24,97] instead of[1,29,112]. After repair all three cases, including the two-sided backface[128,128,128], pass. Earlier diffuse-alpha, tint-map, decal, detail-order and retained-geometry assertions remain unchanged. This verifies a native material equation, not full renderer parity.

R425 builds the actual Windows app in171.614s and verifies Chupathingy vehicle previews in23.001s. R427MCC23.163s, R428CE27.760s, R429OpenCE23.587s and R430Demo26.691s all pass independent original-cache UV/partition checks, original glass reflection endpoint readback and selected real GPU previews. All have0JavaScript errors, normal close, unchanged original hashes and disposed owned scratch. Native camera records are source-hash pinned. Chupathingy/OpenCE share the same original cache bytes; they are separate installation checks, not separate formats. No SDK tree is staged for these read-only runs.

QA app E/qa-vehicle-gloss-r425/GuiltySpark.exe:49,762,816B, SHAf031fa2280df254c5ee9e8c046e09091ee8502863e8e5df3cfc2fe3d9077e9ea; runtime fingerprint868276a77ce06c8384a0081ebfad863fbe7df9b15a0a5bfa7e64a344c6dc9ed3. Built from418f07e plus this reviewed source diff; it is not a release. Exact JSON/logs: vehicle-gloss-r425 and vehicle-gloss-{mcc-r427,ce-r428,opence-r429,demo-r430} under E.

R424 actual private BloodGulch/Slayer loads in Chupathingy and its native console saves/loads a ten-float camera file. Game telemetry confirms camera[32.2,-95.3,1.9]; the unmodified Warthog capture is E/vehicle-game-camera-r424-warthog.png, SHA7ed9a5d966fcf172454d404899e4583526a0011038fbd14d1a25596d7503804f. Original17runtime members,3maps and config hashes remain unchanged; exit0 and878,547,713logical/878,768,712allocatedB disposed. Generated shader payloads are disposed; only bounded diagnostic findings/hashes remain in vehicle-game-camera-r424.json. Camera angle/lighting differ from the isolated tag preview, so no pixel parity or human gameplay is accepted.

Read-only provenance: OpenCE899219cc0a14b03bc12f0517a1e9ee4c37158af8, source/rasterizer/xbox/rasterizer_xbox_transparent_geometry.c glass reflection section3087–3164; camera/director.c save/load401/444. The installed generated ps_26a0be30.glsl SHA5f7d34b770904629ee6567bee319441b138846554c9c978eb0d6b28d7d55d2f7 and vs043_0.glsl SHA2b95f5a7472cdfaba7cd1c33a27d9cfa8df74d3604d80c9cebe20f5fcfafde1b were independently compared. No third-party engine implementation or generated GLSL was imported into Spark.

R426 full regressions pass480frontend and273browser cases, TypeScript, source-entrypoint contracts, offline and storage tests. No assertion or storage limit was relaxed. Its26,480,313logicalB of owned output is disposed. Rust production source is unchanged; the prior R416911passed/9explicit opt-in ignores is preserved, not described as rerun.

R431 separately confirms the actual native opaque-model path uses linear camera-to-vertex facing and multiplicative endpoint colour, not the glass eighth-power combiner; no speculative opaque change is applied. Actual private game exit0, original17members/3maps/config unchanged, owned878,135,229logical/878,367,464allocatedB disposed. Exact vehicle-native-metal-r431.json retains bounded findings and generated-program hashes only; raw shaders were disposed. No new vehicle parity or human acceptance is inferred.

H29 remains open: source-local object lighting, full glass/reflection parity, animation and dynamic dashboard FunctionOut are not accepted by these tests. The unsupported4smet Warthog triangles and3179ligh Demo-carrier triangles remain explicit. Compare actual placed vehicles under matched camera/environment before claiming they look exactly like the game.

## 10 November glass, decals and retained model geometry

The existing shared renderer had two reproduced native composition defects. Model flag8 (alpha-blended decal) must disable the opaque alpha-test rule even when flag4 is clear. Native glass tints the background, adds reflection, then blends diffuse by its alpha. Spark instead added the full diffuse RGB, and could discard faint glass/decal pixels. The native flag reader and cached-metadata guard now retain fractional decal alpha; glass uses its actual diffuse/detail alpha and exact tint dependencies. No brightness, exposure, fallback texture, UV, normal, rig, LOD or original game data was changed by this repair.

For the tested static glass stages, the composition is D*a + (T*background + R)*(1-a). Non-neutral tint or a real background-tint map uses ordered tint/surface passes through the existing material builder; neutral tint remains one draw. Both passes share source images. HaloMesh, BSP Workshop and QuickForge use that same builder. The bounded read-only glass decoder now exposes Background tint map and its independent scale; corrupt floats or truncated bodies fail. Native fields do not become writable tag offsets.

A real React/Three component test also reproduced unnecessary geometry replacement when a texture record completed. The material legend now depends on its actual need and source mesh; changing texture records without changing the native pass layout retains the same geometry. GPU proof: the before check returned different geometry IDs; after, model/completed IDs are identical. Colored glass uses2draws/4rasterized triangles for2source triangles; neutral glass and greenscreen each use1draw/2triangles. Source images are not cloned. This is a specific reuse result, not a measured cold-load or FPS claim.

**Evidence:** intentional red native flag0x8, material and GPU tests precede the fixes. R416 passes911Rust/9explicit opt-in ignores,480frontend, TypeScript/contracts/offline/storage, but its broad browser run fails2navigation cases and is not acceptance. Both unchanged navigation tests pass focused replay. After source freeze, R418 passes480frontend and all273browser cases, including the actual shared model/BSP component, source transparency, reflection/detail order, glow, chroma mode and geometry reuse; TypeScript/contracts/offline/storage also pass. No assertion was relaxed. Earlier source/fixture edits overlapped R416; no precise failure cause is claimed from that timing alone.

| Original source | Cache | Native Windows run | Duration | Original unchanged / errors |
| --- | --- | --- | --- | --- |
| Chupathingy Blood Gulch |5|R417|26.847s|yes /0|
| MCC Blood Gulch |13|R419|24.569s|yes /0|
| CE Timberland |609|R420|28.228s|yes /0|
| OpenCE Blood Gulch |5|R421|23.768s|yes /0|
| Original Zombie Demo |6|R422|28.039s|yes /0|

Each native run independently verifies original model UVs, supported shader partitions, decal flags and glass tint/map metadata, then selects actual Warthog/Scorpion previews through the native Tag editor (Demo uses its two original Warthog-derived objects). All selected supported images load, JavaScript errors remain0, app close is normal and owned scratch is disposed. Other returned models receive source/mesh checks; they are not all selected GPU captures. Chupathingy/OpenCE use the same original map hash: two installation checks do not establish two formats or engine adapters. These are Spark Windows preview checks, not new Halo game playtests or native map compilations.

QA: E/qa-vehicle-glass-r417/GuiltySpark.exe,49,762,816B, SHAbf3d601fd0c9331a93bb6d6e4ca0d6ed96832a0fecfa76a7e45ab18e65fc681d; runtime fingerprint0a326214db9771492fa7f45a649a72b4daed8ab1c477e55e58893758b3648f92. It was built from31af61a plus the reviewed production diff, not a clean-source release. Windows build200.038s; parent peak1,910,620,833logicalB, disposed1,845,940,221B. R418 disposes26,475,018B; later native runs dispose their bounded profiles/libraries. No SDK tree, original installation, accepted release or GitHub artifact was replaced.

Exact receipts/logs: E/vehicle-glass-r416, vehicle-glass-r417, vehicle-glass-r418, vehicle-glass-mcc-r419, vehicle-glass-ce-r420, vehicle-glass-opence-r421 and vehicle-glass-demo-r422 (.json/.log). Actual native before/after captures: vehicle-coverage-chupa-r412-native-vehicle-warthog.png and vehicle-glass-r417-native-vehicle-warthog.png; MCC equivalents R410/R419. No Halo pixels are committed. Source research was read-only: OpenCE899219cc0a14b03bc12f0517a1e9ee4c37158af8 rasterizer_xbox_models.c decal state and rasterizer_xbox_transparent_geometry.c glass stages; Invadere8b58542fd1e0a239d0fbc689ac4e55b80e79442 glass schema. No engine implementation was imported.

**User path:** open the owned map → Work → Tag editor → search its vehicle path and select Vehicle → choose the result; orbit/zoom and Materials remain available. World/Asset Library use the same repaired material path. H29 remains open for stable game-matched local lighting, reflection/glass details, animations and dashboard FunctionOut values. The four smet dashboard triangles and original Demo carrier's3179ligh triangles remain explicit unsupported coverage. These source fixes do not certify full game appearance or close the475-requirement/M1–M6 mandate.

## 10 November native vehicle detail and reflection order

Original Scorpion shaders set shader_model's detail-after-reflection flag. Spark discarded it and always combined detail first. The shared parser now preserves the read-only flag, and the existing shared material renderer follows it. World, Asset Library and large tag previews retain one material path. UVs, normals, source colours, reflection cubes, lighting and alpha remain intact; no exposure adjustment, generic replacement material or native-tag mutation was introduced. Other shader classes do not reinterpret their first flag; old serialized previews default to false.

Format reference: Invader [696830ff80af227e84e7237c2ef26eb2301ed110, shader_model.json](https://github.com/SnowyMouse/invader/blob/696830ff80af227e84e7237c2ef26eb2301ed110/src/tag/hek/definition/shader_model.json). OpenCE899219cc0a14b03bc12f0517a1e9ee4c37158af8 source/rasterizer/xbox/rasterizer_xbox_models.c was reviewed read-only; no engine implementation was imported.

R399 genuinely fails real WebGL: flag toggling leaves pixel pairs88/88,76/76,145/145 across three detail functions. R400 and full R401 pass independently calculated88/56,76/28,145/177. Without reflection both orders remain24/24. Partial masks produce68/60 for PC-blue and Xbox-red conventions; alpha255 and existing transparency/glow/culling checks remain.

| Original source | Cache | Models / UV coordinates | soso references / after-reflection | Native evidence |
| --- | --- | --- | --- | --- |
| MCC Blood Gulch |13|5 /25302|24 /4|R401; strengthened R407|
| CE Timberland |609|5 /25302|24 /4|R402|
| Chupathingy Xbox Blood Gulch |5|3 /14660|15 /4|R403|
| OpenCE Xbox Blood Gulch |5|3 /14660|15 /4|R404|
| Original Zombie Apocalypse Demo |6|2 /15924|5 /0 on supported Warthog|R406; second carrier geometry/UV-only|

All checked UV mismatches are0. Each run uses actual Work → Tag editor → Search tags → Vehicle → model selection, preview material loading, Level Editor and independent original-cache readback. Source ordering flags match every checked soso slot. Chupathingy/OpenCE caches have the same hash; these are two installation checks, not independent formats.

**Demo limitation:** R405 failed the assumption that every vehicle has a model shader. The original rwarthog instead declares15 ligh references to effects\lights\coop teleport, with no supported material ranges. R406 explicitly records unsupported-original-non-shader-references rather than fabricating shaders or promoting UV recovery into rendered fidelity. Its other Warthog retains5 model shaders. An unrelated original bottle-glass reflection lacks an exact resource-index path and remains unavailable; fuzzy substitution is refused.

R401 full current-source regression passes909Rust tests/9explicit opt-in ignores,476frontend,271browser, TypeScript,1071source-module contracts, offline regressions and storage ownership. Fresh Windows build183.305s; native MCC24.513s, CE26.176s, Chupa22.776s, OpenCE22.296s, Demo25.706s; strengthened MCC23.972s. R406/R407 wrapper and child complete with0JavaScript errors, unchanged originals and disposed owned temporary data. No full SDK is staged for this read-only preview path.

QA E/qa-vehicle-order-r401/GuiltySpark.exe:49,772,544B, SHAc1a7feacee7096a3dd5a95d35d721b93f8f488d056bffe3a5a0335e7cecee2af; runtime-source fingerprint adae9e70c7c272c9303deb4b2a9a979bf9a6d2a325c1d423ee2696c12feb3316. Built from7b01cea plus this reviewed production diff; this is not a clean-source installer/release. E is the existing external Temp GuiltySpark-Engineering-d49eb02588bf root. JSON/log basenames: vehicle-material-r401, vehicle-order-ce-r402, vehicle-order-chupa-r403, vehicle-order-opence-r404, vehicle-order-demo-r406, vehicle-order-mcc-r407. R405 remains a failed fixture attempt.

Native screenshots: E/vehicle-after-r388-native-vehicle-scorpion.png before this ordering repair; E/vehicle-order-mcc-r407-native-vehicle-scorpion.png after. Corresponding native-vehicle-warthog.png and owned-native-bsp.png show the shared source-material path. No proprietary content is packaged in Git.

This accepts the demonstrated UV/ordering defects and native editor checks. Matched actual-game reflection, local lighting, glass, geometry/LOD and animation comparison remains H29. No new game/native-compilation acceptance is inferred; the accepted native build/recovery pipeline remains protected.

### Material coverage follow-through — 10 November

R408 reproduces a second defect in the actual Windows application: unsupported geometry reported0material gaps. Independent original-cache triangle-strip readback identifies4Warthog dashboard triangles (2each for native smet meter engine and meter speedometer), and3179/3179triangles on the Demo light-referencing zombie carrier. The source is unchanged; this failure remains recorded.

The existing nativeShaderTextures module now counts uncovered source-material triangles, merging overlap only once and reporting malformed attribution as unknown. NativeModelPreview displays a compact nonfatal status below its view controls, distinguishes missing supported shaders from unsupported geometry, and suppresses this render-material warning in Collision view. Source geometry, materials, lighting, native tags, exports and game files are unchanged. This diagnostic does not implement dynamic native meter rendering or replace the invalid carrier references.

R409 passes479frontend tests,272browser tests, TypeScript,1071source contracts, offline and storage regressions; the focused browser journey preserves a27field edit, context navigation, one model read and Undo back to10. New coverage cases test absent, partial, overlapping and malformed ranges. The unchanged Rust source retains R401's909passes/9explicit opt-in ignores; full Rust was not repeated for this frontend-only follow-through. Fresh Windows build181.567s and actual Demo preview25.587s pass.

Strengthened native checks independently rebuild original strip triangle counts and the exact supported per-shader partition, then compare actual mesh assignments and visible warnings. Unsupported attribution cannot excuse dropping any supported source material. R410MCC23.192s, R411CE26.404s, R412Chupa24.453s, R413OpenCE22.740s and R414Demo26.190s all complete with0UVmismatches,0JavaScript errors, unchanged original hashes and disposed owned scratch. Warthog and Rocket Warthog each have4unsupported meter triangles; checked Scorpion/Ghost/Banshee ranges are fully attributed. Demo carrier remains3179unsupported light-referencing triangles. Actual large Warthog/Scorpion previews have0missing supported shader images. Chupa/OpenCE original files are identical-format/hash installation checks.

Current QA E/qa-vehicle-coverage-r409/GuiltySpark.exe49,772,544B, SHA2ecf88c436ec6801f080b941338e62b244ff790da04c8ba200125b659c21496a, runtime-source fingerprint fc53edfda41add69b27eda01980249deca5325cba4a6564301355be7825c70a3. Built from93d7a66 plus this reviewed UI diff; not an installer/release. E/vehicle-coverage-r409.json/log and vehicle-coverage-{mcc-r410,ce-r411,chupa-r412,opence-r413,demo-r414}.json/log retain the exact scope. R409 parent disposes1,872,441,440logical bytes after a1,937,234,348byte peak; no Spark test process remains. Actual native warning screenshots are E/vehicle-coverage-r409-native-vehicle-warthog.png and ...-rwarthog.png, plus R410stock screenshots. No game-source pixels/assets enter Git.

**Still open:** native dynamic meter rendering, source-local lighting/reflection/glass/animation parity against matching game views (H29), and the broader native/game/peer/platform ledger. Warning correctness is not a rendered-fidelity pass for unsupported surfaces.

### R415 actual Chupathingy game observation — 10 November

After the source fixes in 3e34299/93d7a66 and coverage diagnostic a09f01c, Computer Use reached a real windowed Chupathingy0.9.0c/b506ba74 Blood Gulch match. Actual controls used: Multiplayer → Split Screen; create/select the isolated New001 profile; select Blood Gulch → Slayer → Start Game. The native UI reports one player. Game logs independently report the owned data root,1806map tags, all machines loaded, host ticks and the NVIDIA OpenGL renderer. This is a local game, not a two-player or public-server result.

The engine's existing cheat_all_vehicles diagnostic was invoked only inside this disposable offline session, then E entered a nearby Warthog side seat. The real game visibly rendered its rear hull, turret, interior and highlights. Its third-person transition and subsequent first-person view were observed, but the densely spawned diagnostic vehicles moved; no stable matched-angle/lighting comparison, normal vehicle-driving acceptance or full visual-parity pass follows. Screenshots were displayed in the Computer Use conversation; no independent game screenshot file was exported. H29 remains open.

The first manual fixture lacked the menu's carousel.map and correctly produced a native missing-map error naming levels/test/carousel/carousel. The corrected bounded fixture stages only17 pinned runtime members plus bloodgulch.map, ui.map and carousel.map. A requested local:bloodgulch:slayer debug startup did not automatically enter gameplay in this installed build; the actual entry was the mouse/keyboard UI above. Fullscreen capture returned stale frames; the documented F11 windowed switch restored current capture. Neither issue is relabeled a product rendering failure or a successful automatic launch.

R415 exits0 at its declared600-second native limit. Its original runtime members, config.toml and all three original maps retain identical SHA256 hashes. Owned scratch is disposed:898,522,542logical bytes /898,590,456allocated file bytes, peak898,526,990logical bytes under the unchanged1GiB reservation. Exact bounded receipt: E/vehicle-game-local-r415.json. Earlier manual game trial also exits0 and verifies originals; its owned877,906,814logical bytes are disposed. The separate Spark manual session ended exit1 and disposed78,411,382logical bytes; it is not a normal-close/Save acceptance result. No runtime, original map, SDK, release package or production source was modified by these observations.

## 9 November vehicle texture-coordinate repair

The owner reported vehicles still differed from the game. R387 reproduces a real shared-reader failure in the native Windows app: the Warthog has **7,380 wrong UV coordinates**, the Scorpion 4,768, rocket Warthog 8,544 and Banshee 2,098. The Ghost's unit-scale mapping already matches. All required Warthog/Scorpion images and their 4/1 reflection cubes were loaded, so decoding success alone did not detect this error.

Cached model vertices have normalized texture coordinates and separate model U/V factors. The reader omitted those factors. Native CE/MCC/Xbox Warthog factors are approximately 1.999474 × 3.000816; Scorpion 4.14882 × 0.999792. The shared reader in crates/spark-core/src/render.rs now applies validated factors once to PC float and Xbox compressed UVs. Zero retains the documented unit-factor meaning; nonfinite/excessive values fail. Position, topology, normals, rig, LOD selection, shader UV scales, materials and lighting are unchanged. World, Asset Library and large tag previews consume the same corrected mesh.

Read-only format research used Invader commit 696830ff80af227e84e7237c2ef26eb2301ed110: src/tag/hek/definition/gbxmodel.json fields and src/recover/recover_method.cpp model UV restoration. No third-party implementation was copied.

The existing bounded native lifecycle test independently reads the original cache's model factors and selected vertex streams, compares every returned UV, opens actual Vehicle tags through Search tags/class selection, waits for all preview materials and captures Warthog/Scorpion images. The Demo mod has two Warthog-derived carrier objects instead of a stock Scorpion; R393 verifies those exact preserved objects. R392's stock-fixture assumption remains a failed attempt. R386's new-test hash-parameter error was corrected before the genuine R387 failure; neither is acceptance.

| Original source | Cache | Models checked | UV coordinates checked | Mismatches | Accepted native run |
| --- | --- | --- | --- | --- | --- |
| MCC Blood Gulch | 13 | 5 | 25302 | 0 | vehicle-after-r388 |
| Custom Edition Timberland | 609 | 5 | 25302 | 0 | vehicle-ce-r389 |
| Chupathingy Xbox Blood Gulch | 5 | 3 | 14660 | 0 | vehicle-chupa-r390 |
| OpenCE Xbox Blood Gulch | 5 | 3 | 14660 | 0 | vehicle-opence-r391 |
| Zombie Apocalypse Demo | 6 | 2 | 15924 | 0 | vehicle-demo-r393 |

Each accepted run completes 3 real native cases with 0 JavaScript errors, no mocked IPC, all required preview materials, unchanged original hashes and normal app close. Owned build/profile/library scratch is disposed under existing budgets. These are **native editor/source fidelity checks**, not new game-process or human gameplay acceptance.

R388 also passes the full Rust workspace: 908 passed, 9 explicit opt-in ignores. Source-entrypoint check: 1,071 modules / 0 issues. Frontend source is unchanged; frontend 476/browser 271 remains historical R368 evidence, not newly rerun. PC/Xbox geometry regression additionally verifies 2×3 mapping, native zero factors, unchanged geometry/normals/indices and corrupt-factor refusal.

QA app: E/qa-vehicle-uv-r388/GuiltySpark.exe, 49,771,520 bytes, SHA 20b8038e101b51fbaae3577eb94c5c7575c6c59f55fe524371efc5b4151a93a3; runtime-source fingerprint 74e4d46f070c945ff71a47dc9e9879b6712cb5b2fdfbf507733edd447d8c92eb, built from 79588ca plus the reviewed dirty source. This is not an installer or published release. E is the existing external GuiltySpark-Engineering-d49eb02588bf Temp evidence root. R387-before and R388-after native PNGs remain there beside each JSON/log; no Halo bytes enter Git.

**User path:** Open the owned map → Work → Tag editor → search its vehicle path and select Vehicle class → select the result. The large preview and that map's Level Editor use corrected coordinates automatically. Materials shows original shader/bitmap references; orbit and wheel zoom remain available. No new setting or conversion is required.

**Still open:** matched in-game lighting/reflection/LOD/material comparison, vehicle animation states and gameplay. Four runtime source-map previews do not certify four engine adapters or game-renderer parity. H29 records the human comparison; existing M2/M3–M6 gates and all 475 requirement identities remain open where previously unaccepted.

## Workflow

Home renders the actual monitor from an owned installed MCC campaign cache directly over the page. It has a transparent background, source textures/reflections, presentation lighting and gentle cursor response. The C41 polish prioritizes an available monitor source directly; Chief/other characters remain fallbacks when that source is unavailable. Spark does not bundle Halo art.

The monitor automatically plays **idle overlay**. Hover or focus its controls to pause/resume or select **monitor_talking-loop** or **stand unarmed idle**. These are native skeletal clips, separate from the cursor-facing presentation rotation. Reduced-motion preferences start playback paused. The base idle is an authored pose; selecting the talking clip does not play speech.

## C41 clarity and loading polish

The home presentation uses **1.5–2× canvas density** with antialiasing, a smaller bloom radius/strength, source-color grading and softer key/fill light. Its resting pose turns toward the left side of the page and its mouse-follow range now reaches both sides. Other model-inspection lighting, authored animation data and map environments retain their existing controls.

A bounded source-identity promise cache shares background preparation with the home view. An existing preserved `c40` source is opened before scanning/reimporting its installed counterpart. Returning to the library reuses the chosen immutable identity; native model/texture readers still apply their existing hash and resource checks. No GPU objects or unchecked pixels are cached by this resolver. Missing-source results are retryable, and separate installations have separate cache keys.

The [real desktop check](../scripts/test-home-showcase-native.mjs) verifies the same 1,126-triangle owned monitor, original texture/reflection, progressing native animation, actual render-buffer density, left/right screen heading and preserved source identity after a workspace round trip. Native screenshots were visually inspected. One fresh-load observation improved from **4,959 to 4,313 ms**; the return visit improved from **1,651 to 899 ms**. These are single local observations, not percentiles or a promise for every machine. Model discovery still reads and verifies owned files.

The native invoke binding is immutable, so the failed attempt to count its calls remains a failed diagnostic. No zero-call native claim is based on an empty trace. Three separate unit tests verify deduplication, preserved-source priority and missing/changed-installation retry policy. [Exact polish receipt](fixtures/c41-home-showcase-polish.json). The earlier broad native acceptance below remains historical; the C41 integration report and its separate executable identity preserve the six-suite consolidation evidence.

In **Asset library → Installed maps & downloads**, select a source and choose **Load assets**. Discovery covers registered runtimes, linked folders, Downloads and Spark's inbox. It reads bounded headers; asset payloads load on selection. Sources are preserved without replacing the current map or its unsaved draft. ZIP contents still pass the existing strict archive importer.

Drag an actual model preview into QuickForge or a supported source-map view. Spark extracts the exact native tag and recursive dependencies, copies them to a new private namespace, rewrites references with local Invader and checks native readback. The receipt and placement form one undoable edit. Failure leaves the map unchanged and retains staging evidence. Sound previews remain auditionable; native sound closures can be staged, but editor emitters are not compiled Halo sound-scenery placements.

New QuickForge source prepares real Blood Gulch grass/metal shaders from an owned matching runtime. Terrain uses grass; ordinary brushes use metal. Both QuickForge and BSP Workshop use the shared Halo material renderer. Missing source/tools produce a setup message instead of an invented texture or unrelated resource substitution. Neutral inspection lighting does not change a user's explicit environment or bake game lightmaps.

## Actual native acceptance

`scripts/test-assets-startup-native.mjs` runs a real Windows Spark/WebView/GPU process with native IPC and installed Halo tools. The final fresh run is `.local/native-assets-acceptance-i`. Its [public metadata receipt](fixtures/native-assets-showcase-native.json) contains no Halo payloads or session credentials.

| Check               | Result                                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Startup             | Ready observed by 653 ms after native initialization began; twelve independent status calls took 2.64–4.66 ms on this machine. A branded launch surface appears before the main bundle.                                                                    |
| Discovery           | 52 map/archive candidates found without decoding full payloads during scanning.                                                                                                                                                      |
| Source reflection   | Warthog hull: six exact 64×64 DXT1 cube faces, authored perpendicular/parallel brightness 0.7/1.0, with source/resource identity checks.                                                                                             |
| Home model          | 1,126 native triangles, native texture/reflection, transparent canvas. Real GPU screenshots were inspected.                                                                                                                          |
| Skeletal playback   | Two bones; idle overlay and talking loop each have 55 frames at 30 Hz; base idle has ten. Skinned vertex positions change during idle, pause freezes playback, the talking clip can be selected, and a wrong source hash is refused. |
| Default materials   | Both exact shader previews load in the normal QuickForge viewport; their three/five-tag native closures compile with the map.                                                                                                        |
| Preview drag        | Real pointer drag imports the five-tag boulder closure and places it. Ctrl+Z removes both binding and placement; Ctrl+Y restores both.                                                                                               |
| QuickForge build    | Native tools produce a structurally validated MCC v13 cache. Readback finds the imported scenery at `[1.5, -1.5, 0.01]` and twelve BSP collision triangles.                                                                          |
| Source-map addition | Reopen that generated map, provide its actual matching editable tag tree, import another boulder and rebuild. Native readback finds its new tag and placement `[-3, 2, 0.01]`. The original cache remains unchanged.                 |
| Changed import      | A controlled changed byte in a managed tag is detected and the next build is refused. Exact recovery bytes and the previous validated output remain intact.                                                                          |

No JavaScript or detected shader-program errors were recorded. No Halo game was launched by this acceptance.

A separate C39 regression uses three independent Spark processes and three separate 2,240-tag source trees on one PC. Native pistol editing, admitted scenery publication and placement converge at revision 13. A frozen build completes while editing reaches 14. Readback finds radius `0.275`, the 31-triangle published model and placement `[3, 2, 0.1]`. Host termination/recovery retains acknowledged state, authors, history and exact asset bytes. Build: 37.30 seconds; recovery: 11.31 seconds. Seven synchronization samples range from 63.82 ms to 6.99 s, median 886.72 ms, including native IPC/UI consumption. These are local-machine measurements, not WAN or game-peer results.

That run is retained at `.local/native-assets-c39-final/run-2026-10-31T04-48-11-812Z`. Its executable hash is recorded separately: it precedes the later animation reader and source-preservation follow-up, which do not change the collaboration protocol or admitted binary-publication scope.

## Preserved safeguards and failure evidence

Local imports accept registered source identities and fixed local tool recipes. They refuse an active SparkLink session. No unsafe raw-patch broadcast or remote tool execution is introduced; existing negotiated collaborative publication remains separate.

Imports retain exact source/receipt hashes, bounded inventories, link/path rejection, create-new copies, native dependency verification and build-time rechecks. New native scenario objects grant **no additional writable byte range** in the preserved extraction cache: native scenario compilation authors them later. A regression proves byte-identical extraction input and continued refusal of unbound/scaled additions.

Earlier attempts remain retained. Actual Invader refactoring reported per-file copy errors under long Windows paths despite exiting zero; Spark refused the result. The fixed recipe now uses the existing owned short-path alias and also checks per-tag errors. Other attempts exposed an invalid material identifier, missing viewport binding and an old preservation check rejecting a legitimate later native addition. These were fixed while retaining source-hash, payload, compiler and byte-footprint checks. Test timing/configuration mistakes remain failed attempts in their original receipts.

## Remaining gates

- Native animation preview currently supports bounded **uncompressed PC-family Halo 1** streams with exact skeleton matching. Compressed streams, replacement-channel blending, world-relative clips, full game state machines and animation sound events remain open. Missing animation never becomes a fabricated idle.
- Scenery import/build is accepted for the tested MCC QuickForge and matching native source-map rebuild. Other registered classes and cross-runtime combinations need their own real-map acceptance. Existing-object replacement/deletion and per-instance game scale remain separate.
- Source-map rebuilding requires matching editable scenario/dependencies and a compatible compiler. Shared MCC texture packs cannot recreate missing source. Native loose-tag/source success does not complete Eschaton/Assembly-style direct `.map` editing.
- Glass/water/effects, every resource layout, complete renderer/audio parity, compiled sound emitters, actual CE/MCC game loading/traversal, arbitrary live spawning/BSP replacement and game-peer replication retain their independent gates.

The animation reader was independently implemented from the [published native structures](https://github.com/SnowyMouse/invader/blob/master/src/tag/hek/definition/model_animations.json), with installed native-reader and owned-payload checks. No external implementation or proprietary animation frames are bundled in Spark source.

Windows locked workspace: **556 passed, seven existing opt-in cases ignored**. Frontend: **246 passed in 52 files**. Browser interaction/IPC contracts: **90 passed**. Offline contracts, TypeScript and the release build are checked separately. Mocked browser contracts are not counted as native GPU, import or multiplayer evidence.

Work remains on local master as requested. No push, force push, protected-branch bypass, rules change or automated merge was attempted. [Descriptive handoff](NATIVE_ASSETS_GITHUB_DESCRIPTION.md).
