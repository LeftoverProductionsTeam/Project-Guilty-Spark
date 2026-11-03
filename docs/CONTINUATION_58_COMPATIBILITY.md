# C58 — Native source identity and runtime boundaries

Continues local master `682dcfd` without replacing C48–C57, the original maps, previous-good executables, experimental research, release artifacts or the separate dirty checkout. The four integrations are **MCC Halo 1, Custom Edition, OpenCE and Chupathingy**. A runtime that accepts another edition's content does not change that content's source identity.

**Universal conversion and a complete new cross-runtime gameplay acceptance are not finished.** C58 produces a fresh CE → MCC cache and tests its actual content, fixes two native scene-launch blockers, and runs the CE combined world on real OpenCE and Chupathingy peers. Retail MCC loading is blocked by missing official package metadata; no Standalone player result was returned. Both community trials contain sampled state disagreements. None of those gates was changed to a pass.

## Authoritative source contract

`source_identity.rs` extends the existing source projection. Native hash, cache version and normalized scenario must agree with the preserved source. The contract records header edition/build, original and preserved paths, resource bindings, installed input-family candidates, native editing routes and imported-cache compilation targets. Versions 6 and 7 remain platform-ambiguous without provenance; a filename or selected hosting runtime cannot distinguish PC/Mac/Demo/HaloMD.

The imported-cache MCC build preflight and Portability Lab reuse the same source-family admission rule. Plain v6/v7/v609/v13 require their normal tools/dependency checks. Xbox v5, compressed and extended inputs do not gain an MCC converter merely because their assets can be read. The contract explicitly leaves arbitrary imported-cache CE, OpenCE, Chupathingy, Xbox and HaloMD output unsupported. Existing CE QuickForge/Workshop and working-tag source builds are separate supported paths and remain intact.

Installation provenance requires fresh original-file hash agreement and canonical membership in a validated installation's known map folders. Installation/input-family agreement is a candidate, not game-load permission or an exact-build Live Link binding. Byte-identical imports reuse their preserved source; importing the same Xbox `a10` through Chupathingy does not overwrite the first OpenCE original path with a new edition label.

Runtime inventory, resource discovery and provenance now share `runtime::map_directories`: OpenCE includes `custom_maps`; Chupathingy includes its CE/PC/MD/custom folders. Discovery is bounded and rejects links/remote inputs. Original embedded data and pinned source resources retain precedence. Compatibility previews still require exact bitmap class/path/image/format/span and resource-hash checks and never become extraction/compiler resources.

Frontend source replies are bound to project, source paths/hash/version/scenario and bitmap/audio resource revisions. Runtime connection changes invalidate pending material-source discovery; an old failed request cannot evict a newer replacement. Hosting changes are deliberately absent from source identity. Project setup now contains a compact, lazy **Native source identity** view so opening every tab does not repeatedly hash all maps.

## Compatibility matrix: content and authoring

“Reader” and “decoded” are narrower than visual acceptance. These cells describe tested subsets, not every tag class or map.

| Source / target | Map reading | Visual rendering | Assets: models, shaders, animations, sounds | Native editing | Compilation |
| --- | --- | --- | --- | --- | --- |
| MCC Halo 1 v13 | Fresh native Blood Gulch import and exact identity | Existing classic renderer; full Anniversary/game parity open | Bounded native readers and pinned packs; complete animation/audio parity open | Reviewed direct v13 cells and source transactions; topology/arrays use separate source routes | Existing MCC source builds; C58 CE → MCC real rebuild/readback below |
| Custom Edition v609 | Fresh native Blood Gulch import and resource pins | Existing indexed bitmap/material/lightmap path; per-map parity separate | Native recursive import, model/bitmap/audio previews and supported animation readers | Native loose-tag workflow and CE authored geometry preserved; arbitrary direct compiled topology unavailable | CE authored-source builder and imported-cache MCC route; no arbitrary MCC-cache → CE converter |
| OpenCE installed Xbox/CE content | Installed Xbox `a10` and separate CE `custom_maps` discovery | Xbox/CE format decides renderer, not OpenCE hosting selection | Existing Xbox/CE asset readers; original `a10` has internal resources | Source workflows; no general Live Link write adapter | CE source/cache handoff to OpenCE's own loader; no separate universal cache compiler |
| Chupathingy installed Xbox/PC/CE content | Installed Xbox `a10`; v5/v7/v609 are input-family candidates | Native source format remains authoritative | Existing Xbox/CE subsets; full runtime-specific parity open | Source workflows; no validated Spark live-object writer | Its own family loader; CE source handoff is not arbitrary binary conversion |
| Legacy Xbox, Demo, PC, Mac/HaloMD | Supported native subsets; v6/v7 original platform may remain unknown | Content-specific preservation previews | Xbox swizzle/cube/audio layouts differ from PC; unknown codecs/extensions remain explicit | Preserve original inputs; only admitted native operations | No new original-console, Mac or HaloMD compiler/gameplay acceptance in C58 |

