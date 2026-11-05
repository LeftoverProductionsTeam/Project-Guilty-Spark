# Project Guilty Spark — Requirements Source & Provenance Index

**Checkpoint:** 2026-11-04 (Eastern). **Purpose:** prevent loss of product scope while preparing a post-repair source-code/UI audit and a one-prompt-at-a-time Codex plan.

**Status: PROVISIONAL SOURCE INDEX, NOT THE COMPLETE MASTER LEDGER.** It does not assert that 398 unique approved product features have been counted. It does not imply that reported software behavior has been independently tested. Do not use this file to replace newer authoritative project records.

## Count reconciliation (different measurements, DO NOT SUM)

| Historical checkpoint | Recorded count | Meaning / verification |
|---|---:|---|
| Early Phases 3–10 reconstruction, Oct 26 | 92 | Granular historical requirements in `GuiltySpark_Phases3-10_Requirements_Gaps.md`; independently inspected file. Not exhaustive. |
| Earlier crosswalk, reported Oct 26 | 122 | Historical crosswalk items in past chat; original canonical crosswalk not independently re-counted here. |
| Oct 28 report | 223 | Tracked requirements/evidence records reportedly in a historical ledger, based on previous conversation; source ledger not independently retrieved here. |
| Oct 30 report | 342 | Requirements/evidence ledger records in previous ChatGPT conversation; source ledger not independently re-counted here. |
| Oct 31 report | **398** | Latest located historical requirements/evidence ledger checkpoint, reportedly preserving **391** previous IDs. This is NOT 398 verified unique/finished features. Source ledger still needs recovery from post-repair code. |
| Nov 3 canonical research | **274 findings, 116 sources, 32 workflows, 17 tool profiles** | Verified in Library `/Project Guilty Spark Research/README.md` (pass 7). Research findings are not automatically founder-approved features. |
| Nov 4 proposed research delta | 5 candidate additions | UI-044, UI-045, INVADER-009, UI-046, PROJECT-009; previous research work reported writeback unsuccessful. Must check current canonical DB before claiming imported. |
| Nov 4 original queue backup | 25 prompts, #4–#28 | `/Project Guilty Spark/Prompt Backups/2026-11-04_Original_Prompts_04_to_28.zip`. Seven byte-preserved attachments, 15 transcript extracts, three chat-original drafts; formatting/provenance distinctions in ZIP manifest. |

**Outstanding:** Recover the canonical source ledger that held 398 entries and audit for new entries since Oct 31. Preserve every stable ID; never discard an entry based on a newer prompt omitting it. The net count of deduplicated unique, approved product requirements is UNKNOWN until this reconciliation is complete.

## Source hierarchy (do not substitute one for another)

1. **Founder-requested product behavior:** direct user decisions in earliest October 2026 chats, later chats, and explicitly approved new scope (including Nov 4 Mac Legacy and cross-platform native independence).
2. **Historical master ledger:** source repository requirements/evidence entries, reportedly 398 on Oct 31, 2026; this may mix requirements, evidence and tests.
3. **Early phase requirements:** 92-row reconstruction (Phases 3–10) and older 122-item crosswalk. Historical statuses are not present-tense assertions.
4. **Original engineering directives:** the 25 preserved numbered prompts #4–#28 with separate source provenance.
5. **Research database:** 274 dated source-linked findings (not 274 approved features); older archived versions are evidence, not overwrite candidates.
6. **Community and Discord discussions:** user-provided HaloMods excerpts, source-linked findings and #24 prompt; classify as proposed feedback, reported defect, documented limit or founder-approved product request.
7. **Actual current source and tests:** only post-repair code audit may establish implementation, integration or native gameplay acceptance.

## Feature families to reconcile, beyond the numbered prompt titles

These are **families**, not one counted row per line, not proven implementations, and not a substitute for atomic acceptance criteria:

