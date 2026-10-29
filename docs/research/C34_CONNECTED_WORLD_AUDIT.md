# C34 connected-world structure and acceptance audit

Audit date: **2026-10-28**. This continues the existing Timberland + Sidewinder + Blood Gulch + rotated Battle Creek work. The derived world, routes, scenario and scenery were read only; no rebuild, source replacement, game launch, memory access or multiplayer stress was performed.

## Artifact identity

The latest located C33 four-map dogleg job is `a751cca1-5cba-43be-98d7-c78cabab6e60`, produced at `2026-10-28T15:06:01.304647100+00:00`. Its preserved private output is under `.local/continuation33/hosting-collision/four-map-dogleg/library/jobs/`. The earlier four-map fixture with hash `64ae4255…` is a different revision. `.local/c33-collision-native-4/` contains a small collision acceptance room and must not be confused with this four-map world.

| Artifact | Rechecked SHA-256 |
| --- | --- |
| Compiled `timberland.map`, 122,548,667 bytes, v13 | `5b0103b63b91add77116fc11f1bdb5f8d3cb51a115c4ad24b7e8fb6d41fbd541` |
| Editable scenario, 732,282 bytes | `3a9739c4d1a4bb6e3a2c8d766390c717168967142913f6c14e8adc2b74b54066` |
| Editable combined BSP, 9,697,221 bytes | `87fbfe094266c49d80d5a2e00e74be45d61e191103d00e3d66e44fd0a8b63d1f` |
| Generated `connected.jms`, 17,345,519 bytes | `971f0fd7c652429e91f81ecf29ac47b43c726506986f61ee37a85f3222695726` |

The job's project fingerprint is `7a190249444f9015197053aba18ef09ef2cad4d88bbd4793aabf6a350df6e615`. The cache was fully hashed before and after the direct structure probe; size and modification metadata also remained unchanged. Full owned artifacts and local audit outputs remain private under `.local/continuation34/`.

## What is actually combined

The editable scenario and compiled cache both reference **one BSP**. The cache contains one indexed `sbsp` tag, and the scenario's one reference resolves to it:

| Role | Tag path | Datum ID |
| --- | --- | --- |
| Scenario | `levels\test\timberland\timberland` | `3782475776` |
| Referenced BSP | `levels\spark\assembly_933b2da5\connected` | `3951888921` |

The cache contains 2,776 tags. Its BSP metadata region is 3,682,304 bytes, with the MCC render vertex pool separately addressed as the existing renderer requires. The four source areas and their tunnels were rebuilt into one combined world; they are not four independently resident or streamed BSPs.

