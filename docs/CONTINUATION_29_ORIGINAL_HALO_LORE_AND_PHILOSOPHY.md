# 07 Halo Modding Brain · Continuation 29
## Why the old Halo community matters to a modern, genuinely integrated editor

**Research refreshed:** 2026-10-26. **Scope:** historical tools, workflows and constraints, with original creators credited and a concrete, source-safe feature translation. This is independent interpretation of documented histories, not a claim that proprietary Halo assets, complete old program sources, or the user's original 2000s projects were recovered. The upstream archive may have changed since research. See links below.

### The real promise: 'open a map, figure it out, change it, try it'

Early Halo 1 modders often started with the shipped cache rather than a clean set of editable source tags. Halo's data-driven engine made experimentation accessible: changes to a weapon projectile, a bitmap, an object position, a shader, or a spawn could create something immediately recognizable. The fun was the feedback loop and the possibility of discovery. Many modifications were shared as compiled `*.map` releases because the community did not always possess the creator's source assets and the official toolchain was more demanding than direct cache editing.

**Spark's objective is not to discard that experimental immediacy.** It must preserve the visual, searchable experience of older applications but make each experiment recoverable: preserve the untouched cache and its SHA-256; work on reversible overlays or isolated source tags; show dependency consequences; compile using an explicitly identified engine toolchain; compare and test the output; share a source recipe whenever permitted.

### Real authors and tools, without romanticizing their failure modes

| Tool/era | Documented role | Practical modern Spark design | Failure boundary |
| --- | --- | --- | --- |
| **Halo Map Tools (HMT)** — MonoxideC and tjc, 2004 | Popular H1PC/H1X cache tag editor, injector and bitmap/model/sound extractor | Discover typed tags, trace references, preview assets from owner-selected caches, extract compatible `.tag` into an isolated source directory | Injecting compiled cache assets is not the same as compiling clean source; unavailable metadata cannot be guessed |
| **Eschaton** — Altimit01 | H1 PC/Mac/Trial/CE tag editing, texture extraction/injection and XML-extended formats; rebuilt maps could mix injected tags | Tag Lineage Inspector plus new **Cross-map Tag Migration Preview**, reporting exact class/path identity and unresolved references | Older direct editing could leave processed/runtime fields inconsistent and occasionally crash maps with `Gathering Exception Data` |
| **SparkEdit** — Grenadiac | 3D editor that allowed visually arranging scenario objects in H1PC | Use authorable QuickForge geometry and real indexed scenario placements, preserving undo/redo and original files | Scenery “log mods” are object placement tricks, not automatically watertight authored BSP/collision |
| **SwordEdit** — bobindashadows, Sword, Samuco | OS X fork of SparkEdit, part of the original Mac modding experience | Optional separately installed companion app beside integrated Spark, plus safer native placement editors | Old app startup and tag compatibility depend on OS/runtime; app launch is not proof of safe saving |
| **Guerilla / Sapien / Tool** | Tag editor, scenario/BSP placement editor, geometry importer / compiler | A single Spark front-end for source modeling, scenario plans, tags, audit and build receipts | A rendered editor mesh alone is not a valid compiled collision BSP, portal graph, lightmap or playable cache |
| **Invader** — SnowyMouse and Vaporeon | Community tag extraction, dependency tools, validation and cache building across H1 editions | Owner-installed and SHA-checked native extraction/build adapters; strict preflight, compilation and output verification | Cross-edition tag conversion can be incomplete; many source tags have dependencies outside the shallow inspected index |

