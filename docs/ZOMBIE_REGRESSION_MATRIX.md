# Zombie Apocalypse regression matrix

Recorded 2026-10-25 from the real corpus tool run and separate native-application ZIP QA. File identities and machine-readable results are in [fixtures/zombie-corpus-inventory.json](fixtures/zombie-corpus-inventory.json); S1-S8 are defined in [ZOMBIE_APOCALYPSE_ARCHAEOLOGY.md](ZOMBIE_APOCALYPSE_ARCHAEOLOGY.md).

**PASS** means the named operation actually passed. **FAIL** means an executed operation failed. **BLOCKED** means a prerequisite or implemented target path is missing. **UNTESTED** means no runtime experiment was performed. A parser, editor or manifest comparison PASS is never a game or multiplayer PASS.

## Source and editor operations

| Source | Header/tags | Collision bounds | Project save/reload | Preserved copy read-only | Original bytes unchanged | Complete dependencies |
| --- | --- | --- | --- | --- | --- | --- |
| S1 ZAMD menu | PASS | PASS | PASS | PASS | PASS | BLOCKED |
| S2 ZAMD gameplay | PASS | PASS | PASS | PASS | PASS | BLOCKED |
| S3 Demo gameplay | PASS | PASS | PASS | PASS | PASS | BLOCKED |
| S4 Demo menu | PASS | PASS | PASS | PASS | PASS | BLOCKED |
| S5 PC gameplay | PASS | PASS | PASS | PASS | PASS | BLOCKED |
| S6 PC menu | PASS | PASS | PASS | PASS | PASS | BLOCKED |
| S7 older nested copy | PASS | PASS | PASS | PASS | PASS | BLOCKED |
| S8 older root copy | PASS | PASS | PASS | PASS | PASS | BLOCKED |

These results come from eight actual supplied scenario paths, not parser fixtures. Source immutability is a content-hash check. The corpus records original read-only attributes separately. Seven distinct hashes produce seven library entries; S7/S8 are duplicate bytes, not two different restored maps. The actual native application also imported the corpus into seven entries. That application-level result does not establish playback in Halo.

## Executed MCC conversion attempts

| Source | Status | Stage / observed blocker | Attempt ID |
| --- | --- | --- | --- |
| S1 | FAIL | Compilation: invalid Ogg input; `sounds\music\zamenumusic.sound` | `090296c9-1619-4d76-ba10-368e5ba4efab` |
| S2 | FAIL | Extraction incomplete: **237 errors**, including resource bitmap failures | `07fff38d-374a-46f9-a182-4c5a9c038e0b` |
| S3 | FAIL | Extraction incomplete: **2 errors**, missing `scorpion` and `hill_occupied` custom sound payloads | `d7c4d1ba-02dc-41c5-913a-5cc83a43df06` |
| S4 | FAIL | Compilation: invalid Ogg input; `sounds\music\zamenumusic.sound` | `4f1c48e1-cff7-4554-b927-7fd51265e782` |
| S5 | FAIL | Extraction incomplete: **237 errors**, including resource bitmap failures | `f4d79335-fa1c-4d59-8de5-febe5bbc6ede` |
| S6 | FAIL | Compilation: invalid Ogg input; `sounds\music\zamenumusic.sound` | `7fefda98-7aa7-405f-9c75-2dd829da6a9d` |
| S7 | FAIL | Extraction incomplete: **196 errors** with the available resource set | `a3ff6ad9-d39f-456b-b8fc-0dadf1575412` |
| S8 | FAIL | Same hash and recorded attempt as S7; no extra independent conversion is claimed | `a3ff6ad9-d39f-456b-b8fc-0dadf1575412` |

This is **seven executed attempts**, not eight. The extraction tool can report per-tag errors while returning exit code zero; Guilty Spark correctly treats incomplete extraction as failure. Three menu attempts reached compilation. No validated output map, deployable package or successful game load resulted. UI caches also require a supported menu-specific integration; they are not interchangeable with campaign/multiplayer level packages.

