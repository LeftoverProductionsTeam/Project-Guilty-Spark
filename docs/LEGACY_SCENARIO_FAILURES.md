# Legacy scenario editor failure ledger (Continuation 12)

**Do not treat a historic program's screenshot, a read-only BSP render, or a green source preflight as proof of a valid Halo map.** This is a test-first failure ledger, not a claim that every past report has been independently reproduced. Legacy tools are historical references; none of their binaries or code are shipped in this project.

## Corruption, missing assets, and compatibility

| Historical risk | Evidence | Spark mitigation now | Unresolved runtime acceptance |
| --- | --- | --- | --- |
| Old direct-cache modifications / map exception crashes | [Reclaimers: obsolete editors](https://c20.reclaimers.net/h1/community-tools/obsolete/) warns about SparkEdit-era maps, HEK+ extraction, and HMT/Eschaton corruption or runtime-only edits | Preserved immutable source hashes, staged project edits and native source build pipeline; never patches stock caches | Rebuild exact tag inputs and test a real cache in game |
| Cross-map incompatible references / missing bitmaps, models, sounds | [Invader README](https://github.com/SnowyMouse/invader#readme) documents bad indices, enumerators and references even in extracted tag sets | `scenarioSafety.ts` checks conflicting tag path/identity; `tag_exchange.rs` already validates source hashes; resource map diagnostics warn when required resource files are missing | Real Invader extraction, dependency closure and engine version matched rebuild |
| Sky/fog with unvalidated/negative powers | [Reclaimers: sky](https://c20.reclaimers.net/h1/tags/sky/) documents crashing negative ambient radiosity power on pre-H1A engines | Both TS and Rust reject nonfinite/negative editor illumination values and invalid fog bounds | Must edit actual sky and fog tags and verify lightmaps in target engine |
| BSP holes and phantom collision | [Open Carnage phantom BSP thread](https://opencarnage.net/index.php?/topic/8286-phantom_tool-toolexe-mod-which-prevents-phantom-bsp/) and [Reclaimers obsolete tools](https://c20.reclaimers.net/h1/community-tools/obsolete/) warn that post-process fixes can miss problems or introduce holes | Exact cave and terrain source joins, topology checks, Tool WRL overlay, no compiled-cache BSP writes; export withheld on duplicate faces / unsealed geometry | Tool structure with valid portals/collision/PVS + actual player, vehicle, projectile collision tests |
| SwordEdit and SparkEdit interoperability | [HaloMods/SparkEdit](https://github.com/HaloMods/SparkEdit) and [ChadSki/Swordedit](https://github.com/ChadSki/Swordedit) are archived source references, not supported engines | No direct cache rewrites. Optional tool launch depends on runtime capability; no claim of roundtrip source editing via SwordEdit | Reproduce with legally held fixture and verify untouched source/cache hashes |
| Stale modifications after reinstall | Previously reported in user's Mota-Lev scenario research, not independently verified as a specific tool bug | Export job receipts tied to source hash; backups; no write into installed maps | Verify exact input tags and preserved source hashes; check alternate installed/user cache copies |
| Multiplayer 2nd player 'waiting for space to clear' | Previously reported in the user's historical investigation; no independently confirmed causal attribution | Exact same-position, same-mode player starts are native build blockers; close starts warn | Test two independent game clients with correct team/mode, player/collider clearances |
| AI crashes / huge AI slowdowns | Historic community reports supplied by owner; per-engine cause not confirmed | Firefight authored wave counts checked against configured `maxAlive` and `maxTotalPerWave`; no fake MP AI sync claim | Profile real engine CPU/frame pacing and AI spawn/despawn on supported runtime |

*Important*: It is not responsible to attribute an observed Mota-Lev symptom to a precise code defect without a minimal failing project, source bytes, logs, and engine version. The reports above are regression hypotheses and acceptance targets, not verified diagnoses of Mota's work.

## New hard boundaries

1. `quickforge::validate_document` rejects malformed environment values in native serialization. A source author can save incomplete geometry, but not non-finite data or a malformed editor environment.
2. `quickforge::validate` blocks identical *simultaneously eligible* player spawns, conflicting source hashes of the same class/path, nonmanifold source meshes and unsafe world geometry. Disjoint game-mode spawn records may share coordinates.
3. `quickforge::export_sources` creates a uniquely named **sibling staging directory**, writes project + JMS + command plan + environment intent, reads back the serialized document and verifies the written JMS SHA-256, then renames the complete staging directory into a fresh destination. Failures do not produce a plausible finished source folder. No existing output is overwritten intentionally.
4. QuickForge's Legacy scenario safety panel also surfaces *advisory* issues from the current user-authored Firefight configuration and inspected source map. Missing resource file, overloaded AI wave, or unsynchronized MP biped state cannot be proven absent by a green geometry report.
5. Scene textures, engine shaders, sky atmospherics, lightmaps, collision BSP/PVS and network AI are **separate subsystems**. A local preview never certifies a native game build.

## Manual game tests still required

- Load a real authored map in H1 Tool. Ensure no unclosed edges or `WRL`/collision errors, compile tags, run compatible `tag_test`, cross the new terrain and cave seams, and check player/vehicle/projectile collision.
- Load the same map in two real clients, confirm independent spawn clearance, map revision parity, and real remote state; no local multiplayer mock satisfies the acceptance gate.
- For Firefight/Zombie Apocalypse, test spawn wave 1, wave transitions, enemy actions, victory conditions, late join (only where the engine supports it), and 30-minute performance.
- For campaign First Contact, confirm actual compiled scenario, scripts, AI encounters/pathfinding, cinematics, checkpoint saves, radiosity and the full start-to-end sequence.
