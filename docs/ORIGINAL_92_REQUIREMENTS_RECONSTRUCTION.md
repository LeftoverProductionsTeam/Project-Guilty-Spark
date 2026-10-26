# Historical 92-requirement prompt reconstruction

This document is the earlier conservative reconstruction of the ten Codex prompts and later requests, preserved for coverage and attribution. **Its statuses refer to the pre-continuation snapshot** and must not be treated as the final implementation/test verdict. See `07_HALO_MODDING_BRAIN_HANDOFF.md` and `PHASE3_10_FEATURE_TRACEABILITY.csv` for the current release-specific assessment. Original Phase 3–7 prompt bodies are not verifiably complete, so a literal word-for-word audit is impossible without their originals.

---

# Project Guilty Spark: Phases 3–10 requirements traceability and gap matrix

**Status:** Comprehensive FUNCTIONAL reconstruction from accessible conversation prompts, the 0.3.0 source upload, Codex progress history, and founder's later requirements. **Not a word-for-word lossless comparison.** The exported Codex log truncates original prompt bodies; Phase 3–7 verbatim source text cannot be recovered from that log alone. The entire original Phase 8–10 draft and recent consolidation are visible in conversation, but not included in the source-only ZIP. To certify literal losslessness, provide all original complete prompt bodies and reconcile their hashes/requirements line by line.

This matrix is intentionally **conservative**: inspection of source is not a Windows compilation, and a real-map parser check is not a Halo game run. Earlier Phase 1–2 tests are historical evidence, not current regression results.

## Summary

- **92 granular requirements** mapped across eight phases plus the founder's latest additions.
- Current evidence-state breakdown: PARTIAL: 45, NOT IMPLEMENTED: 25, BLOCKED: 10, UNVERIFIED: 6, REAL-MAP SOURCE CHECKED: 4, IMPLEMENTED / UNTESTED: 1, ACKNOWLEDGED: 1.
- Highest-priority engineering debt: texture/shader/lightmap/sky decoding; real scene preview; persistent BSP/geometry source reconstruction and compile-to-game; real multiplayer/server tests.
- The first v0.3.1 source patch corrects two real Demo cache offsets and tracks shader identities, but it does not claim complete map fidelity.

## Evidence labels

- **REAL-MAP SOURCE CHECKED**: a standalone read-only verifier succeeded on user-supplied Demo map bytes; actual Rust/Windows desktop test still pending.
- **IMPLEMENTED / UNTESTED**: code exists, but regression/runtime outcome not independently established in this environment.
- **PARTIAL**: some existing code/workflow, incomplete acceptance.
- **BLOCKED**: missing dependency, format functionality or external test fixture.
- **NOT IMPLEMENTED**: no complete corresponding feature in uploaded snapshot.
- **UNVERIFIED**: plans/adapters exist without required real-world evidence.
- **ACKNOWLEDGED**: architectural limitation deliberately preserved.
## 3 / QuickForge

| ID | Requirement | Code/evidence | Status | Required acceptance |
|---|---|---|---|---|
| P03-001 | Editable parametric source brushes and original geometry | src/forge.ts; crates/spark-core/src/quickforge.rs | **PARTIAL** | Persist/reopen actual source brushes; geometry build |
| P03-002 | Room, wall, floor, ramp, stairs, platform and material tools | src/forge.ts; src/components/Workspaces.tsx | **PARTIAL** | Create/edit each brush; compile valid BSP |
| P03-003 | Valid normals/UVs, portals, collision, JMS export | crates/spark-core/src/quickforge.rs; forge_build.rs | **PARTIAL** | HEK Tool structure + collision verification |
| P03-004 | Original arena with spawns/weapons/game mode | QuickForge implementation | **BLOCKED** | Guilty Spark Test Arena actually loads in Halo |
| P03-005 | Compile to valid tags/cache through Halo Tool or Invader | crates/spark-core/src/forge_build.rs | **BLOCKED** | Verify official tool availability and game load |
| P03-006 | Build identity, hashes, cancellation and isolated staging | crates/spark-core/src/forge_build.rs | **IMPLEMENTED / UNTESTED** | Re-run Rust tests and inspect build receipts |
| P03-007 | Firefight wave config, AI sets, scoring and spawn state | src/firefight.ts; crates/spark-core/src/firefight.rs | **PARTIAL** | Valid in-engine waves, no phantom completions |
| P03-008 | Zombie Apocalypse Firefight, AI variant/tag references | Source map/partial restoration research | **BLOCKED** | Real AI waves in runtime; two clients for networking |
| P03-009 | Scenario object / player starts / objectives | src/forge.ts; src/components/World.tsx | **PARTIAL** | Round trip into compiled playable scenario |
| P03-010 | Native runtime differences, multiplayer/co-op reality | docs/RUNTIME_COMPATIBILITY.md | **PARTIAL** | Test actual runtime/game mode capabilities |

