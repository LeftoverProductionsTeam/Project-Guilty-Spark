# C34 — runtime integration and creator workflows

This internal development continuation extends `fc198e302933fff5bab72f3e53538634bac270f3` on `codex/continuation-34-runtime-integration`. It preserves the existing restoration work, C32/C33 features and frozen artifacts. It is not a public release or a completed all-runtime engine implementation. No push or merge is included; the owner requested the push handoff.

## Delivered behavior

| Workflow | Implemented path | Evidence and limits |
|---|---|---|
| Dependencies | Settings → Dependencies & setup; target-specific checks, remembered folder selection, missing data/assets explanations, reviewed Steam H1A install/page handoff | Core planner 4, native review/lifecycle 4 and frontend merge/context 3 focused tests. No installer runs automatically. Actual installation is separate. [Details](research/C34_DEPENDENCIES.md). |
| Runtime & Tools Dock | Per-map runtime, nine actions, derived Sapien/Guerilla/Standalone paths, exact tool architecture/hash, expiring owner-window review, child-process observation | Installed H1A tools are x86, distinct from the x64 MCC game. File identity, process start, compiler output and game success are separate. Non-H1A source-aware tool launches retain setup gates. |
| Working tag edits | Build the current derived tags in a fresh isolated job; retain script sources, source hashes, parent provenance and output validation | Actual H1A compilation read back a player start changed from X −8 to −7.5; v13/type1, 2,239 tags, CRC/protection/stub checks passed. Original 11,544 tags unchanged. [Receipt and procedure](research/C34_WORKING_TAGS.md). |
| External editor saves | Metadata checks every two seconds; stable bounded reinspection; new preserved revision; clean refresh or separate conflict tab | Core monitor 8, frontend controller 10 and reducer/view-session 4 tests; whole-app clean/conflict regressions. Camera/tag context is carried by safe identity mapping. Loose SDK tags require recompilation. [Details](research/C34_EXTERNAL_MAP_SYNC.md). |
| In-app maps | Direct HTTPS `.map`/`.zip`, progress, cancellation, original download/hash receipt, existing map/archive import, all imported map tabs and editor/conversion routing | Eight native HTTP/filesystem tests plus widget and whole-app IPC tests. 768 MiB cap, public-address admission per redirect, no executable install/launch, no overwrite publication. Conversion remains source/runtime-specific. [Details](research/C34_MAP_DOWNLOADS.md). |
| Visibility zones | Editable tunnel portal intervals/3D handles and explicitly editor-only bounds, per-map save/undo | Real Tool comparison: 0→2 portals, 1→3 clusters, PVS 4→12 bytes and no Tool warnings in the authored room fixture. This is one resident BSP, not region streaming or live replacement. [Details](research/C34_VISIBILITY_ZONES.md). |
| Play & servers | Real Delta List read, All/OpenCE/Chupathingy/web-advertised filters, native content/protocol preflight, pinned expiring invitation handoff | Actual HTTPS provider parse retained 47 advertisements with no rejected rows in the focused test. Unknown advertisements stay unknown; no game connection acknowledgement or MCC list enumeration is invented. [Research](research/C34_COMMUNITY_PROTOCOLS.md). |
| Join by invitation | Strict community hex token, MCC Steam app976730 lobby, fixed-origin official OpenCE web links; explicit route review | Core parser/routing tests and whole-app missing-MCC-bridge test. Native community executable, data root and OpenCE custom-map root are pinned/rechecked. Handing off a URI is not joining or translating gameplay. |
| Host adapter | Typed private host/playlist saving; distinct 128-MP/eight-campaign/eight-Firefight gates; authenticated loopback Delta Control status | Eight core and ten native loopback/ownership/HTTP tests. Tokens remain ephemeral sensitive headers. No global state mutex spans HTTP; late/disconnected observations cannot resurrect sessions. Mutations and native host lifecycle lack owned-process/config acceptance and remain disabled. [Details](research/C34_HOST_ADAPTER.md). |
| Owned MCC content | Bounded read-only inventory of installed Halo1 caches/resources; distinguish inspect/convert/start/join requirements | Actual probe: 203 inventoried files, 30 valid v13 cache indexes, 2,667,446 bytes read. MCC ownership does not supply every Xbox/CE startup asset or another runtime's protocol. [Details](research/C34_MCC_CONTENT.md). |
| Native controller performance | Two-phase idle/ticket checks avoid unnecessary transport and EditLock work when sprint/camera controllers are inactive | Source regressions preserve exact-build/generation guards. Existing normal write suspension, resume/error handling and recovery risks are retained in [the live-write audit](research/C34_LIVE_WRITE_AUDIT.md); no engine-owned write boundary is claimed. |
| Dual-wield preparation | Fresh namespaced two-trigger/two-magazine authoring transaction with original tag/asset hashes, graph/model requirements and rollback | Ten source transaction tests. Actual paired assets, MCC input/reload/presentation/HUD/inventory and game-peer acceptance are missing. This is not completed native dual wield. [Details](research/C34_DUAL_WIELD_ENGINE.md). |

