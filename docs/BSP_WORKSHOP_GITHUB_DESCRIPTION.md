Title: Add native BSP Workshop source editing and verified H1A builds

Continue from C39 with a four-view BSP Workshop inside Level Editor. Convex source brushes support joined rooms/corridors, solid subtraction, vertex/edge/face movement, extrusion, capped clipping, face materials/UVs, source diagnostics, persistent views and grouped project history. The existing JMS/isolated Halo build pipeline retains source-face provenance, exact dependencies and previous artifacts.

Real Windows acceptance creates and edits the source, checks Undo/Redo and failed edits, saves/reopens it, builds through H1A Tool and imports the actual compiled texture back into the editor. Both independent native builds yield three clusters and two portals. The tested GUI build takes 14.275 seconds. Existing native-source reconciliation and C39 safeguards remain; no remote tool execution or raw binary patch exchange is introduced.

Validation: locked Windows workspace tests (531 passed, seven existing opt-in tests ignored), frontend tests (234), browser interaction/IPC-contract tests (88), offline scripts (59), TypeScript, release executable and real desktop/native compiler acceptance. See BSP_WORKSHOP.md and its receipt for the final browser result and exact hashes.

Acceptance still open: player walkthrough and retail MCC loading. The CE structure compiles, but its separately extracted stock actor-variant dependency fails Invader's enum validation; exact negative evidence is retained. General existing-map topology editing, arbitrary portals/material flags, Workshop collaboration and direct compiled-map editing remain open.

All 146 inventoried root research files and existing source history are preserved. These commits are prepared on local master at the owner's request. No remote master push, force push or branch-protection change was attempted.
