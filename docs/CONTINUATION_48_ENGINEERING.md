# C48 — Shared BSP editing and recoverable sessions

Continues C47 `04034b8b1e1cb03a789cec2a36878d75e2d7abf1` in the existing isolated local-master worktree. Original files, the dirty root checkout, C35–C39 history, prior releases and failed research remain preserved. No remote publication or repository-rule change is performed.

The [metadata-only acceptance record](fixtures/c48-shared-bsp-stability.json) pins the tested executable, installer, native results, measurements and regression logs. [Push/PR notes](C48_PUSH_SUMMARY.md) describe the same scope.

## Real-time source editing

SparkLink now merges BSP Workshop source by stable brush and portal identities. Different brushes and independent transform axes merge. A brush's role, vertices, faces, material assignments and UVs form one atomic shape; competing changes to that shape or edit/delete conflicts retain the rejected draft for review. Structural leases and existing material/reference validation remain enforced. Entering or leaving the Workshop schema is atomic.

Dragging publishes small, validated, expiring transform previews. Other participants see amber brush outlines in the perspective view and all three orthographic views. Previews expire after 1.8 seconds, do not advance the revision, and do not fill the journal or undo history. Mouse release submits the actual source transaction; peers validate and render that acknowledged geometry. The current synchronization cadence is 500 ms. Cameras stay local.

The new opt-in native runner uses three independent Windows Spark executables, separate project directories, libraries, WebView profiles and actual TLS sockets. It checks the real UI source hashes and brush labels, rather than equating a matching backend cache with a rendered edit. It proves simultaneous GUI edits, another participant's visible drag, committed geometry, per-author undo/redo, conflicts, duplicate replay, viewer/build restrictions and revocation.

Protocol version 5 prevents an older client from silently using the new merge/preview contract. Existing schema-1 durable source journals remain recoverable; a recovered host issues a new invitation. No raw Halo binary patch, remote application launch or tool execution is added to the protocol.

## Recovery and history repairs

An uncertain acknowledgment retains its original operation ID, baseline revision and document. Native storage refuses replacement or rebinding until that operation is acknowledged or the user explicitly clears it. Newer local changes remain a separate draft and rebase only after the original acknowledgment is resolved. Rejoining the same session keeps the displayed local draft; choosing the shared version parks the retained proposal for explicit review.

The native acceptance stops the owner process, makes two genuine UI edits in another process while the owner is down, and saves the newer draft. Recovery keeps the session and author identities, uses a fresh certificate/invitation, and commits the two edits exactly once. Replaying the original operation does not create another revision or revert the newer edit. A separate 11.5-second JavaScript pause verifies reauthentication after participant presence expires; that pause is not a simulated network outage.

JSON object-key ordering is no longer treated as a content edit. The earlier mismatch between frontend and native portal-property order could copy an incomplete portal/material combination into an older undo snapshot and block history persistence. Semantic comparison and complete-schema checks fix that case without ignoring actual values or array order.

Automatic owned-runtime material resolution now updates complete current/past/future snapshots as resource setup. It adds no authored undo step and does not clear redo. Authored shaders, special portal/sky materials and unrelated edits remain intact. Native Workshop acceptance includes real runtime material resolution, transform undo/redo, four views, drawing, clipping, invalid-source refusal and reopen. Separate focused tests control arrival before and after undo.

If a malformed local history draft needs retaining, bounded quarantine records it with semantic errors and `accepted: false`. It cannot replace the acknowledged head or become valid source merely because it was saved for recovery. Source identity, snapshot count and byte bounds remain checked.

## Endurance, limits and measurements

A core endurance test performs 1,100 actual Workshop source transactions with two authors, UV changes, checkpoint writes, bounded undo, reopen and old-operation deduplication. The desktop acceptance separately exercises 240 acknowledged revisions in three real processes and samples retained JavaScript heap and DOM counts before, midway and after the run. Exact values and early/late 12-sample latency sets are in the acceptance record.

These timings include native IPC, validation, React/native CSG consumption and test polling. They are not network round-trip times or a before/after speedup claim. All measured participants use one computer. Heap readings cover the WebViews after forced collection, not Rust working sets, GPU memory or a multi-day leak test. A small retained-heap increase is reported, not described as zero leakage. DOM counts and document counts are retained alongside the values.

The final executable completes 240 commits in **78.294 seconds**. The first and last 12 measured UI-convergence samples have medians of **975.047 ms** and **966.916 ms**, including a 600 ms acceptance polling interval. The native journal is 1,140,153 bytes at revision 247 with 100 history entries. Compilation runs after this measurement, not concurrently with it.

| Participant | Retained JS heap before | Retained JS heap after | DOM nodes before / mid / after |
| --- | ---: | ---: | --- |
| Owner | 84,313,384 bytes | 86,071,368 bytes | 9,341 / 9,388 / 9,388 |
| Editor B | 86,000,144 bytes | 87,491,932 bytes | 9,491 / 9,538 / 9,538 |
| Editor C | 82,163,032 bytes | 83,674,708 bytes | 9,418 / 9,465 / 9,465 |

Each retains two documents throughout. Heap growth is 1.42–1.68 MiB; further long-duration testing is required before claiming a stable long-term memory plateau.

