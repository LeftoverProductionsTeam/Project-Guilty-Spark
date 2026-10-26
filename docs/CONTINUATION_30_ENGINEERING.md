# Project Guilty Spark — 07 Halo Modding Brain — Continuation 30

**Source only; 2026-10-26.** Based on the exact checksum-verified `Project_Guilty_Spark_07_Halo_Modding_Brain_Continuation_29_SOURCE.zip`. No EXE, playable `.map`, copyrighted Halo data, third-party binary, patcher, or live network downloader is shipped.

## Implemented

1. **Curated Community Maps / HaloMods path:** `src/communityMapSources.ts` provides six exact HTTPS archive landing pages, including the correctly mapped historical HaloMods Halo CE (`f=17`) and Halo PC (`f=1`) boards, HaloMaps, CE3 and Mac-era HaloMD destinations. No dynamic URLs, remote scrape, background network fetch, or silent file writes. `src/components/CommunityMaps.tsx` gives filtering, source caveats, copyable URL fallback, filename-format guidance, and a distinct native `Import downloaded map` action through the existing protected `import_dialog` path. Archive links and remote files must still be verified by the creator.
2. **Searchable workspace switcher:** `src/workspaceFinder.ts` plus `src/components/WorkspaceFinder.tsx` implements scored, bounded, local navigation matching intent and workspace descriptions. `Ctrl+K`/`Cmd+K` opens the accessible dialog; keyboard Up/Down/Enter/Escape and explicit click targets never execute external programs. Ctrl+Z/Y in text fields are left to native text undo instead of incorrectly undoing a project edit.
3. **Keyboard-accessible tooltips:** `HelpTip` now uses focusable button and `aria-describedby`/`role=tooltip` with a real readable popup. Existing geometry/environment/Academy help chips inherit this, with CSS reduced-motion handling and bounded long text.
4. **Map Library and onboarding:** Community archive entry points from the main nav, Map Library header/hero/empty state, first-run tour, and a new five-step Modding Academy lesson. Existing creator workflows and owner-owned bitmap UI remain preserved.
5. **Original lore/research:** see `CONTINUATION_30_ORIGINAL_HALO_LORE_AND_USABILITY.md`. Early HaloMods patch/rebuild distinction, CE edition boundaries, forum-link preservation, and Mac/Demo historical provenance are visible to creators.

## Security limits

* HTTPS links are fixed constants and matched exactly before rendering the external action; no arbitrary user-supplied URL is turned into a native command. The UI exposes the external address so browser-open failure has a manual fallback.
* No automatic download, virus scanning, executable execution, ZIP extraction by the browser UI, PPF patching, stock-map replacement, CDN/redirect following within Spark, or licence verification. The platform browser handles user-selected downloads; Spark's existing Rust import validates local map or bounded ZIP contents.
* The filename helper is untrusted and advisory. A `.zip` filename does not establish a valid archive, and `.map` does not establish the right Halo edition. A `.ppf` requires separate user-reviewed patching; Spark does not perform it.
* Browser preview cannot import local files via the desktop RPC, so its import button is disabled.
* No game textures, sounds, model bytes, installed runtime paths or old third-party app binaries are embedded in this ZIP.

## Verification and open gates

C30 focused tests: `scripts/test-community-map-discovery.mjs` and `scripts/test-workspace-usability.mjs`. Existing `npm run test:offline` remains the dependency-free regression suite. The source's `src/communityMapSources.ts` and `src/workspaceFinder.ts` were additionally type-checked with the global TypeScript compiler in strict mode; changed TSX transpiles with no syntax diagnostics. Native Windows/Tauri, browser link handling, actual halo map downloads, Cargo/Rust compilation, real archive import, native Tool build, collision/portals and gameplay remain **NOT RUN**. A passing source script is not a successful Windows build.

## Playtest instruction

Extract to a new directory. In a legitimate Windows desktop build, open **Community maps**, choose **HaloMods Classic — Halo CE downloads**, confirm the external forum page opens (or use Copy link), download a creator-authorized Halo CE map archive in the browser, then return to Spark and select **Import downloaded map**. Verify the preserved source SHA, compatibility report and original file unchanged. Never run included executables. Test an actual Halo CE build and play session separately.
