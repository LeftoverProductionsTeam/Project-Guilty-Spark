# C44 — Measured loading and native AI diagnostics

C44 continues the committed C43 foundation `de8922f7e6cd5e597072dec08a8a7f2729a4e745` in the existing local master worktree. The separate dirty C41 checkout, original game/SDK content, earlier branches, source snapshots, unsuccessful trials and release artifacts remain preserved. No remote push or repository-rule change is part of this continuation.

## Renderer work and measured result

The existing decoded-image cache incorrectly gave all six faces of a reflection cube the same key. Each face could evict the previous face. C44 distinguishes face identity without changing native bitmap indices, source/resource validation, decoded pixels or returned-buffer ownership. A repeat six-face test now records six hits and no misses; altered source identity still fails.

DDS Base64 decoding now bounds the decoded allocation and validates canonical padding before using the WebView's native byte decoder. Older WebViews use a plain byte loop. The original DDS parser and metadata checks remain. Opt-in profiling adds only numerical cache counts/budgets; it records no content or paths and is off by default.

Two sequential C43/C44 pairs used fresh libraries/WebView profiles, the same natively compiled Timberland–Sidewinder CE world and owned MCC Blood Gulch, and the same viewport/settings. OS file caches were not flushed. Every first-load and switch rendering-resource signature matches within each pair. These signatures include shader identities, lightmaps, detail/reflection/sky/decal accounting, canvas dimensions and environment/effect settings. No geometry, textures, models, decals or validation was omitted.

| Median measurement                   |      C43 | Final C44 |
| ------------------------------------ | -------: | --------: |
| First textured connected world       | 5,860 ms |  5,330 ms |
| First textured MCC Blood Gulch       | 6,005 ms |  5,610 ms |
| Eight complete repeated map switches | 4,486 ms |  4,013 ms |
| Large asset catalog                  | 3,149 ms |  3,059 ms |
| Showcase initialization after shell  | 3,132 ms |  3,160 ms |

Map switching improved about **10.6%**; first map loads improved **6.6–9%** in these pairs. The smaller catalog difference and startup variation do not establish general catalog/startup improvements. CPU/GPU samples remain diagnostic, with no general GPU improvement claimed.

An earlier 512-entry cache trial is retained as research. Final C44 keeps the original **128 entries / 64 MiB estimated decoded-cache budget**, including its 16 MiB single-entry limit. Sampled process-tree private memory after switching ranged from about 1,419–1,448 MiB before and 1,313–1,580 MiB after. This variability does not establish a memory improvement, and the cache estimate is not a process memory limit. The full paired measurements and identities are in [c44-performance.json](fixtures/c44-performance.json).

**Measurement correction:** C43's approximately 3.6-second “native inspection transfer” included exporting full geometry from the WebView through the automation connection. C44 times the native invocation inside the WebView, returns only small summary metadata to the harness, and labels the separate automation round trip. The native call is roughly 108–129 ms in these runs. Historical C43 evidence is retained; its export timing is not a basis for replacing Spark's native transport.

## Actual OpenCE actor observations

The new opt-in Windows example `qa_opence_ai` observes the exact publisher OpenCE build-335. It pins executable SHA-256 and the publisher's matching PDB bytes, requires matching private symbol/type metadata, derives field offsets from that metadata, checks the explicitly selected process image/main module, and opens only a read/query handle. Bounded reads reject unavailable pointers, invalid pools, recycled datum identities and snapshots crossing a tick. Initial-load/refused samples remain counted in the report. It never injects, writes game memory, launches a game, executes remote commands or sends binary patches.

The private runner starts two real isolated engine copies with owned content and native test-input hooks. `--ai-symbols` disables the runner's synthetic SHOOT/KILL damage cues. This prevents those cues being confused with AI firing. The campaign test uses stock **b30 co-op**, null rendering and dummy audio on one physical computer.

The final source-controlled observer/runner recorded:

