# Continuation 27 acceptance and remaining real-world checks

C27 is full-source only. Run on copies, not installed game files.

| Gate | Expected evidence | Current status |
| --- | --- | --- |
| C26 baseline ZIP checksum and extraction | Exact SHA matches published file, ZIP clean | PASS in container |
| Offline Node regression suite | All previously retained scripts plus legacy workflow proof tests | PASS (extracted packaged ZIP) |
| Strict TS validation for new pure module | Global tsc without deps, no reported error | PASS in container |
| React TSX syntax | TypeScript AST parses new Academy UI, App and lab | PASS in container |
| Seven historical paths render and navigate | Windows WebView2 build, open each path and correct editor | NOT RUN on Windows |
| Report is path-free and source-hash bound | Synthetic private paths, mismatched hash, legacy claims and manual gates | PASS synthetic tests |
| Source map and owner bitmap in actual Windows app | Original SHA, exact tag ID, header art clear on project switch | NOT RUN on owner-owned map |
| Halo structure collision/portals/playability | First original Test Arena Tool/Invader compile, WRL, in-game walk | NOT RUN; engine build not established |
| Imported BSP and tag lossless roundtrip | Independent compatible fixtures, source/tag and game output comparisons | NOT IMPLEMENTED globally |
| Restored Zombie Apocalypse gameplay | Real source variants, AI encounter behavior and separate clients | NOT RUN |
| Legacy Mac/MD/G4 engine support | Independent target binaries, bridge, tested runtime | NOT IMPLEMENTED |

Owner first action: extract C27 source ZIP in a NEW empty folder. Do not overwrite previous C26 or stock Halo installations. Native toolchain test should be performed one step at a time, based on the actual outcome. Preserve logs and hashes for any failed compile.
