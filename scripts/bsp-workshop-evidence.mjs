const source = 'docs/BSP_WORKSHOP.md';
const rows = [
  [
    'source',
    'Editable convex BSP brush source',
    'geometry',
    'Stable brush/face topology, transforms, per-face UV/material state, unioned playable spaces, solid subtraction and guarded native JMS export.',
    'General concave editing, original JMS import, arbitrary face deletion/merge and existing-map reconstruction remain open.',
  ],
  [
    'views',
    'Four linked BSP construction views',
    'interface',
    'Perspective plus top/front/side source editing, brush drawing, transforms, clipping/extrusion, persisted view layout, compact inspector and exact source-map texture previews.',
    'Broader material symbols/portal tools, Workshop asset placement and large-scene performance need acceptance.',
  ],
  [
    'native-build',
    'Genuine Workshop H1A structure and cache build',
    'geometry',
    'Real GUI and CLI builds pass H1A Tool; independent native readback finds three clusters and two portals. The GUI-built exact texture is rendered back in the editor.',
    'CE cache compilation is blocked by the unchanged extracted warthog gunner actor-variant grenade enum. A valid CE source tagset/recovery and separate runtime acceptance remain required.',
  ],
  [
    'gameplay',
    'Two rooms, corridor and ramp player traversal',
    'geometry',
    'The exact isolated native level is launched in H1A Standalone using a retained short content alias. No successful player walkthrough is pre-filled.',
    'Manual player traversal/material acceptance is pending. Retail MCC cache loading and CE gameplay are not verified.',
  ],
  [
    'interoperability',
    'Existing BSP and shared-workshop interoperability',
    'geometry',
    'Legacy QuickForge project serialization, native source reconciliation, compiler history and separate research are retained.',
    'General source-backed BSP modification/combination, remapped cluster metadata, Workshop shared editing and direct compiled-map editing remain independently open.',
  ],
];
export const bspWorkshopRequirements = rows.map(([id, feature, topic, operation, gap]) => ({
  id: `BSPW-${id}`,
  source,
  feature,
  topic,
  operation,
  gap,
  previous: 'Continues committed C39 at 2155ae1; earlier requirements and negative evidence retained.',
}));
export const bspWorkshopOverrides = Object.fromEntries(
  bspWorkshopRequirements.map((r) => [
    r.id,
    {
      state:
        r.id === 'BSPW-gameplay'
          ? 'OPEN — player acceptance pending'
          : 'PARTIAL — bounded source/native milestone',
      priority: 'P0',
      operation: r.operation,
      gap: r.gap,
      next: r.gap,
      target: 'Windows Spark; owned Halo 1 source; H1A Tool/MCC v13 build. CE cache/game acceptance blocked.',
      level: 'Real native editor/compiler acceptance; player/game-peer acceptance separate',
      evidence:
        'docs/BSP_WORKSHOP.md; docs/fixtures/bsp-workshop-native.json; scripts/test-bsp-workshop-native.mjs',
      files:
        'crates/spark-core/src/bsp_workshop.rs; crates/spark-core/src/quickforge.rs; src/bspWorkshop.ts; src/components/BspWorkshop.tsx',
    },
  ]),
);