## Compatibility matrix: execution

| Runtime | Game loading | Gameplay | Hosting / joining | Live Link | AI / co-op |
| --- | --- | --- | --- | --- | --- |
| MCC | New retail cache **pending**; no official scenario-specific Excession template configured | C58 Standalone source trial has no returned player result; retail play unverified | Existing official session handoff; no universal community-lobby bridge | Existing exact-build object move/scale/readback, coupled physics, sprint/shoulder-camera paths retain their own acceptance | Full shared AI / original Zombie mechanism remain open |
| Custom Edition | Prior private Blood Gulch and two-room Workshop load/join preserved | Prior player-confirmed movement, floor, corridor and ramp; combined-world two-way walk still pending | Production private dedicated host/client workflow preserved | No validated Spark write adapter; selecting CE cannot call the MCC connect route | Native actor/round source work exists; no new stock-CE multiplayer-AI pass |
| OpenCE build 335 | C58 CE `c50tunnel` loaded on two actual processes | Native scripted-input state and lifecycle recorded; no human visual/audio acceptance | Private loopback host and join observed | Read-only exact-build diagnostics remain separate; general writes unavailable | Prior C56 combat/death/reconnect evidence retained. C58 MP trial is not an AI test; full peer parity fails its strict analyzer |
| Chupathingy 0.8.1d | C58 CE `c50tunnel` loaded on two actual processes | Native scripted-input state recorded; full visual/audio/physics acceptance open | Private loopback host and join observed | No validated Spark write adapter | Prior research retained; no new typed AI/Firefight acceptance. Strict sampled peer parity remains unaccepted |
| Original Xbox / Mac / HaloMD | No new native-device game test | Unverified | No new hosting test | Unavailable | Unverified |

Live Link, SparkLink editor transactions and gameplay replication remain independent. A changed hosting selection cannot retarget an existing MCC session. The UI retains that session's Undo/Disconnect and explains its binding; a fresh non-MCC selection disables the MCC connect action. No remote tool execution, raw binary patch broadcast, public console, security bypass or competing game networking stack was added.

## Fresh CE → MCC native rebuild

The production `qa_conversion_library` / `qa_build_project` path imports owned CE Blood Gulch, preserves its original cache and resources, selects the explicit `mcc-multiplayer-ui` conversion profile, recovers tags over the installed SDK source and builds using Invader `mcc-cea`. This is not a header edit or an unchanged MCC copy.

| Identity / result | Value |
| --- | --- |
| Source SHA-256 | `81764a451b60d93cb3f2471c4efb6e7bc313e1c2f7105e0184f297e2a0ab475c` |
| Native versions / builds | CE 609 `01.00.00.0609` → MCC 13 `01.03.43.0000` |
| Build / project | `f76b3ab9-5fd1-403e-baef-30e6a8aa92a9` / `c511e51c-7622-4787-920f-feb3a58f8ee5` |
| Output SHA-256 | `6ce8de58af57901a68bc77007cdd9dc1ee65a2bee76cbd3866e4af110ae71c77` |
| Output in local worktree | `.local/c58-universal-runtime-20261103/conversion-library/jobs/f76b3ab9-5fd1-403e-baef-30e6a8aa92a9/output/bloodgulch.map` |
| World readback, both files | 5,503 render triangles; 5,940 collision triangles; 68 resolved model types; 186 inspected placements |
| Audited semantic comparison | 4,643 unchanged fields; 0 changed paired fields; 1,059 unpaired fields; 47 removed tag identities, 0 added |
| Expected UI adaptation | Removed identities are one font and 46 Unicode lists in the explicit multiplayer UI profile. This is not a claim of lossless UI or whole-tag equivalence. |
| Target resource readback | All 121 requested shader/lightmap images decoded; 12 reflection cubes each have 6 faces; native countryday2 ambience sample decodes to WAV |
| Preserved classes | 448 bitmap tags, 70 model tags, 22 animation tags, 333 sound tags, 38 collision tags and one BSP remain in each cache. Counts do not prove payload/animation behavior equivalence. |

