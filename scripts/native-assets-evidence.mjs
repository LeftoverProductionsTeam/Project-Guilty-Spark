const source = 'docs/NATIVE_ASSETS_AND_SHOWCASE.md';
const rows = [
  [
    'discovery',
    'Installed-runtime and linked-map asset discovery',
    'assets',
    'Bounded header-only discovery of installed Halo maps, linked folders, Downloads and the Spark inbox. Selecting a source preserves and inspects it without replacing the current map draft.',
    'The bounded catalog is not a full-disk crawler. Asset payloads load on selection, not during startup. Unsupported archives and formats remain refused.',
  ],
  [
    'recursive-import',
    'Drag a native model preview into editable source',
    'assets',
    'Extract the exact selected tag and recursive closure, copy into a private namespace, update references using local Invader, read back native fields/dependencies and attach the receipt and placement in one undoable edit. Native builds rehash all imported files.',
    'Acceptance covers MCC scenery into QuickForge and a matching native MCC source rebuild. Other native classes are implemented but need their own real-map acceptance. Arbitrary replacement/deletion/scale, universal conversion and collaborative custom binary uploads remain open.',
  ],
  [
    'defaults',
    'Owned Halo grass and metal defaults',
    'geometry',
    'Prepare the source-exact Blood Gulch grass/metal shaders with their native dependencies. Both QuickForge and BSP Workshop use the shared source shader renderer, including detail/normal/reflection data where available.',
    'No invented texture substitutes for absent source data. Actual game material, lightmap and collision traversal acceptance remains separate. Historical missing external Zombie resources are not resolved by these intentional shader imports.',
  ],
  [
    'reflections',
    'Source-authored model reflections and shared GPU previews',
    'render',
    'Validate and decode six native linear cubemap faces and apply exact model/environment reflection references, masks and authored brightness/tints. Model thumbnails, tag previews, map objects and source surfaces share the Halo material implementation.',
    'Compressed/swizzled or unavailable resource layouts remain explicit refusals. Glass/water/effects, complete shader parity, runtime LOD/animation states and broad engine rendering parity are not certified.',
  ],
  [
    'home',
    'Floating home centerpiece from owned Halo content',
    'interface',
    'Render the real monitor directly over the home layout, without a preview frame or opaque canvas rectangle. Preserve native textures/reflections, fit the actual mesh, follow the cursor gently and retain an available character while background loading completes.',
    'The app does not ship Halo art. Model availability depends on installed or preserved owned maps. Presentation lighting and cursor rotation are distinct from native skeletal animation.',
  ],
  [
    'animations',
    'Native monitor idle and talking playback',
    'animation',
    'Read exact internal uncompressed Halo 1 animation graphs with verified source identity, skeleton names/order/checksum, bounded channel data and hierarchy. Play the monitor idle overlay, talking loop and base idle through actual skinned vertices; expose clip selection and play/pause.',
    'Compressed streams, replacement-channel blending, world-relative clips, game state machines, animation sound events and live in-game animation replacement remain separate. This is native-source editor playback, not a game session.',
  ],
  [
    'startup',
    'Responsive startup with actual progress',
    'performance',
    'Paint a branded launch surface before the main bundle, expose real discovery/configuration phases and move initial installation/tool discovery off the UI thread. Progress polling uses its own small lock.',
    'Measured cold startup and polling results are machine-specific. Network drives, every runtime and large-library soak/performance acceptance remain open.',
  ],
  [
    'preservation',
    'Native imports preserve raw-byte and source safeguards',
    'safety',
    'Keep new native scenario additions outside the preserved cache-byte patch footprint. Refuse changed import receipts or payloads, retain failed staging jobs, restore exact injected test damage and preserve original maps and prior validated outputs.',
    'This does not certify arbitrary external-editor changes or repair unknown corruption. Native loose-tag/source rebuilding does not complete the unfinished direct compiled-map editing workflow.',
  ],
];
export const nativeAssetsRequirements = rows.map(([id, feature, topic, operation, gap]) => ({
  id: `NAR-${id}`,
  source,
  feature,
  topic,
  operation,
  gap,
  previous: 'Continues e8b5761 and the preserved C35-C40 history and experiments.',
}));
export const nativeAssetsOverrides = Object.fromEntries(
  nativeAssetsRequirements.map((row) => [
    row.id,
    {
      state: 'PARTIAL — bounded native editor/compiler acceptance',
      priority: 'P0',
      operation: row.operation,
      gap: row.gap,
      next: row.gap,
      target:
        'Windows Spark; owned Halo 1 PC-family cache data; actual MCC v13 native GPU/compiler cases. Game acceptance remains separate.',
      level: 'Native editor/GPU/source/toolchain evidence; no new gameplay or game-peer proof',
      evidence:
        'docs/NATIVE_ASSETS_AND_SHOWCASE.md; docs/fixtures/native-assets-showcase-native.json; scripts/test-assets-startup-native.mjs',
      files:
        'crates/spark-core/src/native_asset_imports.rs; crates/spark-core/src/render_animation.rs; src-tauri/src/asset_sources_native.rs; src/components/NativeModelPreview.tsx; src/components/HaloMesh.tsx',
    },
  ]),
);
