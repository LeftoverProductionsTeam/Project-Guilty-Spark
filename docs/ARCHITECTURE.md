# Architecture

React 19 presents a central versioned Spark project. Tauri 2 commands bridge to Rust spark-core and the managed local library. SQLite stores library summaries/settings; project JSON stores edits, source identities, asset references and target configurations. Original maps are immutable managed copies.

- **Inspection/rendering:** bounded cache/header/tag readers → BSP/model streams and exact shader references → provenance-checked bitmap/DDS batches → Three.js materials. Generation-specific resource keys and spans must agree with pinned source/resource hashes. DDS pixels remain local, in memory; projects contain references.
- **Authoring:** World stages source-map transforms/fields. QuickForge maintains original source geometry and scenario metadata. Creator Studio and Firefight retain source-only semantics until engine bridges are verified.
- **Builds:** each managed job gets an isolated workspace and output folder. Explicit kit generation, target configuration, dependencies, tool identity, expected output/version/scenario and hashes gate acceptance. An exported JMS or successful process exit alone is not a playable map.
- **Recovery:** atomic project writes, versioned snapshots, bounded retention and source-bound restore previews. Source maps/assets are excluded from snapshot pruning.
- **Runtimes:** separate adapters and local registrations. Discovery, file checks, compiler checks, game tests and peer/network evidence are different records.
- **UI lifecycle:** QuickForge scene labels use WebGL sprites. They do not create independent DOM roots inside React's canvas container. A transparent frameless native window uses themed curved controls, native drag/resize/maximize, and guarded close/save.

See [C33 engineering](CONTINUATION_33_ENGINEERING.md), [runtime capabilities](RUNTIME_CAPABILITIES.md), [BSP pipeline](QUICKFORGE_BSP_PIPELINE.md) and [asset policy](ASSET_AND_COPYRIGHT_POLICY.md). The project has no shipped game-memory bridge or automatic AI synchronization transport.

- **Live adapter:** exact-build MCC Halo 1 process reads and bounded object-position writes use map/object identity and readback checks. No code injection or game-file writes. See [adapter limits](LIVE_ADAPTER.md).
- **Shared source:** private two-editor TCP sessions serialize host revisions, rebase disjoint axis/property edits and retain conflicting local drafts. Each editor binds its own runtime objects. Source sync does not certify game replication.
