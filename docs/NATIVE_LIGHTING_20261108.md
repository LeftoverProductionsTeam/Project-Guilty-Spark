# Native lighting setup and bake

The first complete path is accepted through actual Windows controls, native compilation, independent standard-tag readback and a real Chupathingy load. Human appearance/gameplay remains pending. This is the 58-triangle two-room/corridor/ramp fixture, not the Timberland–Sidewinder seam.

## Creator workflow

1. Open an editable QuickForge/BSP Workshop project and configure its matching native source, Halo compiler and Invader in Project setup.
2. In **BSP Workshop → Halo material paths & player starts**, select an existing Halo sky. Assign actual source metal to interior surfaces and the appropriate landscape material to terrain.
3. Open **Lighting & fog**. Set ambient color/power, sun color/power/bearing/elevation and atmospheric fog. The viewport is an approximation; backdrop color remains preview-only.
4. Choose **Draft radiosity → Bake lighting & rebuild**. Spark saves the authoring snapshot, copies the selected sky to a separate standard tag, reads back its fields, runs native radiosity/cache compilation and verifies compiled sky values plus real BSP lightmap references/UVs.
5. Launch the validated map in the supported runtime and inspect the result. Rebuild explicitly after lighting changes. A failed/stale build cannot replace or restart the previous-good owned Chupathingy playtest.

QuickForge has the same action under **Environment lighting & fog**. Imported editable BSP assemblies use **World Inspector → Environment**. Ordinary compiled-map light patching, multiple scenario skies and arbitrary light-object authoring are not accepted by this initial path. Draft and Final radiosity both pass the CE-format Workshop native path. MCC lighting and broader geometry/runtime cases require separate acceptance.

## Verified result

- Source base: master 5095e9b9ea0979448cd571d56659b4076e5930a2 plus the fingerprint-pinned dirty continuation. QA app SHA-256: 431fbbbeb5c0d4ad21f7f42c26098d2573b7c664bfe38270fd9b59cbcace390d. This is not an installer or published release.
- Native controls authored ambient power0.6, sun power2.2, bearing-35°, elevation50°, fog off. Both indoor/outdoor fields and the sun were verified through independent Invader extraction of the accepted cache.
- Native material: levels\test\timberland\shaders\timberland_metal_plate_floor.shader_environment. Actual Chupathingy screenshot shows the metal room, not the landscape atlas.
- Real lightmap: levels\quickforge\native_live_rebuild\native_live_rebuild.bitmap. Native cache CRC mismatch count0.
- Initial cache: a8f3ee12247150f7c7fcf4f241c53ff9b59e0ffd18b9186b4013853f4ff75019. Rebuilt cache: 75b0a4ca4c7788e6a5bbfe083e93c78ddf5f11e9fb4f3b6d63bbe3f9cdbf1e36, 57535628bytes.
- Native game telemetry moved the selected start X from32 to32.25. Compilation/readiness64943ms; rebuild/load86979ms. These are this fixture's measurements, not a general before/after optimization claim.
- An actual stock-Warthog compiler rejection retained the previous process/cache. Save and build history survived full Spark restart; the game did not relaunch automatically. All8 pinned original inputs remained unchanged.
- Current source regressions:872Rust passed/9ignored,469frontend,243browser,59offline and36storage checks.

R147 correctly rejected fog that became enabled after compilation. The pinned Invader schema/reader defaults zero density to one; disabled atmospheric fog now writes a zero native start/opaque range and validates the raw compiled distances. The renderer's positive-range clamp is excluded from native acceptance. The existing source reader now exposes those raw distances.

Evidence root E is defined in ACTIVE_TASK.md. R148 is the actual UI/compiler/game/recovery receipt. R153 independently extracts and inspects the saved accepted standard sky/BSP and all15lighting fields, including material bindings. Temporary tag/compiler trees were disposed; one accepted map and small receipts/screenshots remain for review. The original source maps, SDK and installed runtimes were not changed.

See [machine-readable evidence](fixtures/native-lighting-20261108.json) and [human check H21](HUMAN_TEST_PLAN.md).

The subsequent R155 source regression passes875Rust/9ignored and471frontend tests. It fixes propagation of an omitted optional bake recipe during shared author Undo, refuses competing whole recipes and shows exact differing lighting fields. This real TCP host/guest result is separate from the pending three-process and two-physical-computer acceptance. The earlier R148/R153 native evidence retains its original executable identity.

