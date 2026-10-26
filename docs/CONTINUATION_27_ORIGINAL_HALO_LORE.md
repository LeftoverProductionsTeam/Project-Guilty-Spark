# 07 Halo Modding Brain / Continuation 27 - original modding lore and engineering philosophy

**Research checked:** 2026-10-26. **Baseline:** C26 full source. **Evidence policy:** verified claims are linked below; interpretations are explicitly product-design conclusions, not assertions that the old binaries were run. No external executables, original game bitmaps, old mods, copyrighted map bytes, or third-party source were downloaded or embedded.

## Why Guilty Spark should exist

The 2004-2015 Halo Demo/PC/CE modding scene rewarded curiosity: open Blood Gulch, discover a weapon or scenery tag, change a property, move an object in the world, test the result, share a wild idea, learn from forum peers. That immediate cause-and-effect, and the imperfect but approachable tool ecosystem, are the experiences the editor must preserve. Its implementation must NOT preserve the unsafe habit of directly patching a valuable binary cache or mislabeling a 3D preview as a playable level.

Project Spark is **one cohesive workbench, not a launcher**. It needs an Eschaton/HMT-like live typed tag graph, a SwordEdit/SparkEdit-like spatial scene, source geometry with reliable structure/collision/portals, user-owned native textures and menu cues, a Halo Tool/Invader compilation bridge, gameplay and network QA, and a provenance-aware sharing format. Some of these are real source capabilities; full imported-BSP reconstruction, playable custom maps, real Firefight/Zombie AI, and engine-fidelity editing remain OPEN.

## Verified historical lineage and modern design lessons

