# Zombie Apocalypse audio and spawner evidence

Current follow-up: [C44 exact-build native actor observations and Zombie Apocalypse conversion gate](CONTINUATION_44_ENGINEERING.md). The dated research below remains historical evidence; C44 does not establish a working MCC multiplayer AI bridge or a faithful restored zombie map.

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

## 24 November - Native mixed-palette recovery

The installed Demo copy under Runtimes matches S3 and both original banks match the earlier audit. The current Invader extracted all 2,823 retained tags. Both compilers first refused scenery palette 10 because its dependency was a weapon. Palette slots 10 and 15 have zero placements. Slot 22 points to the original Hiding Marine biped, used only by scenery row 95.

The opt-in --repair-mixed-palettes step in scripts/recovery-audio-experiment.mjs moves that row into the native biped array, preserves placement and flags, and removes the three now-unused invalid scenery entries. Independent Invader readback verifies every remaining scenery index against its original tag, and validates the Marine pose to the tool's reported precision. Whole derived scenario SHA-256 changed from edde13ba9188a619fc22215fe157dbcc396d8cf9a1873d4658054ad2aae810f8 to c18de4a019e88a6b0d0b6da405174327e528c0ae4ba06db5fad9b21c212634fa. The original source and banks rehashed unchanged. Disposable work was removed.

CE and MCC both advanced past the palette defect, and then rejected the original Survivor shield-hit plasma shader. Its primary and secondary noise references point to the authored 2D Flood tentacles bitmap. The next compatibility repair must preserve the original material and investigate a native-compatible derived noise texture. No map was emitted, the two absent audio cues remain unresolved, and this experiment supplies no gameplay acceptance.

## 24 November - Survivor shield and dormant spawn recovery

The exact S3 Demo and its two original banks remained hash-identical. The opt-in --repair-shield-noise step creates a separate native depth-one volume for only the Survivor shield. The original Flood tentacles bitmap remains available as an unchanged 128 by 128 DXT3 2D texture with seven mip levels. Native tool readback and byte comparison found only the two type bytes and tag checksum changed on the derived bitmap. The shader retains all fields except those two noise references. Source bitmap 8a03084529187d2bc866df23510c17fa41461bce876dc4327304bf05d740f767. Derived volume 18a0c982bb2c82765a7664f8095f82a761dcefb1ae28fb0c6939b8557b02668d. Both Invader target compilers passed the shader; visual playback has not been tested.

The next Invader rejection was the Survivor biped pointing its actor-spawn field to effects/coop teleport.effect. Its authored spawn count and velocity are zero. The opt-in --repair-survivor-spawn step clears only this dormant dependency. All other native fields and the teleport effect bytes rechecked unchanged, and the effect still has other native references. The new Survivor biped SHA-256 is 8258e3d886468db7b9a2939078fcdacf4032c73042c28b18c99051baf5052572.

Both CE and MCC Invader targets now reach ui/hud/master rounds.weapon_hud_interface. It asks for sequences 1 and 2 from ui/shell/bitmaps/black.bitmap, which has one authored sequence (0). Correcting a single row in a disposable probe only advanced to the other invalid row. Recover the intended HUD behavior from the exact original source or other preserved editions before assigning either element a different image. No new cache or gameplay acceptance. Owned scratch disposed.

## 24 November - Preserve original Zombie HUD sequence lookup

The opt-in --repair-rounds-hud step makes the original wrapped lookups explicit. Chupathingy and the local Forerunner source route static and meter drawing through bitmap_group_get_bitmap_from_sequence, which reduces positive sequence indices modulo the sequence count. The two named original bitmaps each contain one nonsprite sequence naming bitmap 0. The repair normalizes rounds static indices 1 and 2 and the main HUD static and meter indices 6 and 6 to zero. Both bitmap files and all other serialized HUD fields rechecked unchanged. The resulting rounds HUD SHA-256 is ba95154d023f5c3dcf98890e41dccc8ff9fbb220d84b336bda24354312a6e9c0 and the main HUD SHA-256 is 875fce9336494cb18db8a5b25d874776941c6f75079c847262406eac002b3d28. See the upstream implementation at https://github.com/ChupathingyCE/chupathingyce/blob/main/source/bitmaps/bitmap_group.c#L760.

Invader CE and MCC targets passed all four audited references and then stopped at weapons/pistol/melee.damage_effect. Its active lighten flash has maximum_intensity 3, which Invader rejects above 1. Runtime source scales RGB separately from alpha in lighten mode, so the zero-alpha source color does not prove the flash is inert. Preserve the authored flash and the separate 400-point damage fields while investigating the matching native Tool behavior. Original cache and banks rehashed unchanged. No new cache or runtime HUD comparison was completed. Owned temporary output was removed.