The direct read-only probe uses the same scenario/BSP address mapping as the existing bounds-checked readers. Its remaining field sizes come from the [Invader BSP definition pinned at `696830ff80af227e84e7237c2ef26eb2301ed110`](https://github.com/SnowyMouse/invader/blob/696830ff80af227e84e7237c2ef26eb2301ed110/src/tag/hek/definition/scenario_structure_bsp.json). The private probe validates header/index bounds, unique tag IDs, referenced tag classes and bounded BSP pointers before reading counts. It separately checks the editable scenario's big-endian BSP count.

## Render, collision, visibility and atmosphere

| Measured structure | Count |
| --- | ---: |
| Render vertices / triangles | 51,884 / 24,538 |
| Render material ranges / lightmap groups | 50 / 9 |
| Parsed secondary UV pairs | 51,884 |
| Collision vertices / triangulated faces | 12,448 / 25,144 |
| Collision polygon surfaces / edges | 19,021 / 31,593 |
| Collision 3D nodes / planes / leaves | 35,657 / 15,272 / 17,885 |
| Clusters / cluster portals | 11 / 10 |
| PVS / PAS stored bytes | 44 / 55 |

The source assembly report's 49,702 output triangles is a source-export measure and must not be substituted for the compiled render or collision counts. Render/collision totals above were independently returned by the current `inspect_map_visuals` Rust reader. The cluster and portal metadata were read from the exact hash-matched compiled BSP.

All 11 clusters are connected in the portal graph. The 44-byte PVS has 11 four-byte rows: every cluster sees itself, the matrix is symmetric, and each row marks 5–9 of the 11 clusters potentially visible. This is useful compiled culling data, not an in-game frustum/occlusion or performance test. The [documented distinction between clusters/PVS and BSP transitions](https://c20.reclaimers.net/h1/tags/scenario_structure_bsp/) supports this interpretation: visibility within a resident BSP does not create independent per-player world streaming. The transition-BSP field is index zero in all 11 clusters, consistent with the single referenced BSP; no second resident section is established.

Atmosphere transplantation has a concrete gap. All 11 clusters select sky zero but have `-1` fog, weather, background-sound and sound-environment indices. The compiled background-sound and sound-environment palettes are empty. The original compiler log independently warns that all 11 clusters lack background sound/sound environment. The scenario retains 42 placed sound-scenery emitters, but these are not a substitute for donor cluster ambience/reverb or full audio parity.

The preserved compiler log also records one nearly-coplanar-surface warning and 40 unearthed-edge warnings, with `connected_errors.wrl` retained privately. Compilation and the route probes succeeded despite these warnings. They require targeted native visual/collision inspection; a route passing through selected positions cannot clear unrelated geometry warnings.

## Preserved routes and scenery

All three current connection projects were rechecked against the final cache using the existing `qa_bsp_assembly --verify-cache` implementation, before and after the reader diagnostic repair:

| Route | Project SHA-256 | Accepted route samples |
| --- | --- | ---: |
| Timberland–Sidewinder | `b4494e9d5eb6df096fc0dc57acdf0604e3e69c96c2b36ee128b01a9bfad5c92f` | 423 |
| Blood Gulch connection | `956802363232f7b6a79c6ff7a698bf2083016002dc316f521be82b6d1d68d052` | 440 |
| Battle Creek dogleg | `a71d606e11f956ff8ae236e69bd40dc819f28e217f0fb5e8f3a2351b4e2af12b` | 394 |

The latest dogleg retains six authored tunnel points, four bends, width 2.0, height 1.6 and 90-degree donor yaw. Its measured centerline length is approximately 96.84 world units. It must not be described using the earlier straight connection's 88.56-unit length.

The scenario has 287 scenery placements and 49 scenery palette entries, retaining 30 Battle Creek donor placements across seven donor scenery types. Six source-matched model-reference corrections remain recorded in the private build receipt. It also contains 24 vehicle placements, 68 player starts and zero placed bipeds. These counts establish retained authoring data, not correct object physics, mode coverage or 128-player readiness. Donor gameplay objects, scripts and actor behavior were not universally transplanted. The current Rust inspection still finds 11 source scripts; their presence is not synchronized AI acceptance.

The audit found a reader bug: valid `ssce` sound-scenery placements were compared against an empty expected class, producing 42 false cross-class warnings. The minimal repair adds the missing class mapping. A synthetic regression first failed, then passed for both v7 and v13, while deliberately wrong scenery and sound-scenery classes still warn. All **17 `maps` integration tests pass**. Reinspection of this exact cache now has zero `LEGACY_PLACEMENT_CLASS` warnings; the genuine `RUNTIME_TEST_PENDING` diagnostic remains. Cache/render/collision/route identities and totals are unchanged.

## First private game and multiplayer gates

1. **Single-client native load and traversal:** build/package with the exact selected runtime/tool profile, verify full map/resource hashes, then load through its supported private mod route. Walk all three tunnels in both directions, including entrances, bends, crouch/jump, nearby scenery and applicable vehicle paths. Inspect the retained compiler-warning areas. Check material/lightmap/fog transitions and real spatial sound. Record a failure location before changing geometry. Standalone success and MCC retail success are separate receipts.
2. **First two real private clients:** use two distinct owned installations/client identities and matching runtime builds, protocol and complete content hashes. Start with LAN/VPN, private/unlisted hosting and a measured baseline. Put the two players in opposite source areas, then traverse in opposite directions; verify mutual visibility, projectiles/damage, death/respawn, vehicles, object ownership, late join, leave/rejoin and reconnect. Capture host authority and disagreement/correction evidence. A pair of Spark editors, a TCP loopback or two harness objects does not meet this gate.
3. **Measured player ramp:** after two-client correctness, repeat with 4, 8 and 16 real game clients, then 32, 64 and 128 only on a runtime/protocol with an implemented, verified capacity for that stage. Do not infer expanded MCC capacity from an upstream community-runtime option. Match native content/startup prerequisites before changing runtime. Real clients/players and simulated load must be reported separately; no public stress is authorized.
4. **Stage admission and soak:** before each ramp, define budgets from the chosen supported hardware and previous measured baseline. Capture hardware/build/map/resource identities, tick rate, p50/p95/p99 frame/tick time, memory/VRAM, per-client bandwidth, loss/jitter, object/AI/projectile counts, correction rates and soak stability. Exercise join churn and controlled adverse networking privately. Reject the next stage on crashes, collision/authority divergence, lost progress or exceeded agreed budgets; a numerical lobby limit is not acceptance.

Independent region/BSP streaming remains a separate engine project: persistent world/entity identities, authority and ownership, server collision/simulation for every occupied region, residency/transition handshakes, cross-region combat, late join and reconnect correctness must precede a streaming claim. Preserve this working combined-BSP path while implementing that backend. No native game, two-client or expanded-player gate was run in this audit.
