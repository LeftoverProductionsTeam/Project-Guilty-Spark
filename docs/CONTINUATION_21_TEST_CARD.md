# Continuation 21 — Owner's first acceptance test

**First step only:** Extract `Project_Guilty_Spark_07_Halo_Modding_Brain_Continuation_21_SOURCE.zip` into a new, empty folder **outside** your Halo installation, outside a client device and away from any previous Guilty Spark working tree. Preserve the original ZIP; do not run an installer or copy anything into the game's `maps` or `tags` directories.

Report whether the extraction completed without error and whether the `Project-Guilty-Spark-v0.3-DEV` directory contains `Cargo.toml`, `package.json`, `src/`, `crates/`, `src-tauri/` and `docs/`. Only after you report that result should the next build/test instruction be chosen for your Windows machine and exact toolchain.

The new default wizard template is **Guilty Spark · Five-mode Test Arena**, target **Halo Custom Edition**. The scenario and JSON checks are source-only; actual Halo Tool, Sapien, compiled cache, performance, and 2-client mode tests remain unverified.

If you want a local checksum verification later, compare the ZIP's SHA-256 with the separately supplied `Continuation_21_SHA256.txt` using a read-only hash command. No game-file write is necessary.
