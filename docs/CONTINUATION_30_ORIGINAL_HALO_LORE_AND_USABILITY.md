# Continuation 30: 07 Halo Modding Brain — restore the browsing, curiosity and discovery loop

**Research/engineering date:** 2026-10-26. **Baseline:** full, checksum-verified Continuation 29 source (not a reconstructed shell and not a compiled game). **Evidence:** direct checks of the public archives below, read alongside prior `CONTINUATION_27_ORIGINAL_HALO_LORE.md`, `CONTINUATION_28_ORIGINAL_HALO_LORE_AND_COMPANIONS.md`, `CONTINUATION_29_ORIGINAL_HALO_LORE_AND_PHILOSOPHY.md`, `ORIGINAL_92_REQUIREMENTS_RECONSTRUCTION.md`, `PHASE3_10_FEATURE_TRACEABILITY.csv`, and user requests through 2026-10-26.

## HaloMods — a historical rediscovery, not an unsafe auto-downloader

Old Halo modding was a *conversation*: read a forum thread, see a screenshot, discover a changed projectile/vehicle, download a community map or patch, experiment on your own copy, and tell its author what worked. It is a mistake to replace that world with an opaque, internet-connected installer. Spark should make the provenance, target edition, and import method visible.

The **HaloMods "Classic" read-only archive** persists at `https://www.halomods.info/`, with edition-specific forums:

* `https://www.halomods.info/viewforum.php?f=17` — **Halo Custom Edition Downloads**. Its description is "Post maps and mods for Halo CE here." Search returned 382 historical topics including large map-pack discussions; the site is read-only. A preserved thread does not prove its files or mirrors are alive.
* `https://www.halomods.info/viewforum.php?f=1` — **Halo PC Downloads**. Its description advises that traditional uploads use **PPF** unless the map was rebuilt. A PPF patch is not a self-contained playable `.map` and must not be blindly applied to a shipped game cache.
* **Important correction:** Forum `f=23` is **Halo 2 Xbox Downloads**, not Halo CE. C30 uses the correct edition-specific links and deliberately avoids dynamic, guessed download endpoints.

Separate, verified community destinations:

* `https://www.halomaps.org/hce/index.cfm` — **HaloMaps** classic Custom Edition map index. The archive itself emphasizes its CE-only utility scope. Do not assume Halo PC/Demo/MCC will load a CE cache.
* `https://haloce3.com/` — **CE3** map archive with author/category pages and recent releases. It also lists *Evolved* source releases separately from built maps—excellent examples of the difference between a playable cache and actual reusable tags/source.
* `https://halomd.macgamingmods.com/mods/` and `https://www.halomd.net/demo/` — Mac-era demo mod archive and original demo download index. Historic **Zombie Apocalypse** listings are provenance leads, not recovered editable source or proof of modern compatibility.
* `https://c20.reclaimers.net/h1/maps/` and `https://www.reclaimers.net/h1/guides/sharing/` — distinction among cache editions, resource dependencies, extraction limitations, and the value of releasing creator-owned source alongside maps.

### What C30 actually implements

`Community Maps` in the main workbench links to these six static, research-checked landing pages. A user can filter by Halo edition or archival era and select **Open** to inspect the author's page in a separate browser window/tab; **Copy link** plus a visible exact address provides a fallback for desktop webview variation. There is **no remote fetch**, scraping, background download, auto-install, malware execution, CDN guess, uncontrolled external URL input, or game-map replacement. After choosing/download in the browser, the user deliberately selects **Import downloaded map**, which calls the pre-existing, native local file picker and bounded importer for `.map`, `.yelo` and `.zip`. ZIP traversal, case collisions, encryption, symlinks and size checks remain in the existing Rust importer; only supported map entries are imported. Source identity is recorded by SHA-256.

A filename helper explains `.map`, `.yelo`, `.zip`, `.ppf`, `.7z`, `.rar`, `.exe`, `.ps1` and more. It is **only a name-based hint**, not signature or safety verification. **Actual external-browser link handling and a user-selected archive download have not been tested on native Windows**, and old archive attachment availability is inherently variable. Direct in-app background/network downloads and live indexed search are **not implemented**.

## The classic modding philosophy continues in editor affordances

### HMT and Eschaton: see the relationship before editing

The appeal of HMT and Eschaton was immediate experimentation with tag references. C28's Tag Lineage Inspector and C29's read-only cross-map dependency review are explicit descendants of that style, but they don't silently inject an incomplete dependency graph or treat map-local datum IDs as portable. Preserve the *experience of discovery*, not corruption from careless cache writes.

### SparkEdit, SwordEdit and log mods: direct feedback with meaningful boundaries