## 24 November - Official MCC compile preserves the original melee effect

The opt-in recovery recipe pins installed MCC H1A Tool SHA-256 C492789E96DBE845891E0C0973BFB526A21230F570559E6F9FB695B8D2CA0AFA. It compiled 2,824 audited tags to MCC CE Anniversary cache SHA-256 4B8C1DEA007EF8ED7DD3915309DB571CDFA20B820B84C64A17EB5E38F4FF84F0 on two runs. Invader reported the correct engine and matching CRC, extracted the exact Pistol melee tag, and independently read back lighten, intensity 3, damage bounds 400 and 400–400, radius 4–4, and duration 3 seconds. All compiler input tag hashes, the original Demo map and resource-bank hashes remained unchanged. The disposable workspace was removed.

Strict Invader builds for CE and MCC still reject the active lighten effect above intensity 1. The official output is MCC-only. Classic CE compilation, engine loading, player-controlled gameplay, multiplayer and the two missing custom audio samples remain open.


## 24 November - Restore the original standard carrier binding

The audited S3 Demo cache (b38f35508188872b2535888193de80f766d92d3b8d53a8ada7be4fc9808a996d) contains a standard Zombie carrier whose original tank graph has 11 nodes. Its actual Gravity Rifle model has five with checksum 1344912864. Forerunner's Spark integration contract records the untouched graph being discarded during compilation and the normal carrier failing native unit creation.

The opt-in --repair-standard-carrier step extends the existing native recovery recipe. Run it with the full diagnostic repair chain (--diagnose-corrupt-placement, --repair-mixed-palettes, --repair-shield-noise, --repair-survivor-spawn, --repair-rounds-hud), the pinned H1A Tool, the original Demo maps directory as resources, and fresh managed scratch output. It compiles a rig-matched stand unarmed idle from the existing JMA generator. It verifies the original model, graph and vehicle SHA-256, and changes only the derived vehicle animation reference while adding the new graph. The original 11-node graph stays in the reviewed tag tree. The new five-node graph SHA-256 is 0a4d719c36d18caef47cd82d6229176b565e46fbd9c7940c0df3276ceb84b034.

Official H1A Tool compiled all 2,825 input tags to an MCC13 cache with SHA-256 d520d509aa6a23a3fa67d37c28cc74459835ae53c0a4dae615f910e87b60b958. Independent Invader readback verified engine ID, CRC, the carrier binding and packed one-frame idle, and the original Pistol flash intensity 3 and 400-point melee. The original Demo and both banks rehashed unchanged. Three existing carrier tests and both Node syntax checks passed. The 270,542,284-byte experiment was removed by the owned scratch runner.

Native gameplay on this exact cache remains open. Forerunner's earlier Alpha-release and two-peer diagnostics used a different cache. Its full-audio load reported five invalid Vorbis permutations: double_kill, 30_seconds_to_win, blue_team_30_to_win, slayer and capture_the_flag. The absent scorpion and hill_occupied cues remain separate unresolved samples. Strict CE and MCC Invader targets still reject the original active flash, so there is no CE609 result from this recipe.


Local source comparison extracted all five cue tags from the exact Demo and the installed Custom Edition, Chupathingy and OpenH1 Windows Blood Gulch caches. Custom Edition supplied complete stock Vorbis streams, but none matched even the first CRC-verified original audio packet after the three Vorbis headers. The two Xbox-derived ports did not supply Vorbis versions of the matching cues. No samples were substituted or changed. The owned comparison used under 1 MiB and disposed its output.


## 24 November - Restore stored carrier inverse inertia

The Forerunner contract identifies the shared physics tag and demonstrated Alpha release on its independent diagnostic correction. The exact Spark MCC13 carrier build d520d509aa6a23a3fa67d37c28cc74459835ae53c0a4dae615f910e87b60b958 reproduces all nine nonfinite inverse components in fzero/zombie/zombiephysics. The native data contains 15 positive mass points, total mass 10000, and an authored moment scale of zero.

Add --repair-carrier-inertia to the existing audited --repair-standard-carrier recipe to produce a separate MCC13 derivative. It binds the correction to the exact compiler output and pinned CRC tool, reconstructs the point-mass tensor about the original center, writes only the nine inverse floats and updates the native CRC. It leaves the authored moment scale, forward matrix, mass points, carrier behavior data and original MCC build bytes untouched.

