# PROJECT GUILTY SPARK - DISCORD-DRIVEN NATIVE AUTHORING & COMPATIBILITY

**Queue-ready Master Engineering Prompt | Research intake: November 5, 2026**
**Priority:** P1 where native correctness, data integrity, and real editor usability are involved; P2 for other-engine research and optional workflows.
**Place in:** `docs/Master Engineering Prompts/`
**Execution:** Resume from the latest actual Codex checkpoint. Apply AFTER the active source-only repository/storage directive. Integrate into the existing `MASTER_FEATURE_LEDGER.md` without creating duplicate requirements.

## Mission

Use practical problems reported by Halo modders to improve Guilty Spark's existing all-in-one level, BSP, tag, gameplay, asset, and native-tool workflows. This is an **evidence-led integration and verification task, not permission to rewrite Spark or create a new engine/tool suite**.

The primary implementation target is **Halo 1 / Combat Evolved** across explicitly supported runtimes (including retail PC, Custom Edition, HaloMD/Mac Demo, original Xbox where tooling permits, MCC Halo 1, OpenCE, and Chupathingy, with version-specific limitations). Halo 2/3/Reach reports are useful references or future compatibility research, **not proof that their commands, tags, lighting systems, or AI orders exist in Halo 1**.

### Mandatory starting procedure

1. Inspect canonical local `master`, pending edits, active agent checkpoint, `docs/Master Engineering Prompts/`, `MASTER_FEATURE_LEDGER.md`, existing source and native-tool adapters.
2. Locate existing BSP Workshop, QuickForge, Blender/DCC integration, Tag Inspector, shader/material handling, collision readers, AI/encounter tools, HSC scripting, compiler adapters, error reporting, and storage safeguards. Reuse them.
3. Map each finding below to an existing ledger ID or add a uniquely identified, scoped requirement only if no equivalent already exists. Preserve original IDs and acceptance histories.
4. Record what is already supported, partially supported, broken, unsupported for that runtime, or blocked on external tools/human gameplay.
5. Implement the smallest coherent corrections in dependency order, preserving native data, Undo/Redo, retained UI state, and existing Halo compatibility.
6. Prefer real native toolchain results and independent readback over mocked demonstrations. Do not report a feature fully accepted without evidence required by its gate.

## P1-A: BSP material semantics and smooth stair collision

**Community trigger:** A modder tried using `@` on stair-clipping geometry, received open-edge errors, and succeeded with a simple four-vertex plane using `*` sphere-only collision. Do not generalize all open surfaces or all materials from that anecdote.

**Verified Halo 1 semantics:**

- `*` = non-rendered large/sphere-only collision, used for player/vehicle clipping; ray tests such as projectiles can pass through it. Useful for invisible ramps over stairs.
- `@` = non-rendered ordinary collision, blocking all relevant collision tests, and follows sealed-world rules.
- Other Halo 1 symbols (render-only `!`, two-sided `%`, transparent `#`, fog plane `$`, ladder `^`, etc.) have their own native semantics. Preserve them; do not convert all special surfaces to regular sealed geometry.
- **Material symbol rules are runtime-specific.** Never apply an H3 instance-object naming rule as though it were an H1 material rule.

**Required engineering:**

- Inspect the current material parser, BSP surface validation, collision renderer, JMS export, and native compile path for correct handling of the original per-engine symbols.
- Distinguish sphere-only clipping from full collision visually and in the inspector, including whether players/vehicles, bullets/rays, and shadows are affected as applicable to that runtime.
- Within existing BSP Workshop/QuickForge, offer a *non-destructive* optional 'Smooth Stair Clip' operation that proposes a simple plane/ramp with the right native material and previews its shape/clearance; do not auto-modify existing geometry without user direction.
- Check that open-edge diagnostics correctly exempt supported non-manifold special surfaces where native semantics allow them, while still enforcing sealed-world rules for ordinary collision.
- Round-trip H1 material assignments through Blender/JMS/native Tool or Invader and verify compiled collision semantics. Where possible, human-test stair traversal and projectile passage; keep human gameplay pending if untested.

**Acceptance:** Correct native field/material representation; no unrelated mesh modifications; Undo/Redo works; compile/readback succeeds; tests distinguish `*` vs `@`; gameplay claims remain scoped to actual tests.

## P1-B: Blender terrain, scale, topology, and BSP diagnostics

**Community trigger:** Requests for displacement/bumpy terrain creation; mismatched perceived level/Spartan scale; recurring open-edge errors.

