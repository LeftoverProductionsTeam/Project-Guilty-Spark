# C34 external map save monitoring

External editors can save the map in `source.original_path` while its Spark
tab remains open. The monitor checks metadata every two seconds, waits two
seconds for a stable save, and only hashes/inspects changed file stamps. The
first stable observation hashes once to catch a save made before watching
started. Unchanged later polls and **Scan now** bypass cache decoding. This
is map-cache monitoring; loose SDK tag edits still require a map build.

Implementation:

- `crates/spark-core/src/external_changes.rs`: bounded stable-save detector,
  structural inspection, partial-write retries, exact-candidate revalidation
  and immutable snapshot creation.
- `src-tauri/src/external_changes_native.rs`: window-owned watch IDs, async
  native commands, bounded watch state and revision imports through the
  existing library. No legacy executable is run.
- `src/externalMapSync.ts` and `src/components/ExternalMapSync.tsx`: one poll
  batch in flight, per-open-map handling, dirty/saved-authoring guards, stale
  async-result guards, compact status and explicit conflict workflow.

Native commands are `external_map_watch_start`, `external_map_watch_poll`,
`external_map_watch_stop`, and `external_map_change_import`. Poll optionally
accepts `forceMetadata`; this still respects save stability and unchanged
content checks. The app calls `release_window` from a blocking worker after
the native window is destroyed, covering a WebView that cannot run JS cleanup.

The monitor handles at most 32 open map sources and caches only stamps,
hashes and candidate metadata. The existing reader's 768 MiB input bound
also applies here. A failed unchanged parse retries at most three times;
a later metadata change starts a new stable-save check. Missing files and
atomic-save replacement keep the old preserved source available. Ordinary
filesystem metadata changes drive detection; deliberately restoring every
timestamp/size is outside this lightweight polling guarantee.

Accepting a save rereads and validates its exact reported hash/stamp, freezes
its bytes into a fresh private staging file, then imports that snapshot. It
never rewrites an existing project's `Source.sha256` or preserved map. The
library deduplicates matching hashes; a pre-existing authored project is not
overwritten. Temporary snapshot files are removed on success or failure.
The new project receives provenance only; source-bound authoring is not copied
onto new cache offsets or tag IDs. A window-local binding keeps watching the
external path when SHA deduplication finds a revision from another path.

Auto-adoption requires an unchanged Spark document, matching source inspection,
matching scenario/cache family and no saved source-bound authoring. Saved
tag edits, added/moved scene objects, duplicates and authoring extensions
count as conflicts even when the document is not dirty. If editing begins
during import, adoption downgrades to a separate tab. The explicit action is
**Open changed map and keep Spark edits**. Root application integration must
recheck the latest document before dispatch, preserve camera/layout/tool UI
separately, and remap a focused tag by class/path or clear old IDs. A map
cache reload is not a tag-ID-preserving merge.

Verification uses temporary real map files: stable writes and actual tag-field
readback, metadata-only unchanged polling, truncated/invalid saves, bounded
retries, duplicate tag IDs, atomic replacement, retamper rejection, immutable
old source/authoring and SHA deduplication. Frontend controller tests cover
clean auto-adoption, saved and newly dirty conflicts, serialized polling,
close/unmount races, duplicate authored revisions, queued explicit opens and
expired-monitor recovery. Native compilation and TypeScript checks pass.
These tests do not establish execution of HMT/Eschaton or live MCC updates;
native UI QA must save an owner-controlled working copy and observe the
new tags/scene while the previous preserved revision remains recoverable.
