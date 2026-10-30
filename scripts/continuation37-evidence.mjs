// C37 appends requirements; historical evidence and unresolved gameplay gates stay intact.
const rows = [
  [
    'baboon',
    'Source-aware Baboon MCC tag handoff',
    'tags',
    'Pinned Windows Baboon 0.3.2 and its matching H1 definitions are verified before per-map portable handoff. Available in Dependencies, compatible tools, companions, Tag Editor and Runtime Dock. The founder completed unchanged and genuine radius-edited pistol saves; native field comparison, reconciliation, compilation and readback passed.',
    'Only the current MCC H1 loose-tag route is implemented. Other upstream kit aliases are declarations, not verified Spark integrations. Compiled legacy caches require matching extracted/converted source first.',
  ],
  [
    'revisions',
    'Reconcile native external saves without replacing original source',
    'safety',
    'Fresh starting and edited trees, bounded SHA inventories, complete-file three-way reconciliation, retained revisions and restoration into another new source tree. Current working-tag compilation consumes the accepted revision.',
    'Same-file conflicts, deletions and scenario/BSP/collision/script changes require native review. No semantic merge or universal external-writer preservation guarantee.',
  ],
  [
    'watching',
    'Observe stable external saves, including same-stamp writes',
    'safety',
    'Native filesystem events invalidate named paths. Debouncing restarts on each event; only changed files are rehashed. Source-folder changes reconnect the watcher. Running Baboon handoffs continue checking through hidden panels. Stable native header/class/CRC failures produce live warnings and block acceptance/builds. Content-hash caches avoid rereading unchanged files. Actual writer PID attribution is not supplied by filesystem events.',
    'Notification loss requires bounded resynchronization; full source staging remains a measured cold operation, not instant incremental copying.',
  ],
  [
    'reimport',
    'Protect authored native source during procedural rebuilds',
    'geometry',
    'Ordinary QuickForge/cache regeneration refuses when native revisions or unreconciled Baboon saves would be omitted. Working-tag builds preserve native source and previous caches. File-level transactions preserve independent changes and refuse overlapping edits.',
    'General Blender/Tool geometry plus Sapien placement merging is blocked pending native scenario/BSP review, rather than silently discarding authored work.',
  ],
  [
    'licensing',
    'Keep community tools external and pin source compatibility',
    'tools',
    'Original integration code, exact executable/schema-set hashes and release-specific CLI/preferences research. No Baboon/blam-tags/definitions implementation, schema or executable is redistributed.',
    'No explicit license was found at the reviewed upstream roots. Shared parser/schema reuse and redistribution remain blocked pending permission.',
  ],
  [
    'space',
    'Keep QuickForge controls in a compact viewport workflow',
    'interface',
    'QuickForge source counts share the transform row. Sharing/live adapter controls live in the existing QuickForge session drawer. The redundant QuickForge heading and second New map action are removed.',
    'Native game-session effects remain separately gated; drawer visibility does not establish live replication.',
  ],
];
export const continuation37Requirements = rows.map(([id, feature, topic, operation, gap]) => ({
  id: `C37-${id}`,
  feature,
  topic,
  operation,
  gap,
  source: 'Founder C37 Modders Workbench and compact QuickForge request (2026-10-29)',
  previous: 'Continues C35 R12, C36 and One Halo; bounded source/native proof is separate from gameplay.',
}));
export const continuation37Overrides = Object.fromEntries(
  continuation37Requirements.map((row) => [
    row.id,
    {
      state: 'PARTIAL - implemented scope and native limits recorded',
      priority: 'P0',
      files:
        'crates/spark-core/src/baboon.rs; crates/spark-core/src/tool_transaction.rs; src-tauri/src/baboon_native.rs; src/components/BaboonTools.tsx; src/components/QuickForge.tsx',
      operation: row.operation,
      gap: row.gap,
      next: row.gap,
      target: 'Windows x64; verified Baboon 0.3.2/HCEEK loose tags; isolated canonical MCC H1 native source',
      level:
        'Source/native app/compiler evidence distinguished in the C37 report; no new Halo gameplay or peer acceptance',
      evidence:
        'docs/CONTINUATION_37_ENGINEERING.md; docs/fixtures/c37-baboon-profile.json; docs/fixtures/c37-native-acceptance.json; scripts/test-baboon-edited-native.mjs; scripts/test-native-save-integrity.mjs',
    },
  ]),
);
