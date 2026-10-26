# Project Guilty Spark — Continuation 5 engineering handoff

**Baseline:** `Project_Guilty_Spark_07_Halo_Modding_Brain_Continuation_4_SOURCE.zip` (exact previously issued source ZIP).  
**Scope:** Optional editor snapping, source-mesh exchange, provenance-bound cross-map tag-reference interchange, plus UI controls and offline regression tests.  
**Release classification:** Development **source**, not a new verified Windows installer, compiled Halo BSP, campaign, multiplayer mode, or finished ten-phase product. Existing v0.3.0 version stays unchanged until release QA.

## Implemented and user-facing

### QuickForge: opt-in placement snapping

- **Grid Snap on/off (G)** is independent of grid visibility and grid spacing (¼, ½, 1, 2 units, or no interval). Moving objects with the gizmo respects the toggle.
- **Mesh Snap on/off (M)** is a separate explicit control, default **off**. Supports source-brush placement and single-brush translation via the transform gizmo.
- Rectangular `box`, `wall`, `floor`, and `platform` meshes snap **face-to-face** when they have cardinal-axis rotations and overlapping projected faces within 1.25 world units. Unaligned non-cardinal geometries are skipped rather than given false exactness. Target hidden meshes are ignored; locked moved objects are not modified. Equally close, different possible placements are rejected as ambiguous.
- `caveTunnel` source rings snap together only when their normals oppose, radial subdivisions/inner and outer ring dimensions match, and the source generator's **complete ring topology** confirms an exact, unambiguous 1:1 junction. Previously implemented cap removal in the Rust JMS generator can then join those exact cave rims. It does **not** rebuild the Halo BSP collision/PVS or create a tunnel opening in a room.
- Non-cave rectangular brush face snapping is **placement alignment only**, **not** a mesh weld. Current Rust geometry validation continues to flag adjacent solid-brush contacts unless a proven source seam exists. This is important, deliberate failure behavior, not a hidden successful BSP build.
- Source ghosts show the intended placement; snap state is visible in the editor status and toolbar. Toggles are **session-local**, not serialized into a game map.

### Cross-map tag-reference exchange (not fake binary extraction)

- Tag Browser **Export tag reference + dependencies** downloads a bounded, inspectable JSON manifest of the selected tag's exact class, path, cache datum ID and resolved immediate dependency identities. It contains the exact source-cache SHA-256, cache version, engine family and scenario path; never raw tag payloads, user filesystem paths, or copyrighted binary resources.
- QuickForge's imported-map palette **Export visible refs** saves up to 128 source identities. **Import refs** reads at most 512 KiB, validates schema/path limits/duplicate identities and checks source SHA-256, cache version, datum ID, class and path against the currently inspected preserved map. If anything differs, import fails closed. Import creates a **palette filter** for matching source tags; the user then chooses what to place in a different QuickForge project. This preserves ordinary undo/edit persistence for placements and their provenance.
- A structured **Invader CLI argv preview** is provided in `src/haloExchange.ts` for a future isolated binary-extraction integration. It does **not execute Invader** or write to installed editing-kit folders. Verified CLI capabilities include `invader-extract --search --recursive --tags --maps` (see upstream README). Real `.tag` bytes and transitive required resources are **not** in a reference manifest; map version compatibility and the target compiler must still be resolved.

### Actual geometry export and roundtrip to Asset Workshop

- `src/haloObj.ts` exports **real indexed mesh triangles** from inspected render geometry, static bind-pose model previews and previously imported OBJ assets. It preserves existing normals and UVs, and emits distinct OBJ groups for actual shader-tag IDs and BSP/lightmap spans **as diagnostic labels** (no guessed textures). It checks index ranges, surface spans, finite coordinates and output size.
- In World, **Export viewed BSP as OBJ** and **Export selected model OBJ** are read-only, user-initiated downloads. In Asset Workshop, **Export selected mesh OBJ** downloads geometry that can be imported into another project using the existing **Import OBJ** path. No installed game data is overwritten.
- **Import of OBJ as editable compiled BSP** is *not* implemented. Import into the asset workshop is real, but generating a new `.scenario_structure_bsp`, portalization, collision, lightmaps and AI navigation still requires the authorized Halo editing toolchain and game testing.

### UI changes

- Independent snap buttons, spacing selector, keyboard shortcuts and snap status inside QuickForge; an explicit cross-map source-transfer section in the tag palette.
- Tag Browser has a specific reference/dependency export command. World and Assets expose actual OBJ downloads with clear source-vs-runtime labels.
- No UI action runs extracted community executables automatically or modifies `.map` files in a user's Halo installation.

## Offline QA and limitations