Existing safety bounds stay explicit: 100 undo transactions, 4,096 acknowledged operation identities, a 24 MiB journal limit, a 24-hour running-session lifetime and 32 retained host sessions per project. The UI shows the acknowledgment budget and warns before exhaustion. Accepted identities are not silently evicted to make duplicate replay unsafe. Save the converged source and host a fresh session before reaching a bound. Automatic rollover and a multi-hour/cross-computer soak remain open.

## Native build and existing tool integration

The owner builds an acknowledged shared revision through the actual H1A Tool/Invader path while another participant continues editing. The build retains its frozen revision and source hash. Reopening the separate MCC cache verifies its native cache family, BSP/collision geometry, both authored portals and tag inventory. No game is launched by this acceptance.

The final BSP cache is version 13, **88,880,670 bytes**, SHA-256 `f94cbbbbf0643fb5accb2211f5930273e547891e48c1617ec285b706d8ca4b1e`, with 58 collision triangles, two authored portals and 2,239 indexed tags. It binds revision 247; revision 248 remains separate. The native tag/asset regression independently compiles revision 18 with pistol radius 0.5 and its 31-triangle published model placed at `[3, 2, 0.1]`; revision 19 continues separately.

The compile fixture explicitly assigns the owned tutorial metal shader to all of its ordinary material definitions. Its deliberately minimal native tag set does not contain the runtime grass shader. This all-metal fixture does not claim that every discovered runtime preview shader exists in a selected loose-tag compiler set; missing dependencies remain a real refusal. Earlier failed compiles are retained rather than counted as successful builds.

The separate three-process native-content regression repeats a supported pistol-field edit, validated scenery publication, placement, convergence and native compilation. It also repeats Invader external-save reconciliation and the exact preserved human-edited Baboon file. Replaying that file is not a new Baboon GUI interaction. Controlled corrupt saves are written by the QA process; they are not attributed to Baboon or Invader. Source snapshots and previous-good outputs remain protected.

## LAN, VPN and Steam boundaries

The network picker lists local IPv4 interfaces. Private LAN uses invitation-pinned TLS. Radmin's public-looking 26/8 range is admitted only under an explicit Radmin scope, with TLS and an actual active preferred address on the identified Radmin adapter. Public/wildcard listeners, broad global 26/8 allowlisting, driver installation and firewall changes are not introduced. Both LAN and the real Radmin interface pass three-process convergence on this computer; delivery across a remote VPN tunnel is not established.

The optional Steam module still carries framed Spark RPCs through its established Steam SDK transport. An attempted TLS-over-framed-bridge approach was incompatible with that bridge and is retained as an unaccepted private patch. It is not shipped as a working connection. Steam host recovery is explicitly gated rather than treating its loopback endpoint as a direct TLS session.

The initial probe correctly refused while Steam was closed. After the owner launched Steam, SDK initialization passed. Its local SDK socket-pair test transfers **4,194,304 bytes in 69 packets**, validates the complete payload hash and reports 6.192 ms. This is a local SDK test, not an internet benchmark. Two real Spark processes also verify module selection/pinning, the desktop Steam test button, actual Steam host creation, a protocol-5 framed invitation, refused same-account joining, source-preserving recovery refusal and owned bridge cleanup. The desktop join error remains generic; the panel separately explains the second-account requirement. More precise join failure reporting remains open. No second account, remote relay, cross-PC Steam session or Steam recovery acceptance is claimed.

## Preservation and remaining gates

The final checks retain the original Zombie Apocalypse files, installed map hashes, dirty root patches and untracked files, all earlier branch tips, source paths, complete C46 native sound builds and prior release hashes. All previous 421 ledger records remain byte-identical; C48 records append to them. Failed native/compiler/UI attempts and the bridge experiment remain available locally.

Editor synchronization is independent from in-game multiplayer and AI replication. Arbitrary live BSP replacement, full Zombie conversion/lifecycle acceptance, the known OpenCE damage/physics crash, Chupathingy native faults, target-runtime audio listening, two missing original sound cues, complete audiovisual parity and Timberland–Sidewinder physical traversal retain their own gates. Native loose-source or scalar-field tests do not complete the unfinished direct compiled-map structural writer.

C48 supplies new Windows executable, NSIS installer, portable and committed-source archives. Packaging verifies checksums and exact committed source blobs; no owned Halo data, compiler, SDK, PDB or private library is distributed. The installer is built, not certified on a clean machine. Local master is committed for the user's publication workflow; remote CI, push and merge are not claimed.

Final checks pass **629 Rust tests (seven opt-in ignored), 300 frontend tests, 136 browser cases, 59 offline scripts and 32 native diagnostics/interface tests**. TypeScript and Windows packaging build. Earlier failed attempts remain retained: portal key ordering, pending-draft replacement, late-default history, a missing loose grass dependency, an incorrect template-folder selection and outdated native harness selectors. Corrections preserve the actual native/compiler refusals rather than weakening them. The browser fixture now models the supported pending lookup explicitly. The ledger generator retains audited post-C46 continuation records; its isolated regeneration test protects all prior rows.
