# C34 engine AI and co-op adapter boundaries

Primary-source research: 2026-10-28. This is technical evidence for the runtime
registry and the next engine integration slice, not a gameplay completion
claim. No upstream engine or plugin was installed, built or executed during
this research. No game memory, credentials or public game session was read.

## Pinned sources and provenance

| Source | Revision | Commit date UTC | Reuse boundary |
| --- | --- | --- | --- |
| [ChupathingyCE](https://github.com/ChupathingyCE/chupathingyce/tree/c5a07c69589ab8d40180fc99eac993bc06b06ebb) | `c5a07c69589ab8d40180fc99eac993bc06b06ebb` | 2026-10-28 22:29:37 | Root GPLv3; source facts inspected, no implementation copied |
| [OpenCE](https://github.com/OpenCommunityEdition/OpenCE/tree/f2597b704d59e66257dba7629f22a0f78f5f3d09) | `f2597b704d59e66257dba7629f22a0f78f5f3d09` | 2026-10-28 17:38:54 | Root AGPLv3; source facts inspected, no implementation copied |
| [Mimic](https://github.com/Sledmine/mimic/tree/ccf2c0f9ad947931090418e599ee115014852474) | `ccf2c0f9ad947931090418e599ee115014852474` | 2026-06-24 07:15:03 | No root LICENSE/COPYING located; permission/reuse terms unresolved |
| [Balltze](https://github.com/Sledmine/balltze/tree/6ed7cf608b6481d7677694a8706ed71ab32491c1) | `6ed7cf608b6481d7677694a8706ed71ab32491c1` | 2025-09-21 12:34:29 | GPLv3; public plugin API research only |
| [SAPP documentation source](https://github.com/chaoticzeros/halo-sapp-docs/tree/451dbd26a3f390d70a6051dc5f4c4774079aed64) | `451dbd26a3f390d70a6051dc5f4c4774079aed64` | 2021-06-22 17:26:29 | Documentation for SAPP 10.2, Lua API 1.12.0.0; no license detected, no copied code |

These are separate runtime families and licensing decisions. A separate
process, a publicly readable repository or a game-owner declaration does not
automatically resolve redistribution or derived-work obligations. The C34
browser links/launches a user-selected installation; it does not bundle these
components.

## Existing community engine replication is the first integration target

The following files were inspected in **both** pinned ChupathingyCE and OpenCE:
`port/linux/NETCODE.md`, `game/network_actors.c`, `game/network_objects.c`,
`game/network_damage.c`, and `game/network_coop.c`. They establish a concrete
engine ownership model beyond a position relay:

| Concern | Inspected engine mechanism | Spark adapter implication |
| --- | --- | --- |
| Actor decisions | The host runs AI; clients consume controls and state through the engine's unit-control path | Do not run a second Spark AI authority or create client-side duplicate encounters |
| Object lifetime | Reliable host create/delete, full baseline after load, shared datum index including its identifier | Preserve the engine's salted lifetime identity within that session; never substitute an address or index without its identifier |
| Actor state | Aim/look/facing, control flags, trigger, movement, vehicle/seat, vitality, camouflage; nearby actors more often | Use existing engine traffic; a Spark pose-only socket cannot replace these dependencies |
| One-shot actor actions | Numbered animation impulses, melee/leap, speech and custom animation, with repetition against loss | An observer must count applied events once; do not infer actions from interpolated positions |
| Combat | Host validates client damage reports and owns resulting health, kills and damage replay | Damage/death agreement is mandatory; equal actor positions alone are insufficient |
| Inventory/vehicles | Engine object and inventory state, with player/vehicle prediction and correction | Test carried weapons, seat relations, pickups and exit, not only unit transforms |
| Campaign scripts | Host-only campaign scripting, presentation state and numbered script events | Author a valid compatible scenario and reuse engine scripting rather than generic remote HSC |
| Devices and named objects | Host device groups/state, named-object presence and changed transforms/appearance | Door/trigger correctness needs these existing paths, not a visual moving-door approximation |
| Late join/recovery | Engine baselines and periodic co-op state resend; named-object checks are BSP-aware | Observe convergence after a real join/reconnect; a new Spark socket connection is not convergence evidence |
| BSP changes | The party follows the host's BSP, with input gated until the client has it | Preserve this limit; it is not independent per-player region streaming |

Source details are accessible at the pinned
[Chupathingy netcode](https://github.com/ChupathingyCE/chupathingyce/blob/c5a07c69589ab8d40180fc99eac993bc06b06ebb/port/linux/NETCODE.md)
and [OpenCE actor integration](https://github.com/OpenCommunityEdition/OpenCE/blob/f2597b704d59e66257dba7629f22a0f78f5f3d09/port/linux/game/network_actors.c).
Chupathingy's internal hooks include `network_actors_note_control`,
`network_actors_note_impulse`, `network_actors_note_melee`,
`network_actors_note_leap`, `network_actors_note_speech`,
`network_actors_host_tick`, and `network_actors_drive`. Co-op's
`network_coop_note_*` hooks cover presentation/device/scenario events.
These are engine-internal C interfaces, **not** exported desktop IPC APIs.
Spark cannot call them through a stock installed executable or MCC DLL.

The current actor code sends at most 64 state entries per message and stops
holding a stale control after two seconds. Co-op repeats numbered events
over three ticks and also resends durable state. Those implementation bounds
are not a proof of reliable event delivery under arbitrary loss, and a listed
128-player capacity is not measured performance. Host migration and
per-player BSP streaming remain unverified requirements.

## A concrete existing private test interface

[Chupathingy's `network_test.c`](https://github.com/ChupathingyCE/chupathingyce/blob/c5a07c69589ab8d40180fc99eac993bc06b06ebb/port/linux/game/network_test.c)
documents game-owned private test entry points through `HALO_NETWORK_TEST`:
`host:<map>:coop`, `join`, and other modes. The same runtime documentation
exposes `HALO_NET_HOST_PUBLIC=false`, `network.address`, and controlled
latency/loss test settings. Do not use its broad "join first found" mode on
a public/LAN network containing other owners' games. A controlled test must
isolate its interface or use an explicit owner-held invitation.

The runtime's existing logs expose player snapshots, object create/delete
statistics and damage report/replay counts. They are a useful first
game-owned receipt, but they do not by themselves identify every enemy's
spawn, fire, death and wave progression. A Spark adapter must leave those
acceptance fields unknown until a real observer supplies them.

The smallest immediately usable integration with an already installed,
validated compatible runtime is therefore:

1. Resolve its executable fingerprint, declared protocol and owned startup
   data; inspect the scenario/resource hashes and each machine's content.
2. With explicit host approval, launch an isolated private game using its
   documented lifecycle and a fixed scenario/test configuration. Do not
   override the upstream compatibility number or invent a wire protocol.
3. Read bounded owner-provided logs/status and correlate the real game
   sessions. Report launch, lobby, game, and actor evidence separately.

No compatible community runtime/startup data or two-client private test was
established in this research slice. MCC ownership is not substituted for
the community runtime's Xbox startup data. The C34 content probe and registry
explain that distinction.

## CE-specific extension candidates and their limits

[Mimic's README](https://github.com/Sledmine/mimic/blob/ccf2c0f9ad947931090418e599ee115014852474/README.md)
describes a SAPP server script plus a Balltze client. Its supported surface
includes biped matching, permutations, carried weapons, named machines,
BSP changes and transpiled script events; full vehicle synchronization and
client sound patching are not marked complete. The actual client source
uses separate synchronized indices and applies server packets, including
HSC translation/execution and local-AI removal. Its server broadcasts through
SAPP RCON messages and registers tick, spawn, join, leave, game-end and
player-death callbacks.

This is a genuine game-extension approach, but it cannot be adopted as a
safe generic Spark adapter without further work. The inspected server
source also reads a server's RCON credential through memory, uses signature
scans/code writes and fixed-address assumptions, changes projectile/item
behavior, and runs mutable script commands. Those mechanisms are not normal
Spark networking operations. Its old data-structure document does not replace
the current source or establish authenticated session/content negotiation,
replay bounds or all lifetime semantics. No such code or packet executor was
copied, run or enabled. Obtain a clear reuse license and validate exact
CE/SAPP/Balltze builds before integrating an owner-installed version.

[Balltze's plugin documentation](https://github.com/Sledmine/balltze/blob/6ed7cf608b6481d7677694a8706ed71ab32491c1/docs/plugins/introduction.md)
supports Lua and C++ plugins. The pinned API annotations expose
`Balltze.event.tick.subscribe`, `mapLoad.subscribe`,
`objectDamage.subscribe`, and `rconMessage.subscribe`, plus logger creation
and per-plugin output files. `Engine.gameState.getObject` and
`Engine.netgame.getServerType` provide an engine-level read surface.
Subscriptions can be removed on unload. The documentation's C++ setup calls
for MinGW GCC 12.2 and CMake 3.16+, distinct from Spark's Rust toolchain.

[SAPP game functions](https://halo-sapp.readthedocs.io/en/latest/scripting/game.html)
and [callbacks](https://halo-sapp.readthedocs.io/en/latest/scripting/event.html)
provide registration/tick/spawn/player lifecycle events, object access and
server-owned spawning. This documentation is explicitly versioned for an
older SAPP release; test the installed API rather than assuming current
compatibility. A player damage/death callback does not automatically prove
AI damage/death observation. `spawn_object` alone does not supply client AI
simulation, animation or authoritative script replication.

## Smallest compilable engine observer slice

The narrow candidate for the CE adapter is an **original read-only Balltze
observer plugin**, using the actual versioned event API above. It should
subscribe after map load, count engine ticks, record typed damage events,
and resolve only explicitly selected actor handles through `getObject`.
It must never cancel events, set fields, invoke HSC, create/delete objects,
receive console strings, scan signatures or read credentials. A fixed local
plugin log, capped output rate/size, no network listener and unsubscribe-on-
unload provide a reviewable first boundary.

This candidate is not implemented or compiled by C34. Its prerequisites are
the owner-installed compatible CE client/Balltze SDK, reviewed plugin licensing
and build configuration, a legitimate server counterpart, a known compatible
Mimic or independent replication mechanism, and an owned derived test map.
An original observer can use the documented API facts without copying the
Mimic implementation, but distribution still needs the plugin's own licensing
decision. A Lua version can be syntax-tested without a game; that would not
prove callback availability, safety or gameplay.

For a community-engine build, an owner-reviewed upstream observer patch at
the existing host/client application hooks would provide stronger evidence
without duplicating replication. It must be built and licensed in that
upstream engine project, not copied into Spark's MIT library. A new observer
IPC/record format would be a Spark interface, **not** an existing upstream API.

The first useful record needs runtime/executable fingerprint, session/content
generation, host/client role, engine tick, full engine datum identity, local
observer generation and typed lifecycle/combat/device/wave outcomes. Use a
new session key after reconnect/map change and tombstones for deletions;
never expose raw pointers. The first acceptance test remains two real game
clients agreeing on one enemy's lifetime and damage/death plus one scenario
event, followed by controlled loss/reordering/disconnect and content mismatch.
Read-only logs, a compiling plugin, existing engine source and Spark editor
collaboration each remain separate evidence tiers until that test passes.
