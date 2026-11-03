# C54 — Character rendering, compact workflows and scoped stability

Continues local master from `0a10b978423140b7cf50963b47ac2a0fc86f84b8`. C35–C53 history, experimental branches, original maps, previous reports and the sealed C49 release candidate remain preserved. The older dirty root checkout is untouched. The [metadata receipt](fixtures/c54-workbench-polish.json) records the exact application source, executable identity and final evidence. [Owner push handoff](C54_PUSH_NOTES.md).

## Home characters and launch speech

Home and Appearance settings offer saved choices for Guilty Spark, Sgt. Johnson, campaign Master Chief and Cortana. Each model is recovered from an owned campaign cache with its exact source/resource hashes. Johnson requests the actual `sgt_johnson-100` variation. Chief uses `characters/cyborg/cyborg`, rather than the multiplayer biped, and the shader receives his authored olive change-color permutation through its native multipurpose mask. Missing character assets are reported instead of silently displaying someone else.

The process claims at most one launch greeting. Only the main native window can prepare and play it; pop-outs cannot trigger additional lines. The selected character and launch mute/volume are saved independently of menu effects and map-authored audio. A durable per-character shuffle bag advances only after Windows accepts playback. It exhausts the currently recoverable line identities before repeating, including complete bounded native segment chains. Selected map, sample identity, format and chain are verified again before playback. Cached discovery metadata never authorizes changed audio bytes. A canceled or unsupported source does not become a fabricated greeting.

The packaged Windows acceptance launches 16 separate test processes against one isolated, persistent profile: four characters under MCC, Custom Edition, OpenCE and ChupathingyCE selections. It checks saved choices, native standing animation, Johnson's exact variation, zero missing model-material bindings, source hashes, different acknowledged line identities across restarts, refusal of a second greeting, and nonzero process-owned Windows audio output. This is an editor/application test, not Halo game playback or human listening.

**Content boundary:** MCC character models use cache 13. The tested CE/OpenCE/Chupathingy character cases use linked original Xbox campaign models, cache 5; stock Custom Edition does not supply these campaign characters. All four runtime selections can use that compatible linked content. The greeting path currently accepts verified PCM/Xbox ADPCM dialogue, not MCC CELT or arbitrary Ogg. The original Xbox campaign sources provide these tested lines. An MCC-only installation without recoverable compatible dialogue still needs additional original content; a selector alone does not provide it. This test does not establish every Spark feature on every runtime.

## Native bones, materials and compatibility

