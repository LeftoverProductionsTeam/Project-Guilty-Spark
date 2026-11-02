# C53 — Native preview and tag-workspace repair

Continue the existing local master from `5d4c6588faf921d1f85c3277d11b3aaa7c391181`. Application commits are `4607ded845f0cca4dcafc3d2f44fe8aca410bc81`, `98c2ae41091fb1b2c342c3551174b2c85b024496` and `d32b085e0158e6a1fa3a36db51e34bfa2fbe22ee`. The older dirty C41 root checkout, experimental branches, prior receipts and sealed C49 release files are preserved. This is a scoped editor milestone, not completion of every C50/C51 functionality or gameplay requirement.

## Delivered behavior

**Tag workspace.** The class/tag browser remains on the left. Selected-tag information and fields occupy a compact column, capped at 390 px; the real model gets the remaining width and full content height on the right. Relationships use the existing drawer system. Secondary source/exchange/build operations remain available without occupying a permanent third column. A real 1440 × 900 detached view gives the model about 844 × 718 px after the final corner inset, versus the old fixed 210 px preview banner. At 800 × 600 the two information/model columns stay visible with zero horizontal overflow. Long schemas and tag lists still scroll when necessary.

Native model previews keep the shared source mesh, material and reflection readers. Orbit, wheel zoom, right-drag pan, fit and front/side/top views work in actual WebViews. Camera state is bound to source hash and tag identity. Generic transparent shader layers now use the same named roles in model and Workshop previews; supported native Xbox `mode` tags are accessible in the Tag editor. Missing models stay explicitly unavailable.

**Monitor menu.** The actual owned monitor is captured straight on, with zero yaw/pitch and a 256 × 256 transparent PNG. This picture has its own version/source/tag/resource-bound local cache. Home's animated and mouse-following model no longer supplies an arbitrary pose to the menu. The corner has no live renderer after capture or on a matching cached reload. The 64 px picture sits at WebView coordinate 0,0; the restored curved frame begins 16 px down and right, so the protrusion is symmetric. Home/breadcrumb and Start-here text have clearance. Maximized/fullscreen layouts retain the full viewport. Tauri alone handles the native titlebar double-click; an extra React toggle was removed after the native test exposed a double-toggle.

**Audio audition.** Native CE 609 sounds retain a cache header but put pitch/permutation metadata after an exact 164-byte resource header. C53 reads the mixed address spaces independently, including the bank's real channel/rate fields. Exact original `__permutations` or Invader `__samples` entries are admitted only when unique. Both aliases, wrong keys/kinds/hashes, escaping pointers, oversized metadata and samples outside their indexed span are refused. Resource-relative descriptors cannot become cache-write addresses.

Tag and Asset Library audition share one cancellable, ownership-aware Play/Stop bus per window. User activation resumes the audio device before native reads; source and payload hashes are checked before decoding. A displaced or unmounted card cannot stop a newer preview. Volume/repeat changes made during loading are retained. Preview controls stay independent of map mute and game-authored sound properties. Details and cue assignment remain secondary controls.

The Sound workspace puts audition immediately beneath the tag name, native properties in a three-column grid and existing native-tool summaries in one row. Lineage and migration default to compact disclosures, with link counts/review cues and the original read-only functions retained. Across all four native sound cases, audition begins about **130 px** below the content top, both disclosures are **31 px** high and the complete page has **zero vertical scroll** at the tested desktop size. Opening lineage still exposes its audit export. Long schemas and smaller windows may still need scrolling.

**Original resource recovery.** Content deduplication previously lost the folder beside a second explicitly imported copy of an identical map. This was reproduced with the downloaded Zombie candidate: the preserved map hash matched, but its original resource folder disappeared from discovery. The library now remembers up to eight such local folders without replacing project identity, authored edits or original provenance. Discovery remains bounded and rejects links/remote paths.

An explicitly selected identical-map copy retains the same adjacent-pack selection semantics as its first import. Generic installed-runtime discovery still requires complete supported coverage, and existing conflicting pins are not replaced. Every decoded image still needs its exact native path/span/hash. The tested original Zombie pack verifies **510 images**, with **two unresolved** and **32 unsupported** entries in its complete inventory. This is a partial original pack, not a complete-build certificate. Both requested original tree models now render from it even when the resource-less download was imported first. Original pixels retain precedence over compatible-runtime previews.

