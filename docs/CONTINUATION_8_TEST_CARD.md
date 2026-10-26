# Continuation 8 — first Windows acceptance tests

This is a clean-source developer snapshot, not a ready-to-run installer. **Preserve Continuation 7 and your Halo installation.** Extract Continuation 8 into a new directory. Never test against the only copy of a Halo map.

## Test 1 — offline baseline (do this first)

1. On the extracted source folder with Node 22+, run `npm run test:offline`. No Halo installation required.
2. Expected: 21 test groups print PASS; no file is written to a Halo installation. Keep the exact command output if any group fails.
3. Safe rollback: delete the extracted copy only. Do not change installed programs.

## Test 2 — Windows app (after a successful dependency-resolved native build)

1. Open a QuickForge **copy** of an original arena. Confirm grid and mesh snap toggles retain G and M behavior.
2. Set camera to Orbit. Hold RMB and move the mouse; aim should change without selecting or dragging an asset. While held, press W/A/S/D, R/F, then Shift to boost. Release RMB: camera stops and orbit continues without jumping back.
3. Select a brush or placement. Move (W) reveals red X, green Y and blue Z arrows. Drag one arrow; release; confirm new project-backed position and undo history. Type text in a field; camera must not move. Click outside canvas and press W; camera must not move.
4. Switch to First person, enter walk sandbox, and test a floor, slope, exact adjoining terrain, and pair of exact cave rims. **This is source collision only**. Compare camera and collision after each committed source edit.
5. Create an invalid source edit (e.g. overlapping brushes). The source preflight must disable Export JMS and Build. Repair and confirm the current validation report is regenerated before export enables. Export only to Guilty Spark's isolated build directory.
6. Open World Editor with a preserved source map; verify RMB movement does not alter tag or scene data. Select a scene placement; the same XYZ arrows appear. Export an OBJ with actual geometry and confirm its face/UV/material information without writing to the installed map.
7. If you have an authorized classic HEK or MCC H1A Editing Kit, use the matching runtime profile and run a **separate** Tool structure/build test in an isolated source tree. Inspect Tool/WRL errors and then game behavior. A generated JMS alone is NOT a passing result.

### Evidence to report

Record: Windows version, graphics card, Halo target/runtime version, selected HEK generation, expected and observed camera movement, screenshots or logs, exact first error, source/build SHA-256 and whether collision was editor simulation or proven in-game. Report two real players/AI sync only after a supported two-client test; never infer it from local scripts.

No script in this package alters UEFI, boot settings, BitLocker, firewall or anticheat. The GUI launch of compatible editing tools remains explicitly opt-in.
