# C35 r5 — Saved map audio in Director recordings

Continue `86fbe07` on `codex/continuation-35-living-workbench`. This pass connects the existing verified map sound mixer to the existing native Director recorder. Earlier C35 editing, conversion, recording and release artifacts remain intact.

## Workflow

In **Level editor → Map sounds**, choose actual sound tags, configure Ambient or Map start emitters and save the map project. Open **Recording Director ↗ → Recording output** and enable **Include saved map audio**. The drawer shows how many startup emitters are enabled and whether the saved master is muted. The setting is remembered for each map and survives docking/reopening. It defaults off. Folder, filename, countdown, pause/resume and Stop & save keep the existing workflow; the additional controls use the existing output overlay.

Editor Render can now encode the saved mix as an Opus audio track alongside its VP8 picture. The Director camera controls listener position/orientation in Halo's Z-up coordinates. Saved positions, distance limits, pitch, priorities, voice limits, looping, bus gain, mute and solo use the same mixer as sound rehearsal. Each take snapshots the saved mix; editing that mix elsewhere affects the next take. Ambient and Map start events begin after recording starts, once per take. Pausing cuts the recording interval while the camera/audio scene continues; resuming does not retrigger startup cues.

The recording bus does not connect to speakers, request a microphone or request system/game audio. Live Game Capture retains its separate permissioned audio route. Map-event hooks, scripted weapon/explosion cues, acoustic clusters, occlusion, reverb and full game audio parity remain open. The existing editor event-audition tool is still available for rehearsing those event labels.

## Source and lifecycle checks

Both rehearsal and recording load clips through one source-bound loader. It checks the actual source cache identity, sound tag/permutation, linked segment provenance, encoded hashes and decoded dimensions. Up to two distinct clips decode concurrently. Identical source/clip references share a buffer; different source identities remain separate. Decoded clips are limited to 32 MiB each and the prepared take to 64 MiB total. Existing mixer voice/event limits still apply.

All selected startup clips are checked before countdown and before opening an output. Missing resources, invalid scenes or excessive budgets fail preparation instead of creating a silently incomplete recording. An audio startup failure after encoding starts marks the native take failed, retaining any nonempty partial rather than publishing success. Cancellation, stop, errors and unmount release the owned audio track, listener subscription, mixer and AudioContext. The recorder keeps the existing bounded, ordered native storage/publication path.

The full Windows test run also exposed a race in the native-workspace alias test: after the alias released its lock, another tool could reuse its drive letter before the assertion. The test now checks that its exact target disappeared from the complete DOS-device target stack. It permits unrelated reuse and leaves production alias behavior unchanged.

## Acceptance and limits

The extended native harness imports the real converted Alpine MCC cache into a fresh private library, chooses an actual supported embedded sound, verifies its preview hashes and saves a spatial sound scene through native project storage. It records using the visible audio/output controls and the actual release executable. An independent FFmpeg decoder checks the encoded Opus track, finite PCM levels, picture frames and duration. A second take moves the Director camera 100 map units from the emitter, beyond its saved 40-unit range, and checks the resulting silence. No generated tone is substituted for the map sound.

The metadata-only [native acceptance receipt](fixtures/c35-director-audio-native-verification.json) records the exact tested build, source/sample hashes, levels, durations and preserved-document checks. Videos, decoded PCM, screenshots, source cache and full logs stay private under `.local/continuation35/recording-r5/`. The decoder remains a private QA tool, not a product dependency.

The final take is **950,245 bytes**, SHA-256 `abbe88343e247bde3328f3fde0a3b561a839f045eebf5da4f08c23a55f9b7c26`. Independent decoding finds **82 picture frames**, all **1920×658**, and **3.54 seconds** of stereo 48 kHz Opus audio. The actual source is `sound\sfx\ambience\exteriors\loops\eeriewind`, a 1.32-second stereo Xbox ADPCM sample at 44.1 kHz, looped by the saved scene. Its near-camera decoded RMS is **0.03098**; the second take, beyond maximum distance, has **zero RMS/peak**. The short file's audio length and demuxed movie clock differ by about 69 ms. These are individual acceptance observations, not full game synchronization, recording frame-pacing or hardware benchmarks.

The native challenge also checks countdown cancellation, pause/resume, background recording, fixed output dimensions while hiding the interface, protected filenames, wrong-window/traversal refusal, persisted folder/audio preferences and source preservation. Focused tests cover missing/late clips, source separation, memory budgets, output ownership, suspended contexts, one-time startup and failed-take publication. Current validation: **424 Rust tests passed / five opt-in ignored; 175 frontend tests in 36 files; 56 browser tests; 59 offline checks**. TypeScript, Vite, release Rust and NSIS pass. The existing large Vite main-chunk warning remains.

This is saved editor sound-scene export. OS Save/capture pickers, actual game audio/capture, independent MCC spectator control, long takes, physical 4K/mixed-DPI behavior and full engine rendering/audio parity remain separate acceptance gates. The wider native gameplay/networking backlog stays in the [319-row cumulative ledger](MASTER_FEATURE_LEDGER.md). The owner handles pushing; fresh r5 artifacts preserve r1–r4, with no remote push, merge, installation or public release.
