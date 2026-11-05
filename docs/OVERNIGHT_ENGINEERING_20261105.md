# Overnight engineering — 5 November 2026

Continue from67589b0 on canonical local master. Preserve the475-row cumulative ledger, original Master Engineering Prompts04–28 and all existing source/evidence. Owner explicitly authorizes independent work while human/approval gates remain pending. This report records completed workflows, not whole-directive acceptance.

## Configured native map export

The local commit containing this section closes the missing connection between Storage's mod/runtime export preferences and actual map output. The existing Build history and Smart Edit result expose one compact Export map control. Explicit export uses the selected runtime folder or mod/default folder. Build jobs remain authoritative; export does not convert, install, launch or publish a map.

Existing build/native validation, runtime format-family rules and shared storage reservations are reused. Export streams64KiB chunks, validates the exact saved project/build receipt and source hash, reserves space, refuses original game/tool/project trees, preserves native filename/bytes and verifies the final hash. Repeated identical exports reuse their file; modified, incomplete or foreign exports are preserved and refused. Optional Spark receipt metadata stays beside the standard map. Changing the hosting runtime cannot reinterpret source bytes.

Evidence in `artifacts/overnight-20261105` and `artifacts/qa/overnight-native-export`:

- Core filesystem contracts:3passed, including20identical exports with zero growth, CE/OpenCE/Chupathingy byte reuse, wrong target, changed source, foreign directory, tampered export and quota refusal.
- Browser contracts:6passed, including explicit save-first/runtime choice/refusal and stale cross-map result isolation. These use synthetic IPC, separately from native acceptance.
- Native application unit tests:135passed/2ignored. Storage/continuity13passed; TypeScript and embedded desktop build pass.
- Actual embedded Windows application:3cases/0errors. Owned MCC BSP/material queues settle; real pistol edit/Undo/Save/direct-map copy independently reads0.225 with Invader CRC mismatch0 and original unchanged. Explicit export to the default configured folder has SHA45c596247b213ddb1532f2c3dadd6e3d484c5b1d2fabef4f177b376b7280f5c7, reuses identical output and refuses CE before creating Mods. Tested executable SHA6a7637ec105949ab30fbff4ac31324ba762702081e5b2ced451458bb99e24441.

The native runner now uses the existing shared QA reservation lifecycle for every mode. The first export acceptance used the preceding preflight-only runner; its complete receipts remain genuine and its directory is retained. No test was relabeled to imply a hard OS filesystem quota.

## C70 genuine specialist-tool round trip

The interrupted C70 implementation is reused. The actual Blender5.2 LTS process imported one private creator-owned OBJ, changed X from1 to1.5 and saved it. Spark's real two-second poll detected the external save; its reviewed import created an independent asset. Actual desktop Undo/Redo, immediate Save and reopen retain the placement and both immutable sources. This proves a DCC save and native handoff; file events alone do not establish a writer identity.

The acceptance exposed a real native bug: the shared material palette forced a model-only shader into the BSP's shader_environment dependencies. The existing model planner now retains exact shader paths, separates unused model-only bindings from the compiled BSP clone, resolves the actual shader_model/environment class against the selected native inventory and rejects ambiguous basenames or class substitution before staging. The original authoring palette stays unchanged. Other transparent model shader classes remain explicitly unsupported by this OBJ build route.

`artifacts/qa/overnight-dcc-native-accepted/acceptance.json` passes2actual desktop/native cases with0errors, executable SHA`f149269e055b05e3cff63a74a2d0dd093100cd35b5cc9d09f25983a045d90768`. Actual Halo Tool model/collision/structure/lightmaps/cache compilation takes37,091ms. Invader independently extracts each scenery tag recursively and opens both render and collision tags. Both have12render triangles, one render geometry and one collision node. Spark's cache validation confirms render/collision bounds1×1×1 and1.5×1×1 and both native placements. CRC mismatch is0. The standard MCC cache is79,527,766bytes, SHA`6039f1b4c257ad8eed750ab33b5c4f3cf157e0232d20bb41d59ab2dcd7675b32`. Source fixture, original imported asset and immutable Blender baseline hashes match.