**Required engineering:**

- Inspect the existing Blender/DCC and 3D editor workflows. Make it possible to create/import reasonably subdivided terrain, sculpt elevations, retain UV/material assignment, and compile to actual Halo 1 BSPs where the native toolchain supports it.
- Validate inward-facing normals, non-manifold/open edges, overlapping/intersecting collision faces, duplicate or degenerate triangles, T-junction-like problems, nearly coplanar surfaces, overly short edges, excessive subdivision, incorrect units and out-of-range world scale.
- Display diagnostic geometry in Spark when available from the existing native BSP compiler (for example, WRL diagnostics). Link each warning to the affected mesh/surface and offer a safe, previewable fix where feasible. Never silently delete user geometry.
- Provide a target-specific scale reference. With default H1 JMS export conventions, c20 documents Master Chief at approximately **70 JMS units**, and Tool can merge vertices closer than about **0.1 JMS units**. Verify exporter settings before applying those measurements; do not equate them with unverified H2/H3 scales.
- Preserve native BSP details that cannot be regenerated from a plain JMS, such as applicable palettes, detail objects, cluster properties, fog/weather/sound associations, portals, and other compatible data.
- Benchmark current performance and memory behavior on representative small and large maps without duplicating entire editing kits or source-tag trees.

**Acceptance:** Reopenable Blender/Spark source, stable coordinate transforms, compiled native BSP and independent readback, clear actionable diagnostics, source maps unmodified, bounded temporary storage. Real engine movement and collision remain a separate acceptance gate.

## P1-C: Native compiler safety, interruption, and tag-data fidelity

**Verified hazard:** The Halo 1 Tool documentation warns that prematurely killing `tool structure` can leave an incomplete BSP tag and discard data not recoverable from the JMS. The safe solution is NOT merely to kill a write when a quota is reached.

**Required engineering:**

- Inspect all external native compiler/editors (H1 Tool, Invader, compatible MCC adapters, etc.) for write paths and destination ownership.
- Before starting a native operation, establish its required writable inputs and expected outputs. Compile only against a disposable, user-authorized or tool-owned staged output where the compiler supports it, **never against an irreplaceable original**.
- Verify adequate capacity **before** starting a known non-interruptible/unsafe native write. Do not cancel/kill an in-place destructive compiler operation to enforce a budget; fail preflight or isolate its output instead.
- On failure, retain the last valid project state and any compact diagnostic needed to reproduce the problem. Remove only known disposable products after all handles have closed. Never delete original Halo runtimes, source, unique edits or user-directed outputs.
- Detect corrupt, truncated or mismatched tags, offsets, class references and version mismatches without speculative automatic repairs.
- Incorporate the previously researched Invader extraction/default-field risk: if a value is not recoverable from a compiled map, mark it unknown/derived rather than claiming byte-perfect original recovery.
- Expose a clear native-tool error message, affected input/output, tool version, exact failed step, and non-destructive remedy in the existing UI.

**Acceptance:** Success, compiler failure, quota refusal, process crash and application restart all preserve original asset hashes. Native output independently reopens. No unexplained persistent directories remain. Recovery statements are based on observed results, not assumptions.

## P1-D: Halo 1 AI encounters, navigation, pursuit and game-mode authoring

**Community trigger:** Halo 2 modders struggled to make an AI squad chase a player despite magic sight/follow settings. The root issue involves order/area/path planning, not merely visibility. This is a design lesson, NOT an instruction to import Halo 2 APIs into Halo 1.

**Required engineering for Halo 1:**

- Inspect existing encounter and squad placement, firing positions, command lists, path/area connections, migration, activation, line-of-sight, player-targeting, spawn triggers, script compilation and engine capability gating.
- Provide meaningful diagnostics for inaccessible destinations, firing positions not connected to playable space, unconfigured migration/follow behavior, inactive encounters, uncompiled scripts, and runtime-specific unsupported functionality.
- Validate applicable H1 functions such as `ai_follow_target_players`, `ai_follow_distance`, `ai_migrate`, `ai_place`, `ai_reconnect`, and other functions **against the selected runtime's actual native scripting reference**, not arbitrary remembered names.
- The H1 documented `ai_follow_target_players` behavior relies on suitably labeled firing positions and may require migration between sets. Present that requirement in the existing authoring UI.
- For Firefight, Zombie Apocalypse, custom games and other existing goals, test actual spawn -> navigation -> combat -> death/recovery flows. Distinguish script behavior from gameplay behavior and actual multiplayer AI synchronization.
- Remember that standard Halo 1 multiplayer AI is not automatically synchronized. Do not infer completed network AI support from local Sapien tests, solo gameplay or matching entity IDs.

