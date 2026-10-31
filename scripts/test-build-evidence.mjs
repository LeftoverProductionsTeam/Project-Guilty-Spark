const source = 'docs/TEST_BUILD_READINESS.md';
export const testBuildRequirements = [
  {
    id: 'TBR-ce-project-host',
    feature: 'Host a validated managed CE project build with isolated stock-map identity',
    source: 'docs/CE_PROJECT_BUILD_HOSTING.md',
    topic: 'server',
    operation:
      'Resolve a saved CE project/build through native ownership, revision, receipt, target and output checks; host the exact compiled bytes from a private copy. Keep same-filename stock/project choices distinct, preserve missing selections, guide rebuilding and retain a running frozen snapshot while source edits continue.',
    gap: 'Matching-client preparation and join, walkthrough/gameplay parity, classic CE LAN/public exposure, other-runtime output routing, game-peer/AI replication and direct compiled-map authoring remain open.',
    previous:
      'Continues fbe1cbf without replacing its prior native lifecycle evidence, C35-C39 source safeguards or unfinished research.',
  },
  {
    id: 'TBR-ce-private-host',
    feature: 'Owned private Custom Edition dedicated hosting inside Online',
    source: 'docs/CUSTOM_EDITION_PRIVATE_HOST.md',
    topic: 'server',
    operation:
      'Start a checked loopback-only classic CE dedicated process from a fresh private snapshot, observe matching native map/mode/player status, stop only the owning window session, retain controls across workspace reloads and kill owned children after abrupt Spark exit. Real native acceptance covers five stock game types and the unchanged compiled Workshop cache.',
    gap: 'Client join and gameplay remain unaccepted. Managed build-output selection, this control’s LAN/public exposure, game-peer replication, networked AI, cross-runtime play, 128 players and direct compiled-map authoring are open.',
    previous:
      'Extends the retained helper-only CE smoke tests without replacing their failed client attempts or any C35-C39 source safeguards.',
  },
  {
    id: 'TBR-ce-setup',
    feature: 'Checked optional Custom Edition installation',
    source,
    topic: 'dependencyGuide',
    operation:
      'Detect/connect an owned CE installation or download the fixed community archive into a new managed folder. Verify complete archive identity, extraction paths/file types, required game/resource/UI headers and retained file hashes. Show progress/cancellation, preserve old game files and register the new copy without running setup/updaters.',
    gap: 'Windows and one pinned community archive only; not publisher authentication, a CE editing-kit installer, installation on every PC, a successful game/client join or universal runtime setup.',
    previous:
      'New optional setup workflow follows committed 8fc2acc; prior dependency actions, C35-C39 history, original game files and research remain intact.',
  },
  {
    id: 'TBR-ce-engine',
    feature: 'Real private CE stock and Workshop server smoke tests',
    source,
    topic: 'server',
    operation:
      'Run exact downloaded CE dedicated executables from private QA copies, loopback-only and public listing disabled. Observe native query/log reports for Blood Gulch and a real reviewed-source CE Workshop cache in openplaying without editing cache headers or source games.',
    gap: 'The automated client did not join. This test helper does not implement or prove a complete Spark hosting lifecycle, playable traversal, renderer/audio fidelity, game-peer replication, cross-runtime play or expanded population.',
    previous:
      'Retains the failed automated-client attempt and historical CE source-recovery/compiler limitations. Private engine query evidence is separate from editor synchronization.',
  },
];
export const testBuildOverrides = Object.fromEntries(
  testBuildRequirements.map((row) => [
    row.id,
    {
      state: 'PARTIAL — exact Windows native acceptance',
      priority: 'P1',
      operation: row.operation,
      gap: row.gap,
      next: row.gap,
      target:
        'Windows Spark; pinned Custom Edition v1.10 community archive; private CE dedicated engine and a reviewed-source v609 cache',
      level:
        'Real HTTPS/native IPC/extraction and native engine queries; client join and gameplay NOT ACCEPTED',
      evidence:
        'docs/TEST_BUILD_READINESS.md; docs/fixtures/test-build-readiness.json; scripts/test-custom-edition-native.mjs; scripts/test-ce-server-native.mjs',
      files:
        'src-tauri/src/ce_setup.rs; src-tauri/src/dependency_install.rs; src/components/CustomEditionSetup.tsx; scripts/test-custom-edition-native.mjs; scripts/test-ce-server-native.mjs',
    },
  ]),
);
testBuildOverrides['TBR-ce-private-host'] = {
  ...testBuildOverrides['TBR-ce-private-host'],
  evidence:
    'docs/CUSTOM_EDITION_PRIVATE_HOST.md; docs/fixtures/ce-private-host-native.json; scripts/test-ce-host-native.mjs',
  files:
    'crates/spark-core/src/ce_host.rs; src-tauri/src/ce_host_native.rs; src/components/CustomEditionHost.tsx; scripts/test-ce-host-native.mjs',
  level:
    'Real Windows desktop UI/native IPC plus dedicated-engine lifecycle/status; client join and gameplay NOT ACCEPTED',
};
testBuildOverrides['TBR-ce-project-host'] = {
  ...testBuildOverrides['TBR-ce-project-host'],
  evidence:
    'docs/CE_PROJECT_BUILD_HOSTING.md; docs/fixtures/ce-project-host-native.json; scripts/test-ce-host-native.mjs',
  files:
    'crates/spark-core/src/ce_host.rs; src-tauri/src/ce_host_native.rs; src/components/CustomEditionHost.tsx; scripts/test-ce-host-native.mjs',
  level:
    'Real Windows UI/native toolchain and dedicated-engine map acceptance; matching client and gameplay NOT ACCEPTED',
};
