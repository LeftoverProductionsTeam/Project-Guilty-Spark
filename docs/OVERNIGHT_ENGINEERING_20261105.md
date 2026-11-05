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

Next actionable queue item is Prompt06/C71's native asset fidelity and existing Inspector integration. Preserve its actual object/property/scenario-behavior/game/independent-editor criteria; do not claim that extracted assets or this static OBJ fixture satisfy every asset class. Broader conversion/Megaworld/AI/gameplay and all human/peer/release gates remain pending under their original identities. No new editor, networking stack, discovery manager or scheduler is introduced.