**H2/H3 study only:** H2 Orders/Primary Area Sets, follow radius, `cs_go_to`, `ai_magically_see_object`, magic sight flags and H2 script-recompile behavior must be isolated behind explicit engine-specific adapters if ever supported. Do not claim these are Halo 1 features.

**Acceptance:** H1 native scenario/script builds, independent readback, actual solo gameplay for any claimed pursuit behavior, and separate two-peer testing before claiming synchronized multiplayer AI.

## P2-A: Native Tool XML bulk-export integration

**Community trigger:** Halo 2 Editing Kit's `export-tags-to-xml` uses an input listing, not the same arguments as `export-tag-to-xml`. The final line must end with a newline. Community members report that quoting fields inside that listing can break paths.

**Important correction:** Official c20 documentation also identifies `export-tags-to-xml` in **H1A Tool**, but NOT necessarily in legacy HEK Tool. Version detection is mandatory.

**Required engineering:**

- Inspect Spark's existing Tool command generator, per-tool capability registry and task history.
- Support bulk XML export only when the discovered installed tool/version actually exposes the verb.
- Generate correctly encoded entries as `<relative-tag-path>,<output-xml-path>` with the mandatory terminal newline. Confirm path conventions separately for H1A Tool and H2 Tool.
- Test spaces in paths, special characters, backslashes, absolute/relative requirements, missing tags, read-only destinations, malformed lines, empty listings, cancellation and independent XML readback. Treat the Discord advice about 'no inner quotes' as a test hypothesis, not an across-version rule.
- Where a version lacks the bulk verb, offer a supported existing alternative rather than passing unsupported arguments.
- Store command templates/history only as part of the user's chosen project/settings persistence, not a new hidden archive.

**Acceptance:** Actual supported-tool execution with a small known tag set and matching XML files, clear version-specific errors, no permanent temporary listing files.

## P2-B: Lighting, fog, materials, and engine identity

**Community trigger:** Halo 3 instance geometry showed poor illumination near surfaces; discussion mentioned airprobes, baking and material policies, but did not establish a universal fix.

**Required engineering:**

- First audit H1's existing lightmaps/radiosity, shader/bitmap/material assignments, fog planes, portals, source lighting, editor previews and native export fidelity. Avoid visual 'fixes' that diverge from in-game results.
- Preserve each supported runtime's actual material, bitmap, lightmap and fog fields; expose discrepancies with engine-verified evidence.
- For any actual H3 adapter under investigation, distinguish single-probe, per-vertex and per-pixel instance lighting, and their memory/resolution trade-offs. The H3 documentation warns that single probes can show harsh lighting transitions and that per-pixel instances consume BSP lightmap resolution.
- Do not introduce Halo 3 probe, instance or lighting tags into Halo 1 formats. Do not mandate an arbitrary 'put probes away from geometry' rule without supporting tests.
- Treat claims about Source-engine visual style, atmosphere, postprocessing, or compositing as artistic research, not proof of native Halo interoperability.

**Acceptance:** Target-specific material/lightmap/fog readback, preserved native tag data, representative visual comparisons and honest preview limitations. Do not mark lighting fidelity complete from editor screenshots alone.

## P2-C: Crash diagnostics and wrong-engine tag detection

**Community trigger:** A Reach `tag_test`/`tag_play` assertion was reported:

`destination_block->definition==source_block->definition`

The actual corrupted source, incompatible tag, or compiler cause was **not established** by the conversation.

**Required engineering:**

- Inspect existing diagnostics for engine/tool version, expected tag class and block layout, source/destination tag identity, missing definitions, tag dependencies, length/offset violations and failed native readback.
- Preserve a minimal reproduction and exact failure context when user supplies it, without retaining multi-gigabyte crash artifacts.
- Report hypotheses separately from verified diagnoses. Never auto-'fix' source blocks by guessing unknown layouts or swapping tag classes.
- Avoid pretending to support Reach/H2/H3 compiled data via a Halo 1 parser simply because a field name is similar.

**Acceptance:** Accurate version mismatch and malformed-tag reporting without original-data modification.

## Cross-cutting user experience and storage contract

