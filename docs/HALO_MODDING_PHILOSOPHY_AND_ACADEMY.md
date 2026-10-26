# Halo Combat Evolved modding philosophy: why the editor works this way

The 2004 Halo Editing Kit, classic Eschaton/HMT-style cache experiments, SwordEdit-style placement editors and the later MCC H1A Editing Kit informed Guilty Spark's all-in-one ambition. The best user experience is **one coherent workbench**, but every operation must still preserve Halo's source-build-runtime distinctions.

## Learn by doing, without pretending a preview is a game

1. **Respect source maps and authors**: inspect original imported maps read-only; preserve file SHA-256, provenance and credits; never mutate the installed cache. Personal experimentation should be reproducible and reversible.
2. **Understand the language of tags**: a scenery or weapon tag is not just its tag ID. It references models, shaders, projectiles, collision and sounds. A cache tag reference is different from an actual editable dependency tree.
3. **Create geometry with intent**: world space meshes, UVs, normals and source heightfields are only inputs. The engine needs Tool's structure conversion, portals, collision and AI pathfinding data. Compare *real* viewport geometry against *compiled* runtime behavior.
4. **Separate three kinds of real-time**: (a) live scene editing and source triangle collision preview in Guilty Spark, (b) Sapien's actual in-engine object/AI/script preview, and (c) a playable test build/Standalone with the player controller. These are not interchangeable.
5. **Choose the runtime before the compiler**: CE legacy HEK and MCC H1A Tool have different content-path and script compilation behaviors. Xbox/Mac Demo, OpenCE, ChupathingyCE and MCC are NOT equivalent build targets.
6. **Ship learning content and honest diagnostics**: every button needs a purpose, data effect and limitation tooltip. Beginner tutorials should let users practice real actions; completion must be based on saved evidence and actual engine tests rather than click-to-award badges.
7. **Never turn 'Build & Play' green from a JSON/source export**: compiled cache structure/CRC is a different evidence level from game loading, gameplay rules and network AI. Build status must show the exact proof held.

## Original Tool/Sapien workflow details verified in modern references

- H1 Tool's `structure` compiles JMS geometry to a BSP tag, producing data for rendering, collision and AI pathfinding. It does **not** create lightmaps during structure compilation; use the separate `lightmaps` operation.
- On compiler geometry errors, use the generated `*.wrl` diagnostic, whose location differs between classic HEK and H1A.
- Classic HEK does not support the newer path override switches such as `-tags_dir`; H1A supports custom `-data_dir`, `-tags_dir` and `-game_root_dir`. Classic source trees are staged in an isolated working directory and Tool is invoked without H1A flags.
- **Do not interrupt Tool structure when it is updating a BSP tag in a valuable tag tree.** Its partial output can lose BSP-specific data not represented in JMS. Guilty Spark compiler writes are instead restricted to a fresh, disposable job workspace, with source tag copies and hashes. Wait for completion in valuable workflows.
- Sapien places scenario objects and encounters and can preview many game systems, but is NOT a full world geometry modeller or a player-controlled Halo session. MCC's H1A Standalone can load editable tags for fast player testing.
- Classic HEK requires Sapien's **Compile Scripts** action to embed `.hsc` source in a scenario. H1A automates compilation during supported load/build operations.

## Useful verified reading

- Reclaimers c20, H1 Tool: https://www.reclaimers.net/h1/h1-ek/h1-tool/
- Reclaimers c20, H1 Sapien: https://www.reclaimers.net/h1/h1-ek/h1-sapien/
- Reclaimers c20, H1 Editing Kit version differences: https://www.reclaimers.net/h1/h1-ek/
- Reclaimers c20, editing kit tool and data directory differences: https://reclaimers.net/general/mod-tools/
- Bungie-era HEK tools overview: https://nikon.bungie.org/misc/hek_tutorial/references/general/dev_tools_overview.html
- Earlier archived MacGamingMods / Halo Maps archaeology and original 92 requested requirements remain in `LEGACY_FORUM_RESEARCH_AND_GAP_RECONCILIATION.md` and `ORIGINAL_92_REQUIREMENTS_RECONSTRUCTION.md`.

**Rights:** Read historical tutorials and independent references for interoperability. Do not bundle copyrighted Halo maps, UI images, audio, or third-party binaries/sources without authorization.
