# Native gameplay and map audio — continuation 33

Continue the existing editor and adapters. This pass does not certify the remaining live-engine backlog.

## Current implementation

| Feature | Evidence and remaining checks |
|---|---|
| Shift sprint | Native MCC Blood Gulch movement was measured and the owner confirmed it works. The engine normalizes player speed toward its baseline every simulation tick; the controller accounts for the exact observed float steps instead of treating that decay as an external writer. Release, focus loss and incompatible actions restore the original speed. The new default is 1.75×, increased from the tested 1.5× at the owner's request. |
| Faster running animation | Not accepted. Recorded animation frame cadence alone did not establish proportional animation acceleration. No guessed animation-rate field is written. |
| Native third-person camera | The actual MCC biped camera track and held-weapon third-person flag are journalled. Back, right/left shoulder and height are editable. Native readback demonstrated a shoulder view and a second position, with exact restoration of the track bytes and weapon flags. The owner confirmed the view works but reported shots landing to the left of the reticle. Aim alignment remains an open defect. |
| Quick camera switching | A dedicated first/third-person button stays visible above the camera settings. Its native command toggles the current adapter state atomically. Connecting MCC applies the saved shortcut preference (F6 by default); it runs only with MCC focused, ignores modifier combinations, and toggles once per press. Rebinding/disabling persists in device preferences. Disconnect disarms it before restoring camera data. The compiled desktop button changed the actual native track/flag and the second click restored both exactly. Physical-key acceptance remains pending. |
| Custom power-ups | Creator Studio → Custom power-ups saves map-owned recipes with normal undo. Build jobs generate equipment and item-collection tags, append multiplayer placements, and verify those definitions and placements in the resulting cache. All six variants compiled with the installed MCC Tool: camouflage, overshield, health, frag, plasma and native double speed. Actual pickup/effect behavior is pending. Custom duration follows the engine's own effect rules; health/grenades are not timed buffs. |
| MCC sound samples | Dynamic MCC tag-base handling was added to the existing bounded decoder. Twelve sound tags from a real, native-compiled MCC cache were inspected and converted successfully. This is a sample acceptance result, not a claim that every stock/shared audio format works. |
| Spatial sound rehearsal | World Edit → Map sounds and QuickForge → Sound expose positional emitters, camera-following listening, inverse-distance falloff, four buses, master/mute/solo, sample loops, pitch, event audition, cooldown and voice priority. Placed sound-scenery attachments can resolve actual looping-sound references. QuickForge can reference an imported map's sounds with pinned project/source identities. |
| Audio lifecycle/performance | At most 32 voices, two distinct clips loading concurrently, 32 MiB decoded per clip and 64 MiB retained audio. Pending clips cannot start after Stop; changing maps/tools closes the audio context. Browser OfflineAudioContext tests render left/right ear placement, listener reversal, distance attenuation and solo-bus silence. |
| Linked sound segments | The mixer follows actual next-permutation links, validates each source/sample checksum, and joins decoded segments without inserting gaps. Cycles, missing chunks and aggregate budget overflows stop playback. A real MCC cache contained 17 links across 340 pitch ranges; all inspected chains were bounded and acyclic. This does not implement looping-track intro/outro transitions. |
| Campaign tag duplication | Tag editor → Duplicate real tag queues a new path and a referencing owner. An isolated build copies the editable tag, redirects only that owner's dependencies, checks readback and recompiles. Shared dependencies stay shared. Ambiguous paths, existing destinations, special scenario/BSP/globals roots and tag-limit overflow are refused. No cache index entries or virtual pointers are cloned. |
| UI maps | Interface caches open in the tag workspace by default. Widget rectangles, timing and text color fields use their actual integer/float encodings; background, font, string, child and event dependencies are browsable. Widget/collection links are read without recursive UI execution. UI and HUD classes are available to recursive extraction. Native campaign/UI map types are checked after compilation. Full native menu rendering/event simulation and MCC UI-cache packaging are not complete. |
| Downloaded CE maps | Community maps → Import & convert to MCC preserves the selected download and opens the existing compatibility/build workflow. Downloading remains browser-managed. Extraction and a target-specific rebuild are required. Protected caches are currently refused before extraction; no universal unprotector has been implemented. |

Sound rehearsal is saved in `audioPreview` and deliberately does not change the native build fingerprint. It auditions source samples; it does not install game event hooks or reproduce native sound classes, script timing, BSP acoustic clusters, occlusion, reverb or full looping-track transitions.

