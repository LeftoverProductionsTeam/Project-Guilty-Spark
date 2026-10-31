# Reviewed Custom Edition source recovery

This continues the committed Workshop/C38–C39 work. It does not replace source transactions, external-tool reconciliation, native compiler checks or the unfinished direct compiled-map editor.

## Keep your place in the workflow

The header now has one **Back / Forward** pair where the undo/redo buttons previously appeared. It tracks map switches, workspaces and Settings sections, with destination names in the tooltips. **Alt+Left / Alt+Right** and mouse side buttons use the same navigation. A typed field is blurred/committed before keyboard navigation; retained documents keep their independent edits and undo stacks.

**Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z** continue to undo/redo edits. The corresponding buttons are in the **Changes** drawer. Per-map selections, searches, drawer layouts and viewport positions continue through the existing map-session state.

Each window retains up to 200 visited locations during its current session. Back/Forward skips map views whose tabs have been closed, and choosing a new destination after Back clears the forward branch. Navigation history is separate from edit history, project snapshots and native shared revisions; it is not a crash-recovery mechanism.

## What this fixes

The owned CE 1.10 extraction challenge exposed three dependencies that Invader rejects. The Warthog gunner variant has undefined enum values; a Scorpion flare refers to image 2 in a one-image bitmap; three secondary-fire effect attachments refer to an absent location. The original negative builds and source hashes are retained.

Spark now offers an **optional, explicitly reviewed corrected source copy** for these exact inputs. It changes seven fields in three tags. It is **not lossless** and does not recover the author's intent for undefined values.

| Tag | Explicit correction | Semantic limit |
| --- | --- | --- |
| `vehicles/warthog/warthog gunner.actor_variant` | `grenade_type`, `trajectory_type`, `grenade_stimulus` → `human_fragmentation`, `toss`, `never` | Replaces three undefined values with native defaults. |
| `vehicles/scorpion/headlights scorpion.lens_flare` | `reflections[0].bitmap_index`: 2 → 0 | Uses the sole image in the exact reviewed headlight bitmap. |
| `vehicles/scorpion/secondary fire bullet.effect` | Three invalid location references: 1 → native null sentinel 65535 | Clears undefined attachment references. |

The repair uses pinned Invader 0.55.0.r4134.33518109 executables, fixed native recipes and native full-field reads. Spark does not implement another binary tag writer or send binary patches to collaborators. The [Invader project](https://github.com/SnowyMouse/invader/blob/master/README.md) also documents that original/extracted tags may have invalid enums or indices. This observation does not establish corruption in the playable original caches or a general defect in every tool save.

## Use it

1. Open **Project setup → Map tools & tags → Engine build targets**.
2. Add/select a **Halo Custom Edition** target. Select its extracted editable CE tags and the reviewed Invader folder. Set the matching authoring kit independently.
3. Expand **Stock CE source recovery · optional** and choose **Review known CE corrections**. Spark saves the project, verifies the whole source inventory and checks the exact three original tag hashes plus the referenced bitmap.
4. Read the three corrections, then choose **Create separate corrected CE tagset**. Originals, a fresh full tagset and a detailed receipt remain in Spark's managed library. Nothing is automatically selected.
5. Choose **Use corrected source for this CE target**. Spark checks the project, preserved originals and corrected files again. This changes this target's tag-folder configuration through normal project history.
6. Independently review the CE compatibility checkbox, save, then run **Build & check playtest**. A valid cache still needs a real CE load and player test.

Unknown/modified inputs are refused. This is a bounded recovery profile for the reviewed extraction, not a universal repair for protected maps or arbitrary custom tags. Other invalid dependencies can still block a build. An already corrected tree should be used directly rather than repaired again.

## Preservation and permissions

- A review belongs to one desktop window, project, selected CE target and project fingerprint; it expires after three minutes. Creation requires explicit confirmation. Changed source inventories invalidate it.
- A fresh directory receives the full source fork. The three originals are additionally retained byte-for-byte beside the corrected tags. Each output must have the exact expected hash; every other input must remain unchanged.
- A changed candidate or original is rejected again before selection. Incomplete candidates stay available for diagnosis and never become accepted source automatically.
- Only the configured, hash-pinned local Invader edit/repair tools run, with fixed recipes, bounded output and timeouts. No executable path, field name, argument list or output directory comes from a session peer.
- This operation refuses an active shared editing session. Source recovery is separate from SparkLink's authoritative native transactions and in-game multiplayer replication.
- Recovery does not change stock game maps, SDK masters, other targets or previous validated builds. Its receipt records `lossless: false`, `compilationVerified: false` and `gameplayVerified: false`; a later build has its own evidence.

Recovery jobs are window-local. Progress/results are remembered per map and target across workspace remounts or a WebView reload. Up to eight job results are retained; creating another job keeps earlier ready results until that bound is reached. Their folders and receipts remain on disk after app restart; interrupted UI polling is not durable shared editing state. Target fields adapt to the actual drawer width instead of the full desktop width.

## Long Windows native source paths

A fresh three-process run exposed another handoff failure: the exact valid published scenery tag could not be opened by the pinned reader when its ordinary Windows filename reached 260 characters. The same unchanged bytes passed when the tag root used Windows' extended-length path representation. That is an I/O path failure, not evidence of damaged tag semantics or an invalid external write.

The shared native reader now validates the relative tag path and canonicalizes its root before launching Invader, retaining the Windows extended-length prefix. Source hashes, full native-field checks, timeouts and output bounds remain in force. Traversal/option paths are refused before launch. The failed run and direct ordinary/extended-path comparison are retained alongside the longer-path three-process verification; this does not disable a compiler check or substitute another tag.

## Native acceptance and remaining work

The [machine-readable record](fixtures/ce-source-recovery-native.json) describes the tested release and acceptance boundaries. The opt-in test uses a real Spark/WebView process, fresh library and an isolated copy of the owner's extracted tags. It exercises actual review/create/select controls, rejected unconfirmed/stale requests, modified-candidate refusal, exact original preservation, native CE compilation and independent reopening of the resulting version-609 cache. It does not substitute mocked IPC or fixture mesh state for the compiler.

```text
node scripts/test-ce-source-recovery-native.mjs <Spark.exe> <fresh-root> <H1A-kit> <original-extracted-CE-tags> <Invader-folder>
```

The tested authoring route uses H1A structure generation against explicitly reviewed CE source, followed by Invader `gbx-custom` cache compilation and native format/CRC validation. This does not certify every mixed-generation source field, full shader/audio parity, gameplay, original-map conversion, campaign duplication or arbitrary source recovery. Game loading/traversal and broader CE fixtures remain open in the [master backlog](UNIVERSAL_WORKBENCH_BACKLOG.md).

## Imported-object placement follow-through

End-key snapping in Workshop's object view now reads the pinned closed OBJ source anew for each action and considers other visible imported objects. It uses transformed source triangles, not invented box collision. Selected fields reset when changing objects. Downward-facing ceiling triangles cannot lift an object onto the roof; shallow floor penetration can still be corrected.

The native acceptance imports two original eight-triangle wedges, snaps one to the floor and the other onto it, tests Undo/Redo, rejects a corrupted supporting OBJ after a previous successful snap, restores the exact original bytes, then compiles/readbacks both placements. Reopen retains geometry, materials and placements. Existing limits apply: closed source, 4096 triangles/model, positive bounded transforms and at most 24 overlapping supports per snap. Nine footprint samples per selected object approximate support; this is editor placement, not a continuous rigid-body simulation. Animated/deforming collision and arbitrary shared OBJ publication remain open.
