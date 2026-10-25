# Zombie Apocalypse audio and spawner evidence

Audited on 2026-10-25. The supplied Demo artifact has not been restored into a playable MCC map. A separately labelled, opt-in experiment extracted all 2,823 retained tags after omitting two missing event sounds, then exposed additional corrupt and cross-class scenario data. No original cache, resource cache, archived executable, Steam file, or installed game was changed.

## Artifact identity and provenance

The strongest extraction candidate is `Pyros Zombie Apocolypse Mod Versions/Zombie Apocalypse/maps/bloodgulch.map`, SHA-256 `b38f35508188872b2535888193de80f766d92d3b8d53a8ada7be4fc9808a996d`. It contains a version-6 Demo header, 2,825 tags, and scenario `Fonzie's Zombie Apocalypse`. The archive's README calls this bundle **Zombie Apocalypse Win32 Beta by Patrick Davis**. Version 6 identifies a cache layout; it does not establish a Mac origin. The related ZAMD and PC caches retain many of the same payloads and defects, but have different whole-file hashes and resource offsets.

The supplied `sounds.map` is 79,916,792 bytes, SHA-256 `9426e8d19b662eeb5a6c516951e080758d8f77a0ee41f52bdf0ed0a929245a59`. The supplied `bitmaps.map` SHA-256 is `5357828124ed03b9b47dad563434465af742075ae1c991f6bb733320996f1bea`. The experiment records and rechecks both resource hashes. PC/MD resource offsets cannot be resolved by treating these Demo resources as interchangeable.

## The two missing custom sounds

| Sound tag | Demo sample offset | Declared bytes | Actual dependency |
| --- | ---: | ---: | --- |
| `sound\dialog\multiplayer1\scorpion` | 79,916,792 | 1,952,503 | `globals\globals.multiplayer_information[0].sounds[25]` |
| `sound\dialog\multiplayer1\hill_occupied` | 83,794,412 | 3,877,619 | `globals\globals.multiplayer_information[0].sounds[41]` |

Both permutations declare external sample storage. The first starts exactly at the end of the supplied resource file; the second begins beyond its end. These are custom stereo 44.1 kHz Vorbis-sized payloads rather than ordinary short stock announcements. The PC and MD variants also reference missing external ranges. Their matching tag names do not supply the missing bytes. The older `apocolypse_1` hill sound is a different, 15,537-byte asset.

