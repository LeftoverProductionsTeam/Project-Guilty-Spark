# C68 — Independent device logic and protected HaloScript

Implementation commit: `5bd6e090bb24b1753145e033e38d52b7da829f8a`. Subsequent evidence/checkpoint sealing is documentation only.

This continues `5b11e6d` on the sole canonical local master. It extends the existing C63/C66 room-and-door source, native scenario generator, Inspector and native compiler. It does not replace the geometry editor, create a new scripting language or complete the entire Native Halo Authoring Revolution directive.

The requested attachment path was absent. The one available matching-title copy was read and retained with its exact hash; this is not a claim that it matched the missing attachment byte for byte. Its identity and the complete remaining scope remain in [pending requests](PENDING_REQUESTS.md).

## Creator workflow

1. Open or create editable Workshop geometry in Level editor. The existing **Two rooms + corridor + ramp** action supplies the accepted starting layout; choose a fresh map name. Place doors from **Asset library → Doors & devices** using a compatible opened source map.
2. Select a placed door. In **Inspector → Logic / Events**, add a trigger, use **Cover both sides**, then connect **Enter → Open** and optionally **Leave → Close**. Existing trigger transforms, native source preview and advanced override remain available.
3. Place or copy/paste a second door. Select it, choose **Reuse a device setup → Copy behavior**, and fit its copied volume to the doorway. The complete supported setup gets new trigger/rule identities and native names, with offsets rotated around the destination. One Undo removes the copied behavior together; it does not delete the door.
4. Expand **Handwritten scripts** and import a plain ASCII `.hsc` file. Its comments and original line endings stay intact alongside generated `gs_logic.hsc`. Select a module to edit or export it. Importing source does not convert it into a visual graph. Explicitly overriding the generated file pauses visual connections so later graph changes cannot silently disappear behind that override.
5. Save and use the existing **Build & check playtest** action. Exported source consists of ordinary scenario fields and native `.hsc` files. Optional source-map/provenance JSON remains outside the native tags. A compatible Halo toolchain consumes the native content independently of Spark.

Behavior copying currently handles the existing self-contained typed device position/power, delay, timer and position-condition rules. It refuses mixed-device graphs, occupied destination behavior, missing references, locked destinations, tilted devices and exceeded budgets. It preserves the source setup. Handwritten calls are not automatically rebound to another device.

Source imports reject ambiguous filenames, traversal, device names, duplicate names, generated/conventional reserved filenames, NUL/non-ASCII input and native file/size limits. They never silently rename, re-encode, truncate or omit a file. MCC/H1A supports at most 16 sources / 1 MiB per source; classic targets allow eight / 256 KiB. Generated/global files count too. Conventional `global_scripts.hsc` is not imported as a sibling module; existing native global source is preserved by its separate source workflow. Only the MCC/H1A path receives fresh native compilation acceptance in C68.

The compiler contract was checked against the installed generation's [pinned Invader source](https://github.com/SnowyMouse/invader/blob/33518109/src/script/script.cpp) and the [native scripting limits reference](https://c20.reclaimers.net/h1/scripting/limits/). Invader remains a separately installed GPL program invoked through its documented command line. No third-party engine/compiler implementation was copied into Spark.

## Actual acceptance

Private evidence: `.local/artifacts/c68-native-authoring-20261104/`. The public [metadata receipt](fixtures/c68-native-authoring.json) contains hashes and bounded results, not Halo assets.

