# C39 native-content acceptance

This extension continues the committed C38–C40 foundation at `2a3e779` without restarting the workbench or removing research. The original [C39 source-session report](CONTINUATION_39_ENGINEERING.md) remains historical evidence. This report covers the additional native tag/publication/placement slice. The [machine receipt](fixtures/c39-native-content.json) identifies the exact executable and actual accepted run.

## Proven workflow

Three independent Windows Spark processes run against three separate private library/project directories. The loopback transport is real TCP with invitation-pinned TLS 1.3. Native IPC, asset validation, rendering and the Halo compiler are not mocked.

1. Each participant explicitly verifies a complete retained MCC Halo 1 native source inventory, an owned preview map, one scenery template and its dependency closure. The source admission is immutable during the session.
2. A edits `weapons/pistol/pistol.weapon` bounding radius through the supported semantic control. B concurrently validates and imports a complete local `.scenery` file and publishes it. C places that publication after it becomes available.
3. All three consume the same authoritative revision **3**, including real source models in all three viewports. The receipt records the document SHA-256 and the three distinct transaction authors.
4. A's Undo removes only A's semantic change. B's publication and C's placement remain. Withdrawing a publication that C still references is refused. Redo restores the field transaction.
5. Same-field stale proposals, altered asset bytes, admission changes and duplicate acknowledgements are tested. Viewer mutation/import and non-owner compilation are refused. Revoking C preserves B's acknowledged state.
6. A leaves QuickForge for the Tag editor while C changes a shared field and player-start name. A's global controller consumes the update, and the visible map reflects it on return.
7. All participants save the same committed document. The owner builds frozen revision **14** with the actual H1A Tool while another creator advances to **15**. The native output reopens as MCC cache version 13 and contains radius `0.2750000059604645`, the published scenery model with **31 triangles**, and its scenario placement at `[2, 2, 0.1]`.
8. The actual owner process is forcibly stopped and restarted. Recovery retains revision 15, exact asset bytes, semantic state, author identities/history and replay deduplication. A fresh invitation reconnects the existing participants.

The original owned maps, template/import file and all **2240 input tags in each of the three native source trees** remain unchanged. A separate deliberate truncation of an admitted working copy is refused before import/build. Exact recovery reconstructs a new full source fork and retains the damaged candidate; it does not overwrite the original or guess at damaged semantics.

## Supported boundary

| Area | Current support | Remaining gate |
| --- | --- | --- |
| Shared native field | One admitted pistol bounding-radius operation through the existing Invader/native semantic reader | Other fields/classes, blocks, scripts and general tag serialization |
| Shared native asset | Complete admitted `.scenery` bytes, up to 16 KiB each and eight publications; the tested file is 632 bytes | Arbitrary new models, sounds, animations, general dependency import and resumable large transfers |
| Dependencies | Each participant independently owns and verifies the exact source/dependency inventory | General cross-runtime dependency reconciliation |
| Ordering/history | Authoritative revisions, expected-base conflicts, replay identities, author-specific inverse transactions | Automatic host election and multi-master offline merging |
| Durability | Persist-before-ack checkpoints, process-crash recovery and explicit exact source reconstruction | Power-loss, physical disk failure and hostile-host certification |
| Compiler | Actual MCC Halo 1 H1A Tool build and native semantic/model/placement readback | Game loading, collision traversal and other runtime compiler acceptance |
| Networking | Three processes on one Windows PC over pinned TLS | Multiple PCs, real LAN/VPN traversal, internet/Steam scale and game-peer replication |

Network proposals contain supported semantic values and complete admitted content, never an offset-based binary patch or a remote tool command. Local admission, validation, recovery and compilation are explicit local actions. C38 native transactions, Baboon/Invader reconciliation, integrity checks and regeneration guards are preserved. Independent external source acceptance/compilation is refused while SparkLink owns that map's revision; retained candidates and recovery source stay available.

**Direct compiled-map editing remains OPEN.** These loose-tag transactions and native builds do not complete the unfinished Eschaton/Assembly-style `.map` workflow. Its prototype, stale-source/byte-footprint safeguards, failure evidence and separate acceptance requirements remain in the [master backlog](UNIVERSAL_WORKBENCH_BACKLOG.md).

## Performance and verification

The receipt separates the cold three-author validation/publication/placement path from six subsequent synchronization samples. Samples include native IPC, polling and consumption by all three React editors. They are end-to-end loopback observations on a small project, not raw network latency, sustained throughput or a multi-machine capacity claim. Exact values, native build duration and recovery time are retained in the receipt.

The final accepted build measured **6.55 s** for the cold three-author path, **438 ms median / 590 ms maximum** for the six later convergence samples, **37.6 s** for native compilation/readback and **11.8 s** for process recovery/reconnection. Other runs are retained privately, not substituted for this final build's measurements.

Combined source checks: **524 Rust tests passed**, **7 existing opt-in tests ignored**, **228 frontend tests in 48 files**, **88 browser interaction/IPC-contract tests**, **59 offline scripts**, TypeScript and the Windows release build. Browser/synthetic contract evidence is separate from the real process and compiler acceptance. Failed harness attempts are retained privately and do not count as passes; no ignored game-dependent test is presented as gameplay evidence.

The separate [native editor-controls receipt](fixtures/c39-editor-controls.json) covers real owned-map End snapping and keyboard history, resolution scale and actual WebGL anti-aliasing, camera retention, tutorial windows and map ownership during popout. Drawers also have browser interaction coverage for edge-to-floating movement, resizing, top docking, closing/reopening and unclipped tooltips.

**The additional Zombie Apocalypse rendering challenge FAILED.** Automatic lookup finds installed MCC resources, but its legacy `bitmaps.map` proves only **one** external image range for this Demo cache, with **499 mismatched ranges**. Embedded model textures load, while BSP textures remain incomplete. The CE compatibility resource proves no external ranges. [Exact negative evidence](fixtures/c39-zombie-texture-challenge.json). This does not invalidate the separately accepted native collaboration/control scope, and it is not reported as texture restoration. A compatible runtime-image binding or matching original resources still needs implementation and real rendering acceptance; source/range/hash safeguards remain in force.

## UI and remaining engineering

The SparkLink drawer keeps its common native field visible, moves publication setup into an expandable section and uses compact publication rows. Native conflict reviews show semantic values and asset identities without dumping binary bytes. The common toolbar supplies one general Undo/Redo pair across workspaces; source-session inverse controls remain explicitly author-specific.

The broader UI pass adds Back navigation, map/tutorial popouts, movable/resizable docked drawers, numeric dragging plus explicit input, installed-tool discovery, runtime target profiles, a right-hand transfer drawer and denser Compare/Firefight/Creator/Build/Settings layouts. Runtime profile selection does not implement an unsupported converter.

Still open: native BSP Workshop geometry/topology and actual traversal acceptance; general World Edit multiselection/bulk tags; animated owned library hero and richer custom-asset previews; dynamic paged map discovery and a unified hosting suite; native lighting/fog baking; reflection/glass/power-up shader parity; remaining texture/decal/teleporter and vehicle appearance acceptance; universal conversion; arbitrary live spawning/BSP replacement, gameplay and game-peer replication. These requests and experimental research are retained, not counted as completed by this test.

Work remains on **local master** at the user's request. The separate unfinished C41 checkout is retained. No protected remote master push, force push or repository rule change is attempted. [Review/push handoff](C39_NATIVE_CONTENT_GITHUB_DESCRIPTION.md).
