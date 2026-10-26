# Continuation 22 · first safe Windows acceptance test

**1.** Extract the C22 ZIP into a **fresh, empty** working folder; do not overwrite C21 or any installed Halo map/kit/tag directory. Compare its SHA-256 with the delivered checksum file. Read `README.md` and `docs/CONTINUATION_22_ENGINEERING.md`.

**2.** In the source folder run `npm run test:offline` using your existing, trusted Node 22 environment. This checks pure source-side behavior without needing any Halo installation.

**3.** After the tests pass, install/use required project dependencies and verify `cargo test --workspace` and `npm run build` in an isolated dev workstation. If the Rust compiler errors, do not move to Halo Tool compilation. Capture errors. Do not assume C22 native cancellation code was verified by Node tests.

**4.** Create a **new** Guilty Spark Five-mode Test Arena and confirm 32 starts, 16 per team, two CTF flags, two four-corner hills, one Oddball, four Race checkpoints, four Race vehicle flags and a paired teleporter. Export the source-only spawn review and verify its two-team counts. Do not label it a playable map.

**5.** Once the above is complete, provide a *separate disposable copy* of correctly licensed Halo 1 Editing Kit tags in the app's isolated build area. Compile only a new uniquely named arena, capture Tool version, full logs and source/build hashes. Never forcibly terminate Halo Tool `structure`/`lightmaps` or write into your installed game. Verify the generated BSP/lightmaps and test modes locally and with a second client.

**Acceptance requires game evidence;** all Halo compiled/map/AI/graphics/multiplayer tests remain **NOT RUN** in this archive. The requested UI troubleshooting cadence is one user-facing action at a time; use this card as the full reference, not an instruction to do everything at once.