| Stage | C68 result |
|---|---|
| Actual desktop controls | Native Asset-library pointer drop; Ctrl+C/V; independent behavior copy; handwritten import; Undo/Redo; immediate Save; trigger-width Undo; reopen passed through the real app WebView/IPC. No mocked native calls. |
| Native source and tag readback | Invader independently reads two machine/name links and two `rotational` trigger volumes. Their corners are `[9,-1.5,0]` and `[15,-1.5,0]`; editor centers are `[12,0,1.5]` and `[18,0,1.5]`. |
| Native compilation | Invader script compilation plus installed H1A Tool produces an MCC Halo 1 cache, with index/CRC/protection/stub checks and all seven intended native scripts. |
| Invalid handwritten source | Real Invader rejects `manual_original.hsc:8:27`: the deliberately injected function is undefined. The good scenario remains unchanged. Restoring the original source compiles and reads back all seven functions. This separate check copies only one scenario and three source files. |
| External native edit | Actual Invader same-value save preserves semantics; a valid bounding-radius edit from `0.9` to `0.5` reconciles and recompiles. Native output reads back `0.5` and all seven functions. |
| Corrupted save | A deliberately truncated QA save is detected, rejected at reconciliation and restored from retained source. The immutable baseline and good cache remain unchanged. The injected writer is recorded as QA, not attributed to Baboon or Invader. |
| Source preservation through external build | `global_scripts.hsc`, `gs_logic.hsc` and `manual_original.hsc` match their original hashes in the external working-tag build. All 1,801 baseline tag hashes are rechecked. |
| Actual C68 game loading / player traversal | **Unverified.** Compilation is not gameplay. |
| Baboon manual GUI edited-save | **Unverified in this pass.** Baboon registration/prepared handoff is real; the native external edit is performed by Invader. |
| Other runtimes, real game peers, clean-machine release | **No new acceptance.** |

The existing C63 human result remains **“Opens both ways; crossed and returned; closed normally.”** It covers that earlier H1A Standalone map. It is not transferred to the new two-door cache, retail MCC or another runtime.

The actual Invader same-value save in this trial was byte-identical. Its semantic no-op is verified; a new byte-different Baboon rewrite is not claimed as tested.

## Native identities

- Development app SHA-256: `c2d1c6518687a755cc48ae33dd935eaf07469b0fb19c0ceaa151e8a42e0dd502`.
- New native authoring cache: `9964e6ddafb30d5b83353d486882ab0d17f6c67ffd922305030acc86a877afbb`, job `b2693e35-6acb-4358-9b1a-cf3d22a03fa2`.
- Reconciled external-edit cache: `7daa13c165dacad7eedddde04c9479fadcffceabb3c54d4aaedad0dae6c68b4b`, job `fbc854f8-5fa3-42f8-a5b2-abbb08ddd1eb`.
- Preserved source cache: `b53c7543526c709c53344e814a746c0687c3f6ed7691d720e4764c54c0549103`.
- Original handwritten module, including CRLF: `8a5aaf369ffd46c9c4faccc875ca5829feb72ded3b8969699e15970e5436b33e`.

The cache contains `gs_logic_init`, four distinct generated event functions, `c68_manual_value` and `c68_manual_init`. Script-name/readback acceptance does not assert that a startup function ran in a game. Keeping comments in exported/source files does not promise that every runtime retains comments in its compiled cache.

## Repairs, ownership and failed trials

`native_logic.rs` now exports the generated file and protected original companion modules. It preflights all output destinations before writing and verifies exact exported hashes before/after Invader and after the native cache build. Filename/type/budget checks reuse existing safe paths and native validation. Existing logic serialization remains unchanged when no companion modules are present; graph conflicts retain both drafts through the existing collaboration path.

Clipboard provenance now carries the relevant placement import binding. A staged copied path can be resolved back to its original identity, which is independently readmitted for the destination. **The document retains the original tag path; only build staging uses the destination namespace.** No provenance check was relaxed. Copying does not grant foreign receipt permissions or bypass runtime-specific native import support.

Initial trials remain preserved, not counted as passes: inherited fixture metadata referred to an absent old source project; a donor map was imported without being opened; an assertion read before the deferred Undo/Save completed; a restored drawer obscured Build; an intermediate clipboard change incorrectly put staged paths in the document and was correctly refused; a development-server executable could not load as a standalone app. The first external attempt supplied Baboon's enclosing folder rather than the nested installed program folder and stopped before preparation. The accepted app uses embedded frontend assets. None of these failed attempts is manufactured into gameplay or editor acceptance.

