# C43 — Megaworld engineering and durable windows

C43 continues committed C42 (`ce697fda68919afa59c4593831200e2126dabc52`) in the existing local master worktree. It preserves the separate dirty C41 checkout, all earlier branches, source snapshots, failed experiments and C42 release artifacts. This is an engineering checkpoint: the two-region native build and local server loaded, but its new two-way player walkthrough has not been accepted. Four-region expansion remains gated on that result.

The machine-readable [C43 evidence](fixtures/c43-engineering.json) records exact executable, source, cache, compiler and test identities. Private evidence is retained under `.local/c43-megaworld-20261101`; original game assets are excluded from the source distribution.

## Durable editing across local windows

Every managed map now has a native, revisioned local-window history. A window submits authored project snapshots against the last acknowledged revision. Immutable checksummed snapshots are flushed before the small atomic head is acknowledged. Reopening a project restores the acknowledged edit, undo and redo even after abruptly killing Spark before a normal project save.

The existing one-writer window lease remains enforced within one Spark application process. **Open another view** observes the same map; **Edit here** explicitly moves editing ownership. Separate Spark processes use independent data directories and SparkLink's independently ordered multi-user source transactions; this window journal is not a cross-process shared-folder lock. It does not introduce competing local writers or broadcast raw Halo bytes. Window notifications contain only project identity, revision and owner.

- Window transfer flushes numeric drafts and history before opening the new editing view. Closing saves; a journal failure keeps the draft and window available.
- Stale revisions, foreign source identities, changed immutable snapshots and invalid history references cannot replace the acknowledged head. Rejected valid-source drafts are retained separately.
- **Keep draft and use accepted revision** retains the local history before refreshing the accepted state.
- Accepted source-resource metadata, assets and build receipts survive restoring older authored history. Native source/tool revisions remain under the existing C38/C39 integrity and transaction rules.
- Histories default to 100 entries, configurable from 1 to 1,000. Transfers and the complete acknowledged head share a 64 MiB budget; an oversized head is refused without truncating an accepted history. Individual snapshots are bounded at 32 MiB.
- Maps retain separate histories, selection and cameras. Drawer layouts inherit the source layout, then use a native-window-specific key so arranging one monitor does not move another window's drawers.

`scripts/test-window-history-native.mjs` uses real native WebViews, project directories, keyboard undo/redo, writer handoff and actual process termination. The evidence distinguishes this from browser fixtures. Cross-computer LAN/VPN remains untested because no second computer is available.

## Original BSP Atlas

The Atlas is a compact section in BSP Workshop and the existing Construction assembly workflow. It scans owned MCC, Custom Edition, OpenCE and Chupathingy map directories. Search, runtime filtering and 12-row pages lead to the preserved source in Level Editor. The current assembly shows source bounds, the donor transform and the authored connection in top view.

This installation contains **94 cache paths, 71 distinct cache hashes and 187 source BSP records**: 29 MCC paths, 19 CE, 23 OpenCE and 23 Chupathingy. Exact duplicate Xbox-derived bytes share records while retaining both runtime/path aliases. Runtime versions of the same artistic location remain distinct source records; 187 is not a count of different artistic locations.

Each record retains the full original cache hash, scenario/runtime identity, selected BSP index, Z-up bounds, collision/render triangle counts, welded collision topology, native shader identities and unresolved shader counts. Original transforms remain explicit. Import rechecks source bytes and the selected BSP identity. Invalid caches are reported rather than silently treated as empty worlds.

The Atlas is metadata over original collision/render surfaces. It is not a native gameplay acceptance, automatic campaign conversion, general streaming system, or replacement for dependency-complete source extraction. Campaign AI, scripts and encounter logic remain separate.

## Native two-region CE world

The existing BSP assembly exporter now has an explicit reviewed CE path using the installed H1A authoring tools and Invader CE compiler. It uses fresh job folders, verified editable tag copies, existing namespace/dependency checks, authored portals, native structure/lightmaps and readback. Other authored edits that this initial path cannot preserve are refused instead of omitted.

The accepted native output combines CE Timberland and Sidewinder with a roughly 105.3-unit metal tunnel into **one resident BSP**. It does not switch scenario BSP references or claim streaming.