## 4 / Living Workbench

| ID | Requirement | Code/evidence | Status | Required acceptance |
|---|---|---|---|---|
| P04-001 | Original campaign BSPs, multi-area layout and scenario creation | src/forge.ts is only geometry foundation | **NOT IMPLEMENTED** | First Contact complete real mission |
| P04-002 | Visual Mission Director / objectives and HaloScript compiler | src/components/Workspaces.tsx (limited) | **NOT IMPLEMENTED** | Compile/execute valid mission scripts |
| P04-003 | AI firing positions, navigation, triggers, checkpoints, devices, doors | Partial encounter parsing | **NOT IMPLEMENTED** | Real encounter progression in Halo |
| P04-004 | Cinematic camera timeline, dialogue, animation, music and fade | No finished sequencer in snapshot | **NOT IMPLEMENTED** | Intro/ending in-game camera clips |
| P04-005 | First Contact 5–8 minute vertical slice with authentic Halo pacing | Project specification only | **NOT IMPLEMENTED** | Complete playthrough in supported runtime |
| P04-006 | High-poly OBJ/FBX/glTF/JMS asset import with optimization | crates/spark-core/src/assets.rs (OBJ only) | **PARTIAL** | Compile optimized asset with material and collision |
| P04-007 | Blender, meshoptimizer and JMS/collision generation | Tool integrations incomplete | **NOT IMPLEMENTED** | Actual game build of high-poly asset |
| P04-008 | Tool detection, install with approval, OS capability registry | src-tauri/src/app.rs; runtime/workspaces | **PARTIAL** | Enumerate and validate tools by version |
| P04-009 | Halo CE art direction / original UNSC-Covenant-Forerunner styles | Current CSS themes limited | **NOT IMPLEMENTED** | Visual review of all themes with real screenshots |
| P04-010 | VR or alternate preview enhancements, where explicitly authorized | Prior audit names VR as incomplete | **NOT IMPLEMENTED** | Owner-defined runtime and hardware test |

## 5 / Finish the Fight

| ID | Requirement | Code/evidence | Status | Required acceptance |
|---|---|---|---|---|
| P05-001 | Strict feature audit and final integration, no placeholder UI | docs/ENGINEERING_AUDIT.md older reports | **PARTIAL** | End-to-end audit and verified status matrix |
| P05-002 | Build-first stabilization and realistic runtime dependencies | Prior Phase 3 HCEEK missing | **BLOCKED** | Real BSP and game load |
| P05-003 | Original arena end-to-end tested | QuickForge source only | **BLOCKED** | Tested game build |
| P05-004 | First Contact campaign and cinematic in game | No completed campaign | **NOT IMPLEMENTED** | Playthrough, scripts/camera/AI |
| P05-005 | Actual Firefight waves and zombie restoration | Firefight scaffolding | **BLOCKED** | Engine-level test and spawn authenticity |
| P05-006 | Two-client synchronization and online compatibility | Native adapters/manifest docs | **UNVERIFIED** | Real two-client play and AI state |
| P05-007 | Performance profiling and production hardening | Current renderer untextured | **PARTIAL** | Measured frame time, memory, startup |
| P05-008 | Windows/macOS/Linux release candidate and signing status | Windows 0.2 build in logs | **UNVERIFIED** | Build and test target platforms |

## 6 / Great Reclamation