## Windows CI regression

The supplied failing log is from master run `40775839532`, Windows native build/UI job `123124783476`, step `cargo test --workspace --locked`. Compilation succeeded. Two `mcc_steam` tests failed when `manifest_contains` could not recognize a just-registered canonical Windows root; the UTF-16 manifest test hit the same defect.

Registration stripped a Win32 verbatim prefix while lookup retained it. Shared spelling now normalizes DOS and UNC paths for both operations without corrupting UNC roots. UTF-8/UTF-16 preservation, backups, idempotence and locking stay checked. The failing spelling was reproduced before repair; all 16 local `mcc_steam` tests pass. A fresh GitHub-hosted run is still pending the owner's push. No test/workflow was disabled and archive trimming was not blamed for the actual failure.

## Current verification

- `node scripts/cargo.mjs test --workspace --locked`: **393 passed, five explicit opt-in tests ignored**, 31 result groups. The ignored tests require owned game files/native compiler or a real provider/session; their focused evidence is listed independently.
- `node node_modules/vitest/vitest.mjs run`: **128 passed**, 27 files.
- `node node_modules/@playwright/test/cli.js test --reporter=line`: **47 passed**. Synthetic IPC results exercise UI/state contracts; they are not native game receipts. The shared-listing regression reads another window's pending refresh result without launching another HTTPS request.
- All **59 offline checks** passed. TypeScript and desktop Vite/Rust/NSIS builds passed. Vite retains a main-chunk size warning; this pass does not claim a measured startup improvement.
- Actual H1A working-tag and authored visibility-zone compiler results are retained in the linked records. Those operations used fresh private derived copies. No current C34 game/Standalone session was launched or mutated by the verification above.

The final native desktop harness passed against a freshly seeded private library and the actual release executable. [Metadata-only native UI receipt](fixtures/continuation34-native-ui-verification.json) records the exact executable SHA and limits:

- All nine dock actions were visible. Three real x86 H1A tool previews matched the installed file hashes, used this map's derived tags and rejected unconfirmed execution.
- Settings displayed actual dependency observations and an official-page preview; the native review refused unconfirmed handoff. No Steam, browser, installer or SDK tool was launched. The missing/conflicting dependency and install/cancel flows also passed whole-app IPC tests; an actual missing-tool machine and folder-picker/install outcome still need separate acceptance.
- A real provider refresh returned **51 rows / zero rejected** in the final run. Another run returned 55 / one rejected malformed row; advertisements are volatile. The wrong-MCC-runtime preflight and foreign MCC invitation stayed blocked, and returned data contained no raw invitation URI.
- The UI displayed the actual owned content probe: **203 files / 30 valid v13 indexes**.
- An 88,869,842-byte working map was copied into a private QA output, imported normally and edited at one audited f32 offset. The desktop monitor automatically created/opened a new revision and its inspection read back the changed value. The old preserved cache retained SHA `85d2390bdeced18f8f7617b751ddcbf42555ab4533aa8a993ebb0dcd28f9095b`; the new cache is `85a30bd8a1eca633df1f68eae1743bf6dce76a41ba03ff1996f50c91128fa4de`. The real game, original build job, SDK master and user's application library were not modified.

The final exe/NSIS build includes the shared-listing follow-up and native scenario spelling repair. Vite's chunk-size warning remains. Private screenshots, owned map/tag bytes, provider payloads and logs stay under `.local/`; they are excluded from source packaging.

## Frozen local development artifacts

These are distinct C34 internal development files under `releases/`; C33 files remain untouched. They have not been uploaded or installed for the user.