| Original practice | Verified historical fact | Preserve the creative value | Do not copy the old failure mode |
| --- | --- | --- | --- |
| Halo Map Tools (HMT) | MonoxideC and tjc's 2004 HMT could inspect/edit tags and extract/inject images, sound, and models in Halo 1 caches. [c20 obsolete tools](https://c20.reclaimers.net/h1/community-tools/obsolete/) | Tag selection, fast property exploration, immediate insight into asset dependencies. | Rebuild tags in an isolated source tree; no in-place writes to original caches. |
| Eschaton | Altimit01's editor supported Halo PC, Mac, Trial and CE cache experimentation, including bitmap swaps and XML-defined field plugins. [c20](https://c20.reclaimers.net/h1/community-tools/obsolete/) | A discoverable class browser with readable field schemas, undo, and owner-visible diffs. | Direct map edits sometimes caused "Gathering Exception Data" crashes; source/runtime fields can diverge. [c20](https://c20.reclaimers.net/h1/community-tools/obsolete/) |
| SparkEdit | Grenadiac's PC editor offered 3D placement and fueled fallen-log scenery "log mods". [c20](https://c20.reclaimers.net/h1/community-tools/obsolete/) | What you select in a tag list should appear in the Halo world, with source-aware gizmos and navigation. | Scenery arrangements are NOT automatically a structural, sealed, collidable BSP. |
| SwordEdit | The OSX SparkEdit fork is credited by c20 to bobindashadows, Sword, and Samuco. Sources suggest additional features but do not establish exactly which forks ran which map formats. [c20](https://c20.reclaimers.net/h1/community-tools/obsolete/) | A single 3D scenario editor that edits real object relationships, not placeholder pyramids. | No claims that an imported compiled BSP can be fully losslessly edited; guard against mismatched placements and crashes. |
| Halo Demo on MacGamingMods | The archive indexes Eschaton 0.8.1 and Fonzie's Modding Pack v5. [MacGamingMods](https://www.macgamingmods.com/) | Preserve community credit and support archival comparisons between game variants, with local SHA identity. | A listing does not grant copyright permissions or guarantee working binaries today. |
| HaloMD community | The archive explicitly lists **Zombie Apocalypse 1.0**, **Log Mod ++** and **Bloodgulch Extreme**, including tunnel/sewer content in its description. [HaloMD mods](https://halomd.macgamingmods.com/mods/) | Restore the creative survival loop and adventurous terrain/vehicle experiments, with original-authored sources. | An archive description alone is not source recovery, rights to distribute, or proof of compatible co-op/netcode. |
| Old Halo 1 Editing Kit (HEK) | Tool compiles JMS into scenario_structure_bsp (collision, rendering/visibility/pathfinding data); Sapien is for scenario placement. [H1 Tool](https://c20.reclaimers.net/h1/h1-ek/h1-tool/) | Integrated source-to-tag-to-game feedback with specific failure diagnostics. | A JMS/OBJ is not a map; do not terminate Tool while it writes an important BSP tag. |
| HEK+ / Pearl / ghostbuster | HEK+ extraction could create invalid tag values; Pearl cross-engine conversion was error-prone; Ghostbuster's phantom BSP edits can create collision holes. [c20](https://c20.reclaimers.net/h1/community-tools/obsolete/) | Archive failures as reproducible examples and error categories. | Do not run old binaries or promise automated repair. Rebuild through compatible Tool/Invader from staged sources. |

The Halo 1 modding distinction is **source data -> imported tags -> built cache map -> runtime**. The [c20 modding introduction](https://c20.reclaimers.net/general/intro/) explains why reverse extraction is not always lossless. The [Invader repo](https://github.com/SnowyMouse/invader) confirms independently supported archive, extract, dependency and build tools, but these are external prerequisites, not bundled binaries.

## Specific restoration evidence already in the recovered project

The project's `ZOMBIE_APOCALYPSE_ARCHAEOLOGY.md` records real metadata and bounded inspections from a previous owner-supplied corpus. It includes eight scenario paths (some byte duplicates), Demo/Trial v6 and classic version-7 cache variants, original README claims, dependency differences and resource hashes. It documents that the old spawning trick appears to reference zombie-containing vehicle actor variants, even though scenario encounters may be absent. Replacing these relationships with ordinary actors would not be a faithful restoration. Previous Invader/MCC attempts stopped on incomplete extraction, missing audio, incompatible palettes or placement indices. **No complete playable restoration was proven**. Preserve these findings; do not run untrusted archived EXE/DLL assets.

Historical credits in the supplied readmes include Fonzie/AnonDavis (self-described authorship), MotaLev, Sparky, Kiyoshi, Broke, JnVn/JNVN and Modzy, with attribution uncertainty retained wherever the readme itself is tentative. These credits are not proof of permission to reuse Halo, Left 4 Dead or music assets.

## Seven non-destructive workflow translations in the application

The Academy's **Legacy Workflow Lab** now offers seven selectable source-aware paths:

1. Eschaton tag experiments -> preserved map identity, exact tag inspection, Invader-style extracted-tag source workflow.
2. HMT bitmap/model swaps -> bitmap class/tag checks and verified, non-redistributed local asset previews.
3. SwordEdit/SparkEdit scenario placement -> loaded world BSP plus editable staged source/placements, not direct cache pokes.
4. SparkEdit log mods -> author actual source geometry in QuickForge, then compile instead of claiming scenery is collision.
5. BSP extension/tunnels -> topology, near-seam audit and Tool/WRL diagnostics, with general room CSG and collision still open.
6. Classic Halo menu/HUD -> user-owned source-hash-pinned bitm accent; full UI widget and atlas reconstruction still open.
7. Zombie Apocalypse restoration -> exact original source comparison, actor/weapon/vehicle references and gameplay proof plan.

Each path shows what the current project's source and inspection actually prove, links to a historical reference, opens its modern workspace, and exports a **path-free JSON handoff**. No map bytes, tag paths, original assets, private tool locations or untrusted old executable content are included. Compiler, collision, tag-roundtrip and runtime verification fields are always false, regardless of saved build records or source preview results.

## Guiding principles for every future patch

- **Immediate feedback, not false certification.** A new creator can see why a property or tag matters, but every unsupported Halo engine behavior stays marked experimental.
- **Original maps are sacred.** Preserve source SHA; stage edits as copies; record rights and credits; never make an installed cache or library folder a surprise write target.
- **Learn from failures.** WRL and Tool errors should point to the suspect editable source brush with confidence bounds, not silently repair everything or ignore a fatal compiler message.
- **One application, not a launcher.** The interface should give a joined-up authoring, asset, compilation, QA and sharing story even when native external binaries are needed behind the scenes.
- **Modern usability with authentic atmosphere.** Use user-owned, verified `bitm` and `snd!` references on an optional profile; never bundle copyrighted menu art, assume a sprite is a standalone texture, or make disabled user controls unusable.
- **Every genre earns gameplay proof.** Arena, First Contact, Zombie Apocalypse, custom Firefight, private server sessions and networked AI each require compatible runtime-specific acceptance.
- **Value the old community.** Credit named creators only when backed by archived evidence, distinguish folklore from verified behavior, and keep historical resources readable if original downloads eventually disappear.

## Open work that cannot be claimed completed by this research release

| Rank | Missing engineering | Required acceptance |
| --- | --- | --- |
| Critical | First compiled and playable Halo CE Guilty Spark Test Arena | Isolated Tool structure -> valid BSP and collision/portal processing -> scenario -> cache -> in-game play |
| Critical | Generic editable imported BSP, tag and dependency roundtrip | Representative real owner-owned cache and source tag per class, lossless fields, stable hashes, no silent reference loss |
| Critical | Proper wall-tunnel Boolean apertures, portal/PVS and collision repair | Source topology + Tool WRL + collision walk/vehicle/projectile tests, with explicit unsupported cases |
| High | Full bitmap/shader, UI sprites, sky, fog and baked-lightmap fidelity | Image parity against actual Halo with provenance-checked pixels, UV channels and shader stages |
| High | Actual Zombie/Firefight spawn loop and full First Contact scenario | Valid source encounter/actor setup, scripts, pathfinding, real playable sessions |
| High | Version-specific private multiplayer, native gametype files, AI networking and co-op | Two machines, exact engine builds, synchronized actors/objectives and recorded pass/fail evidence |
| Future | Mac Demo/PC/CE/MD conversion, Linux/Apple Silicon, split-screen, 128 players, VR | Separate versioned engine/toolchain/runtime implementations; no cache header relabeling |

**Research restraint:** The original Phase 3-7 Codex prompts remain incompletely recoverable. `ORIGINAL_92_REQUIREMENTS_RECONSTRUCTION.md` and `PHASE3_10_FEATURE_TRACEABILITY.csv` remain the functional baseline. Nothing absent from the preserved prompts is assumed completed or intentionally dropped.
