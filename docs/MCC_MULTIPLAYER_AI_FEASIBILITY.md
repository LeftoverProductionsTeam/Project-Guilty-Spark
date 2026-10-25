# MCC multiplayer AI feasibility

Research date: 2026-10-25. This report records source evidence, not gameplay certification. No restored Zombie Apocalypse map was played in MCC, no native runtime was launched for this research, and no two-computer multiplayer test was performed. The MCC and native routes are separate targets.

## Decision

| Route | What the evidence establishes | Current project result |
| --- | --- | --- |
| MCC custom campaign, two-player online co-op | MCC supports campaign mod packaging and online campaign in anti-cheat-disabled mode. Existing campaign synchronization makes this the first route to investigate. | **BLOCKED** on a complete, valid restored build and an authored co-op scenario; gameplay and synchronization **UNTESTED**. |
| MCC custom multiplayer with arbitrary AI | Ordinary H1 multiplayer does not supply the required arbitrary AI/device/script synchronization. No documented, acceptable MCC extension interface was established by this research. | **BLOCKED** pending a supported extension path. There is no Guilty Spark AI bridge. |
| ChupathingyCE / OpenCE | Audited upstream sources contain host-driven actor replication and separate campaign-script replication. These implementations merit testing on an actual restored multiplayer scenario. | **UNTESTED locally**. Upstream implementation is not proof that the supplied map works, or that two selected engine versions interoperate. |

An adapter must retain three distinct facts: what a source says an engine supports, what Guilty Spark implements, and what has actually passed a test. A `supported` upstream capability can still have `testStatus: untested`. No runtime should receive an AI-synchronization success badge from its README alone.

## H1 networking boundary

