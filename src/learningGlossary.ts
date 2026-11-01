/** Specialist definitions retained from the original Academy reference. */
export const academyTerms: [string, string][] = [
  [
    "Map cache (.map)",
    "A compiled, engine-versioned Halo level. Guilty Spark preserves originals; inspection is not permission to write arbitrary bytes."
  ],
  [
    "Tag / tag reference",
    "A game object's settings and links. A cache's tag ID and path are references; actual editable .tag data has to be correctly extracted or authored with dependencies."
  ],
  [
    "BSP (Binary Space Partition)",
    "Halo's compiled level structure. Your editable source mesh is geometry input, not proof of correct BSP partitions, collision, visibility, lightmaps or AI navigation."
  ],
  [
    "JMS source",
    "Classic Halo model/world geometry handoff format. Tool compiles it into supported game tags; JMS alone cannot be loaded as a finished map."
  ],
  [
    "Right-mouse flight (RMB + WASD)",
    "Hold the right mouse button over the map, move the mouse to aim, and use WASD to fly. R/F moves vertically, Shift boosts. Release RMB to stop flying; use left-click to select."
  ],
  [
    "XYZ transform gizmo",
    "Select an object and use Move (W): red arrow = X, green arrow = Y, blue arrow = Z. E rotates; R scales only supported geometry. Dragging stages a source edit; it does not rewrite the original map."
  ],
  [
    "Halo netgame flags / usage IDs",
    "Scenario markers control multiplayer objectives. Their usage_id means different things per type: CTF team (0/1), numbered Oddball spawn, ordered Race checkpoint or a King hill group. Do not treat every usage_id as a player team."
  ],
  [
    "Race vehicle and teleporter flags",
    "Race vehicle markers (maximum 16) are separate from Race checkpoints. Teleport from/to markers share a channel/usage ID (0–15 in Guilty Spark); both ends must exist. The Race/teleport path lines are visual authoring guides only."
  ],
  [
    "King of the Hill boundary",
    "One hill marker yields a 2×2-unit square; 3–8 markers sharing the same group ID define a convex boundary. Exactly two markers are invalid and can crash Halo. The translucent editor preview is not a compiled scoring volume."
  ],
  [
    "Pre-export source integrity",
    "Wait for live geometry regeneration; invalid or out-of-date mesh arrays block JMS export. A green source status still does not certify successful Halo structure compilation or a sealed collision BSP."
  ],
  [
    "Grid Snap (G)",
    "Move on a chosen coordinate interval; turn it off for free positioning."
  ],
  [
    "Mesh Snap (M)",
    "Align compatible face, cave rim or terrain-border geometry. Only exact source seams can omit redundant caps/walls. This does not compile Halo collisions."
  ],
  [
    "Source collision / First person",
    "Test the regenerated triangles immediately with local gravity/body collision. It is a debugging sandbox, not the running Halo engine."
  ],
  [
    "Shader tag vs bitmap",
    "A shader controls how several bitmap textures and engine effects are combined. A bitmap may be the base color, detail, bump or transparent mask. Do not automatically use a bump/detail map as the base."
  ],
  [
    "Material Audit / exact primary bitmap",
    "The cache reader validates the shader_environment base bitmap ID or shader_model diffuse bitmap ID against the same map's tag table. Status resolved means the reference is real, not that pixels or engine lighting were decoded. Export metadata to compare assets; invalid, missing or unsupported references are never guessed."
  ],
  [
    "BSP lightmap page",
    "A compiled lightmap is baked illumination with a second UV coordinate channel. Page 0 of BSP 1 is NOT automatically the same image as page 0 of BSP 2; use bsp_0_page_0.png and bsp_1_page_0.png for explicit assignment. This viewer does not reproduce Halo radiosity fully."
  ],
  [
    "Environment sun / ambient / fog",
    "QuickForge's saved editor environment and World Editor's temporary comparison affect only preview pixels. Sky tag handles atmospheric fog, indoor/outdoor ambient and directional radiosity; fog tags are for BSP fog planes. Neither workflow automatically patches or recompiles game tags."
  ],
  [
    "Legacy scenario safety",
    "Before exporting, check overlapping player starts, conflicting origins of identical tag paths, absent bitmaps/sounds resources, and AI pressure. Most historic editor crashes can only be eliminated by validating real tags, engine collision, and multiplayer clients."
  ],
  [
    "Portal / PVS",
    "Portals and the potentially visible set determine structural connections and what the engine draws. Carving a cave in an existing BSP requires recompilation, not just visual overlap."
  ],
  [
    "Halo Tool WRL error overlay",
    "After Tool structure reports malformed level geometry, import its local Halo 1 WRL file in QuickForge's build diagnostics. Colored edges and faces show the error location. Frame WRL moves the editor camera; edits make old diagnostic geometry stale, so recompile and reload."
  ],
  [
    "BSP source topology review",
    "QuickForge analyzes positions across separately shaded triangle vertices to flag boundary seams, non-manifold edges, face-winding conflicts, degenerate and duplicate faces, and independent shell candidates. Open edges warn, while known destructive geometry defects block source export. You can select an affected brush or export a SHA-linked, coordinate-free report; the analysis does not actually weld triangles or replace Tool structure, collision, portals, PVS or in-game proof."
  ],
  [
    "Tag Test / Build",
    "Tag Test starts an installed development Halo runtime where supported. Build is a separate toolchain job; both require actual runtime testing before marking a feature playable."
  ]
];
