# C55 — Native asset workflow and source-authored materials

Continues local master from `1eef97dfbd0ab04ca0ca752623ecd0eaad17468e`. Earlier history, experiments, the separate dirty root checkout, original game content and previous-good builds remain preserved. No remote push or publication is performed. Exact executable, source and evidence identities are recorded in the [metadata receipt](fixtures/c55-native-assets.json). [Owner push handoff](C55_PUSH_NOTES.md).

## Landscape interaction

Click a rendered BSP surface in Level Editor to select its original BSP and shader. **Surface shader** opens the existing source-aware tag drawer; **Connect / tunnel** opens Construction with that selection retained. Objects keep their normal picking and transform controls. The native click tests use actual pointer input, including alternate wall/floor positions when a biped obscures the starting camera. Triangle rebasing preserves original BSP attribution. Selection does not authorize binary edits.

This closes the missing landscape-selection entry point, **not direct sculpting of imported terrain**. Construction's existing connection planner chooses checked edge anchors; a picked render point is not automatically an accepted tunnel mouth. Current source reconstruction/assembly limits, collision clearance, compiler checks and manual walkthrough gates remain in force. Arbitrary imported-face extrusion, hills, cuts and seamless joins still require further reconstruction work. Editable BSP Workshop source already supports its bounded face extrusion, clipping and vertex operations. Loose-tag builds and surface picking do not complete direct compiled-map structural editing.

## Native material corrections

- The model-shader reader retains authored self-illumination source, function, period and color bounds. The renderer applies the native green multipurpose mask and diffuse color after ambient lighting, so supported time-driven emission survives darkness without enabling optional effects. The inspected Monitor uses a two-second cosine cycle. Object-driven native functions remain unsupported. A real WebGL test checks masked emission in darkness, unmasked darkness, black diffuse texels and independence from the optional effects toggle.
- Native glass may intentionally omit its diffuse bitmap. The reader now distinguishes that legal null dependency from an invalid or missing non-null bitmap. Such glass keeps its source tint and reflection instead of being rejected or assigned a fabricated diffuse image. The Xbox Pelican cockpit is a tested case. Invalid references still fail.
- Xbox `a10` has a space sky with density 1 and zero fog distances. The old preview expanded this into a one-unit interval and obscured model previews with black fog. It now reports the unsupported zero-width distance approximation and disables it instead of inventing a fog interval. Original sky bytes remain unchanged.
- Reflection residency permits 32 cubes under the unchanged 64 MiB budget. The earlier count limit excluded `a10`'s seventeenth cube even with memory available. Source/resource identity, six-face decoding, bounded batches and stale-session retirement remain enforced. Unavailable exact custom reflection data remains unavailable.
- Model previews share a bounded, exact-source lighting-metadata cache. Hosting-runtime selection no longer invalidates unchanged model/world resources. Resource changes still invalidate the source-scoped decoders. Old cached corner portraits are regenerated once with the corrected material path.

The model inspector now labels source lighting versus inspection lighting and reports missing native material identities. Ready metadata and decoded triangle counts alone are insufficient: native acceptance checks real, non-background GPU pixels. Mouse orbit, wheel zoom and Fit/Reset are exercised. No generic replacement texture or global brightness increase is used as acceptance evidence.

The earlier attempt to count native reads by replacing Tauri's immutable `invoke` property produced an inconclusive empty trace. Those counts are excluded. The corrected observer uses a read-only CDP function-call breakpoint and must observe a real `startup_status` call before collecting runtime-switch calls. It observes real workbench/poll commands and **zero bitmap, model or reflection read calls across four hosting-runtime switches in each of five map cases**, with the world canvas/materials retained. This establishes resource reuse only for those tested sources and switches; it is not a cold/warm startup, CPU/GPU/RAM or map-load speed benchmark.

**Rendering limits:** scenario-sky lighting is not a replacement for local BSP-cluster object lighting. Full reflection orientation/BRDF, engine object functions, glass/power-up behavior, terrain seams and complete engine parity remain separate visual gates. Demo Zombie Apocalypse still has an unavailable exact custom bottle-glass cube; it is not silently substituted. Representative visible/textured models do not certify every asset in every runtime.

## Complete supported asset-editing path

QuickForge now handles Alt-drag duplication and Ctrl+C/Ctrl+V in its existing history. New instances receive fresh IDs; original source/tag identities remain unchanged. The move-and-copy operation is one Undo step. Typing, camera flight, read-only participants and Workshop ownership retain their existing keyboard guards.

