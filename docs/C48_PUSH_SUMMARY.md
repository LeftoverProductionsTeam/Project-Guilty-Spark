# C48 — Share BSP edits and retain work across session failure

Suggested title: **C48: synchronize BSP Workshop edits and recover pending source safely**

SparkLink now shares stable brush/portal source transactions and expiring drag previews across the Workshop's four views. Independent brushes and transform axes merge; competing topology/material or edit/delete changes retain the rejected draft. Per-participant undo, roles, ordered acknowledgments, native validation and frozen builds remain enforced.

Recovery preserves the original pending operation and newer local edits. Native storage rejects operation replacement; rejoining no longer overwrites the local draft. Semantic JSON comparison prevents property-order-only portal changes from corrupting undo snapshots. Owned runtime texture setup no longer consumes undo or clears redo, and malformed local drafts remain bounded, explicitly unaccepted recovery evidence.

The native acceptance uses three independent Spark processes with separate project directories and real TLS sockets. It covers visible BSP edits/dragging, participant undo, 240 revisions, actual owner-process failure with two offline UI edits, exact-once recovery, permissions/revocation, real LAN/Radmin interfaces and an actual frozen H1A build. A 1,100-edit core test and the existing native tag/asset/external-tool workflow provide separate regression coverage. Exact identities, measurements and test totals are in [the acceptance record](fixtures/c48-shared-bsp-stability.json).

Network selection now distinguishes private LAN from the actual Radmin adapter. The optional Steam SDK module remains framed transport; incompatible TLS bridging and unverified Steam recovery are explicitly gated. Same-computer interface tests do not prove cross-computer, remote VPN delivery, Steam relay or game/AI replication.

After Steam was launched, its SDK probe, 4 MiB / 69-packet local socket-pair test and actual Spark desktop hosting passed. Same-account joining and unverified recovery remain refused. The desktop join diagnostic is generic; remote relay still requires a second account and computer.

All C35–C39 ancestry, prior ledger records, original assets, dirty root work, earlier releases and failed experiments remain preserved. New executable, installer, portable and source packages are verified locally. No direct push, protected-master bypass, remote publication or clean-machine installer acceptance is implied. Native game listening, full Zombie lifecycle, direct compiled-map structure and live BSP replacement remain open.

Validation and performance details: [C48 engineering record](CONTINUATION_48_ENGINEERING.md). GitHub About remains separate metadata; use the prepared [repository description](REPOSITORY_ABOUT.md) when publishing.
