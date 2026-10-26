# Halo CE / Blam: multiplayer scenario data guide

**Scope:** verified references for classic Halo 1 (Custom Edition / PC-family) authoring. The terms here describe *scenario tag* structure and official Editing Kit authoring, **not** live edits to a compiled cache. The editor is a source-authoring application; all export and build functionality remains subject to target-specific tool/version verification.

## Scenario multiplayer data

| Game mode | Scenario requirements and native netgame type | Authoring / failure risks |
|---|---|---|
| Slayer / team Slayer | Player starting locations with appropriate `type_0..type_3` mode entries. No special objective flag is needed. | Spawn clearances and team composition require actual game testing. |
| Capture the Flag | `netgame_flags` type `ctf_flag` (`0`), **usage ID 0 for red and 1 for blue**. | Inverted/incorrectly located flags can cause the game to disable player starts, leaving players stuck waiting to spawn. Duplicate team IDs are blocked in QuickForge. |
| Oddball | type `oddball_ball_spawn` (`2`), with separate usage IDs `0..15`. | Spawn IDs must be unique and sequential from zero. The index is NOT a team number. The ball uses its own facing conventions. |
| Race | type `race_track` (`3`), up to 32 numbered checkpoint IDs `0..31`. | Course IDs must be unique and consecutive. The Rally variant uses random checkpoint order; do not conflate Race with Rally sequencing. |
| King of the Hill | type `hill_flag` (`8`). A single marker describes a 2-by-2-world-unit hill, or 3–8 markers sharing a usage ID describe a convex XY boundary. | **Exactly two markers in one hill group can cause a Halo exception.** Noncollinear but duplicated points also create ambiguous boundaries. Group zero is the initial neutral hill. Use separate groups for moving/Crazy King. |

Halo CE also supports additional netgame flag types (`race_vehicle`, `teleport_from`, `teleport_to`), and separate support for weapon/vehicle equipment and special surfaces. Those are **not yet fully authored in this QuickForge object model**. The game-mode matrix reflects current *source completeness* only; it is never evidence of real engine playback, collision, matchmaking or AI synchronization.

### Input and stage rules

- Original `.map` inputs are inspected read-only. Local cache IDs are not imported editable `.scenario`/`.tag` files. Always export to an isolated project workspace and require actual compatible toolchain stage.
- The QuickForge hierarchy contains the individual markers. The **Add four-corner hill** palette item can be dragged onto the map. Each corner is independently draggable via XYZ handles and all four share a group/usage ID.
- **Show hill regions** overlays a translucent convex hull in the editor. The preview cannot be used as a physical collision surface or to attest actual game scoring.
- Player starting locations may be set to `allGames` to enable every stock mode, but spawns may still be disabled due to clearance/collision/team proximity. Review in Sapien.
- The native Rust `scenario_commands()` build-plan generator now checks unsafe netgame records *again*, even when the frontend has reported them already. Two-point hills, duplicate IDs, invalid CTF teams and nonconsecutive Ball/Race indices cannot silently pass into the scenario command plan.
- The **Rust-native usage ID is type dependent**: CTF/hill/Oddball use the stored `team` field, and Race uses `sequence` in the current source schema. Legacy QuickForge `hill`/`oddball` records with `team=-1` retain their old `sequence` usage ID until explicitly migrated.
- No change in this continuation grants the app the ability to write an original cache or native `blam.lst` gametype file.

## Original documentation and research (read before exporting)

