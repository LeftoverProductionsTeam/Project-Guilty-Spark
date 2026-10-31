# Native looping sound emitters

This C41 follow-through continues the committed integration and home polish at `c5bd78e`. It adds a bounded native sound path; existing C35–C39 transactions, reconciliation, shared revisions and compiler safeguards remain in place.

## Use it

1. Open an editable **MCC QuickForge** map in Level editor. Load an owned map in Asset library and add a supported original looping sound.
2. Open **Map sounds**, select its emitter and enable **Include original loop in map**. Spark prepares its recursive tags in isolated storage. Moving this emitter changes the next build's native position. Inclusion and its import form one undoable edit.
3. Build with the matching H1A kit, editable base tags and Invader. Inspect the validated output, then test its audio in Halo.

An original loop can contain several tracks, alternate/end clips and random details. **Include it once at a location:** Halo receives the complete original `.sound_looping` tag. Two inclusions of that same loop at the same point are rejected. Editor master/bus mute, gain, pitch, distance and event controls remain rehearsal settings. They do not silently rewrite the native sound or disable its inclusion.

## MCC bank recovery

The genuine trial exposed an extraction failure: the reviewed Invader could serialize the loop definition but could not read the external MCC sample data. It returned zero after two per-tag errors. Spark's existing incomplete-extraction check refused that result.

For supported sound-only roots, Spark now validates the installed classic ADPCM bank and index against their recorded hashes, tag/pitch/permutation names, encoded lengths, rates and channels. It materializes those **exact encoded bytes** into a separate extraction input. A byte audit permits only sample flags/offsets and declared length changes in the original prefix. Native metadata, pitch ranges and chains stay intact. This input is for local extraction; it is not presented as a playable map or transmitted to peers. Invader performs the native loose-tag serialization.

The input and bank identities are checked around extraction. Recursive imports keep their existing receipt, namespace, dependency, hash and staging checks. A source-cache change, changed bank, missing permutation or incomplete tool output blocks acceptance. No missing audio is replaced with a stock sound.

## Native build verification

The isolated build generates one model-free `.sound_scenery` attachment per included emitter and appends the real scenario palette/placement. It reads back the native attachment and palette, compiles with H1A Tool, reopens the cache and verifies the exact tag relationship, single placement and position. Referenced native sound samples must be embedded and valid. Existing structure, CRC, protection/stub and owner-source checks still run.

Only explicit native inclusion, immutable source/loop identity and position enter the audio part of build identity. Changing a rehearsal slider cannot make an older native map stale; moving or removing an included emitter does. Older projects without inclusion retain their prior serialization and fingerprint behavior.

## Acceptance and limits

The [native receipt](fixtures/c41-native-loop-emitter.json) and `scripts/test-native-loop-emitter.mjs` record real desktop IPC, the inclusion control, undo/redo, original MCC ambient dependencies, native compilation and reopened content. The script compares every permutation hash and chain of the imported loop's direct sound dependencies with its original source, decodes a compiled sample, checks all 2,240 base input files and deliberately corrupts a managed import. The invalid rebuild must fail while the previous accepted map and original sources remain intact. Deliberate QA corruption is not attributed to Baboon, Invader or another unobserved writer.

The preserved earlier trials include missing resource binding, an asynchronous checkbox-test error, incomplete MCC extraction and the resource-reset authoring race. None is counted as passing evidence. The UI now waits for its source context and keeps native authoring separate from audio-player resets.

Current boundaries:

- Native inclusion targets **local MCC QuickForge** source. Existing compiled-map additions, CE native emitter builds and SparkLink sound publication remain unaccepted; unsupported intents block instead of disappearing from a build.
- Bank materialization covers supported classic ADPCM sound-only closures, at most 64 dependencies, 512 external samples and 64 MiB of recovered encoded data, from a source cache at most 128 MiB. CELT and other unsupported bank codecs remain explicit refusals.
- Custom WAV/OGG clips and arbitrary script/event assignments remain editor rehearsal. Whole-loop native inclusion preserves the source tag's authored settings; it does not bake the editor mixer.
- Native compilation, exact sample readback and browser decoding do **not** establish in-game audibility, attenuation, acoustic behavior, gameplay events or game-peer agreement. Those acceptance tests remain open.
- The unfinished structural direct compiled-map editor, arbitrary live spawning/BSP replacement and universal runtime conversion remain in the master backlog.
