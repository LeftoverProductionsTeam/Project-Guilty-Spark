# Build on Windows

Use a supported Windows development installation with WebView2, Node.js 24, pnpm 11.25.0, stable Rust, Visual Studio C++ Build Tools and the Windows SDK. Check Tauri's [Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows) for current supported components.

From a fresh checkout in its own folder:

~~~powershell
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm test:offline
node scripts/cargo.mjs test --workspace --locked
node scripts/desktop.mjs build
~~~

The native executable is target/release/GuiltySpark.exe; the NSIS installer is under target/release/bundle/nsis. CARGO_TARGET_DIR can move build output to an appropriate drive. The wrappers discover the configured toolchain without requiring a machine security-policy change. Do not disable PowerShell execution policy, antivirus, EAC or browser protections to build Spark.

Use pnpm dev for web development; pnpm test:ui runs browser contracts against a preview server. Browser-mode fixtures do not validate native IPC or a game. Native evidence and exact local release hashes are in the continuation report/artifact records.

No Halo map, game asset, official editing-kit executable or Invader binary is bundled. Install optional compatible tools separately. macOS/Linux compilation in CI, if run, is not proof of native gameplay or feature parity there.