Derivative SHA-256 95bd7990b2aa3259f44119f4caa63d3b393e61186e19bd1faf8e65a53e8206d2. On-disk readback multiplied the corrected inverse by the independently reconstructed point-mass tensor and matched the identity within 0.000001. Invader extracted the native physics tag and independently read a matching CRC. The audited original cache and banks remained unchanged; 360,261,408 logical scratch bytes were removed. This exact derivative still needs native gameplay and the remaining audio, spawn and Classic CE compatibility work.


## 24 November - Terminate the custom legacy multiplayer title

On the exact inertia-corrected MCC13 parent 95bd7990b2aa3259f44119f4caa63d3b393e61186e19bd1faf8e65a53e8206d2, native tag 1597 (ui/multiplayer_game_text), slot 100, has the same unterminated 40-byte UTF-16 title identified by Forerunner's earlier runtime conversion trial. Add --repair-legacy-title to the existing audited --repair-carrier-inertia recipe to null-terminate the last padding unit in a separate derivative. The Zombie Apocalypse title and slot length are retained; only the low padding byte at offset 89024428 and the header CRC may differ.

Derivative SHA-256 dca4f32e3d74d27db6bc761fb3ddff317280c19147e9b37f4a121e8abe28d73c. Independent table readback confirmed 191 native slots and the preserved title with its terminal null. Invader extracted the Unicode string-list tag with a matching CRC. The parent and original Demo kept their exact hashes. Owned scratch was removed (449,985,924 logical bytes). This derivative still requires original audio recovery, legacy projectile-spawner delivery, Classic CE compilation and an actual game trial.


## 24 November - Recover five complete original Vorbis streams

All five corrupt cues have one bad end-of-stream page. Inspection of the original tag bytes found the unique single-byte payload correction for every stored page CRC: the last byte is 00 and must be 0e. The restoration leaves every page checksum, page count, encoded length, tag reference and frame count intact. It does not clip to a prefix, recode or substitute audio. Slayer and Capture the Flag retain their two identical separately stored streams.

Add --repair-vorbis-tail after --repair-legacy-title in the existing audited MCC13 recipe. It pins parent dca4f32e3d74d27db6bc761fb3ddff317280c19147e9b37f4a121e8abe28d73c and all five before/after sample hashes. Output SHA-256 126491917a68c50e14a9465a8b066c40f56a9cd3eb933b66f5ee188f36ebedb1. Byte comparison limits the changes to five payload bytes and the native CRC field. Invader validated the cache CRC and independently extracted all five sound tags. Offline Edge decoded all five as stereo 44,100 Hz with exactly the original final granules: Double Kill 406,528, 30 Seconds 551,936, Blue Team 215,040, Slayer 233,472 and Capture the Flag 233,472 frames. Originals and banks rehashed unchanged.

The reviewed Forerunner x64 engine 0039b82749430fb1978330729d9ed54f3383b2489c91b2d8602fa0546861e058 exited zero in two owned trials. The solo startup command did not load the multiplayer map. The local Slayer selector recognized the title-path request but produced no map-load or simulation confirmation. No in-game audio or gameplay acceptance. Two absent custom external cues, legacy carrier spawning and Classic CE compilation remain open. Every native and decoder workspace from this operation was removed.


## 24 November - Portable repaired sound source and private lobby control

The opt-in --repair-vorbis-tail workflow now exports all five restored native .sound tags into vorbis-native-tags and records each complete tag hash. Invader serialization preserves exactly one copy of the verified restored stream in each output tag. The recovered source tag tree remains byte-identical, the five full offline decodes pass again, and the compiled MCC cache remains exactly 126491917a68c50e14a9465a8b066c40f56a9cd3eb933b66f5ee188f36ebedb1. This source overlay gives the Classic CE build access to the same recovered audio once its compiler gate is closed.

The pinned Forerunner Windows x64 executable 0039b82749430fb1978330729d9ed54f3383b2489c91b2d8602fa0546861e058 started stock Blood Gulch through both the local and loopback host paths with the installed Lone Wolves gametype. Each reached at least tick 420 with an active player. The paired control exceeded its initial scratch reservation and was cleaned. A separately budgeted private trial of Zombie 12649191 in that verified lobby selected Lone Wolves and asked to start and restart. It exited zero after its time limit with no map-load, sound-conversion, player or actor confirmation. This isolates an admission problem before the observed conversion stage, not a new Vorbis failure. All runtime copies and scratch were disposed.

Read-only native extraction also confirmed all three original spawner triggers still refer directly to their original vehicle carriers. No spawner, original map, resource bank, runtime, or companion source was modified.


## 24 November - Current Forerunner peers and native legacy spawner overlay