| ID | Requirement | Code/evidence | Status | Required acceptance |
|---|---|---|---|---|
| P06-001 | Historical tool/source audit, provenance and licenses | SAMPLE CODE archive separately supplied | **PARTIAL** | Owner-approved, documented source classifications |
| P06-002 | Official HEK/MCC Tool/Sapien/Guerilla/Excession/Tag Test integration | Tool adapters partial | **PARTIAL** | Version-verified commands and compiler results |
| P06-003 | Invader, Baboon, Rampancy, MEK, SwordEdit and legacy tool research | docs/RESEARCH.md; external archives | **PARTIAL** | Each selected adapter passes real input/output |
| P06-004 | Toolchain Fabric: capability registry and orchestrator | src-tauri/src/app.rs tool paths | **PARTIAL** | Auto select verified tool by target/runtime |
| P06-005 | Historical knowledge archive c20 attribution and tutorial index | docs/RESEARCH.md | **PARTIAL** | Creator-facing searchable learning content |
| P06-006 | Interactive Rocket Pistol tutorial in actual editor | Tag editing foundation | **NOT IMPLEMENTED** | Player edits pistol and tests output |
| P06-007 | Interactive first arena / map building tutorial | QuickForge exists partially | **NOT IMPLEMENTED** | Beginner builds and plays custom map |
| P06-008 | AI, mission and cinematic tutorial pathway | No mission studio | **NOT IMPLEMENTED** | End-to-end guided authoring |
| P06-009 | Preserve Zombie Apocalypse provenance and community credits | docs/ZOMBIE_APOCALYPSE_ARCHAEOLOGY.md | **PARTIAL** | Verify source, migration and attribution |

## 7 / Reality Forge

| ID | Requirement | Code/evidence | Status | Required acceptance |
|---|---|---|---|---|
| P07-001 | Feature freeze, actual repo assessment and repair broken workflows | Previous incomplete handoff | **PARTIAL** | Core workflows independently verified |
| P07-002 | Real source-to-game pipeline, no bogus Build & Play green | crates/spark-core/src/forge_build.rs | **BLOCKED** | Valid original Halo map loads in game |
| P07-003 | 3D scenario preview, QuickForge and tag editing functional | src/components/World.tsx; sources | **PARTIAL** | Real-map render and edited output |
| P07-004 | Smart asset import, collision and optimization proof | OBJ only | **PARTIAL** | Imported model rendered/collidable in Halo |
| P07-005 | MCC/OpenCE/Chupathingy runtime capability matrix | docs/RUNTIME_COMPATIBILITY.md; runtime.rs | **PARTIAL** | Per-version compatibility tested |
| P07-006 | Two-client multiplayer and AI reconciliation | Server manifests only | **UNVERIFIED** | Two clients demonstrate consistent AI |
| P07-007 | Mandatory manual owner tests with exact UI steps and rollback | Old testing docs | **PARTIAL** | Re-run owner acceptance checklist |
| P07-008 | Feature statuses VERIFIED/PARTIAL/BLOCKED/FAILED/etc. | Existing status convention | **PARTIAL** | Every feature linked to evidence |
| P07-009 | Stable final build/test/security/QA reports | Version 0.3 source snapshot | **UNVERIFIED** | Full Windows build and regression |

## 8 / Operation LAN Party

| ID | Requirement | Code/evidence | Status | Required acceptance |
|---|---|---|---|---|
| P08-001 | Private-alpha installers and clean first-run onboarding | v0.2.0 Windows installer previously built | **PARTIAL** | Install on second Windows system |
| P08-002 | Guilty Spark Share versioned package manifests/hashes/dependencies | src-tauri/src/app.rs; mcc.rs | **PARTIAL** | Import/export source-safe package |
| P08-003 | Safe install, update, rollback, removal and side-by-side versions | Some MCC receipts and managed paths | **PARTIAL** | Update and revert without harming other mods |
| P08-004 | Creator-to-player second-machine transfer workflow | Manifests exist | **UNVERIFIED** | Package loaded on a clean client |
| P08-005 | LAN/private online session manager with runtime capabilities | runtime/multiplayer modules | **PARTIAL** | Actual host/join/game completion |
| P08-006 | MCC mod-mode compatibility, no public matchmaking claims | Docs and adapter | **PARTIAL** | Real MCC mode and game load |
| P08-007 | ChupathingyCE/OpenCE native adapters and map version check | crates/spark-core/src/runtime.rs | **PARTIAL** | Version-specific runtime tests |
| P08-008 | Privacy flags: listing, match stats, firewall changes opt-in | Docs only | **NOT IMPLEMENTED** | Inspect actual runtime settings and consent |
| P08-009 | Team project snapshots, branch/conflict detection/merges | Project history only | **PARTIAL** | Two contributors resolve conflict without losing work |
| P08-010 | Playtest Lab with test session logs, bug export, sanitized reports | Existing logs/build receipts | **PARTIAL** | Reproducible bug report from real failure |
| P08-011 | Zombie Apocalypse multiplayer/native Firefight vs MCC co-op separate | Restoration blocked | **BLOCKED** | Real networked AI proof |
| P08-012 | Full 4-player custom match and revision update | No 4-client proof | **UNVERIFIED** | 4 clients match and share revision 2 |