The build stages1,778required tags/104,921,176bytes from the restored small pool; a fresh source-hash check matches all admitted input files. No full SDK tree is generated. Its entire retained QA run is501,213,142logicalbytes after53,932,672bytes of sealed disposable application/cache data is retired. This is logical ownership accounting, not a physical disk-reclamation claim or OS hard quota.

Failed receipts remain: first model-class refusal, a stale foreign-library door reference in the test fixture, and a nonrecursive independent extraction. The DCC fixture now reuses the accepted room geometry without importing an unrelated project's door ownership. The separate accepted C63 two-way door remains intact. The native QA final measurement now retries a whole bounded scan after a disappearing WebView temp file; deletion's hash/identity checks remain strict. Corrected final acceptance is separate from those failures.

No game was launched, no human gameplay was inferred and no Halo installation changed. C70's real tag-editor round trip remains supported by prior C68/Part2 Invader evidence; Blender's OBJ route now closes its missing DCC/compiler gate. Manual GUI/addon, Mantle/OpenTool and wider runtime workflows still need their own acceptance. This is a scoped native milestone, not all-tool completion.

Combined regressions pass:740Rust tests/9existing opt-in ignored,404frontend tests,169browser contracts,59offline scripts and8QA-storage contracts. TypeScript and embedded application compilation pass. The cumulative475-row CSV remains byte-identical, SHA`1eb0848def039b08b6398c8ea67e8c7e9a5fbce803c0ec417bc2655efe945bf7`.

## Explicit open gates and next work

### C71 static native asset fidelity

The production model build now checks actual compiled triangle surfaces against the pinned authored mesh: topology and winding, per-corner UV seams, normal orientation and exact native shader paths. Compiler ordering and vertex welding are allowed. All model triangles require an unambiguous material range. Incomplete/nonfinite streams, invalid indices, overlapping ranges, missing shader identities and oversized/coincident data fail safely. Limits are32,768triangles/350,000vertices per audited mesh,position tolerance0.00005Halo units,UV tolerance0.00005 and normalized normal dot≥0.999. This adds build/readback validation, not another renderer or authoring system. Existing exact-build reuse runs the same current audit and rechecks source hashes without rewriting its old evidence.

