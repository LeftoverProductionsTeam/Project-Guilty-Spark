# Continuation 28 — separate-device acceptance card

## Source/offline validation in the package environment

- [x] C27 baseline exact SHA-256 and ZIP extraction verified.
- [x] Offline Node regression suite, including native/API static contract, candidate-status gating, Tag Lineage read-only audit and over-limit tag-reference refusal.
- [x] Strict type-check of the new standalone TypeScript companion status module; JSX syntax checks.
- [x] Source ZIP manifest, byte comparison and packaged test rerun. See release verification log.

## Native application tests — NOT RUN / do not mark passed

- [ ] Build `cargo check` and `cargo test` with a supported Rust/Tauri 2 toolchain on Windows (CI recommended).
- [ ] Compile and launch the Windows desktop app; open Modding Academy, verify runtime candidates reflect the actual OS.
- [ ] Register a harmless owner-approved `.exe` by user selection. Confirm no executable is launched during registration and no original Halo map changes.
- [ ] Inspect the binary's SHA state; replace the selected executable in a controlled disposable test folder and verify launch is **refused** until re-registration.
- [ ] Confirm direct launch requires the separate user confirmation. Test cancellation, missing executable, invalid 16-bit PE, changed binary, wrong architecture, symlink and managed Inbox rejection.
- [ ] Test on Windows with an actual previously installed HMT/SparkEdit/Guerilla/Sapien where rights and build/runtime compatibility are known. Do **not** test against original stock game files; use copies.
- [ ] Future macOS build: test a valid 64-bit `.app` with real plist/architecture checks; verify 32-bit/PPC refusal. Current project packaging is Windows-only.
- [ ] Future Wine host: test a known-compatible, harmless Windows program first; Wine presence is not proof of old Halo app compatibility.
- [ ] Open a user-owned Halo cache, browse tags, follow Tag Lineage references and incoming uses, stage a reference edit, export report. Verify no game asset payload or private tag path leaks.
- [ ] Compile a real original Test Arena; inspect Tool/WRL, render and collision, then test all five multiplayer modes and two-client sessions. No source-only test is sufficient.

## Safe usage expectations

The legacy app is a separate process, not a sandbox. It may alter game files it opens and may be unsigned or obsolete. Start only with user-owned known-good executables and throwaway copies of Halo assets. Do not run historical mod archives as downloaded unless independently verified. Removing the registration must never delete the binary.