Power-up recipes are native build inputs and **do** change the fingerprint. Existing-cache validation refuses projects with power-up changes so it cannot accept an unchanged cache as the authored result. Names label recipes in Spark; native pickup messages remain those of their equipment templates.

## Native acceptance recorded locally

The reviewed MCC profile remains `mcc-steam-halo1-1.3528.0.0`, with the executable/module hashes documented in [LIVE_ADAPTER.md](LIVE_ADAPTER.md). No guessed profile, executable-memory patch or anti-cheat modification was added.

The 45-second owner trial recorded 893 samples. Observed speed multipliers covered 1× and 1.5×; median measured movement in the mixed trial was approximately 1.71 and 3.57 world units/second respectively. These are mixed walking/turning samples, not a controlled assertion of an exact speed ratio. Both native controls were disabled afterward and the observed multiplier returned to 1×. The owner then requested the 1.75× default and reported the third-person aim defect.

Private evidence and owned game artifacts stay under `.local/continuation33/native-gameplay/`. They are not source-release assets. The optional owned-SDK test is:

```powershell
$env:SPARK_POWERUP_TAGS = '<owned editable SDK tags>'
$env:SPARK_POWERUP_KIT = '<installed MCC H1A editing kit>'
$env:SPARK_POWERUP_INVADER = '<installed Invader tools>'
node scripts/cargo.mjs test -p spark-core owned_mcc_powerup --lib -- --ignored --nocapture
```

It stages a separate tagset, compiles a derived Blood Gulch scenario, verifies the six custom pickups and probes supported MCC audio. Source maps, installed maps and SDK master tags remain outside all output paths.

The campaign/UI SDK acceptance test compiled an A10 campaign with a duplicated pistol model and the native UI cache. The campaign retained every original script name; both caches passed tag/index, CRC, protection and stub validation. The first SDK-only attempt was correctly rejected for script-name loss. The corrected path recovers the installed retail campaign's actual local tags/scripts while retaining matching SDK bitmap/sound resources. The accepted outputs contain 3,747 campaign tags and 1,431 UI tags. In-game loading and mission progression remain pending.

Final source checks: 272 Rust tests passed (three owned-runtime/SDK checks are opt-in), 102 frontend tests passed, 34 browser tests passed, TypeScript passed, and the desktop executable/installer built successfully. The three opt-in checks were also run explicitly during this pass: native power-up compilation, campaign/UI compilation, and actual MCC camera disconnect/stale-session rejection. The desktop GUI verified real camera toggling/restoration, saved shortcut rebinding across reconnects, actual MCC sound decoding/playback lifecycle, custom power-up recipe saving and direct UI-cache navigation. Audio was muted for automated playback checks; physical camera-key presses, listening quality and remaining gameplay acceptance are separate.

Set `SPARK_MAP_TAGS`, `SPARK_MAP_KIT`, `SPARK_MAP_INVADER`, `SPARK_CAMPAIGN_MAP` and `SPARK_UI_MAP` to owned local inputs, then run `node scripts/cargo.mjs test -p spark-core owned_campaign_tag_duplicate_and_ui_cache_compile --lib -- --ignored --nocapture` to repeat that native compiler acceptance. It creates a fresh isolated job; it does not install either cache.

## Still required

- Correct and accept near/far third-person reticle alignment; accept wall handling, weapon changes, respawns and vehicles in the game.
- Accept the physical camera shortcut in MCC, and load the rebuilt campaign/UI caches in their proper engine contexts.
- Verify the increased sprint setting and visible locomotion animation behavior; retain action/focus/death restoration checks.
- Load and collect the generated power-ups, including duration/respawn and custom model/sound acceptance.
- Add native sound-event routing and acoustic behavior beyond editor rehearsal.
- Implement and accept native dual-wield firing, player sword presentation/melee and red-reticle lunge. Presets/input routing are not native implementations. The stock SDK sword inspected in this pass has no first-person model/animations and no firing triggers; it is an AI weapon rather than a completed player weapon.
- Implement arbitrary new live asset spawning and runtime BSP replacement with the engine's allocation, collision, visibility and resource ownership contracts.
- Verify authoritative game-peer replication with two real game clients; the LAN/VPN source-editing protocol is separate evidence.
- Complete material, lighting, decal, effect and audio parity in actual engine comparisons.

Refresh the public GitHub README/status documentation after implementation and acceptance. Do not mark these open items complete merely because compilation, a memory readback or an editor preview succeeded.
