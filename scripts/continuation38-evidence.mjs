const source = 'Founder Universal Halo Modding Workbench continuation (2026-10-30)';
const rows = [
  [
    'catalog',
    'One source-aware tool capability catalog',
    'tools',
    'Canonical catalog shared by Rust allowlist and frontend; map source, native working tags, target kit and installation are assessed independently.',
    'Eight broader ecosystem profiles are researched upstream capabilities; their Spark handoffs remain unimplemented.',
  ],
  [
    'invader',
    'Useful managed native Invader operations',
    'tags',
    'Pinned dependency traversal, bounded native object-radius candidates and reviewed lens-flare repair with native field readback.',
    'Only reviewed fields/recipes and validated MCC H1 working source are eligible; arbitrary repairs are unavailable.',
  ],
  [
    'revisions',
    'Preserve native data across tool operations',
    'safety',
    'New complete source forks, exact unrelated-file inventories, source-selection compare-and-set and tag-specific recovery. Existing Baboon selections retain precedence semantics.',
    'General binary merging and general Blender/Sapien geometry reimport remain protected conflicts, not automatic repairs.',
  ],
  [
    'watching',
    'Reconnect live native source monitoring',
    'safety',
    'Watcher identity includes the source directory; accepted Baboon/Invader source changes refresh the runtime dock.',
    'Filesystem events still do not identify an arbitrary writing process.',
  ],
  [
    'native-ui',
    'Browse built native tags without another project',
    'interface',
    'Lazy native tag picker, previews, retained recovery history and source-aware tool workflow links. Existing advanced launchers remain available.',
    'A source editor view is separate from full engine preview or game-side changes.',
  ],
  [
    'repair',
    'Version-specific native preflight and repair',
    'tools',
    'A missing or broken dependency is not accepted solely because the process exited zero; only the documented lens-flare 360-to-zero repair is exposed.',
    'Legacy class aliases, broad HEK+ corruption, topology, lightmap and gameplay issues still require exact native review and reproduction.',
  ],
];
export const continuation38Requirements = rows.map(([id, feature, topic, operation, gap]) => ({
  id: `C38-${id}`,
  feature,
  topic,
  operation,
  gap,
  source,
  previous: 'Continues verified C35-C37 consolidation; does not replace One Halo or gameplay research.',
}));
export const continuation38Overrides = Object.fromEntries(
  continuation38Requirements.map((row) => [
    row.id,
    {
      state: 'PARTIAL - bounded native workbench implementation',
      priority: 'P0',
      files:
        'crates/spark-core/data/tool_ecosystem.json; crates/spark-core/src/native_operations.rs; src-tauri/src/native_operations_native.rs; src-tauri/src/native_source_revisions.rs; src/components/NativeTagOperations.tsx; src/components/ToolEcosystem.tsx',
      operation: row.operation,
      gap: row.gap,
      next: row.gap,
      target: 'Windows x64; Invader 0.55.0.r4134.33518109; validated owned MCC H1 loose tags',
      level: 'Native source, UI and compiler acceptance are separate from Halo gameplay',
      evidence:
        'docs/CONTINUATION_38_ENGINEERING.md; docs/COMPATIBLE_TOOLS.md; scripts/test-native-operations.mjs',
    },
  ]),
);
