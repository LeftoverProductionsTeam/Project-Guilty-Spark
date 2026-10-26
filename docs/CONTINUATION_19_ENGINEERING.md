# Project Guilty Spark — Continuation 19 engineering handoff

**Exact baseline:** `Project_Guilty_Spark_07_Halo_Modding_Brain_Continuation_18_SOURCE.zip`.
This is a complete source continuation, not a prebuilt desktop executable or
compiled/engine-proven Halo map.

## Problem solved in this pass

Halo 1 `scenario_structure_bsp` stores a `lightmap_bitmaps` tag dependency at
byte offset 0 of its 648-byte root, with a 32-bit tag datum at offset 12.
Each BSP lightmap block stores a **page index** into that BSP's bitm tag.
Continuation 18 could show per-BSP page addresses and manual images but had no
verified association between those page addresses and a particular bitm tag.
The shader/base-map pipeline also required one button click per shader.

## Actual changes

1. **Native metadata:** `render.rs` reads the bounded compiled BSP's
   lightmap-bitmap dependency class and datum; `maps.rs` exposes it as optional
   `lightmapBitmapTagId` on each material range. Missing or wrong class/NULL
   is *not* a verified ID. This is candidate metadata, not pixels or a mutable
   tag edit. Associated TypeScript logic requires that the ID exists as a
   non-external `bitm` in the inspected source before proceeding.
2. **Exact planner:** `src/ownedMaterialBatch.ts` produces preview tasks only
   for `senv`/`soso` material base/diffuse references marked resolved and
   lightmap pages whose material ranges agree on one BSP-local `bitm` tag ID,
   have genuine secondary UVs and match a source tag. No filename inference,
   cross-BSP global page mapping or other shader types.
3. **Image identity:** `src/ownedBitmapPreview.ts` validates a requested
   image index and the returned one; the first mip of image/page 2 is
   distinct from image 0. Source and selected-resource hashes are enforced.
4. **World Editor:** One-click **Preview verified diffuse** and **Preview
   verified lightmaps** with a small, serial, six-read maximum per click,
   progress, skip/refusal counts and cancel. Each read invokes the existing
   SHA-256-validated C18 native top-mip endpoint. A project/map switch or
   canceled job discards late responses; original/local images already shown
   are never silently overwritten. GUI tooltips and the Academy explain why
   game shaders/radiosity are not emulated.
5. **Regression coverage:** Adds the offline plan tests for two BSPs sharing
   page 0, wrong class, external tag bodies, conflicting section IDs, incomplete
   UVs, existing user previews and unsupported cache versions. Updates the
   bitmap preview protocol test for nonzero image indices. Adds synthetic Rust
   BSP checks for dependency class and missing IDs (Cargo execution pending).

## Source evidence and references

- [c20 Halo 1 BSP tag](https://c20.reclaimers.net/h1/tags/scenario_structure_bsp/)
  documents the lightmap bitmap dependency, indexed pages and BSP topology.
- [c20 Halo 1 lightmaps](https://c20.reclaimers.net/h1/tags/scenario_structure_bsp/lightmaps/)
  distinguishes baked bitmap data, secondary UVs and the requirement to rebuild
  radiosity after changes.
- [Reclaimer sbsp definition](https://github.com/Sigmmma/reclaimer/blob/master/reclaimer/hek/defs/sbsp.py)
  corroborates a 16-byte leading dependency and the 648-byte root size.
  This implementation is independently written, not copied from Reclaimer.
- [c20 Halo 1 maps](https://c20.reclaimers.net/h1/maps/) explains cache and
  external resource differences, including MCC ipaks.

## Verification and honest limitations

| Gate | State |
| --- | --- |
| Existing Node offline suites | Passed in this environment |
| New material planner and bitmap image-index tests | Passed |
| Changed TS pure modules strict typechecking | Passed |
| All TS/TSX syntactic parse | Passed |
| Rust tests including sbsp dependency synthetic fixture | Authored, **not run** (Cargo unavailable) |
| React/Tauri frontend with installed dependencies | **Not built** here |
| Real Halo bitmap page, lightmap orientation and external resource maps | **Not tested** with legal Halo fixtures |
| Tool-compiled BSP collision/portals or any game runtime | **Not verified** |

### First owner acceptance test (read-only)

On a Windows machine with installed project prerequisites, extract to a **new**
folder, execute the existing offline test suite, build the app, and open an
original classic PC/CE map. In World Editor > Material Lens, use *Preview
verified diffuse*; if there are lightmap pages with verified metadata, try
*Preview verified lightmaps*. Confirm each page stays inside its BSP, and
compare the graphics against actual Halo. Never point exports at original
installed game files.

## Remaining ten-phase priorities

Authentic all-format shaders (including transparency and animated skies),
recompilation of imported BSP/terrain/caves with verified collision, portals
and PVS, playable First Contact, actual Halo AI waves and Zombie Apocalypse,
multiplayer AI synchronization and full installer/game test coverage remain
unfinished. This release does not claim to finish those systems.