Forerunner's integration contract records two Windows peers on OpenCE protocol 43 with restored MCC13 cache 126491917a68c50e14a9465a8b066c40f56a9cd3eb933b66f5ee188f36ebedb1 and executable e82a58dbddb0f65ae603961c81090e01ab46052e55f614eb29b9298905723b9c. Both converted 852 sound permutations to 39,912,660 ADPCM bytes. They agreed on 18 standard, six Alpha and four Evolved carrier objects. The guest walked, fired and took damage. Output was muted. This supersedes the old 0039b827 map-admission result for the current Forerunner executable. Evolved rider egress, both absent custom samples and a completed survival round still need evidence.

Chupathingy c16096a8 rejected the three original vehicle references in the weapon projectile-trail precache. The existing audited recovery command now accepts --stage-legacy-spawners with --repair-vorbis-tail. It emits reviewed native weapon copies with just the trigger reference changed and three typed projectile/effect chains pointing at the original carriers. Each effect has one real indexed location. Invader verified the unchanged original weapons, the complete remaining weapon field listings and the new reference plus timer fields. Official H1A Tool compiled the isolated overlay to MCC13 cache 2620136544a8118ffe6ac05c21ec453705c59e6de8bef1c6ecad131669612917. Separate Invader extraction reopened all nine tags and followed each chain to the expected vehicle, with zero cache CRC mismatches. The exact Forerunner conversion path retains its original direct references. The original Demo and banks rehashed unchanged and 757,819,820 logical bytes of disposable output were removed. Gearbox CE609 compilation and live Chupathingy spawn, egress, collision and multiplayer remain open.

## 25 November - Standalone Classic CE source staging

The existing recovery command now accepts --compile-classic-ce after --stage-legacy-spawners. It creates a disposable Classic CE tree from the recovered source and checks the original tree inventory after staging. Five restored Vorbis streams and three typed spawner chains are applied by hash. The five audio headers now advertise their decoded stereo 16-bit sizes at 44.1 kHz. Their encoded stream hashes are unchanged. No substitutes are provided for the two absent original custom samples.

Native readback verified the target-only compatibility edits. All seven vehicle placements keep their original dependencies after removing two unused null palette rows. Three zero-count cross-class biped spawn references were cleared, with the active carrier chains retained. Four rotational fire bitmaps retain their complete original pixel bytes and sprite frames. The invisible carrier model keeps its geometry and receives a typed additive black material, pending visual verification. The original Demo and MCC content stay intact.

The strict compiler moved past the recovered Double Kill dependency and the Alpha shotgun. A single pass audited all 44 original damage tags. Seven staged tags, including the shotgun and Molotov, cap only out-of-range flash or stun values. The Pistol keeps its separately reviewed sound repair. The current failure is the Evolved carrier collision: its render model has two regions (hull and tire) and eighteen nodes, while the bound sniper-ammo collision tag has one region and one node. Adapt the original compact collision shape to the carrier’s native region and node binding using the existing collision recovery tools. Keep the original carrier and avoid substituting ordinary Warthog collision. CE output does not yet exist. Compare full-strength and scaled stun, flashes, feign behavior, carrier invisibility and release in Chupathingy and Forerunner before gameplay acceptance. The stage also leaves the original turret grenade chance and count at zero.

Three focused carrier-source tests, Node syntax and checked Git whitespace passed. The last isolated native attempt produced the expected compiler diagnostic and disposed 668,287,410 logical bytes. No runtime or handoff cache was replaced.

## 25 November - Standalone Classic CE609 cache

Strict native Invader 0.55.0.r4134 compiled the original Zombie Apocalypse as an 87,083,612-byte CE609 multiplayer cache. The exact retained local copy is %TEMP%/GuiltySpark-Traversal-Handoff/zombie-ce609-FXZRsl/ready/zombie_apocalypse.map, SHA-256 8e8b0a59b566de29502738ddf67ad0350603aba4a360cdfba2fd2b59e18520a7. Independent native inspection reported 2,114 tags, 6.37 MiB of tag memory, no external tags and CRC FA821761 matching the header. The internal cache name is fonzie's zombie apocalypse.

Independent extraction of that cache verified all three weapon/projectile/effect/carrier chains, the original Standard collision reference and both original compact-hull bindings for Alpha and Evolved. Their derived collision tag added tire region metadata, preserving the original node and BSP bytes. Five restored Vorbis payload hashes and their decoded sizes matched. Native Invader recovery additionally corrected seven intact sound buffer lengths and appended terminators to 58 text entries across five lists, preserving every text slot and payload. The CE-only HUD font uses the recovered stock small UI font. Classic multiplayer supports seven carried Molotovs per slot instead of eight. Both zero starting counts and all native fire effects are preserved. The three cleared cross-class material effects had zero breakable vitality. The original Demo maps and banks rehashed unchanged.