The caller was confirmed by following the real `matg` reflexives, using the primary [Invader globals definition](https://raw.githubusercontent.com/SnowyMouse/invader/master/src/tag/hek/definition/globals.json): globals data is at byte 49,223,886; multiplayer information at 49,226,362; the 44-entry sound array at 49,226,618. The two dependency records are at 49,227,018 and 49,227,274. The other raw occurrences of their IDs are sound-permutation self IDs, not additional callers.

`game_over` occupies slot 1 of that same multiplayer event array. Its embedded 3,877,619-byte stream is complete, has 909 valid Ogg page CRCs, and SHA-256 `065138d8c89610477cb4cda4f595bec7158bd62d9c17a3fef7ad51bb0f1bb9db`. Its length, format, rate, channels, and declared buffer size match the missing hill sound. This makes it a candidate for human investigation, **not proof of audio identity**. It is not a UI-menu music reference, and no substitution was made. No complete embedded stream of the missing scorpion length was found in the supplied cache variants.

The default build retains both dependencies and stops on missing-resource extraction errors. The experiment is explicitly a recovery edition with missing event audio omitted; it cannot be presented as faithful restoration.

## Recoverable menu audio

The three UI variants share three byte-identical, complete Vorbis streams. The new read-only audio inspector derives the sample ranges from actual sound tags and checks source identity, bounded structures and byte ranges, complete single-stream Ogg pages, page sequence, CRCs, end-of-stream, and Vorbis identification headers before offering a preview. The browser still has to decode the audio; these checks do not establish target-game playback.

| Demo UI sound | Tag ID | Permutation | Bytes | Ogg duration | SHA-256 |
| --- | --- | ---: | ---: | ---: | --- |
| `sound\fonzie\zombie_apocalypse_mod\massive_energy\intro` | `e382020e` | 0 | 3,856,367 | 88.806 s | `ddfb5121dbc59e9aab954944ca2bda591da4740183e9a4c3f58eb2164bfe7c79` |
| `sound\fonzie\zombie_apocalypse_mod\massive_energy\loop` | `e383020f` | 0 | 3,945,039 | 74.984 s | `2bee4b9b6356516ce6f7e5038b65855a294d43830637c6ee257a97caead3ed23` |
| Same loop tag | `e383020f` | 1 | 3,749,440 | 84.014 s | `df70ebb38981ac31774f3e6b7804d479b8e70750360b1cb5cbbee929ed36b6a8` |

All 2,695 pages in these three streams pass CRC validation. The additional `sounds\music\zamenumusic` tag (`e2a0012c`) declares 3,037,064 embedded Vorbis bytes but fails Ogg validation; it is explicitly unavailable for preview. The supplied README credits a main-menu song to “We Partied During the Zombie Apocolypse”; no song title/artist metadata was found in these streams, so that credit is not automatically assigned to each permutation.

The source-safe CLI probe prints metadata without exporting or playing audio:

```powershell
$env:CARGO_TARGET_DIR = "$env:TEMP/GuiltySpark-phase2/target"
node scripts/cargo.mjs run -p spark-core --example audio_probe -- "Pyros Zombie Apocolypse Mod Versions/Zombie Apocalypse/maps/ui.map" e382020e
```

Preview limits are 16 MiB per permutation, 64 MiB total samples inspected per request, eight pitch ranges, 256 permutations per range, 65,536 Ogg pages per stream, and one hour of declared duration. External-resource, unknown-codec, malformed, truncated, checksum-failing, and source-mismatched audio is rejected rather than replaced with a sample.

## The actual zombie mechanism

Zero scenario encounters and zero scripts do **not** mean zero AI. The Demo cache contains eight actor variants, six actor definitions, seven bipeds, four vehicles, and ten item collections. The supplied ZAMD/PC README describes item collections that spawn weapons which fire invisible vehicles carrying zombies; altered vehicle physics flips the containers. It explicitly states “NO AI SYNC.”

Following real dependency records confirms these three weapon-trigger chains:

| Weapon trigger 0 | Direct object class and target | Built-in seat actors |
| --- | --- | --- |
| `MGM\Fonzie\Sparky\Tags\Ai Respawning\Evolved Zombie Spawnerorig` | `vehi`: `MGM\Fonzie\Sparky\Tags\Evolved Zombie Container` | `Zombies\Evolved Zombie orig`, `Zombies\Zombie`, `Alpha Zombieorigshot` |
| `origMGM\Fonzie\Sparky\Tags\Ai Respawning\Alpha Zombie Spawner` | `vehi`: `MGM\Fonzie\Sparky\Tags\Alpha Zombie Containerorig` | `Alpha Zombieorig` |
| `MGM\Fonzie\Sparky\Tags\Ai Respawning\Zombie Spawner` | `vehi`: `MGM\Fonzie\Sparky\Tags\Zombie Container` | Three seats referencing `Zombies\Zombie` |

Actor paths in the last column have prefix `MGM\Fonzie\Sparky\Tags\`. The inspector now exposes item-collection item dependencies, actor-variant actor/unit/major-variant/weapon/equipment dependencies, unit weapons and spawned actors, and seat built-in actors. Non-projectile trigger dependencies are visible as read-only legacy object spawners. No unsupported actor numeric editing was added. Actor definition dependencies marked unused in the primary schema are not presented as operational behavior.

Primary structural references are Invader's [actor variant](https://raw.githubusercontent.com/SnowyMouse/invader/master/src/tag/hek/definition/actor_variant.json), [item collection](https://raw.githubusercontent.com/SnowyMouse/invader/master/src/tag/hek/definition/item_collection.json), [unit](https://raw.githubusercontent.com/SnowyMouse/invader/master/src/tag/hek/definition/unit.json), and [weapon](https://raw.githubusercontent.com/SnowyMouse/invader/master/src/tag/hek/definition/weapon.json) definitions. These document a projectile-class trigger field. The observed vehicle-class references are legacy behavior outside that compiler contract; deleting them to obtain a clean build would delete the authored spawner mechanism.

## Reproducible recovery experiment and remaining blockers

`scripts/recovery-audio-experiment.mjs` accepts only the exact audited Demo SHA-256. It requires a fresh output directory outside source/resource/tool directories, records tool hashes and every command, keeps exact before/after patch bytes and tag hashes, and rechecks original cache/resource hashes after the run. It invokes only the separately installed Invader tools supplied through `--invader`. It never launches a game or installs its output.

```powershell
node scripts/recovery-audio-experiment.mjs --source "Pyros Zombie Apocolypse Mod Versions/Zombie Apocalypse/maps/bloodgulch.map" --resources "Pyros Zombie Apocolypse Mod Versions/Zombie Apocalypse/maps" --invader ".local/tools/invader" --output "$env:TEMP/GuiltySpark-phase2/recovery-fresh-run" --diagnose-corrupt-placement
```

Omit `--diagnose-corrupt-placement` to run only the missing-event-audio omission experiment. That mode also preserves the existing narrowly audited unused-script-capacity normalization. The extra flag explicitly enables two additional diagnostic changes to the derived scenario, not to the source. It is not a default UI build mode.

The fresh reproduction at `C:/Users/patri/AppData/Local/Temp/GuiltySpark-phase2/core-audit/recovery-script-reproduction` established:

1. The unchanged preservation path is blocked by the two missing sounds. Omitting only their confirmed global event references and excluding their unreachable tags produces **2,823 of 2,823 extracted tags**, without extraction errors. Derived cache SHA-256: `e0537f6b62cb45455e1efd84c3f8ee4d840cfd35f6aed1dd8fe5711a6bb92378`.
2. Compile 1 rejects scenery placement 0's name index `5984` against an empty object-name table. The extra diagnostic mode clears only that invalid name link.
3. Compile 2 rejects the same placement's type index `10704` against a 39-entry scenery palette. All three related bloodgulch variants contain the same damaged first record. Its intended object is unknown. The extra diagnostic mode disables only this unresolvable placement; that deviation is explicitly recorded.
4. Compile 3 rejects weapon-class entries in the scenery palette. Entries 10 and 15 are unused weapon references; entry 22 is a **used biped** (`Hiding Marine`) in the scenery palette. The experiment stops here. It does not strip the used marine, available audio, actor data, or zombie spawner chains to force a build.

All three compile attempts are blocked and no output MCC map was produced. `recovery-manifest.json`, extraction/compile logs, and diagnostic tag backups are retained in the fresh output folder. Earlier byte-level analysis is in the sibling `core-audit` folder (`multiplayer-sound-dependencies.json`, `zombie-tag-inventory.json`, `ogg-crc.json`, and `recovery-omitted-event-audio/legacy-weapon-spawner-chains.json`).

A faithful restoration still needs the missing custom audio and a defensible recovery of corrupt placement data. An MCC campaign adaptation additionally needs deliberate reauthoring and testing of mixed-class placements and vehicle-spawning weapons into supported target-engine behavior. It cannot be achieved by flipping the scenario type, relabeling the cache header, or silently removing the AI mechanism. Network synchronization is a separate runtime requirement and was not established by this work.