Classic editors let creators reposition scene objects and watch a familiar map transform. Spark's QuickForge, flight controls, snap arrows, topological preflight and undoable tunnel seam alignment retain that exploratory loop. But placing scenery logs is not the same as adding new sealed BSP walls, valid collision trees, portal/PVS clusters or engine lightmaps. Those demand source geometry, Tool structure and real runtime verification.

### The MacGamingMods / HaloMD preservation requirement

Older Mac Demo and G4-era workflows must remain visible, not silently collapsed into Windows CE. An uploaded `.zip` in a HaloMD archive might be a map, patch, installer, mod pack or a combination. Correct edition notes, local source ownership and manually checked original links matter. PowerPC G4 compatibility, SwordEdit runtime behavior and faithful Zombie Apocalypse multiplayer remain future acceptance gates.

### Halo look and feel belongs to the creator's owned game files

A source-aware interface should make navigation readable even when no locally owned `ui.map` bitmap is available. C26 already pins a verified, memory-only user-owned bitmap to the header. C30 improves discovery/navigation and focus-visible instructional tips; it **does not** bundle copyrighted art, copy extracted bitmaps into source ZIPs or implement 1:1 CE menus. Future Phase 9 needs a validated multi-sprite/theme layout editor, local sound bindings, scalable typography, contrast checks, and accessible fallback without user-owned assets.

## Modern interface decisions / usability acceptance

* **Search by intent:** Ctrl+K opens a *local-only* workspace finder. A creator searching "tunnels", "BSP", "downloads", "tag", "collision", "Mac", or "Firefight" can jump straight to the relevant tool without memorizing a sidebar. It never runs external tools or shell commands.
* **Visible explanation without hover dependence:** The reusable help chip shows a real description on mouse hover **and keyboard focus**, with accessible `aria-describedby` linkage and a bounded scrollable bubble. Generic native-title-only tips are insufficient for new creators.
* **Distinguish things that look the same:** Historical forum ≠ live catalog; `.map` ≠ editable source; detected runtime ≠ playable mod; source-mesh collision preview ≠ compiled Halo collision; 32 starts in QuickForge ≠ verified in-game spawning.
* **Error states that teach:** Empty search has a reset action. Copy failures show the actual visible URL. Browser preview disables the native-import action, explaining that desktop import is required.
* **No hidden launcher dependency:** The native workbench remains the primary editor. Optional original utilities can be launched beside it only by explicit separate user choice, per C28.

## Carry-forward priorities (not falsely completed)

1. **P0** Native Rust/Tauri Windows build, high-confidence UI keyboard/link verification and preserved-safe map import test with an authorized sample archive.
2. **P0** First real Halo CE multiplayer Test Arena built by Tool/Invader, loaded and played. Verify collision, objective scoring and multiplayer on real clients.
3. **P0** Actual BSP/portal/PVS/collision reconstruction, robust arbitrary room/tunnel Boolean cutting and versioned tag/BSP source round trips. No universal error-free promise before hostile-fixture and in-game regression matrices.
4. **P1** Broader automatic bitmap/shader/lightmap reconstruction and owner-owned full menu sprite layouts and sounds.
5. **P1** Campaign/First Contact, Firefight/Zombie Apocalypse in-game AI and verified synchronization, dedicated server/game type controls and packaging.
6. **P2** Mac Demo/G4 exports, modern Mac editor target, wider legacy tool runtimes, split-screen, six-player co-op, 128-player modes and VR (engine-specific feasibility testing needed).

## Source ledger and accuracy constraints

The original Phase 3–7 prompts are still not available verbatim. The historical **92 reconstructed requirements** and phase traces are retained, not silently marked done. Source files, code tests and imported real caches are three different kinds of evidence. This release changes only the first; a successful offline suite neither proves old-host links nor verifies a compiled Halo game level.

**Verified external sources used:**

* HaloMods Classic — https://www.halomods.info/viewforum.php?f=17 and https://www.halomods.info/viewforum.php?f=1
* HaloMaps map catalog — https://www.halomaps.org/hce/index.cfm
* CE3 — https://haloce3.com/
* HaloMD archives — https://halomd.macgamingmods.com/mods/ and https://www.halomd.net/demo/
* Reclaimers cache format, sharing and mod pipeline — https://c20.reclaimers.net/h1/maps/ , https://www.reclaimers.net/h1/guides/sharing/ , https://c20.reclaimers.net/general/intro/
* Tauri external URL opening limitations — https://tauri.app/reference/javascript/opener/ (future native integration should use a properly scoped opener plugin with lockfile/dependency review rather than unsafe arbitrary shell invocation).
