# C34 combined-world visibility-zone authoring

This extends the existing connected-map editor. It preserves one combined BSP and the historical automatic portal positions. It does not implement independent map streaming or write visibility changes into a running game.

## Editor workflow

Open a map project with an applied BSP connection in **Level editor**. The shared viewer's **Visibility zones** inspector offers two distinct tools:

- **Tunnel zone:** a named span on an existing authored tunnel segment, with adjustable entrance/exit percentages. The preview draws its bounds and both actual source portal planes. Select a plane handle and drag; the edit projects onto that tunnel segment. Numeric controls provide the same operation. Source geometry exports two real `+portal` cuts for Halo Tool.
- **Planning box:** named editable minimum/maximum bounds with a translation gizmo. These are visibly labelled **EDITOR ONLY**, remain project authoring metadata and generate no game portal/PVS.

**Frame zone** moves the viewport to the selection. Asset selection, empty-space selection and Escape clear competing zone gizmos. Zone visibility/selection is retained per map. Changes enter the normal project edit callback, history and serialization, so switching maps does not transfer a zone to another document. Zone-only inspector edits preserve an unapplied connection draft. In the live pose viewer, these changes are routed to the source document and require compile/reload; no live game operation is sent.

**Check portal source** saves the project and calls the existing bounded native assembly preview. Stale results from a changed map, source hash or assembly are ignored. A successful preview validates generation inputs and isolated-tunnel placement; it is not a native PVS/game certificate. **Build & playtest connection** uses the existing compiler path to rebuild clusters/PVS, collision and lightmaps. Test the resulting map in the selected game separately.

## Supported geometry and persistence

`BspAssembly.visibilityZones` defaults to an empty list and is omitted when empty. Existing saved projects therefore retain their historical serialization/fingerprint shape. The frontend semantic signature likewise treats omitted and empty lists identically. Loading the preserved C33 four-map dogleg with the new code still produces its exact prior fingerprint `7a190249444f9015197053aba18ef09ef2cad4d88bbd4793aabf6a350df6e615`.

The typed variants are `tunnel` and `editorBounds`. At most 32 zones are accepted, with unique UUIDs and bounded names. Tunnel zones use one segment each, ordered cuts between 5% and 95%, separated by at least 0.5 world units. The assembly generator additionally requires both cuts to lie in isolated tunnel space outside both source BSP bounds and rejects crossing/overlapping authored portal planes; invalid source geometry refuses preview/build. Changing/removing route segments can require reassignment of their zones. Arbitrary boxes and invalid cuts never silently become working game PVS.

Authored portal quads extend 0.01 world units into surrounding walls, floor and ceiling, allowing Tool to clip their edges to the solid corridor. This removes the unearthed-edge warnings observed with exactly touching authored quads in the native synthetic test. The existing automatic cuts retain their original geometry for projects without authored cuts. Segments with authored zones replace their automatic pair; other segments continue using the existing automatic planner. Tool remains responsible for actual sealing, cluster construction and PVS.

The implementation follows the documented [Halo 1 BSP clusters, portals and PVS distinction](https://c20.reclaimers.net/h1/tags/scenario_structure_bsp/). Compiled field layouts were read from [Invader revision `696830ff80af227e84e7237c2ef26eb2301ed110`](https://github.com/SnowyMouse/invader/blob/696830ff80af227e84e7237c2ef26eb2301ed110/src/tag/hek/definition/scenario_structure_bsp.json). No upstream engine code or proprietary assets are included in this feature.

## Native Tool evidence

`qa_visibility_zones` creates a synthetic sealed corridor through the same `VisibilityZone` centers, authored portal-quad API and product `export_jms` implementation. It writes fresh source files, not owned original maps. The installed official Tool was invoked only inside a new limited workspace cloned from the previously validated approximately 111 MiB tag seed. The seed and C33 outputs were not changed; no full editing-kit tag tree was copied.

The exact Tool SHA-256 was `c492789e96dbe845891e0c0973bfb526a21230f570559e6f9fb695b8d2ca0afa`.

| Actual structure output | No authored zone | Authored tunnel zone |
| --- | ---: | ---: |
| Portal planes | 0 | 2 |
| Visibility clusters | 1 | 3 |
| Stored PVS bytes | 4 | 12 |
| Reported render surfaces / vertices | 12 / 24 | 12 / 24 |
| Compiler warnings / errors | 0 / 0 | 0 / 0 |

Both outputs were inspected as real compiled BSP tags, not inferred from source drawings. Their SHA-256 values are:

- Baseline JMS: `eb8bb2531acb39cdeef1bf0c007c3f87bea1f32a922fb9e4d6a1b0e3e14f94bb`.
- Authored JMS: `c60713410b93fc67cb0425111b839d553bf65d0b1716fc401efac037e878fa1f`.
- Baseline compiled BSP: `2edbfbe5a2d4947fd411e9940de316ad99890970c5ced8e33f475eb4fdc09733`.
- Authored compiled BSP: `7d6f3bbc75138ce5bffb445e5eb2bfafbe2cebab37fb3b1d0bba16e66e0f6ec2`.

Private receipt: `.local/continuation34/visibility-native/visibility-receipt.json`. This proves the authored cuts affect Tool's actual clusters/PVS metadata. It does not prove a visibility-performance improvement, all possible portal topology, native player traversal, game rendering or multiplayer.

## Checks and remaining acceptance

The core tests exercise sloped portal geometry, editor-only bounds, malformed/duplicate/removed segment rejection, crossing/overlapping portals, real `+portal` JMS export and omission of empty fields. All **27 focused BSP tests** pass, including existing clearance/scenery regressions. All **10 frontend visibility/assembly tests** pass, covering native/viewport geometry agreement, constrained dragging, invalid inputs, immutable persistence, historical identities and preservation of pending connection drafts. TypeScript compilation passes.

The browser test mounts the actual shared `World` viewer: it adds a tunnel zone, edits its percentage, actually drags the 3D translation handle, checks a single source edit receipt, frames the zone, switches maps, adds an editor-only box and returns to the unchanged first map's portal position. It reports no page errors. Browser source checks remain distinct from filesystem persistence and native application/game tests. Private visual evidence is `.local/continuation34/visibility-zones-browser.png`.

Native game acceptance remains open: compile a derived owned connected map, inspect its resulting portal graph/PVS, compare both sides of every authored cut in game, walk/drive through, and test two private clients in separated zones. The existing [connected-world acceptance gates](C34_CONNECTED_WORLD_AUDIT.md) still apply. No game was launched and no game memory was accessed for this feature.
