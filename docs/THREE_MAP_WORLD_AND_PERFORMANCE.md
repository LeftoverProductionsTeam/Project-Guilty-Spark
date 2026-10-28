# Three-map world and workflow performance

This pass continues the C32/C33 workbench and the optional [donor-scenery workflow](DONOR_SCENERY.md). It preserves the previously validated Timberland–Sidewinder build and creates a separate Timberland + Sidewinder + Blood Gulch project.

## Extend a compiled world

Open a validated compiled map, then use **Connect another map's BSP** again. Newly imported MCC revisions inherit a per-map tool target pointing to that build's actual editable tags. Existing user tool configurations remain unchanged. Compiled titles avoid repeating a donor name that is already present.

The connection planner prefers nearby authored player starts. When all inherited starts are remote from the chosen edge, it uses a visible walkable edge floor. This prevents a third connection from being routed back across the entire second map. Generated collision, native portals/lightmaps and compiled-route checks remain mandatory.

Spark-generated collision and render shader aliases are matched only when their shader class, preview settings and dependency identities agree. This retains projected source UVs when a compiled world becomes the source for another connection. Different mappings remain separate.

The three-map source check has 22,136 input collision triangles, a 43,148-triangle export and 440 samples along the new approximately 110-world-unit corridor. Measured compiler/viewer/game outcomes are recorded separately in [the verification fixture](fixtures/three-map-performance-verification.json).

The native cache passed validation and loaded in the SDK. Its 257 scenery placements include the 210 retained from the two-map world and 47 from Blood Gulch; all 15 new model types resolved through the native viewer. Five native desktop checks passed, including the inherited tag profile. Manual traversal of both tunnels and retail MCC cache loading remain untested.

## Performance and usability

- Viewport diagnostics sample at four updates per second, share one scene traversal, and avoid rewriting unchanged gizmo/decal attributes. Rendering and interaction continue at their normal frame rate.
- Effect settings and diagnostic attributes update when their values change rather than on every rendered frame.
- **Viewport performance** in the Level Editor status bar optionally shows recent FPS, frame time, draw counts and resource counts. Its open state belongs to the map. Postprocessing can use multiple GL passes; the panel labels its draw counts accordingly.
- Tag staging hashes while copying, verifies the source and destination afterward, and reuses a bounded buffer. It removes one redundant source read while retaining content checks and cancellation. Progress reports prepared files and MiB.
- The staging containment check canonicalizes existing ancestors, including Windows verbatim paths, before creating directories. A build cannot stage inside its source tag tree.
- Connected-map readiness checks missing donor folders and missing editable MCC BSPs before staging a large SDK tree. The donor tags field also has a folder picker.
- Clearance results are tied to the map and connection parameters. Moving/rotating a section clears them; late responses cannot restore an obsolete result. Older omitted scenery options and IPC key ordering do not make equivalent plans appear different.

## Acceptance boundaries

Source clearance, native compilation, desktop rendering, SDK tagset loading, a manual walkthrough and retail MCC cache loading are distinct results. A route sample does not test scenery collision or every gameplay objective. Donor scenery is supported separately from donor weapons, vehicles, starts, game objectives, scripts and encounters. Complete atmosphere/audio transplantation and game-peer replication remain open.

The performance comparison uses the same native two-map scene and a selected transform gizmo before and after the change. It records three six-second samples; it is a local regression measurement, not a universal hardware benchmark.

The controlled run retained approximately 92 FPS. Unchanged gizmo/effect diagnostic writes dropped from roughly 550 each per six seconds to zero, with about 24 performance samples per six seconds. The approximately 1.5% script-time difference is within measurement noise; no CPU/FPS gain is claimed. SDK staging prepared 11,759 files with progress feedback; the reduced read count is not presented as a measured staging speedup.

Final checks passed: 239 Rust tests, 90 frontend tests, 59 offline scripts and 17 browser tests. All 67 restoration originals remain unchanged and read-only. Distinct worlds-polish release names preserve earlier executables, installers and source archives.
