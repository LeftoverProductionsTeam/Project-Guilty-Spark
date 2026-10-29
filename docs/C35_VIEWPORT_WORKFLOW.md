# C35 r10 — Direct viewport editing, map ambience and a thinner interface

Continue `ebd530402a3fde11b1be1852ffedb25ba965bccb` on the existing C35 branch. Earlier Git/source history, source maps, SDK files and all 319 feature records remain preserved. Existing release files are not overwritten; the three present r8 artifacts were rehashed against their receipt. Other older release files are absent from the current release folder and were not reconstructed. This pass follows the requests for direct object-tag drawers, a shared model/sound library, automatic editor ambience and a thin fullscreen interface.

## Interface and editing

The normal top bar is 32 pixels high and retains the selected theme, brand, map context, search and help. Its own chevron collapses it; a small edge handle or Ctrl+Shift+Backslash restores it. The previous **Window** launcher is removed. Navigation remains an independent drawer. Fullscreen uses the actual native display state, reduces the editing strip to 30 pixels, hides surrounding workspace chrome and retains audio, undo, panel and native window controls. Maximize/fullscreen/restore behavior remains explicit.

Click a rendered map object or choose it in Objects to open **Object tags** over the viewport. The drawer can be hidden, reopened or moved without changing the camera, workspace or canvas dimensions. Field edits use the same audited typed controls and project history as the full Tag editor. Dependencies are navigable in place. **Open in full Tag editor** is an explicit action. Shared tags affect all their instances.

**Asset library** lists models, sound tags and imported assets from the maps currently open. Search or filter by map/type, drag onto the viewport, or choose Add at view. Model replacement retains the selected placement's pose and applicable gameplay settings. Foreign models retain their exact source project, map SHA-256 and tag identity. Their tag drawer edits the source map without switching the destination viewport; focused Ctrl+Z/Ctrl+Y/Ctrl+S target that source map. A closed source map must be reopened before editing its tags.

QuickForge source-tag placements use its existing compiler path. New/replaced instances in an imported cache, and custom OBJ placements, remain editor previews until supported model/scenario compilation is available. The native build/cache patch guards refuse those previews rather than silently omit them or report a playable output. Missing model dependencies remain explicit; no proxy diamonds are substituted.

## Map sound

Ambience starts with the active editing map. Sound scenery uses its real looping-tag dependencies; background loops use actual BSP cluster assignments and the bounded collision-leaf partition. Inside an unassigned cluster the automatic background is silent. An overview camera outside the BSP can audition the single distinct assigned background loop. Ambiguous multiple backgrounds are not selected arbitrarily. BSPs without a compatible verified leaf mapping do not claim cluster routing.

The compact editing strip contains **Mute map sounds**, **Map sound volume** and an actual rendered-audio activity meter. The default editor volume is 35%; mute and volume are remembered per map. The shared audio owner survives hiding/reopening drawers and switching between editing tools. Changing maps, leaving the editing context, losing native window focus or connecting the actual live-game view releases editor playback. Halo keeps its own audio. If the webview requires a gesture, **Play map ambience** is shown.

**Map sounds** retains the full spatial mix, emitter positions, buses, event audition and source-ending controls. Its source-sample player also honors the compact mute/volume controls. Native game event timing, scripted/alternate/detail music, acoustic environments, occlusion and reverb are separate engine work; this is not a claim of complete gameplay audio parity.

Import an owned WAV/OGG or OBJ from Asset library, or drop supported files onto the viewport. PCM/float WAVE and Vorbis inputs are bounded and checked before being copied into new managed storage. Playback rechecks registered identity, source bytes and decoded channel/duration/memory limits. Imported sounds can be positioned, looped and assigned to editor sound events; they do not automatically become compiled Halo sound tags. Project descriptor reimport creates new owned asset IDs and remaps its local sound references.

## Validation

The final Windows build passes **461 Rust tests** (five opt-in ignored), **199 frontend tests** in 41 files, **71 browser tests** and **59 offline checks**, plus TypeScript, Vite, release Rust and NSIS.

The actual native run verifies the 32-pixel normal top bar and 30-pixel fullscreen strip, maximize/fullscreen/restore, one app-close control, cross-map pointer placement, the real 787-triangle donor pistol model, persisted source identity, foreign-map tag save/undo/redo and unchanged viewport dimensions through drawer hide/reopen. All three input map hashes are unchanged; there are no page errors.

The native ambience reader checks an actual 11-cluster, 35,657-node, 17,885-leaf BSP. The assigned forest loop decodes from its verified sample bytes. Independent WebView2 rendering measures custom sound RMS 0.0565643 at the higher gain, 0.0141411 at the lower gain (ratio 0.25), and zero when muted. These measurements do not establish focused automatic playback or hardware listening.

The public native receipt is [c35-viewport-workflow-native-verification.json](fixtures/c35-viewport-workflow-native-verification.json). The opt-in runner [test-viewport-workflow-native.mjs](../scripts/test-viewport-workflow-native.mjs) uses a fresh library/profile, an explicitly supplied executable and three owned maps; it never launches Halo or changes an installation. Native UI/audio observations, source tests and gameplay acceptance remain separate.

Automated checks cover partition boundaries/void/cycles and parser bounds, source-bound placement/replacement, custom audio import/reimport/hash/decoding, native-focus cancellation, bounded failed-source retries, actual mixer gain and duplicate-voice prevention. Browser contracts cover foreign-map tag history, hide/reopen behavior, remembered per-map audio controls, compact top-bar collapse and native fullscreen transitions.

The BSP reader uses the documented Halo 1 leaf/plane structure and a pinned primary schema: [Invader model-collision definition, revision 696830f](https://github.com/SnowyMouse/invader/blob/696830ff80af227e84e7237c2ef26eb2301ed110/src/tag/hek/definition/model_collision_geometry.json), alongside the existing owned-map parser. No upstream executable or game asset is included in the source package.

Remaining acceptance includes focused automatic playback and hardware listening, physical Explorer/file-picker interactions, arbitrary imported-cache model compilation, retail game loading and complete native render/acoustic behavior. Existing live spawning/BSP replacement, game-peer translation/replication and gameplay feature gates remain open.

The focused native check could not run because Windows reported the QA window unfocused and the computer-use helper failed during sandbox initialization. The public receipt retains that gate explicitly. Independent native-byte WebView2 OfflineAudioContext rendering verifies sample decoding, gain ratios and zero mute output; it does not replace focused automatic playback acceptance.

Packaged r10 Windows application: `GuiltySpark-C35-0.4.0-living-workbench-dev-r10.exe`, SHA-256 `26f32b45b6b70c502c1ee8114c814c3bd6272fcd135527e5c1fe7ae7f29a1016`. The installer uses a fresh r10 filename. Both files have checksum sidecars. The source package excludes all owned maps, SDK tags, binaries and private QA data.