The expected authored mesh is converted to Halo cache conventions before comparison. This is independently verified against version-pinned Invader commit`696830ff80af227e84e7237c2ef26eb2301ed110`, [`src/model/jms.cpp` Vertex/Triangle readers](https://github.com/SnowyMouse/invader/blob/696830ff80af227e84e7237c2ef26eb2301ed110/src/model/jms.cpp): V inversion and opposite triangle winding are native format transformations, not corruption. Research stayed read-only; no third-party engine implementation was imported.

The read-only audit of the accepted C70 cache passes for both models:24triangles total,0position error,0UV error and normal dot1. In-memory mutations of real decoded native UVs, normals, winding and shader identity are each rejected while source/cache hashes stay unchanged. The initial audit's wrong coordinate assumption and failed diagnostic logs are preserved; they are not reported as corrupted accepted content.

Fresh actual Windows acceptance in `artifacts/qa/overnight-asset-fidelity-accepted` passes3cases/0errors, including Blender/history, real native compilation/independent Invader readback, and the compiled asset's actual Tag Inspector frame. The frame contains12triangles,1source texture,1reflection cube, source lighting and0material gaps; it is visibly textured in `compiled-asset-preview.png`. Executable SHA`e085aa93abe5c641c407467224800aefc743f52dc09e95642c1da8ea5f903556`; cache SHA`123673b4d2b2519c8fac88c1def02bfd0bc8e50276dba1957e1668b171ef6ae9`; actual native compile37,189ms. The preceding harness failed only its ambiguous Scenery/Model/Collision selector; the corrected test filters the actual tag class. Existing accepted caches and receipts were preserved.

Focused9Rust contracts pass. The full Rust workspace passes743tests/9existing opt-in ignored. Frontend404/browser169/offline59 remain the same tested product UI from C70; no frontend product code changed in this native-fidelity step. This is standard static OBJ→H1A native asset acceptance, not all asset classes, exact stock-renderer parity or human gameplay.

Remaining C71 requirements include the complete contextual Inspector flow, editable animations/rigs/physics/effects/HUD and other edition-specific exports, object/property/behavior game acceptance and independent GUI editor workflows. C63/C68's existing door/trigger/source-script work is preserved without relabeling this static cube as a new gameplay test.

Part2's compiler admission and sampled writer checks do not provide an OS hard disk ceiling. Windows' documented [NTFS quota command](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/fsutil-quota) applies per volume/user; applying it would affect unrelated files. No volume/security/system changes were made. This platform constraint remains open, alongside clean-machine/platform acceptance and deliberately unimplemented unattended backup deletion. The backup policy remains a cap with explicit reviewed cleanup.

### C71 native Tag Inspector animation

The existing Tag Inspector now offers opt-in Native animation for an owning object with an indexed animation graph. It reuses NativeModelPreview, the exact-source animation reader, checked skeleton matching and the same renderer. Clip selection and Play/Pause use the native clips; disabling animation restores the static model without replacing its Canvas. The toggle is remembered per map. This is preview playback, not native graph authoring or live game animation swapping.

Actual embedded Windows acceptance `artifacts/qa/overnight-tag-animation-accepted/acceptance.json` passes3cases/0errors, with normal application close confirmed and its storage lease passed/inactive. Application SHA`1a7448a0a3a99137b783a640e6df78a746defd931d86278c9b9acb64615dedc0`. The native cyborg_mp object supplies16clips on19bones. Verified weighted animation time advances, freezes when paused, resumes and returns to static on the same Canvas. `native-tag-animation.png` shows the rendered source model. The same run preserves the native pistol edit/Undo/Redo/Save, independent Invader0.225 readback,CRC0 and unchanged source SHA`123673b4d2b2519c8fac88c1def02bfd0bc8e50276dba1957e1668b171ef6ae9`. Its output SHA is`801e13fea795582f237d7f7c4ad152e476b77ad6d891d2ede52b19977a3fdf84`. No compiler or game was launched in this animation test; the preceding C71 compile remains separate.

The first test used an incorrect fixture path and is retained as failed; input existence is now checked before allocating a copied QA executable. A corrected run passed its functional cases but failed strict disposable-cache sealing because WebView was still flushing after abrupt parent termination. Its overall result stays failed and all evidence remains. The runner now closes successful app windows normally, waits for exit, then uses unchanged strict file/hash ownership checks. The final fresh run passes. Retained run usage396,249,152logicalbytes is accounting, not physical disk reclaim or an OS quota.

Regressions:404frontend tests,170browser contracts,59offline scripts and13continuity/storage contracts pass; embedded application build passes. The coverage guard initially found the new read-only native fidelity diagnostic missing from the existing demo→user-workflow map; it is now mapped to Models without weakening that guard. The continuity guard also caught the overnight note preceding the pending-request title; only its heading order changed. Rust remains743passed/9existing ignored from the immediately preceding unchanged native source. Failed logs are retained. The475-row CSV hash remains unchanged.

Next safe C71 work: investigate the measured surplus model/material work in map previews using existing planners. The tiny native fixture renders66BSPtriangles/6objects but requests118shader textures,188detail textures and11cubes; these counts alone do not prove a performance improvement. Profile comparable runs before changing scheduling, preserve every visible model/material/decal, and retain source/revision invalidation. Complete contextual Inspector and broader asset/game gates remain open. Broader conversion/Megaworld/AI/gameplay and all human/peer/release gates remain pending under their original identities. No new editor, networking stack, discovery manager or scheduler is introduced.

### C71 measured world-preview scheduling

The existing World planner was decoding materials for the entire recovered model index, including unplaced weapons, vehicles and scenery. It now schedules local native models actually used by visible scene objects, including the source Spartan used for player starts. Donor models retain their own source-aware loader; custom OBJ meshes retain their own materials. All BSPs, sky, lightmaps and decals remain included. Newly placed or revealed objects update the plan; moving the camera or an object does not discard the existing textures. Reflection scheduling uses the same required native shader IDs, including glass with no diffuse map. This changes scheduling only: no source data, hashes, native readers, rendering algorithms or bitmap validation are removed.

Three sequential fresh app/profile trials before and after use the same79,527,766-byte MCC cache, settings and readiness checks. OS file caches were not cleared; these are fresh-window/map timings, not true OS-cold startup. The existing opt-in profiling module observes actual native IPC and decoded-resource gauges; responses are never mocked. The compared revised trials run without the browser regression suite. Full results: `artifacts/overnight-20261105/preview-performance-comparison.json`; inputs `preview-profile-baseline-1..3` and `preview-profile-idle-after-1..3` under `artifacts/qa/`.

| Metric | Before | After |
| --- | ---: | ---: |
| Median first fully textured map |7,373.3ms|5,475.3ms (25.7% faster)|
| Median fresh app window |557.1ms|554.6ms|
| Median native import |2,245.4ms|2,195.1ms|
| Median retained editor return |187.9ms|165.1ms|
| Bitmap IPC batches |12|3|
| Reflection batch calls |5|1|
| Decoded bitmap cache misses |193|49|
| Decoded cache estimated bytes |54,985,436|16,522,294|
| Decoded cache evictions |65|0|
| Median sampled process-tree private bytes |2,420,441,088|2,022,162,432|
| Median sampled cumulative process CPU |35.72s|31.53s|
| Median dedicated GPU allocation |124,764,160B|140,722,176B|

No GPU-memory improvement is claimed: its sampled allocation increased. RAM and instantaneous FPS vary considerably; these are not peaks, sustained frame-rate proof or hard caps. Startup/import differences are small. All trials retain the same18last-pass draw calls,6,297rendered triangles,5geometries and23active textures. Actual readback verifies all six required BSP/visible-model primary shaders remain loaded. All six scene objects and183sky triangles remain. Home→Level Editor returns the same Canvas with zero new native preview calls. Before/after screenshots were visually checked; they are not pixel-identical (mean RGB-channel difference0.710/255 across the full window), and this is not stock-engine rendering parity. Original source and native0.225/CRC0 export checks pass in every measured run.

Initial timing pilots attempted to replace Tauri's immutable invoke entrypoint and captured no calls; those IPC counts are unusable and excluded. The corrected profiler uses the already implemented opt-in performance measures. A separate after-series overlapped briefly with browser tests and is excluded from the timing comparison while retained as functional evidence. The interrupted browser run is retained; a complete fresh rerun passes170. The offline suite caught a missing explicit `.ts` extension in the new shared helper import; repaired without weakening the test. Frontend406/browser170/offline59/continuity-storage13 pass. Rust/native compiler source is unchanged from743/9ignored; the native source/compiler/fidelity milestones above stay independent.

Two exact incomplete failed-QA leases were reconciled after verifying their owner processes had exited, their copied executables matched the recorded SHA and all run paths/files stayed within their bounds. Original records are retained in `artifacts/overnight-20261105/failed-qa-leases.json`; failed acceptance remains failed and no file was deleted. This releases abandoned reservation accounting, not disk space. No limit was widened, no SDK copied and no original game modified.

Next C71 acceptance gap: actual read-only previews from each installed source family. Inspect the existing source-Spartan selector against Xbox's native `mode` relationship, then validate source identity/materials in the actual app. Keep game loading, gameplay, full-context asset authoring and independent GUI gates pending.

The final rebuild after the offline-import repair is separately verified: app SHA`4fe5b2dc1249bab2396f6504dc5961694856429fb97228ce75e645468852aa42`; `artifacts/qa/preview-scope-final-native/acceptance.json` passes3actual cases/0errors, including native skeletal playback, normal shutdown, source-preserving edit/history and independent Invader readback. Its timing is not substituted for the three measured revised trials.

### C71 installed-source preview acceptance

The existing source-Spartan selector incorrectly required PC-family `mod2` even for Xbox cache5. The native parser already supports Xbox `mode` correctly. The selector now follows the cache's actual class and exact biped→Model relationship, retaining path identity and refusing wrong-class references. Hosting preferences never choose the source class. This repairs player-start model/material selection for Xbox-derived content without changing native parsing or inventing geometry.

Actual Windows app SHA`a30c48ce0f16eb205ef3382a09ff74d306120a9ab1fbce7ee4c6ef45d9a148a5` passes8read-only cases across four installed-source contexts. These are three cache families: MCC13, CE609 and the identical Xbox5Blood Gulch bytes installed separately with OpenCE and Chupathingy. They are not four engine/gameplay tests. [Bounded receipt](fixtures/c71-source-family-previews.json), screenshots and complete results under `artifacts/qa/source-preview-{mcc,ce,opence,chupa}`.

| Source context | Required primary shaders loaded | Lightmap pages | Reflection cubes | Visible objects | Player model class |
| --- | ---: | ---: | ---: | ---: | --- |
| MCC native fixture |6/6|1|4|6|mod2|
| Custom Edition Blood Gulch |116/116|15|11|186|mod2|
| OpenCE installed Xbox Blood Gulch |106/106|15|11|166|mode|
| Chupathingy installed Xbox Blood Gulch |106/106|15|11|166|mode|

CE automatically pins its original bitmaps.map, sounds.map and loc.map and loads native textures with no folder prompt or compatible-runtime replacement. Xbox images are internal. CE and Xbox frames were visually inspected, including terrain, the native base decal and player-start models. Each test verifies unchanged original map SHA, actual native render readiness and normal app shutdown. This does not prove accurate appearance of every vehicle/effect, audible sound, animation on every model, actual game loading, conversion, Live Link, AI or gameplay. Xbox a10 and Halo Demo's full visual gates remain separate; this small read-only fixture mode explicitly admits inputs≤128MiB.

The first attempt correctly refused further4GiB desktop reservations before creating directories. Investigation found the canonical path check always charged4GiB even when the existing run API declared a tighter reservation. It now honors that declaration and rechecks any later larger operation. Read-only small-cache QA reserves1GiB; its three runs retain172,483,514/181,014,028/181,013,737logicalbytes. The16GiB aggregate cap,4GiB maximum/default, free-space floor, source/ownership/hash checks and no-automatic-deletion policy are unchanged. Sealing/disposal does not reserve another new payload. A real filesystem unit fixture proves small admission, refusal of a later oversized reservation, invalid-input refusal and unchanged retained evidence. This is sized admission, not an OS hard disk quota or permission to delete protected data.

Final regressions:407frontend tests,59offline scripts and14continuity/storage contracts pass. The fresh full Rust workspace passes743/0failed/9existing opt-in ignored; no native core code changed in the preview-selector step. The full170browser rerun is recorded in `source-family-browser.log`. TypeScript and embedded application builds pass. Git fsck reports no integrity failure; dangling objects are preserved, not pruned. The cumulative475CSV requirement bytes remain unchanged.

The current scoped native milestones are complete and locally committed. Full Prompt06/C71 remains implementation-incomplete: finish the existing Inspector's contextual materials/animation/collision/sound/logic/dependencies/native-output flow, wider asset-class fidelity/native exports, a combined object/property/scenario-behavior→game workflow and independent GUI editor acceptance. Preserve all later queue identities. No new installers, portable bundles, source archives, game/server launches or publication were produced. C49 remains the separately preserved older release candidate; these source commits are not a new distributed release.

### C71 checkpoint before superseding P0 regrowth repair

The existing Tag Inspector now has eight compact contexts without replacing its native preview or editing/history handlers. Actual native run `artifacts/qa/native-asset-contexts-02/acceptance.json` passes3cases: source-linked materials,36actual collision triangles,one UI collision read,same Canvas/camera across contexts,Undo/Redo/immediate Save/reopen,CRC0and independent Invader bounding-radius readback0.225. Its native output is a proven bounded map copy (`compilerRan:false`), not a new native compilation or gameplay result. An owned Windows output session measures peak0.14244while auditioning a real decoded sound; context change stops playback and retains options. This is not human hearing or in-game sound acceptance.

A stricter final run remains failed because a reflection bitmap was requested through the flat-image reader. The pending fix reuses the existing source-checked six-face cubemap decoder/cache, preserves selected faces per window/map, and orders images by the shader’s native references. Six bitmap/cubemap browser cases and TypeScript pass. The final embedded app builds, but its final native diffuse/cube/animation/context acceptance has not run because the owner’s new P0 storage directive stopped bulk QA. The earlier run01 missing-model-shader-link failure is also preserved: bounded read-only native ModelShaderReference indexing repaired it with a five-family Rust regression.

Full locked Rust744/0failed/9existing opt-in ignored;frontend412and browser173pass before the last cubemap UI change. The six focused bitmap browser tests pass after it. Offline59and storage/continuity14pass. No source maps,original installations,C49release or475CSVrequirements were changed. This is a local resumable C71 substep, not complete Prompt06acceptance. Full object/property/behavior→native build→game and independent GUI/peer gates remain pending.