Windows Computer Use was retried but could not initialize (`helper_unknown_error` / setup refresh failure). The actual app WebView and native tools remain available. No raw Windows UI-automation substitute, game input injection, install, public server, download, cleanup or remote publication was performed.

## Regression, measurements and preservation

- Rust workspace, locked: **705 passed / 8 explicitly ignored**, zero failures. Skips cover the live MCC camera, online listing, owned painted BSP/audio/power-up/campaign-duplicate/emitter fixtures and selected installation inventory.
- Frontend: **390 tests / 92 files passed**. TypeScript and production frontend build pass.
- Browser: **161 passed**. Offline checks: **59 programs passed**. Continuity/health Node checks: **8 passed**.
- Embedded native desktop build and both native acceptance paths pass. The source-rejection/recovery check is recorded separately in `native-ui-sixth/syntax-acceptance.json`; its standalone mode does not rerun the positive UI sequence.

One native authoring build reports **89.045 s** internally; desktop observation/readback measures **99.302 s**. Native source rejection/correction/readback takes **0.228 s** for the four-file diagnostic. Watcher observations take **4.668 s** for injected corruption and **4.949 s** for the valid edit in this trial. These are scoped observations, not before/after startup or rendering performance claims.

The build reuses the bounded C66 tag pool: 1,774 files / 103,834,625 bytes staged from 1,796 available inputs, plus the admitted 23-tag door closure. It does not copy the full SDK and uses no mutable hardlinks. The completed storage scan reports 153,545,399,351 logical workspace bytes; retained C68 failed trials, source/cache copies, compiler outputs and evidence account for 2,781,640,396 bytes / 13,341 files at that scan. Logical bytes are not NTFS allocation. Existing storage warnings require review, not deletion. All trials remain for diagnosis.

All **475 CSV requirements are unchanged**, SHA-256 `1eb0848def039b08b6398c8ea67e8c7e9a5fbce803c0ec417bc2655efe945bf7`. Fifteen selected protected C49/C63 artifacts were rehashed unchanged. C67 recovery, all source/history/research, C63 gameplay and external-edit evidence, saved projects and the accepted C49 installers/portable/source remain intact. No C68 installer, portable archive, Linux/macOS build or public release was produced.

## Reproduction and remaining gates

Build the frontend, then the embedded native test app with `node scripts/cargo.mjs build -p guilty-spark --locked --features tauri/custom-protocol`. Reuse the accepted bounded C66 fixture and installed tools. `scripts/test-native-logic-templates.mjs` documents its seven paths and guarded `--resume-build` / `--check-syntax` modes. Its normal fresh run exercises the actual authoring controls, native build and independent source-failure check. `scripts/test-native-logic-reconcile.mjs` consumes completed authoring evidence and the actual nested Baboon program folder for the existing native handoff/integrity/reconciliation path. Keep outputs in fresh owned artifact directories; never use SDK masters or game installations as writable test outputs.

The next focused gameplay gate is to walk through **both doors**, wait for them to close, then return through both, checking collision and repeatability in the new map. No game was left running unattended. A future actual Baboon GUI edit, externally handwritten source adoption, additional native target fixtures and source-edit concurrency need their own evidence.

The wider directive remains active: general terrain reconstruction/extrusion/seams, materials/lightmaps, Blender/Mantle/OpenTool workflows, complete rendering/audio parity, recovered-source adoption, AI/Firefight/Zombie lifecycle and peer tests, Megaworld human traversal, separate-computer collaboration and release acceptance are not completed by these native loose-tag tests. Direct structural compiled-map editing remains explicitly unfinished. No GitHub push or publication occurred.
