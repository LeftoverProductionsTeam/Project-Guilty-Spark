# C32 + C33 Git push handoff

Continue the existing project; no restoration sources were replaced. The requested merge target is local **master**. The owner will push; no remote push, pull request or repository-setting change is part of this handoff.

Latest extension: [hosting, collision and controls](HOSTING_COLLISION_AND_CONTROLS.md). Compact the sidebar, place Interface Studio in Settings, fix the synchronous onboarding-save path, retain shared sessions across tools, add private map-bound invites and an explicitly optional Spacewar test module. Strengthen continuous collision clearance and join bent tunnel caps, with a new compiled four-map dogleg challenge. Save per-map gameplay presets with independent left/right mouse routing; actual MCC sprint, paired firing and sword lunge remain unfinished, as do arbitrary spawning/BSP replacement, game-peer replication and complete rendering/audio parity.

Suggested title:

**feat: unify C32–C33 editor workflows, hosting and native MCC tooling**

Suggested description:

Continue Project Guilty Spark in place with the C32 Windows/build repairs and C33 resource, editor and engine work. Preserve the restoration corpus, recover real models/textures/lightmaps/decals and map-sound previews, correct Forge transforms, and add configurable undo, remembered onboarding, a searchable feature/how-to guide, custom window controls and Dark Glow/glass themes.

Unify World Edit, QuickForge and existing-object live editing in one adaptive Level Editor. Keep independent map tabs/windows, camera and tool/tag context, undo histories and build targets; transfer source-linked assets between maps. Retain guarded MCC object movement and shared item/vehicle resizing, including the owner-confirmed 2× Warthog tire/driving correction. Private editor sessions synchronize QuickForge source; game peer replication remains a separate gate.

Add explicit legacy-to-MCC conversion profiles and isolated native SDK builds. Yoyorast V1, Bigass 2.104 and the documented Zombie Apocalypse recovery edition pass native cache validation. Yoyorast also loads in Standalone with a real custom Spartan animation, HUD-free camera control and actor input enabled. Native animation imports require compatible skeletons; complete graph replacement and SDK FBX conversion have their own compatibility limits.

Add source-bound BSP connections and compile the owner-selected Timberland + Sidewinder alternative with a long tunnel. Use visible ground for entrances, preserve shader/UV provenance, repair coplanar needle triangles without moving vertices, generate native collision/lightmaps/visibility portals, and check the compiled route. Reject invisible boundary entrances, abrupt drops, blocked routes, unresolved shaders and failed native writes. Open verified compiled maps as separate preserved tabs. Manual walking and retail MCC cache loading remain separate acceptance steps.

Retain optional scenery from single-BSP donors with transformed placements, original permutations and placement flags. Stage complete source dependencies, correct matching SDK model-class references only in isolated copies, and verify scenery/model identities and transforms in the compiled cache. Report broken dependency paths directly and invalidate stale clearance results when the section moves or rotates. [Donor scenery details and acceptance](DONOR_SCENERY.md).

Extend the connected-world workflow to a separate Timberland + Sidewinder + Blood Gulch project. Preserve UVs across generated shader aliases, keep new entrances local to the selected edge, and inherit matching build tags for new compiled revisions. Reduce per-frame diagnostics and redundant SDK reads, expose optional viewport metrics, report staging progress, and catch missing tagsets before copying a large SDK tree. [Three-map and performance evidence](THREE_MAP_WORLD_AND_PERFORMANCE.md).

Extend the challenge to Timberland + Sidewinder + Blood Gulch + a rotated Battle Creek, retaining 287 scenery placements and rechecking all three routes in the final compiled collision. Add fixed-entrance rotation, explicit donor/draft context, reset/return controls and coordinate-bearing clearance errors. Preserve older unapplied drafts and ignore delayed plans or failures after context changes. [Four-map results and limits](FOUR_MAP_CHALLENGE.md).

Remove superseded viewer branches, an unused collision index and obsolete QA probes after reference/replacement/recovery checks. Reclaim generated caches and copied tag trees from failed experiments. Keep the regression suites, frozen releases, legal SDK baseline and all restoration originals.

Validation and exact limits: [Reclamation and workflow polish](RECLAMATION_AND_WORKFLOW_POLISH.md), its linked verification fixture, [C32 record](CONTINUATION_32_ENGINEERING.md) and the frozen [C33 record](CONTINUATION_33_ENGINEERING.md). Current results supersede older acceptance gaps only for the operations explicitly tested. General live spawning/BSP replacement, game peer replication, universal renderer parity and rebuilt Zombie Apocalypse gameplay are not claimed.

Before pushing, review the merge and working tree:

~~~powershell
git status --short
git log -3 --oneline --decorate
git show --stat --oneline HEAD
# Run after reviewing the local master merge:
git push origin master
~~~

If desired, retain the source branch remotely as well:

~~~powershell
git push -u origin codex/continuation-33-hosting-collision
~~~

Confirm remote CI after your push. Local executables, installers, source ZIPs and verification receipts are under releases with distinct hosting-workflows filenames; earlier world-challenges releases are retained. The optional Steam module is packaged separately. Owned maps, SDK/tag content, local QA data and credentials are excluded from source packaging.