### Original MacGamingMods creator experience
- Halo Mac Demo / Halo Full / HaloMD and legacy source identity; PowerPC G4 export where feasible.
- Eschaton/HMT/Assembly-style searchable typed tag inspector with safe field/reflexive/reference editing and raw advanced diagnostics.
- SwordEdit/SparkEdit-style 3D scenario editing: place/move/rotate scenery, vehicles, equipment, weapons, spawns, netgame flags, gametype objects and teleporters.
- Renaming, safe imports/exports, derived cache rebuilding, resource bank resolution, dependency closure and original-data preservation.
- Native Apple Silicon DMG with core Mac editing independent of Eschaton, SwordEdit, Invader, Windows EXEs and optional Wine/VMs.

### Living world / mod authoring
- Drag-and-drop real Blood Gulch map, accurately textured BSP, rocks/trees/scenery, shaders, lightmaps, sky, fog, weather, water, animation and audio; avoid placeholder diamonds or wireframe-only renders.
- Real editable BSP source, vertex/edge/face operations, cutting, extruding, terrain sculpting, UVs/materials, sealed caves, tunnels, collision, portals/PVS, lightmap builds, compiled and game-tested output.
- Timberland–Sidewinder two-way human traversal, then legitimate Silent Cartographer/Death Island multi-region tests; streaming separate from enlarged BSP or BSP switching.
- Source Guardian and non-destructive edit-build-play workflow; verify compiled cache vs loose tags vs 3D source, preserve original hashes, valid Undo and failed-build recovery.
- Native tag/asset studio: bitmaps, sound, music, model, skeleton/animation, collision/physics, weapons, vehicles, bipeds, HUD, UI, text, effects, shaders and dependencies.
- Cross-tool optional adapters and true source-aware round trips for Baboon, Blender addons, Guerilla, Sapien, Tool, Invader, Mantle, OpenTool, Reclaimer/Mozzarilla and Excession.
- Conversion by genuine target format: retail PC, CE, Xbox, Mac Demo/Full, MCC H1A, OpenCE, Chupathingy and verified forks, with actual engine load/gameplay evidence.

### Missions, gameplay, community
- Visual HaloScript/Logic Events and hand-authored script preservation; door and trigger behaviors, mission objective tree, AI encounter editor, checkpoints, cinematics, native build.
- First Contact playable short campaign, insertion/extraction and real objectives.
- Firefight/Zombie survival configurator with real AI combat, wave logic, scores, dropships, difficulty, audio and finish states; original Fonzie/Fonzeh Zombie Apocalypse restoration preserving source provenance and carrier gameplay.
- Multiplayer: native game-type flags for Slayer, CTF, KOTH, Oddball, Race, teleporters, vehicles/powerups; dedicated host/join/map voting, maps and authorized downloads, cross-runtime protocol honesty.
- Real multiplayer AI spawn/combat/damage/death/cleanup/reconnect; SparkLink source collaboration distinct from game replication.
- Experimental runtime-specific ambitions: 128 players, six-player co-op, four-player local splitscreen, actual concurrent BSP streaming, VR; never promote proposals to production features without testing.
- Recording Director timeline, named takes, real in-game camera capability where supported, native cutscene output and consented capture.
- Guided first-use, Tool setup, creator tutorials, Rocket Pistol, test arena, authorized maps, glossary, old-school tips, local Halo resource-based themed UI and sounds.
- Real Mac, Linux and Windows downloadable app packages, native-editor independence, signing/notarization where authorized, clean-machine tests and controlled release.

### UX and reliability (explicit design requirements)
- One coherent navigation system, source-aware contextual editing, accurate Apply: Source / Rebuild / Live Preview choices.
- Creator-centric command hub, detachable native windows, multiple maps, retained workspaces, tabs, ownership-safe Undo, multi-monitor layouts/recovery.
- Clean smooth rectangular tabs; no heavy glow/stripes; don't crowd the header; Tools/View/Studio menus appropriate for controls.
- Clear, consistent game/source/build identity; never count renderer preview as native output or native compile as game acceptance.
- Compact UI that works at 1366x768, on Mac/Linux/Windows with keyboard navigation and accessible controls; no inert or duplicated screens.
- Bounded staging/storage; no recursive `.local` source clones, no unbounded SDK duplication, no global AGENTS.md deadlock on human-only acceptance.

