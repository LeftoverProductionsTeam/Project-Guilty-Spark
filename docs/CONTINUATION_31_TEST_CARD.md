# Continuation 31 — source and Windows acceptance card

## Source / offline verification

- [x] C30 exact source ZIP hash and archive integrity checked before changes.
- [x] C31 guide model covers all 19 existing workspace IDs and its actions only navigate to known IDs.
- [x] Tests cover absent project, missing inspection, mismatched source identity, unconfigured tool folder, asset-only source, browser-only mode, unsaved changes and active native job.
- [x] Tooltip contract includes hover/focus/touch and Escape, ARIA label and hidden-state semantics.
- [x] Academy source→Tool→WRL→game lesson includes manual proof gates and provenance.
- [x] Final packaged ZIP extracted independently; 429 source manifest hashes verified and all 59 offline scripts passed.

## Native/engine tests NOT RUN

- [ ] On a Windows development machine, extract C31 into a **new empty** folder (do not overwrite installed Halo, C30 or preserved source projects).
- [ ] Verify pinned Node/pnpm and Rust/Tauri toolchains in a non-administrative terminal; compile without modifying host security or game files.
- [ ] Launch Spark in a supported Windows WebView and inspect 3D/UI layout at common resolutions; check small screens, high DPI, OS dark mode and `reducedMotion`.
- [ ] From Map Library with no project, open World and Tags and expand Field Guide. Expect 'Select a project', not verified engine play.
- [ ] Import an owned Halo `.map` as preserved source and confirm SHA-matched inspection status and save identity; a mismatched/removed source must remain clearly unavailable.
- [ ] From Build with no Tool registered, confirm 'Toolchain not configured'; registering a folder must never mark a build as complete.
- [ ] Tab to a `?` tooltip; it must open, Escape must close without moving focus, blur must close. Hover and touch must show/hide help without blocking adjacent actions.
- [ ] Press Ctrl/Cmd+K and search terms such as 'collision', 'tunnels', 'Eschaton', 'HaloMods'. Check arrows/Enter/Escape, empty search, focus restoration, screen-reader announcements and that typing in text input isn't intercepted.
- [ ] Visit Academy → From an original room to a playable Halo build; manual structure/play steps must remain unverified regardless of editor changes.
- [ ] With authorized tools and game content only, build a new original Test Arena in an isolated Halo CE editing kit, retain WRL/Tool logs, and verify real collision, portals, lightmaps, five game modes, and two-client gameplay. Mark this gate only on game evidence.

Run just the first unchecked test step and record the observed result before moving to the next. Avoid force-killing writing Tool phases.
