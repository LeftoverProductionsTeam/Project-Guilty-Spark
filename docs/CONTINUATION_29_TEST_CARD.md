# Continuation 29 · Windows / Halo acceptance card

**Current delivery:** SOURCE ZIP only; contains no installer, no downloaded classic tools and no game assets. Extract into a NEW empty location, not over the Halo installation or a previous source release.

## Recorded release checks

- [ ] Archive SHA-256 verified against its release checksum in a clean environment
- [ ] All source file hashes verified against manifest; all included files present
- [ ] Offline regression suite passed from the extracted delivered archive
- [ ] Pure TypeScript strict check and edited React syntax checks passed
- [ ] Native Rust (`cargo check`, `cargo test`) and Windows Tauri UI build — **not run by release author**
- [ ] Windows UI source/destination-map JSON-file picker and panel — **not yet tested on end-user machine**

## Manual acceptance scenario — Cross-map migration preview

- [ ] Preserve source map A and destination map B as separate owned, read-only source caches; confirm hashes and appropriate rights.
- [ ] In A → Tags select a source weapon and export its *reference-only* JSON. Confirm no `.tag` binary or Halo map is included.
- [ ] Switch to B and choose the manifest in Cross-map Tag Migration Preview; check source and destination hashes. Confirm no changes to A or B.
- [ ] Verify distinct maps compare class/path identities rather than numeric datum IDs; deliberately test a missing projectile and a conflicting tag class. Do not trust matches as identical content.
- [ ] Deliberately select an incompatible engine or cache version; confirm warning and **no automatic transplant**.
- [ ] Export path-free JSON review; confirm machine paths, real tag names and content are excluded.
- [ ] With appropriately licensed, verified Invader/official Halo Tool, independently extract full source tags, resolve *actual* dependencies, build to an isolated output and playtest in that exact engine. **Manual engine gate not supplied by this preview.**

## Independent product acceptance, still open

- [ ] Build original Test Arena source as real Halo CE BSP and scenario; validate collision, portals, lightmaps, and each of five stock gametypes in-game.
- [ ] Test with two network clients without assuming AI synchronization.
- [ ] Test historical user-supplied Mac Demo transfer/play on genuine or appropriately emulated PowerPC G4 setup (separate engine certification).
- [ ] Test user-owned Halo bitmap/sound UI themes and any intentionally registered old companion app on the actual host; never automatically trust Wine/runtime existence.

**Do not mark any of the above manual engine gates as passed based on these documentation checkboxes, source lint or Node tests.** The detailed missing work is in `CONTINUATION_29_REQUIREMENT_TRACE.md`.