## Discord/community intake — exact source distinction matters

| Community lead | Proposed engineering issue / feature | Classification until reverified |
|---|---|---|
| mOTA-lEV | First-class direct `.map` editing; investigate reported scenario-editor failures, don't force loose-tag Blender/Tool round trips for safe changes | Founder's accepted design priority + externally reported defect |
| leftknut | BSP merging, avoiding unnecessarily complex export/rebuild cycles, separate Firefight engine work; clarify editor/tool ownership and licensing | Research/interoperability; external tool capabilities version-dependent |
| dunetua | Hammer++-quality Halo BSP authoring and structural visualization | Founder-supported direction; native gameplay acceptance pending |
| Sako | Correct native Tool verb/argument discovery and auto-filled GUI workflow | Community capability reference; no public implementation assumed |
| Renette | Animation pokes or tag reloads reportedly crash or decontrol AI / consume object budget | Unverified runtime-specific failure; fail closed on unsafe writes |
| Crisp/Foundry | Blender ↔ TagTest scenario placement / camera workflow; do not infer Halo CE live-command support | Edition-specific research lead, not verified CE API |
| Halo 3/Reach lighting discussion | Airprobe/object-lighting issues; distinguish from Halo 1's actual dynamic lighting/lightmap behavior | Later-engine-only reports; don't copy directly to H1 |
| Halo 2 split resources discussion | Correct authoritative edit source and scenario resource ownership | Halo 2 behavior; test H1 separately |
| Community Sapien observations | Environment/cluster edits losing or shifting detail objects, mode-specific teleport effects, external reload confusion | Version-specific reported defects; non-destructive diff checks |
| Community workflow feedback | Upstream contribution, creator credits, avoid another parallel editor, map attribution and licensing | Accepted collaboration/UX principles, not permission to copy code |
| Additional community issues | Tool WRL open edges, geometry intersections, missing AI firing positions, shader/UV repair, preview-vs-native mismatch, repeated CLI history | Source-linked research backlog; prioritize by actual reproduction |

### Discord source location and limitations
- `/Project Guilty Spark Research/SPARK_RESEARCH_LIVING.md` contains DISCORD-001 onward and linked/dated report status.
- `/Project Guilty Spark Research/SPARK_LIVE_EDIT_AND_UI_AUDIT_20261103.md` documents Sako and Renette report specifics with verification boundaries.
- `24_Final_Universal_Halo_1_Integration.txt` in the recovered prompt ZIP has the community-driven workflow repair section beginning at Phase 3.
- Original raw Discord transcript/log exports may not all be saved here. Research-derived summaries cannot be treated as exact verbatim quotes. Preserve reporter and uncertainty wherever known.

## Master-ledger contract for the next full source audit

Each atomic requirement should have: stable ID; title; canonical user wording or authorized restatement; originating conversation/prompt/research source and date; requestor type (founder/community/research); classification (product feature, constraint, defect, test/acceptance, idea); target game/runtime/OS; related requirements; original owner priority; exact implementation file/function and callers; UI route/control; test evidence level (source, unit, native readback, build, engine, gameplay, multiplayer, clean install); status; risk; dependencies; recommended staged Codex work; explicit supersession approval when applicable.

Never delete an old ID. Merges should retain aliases/parent-child relationships and historical wording. An unverified community idea remains a candidate until the founder accepts it. A failed or unresolved acceptance gate stays open without halting unrelated engineering. Do not claim the ledger is complete until the recovered 398-record source, early prompts/chats, archive and Discord are reconciled against the repaired repository.
