# Remaining work

Updated 2026-10-25 for Phase 2. Implemented inspection/editing does not complete the restoration. This list separates missing source data, target-engine work and tests not yet executed.

## 1. Resolve the faithful restoration blockers

| Work                                | Current evidence                                                                                                              | Completion condition                                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recover two missing event sounds    | Demo `scorpion` and `hill_occupied` ranges lie outside supplied `sounds.map`; related PC/MD tags do not supply matching bytes | Recover verifiable original audio or document an explicitly approved recovery-edition substitution/omission. Similar names/lengths are insufficient. |
| Recover damaged scenery placement 0 | Name index `5984` and type index `10704` are invalid; intended object unknown                                                 | Establish authored object/transform from reliable evidence, or record an intentional derivative deviation.                                           |
| Reauthor mixed-class placements     | Scenery palette has weapon references and a used `Hiding Marine` biped; diagnostic compile stops here                         | Preserve intended appearance/behavior using supported target placements and gameplay evidence.                                                       |
| Preserve zombie spawners            | Item collections lead to weapon triggers referencing vehicle containers with built-in actors                                  | Implement supported target behavior retaining the intended spawn cycle; do not delete the mechanism to get a clean compile.                          |
| Match historical resource sets      | Demo, PC and MD resource offsets differ; exact-byte deduplication does not establish semantic interchangeability              | Record correct source/resource identities and complete extraction for each retained candidate.                                                       |

The labelled recovery experiment extracted 2,823 retained tags after omitting two sounds, then failed all three diagnostic compile attempts. It produced no MCC cache. Faithful restoration and a modified recovery edition must remain distinguishable. See [audio and spawner evidence](ZOMBIE_AUDIO_AND_SPAWN_EVIDENCE.md) for exact hashes, commands, deviations and errors.

## 2. Complete a real build, package and game-load path

1. Resolve source defects/resources, then complete extraction and compilation without silently suppressing remaining errors. Validate the generated cache, output identity and resource completeness against the actual saved project.
2. Obtain an official unpublished Excession metadata template for the exact scenario. Extend checking against the applicable official schema, required shared metadata/images and version compatibility. No exact template or successful restoration package is available.
3. Exercise owned package installation, registration, rollback/removal and actual MCC enumeration. Record the official Steam anti-cheat-disabled selection and map load separately; a launch request or structurally valid cache is insufficient.
4. Test the restored loop: zombie spawning, actors, weapons, damage/death, pickups, placements, sound events and progression. Record deliberate adaptations and regressions. Collision rendering and menu audio preview do not replace gameplay observations.
5. For a native target, separately install/register a known compatible ChupathingyCE or OpenCE build with correct map family/resources. Registration and generic application launch do not deploy a map or prove product identity/playability. Add deployment/direct-map support only from verified runtime contracts.

Archived EXE/DLL execution, header relabeling, invented package schemas, stock-map substitution and simulated gameplay do not satisfy these conditions.

## 3. Execute multiplayer acceptance on two computers

- Establish a single-runtime, single-map baseline. Record exact engine build/network identifiers, deployed map/resource/package hashes, mode and validation on both computers.
- Follow [MULTIPLAYER_TEST_PLAN.md](MULTIPLAYER_TEST_PLAN.md): host/client roles, actor spawning/movement, damage, death/respawn, progression, disconnects and sustained sessions. MCC campaign co-op, MCC custom-multiplayer AI, native multiplayer and native campaign co-op require separate evidence.
- Do not infer MCC/native or mixed native-runtime compatibility from README claims or matching manifests. Unknown build/network/resource requirements remain blocked until resolved.
- Friends preflight performs local manifest comparison only. A passing report says **Manifests agree**, retains `gameplayVerified: false` and does not test networking. Imported declarations are self-reported.

**No two-computer MCC or native gameplay session has been executed.** [MCC_MULTIPLAYER_AI_FEASIBILITY.md](MCC_MULTIPLAYER_AI_FEASIBILITY.md) is research, not a working networked-AI extension.

## 4. Extend partial editors with auditable target support

| Area            | Implemented boundary                                                         | Still required                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| World           | Collision BSP and source transforms                                          | Textured render BSP, shaders/models, supported placement creation/deletion/scale and target rebuild validation                     |
| Tags/AI         | Audited field overlays and actor-variant/item/unit/spawner dependencies      | Complete actor definitions, encounter/squad/wave authoring and target semantics                                                    |
| Scripts         | Compiled signature/index inspection                                          | Script bodies, source authoring/decompilation where feasible, compilation and gameplay tests                                       |
| Assets          | OBJ import and geometry preview                                              | Texture/UV/material workflows, collision, glTF/animation and asset-to-Halo compilation                                             |
| Menu/audio      | Bounded embedded Vorbis inspection/preview with unavailable samples explicit | External-codec/resources, menu/widget rendering/behavior and in-game audio validation                                              |
| Compare/library | Decoded semantic differences and exact-byte deduplication                    | Semantic version grouping, placement matching across reordered arrays, deeper payload comparisons and reviewed restoration patches |
| Live Lab        | Disconnected status and rebuild fallback                                     | Real bridge/transport, capability negotiation, acknowledged commands, bounded failures and observed live edits                     |
| VR              | No runtime implementation                                                    | Supported OpenXR/runtime path, rendering/input and separate gameplay/network acceptance                                            |

Preserve unknown source bytes and distinguish unsupported/untested states as support expands. Disabled controls, upstream feature flags and mocks are not completed integrations.

## 5. Strengthen platform and release evidence

- Keep **21 unit / 8 browser** frontend results separate from native QA. Five browser tests use synthetic IPC; three cover browser boundaries/accessibility. Fresh native checks, real audio decoding and release-build evidence belong in [TESTING.md](TESTING.md) with exact tested scope.
- Run macOS/Linux CI and native smoke cases on those platforms. Verify runtime-specific installation/resource locations instead of assuming Windows results transfer.
- Add child-process-tree cancellation, bounded backup retention and interrupted file/index-update recovery. Attribute external tools/versions; process directories and timeouts are not an OS sandbox.
- Extend archive and large-cache formats with explicit limits and hostile-input coverage. Current ZIP preservation is bounded classic ZIP; nested archives, ZIP64 and other formats are not silently supported.
- Sign Windows binaries and verify clean install/upgrade/uninstall before claiming release readiness.

See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) for current boundaries and [RUNTIME_COMPATIBILITY.md](RUNTIME_COMPATIBILITY.md) for runtime evidence and restrictions.
