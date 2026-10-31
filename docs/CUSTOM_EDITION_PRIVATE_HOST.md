# Custom Edition private dedicated host

**Follow-through:** [saved project build hosting](CE_PROJECT_BUILD_HOSTING.md) now adds direct selection of validated managed CE outputs, revision/output checks and same-filename isolation. The original standalone-host acceptance below remains historical evidence; client joining and gameplay remain open.

Continue from the committed Windows workbench. This milestone adds a genuine Spark-controlled **classic CE dedicated-server lifecycle**, separately from SparkLink editor synchronization and game-client acceptance.

## Use it

1. Connect your owned Custom Edition installation in **Settings → Dependencies & setup → Halo Custom Edition**. The optional checked community archive installation remains available.
2. Open **Online → Host game**, select **Halo Custom Edition**, then choose a native CE multiplayer map, game type and player limit.
3. Select **Start private server**. Spark verifies the selected dedicated executable/map identities, copies the required game inputs into a fresh private session, and waits for a matching native server reply.
4. Use the displayed `127.0.0.1:port` address in **Custom Edition → Multiplayer → Direct IP** on this computer. A native map-loaded reply does not mean a client has joined.
5. Stop it from the same Spark window. Changing workspaces or reloading that window retains its server controls. Closing the owning window stops its server; other windows' servers are independent.

The map selector reads the registered game's maps directory. It admits unextended version-609 multiplayer caches with their actual authored filenames. Campaign, UI, MCC, Xbox, renamed/mismatched and unsupported map inputs are excluded. A new compiler output must currently be made available in that registered collection; selecting a managed project build directly is still a workflow follow-up. Importing a tag or inspecting a cache does not convert it.

## Ownership, validation and recovery boundaries

- The fixed command line starts only the registered installation's checked `haloceded.exe`, copied into an owned session. No arbitrary executable, startup script, console command, RCON or remote tool action is accepted.
- The dedicated executable's PE architecture and hash, native map header/name/hash, shared-resource index bounds, and copied bytes are checked. Hash checks detect changed inputs; they do not establish publisher authentication or certify every tag's semantics.
- Configuration binds only `127.0.0.1`, disables public listing, and supports five stock modes with a configured 1–16 player limit. No firewall, public listener or LAN/VPN exposure is configured by this control. Existing community-runtime LAN/VPN and SparkLink paths remain separate.
- Each session gets a fresh checked copy under the Spark library's `ce-hosts` directory, a copied-file hash inventory, fixed configuration and bounded console tail. A stopped copy is retained for examination; the tested stock input requires about 179 MiB per session. Four active hosts per Spark process is the control limit.
- A window may inspect/stop only its own current session. Stale IDs and duplicate starts are refused. Closing the window requests scoped shutdown. Windows job objects kill its owned server if Spark exits abruptly. Spark does not restore a running server automatically after an app restart.
- Native UDP status uses a connected loopback socket with a bounded response, read deadline and strict field parsing. Only the expected map/name/mode/player limit in the dedicated engine's `openplaying` state is called **Map loaded**. Failed observations clear the current status; a long missing reply is labelled unresponsive.
- Server status is polled in a background worker, never while holding the app-wide host registry. Preparing a copy, switching workspaces and receiving a stalled reply do not intentionally block the editor.

## Genuine native acceptance

The repeatable opt-in challenge starts the actual desktop application and actual classic CE dedicated executables in isolated directories. It uses no mocked IPC or fabricated shared game state:

```
node scripts/test-ce-host-native.mjs --app <built-Spark.exe> --runtime <owned-CE-folder> --output <fresh-short-folder> --map <real-compiler-produced-CE-multiplayer.map>
```

The checked receipt is [ce-private-host-native.json](fixtures/ce-private-host-native.json). It records the exact Spark/server/cache identities, measured map catalog and startup times, native game status and independent cases:

- Actual UI start, native Blood Gulch query response, checked snapshot/configuration and scoped stop.
- Native Slayer, CTF, Oddball, King and Race reports.
- The unchanged reviewed-source CE Workshop cache loads through the real dedicated engine.
- Two independent Spark windows own different real server processes; cross-window stop is refused. Closing one stops its server while the other remains responsive.
- Reloading the owning workspace keeps the same session.
- Unknown command fields, unsafe names/selectors, 128-player requests, stale executable/cache identities and a genuinely modified private cache refuse startup.
- An occupied port fails without launching the game process.
- Abruptly terminating the test Spark process terminates its owned dedicated server.
- The original installation's 127 files remain byte-identical.

The earlier helper-only CE tests and failed client joins are retained. A longer 101-reply trial also remained at zero players; the Windows inspection helper failed to initialize, so the actual client-window blocker has not been diagnosed. **No joined client, player traversal, vehicle physics, audiovisual gameplay parity, MCC/community cross-play, game-peer replication, networked AI or expanded population is accepted here.** Workshop collision still needs a real walkthrough. The separate direct compiled-map editing prototype remains unfinished; none of these dedicated-server or native loose-tag tests complete it.

## Final build measurements

The exact bundled application passed all 12 native cases. In this local sample, the 20-map catalog took **398 ms**, initial private-copy/server startup took **4149 ms**, and a requested 50 ms editor event-loop heartbeat completed in **51 ms** while preparation ran. These are one-machine observations, not network/scale benchmarks.

Regressions: **577 Rust tests passed** with seven existing opt-in cases ignored, **253 frontend tests**, **108 browser tests** and **59 offline scripts** passed. TypeScript, the optimized Windows executable and NSIS packaging passed. All **146 preserved research files** and **127 original game files** remain unchanged.