1. c20 community reverse-engineered [`scenario` schema](https://c20.reclaimers.net/h1/tags/scenario/), especially **player starting locations** and **netgame flags**. Documents field types, native enum values, group semantics, limits, and special flag types. Credits belong to c20 contributors, not Guilty Spark.
2. c20 [`Halo 1 game modes`](https://c20.reclaimers.net/h1/engine/game-modes/). Includes the exactly-two-hill crash, Crazy King start behavior and CTF spawn-proximity failure mode.
3. Archived [original HEK multiplayer population tutorial](https://nikon.bungie.org/misc/hek_tutorial/references/level_design/mp_level_design/mp_ld_level_population.html) describing Sapien netgame placement and the group/team index semantics.
4. Archived [general HEK level design guidelines](https://nikon.bungie.org/misc/hek_tutorial/references/general/general_ld_info.html). Originally advocates that multiplayer maps support all five stock modes and recommends ample player starts; the quantities in this historical guidance are design recommendations, **not** proof that every engine version has a corresponding minimum hard gate.
5. Archived [HEK multiplayer level creation overview](https://nikon.bungie.org/misc/hek_tutorial/references/level_design/mp_level_design/hmp_ld_general_overview.html). A playable BSP must be a sealed world for collision and BSP creation; attached scenery is a separate object class.
6. Archived [HEK playtest/export workflow](https://nikon.bungie.org/misc/hek_tutorial/references/level_design/mp_level_design/mp_ld_level_running_in_game.html). Compile to an actual Halo cache and run the target engine; JMS is only source geometry.
7. Community writers catalogued separately in [`ORIGINAL_FORUM_TUTORIAL_AUTHORS.md`](ORIGINAL_FORUM_TUTORIAL_AUTHORS.md), including **Xzzy** for netgame flag placement. The built-in Academy's `gametypeObjectives` is new explanatory content, not a reproduction or reattribution of these authors' work.

## Acceptance tests (pending real Windows/engine installation)

1. Launch the Continuation 14 editor and open the original QuickForge test arena. Choose Halo Custom Edition and create two separate 4-corner hills at different map locations. Check their numeric usage IDs, redraws and G/M snapping behavior.
2. Move one hill marker onto another. Confirm the error blocks source export. Remove it and check the errors clear. Repeat with exactly **two** flags under one group; confirm native export is blocked.
3. Create red and blue CTF flags, 16 optional Oddball spawns if desired, two or more numbered Race checkpoints and suitable team-mode player starts. Review each game-mode matrix status.
4. Export through a verified HEK or Invader toolchain to a **new** source directory and examine `netgame_flags[*]` `type` and `usage_id` setters. Any command/schema discrepancy must be corrected before running the native tool. Keep originals intact.
5. Verify scenario flags in Sapien, compile the full BSP and cache, and test Slayer, CTF, Oddball, King/Crazy King and Race in the real target runtime. Confirm CTF/ball placement, hill scoring, Race order, and spawn viability. Record hashes, exact tool versions and compiler/game logs. Two-machine multiplayer tests remain separate.

**Verification status:** JS offline tests pass in the source build. Native Rust `quickforge_gametypes.rs` tests are added, but Rust/Cargo and the actual HEK/Sapien/game are unavailable in this environment. Do not mark engine acceptance as satisfied.

## Continuation 15: full native netgame marker palette

| QuickForge source kind | Halo CE `netgame_flags.type` | Effective `usage_id` | Editor safety |
|---|---|---|---|
| `ctfFlag` | `ctf_flag` | 0 red / 1 blue | Distinct flags and team spawn proximity |
| `oddball` | `oddball_ball_spawn` | 0–15 | Sequential, distinct spawn indices |
| `raceCheckpoint` | `race_track` | 0–31 | Ordered, gapless route; invalid route hidden |
| `raceVehicle` | `race_vehicle` | Not used | Maximum 16; marker is not a vehicle tag |
| `teleportFrom` | `teleport_from` | Channel 0–15 (editor subset) | At least one matching exit |
| `teleportTo` | `teleport_to` | Channel 0–15 (editor subset) | At least one matching entrance |
| `hill` | `hill_flag` | Hill group 0–15 | One point or 3–8 nondegenerate XY hull points |

These strings follow the documented Halo 1 schema and must be verified against the selected **actual Invader editing-tool version** before live source application. Display lines and overlays have no collision or runtime authority. The paired-teleporter button creates both endpoints in the saved source project, not in a compiled .scenario tag.