Halo bind-pose and animation quaternions are conjugated and normalized consistently at the native boundary. Bone names/order must agree even when checksums match. Full standing source idles precede vehicle-seat and additive clips; scanning continues past unsupported candidates up to the existing successful-clip/value budgets. Xbox native animation preview now uses the same bounded path. Model hierarchy, weights, meshes and original animation data remain unchanged. Primary format research: [pinned Reclaimer node rotation convention](https://github.com/Gravemind2401/Reclaimer/blob/36224d7a4581f2a1f255099bf706aa56be9f6e21/Reclaimer.Blam/Blam/Halo1/GbxmodelTag.cs#L52).

Cortana's body and hair use native transparent-generic screen-space maps. Those flags previously caused the parser to reject the material. The shared reader now retains the flags, maps, UV motion and bounded register stages. The transparent showcase compositor also converts its already-blended result to straight alpha, preventing the browser from dimming the hologram a second time. Real WebGL tests check additive brightness, source blending, solid coverage, bloom and resize. Native captures show her purple source textures and an intact standing skeleton. This does not claim complete engine shader/fade/function parity. [Primary shader layout](https://github.com/SnowyMouse/invader/blob/master/src/tag/hek/definition/shader_transparent_generic.json).

Imported JMA data now records its rotation convention. A previously saved clip without that marker is source/hash checked, then converted only in memory. Its preserved bytes and native export meaning remain intact. Regression coverage includes a nonidentity quaternion roundtrip, legacy hashed-file readback, unchanged saved bytes, tampering refusal, authored color selection/bounds and nonidentity collision-bone rotation.

## Compact workspaces

The crowded drawer strip is replaced by a **Tools** menu grouped by editing, view/sound, collaboration and project/build. A **Maps** menu searches complete open-map names and runtimes, shows dirty state and opens another native window. The tab strip retains drag-out, keyboard navigation and selected-tab visibility. Menus dismiss outside/Escape, transfer focus and avoid competing with Maps/Layout. Per-map editing history, selections, camera and resident world ownership stay on their existing paths.

Interface Studio remembers four compact categories: Appearance, Window, Menu sounds and Header art. Palettes, glow, transparency, art and source-bound cue controls remain available. All categories fit at 1280×720; smaller windows and long content keep reachable scrolling. World lighting/fog fields have visible names as well as accessible labels. These remain editor-preview settings, not newly implemented native lightmap/sky/fog baking. Workshop source-volume lists are bounded without removing editing controls.

The final native survey covers 25 route cases at four size/DPI settings plus 26 subviews, with no clipped controls, header overlap or horizontal overflow. DPI is emulated, not physical monitor certification. Native history tests cover writer transfer, stale-conflict drafts, rapid edit convergence, abrupt-process acknowledged-state recovery, close/reopen, tab dragging and Undo/Redo. Object tags drawer tests retain its source writer, selected tag, parent world and history at normal and small sizes.

## Measured UI-state work

Remembered view state now notifies only subscribers to the changed map/key. Eight decoded storage records are cached. Every write still reads current storage first, so peer-window changes cannot be overwritten by an older decoded record. A no-op local update publishes peer keys that arrived before their storage event. Stable unchanged objects, quota recovery, map isolation and subscription cleanup are covered.

| Paired browser workload | C53 implementation | C54 implementation |
| --- | ---: | ---: |
| Median measured pass | 36.4 ms | 30.0 ms |
| Reduction | — | 17.6% |

Conditions: 480 real React subscribers, 160 synchronous writes per pass, a 121,916-character synthetic picture-sized record, three fresh contexts per report, five measured passes after warm-up per context, and before/after/after/before report ordering. The driver records source hashes/browser version and rejects a stale served module. No game pixels are embedded in the benchmark.

This measures preference-state work, not overall cold/warm startup, map loading, showcase initialization, GPU/CPU/RAM or network speed. No texture, decal, model, shader or validation is removed for timing. Those wider profiling gates remain open.

## AI diagnostic correction

The observer supplies ticks without a verified native session/epoch identity. C54 detects tick regression and uint32 wrap, retains every observation and refuses ambiguous pairing across a reset. Consecutive frozen ticks still use the final observation.

Read-only reanalysis of the preserved build-335 stock a30/b30 captures finds host resets near samples 89/87 and client resets near 61/60. Their earlier actor observations and C52 reports remain preserved. The new summaries return incomplete acceptance instead of pairing reused tick numbers from different lifetimes. This is insufficient identity, not evidence that native AI is absent. A fresh joined-session capture with verified epoch identity is required before accepting paired combat, lifecycle, late-join or recovery behavior. No game packets, new protocol, remote tool execution or engine writes are added.

## Verification and remaining gates

- Rust: **655 passed, 8 explicitly ignored, 44 suites** with `cargo test --workspace --locked` on Windows.
- Frontend: **339 passed, 80 files**. Browser: **152 passed**, including actual WebGL output and existing contract/recovery tests.
- Offline: **59 programs**. Native analysis and release guards: **45 tests**. Source-index checks retain six projects and 30 behaviors; their result does not certify research-checkout hashes or gameplay.
- Native packaged app: the character matrix, strict layout survey, eight window/history cases, four Object-tags cases, and nine representative CE/Demo/MCC/Xbox models plus four sample auditions. Exact report hashes and application identities are in the receipt. Browser contract fixtures and real native IPC acceptance remain distinguished.

Failed and intermediate experiments remain private and are excluded from final acceptance. Earlier reports are not rewritten. In-game native audio listening, complete rendering/audio parity, compressed/additive animation fidelity, arbitrary asset-class/runtime conversion, direct compiled-map structural editing, broad live BSP replacement, automatic Zombie release, unforced combat and cross-computer/Steam collaboration remain open. A second computer and unavailable human gameplay actions are not simulated as successes.

`target/release/GuiltySpark.exe` is a verified development application, version **0.4.1**, Windows x64. C54 does not create or replace an NSIS installer, portable ZIP, source-release archive, Linux package or public GitHub Release. The sealed C49 files retain their exact hashes. No remote push, ruleset change or publication is performed.