`qa_conversion_readback` is a read-only metadata/field comparator. It exposes missing and unknown content rather than equating matching class counts with semantics. The renderer/audio readback does not claim a sound was heard.

### Native scene launch repairs and remaining game gate

The first real H1A Standalone launch exited `-4998` because its rasterizer could not find the kit's relative shader files in the derived job. The second, after staging shader resources, exposed existing tag files with 293-character paths that the old game could not open. C58 now pins and stages **only** `shaders/fx.bin`, `psh.bin` and `vsh.bin` from the verified installed kit, rechecks them at launch and refuses to overwrite different working files. No SDK or original game file is changed.

Standalone also reuses the existing exact temporary DOS workspace mapping to keep relative tag paths short. Alias allocation/removal is synchronized while separate live mappings can coexist; each lease removes only its own mapping. The mapping lasts for the owned Standalone process. Closing its Spark window stops that preview before releasing the mapping; Guerilla/Sapien retain their independent editing lifetime. General native-editor long-path acceptance beyond this Standalone path remains a separate test.

A final real-process lifecycle check launches the preview through the production plan, checks all three staged resource hashes, closes its owning Spark window and observes that exact child process stop. This validates launch-resource/ownership cleanup, not a playable map. Unit tests also reject changed kit resources and pre-existing different working files without overwriting them, and exercise two simultaneous independent native path leases.

The third trial no longer logged those shader/path failures and reached native vehicle instantiation. It exited with code **1** without a player report. The exit's cause and visible gameplay are **unverified**, not silently treated as success or as a diagnosed crash. The Windows control helper failed with `helper_unknown_error: setup refresh had errors`; no automated desktop input occurred. A player check was requested while the trial was running; the window then exited, so that request became stale.

