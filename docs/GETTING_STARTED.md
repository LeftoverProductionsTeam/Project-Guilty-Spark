# Connect your first Halo project

1. Open Spark → **Start here → Connect Your Halo Games**. Check which game runtime is found. Multiple editions can be registered through Runtimes & friends.
2. If MCC is installed but Map Builder is absent, install the separate free [Halo: CE Mod Tools - MCC](https://store.steampowered.com/app/1532190/) through Steam Library → Tools. Follow its supplied extraction instructions in a fresh working copy. Spark does not execute its batch files or overwrite stock tags.
3. Select the editing-kit folder, its generation and **Editable Halo Tags**, then choose **Check and connect editing kit**. Header/hash checks identify files; they do not prove the tools ran or a tagset is complete.
4. Import your own map in Map Library. Spark preserves a managed copy and records its identity. Open Level Editor. If shared images are needed, choose **Locate Halo Textures** and select the map's original resource folder. The source/index/image-span checks must pass. Supported MCC packs and internal rebuilt-map images have dedicated readers.
5. For an original level, create a QuickForge project. Add separate MCC/CE configurations under Build → Engine build targets. Each needs its own compatible editable tags, kit and Invader installation. No map binary is universally interchangeable.

**Editable Halo Tags** describe game objects, materials and scenarios. **Halo Textures** are images used by some compiled maps. **Map Builder** compiles source into a target-specific map. Source images/models live under the kit's data folder; temporary compiler jobs and caches belong to Spark's managed local data, not the original game directory.

World/QuickForge: left drag orbits, middle drag pans, wheel zooms; hold RMB to look and RMB+WASD to fly, R/F for height, Shift for speed. Select an object for its gizmo. Use the Preservation record for manual snapshots and a previewed restore; Settings controls the periodic interval and retention.

Imported maps open near a source player start when one exists. Use **View from player start** to choose another, or **Frame scene (F)** for the overview. Source fog can strongly haze the distant overview. **Restore source appearance** clears saved rendering overrides; it does not bake new game lighting.

Open **Map sounds** in the World inspector, search a tag path, load a permutation, then press **Play sample**. **Locate Halo Sounds folder** connects the original resources directory when sounds.map is needed. Shared samples must match their exact indexed tag/pitch/permutation and recorded hash. Looping an individual preview sample does not reproduce the game's looping-track transitions or spatial mixing. Tag editor exposes supported attenuation/pitch/gain and looping-track fields; compile and test changes in the matching game.

Halo and tool choices are remembered after onboarding. **Features** offers searchable rundowns and links into the tools; **How to / glossary** explains the terminology. Open several maps as tabs and move between Level Editor, Tags, Build and Machinima: each map retains its place and configuration. Save before handing a map to another window. **Open compiled map** opens a verified build in a separate preserved tab so its actual output geometry and textures can be reviewed.

In an imported map's Level Editor, **Connect another map’s BSP** selects another preserved map and one of its sections. Choose matching editable donor tags, adjust the transform and tunnel floor points, check source clearance, then apply and build. Native topology, lightmaps, compiled collision and cache checks must pass. A manual walk in Standalone and a retail MCC cache test remain separate acceptance steps. Runtime BSP replacement is unavailable.

For animation, drop a supported JMA/JMM-family source into Machinima, select a matching biped and rehearse its actual skeleton. Assign a custom action or a complete compatible animation graph and rebuild for engine changes. Native recording uses the SDK take controls: choose a camera, build, launch the take, and record the game window in OBS. See [Standalone workflow](STANDALONE_WORKFLOW.md).

Complete game shader parity, arbitrary cross-engine conversion and universal game acceptance remain incomplete. Legal source images can be matched without bundling their bytes in project exports. Read [compatibility](COMPATIBILITY_MATRIX.md) before building.
