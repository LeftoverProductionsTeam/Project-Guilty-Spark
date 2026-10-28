# Contributing to Project Guilty Spark

Start with [Getting Started](docs/GETTING_STARTED.md), [Windows builds](docs/BUILD_WINDOWS.md), and the [feature ledger](docs/MASTER_FEATURE_LEDGER.md). Small improvements to explanations, keyboard usability, synthetic fixtures and historical attribution are welcome.

1. Open an issue describing the concrete problem, Halo edition, source generation and expected behavior. Use synthetic or legally shareable examples.
2. Branch from the current default branch. Preserve existing work and original game files. Keep changes focused and record any unimplemented part honestly.
3. Run the relevant checks in [TESTING](docs/TESTING.md). For native changes, include an actual desktop test. Source contracts do not prove game behavior.
4. Open a pull request using the template. Include changes, verification, limitations and attribution. Do not merge a founder-review change before approval.

Do not commit game maps, bitmap/audio exports, HEK/MCC tags or binaries, tool executables, decompiled game code, license keys, credentials, user paths or private logs. See [asset policy](docs/ASSET_AND_COPYRIGHT_POLICY.md). New parser tests should use constructed bytes and test truncation, wrong identities and bounds as well as success.

Original contributions use the repository's MIT license. Retain third-party copyright and license notices; identify documentation adaptations separately. Do not copy code from an unlicensed or incompatible project because it is publicly visible. Contributions are reviewed; no CLA or automatic acceptance is implied.

Good first contributions: clarify one setup field; improve a keyboard focus path; add a bounded synthetic parser fixture; verify one source in community credits; reproduce a compatibility problem without uploading its map.
