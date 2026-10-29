// C35 augments every historical requirement; it does not replace earlier gates.
export const continuation35Requirements = [
  [
    'drawers',
    'Configurable docked/floating workspace panels and a remembered navigation drawer',
    'interface',
    'Native Windows overlays, float/size/close, per-map/per-workspace restoration and Focus mode are implemented. Project setup, Changes, Help, Construction, connection, Objects and Inspector leave the viewport unobstructed by default.',
    'Broader accessibility and long-term multi-monitor layout acceptance remain open.',
  ],
  [
    'fullscreen',
    'Borderless fullscreen editing takes maximum advantage of screen space',
    'interface',
    'Actual F11 native fullscreen, edge-revealed tools and Runtime Dock, Ctrl+Backslash navigation and Escape restoration passed isolated Windows QA. A 2560x1080 native client supplied a 2560x1070 map viewport. Director movement passed on three connected displays.',
    'Connected displays all use 100-percent scaling. Browser-emulated 125/150/200-percent DPI and 4K logical window sizing do not establish physical high-DPI/4K monitor acceptance.',
  ],
  [
    'header-drawer',
    'Window and project header also opens as a drawer without consuming a viewport row',
    'interface',
    'The Window launcher and Ctrl+Shift+Backslash open project context, search, help and native window controls as a fixed overlay. Header is closed by default, remembered, mutually exclusive with navigation and dismissible with Escape. Browser and actual native size comparisons show no viewport shrink.',
    'Additional assistive-technology and long-session acceptance remain open.',
  ],
  [
    'director-window',
    'Detach/dock a real native Director with one authoritative camera session',
    'machinima',
    'Per-map native camera authority, revision conflict checks, separate undecorated window, monitor/fullscreen/maximize controls and saved physical placement/composition are implemented. Reopen and stale/wrong-window refusals passed native QA.',
    'An independent MCC engine spectator camera is not implemented. Multi-monitor unplug/replug and long recording lifecycle acceptance remain open.',
  ],
  [
    'camera-tools',
    'Named cameras, paths, tracking, roll, lens, shots and smooth transitions',
    'machinima',
    'Director source camera, named editable keys/durations/easing, fixed/free/follow/look-at/orbit, FOV/roll and shared timeline playback are implemented. Earlier Machinima actor, focus and native authored-take tools remain available.',
    'Director-specific depth-of-field and full production-shot/timeline acceptance remain incomplete; editor rendering and engine camera control remain distinct.',
  ],
  [
    'recording',
    'Native video output with countdown, bounded storage, pause/resume and clean recording',
    'machinima',
    'Remembered recording folders and named takes, ordered bounded writes, non-overwrite publication, countdown cancellation and pause/resume are implemented. Actual native UI recording, focus transfer, clean-view changes, independent first-frame/file decoding and Director reopen pass. Fixed-size export samples the existing renderer; map-window preferences merge latest peer values.',
    'The earlier zero first-frame browser read preceded presentation; independent decoding finds picture data in that original file. OS Save/capture pickers, actual game audio/capture, long takes and physical 4K remain unaccepted. Editor Render is video-only. Windows computer-use initialization failed.',
  ],
  [
    'capture',
    'Authorized live Halo capture and an independent connected cinematic camera',
    'machinima',
    'Live Game Capture requests an OS-selected display/window stream and only reports audio when a track actually exists. UI explicitly distinguishes this from Editor Render and unsupported engine spectator control.',
    'Real game capture, focus transfer, actor motion and audio acceptance remain not run. Permission must be supplied through the OS picker; no simulated feed or memory-write camera substitution is used.',
  ],
  [
    'live-tracking',
    'Follow a live player, vehicle or object without stealing gameplay input',
    'live',
    'An opt-in Director reader reuses the existing exact-map/tag-identity MCC sample adapter at four samples per second. Existing object transforms feed Spark rendering; a semantic player target follows respawns. No new game write or camera-memory hook is introduced.',
    'Live tracking was not accepted in a running game this continuation. Biped poses, effects and animation are not engine parity. Arbitrary spawning/BSP replacement and game-peer replication remain open.',
  ],
  [
    'navigation',
    'Useful free-flight camera controls, Q/E vertical movement and configurable input',
    'interface',
    'RMB WASD with Q down/E up, Shift boost, MMB pan, RMB-wheel speed, stored speed/sensitivity/key bindings and text/dialog guards are implemented. Input math and actual browser camera movement are tested.',
    'Additional device/controller/hardware input and broad real native camera acceptance remain open.',
  ],
  [
    'textures',
    'Recover the actual Zombie Apocalypse Demo textures without unrelated MCC substitution',
    'render',
    'Read-only source audit proved 453 external image ranges and sampled original terrain/sky decoding. Native resource recovery used the identical-map original bitmaps.map and loaded 132 shader, 15 lightmap and 59 detail previews. Originals stayed unchanged.',
    '47 missing/mismatched and 44 unsupported images remain in the resource audit. Complete shader, animation, fog, water, weather and audio parity are not accepted.',
  ],
  [
    'catalog',
    'Real visual mod catalog, direct downloads, provenance and runtime compatibility',
    'downloads',
    'Six credited real releases, publisher screenshots, edition/category/author filters, requirements and direct import selection are implemented. Actual Alpine author-release import produced a CE cache with 2676 tags. Matching classic bitmap repair plus explicit MCC multiplayer UI compatibility passes native MCC compilation and cache validation.',
    'Converted Alpine retail MCC loading, custom UI/HUD and gameplay remain unaccepted. Workshop uses Steam; publisher-only download pages remain external routes. No universal conversion claim is made.',
  ],
  [
    'conversion-errors',
    'Native conversion reports exact missing classic tags instead of generic zero-exit failure',
    'conversion',
    'Exact indexed CE bitmap audit runs before SDK staging. A reviewed, source-hashed workflow creates a separate repaired SDK tagset and retains original inputs. The actual Alpine 427/430 audit, three-file repair and explicit MCC multiplayer UI profile pass native conversion; save/check refresh preserves the review.',
    'Matching editable sources are still required. The explicit UI profile replaces the startup multiplayer UI collection, so custom entries beneath it are not retained. Custom UI/HUD and retail gameplay need testing. No guessed bitmap substitution is used.',
  ],
  [
    'external-tags',
    'Retain reliable external tools and synchronize loose tags without losing edits',
    'externalRefresh',
    'The existing two-second compiled-map monitor is retained. Derived working tags now have native filesystem notification, three-second stable-save checks, verified compiled-inventory or explicit watch-start baselines, bounded changed-file review and incremental hashing. A real external scenario edit passed the complete desktop MCC rebuild and separate-map readback after fixing its pre-build snapshot reason.',
    'General loose script/image trees, arbitrary SDK locations, automatic typed merging, per-file conflict reconciliation and actual Guerilla/Sapien GUI save trials remain incomplete. Native acceptance used installed Invader and MCC Tool, without game loading.',
  ],
  [
    'performance',
    'Measure rendering and recording budgets; avoid duplicate hidden viewport work',
    'performance',
    'Native renderer timing/draw/geometry/texture snapshots are recorded for editor and Director, with real timestamp advancement after focus transfer. Visible native editors remain continuous; only hidden/minimized editors may sleep. Dock/popout avoids an unnecessary duplicate continuous Machinima canvas.',
    'Snapshots are not a benchmark. Complete CPU/GPU/VRAM accounting, recording frame pacing, game-plus-Director measurements and high-DPI performance remain unaccepted.',
  ],
  [
    'onboarding',
    'Choose a valid map/create/connect/continue context without repeated setup',
    'interface',
    'The Level editor offers four clear context routes and preserves its new-level wizard through lazy loading and workspace changes. Existing remembered Halo/tool onboarding and settings remain intact.',
    'Broad native first-run and source/runtime compatibility acceptance beyond the recorded fixture remains open.',
  ],
  [
    'validation',
    'Preserve all prior requirements with source, native, UI and gameplay evidence separated',
    'audit',
    'C35 continues master 617d267, retains every earlier ledger record and supplies a scoped engineering report, Git handoff, source archive and Windows build.',
    'Native dual wield/player sword/lunge, arbitrary live spawn/BSP replacement, foreign-MCC wire translation, eight-player campaign/Firefight and measured 128-player gameplay remain unaccepted.',
  ],
].map(([id, feature, topic, operation, gap]) => ({
  id: `C35-${id}`,
  feature,
  topic,
  source: 'Founder Continuation 35 and sidebar/fullscreen steering (2026-10-28/29)',
  previous: 'C35 implementation; scope-specific native/compiler/game acceptance remains separate.',
  operation,
  gap,
}));
export const continuation35Overrides = Object.fromEntries(
  continuation35Requirements.map((row) => [
    row.id,
    {
      state: 'PARTIAL - scoped implementation and acceptance recorded',
      operation: row.operation,
      gap: row.gap,
      files:
        'src/components/WorkspacePanels.tsx; src/components/DirectorWindow.tsx; src-tauri/src/director_native.rs; src-tauri/src/director_recording.rs; src/mapCatalog.ts; docs/CONTINUATION_35_ENGINEERING.md',
      target:
        'Windows Tauri C35 development build; owned Halo 1 Demo / CE fixtures; existing MCC live profile only where stated',
      level:
        'IMPLEMENTED / NATIVE UI LOCALLY TESTED where stated; new game capture and gameplay NOT ACCEPTED',
      evidence:
        'docs/CONTINUATION_35_ENGINEERING.md; docs/fixtures/continuation35-native-ui-verification.json; scripts/test-living-workbench-native.mjs',
      next: 'Complete the specific native recording, engine-camera, compatibility or multiplayer acceptance gate without replacing it with a simulated success.',
    },
  ]),
);
Object.assign(continuation35Overrides['C35-external-tags'], {
  files:
    'crates/spark-core/src/working_tag_changes.rs; src-tauri/src/working_tag_changes_native.rs; src-tauri/src/runtime_workbench.rs; src/components/WorkingTagChanges.tsx; src/components/RuntimeDock.tsx',
  level: 'IMPLEMENTED / NATIVE DESKTOP-TO-COMPILER-TO-CACHE LOCALLY TESTED; gameplay NOT ACCEPTED',
  evidence:
    'docs/C35_TOOL_EDIT_FOLLOW_THROUGH.md; docs/fixtures/c35-tool-edit-native-verification.json; scripts/test-working-tags-native.mjs',
  next: 'Accept a real Guerilla/Sapien GUI save and extend source reconciliation to SDK scripts/images with explicit conflicts; retain separate native game acceptance.',
});
for (const id of ['C35-catalog', 'C35-conversion-errors'])
  Object.assign(continuation35Overrides[id], {
    files:
      'crates/spark-core/src/conversion_resources.rs; crates/spark-core/src/conversion.rs; crates/spark-core/src/build.rs; src-tauri/src/conversion_resources_native.rs; src/components/ConversionBitmapRepair.tsx; src/components/Build.tsx; src/mapCatalog.ts',
    level:
      'IMPLEMENTED / NATIVE DESKTOP REPAIR, COMPILATION AND CACHE OPEN LOCALLY TESTED; gameplay NOT ACCEPTED',
    evidence:
      'docs/C35_CONVERSION_RESOURCE_REPAIR.md; docs/fixtures/c35-conversion-repair-native-verification.json; scripts/test-conversion-repair-native.mjs',
    next: 'Load the converted Alpine map in retail MCC with the exact metadata package and verify UI/HUD, modes, collision, materials and sounds; retain unrelated engine/network gates.',
  });
