# Continuation 24 — first Windows test handoff

**Prerequisite:** use the entire extracted ZIP in its own clean folder. Do not overwrite Continuation 23, the Halo application, stock cache maps or your existing HEK tag tree.

**Gate 1 — application compile (NOT RUN here):** On the owner-controlled development PC, install project dependencies from trusted registries and run the normal documented Tauri build. Do not treat passing the Node offline suite as a compiled Windows app. Record version/error output.

**Gate 2 — source topology UI (NOT RUN here):** Open QuickForge and edit a standalone brush/arena. Expand Geometry & Build → BSP source topology. Confirm T-junction count and complete/incomplete scan status appear. Verify selection of an example does not mutate geometry. Export a v2 JSON diagnostic; it must not contain original map bytes, source positions, or paths.

**Gate 3 — compiler WRL (NOT RUN here):** Export JMS to a new, isolated test workspace. Only run a verified matching Halo Tool `structure` through the explicit managed workflow. Do **not** interrupt Tool while writing a BSP. If Tool produces a `.wrl`, import it in QuickForge and inspect the new "Locate possible WRL issue brushes" area. Confirm ambiguity is not silently guessed, selecting a candidate only changes editor selection, and changing the source invalidates the old WRL.

**Gate 4 — real Halo proof (NOT RUN here):** Confirm Tool finished cleanly and inspect the resulting scenario/BSP. Set up required tags using approved tools. Load a generated cache in the chosen Halo runtime, verify collision and the five stock gametypes on actual clients, and record failures and hashes. **A source-only ZIP is not a playable map.**

**Built-in evidence from this environment:** 45 offline Node scripts pass; changed pure TS strict-checks pass; QuickForge JSX parses. Rust/Cargo, GUI/Tauri, Halo Tool and in-game/multiplayer proof were unavailable here.

**Failure policy:** keep the original files untouched; preserve WRL/log/receipt evidence; do not infer compiler success from an empty warning list or geometry preview.
