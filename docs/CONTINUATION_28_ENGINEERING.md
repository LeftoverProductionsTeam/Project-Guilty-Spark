# Project Guilty Spark — 07 Halo Modding Brain — Continuation 28

**Baseline:** exact `Project_Guilty_Spark_07_Halo_Modding_Brain_Continuation_27_SOURCE.zip`, SHA-256 `0af597062f9829102fe35e661bc364e11d9d449bfa7c97686e8681263c85a8bf` (verified before edits). **Output:** cumulative SOURCE ZIP, not an executable or gameplay-proven map.

## Engineering changes

1. **Optional native Legacy Companion backend** — `src-tauri/src/legacy_companions.rs` and registered Tauri commands in `src-tauri/src/app.rs`. Curated catalog: Eschaton, HMT, SwordEdit, SparkEdit, Guerilla, Sapien, Reclaimer and user-named historical utilities. Native Windows PE is the main platform. macOS `.app` bundles can be registered on a future macOS build if a single recognized candidate 64-bit or universal Mach-O can be identified. Wine at selected standard system locations on macOS/Linux is a *runtime candidate*, not an app compatibility verdict. Current Tauri packaging still targets **Windows NSIS only**.
2. **Non-invasive detection** — `legacy_companion_dashboard` surfaces host OS/architecture, recognized native/Wine runtime candidates, historical catalog opportunities, and explicit user registrations. It does NOT scan private drives for unknown old programs, download tools, invoke app installers, or claim they are installed merely because a runtime is present.
3. **Opt-in registration and launch** — separate user-picked `.exe` or `.app`; app root/archive/Inbox paths, symlinks and reparse points rejected; PE header and supported native architecture checked; recognized macOS bundle signature checked; canonicalized executable SHA-256 persisted only in local private app settings. A changed/missing/invalid or incompatible binary cannot launch. Launch is a **separate confirmed interaction** using a direct child process with no command shell, no user-supplied command line and no automatic Halo file arguments. Unregistering removes only the app setting, never the executable.
4. **Modern UI** — `src/components/LegacyCompanionTools.tsx` under the existing Modding Academy → Legacy Workflow Lab, with runtime availability, each historical app, `runtime present ≠ app installed`, registered binaries, refuse/retry states, confirmation-gated Launch and Forget. Runtimes page points users to the Lab. Existing Spark editing and build workspaces remain primary; legacy apps appear as normal separate windows.
5. **Tag Lineage Inspector** — existing bounded `src/tagLineage.ts`/`TagLineageInspector.tsx` implementation is now **mounted in the actual Tags workspace**. It walks observed class-checked cache references, shows reverse incoming uses and staged project edits, flags broken links, and exports a path-free, source-SHA-bound diagnostic. It is not an exhaustive source `.tag` resolver or binary extractor.
6. **No silent interchange truncation** — `createTagExchangeBundle` now rejects an inspected tag with more than 256 references instead of silently serializing the first 256. The existing source-hash, class/path validation and user-owned Invader extraction remain in place.
7. **UI styling and lore** — added restrained Halo-inspired dependency lens and runtime/companion cards, refreshed documentation and acceptance guidance.

## Compatibility is a candidate status, not a test result

| User-host scenario | What Spark reports | What still needs testing |
|---|---|---|
| Windows + recognized `.exe` PE machine | Possible native launch after owner registration and SHA check | Process start, required DLLs/permissions, app operation, map support |
| macOS/Linux + Wine in checked standard locations + Windows `.exe` | Wine candidate; executable and loader hashes checked separately where applicable | Wine prefix, bitness, dependencies and actual app operation |
| macOS + recognized 64-bit `.app` with one candidate binary | Possible future native macOS companion | Rosetta and architecture slices, frameworks, gatekeeper, exact app launch |
| Modern macOS + 32-bit/PowerPC-only `.app` | Refuse as unverified/incompatible | Needs a separate old macOS system/VM; Spark does not silently emulate it |
| Windows + historical Mac `.app` | Not launchable with Wine or Windows native runtime | A separately supported Mac OS environment would be necessary |
| Any host without registered binary | Historical tools *exist* in the catalog; *installation not established* | Explicit user-provided app path; no global filesystem scan |

**Legacy process caveat:** The app, once manually launched, may independently read/write files or crash. Spark prevents surprise writes by its own commands, but cannot sandbox a third-party legacy binary from the whole operating system. Use a separate copy of game content, and respect the old app's license and compatibility limits. No legacy `.exe`, `.app`, DLL, executable source, Halo map, bitmap, sound or console firmware was included in the ZIP.

## Test evidence

- Dependency-free Node offline suite includes legacy catalog state and launch gating tests, path privacy checks, a synthetic bounded Tag Lineage test (isolated `effectiveReferenceId` shim) and native source contract checks.
- `src/legacyCompanions.ts` passes TypeScript strict type-checking. Edited JSX/TS modules pass `typescript.transpileModule` syntax checks.
- **NOT RUN:** `cargo test`, `cargo check`, Tauri Windows GUI build, native process launch, Wine app execution, old Mac `.app`, actual Halo Tool structure, Halo game boot, Zombie Apocalypse/First Contact multiplayer/co-op testing. A static Rust contract check is **not** a successful Rust compile.

## Known limitations and next critical milestone

- Runtime discovery checks standard Wine install paths only, not arbitrary user prefixes or arbitrary virtual machines.
- macOS bundle detection conservatively refuses multiple candidate executables; it is not a full `Info.plist` or universal-architecture validator.
- Legacy tool compatibility remains unproven until user testing. Old direct-cache editors can create corrupt maps; rebuild-based source workflows remain preferred.
- Exported Tag Lineage may omit unsupported references or external tag bodies; it does not establish complete tag closure.
- **Critical:** compile and load the original five-mode Test Arena on a real Halo CE/H1A development installation with verified BSP, collision/portals, materials, gameplay modes and two-client tests. Arbitrary imported BSP source recovery, Boolean room/tunnel cuts, collision tree regeneration, full materials, AI sync and modern Halo menu sprites remain major engineering projects.
