<div align="center">

# PROJECT GUILTY SPARK

### ALL THE TOOLS, AND THEN SOME.

**The front door to Halo 1 modding.**

Open a map. Make something new. Bring your favorite tools and Halo runtimes along for the ride.

**[Download the Windows Community Alpha](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/releases/tag/v0.4.1-preview.5) · [Getting started](docs/GETTING_STARTED.md) · [Report a bug](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/issues/new/choose)**

</div>

![Guilty Spark running on Windows with a real Halo map](docs/screenshots/c60/native-mcc-map.png)

## What's Guilty Spark?

Guilty Spark is an open-source, all-in-one **Halo 1 creation suite**. It's the modding workspace I wished existed back in 2010: inspect a map, edit supported tags and assets, build geometry, use your existing Halo tools, and test the result without constantly starting over in another app.

**It's a modding tool first.** The tool and runtime manager is optional; you do not need to move or reorganize an existing Halo installation to try Spark.

### Make something

- **Open and inspect:** explore Halo maps, objects, models, textures, sounds and supported editable fields.
- **Create and build:** make rooms, ramps, tunnels and connected BSP source with the Forge/Workshop editors; compile supported projects through the correct Halo editing kit.
- **Bring your own tools:** connect supported workflows with Invader, Halo Tool, Guerilla, Sapien, Blender and other community tools. Integration varies; not every external application supports every action.
- **Create together:** SparkLink shares supported edits, assets, author-specific Undo and source revisions. Three independent local editors have passed native tests; real two-computer acceptance is still pending.
- **Get back into Halo:** Live Link supports specific tested MCC operations. Live Rebuild can compile and reload a validated map into a Spark-owned Chupathingy session, with previous-good recovery. These are not universal live-memory edits.
- **Pick your Halo:** detect existing installations or optionally install supported managed engines. Selecting a runtime changes what Spark launches next; it does not swap executables inside your original game folder.

**In development:** the complete 19-region MegaWorld, playable Zombie Apocalypse and Firefight, persistent Extraction, broader multiplayer AI, VR, and fully verified macOS/Linux releases. Their experiments and editors are not claims of finished gameplay.

## Try the alpha

**Windows 10/11 x64 · v0.4.1 Preview 5 · unsigned community build**

**[Installer](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/releases/download/v0.4.1-preview.5/Project_Guilty_Spark_0.4.1_windows_x64_Setup.exe)** · **[Portable ZIP](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/releases/download/v0.4.1-preview.5/Project_Guilty_Spark_0.4.1_windows_x64_Portable.zip)** · **[Release checksums](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/releases/tag/v0.4.1-preview.5)**

1. Launch Spark. Connect an existing Halo runtime **if you want to**, or go straight to your maps and editor tools.
2. Open a copy of a Halo map to explore it, or create an editable project in the Level Editor.
3. Change something, use Undo/Save, and follow the matching build-and-playtest workflow if your source and tools support it.

See the [step-by-step guide](docs/GETTING_STARTED.md), [supported runtimes and operations](docs/COMPATIBILITY_MATRIX.md), and [tool connections](docs/COMPATIBLE_TOOLS.md). You supply legally obtained Halo content; **games, maps, proprietary SDKs and runtime binaries are not bundled**. The Windows app uses Microsoft WebView2. Installation and uninstall were tested on the development host; clean-machine and upgrade testing remain open.

## What happens to my files?

The goal is **your Halo collection stays yours**.

- **Opening a map:** Spark reads your source and uses a managed copy for a saved imported project. Ordinary inspection does not overwrite the original game map.
- **Saving and building:** Spark writes its own project data, temporary working tags and compiled outputs. It checks source identities and stages native builds separately rather than editing a stock installation in place.
- **Optional runtime management:** existing installations stay in their folders. Approved managed engine downloads go into separate chosen or Spark-owned locations; they are not silently substituted into another game.
- **Optional presentation packs:** choosing to install a pack can create files in the selected runtime's `mods` folder. Applying saved pack choices on a deliberate game launch can modify that runtime's `mods/load_order.toml`. Do not enable this if you want *zero* changes to that runtime's configuration.
- **Temporary-file cleanup:** Spark can delete verified generated output after a review and confirmation. This is a real destructive action, not a claim that the entire application is read-only.

We have safeguards for file ownership, checksums, path traversal, source preservation and rollback, **but this is an alpha, not a zero-risk guarantee**. Back up irreplaceable mods and try your first edits on disposable copies. External tools and game engines run as separate software and may have their own file-writing behavior.

If Spark touches an unexpected path, alters an original, loses an edit or offers a confusing button, [tell us exactly what happened](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/issues/new/choose). Those are priority bugs.

## Help shape it

Have a favorite tool, runtime or a Halo modding workflow you've always wanted? **Try to make Spark do it. Tell us what works, what fails and what you wish it could do.**

[Community features and roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md) · [Known limits and human tests](docs/HUMAN_TEST_PLAN.md) · [Source and asset policy](docs/ASSET_AND_COPYRIGHT_POLICY.md)

Guilty Spark is independent community software, released under the [MIT License](LICENSE). Halo and its assets belong to their respective owners.

<div align="center">

**ALL THE TOOLS, AND THEN SOME.**

</div>
