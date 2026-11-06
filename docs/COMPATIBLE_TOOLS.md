# Compatible tools and native source setup

For C41 direct MCC map copies, configure the separately installed reviewed **Invader 0.55.0** folder containing `invader-crc.exe` and `invader-info.exe`. Both binaries are hash-checked against the exact reviewed Windows identities in [C41 engineering](CONTINUATION_41_ENGINEERING.md). The route invokes CRC `--fix-header` only on its owned candidate; independent info checks and a complete byte diff follow. It needs no loose-tag/SDK preparation. A different version is unavailable until reviewed. Native source routes keep their additional compatible editing-kit/tag dependencies. [Save and recovery guide](SMART_EDIT_WORKFLOWS.md).

Spark's canonical tool catalog is `crates/spark-core/data/tool_ecosystem.json`. **Tools for this map** assesses the current source, runtime, editing-kit generation and configured exact executable. Open **Dependencies & setup** to configure installations. Tool detection performs no automatic executable download or launch.

| Tool | Current Spark route | Suitable input / limitations |
| --- | --- | --- |
| Baboon 0.3.2 | Verified portable per-map HCEEK handoff, save monitoring, reconciliation, recovery and native rebuild | Validated MCC H1 loose tags; matching executable and definitions required. No direct Demo/Mac cache editing. |
| Invader 0.55.0.r4134.33518109 | Existing extraction/build/info plus C38 native dependency, bounding-radius and narrowly reviewed lens-flare operations | Each route has its own source/target boundary. C38 native operations require validated MCC H1 working tags. |
| H1A Tool / Guerilla / Sapien / Standalone | Existing isolated build and explicit source-aware launch plans | Installed Steam HCEEK, matching source and kit generation. A process starting does not establish map loading. |
| Classic HEK | Existing CE authoring/advanced launch routes | Explicit classic profile; never recommended as MCC H1A Tool. |
| Blender 5.2, static OBJ | Existing C70 private geometry fork, save detection, reviewed import, Undo/Save and native static-model build | Complete UVs and bounded closed geometry. OBJ does not carry Halo rigs, animation or MTL images. The separate Halo addon is not certified by this route. |
| Historical companions | Existing explicit registration, executable identity and compatibility candidates | Historical file support remains separate from native execution, conversion and successful gameplay. |

Invader edit SHA-256: `02e5f41da7f5dbfade250921869239f8d21c36c336cb0be081a9910dca17aa12`; dependency: `727e6983582f882b17a52822547ee1805c13856de912494ce28ff2a726a3b554`; bludgeon: `094c844b9bdc494341d0fd08c07bd0d23344ea224c71205ce9846e46452205f3`. Mismatched native-operation binaries remain unavailable.

## OpenCE Mantle — External Companion