Retail MCC readiness reports the current cache as intact but **packageValid=false**, **registered=false**, **launchReady=false**. No unpublished official Excession template for this scenario was configured/found in the inspected paths. Metadata was not fabricated and no manifest/package install was attempted. [The official Creator Hub](https://www.halowaypoint.com/news/halo-2-and-halo-3-mod-tools-release) describes Standalone as a tool runtime over tags; this test is distinct from loading the emitted cache in retail MCC.

## Real community-runtime trials

The preserved C57/C50 CE combined-world cache `c84a1ed439ea0d37705899382c6304e14203c68518a743fcb57bdf1a0c5ea7e7` was copied into private, isolated game instances. Two OpenCE build-335 processes and, separately, two Chupathingy 0.8.1d processes used their normal CE loaders. Native logs show OpenCE converting 470 model parts, compressing BSP vertices, handling PC multipurpose channels and remapping script indices. Those are actual engine-side loader adaptations; **Spark did not emit a new OpenCE/Chupathingy file format**.

Both pairs loaded the requested world, joined, exchanged bidirectional packets, reported two machine players, advanced native player state and exited zero with inputs unchanged. The built-in `bot:1`/`bot:2`, impact and forced-kill cues were explicit. They do not prove human aiming, projectile flight, campaign AI or a complete Firefight round. OpenCE used its null renderer; Chupathingy used a hidden native renderer. Audio output was dummy. These runs cannot establish visual/audio parity or the Timberland–Sidewinder walkthrough.

The unchanged analyzer reports **sampled-state-disagreement** for both pairs. In OpenCE's 52 exact-tick pairs, 104 player comparisons agree on alive/score/kills/deaths/team/machine, while 3 shield comparisons differ by 0.01. Position differences and incomplete inventory parity remain reported. Chupathingy also retains its sampled disagreements. The gates/thresholds were not relaxed and these results do not authorize mixed OpenCE/Chupathingy joining, two-computer networking, AI sync or a lobby-listing gate change.

## Source intelligence and licensing boundary

The existing six detached checkouts and every prior behavior reference are retained. C58 adds six function-level references for native cache admission, resource types, community loading and optional local script consoles. The verifier checks **6 projects / 36 behaviors**, exact HEAD, clean checkout, license/file hashes, symbol and Spark owner.

| Project | Exact reviewed revision | Relevant boundary |
| --- | --- | --- |
| OpenCE | `899219cc0a14b03bc12f0517a1e9ee4c37158af8` | `custom_edition_header_verify` (`cache_file_formats.c:1030`), `resource_map_open` (`:2084`), `custom_edition_cache_tags_load` (`custom_edition_cache.c:1117`), `telnet_console_initialize` (`source/networking/telnet_console.c:105`) |
| Chupathingy | `9990568507eede8b81edd5437a4860de5465c408` | `ce_map_open` (`source/cache/cache_files_windows.c:487`) independently admits CE/PC/MD families and rejects MCC; local script console at `source/networking/telnet_console.c:112` |
| bnunu Halo 1 | `2e376b992e920bcc3a094727475c17daef71ec8c` | Existing original-cache admission, scenario/BSP and object-lifecycle references |
| Original Halo research | `4754c8e7cf1dfdee533e591054ec6c28ad718a2e` | Existing engine tag/AI/physics boundaries; its current license differs from older CC0 history |
| Invader | `e8b58542fd1e0a239d0fbc689ac4e55b80e79442` | Existing map/tag addressing, indexed resources and Xbox bitmap decompilation references |
| Reclaimer | `36224d7a4581f2a1f255099bf706aa56be9f6e21` | Existing bitmap/model/BSP addressing references; it is not Spark's native compiler |

Exact file hashes, links, licenses and review limits are in [the source index](fixtures/engine-source-index.json) and [the existing atlas](ENGINE_SOURCE_ATLAS.md). Copyleft engine code was not copied or linked into Spark; third-party modules incorporated remain zero. Invader remains an external installed tool. Closed MCC tools are pinned by actual installed executable/resource hashes, not by an invented source revision.

The community script consoles are default-off, loopback-only at these source pins and evaluate scripts without authentication. No such endpoint was enabled or used in C58. A future adapter needs exact installed-release verification, an explicit local binding, typed allowlisted operations, map/object ownership, readback/acknowledgment, restoration and independent permission boundaries. Source availability alone does not enable general live writes or BSP replacement.

## Verification, reproduction and open work

The native desktop test uses the built Windows executable, actual IPC and registered installed runtimes. It imports MCC/CE Blood Gulch, OpenCE/Chupathingy Xbox `a10` and an isolated CE copy under OpenCE `custom_maps`; it checks all four hosting preferences against unchanged source contracts, then opens the real source-identity drawer. No mock IPC or game-file changes. Four source hashes and the C57 previous-good executable are retained in the private baseline.

```powershell
pnpm build
pnpm test
pnpm test:ui
pnpm test:offline
node scripts/cargo.mjs test --workspace --locked
node scripts/cargo.mjs build --release --locked -p guilty-spark --features tauri/custom-protocol
node scripts/verify-engine-source-index.mjs <six-project-research-root>
node scripts/test-source-runtime-native.mjs --app <embedded-Windows.exe> --data <private-conversion-library> --output <fresh-output> --mcc <installed-MCC> --ce <installed-CE> --opence <installed-OpenCE> --chupa <installed-Chupathingy> --kit <HCEEK> --invader <Invader> --sdk <verified-SDK-tags>
node scripts/cargo.mjs run --locked -p spark-core --example qa_conversion_readback -- <owned-source.map> <converted.map>
```

Use an embedded/custom-protocol build for standalone app tests; a plain Cargo development-protocol binary needs the local frontend server. Two initial C58 QA launch attempts used the wrong protocol and reached a browser error page; those failed results are retained and excluded from native acceptance.

Regression evidence, final source/app identities and private report hashes are in [the C58 receipt](fixtures/c58-compatibility.json). Existing native source transactions, Baboon/Invader reconciliation, integrity checks, collaboration and the build pipeline remain in the combined regressions. The master feature ledger is appended, not replaced.

The combined regressions pass **661 Rust tests (8 explicitly ignored), 354 frontend tests, 153 browser tests and the 59-script offline suite**. The native source-contract run is separate from those browser mocks and uses actual installed inputs. The peer analyzer's two disagreement results remain failed acceptance evidence, independent of these application-regression passes.

Remaining priorities are: supply official scenario-specific MCC package metadata and verify the emitted retail cache; obtain a stable returned Standalone/player result; investigate strict peer-state differences without suppressing them; validate typed community Live Link operations against exact releases; independently implement/review Xbox/PC/Mac/MD conversion paths; finish visual/animation/audio acceptance per content; preserve the zero-verified-connection Megaworld traversal gate and unfinished direct compiled-map topology workflow. No installer/portable/source distribution artifact or remote publication is updated by this continuation.
