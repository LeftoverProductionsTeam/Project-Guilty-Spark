# Zombie Apocalypse restoration record

Recorded 2026-10-25 on Windows x64. The owner authorized using **all variants as restoration candidates**. The supplied archive is `Pyros Zombie Apocolypse Mod Versions/`; the original files remain in place. SHA-256 checks before and after the gameplay-map attempts match. No old executable or DLL in the archive was run.

**Result: real import and inspection work; successful MCC conversion and gameplay remain blocked.** No generated cache was marked playable, no package was registered, and MCC was not launched during these tests.

## Actual candidates

Paths below are relative to the owner-supplied archive. Format identification comes from bytes, not the filename, folder name or build string.

| Candidate                                              | Actual cache                | Indexed content                                        | Observed extraction result with the supplied Demo resources                                  |
| ------------------------------------------------------ | --------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `Zombie Apocalypse/maps/bloodgulch.map`                | Demo 6, reordered header    | 2,825 tags; 197 placements; 5,940 collision triangles  | 2,823 tags extracted; **2 sound errors**; stopped before compilation                         |
| `ZAMD/za_1.map`                                        | PC-derived 7                | 2,825 tags; 197 placements; 5,940 collision triangles  | **237 errors**; resources do not match this variant                                          |
| `Zombie ApocalypsePC/bloodgulch.map`                   | PC-derived 7                | 2,825 tags; 197 placements; 5,940 collision triangles  | **237 errors**; resources do not match this variant                                          |
| `apocolypse_1.map` and `apocolypse_1/apocolypse_1.map` | PC-derived 7                | 2,717 tags; 339 placements; 33,092 collision triangles | **196 errors**; matching resource data is required. The two source files are byte-identical. |
| `Zombie Apocalypse/maps/ui.map`                        | Demo 6; menu scenario       | 1,534 tags; 1 placement; 5,940 collision triangles     | Inspected/imported; menu-cache packaging is unsupported                                      |
| `ZAMD/ui.map`                                          | PC-derived 7; menu scenario | 1,534 tags; 1 placement; 5,940 collision triangles     | Inspected/imported; menu-cache packaging is unsupported                                      |
| `Zombie ApocalypsePC/ui.map`                           | PC-derived 7; menu scenario | 1,534 tags; 1 placement; 5,940 collision triangles     | Inspected/imported; distinct hash from the other menu; packaging unsupported                 |

These eight scenario files produce seven distinct library entries through checksum deduplication. The scenario in the Demo candidate is `Fonzie's Zombie Apocalypse`. Its audited encounter/script indexes contain zero entries; that does not establish how its custom spawner weapons behave in the game. The version-7 `apocolypse_1` build string ends in `0609`, but its cache version is **7**, not 609.

The included resource files are `Zombie Apocalypse/maps/bitmaps.map` (82,697,130 bytes) and `sounds.map` (79,916,792 bytes). Their presence does not establish compatibility with every historical variant. In particular, `apocolypse_1` reports 293 external bitmaps and 306 external sounds.

## Closest candidate: Demo

Invader 0.55.0 cannot extract these two referenced tags because their raw sample data is out of bounds:

- `sound\dialog\multiplayer1\scorpion.sound`
- `sound\dialog\multiplayer1\hill_occupied.sound`

Each tag ID also occurs outside its own tag-index entry. They cannot safely be discarded as unused based on this inspection. No silent sound replacement, reference deletion or stock-map substitution was applied. Valid sound data or an evidence-backed tag repair is still required. Compilation has not been reached, so additional target-engine issues could remain after extraction is repaired.

The adapter correctly treats these per-tag errors as failure even though `invader-extract` exits with status zero. Full stdout/stderr, build receipts and compatibility-repair records remain in local job folders. The application's build history shows the failures and keeps package installation/Steam launch disabled.

## Narrow compatibility repairs implemented

Repairs affect job-local working buffers. Source and preserved-original hashes retain their original bytes.

1. Some supplied version-7 caches declare the whole file length as tag-data length. The parser accepts only the self-consistent anomaly where declared file length equals actual length and a valid tag offset leaves a bounded remainder. It then validates every tag pointer against that remainder. The working header is normalized for extraction and the repair is recorded.
2. The Demo gameplay map has zero scripts and globals but an uninitialized `0xCACA` maximum-node count in its unused script table. The job-local repair derives capacity **18,875** from the validated table size and requires the exact sentinel, empty script/global arrays, valid range and representable capacity. It does not alter active script tables.
3. Legacy tag paths include an empty final basename and redundant internal separators. Validation permits these historical forms while still rejecting absolute paths, drive paths and traversal. Original tag path strings remain intact.

These are bounded compatibility fixes. Changing a cache version field is not used as conversion.

## Desktop verification

The actual release application uses its normal local data root, with owner attribution and the separate Invader/resource directories configured. A copy named `Zombie Apocalypse - restoration candidate.map` was placed in the owned MCC Inbox. The native watcher identified Demo cache 6, deduplicated the source into the real library and automatically attempted conversion, stopping on the two sound errors. This exercises the intended filename-independent import workflow.

All four distinct gameplay candidates were also attempted through the native build API and retain genuine failed build receipts. The Demo map's real BSP, placement editing/undo/redo, typed weapon editing, projectile reference swapping, source integrity and save/reopen behavior are checked through the running Windows WebView. The captured screenshots show this application, not generated artwork.

## Source identities

| Candidate                  | SHA-256                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| Demo gameplay              | `b38f35508188872b2535888193de80f766d92d3b8d53a8ada7be4fc9808a996d` |
| HaloMD-folder gameplay     | `2bd5532e977faf388f863ce19ea5e8b7dd6a09e479843923bec2e30688bdc10c` |
| PC-folder gameplay         | `0ba3e6c8c1fb7d1a692aed1598a32d1b85b2c0ca669b85e372d317a93d7aebb7` |
| Both `apocolypse_1` copies | `745efe81e4c07c0d43e55dae51b432e1d48d0719eb7ac4c0c249a7135170c697` |
| Demo menu                  | `8e4345f1529adeab4441ee639d54b7d5f1ec3672e2a0f2b368f749ec85b1ff9b` |
| HaloMD-folder menu         | `45a990410896412bdd961254cac1491beda4bc1d79d1d704caa5c7c2c57e1e04` |
| PC-folder menu             | `35667fadbbec931c780d73d7d28be74550111d8308cf173ccb052c84084dc709` |

## Acceptance still pending

Extraction must succeed with correct data before compilation and target-cache validation can proceed. An official unpublished Excession metadata template for the exact scenario is also required. Actual MCC package enumeration, the user's Steam anti-cheat-disabled launch choice, map selection and gameplay have not been verified. Multiplayer AI synchronization, live game editing and VR remain unimplemented; the desktop preview does not establish any of them.
