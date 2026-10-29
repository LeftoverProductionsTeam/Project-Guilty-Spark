# Private community host and Delta Control adapter — C34

[`community_host.rs`](../../crates/spark-core/src/community_host.rs) adds original typed host configuration, launch preparation, authenticated control request plans and bounded response parsing. The module itself does not start a server, install/launch WSL, join games, change a firewall, send commands, or translate MCC's game protocol. [`community_host_native.rs`](../../src-tauri/src/community_host_native.rs) adds real authenticated loopback status request code and owned plan saving. Native command mutation stays unavailable without adapter-owned private process/configuration proof. No actual server contact or startup is accepted in this pass.

## Supported operation and retained goals

| Requested operation | Implemented now | Acceptance still needed |
|---|---|---|
| Private multiplayer with a maximum of 128 | Validated playlist/private environment generation; Linux Chupathingy executable/content/architecture/root gates; owner-reviewed launch specification; typed local administration | Actual selected Linux binary startup, private discovery/invites, two real clients, measured 8/16/32/64/128 progression, stability and recovery |
| Eight-player campaign | Separate typed operation, requested limit retained, actual upstream native-client menu guidance | No dedicated campaign launch specification. Exact client/menu/capacity plus real eight-player progression, AI, checkpoints, respawn, transitions and reconnect |
| Eight-player Firefight | Separate typed operation and explicit scenario/director/AI gates | No documented dedicated Firefight gametype or integrated accepted eight-client wave director. Naming Slayer “Firefight” or setting maximum players does not supply one |
| OpenCE/Chupathingy/browser lobby discovery and joining | Separate provider/client/content/protocol paths in the community workbench | A shared list or compatible handoff is not host control, actual connection, browser/native content parity or eight-player proof |
| An actual MCC client joining arbitrary other H1 lobbies | Requirement retained explicitly | No wire/authority/content/protocol bridge is implemented. Wrong-runtime refusal, exporting assets or starting another game does not fulfill this requirement |

The pinned dedicated director explicitly recognizes the campaign level names, including path/family suffix forms, and skips them. It cannot host a campaign map as a normal multiplayer playlist. Its source directs online co-op to the actual client’s Create Game path. The adapter follows this boundary rather than presenting an unavailable mode as a working host option.

For the documented Chupathingy client path, open **Multiplayer → Create Game → Internet**, switch the map chooser to **SINGLEPLAYER**, choose the actual level/difficulty, then review **Server Setup**. Keep listing private and use only player controls the exact build really offers. OpenCE's exact menu/build needs its own check. Eight is an acceptance goal here, not proof inferred from a 128-seat multiplayer setting or the enemy multiplier.

## Private configuration is more than PUBLIC=false

Upstream's `HALO_DEDICATED_PUBLIC=false` suppresses the in-game broker browser, but the separate web game list can still publish the server. The generated configuration therefore sets both publication controls off and disables browser/reporting paths:

- `HALO_DEDICATED_PUBLIC=false`, `HALO_NET_LIST_GAMES=false`, `HALO_NET_BROWSER=`.
- Hosted/joined/event reporting off; GameSpy listing, automatic UPnP and optional site linking off.
- `HALO_NET_ONLINE=false` for the default LAN plan; invite-only internet is a separate explicit choice.
- Delta Control listens only on a literal loopback socket; console command input is off.
- Platform limits remain enabled. A requested 128 maximum does not override the limits of actual connected clients.

The native launcher must remove inherited `HALO_*` overrides and apply the complete reviewed environment. It must use independent verified writable derived data/save roots, not game/SDK masters or another instance's saves. The API accepts no arbitrary environment variables or startup commands from the frontend.

Upstream first-use stdout can contain its private control token and owner setup link. The launch specification marks private startup handling as mandatory. Never stream those bytes into ordinary process logs, diagnostics, receipts or serialized frontend state. This slice supplies no process launcher and therefore starts nothing while that owner-only handling is unresolved.

## Typed APIs

`plan_host(&HostRequest, &HostInstallationEvidence)` returns setup gates or a **ready-for-review** specification, never “hosted.” The native-only evidence contains the exact selected Linux executable/hash/network version, architecture, derived roots, complete owned base data and map/resource hashes. MCC v13, missing Xbox base assets, campaign scenario types, unverified source resources and unsupported architecture remain independent gates.

```json
{
  "runtimeId": "chupathingyCe",
  "mode": "multiplayer",
  "name": "Spark private",
  "maximumPlayers": 128,
  "minimumPlayers": 1,
  "network": "lan",
  "public": false,
  "listGames": false,
  "controlAddress": "127.0.0.1:8080",
  "entries": [{"map": "bloodgulch", "gameType": "slayer"}]
}
```

Only matching Linux Chupathingy dedicated installations receive a runnable specification. Windows/WSL remains setup-required; no installation or launch is automatic. OpenCE clients' compatibility does not establish an OpenCE dedicated binary’s Delta Control API. Custom source maps need their own family/cache/resource match and the appropriate separately verified server architecture.

