# C35 r4 — Director recording and named takes

Continue `a53f272` on `codex/continuation-35-living-workbench`. Preserve the immersive workbench, camera authority, C35 r2 tool-save workflow, C35 r3 Alpine conversion and earlier releases. This pass advances the actual recording workflow and its native evidence.

## User workflow

Open an owned map, prepare a view and choose **Recording Director ↗**. Under **Recording output**, enter an existing absolute recording folder and a new take filename. The folder is remembered per map; each successful take supplies a fresh filename. Leave the folder empty for the existing native Save dialog. The output controls open over the preview, and Escape closes them without consuming extra viewport space. Record, pause/resume and choose **Stop & save**.

The same native checks protect both routes: one active recording per Director, exact map/window identity, an existing absolute folder, a bounded safe `.webm` leaf name, link rejection and refusal to overwrite an existing file. The final publication is a non-overwriting hard link from an owned partial. A file appearing at the destination during capture is protected too. Unicode names use the same UTF-16 length convention as the input field.

Cancelling a countdown removes only an empty owned reservation. Interrupted nonempty takes remain recoverable partials. Native finalization checks the actual file length against acknowledged bytes; changed files remain retained rather than being removed or reported as saved. Publication errors keep the take name for recovery. A stopped video source ends the take even if an audio track remains live; already-ended sources and already-cancelled requests never open an output.

The recording controls have explicit accessible labels, countdown options are locked during a take, and new output controls remain collapsed until needed. No source map, authored scene, camera ownership or game-memory hook is replaced by this workflow.

## Bugs found by the native challenge

Docking and reopening initially lost the recording folder. Both windows could read the correct stored value, but the main editor's older cached preference bag overwrote it while changing a different key. Map-session writes now merge the latest stored preferences before saving; peer storage events refresh the affected map, unchanged objects retain stable references, and quota failures retain pending in-memory choices. This concerns UI preferences, not authored project edits or distributed source-edit conflict resolution.

The clean-view test also found a movie changing from **1920×658 to 1920×1080** mid-take when the interface was hidden. Editor Render now samples the existing canvas into one bounded fixed-size 2D export surface. Preview resizing is fitted inside that surface with the aspect preserved. Only its recording dimensions stay fixed; it does not add another scene renderer or change the shared camera. Frame work starts after preparation/countdown, is cancelled on abort and is released after recording. Fractional frame time is carried between samples, and supported tracks receive explicit frame requests after drawing. A timed regression catches 24 fps incorrectly falling toward 20 on a 60 Hz display. The export surface is limited to 8192 pixels per side and 16 megapixels. This makes editing/export dimensions stable; it is not physical 4K or full rendering parity acceptance.

## First-frame investigation

The frozen C35 r1 receipt reported zero luminance variation when drawing the video immediately after `loadeddata`, while a later sample contained map detail. That observation was retained honestly; it did not establish the contents of the actual first encoded frame.

Independent FFmpeg decoding of the **original retained file**, SHA-256 `433998ad8ce98ccba0d093f160ed5a9d892ca2a523485ebbf6b1e28c9af7ea67`, finds visible picture data in frame zero. At 128×72 grayscale its mean is approximately **232.68** and deviation **39.91**. The earlier zero sample was a premature browser presentation read, not evidence of a blank first frame in that file. No speculative production camera offset, extra render viewport or recording delay was introduced to hide it.

The browser probe now waits for a submitted video frame and records its media timestamp before sampling. [Video frame callback semantics](https://wicg.github.io/video-rvfc/) distinguish compositor presentation from media data availability. [Canvas capture semantics](https://w3c.github.io/mediacapture-fromelement/) also distinguish requesting a frame from painting one. Independent file decoding remains the check of the actual first encoded frame.

QA uses a pinned decoder from the project's [imageio-ffmpeg 0.6.0 Windows wheel](https://pypi.org/project/imageio-ffmpeg/0.6.0/), SHA-256 `02fa47c83703c37df6bfe4896aab339013f62bf02c5ebf2dce6da56af04ffc0a`. Only its bounded FFmpeg executable was extracted. The tool, wheel, videos, screenshots, owned map copies and complete logs remain private; none are distributed in the source archive or added as a product dependency.

## Native acceptance

`scripts/test-director-recording-native.mjs` uses `qa_recording_library` to import an owned real map into a fresh private library. It drives the actual release WebView through the visible named-take controls and real native storage calls, independently decodes the resulting file, verifies its first frame, checks preservation and reopens the Director to check the saved folder. Its metadata-only receipt is [recorded separately](fixtures/c35-director-recording-native-verification.json).

The final native trial saves **1,000,558 bytes**, SHA-256 `118c54dd475772747003428bc351a74b928ff0a34d77345112d41575ec9421ea`, through the app's actual ordered native storage path. Independent decoding reads **86 frames / 3.62 seconds**, with every frame **1920x658** even after clean-view toggling. The first encoded frame contains visible map detail (RGB luminance deviation approximately 27.50 at 128×72). The corrected browser probe samples its first presented frame at media time 0 and also finds picture data. These are individual short observations, not a frame-pacing or hardware benchmark.

The app's countdown cancellation leaves no empty partial, pause holds the displayed clock, recording continues while the main Spark window owns focus, closing/docking is refused while recording, the next take name changes after success, an existing filename is protected, and the folder survives docking/reopening. Wrong-window and traversal requests are refused. Source cache bytes and authored scene/tag content stay unchanged.

Local checks pass: **424 Rust / five opt-in ignored; 165 frontend tests in 35 files; 56 browser tests; 59 offline checks**. TypeScript, Vite, release Rust and NSIS pass; the existing Vite main-chunk warning remains.

The Windows computer-use helper failed during initialization with `windows sandbox failed: helper_unknown_error: setup refresh had errors`. No OS Save dialog, display/window picker, privacy prompt or game was automated. The named-take path is a visible production workflow with the same native storage protections; it does not establish Save-picker or live-game-capture acceptance.

## Limits and remaining engine work

Editor Render records Spark's preview and has no game-audio track. Actual game capture/audio, independent MCC spectator control, long takes, physical mixed-DPI/4K export and complete rendering/audio parity remain separate gates. A short successful native take does not establish those behaviors. The source preview's static poses and effects still differ from gameplay.

The [319-row cumulative ledger](MASTER_FEATURE_LEDGER.md) retains the wider dual-wield/sword, arbitrary live spawning/BSP replacement, game-peer replication, cross-runtime protocol and expanded-player goals. The owner controls pushing; no remote push, merge, installation or public release is included. Fresh r4 artifacts preserve r1–r3.
