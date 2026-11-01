// C44 observations do not promote direct-map, gameplay or full AI acceptance.
const source = 'docs/CONTINUATION_44_ENGINEERING.md';
const rows = [
  [
    'renderer-loading',
    'Bounded native image decoding and reflection-face cache identity',
    'performance',
    'Two paired native C43/final-C44 runs retain all six per-pair rendering resource signatures: median map switches 4486 to 4013 ms; first loads improve 6.6–9%. Original 128-entry/64 MiB cache cap and complete source/resource checks remain.',
    'No general startup, catalog, memory or GPU gain is established; wider hardware/datasets and atomic native timing remain separate work.',
    'src/boundedBase64.ts; src/ownedBitmapPreview.ts; src/ownedReflectionCube.ts; scripts/profile-native-workbench.mjs',
  ],
  [
    'native-ai-observer',
    'Read-only exact-build OpenCE native actor observations',
    'multiplayer',
    'Pinned publisher executable/PDB, read-only process validation and actual private engine processes yield 42 shared AI unit identities, 33 moving and seven firing controls in the final stock b30 run. All discrepancies and refused samples remain visible.',
    'Full lifecycle, damage/death, late join, reconnect, human AV, cross-computer acceptance, other engine versions and MCC arbitrary multiplayer AI remain unaccepted. This is a QA observer over upstream replication, not a new game bridge.',
    'src-tauri/examples/qa_opence_ai.rs; src-tauri/examples/qa_opence_ai; scripts/test-community-runtime-native.mjs; scripts/analyze-opence-ai.mjs',
  ],
  [
    'zombie-authority',
    'Zombie Apocalypse spawner authority and native object census',
    'conversion',
    'The preserved experimental native CE recovery cache again loads/joins OpenCE. Bounded object reads identify host spawner weapons and client-only retained zombie bodies/container; no replicated actor controls pass. The incomplete result is retained explicitly.',
    'Determine and repair the host spawner/container/actor lifecycle in an isolated derived source, then compile/read back and test genuine zombie behavior per runtime. Preserve original missing audio and all recovery deviations.',
    'docs/fixtures/c44-native-ai.json; docs/ZOMBIE_AUDIO_AND_SPAWN_EVIDENCE.md',
  ],
  [
    'direct-map-boundary',
    'Preserve direct compiled-map structural editing backlog',
    'tags',
    'Existing bounded Smart Edit scalar/placement map copies and native loose-tag/source transactions retain separate evidence. C44 source/AI/performance tests do not mark direct compiled-map structural editing complete.',
    'Arbitrary direct-map tag insertion/duplication, structural allocation/reference relocation, other-runtime writers and complete campaign safety still need their own native/cache/gameplay acceptance.',
    'docs/SMART_EDIT_WORKFLOWS.md; docs/UNIVERSAL_WORKBENCH_BACKLOG.md',
  ],
];
export const continuation44Requirements = rows.map(([id, feature, topic, operation, gap, files]) => ({
  id: `C44-${id}`,
  feature,
  topic,
  operation,
  gap,
  files,
  source,
  previous:
    'Continues committed C43; earlier C35–C43 IDs, source snapshots, branches, research and release evidence remain preserved.',
}));
export const continuation44Overrides = Object.fromEntries(
  continuation44Requirements.map((r) => [
    r.id,
    {
      priority: 'P0',
      state:
        r.id === 'C44-renderer-loading'
          ? 'IMPLEMENTED - measured bounded renderer improvement; broader performance gates open'
          : 'PARTIAL - exact bounded observations; remaining native/gameplay acceptance open',
      operation: r.operation,
      gap: r.gap,
      next: r.gap,
      files: r.files,
      target: 'Windows; exact C43/C44 native app; OpenCE build-335 with matching PDB; one physical machine',
      level:
        'Paired native rendering and real engine-process observations distinguished from complete AI/gameplay acceptance',
      evidence: source,
    },
  ]),
);
