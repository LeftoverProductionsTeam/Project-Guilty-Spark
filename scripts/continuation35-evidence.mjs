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
    'Six credited real releases, publisher screenshots, edition/category/author filters, requirements and direct import selection are implemented. Actual Alpine author-release ZIP download/import produced a CE cache with 2676 tags and native texture previews.',
    'Actual Alpine MCC builds were attempted in isolated copies and failed on three missing classic bitmap tags. No playable output was accepted. Workshop uses Steam; publisher-only download pages remain external routes.',
  ],
  [
    'conversion-errors',
    'Native conversion reports exact missing classic tags instead of generic zero-exit failure',
    'conversion',
    'The failed real Alpine H1A compiler output identified three missing source bitmap tags. A bounded diagnostic now deduplicates safe relative paths and gives matching-resource guidance; focused tests and retained real-log classification passed. Tool zero exit still cannot certify success.',
    'Alpine requires matching original classic resources or editable tags before another native build and game test. No guessed image substitutions or source-effect removal are used.',
  ],
  [
    'external-tags',
    'Retain reliable external tools and synchronize loose tags without losing edits',
    'externalRefresh',
    'Existing two-second cache-file external-save/revision/conflict workflow remains tested through the Changes drawer; supported working-tags builds remain available.',
    'General loose-tag tree synchronization, per-file conflicts/backup/reconcile UX and broad native editor round-trips remain incomplete.',
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
