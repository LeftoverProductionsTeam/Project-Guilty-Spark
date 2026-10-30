# C35 r7 — Authored looping sound phases

Continue `c7d12ba` on `codex/continuation-35-living-workbench`. This pass extends the existing sound rehearsal and Director recording paths with source-authored Halo main-track start, loop and end clips. Original maps, tags, editing kits and r1–r6 artifacts are retained.

## Workflow

Open **Level editor → Inspector → Map sounds**, search for a looping sound, choose its **Source track**, then **Add selected sound emitter**. **Import placed map sound emitters** retains each placed sound-scenery track's source link; importing again upgrades older matching emitters without replacing their settings. Search, selected sound and track are remembered per map while switching tools.

**Start sound scene** plays each linked intro once and repeats only the middle clip. A source marked “not a loop” plays its phases once. Native track gain initializes a new emitter; its gain remains editable. Enabled source fade flags control startup and finish envelopes. **Finish sound end clips** waits for the fade and ending; **Stop all map sounds** cuts immediately. **Use loop sample only** explicitly removes the source phase link.

In Recording Director choose **Editor Render → Recording output → Include saved map audio**. **Finish sound & save** keeps recording through the source fades/end clips, then saves the take. **Stop & save** remains available for an immediate cut. Pause is disabled during finishing; a paused take must resume before finishing. The output drawer summarizes authored tracks and spatial emitters. Existing output protection, fixed dimensions, cancellation and saved-mix snapshot behavior are retained.

## Implementation

The read-only `looping_audio` reader validates classic PC, Demo, CE and MCC Halo 1 main-track metadata against the exact map hash. It bounds the tag region, four tracks and 32 detail entries, checks tag IDs/classes, finite gains/fades and known flags, and rejects malformed or changed data. The [Invader HEK definition](https://github.com/SnowyMouse/invader/blob/master/src/tag/hek/definition/sound_looping.json) supplies the format layout; no upstream playback implementation is copied.

Every phase uses the existing source/hash-verified sample decoder and linked-segment validation. Decoded phases are joined once into one PCM buffer. One-shots play that buffer continuously; repeating tracks use native [Web Audio loop bounds and scheduled source playback](https://www.w3.org/TR/webaudio/). Finishing schedules the ending from its exact offset in the same buffer after the fade. Cache identity includes source, tag, permutation, linked-segment setting and main-track identity. The 32 MiB clip / 64 MiB held-audio budgets remain in force, including intro/end PCM. Persistent buffers are shared; transient decode allocations are not a measured memory benchmark.

Actual browser audio rendering exposed a fade error: after startup automation had finished, a new ramp could interpolate from the old startup event. Anchoring the held envelope value explicitly at finish time fixes the shortened fade. Rendered sample checks cover this behavior; a timer or mocked method-call assertion alone would not catch it.

## Verification

Local checks: **435 Rust tests passed / five opt-in ignored; 190 frontend tests in 39 files; 62 browser tests; 59 offline checks**. TypeScript, Vite, release Rust and NSIS pass. The existing large Vite main-chunk warning remains.

Four reader tests cover the four cache families, null phases, repeat/fade flags, wrong references/classes, invalid counts/numbers, truncated regions and duplicate IDs. Frontend tests cover phase assembly, channel handling, identity changes, missing endings, shared cache accounting, scheduled finish/cancellation and audio-device failures. Actual browser `OfflineAudioContext` renders verify exact middle-only loops, gapless one-shots, fade shape, ending order and voice release. A separate browser UI contract checks track selection, tool changes and finish controls with explicitly synthetic samples.

The actual packaged desktop records Alpine's real Ghost Xbox ADPCM track: 2.740-second intro, 2.743-second loop and 2.203-second ending, with a flagged 0.5-second fade-out. A 10.8-second native Opus take uses **Finish sound & save**. Independent decoding and source-waveform comparison find correlations of **0.9974 / 0.9989 / 0.9381** for intro/loop/end, above the unchanged 0.85 threshold. The 250 ms templates are compared at 4 kHz with sample-level search; an earlier coarse search missed the ending's narrow correlation peak, although subsequent independent analysis found it in the retained original recording. These waveform checks establish selected phase identity, not full audible quality or native engine behavior.

The near spatial take decodes audible source audio; the take beyond the saved range has exactly zero decoded RMS/peak. Countdown cancellation, pause/resume, background recording, interface changes, fixed dimensions, protected filenames, reopening and original cache/document preservation pass again. No game is opened. The exact accepted executable is SHA-256 `4a205152a428f9248e0708f41e4f47eb8e27e7f2444477a18ef31c674e958566`.

The [metadata-only native receipt](fixtures/c35-looping-audio-native-verification.json) records acceptance against that packaged Windows executable and the owned converted Alpine map. Private maps, samples, full logs, recordings and screenshots stay outside Git and the source ZIP. Native game audio comparison remains separate from editor output. The cumulative ledger generator also retains the operation-specific r5/r6 evidence on regeneration; all 319 requirement IDs remain intact.

## Remaining gates

Only explicitly selected/imported main tracks are sequenced. Alternate loops/endings, random detail sounds, script-controlled track transitions, global music effects and automatic BSP ambience are not reproduced. Native sound-event routing, acoustic clusters, occlusion/reverb, full audible-quality comparison and complete rendering/audio parity remain open. This pass does not launch Halo or add game-memory writes.

The wider [319-row ledger](MASTER_FEATURE_LEDGER.md) retains native paired dual wield/sword/lunge, arbitrary live spawning/BSP replacement, game-peer replication, foreign-runtime lobby translation, expanded-player acceptance and the existing MCC write-transport/recovery gates. The owner handles pushing; no remote push, master merge, installation or public release is included.
