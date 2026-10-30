# C39 — SparkLink: Live Studio

**Current extension:** [Native tag / asset / placement acceptance](C39_NATIVE_CONTENT_ACCEPTANCE.md) adds the bounded three-author native workflow and global workspace synchronization on the committed C38–C40 foundation. Its separate receipt supersedes the open status for those specific operations below. The original first-slice evidence and its limitations are retained here as historical context; direct compiled-map editing and game-peer replication remain open.

Starting commit: `45596d5072b1c115c71132b78e7798c3baa547d0` (verified C38), branch `codex/c39-sparklink-live-studio`. C38 remains an ancestor; verified master `8c0bed0fcce3fbff7108b53dcee6ef077f253387`, the isolated consolidation worktree, experimental research and dependency proposals remain intact. The ending source commit is recorded in the C39 artifact manifest and Git handoff. This continuation does not silently merge or push.

## Delivered scope

SparkLink extends the existing QuickForge LAN/VPN session service. Its first vertical slice shares geometry, transforms, materials, native asset references, spawns, objectives and environment intent between independent applications. It adds invitation-pinned TLS, Owner/Editor/Viewer permissions, durable acknowledged source, replay identities, per-author inverse undo/redo, scoped generated-structure leases, retained unacknowledged drafts and explicit host recovery. The owner builds one frozen acknowledged QuickForge revision while later editing continues.

**Level A shared editor source is distinct from Level B changes inside Halo and Level C visibility to actual game peers.** Native semantic tag sharing, custom binary imports, scripts, assembled BSP projects, remote work-area indicators and collaborative runtime delivery remain open. Solo native editing, Baboon/Invader workflows, Director, rendering/audio, live adapters and earlier networking research are preserved. This is not the completed tag/import/placement flagship or universal real-time co-op.

## Architecture and user flow

The existing Rust merge retains entity identity and expected base values. A proposal has a stable UUID, authenticated author and base revision. The authority merges independent properties/channels, validates the resulting source, persists its checkpoint/head and then acknowledges. Same-property, edit/delete, stale-base and changed-payload replay conflicts retain the local draft. Undo/redo adds a new author-owned inverse transaction and preserves unrelated work.

Two bounded checkpoint slots and an atomic SHA-256 head selector preserve host state. An exclusive OS file lock prevents concurrent recovery of one journal. A guest saves its pending proposal locally before transmission. Old acknowledgements cannot clear a different proposal; a draft from another session requires explicit clearing before replacement. Recovery retains the session/revision/authorship but issues a new TLS certificate and invitation. There is no host election or arbitrary offline merge.

The compact header opens the existing **QuickForge session** drawer. Names, roles, online presence, revision/activity, invitations, conflict review and recovery are there. A failed connection/different local draft shows **Paused**. Camera, selection, drawer layout and recording controls remain local. Ordinary tool switching keeps the native connection, but this first controller synchronizes while QuickForge is mounted; a divergent draft on return requires review.

The source reference boundary deliberately removes another PC's library UUID while preserving the exact owned map hash/native tag identity. Each creator resolves that reference locally. Native compilation still requires valid local provenance. No game files or custom binary assets are transferred by this slice.

The build uses the existing isolated QuickForge workspace. `studio-binding.json` binds its project fingerprint, portable source hash, session and authoritative revision. The existing `workspace/project.gsproject` is the frozen input. Opening that older validated result checks the snapshot without marking the newer draft built or relaxing current deployment readiness.

See [architecture and evaluated precedents](SPARKLINK_ARCHITECTURE.md), [setup/troubleshooting](SPARKLINK_SETUP.md), [project files](PROJECT_FILES.md) and [security model](SPARKLINK_SECURITY.md).

## Native acceptance procedure

`scripts/test-sparklink-native.mjs` launches three copies of the packaged Windows executable with three explicit isolated owned QA libraries and independent WebView profiles. It drives real native IPC and UI; no socket, native command, model loader or Halo compiler is mocked. The transport is loopback TCP with TLS 1.3 on **one physical PC**, not three computers or a VPN traversal result.

The runner hosts and joins through the actual drawer, merges simultaneous creator changes, renames a brush in the UI, checks Ctrl+Z/Ctrl+Shift+Z per-author undo, resolves an actual owned Warthog in each renderer and moves it through the three rendered editors. It tests independent cameras, duplicate acknowledgement, same-cell/edit-delete conflict refusal, pending-draft UI reload/recovery, Viewer/Owner restrictions, a frozen native build during further source editing, exact compiled player-start readback, abrupt host process death, recovery/rejoin with retained identities, replay after recovery and revocation without harming other creators. Original caches and every owner input tag are re-hashed.

The final native receipt, screenshots, timings and complete regression counts are collected in [native evidence](fixtures/c39-sparklink-native.json) and [verification](fixtures/c39-verification.json). These files identify the actual accepted run and executable. Earlier failed attempts remain private evidence and do not count as passes.

