# CE startup and first-run follow-through

This continues committed `d3b4d29`. It fixes files omitted from Spark's checked CE extraction/private client copy and adds an explicit normal-window launch request, a separate menu-only setup action and actionable startup guidance. It does not establish the cause of every failed client join.

## Workflow

In **Online → Host game → Halo Custom Edition**, start the private server and choose **Prepare matching client**. The normal **Launch CE playtest** action remains available.

For a fresh test profile, expand **First-run help → Open CE setup**. This opens Halo with the same checked game files and isolated test profile, without requesting a connection. Complete Halo's own license/profile prompts, close its window, prepare again and launch the playtest. **Check CE installation** opens dependency setup. Halo's **Multiplayer → Direct IP** can also use the address shown in the host panel.

After a playtest process has remained open for 30 seconds, Spark shows recovery steps instead of leaving the initial launch message indefinitely. Elapsed time and launch mode are retained with its session details. Process presence and server player counts are not treated as proof that this particular client joined.

## Verified omissions and scoped repair

The earlier private client copy omitted `Eula.dll` and `Eula.rtf`. The checked archive selector also omitted the EULA module and the two named `controls` DLLs. Static inspection of the owned CE executable confirms a first-run EULA loader; missing files can prevent that path. This does not prove that the omitted EULA module caused the previous long-running zero-player trials.

New checked extraction includes those exact files, and new private client copies include the EULA module/text alongside the existing approved chat resources. The installer still checks the entire pinned archive and each copied file; it does not run bundled setup/update programs. No game files, licenses, profile payloads or proprietary code are bundled in Spark's source or portable release.

Discovery now reports missing/invalid startup files by name. Existing server-capable registrations remain usable for dedicated hosting. A client preparation with incomplete startup files is refused with a route to **Settings → Dependencies & setup → Install separate copy**. A new managed extraction must pass startup-file checks before registration. Existing managed folders are preserved; replacement uses a new separate directory.

## Windows launch contract

The former standard-library launcher passed default GUI show state in the local startup probe. The new client launcher explicitly supplies `STARTF_USESHOWWINDOW` with `SW_SHOWNORMAL`. It creates the client suspended, owns the returned handles immediately, binds its Windows kill-on-close job and resumes only after that succeeds. Startup and cleanup failures retire the owned process. Input file locks, session/window ownership, cancellation and fixed local connection arguments remain in force.

Windows command-line arguments retain their boundaries through explicit Unicode quoting. Callers still provide only a session ID and an enumerated action, never an executable path, arbitrary arguments, console commands or remote execution request. The setup action omits the connection switch; playtests retain the fixed local endpoint. Native subprocess tests check the startup flags received by the child and command argument boundaries. These are OS/process tests, separate from visual/gameplay acceptance.

The implementation follows Microsoft's [STARTUPINFOW](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/ns-processthreadsapi-startupinfow) and [CreateProcessW](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw) contracts. The desktop inspection helper failed to initialize in this continuation; no alternate desktop input/control helper was used.

## Acceptance and limits

[The native receipt](fixtures/ce-startup-native.json) records the final executable, real Tool/Invader compilation and client/server lifecycle cases. [The extraction receipt](fixtures/ce-startup-install-native.json) separately records a genuine HTTPS download, complete archive verification, startup-file readback and unchanged original game inventory.

Repeat the host challenge with `scripts/test-ce-host-native.mjs` and its existing `--app`, `--runtime`, `--output`, `--map`, `--kit`, `--invader`, `--recovery` and `--client-seconds` arguments. GUI observation is opt-in. Repeat extraction using `scripts/test-custom-edition-native.mjs --app <Spark.exe> --output <fresh-dir> --existing <owned-CE-folder>`. Run `cargo test --workspace --locked` for the native startup contract and existing source regressions.

Client joining, visual first-run completion, a Workshop collision walkthrough, full gameplay/render/audio parity, CE LAN/public exposure and game-peer/AI replication remain open. A zero-player trial is not a successful join. Native source transactions, Baboon/Invader reconciliation, C35–C39 history and preserved research remain intact. Direct compiled-map authoring remains unfinished in the master backlog. No protected-master push, repository-rule change, remote CI run or clean-machine installer acceptance is claimed.

## Final build measurements

The exact bundled executable passed all **31 native cases**. Matching-client preparation checked **69 files / 192,087,787 bytes** in **168 ms**; the requested 50 ms editor heartbeat completed in **54 ms**. The genuine Workshop CE build took **15813 ms**. These are local observations on one computer, not scale or network benchmarks.

The explicit-normal-window client trial lasted **60 seconds** and recorded **60 server-status observations**, with a maximum of **0 players**. A visible window was requested; a player join, first-run visual acceptance and gameplay remain unverified.

**585 Rust tests passed**, with seven existing opt-in cases ignored; **253 frontend tests**, **119 browser tests** and **59 offline scripts** passed. TypeScript, the optimized executable and NSIS packaging passed. All **127 original game files**, **2,455 reviewed source tags** and **146 preserved research files** remain unchanged.
