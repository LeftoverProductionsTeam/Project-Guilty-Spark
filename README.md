<div align="center">

# PROJECT GUILTY SPARK

### ALL THE TOOLS, AND THEN SOME.

**THE FRONT DOOR TO HALO 1 MODDING.**

Your maps. Your tools. Your favorite flavor of Halo. One place to make some shit.

**[GET THE COMMUNITY ALPHA](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/releases/tag/v0.4.1-preview.5) | [GET STARTED](docs/GETTING_STARTED.md) | [TELL ME WHAT BROKE](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/issues/new/choose)**

</div>

![Guilty Spark editing a real Halo map on Windows](docs/screenshots/c60/native-mcc-map.png)

## So what the fuck is Guilty Spark?

Back in the MacGamingMods days, I spent a stupid amount of time in Eschaton, SwordEdit and every other Halo tool I could get my hands on. Loved them. But I always wanted one damn place where I could open a map, tear into its tags, build something new and play the result without juggling fifteen programs and six copies of Halo.

I wanted that in 2010. Still want it. So I'm building it.

**Guilty Spark is an open-source, all-in-one Halo 1 creation suite.** It's a real editor, not just a pretty launcher for other people's tools. It also connects supported community tools and runtimes so the whole process feels like one workspace.

Have a tool you swear by? Bring it. Have a favorite version of Halo? Use it. Just want to load Blood Gulch and fuck around with a Warthog? That's kind of the point.

**The runtime manager is optional.** You don't need to move a single Halo folder just to use Spark as a modding tool.

## Okay, what can I actually do with this thing?

### 1. Open a map and dig into the guts

Open supported Halo 1 maps, fly around the 3D world and inspect **BSP geometry, objects, scenery, models, shaders, bitmaps, sounds, tags and their references**. Preview source textures, model materials and supported sound samples without playing guessing games with raw IDs.

Spark recognizes several Halo 1 source families: **Custom Edition, MCC Halo 1, Demo, community-engine content, and supported original PC/Xbox/legacy sources**. Inspection, editing, building and actual game compatibility are different things. Not every format supports every operation, because Halo's file formats are a goddamn adventure.

### 2. Edit the actual map

Select and move supported scenery and objects using the 3D gizmo. Rotate, duplicate, copy/paste, snap and tweak supported tag fields. Drag compatible assets from the library, bring along their required native dependencies, and keep real **Undo/Redo, Save, separate map histories and restart recovery**.

Multiple maps? Open them in tabs. Want the tag editor or another view on a second monitor? Detach eligible windows. Want to go back to the map you were working on twenty minutes ago? Spark remembers your workspace instead of making you start from scratch.

### 3. Make your own geometry

The **Forge / BSP Workshop** includes linked editing views, rooms, corridors, ramps, faces, edges, vertices, extrusion, UVs, materials, player starts and supported native placements.

You can assemble compatible BSP source, build tunnels and connections, and feed it into the right Halo toolchain. There's even a supported **door + trigger + HaloScript** workflow that compiled and opened both ways in H1A Standalone.

Yes, I'm working on the whole **drive a Warthog through a mountain tunnel between maps** thing. The Timberland-Sidewinder prototype compiles and loads. Full human/vehicle two-way traversal and the big seamless world still need proof. A map loading is not the same as a map playing correctly. Fucking Halo.

### 4. Actually edit tags, models, sounds and materials

Browse tag classes and references, edit supported fields, preview shaders and models, inspect original texture detail and lightmaps, and audition supported Halo sounds. Import supported OBJ scenery through a reviewed geometry workflow, or use the matching native tools to prepare and rebuild more involved assets.

There's source-aware **sky, fog, lighting and environment authoring**, native sound-emitter work, and tools for inspecting what actually ended up in a compiled map. Full in-game shading, animations and lighting parity are still being worked on. I won't pretend a pretty viewport is identical to the engine.

### 5. Bring the tools we all grew up with

**Invader. Guerilla. Sapien. Halo Tool. Baboon. Blender.** And a growing catalog of other stuff.

Spark can help match supported tools to a compatible map and editing kit, prepare separate working files, launch reviewed tool workflows, pick up supported external edits and bring those changes back into an accepted build revision.

The goal isn't to replace the legends who built the Halo modding scene. Those tools are why we're still doing this shit. I want to connect them, fill the gaps, and stop making modders perform twelve manual rituals just to change something.

Not every tool has full integration. Some are registered companions; others only have specific tested handoffs. See the [real tool compatibility list](docs/COMPATIBLE_TOOLS.md).

### 6. Build it, check it and get it into Halo

For supported targets, Spark stages native source and dependencies, runs the matching build workflow, validates the resulting map or tags, and opens a compiled revision separately for inspection.

Some narrowly supported MCC cache edits can be made on **independent preserved copies** without reconstructing everything. Larger changes use the proper CE/MCC native toolchain. You can inspect an output and test it in a compatible runtime.

This isn't one magical format that every Halo engine eats. Selecting another runtime doesn't automatically convert your map. If a route isn't supported, Spark should tell you instead of silently producing broken bullshit.

### 7. Mod with your friends and change things in-game

**SparkLink** shares supported source edits, placements, author-owned Undo, conflicts and revisions between independent Spark editors. Three real editor processes have passed the local native collaboration workflow. Two physical computers are still an open acceptance gate.

**Live Link** has specific tested MCC game-side operations. **Live Rebuild** can compile a frozen source revision, reload a validated map into a Spark-owned Chupathingy server, and roll back to the previous good version if a build goes sideways. Native tests include two real game clients on one computer.

Editor co-op, live game editing and multiplayer game networking are not the same thing. I'm building toward all of it, but don't mistake the current tests for universal engine cross-play or hot-swappable BSPs.

