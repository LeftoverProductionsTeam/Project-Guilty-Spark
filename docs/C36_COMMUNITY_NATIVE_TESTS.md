# C36 private native community runtime tests

These tests run actual released game executables over the owner's original Xbox Halo data. They use the engines' existing system-link/test interfaces; Spark introduces no game protocol or separate player pool. They are distinct from the application invitation-parser tests, editor previews, packet-only bots, human play and two physical computers.

[Metadata-only evidence](fixtures/c36-community-native-verification.json) binds each result to its native log, execution receipt, source analyzer, exact executables and map hashes. [Pinned release files](fixtures/c36-community-client-files.json) permit independent reproduction without redistributing clients or game content. [Protocol/source/license research](research/C36_COMMUNITY_INTEROPERABILITY.md).

## Exact environment and content

- **OpenCE build-329**, source `70c5e600ea345345db040ce1914903cc6746b46e`, Windows x86; **Chupathingy v0.8.1c**, source `880a933ec33b2ae2dbbeb4018a9090c528a075bc`, Windows x64. Official package digests and publisher Ed25519-signed checksums were verified; these are not Windows Authenticode claims.
- Owner-provided **3,728,867,328-byte XDVDFS image**, SHA-256 `bbed30485a34fb971687648f31a8b50467c92d7ef296e3f97bad51372db1b012`. Read-only bounded range copies produced native cache-5 data. The image was rehashed unchanged after extraction and after all game tests.
- Blood Gulch SHA-256 `50fe52406f075d975e24100a65b26ff696458023dd3509878953052ab0ef858f`; A30 `4875fa105e6c517589a796cfdcc7fcaa07e98df13d14e601bfc9eb1eab7e30b5`. UI and Carousel identities are in the receipt. No cache header/checksum/data was rewritten.
- Separate copied executables, data, saves and logs per game. Fixed private loopback addresses `127.0.0.210`/`.211`; offline mode, public listing off, map sharing/downloads off, UPnP off, automatic updates off. No firewall/router or normal owner Spark library changes.
- OpenCE uses its native null renderer with dummy SDL video/audio. Chupathingy uses a hidden native window and dummy audio: its exact release checks the timed exit behind a window test. Both have a parent-owned watchdog; any forced exit would be abnormal.
- Native `host:bloodgulch:slayer`/`join`, independent scripted player inputs, impact-damage interval four seconds and forced-kill interval 17 seconds. Host/client timed exits are 80/60 seconds. A separate `host:a30:coop` trial uses the actual campaign map.

The upstream ISO importers are interactive first-start workflows and are suppressed by hidden/timed startup. No reviewed import CLI exists. The production Spark app does not gain a general ISO importer from this private QA extraction.

## Results, including disagreements

| Host → client             | Map         | Actual result                                                                       | Conservative analyzer                                                                                    |
| ------------------------- | ----------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| OpenCE → OpenCE           | Blood Gulch | Joined, two-player native simulation; 47 exact shared samples / 94 player snapshots | Selected alive/health/shield/score/kill/death/team/machine values agree at printed precision; CLI exit 0 |
| Chupathingy → Chupathingy | Blood Gulch | Joined and simulated; 46 one-to-one near-phase pairs (host often +2 ticks)          | Four shield differences of 0.01–0.02; CLI exit 2                                                         |
| Chupathingy → OpenCE      | Blood Gulch | OpenCE explicitly refuses host network 32 versus client 39                          | No joined simulation; CLI exit 2                                                                         |
| OpenCE → Chupathingy      | Blood Gulch | Joined and simulated; 47 exact shared samples                                       | 16 snapshot disagreements, including impact/kill sampling boundaries; CLI exit 2                         |
| OpenCE → OpenCE           | A30 co-op   | Both loaded campaign and simulated; 47 exact shared samples                         | One shield difference (0.85/0.84); scores remain -1; CLI exit 2                                          |