| File | SHA-256 |
|---|---|
| `GuiltySpark-C34-0.4.0-runtime-workbench-dev-r1.exe` | `3c6d00009a9e50ea0f0700fb01d0efece38a7462ce4355bf5f92593493c29bee` |
| `GuiltySpark-C34-0.4.0-runtime-workbench-dev-r1-setup.exe` | `0ef32fc93a164cc6ea0e8f14a8acd219d5832976170f74b433e720ff5f7b4628` |
| `Project_Guilty_Spark_Continuation_34_SOURCE_r1.zip` | Its separate `.sha256` and the artifact manifest record the hash; source members are independently checked against both embedded source manifests. |

The first desktop QA attempt exposed another real path regression: the working-tag compiler receipt normalized scenario separators while QuickForge supplied native backslashes. The source-aware dock correctly refused the mismatch. Its comparison now validates both paths and compares normalized identities; the new regression accepts the same scenario's two spellings, while rejecting a different scenario or traversal. The initial failed QA was retained; no receipt was fabricated and no launch guard was removed.

## Remaining engine gates

The full founder scope remains in [the cumulative feature ledger](MASTER_FEATURE_LEDGER.md) and [the exact compatibility matrix](COMPATIBILITY_MATRIX.md). No original requirement is retired by adding a descriptor or a UI button.

1. **MCC ↔ community gameplay bridge:** no MCC/OpenCE/Chupathingy/WebRTC packet, actor or session translation exists. MCC Steam invitations can be handed to Steam; foreign invitations cannot make MCC speak another engine's protocol. Same-family advertised community crossplay also needs matching version/content and actual client acceptance. The deployed official web game/version was not verified by HTML fallback responses.
2. **Dual wield and player sword/lunge:** paired player assets, independent controls/ammo/manual reload, visible/recoiling guns and HUD, inventory/melee/grenade/death rules, correct origins and two-client authority remain missing. Sprint's 1.75× default, animation speed and third-person aim offset need new gameplay acceptance; earlier owner-confirmed C33 trials are historical scoped evidence.
3. **Arbitrary live spawn and BSP replacement:** existing-object guarded edits do not allocate arbitrary engine objects, relink a BSP or replicate engine state. These operations remain unavailable until a pinned engine-owned contract and safe acknowledgement/restoration path exist.
4. **AI, campaign and Firefight:** editor source synchronization does not replicate AI or game peers. Eight-player campaign, authored survival/Firefight, mission scripts/checkpoints and region transitions need engine adapters and real clients. The pinned dedicated upstream route rejects campaign; no fake Slayer conversion is generated.
5. **128-player scale:** requested capacity, advertisements and configuration are not measured capacity. Actual private 2/8/16/32/64/128-client gates, bandwidth, frame pacing, reconnect and authority results remain open. LAN/VPN remains available; Spacewar development source transport is separate from gameplay.
6. **Rendering/audio parity and connected worlds:** real map/model/material/lightmap/fog/decals and spatial editor rehearsal exist, but complete shader/effect/LOD/audio-event/occlusion/reverb parity remains open. The four-map world has one BSP, 11 clusters/10 portals and three automated collision routes; native walkthrough, multiplayer frame pacing and audio palettes remain unaccepted. New authored tunnel zones improve real compiled PVS; independent per-player region residency is not implemented.
7. **Conversion and campaign/UI safety:** selected Yoyorast/Bigass/Zombie recovery outputs retain native cache evidence, not universal CE conversion or faithful survival gameplay. Arbitrary added scenario placements remain build-blocked. Campaign tag duplication/compiler checks do not guarantee Halo mission loading. Original sources and frozen older releases are preserved.

## Next acceptance sequence

The desktop guide and controlled private-copy external save passed native QA. Next ask the owner to try the remembered setup and one ordinary external-editor save on an owned working map. Then load one newly compiled working-tags map in its actual runtime and verify the changed spawn/collision with one practical owner test. For dual wield, supply or author real compatible paired player assets and implement one exact-build two-trigger/offhand reload contract before requesting a firing trial. For community hosting, accept one explicitly reviewed private native server and two clients before increasing scale. Research and implement an actual MCC engine/protocol bridge independently; invitation handling is not that bridge.

Automatic approval review rejected a local `invader-edit.exe --help` check as execution outside that research's trusted binary scope. It was not bypassed. Source tests continued; native paired-asset compilation and dual-wield gameplay remain unverified. This restriction is independent of the earlier separately scoped working-tags compiler acceptance.