### 8. Stop keeping six Halos in six mystery folders

While working on this mess, I had **Custom Edition, Halo Trial, Chupathingy, OpenCE, OpenH1** and more scattered around. So Spark got a runtime manager.

It can discover supported existing installations, remember your profiles, optionally download reviewed community-engine packages into separate managed folders, and select the compatible engine for your next launch. Shared content-library setup is optional and engine-specific.

**It does not need to replace the EXE in your original Halo installation.** Want to ignore all this and just open a map? Please do.

Runtime-specific hosting and joining exist, too. That's not the same as magically unifying every Halo multiplayer protocol. Yet.

### 9. Make machinima and learn the damn thing

You can work with supported **camera keys, takes, recording views and reversible greenscreen** options, plus source-aware atmosphere and material previews.

There's a **Learning Center** with searchable workflow guides and an in-app glossary because nobody should need to decipher a fucking engineering thesis to place a door.

[Every documented capability](docs/CURRENT_FEATURES.md) | [Hands-on workflows](docs/DEMO_WORKFLOWS.md) | [Runtime compatibility](docs/COMPATIBILITY_MATRIX.md)

## The ridiculous shit I'm still building

These are the big ambitions, **not a list of magically finished features**:

- **MegaWorld:** nineteen planned Halo regions connected by real terrain, caves, mountains and Warthog roads. Prototypes compile and load; the complete world and verified two-way gameplay aren't done.
- **Zombie Apocalypse and Firefight:** original zombie mechanics, native AI encounters, proper wave survival, sounds, scoring and co-op. Authoring tools and native experiments exist; full accepted player combat isn't done.
- **Extraction:** Halo PvPvE with loot, banked inventory, actual extraction and persistence, without forcing a raid timer. Not a finished playable mode.
- **More ways to play together:** multiplayer AI, expanded co-op, more peers, runtime bridges and split-screen. Real engine/peer acceptance is still ahead.
- **VR and more platforms:** OpenH1 headset editing, native Linux and macOS releases, and keeping the old Mac/Demo stuff alive. Those are separate unfinished hardware and release gates.

I want Halo 1 to do things I couldn't pull off in 2010. I also want the damn thing to work before I call those features done.

## Will Spark fuck up my Halo files?

Fair question. Some of us have been hoarding maps, tags, SDKs and questionable modding utilities for twenty years. I'd be pissed if a shiny new alpha destroyed that collection too.

**Here's how it's designed to behave:**

- **Open a map:** read the original; saved imported projects use a managed copy. Opening Blood Gulch should not overwrite Blood Gulch.
- **Edit, save and compile:** write project files and separate working/build outputs, with source hashes, revision checks and preservation rules.
- **Find existing runtimes:** discovery doesn't automatically move, reinstall or delete them.
- **Optionally install managed engines:** use their own reviewed folders rather than clobbering a stock Halo installation.
- **Optionally install presentation packs:** this **can add files** in a selected engine's `mods` directory. Applying pack choices when launching **can modify** its `mods/load_order.toml`.
- **Clean temporary output:** Spark **can delete** verified Spark-owned generated files after review and confirmation. That's an actual destructive operation, not a claim that the app is read-only.
- **Launch external tools:** those are independent programs with their own file-writing behavior, not magically sandboxed by Spark.

I've built in hashing, isolated workspaces, original-source protection, path checks and ownership-aware cleanup. That's a shitload of safety engineering. **It's still a community alpha, not an ironclad promise that software can never have a bug.** Back up anything irreplaceable and try your first edits on disposable copies.

If Spark touches a file it shouldn't, loses an edit, or does some truly stupid shit, **tell me what you did and what changed. I'll dig into it.** Protecting people's Halo collections isn't negotiable.

## Get the Community Alpha

**Windows 10/11 x64 | v0.4.1 Preview 5 | unsigned development build**

**[WINDOWS INSTALLER](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/releases/download/v0.4.1-preview.5/Project_Guilty_Spark_0.4.1_windows_x64_Setup.exe) | [PORTABLE ZIP](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/releases/download/v0.4.1-preview.5/Project_Guilty_Spark_0.4.1_windows_x64_Portable.zip) | [CHECKSUMS](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/releases/tag/v0.4.1-preview.5)**

1. Open Spark. Connect a Halo installation if you want, or open a map.
2. Inspect the map, or create an editable source project. Change something small.
3. Save it. With a compatible source and editing kit, build and test what you made.

**Important:** Preview 5 is the actual November 10 release build. Newer changes on GitHub are **not automatically in that download**. No Halo games, maps, proprietary editing kits or external runtime binaries are bundled. Bring legally obtained content. Windows requires Microsoft WebView2. Development-host installation and uninstall passed; clean-machine and upgrade acceptance remain open.

[Getting started](docs/GETTING_STARTED.md) | [Known limits](docs/HUMAN_TEST_PLAN.md) | [Source/asset policy](docs/ASSET_AND_COPYRIGHT_POLICY.md)

## Now do something we couldn't do in 2010

Got a favorite tool? Some cursed old Halo build? A map you always wanted to make? A completely batshit idea?

**Try it. Break it. Tell me what sucks.** Show me something Spark can't do, tell me what it needs, and I'll keep working on it.

I don't want to bury the old Halo modding community. I was part of it. I love this shit. I'm trying to make one place where all those tools, engines and ideas can come together.

**[REPORT A BUG OR IDEA](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/issues/new/choose) | [CONTRIBUTE](CONTRIBUTING.md) | [ROADMAP](ROADMAP.md) | [COMMUNITY CREDITS](COMMUNITY_CREDITS.md)**

Independent, open-source community software under the [MIT License](LICENSE). Halo and its assets belong to their respective owners.

<div align="center">

**ALL THE TOOLS, AND THEN SOME.**

</div>