Sources: [Reclaimers — Obsolete tools](https://www.reclaimers.net/h1/community-tools/obsolete/), [Halo 1 tags](https://reclaimers.net/h1/tags/), [Invader](https://c20.reclaimers.net/h1/community-tools/invader/), [Tool overview](https://reclaimers.net/general/mod-tools/).

### New in Continuation 29: the classic tag transplant, without blind cache surgery

A familiar old project was to take a projectile, vehicle, HUD asset, or weapon from one map and try to reuse it in another. The modern safe workflow is more demanding than changing a cache datum ID, because **datum IDs are local to a given map**. Identically named tags can also have different contents, references and processed fields.

1. In **Tags**, select a source tag from a SHA-matched preserved cache, inspect indexed relationships with Tag Lineage and export **tag reference + dependencies**. The JSON is *metadata only* and deliberately refuses a reference list that would be silently truncated, as well as a selected tag with unrepresented staged edits.
2. Open the destination map, which must also have a SHA-matched source inspection. Select the source JSON in **Cross-map Tag Migration Preview**.
3. Spark compares **case-insensitive normalized tag class plus path**, never source datum ID, reporting `identity-present`, `not-present`, `class-conflict`, and immediate dependency states: target-present, selected-source-only, missing, class conflict, no source path or internally inconsistent reference.
4. If cache version or engine identity differs, the review marks porting unconfirmed; no arbitrary "just inject it" conversion is performed. Every preview is read-only, even when names match. Exported reports omit tag names and paths and label all compiled/runtime proof as false.
5. When a creator has the rights and compatible tools, independently extract the *actual* source tags with Invader or an appropriate Editing Kit, confirm the full recursive dependency tree, rebuild a new map and test it on the target engine. Spark's preview does not automate or certify this final step.

**Why this matters:** A class/path collision can mean a tag is not the same kind of object. A matching identity is not a byte hash. References can be missing from an inspected cache schema, and some data lives in shared resource maps. Without these cautions, a clean-looking transplants UI would recreate the old corruption problems.

### The 'log mod' philosophy and reproducible reconstruction

[HaloMD's public mod archive](https://halomd.macgamingmods.com/mods/) lists **Log Mod ++**, *Log Mod Extreme*, *Zombie Apocalypse 1.0*, *Bloodgulch Extreme*, and many other experiments. The archive preserves examples of improvisation: use existing game objects as construction blocks, alter projectile behavior, and turn familiar multiplayer spaces into unexpected experiences. The archive listing shows a named historical release, **not** that editable source scenarios, code, ownership rights or verified modern gameplay were recovered.

Spark should eventually offer *two honest routes*: a quick, reversible scenery-based preview reminiscent of log mods, and a genuine original geometry/portal/collision build that can become a new map. Label these routes separately. Source-aware conversion to real BSP cannot be a trivial "merge scenery" checkbox.

### Real BSPs and why portals are a gameplay feature

[Reclaimers BSP troubleshooting](https://reclaimers.net/h1/guides/levels/bsp-troubleshooting/) documents the mostly sealed-world requirement, open edges, degenerate faces, nearly coplanar surfaces and material exceptions. The [portals and clusters guide](https://www.reclaimers.net/h1/guides/levels/portals-and-clusters/) explains why `+portal` and `+exactportal` divide closed spaces into potentially visible clusters and why valid portal placement must satisfy exact sealing requirements. Portals also influence fog, weather and acoustics. Therefore **automatic tunnel/room cutting must validate sealed topology, collision and portal relations**, then run the actual structure compiler. A successful QuickForge topology pass alone cannot certify it.

A classic WRL/error workflow should remain recognizable: select the compiler's warning, see the affected source brush, repair it reversibly, rerun a fresh Tool compilation, and preserve compiler output with the source revision. Current Spark does portions of that flow; complete Boolean BSP cutting, PVS reconstruction and engine-tested collision remain open.

### Halo Demo, Halo PC, Halo CE, HaloMD, MCC — no universal cache

[Reclaimers' porting guide](https://www.reclaimers.net/h1/guides/porting-maps/) documents edition-specific cache versions, compression/limits, `model` vs `gbxmodel`, shader changes and script feature differences. The recommended general workflow extracts tags, identifies custom content, adapts tags for the target base tagset, and builds with a compatible tool. A tool that opens a map is not necessarily a tool that can write a playable edition-specific map.

The user's separate **PowerPC G4 / original Halo Mac Demo** ambition is not a claim that modern Windows, Wine, or a macOS Tauri app can natively run the old game. The desired acceptance is a **modern-PC authored mod** transferred and loaded on real G4-era Halo Mac Demo in its own supported environment, with original files preserved and documented results. This remains unimplemented/unverified; older Mac formats need an independent test matrix and legally held game files. HaloMD's own [site](https://www.halomd.net/) notes that its program does not run on macOS Catalina (10.15)+.

### Interface from the creator's own game: authentic, not redistributable

The original Phase 9 vision included Halo CE Classic, UNSC, Covenant and Forerunner looks, bitmap layouts, event sounds and authentic menu behavior. The present app offers theme foundations, local verified bitmap header art, owner-selected cue references and an extensible UI; it is **not** a full 1:1 user-owned `ui.map` sprite atlas/theme editor. Future tasks include multi-sprite region selection, layout anchors, accessibility scaling, contrast, controller input, fallback styling and a source-hash-pinned cache-only preview. Never bundle copyrighted menu textures or sounds.

### Mota-Lev's scenario work and the integrity rule

Earlier prompts requested auditing Mota-Lev's large research/code collection and documented scenario-editor failures. The original complete external code dump has **not been recovered and audited as part of this source continuation**; notes and failure classes remain in `LEGACY_SCENARIO_FAILURES.md`. Never import uncertain third-party binaries or decompiled source without a rights and security review. Common pitfalls recorded in Spark's historical handoff include invalid scenario palette IDs, pointer offsets, BSP format assumptions, wrong object classes and uncompiled collision. Preserve exact source provenance and turn every reproducible failure into a regression fixture before proposing automatic correction.

### The 07 Halo Modding Brain philosophy, written as acceptance rules

- **Experimentation without fear:** Preview, explore and stage reversible edits without modifying installed maps.
- **Tag graph before the transplant:** Show source identity, candidate classes, missing references and exact engine compatibility; no universal datum IDs.
- **Source and rights first:** Creator credits, license, hashes and export recipes stay with the mod.
- **Honest binary boundaries:** Read-only import inspection != editable source != compiled tag != playable map.
- **Human-visible failure:** A compiler error must not turn into a fake success state; surface the failure with actionable geometry/tag context.
- **One modern workbench, old friends optional:** Companion applications are user-installed and separately, explicitly launched; Spark integrates the core workflows itself.
- **Respect original design:** Forerunner mystery, bold CE visual hierarchy and memorable audio should derive from local owned assets, with clean readable fallback styling.
- **Share re-creatable work:** With permission, share sources, dependency manifests, build versions, tool versions and test evidence rather than just a fragile modified cache.
- **Gameplay is the final proof:** Tested Slayer, CTF, Oddball, King, Race, Firefight and Zombies need real engine evidence. A static graph or offline test never proves networked AI.

The named historical credits and source links are retained in the existing credits/catalog. This document extends research and product decisions; it includes no third-party executable, tag, mod cache, bitmap, audio or decompiled code.
