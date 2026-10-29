# C34 direct community-map downloads inside Spark

**Community maps → Download a map into Spark** accepts an author's direct HTTPS `.map` or `.zip` link. The user's Download button starts a real native transfer, local preservation/validation and the existing map/archive importer. The action selector opens the imported projects in Level editor, Tag editor or the selected runtime's conversion workflow. Conversion continues through the existing compatibility report and matching installed tools; downloading does not establish runtime compatibility or perform a cache-header relabel.

Curated archive/catalog links remain external browsing links. HTML catalog pages, indirect executable installers and unsupported archive types do not become downloadable maps merely by changing their filename. For a catalog, obtain the author's direct supported data link. ZIP-contained `.yelo` candidates remain subject to the existing read-only inspection/extension compatibility rules.

## Native boundary

`src-tauri/src/map_download.rs` owns a bounded job registry. The application registers prepare, status, download/import and cancellation commands. Transfer/import work runs in a blocking worker; the network portion uses reqwest's asynchronous client internally, allowing a cancellation wake to interrupt pending response reads. The module never launches a downloaded executable or writes into an installed game.

- HTTPS port 443 only; credentials, fragments, local/internal hosts and executable/script download paths are refused.
- Every redirect is admitted again, with at most four redirects. Each hop resolves its host to at most 32 addresses, rejects nonpublic/special-use addresses and pins the approved IPs into the HTTP client. DNS rebinding cannot replace those approved addresses during that request. A mixed public/private result is refused.
- Environmental proxies are disabled for this data path; normal TLS certificate/hostname verification remains enabled. HTTP compression is disabled so the byte limit applies to actual downloaded package bytes.
- DNS waits are bounded to five seconds, with at most four outstanding resolver workers. Connect/read timeouts are ten/five seconds and each HTTP request has a ten-minute total limit. There are at most two active transfers and 32 retained jobs; oldest terminal jobs are discarded first when needed.
- The download cap is 768 MiB. Response `Content-Length` is an early check, not the only limit: actual streamed bytes are counted even when it is absent. Downloaded ZIPs may contain at most 64 map candidates before automatic import; the existing archive reader independently enforces member/entry/selected-size, path, CRC and supported-format rules.

These are implementation/admission checks, not authentication of an author or a promise that every remote site supports this workflow. Restricted proxies, unavailable certificates, unsupported data and interrupted servers return actionable errors. No automatic weaker-protocol or TLS-bypass fallback exists.

## Preservation, cancellation and UI behavior

Each request creates a fresh owned `Inbox/downloads/<UUID>/` directory with a download-owner marker. Bytes go into `download.partial` opened with create-new semantics. Cache headers or ZIP structure are validated, the streamed SHA-256 is checked against a second bounded cancellable read, and completed bytes are published as `download.map`/`download.zip` using an atomic same-filesystem hard link followed by removal of the partial name. Publication fails if the destination already exists or the filesystem cannot create local hard links; there is no overwrite/copy fallback. The file is made read-only and a local receipt records its SHA-256, length, time and source origin.

The raw URL remains private in the in-memory job. Status and persisted provenance omit its path/query to avoid retaining signed URLs or access keys. Remote filenames and Content-Disposition never choose a filesystem destination. An existing original, project, archive or stock map is not replaced.

Network/DNS/stream/hash phases honor cancellation. A short publication phase and the existing source-safe archive/library import finish safely once begun; the UI disables cancellation during those phases. Ordinary transfer failures/cancellation remove the partial file. An abnormal process/OS termination can leave a private owner-marked partial file, which is never treated as an imported map; automatic crash cleanup is not claimed.

The normal importer preserves ZIP originals, adjacent resources and supported map candidates. Executables/scripts inside ZIPs are inventoried but not executed or selected for extraction. If archive import fails after a successful download, the completed download and receipt remain available for diagnosis. Missing resources, protected/extended maps and target compiler problems remain explicit in the ordinary editor/conversion reports.

The widget retains only a safe job ID/action across workspace changes and stops polling terminal jobs. A completion arriving after the widget is unmounted does not redirect the editor. Returning to the page can reopen imported project IDs through the existing project-opening API. Root application callbacks open preserved projects as separate map documents instead of replacing a current dirty draft.

## Evidence and limits

Eight native tests pass:

1. URL admission, private/special IPs, credential rejection and origin-only status/provenance.
2. Per-redirect protocol/address/credential admission and redirect limit.
3. A real native loopback HTTP response streamed to disk, hashed, validated and imported as a synthetic CE v609 scenario through `Library::import_map`.
4. A real native loopback ZIP response preserved byte-for-byte, then extracted/imported through the actual archive/library pipeline.
5. Missing-Content-Length streaming rejected at a reduced test limit, with no final or partial map exposed.
6. In-flight body cancellation wakes the pending request and removes written partial bytes.
7. Queued cancellation and oversized, HTML, executable-signature and truncated/corrupt ZIP responses fail without an imported file.
8. Atomic publication preserves an existing destination byte-for-byte, then publishes a fresh destination without leaving the partial name.

The loopback transport bypass is confined to `cfg(test)` fixture providers. Production admission still requires HTTPS and public pinned addresses. No public author's proprietary map was downloaded or included in repository fixtures. These tests establish native transfer/storage/import behavior for their synthetic files, not Internet/CDN availability, game loading, rendering or universal conversion.

The browser IPC contract tests cover all returned maps and the requested editor action, cancellation without a false success/open action, and rejection of a catalog URL before submission. They remain synthetic IPC tests, separate from the actual native loopback tests. The existing community-source/local-import safeguards remain intact.
