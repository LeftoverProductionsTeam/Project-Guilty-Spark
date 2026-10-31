const source='docs/ORIGINAL_BITMAP_RESTORATION.md';
const rows=[
  ['packed','Original 1555 and 4444 bitmap pixels',
    'Read native A1R5G5B5/A4R4G4B4 top mips and serialize standard DDS masks. Decode all alpha levels through the existing source/resource identity and memory limits. Twelve previously unsupported original Zombie images now match their original bytes and real tag-preview alpha/colors.',
    'Accepted for the exact owned Demo source/resource and native viewer cases. This is not every bitmap encoding, volume layout, runtime or engine shader/effect.'],
  ['shared-pixels','Proven same-source shared native bitmap arrays',
    'When a classic resource name is absent, require a complete identical native image array in the same pinned source and a unique exact witness resource entry/span. Restore 45 original references without modifying native structures or guessing names. Existing bad spans and duplicate keys never fall back.',
    'Two shield-charge image references remain unproven. Cross-map donors, source rewrites, universal resource recovery and game fidelity remain separate gates.'],
  ['inspection','Compact original bitmap inspection in both tag views',
    'Preview verified original pixels, source format, dimensions and provenance with actual bounded native frame counts and per-map/tag image state. Preserve alpha, discard stale requests and prevent new frame labels from exposing old pixels. Replace the read-only bitmap empty panel with concise guidance.',
    'Pixels are read-only. Bitmap authoring, non-flat volume display and full native field coverage are not implemented by this preview. Direct compiled-map editing remains unfinished.'],
];
export const bitmapRestorationRequirements=rows.map(([id,feature,operation,gap])=>({id:'BPR-'+id,feature,source,operation,gap,topic:'render',previous:'Continues committed 1d5077f; C35-C39 history, source safeguards, original negative evidence and failed native attempts remain preserved.'}));
export const bitmapRestorationOverrides=Object.fromEntries(bitmapRestorationRequirements.map(row=>[row.id,{
  state:'PARTIAL — bounded native cache/editor acceptance',priority:'P0',operation:row.operation,gap:row.gap,next:row.gap,
  target:'Windows Spark/WebView2; exact owned Halo Demo cache 6 and original bitmap hash. MCC version 13 rendering retained as a separate native regression.',
  level:'Native source/resource bytes and real editor canvas checks; no new Halo compilation, gameplay or game-peer proof',
  evidence:'docs/ORIGINAL_BITMAP_RESTORATION.md; docs/fixtures/original-bitmap-restoration-native.json; scripts/test-bitmap-restoration-native.mjs',
  files:'crates/spark-core/src/bitmap_preview.rs; crates/spark-core/src/bitmap_alias.rs; crates/spark-core/src/resource_map.rs; src/haloDds.ts; src/components/BitmapPreview.tsx',
}]));