## 9 / Combat Evolved

| ID | Requirement | Code/evidence | Status | Required acceptance |
|---|---|---|---|---|
| P09-001 | Authentic 2001 Halo CE design, not generic AI sci-fi | Existing visual stylesheet | **NOT IMPLEMENTED** | Visual screenshot review vs original CE |
| P09-002 | Halo CE Classic, UNSC, Covenant and Forerunner themes | No complete Theme Forge | **NOT IMPLEMENTED** | All four readable and functional |
| P09-003 | User-supplied ui.map / bitmaps.map / sounds.map local decoding | Read-only audio previews partial | **PARTIAL** | Decode actual local UI sprite and sound |
| P09-004 | MCC-specific IPAK/FMOD and classic engine resource adapters | Legacy-only map parser | **NOT IMPLEMENTED** | Verified per-runtime asset decoding |
| P09-005 | Theme Forge WYSIWYG bitmap/layout/crop/nine-slice/spacing/layers | No current workshop | **NOT IMPLEMENTED** | Save/reopen custom theme using local CE assets |
| P09-006 | Theme profile import/export by references without redistributing assets | No theme schema | **NOT IMPLEMENTED** | Second user resolves local references |
| P09-007 | Sound Workshop local previews, event mapping, volume/mute | Embedded Ogg preview only | **PARTIAL** | Assign an actual sound, restart, mute works |
| P09-008 | UI polished, keyboard accessible, responsive and cohesive | Current basic React UI | **PARTIAL** | Screens visually QA at resolutions |
| P09-009 | Mota-Lev archive audit (decomp vs licensed source) and capability integration | SAMPLE CODE is separate from source ZIP | **PARTIAL** | Source-by-source verified integration matrix |
| P09-010 | OpenCE editor two-way format exchange with Mota | No authorized editor project source | **BLOCKED** | Actual object round trip in two editors |
| P09-011 | Comprehensive architecture/source/license regression | Docs older; patches current | **PARTIAL** | Clean tests/packaged build |

## 10 / Time Machine

| ID | Requirement | Code/evidence | Status | Required acceptance |
|---|---|---|---|---|
| P10-001 | Halo Mac Demo on PowerPC G4 as export target | Version 6 read; build unverified | **PARTIAL** | Actual G4 loads safely exported mod |
| P10-002 | Capability-driven legacy build profiles for Xbox/Demo/PC/CE/MD/MCC | src runtime.rs; maps.rs | **PARTIAL** | Per-target read/edit/build/play truth |
| P10-003 | Safe legacy export manifests, backups, rollback | Source-preservation architecture | **PARTIAL** | Restore original map after test |
| P10-004 | Legacy PowerPC browser bridge, minimal HTML, LAN only | No legacy bridge | **NOT IMPLEMENTED** | Old browser retrieves map safely |
| P10-005 | Legacy constraints and performance documentation | docs/COMPATIBILITY.md | **PARTIAL** | Real tested constraints |
| P10-006 | No native PowerPC full-editor claim | Modern Tauri framework | **ACKNOWLEDGED** | Export workflow, not full native G4 UI |
| P10-007 | Finish owner test suite with exact first actionable step | docs/TESTING.md existing | **PARTIAL** | Owner executes first five tests |

## New / Living Halo + server