| Result | Native evidence |
| --- | --- |
| Source Timberland | `69d539409004bde866e3fb510d43fa9e155fb8dd0525fe6e2ffe1efe3664e0ea` |
| Source Sidewinder | `ac8580a914f96249fa10fd95ee10065a4513fd6147f1d1e2d768adae59407b4a` |
| Compiled CE cache | `ed2bb8920d07310c77f54a0a551ffcf17cde0ea0950b466895600d676e49e7fe` |
| Authoring input | 18,760 source triangles, 32,105 generated triangles, 1,428 generated UV faces, two authored portals |
| Donor scenery | 42 transformed native placements verified after compilation |
| Source dependencies | 2,685 staged tag files; original hashes rechecked |
| Compiled collision | 16,196 triangles; 423 route capsule samples accepted |
| Build identity | Project `c693a32c-8d54-4348-9b8d-d1ada2a41a13`; job `f1bc4304-35e1-4ecd-9169-ad19b2989ddf` |
| Native build duration | 226,368 ms; CE identity, CRC, protection/stub checks and route readback passed |
| Runtime observation | Private CE 1.10 dedicated server reported the exact map loaded and one player after launching the matching isolated client |
| Player gate | New Timberland → tunnel → Sidewinder → tunnel → Timberland walkthrough remains pending |

The source uses the prior explicitly reviewed seven-field CE compatibility corrections. This is not a lossless original tag set. Both sources had zero painted-detail payload instances; the path rejects nonempty detail payloads because their transformed rebuild is unfinished. Lightmaps/collision are regenerated. Original cluster weather, audio and render-only decoration are not all transplanted. Donor campaign scripts/AI are not imported. Automated capsule clearance does not establish real player traversal or complete visual/audio parity.

The previous failed staging, path and native-host attempts remain in their original evidence folders. The historical four-map experiment is retained as research. C43 does not promote it or expand to four regions before the new physical traversal gate passes.

## CE long-path launch repair

The legacy dedicated executable timed out with both the connected world and stock Timberland when given long absolute profile/init arguments. A controlled stock-map trial under the same owned directory loaded in about 1,048 ms using short relative arguments. The production launcher now sets the verified game directory as the working directory and uses fixed `..` paths to its already checked sibling profile and init file. The client uses the equivalent checked sibling profile path.

The corrected production path then loaded the combined world and the server reported a player. No original installation, security setting, binary or public networking configuration was changed. The client's stricter `connectionVerified` field remained false; server population, visible owned client, human movement and a cryptographically associated client connection remain distinct observations.

## Measured performance and memory policy

Three sequential paired debug runs scanned exactly the same 19 owned CE maps. The baseline is the initial unoptimized C43 Atlas; C42 did not have an Atlas. Every pair produced the same complete source/BSP/material metadata hash. OS disk caches were not flushed and a private CE game remained open in another process. These are inventory measurements, not full renderer/map-load speed claims.

| Median | Before | After |
| --- | ---: | ---: |
| Initial inventory | 19,295 ms | 7,130 ms |
| Repeated metadata scan, full byte verification retained | 5,554 ms | 5,637 ms |
| Process CPU, initial plus repeat | 24,781 ms | 12,766 ms |

Initial inventory improved about 63%; repeated verification was about 1.5% slower in this sample. The implementation hashes a cache once, reuses that immutable verified snapshot for inspection/collision, and avoids decoding object models that the metadata-only Atlas does not render. Actual Level Editor inspection still decodes its full object models, textures, decals and shader data. Cache hits still verify complete original file bytes. The inventory helper did not obtain a reliable peak-memory counter; no inventory memory improvement is claimed from that counter.

The native decoded-map cache now has an eight-entry and 256 MiB estimated-heap LRU limit. Eviction releases only the cache's reference; an active caller retains its complete inspection. A requested map larger than the budget is returned in full without being cached. This estimate is not a process memory limit. `inspection_cache_status` reports entries, estimated bytes and evictions for diagnosis.

The final executable also completed a sequential C42/C43 native renderer profile using the same generated CE world and original MCC Blood Gulch. Both runs used fresh libraries/WebView profiles with the CE game and compiler stopped. The six first-load/switch resource signatures match exactly, including shader/lightmap/detail/reflection counts, decal accounting, canvas resolution and effects. [Full measured data](fixtures/c43-performance.json).

