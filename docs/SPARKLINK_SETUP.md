# Share a QuickForge map with SparkLink

Use the same C39 development build on each Windows PC. Each creator needs their own owned Halo source/assets and any tools used locally. Spark does not send installed game files, tool executables or arbitrary local folders to guests.

1. Open or create a QuickForge map in **Level editor**. Click **Live Studio · Solo** in the compact header.
2. Enter your display name. Choose **Private LAN / VPN · TLS**. For another PC, enter this host PC's private LAN/VPN IPv4 address; `127.0.0.1` connects applications on this PC only. Host the editing session.
3. Copy an Editor or Viewer invitation and send it privately. The invitation includes the endpoint, session credential and host certificate. Do not post it in public server listings.
4. A collaborator opens a QuickForge project with the same runtime target, enters their name and pastes the complete invitation into **Private Spark invite**. **Join private invite** preserves a snapshot of their local project before showing shared source.
5. Edit different brushes, placements, spawns or material properties. The drawer lists creators, accepted revisions and shared activity. Everyone keeps their camera. The owner can change a participant to Viewer or revoke access.
6. Save and wait for the source to converge before the owner builds. The build uses that acknowledged revision; later edits can continue. Inspect the result and perform a separate Halo load/gameplay test.

Start with a small source-only arena. To share a Warthog placement, each participant first imports their own matching map. Its exact source hash and native tag identify the model; Spark maps these to each person's local library. A matching filename alone is insufficient.

For the bounded native-content workflow, each creator first verifies the retained native source, the owned preview map and the same scenery template/dependencies in **Native tags & published assets**. Host or join only after that local verification. One creator can share the supported pistol bounding radius; another validates and publishes a matching complete `.scenery` file; another places the publication. These are author-specific transactions, and the owner builds the common acknowledged revision. The workflow currently accepts only the admitted template, not arbitrary new models, sounds or animations. [Acceptance scope and source recovery](C39_NATIVE_CONTENT_ACCEPTANCE.md).

## When edits conflict

Two changes to the same property, or deleting something another creator changed, pause synchronization. The local draft remains. Review local/shared differences, export the draft if needed, then deliberately choose **Use shared version and resume** or retry a retained operation. **Undo my shared edit** and **Redo my shared edit** create per-author inverse transactions. They do not erase another creator's independent work.

The drawer can export or restore a retained unacknowledged draft. **Clear retained edit** is an explicit local action. An edit from an earlier session cannot be silently replaced by the next session's pending proposal. Normal per-map save and snapshots still matter for unshared fields such as custom imports and tag edits.

## Recovery and connection troubleshooting

- If the host process closes or crashes, its acknowledged source remains in its private journal. Reopen the map, expand **Recover an acknowledged host session**, recover it and copy a fresh invitation. Friends leave the old connection and rejoin. Old invitations intentionally stop working.
- If a participant's lease expires, rejoin before editing. A role change can leave a local draft awaiting review; it does not grant write permission.
- All PCs need the same protocol version. A TLS/certificate error requires the current complete invitation; do not switch to legacy mode to bypass it. Do not share private library folders or credential databases.
- Use the actual host LAN/VPN address. Public, wildcard and non-IPv4 endpoints are refused. Spark does not open router ports or alter the firewall. If Windows requests network access, grant only the private network needed for your session.
- Names are chosen display labels, not verified identities. An Editor invitation grants editing access. Revoke a leaked participant and copy fresh invitations; possession of the old invitation alone will no longer admit new guests.
- If recovery reports a corrupt/mismatched journal, retain the entire session folder and project snapshots for diagnosis. Spark refuses the active checkpoint rather than discarding acknowledged history. Do not manually replace the head file with an older checkpoint and call it recovered.
- Ordinary tool switching keeps each open QuickForge project's synchronization controller mounted. The native-content test changes a shared field and player-start name while another participant is in the Tag editor, then verifies the rendered map on return. Conflicting unacknowledged drafts still require deliberate review.

## First acceptance test

On two Windows PCs on a private LAN/VPN, create a small QuickForge arena, host and join using the complete TLS invitation. Have one creator move a box while the other moves a player start. Both should see both changes with their cameras unchanged. Undo only the box change. Save, build on the owner and inspect that frozen revision. Report the Spark version, PCs/network, visible result and any conflict; this two-machine test remains distinct from the automated three-process test on one PC.
