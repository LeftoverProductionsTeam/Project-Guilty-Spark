# Applicable dependency guidance — C34

The on-demand guide uses the selected runtime, actual native Steam discovery, remembered settings, saved per-map build target and source identities. It distinguishes the game installation, compatible editing kit, tool CPU architecture, Invader files, exact source resources, editable tags and authored model/animation sources. It does not restart onboarding or install anything on boot.

Implementation: [`dependencies.rs`](../../crates/spark-core/src/dependencies.rs), [`dependency_install.rs`](../../src-tauri/src/dependency_install.rs), [`dependencyGuide.ts`](../../src/dependencyGuide.ts) and [`DependencyPanel.tsx`](../../src/components/DependencyPanel.tsx). Open **Settings → Dependencies & setup**, choose the target Halo runtime, then refresh checks or select the applicable setup action. Runtime setup navigation opens this tab. It uses the existing native folder pickers/preferences, not a second project/settings database.

## Checked observations and actions

| Dependency | Native observation | Offered action / limit |
|---|---|---|
| MCC / Halo1 | Fresh Steam discovery of actual game content | Choose the installed Halo folder; game files do not imply the editing kit or live adapter is ready |
| Steam | Actual discovered Steam.exe, bounded PE header, architecture and SHA-256 | Choose the existing Steam folder; a file hash is identity, not verified publisher authenticity |
| H1A editing kit | Matching discovered Steam app1532190 folder and all four required tool PE headers; selected Tool hash/architecture recorded | Missing kit plus actual Windows Steam route offers a reviewed fixed `steam://install/1532190`. Otherwise choose installed kit / official guide. No silent install/repair or SDK program execution |
| Invader | Actual selected info/edit/extract file headers; info identity recorded without running it | Open SnowyMouse's official releases page or choose separately installed files. Source/version approval and operation preflight remain unverified; Spark does not download or execute an unverified binary |
| Imported map resources | Actual source generation, selected folder and missing recorded classic resource names | Exact per-map resource picker/pinning; MCC v13 may use embedded data or matching MCC packs and is not declared missing merely for lacking classic bitmaps.map. The guide does not repeatedly rehash resource packs |
| Editable tags | Selected matching globals tag/header and active runtime/profile | Choose tags root / official setup guide. A valid globals header does not prove dependency completeness or tool generation. A different active runtime blocks per-map tool reassignment |
| Model / animation sources | Actual existence of authored asset paths, original animation and prepared data paths, and authored native sword/dual-weapon requests | Open Asset/Machinima setup. Real skeleton/first-person/paired weapon graphs and engine contracts are still needed; toolkit installation is not a replacement for missing player assets or an unimplemented engine adapter |
| Community base data | The selected runtime's actual independent content requirements remain explicit | Pinned upstream setup guide plus Play & servers content preflight. MCC ownership/inspection does not imply Xbox-base startup data or matching classic CE resources |
| WebView2 | Current native Windows webview is active | Official Microsoft runtime guide for startup problems; no second installer is guessed from the x86 Halo tools or x64 game |

No Visual C++ or DirectX package is prescribed without a proven missing dependency. The current detailed executable checks target Windows PE files; non-Windows package/native ABI acceptance remains independent.

## Concrete reviewed handoff

`prepare_dependency_action` accepts a fixed action ID, runtime and optional owned project. It does not accept an arbitrary URL, app ID, executable or arguments. It records the actual discovered Steam.exe or absolute Windows Explorer launch file, SHA-256, PE architecture and exact one-argument URI/HTTPS page. The one-use ticket is bound to the current native window, current saved project fingerprint and settings; it expires after 90 seconds.

The inline preview shows the exact URI, executable, hash and architecture. A separate explicit review checkbox and action button are required. After slow probes, ticket insertion checks that its actual native window still exists while holding the same mutex used by closing-window cleanup; a late result cannot leave a retained preview for a destroyed window. Cleanup removes only that window's tickets. `run_dependency_action` checks window ownership before consuming a ticket, requires confirmation, rechecks expiry/settings/project/applicability, re-discovers the launch path and hashes the file again. Unknown targets, extra arguments, internal picker actions, stale tickets or changed files reject before opening anything. Steam handles any login/download/install after its UI opens. Browser actions open only the fixed authoritative page. Results remain `handedOffUnobserved`; neither installation nor successful use is fabricated.

