# Zombie Apocalypse archaeology

Recorded 2026-10-25. All supplied variants were authorized as restoration candidates. The corpus audit identifies **67 actual files, 750,272,565 bytes, eight scenario paths and seven distinct map hashes**. These are existing owner-supplied files, not generated game content. The complete relative-path, size, SHA-256, classification and recorded read-only inventory is [fixtures/zombie-corpus-inventory.json](fixtures/zombie-corpus-inventory.json).

The application can preserve, index and inspect these maps. None has become a validated, playable MCC restoration. No archived executable was run, no game was launched, and no two-computer AI synchronization was demonstrated by the corpus tests.

## Evidence and provenance

The metadata fixture is a bounded projection of the real corpus report recorded at `2026-10-25T10:07:19.812791600+00:00`, with the source report's SHA-256 retained. It includes class/count metadata and test results but no map, texture, sound, executable or other game payload bytes. Per-attempt IDs link the conversion records to retained local job receipts/events.

| File classification | Count | Treatment |
| --- | ---: | --- |
| Scenario candidates | 8 | Parsed and imported; originals retained |
| Shared resources | 2 | Hashed and inspected as dependencies; not imported as scenarios |
| Historical supporting files | 43 | Inventoried, with the supplied readmes read for provenance |
| Untrusted EXE/DLL binaries | 14 | Inventoried only; not executed |

No historical ZIP was supplied in this corpus. A newly generated test ZIP containing copies of real maps/resources is separate regression evidence; it must not be described as an original release archive. Its import and original-ZIP hash preservation passed, and its deliberately included executable was not extracted. See the [regression matrix](ZOMBIE_REGRESSION_MATRIX.md).

Original and preserved map hashes matched the corpus checks; the report also records their read-only attributes. Read-only is an additional protection, not a replacement for hash verification. Filesystem attribute changes do not change the content hashes.

## Authorship and historical credits

These credits come from the supplied readmes, whose exact file hashes are in the fixture. They are historical attribution, not independent verification of every asset or permission.

- `Zombie Apocalypse/READMEPLEASEMANCMON.rtf` identifies the Win32 beta's creator as **Patrick Davis**, also known as **Fonzie** and **AnonDavis**. It describes more than three years of development.
- `ZAMD/Read Me!.rtf` and `Zombie ApocalypsePC/Read Me!.rtf` are byte-identical and describe roughly 4.5 years of changes. They say Pearl was used for the MD conversion. These statements do not establish a precise release date.
- **MotaLev** is credited for the UI. The writer tentatively credits **Sparky** for adding the song; retain the uncertainty. The readme attributes the main-menu song to **We Partied During the Zombie Apocolypse**, but does not identify which recovered audio permutation corresponds to that credit.
- **Kiyoshi and Broke** receive a tentative pill-bottle credit and a Molotov credit. Preserve the readme's uncertainty around the pill attribution.
- **JnVn/JNVN** is credited for crosshairs, original bitmaps, sniper HUD and help with the base wall. **Sparky** is credited for scenery and character additions. **Modzy**, Sparky and the author are credited for optimization work; the statement about Sparky using HEK for tree LODs is qualified in the readme.
- The readme attributes a pill pickup sound to **Left 4 Dead** and identifies the zombies as Flood. These are provenance statements, not new redistribution permissions.

The author's invitation to modify the mod does not by itself establish rights to redistribute bundled Halo software, borrowed music or third-party assets. Guilty Spark retains the local originals and attribution; the repository fixture contains metadata only.

## The eight scenario paths

Paths are relative to `Pyros Zombie Apocolypse Mod Versions`. Full hashes and exact header fields are in the fixture. A folder name or build string is not a reliable runtime-format identifier.

