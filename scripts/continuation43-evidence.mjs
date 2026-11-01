// Keep C43 acceptance independent from older loose-tag, gameplay and peer gates.
const source='docs/CONTINUATION_43_ENGINEERING.md';
const rows=[
  ['window-history','Durable local-window editing history and explicit writer handoff','interface',
    'Real native WebViews share an acknowledged checksummed revisioned history, explicit one-writer lease, passive views, keyboard Undo/Redo, close/reopen and crash recovery. Rejected drafts are retained; layouts are window-specific.',
    'Additional physical monitors/machines and large production histories need broader acceptance. This is not competing local writers or game-peer replication.',
    'crates/spark-core/src/workspace_history.rs; src-tauri/src/workspace_history_native.rs; src/windowHistory.ts; scripts/test-window-history-native.mjs'],
  ['original-atlas','Original Halo campaign and multiplayer BSP Atlas','bsp',
    'Read-only installed-runtime inventory: 94 paths, 71 cache hashes, 187 source BSP records with bounds, topology, shader identities and exact aliases. Rehash before reuse/import; open preserved sources through the existing editor.',
    'Source records are not unique artistic locations. Native dependency closure, campaign logic transfer and gameplay remain separate gates.',
    'crates/spark-core/src/megaworld.rs; src-tauri/src/megaworld_native.rs; src/components/MegaworldAtlas.tsx'],
  ['two-regions','Native CE Timberland and Sidewinder physical connection','bsp',
    'Actual H1A structure/lightmaps and Invader CE output combine two original regions into one resident BSP with a metal tunnel and 42 donor scenery placements. Native identity/CRC/collision readback passes; private server loaded with one player.',
    'The new two-way player walkthrough remains pending. Seven reviewed CE corrections, regenerated lighting/collision and unavailable nonempty detail/cluster weather/audio transfers prevent a lossless-parity claim.',
    'crates/spark-core/src/megaworld_build.rs; crates/spark-core/src/bsp_compile.rs; crates/spark-core/examples/qa_megaworld_ce.rs'],
  ['four-regions','Four-region original world expansion after physical acceptance','bsp',
    'Preserve the prior C33 four-map research and current source inventory. C43 does not begin a new four-region build before two-way traversal passes.',
    'Four original regions, all connecting player routes, native visibility/resource budgets and performance are unaccepted; no automatic streaming implementation.',
    'docs/FOUR_MAP_CHALLENGE.md; docs/CONTINUATION_43_ENGINEERING.md'],
  ['inventory-performance','Measured verified Atlas optimization and bounded inspection cache','performance',
    'Three paired CE inventories retain identical full source/BSP/material records: median initial 19295 to 7130 ms; repeat 5554 to 5637 ms. Full original hashing retained. Native inspection LRU limits eight entries/256 MiB estimated heap without removing live geometry.',
    'This is not a general startup/GPU/map-render speed claim or a process RAM cap. Broad datasets and full renderer timings remain separately measured.',
    'crates/spark-core/src/maps.rs; crates/spark-core/src/megaworld.rs; src-tauri/src/inspection_cache.rs; scripts/profile-native-workbench.mjs'],
  ['ce-launch-path','Verified relative-path CE server and client handoff','server',
    'A stock control isolated the legacy long absolute option-path failure. Fixed short arguments use checked owned sibling paths; the production combined world then loaded with a matching private client and server population of one.',
    'Server population is separate from strict client association and human traversal. No public/multi-computer/network-scale acceptance is inferred.',
    'src-tauri/src/ce_host_native.rs; src-tauri/src/ce_host_client.rs'],
];
export const continuation43Requirements=rows.map(([id,feature,topic,operation,gap,files])=>({id:`C43-${id}`,feature,topic,operation,gap,files,source,previous:'Continues C42 ce697fd; all earlier IDs, experimental branches and source snapshots remain preserved.'}));
export const continuation43Overrides=Object.fromEntries(continuation43Requirements.map(row=>[row.id,{
  priority:'P0',state:row.id==='C43-four-regions'?'OPEN - gated on new two-region traversal':'PARTIAL - exact local editor/compiler/runtime evidence; remaining gates explicit',
  operation:row.operation,gap:row.gap,next:row.gap,files:row.files,
  target:'Windows; original installed H1 caches; explicit CE 609 two-region build; private CE 1.10 server; one physical computer',
  level:'Actual native source/desktop/server evidence distinguished from unverified player traversal and multi-machine acceptance',
  evidence:source,
}]));
