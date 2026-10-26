# Continuation 31 — the 07 Halo Modding Brain: modding culture into usable product design

**Research snapshot:** 2026-10-26. **Baseline:** exact checksum-verified Continuation 30 source. These are credited historical observations and design inferences; the presence of an archive listing is not evidence of a license to redistribute a mod or of recoverable, editable tag source. See all previous C27–C30 lore reports and `ORIGINAL_92_REQUIREMENTS_RECONSTRUCTION.md` for preserved context. Original Phase 3–7 text remains only partially recoverable; this continues the functional reconstruction, not a purported verbatim transcript.

## A tool that keeps the 2006–2015 wonder

The goal is not to turn the editor into an index of dead external apps. It is one **integrated** Halo 1 workbench, with optional original applications running beside it when their separately installed executable and environment are actually compatible. Reproduce the feeling of selecting a weapon, chasing a projectile's dependencies, dropping something into Blood Gulch, looking at a rendered change, then testing with a friend. The modern advantage must be explicit safety and repeatable source, not more opaque magic.

| Historical workflow | Verified historical evidence | Spark continuation | Important engineering boundary |
| --- | --- | --- | --- |
| HMT/Halo Map Tools | Reclaimers credits MonoxideC and tjc for early map/tag, texture, sound and model editing | Typed Tag Editor, tag lineage and artifact provenance | A compiled cache's datum ID is not a portable .tag file |
| Eschaton | Reclaimers credits Altimit01; multi-format map editing and XML plugins; edited runtime fields sometimes caused Halo exceptions | Managed, preserved-source edits and cross-map dependency planner | No arbitrary byte writes or unsupported tag injection |
| SparkEdit/SwordEdit | Reclaimers credits Grenadiac for SparkEdit, and bobindashadows, Sword and Samuco for its OS X fork | QuickForge 3D placement, native gizmos, reversible source seam repair | Moving a log or scenery object does not cut a room or rebuild collision/portals |
| Log mods | Reclaimers documents the fallen-log scenery technique; HaloMD lists **Log Mod ++ 1.0**, described as weapon-driven log placement | Fast creative source primitives, creator-friendly undo, scene editing | Source shell, compiled collision and pathfinding are different layers |
| HaloMD and Mac Demo | MacGamingMods lists **Fonzie's Modding Pack v5** and Eschaton 0.8.1; HaloMD lists **Zombie Apocalypse 1.0** | Time Machine/preservation, verified user-owned map import and catalog links | A listing does not establish an extracted source, correct creator attribution of every part, or functioning modern gameplay |
| HEK, H1A and Invader | Reclaimers describes Tool, Guerilla, Sapien, Standalone/Tag Test as distinct tools; Invader documents its modular extract/build family | Managed tools and engine-specific source validation | Source geometry → Tool structure → tags/scenario → lightmaps → game is an acceptance pipeline, not a UI preview |

## Crucial lore details that change UI decisions

### 1. The promise was instant discovery

Eschaton-style tag browsing made the seemingly mysterious world legible. C31 introduces a persistent-in-context **Field Guide** for all 19 workspaces, not another external launcher: tell the author what *is actually available here*, what remains impossible or unproved, and where to go next. A small, keyboard/touch-accessible explanation is more honest than a colored 'ready' indicator.

### 2. The price of direct cache hacks was unreproducible success

Reclaimers' obsolete-tool history explicitly warns that Eschaton-era cache edits might modify processed runtime fields without changing the fields necessary for a proper rebuild, leading to the historical 'Gathering Exception Data' crash. Preserve the exploratory workflow, not the damage. Spark must keep original cache files immutable, record SHA-256 provenance, reject unsupported patches, and make a source/rebuild boundary visible during every mode.

### 3. Structural BSP correctness needs an engine, not more promises