The canonical catalog includes [OpenCE Mantle](https://github.com/SutlabSol/OpenCE-Mantle), with [official releases](https://github.com/SutlabSol/OpenCE-Mantle/releases). Upstream v0.7.0 was reviewed at commit `ccedcec379bb4e4bbfe815297fec9fbf8913bf5d` on 2026-10-30. The tagged README still contains older version text; the release tag and installed application identity are separate facts.

Select **Halo Custom Edition** and open an actual CE PC **cache 609**. In **Tools for this map**, select the already installed portable/application executable. No tool is downloaded or installed. The registered file hash is checked again before an explicitly confirmed normal launch. The dedicated card is hidden for incompatible map formats and runtimes; a CE runtime selection cannot turn an MCC/Xbox/Demo/retail/HaloMD cache into supported source.

No reliable Windows map/project CLI contract was established from the reviewed Electron entry point. Spark supplies **zero arguments**, including no original map or source path. Open an isolated copy inside Mantle. An executable selection/hash is not proof of product version, application startup, safe save behavior, conversion or gameplay. Actual Mantle launch/edit/reconcile acceptance is **unverified** because no approved installed Mantle binary was supplied. Existing generic user-owned companion registration remains a separate manual facility and does not certify any application’s format support.

Mantle is external and not bundled. Upstream documents GPL-3.0 generated definitions and combined distribution. No Mantle source, definitions, assets or UI were reused in Spark; future code reuse needs its own license review.

**leftknut candidate:** reported OBJ/scenery import, triangulation, collision, basic UVs and bitmap painting remain unverified. The official project name, repository, license, executable and runtime/cache matrix are missing. Spark offers no guessed download or launcher. An untested borrowed BSP combiner and reported Forge startup failure are recorded without assigning a cause. Game-source Forge/Firefight integration is distinct from tag/cache authoring.

## Researched, not integrated

| Upstream | Reviewed purpose | License / boundary |
| --- | --- | --- |
| [Blender Halo Asset Toolset](https://github.com/General-101/Halo-Asset-Blender-Development-Toolset) | Edition-specific source mesh/animation import and export | MIT. Addon-specific installation/export remains unverified; the independently tested ordinary Blender OBJ handoff above is separate. |
| [OpenTool](https://github.com/HiIAmMoot/OpenTool) | Catalogued H1A lightmap companion | Existing catalog marks native bake/adoption/game acceptance unverified. Do not apply in-place/no-backup options to original tags. |
| [Osoyoos](https://github.com/num0005/Osoyoos-Launcher) | Editing-kit profiles and workflow launcher | MIT plus separately licensed references/placeholders. No Spark execution route. |
| [MEK](https://github.com/Sigmmma/mek) | Mozzarilla tag editing, Refinery extraction and related utilities | GPL-3.0 at the kit root; exact module/binary review still required. No MCC or OpenSauce round-trip claim from installation alone. |
| [Reclaimer](https://github.com/Gravemind2401/Reclaimer) | Cache asset inspection/export | GPL-3.0. Asset export is not native tag rebuild validation. |
| [Assembly](https://github.com/XboxChaos/Assembly) | Generation-specific cache inspection/editing | GPL-3.0; upstream precompiled distribution restrictions retained. No Spark live-memory bridge. |
| [Excession](https://learn.microsoft.com/en-us/halo-master-chief-collection/excession/creatingmodpackage/creatinghome) | Official MCC mod packaging/publishing | Separately installed official software. Existing Spark package preparation is not Excession validation or upload. |
| [Foundry](https://github.com/ILoveAGoodCrisp/Foundry) | Current upstream identifies H1–H4 editing kits; individual source/import/export routes need verification | GPL-3.0. Earlier Reach/H4/H2AMP-only descriptions do not represent all current source declarations. No Spark integration claimed. |

Review date: 2026-10-30. The catalog describes reviewed upstream declarations, not a promise that their moving development branches are tested releases. Native tool licensing remains separate from rights to game assets. Spark redistributes none of these external programs or proprietary game files.

## Founder acceptance

With a validated QuickForge MCC build open, select **Tag editor**, expand **Invader**, choose `weap · weapons/pistol/pistol`, preview a different bounding radius, and accept it. Build the working tag edits. Confirm the new cache's pistol radius and use Standalone/MCC to test the intended behavior. Keep the original map tab open; recovery is available from the retained preview.

## Edit geometry in Blender and return to Spark

Start with a compatible native project and its configured editing kit/tag inputs. The same catalog, source ownership and native compiler are used throughout.

1. Import your OBJ in **Asset workshop** and select it. Choose **Prepare Blender edit** under **External geometry handoff**.
2. Use the displayed **Blender OBJ working file**. Open Blender, import that working file, edit it, then export OBJ back to that path. Spark supplies a private baseline and working copy; it does not ask Blender to overwrite the referenced original.
3. Return to Spark. A stable save is detected while the workspace is active. Choose **Review geometry save**, then **Import reviewed geometry copy**. Invalid geometry or an altered original/baseline is rejected; a timestamp alone does not identify the writer.
4. Place the newly imported asset. Undo/Redo and explicit Save preserve the original and revised asset identities. Ordinary inspection and edits remain in memory until Save; preparing the external fork is a deliberate disk-writing action.
5. Build through the compatible native target. Inspect the compiled render model and collision, then playtest separately in Halo. An OBJ preview or a successful Blender launch is not native/game acceptance.

Historical C70 evidence is retained in [c70-tool-roundtrip.json](fixtures/c70-tool-roundtrip.json). The memory-first handoff follow-through is recorded in [P0 release stabilization](P0_RELEASE_STABILIZATION.md); broader manual-GUI, addon, Mantle, OpenTool and gameplay gates remain independent.
