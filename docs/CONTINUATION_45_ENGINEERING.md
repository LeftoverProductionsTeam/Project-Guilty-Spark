# C45 native carrier recovery and diagnostics

C45 continues committed C44 (`c2af5ef`) on the existing local master worktree. It preserves the desktop renderer, native transactions, Baboon/Invader reconciliation, SparkLink, BSP Workshop and previous experiments. This is a source/QA continuation. The verified desktop executable and installer remain C44; no new GUI capability, installer or remote publication is claimed.

## Native recovery that was actually exercised

The previous experimental Zombie Apocalypse cache loaded and joined, but its six initial actors remained frozen in remote carrier vehicles. The host produced no received AI controls. Native debug logs also showed empty-tag/tag-class assertions repeated at least 10,000 times. These are failed gameplay evidence even when both processes exit zero.

The investigation found three separate defects:

1. The earlier experimental projectile wrapper had no effect locations, while its vehicle part required a location. The installed OpenCE implementation skips that part. Adding location 0 reaches vehicle creation; that change alone exposed a real seat-exit crash. The failed cache, logs and source remain preserved.
2. The carriers referenced an ammunition collider whose node/region layout did not match their models. Halo Tool discarded it. The source-controlled recipe rebuilds the original small collider's surfaces with the actual model hierarchy through native JMS compilation. The two-region carrier assigns the same small bind-space volume to existing hull/tire nodes. It retains original damage/effect properties. Coordinate recovery through native text queries has an explicit maximum absolute rounding error of 0.00000051 Halo units. This is an experimental derivative, not proof of faithful collision behavior.
3. The standard carrier's eleven-node animation graph did not match its five-node model. Tool removed the graph; the runtime's unit constructor then refused the carrier. The recipe compiles a carrier-only two-frame bind-pose JMA on the exact five-node hierarchy/checksum. Original zombie biped models and animation graphs stay intact.

