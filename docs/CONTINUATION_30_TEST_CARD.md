# Continuation 30 — user acceptance / Windows test card

## Verified in source/offline environment

- [x] Original C29 ZIP SHA-256 matches the delivered checksum and ZIP entries are valid.
- [x] New archive URLs are exact HTTPS constants; HaloMods CE f=17, PC f=1, no mistaken Halo 2 f=23.
- [x] Source-only tests check filter, file extension advisory, executable refusal guidance, native import entry point, tooltip and shortcut integration.
- [x] Dependency-free offline source regressions pass.
- [x] Strict standalone TypeScript module check and changed TSX parse check completed.

## NOT RUN — first native Windows test, one step at a time

- [ ] Extract C30 into a new, empty directory. **Do not overwrite C29 or installed Halo data.**
- [ ] Compile and launch on Windows using a properly provisioned Node/pnpm and Rust/Tauri toolchain; capture any error instead of modifying system software blindly.
- [ ] Open Map Library → Community Maps; confirm source cards and accessible tooltip display; Ctrl+K searches 'HaloMods', 'BSP', 'collision', 'tags'.
- [ ] Click HaloMods Classic Halo CE link. Check it opens in the default browser; if blocked by WebView, test Copy link, paste externally, and file a compatibility issue. Do not mark direct browser open passed based on source test alone.
- [ ] On your own decision, download an author-permitted Halo CE `.map` or `.zip` from a trusted archive. Verify release notes and check the file with standard security tools. No automatic installed-Halo overwrite or execution.
- [ ] Return to Spark → Import downloaded map. Verify preserved SHA, archive inventory, edition report and original file untouched. A corrupt or executable-bearing archive must never auto-run its contents.
- [ ] Test a `.ppf` and `.7z` *filename* in advisory: both must say unsupported for automatic import; no automatic patching or archive extraction.
- [ ] Test keyboard navigation/tooltip hover and focus; Esc closes the palette without affecting saved project, text-field Ctrl+Z undoes text not project data.
- [ ] Run compatible Halo Tool/Invader from an isolated toolchain and build/launch the original Test Arena; separately verify real collision, portals, lightmaps, modes and multiplayer. **No engine test has been run here.**

Report only the first unchecked result, then proceed to the next test when confirmed. External sites and attachment availability may change.
