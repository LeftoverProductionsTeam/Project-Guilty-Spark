# Matching Custom Edition playtests

This continues committed `306c6e5`. A private CE server can now prepare and launch its matching local client from **Online → Host game**. Installed maps and validated project builds use the same workflow, including a project cache with the same filename as a stock map.

## Use it

1. Connect your owned Custom Edition installation. For a project map, save and finish its Custom Edition build first.
2. In **Online → Host game → Halo Custom Edition**, select the saved build or installed map and start the private server. Wait for **Map loaded**.
3. Choose **Prepare matching client**. Spark checks the exact private map, shared resources, client executable and approved supporting files. This creates a separate test-profile directory; your normal profiles and installed stock maps are not copied over or changed.
4. Choose **Launch CE playtest**. Halo receives the local server address and this session's game/profile directories. Complete any first-run/profile prompts inside Halo. A live process does not certify that it joined the map.
5. **Stop playtest** closes only this session's client, leaving the server available. Stopping the server, closing its owning Spark window or abruptly exiting Spark closes its owned client too. Source, private inputs and session evidence remain available.

This is a loopback-only test on one computer. The separate-profile first-run experience and a real joined player remain acceptance gates. No game keys, passwords or personal profile files are imported.

## File and process guarantees

The client uses the server's existing private game copy, avoiding a second full resource copy. Native build lookup, saved-fingerprint checks, owned output/receipt verification and source reconciliation remain in the existing build path. The matching client never falls back to the installed stock namesake. A later source edit does not change the running snapshot.

Copy-time identities are retained in memory. Editing `copied-files.json` or a session receipt cannot authorize changed bytes. Prepare and launch recheck the bounded inventory, sizes, hashes and client PE architecture. Added files, links and altered inputs refuse launch. Approved file handles deny write/delete sharing on Windows while the client is running; this is a local content-integrity guard, not publisher authentication or a security boundary against a privileged local program.

Commands accept only an owning session ID and `prepare`, `launch` or `stop`. They do not accept arbitrary executables, map paths, console commands, remote tool requests or binary patches. Concurrent preparation is refused; cancellation invalidates the unfinished operation before it can launch. Window/session ownership and Windows job objects scope process cleanup to Spark's own children.

## What was tested

The repeatable native challenge uses the actual desktop UI/native IPC, the installed CE executable, Halo Tool and Invader, and a separately reviewed source-recovery receipt:

```
node scripts/test-ce-host-native.mjs --app <Spark.exe> --runtime <owned-CE> --output <fresh-short-directory> --map <prior-compiled-CE.map> --kit <H1A-kit> --invader <Invader-folder> --recovery <reviewed-source-recovery.json> --client-seconds 45
```

The optional client flag opens real Halo GUI processes; omit it for preparation/refusal tests without GUI launches. The existing five-game-type, managed-build, corruption, stale-revision, redirected-receipt and cleanup cases are retained. New cases check exact map/resource/client identities, a fresh isolated profile, forged-manifest refusal, an added DLL, cancellation, cross-window/stale-ID refusal, genuine compiled Workshop content, client input locks and independent/window/abrupt-exit cleanup. Controlled invalid writes come from the QA harness, not Baboon or Invader.

The checked receipt is [ce-matching-client-native.json](fixtures/ce-matching-client-native.json). It distinguishes file preparation and owned process launch from a successful game connection. Failed or preliminary attempts are retained separately. The computer-use helper failed to initialize, including after reset; a requested visible window is not visual acceptance.

## Still open

No player join or collision walkthrough has been accepted. Current evidence does not prove gameplay, full rendering/audio parity, a clean-machine install, LAN/public hosting through this new CE control, multiplayer/AI replication, expanded player populations or universal map conversion. The reviewed source retains its seven documented behavior corrections and is not lossless recovery. C35–C39 source transactions, Baboon/Invader reconciliation, shared editing and integrity safeguards remain intact. Direct compiled-map authoring stays unfinished in the master backlog; native loose-tag compilation and process tests do not complete it.

## Final build measurements

The exact bundled executable passed all **29 native cases**. Matching-client preparation checked **67 files / 192,008,184 bytes** in **170 ms**; the requested 50 ms editor heartbeat completed in **55 ms**. The genuine Workshop CE build took **15855 ms**. These are local observations on one computer, not scale or network benchmarks.

The corrected-window client trial lasted **120 seconds** and recorded **119 server-status observations**, with a maximum of **0 players**. A visible window was requested; a player join, first-run visual acceptance and gameplay remain unverified.

**581 Rust tests passed**, with seven existing opt-in cases ignored; **253 frontend tests**, **117 browser tests** and **59 offline scripts** passed. TypeScript, the optimized executable and NSIS packaging passed. All **127 original game files**, **2,455 reviewed source tags** and **146 preserved research files** remain unchanged.
