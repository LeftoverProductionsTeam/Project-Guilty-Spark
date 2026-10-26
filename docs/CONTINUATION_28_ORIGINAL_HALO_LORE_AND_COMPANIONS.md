# 07 Halo Modding Brain — Original modding lore, preservation and companion support (C28)

## The creative philosophy to preserve

The 2004–2015 Halo PC/Mac/Demo community had a unique progression: change a weapon projectile in HMT or Eschaton, see it immediately in Halo; attach scenery and geometry using SparkEdit/SwordEdit; learn why scenery logs are not real world collision; then graduate to HEK's Tool/Guerilla/Sapien pipeline to build original BSPs and maps. The **speed of experimentation** and the **ability to understand and share a transformation** are the values Spark should restore. The fragile direct-cache writes, silent data corruption and one-off hacks should not become requirements.

Preserve two experiences simultaneously: (1) a modern integrated editor with authoritative source staging and (2) voluntary companion windows for historical programs that users already own. Spark must **never become only a launcher**. When the old tool cannot run, its techniques should still have a modern, source-safe equivalent inside Spark.

## Verified historical research

| Tool / source | What its documented history says | Resulting Spark design |
|---|---|---|
| [HMT](https://c20.reclaimers.net/h1/community-tools/obsolete/) (MonoxideC/tjc) | Popular 2004-era H1 PC/Xbox tag and asset injector/extractor, mentioned in *The Black Art of Halo Mods*. | Fast indexed tag exploration, class-safe edits, provenanced extraction rather than silent cache modification. |
| [Eschaton](https://c20.reclaimers.net/h1/community-tools/obsolete/) (Altimit01) | PC/Mac/Trial/CE direct map editing, bitmap replacement, XML-defined fields and tag rebuilding. Some edits could cause runtime exceptions, and processed runtime values may not reproduce when extracted. | Tag Lineage and reversibly staged edits; binary data only through verified source extraction. Companion app is opt-in, never a required dependency. |
| [SparkEdit](https://github.com/HaloMods/SparkEdit) (Grenadiac) | 3D scenario object placement; historical log-mod culture built additional spaces using scenery. | The editable 3D world must connect objects, source geometry and gameplay marker meaning. Scenery placements alone do not claim valid compiled BSP collision. |
| [SwordEdit](https://c20.reclaimers.net/h1/community-tools/obsolete/) | A Mac OS X SparkEdit fork associated by c20 with bobindashadows, Sword and Samuco. App-specific runtime compatibility is not verified in 2026. | A visual scenario editor with explicit engine/scenario compatibility; optional macOS companion only when a compatible user-owned bundle/runtime is available. |
| [HEK+](https://c20.reclaimers.net/h1/community-tools/obsolete/) | Historical extraction could introduce wrong values or corrupt audio; modern Invader extraction and repair tooling are preferred. | Preserve source hash and inspect output; never assume already-corrupted tag data can be auto-repaired or extracted perfectly. |
| [BSP/phantom collision](https://c20.reclaimers.net/h1/community-tools/obsolete/) | Ghostbuster phantom BSP fixes could generate collision holes and produce false positive/negative diagnostics. | Geometry seam, tunnel and WRL preflights may recommend fixes; only a real matching Tool compile and gameplay collision test can certify repairs. |
| [Reclaimer](https://c20.reclaimers.net/general/community-tools/reclaimer/) | Views/extracts several asset formats from supported maps; not an editable source `.tag` compiler. | User-owned asset recovery and materials are candidate inputs to a source pipeline, not proof of lossless round trip. |
| [HaloMD archive](https://halomd.macgamingmods.com/mods/) | Lists **Zombie Apocalypse 1.0**, Log Mod variations, and numerous community builds. | Preserve original variant provenance and creator credits; listing alone is not editable source, granted distribution rights or networked AI proof. |
| [MacGamingMods archive](https://www.macgamingmods.com/) | Lists Eschaton 0.8.1 and **Fonzie's Modding Pack v5** among other Halo Demo content. | Credit original authors and preserve reproducible, SHA-linked archaeology rather than silently rehosting binaries or assets. |
| [Halo editing source workflow](https://c20.reclaimers.net/general/intro/) | Source assets → imported tags → compiled maps is generally more reliable than direct-cache edits; reverse extraction is sometimes lossy. Modders are encouraged to share tags and source. | Keep all future formats and user tools visibly separated by source type and target engine, with reproducible map build evidence. |

## Running old apps alongside Spark

**Available in C28 source:** Modding Academy → Legacy Workflow Lab → Classic companion tools.

- The curated catalog tells the user which historical apps exist and whether a native/standard Wine **runtime candidate** is detected. It does not secretly scan their disks or assert that the tool is installed.
- Register a preinstalled Windows `.exe` or future macOS `.app` chosen by the owner. The binary is fingerprinted; changes fail closed until re-registration.
- Launch only after a new explicit confirmation. The process stays a separate application window. Spark passes no original map path and never silently installs legacy dependencies.
- Windows native, Wine and 64-bit macOS bundle loader **availability** are all weaker than proven app compatibility. The old app could still require missing components or crash.
- macOS Catalina 10.15+ does not execute 32-bit Mac applications natively. Wine executes Windows apps; it is not a way to execute PowerPC or 32-bit Mac `.app` bundles. Consult [Apple's support](https://support.apple.com/en-us/103076) and [WineHQ](https://www.winehq.org/).
- Spark's source packaging currently targets Windows; a polished, tested Mac edition remains future work. Do not present future Mac code paths as shipped platform support.

## Unfinished flagship proofs

1. **Guilty Spark Test Arena:** compiled original Halo CE map with genuine BSP and collision, correct five-mode objectives, checked material/lighting output and repeated stable map loads.
2. **Zombie Apocalypse recreation:** compare owner-provided variants, reconstruct actual vehicle/actor/spawning relationships, build in the appropriate engine and test real survival scoring. The original source and rights cannot be inferred from public archive metadata.
3. **First Contact campaign:** compile an actual small single-player level with navigation, HSC scripts, AI, cutscene triggers, collision/portals and save/load.
4. **Multiplayer AI/co-op:** test against a specific runtime; classic Halo 1 multiplayer does not automatically replicate AI simply because actors were placed in a map.
5. **Modern Halo UI:** rebuild editable layouts/widgets using locally verified and owned bitmap/sound data. A single source-pinned header bitmap is the first aesthetic step, not a completed UI theme pipeline.
6. **Lossless interchange and BSP repair:** validated cache and `.tag` round-trips, controlled CSG room/tunnel cutting, portal and collision rebuilding, and matched engine confirmation. No generic auto-fixer can promise zero errors for arbitrary malformed imported geometry.

**Research integrity:** These are documented capabilities and limitations of historical tools; the C28 source does not bundle their code, executables, maps, or media. Older Phase 3–7 original prompt bodies remain only partly recoverable. The 92 reconstructed requirements remain open unless a concrete acceptance test passes.