**Native windows.** Dragging a map tab outside its strip uses the existing saved-document handoff. The Object tags drawer can detach to a real native tag window; the main world canvas remains resident and observes acknowledged edits. The selected source tag is preserved, not replaced with a default weapon. One writer lease and the same durable journal govern edits. Return-to-main and normal drawer close restore the tag drawer, selection and Undo/Redo. This is local editor-window ownership, not simultaneous independent writers or game-peer replication. Other drawers retain their existing in-app floating/docking behavior and need separate native-detach implementation/acceptance.

## Actual acceptance and regressions

Private reports, failed runs, hashes and screenshots remain under `.local/c53-functionality-closure-20261102`. Public metadata is in [the C53 receipt](fixtures/c53-native-workbench.json); no Halo pixels, maps or audio are committed.

| Check | Verified result |
| --- | --- |
| Rust workspace, locked dependencies | **646 passed, 8 explicitly ignored, 44 result suites** |
| Frontend | **331 passed in 78 files** |
| Browser | **149 passed** after corner clearance changes |
| Offline programs | **59 passed** |
| Native analysis/release guards | **43 passed** |
| Native map/tab history | **8 cases**: independent maps, writer transfer, stale conflict preservation, rapid edits, process-death recovery, close/reopen, actual pointer drag and return |
| Native Object tags window | **4 cases**: same selected tag/acknowledged edit, compact 800 × 600 view, return with Undo/Redo, close/save/reattach; parent canvas retained |
| Native monitor picture | Actual source-derived front PNG, unchanged under mouse movement; reload uses the same picture without a corner Canvas; text and frame bounds checked |
| Native window frame | Actual double-click maximize, restore and framework round trip; one close button; maximized frame fills its viewport |

The real packaged application tests use separate owned libraries and WebView profiles, genuine native IPC and actual Windows audio-session meters. They do not replace native state with browser fixtures. Representative models are CE Warthog/powerup/cyborg, two Demo tree types, MCC Warthog/powerup and Xbox `a10` cyborg/pelican: **nine actual textured models** with orbit and zoom checks. Four source sound auditions start and stop; measured Windows session peaks are nonzero, about **0.407** for the three teleporter samples and **0.653** for the Xbox ambience sample. Original input hashes remain unchanged.

Early receipts are retained, including an ambiguous test card selector, numeric display formatting mismatch, bad test-only window-size arguments, the selected-tag handoff bug, the reproduced duplicate-origin texture failure, the portrait-cache null-type bug and the titlebar double-toggle. Failed runs are not counted as acceptance.

## Performance and remaining gates

The corner's accepted cached path contains **zero corner render canvases**, including after reload. This is a measured resource-lifetime result, not a claim of a faster complete startup. Import/world-load timings are observations in the private reports; several runs overlap regression work. They are not comparable before/after performance benchmarks. No texture, decal, model, shader or native validation work was omitted to improve timings. C51's previously measured save/cache improvements remain separate evidence.

No Halo gameplay or physical speaker-listening trial was performed in C53. Windows output metering is not proof of in-game sound. Full rendering/shader/audio parity, every asset class/runtime combination, arbitrary native drag/import/build/playtest, all native drawers, whole-process RAM budgeting, structural compiled-map editing, original automatic Zombie release, unforced Firefight combat, complete game-peer AI lifecycle, LAN/VPN across separate computers and Steam acceptance remain open. The quoted third-party Faber/Firefight conversation does not establish integration or tests for that fork.

## Artifacts and handoff

The tested development application is `target/release/GuiltySpark.exe`, Windows x64, version **0.4.1**, built with `pnpm exec tauri build --no-bundle` from application source `d32b085e0158e6a1fa3a36db51e34bfa2fbe22ee`: **42,293,248 bytes**, SHA-256 `8b2242b5c5aa832ec198ec41214f25faab36cd983d9b5b1b26f918d162c20165`. Exact per-build executable hashes are retained in the metadata receipt. It is separate from the sealed C49 installer, portable ZIP and source ZIP. C53 creates no new installer/portable/Linux release and publishes nothing remotely. No tag, branch protection or repository rule is changed. [Descriptive push handoff](C53_PUSH_NOTES.md).