**Shared simulation is not perfect parity.** The OpenCE baseline has position differences up to **0.06739 / 0.09245 world units** for its two players and three sampled grenade discrepancies. Chupathingy's near-phase comparison retains four shield and two weapon-record differences. The mixed run has a **98.165-unit** position disagreement at a scripted relocation boundary: host logs before that relocation and client after it; the next observation's difference is **0.04755**. Forced-death counters likewise become visible one sample earlier on the client and agree by the next sample. Raw discrepancies remain in the evidence; they are not normalized into a pass.

A30 has 94 matching alive/dead/kill/death/team/machine snapshots and 75 matching living-health observations; shields match 74/75. Four grenade and three weapon-record differences are observed and converge at the next observation. Equal -1 scores do not establish scoring behavior because this campaign has no score callback. No enemy actor identity, movement, attack or death observations were collected: **AI agreement remains unaccepted**.

The native `SHOOT` hook constructs and applies held-weapon impact damage. It does **not** prove trigger input, aiming, projectile flight or rendered muzzle fire. `KILL` separately forces a native death. These are real engine damage/replication tests, with a narrower acceptance scope than human combat.

All completed trials exited 0 through each game's timed-exit path, without watchdog termination, and their copied input maps stayed unchanged. Host logs continued after the last client samples. Blood Gulch hosts transitioned to game-over; A30 continued campaign ticks. This does not prove graceful in-game departure, a continuing joinable lobby or reconnect recovery. Bink movies were not supplied to the private fixtures; no cinematic, visible-render or physical-audio acceptance is claimed.

## A real missing-content failure

The first OpenCE pair loaded UI but never hosted. Native fast setup opened **Carousel before applying the requested Blood Gulch override**, and `carousel.map` was absent. Supplying its unchanged owned disc data resolved the problem. The reproducible QA runner now rejects missing Carousel before copying a client or launching a process; this prerequisite rejection was exercised on the incomplete real fixture.

This is exact-version fast-host evidence, not a universal rule for all Halo engines. UI-cache presence establishes only a startup prerequisite. Prefer the complete matching original maps folder, as the native importer does. MCC/PC/CE maps are not substitutes for these Xbox base files.

## Reproduce privately

Use the exact official releases linked above and an owned Xbox maps folder already imported through the runtime or another reviewed local method. Keep the original image/maps unchanged. Create a fresh parent QA folder; the runner refuses an existing output directory and verifies every copied publisher file against the pinned inventory.

```powershell
node scripts/test-community-runtime-native.mjs --host-id opence-build-329 --host-dir <OpenCE-release-folder> --client-id opence-build-329 --client-dir <OpenCE-release-folder> --maps <owned-Xbox-maps-folder> --output <fresh-private-pair-directory>
node scripts/analyze-community-runtime-native.mjs --run <private-pair-directory>
```

Swap the IDs/directories for the mixed or Chupathingy pair. Add `--mode a30:coop` only for the separate campaign test. These commands launch two actual native games; they are opt-in and are not part of ordinary CI. The runner's exit 0 establishes controlled execution/input preservation only. The read-only analyzer emits JSON and returns **0** for agreement of its selected sampled fields, **2** for refusal/missing simulation/disagreement and **1** for invalid input. Keep a nonzero analysis result visible.

Exact-tick comparisons are retained separately from monotonic one-to-one comparisons within two nominal 30 Hz ticks. This is a comparison aid, not a declared latency or position tolerance. Logs sample approximately once per second and values have only their printed precision. The analyzer binds files by hash; it does not independently authenticate an arbitrary supplied log or executable. Complete private analyses retain more examples; public metadata caps examples while preserving totals.

## Integration boundaries

The one-direction mixed result and reverse-direction refusal do not authorize a broad OpenCE39/Chupathingy32 compatibility exception. Public listings still lack authenticated exact wire/build/content information. Spark's conservative listing gate is unchanged. Actual application listing/invitation-to-client joining remains a separate gate from this native LAN baseline.

No MCC foreign-wire translation, browser/stock-Xbox cross-play, AI/wave agreement, eight-player campaign, Firefight, 128-player scale, full item/weapon state, complete rendering/audio parity or human gameplay is certified. Native engines own the simulation; no engine/cryptographic implementation was copied into Spark. The full goals remain in the [ledger](MASTER_FEATURE_LEDGER.md).