The explicit opt-in audio-omission/placement-diagnostic experiment is separately documented in [ZOMBIE_AUDIO_AND_SPAWN_EVIDENCE.md](ZOMBIE_AUDIO_AND_SPAWN_EVIDENCE.md). It preserves originals and improves extraction of one derived edition, but every subsequent compile remains blocked. It does not change any FAIL above into PASS.

## All ten runtime targets

The following two tables cover all eight source paths against all ten runtime profiles. Cells describe the target deployment/playback path, not source parsing. MCC is BLOCKED because no converted package exists. Native/legacy engine gameplay is UNTESTED: a separately installed runtime was not exercised. The five preservation profiles have no executable adapter, so their application launch path is BLOCKED. No cell grants compatibility merely because a cache family resembles an engine's documented format.

| Source | Steam MCC/Halo1 | ChupathingyCE | OpenCE | Halo PC Retail | Halo Custom Edition |
| --- | --- | --- | --- | --- | --- |
| S1 | BLOCKED | UNTESTED | UNTESTED | UNTESTED | UNTESTED |
| S2 | BLOCKED | UNTESTED | UNTESTED | UNTESTED | UNTESTED |
| S3 | BLOCKED | UNTESTED | UNTESTED | UNTESTED | UNTESTED |
| S4 | BLOCKED | UNTESTED | UNTESTED | UNTESTED | UNTESTED |
| S5 | BLOCKED | UNTESTED | UNTESTED | UNTESTED | UNTESTED |
| S6 | BLOCKED | UNTESTED | UNTESTED | UNTESTED | UNTESTED |
| S7 | BLOCKED | UNTESTED | UNTESTED | UNTESTED | UNTESTED |
| S8 | BLOCKED | UNTESTED | UNTESTED | UNTESTED | UNTESTED |

| Source | Mac Retail | Mac Demo | PC Trial | HaloMD | Original Xbox |
| --- | --- | --- | --- | --- | --- |
| S1 | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| S2 | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| S3 | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| S4 | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| S5 | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| S6 | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| S7 | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| S8 | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |

MCC two-player campaign co-op and MCC custom multiplayer are separate prospective builds; neither was tested. All eight sources retain `twoComputerAi: UNTESTED`. Native cross-platform or ChupathingyCE/OpenCE interoperability was not tested. Upstream native replication evidence is documented in [RUNTIME_COMPATIBILITY.md](RUNTIME_COMPATIBILITY.md) and is not substituted for a result in this matrix.

## ZIP and desktop regression evidence

| Case | Result | Scope |
| --- | --- | --- |
| Supplied historical ZIP | UNTESTED / absent | No actual ZIP was present in the supplied corpus |
| Generated ZIP with real Demo gameplay/menu and resources | PASS | Six entries inventoried; two real scenarios imported; source ZIP hash preserved |
| Generated ZIP executable handling | PASS | Deliberately included executable inventoried but not extracted or executed |
| Fresh desktop local Inbox import of generated ZIP | PASS | Two scenarios entered the actual application with archive/resource provenance |
| Fresh desktop import of all scenario variants | PASS | Seven distinct library entries from eight source paths |
| Any game executable launch during these tests | UNTESTED | No game was launched; no archived EXE/DLL was run |
| MCC deployment / package enumeration | BLOCKED | No validated restored output or complete package |
| Sustained two-computer gameplay and AI authority | UNTESTED | No two-computer session available |

The generated regression ZIP SHA-256 is `73224d850f41d341688e812894eca784e7aa29b2004c1fea6efcd91e7e43d3b5`. It was created for this test and is not shipped in the repository. Unit tests additionally cover hostile ZIP structure/path/CRC cases; these do not establish historical game compatibility.

## Acceptance remaining

Faithful data recovery, supported scenario/tag reauthoring, complete target compilation, verified package metadata, actual deployment/load, gameplay mechanics and the [two-computer test plan](MULTIPLAYER_TEST_PLAN.md) remain required. The corpus and generated-ZIP successes establish preservation and editing infrastructure. They do not establish a playable restored Zombie Apocalypse release.
