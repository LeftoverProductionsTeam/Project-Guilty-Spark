// Preserve every earlier requirement and keep runtime/game acceptance separate.
const source = 'docs/CONTINUATION_40_ENGINEERING.md';
const rows = [
  [
    'content-audit',
    'Bounded content checks for missed native-save notifications',
    'safety',
    'Rolling streamed SHA-256 checks cover unchanged metadata, bounded to 8 MiB / 64 files per poll and throttled to two seconds. A mismatch enters the existing stable-save gate; unchanged data is not reparsed.',
    'Detection latency grows with tree size and poll frequency. Full native-source verification remains a separate build gate.',
  ],
  [
    'semantic-gate',
    'Native semantic verification before accepting or compiling changed tags',
    'safety',
    'Header/class/CRC results alone cannot authorize changed source. Invalid, pending, unparsed and semantically unverified saves retain prior source/builds.',
    'Pinned parser coverage is bounded and does not certify opaque fields, every dependency or gameplay. Native compilation and game acceptance remain required.',
  ],
  [
    'writer-evidence',
    'Live native-save evidence without false tool blame',
    'safety',
    'Reports retain stable before/after hashes, revision, current metadata and prepared/observed tool associations with executable identity and available PID. Actual writer stays unknown without direct evidence.',
    'Filesystem notifications cannot identify writer PID. There is no OS-wide process/file-write tracing implementation.',
  ],
  [
    'tool-findings',
    'Edition and version specific external-tool findings',
    'tools',
    'Baboon scoped real edited/no-op save proof, pinned Invader normalization, CE/H1A painted-detail warning and historical unknown-writer reports remain distinct.',
    'No general defective-tool or Halo 3/Reach claim follows from a scoped test or historical report.',
  ],
  [
    'mantle',
    'OpenCE Mantle external companion for CE PC cache 609',
    'tools',
    'Canonical official links, explicit installed-executable selection, hash recheck, independent runtime/cache gates and confirmed no-argument launch. No original map handoff or bundled download.',
    'Actual Mantle startup/edit/reconcile is unverified without an approved installed binary. Upstream advertised features are not Spark-tested capabilities.',
  ],
  [
    'leftknut',
    'leftknut companion and game-source integration research',
    'tools',
    'Canonical research candidate records reported mesh/UV/collision workflow, untested BSP combiner and unknown Forge failure without an executable route.',
    'Official identity, repository, license, executable and per-runtime evidence remain missing. Game-source Forge/Firefight work is a separate category.',
  ],
  [
    'consolidation',
    'Verified completed-branch consolidation and recoverability',
    'package',
    'Preserve all refs and dirty-state recovery before edits. Consolidate completed C38/C39/C40 ancestry in an isolated worktree and advance master only after combined regression and native evidence.',
    'Dependency proposals and experimental research are retained independently. A local master update is not a remote push.',
  ],
  [
    'playable-slice',
    'Next real playable Halo slice and runtime acceptance',
    'ai',
    'Retain all earlier native authoring, live adapters, source collaboration, BSP/render/audio and community runtime investigation.',
    'Fresh in-game AI/Firefight/Zombie/First Contact acceptance, arbitrary live spawning/BSP replacement, peer replication, full rendering/audio parity and MCC foreign-wire translation remain open.',
  ],
];
export const continuation40Requirements = rows.map(([id, feature, topic, operation, gap]) => ({
  id: `C40-${id}`,
  feature,
  topic,
  operation,
  gap,
  source,
  previous:
    'Continues verified C37-C39 source. Historical requirements, research branches and artifacts remain preserved.',
}));
export const continuation40Overrides = Object.fromEntries(
  continuation40Requirements.map((row) => [
    row.id,
    {
      state: ['C40-leftknut', 'C40-playable-slice'].includes(row.id)
        ? 'OPEN - required evidence or runtime implementation missing'
        : 'PARTIAL - scoped implementation and acceptance boundaries',
      priority: 'P0',
      operation: row.operation,
      gap: row.gap,
      next: row.gap,
      files:
        'crates/spark-core/src/working_tag_changes.rs; crates/spark-core/src/native_tag_integrity.rs; crates/spark-core/data/tool_ecosystem.json; src-tauri/src/external_companions_native.rs; src-tauri/src/native_save_evidence.rs',
      target: 'Windows; Halo 1 native sources; Mantle companion specifically CE PC cache 609',
      level: 'Source/compiler evidence; application startup and actual gameplay require separate acceptance',
      evidence: source,
    },
  ]),
);