- **No rewrite and no competing subsystem.** Use existing windows, Tag Inspector, BSP Workshop, QuickForge, compiler adapters, Undo/Redo, source recovery and project settings.
- Validate interrupted C69/C71 interface work: contextual controls, reachable settings at **1366x768**, resizing, keyboard navigation, detached-window persistence, crash restart, camera retention, and reliable UI-to-backend wiring.
- The application must read selected Halo runtimes/maps from their original locations without copying them. Ask users whether to choose a mod/export folder; automatic map backups default to **zero**, with user-selectable retention when explicitly enabled.
- No persistent user-file writes other than explicit save/export and user-chosen settings/backups. Warn when unsaved RAM-only changes cannot survive a crash. Native compilation may use an isolated, bounded, disposable workspace as required.
- The source repository contains canonical code, required libraries/manifests, documentation and compact essential test fixtures; not generated QA warehouses, full SDK copies, recovery archives or retained caches.
- Inspect any new file/directory over **40 MiB**, but do not mistake that inspection threshold for a valid maximum Halo map size. Measure physical bytes before/peak/after operations. Do not claim safe storage from a passed unit test alone.
- All edits are non-destructive to source. Maintain clean user-authorized output separation and verify unchanged original hashes in acceptance fixtures.
- No proprietary native tag extensions: store Spark-specific metadata in sidecars or project structures, and use explicit format conversion when necessary.
- Continue the master roadmap after completing these scoped corrections. No unapproved pushes, publications, Git history rewrites, or irreversible unique-data deletion.

## Required validation matrix

| Workstream | Minimum automated evidence | Native / human gate |
| --- | --- | --- |
| `*` vs `@` and stair clip | Symbol parsing, topology checks, Undo/Redo | H1 native compile + readback; in-game foot/ray checks pending until actually run |
| Terrain/scale/BSP | Blender/Spark round trip, diagnostics, source hashes | Compiler/JMS/WRL verification; human traversal |
| Tool interruption | Preflight/isolated output tests, simulated failures | Independent valid map reopen; untouched originals |
| H1 AI | Encounter/script validation and supported function checks | Real game pursuit; separate multiplayer-peer acceptance |
| XML export | Listing formatting, newline, path/version tests | Actual compatible H1A/H2 tool execution and XML output |
| Lighting/fog | Round-trip field checks, shader/bitmap references | Runtime-specific screenshot/game acceptance |
| Tag crashes | Class/version/offset mismatch tests | Reproduction with actual supplied failing tag |
| UI and storage | 1366x768, multiple windows, RAM/disk bounds | Clean installation and user-authorized save/export |

## Deliverables and stop conditions

1. An annotated **existing-ledger crosswalk**, without duplicate feature IDs, showing relevant components and what's already complete or unsupported.
2. Tested, small code changes that fix actual gaps; concise commits on the canonical local master with relevant native results.
3. A minimal source-data fidelity / format capability matrix for affected runtimes.
4. Clear before/peak/after storage measurements for affected workflows, with no retained unexplained generated files.
5. An updated checkpoint listing independently verified features, failed tests, genuine human gameplay gates, unresolved external-tool limitations, and the next engineering step.
6. Continue the next applicable Master Engineering Prompt after finishing the available work. Do not turn this into recurring research reports, another repository cleanup campaign, or a replacement editor.

**Never declare all of this finished merely because tests pass. Actual native builds and required gameplay are separate evidence gates.**

## References to consult and verify against installed tool versions

- Halo 1 material suffixes: https://c20.reclaimers.net/h1/source-data/h1-materials/
- Halo 1 BSP troubleshooting, scale, topology, WRL errors: https://c20.reclaimers.net/h1/guides/levels/bsp-troubleshooting/
- Halo 1 Blender terrain/sculpting: https://c20.reclaimers.net/h1/guides/levels/advanced/
- Halo 1 Tool safety and H1A XML export: https://c20.reclaimers.net/h1/h1-ek/h1-tool/
- Halo 1 scripting and `ai_follow_target_players`: https://c20.reclaimers.net/h1/scripting/
- Halo 2 AI Orders, zones/areas and following (H2 only): https://c20.reclaimers.net/h2/guides/encounters/advanced_encounter/
- Halo 2 bulk XML export format: https://c20.reclaimers.net/h2/tools/h2-ek/h2-tool/
- Halo 3 instance lighting (H3 only): https://learn.microsoft.com/en-us/halo-master-chief-collection/h3/art/instanceobjects/instanceobjectshome

**Evidence provenance:** November 5, 2026 community Discord excerpts supplied by the project owner; official/c20 references above where available. Discord hypotheses are not treated as validated facts unless independently reproduced.
