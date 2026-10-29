# C35 owner acceptance: one Director take

Use the C35 development executable, an owned map and a new output filename. Keep your ordinary map edits saved first. This test does not require a live memory-edit connection.

1. Open the map in Level editor. **Menu** opens the workspace drawer; **Window** opens project/search/window controls. Close them, press **F11**, open/close one tool drawer and press **Escape** to restore the window. Confirm your map, camera and edits remain in place.
2. Prepare a useful view and select **Recording Director ↗**. Confirm the same view appears, move the Director to the desired monitor, and try fullscreen/hide interface. Escape restores its controls; Dock back retains the composition.
3. For an actual Halo/OBS test, launch your game normally. In Director choose **Live Game Capture**, then explicitly select the intended game window/display in the OS picker. Confirm the feed and whether an audio track was supplied. This captures the game's current camera; an independent MCC spectator camera is not available. Leave the game focused and move your character. Confirm the feed continues without taking gameplay input.
4. Choose **Record video…**, select a **new `.webm` filename**, complete the countdown, record about ten seconds, pause/resume once and stop. Reopen that file and check the first second, the rest of the picture, audio if supplied, and the final frame. Report whether the file saves/plays correctly and whether movement/audio stay synchronized. Editor Render is video-only and should be tested separately if desired.

The automated native probe decoded map detail later in a short recording but its initial decoded frame was blank. The application's Save dialog, actual game audio/capture, startup quality and long takes are still awaiting this acceptance. OBS can capture the borderless game/Director window independently; that does not establish Spark's own recording acceptance.
