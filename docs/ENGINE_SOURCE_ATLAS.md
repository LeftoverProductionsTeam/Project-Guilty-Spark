# Engine Source Atlas — C52

Originally reviewed 2026-11-02 from local master `c0f43f39b7a055f289603547b238ef00f534fabc`. C58 revalidates the same six pins on 2026-11-03 and appends six cache/resource/local-console references, retaining the original 30 records. [The structured index](fixtures/engine-source-index.json) now contains 36 behavior records with exact source locations, file hashes, owners, inputs/outputs, Spark owners, gaps, integration methods and acceptance gates. This remains source research, not installed-game acceptance; see the [C58 matrix and trials](CONTINUATION_58_COMPATIBILITY.md).

## Revisions, scope and source integrity

| Research checkout | Exact commit | Terms observed at that commit | Architecture reviewed |
|---|---|---|---|
| [bnunu/halo-1](https://github.com/bnunu/halo-1/tree/2e376b992e920bcc3a094727475c17daef71ec8c) | `2e376b992e920bcc3a094727475c17daef71ec8c` | CC0-1.0 in LICENSE.md | Reconstructed Xbox development build 2342: cache loader, sound cache, objects, AI, units and scenario lifecycle. |
| [punpckhdq/halo](https://github.com/punpckhdq/halo/tree/4754c8e7cf1dfdee533e591054ec6c28ad718a2e) | `4754c8e7cf1dfdee533e591054ec6c28ad718a2e` | **AGPLv3 text** in this revision's LICENSE | Original decompilation and type definitions, model parts, sound permutations and structure materials. README requires separately supplied development executable/SDK for matching builds. |
| [OpenCE](https://github.com/OpenCommunityEdition/OpenCE/tree/899219cc0a14b03bc12f0517a1e9ee4c37158af8) | `899219cc0a14b03bc12f0517a1e9ee4c37158af8` | AGPLv3 text in LICENSE | Xbox-derived engine plus platform layer, native CE conversion, distributed actor/object/damage/co-op networking and capacity definitions. |
| [ChupathingyCE](https://github.com/ChupathingyCE/chupathingyce/tree/9990568507eede8b81edd5437a4860de5465c408) | `9990568507eede8b81edd5437a4860de5465c408` | GPL-3.0-or-later; documented section 7 console-SDK permission | Own native engine revision, actor replication and Delta discovery/compatibility decision code. |
| [Invader](https://github.com/SnowyMouse/invader/tree/e8b58542fd1e0a239d0fbc689ac4e55b80e79442) | `e8b58542fd1e0a239d0fbc689ac4e55b80e79442` | **GPL-3.0-only**, explicitly no earlier/later version | Versioned map/tag/resource abstractions, native bitmap decompilation and existing compiler/extraction workflow. |
| [Reclaimer](https://github.com/Gravemind2401/Reclaimer/tree/36224d7a4581f2a1f255099bf706aa56be9f6e21) | `36224d7a4581f2a1f255099bf706aa56be9f6e21` | GPLv3 text in LICENSE | Halo1 cache/index/address translators, DDS bitmap extraction, model/region parts and separate render BSP content. |

The AGPL/GPL text alone is not recorded as an established “only” or “or later” election where a project-specific election was not found. Chupathingy's historical licensing document describes its ancestors as CC0; **that is not evidence that the current punpckhdq pin is CC0**. Exact revision licenses take precedence over a descendant's historical description. These findings grant no rights to Microsoft's game assets.

Research lives outside production under `.research/c52-engine-intelligence`, in six shallow, detached, sparse source checkouts. Acquisition does not fetch submodules, build engines, include game data, overwrite existing research, or change an installed game. Each checkout has a 128 MiB selected-file acquisition ceiling; file hashes and checkout inventories remain in private C52 evidence. This is selected-module review, **not** a complete audit of every checked-out line. Public source references contain no game bytes or private absolute paths.

Relevant third-party terms remain separate: OpenCE/Chupathingy track CC0 history, vendor notices and asset/font notices in LICENSES, port/third_party and port/assets/fonts (including OFL files). Chupathingy also names HUD/prompts/HRTF notices. Invader identifies ADPCM BSD-3-Clause/MIT, Roboto Mono Apache-2.0 and STB public-domain components. Reclaimer's third-party package references are not licensed by the top-level GPL alone. No external engine modules or third-party source are incorporated into Spark in C52. Any future code incorporation requires its own redistribution review; an external tool's output does not acquire rights to pre-existing Halo content.

## Runtime intelligence uses existing Spark owners

The flow remains `Spark Studio → runtime_adapters / sourceIdentity / runtimeWorkbench → native toolchain or exact runtime adapter → Halo`. `runtime_adapters.rs` already distinguishes operation evidence, availability, fingerprint, resources, native tool generation, protocol observations and session state. C52 attaches pinned actor/co-op source references to that report. It does **not** promote source knowledge, an executable path, a caller-supplied compatibility flag or a player count to game acceptance.

| Concern | Existing Spark owner | Boundary retained |
|---|---|---|
| Source map and installed origin | `maps.rs`, `source_identity.rs`, frontend `sourceIdentity.ts` | Source cache/hash/installation origin remains independent of selected host runtime. |
| Resource discovery and validation | `resource_map.rs`, `bitmap_preview.rs`, `audio.rs`, native auto-connect handlers | Exact resource kind, name/index, path, range and SHA-256; no fuzzy substitutions for builds. |
| Render/model/material previews | `render.rs`, `ownedMaterialBatch.ts`, `World.tsx`, `NativeModelPreview.tsx` | Render BSP, collision, material/lightmap UVs and native game shader behavior remain distinct. |
| Native edits and external saves | native transactions, working tags, handoff/reconciliation and Smart Edit | Baboon/Invader semantic validation and prior-good receipts remain; no raw remote binary patches. |
| Collaboration | SparkLink studio/session/transaction owners | Ordered source commits, author undo, permissions and acknowledged recovery synchronize editors, not a game's simulation. |
| Native gameplay | `runtime_adapters.rs`, `live_adapter.rs`, versioned community observations | MCC hooks and exact publisher OpenCE diagnostics retain separate build/session checks. |
| Firefight / Zombie | existing Firefight exporter, `conversion.rs`, native scenario/script pipeline | Engine executes actor decisions, damage and replication; Spark authors/compiles content. |
| Connected worlds | BSP Workshop, `bsp_compile.rs`, Megaworld Atlas | Native compile/collision/visibility and actual traversal each need evidence. |

MCC/H1A, Custom Edition, OpenCE and Chupathingy remain the four main workbench targets. Xbox, PC, Demo/Mac, HaloMD and OpenSauce remain separate preservation/import/export profiles. “Content,” “gameplay,” “network” and “editor” compatibility are four different results.

## Concrete repair: Custom Edition indexed bitmap metadata

C51 had already implemented actual Xbox a10 geometry, swizzle/model decoding and source-based discovery. C52 preserves that implementation. The next reproducible gap was stock **CE cache 609**, where the bitmap tag's native data word is a **resource slot**, not a map-memory pointer.

Three independent source paths establish the format:

- Invader `Map::map_with_move`, `src/map/map.cpp`: indexed bitmaps use resource_index and base pointer zero; the chosen 12-byte resource entry supplies body offset/size. Indexed sound is explicitly different.
- Invader `Tag::data`, `src/map/tag.cpp`: reads stay inside the selected tag/resource region.
- Reclaimer `BitmapsAddressTranslator.GetAddress`, `CacheFile.IndexItem.ReadMetadata` and `BitmapTag.ToDds`: resolve the selected body-relative metadata and then choose the separately addressed raw pixel source.

Spark now independently implements that bounded bitmap route. It re-reads native tag index/class/id/path/external flag from the unchanged source, verifies the exact slot and unique normalized resource path, bounds each body to 1 MiB and aggregate metadata to 16 MiB, validates relative image-array offsets, and proves raw pixel ownership through the CE `__pixels` entry. The opened resource handle is hashed before/after index inspection and after reading. No synthetic cache or public Tag schema change is needed.

`canRequestBitmapMetadata` only schedules indexed CE requests; it does not authorize pixels. Other external metadata formats remain refused. The source-first planner and World detail/lightmap paths now reach the same native validator instead of rejecting all external bodies in the frontend. Existing cube/DDS/model-preview paths share this reader. Native CE top cube faces are mip-major; Xbox face-major/alignment/swizzle rules stay separate, following Invader's bitmap decompiler.

The installed CE Blood Gulch test recovered **5,503 render triangles, 68 model types, all 121 requested image previews and all 12 requested reflection cubes** with unchanged source/resource hashes. In the packaged application, the preserved C51 executable loaded zero shader/lightmap/detail/reflection bindings; C52 loads **159 source shader bindings, 15 lightmaps, 233 detail slots and 73 reflection assignments**, with no compatible-runtime substitution. This establishes preview recovery, not native gameplay or complete shader parity. Native screenshots and receipts remain private.

## Actor lifecycle and ownership

The trace below concerns the **pinned upstream OpenCE implementation**. Installed publisher build 335 is from `da8d455623cf50002e6a798b1980068fd3ca0292`, a different revision. Current-source function names or wire constants are not authorization to call addresses in build 335.

1. **Create / identify.** Native `object_new` allocates a salted datum and initializes type-specific state. `actor_create_for_unit` requires a live biped and valid variant, checks swarm consistency, attaches an actor to an encounter/squad or the encounterless set, then attaches the unit and verifies activation. Clients do not instantiate AI decision actors merely because they have matching unit datums.
2. **Spawn / simulate.** The host runs `ai_update`; actors feed `unit_control`. Native scenario placement, collision, pathfinding, faction and activation decide whether an actor can actually move or fight. A successful object allocation is not a healthy spawn.
3. **Replicate.** `network_actors_note_control` records controls; `network_actors_host_tick` sends bounded `distributed_actor_state` messages. Distance controls update frequency; one-shot controls/numbered impulses are sent urgently. Client `network_actors_handle_states → actor_state_apply → network_actors_drive → unit_control` applies the latest host decision, with a two-second stale-control expiry. Vehicles follow the object transform route. Numbered melee/leap/speech/custom-animation events prevent duplicate playback.
4. **Object lifetime.** `network_objects_host_tick` sends reliable creation/deletion changes. `distributed_client_create` reconstructs native units/vehicles/items at the host's complete datum identity. `network_objects_may_delete` prevents a client deleting host-owned gameplay objects on its own. Clients' local effects/projectiles use a separate allocation policy. A datum index without salt/lifetime checks is insufficient.
5. **Damage / death.** `network_damage.c` makes the host authoritative. Client hit reports are checked against player ownership, allowed damage sources, target history and firing constraints. Host aftermath and killing blows drive native client pain/death effects and health state. Killing blows go to all clients. This path must be observed with actual attacks; a QA `unit_kill` is only a script/lifecycle test.
6. **Despawn / recover.** Reliable host deletion removes copies. `network_objects_client_asked` and the synchronized-inventory completion path resend authoritative objects after loading/joining; new-game routines reset transient state. That is engine reconstruction, not SparkLink's durable acknowledged source journal. Reconnect correctness still requires an actual game test with object changes while the client is absent.

The upstream actor-state batch caps at 64 entries and also observes datagram entry budgets. Native capacity definitions currently declare 1,024 actors and 8,192 map objects, with platform-specific memory/texture/sound capacities. These source limits are **not** accepted counts for the installed build, mobile/web targets or a real multiplayer session. Old Xbox pool sizes and savegame layouts differ. Do not enlarge pools by writing memory from Spark.

Existing upstream test infrastructure includes `network_test.c`, native host/join/local/probe modes and `tools/net_compare.py` references in NETCODE.md. Some test modes explicitly inject shots/kills/vehicle actions. Their logs must identify those controls; they are not human combat acceptance. C52 does not build or certify an upstream test suite from the sparse checkouts.

## Zombie carrier and Firefight

Source `unit_try_and_exit_seat` explains the C51 exit refusal: a seated biped must not be animation-busy and its animation graph's current seat needs a non-NONE animation at slot 8. C51's recovered zombie has no stand-seat exit animation. The separate candidate binds an existing same-skeleton animation; it is not silently applied to ordinary conversions. `unit_exit_seat_end` then uses the **parent seat marker and biped root/node transforms** before native detach/placement. Clearing a parent pointer or moving the unit does not reproduce that lifecycle.

The AI exit decision is also conditional: `actor_action_handle_exit_vehicle` evaluates hostile occupants, eviction and attached-projectile danger before requesting exit. Filling slot 8 alone does not create an automatic exit stimulus. This is consistent with retained C51 runs: commanded exit succeeds; removing that command leaves actors seated. The source explains why the candidate is incomplete; it does not prove the original historical projectile/carrier trigger is repaired across engines.

Keep the original item → weapon → projectile/effect → carrier → rider → actor chain and original hashes. Next isolate one exact carrier, marker/variant relationship, native exit stimulus and bounded physics in a separate source build. “Mounted weapon” actor type, actor pool capacity and the historical native mounted-actor failure are separate matters; no unreviewed capacity patch is introduced.

Firefight uses the existing wave/export/controller owners. A native scenario must contain correct encounter/squad starting/firing positions, pathfinding and activation; export/compile alone cannot guarantee them. C51's script reaches wave/score/restart states with explicitly forced enemy deaths, and its partial-spawn negative refuses progression. Its unforced/campaign placement candidate has unresolved native physics/placement results. C52 does not relabel those results playable Firefight. Actual unforced movement, targeting, attacks, player damage/kills, score and the next wave remain required before a co-op claim.

## Delta and cross-runtime networking

Chupathingy's `docs/delta-compatibility.md` explicitly begins as a **design** document. C52 checks implementation separately: `delta_compat_decide` parses advertised tags/ranges, enforces major compatibility, tests overlapping current/oldest wire ranges, and falls back to historical exact-wire comparison where applicable. `delta_compat_opence_server` distinguishes advertisements. Delta listing/control/identity is not the actor-state protocol, nor an authenticated Spark editor session.

Use the native client to negotiate its session. Spark's existing bounded server list/invitation/content preflight remains conservative: missing negotiated ranges or map identity cannot be filled in from a name, current source constant or another runtime's success. Prior particular-build OpenCE/Chupa trials are historical evidence only; MCC and stock CE use separate networking families. No packet bridge, fabricated MCC lobby or universal crossplay is added.

## BSP transitions and Megaworld

`scenario_switch_structure_bsp` disconnects/unloads the old active structure, loads/verifies the selected reference and reconnects native systems. Current OpenCE additionally restores the old BSP or returns to the menu if the new one fails. `network_distributed.c` sends the host's BSP before dependent player state; co-op tracks client structure acknowledgements and loading-zone participation. This is one active structure coordinated across peers, **not simultaneous all-map streaming**.

Three approaches remain distinct:

| Approach | What must be built/proven |
|---|---|
| Merge source geometry and tunnels into one native BSP | Native geometry/collision/material compile, portals/PVS/capacity, sound regions, AI navigation and physical two-way walk. |
| Multiple scenario BSP references with engine switching | Native switching trigger, host authority, client acknowledgement/loading, preserved object/player state and reconnect. |
| Simultaneous region streaming | Requires separate engine architecture and proof of resident structures, physics/visibility/audio/AI ownership. Not currently claimed. |

The compiled Timberland–Sidewinder cache and its one-client load/join evidence remain preserved. The user cannot currently perform the two-way tunnel walk. That gate stays open; no repeated request or headless movement surrogate is counted as a human traversal pass. Previously user-verified two-room Workshop collision is a different map.

## Other integration references

[Chimera's source/README](https://github.com/SnowyMouse/chimera) describes a Halo PC client modification and its features; it is not a standard MCC/OpenCE/Chupa API. [The OpenSauce mirror](https://github.com/yumiris/OpenSauce) is a separate CE-era extension tree; its layouts/features require exact extension/version validation, not a checkbox applied to MCC. Neither tree is imported or assumed installed by this research. Their complete code/license audits remain separate before any component reuse.

[Official MCC documentation](https://learn.microsoft.com/en-us/halo-master-chief-collection/) and [the official Creator Hub](https://www.halowaypoint.com/news/halo-2-and-halo-3-mod-tools-release) retain the supported Tool/Sapien/Guerilla/Standalone/Excession workflow. Update/merge the correct extracted tags for the installed tool generation. An H1A tag compile, a retail cache/package, a native load and a multiplayer session are different gates. Existing C38 transactions, external-save reconciliation, native sound class validation and build receipts remain authoritative in Spark.

## Ten next source-backed improvements

| Priority | Upstream function / Spark owner | Integration and concrete acceptance |
|---|---|---|
| 1 | Invader `Map::map_with_move` sound branch / `audio.rs`, `resource_map.rs` | Implement mixed map-base/resource-reflexive CE sound metadata without rewriting source. Exact samples, chain/rate/codec/hash validation, changed-resource refusal; then actual game listening separately. |
| 2 | OpenCE `actor_create_for_unit` / existing Firefight native exporter | Generate one real encounter with floor/firing/pathfinding data. Hostile actor must move, target and attack without forced kills; player finishes two waves with native scoring. |
| 3 | OpenCE `unit_try_and_exit_seat`, `actor_action_handle_exit_vehicle` / `conversion.rs` | Preserve historical carrier mechanism and add a reviewed native exit stimulus. Repeated weapon-spawned live zombies leave without explicit QA exit commands, remain physically stable and fight. |
| 4 | OpenCE `unit_exit_seat_end` / existing native source/physics validation | Validate carrier seat marker, rider skeleton/root and variant ownership. Native exit ground contact and bounded velocity across repeated carriers; no damage/physics crash. |
| 5 | OpenCE `network_actors_host_tick`, `network_actors_drive` / `runtime_adapters.rs`, existing exact-build observer | Use engine networking with two exact native processes. Observe spawn, movement, targeting, attack, damage, death and cleanup on both. No identity-only pass. |
| 6 | OpenCE `network_objects_client_asked`, `distributed_client_create` / runtime session diagnostics | Reconnect through native join and inventory replay. Change host actors while absent, then verify salt, inventory, deletion and physics after reconnect. |
| 7 | Chupa `delta_compat_decide` / `community_servers.rs`, native host/join planner | Inspect native negotiated compatibility when an approved local interface is available; keep listings observational. Matched builds join, known mismatches refuse, source/map hashes agree. |
| 8 | OpenCE `scenario_switch_structure_bsp`, `distributed_send_structure_bsp` / BSP Workshop/Megaworld | Finish Timberland–Sidewinder walk and source portal/collision review first. Then test host/client structure transition and ack, distinct from simultaneous streaming. |
| 9 | Reclaimer `GetModelContent`, Invader `Bitmap::post_cache_parse` / `render.rs`, shared preview pipeline | Broaden golden topology/UV/cube/LOD/alpha tests against exact owned formats. Preserve full textures/reflections in both library previews and retained editor; no performance omission. |
| 10 | OpenCE `custom_edition_models_convert`, `custom_edition_sounds_decode` / existing conversion/build profiles | Add source-derived target-specific preflights for unsupported geometry/audio/capacity. Compile through matching tools and load in each runtime; refuse unsupported constructs while keeping prior-good output. |

The index can be checked offline with `node scripts/verify-engine-source-index.mjs`. Add an explicit research-root argument to also verify local source hashes and exact detached revisions. This verifier never downloads code or runs a game/tool.


## November 6 continuation — scoped Discord intake

The original six pins and36behavior records remain unchanged. The five observations in [the November6 directive](Master%20Engineering%20Prompts/GS_2026-11-06_P0_C71_Continuation.md) are reports, not reproduced Spark or engine defects. No upstream engine implementation was copied into production and no runtime was installed or configured. The older, broader [November5 intake](Master%20Engineering%20Prompts/GS_2026-11-05_Discord_Native_Authoring_and_Compatibility.md) remains separate; receiving it did not accept its terrain, lighting or gameplay initiatives.

### Separate multiplayer authorities

Existing ledgerP03-010/P05-006/P07-005/P07-006 remain open at their recorded game/peer gates. SparkLink's source revisions and author Undo are editor state. Engine object replication, player-controlled biped identity, AI control/animation and round authority are separate contracts. The existing OpenCE pin's `network_objects.c::distributed_client_create` and `network_objects_client_asked`, and `network_actors.c::network_actors_drive`, remain the research owners. Fresh local file SHA256 checks still match `bbf42a70077be6b9332b4c20c3d4f8bd20f9b7d8b352e004d236829b35721559` and `320140381f1d602f5b9efea035208525e1e9feeb8c127bfb8c1870177e07ee91`. This does not establish installed-engine biped-switch replication, shared victory, or a two-computer test. Chupathingy's pin and executable need independent tests; stock Gearbox behavior is not an MCC adapter.

### H1 lifecycle capability matrix

These are source-generation/validation capabilities, not new live-game callbacks. Owners: `src/haloScript.ts::exportHaloCeFirefightRound`, `native_logic.rs::{validate,source,compile,verify_compiled}`, existing gametype/scenario planners and ledgerP03-007/P04-002/P05-005. CE and H1A builds still require their matching scenario/tool generation. OpenCE and Chupathingy can only receive compatible compiled content; this table grants neither engine a tested shared round controller.

| Lifecycle | Existing H1 mechanism | CE / H1A source boundary | OpenCE / Chupathingy peer boundary |
|---|---|---|---|
| Initialize/start | `gs_logic_init`; explicit `gs_ff_start` latch | Generated startup/continuous scripts; encounters and names need native compilation | No general synchronized round-start event is inferred |
| Victory/defeat | Controller-owned `gs_ff_state`4/5 | Solo script state after living-count/player-health checks; not the engine's MP round-end callback | Shared outcome remains unaccepted |
| Reset | `gs_ff_reset`, then explicit start request | Resets owned encounters/counters; no Reach/Megalo event mapping | No automatic reconnect/reset authority claimed |
| Cleanup | Owned encounter/object lists | Limited to the controller's actors; preserve unrelated scenario scripts | Peer deletion/corpse parity still requires native observation |
| Player death/respawn | Player unit health, controlled reacquisition on another requested round | Current solo controller fails the round on death; no revives or arbitrary respawn hook | Native late join/respawn and biped identity remain separate gates |
| Disconnect/reconnect | Runtime's native session mechanisms | No H1 HaloScript event supplied by Spark | Version-pinned peer tests remain required |
| Variables | Named scenario globals and explicit resets | Scenario/controller state, not persistent profile storage | Globals are not automatically replicated by SparkLink |
| Native modes | Existing Slayer/CTF/Oddball/KOTH/Race planner | Preserve native flag/zone/placement validation | Slot capacity does not prove objective synchronization |

The stale hosting guidance stating that generated Firefight scripts did not exist was corrected. The actual source exporter remains conservative: one player/life, finite waves, no revives/scaling or equipment overrides. This continuation does not turn that exporter into a multiplayer bridge.

### Animation report: safeguards and remaining gaps

The H3 graph/Reach crash reports do not establish causation, and neither layout is imported into H1 by this work. Existing H1 source/data hashes, class/schema checks, node counts and rig checksums remain. `animations.rs::validate_target_rig` additionally checks exact node names/order and source-clip parent indices, including equal-checksum adversarial cases. Full replacement-graph parent/lifecycle coverage and required damage/death/respawn behavior remain independently unaccepted. No brightness, material fallback or renderer rewrite masks those gaps. Existing ledger animation/campaign goals remain open.

### Warthog Xbox — pinned documentation only

[Warthog's README atc3641f0aa557d6fbdfee3bebca69c0f9c1d3ef12](https://github.com/ChupathingyCE/warthog-xbox/blob/c3641f0aa557d6fbdfee3bebca69c0f9c1d3ef12/README.md) describes the original-Xbox port, distinct from Warthog CE compatibility and from Spark's desktop adapters. Its documented input families are Xbox and CE, with separate resource banks; HaloMD is excluded. It distinguishes64MiB and128MiB memory classes and limits the test configuration to32players. Custom Edition on64MiB is experimental; that is not a generic map-size admission formula. These claims are upstream documentation, not a Spark console test or proof of the128-player goal.

The pinned [license](https://github.com/ChupathingyCE/warthog-xbox/blob/c3641f0aa557d6fbdfee3bebca69c0f9c1d3ef12/LICENSE) and project README state GPLv3-or-later with a console-SDK permission. No code or SDK is incorporated. The existing retained `halo1-warthog-xbox` profile now explains this limited research scope and still has no executable, write, conversion or network adapter. No console files, security settings or deployment were changed.

### Other-engine gamma/debug reports

Halo3 gamma/debug anecdotes remain out of the active repair. Source image bytes, texture color space, compiler/lightmap transforms and the target runtime's display output must be compared independently. They are not authorization for compensating brightness in Spark, and no H3/Reach rendering API was introduced.


## November 7 — native bitmap admission and cross-edition asset dependencies

The selected read-only Invader checkout remains `696830ff80af227e84e7237c2ef26eb2301ed110`. This supplementary investigation preserves the six historical pins and 36 structured behavior records above. It adds no third-party engine implementation to Spark.

- `src/map/map.cpp` (`Map::map_with_move`, indexed bitmap resource resolution) resolves CE metadata from the exact indexed resource slot; sound is a separate route. SHA-256 `7926742b96d31ef9df009c1b10ed35040ba6a5ad5f3b6929979a8e96e5ae48d6`.
- `src/tag/parser/compile/bitmap/decompile.cpp` distinguishes native 2D, 3D-volume and cube layouts, depth and raw ranges. SHA-256 `bd2c095f5be84a7098661240e9e9dfcf9030e578b1aafa36073d5394fbb4b890`.
- `src/extract/extract.cpp` documents `-r` recursive extraction and `-s` selected native paths. SHA-256 `9961305d1cd3d79690be2b11b1590330b63d69c13f122e90107b756da7304854`.

The installed CE Blood Gulch bank contains 676 indexed images: 648 2D images, 22 cubes and six volumes. Spark's native resource admission had incorrectly depended on the narrower 2D/cube preview reader, rejecting that complete bank because volumes are not previewable. The existing metadata reader now validates all supported native dimensions and exact declared image ownership for compiler admission. Depth, allocation, hash, slot, path and complete raw-span bounds remain enforced. A valid top slice cannot authorize missing remaining volume slices. The 2D preview still refuses 3D volumes; admission is not a rendering claim.

The real source-bank proof and native creator acceptance are recorded in the November 7 creator-workflow evidence. CE cache609, MCC cache13, native loose tags, editor transactions and actual gameplay remain separate boundaries. Invader is invoked as the existing external tool under its own license; no upstream source was copied into Spark.
