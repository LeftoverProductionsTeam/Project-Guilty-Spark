# Multiplayer test plan

Status: **NOT EXECUTED** as of 2026-10-25. No two-computer session, MCC co-op session, restored native map launch, or sustained gameplay test has been performed by this research task. This document is an execution and evidence plan, not a test-success report.

## Separate targets

| Target | Required setup | Entry condition |
| --- | --- | --- |
| MCC campaign co-op | Two Windows PCs with compatible Steam MCC/Halo1 installations and Xbox-network accounts; two players | Complete, authored campaign derivative; validated package on each machine; EAC-disabled selection observed |
| MCC custom multiplayer AI | At least two compatible MCC PCs in private custom games | All campaign-independent content requirements plus a documented acceptable extension path; currently blocked |
| ChupathingyCE ordinary multiplayer | Two physical computers using the recorded native build/network protocol | Validated compatible map and resources; explicitly registered user-installed engines |
| OpenCE ordinary multiplayer | Two physical computers using the recorded native build/network protocol | Same requirements, evaluated independently from ChupathingyCE |
| Native campaign co-op | Two computers using a compatible selected engine/build | Authored campaign map; separate campaign-script test coverage |
| ChupathingyCE/OpenCE interoperability | A documented exact compatible build pair on two computers | Same-engine cases already pass; explicit version/network and map-family evidence |

Windows/macOS/Linux combinations are separate native test rows. An unsupported or unavailable target is BLOCKED, not a successful cross-platform result. MCC/native interoperability is not an assumed target. Native campaign success does not prove arbitrary multiplayer AI replication.

## Evidence and status rules

- **PASS:** the stated case was executed and all its observable conditions were met. Attach evidence identifiers.
- **FAIL:** execution produced an incorrect result, crash, mismatch or failed assertion. Preserve the first failing evidence.
- **BLOCKED:** a prerequisite or required observation is unavailable. Record the exact prerequisite.
- **UNTESTED:** the case has not been executed.

Keep support evidence separate: official documentation, upstream source implementation, local file inspection, application unit test, single-machine gameplay, and real two-computer gameplay answer different questions. An imported friend manifest is self-reported content, not remote attestation. A manifest-comparison PASS means only that the specified fields align.

No mock, synthetic actor simulation, native two-process comparison script, one-machine video, or adapter capability flag substitutes for two-computer gameplay. Evidence must establish that the two independently running game clients observed the same session and behavior.

## Preflight record

Keep a private local execution record with machine labels such as A/B, operating system, exact engine build, executable hash when available, native network version, adapter/schema version, selected mode, package identity, source/output/resource hashes, build-tool version, and validation result. Hash the actual files selected for deployment. A filename match does not establish content identity.

Use a separate allowlisted shareable manifest containing only runtime/adapter identifiers, platform, bounded build/network version tokens, selected mode, map/cache identity, package/source hashes, required shared-resource names and hashes, and build-validation state. Do not export local paths, usernames, account identifiers, machine names, IP addresses, arbitrary notes, logs, or credentials. Nothing is uploaded automatically. Review captures/logs before sharing them; runtime logs can contain data that the preflight manifest deliberately excludes.

Compare both manifests before launch:

1. Reject unsupported schema/adapter versions, malformed hashes, duplicate resource names and unexpected fields. Bound file size and string lengths.
2. Require the same selected runtime and mode unless an explicitly tested cross-runtime compatibility rule covers that exact pair. Readme-level compatibility alone does not create a rule.
3. Compare known game builds and, for native engines, network versions. Unknown required values block compatibility rather than passing through an empty string.
4. Require identical map and required resource hashes, and matching MCC package identity/hash. Record optional-resource differences because they can still affect audio or visuals.
5. Require source/build validation and confirmed resource completeness. An unverified extraction or synthetic fixture blocks readiness.
6. Confirm MCC's EAC-disabled choice and private mode through the actual game UI. A JSON boolean or Steam launch request is only a declaration until observed.

Native executable hashes may legitimately differ between operating systems. Preserve them for evidence; do not equate that difference alone with network incompatibility. Prefer exact source/release and network-version compatibility. Different unknown builds remain blocked.

Negative preflight cases must cover changed map bytes, mismatched required resources, missing resources, incompatible mode/runtime/network version, unsupported schema, an extra path/account field, and truncated or oversized JSON. A deliberately mismatched manifest must never yield readiness. Perform negative tests with copies or synthetic manifest inputs, not by corrupting game installations.

## Source and deployment prerequisites

- Preserve the original imported maps and archive hashes. Record the derived output and any mechanics changed during restoration.
- Confirm original-runtime shared resources and complete extraction. Do not replace Demo/PC resources with unrelated MCC files merely because their names match.
- Record exact tool commands, tool versions, bounded build logs, cache inspection and metadata validation.
- For MCC, use the official local-package layout and verify scenario references. Observe package enumeration after restarting into the documented anti-cheat-disabled mode.
- For native engines, use the engine-specific data/map folders and correct original resources. Inspect registrations without executing archival EXEs/DLLs. Do not invent direct-map launch arguments.
- Treat deployment, manifest registration, runtime launch, hosting and any runtime asset-sharing setting as separate explicit actions. Preserve backups and uninstall/rollback records for owned package changes.

## Real gameplay cases

Record the host and client evidence together. Use synchronized timestamps, an agreed actor/wave test script, and simultaneous captures when useful. Stable runtime actor identifiers are preferable; where the game exposes none, document the visual correlation method and the resulting limitation. Do not invent diagnostic IDs or metrics the runtime does not expose.

