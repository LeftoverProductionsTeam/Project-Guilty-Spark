// Every Way to Mod Halo continues the consolidated C37-C40 source.
const source = 'docs/CONTINUATION_41_ENGINEERING.md';
const rows = [
  [
    'smart-router',
    'Typed Smart Edit routing over one saved project',
    'tags',
    'Window/map-owned expiring semantic plans resolve exact source, runtime, dependencies and adapters; execution rechecks saved identity. Automatic and manual methods share hard gates.',
    'Broader native schemas/editions remain adapter-specific; a readable field is not write support.',
  ],
  [
    'direct-cache',
    'Validated direct MCC compiled-map copies',
    'tags',
    'Write reviewed internal scalar/placement cells into an owned MCC 13 copy; pinned native CRC/info, complete byte footprint, semantic reopen, source hash and output receipt. No extraction or compiler.',
    'Other editions, arbitrary references, arrays, scale, custom models and BSP relocation are not direct writers; game loading remains a separate test.',
  ],
  [
    'source-equivalence',
    'Native source compilation and equivalent semantic edits',
    'workingTags',
    'Reuse accepted Baboon/Invader revisions and existing extraction/working-tag/QuickForge compilers. Actual native source and direct outputs can be compared by intended property, not binary equality.',
    'Source/compiler success does not establish gameplay; pending edits or missing native dependencies cannot be omitted.',
  ],
  [
    'visual-persistence',
    'Shared visual and tag editing with persistent native placements',
    'geometry',
    'Tag tree and compact object drawer share TagFields and Project history. Existing MCC source placements can route an actual gizmo transform into a validated native cache copy.',
    'New imported-cache placements and custom preview meshes retain their native-import/build blockers; renderer/physics parity is separate.',
  ],
  [
    'live-plan',
    'Temporary live object moves through typed plans',
    'live',
    'LiveForge uses explicitly bound exact-session ten-second plans, original-position checks, existing stationary/detached/readback guards and a bounded append journal.',
    'Fresh C41 game acceptance is required. Disconnect does not restore moved positions. No spawning, BSP replacement or game-peer replication is added.',
  ],
  [
    'plan-workflow',
    'Compact save plans and map-bound asynchronous results',
    'interface',
    'Shared folded save-plan controls in Tags, object drawer, Build and QuickForge; review actual changes, route blockers, required tools and recovery before execution.',
    'Native first-use/save-refresh behavior must pass a fresh final executable acceptance; synthetic UI tests are separate evidence.',
  ],
  [
    'native-assets-peers',
    'Remaining native asset import and collaborative runtime parity',
    'assets',
    'Preserve existing native source authoring, actual-model previews, source collaboration, integrity recovery, BSP and audio/render research.',
    'Actual custom scenery game import, semantic native-tag/binary sharing, arbitrary live spawning/BSP replacement, full render/audio parity and game-peer acceptance remain open.',
  ],
];
export const continuation41Requirements = rows.map(([id, feature, topic, operation, gap]) => ({
  id: `C41-${id}`,
  feature,
  topic,
  operation,
  gap,
  source,
  previous:
    'Continues verified consolidated master 9691111; historical research and all earlier feature IDs remain preserved.',
}));
export const continuation41Overrides = Object.fromEntries(
  continuation41Requirements.map((row) => [
    row.id,
    {
      state:
        row.id === 'C41-native-assets-peers'
          ? 'OPEN - required native/game evidence missing'
          : 'PARTIAL - reviewed implementation with explicit native/game boundaries',
      priority: 'P0',
      operation: row.operation,
      gap: row.gap,
      next: row.gap,
      files:
        'crates/spark-core/src/smart_edit.rs; src-tauri/src/smart_edit_native.rs; src/components/SmartEditPanel.tsx; scripts/test-smart-edit-native.mjs',
      target:
        'Windows; MCC Halo 1 cache 13 direct cells; matching native source tools; existing reviewed MCC live profile',
      level:
        'Native desktop/compiler evidence distinguished from synthetic UI and unaccepted game/peer behavior',
      evidence: source,
    },
  ]),
);
