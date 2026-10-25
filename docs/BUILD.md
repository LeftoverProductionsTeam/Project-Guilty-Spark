# Reproducible builds and setup

## First manual instruction

**Open `target/release/GuiltySpark.exe`.** Stop there and inspect the detected runtime/library state before continuing manual setup. The interactive assistant should provide the next instruction only after the owner reports the result.

## Build prerequisites

Windows: stable Rust MSVC, Visual Studio C++ build tools/Windows SDK, WebView2 and Node 22.12+; tested with Node 24 and Rust 1.99.1. Other platforms require [Tauri’s native dependencies](https://v2.tauri.app/start/prerequisites/). Use the committed Cargo and pnpm lockfiles.

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm test
cargo test -p spark-core
pnpm build
pnpm package
```

To use the workspace-local Rust installation rather than changing PATH:

```powershell
node scripts/bootstrap-rust.mjs
node scripts/cargo.mjs test -p spark-core
node scripts/desktop.mjs build
```

The bootstrap does not install global packages or require administrator privileges. Node/pnpm and the system C++/WebView dependencies must be available. For development use `pnpm desktop`; `pnpm dev` alone is a browser preview with native services explicitly unavailable.

## Artifacts

- Windows portable executable: `target/release/GuiltySpark.exe`.
- Windows per-user NSIS installer: `target/release/bundle/nsis/`.
- Production frontend assets: `dist/`, embedded by Tauri.
- `Cargo.lock` and `pnpm-lock.yaml`: reproducible dependency resolution.

Unsigned development builds are produced. No certificates, publishing, auto-update service or uploads are configured.

Historical Phase 1 artifacts built and launched on 2026-10-25 (superseded by Phase 2 below):

| Artifact                                   | Bytes      | SHA-256                                                            |
| ------------------------------------------ | ---------- | ------------------------------------------------------------------ |
| `GuiltySpark.exe`                          | 12,773,888 | `63a1ed40e99c11f7197f3b5b4ab3d99e915386bba185706f061769d09ed37116` |
| `Project Guilty Spark_0.1.0_x64-setup.exe` | 3,393,682  | `77b0b7092a1f39124e69e15d14f9c7b2980269ff999eecc523b4f4d8b4cb5767` |

The release executable was exercised directly. Installer compilation succeeded; installing/uninstalling the NSIS package was not exercised. These hashes identify this local build, not a reproducible-binary guarantee across different compiler/SDK environments.

Phase 2 release 0.2.0, built and exercised on 2026-10-25:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `target/release/GuiltySpark.exe` | 14,032,896 | `ac9bd5265578b46690f4eba91462cdf8bd5776647d8f958bb0031cf800454d43` |
| `target/release/bundle/nsis/Project Guilty Spark_0.2.0_x64-setup.exe` | 3,692,465 | `48bfb96db2651441205b373cec24b1616b8d52874a83f8a19dc5e96591c7ecc4` |

The workspace copies were compared byte-for-byte with the C: build outputs. The previous executable remains as `target/release/GuiltySpark-0.1.0.exe`. The 0.2.0 installer was built but not installed. macOS/Linux packages were not built on this Windows host. Machine-readable hashes are in [build-artifacts-0.2.0.json](fixtures/build-artifacts-0.2.0.json).

## Runtime dependencies

The normal data root comes from Tauri’s per-user application data location. `GUILTY_SPARK_DATA_DIR` is an optional explicit override for isolated tests. Its `Inbox` works independently of Steam. MCC startup discovery is read-only. Only an explicit initialization/deployment action can create the owned `halo1/GuiltySpark` subtree. Existing unknown ownership causes a diagnostic.

Settings accepts a separate Invader directory, default resource directory, optional Steam/MCC overrides and an exact-scenario Excession metadata template. Build & Playtest can choose and hash resources for an individual project. Runtimes & friends registers separately installed native executables and data roots; the old untyped executable preference is no longer executed. Applying preferences rechecks detection and Inbox watching without creating game folders.

The optional `node scripts/install-invader.mjs` is a development helper that installs the researched upstream release under `.local/tools/invader`. It is not part of the release bundle. The app itself does not download executables or game assets. `invader-info`, `invader-extract` and `invader-build` are invoked directly with argument arrays and no shell.

An Excession template must be an unpublished Halo1 mod package with metadata for the exact scenario path indexed from the source. The UI reports this path. The appropriate original resource data must be available; resources from a different runtime family are not assumed interchangeable.

## Developer QA

Phase 2 adds `qa_corpus`, `qa_zip` and `audio_probe` examples. The corpus runner takes the owner-supplied folder and a fresh output folder, optionally an Invader folder; it tests every scenario file without redistributing content. `qa_zip` generates a clearly labelled local fixture from the supplied Demo/UI/resource files. It is not a historical ZIP. `scripts/recovery-audio-experiment.mjs` is a separate opt-in diagnostic experiment, not the default build pipeline; see its evidence report.

On this machine D: had insufficient free space for another Rust target, so Phase 2 used `$env:CARGO_TARGET_DIR="$env:TEMP/GuiltySpark-phase2/target"`. All large QA libraries, extracted tags and generated archives use the same temporary-drive root. The final runnable artifacts are also copied into the usual workspace `target/release` paths. No game assets are included.

`qa_workspace`, `qa_build`, `qa_validate` and `inspect` are Cargo examples. They require explicitly supplied local data and must not be used to claim the flagship acceptance passed. QA records stay under ignored `.local/` folders; restoration extraction jobs can use an explicit temporary root on a drive with enough space.

`scripts/start-qa.mjs` opens the debug executable with an isolated data directory and local WebView debugging on port 9223. `--release` selects the release executable; `--default-data` explicitly uses the normal per-user library. `scripts/smoke-ui.mjs` exercises the installed `a10` fixture; the restoration scripts require the owner-supplied archive and record actual native results. `verify-restoration-desktop.mjs --resume` reuses saved native build receipts after an interrupted UI check. Debugging is enabled only by this QA launch environment, not by normal release startup. Close the recorded QA process when finished.

CI is configured for Windows, Apple Silicon macOS and Linux. Only Windows was built and run in this session; CI results must be observed before claiming other-platform verification.