| ID | Source path | Bytes | Actual cache | Scenario kind | Tags | Placements | Collision vertices / triangles |
| --- | --- | ---: | --- | --- | ---: | ---: | ---: |
| S1 | `ZAMD/ui.map` | 49,468,922 | 7, legacy tag-size anomaly | UI (2) | 1,534 | 1 | 2,830 / 5,940 |
| S2 | `ZAMD/za_1.map` | 52,164,642 | 7, legacy tag-size anomaly | Multiplayer (1) | 2,825 | 197 | 2,830 / 5,940 |
| S3 | `Zombie Apocalypse/maps/bloodgulch.map` | 52,164,642 | Demo/Trial 6, reordered header | Multiplayer (1) | 2,825 | 197 | 2,830 / 5,940 |
| S4 | `Zombie Apocalypse/maps/ui.map` | 49,468,922 | Demo/Trial 6, reordered header | UI (2) | 1,534 | 1 | 2,830 / 5,940 |
| S5 | `Zombie ApocalypsePC/bloodgulch.map` | 52,164,642 | 7, legacy tag-size anomaly | Multiplayer (1) | 2,825 | 197 | 2,830 / 5,940 |
| S6 | `Zombie ApocalypsePC/ui.map` | 49,468,922 | 7, legacy tag-size anomaly | UI (2) | 1,534 | 1 | 2,830 / 5,940 |
| S7 | `apocolypse_1/apocolypse_1.map` | 134,251,446 | 7 | Multiplayer (1) | 2,717 | 339 | 16,189 / 33,092 |
| S8 | `apocolypse_1.map` | 134,251,446 | 7 | Multiplayer (1) | 2,717 | 339 | 16,189 / 33,092 |

S7 and S8 have the same full SHA-256 (`745efe81e4c07c0d43e55dae51b432e1d48d0719eb7ac4c0c249a7135170c697`), so the library deduplicates them. Their header build is `01.00.00.0609`, but their actual cache version is **7**, not Custom Edition 609. Their scenario path is `altis\levels\bigass\bigassv2,072`.

S2, S3 and S5 have scenario `Fonzie's Zombie Apocalypse`. They share the reported counts but have different full hashes and resource addressing; matching counts do not prove complete semantic equivalence. Version 7 alone does not distinguish retail PC, Mac or HaloMD provenance. The ZAMD readme supplies the MD-conversion claim; the parser supplies the version-7 fact.

All three menus use `levels\ui\ui`. The S1/S6 header name is `beavercreek`, while the Demo menu's is `ui`; neither naming inconsistency turns a UI scenario into a gameplay map.

## Parsed content counts

These are tag-index class counts, not the number of decoded images, playable audio clips or visible models. Full class histograms, audited field counts and decoded-reference counts are in the fixture.

| Source | Bitmaps `bitm` | Sounds `snd!` | Looping sounds `lsnd` | Models `mod2` | Animation graphs `antr` | Collision models `coll` | Effects `effe` | UI widgets `DeLa` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| S1 | 279 | 45 | 2 | 8 | 1 | 1 | 33 | 811 |
| S2 | 454 | 1,082 | 9 | 68 | 21 | 41 | 181 | 324 |
| S3 | 454 | 1,082 | 9 | 68 | 21 | 41 | 181 | 324 |
| S4 | 279 | 45 | 2 | 8 | 1 | 1 | 33 | 811 |
| S5 | 454 | 1,082 | 9 | 68 | 21 | 41 | 181 | 324 |
| S6 | 279 | 45 | 2 | 8 | 1 | 1 | 33 | 811 |
| S7 | 604 | 418 | 27 | 87 | 33 | 53 | 259 | 324 |
| S8 | 604 | 418 | 27 | 87 | 33 | 53 | 259 | 324 |