Object.assign(continuation35Overrides['C35-recording'], {
  files:
    'src/directorRecording.ts; src/directorCanvasCapture.ts; src/components/DirectorWindow.tsx; src-tauri/src/director_recording.rs; src/mapSession.ts',
  level:
    'IMPLEMENTED / NATIVE UI RECORDING, FILE DECODE AND REOPEN LOCALLY TESTED; game capture NOT ACCEPTED',
  evidence:
    'docs/C35_DIRECTOR_RECORDING.md; docs/fixtures/c35-director-recording-native-verification.json; scripts/test-director-recording-native.mjs',
  next: 'Accept OS picker routes, actual game audio/capture, longer takes and repeatable frame-pacing/resource measurements without replacing them with editor-only evidence.',
});

// Preserve operation-specific r5/r6 evidence when regenerating; advance only the scoped r7 paths.
const followThroughEvidence = {
  "C33R-full-parity": {
    "files": "crates/spark-core/src/render.rs; crates/spark-core/src/bitmap_preview.rs; crates/spark-core/src/mcc_textures.rs; src/components/World.tsx; src/directorAudio.ts; src/soundClipLoader.ts",
    "operation": "Real bounded BSP/model meshes, source material/bitmap/lightmap/sky paths, owner resources and editor lighting/fog controls are implemented; native source-map previews were recorded. C35 r5 independently decodes saved editor audiovisual output with an actual source-map sample and camera-distance silence. This scoped export result does not establish native game rendering, animation, event or audio parity. C35 r7 preserves authored main-track intro/loop/end clips in editor output and independently waveform-matches all three real source phases in an encoded native take; this remains editor output, not native gameplay parity.",
    "evidence": "docs/RECLAMATION_AND_WORKFLOW_POLISH.md; docs/LIVING_RENDER_ENGINEERING.md; docs/LIVE_EDITOR_WORKSPACES.md; docs/C35_DIRECTOR_AUDIO.md; docs/fixtures/c35-director-audio-native-verification.json; docs/C35_LOOPING_AUDIO.md; docs/fixtures/c35-looping-audio-native-verification.json"
  },
  "C33R-sound-events": {
    "files": "crates/spark-core/src/audio.rs; crates/spark-core/src/audio_preview.rs; src/spatialAudio.ts; src/components/MapSounds.tsx; src/directorAudio.ts; src/soundClipLoader.ts; crates/spark-core/src/looping_audio.rs; src/soundPlayback.ts",
    "operation": "Real embedded/exact-shared PCM, Xbox ADPCM and Vorbis samples plus bounded spatial editor rehearsal, buses, event audition and validated linked sample segments exist. C35 r5 advances editor sound-scene recording: optional saved Ambient/Map start mix uses the same verified spatial mixer and encodes actual map audio into native Director takes. Native game event hooks, acoustic clusters, occlusion/reverb and complete runtime sound behavior remain open. C35 r7 reads exact source lsnd main tracks, plays intro/repeat/end phases and flagged fades, and finishes the source ending before saving a Director take. Independent decoding waveform-matches the real Ghost phases; source metadata, identity, budgets and actual browser-rendered loop/fade samples are checked.",
    "evidence": "docs/NATIVE_GAMEPLAY_AND_AUDIO.md; docs/ZOMBIE_AUDIO_AND_SPAWN_EVIDENCE.md; docs/C35_DIRECTOR_AUDIO.md; docs/fixtures/c35-director-audio-native-verification.json; docs/C35_LOOPING_AUDIO.md; docs/fixtures/c35-looping-audio-native-verification.json",
    "gap": "Native sound-event hooks, sound classes, script timing, alternate/detail/global-music behavior, BSP acoustic clusters, obstruction/reverb and complete native looping/audio parity remain open."
  },
  "C34-research-lab": {
    "files": "crates/spark-core/src/project.rs; crates/spark-core/src/library.rs; crates/spark-core/src/archive.rs; crates/spark-core/src/runtime_adapters.rs; src-tauri/src/live_cleanup.rs; src/components/LiveSessionRecovery.tsx; src/liveSession.ts",
    "operation": "Bounded current process/content observations and operation-specific registry exist; a complete Runtime Research Lab workflow is not yet implemented. C35 r6 adds query-only process-lifetime/complete-module observations for cleanup, positive retirement reasons, pending-cleanup edit fencing and stopped-keeper checks. Broad suspension, resume acknowledgement, elapsed pause limits, abnormal-exit recovery and an engine-owned apply boundary remain open.",
    "evidence": "docs/RECLAMATION_AND_WORKFLOW_POLISH.md; docs/LIVE_ADAPTER.md; crates/spark-core/src/runtime_adapters.rs; docs/C35_LIVE_SESSION_RECOVERY.md; docs/fixtures/c35-live-session-recovery-native-verification.json"
  },
  "C35-director-window": {
    "files": "src/components/WorkspacePanels.tsx; src/components/DirectorWindow.tsx; src-tauri/src/director_native.rs; src-tauri/src/director_recording.rs; src/mapCatalog.ts; docs/CONTINUATION_35_ENGINEERING.md; src/directorAudio.ts; src/soundClipLoader.ts",
    "operation": "Per-map native camera authority, revision conflict checks, separate undecorated window, monitor/fullscreen/maximize controls and saved physical placement/composition are implemented. Reopen and stale/wrong-window refusals passed native QA. C35 r5 retains the native shared-camera workflow and remembers the optional saved-map audio source per map across docking/reopening. No additional viewport renderer is introduced. C35 r7 exposes Finish sound & save and summarizes authored tracks/spatial emitters in the existing output drawer.",
    "evidence": "docs/CONTINUATION_35_ENGINEERING.md; docs/fixtures/continuation35-native-ui-verification.json; scripts/test-living-workbench-native.mjs; docs/C35_DIRECTOR_AUDIO.md; docs/fixtures/c35-director-audio-native-verification.json; docs/C35_LOOPING_AUDIO.md; docs/fixtures/c35-looping-audio-native-verification.json"
  },
  "C35-recording": {
    "files": "src/directorRecording.ts; src/directorCanvasCapture.ts; src/components/DirectorWindow.tsx; src-tauri/src/director_recording.rs; src/mapSession.ts; src/directorAudio.ts; src/soundClipLoader.ts; src/soundPlayback.ts",
    "operation": "Remembered recording folders and named takes, ordered bounded writes, non-overwrite publication, countdown cancellation and pause/resume are implemented. Actual native UI recording, focus transfer, clean-view changes, independent first-frame/file decoding and Director reopen pass. Fixed-size export samples the existing renderer; map-window preferences merge latest peer values. C35 r5 adds optional saved Ambient/Map start audio in native Editor Render takes. Source-bound clips decode before countdown within 32 MiB/clip and 64 MiB/take budgets; saved bus settings and Director camera distance apply. Native VP8/Opus takes decode actual Alpine wind and silence beyond emitter range; output/audio preferences survive reopening. C35 r7 adds Finish sound & save with source-authored phases and flagged fades, while Stop & save cuts immediately. An independently decoded native take matches actual intro, loop and ending waveforms; the distant spatial take stays silent.",
    "evidence": "docs/C35_DIRECTOR_RECORDING.md; docs/fixtures/c35-director-recording-native-verification.json; scripts/test-director-recording-native.mjs; docs/C35_DIRECTOR_AUDIO.md; docs/fixtures/c35-director-audio-native-verification.json; docs/C35_LOOPING_AUDIO.md; docs/fixtures/c35-looping-audio-native-verification.json",
    "gap": "The earlier zero first-frame browser read preceded presentation; independent decoding finds picture data in that original file. OS Save/capture pickers, actual game audio/capture, long takes and physical 4K remain unaccepted. Saved editor audio is separate from native game audio. Windows computer-use initialization failed."
  },
  "C35-live-tracking": {
    "files": "src/components/WorkspacePanels.tsx; src/components/DirectorWindow.tsx; src-tauri/src/director_native.rs; src-tauri/src/director_recording.rs; src/mapCatalog.ts; docs/CONTINUATION_35_ENGINEERING.md; src-tauri/src/live_cleanup.rs; src/components/LiveSessionRecovery.tsx; src/liveSession.ts",
    "operation": "An opt-in Director reader reuses the existing exact-map/tag-identity MCC sample adapter at four samples per second. Existing object transforms feed Spark rendering; a semantic player target follows respawns. No new game write or camera-memory hook is introduced. C35 r6 separates current-target restoration from verified obsolete-target retirement, retains uncertain cleanup for retry and fences cleanup/object edits to their connection. Windows lifecycle and browser contracts pass; new full MCC transition/recovery acceptance remains open.",
    "evidence": "docs/CONTINUATION_35_ENGINEERING.md; docs/fixtures/continuation35-native-ui-verification.json; scripts/test-living-workbench-native.mjs; docs/C35_LIVE_SESSION_RECOVERY.md; docs/fixtures/c35-live-session-recovery-native-verification.json"
  },
  "C35-performance": {
    "files": "src/components/WorkspacePanels.tsx; src/components/DirectorWindow.tsx; src-tauri/src/director_native.rs; src-tauri/src/director_recording.rs; src/mapCatalog.ts; docs/CONTINUATION_35_ENGINEERING.md; src/directorAudio.ts; src/soundClipLoader.ts",
    "operation": "Native renderer timing/draw/geometry/texture snapshots are recorded for editor and Director, with real timestamp advancement after focus transfer. Visible native editors remain continuous; only hidden/minimized editors may sleep. Dock/popout avoids an unnecessary duplicate continuous Machinima canvas. C35 r5 shares source-bound decoded clips, limits preparation to two simultaneous decodes and a 64 MiB total, and releases owned audio resources. Native short audiovisual export/distance results are individual acceptance observations, not performance or full parity benchmarks. C35 r7 shares one joined PCM buffer for a main track and its ending, includes phases in clip/cache budgets and keys cached clips by source track; transient allocations and native performance budgets are not benchmarked.",
    "evidence": "docs/CONTINUATION_35_ENGINEERING.md; docs/fixtures/continuation35-native-ui-verification.json; scripts/test-living-workbench-native.mjs; docs/C35_DIRECTOR_AUDIO.md; docs/fixtures/c35-director-audio-native-verification.json; docs/C35_LOOPING_AUDIO.md; docs/fixtures/c35-looping-audio-native-verification.json"
  },
  "C35-onboarding": {
    "files": "src/components/WorkspacePanels.tsx; src/components/DirectorWindow.tsx; src-tauri/src/director_native.rs; src-tauri/src/director_recording.rs; src/mapCatalog.ts; docs/CONTINUATION_35_ENGINEERING.md; src-tauri/src/live_cleanup.rs; src/components/LiveSessionRecovery.tsx; src/liveSession.ts",
    "operation": "The Level editor offers four clear context routes and preserves its new-level wizard through lazy loading and workspace changes. Existing remembered Halo/tool onboarding and settings remain intact. C35 r6 keeps Release previous live session reachable after game sampling fails, reports the actual cleanup outcome, blocks new edits during pending cleanup and resets stale bindings/live history on reconnect. No repeated Halo/tool setup is introduced. C35 r7 remembers sound query, selected sound and main-track choice per map and documents immediate Stop versus source-ending Finish.",
    "evidence": "docs/CONTINUATION_35_ENGINEERING.md; docs/fixtures/continuation35-native-ui-verification.json; scripts/test-living-workbench-native.mjs; docs/C35_LIVE_SESSION_RECOVERY.md; docs/fixtures/c35-live-session-recovery-native-verification.json; docs/C35_LOOPING_AUDIO.md; docs/fixtures/c35-looping-audio-native-verification.json"
  },
  "C35-validation": {
    "files": "src/components/WorkspacePanels.tsx; src/components/DirectorWindow.tsx; src-tauri/src/director_native.rs; src-tauri/src/director_recording.rs; src/mapCatalog.ts; docs/CONTINUATION_35_ENGINEERING.md; src/directorAudio.ts; src/soundClipLoader.ts; src-tauri/src/live_cleanup.rs; src/components/LiveSessionRecovery.tsx; src/liveSession.ts",
    "operation": "C35 continues master 617d267, retains every earlier ledger record and supplies a scoped engineering report, Git handoff, source archive and Windows build. C35 r7 passes 435 Rust tests (five opt-in ignored), 190 frontend tests in 39 files, 62 browser tests and 59 offline checks, plus TypeScript and Windows Vite/Rust/NSIS builds. Actual native editor recordings retain original sources, verify real intro/loop/end waveforms, distance silence and named-take lifecycle. Source inventory and all 319 IDs are retained; game/runtime acceptance remains operation specific.",
    "evidence": "docs/CONTINUATION_35_ENGINEERING.md; docs/fixtures/continuation35-native-ui-verification.json; scripts/test-living-workbench-native.mjs; docs/C35_DIRECTOR_AUDIO.md; docs/fixtures/c35-director-audio-native-verification.json; docs/C35_LIVE_SESSION_RECOVERY.md; docs/fixtures/c35-live-session-recovery-native-verification.json; docs/C35_LOOPING_AUDIO.md; docs/fixtures/c35-looping-audio-native-verification.json"
  }
};
for (const [id, current] of Object.entries(followThroughEvidence))
  Object.assign(continuation35Overrides[id] ??= {}, current);
