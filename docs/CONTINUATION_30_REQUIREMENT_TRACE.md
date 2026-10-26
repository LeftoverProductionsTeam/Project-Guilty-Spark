# Continuation 30 — outstanding requirements and prompt reconciliation

Baseline: C29 full source; functional reconstruction of all known user requests through C30. Authoritative original matrix: `ORIGINAL_92_REQUIREMENTS_RECONSTRUCTION.md` and `PHASE3_10_FEATURE_TRACEABILITY.csv`. Full original Phase 3–7 prompt bodies remain unavailable, so no verbatim completeness claim is made.

| Priority | User goal | C30 source evidence | Current boundary / next gate |
| --- | --- | --- | --- |
| P0 | One integrated Halo 1 authoring application | Existing React/Tauri workspaces and data model | **Windows build/playtest not yet performed**; still source only |
| P0 | Export a playable, compiled Halo CE map | QuickForge originals, JMS exporters, Tool profiles, diagnostics, preflight | Compile full Test Arena to BSP/tags/map, validate and run each classic mode |
| P0 | BSP extension, tunnels, collision auto-correction | Source topology, WRL and Tool log triage, bounded exact-rim repairs | Arbitrary Boolean room cuts, portal/PVS/collision trees and real compiler regression still missing |
| P0 | Real imported BSP and tag edit/export roundtrip | Source inspection, tag lineage, dependency and cross-map migration previews, managed extraction | Engine-verified editable-source reconstruction and lossless multi-edition export unproven |
| P1 | Real materials and Halo-native look from owned files | Verified source bitmap header, shader references, bounded material preview | Full multi-sprite `ui.map` layouts, complete shaders/lightmaps, interface sounds incomplete |
| **P1 (new C30)** | **Download maps for HaloMods / discover community releases** | Six researched archive links, correct HaloMods CE/PC categories, manual browser-download/import workflow | Not a live map search API or direct in-app download; archived attachments and native browser opening need user tests |
| **P1 (new C30)** | **UI/tooltips/usability polish** | Ctrl+K local command switcher, keyboard-focused tooltip bubbles, discoverability, source warnings, copy fallback, Academy lesson | Full accessibility, controller, real Windows usability and automatic UI tests remain open |
| P1 | Respect original modding philosophy and credit creators | C27–C30 historical notes, credits, Legacy Workflow Lab and optional companion tool inventory | Preserve forum/provenance leads; original external source dumps/rights not fully audited |
| P1 | Original apps launched beside Spark if compatible runtime detected | C28 companion app catalog, fingerprinted registrations, opt-in launch | Native Rust and real legacy tool launch unverified; candidates are not guaranteed working apps |
| P1 | Firefight, Zombies, First Contact and flexible game types | Authoring scaffolds, scripts, five-mode markers, game-type QA plans | Real AI, campaign execution, networked AI and two-client gameplay remain unverified |
| P2 | Halo Mac Demo original G4, HaloMD, CE, PC, MCC cross-compat | Version-aware inspection, archive catalog distinctions, historical research | Mac/G4 exports and real original-hardware test matrix missing |
| P2 | 6-player co-op, 128-player servers, PC split-screen, VR | Design intent and feasibility notes | No proven engine implementation or compatibility |

## Release acceptance rubric

A safe community-download implementation should pass (a) exact trusted HTTPS link list and no executable auto-launch, (b) native user-initiated link opening on Windows and copy fallback, (c) intentional local map import with preserved SHA, (d) malicious archive/path traversal and unsupported format rejection, (e) correct edition warning, and (f) creator attribution retention. **C30 only satisfies (a) in source code, with source-level/UI contracts for (b)–(f); native validations are still pending.**

The full product milestone remains an original editable and **playable** Halo CE Test Arena, followed by restored Zombie Apocalypse source, collision rebuild and verified friend multiplayer. Offline UI and geometry tests do not replace those gates.