The accepted three-process run compiled **revision 14** while source **revision 15** continued. Opening the frozen cache read back the earlier player-start coordinate; recovery in a new host process retained revision 15, member identities and replay deduplication. Original caches and all **2240** owner input tags remained byte-identical. Native UI screenshots: [owner](screenshots/continuation39/sparklink-owner.png), [creator B](screenshots/continuation39/sparklink-editor-b.png), [creator C](screenshots/continuation39/sparklink-editor-c.png), [1024-pixel drawer](screenshots/continuation39/sparklink-1024.png).

Six actual source changes converged through native IPC and all rendered editors in **681 ms median / 876 ms maximum** on this loopback test. The frozen native build took **19.1 s**, and actual process restart/recovery/rejoin took **7.5 s**. These small-project measurements include the editor's 500 ms synchronization interval and test observation; they are not raw network latency or multi-machine scale estimates. Environment intent and material preview colors remain editor values; native sky/fog/shader writes require their separate native tag workflow.

The final source suites pass **513 Rust tests** (seven opt-in cases excluded), **220 frontend tests / 45 files**, **80 browser tests** in a quiescent full run, **59 offline scripts** and TypeScript. The new browser case deliberately delays both a poll and an inverse response; native acceptance remains a separate actual-process result.

## Problems caught during development

- Selecting a brush changed the Properties tab but did not reveal the Inspector drawer. Selection now opens the appropriate Inspector/tag drawer.
- Generic local provenance validation refused portable references after their local UUID was intentionally removed. Shared-source validation now checks portable references separately; a portable reference still cannot authorize local compilation.
- A late proposal response could lose its real acknowledgement behind a newer cached poll. The client retains the newer source and the original persisted operation acknowledgement.
- Rapid keyboard history could be dropped while a poll or preceding inverse was unfinished. A bounded ordered queue now serializes those requests, cancels them on leave/conflict and pauses on uncertain inverse failure. The browser regression deliberately holds both a poll and the Undo response before releasing them in order.
- Frozen-result opening initially looked for a project at the job root. It now reads the existing QuickForge workspace snapshot; a regression integrates actual source export with this reader and rejects changed input.
- The pre-recovery snapshot reason was missing from the existing allowlist. A shared reason constant and snapshot/restore regression now protect that recovery boundary.
- The modern private-invitation route now refuses LAN invitations lacking a certificate before joining; legacy plaintext requires the explicit Advanced address/key path.
- The native test fixture first touched a solid to the room shell and then reused its already-built source namespace. Existing safety checks correctly refused those inputs. The test retains a negative shell-contact check, separates the cover and builds under a fresh namespace; no geometry or stale-output guard was relaxed.
- Early UI test selectors did not open the retained-draft details before using its controls. Those attempts remain failures; the final runner follows the visible workflow.

## Performance, security and limits

The receipt measures native IPC plus convergence in all three rendered editors, native build time and actual process restart/rejoin time. It uses a small arena, one owned vehicle model and three processes. It does not measure eight-machine capacity, custom asset transfer, internet latency, long sessions or large terrain. Eight configured participant slots are not measured eight-user acceptance. Binary transfer performance is unmeasured because that phase is unimplemented.

TLS uses rustls 0.23.46 / rcgen 0.14.10 and the ring provider. Typed network commands cannot invoke local files, external editors, tool launch or game-memory APIs. Roles, private endpoints, frame/document/history bounds and socket rate/concurrency limits are enforced independently of the UI. Names are self-declared; invitations are bearer secrets; the host and local OS are trusted. Local guest credentials are not stored in an OS vault. Legacy plaintext mode and the optional Spacewar helper remain explicit, separate routes. This is a bounded review/regression result, not a penetration-test certification.

The current stable Cargo toolchain used here is 1.99.1; older toolchains, other native platforms, OS DPI/multiple monitors, real LAN/VPN machines, Steam transport, Halo launch/gameplay, game-peer replication and multi-creator recording remain separate gates. No Halo process or game memory was touched for this acceptance.

## Next implementation and founder acceptance

The next engineering slice is shared native semantic tags through the preserved source/validator transaction boundary, followed by validated dependency-aware custom asset transfer. Add a global per-project synchronization controller and remote work-area indicators before broadening the UI promise. Native binary/topology changes need dedicated leases and compiler/preservation tests, not a generic JSON merge. Then bind supported collaborative operations to the existing exact-build runtime adapters and test actual game peers independently.

First founder test: run matching C39 builds on **two Windows PCs** on a private LAN/VPN, host on the real private interface, join with the complete TLS invitation and move a box/player start independently. Both creators should see both changes while keeping their cameras. Undo only the box change, then save/build on the owner and inspect the frozen result. [Step-by-step card](SPARKLINK_SETUP.md).

All 358 cumulative evidence records remain in the [master ledger](MASTER_FEATURE_LEDGER.md), including ten C39 phase families with explicit unmet gates. [GitHub-ready summary and description](C39_GITHUB_DESCRIPTION.md). Local Windows/source artifacts are development builds, unsigned and unpublished.