| Evidence | Result |
| --- | --- |
| Node 22 `npm run test:offline` | **13/13 suites pass**, including the three new tests |
| New snapping tests | Face-alignment, exact cave rings, rotations, hidden/locked targets, ambiguous 3-way and nonfinite input checks pass |
| Tag exchange tests | Source SHA/version checks, dependency identities, path traversal/wildcard rejection, duplicate records and untrusted JSON size checks pass |
| OBJ tests | Correct face indices, UV/normals and shader span grouping; malformed input rejected |
| Independent geometry consumer | Python `trimesh` loaded a generated OBJ and verified 4 vertices/2 faces for synthetic fixture |
| `tsc` isolated checks of new pure TypeScript modules | PASS with strict mode |
| Parse `src/**/*.ts(x)` | PASS; syntactic correctness only |
| Rust `cargo test`, dependency-resolved Vite/Tauri build | **NOT EXECUTED** (Rust and Node project packages unavailable in this environment) |
| Real Halo game and 2+ client networking | **NOT EXECUTED**; requires authorized runtime, game assets and machine access |

## Critical remaining engineering milestones (ten phases still open)

1. **Complete automatic authentic texture decoding** — resolve `bitmap` tags and `bitmaps.map` resource pointers, permutations/mip levels, shader types, alpha, lightmaps and sky/water/weather from *owned* cache bytes; compare actual pixels against established tools and wire into 3D material pipeline. Current manual DDS/TIFF path is not that.
2. **Editable compiled BSP / playable caves** — editable source reconstruction or independent CSG source; seal room↔cave openings, weld exact mesh topology, construct collision, portals/PVS, lighting, AI/navigation; compile via Tool `structure` and `lightmaps`, then load a map in-game. The new mesh snap alone is not gameplay geometry.
3. **Playable First Contact** — actual scenario tag palettes/encounters, AI placements/navigation, checkpoints, devices, dialogue and compiled cinematic camera markers; compile and play through on the chosen engine.
4. **In-engine Firefight / Zombie Apocalypse** — recover approved historical assets; integrate wave spawning, damage/lives/infection scoring, engine AI death semantics, spawning and map runtime. Current `.hsc` is an export, not executed gameplay.
5. **Multiplayer / server fabric** — engine-specific host/join and version negotiation, real network AI synchronization (Halo 1 stock multiplayer does not replicate campaign AI), four-client tests, safe dedicated server rotation/deployment with opt-in settings and rollback.
6. **All other Codex requirements** — Toolchain Fabric, historical tool provenance/licensing, team revision merge, secure mod sharing/install/update rollback, Modding Academy, rich Theme Forge/Sound Workshop, genuine PowerPC Demo exports/bridge and release signatures. Retain all original 92 traceability rows rather than discarding or marking unbuilt features as complete.

## Tested integration points and exact first test

**First test:** On a Windows development PC, extract this ZIP into a *new* folder, **not** a Halo install, and run `npm run test:offline` using Node 22+. Record the first error. Next tests are `pnpm install --frozen-lockfile`, `pnpm test`, `cargo test -p spark-core`, then `pnpm desktop`, with the target engine/hardware tests last. Do not run unverified extracted EXEs or overwrite stock game maps.

Suggested UI acceptance once desktop boots: QuickForge → add a floor and cover box → toggle Grid Snap (G) off and Mesh Snap (M) on → move the box within 1.25 units of the floor face → confirm accurate surface contact and correct visual report; then turn Mesh Snap off and verify no auto-alignment. Repeat with two matching cave tubes, then test an incompatible segment count. Import two personally owned Halo maps, export references in Tags, choose the exact source in QuickForge and import the JSON; change the source to a different cache and confirm the manifest is rejected. Open World → export a BSP OBJ → import that OBJ into a separate project's Asset Workshop. Confirm source-cache hashes are unchanged.

## Primary format references (verified 2026-10-26)

- Halo 1 Tool `structure`: <https://www.reclaimers.net/h1/h1-ek/h1-tool/> — JMS-to-BSP, collision/visibility/pathfinding conversion, subsequent `lightmaps` stage.
- Halo 1 JMS source format: <https://c20.reclaimers.net/general/source-data/jms/>.
- Invader README / `invader-extract`: <https://github.com/SnowyMouse/invader> — explicit search, recursive and isolated tag-folder arguments. Tag extraction is a separate operation from JSON interchange.
- MCC official editing kit overview: <https://learn.microsoft.com/en-us/halo-master-chief-collection/general/overview-tools> — Tool, Guerilla, Sapien and data/tags separation.

The source archive contains neither stock Halo art/binaries nor a new complete engine. No installed file is replaced or firewall/anti-cheat setting changed.