| ID | Case | Required observations on both computers | Initial status |
| --- | --- | --- | --- |
| G01 | Load and join | Correct map/mode/content, both player positions, no load errors; joining method and build recorded | UNTESTED |
| G02 | Enemy creation | Same actor population and spawn sequence; no duplicates or invisible server-only enemies | UNTESTED |
| G03 | AI decisions and movement | Corresponding actors pursue/attack the same valid targets; movement, facing and animation remain coherent | UNTESTED |
| G04 | Client-fired damage | Client hit produces one authoritative health change/death visible to host and client | UNTESTED |
| G05 | Host-fired damage | Equivalent host damage behavior without duplicate death, score or drops | UNTESTED |
| G06 | Melee, explosions and vehicles | Test each mechanic actually used by this map; damage, seats and occupancy agree where applicable | UNTESTED |
| G07 | Death and respawn | Enemy/player death, cleanup, drops and respawn follow the specified mode on both clients | UNTESTED |
| G08 | Wave and objective progression | Counters, trigger conditions, timers and next-wave/end-state agree; no client-only progress | UNTESTED |
| G09 | Devices and scripted events | Relevant doors, machines, pickups, effects and scripted state agree; note unsupported or redesigned behavior | UNTESTED |
| G10 | Host/client role reversal | Repeat G02-G09 with the other physical machine hosting | UNTESTED |
| G11 | Sustained session | At least 30 minutes and enough complete waves to exercise progression; record duration, crashes and divergence | UNTESTED |
| G12 | Higher actor load | Use the restored map's intended maximum active population; observe simulation/frame stability and missed events | UNTESTED |

Cases irrelevant to a particular source mechanic may be recorded as not applicable with the source evidence, rather than silently skipped. For a release candidate, extend the sustained test to 60 minutes or a full run if longer. Record actor counts, frame time, latency, packet loss, resynchronizations and bandwidth only where reliable instrumentation exists. No numeric performance claim should be invented from a video.

## Campaign-specific cases

| ID | Case | Acceptance evidence | Initial status |
| --- | --- | --- | --- |
| C01 | Two-player start | Both players spawn in valid authored locations with intended equipment and difficulty | UNTESTED |
| C02 | Checkpoint and wipe | Record when checkpoint state is saved; both clients recover the same intended state after team death/revert | UNTESTED |
| C03 | Player separation/rejoin | Record respawn/teleport behavior and preserve intended survival mechanics or document deviations | UNTESTED |
| C04 | Campaign script progression | Objectives, BSP transitions, devices and completion agree across clients | UNTESTED |
| C05 | Save/restart behavior | Record supported restart/resume behavior and whether progression persists correctly | UNTESTED |

For MCC this is a two-player campaign result. It must not be reported as larger-lobby custom multiplayer. Do not promise late join or host migration unless separately observed and supported.

## Disconnects and impaired connections

Use only the testers' own private session/network. First establish a clean baseline. Then record a client departure, reconnect attempt, host departure, and an ordinary temporary connection interruption. Acceptance is understood and reproducible behavior without corrupting the package or misrepresenting state; unsupported reconnect or host migration may be a documented limitation.

If controlled latency/loss testing is available, specify the tooling, impairment level and affected direction, and repeat G02, G04, G08 and disconnect cases. Do not count an impaired-network simulation in Guilty Spark as a test of the game engine. Record crashes, timeout messages, lingering actors and recovery steps on both machines.

## Result artifact

Create one result record per target/build pair. Include:

1. Exact target, UTC test window, participants as anonymous A/B labels, machine platforms, build/network versions, adapter version, selected mode and manifest hashes.
2. Provenance and output/resource/toolchain hashes, package/build-validation report and known restoration deviations.
3. Every applicable case ID with PASS/FAIL/BLOCKED/UNTESTED, actual observation, and evidence file identifiers/hashes.
4. Failures and reproduction steps, crash/log locations in the private record, and privacy-reviewed copies if shared.
5. A narrow conclusion: for example, which exact same-engine builds and OS pair synchronized which tested mechanics. Include untested modes, platforms, versions and limitations.

Do not promote a runtime capability to gameplay-verified or multiplayer-verified until the corresponding result exists. A new runtime build, changed map/resources, changed protocol, or AI/progression change invalidates affected results and requires targeted reruns.

## Primary references

- [H1 multiplayer synchronization boundary](https://c20.reclaimers.net/h1/guides/multiplayer/synchronization/).
- [Official MCC EAC-disabled workflow](https://support.halowaypoint.com/hc/en-us/articles/360037475251-How-to-Launch-Halo-The-Master-Chief-Collection-with-Easy-Anti-Cheat-EAC-Disabled).
- [Official Excession package structure and validation limitations](https://learn.microsoft.com/en-us/halo-master-chief-collection/excession/setup/folderstructure).
- [ChupathingyCE audited README](https://github.com/ChupathingyCE/chupathingyce/blob/d7fafc81f824886d7fccd58fcf954691df6c6901/README.md) and [network architecture](https://github.com/ChupathingyCE/chupathingyce/blob/d7fafc81f824886d7fccd58fcf954691df6c6901/port/linux/NETCODE.md).
- [OpenCE audited README](https://github.com/OpenCommunityEdition/OpenCE/blob/7fb941b0b205edb1f7ecbb0aa6c2d7f5b884732d/README.md) and [network architecture](https://github.com/OpenCommunityEdition/OpenCE/blob/7fb941b0b205edb1f7ecbb0aa6c2d7f5b884732d/port/linux/NETCODE.md).
- [Feasibility assessment and licensing/provenance constraints](MCC_MULTIPLAYER_AI_FEASIBILITY.md).
