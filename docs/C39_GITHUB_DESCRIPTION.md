# Push summary

**C38–C39: source-aware native tools and durable SparkLink editing**

Continue the verified workbench with recoverable Baboon/Invader source revisions and a real shared QuickForge slice. SparkLink reuses the existing session service, adds private TLS invitations, creator roles, durable acknowledged history, per-author undo and explicit crash recovery. The owner builds a frozen source revision while collaborators keep editing. Cameras and owned library identities remain local.

## Pull request description

### Problem and behavior

Native tools need source-aware validation and recovery, and the prior editor sharing service was limited to an in-memory session. This branch preserves C35–C38 work, keeps native files in their existing formats and makes bounded QuickForge collaboration recoverable.

- C38 adds one source-aware tool catalog, native dependency checks, isolated radius/lens-flare candidates, validated complete-file source forks and tag-specific recovery. Existing Baboon handoffs, watchers, compiler guards and research remain available.
- C39 adds invitation-pinned TLS 1.3, independent participant credentials, Owner/Editor/Viewer roles, explicit conflicts, replay IDs, per-author inverse undo/redo and short brush-structure ownership leases.
- The existing drawer now hosts/joins sessions, lists creators/activity, reviews retained drafts and recovers acknowledged host sessions. The compact header reports Solo/Hosting/Connected/Paused. Local cameras and tool views remain independent.
- Native model references resolve against each creator's own exact source hash/tag identity. An owner-only build binds a converged revision to its frozen QuickForge project, then permits later editing. Opening that result verifies the snapshot rather than declaring the newer draft built.
- Native tests caught and fixed the hidden brush Inspector, local-versus-portable provenance, late acknowledgement, frozen workspace path and pre-recovery snapshot reason issues. Existing shell-contact and stale-output-namespace refusals remain enforced.

### Validation and evidence

The exact final results and executable identity are in [C39 verification](fixtures/c39-verification.json), [native acceptance](fixtures/c39-sparklink-native.json) and [the engineering report](CONTINUATION_39_ENGINEERING.md). The opt-in native runner uses three real Windows processes, separate private data roots, real TLS sockets, real owned models and H1A Tool. Its acceptance covers UI/keyboard edits, conflicts, permissions, retained drafts, a frozen compiled revision, process-crash recovery/rejoin and unchanged source. No native IPC or compiler result is mocked.

Rust workspace, frontend, browser, offline and TypeScript results are reported separately. Earlier failed attempts remain retained evidence. C38's source/native operations and historical genuine Baboon save retain their own receipts; a C39 source-session test does not replace those tests or claim a new Baboon GUI edit.

### Explicit scope

This is a shared QuickForge vertical slice. Shared native semantic tags, resumable custom binary-asset transfer, remote work-area indicators, a global controller outside QuickForge, collaborative live Halo delivery and game-peer replication remain open. The automated native participants run on one physical PC over loopback TLS; real LAN/VPN PCs, Steam transport, eight-user capacity and Halo gameplay require separate acceptance. No full tag/import/placement flagship, arbitrary spawning/BSP replacement or cross-runtime game networking is claimed.

### Documentation and delivery

README, the in-app feature guide, architecture/ADR, setup/troubleshooting, project files, compatibility, security, limitations, community/dependency notices and the 358-record cumulative ledger are updated. Windows executable/installer and tracked-source archive hashes belong to the local C39 artifact manifest. These are unsigned development artifacts; they are not a published GitHub release.

## Founder-controlled push

Starting engineering commit: `45596d5072b1c115c71132b78e7798c3baa547d0`. The branch includes its C38 ancestor; master remains the previously verified `8c0bed0fcce3fbff7108b53dcee6ef077f253387`. Use the ending commit in the artifact manifest/current Git log when opening the PR.

```powershell
git push -u origin codex/c39-sparklink-live-studio
```

Open a PR against `master` using the title and description above. No force push, automatic merge, branch deletion, credential request or public artifact upload was performed.
