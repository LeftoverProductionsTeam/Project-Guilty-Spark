# C35 r9 — Native BSP audio revisions and usable window drawers

Continue `0699458` on `codex/continuation-35-living-workbench`. Preserve the existing appearance, map documents and r1–r8 artifacts. This pass repairs the reported drawer/window regressions and adds explicit native BSP background-sound and sound-environment assignments to the existing working-tags build workflow.

## Window and drawer repairs

Navigation and the original project header remain drawers. Opening either leaves the editor visible and interactive. Their full-window button backdrops were removed: the dark theme styled those buttons as opaque surfaces. Clicking the workspace dismisses the drawer and still reaches the underlying tool. Escape and the existing shortcuts remain available. The original selected theme, curved frame and gradients are retained; the navigation drawer no longer forces a replacement flat background.

One set of minimize, maximize/restore and app-close controls stays in the compact editing strip. A chevron hides the project header, instead of a second X. The header remains a fixed overlay even when native-frame styling is active, reserves room for the window buttons, and consumes no editor row. Fullscreen keeps the compact strip visible. Entering from a maximized window first leaves maximized mode; exiting fullscreen restores that previous mode. The control checks actual native fullscreen state instead of accepting a failed transition as success. The runtime-details modal also wins the generic modal width rule, making the existing map/tool controls readable.

## BSP audio workflow

1. Open a validated MCC H1A map with matching job-owned editable tags and the matching kit/Invader installation.
2. Open **Runtime & Tools → Details → BSP ambience & sound environments**, then **Inspect BSP audio**.
3. Choose the actual BSP and compiled cluster. Its current palette selections, subcluster bounds, cluster count and portal count are shown. Choose an owned `.sound_looping` tag and `.sound_environment` preset, or explicitly clear either binding.
4. Stage one cluster or all clusters. The per-map draft survives closing/reopening details. Reinspect before submitting a saved draft. A different parent cache/BSP identity requires clearing/reviewing it.
5. Choose **Build BSP audio revision**. Open the validated **working-tags build** in a separate map tab. The current source cache, input SDK tags and Spark authoring document are retained.

One revision supports one BSP and at most 256 distinct cluster changes. Palettes retain the native 64-entry limits. Every selected dependency is pinned to its class, safe relative path and SHA-256. Missing tags, changed BSPs, stale parent identities, duplicate/out-of-range clusters and unsupported cache layouts fail before Tool can report an accepted output. The UI does not label a browser contract or a compiler exit code as gameplay.

## Native engineering and evidence

The bounded reader inspects actual scenario BSP references, cluster palette indices, subcluster bounds, portal counts and PVS/PAS byte identities in supported v6/v7/v609/v13 cache layouts. Offsets were checked against the primary [Invader BSP schema at revision 696830f](https://github.com/SnowyMouse/invader/blob/696830ff80af227e84e7237c2ef26eb2301ed110/src/tag/hek/definition/scenario_structure_bsp.json). No upstream parser implementation or game assets were copied into Spark.

The working-tags builder pins installed Invader edit, copies the complete verified editable tree into a fresh job, compares the copied BSP palettes/cluster selections against the parent cache, applies only the requested fields, and verifies the native edit readback. It compiles through the matching H1A Tool. Before accepting output, it checks compiled logical audio bindings, all unchanged cluster fields/bounds, portal count, exact PVS/PAS hashes and collision vertices/indices. Existing script, CRC, tag-index, protection/stub and source-preservation checks remain in place. The job writes `bsp-audio-verification.json`; no copied SDK tags enter the source archive.

The original four-map challenge has 11 clusters/10 portals and no background/environment selections. A new native build assigns the real forest-day loop plus mountains/stone-room environments to two clusters. It validates as MCC v13 with 2,780 tags, SHA-256 `615feac8fab4b9b5759655c3d3af888b5e07633c188bd7981d4c8d948efa1688`. The original parent remains `5b0103b63b91add77116fc11f1bdb5f8d3cb51a115c4ad24b7e8fb6d41fbd541`. The other nine clusters, all collision and PVS/PAS remain unchanged. The input inventory contains 12,336 editable tags; the audio picker finds 406 looping tags and 32 environment tags.

The packaged desktop independently stages a different real environment for cluster 0, closes/reopens the details panel with its draft retained, compiles through the UI and opens the new cache in a second tab. The result has 2,781 tags and SHA-256 `e6e2ffff238bcb7509e2c0574fde52e4d4c291e1ac4e9d21fc7228de1a5fddad`; the original document, input BSP/cache, collision and PVS/PAS remain unchanged. This build took 116.5 seconds on this machine; it is an observation, not a performance guarantee.

Actual native controls pass maximize → fullscreen → restore-maximized, pointer access with the original header open, both dark-glow/Covenant drawers without a screen cover, and closing the app through the single X while fullscreen. The native client is 1920×1080 and the visible compact strip is 43 logical pixels high. The exact accepted EXE is `76ef27b6d411187da321fecfc13a8b87f8acb058821dd0c9b425a27410cd5d5d`. The [metadata-only receipt](fixtures/c35-bsp-audio-native-verification.json) records the two independent compiler/native scopes; copied maps, tags, full logs and screenshots remain private.

Local regression checks: **455 Rust tests passed / five opt-in ignored; 190 frontend tests in 39 files; 68 browser tests; 59 offline checks**. TypeScript, Vite, Windows release Rust and NSIS builds pass. Six new core tests cover metadata/bounds, classes/identities, malformed pointers/counts, null selections, stale/dependency requests and native readback. Another test refuses a stale audio request before any build directory or tool invocation. Browser checks cover draft persistence/failure, changed parents, theme-preserving interactive drawers, one app-close control, actual fullscreen commands and maximized-mode restoration. The existing Vite large-chunk warning remains.

Private QA initially exposed an imported-source seeding assumption and native-test timing/modal-dismissal assumptions. The QA helper now copies and verifies the preserved source into its fresh managed library, permits the bounded 4-GiB challenge, and retains fingerprint identity. Failed QA roots and logs remain available; they were not deleted. These changes do not alter production import rules. Tests use only copied Spark windows, private profiles and owned SDK jobs; no Halo process is launched and no game memory is accessed.

## Remaining acceptance

These are explicit rebuilt-tag assignments. Automatic donor acoustic transfer, editor acoustic emulation, reverb/occlusion, script/alternate/detail sound behavior and actual Halo listener traversal are not accepted. The four-map world still needs retail MCC loading, human collision/visibility traversal and audible boundary comparisons. Fog/weather transplantation, independent BSP streaming, live BSP replacement and game-peer replication remain separate engineering gates. No new dual-wield, sword/lunge, expanded-player or foreign-MCC protocol capability is claimed. Source/compiler/native UI/game/network evidence stays separate in the retained 319-row ledger.

The owner handles pushing. This is a local development build; master, installed Spark, public releases and the remote repository are unchanged.
