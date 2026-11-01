// Native tool completion and observed controls do not grant gameplay acceptance.
const source = 'docs/CONTINUATION_45_ENGINEERING.md';
const rows = [
  [
    'native-carriers',
    'Exact-input native carrier recovery recipe',
    'conversion',
    'PARTIAL - native source/compiler prerequisites repaired; gameplay unaccepted',
    'Copy and hash all 3739 reviewed tags; repair effect location, regenerate small native colliders and a carrier-only rig-matched animation; constrain changes to nine tags; produce real CE/MCC caches.',
    'Native tag assertions, extreme actor physics, faithful missing audio and actual CE/MCC gameplay remain open.',
    'Trace remaining bad-tag and launch physics failures before automatic UI admission.',
    'scripts/recover-zombie-carriers-native.mjs; docs/fixtures/c45-carrier-inputs.json',
    'Experimental derivative; native compilation cannot certify gameplay.',
  ],
  [
    'native-health',
    'Native log integrity and precise fault/refusal reports',
    'safety',
    'IMPLEMENTED - bounded local QA; content acceptance stays false',
    'Hash final native ANSI debug logs; reject changed bytes and redirected directories; distinguish startup noise from assertions, invalid references, crashes and object failures; name invalid actor position/unit/tag.',
    'This is local QA reporting, not a new live runtime capability or complete game correctness proof.',
    'Use precise failure evidence to repair native causes.',
    'scripts/native-runtime-health.mjs; scripts/analyze-community-runtime-native.mjs; scripts/analyze-opence-ai.mjs',
    'Do not attribute inherited defects to an unconfirmed external writer.',
  ],
  [
    'census-performance',
    'Paired native detailed-census lookup optimization',
    'performance',
    'PARTIAL - measured diagnostic read improvement; no desktop speed claim',
    'Before/after observers run against the same stock processes: host successful full-census median 28.824 to 16.276 ms; client 27.251 to 12.789 ms; same observed field coverage; all refusals retained.',
    'Main application startup, renderer, GPU, memory and full AI parity gains are not established by this diagnostic measurement.',
    'Continue measured bottlenecks without dropping content or weakening identity checks.',
    'src-tauri/examples/qa_opence_ai/remote.rs',
    'Successful-read timing is not all-attempt latency or an approved network tolerance.',
  ],
  [
    'zombie-ai',
    'Recovered zombie control observations and out-of-world refusal',
    'multiplayer',
    'PARTIAL - actual prototype AI controls; final state refused',
    'A private prototype exposes 44 shared actual AI identities, 20 with movement and one with firing. Final repeat refuses a position beyond the existing QA bound; OpenCE and Chupathingy native assertions remain visible.',
    'Damage/death/respawn, late join, reconnect, audiovisual and cross-computer acceptance remain open; no new protocol bridge.',
    'Fix extreme physics and remaining empty-tag calls, then repeat exact-build lifecycle tests.',
    'scripts/test-community-runtime-native.mjs; src-tauri/examples/qa_opence_ai.rs; scripts/analyze-opence-ai.mjs',
    'Keep editor SparkLink synchronization separate from engine replication; never hide bad samples.',
  ],
  [
    'native-equivalence',
    'Native compiler byte variance and genuine-value negative control',
    'safety',
    'PARTIAL - strict decoded equivalence proved; opaque bytes and gameplay separate',
    'Preserve both different native outputs; strict Invader comparison matches 12 of 12 support/generated tags without relaxed precision. A real copied-tag vitality change from 0.0001 to 0.5 mismatches.',
    'Complete opaque-byte semantics, general direct compiled-map structural editing and fault-free gameplay remain unaccepted.',
    'Retain native field/buffer comparison alongside byte hashes and runtime faults.',
    'scripts/recover-zombie-carriers-native.mjs; docs/CONTINUATION_45_ENGINEERING.md',
    'Do not mistake every byte rewrite for corruption, or decoded equality for complete safety.',
  ],
];

export const continuation45Requirements = rows.map(
  ([id, feature, topic, state, operation, gap, next, files, risk]) => ({
    id: `C45-${id}`,
    feature,
    topic,
    state,
    operation,
    gap,
    next,
    files,
    risk,
    source,
    previous:
      'Continues C44 c2af5ef; every preceding C35-C44 record and source snapshot remains preserved.',
  }),
);
export const continuation45Overrides = Object.fromEntries(
  continuation45Requirements.map((r) => [
    r.id,
    {
      priority: 'P0',
      state: r.state,
      operation: r.operation,
      gap: r.gap,
      next: r.next,
      files: r.files,
      risk: r.risk,
      acceptance: 'Retain exact input/tool/cache identities and actual native runtime evidence.',
      target:
        'Windows; exact reviewed CE wrapper source; OpenCE build-335; Chupathingy 0.8.1d; native CE609 and MCC13',
      level: 'Actual native tool/process evidence; synthetic parser fixtures remain separate',
      evidence: source + '; docs/fixtures/c45-native-recovery.json',
    },
  ]),
);
