# Release candidates and public downloads

Use [GitHub Releases](https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/releases) for public application downloads. Actions artifacts are temporary build outputs; they do not appear as Release assets automatically. Existing `alpha` and `Preview` history must remain unchanged.

The manually triggered workflow is [`.github/workflows/release.yml`](../.github/workflows/release.yml), **Release candidate (build or draft)**. Normal CI remains unchanged. There is no required PR, direct-master restriction, force push or repository ruleset modification in this workflow.

## Owner procedure

1. Commit and push the reviewed local master normally. Select an **exact full pushed commit** containing the release scripts; it must be an ancestor of remote master. Packaging refuses an uncommitted source tree or inconsistent frontend/Cargo/Tauri/lock versions.
2. Open Actions → Release candidate (build or draft) → Run workflow. Supply the full source commit and a **new** preview number. Leave **Prepare draft** off for a build-only trial. Linux is optional and defaults off.
3. After the build-only run passes, rerun with **Prepare draft** on and an unused preview number. The Windows job always runs its gates again. If Linux was requested and fails, its job remains visibly failed; the verified Windows draft can still proceed without Linux assets.
4. Inspect the private draft linked from the workflow summary. The publication job uploads actual Release assets, downloads every attached asset again through the authenticated GitHub API and checks its size/SHA-256. The manifest identifies the exact version, source commit/tree, workflow run and acceptance receipts. A successful upload alone is insufficient.
5. Review the notes and actual downloads. **Publish the draft yourself only after approval.** No workflow or script here publishes a release, edits an existing release/tag, replaces an asset or changes repository rules. If GitHub refuses a tag or permission, retain its actual error and resolve it through the normal owner process.
6. After publication, confirm an anonymous visitor can download the installer:

```powershell
node scripts/release/verify-public.mjs v0.4.1-preview.1 FULL_SOURCE_COMMIT .local/public-download-receipt.json
```

This read-only check refuses a draft, missing Windows installer/portable package, wrong commit, mismatched hashes or unverified extra assets. Public distribution is complete only when this succeeds against an approved public release. Draft downloads require repository write access and are not yet public distribution.

## Windows acceptance

The official pinned Tauri action builds an actual x64 application and NSIS installer. The NSIS bootstrap executable can itself be x86; its installed application must be the exact x64 executable that passed startup. NSIS installation runs in a fresh owned test directory and refuses to overwrite an existing Spark installation or shortcut.

The release ZIP contains only `GuiltySpark.exe`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `README.txt` and `BUILD_INFO.json`. The frontend is embedded in the application. The packager refuses new configured sidecars/resources until their explicit portable handling is added, rather than silently shipping incomplete files. The portable ZIP does not install WebView2. The NSIS package's standard WebView2 dependency route remains disclosed; the application does not include Halo/Steamworks/tool SDK content.

Required acceptance: the real extracted portable app starts with a fresh library and returns native bootstrap/version responses; its embedded frontend bytes match the build. The actual NSIS package installs, the installed executable hash matches, and that installed app also starts. A local installation test is distinguished from a fresh hosted runner or independently tested end-user machine.

The test gate runs the complete Rust workspace with `--locked`, TypeScript, frontend tests, all offline checks, browser regressions (including focused cross-project Ctrl+S), diagnostic tests and release-pipeline tests. Release browser checks start their own strict loopback server on a free port; they never reuse another checkout's running preview. Browser screenshots stay inside that run's fresh evidence directory, so a test cannot overwrite historical continuation images. Native Halo/compiler tests requiring privately owned data retain their separate evidence and are not simulated by generic hosted runners.

Public candidate names:

```text
Project_Guilty_Spark_0.4.1_windows_x64_Setup.exe
Project_Guilty_Spark_0.4.1_windows_x64_Portable.zip
Project_Guilty_Spark_0.4.1_windows_x64_manifest.json
Project_Guilty_Spark_0.4.1_COMMITPREFIX_Source.zip
SHA256SUMS-windows-x64.txt
```

The source archive is generated from committed Git blobs, checks its archive identity/CRC and rejects private/generated directories, native game payloads, executable tools and credential filenames. Native test libraries, archives of owned test data and local secrets never enter this public asset list.

## Linux acceptance and limits

Linux uses Ubuntu 22.04 x64, WebKitGTK 4.1, GTK/AppIndicator, OpenSSL and the standard Tauri packaging dependencies. The AppImage includes the media framework; Debian declares its package dependencies. The build host sets the minimum glibc baseline (2.35 for this runner).

The packager requires genuine x64 ELF/type-2 AppImage headers and a valid Debian archive with an amd64 control record and the exact application payload. It launches the actual AppImage using its extraction/run mode where FUSE is unavailable, and independently launches the Debian executable extracted by `dpkg-deb`. Both use a real Tauri driver, native IPC and visible frontend under Xvfb. No sandbox disabling or renamed Windows binaries are used. Native Linux compilation/startup is **pending until this runner actually passes**; local Windows validation cannot establish it.

Editor startup is not Halo gameplay acceptance. MCC/CE/OpenCE/Chupathingy process hooks, Windows PE tool discovery/browser handoffs, Steam bridge, hosting and proprietary editing-kit execution remain Windows-specific or independently unverified on Linux. No Wine/Proton offsets are guessed. Existing explicit unsupported routes remain visible. Linux failure does not block a verified Windows preview.

## Local packaging

Use Python 3.11+ and the existing locked Node/Rust toolchains. From a clean committed source checkout:

```powershell
node scripts/release/gates.mjs FULL_COMMIT .local/release-gates
node scripts/desktop.mjs build --bundles nsis -- --locked
python -B scripts/release/package.py stage --commit FULL_COMMIT --preview 1 --platform windows-x64 --output releases/windows-x64
```

Then follow the workflow's extraction, native startup and NSIS installation steps. Only after their exact receipts pass does `package.py seal` create a verified manifest and checksums. `package.py verify` checks the complete final directory. `candidate.json` alone is explicitly unaccepted staging metadata.

Authenticated draft preparation uses `GITHUB_TOKEN` only in the upload job with `contents: write`; build/test jobs have `contents: read`. No token is embedded or printed. Local owners can attach a sealed candidate through GitHub's draft-release UI if automation access is unavailable. Never upload a whole `.local` or `target` directory.

Implementation references: [official Tauri action](https://github.com/tauri-apps/tauri-action), [Tauri distribution](https://v2.tauri.app/distribute/pipelines/github/), [native WebDriver CI](https://v2.tauri.app/develop/tests/webdriver/ci/), [GitHub Releases API](https://docs.github.com/en/rest/releases/releases).
