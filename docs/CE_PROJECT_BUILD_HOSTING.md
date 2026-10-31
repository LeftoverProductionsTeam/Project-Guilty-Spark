# Host a saved CE project build

This continuation extends the checked private CE host from `fbe1cbf`. A validated Custom Edition project output can now be selected directly in **Online → Host game**, without copying it into or overwriting the registered game installation.

## Workflow

1. Save the current map, choose its Custom Edition build target and complete its normal native build. The existing Tool/Invader/source checks remain in force.
2. Open **Online → Host game → Halo Custom Edition**. The map selector separates **Validated project build** from **Installed CE maps** and selects the available project output.
3. Start the private server. Spark resolves the project/build IDs natively, checks the current saved fingerprint, owned compiler receipt, output directory, target/header/name and exact cache hash, then copies that output into a new private game snapshot.
4. Continue editing the source if needed. The running server keeps the selected built revision. Save/rebuild before starting a new session from changed source.

The client needs the matching saved map copy. This control deliberately leaves the installed stock map untouched; it does not yet prepare or verify a matching client playtest installation. A server reporting its map loaded is separate from a joined client or a player walkthrough.

## Consistent selection and refusal

Stock and project maps may have the same filename. The selector uses separate keys and retains native build provenance; a request for an unavailable project build never falls back to a stock namesake. Missing or stale builds offer **Build this map**, returning to the current map's source/build workspace. Unsaved changes disable the project option's start action while keeping explicit installed-map selection available.

After a rebuild, the selector follows the new validated saved revision. A late catalog result from another project cannot replace the current selection. An active snapshot retains its own controls and identity through workspace reloads and project changes. The same private-process/window ownership and abnormal-exit cleanup from the previous continuation remain active.

Native requests contain project/build lookup IDs, never arbitrary map paths, raw binary patches or remote tool commands. The server's map input must resolve through the existing validated build history and its owned job. A wrong runtime, changed saved fingerprint, unowned ID, changed cache or redirected receipt is refused. The cache is rehashed during private-copy preparation and read back before execution.

Here, “saved build” identifies the compiled artifact and saved project inputs; it does not claim that pending external loose-tag edits have already been reconciled or rebuilt. Existing Baboon/Invader semantic validation and recovery still govern the next native source build. Direct compiled-map authoring is unchanged and remains unfinished.

## Native acceptance

[The receipt](fixtures/ce-project-host-native.json) records the exact final application, native Tool/Invader identities, cache hash, saved fingerprint, timings and regressions. The repeatable challenge is:

```
node scripts/test-ce-host-native.mjs --app <Spark.exe> --runtime <owned-CE> --output <fresh-short-dir> --map <prior-compiled-CE.map> --kit <H1A-kit> --invader <Invader-folder> --recovery <genuine-reviewed-CE-source-recovery-receipt.json>
```

The optional project challenge verifies the actual prior recovered tag inventory, creates Workshop geometry through the desktop UI, builds it through the genuine Halo toolchain and hosts the resulting native cache. Its `bloodgulch` filename intentionally collides with stock Blood Gulch. The private server copy contains the new compiled bytes; the installed game retains the original bytes.

The challenge also changes a saved spawn to invalidate further starts, verifies that the existing frozen server remains unchanged, rejects a genuinely corrupted output and a redirected receipt, restores the exact private QA inputs, and hosts the valid output again. The corrupted writes are made by the controlled Node QA harness; they are not attributed to Baboon or Invader. All reviewed base tags and original game files are checked before and after.

The prior stock-map, five-game-type, two-window ownership, scoped stop, busy-port refusal and abrupt-process cleanup checks are repeated. Preliminary failed automation attempts remain in their separate private evidence folders; they are not counted as successful acceptance.

## Remaining gates

The earlier client trial used `windowsHide: true`. In the installed Node runtime's [libuv 1.52.1 launcher](https://github.com/libuv/libuv/blob/v1.52.1/src/win/process.c#L981-L987), that flag requests a hidden GUI window. The helper now requests a visible client and permits a bounded 5–120 second observation period. A new 90-second trial received 91 server replies but still observed zero joined clients; visible launch was requested, not visually certified. The owner's screen feedback remains useful for diagnosing the remaining startup/profile issue.

This is Windows classic CE, unextended version-609 multiplayer caches and loopback-only hosting. The source test uses the documented reviewed CE tagset with seven explicit behavior changes, not lossless restoration. Matching-client preparation and its first real join, Workshop collision traversal, gameplay/render/audio acceptance, public/LAN exposure for this classic CE control, game-peer/AI replication and universal conversion remain open. SparkLink editor synchronization stays separate from game networking.

## Final build measurements

The exact bundled application passed all 19 native cases. In this local sample, the 20-map catalog took **350 ms**, initial private-copy/server startup took **4101 ms**, and a requested 50 ms editor event-loop heartbeat completed in **55 ms** while preparation ran. These are one-machine observations, not network/scale benchmarks.

The new native CE Workshop compilation took **16376 ms** and its managed-build server startup took **2999 ms**. All **2,455 reviewed base tags** remain byte-identical.

Regressions: **578 Rust tests passed** with seven existing opt-in cases ignored, **253 frontend tests**, **113 browser tests** and **59 offline scripts** passed. TypeScript, the optimized Windows executable and NSIS packaging passed. All **146 preserved research files** and **127 original game files** remain unchanged.
