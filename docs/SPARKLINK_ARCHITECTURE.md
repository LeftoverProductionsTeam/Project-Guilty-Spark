# SparkLink: authoritative shared QuickForge source

C39 extends the existing `forge_session` service, LAN/VPN transport, QuickForge document, per-map UI state and native compiler. Protocol 4 adds an optional immutable native-source admission, one supported semantic field and complete admitted scenery publications. The [native-content acceptance](C39_NATIVE_CONTENT_ACCEPTANCE.md) proves those operations, process recovery and compilation. General native tag schemas, arbitrary custom assets, remote camera indicators and collaborative runtime delivery remain later phases.

## Evidence levels

| Level | Meaning | C39 implementation |
| --- | --- | --- |
| A — shared editor | Independent Spark applications edit one acknowledged source revision. | QuickForge source plus one admitted pistol field and complete validated scenery publications/placements. |
| B — Halo preview | A supported adapter actually applies an operation to the connected engine. | Existing exact-build adapters remain separate. No new collaborative game acceptance. |
| C — game peers | Other actual game clients observe the authoritative game change. | Unimplemented by this source protocol; Level A does not imply it. |

## Design decision and precedents

[Unreal Multi-User](https://dev.epicgames.com/documentation/en-us/unreal-engine/multi-user-editing-overview-for-unreal-engine) provides a useful precedent for a session authority, authored transactions, local views and per-user undo. [Blender Multi-User](https://multi-user.readthedocs.io/en/latest/about/index.html) demonstrates collaborative scene editing, while its project documents ongoing development. These are design research, not embedded integrations.

[Automerge](https://github.com/automerge/automerge) and [Yjs](https://docs.yjs.dev/) support convergent structured data. C39 does not adopt a CRDT for Halo binary tags or BSP indices. The existing Rust three-way merge already understands QuickForge entity identities and native validation boundaries. Keeping that authority avoids a second document model and allows explicit refusal of topology and same-property conflicts. A future text/script CRDT can be evaluated separately.

The host serializes proposals under its room lock. A proposal contains a unique operation UUID, participant identity, retained base revision and bounded portable QuickForge document. The host reconstructs expected values from its retained revision, merges independent fields, validates the result and persists it before acknowledging. Each transaction records its author, before/after source, base and authoritative revisions, inverse relationship and acceptance time. Time is presentation metadata; revisions determine order.

## Conflicts, permissions and history

- Independent entities/properties and XYZ transform/color channels merge. Competing changes to the same channel, edit-versus-delete, changed operation payloads and expired bases are refused with the local draft retained.
- Generated brush structure gets a three-second, brush-scoped ownership lease after acceptance. Other brushes and ordinary transforms remain editable. Native BSP polygons, arbitrary binary bytes and custom assets are outside this merge.
- Owner, Editor and Viewer are distinct. Only the owner manages roles/revocations and starts an authoritative session build. Viewers retain camera and selection access; the server refuses their source mutations.
- Undo/redo creates another validated transaction from that author's previous delta. Unrelated changes from other creators survive; a conflicting inverse is refused. Local, unshared project edits retain their existing local undo history.
- There are eight configured online slots, including the owner; the actual accepted participant count is reported separately. A session retains 100 full transactions and at most 4096 acknowledgement identities. Older bases cannot be guessed or force-merged. Bounds stop further work with retained source; they do not silently delete it.

## Durability and recovery

Each hosted session owns a private folder below the Spark data root. Two alternating bounded checkpoint files contain the source, member metadata, acknowledged operation IDs and author history. An atomic head selector binds an exact SHA-256, session and revision. An exclusive OS file lock prevents two hosts from recovering the same journal. Acknowledgement follows checkpoint/head persistence. Invalid active checkpoints are refused rather than silently rolling back acknowledged edits.

The guest saves an unacknowledged proposal and stable operation ID in its local library before sending it. Replaying an identical acknowledged operation does not increment the revision. A late acknowledgement cannot clear a different pending operation. A retained edit from another session must be exported/restored and explicitly cleared before replacement. UI reload and network failure do not count as acceptance.

Keyboard inverse requests wait in a bounded ordered client queue behind polls and preceding actions. That transient keystroke queue is not an acknowledged journal. An uncertain inverse response pauses synchronization for review; inverse requests are not automatically retried. Persistent client receipts for unacknowledged inverses remain later work; this slice persists full-source proposals and the host's accepted author history.

After host process loss, **Recover an acknowledged host session** reopens the owned journal. Source, session identity, member credentials and undo history remain. A new TLS certificate and invitation are generated; creators explicitly rejoin. There is no automatic host election, offline multi-master merge or transparent migration. Invitations are not durable credentials.

## Local views and native builds

Camera pose, selection, drawer layout and recording controls stay in the existing per-map local view state. A peer never takes over another user's camera. Presence currently lists chosen names, role and online status; remote frusta, selections, cursors and area-of-interest indicators remain pending.

The owner saves a converged source and builds one immutable project clone. A separate `studio-binding.json` binds its project fingerprint, portable document hash, session UUID and authoritative revision to the owned build job. Other editors can continue creating later source revisions while Tool runs. Opening that older result verifies the frozen project; it does not declare the current draft built or relax deployment readiness.

Native asset references carry the owned source hash, tag ID, native class and path. Each editor resolves that hash against their own imported library. Local library IDs and local source paths do not travel. Reference sharing remains separate from the explicit admitted scenery publication, which carries complete hash-verified bytes. Each participant must independently verify matching dependencies. General tag edits, imported meshes, sounds, scripts, BSP assemblies and other project fields are not silently included.

## Modules and protocol

`forge_session.rs` retains portable-source mapping and merge behavior. `studio_session.rs` provides typed version-4 messages, membership, leases and sockets. `studio_journal.rs` provides validated transactions, inverse operations and storage. `studio_native.rs` validates immutable admission, semantic fields and bounded complete publications. `studio_native_source.rs` performs explicit local validation/recovery and frozen native materialization using the C38 pipeline. `studio_tls.rs` uses rustls/rcgen for invitation-pinned TLS. `shared_editing.rs` owns the native window/project boundary, local pending drafts, recovery and build bindings. `ForgeCollaboration` remains mounted per open source project and presents its existing drawer.

Version-2 invitations require matching older applications; there is no automatic encrypted-to-cleartext fallback. The optional Spacewar bridge stays separate. Its existing SDK transport does not become a new tested multi-machine capability merely because the LAN service changed. See [setup](SPARKLINK_SETUP.md), [security](SPARKLINK_SECURITY.md), [project files](PROJECT_FILES.md) and [C39 evidence](CONTINUATION_39_ENGINEERING.md).