Native copy/paste resolves the original cache/tag through the existing local recursive importer. A foreign binding ID is not trusted. The admitted project/hash/class/path must match the copied identity; destination materials are revalidated after asynchronous preparation. An unrelated destination edit is retained. Switching the map or its target runtime during preparation refuses the result. Paste after Undo restores the dependency closure before adding an instance. Unverified loose-tag references, foreign material paths and unadmitted shared assets are refused rather than converted into placeholders.

Real packaged-app acceptance exercises preview drag into QuickForge, recursive extraction, transform, Alt-drag duplicate, copy/paste, one-action Undo/Redo, save, production MCC compilation and independent native placement readback. All three scenery placements are present at their edited coordinates. Corrupting one managed imported tag blocks a subsequent build, retains the earlier validated cache and allows restoration from the preserved bytes. Reopening the generated map with its exact editable source also permits another source-map addition and rebuild. A separate CE target receives its own admitted five-tag closure and undoable placement; that cross-runtime staging test does **not** certify a CE build or gameplay.

No unsafe raw patch sharing, remote tool execution, new game replication protocol or bypass of C38/C39 native reconciliation/build checks is added. Source-map scalar patching, loose-tag rebuilding and geometry authoring retain their separate authorities and acceptance gates.

## Verification and remaining work

The receipt records separate native results for installed Custom Edition, Demo Zombie Apocalypse, MCC and Xbox `a10` from Chupathingy and OpenCE. Both community installations contain the same tested Xbox cache bytes; they are separate discovery/process cases, not two different format decoders. Tests cover original-source hashes, actual textures/lightmaps/models/reflections, interactive model previews, compact Play/Stop audition and measured process-owned Windows audio output. That output measurement is not human listening or Halo game audio acceptance.

| Owned source | Interactive model previews | Resident reflection cubes | Audition output |
| --- | ---: | ---: | --- |
| Custom Edition Blood Gulch, cache 609 | 3 | 11 | Measured nonzero |
| Demo Zombie Apocalypse, cache 6 | 2 trees | 12; one exact custom source remains unavailable | Measured nonzero |
| MCC Blood Gulch, cache 13 | 2 | 11 | Measured nonzero |
| Chupathingy `a10`, cache 5 | Chief and Pelican | 17 | Measured nonzero |
| OpenCE `a10`, cache 5 | Chief and Pelican | 17 | Measured nonzero |

All 11 representative models have source images, zero required-material gaps, visible GPU pixels and working mouse orbit/zoom. Surface selection, the exact shader drawer and Construction entry pass for all five cases. The final QuickForge MCC build takes **107,965 ms** in this test run; no controlled speed comparison is inferred. Independent native readback finds the three boulders at `[5, -0.5, 0.01]`, `[7.5, -0.5, 0.01]` and `[8.5, 0.5, 0.01]`. The matching-source-map rebuild also passes with its new placement at `[-3, 2, 0.01]`.

Regression evidence: **655 Rust tests passed, 8 explicitly ignored, 44 suites; 350 frontend tests in 83 files; 152 browser tests; 59 offline programs; 45 native-analysis/release-guard tests.** Browser contract fixtures remain distinct from native application tests. The native emission fixture uses actual WebGL. The final source build passes TypeScript and Windows packaging without creating an installer.

An isolated H1A Standalone launch of the validated asset-test source reached native scenario/netgame validation and stayed running. Its log reports absent objectives/equipment for modes the small test scene does not author. Desktop control failed to initialize (`helper_unknown_error`), so no player movement, rendered Halo inspection or in-game listening is claimed. The failed earlier path-quoting launch remains recorded; the corrected launch used structured arguments and a checked short content alias. No original SDK tag tree or installed game maps were changed.

Next gates: reconstructed imported-terrain editing and exact seam validation; local model lighting and broader engine shader parity; additional asset classes and target-runtime builds; actual Halo visual/audio/gameplay acceptance; cross-computer/Steam and game-peer replication. Existing unfinished compiled-map research remains in the master backlog.

`target/release/GuiltySpark.exe` is a Windows x64 development application, version **0.4.1**. This continuation does not create a new NSIS installer, portable ZIP, source archive, Linux package or public Release. The sealed C49 candidate remains unchanged.