No dependency action downloads or runs an installer, archived executable, Invader tool or SDK program. This path does not bypass a rejected unknown-binary execution. Folder choices inspect files without executing them. Existing build actions retain their separate verified-tool/owned-source preflight.

## Preserve authored map work

The native picker loads/saves the actual owned project, checks the current window again after a dialog or resource inspection, and rejects saved changes made while selection was open. Classic resource selection freshly inspects and pins a preserved source; MCC uses its existing exact resource connector.

The frontend copies only the intended dependency path or source-resource pins from the native saved result into the latest authored document. It preserves unsaved scene objects, tag edits, assets, histories, builds, title and unrelated tool/profile fields. The Settings callback records this narrow update in the selected map's edit history, retaining its current place and undo workflow. Different map/source/active profile or conflicting authored resource/tool choices reject the merge instead of replacing the current work. A tool choice does not replace its current source inspection with null. Map/runtime switches invalidate report/results and discard prepared external-action tickets.

## Verification and remaining acceptance

- Core planner: four focused tests passed. Missing/applicable Windows MCC kit + actual Steam is required for the fixed install offer; community/non-Windows targets do not inherit it; arbitrary action/URL/command IDs reject; source/tag/assets states remain independent.
- Native child: four focused tests passed, covering read-only synthetic PE x86/x64/hash separation and malformed/unsupported header rejection; review rejects wrong window, expiry, changed settings/project/hash/ABI, altered URI, extra arguments and internal actions. The closing-window regression checks owner-only ticket cleanup, peer preservation and refusal of a late preview once its window is gone.
- Frontend: three focused tests passed, preserving unsaved authored work and unrelated per-map fields, rejecting stale source/resource/tool/profile choices, and rejecting reports for another map/runtime. TypeScript passed.

Commands:

```powershell
node scripts/cargo.mjs test -p spark-core dependencies::tests --lib -- --nocapture
node scripts/cargo.mjs test -p guilty-spark dependency_install --bin GuiltySpark -- --nocapture
node node_modules/vitest/vitest.mjs run src/dependencyGuide.test.ts
node node_modules/typescript/bin/tsc -b --pretty false
```

No actual Steam/browser handoff, installer/download or native guide/picker UX acceptance ran in these focused tests. Parent native UI QA and any owner-reviewed installation remain separate evidence. A current active WebView does not test startup recovery on a machine missing it. Tool and game tests still perform exact independent preflight afterward.

The final parent [native desktop receipt](../fixtures/continuation34-native-ui-verification.json) separately confirms the real Settings guide, native installed-file observations and exact official-page preview/hash. Unconfirmed native handoff was refused. The whole-app install-review/cancel contract and draft-preservation tests passed. No installer, Steam UI or browser was actually launched, and native folder-picker/installation success remains unaccepted. This machine already has the MCC editing kit; the missing-kit offer was tested with explicit synthetic observations.

Primary references checked 2026-10-28: [Microsoft's official MCC tools overview](https://learn.microsoft.com/en-us/halo-master-chief-collection/general/overview-tools), [SnowyMouse Invader releases](https://github.com/SnowyMouse/invader/releases), [Microsoft WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/), [c20 source-resource formats](https://c20.reclaimers.net/h1/maps/), [c20 model animations](https://c20.reclaimers.net/h1/tags/model_animations/) and [pinned Chupathingy content setup](https://github.com/ChupathingyCE/chupathingyce/blob/c5a07c69589ab8d40180fc99eac993bc06b06ebb/README.md). Microsoft identifies the Steam Tools filter, actual tool purposes and separate tag/source extraction; it does not guarantee all third-party operations or multiplayer acceptance.
