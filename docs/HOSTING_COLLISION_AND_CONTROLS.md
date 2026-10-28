# Hosting, collision and workflow acceptance

This extends the existing C32/C33 implementation from local master `f217feb24902ed2be2aab289481f8ed94e1f24cf`. Restoration sources were retained. The owner will push the locally merged result.

## Workflow repairs

- The sidebar uses compact labeled rows and two columns in shorter windows. Browser checks cover 944, 768 and 640 pixel heights, including an open map at 1024 × 640. Exporting the project remains available as a labeled icon.
- Interface Studio is inside **Settings & tools → Interface Studio**. Existing feature links and tool search still reach it; the sidebar highlights Settings.
- **Continue to tools** previously entered a synchronous settings path which rediscovered installations and recreated file watchers. Saving now runs in a blocking worker, while preference-only changes skip discovery and watcher replacement. Bootstrap drops each mutex guard before acquiring another. Setup displays save progress and late completion does not redirect a user who has navigated away.
- Fresh native application runs reached the tool screen in 124–142 ms. The real discovery check completed in 376–377 ms while sidebar navigation remained responsive. These are local observations, not latency guarantees.
- Hosting guidance follows the open map's scenario type. MCC multiplayer maps lead to Custom Games; campaign and interface maps have distinct guidance. Hosting a Spark editing session does not host an MCC game server.

## Shared editing and optional Steam module

Shared QuickForge keeps its native session across tool changes. Reopening a divergent local draft pauses sharing, retains that draft and offers export before resuming the shared version. Session operations are scoped to project and session identity. Expired guests cannot reclaim another guest's slot through polling; an old Leave cannot evict a new guest. Accepted Windows streams explicitly use blocking mode with bounded timeouts.

Private invites contain a session identity, key and transport. Optional loaded-map bindings contain only runtime, scenario, checksum and tag count. Process-memory addresses and local source paths are excluded. LAN/VPN accepts private IPv4 and configured shared-VPN ranges; direct traffic remains unencrypted. No firewall rule or public port is created automatically.

The optional Steam helper uses Steamworks SDK 1.64 through pinned steamworks-rs/steamworks-sys 0.13.0. It runs separately using the requested **Spacewar development/test app ID 480**. Spark and MCC retain their own process environments. Normal desktop builds do not build, embed or load the Steam DLL.

Build the optional module explicitly on Windows:

~~~powershell
node scripts/build-steam-bridge.mjs --output releases/Steam-Spacewar-Test-480-C33-r1
~~~

In **Level editor → Shared QuickForge**, choose **Steam · Spacewar test (480)**, select the module folder and test its connection. Both editors need the module and separate logged-in Steam accounts. The host accepts Steam friends, then authenticates the private Spark session key. The main application pins the selected manifest and verifies the helper/DLL hashes before starting it. The helper exits with its parent and bounds pending requests, frame sizes and timeouts.

The reliable transport fragments documents into bounded packets with a digest and reassembly timeout. A 4 MiB payload passed a real local Steam SDK socket-pair transfer in 69 packets. Two native Spark processes separately passed private-invite join, acknowledged revision transfer, per-map isolation and leave over TCP loopback. **A two-account remote Steam relay, two physical LAN clients, MCC game-peer replication and same-lobby discovery remain untested.**

Valve's [Spacewar documentation](https://partner.steamgames.com/doc/sdk/api/example) describes the test identity and runtime distribution. See [third-party notices](../THIRD_PARTY_NOTICES.md).

## Collision and dogleg challenge

Continuous segment/triangle clearance catches a thin shoulder obstruction between the former point samples. Allowed small floor steps are checked as lift, horizontal travel and descent, avoiding a false collision through a valid curb. The existing radius and step limit were retained. A shared collision index is reused for batches of routes.

Tunnel bends now use matching mitered caps. The previous independent prism caps left a collision wedge at turns. A connected-solid regression checks the joined sections and rejects near-U-turns requiring more floor points.

A new owned-content challenge compiled **Timberland + Sidewinder + Blood Gulch + rotated Battle Creek**, with six floor points and four tunnel bends. Its generated sources passed native structure, lightmap and cache validation. The compiled cache SHA-256 is `5b0103b63b91add77116fc11f1bdb5f8d3cb51a115c4ad24b7e8fb6d41fbd541`. All three routes passed compiled BSP clearance with 423, 440 and 394 samples against 25,144 collision triangles. Manual walking, scenery collision and retail MCC loading remain separate checks.

In three sequential debug QA runs over the older four-map fixture, 12 route checks per run improved from a median 7249.8 ms to 5143.9 ms, approximately 29%, while adding continuous clearance. This measures that local batch only, not viewport FPS or engine performance.

## Gameplay controls and unfinished in-game modding

Each map can retain a gameplay control preset, including distinct configurable sprint/dual-wield hotkeys. The input contract assigns **left mouse to the left gun/primary trigger and right mouse to the right gun/secondary trigger**. Both can fire together. Reload releases both; dual wield suppresses zoom and grenade throw. Focus loss and unavailable hooks release triggers and require button release before input resumes. Tests cover these rules.

These are saved presets and tested routing logic, **not enabled MCC gameplay features**. The current adapter does not write player input. True paired weapons require actual left/right first-person geometry, matching animation graphs, muzzle markers and independent magazine/trigger bindings. The stock SDK energy sword lacks a usable first-person model/animation pair. Red-reticle lunge additionally needs verified hostile-target, visibility and collision hooks. Sprint, paired firing and lunge remain unfinished.

Read-only native inventory capture was verified after the owner switched from plasma pistol to pistol: slot 1 retained the plasma pistol and slot 2 held the equipped pistol. The adapter validates the exact map, player/object salts and parent/equipped references before returning a result. No gameplay hook is enabled by this inspection.

The owner also reported that a pistol moved near the character by the existing guarded position writer did not appear there; they picked up a normal pistol on the base instead. That observation remains open. Memory readback does not prove render/collision relinking or network authority.

**Arbitrary live spawning, live BSP replacement, complete game-peer replication, universal rendering/audio parity and full in-game modding remain incomplete.** The supported path for new BSP geometry is compile, validate and reload. Existing [live-editor limits](LIVE_EDITOR_WORKSPACES.md) continue to apply. These operations must not be advertised as functioning until real engine acknowledgements and matching game tests exist.

## Verification

See the [machine-readable receipt](fixtures/hosting-collision-controls-verification.json). The recorded checks include 254 Rust tests, 91 frontend tests, 59 offline scripts, 26 browser tests, six native workflow checks, four native two-process session checks, the optional Steam SDK loopback, native dogleg compilation/clearance and all 67 restoration originals unchanged and read-only. No remote push was performed.
