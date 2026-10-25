# Runtime compatibility and evidence

Updated 2026-10-25. Adapter schema/version: **1**. Runtime discovery, registration inspection and inventory are read-only. They do not execute a game, probe command-line version flags, deploy content or alter Steam state.

## Capability model

Each capability exposes `status` (`supported`, `unsupported`, `unknown`), its `evidence` source, `testStatus` (`pass`, `fail`, `blocked`, `untested`), explanatory detail and source references. Installation metadata is separate from capability evidence. A native AI feature can be supported in audited upstream source while remaining untested locally. No adapter report claims successful gameplay or two-computer synchronization.

| Profile | Integration in Guilty Spark | Family/layout evidence | Runtime proof |
| --- | --- | --- | --- |
| Steam MCC/Halo1 | Existing Steam discovery plus installed build-ID inspection and read-only map/resource inventory | MCC 13; official local package workflow; no direct-map CLI claim | Package enumeration, Zombie gameplay and two-player co-op untested |
| ChupathingyCE | Explicit user registration, executable-format/hash inspection, map/resource inventory, generic launch plan | Xbox `maps`, CE `maps_ce`, retail `maps_pc`, HaloMD `maps_md`; documented legacy search locations | No registered native game launched or played by this work |
| OpenCE | Same read-only registration/inventory boundary, separate profile and generic launch plan | Xbox `maps`, CE `custom_maps`; macOS launch not established | No registered native game launched or played by this work |
| Halo PC Retail | Explicit Windows registration and `maps` inventory | Version 7 cannot identify retail/Mac/HaloMD provenance by itself | External launch and restored-map gameplay untested |
| Halo Custom Edition | Explicit Windows registration and `maps` inventory | CE 609 and appropriate original shared resources | External launch and restored-map gameplay untested |
| Mac Retail, Mac Demo, PC Trial, HaloMD, Xbox | Preservation/inspection descriptors | Original cache family retained; no header rewriting to claim conversion | No executable adapter or launch claim |

Map inventory records relative paths, actual header versions, SHA256 values and diagnostics. Malformed maps remain visible as invalid entries. Shared `bitmaps.map`, `sounds.map` and `loc.map` are hashed separately and are not mistaken for scenario maps. Inventory validates the header only; its `valid` flag does not mean all tags/resources are valid or that the map is playable. Version 7 remains `pcMacHaloMd` even when discovered in a folder named `maps_md` or `maps_pc`.

## Registration and launch boundaries

`HaloRuntimeAdapter` provides versioned descriptors, registration inspection, inventory and launch-plan preparation. A registration declares runtime kind, installation root, executable, optional data root and optional build/network version. Runtime kind and manually entered versions remain **user-declared**. An executable header/hash is file evidence, not proof of product identity or compatibility. Scripts, missing files, linked paths, executables outside the selected installation root and preservation-only registrations are rejected.

The data root is explicit or defaults to the installation root. Configured `config.toml` overrides are not automatically interpreted; choose the correct data root when needed. ChupathingyCE's documented macOS data root is `~/Library/Application Support/ChupathingyCE/`. A macOS OpenCE source claim is not promoted into an available launch capability.

Native launch preparation returns the registered executable, its parent as working directory, and **no arguments**. It does not deploy or select a map and does not execute the plan. The desktop's separate explicit launch action is responsible for invoking a user-installed executable. No archived game EXE/DLL was run during QA. Runtime startup/hosting can perform its own migration, sharing or telemetry; those behaviors are not part of read-only discovery.

MCC uses its existing normal Steam launch workflow and official manual anti-cheat-disabled selection. On non-Windows systems, Steam data alone no longer implies an installed launcher: discovery must locate an actual launcher file. Halo1 editing-kit discovery recognizes `HCEEK` and title-specific names without accepting Halo2/3 editing kits merely because their folders contain Halo and editing.

## Friends manifest boundary

The versioned peer manifest permits only runtime/platform/build/network identifiers, mode, map/cache identity, fixed shared-resource names and hashes, source/package/toolchain identifiers and explicit validation declarations. Unknown fields are rejected, including nested private fields. Paths, account names, addresses and arbitrary notes are absent. The JSON size is capped at 64 KiB; version strings and hashes are validated.

Comparison rejects mismatched map/resource evidence and blocks unknown required versions, resources, validation or unsupported platform combinations. Mixed native runtime pairs remain blocked pending an exact tested compatibility rule. Native executable hashes can differ across platforms; on the same platform a declared same-build binary mismatch fails comparison. Build/EAC/resource booleans from imported manifests are self-reported.

A passing report says **Manifests agree**, has scope `manifestComparisonOnly`, and retains `gameplayVerified: false`. It sends no network traffic and does not inspect either running game. See [MULTIPLAYER_TEST_PLAN.md](MULTIPLAYER_TEST_PLAN.md) for the actual two-computer acceptance evidence.

## Validation and remaining work

ZIP import is a separate preservation operation. It validates classic ZIP end/central/local records before allocating library entries, caps archive/member/metadata/selected sizes, rejects links, encryption, ZIP64, multidisk files, overlapping regions and unsafe/colliding paths, and checks streamed content CRCs. It preserves the complete original ZIP and hash in a fresh owned archive directory with a receipt, then imports supported map candidates and adjacent resources. EXE/DLL/script entries are inventoried but never extracted or run; nested archives are not recursively unpacked. Malformed map members are retained with diagnostics while other valid candidates remain available. Archived metadata/source preservation does not establish game compatibility.

Focused synthetic tests cover registration/path restrictions, read-only inventory and launch-plan preparation, preservation descriptors, ambiguous version-7 identity, MCC inventory, HCEEK discovery, privacy allowlisting, malformed manifests, content/version mismatches, absent validation, platform differences and separation of manifest agreement from gameplay proof. These tests verify application behavior only.

Automatic native installation identity/version detection, native deployment, direct-map launch, a connected live-edit transport, arbitrary MCC multiplayer AI and VR remain unimplemented or unverified. No copyrighted engine source or native binary is included. Exact upstream revisions, primary links, licensing constraints and the MCC campaign/multiplayer distinction are recorded in [MCC_MULTIPLAYER_AI_FEASIBILITY.md](MCC_MULTIPLAYER_AI_FEASIBILITY.md).