| One native sample pair | C42 | Final C43 |
| --- | ---: | ---: |
| Process-cold shell | 1,175 ms | 1,039 ms |
| Warm-process shell | 674 ms | 752 ms |
| Cold process to fully textured/reflected showcase | 4,611 ms | 4,135 ms |
| Warm process to showcase | 2,744 ms | 2,798 ms |
| First textured connected world | 5,648 ms | 5,735 ms |
| First textured MCC Blood Gulch | 6,188 ms | 6,344 ms |
| Median of four complete map switches | 4,498 ms | 4,479 ms |
| Large asset catalog | 3,118 ms | 3,039 ms |
| Median of four complete native inspection transfers | 3,649 ms | 3,636 ms |
| Sampled process-tree private bytes after switching | 1,435 MiB | 1,433 MiB |
| Connected-world idle CPU, summed across app processes in one-core units | 70.9% | 72.7% |
| Connected-world sampled GPU 3D use | 9% | 9% |

These single-pair changes are not a statistical startup, renderer, GPU or memory speedup. Full decoded inspection transfers still take about 3.6 seconds for the larger world; reducing that repeated geometry serialization is a demonstrated next performance target. No textures, models, decals, shaders or native verification were removed to reach a timing result. An earlier profile using stock CE Timberland did not pass the fully textured-resource gate; its failure is retained and is not counted as a fast map load.

The native Atlas UI scan exposed all 94 caches/187 records with working pagination and source bounds. A separate real ten-map run reached eight cached inspections and six evictions; reopening the evicted map preserved the exact tag/object/collision/render/model fingerprint and original file hashes. The final eight cached inspections totalled about 87.4 MiB by the policy estimate. This is separate from total application/GPU memory.

## Regression and artifact evidence

- Windows `cargo test --workspace --locked`: **616 passed, seven opt-in tests ignored**. The MCC manifest registration regressions pass rather than being excluded.
- Frontend: **280 passed**. Browser: **136 passed**. Offline scripts: **59 passed**. Interface probes: **two passed**.
- Final executable: **seven real window-history cases**, including a nondefault brush selection across transfer, rapid notifications, lease handoff, stale-revision refusal, independent maps, actual process death and saved close/reopen. All **23 workspace routes** pop out; three were open together.
- Three actual Spark processes in three fresh directories again converge after native-field editing, validated asset publication and placement. Actual Invader edits/corruption refusals, retained prior human Baboon-save replay, author undo, permissions, recovery/reconnect and a frozen native Halo build pass. The compiled revision 18 contains the 0.5 pistol radius and published 31-triangle scenery at `[3, 2, 0.1]` while a later revision 19 remains separate. This is editor synchronization on one physical computer, not in-game multiplayer replication.
- All **160 pre-existing root untracked files**, **67 original Zombie Apocalypse files**, **94 installed maps**, **four C42 artifacts** and **28 prior references** match their preservation checkpoint. Original dirty root patches also match. All 398 earlier ledger rows remain, with six C43 records added.

The executable SHA-256 is `87065a1922a20a8731e50bcd97b1fe0e5d22a9d0a347906fd6f39743c1843262`; the installer is `fa768c10e163fd8faa77f3814cac6473f5fa635fe2ab02d981f4c4f2028e4b24`. Installer, portable and clean source archives are packaged separately with final commit/checksum readback. A clean-machine installer run is not accepted. Source archives exclude owned game/tool payloads. No remote publication is claimed.

## Remaining acceptance and preserved backlog

1. Complete the physical two-way CE walkthrough and record floors, entrances, materials and collision. Only then plan four original regions, visibility limits and performance.
2. Preserve/rebuild nonempty painted detail, render-only decorations and donor cluster acoustics/weather before claiming faithful arbitrary campaign transfer.
3. Verify window recovery on additional machines and real multi-monitor/LAN/VPN environments. Current multi-process tests use one physical computer. Checksums reject damaged journal bytes; automatic repair of a corrupted journal is not implemented.
4. Broaden native source schemas and safe collaboration under their existing per-operation gates. Direct compiled-map structural growth remains unfinished; loose-tag compilation does not complete it.
5. Keep Zombie Apocalypse's original missing cues and AI/encounter restoration, non-MCC live hooks, arbitrary live spawning/BSP replacement, game-peer replication and full render/audio parity open.

Local source consolidation and packaged artifacts are separate from remote publication. No GitHub rule change, master push, force push or remote merge is part of this checkpoint. The user publishes the verified local master and repository About text.