Reclaimers' level-creation guide recommends building a small box map and iterating early. Its troubleshooting guide documents sealed-volume rules and exceptions for appropriately materialed render-only fog/water/glass/ladders. Arbitrary 'fix all open edges' would damage legitimate geometry. The `+portal` vs `+exactportal` distinction is equally important. C31's new Academy small-map loop teaches **source checks → Tool structure/WRL → source repair → rebuild → actual Halo run**, with a manual proof gate.

### 4. Companions must remain optional

C28's local legacy companion feature remains an explicit register-and-launch action. A Wine installation or old `.app` bundle can be *detected* but never called 'working' until actually tested. Modern Windows GUI workflows, Apple Silicon Mac development, Mac Demo/G4 export and Linux through compatibility layers need independent target test matrices. Do not fold these targets into a generic 'universal Halo' green badge.

### 5. Historical source means ownership and credit

The old MacGamingMods/HaloMD list is a provenance lead, not a license. Keep creator names, original release URLs, version, ownership/permission notes and hashes separate from downloaded binaries. Continue the credited Community Thanks panel without bundling anyone's source code, textures, UI sprites or maps. User-selected Halo UI artwork may decorate Spark through exact SHA-pinned local decoding; it is not copied into a theme ZIP.

## Product behavior specified by this research (C31)

1. Each workspace explains current capabilities and honest limits, including hidden footer routes; statuses never say a mod is playable merely because a project/tool path exists.
2. Source-inspection evidence is SHA-matched. When the cache source hash or inspection is missing/stale, the guide directs the user back to the Library; when no tool folder is registered, Build explains the missing dependency.
3. Detailed help is accessible on mouse hover, keyboard focus, and touch, with Escape dismissal and no tooltip auto-executed actions.
4. Ctrl/Cmd+K search can discover workspaces using real capabilities/limits and not just their visible names; stale selection indices cannot cause an undefined navigation target.
5. Academy adds a real **From an original room to a playable Halo build** learning loop. Engine compilation, BSP collision, game-mode play and multiplayer are explicitly manual/NOT RUN gates.
6. Visual design uses restrained Forerunner/Halo-like panel lines and teal/amber information hierarchy; original owned bitmap header art remains strictly local and optional, with no dependency on user's game for basic UI legibility.

## Verified source links (checked 2026-10-26)

- Reclaimers: obsolete Halo 1 tools, authors, limitations: https://www.reclaimers.net/h1/community-tools/obsolete/
- Reclaimers: Halo 1 level-creation small-loop design: https://www.reclaimers.net/h1/guides/levels/
- Reclaimers: BSP troubleshooting/geometry exceptions: https://reclaimers.net/h1/guides/levels/bsp-troubleshooting/
- Reclaimers: portal and exact portal rules: https://reclaimers.net/h1/guides/levels/portals-and-clusters/
- Reclaimers: Tool, Guerilla, Sapien, Standalone/Tag Test: https://reclaimers.net/general/mod-tools/
- Invader public toolkit, programs and its preservation rationale: https://github.com/SnowyMouse/invader
- MacGamingMods original demo downloads list: https://www.macgamingmods.com/
- HaloMD mod catalog (Zombie Apocalypse 1.0, Log Mod ++ 1.0): https://halomd.macgamingmods.com/mods/
- W3C WAI-ARIA tooltip keyboard behavior (pattern notes it is still a work-in-progress): https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/
- W3C WAI-ARIA general keyboard/focus practices: https://www.w3.org/WAI/ARIA/apg/practices/

## The acceptance test is still creative, not merely technical

A user should be able to open a preserved compatible map, understand a tag's dependencies, make a reversible edit or build original source geometry, export without data loss, rebuild in a real supported Halo engine, and play/share the result with verified source ownership. The explicit flagship remains a playable **Guilty Spark Test Arena** and a genuinely restored **Zombie Apocalypse** workflow; further ambitious goals (First Contact campaign, multiplayer AI, six-player co-op, larger dedicated sessions, split-screen and VR) are preserved as future tasks, not folded into a fictional completion percentage.
