# Standalone workflow

MCC Standalone (halo_tag_test.exe) loads editable tags. It is part of Halo: CE Mod Tools - MCC. Select that separate kit through onboarding or Settings; the retail MCC installation alone is insufficient. See the [official tools overview](https://learn.microsoft.com/en-us/halo-master-chief-collection/general/overview-tools) and [Standalone guide](https://c20.reclaimers.net/h1/h1-ek/h1-standalone-build/).

Spark builds in a fresh owned job using a verified copy of the selected legal tags. The job retains source identity, tool output, changed dependencies, a cache checksum and a validation receipt. Stock maps and editing-master tags are kept separate. Native Tool gets a short temporary workspace alias to avoid its observed legacy filename limit; only the exact alias created for that invocation is removed.

For source review, use Build → Open compiled map. Spark checks the saved project's fingerprint, receipt ownership and output hash, then preserves and opens the actual cache in a separate Level Editor tab. A map with pending BSP, camera or animation changes cannot use unchanged-cache validation as a replacement for rebuilding.

For a native camera take, open Machinima, configure compatible shots and animation assignments, enable the native take, save and build. Launch built take in MCC Standalone checks the current receipt and compiled scenario hash. Choose desktop, 1080p, 1440p or 4K recording size; toggle the flashlight for camera/HUD controls and record the game window with OBS. Actor input stays enabled while the SDK camera is active. Existing scripted scenarios are refused when automatic source replacement would discard their scripts.

The actual Yoyorast test loaded its isolated tagset, started a custom animation on the real 19-bone Spartan, and executed HUD-off camera controls with actor input enabled. The native UI launched 1920×1080. This establishes the tested SDK workflow; actual OBS recording, human actor movement acceptance and retail MCC playback remain separate checks.

For a BSP connection, select matching editable destination/donor tags and build the source connection. Check the actual output through Open compiled map. Launch Standalone against that exact job's tags/data and use its original scenario path. The owner-run Timberland–Sidewinder acceptance retains its exact job and engine log; see [the current report](RECLAMATION_AND_WORKFLOW_POLISH.md). Long tag paths also require a short content path for the game. Do not point a playtest at stock or unrelated working tags.

Standalone success is not retail cache acceptance and does not establish multiplayer behavior. Neither automatic live BSP replacement nor a Standalone tag-reload API is implemented. Complete the player walkthrough and load the compiled cache in retail MCC before declaring a map gameplay accepted.
