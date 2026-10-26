# Runtime capability evidence

The maintained [runtime compatibility matrix](RUNTIME_COMPATIBILITY.md), runtime adapter reports and [C32 verification](CONTINUATION_32_ENGINEERING.md) distinguish source implementation, upstream documentation, local inspection and game/network testing.

C32 verifies Windows application compilation/startup, read-only installed MCC discovery, actual legacy map inspection, editor source operations and selected-tag extraction. It does not verify a newly compiled cache in any game, cross-engine conversion, native engine hosting, macOS/Linux builds or PowerPC execution.

PowerPC G4/G5 is a potential legacy game-content target; the modern Tauri workbench is not a native classic PowerPC app. A recognized header, installed executable, metadata profile or version token cannot establish compatibility. Each target retains its own acceptance gate and dependencies.
