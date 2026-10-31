const source='docs/TEXTURE_RESOURCE_RECOVERY.md';
const rows=[
  ['location','Recover the original classic texture pack without replacing its identity',
    'New imports retain absolute resource locations. Legacy relative or unavailable locations can recover from bounded local candidates only when every recorded classic resource hash agrees. Reinspect resources and retain saved field/scene edits, history and source identity.',
    'Genuine native acceptance is scoped to the exact owned Zombie Apocalypse Demo map and original pack. General relocation of every runtime/content layout is not certified. A present changed resource is refused by preview reads; it is not silently substituted.'],
  ['coverage','Explain exact image coverage before connecting partial resources',
    'An explicit read-only candidate review reports verified external, missing/mismatched, unsupported and embedded images. Automatic unpinned selection requires positive coverage and zero missing supported external images; manual partial connections remain explicit.',
    'The original Zombie pack still has 47 missing/mismatched and 44 unsupported images. A compatible-runtime donor binding and full render/audio parity remain open; a filename/path alone proves no image compatibility.'],
  ['refresh','Refresh every dependent texture preview without resetting the map view',
    'Use the complete sorted resource pins and location for world material retries, model/reflection/source previews and bounded thumbnail cache identities. Discard older asynchronous results. Same-pin relocation redraws native shaders/lightmaps while retaining camera, selected BSP and display mode.',
    'The renderer retains bounded texture/cubemap budgets, with explicit omissions. Broader large-library performance, every shader/resource layout, real game loading and gameplay fidelity remain separate acceptance gates.'],
];
export const textureRecoveryRequirements=rows.map(([id,feature,operation,gap])=>({id:'TRR-'+id,source,feature,topic:'render',operation,gap,previous:'Continues committed b6fbfe8; previous native/source, C35-C39 history and negative texture evidence remain preserved.'}));
export const textureRecoveryOverrides=Object.fromEntries(textureRecoveryRequirements.map(row=>[row.id,{
  state:'PARTIAL — bounded real native editor/resource acceptance',priority:'P0',operation:row.operation,gap:row.gap,next:row.gap,
  target:'Windows Spark/WebView2; exact owned Zombie Apocalypse Demo cache 6 and original resource hashes. MCC positive rendering is a separate native regression.',
  level:'Native editor/GPU/file integrity checks plus synthetic UI contracts; no new gameplay or game-peer proof',
  evidence:'docs/TEXTURE_RESOURCE_RECOVERY.md; docs/fixtures/texture-resource-recovery-native.json; scripts/test-texture-recovery-native.mjs',
  files:'crates/spark-core/src/library.rs; src-tauri/src/texture_resources_native.rs; src/textureResourceScope.ts; src/components/World.tsx; src/components/HaloTextures.tsx',
}]));