- A genuine private join and bidirectional engine traffic between distinct host/client processes.
- **42 shared actual AI-unit identities**, identified by salted unit ID and native tag. Host actor records exist; the client actor pool remains empty while received controls drive its unit copies.
- Movement controls on **33** matched AI units and firing controls on **seven**.
- **500 same-tick actor comparisons**. Position difference: median 0.0274, 95th percentile 0.0837, maximum 0.2758 Halo units. Health difference: 95th percentile about 0.000022, maximum about 0.1600. Shield maximum difference about 0.000029. All compared samples remain included.
- Received control age of 1 tick median and 3 ticks at the 95th percentile. These reads are not an approved latency measurement or tolerance.

A preliminary prototype captured a 75.96-unit transient position difference. Its log, failed attempts and analysis remain intact. The final repeat did not reproduce that large paired discrepancy; no engine repair or complete parity is claimed from its absence. Reads sharing a tick counter are still not an atomic engine/network snapshot.

The analyzer checks observer/log identities, completion/readback, bounds, genuine native join evidence and actual non-player actor identities. It reports discrepancies rather than discarding them. **`aiActorAcceptance` remains false.** Host-authoritative control observation is narrower than complete lifecycle/damage/death, late join, reconnect, script/encounter coverage, audiovisual playback or multi-computer acceptance. This observes OpenCE's existing protocol; it does not add MCC arbitrary multiplayer AI, a CE/OpenCE/MCC protocol bridge, mixed-engine compatibility or 128-player support. Chupathingy's installed build has no corresponding accepted symbol observer here; no x64 offsets were guessed.

The source references are the [exact OpenCE release](https://github.com/OpenCommunityEdition/OpenCE/releases/tag/build-335), its [actor synchronization source](https://github.com/OpenCommunityEdition/OpenCE/blob/da8d455623cf50002e6a798b1980068fd3ca0292/port/linux/game/network_actors.c) and [object identity source](https://github.com/OpenCommunityEdition/OpenCE/blob/da8d455623cf50002e6a798b1980068fd3ca0292/port/linux/game/network_objects.c). No upstream engine implementation, PDB or owned content is included in Spark's source package. [Exact observations](fixtures/c44-native-ai.json).

## Zombie Apocalypse conversion gate

The existing experimental CE recovery cache `d1d1ddb96ca6093231b65c72918c2d61625bc81e27022ee46150517823b7e2b8` again loaded and joined in two private OpenCE processes. The actor observer correctly reports **no accepted replicated AI controls**. A native object census identifies the original spawner weapons on the host, while the client retains zombie bipeds and an invisible container absent from the host's final census. The transient host actor-pool count reaches six; that is not proof of working zombie behavior.

This narrows the investigation to the recovered spawner/vehicle/actor lifecycle and authority behavior. It does not prove that a particular trigger flag is the cause. No guessed flag change, source deletion, missing-audio substitution, rewritten cache header or replacement of the previous-good recovery build was made. The missing original two audio cues, reviewed CE compatibility deviations, human “map loads, no zombies” report and earlier MCC/CE/OpenCE/Chupathingy trials remain distinct evidence. General all-runtime faithful conversion remains open.

## Existing source and release safeguards

The native C38/C39 source transactions, external-tool reconciliation, checksum/semantic checks, permissions, participant undo and frozen build pipeline remain in place. C44 adds no game-peer replication or remote tool execution. The direct compiled-map editing backlog remains open; native loose-tag or collaborative source tests cannot complete it.

A missing-template attempt in the native regression was refused by the existing admission guard. Its screenshot/log remain retained. The corrected trial uses the previously admitted, hash-verified boulder template. The external-save tests distinguish injected corrupt candidates from actual tool bugs; the retained human Baboon edit is a replay of prior evidence, not a new GUI edit or an accusation that Baboon produced the injected corruption.

Regression counts, final native receipts, preservation and artifact identities are recorded in [c44-engineering.json](fixtures/c44-engineering.json). The C43 connected-world physical walkthrough, multi-computer LAN/VPN, full AI lifecycle/AV, general direct-map structural edits and remaining live/gameplay features remain open. Windows installer/portable/source packages are separate; a successful build is not a clean-machine installer acceptance.