`ControlTarget::new` accepts a literal `127.0.0.1:port` / `[::1]:port` or another true loopback address, rejects port zero, hostnames, remote/public addresses, URLs and IPv4-mapped IPv6 ambiguity. Request plans disable proxies and redirects, cap responses at 1 MiB, and set a ten-second deadline. Native HTTP must preserve these restrictions; DNS or redirects must not widen the target.

`ControlToken` deliberately has no Serde implementation, redacts `Debug`, and provides the bearer value only through an ephemeral authorization callback. Tokens belong in a sensitive HTTP header, never command arguments/environment, saved settings, ordinary logs or plan serialization. The native caller must not log IPC credential input or request headers.

Read plans cover authenticated `/v1/status`, `/v1/maps`, `/v1/players`, `/v1/mapcycle` and `/v1/settings`. Status and map catalogs use bounded typed parsers; HTML fallback, malformed JSON, unknown state, invalid text/counts or protocol values are rejected without echoing raw response bytes. Extra fields are not forwarded as arbitrary frontend data.

Mutation plans contain one JSON body for `/v1/command`. The whitelist is **set maximum players**, **change map/gametype**, **next map**, **end current game**, and **set server name**. No raw console input, credential administration, shell execution, arbitrary settings, player messaging, ban or kick endpoint is added. Map changes must use the actual refreshed server catalog; user strings cannot insert another command. Campaign/Firefight operation guards, stale observations, loading states, public status or an unverified private configuration block changes.

Native code constructs `ControlGuard` from fresh observations plus its own private-config receipt; frontend booleans are not authority. Preparing a mutation still requires concrete user review and fresh revalidation before sending it. The upstream server queues authorized commands onto its engine main thread. A parsed `{ok:true}` acknowledgment remains **not observed gameplay**.

## Tests and evidence limits

Eight focused core tests passed. They cover the two independent listing paths, reporting defaults, private credential handling, 128-seat configuration without tested-player promotion, distinct campaign/Firefight gates, campaign names disguised with suffixes, wrong runtime/provider/platform/cache, invalid capacity, command/header injection, loopback boundaries, stale/private status, actual catalogs, malformed/big status and secret-bearing acknowledgments. They use original synthetic control fixtures and do not execute or copy upstream engine code.

Focused command:

```powershell
node scripts/cargo.mjs test -p spark-core community_host --lib -- --nocapture
```

No native server/game, eight-client session or 128-client load is claimed from these tests. The shared lobby UI, native HTTP result handling and the complete runtime/content compatibility record retain their own evidence gates. No public server stress or automatic Linux/WSL setup is authorized by this adapter.

The native `community_host_native.rs` wrapper separately passes **ten loopback HTTP/ownership tests**. Actual local HTTP fixtures verify one authenticated GET, sensitive-header redaction, no redirect forwarding, declared/streamed response caps, JSON status validation, secret-free errors and a stalled server. Session checks cover one in-flight observation, throttling, owner isolation, window closure and disconnected/replaced results. No global state lock spans HTTP, and disconnect does not block the UI thread. These are real transport tests against synthetic local responses, not contact with a Halo server, native host lifecycle or game acceptance.

## Primary source pins

Research is pinned to Chupathingy revision `c5a07c69589ab8d40180fc99eac993bc06b06ebb`, checked 2026-10-28:

- [Server settings](https://github.com/ChupathingyCE/chupathingyce/blob/c5a07c69589ab8d40180fc99eac993bc06b06ebb/server/docs/settings.md): environment/file precedence, independent listing/reporting switches and loopback control settings.
- [Playlists](https://github.com/ChupathingyCE/chupathingyce/blob/c5a07c69589ab8d40180fc99eac993bc06b06ebb/server/docs/playlists.md): actual map families/resources and multiplayer gametypes.
- [Administration](https://github.com/ChupathingyCE/chupathingyce/blob/c5a07c69589ab8d40180fc99eac993bc06b06ebb/server/docs/admin.md): authenticated endpoints, commands and acknowledgment semantics.
- [Dedicated director](https://github.com/ChupathingyCE/chupathingyce/blob/c5a07c69589ab8d40180fc99eac993bc06b06ebb/server/src/dedicated.c): bounded multiplayer player setting and explicit campaign refusal.
- [Command implementation](https://github.com/ChupathingyCE/chupathingyce/blob/c5a07c69589ab8d40180fc99eac993bc06b06ebb/server/src/server_commands.c) and [control implementation](https://github.com/ChupathingyCE/chupathingyce/blob/c5a07c69589ab8d40180fc99eac993bc06b06ebb/server/platform/server_control.c): engine-main-thread queue and real API boundaries.
- [Native client menus](https://github.com/ChupathingyCE/chupathingyce/blob/c5a07c69589ab8d40180fc99eac993bc06b06ebb/port/linux/README.md): actual campaign hosting entry point.

Upstream is GPL-licensed. This module implements documented interoperability with original Rust code and synthetic tests; it does not incorporate the engine implementation. Any later reuse/distribution of upstream components requires its own exact license review.