The [c20 synchronization guide](https://c20.reclaimers.net/h1/guides/multiplayer/synchronization/) explains that ordinary multiplayer synchronizes a limited set of gameplay objects and does not generally synchronize AI, manually controlled devices, or scripts. Its documented CE scripting workarounds do not apply to H1A. A cache rebuild cannot add a missing network protocol.

[Mimic](https://github.com/Sledmine/mimic/blob/ccf2c0f9ad947931090418e599ee115014852474/README.md) implements a CE-specific approach through Balltze and SAPP. It replicates several object and script states; script support requires HSC-to-Lua transpilation. Its README still marks full vehicle synchronization incomplete. This establishes neither MCC support nor a drop-in conversion for this mod. At the audited revision the repository had no LICENSE file and GitHub reported `license: null`; do not incorporate its code without established reuse terms.

## Approach A: an authored MCC co-op campaign

[Halo Support](https://support.halowaypoint.com/hc/en-us/articles/360037475251-How-to-Launch-Halo-The-Master-Chief-Collection-with-Easy-Anti-Cheat-EAC-Disabled) documents online custom games and campaign while EAC is disabled. The supported Steam workflow uses its Play-menu choice. Guilty Spark's ordinary Steam launch does not establish which option the user selected or whether MCC loaded a package.

The [official December 2022 MCC update](https://www.halowaypoint.com/news/halo-mcc-december-2022-update) documents mod enumeration at startup and local manifest roots. The [Excession overview](https://learn.microsoft.com/en-us/halo-master-chief-collection/excession/excessionoverview), [folder structure](https://learn.microsoft.com/en-us/halo-master-chief-collection/excession/setup/folderstructure), and [map properties](https://learn.microsoft.com/en-us/halo-master-chief-collection/excession/creatingmodpackage/specifyingproperties) document campaign packages and their metadata. Use an unpublished Excession Halo1 template for the exact derived scenario. The scenario value is the tag-relative name without its extension. Compiled caches belong in the package's `maps` directory. Excession does not itself check that the map exists or that the scenario name is correct, so metadata generation is not a validation pass.

The restoration must first establish how zombies actually spawn and how the mode progresses. A missing encounter or script list does not demonstrate that there are no enemies: actor creation may depend on tags, effects, projectiles, or other mechanisms. Preserve the original cache and record every intentional mechanical change in the derived edition.

Required work before calling a campaign build playable:

1. Recover all required tags and original-runtime resources; stop on incomplete extraction even when an external tool exits successfully.
2. Trace the original spawn, enemy, scoring, wave, death, respawn, weapon, and interaction behavior. Identify unsupported script or tag dependencies.
3. Author a separate campaign scenario with valid co-op player starts, difficulty behavior, objectives, death/restart policy, and checkpoint/progression behavior. Reclassifying a multiplayer scenario alone is insufficient.
4. Build using the chosen supported toolchain, validate the resulting cache and package, and record source/resource/tool/output hashes.
5. Observe local package enumeration and gameplay, then perform the two-computer campaign tests in [MULTIPLAYER_TEST_PLAN.md](MULTIPLAYER_TEST_PLAN.md).

The target is two-player MCC campaign co-op. This does not satisfy a larger custom multiplayer lobby requirement. Cross-platform campaign behavior, controller splitscreen, late join, and save restoration must not be inferred from a generic campaign support claim.

## Approach B: MCC custom multiplayer

No public interface established in this audit provides all of actor creation, stable network actor identity, authoritative AI decisions, transforms/animation, damage/death, respawn, and script/wave state for H1 MCC multiplayer. The absence of a discovered interface is a research blocker, not a proof that no future implementation could exist.

Before implementing an extension, record a specific supported loading mechanism, compatible MCC versions, documented interfaces, permitted distribution terms, state ownership, version negotiation, and failure behavior. A custom command model or a mock client/server exchange is not an attached MCC implementation. Do not derive executable offsets or introduce arbitrary injection, memory patches, EAC tampering, protected matchmaking changes, or an alternate MCC protocol service.

The [Microsoft MCC EULA](https://wpassets.halowaypoint.com/wp-content/2021/11/MCCandMODDING_EULA_ENG.pdf), pages 1-3, distinguishes original mods from redistributed modified game software and substantial Microsoft content, and restricts unauthorized network/protocol connections. EAC-disabled mode is not blanket authorization for an extension. This project therefore keeps game binaries and proprietary content external and requires an evidenced acceptable extension path before executable integration.

Until those requirements are met, continue the campaign and native routes. Show MCC custom multiplayer AI as **blocked**, not partially synchronized.

## Native route: upstream evidence and integration limits

Audited revisions, retrieved 2026-10-25:

| Project | Exact revision | Source-declared license |
| --- | --- | --- |
| ChupathingyCE | `d7fafc81f824886d7fccd58fcf954691df6c6901` | GPL-3.0-or-later |
| OpenCE | `7fb941b0b205edb1f7ecbb0aa6c2d7f5b884732d` | AGPL-3.0-or-later |
| Mimic | `ccf2c0f9ad947931090418e599ee115014852474` | Not established |

The [ChupathingyCE architecture document](https://github.com/ChupathingyCE/chupathingyce/blob/d7fafc81f824886d7fccd58fcf954691df6c6901/port/linux/NETCODE.md) and [OpenCE architecture document](https://github.com/OpenCommunityEdition/OpenCE/blob/7fb941b0b205edb1f7ecbb0aa6c2d7f5b884732d/port/linux/NETCODE.md) describe server-owned AI controls/state and authoritative damage, death, and lifecycle handling. Their actor implementation is separate from campaign-script replication:

- [ChupathingyCE network_actors.c](https://github.com/ChupathingyCE/chupathingyce/blob/d7fafc81f824886d7fccd58fcf954691df6c6901/port/linux/game/network_actors.c) and [network_coop.c](https://github.com/ChupathingyCE/chupathingyce/blob/d7fafc81f824886d7fccd58fcf954691df6c6901/port/linux/game/network_coop.c).
- [OpenCE network_actors.c](https://github.com/OpenCommunityEdition/OpenCE/blob/7fb941b0b205edb1f7ecbb0aa6c2d7f5b884732d/port/linux/game/network_actors.c) and [network_coop.c](https://github.com/OpenCommunityEdition/OpenCE/blob/7fb941b0b205edb1f7ecbb0aa6c2d7f5b884732d/port/linux/game/network_coop.c).

Actor-control tracking checks that the process is the network server; it is not restricted there to campaign mode. This is evidence of broader upstream actor replication. Whether the restored map's actors and non-campaign scripting use every required path still requires actual multiplayer tests. First test the existing implementation; do not duplicate its network core speculatively.

Discovery and launch must respect differences in the [ChupathingyCE README](https://github.com/ChupathingyCE/chupathingyce/blob/d7fafc81f824886d7fccd58fcf954691df6c6901/README.md) and [OpenCE README](https://github.com/OpenCommunityEdition/OpenCE/blob/7fb941b0b205edb1f7ecbb0aa6c2d7f5b884732d/README.md):

| Detail | ChupathingyCE | OpenCE |
| --- | --- | --- |
| Documented desktop targets | Windows, Linux, macOS | Windows, Linux; macOS in progress |
| Xbox maps | `maps` | `maps` |
| CE maps and shared resources | `maps_ce`; identifiers such as `bloodgulch@ce` | `custom_maps` |
| Other PC families | `maps_pc` and `maps_md` documented | Equivalent retail/MD support not established here |
| Standard data location | Beside executable on Windows/Linux; macOS Application Support location | Beside executable, subject to configured data path |
| Direct Demo 6 or MCC 13 support | Not established | Not established |
| Client direct-map/version CLI | Not established; do not guess flags | Not established; do not guess flags |

Both require appropriate user-owned base/shared resources. The [ChupathingyCE platform README](https://github.com/ChupathingyCE/chupathingyce/blob/d7fafc81f824886d7fccd58fcf954691df6c6901/port/linux/README.md) and [OpenCE platform README](https://github.com/OpenCommunityEdition/OpenCE/blob/7fb941b0b205edb1f7ecbb0aa6c2d7f5b884732d/port/linux/README.md) describe configured and fallback data lookup. A version-7 cache alone does not identify retail, Mac, or HaloMD origin. Record family provenance separately.

The audited ChupathingyCE README claims interoperability with OpenCE build 244/network 32 and hosts with network versions 11-37, excludes browser builds, and limits cross-engine PC-map interoperability to CE maps. This remains a version-specific upstream statement. Do not advertise MCC/native compatibility, or treat all ChupathingyCE/OpenCE versions as interchangeable.

Native startup may migrate directories or offer asset extraction/downloads. Upstream hosting may share maps/resources and may report server/statistics information. Discovery therefore reads registered locations, file signatures, metadata and hashes without executing the runtime. Runtime launch and any deployment/sharing action are separate explicit operations. A filename such as `halo.exe` is not runtime identity. Source licenses do not grant Halo asset redistribution rights; no upstream game source or binaries were incorporated for this research.

## Evidence required to change the status

For MCC campaign, require complete restoration, an authored and validated package, observed local launch, and passing real two-computer cases. For MCC multiplayer AI, additionally require an acceptable extension interface and its actual attached implementation. For native AI, require the exact installed version, validated source/resource layout, confirmed ordinary multiplayer actor behavior, and matching host/client observations.

The test report must retain failures, unknowns and mechanics deviations. An external-runtime launcher, a matching friend manifest, upstream source code, and a synthetic networking test are useful evidence for different questions; none alone establishes synchronized Zombie Apocalypse gameplay.