| ID | Requirement | Code/evidence | Status | Required acceptance |
|---|---|---|---|---|
| NEW-001 | Drag .map and auto-render true BSP/world materials | App map drop already; render patch in this release | **PARTIAL** | Texture/color/sky/lightmap verified in window |
| NEW-002 | Fix v6 BSP vertex pointer +228, real valid surface geometry | crates/spark-core/src/render.rs | **REAL-MAP SOURCE CHECKED** | Cargo tests + Windows 3D viewport |
| NEW-003 | Fix PC gbxmodel vertex offset +100, real rock/tree meshes | render.rs; scripts/verify_legacy_geometry.py | **REAL-MAP SOURCE CHECKED** | Cargo tests + tree/rock selection in 3D |
| NEW-004 | Multi-node static bind-pose scenery previews | render.rs | **REAL-MAP SOURCE CHECKED** | Verify plant/vehicle rest-pose rendering |
| NEW-005 | Retain shader IDs per BSP material for texture pipeline | MeshMaterialRange in maps.rs, render.rs | **REAL-MAP SOURCE CHECKED** | Map shader IDs to actual bitmap texture |
| NEW-006 | Editor Game-Like, textured, smooth, solid, wireframe, collision modes | src/components/World.tsx | **PARTIAL** | Game-Like and textured require shaders/lightmaps |
| NEW-007 | Wind, animated sky/weather/water/particles/ambience | No runtime environment preview | **NOT IMPLEMENTED** | Match supported real Halo behavior |
| NEW-008 | Click/select/edit *existing* BSP vertices/edges/faces | Current imported BSP read-only | **NOT IMPLEMENTED** | Recompile valid render+collision BSP |
| NEW-009 | Terrain sculpt raise/lower/flatten/smooth/extend regions | QuickForge brushes only | **NOT IMPLEMENTED** | Actual playable edited hill in Halo |
| NEW-010 | Cave tunnels/rooms/branches/exits and sealed portal/PVS | No cave authoring | **NOT IMPLEMENTED** | Traverse compiled connected caves without holes |
| NEW-011 | Mota one-click BSP swapping/merging, OBJ UV/collision support | Mota report, no installed authorized implementation | **BLOCKED** | Cross-tool authorized tested roundtrip |
| NEW-012 | Render distance: separate editor far plane, PVS/fog and runtime mods | Three.js camera far is adjustable | **PARTIAL** | Verify per-runtime engine draw distance |
| NEW-013 | Universal local Tool Manager cache, versions/licenses/user control | src-tauri/src/tool_cache.rs Invader-only | **PARTIAL** | Cache approved tool, verify hash, select and run |
| NEW-014 | Glue maps AND supported server settings, rotations, mods and logs | Current native runtime adapters only | **NOT IMPLEMENTED** | Real server provider authenticates & applies change |
| NEW-015 | ChupathingyCE provider separate from OpenCE; Milenko distinction | Docs required | **PARTIAL** | Provider-specific version compatibility |
| NEW-016 | Safe dedicated-server launch/config/rollback with opt-in changes | No live server admin | **NOT IMPLEMENTED** | Approve local startup, test map rotation |

## Additional mandatory cross-cutting gates

- Original 67 historical files and stock Halo installations must remain byte-identical unless the owner explicitly requests an authorized change to a managed copy.
- All real game tests must specify exact target runtime, version, input/output hashes, resource requirements and proof of loading/behavior. Never equate JMS export, mocked network messages or a successful dependency graph with a Halo gameplay test.
- The selected engine decides which operations are available. Mac Demo and retail support are not equivalent to MCC, Custom Edition, OpenCE, or ChupathingyCE. Mota and Milenko's runtime affiliations should not be conflated.
- Phases 3–10 are a PRODUCT specification and a dependency-ordered roadmap; they are not proof of completion.
- Advanced features that remain missing must be visible in `docs/REMAINING_WORK.md` or the issue tracker and only be marked superseded with explicit founder approval.
- Local Halo files may be used for authorized personal previews, but copyrighted game assets and Mota's decompiled research should not be bundled or publicly redistributed without rights.
- For each manual test: stable ID, priority, status, why it cannot be automated, exact existing UI instructions, expected result, failure symptoms, evidence and safe rollback.

## Recommended implementation order

1. Verify the repaired actual cache reader in Rust/Windows and render real rocks/trees in the existing 3D world.
2. Add local bitmap/shader/lightmap/sky decoding and actual Halo-derived textured materials; do not substitute AI-generated art.
3. Connect the Tag Editor and 3D object selection, preserve changes, and prove edit-build-play in an installed Halo runtime.
4. Recover editable BSP *source*, implement safe terrain tools and cave geometry with recompiled collision/portals/PVS; only then expose "playable" authoring operations.
5. Complete QuickForge, campaigns, cinematics, smart assets, Firefight/Zombie Apocalypse and tested runtime adapters.
6. Add safe server-provider controls, Guilty Spark Share, multiplayer, team revisions, playtest evidence and legacy exports.
7. Polish Halo CE Classic UI, Theme Forge and Sound Workshop using locally owned assets, then run complete private-alpha tests.

**Reconciliation rule:** Any accessible original requirement absent from this matrix must be added, not discarded. If original Phase 3–7 verbatim text is missing, mark its comparison *source unavailable*, not *100% lossless*.
