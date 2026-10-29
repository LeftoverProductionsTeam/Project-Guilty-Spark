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
    'OS Save picker, MediaRecorder canvas/permissioned streams, ordered bounded chunk writes, non-overwrite publication, pause/resume/countdown and failure-retained partial output are implemented and contract tested.',
    'A native WebView canvas probe encoded and decoded visible map detail at 1920x1080 while the other editor owned focus. Its initial decoded frame was blank; startup quality, actual application Save-picker, A/V synchronization and long takes remain unaccepted. Windows computer-use initialization failed.',
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
    level: 'IMPLEMENTED / NATIVE DESKTOP REPAIR, COMPILATION AND CACHE OPEN LOCALLY TESTED; gameplay NOT ACCEPTED',
    evidence:
      'docs/C35_CONVERSION_RESOURCE_REPAIR.md; docs/fixtures/c35-conversion-repair-native-verification.json; scripts/test-conversion-repair-native.mjs',
    next: 'Load the converted Alpine map in retail MCC with the exact metadata package and verify UI/HUD, modes, collision, materials and sounds; retain unrelated engine/network gates.',
  });
