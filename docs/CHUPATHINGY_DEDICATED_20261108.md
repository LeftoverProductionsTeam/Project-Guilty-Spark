# Windows dedicated-server integration — 8 November 2026

This continuation extends `community_host`, the existing runtime package downloader and the native CE Workshop test. It does not replace engine networking or create an Extraction persistence engine. Base source is local master `df2734772361864d34e3e96fe5c0a8531b2c6cc9`; final commit and test receipts must be checked separately.

## Exact upstream boundary

The official [v0.9.0c release](https://github.com/ChupathingyCE/chupathingyce/releases/tag/v0.9.0c) points at `b506ba7439463d23f6e6d97192c68ece97adbab3`. Its Windows x64 dedicated ZIP is 22,043,087 bytes, SHA-256 `04477e903be8ecfbf732a50bbb2f317dfc021cfd36aff5eda9f8f995608f6e4a`. The executable is 21,920,768 bytes, SHA-256 `25a206c6c7d6454a6f6a41a8a5987a1e30334db7404e8bf895f1e8429485ce85`. An actual `--version` probe reports dedicated 0.9.0c, Windows x64, network 41, source b506ba74. That initial command read a pre-existing compatibility table; it is not the clean server profile contract. R174 authenticated native status reports version0.9.0c/private/OpenCE announcement32. The isolated adapter explicitly selects/verifies32, while pinning the actual executable separately. This announced OpenCE compatibility number is not the Delta wire version. Source and package are GPL-3.0-or-later; Spark calls the independently installed program. No engine implementation was copied into Spark.

Pinned references:

- [Windows launch and independent save roots](https://github.com/ChupathingyCE/chupathingyce/blob/b506ba7439463d23f6e6d97192c68ece97adbab3/server/windows/README.txt).
- [Map families, `maps_ce`, native playlists and gametype files](https://github.com/ChupathingyCE/chupathingyce/blob/b506ba7439463d23f6e6d97192c68ece97adbab3/server/docs/playlists.md).
- [Authenticated control API and command allowlist](https://github.com/ChupathingyCE/chupathingyce/blob/b506ba7439463d23f6e6d97192c68ece97adbab3/server/docs/admin.md).
- [Dedicated lifecycle implementation](https://github.com/ChupathingyCE/chupathingyce/blob/b506ba7439463d23f6e6d97192c68ece97adbab3/server/src/dedicated.c): `dedicated_update`, empty-game termination and idle-score termination.
- [Actor networking](https://github.com/ChupathingyCE/chupathingyce/blob/b506ba7439463d23f6e6d97192c68ece97adbab3/port/linux/game/network_actors.c): engine-host AI and distributed actor state. This is source evidence, not new Spark gameplay acceptance.
- [System Link bind and broadcast routing](https://github.com/ChupathingyCE/chupathingyce/blob/b506ba7439463d23f6e6d97192c68ece97adbab3/port/linux/src/xnet.c): `net_settings_read` and `outgoing_address`, explicit private client destinations and localhost redirection.
- [Native variant field mapping](https://github.com/ChupathingyCE/chupathingyce/blob/b506ba7439463d23f6e6d97192c68ece97adbab3/server/src/server_config.c) and [serialization](https://github.com/ChupathingyCE/chupathingyce/blob/b506ba7439463d23f6e6d97192c68ece97adbab3/server/src/server_gametype_variant.c). Starting weapons and no shields are genuine supported variant settings; they do not implement an inventory database.

## User workflow

Connect matching Chupathingy 0.9.0c and owned Xbox resources in Games & tools. Select Chupathingy in Studio. Open **Online → Host game**. Choose **Download verified server · 21 MB** or **Locate installed server**. The dedicated installation is separate from the interactive client, with an exact executable identity check; the existing four runtime choices are unchanged.

Choose an installed Xbox multiplayer map and stock game type. Alternatively, save and compile a standard self-contained CE609 multiplayer project, then select **Use current CE build**. **Start private dedicated server** stages only checked required content into bounded owned storage, creates separate saves/log/cache roots and starts an owned native process. It does not install a Windows service, enable public listing, UPnP, statistics reporting, or change firewall settings.

The panel displays authenticated native state and the pinned map/build identity. **Restart map** uses the documented `sv_map` operation after fresh status, actual catalog and staged-map hash checks. It cannot execute arbitrary commands or modify another process. **Stop server** stops only the owned trial, rechecks original inputs and disposes staging. Closing the owning window also stops it. The verified server installation persists independently.

For an ordinary single local client the default destination is 127.0.0.3. Native xnet redirects 127.0.0.1 to its own configured address, so Spark refuses that destination. For two independently configured native processes, expand **Local trial routing** and enter their listening addresses (the acceptance fixture uses 127.0.0.3,127.0.0.4; the server uses 127.0.0.2). Only distinct loopback literals are accepted, so this control cannot expose a LAN/public host. The choice is saved per project.

Join from the matching client's System Link lobby. The automated native fixture uses the engine's documented network-test join mode in two separate game processes, with independent configurations, saves and caches. Diagnostic joining is not human gameplay or AI combat proof.

## AI Apocalypse and persistent Extraction gaps

The selected server has ordinary multiplayer playlist/gametype control, not a documented arbitrary actor-spawn, inventory-bank or world-save API. Host-authoritative actor replication exists in engine source; its full use by a newly authored PvPvE scenario must still be tested independently.

`dedicated_update` ends a game 30 seconds after every player leaves. Idle-score termination can be configured separately; disabling a gametype time limit does not remove empty-game termination or preserve world/loot/encounter state. A maintained opt-in engine extension is still needed for the requested no-timer persistent-world lifecycle, authoritative player inventory/bank, crash recovery, death/extraction outcomes and versioned upgrades. No fabricated gametype fields or silent fallback to timed Slayer are presented as Extraction.

Human combat/loot/extraction, shared victory, full AI parity, two physical computers, OpenH1 Live Link/headset editing, 19-region vehicle traversal and clean-machine release acceptance remain open. The prior native lighting/seam and SparkLink receipts retain their original scope.

## Evidence

Native and regression receipts are recorded in ACTIVE_TASK.md after execution. A prepared UI, a successful compile, an authenticated lobby and two joined clients are separate evidence levels. Do not promote any of them to human gameplay or persistent-mode acceptance.

## Verified private native milestone — R184

Actual UI source recovery, reviewed three-tag CE repair, Draft Tool radiosity/Invader CE609 compilation and independent sky/BSP/scenario/CRC readback passed. The two-room Workshop fixture has58triangles; this is not the Timberland–Sidewinder seam or19-region world. Compile64881ms, not a general performance-improvement comparison. Cache SHA-256`adbc066fae13bec131eb9d2833556106b547b2c50557742a5c8984ba49887cec`.

Actual native server0.9.0c loaded`native_live_rebuild@ce`. Independent clients PID6268/37732 reported distinct local players0/1 and spawned unit positions. After the UI Restart button both clients reported new game tick30. Changed staged bytes were rejected with the same server process and restart count1; restored cache hash matched. Server stop rechecked originals and removed staging. Full Spark restart retained server installation, source/build history and per-project routing; no server/game restarted automatically. The invalid127.0.0.1 route was refused through the actual Start button before any session existed.

Eight real native window sizes passed the unchanged displayed-control reachability, overlap, scroll and horizontal-overflow assertions. Native size and CSS content size differ intentionally through the existing Auto UI scale; the test checks both. Scale values below are the production scale asserted by the harness, not an operating-system display-setting change.

| Native logical window | CSS content viewport | Applied Auto scale | Reachable controls | Horizontal overflow |
| --- | --- | --- | --- | --- |
| 800 × 600 | 1000 × 750 | 80% | 21 | 0 |
| 1280 × 720 | 1600 × 900 | 80% | 21 | 0 |
| 1366 × 768 | 1686 × 948 | 81% | 21 | 0 |
| 1500 × 950 | 1500 × 950 | 100% | 21 | 0 |
| 1920 × 1080 | 1684 × 947 | 114% | 21 | 0 |
| 2560 × 1080 | 2246 × 947 | 114% | 21 | 0 |
| 3440 × 1440 | 2293 × 960 | 150% | 21 | 0 |
| 5120 × 1440 | 3413 × 960 | 150% | 21 | 0 |

QA executable:`C:/Users/patri/AppData/Local/Temp/GuiltySpark-Engineering-d49eb02588bf/dedicated-server-app-r180/GuiltySpark.exe`,50292224bytes, SHA-256`415c06a1d979ecac1f01e3a2e6b374aeba07b325fdee4db204a26e3c1f2dda28`, runtime-source fingerprint`dc7fd2954099cdb55125f5c52e97ead67acc4b9d5e5cc55df06d46d4408a4b8d`. Receipt:`C:/Users/patri/AppData/Local/Temp/GuiltySpark-Engineering-d49eb02588bf/dedicated-r184.json`; native WebView images use`dedicated-r184-native-dedicated-*.png`. Actual OS capture`dedicated-r184-os-security-prompt.png` records an untouched Windows network-permission prompt. Physical input/unobscured first-run, other Windows DPI settings and actual ultrawide hardware remain unverified.

R180 locked Rust880passed/9ignored; frontend472, offline59, storage36 and TypeScript/source contracts passed. R178 dedicated browser IPC contract passed. R179 retained245browser passes but timed out in the offline Web Audio evaluation under concurrent native compilation. R185b repeated that same audio test3times successfully without contention. R186 full current browser suite passed246tests in510007ms without concurrent native compilation. Earlier failed native/layout receipts remain explicit; R184 is the complete corrected native result.

These are ordinary multiplayer hosting and native process/restart results. Human movement/combat, hostile AI, extraction, inventory persistence, shared victory, true cross-computer play and the combined frozen SparkLink CE-to-two-game-client path are not newly accepted. The server's30-second empty-game behavior remains a real persistence blocker.

The early CLI version research probe did not have a before snapshot of the engine's default app-data cache. Preservation claims apply to the explicit input hashes and isolated data/save/cache/log roots used by native acceptance. No broader default-profile preservation claim is inferred. Obsolete failed QA executable exports R172/R175/R177 and the owned downloaded/extracted dedicated probe were retired after exact manifest/package hash checks and confirming no process used them; receipts/research, the verified R180 app, earlier accepted builds and all user runtimes remain. Logical generated bytes retired194962169; this is not a measured physical-free-space claim.

The locked Rust run retained9explicit ignored integration gates: live provider HTTPS, running MCC camera disconnect, owned MCC audio/detail serialization, native custom power-up compilation, owned SDK duplicate/cache compilation, native emitter rename compilation, selected owned MCC inventory and historical project restoration. Their required inputs/runtime conditions were not supplied to that full workspace invocation. R184 is a separate explicit native CE/dedicated acceptance, not a substitute pass for those nine tests.
