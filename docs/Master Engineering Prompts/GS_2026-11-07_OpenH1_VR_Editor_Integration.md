# GUILTY SPARK — OPENH1 VR EDITOR INTEGRATION
## Corrected Priority — Integration, Not Engine Duplication

**Stop treating this as a project to port OpenH1 VR to Windows. That is not our objective.**

The OpenH1 maintainer is aware of Guilty Spark and has expressed interest in our VR level-editing concept.

Our goal is to make **Spark a fully functional immersive Halo level editor**, tapping into OpenH1's existing VR capabilities and engine interfaces wherever practical.

The workflow:

**Open a Halo map in Spark → enter VR editing → fly through the level → place and modify assets → edit tags → save and compile → launch into OpenH1 VR → playtest → return to editing.**

### 1. Investigate integration before implementing

Examine OpenH1's current OpenXR, controller tracking, VR camera, object interaction, scene rendering and game-loading implementations.

Examine Spark's existing Level Editor, BSP Workshop, Tag Editor, Asset Library, native compiler, Live Link and SparkLink systems.

Identify the cleanest architecture for a Spark-controlled VR editing session.

Prefer reusing OpenH1's VR presentation and interaction capabilities through a versioned, opt-in integration over building another Halo renderer or game engine.

Determine whether a small OpenH1-side editor interface, developed cooperatively with its maintainers, is appropriate.

If an external Spark VR interface is necessary, reuse Spark's existing rendering and authoring infrastructure rather than making a second editor.

Do not assume an external OpenH1 API already exists. Distinguish existing capabilities from proposed engine integration.

### 2. Build the actual VR editor

A creator wearing a headset must be able to:

- Fly freely around a loaded Halo map using VR controllers.
- Select objects with controller rays or direct grabbing.
- Browse Spark's existing maps, tags and assets in a floating VR palette.
- Drag and place weapons, vehicles, bipeds, scenery and other native assets.
- Move, rotate, scale where supported, duplicate and delete objects.
- Open a readable VR tag inspector and edit supported properties.
- Create spawns, AI encounters, objectives, triggers and gameplay markers.
- Inspect terrain and perform supported BSP/geometry modifications.
- Undo/Redo and save edits to Spark's authoritative project.
- See supported changes reflected in the editor without corrupting native game data.

Use existing Spark features and native tooling. Keep runtime-safe changes separate from those requiring a native rebuild.

### 3. Launch directly into OpenH1 VR

After editing, Spark should:

1. Save the authoritative project.
2. Compile the map using its existing native Halo toolchain.
3. Validate the map and dependencies independently.
4. Detect a compatible installed OpenH1 VR runtime.
5. Launch the map in VR using supported OpenH1 mechanisms.
6. Preserve the Spark project and allow returning to the editor.

The VR launch must use an actually supported OpenH1 build and platform. Windows SteamVR compatibility is an integration requirement to investigate with the maintainer, **not authorization to develop an independent Windows engine port**.

Support HTC Vive/Knuckles first when a compatible runtime is available, with Quest 2 as another hardware target.

### 4. Real-time integration

The long-term goal is for Spark and OpenH1 to communicate bidirectionally.

Spark owns project state, tag editing, Undo/Redo, asset management and native compilation.

OpenH1 provides supported immersive rendering, tracking, interaction and gameplay execution.

Investigate synchronized camera state, object selection, object placement and supported live changes through a narrow, versioned interface.

All changes must respect runtime capabilities, multiplayer authority and native Halo requirements.

### 5. First required proof

Deliver one complete VR editing workflow:

**Load Blood Gulch → fly in VR → select a Warthog from Spark's Asset Library → place and reposition it → edit one supported property → save → compile → launch and see that Warthog in OpenH1 VR.**

Use real source files and real native output.

If no compatible headset/runtime is available, implement and test the independent authoring and build portions, then clearly mark the headset step unverified.

Do not claim success from mock input or a desktop preview.

### 6. Project safeguards

Keep the current 19-map MegaWorld, Chupathingy, machinima, Firefight, Zombie Apocalypse and cross-platform directives intact.

Preserve all original Halo files, ISO assets, previous successful builds, local changes and requirement IDs.

Do not create new worktrees, duplicate editor systems or submit unsolicited OpenH1 pull requests.

Respect OpenH1's AGPL licensing and collaborate with the maintainer on any proposed engine-side changes.

**Focus on integrating Spark with OpenH1 VR, not recreating OpenH1. Get one actual creator workflow working end to end.**