| Source | Actor definitions `actr` | Actor variants `actv` | Bipeds `bipd` | Vehicles `vehi` | Weapons `weap` | Projectiles `proj` | Item collections `itmc` | Encounters / scripts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| S1 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 / 1 |
| S2 | 6 | 8 | 7 | 4 | 12 | 8 | 10 | 0 / 0 |
| S3 | 6 | 8 | 7 | 4 | 12 | 8 | 10 | 0 / 0 |
| S4 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 / 1 |
| S5 | 6 | 8 | 7 | 4 | 12 | 8 | 10 | 0 / 0 |
| S6 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 / 1 |
| S7 | 3 | 5 | 4 | 11 | 18 | 21 | 13 | 0 / 11 |
| S8 | 3 | 5 | 4 | 11 | 18 | 21 | 13 | 0 / 11 |

The menu script is `ring_loop`. The older S7/S8 script names include `respawn_example`, `setup`, `respawn_example2`, `scorpion_destruction`, `scorpion_destruction2`, `lift`, `lift2`, `garage_door`, `breakables`, `server` and `client`. Reading these names is not executing, decompiling or verifying their entire behavior. In particular, scripts named server/client are not proof of synchronized AI.

The reader resolves 11 audited references for each menu, 205 for S2/S3/S5 and 219 for S7/S8, with zero unresolved references in those decoded subsets. This does not establish full dependency completeness. Unsupported or undecoded tag payloads and raw-resource semantics remain unknown; the failed extraction results are stronger evidence of missing dependencies than a clean audited-reference count.

## Shared resources and conversion failures

Only two shared resource files are supplied:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `Zombie Apocalypse/maps/bitmaps.map` | 82,697,130 | `5357828124ed03b9b47dad563434465af742075ae1c991f6bb733320996f1bea` |
| `Zombie Apocalypse/maps/sounds.map` | 79,916,792 | `9426e8d19b662eeb5a6c516951e080758d8f77a0ee41f52bdf0ed0a929245a59` |

There is no supplied `loc.map`. The corpus attempt used these Demo resources; a resource reported found does not mean its offsets match the PC/MD-derived candidates. All seven distinct maps received a real MCC tool-pipeline attempt. Four gameplay hashes stop on incomplete extraction (2, 237, 237 and 196 errors respectively). All three menus reach compilation and fail with invalid Ogg input for `sounds\music\zamenumusic.sound`. No validated MCC output was produced.

## What the readmes claim, and what the data proves

The ZAMD/PC readme describes regular, alpha, shotgun-alpha and evolved zombies; faster enemies; a modified assault rifle and pistol; a shotgun double blast; altered warthog roles; pill-bottle health; altered HUD/lighting; portal effects; and unmodified Slayer/CTF use. It warns that AI does not synchronize and that a long session might crash. These are historical behavior claims. They were not reproduced in a game during this audit, and the old crash warning is not a measured 2026 result.

The central spawning claim has additional structural evidence. The reader follows real item-collection, weapon, vehicle-seat and actor-variant dependencies. Three weapon triggers point directly to vehicle-class zombie containers with built-in actors. This explains why zero scenario encounters/scripts does not mean no enemies. The vehicle references are outside the target compiler's projectile-class trigger contract; silently deleting them would remove the authored spawning mechanism.

See [ZOMBIE_AUDIO_AND_SPAWN_EVIDENCE.md](ZOMBIE_AUDIO_AND_SPAWN_EVIDENCE.md) for exact dependency paths, sound ranges, Ogg checks, recovered menu-stream hashes, and the isolated recovery experiment. Two missing custom event sounds are referenced by real globals entries, not proved unused. The experiment that omits them is explicitly a different recovery edition: it extracts 2,823 retained tags, then uncovers invalid placement indices and mixed-class palette entries. It still produces no MCC map. It is not included as a successful default conversion in this report.

A faithful restoration still needs missing audio and defensible placement recovery. A supported MCC adaptation also needs deliberate reauthoring of the legacy cross-class mechanism, valid campaign or multiplayer packaging, actual gameplay and separate two-computer verification. The [regression matrix](ZOMBIE_REGRESSION_MATRIX.md) and [MCC feasibility assessment](MCC_MULTIPLAYER_AI_FEASIBILITY.md) record those boundaries.
