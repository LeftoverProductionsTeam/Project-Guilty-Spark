# Reclamation and workflow polish — C32 + C33

This continues the existing workbench. The C32, original C33 and workspace-extension releases and fixtures remain frozen historical records. This report covers the later conversion, native camera/animation, per-map context and connected-BSP work. Exact measured results and artifact identities are recorded in [the verification fixture](fixtures/reclamation-verification.json).

## Per-map editing and onboarding

Level Editor uses one adaptive source/QuickForge/running-Halo viewer. Each map retains its active workspace, camera, tag search/selection, tool choices, inspector preferences and build targets. Source resource updates merge into undo snapshots instead of resetting authored changes. Independent tabs and native windows retain their edit leases and histories. The default undo depth is 100 and remains configurable.

Onboarding remembers Halo and tool choices after completion. Features & workflows provides 29 searchable rundowns with navigation into the tools; How-to & Glossary explains the terminology. Open compiled map validates the current receipt and cache hash, then opens the actual compiled output in a separate preserved tab with a distinct revision title.

Dark Glow, editable accent colors, white text on dark surfaces, custom native controls and whole-window transparency/tint remain available. The native polish run also checks original Zombie Apocalypse materials, renderer enhancements, eight source decals, embedded converted-map textures and map/camera/tag context.

## Conversion and native animation

| Source | Measured result | Remaining game gate |
| --- | --- | --- |
| Yoyorast Island V1 | Native MCC cache validated; SDK tagset loaded; custom Spartan animation and native camera/HUD/input scripts executed | Retail MCC cache load, human acting and OBS capture |
| Yoyorast V2 | Protected input refused | Compatible unprotected source required |
| Bigass 2.104 | Native cache validated; two BSPs and their breakable surfaces retained | Standalone/retail behavior |
| Zombie Apocalypse Demo | Explicit recovery cache validated; three vehicle-based spawner trigger references retained | Actual zombie gameplay |

The faithful Zombie Apocalypse profile still refuses its two unavailable custom audio cues. The explicit recovery profile records those omissions and disables one corrupt placement; it does not invent scripts or substitute unrelated sounds. Original source bytes remain preserved.

Animation import/rehearsal uses the actual weighted skeleton. The native acceptance clip has 19 bones and 31 frames. Custom actions and complete compatible animation-graph replacement use separate paths; there is no automatic skeleton retargeting. SDK FBX integration exists, but a genuine FBX fixture and complete replacement-graph gameplay acceptance remain unverified.

Native recording compiles SDK camera/HUD scripts, verifies the current receipt and scenario, and leaves actor input enabled. The real SDK run reported animation success and active camera/input controls. These are SDK features, not injected retail camera hooks.

## Timberland + Sidewinder

The completed target is the owner's requested alternative: two preserved multiplayer worlds joined by a long tunnel in one rebuilt MCC BSP. Destination objects and game mode data stay with Timberland; donor campaign scripts, encounters and object populations are not imported.

The pipeline recovers collision/material identities, projects available source UVs, namespaces shader dependencies, builds a connected solid, exports source geometry and invokes Halo Tool. Collision and render layers are separate so UV seams cannot force fragile collision slivers. Coplanar diagonal repair improves needle triangles while preserving positions, material boundaries and affine UVs. Native collision flags are restored with typed readback.

Entrance selection prefers authored player-start areas on visible walkable source ground. Saved/manual plans receive the same check; invisible clip floors and sky boundaries cannot serve as entrances. The route check samples floor continuity and a standing biped clearance envelope, rejects abrupt steps in either direction, and runs again against actual compiled collision. Two generated visibility portals partition the tunnel. Halo Tool regenerates the lightmaps before cache validation.

Visual inspection caught and corrected an initial invisible-boundary entrance selection. The authored connection has 423 source route samples and about 105 world units of tunnel. Source input is 18,760 triangles; the export has 32,105 collision/render/portal triangles. Two doorway props are moved aside in the derived scenario, and the corridor uses an existing tileable metal-plate material. Original source maps are unchanged. Native cache validation checks scenario/version, source preservation, script retention, CRC, protection, stubs, surface flags and compiled route clearance.

UVs are recovered from matching render planes where available; 1,428 unmatched source faces use planar UVs. Per-cluster donor weather/audio, render-only decorations and separate sky treatment require review. Original map atmosphere is not universally transplanted. Native compilation and Standalone loading do not replace a human walkthrough or retail MCC testing. Earlier campaign-part recovery experiments remain unaccepted.

## Regression fixes and cleanup

The work also fixes GLSL reserved-name failure, actor rehearsal scale/collision, viewport restoration against the correct camera/controls, negative-zero build fingerprint drift and canonical owned-output path comparison. MCC viewer texture pins are validated independently from classic compiler resource maps, so opening a textured source no longer blocks its native BSP build. Unknown or changed resources still refuse the build. Unchanged-cache validation rejects pending BSP, camera, recovery-profile and animation changes.

Retired code includes duplicate viewer branches, the replaced collision grid and superseded QA probes. Reference checks, replacement/build evidence and hashed recovery copies precede deletion. Generated build/diagnostic caches and copied tag trees from failed BSP trials reclaimed 16,906,360,831 bytes. Geometry diagnostics, receipts, the legal SDK baseline, accepted jobs and frozen releases remain available. All 67 restoration originals were rehashed, unchanged and read-only.

Current Rust, frontend, offline, browser and native acceptance counts are in the fixture. The Windows executable and NSIS installer build are checked separately from installation. New reclamation filenames preserve the previous releases. Source packaging excludes owned game/SDK data and is independently extracted and checked against its manifests; external release receipts carry archive hashes to avoid a self-referential source checksum.

## Remaining acceptance

Manual tunnel traversal and retail MCC loading remain pending. General runtime spawning/deletion/rotation/BSP replacement, two-computer game replication, complete game shader/spatial-audio parity, all vehicle handling cases and restored Zombie Apocalypse gameplay remain open. The accepted cases above do not promote those broader capabilities.

[Combined push title and description](GITHUB_HANDOFF.md) · [C32 engineering record](CONTINUATION_32_ENGINEERING.md) · [Frozen C33 record](CONTINUATION_33_ENGINEERING.md) · [Workspace extension](LIVE_EDITOR_WORKSPACES.md)
