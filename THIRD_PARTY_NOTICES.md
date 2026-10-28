# Third-party notices

The original Project Guilty Spark code is [MIT](LICENSE). This does not relicense its dependencies, Halo content, external tools or attributed documentation.

## Distributed application and build dependencies

React, Three.js, React Three Fiber/Drei, Lucide, Tauri, Vite, TypeScript and their transitive packages retain their upstream licenses. Rust dependencies include serde, SHA-2, chrono, rusqlite, ZIP/Deflate and native platform bindings. SQLite's engine is public domain; its Rust wrapper and other bundled code have their own notices.

The exact declared license expressions, versions and collected license texts are in [the dependency inventory](docs/DEPENDENCY_LICENSES.json) and [license texts](docs/licenses/). This inventory covers resolved/installed build packages, including platform and development packages that are not all bundled in the Windows executable. It is provenance evidence, not a legal compatibility certification. Lockfiles remain the source of exact dependency resolution. Regenerate with node scripts/generate-notices.mjs after dependency changes and review any missing notice files.

WebView2 and OS/native prerequisites retain Microsoft/platform terms. System GTK/WebKit frameworks on Linux are not declared MIT by this project. Platform build recipes do not imply those frameworks are redistributed inside the Windows package.

## Optional Steam test module

The separately built Spacewar test helper uses [steamworks-rs 0.13.0](https://github.com/Noxime/steamworks-rs), steamworks-sys 0.13.0 and paste 1.0.15 under their MIT/Apache-2.0 terms; their collected notices are included in the dependency inventory. The optional `steam_api64.dll` is Valve's Steamworks SDK 1.64 runtime and retains Valve's terms. It is not covered by Spark's MIT license. See Valve's [Spacewar SDK example and redistributable runtime instructions](https://partner.steamgames.com/doc/sdk/api/example). The main Spark executable does not embed or load this DLL; it starts the explicitly selected, separately verified helper only for a requested Steam operation. App ID 480 is a development/test identity, not a registered production Spark identity.

## Optional tools and research

Invader is an optional separate GPL-3.0 tool installation; no Invader binary or source is embedded in this release. H1A/HEK, Guerilla, Sapien, Standalone, OpenSauce, MEK/Reclaimer and other companions retain their own licenses and are not bundled. Decompiled SAMPLE CODE and historical archive executables were not incorporated or executed.

c20 / The Reclaimers Library text is CC BY-SA 3.0. See [community credits](COMMUNITY_CREDITS.md), each linked original page and the [C33 research digest](docs/research/C33_RESEARCH_NOTES.md), whose attributed adaptations retain that license. New code implementing independently verified format facts is original MIT code. No general MIT claim is made for imported documentation or future contributions.

Earlier provenance details remain in [the historical third-party record](docs/THIRD_PARTY.md).

The MCC adapter profile uses address-layout facts attributed to Maurice Dix / Burnt-o, HaloCheckpointManager, pinned revision c5f4069a9e79060d0eeb85105636fe17b6b77563. Its MIT notice is retained at [docs/research/LICENSE-HaloCheckpointManager.txt](docs/research/LICENSE-HaloCheckpointManager.txt). HCM implementation binaries are not bundled.