R163 also compiled Final radiosity and independently read back the standard sky/BSP, but its stricter saved-history check failed: the identical source snapshot was staged yet still dirty. Bake now explicitly requests acknowledged Save before compilation through the existing callbacks. Focused browser contracts R165 pass both successful Save ordering and refusal to compile after a failed Save. The R166 acceptance below closes that repair. R161 passes243browser tests on the preceding source; current R167 passes245.

## Current Final-quality follow-through

R166 completes the repaired actual Windows workflow on the current source-matched app: 49,985,024 bytes, SHA-25638cdda4efb86c4321bf6aec7c787913401c6917cc4c152390a016d14f6b99a7a, runtime-source fingerprint b0c36e0c40d21e89d10fbdf64238cc589e22711f12d2e7e4e7142a42ed225beb. The source parent is5095e9b plus this continuation; this is a QA executable, not a release.

- Final radiosity, all15standard sky fields, exact metal shader, two lightmap groups and CRC0 pass native compilation and independent Invader readback.
- Bake explicitly acknowledges Save before compilation; the saved history is clean and its document/recipe matches the staged revision. Failed Save prevents compilation. Earlier Undo snapshots keep their own coherent sky/recipe pair. Imported BSP lighting requests also participate in the source fingerprint.
- First cache SHAaf90a68fea7b88bf28187d8a79dd1392614265704398ebb733e9379601283782; rebuilt cache SHA76b72f02f459e323a586eedce73f5c1693023d6677e1e65fb45a8d65e53281a8,57,566,348bytes. The private accepted output is E/native-lighting-saved-r166-validated.map.
- All four native starts move X+0.25. Chupathingy selected different starts between launches: observed initial(32,-4,0), rebuilt(-4.75,-4,0), both matching their exact compiled sets. This proves the changed native revision loaded, not player traversal.
- Native compile/readiness76,630ms; rebuild/load92,102ms for this small fixture. These are recorded conditions, not a general performance comparison. The deliberate original-Warthog compiler failure preserves the running prior revision/PID/cache; Stop and full Spark restart preserve source and build history. Eight originals remain unchanged.
- The actual OS screenshot E/native-lighting-saved-r166-chupathingy-os-prompt.jpg shows the metal room behind an unhandled Windows network-permission dialog. No security setting was changed; unobscured visual/human approval remains open. The earlier clean Draft screenshot retains its own R148 identity.
- Current regressions:876Rust/9ignored (R158 Rust stage),472frontend/TypeScript/offline59/storage36 (R166),245browser (R167). The two new Save/failure contracts also pass independently in R165. R169 also completes the three-process continuation and current-app native layouts; details follow.

The raw CE extraction requires an explicit reviewed three-tag/seven-field correction in a separate source tree. That recovery is not lossless: undefined Warthog grenade enums, one known headlight image index and three invalid effect attachment references are corrected or cleared. Original tags remain unchanged; Spark does not hide this recovery step or claim arbitrary corrupted source is safe.


## Shared source and current Windows layouts

R169 completes three real native processes with three independent project libraries: simultaneous BSP edits, author Undo/Redo, optional lighting recipe removal and conflict rejection, valid saved Undo snapshots, actual mouse drag previews,240sustained commits, permissions, expired-lease reauthentication, owner process death, two genuine offline edits recovered exactly once, new-session rollover/reinvitation and revoked-participant refusal. The frozen MCC cache compiles revision254 while editor revision255 continues; independent readback verifies58collision triangles, two portals and1,776tags, SHA826f56799c7614cd8d915709916b2a7dce1c099378626ba993fa91819718ec32. This shared-stage fixture clears its lighting recipe before compilation; its radiosity acceptance is the separate R166 CE test.

The bounded journal measures1,153,342bytes with100Undo states after240commits. Early/late latency medians and their one-machine scope are in the fixture; these are stability samples, not an optimization comparison or Internet performance claim. Real Radmin-interface convergence is on the same computer. Two physical computers, Steam relay and game AI replication were not tested.

The same R166 application passes R169's12native layout/setup cases:800×600,1280×720,1366×768,1500×950,1920×1080,2560×1080,3440×1440,5120×1440. Each verifies90Games & Tools controls through real paging, zero measured page overflow/scrolling controls, native scale/fullscreen/cache preferences and OpenCE flavor persistence after application restart. Physical other-DPI changes, ultrawide hardware and monitor disconnection remain open.

R168's partial run had already passed native build and owner-crash recovery, then exposed a missing brace in the test helper for an already-open SparkLink panel. R169 fixes that helper and completes rollover; no product assertion or native guard was relaxed. R160/R162 separately exposed conflicting inherited QA mode flags, now explicitly isolated by stage. Temporary compiler/browser/SDK trees were disposed after every run.