The pinned Chupathingy 0.9.1a executable c16096a841422b2597a3c5f26d8b16be7dd6a2914f678c7ea4b36e31ec3a3050 precached this exact map in a private loopback Slayer host. The second bounded attempt spawned player 0 at (94.359, -159.118, -0.287) and emitted ticks 30 and 60. It warned about a 16,508,364-byte sound permutation, repeated camera observer assertions at original lines 233, 370 and 502, and reported failure to place a biped far enough from a vehicle during egress. The disposable run also hit the storage guard, so its exit does not establish a specific fatal acting alone. All scratch was disposed. No combat, carrier release or restart is accepted. The exact cache was handed to Forerunner for independent testing while its existing MCC candidate remains installed. Next isolate the camera assertions, oversized sound and carrier egress on the exact cache.

Three focused carrier-source tests, Node syntax and Git whitespace passed. The two genuinely missing original custom sound samples are not substituted.

### Survivor camera correction

Forerunner localized first-spawn camera rejection to the Survivor biped’s 4.5 radians. Spark read back 257.831008 degrees in the original and 70 degrees in the owned stock CE multiplayer biped. The CE derivative now sets exactly the stock angle, with all other Survivor fields identical in the native listing. New CE609 SHA-256 0a677fbc48e268daa99ef0a32a37e2518d8dab08882c332b6f250a180241a2be, 87,083,612 bytes, CRC 56169556. Separate Invader extraction verified 70 degrees, all three carrier chains, shared compact collider and all five recovered audio payloads. Local path %TEMP%/GuiltySpark-Traversal-Handoff/zombie-ce609-l4EVCD/ready/zombie_apocalypse.map. Keep 8e8b0a59 for parallel comparison. The original Demo and MCC builds are preserved.

The same pinned Chupathingy 0.9.1a executable hosted the corrected cache privately, spawned a full-health player at (95.271, -159.732, -0.287), advanced through tick 510 and exited normally at its timed limit. Online access was disabled. The storage reservation allowed the owned test to complete, and it disposed 1,277,258,818 logical bytes. Map admission and single-player host simulation pass. Movement, meaningful combat, all three carrier releases, the oversized audio warning, late join and restart remain separate gates. Both exact CE maps were handed to Forerunner.

### Carrier collision comparison and native music streaming

Spark’s exact collision-only probe 3bf94b1642fe70b45be9053f247c4eb081c270059b11a3192b211df7037ef49c cleared only the Alpha and Evolved collision reference payloads in 0a677fbc and recomputed the CRC. Two private Forerunner peers on executable 100709e3 tested both maps through tick 3447. Both agreed on six living Alpha actors on foot. Only the compact-collider map had matching living Evolved and armed Alpha actors on foot at the first sample. Neither recorded a live Alpha or Evolved seat-to-foot transition. Keep the compact collider. An exact direct cache read also found different stored CE and MCC inverse inertia, so the collision probe intentionally kept all inertia bytes fixed. Targeted grounded rollover and live egress remain open.

Both maps reproduced the unsplit music consuming 4,031 of 4,096 sound-cache pages in Forerunner, starving the Slayer cue. Spark’s existing CE recovery recipe now decodes the owned original 1e01df20 Vorbis stream at its authored 44.1 kHz stereo rate and uses the existing C46 audio prep and native Invader split encoding. The native tag retains its original label, pitch and gain. Exact build 31861dad5d9d72ec867a469b7e0154862339f388809300cd2aba6dcf77a17ecf is retained at %TEMP%/GuiltySpark-Traversal-Handoff/zombie-ce609-BjoeZf/ready/zombie_apocalypse.map. Invader independently verified 88,026,400 bytes, CRC A7339759, one root, all 71 links, 4,127,091 original frames and 13 silent end-padding frames. The largest chunk is 65,520 bytes encoded and 232,960 bytes decoded. ADPCM encoding changes the sample representation. The original Vorbis map and stream are retained. The three carrier chains and five independently restored Vorbis payloads also pass compiled readback.

The revised cache loaded and spawned a full-health player in isolated Chupathingy 0.9.1a c16096a8. It reached tick 510 and exited normally, with no sound-cache rejection or observer assertion in the captured diagnostic logs. This used a dummy audio device. In-game listening, concurrent cue playback and two-peer testing of the revised cache remain open. Forerunner received the exact local map. All generated tool and runtime scratch was disposed. The previous-good maps and runtimes were preserved.