The exact OpenCE [effect location check](https://github.com/OpenCommunityEdition/OpenCE/blob/da8d455623cf50002e6a798b1980068fd3ca0292/source/effects/effects.c) and [native unit constructor](https://github.com/OpenCommunityEdition/OpenCE/blob/da8d455623cf50002e6a798b1980068fd3ca0292/source/units/units.c) support those prerequisites. A matching publisher PDB resolves the isolated crash to `biped_fix_position`, called through `unit_exit_seat_end`. No game code or memory was patched.

The reusable developer recipe is [recover-zombie-carriers-native.mjs](../scripts/recover-zombie-carriers-native.mjs). It accepts only the complete hashed, reviewed 3,739-tag experimental baseline and the reviewed local tool binaries/companions. It refuses an existing/overlapping output, links, changed inputs and an unexpected write footprint. It copies source first, uses native tools for every tag mutation/compiler operation, records every invocation, and rechecks original/staged tool bytes and original source. Only nine tags may change or be added. It does not download assets, launch Halo, expose remote execution or modify installed maps.

Example, with separately owned inputs and a fresh short workspace:

```powershell
node scripts/recover-zombie-carriers-native.mjs --source-tags 'D:/owned-reviewed-tags' --output 'D:/fresh-carrier-test' --classic-tool 'D:/owned-classic-kit/tool.exe' --invader-edit 'D:/owned-invader/invader-edit.exe'
```

`complete: true` means this native recipe completed. Its receipt separately keeps `gameplayAccepted` and `faithfulConversionAccepted` false. It is not an automatic in-app conversion profile. The inherited recovery baseline still omits two unavailable original custom audio cues.

The final recipe built an actual CE cache 609 (89,421,930 bytes, SHA-256 `bf2d2f6cf6738fec6ab722aafa95ff55a9f44810e1d2d1d1f0a95174a0ac3b81`). The same final sources compiled with the installed official H1A Tool into MCC cache 13 (89,703,578 bytes, SHA-256 `1ee82665e0b9c4d703d9ec49d3dd95c41ab28a9d100874ad7d3b1451d040234f`). The exact final caches were reopened with Spark's bounded content inspector: both retain 5,503 BSP triangles, 5,940 collision triangles, 72 resolved model types, eight decals and the carrier model/animation/collision dependencies. The reader still reports one unsupported tag structure, the inherited scenery-to-biped cross-class placement, and pending target-game acceptance. Full readback is retained privately and its metadata is in the public evidence fixture. These builds do not establish MCC game loading or playback.

## AI results and the gates that still fail

Actual independent private OpenCE host/client processes were used throughout. Synthetic SHOOT/KILL damage cues were disabled during actor observations. The small-collider/native-animation prototype (`ee8c160d…`) exposed **44 shared actual AI-unit identities**, movement controls on **20**, and firing controls on **one**, across 1,825 same-tick comparisons. Position difference was 0.0354 units median, 0.6488 at the 95th percentile and 288.53 maximum. All discrepancies remain included. Earlier prototypes and all failed trials remain available; these counts are not acceptance thresholds.

The final repeat loaded/joined and exited normally, but strict analysis **rejects it**: an actor leaves the world and exceeds the existing 1,000,000-unit QA bound. The report identifies sample 549, unit `3830317338`, tag `3790930049`. A preceding run also contains 192 refused records from extreme positions. The bounds were not relaxed and the bad records were not removed to obtain a passing report. Both final OpenCE logs still contain native empty-tag/tag-class assertions.

Two actual Chupathingy v0.8.1d processes also loaded/joined the final cache, exchanged packets and reported players on two machines. Its debug logs contain tag-group and empty-tag assertions. The analyzer marks this **invalid-or-failed-evidence**. No Chupathingy actor-memory offsets were guessed, and no synchronized-AI acceptance is claimed for that build.

All of these are one-computer tests with scripted input and no accepted audiovisual playback. Native CE game loading, MCC game loading, actual zombie combat/death/respawn, late join, reconnect and a second-computer trial remain open for this recovered map. The earlier accepted CE Blood Gulch/Workshop human tests remain distinct. This work observes the community engine's existing game protocol; it does not implement an MCC/community bridge or equate editor SparkLink synchronization with game replication.

## Native faults and binary rewrites

[native-runtime-health.mjs](../scripts/native-runtime-health.mjs) classifies native assertions, bad tag references/classes, object creation failures and crashes separately from join counters. The runner hashes the final native debug log; analysis rejects changed bytes or redirected log directories. Legacy ANSI logs retain their exact byte hashes, while JSON remains strict UTF-8. Known optional intro/virtual-file noise is counted separately. Absence of classified faults still does not grant content acceptance. Strict actor refusals now name the failed field/unit/tag and produce a readable JSON refusal.

Repeated native compilation changed the binary hashes of three generated tags and 610 bytes of the corresponding CE caches. The original byte differences and both outputs are retained. **Invader's strict comparison, with neither relaxed float precision nor functional-precompile normalization, matches 12/12 `gs_compat` tags.** Full native field listings of the three generated tags also match. A real Invader edit of a copied collider from body vitality 0.0001 to 0.5 is correctly reported as mismatched. This distinguishes decoded equivalence from a genuine changed value. It does not certify every opaque byte or make the failing gameplay safe.

There is no new basis for blaming Baboon or Invader for a corrupt write. Invader correctly refused attempted edits to read-only collision arrays. The missing effect location belonged to the earlier experimental Spark QA wrapper. The inherited carrier incompatibilities, runtime assertions and compiler byte variance have separate evidence and attribution. C37/C38 native save-reconciliation safeguards remain unchanged.

## Measured diagnostic performance

The detailed read-only census repeatedly searched the same PDB JSON layout for every object. C45 resolves those verified offsets once per census; it reads the same selected objects/fields and retains all tick-crossing refusals. It also reads unit control flags at their proper 16-bit width.

Preserved before/after observer binaries ran concurrently against **each of the same two stock b30 game processes**, using the same executable, PDB, content and optional complete census:

| Successful complete census | Before median | After median | Reduction | Successful census samples |
| --- | ---: | ---: | ---: | ---: |
| Host | 28.824 ms | 16.276 ms | 43.5% | 18 → 49 |
| Client | 27.251 ms | 12.789 ms | 53.1% | 13 → 32 |

Observed field paths are identical (40 host, 27 client). One overlapping same-tick host census matches fully; no same-tick client census overlaps. All read errors remain counted: host tick-crossing refusals 80 → 52, client 65 → 47, with initialization/pool refusals separate. The stock native logs have no classified content faults. These statistics cover successful full census reads under simultaneous diagnostic load; they are not a general all-read latency, CPU/GPU, renderer, startup or RAM improvement claim. C44's previous complete-resource map-load measurements remain intact.

## Regressions and preserved release

- Locked Rust workspace: **616 passed, seven opt-in cases ignored**.
- Frontend: **284 passed**; browser: **136 passed**; offline scripts: **59 passed**.
- MCC/native analyzer/source tests: **14 passed**, including malformed inputs, duplicate identities, topology/rig refusal, ANSI hashing and redirected-log refusal. Both existing CI jobs gain the applicable diagnostics checks; no original checks or repository rules are weakened.
- Real native desktop window/history regression: **seven cases passed** against the unchanged verified C44 executable, including acknowledged edit recovery, observed views, editing ownership and pop-out history. This is not a newly built C45 GUI executable.
- Native source recovery, both native cache families, private game processes, semantic comparison and negative controls use actual tools/processes. Parser/unit fixtures are labeled as synthetic and are not gameplay evidence.
- Actual offline native symbol-reader negative controls refuse an out-of-image RVA, more than 32 addresses and a mismatched executable before opening a game process.

Preservation verification confirms 160 dirty-root untracked files and both dirty patches unchanged, 67 original Zombie Apocalypse files unchanged, 94 installed maps unchanged, 28 prior references retained, all 21 prior branch tips contained, and 12 C42–C44 release artifacts unchanged. The preceding 408 ledger rows are byte-exact; five C45 rows bring the total to 413. C35–C39 history and experimental references remain preserved. The current C44 installer/portable packages are unchanged; C45 provides updated source and QA tools. No clean-machine installer acceptance or remote publication is claimed. General direct compiled-map structural editing, arbitrary live spawning/BSP replacement and complete rendering/audio parity remain open.

Next work is to trace the remaining bad-tag call and extreme actor launch/physics path, resolve Chupathingy's loader assertions, and then repeat combat/lifecycle and visible CE/MCC acceptance. Do not clamp away failures, delete authored actors or call a zero exit a complete conversion. The C43 connected-world physical traversal gate and four-region backlog also remain open. [Metadata evidence](fixtures/c45-native-recovery.json), [push summary](C45_PUSH_SUMMARY.md).
