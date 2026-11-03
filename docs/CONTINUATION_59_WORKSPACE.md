# C59 — Professional workspace and collaboration

Continues local master from `88505dedd56d60168600ce94480c464bc6b73e7d`. C35–C58 history, the separate dirty C41 checkout, native source transactions, external-tool reconciliation, retained editors, previous builds and failed research remain preserved. This pass changes workspace/window lifecycle and editor collaboration; it does not add game networking.

## Workflows and boundaries

| Workflow | Accepted behavior |
| --- | --- |
| Move a map to another native window | Pointer-dragged tabs transfer project identity, selected source object, the editing lease and durable Undo/Redo. Return sends them to the original native window. |
| Move an eligible drawer | Its Detach control or a pointer drag outside the application opens the actual panel in a native window. Inspector, object/tag/asset/sound/construction panels, comparison information, recording/camera panels, project setup and Help use an explicit route allowlist. Game controllers and SparkLink keep their existing session ownership. |
| Edit while a drawer is detached | One native window writes a given local map; its other views observe the acknowledged state. Another map remains independently editable. A stale observer cannot overwrite source: its rejected draft is retained. This is not unrestricted simultaneous local-window writing. |
| Close or return a panel | Its native size/position and original drawer layout survive. Closing a map A panel while editing map B returns ownership without stealing map B's place. A nested Help window returns to the window that opened it. |
| Change workspace or minimize | The same warm editor pauses actual rendering. Windows minimize state is checked because WebView2 can keep `document.hidden` false. A third map releases the oldest GPU context; source, selection and Undo/Redo survive renderer recreation. The warm limit is two map renderers per native window, not a whole-process RAM guarantee. |
| Recover placement | Reopening restores native geometry. Out-of-range saved positions are fitted to available displays, including negative-coordinate monitor layouts. Only one physical monitor was available; physical display removal/transfer remains unverified. |
| Online | Choose a runtime, then Host game, Join server or Collaborate. Existing compatible server filters and engine-specific hosting remain. Collaborate selects an editable map and opens SparkLink source editing; it does not create game co-op. |
| Start another collaboration session | The host explicitly chooses **New session from this revision**. The exact acknowledged source becomes revision 0 of a fresh durable TLS session. Credentials/certificate rotate, collaborators need new invitations, and shared Undo begins a fresh session history. The previous journal and source snapshot remain. |

The existing coherent header, monitor application menu, HOME/showcase preferences, compact Inspector/Compare/Machinima/Preservation/tools, runtime-aware library, optional menu audio and source-aware onboarding remain integrated. This pass removes remaining tab underline decoration and makes detached-panel chrome compact without duplicating the native close control. It does not claim a new audio-listening or every-character rendering acceptance.

## Real native acceptance

All desktop checks use the embedded Windows application, real native commands, separate WebViews or independent processes and isolated libraries. IPC responses are not mocked. The separate browser contract suite is synthetic and is not counted as native evidence.

Full regressions pass: **664 Rust tests, 8 ignored; 355 frontend tests; 154 browser contracts; 59 offline scripts.** The production frontend and embedded Windows release-mode build also succeed.

- **23 native workspace routes plus QuickForge arena and four-view BSP Workshop:** 25 route cases, 126 viewport/subview states, widths 800/1280/1920 and an emulated 2× scale. No detected header overlap, horizontally clipped actionable control or page overflow; the original inspected MCC map hash is unchanged. Local scrolling still exists where content requires it.
- **Native lifecycle:** pointer-detached Inspector, independent map edits, native header reachability, HOME/return from panel mode, saved geometry, original-window return, source collaboration setup and release-build Steam refusal. A detached Inspector allocates no hidden main map Canvas.
- **Actual rendering:** zero GL clears during each measured 650 ms parked/minimized interval. Returning to a warm editor keeps its Canvas. Opening a third map loses the retired GL context; returning recreates the renderer with the same source, selected object and working Undo/Redo.
- **Eight history cases:** real tab drag/return, shared acknowledged transforms, lease transfer, durable stale-draft refusal, rapid updates, foreign-map isolation, abrupt process-death recovery, close/reopen and Undo/Redo.
- **Native frame:** actual title-bar double click maximizes; fullscreen consumes the complete WebView viewport and restores the normal curved margins; one application close control. Desktop compositor transparency has not received a new visual certification.
- **Three independent Spark processes:** simultaneous BSP edits, actual drag ghosts in perspective/orthographic views, per-author Undo/Redo, conflicting edits, idempotent replay, Viewer/build permissions, expired-presence recovery, revocation, 240 sustained acknowledged transactions, actual host termination and recovery of two real offline UI edits.
- **Rollover:** all three rejoin the new authority and converge after further edits. The previous journal remains byte-identical, old invitations and superseded recovery are refused, and a deliberately retained pending operation blocks rollover without being discarded. Later successful polls no longer erase the actionable rejection.
- **Combined windows and creators:** an active host detaches its real Inspector, transfers its existing source controller to that native window, changes a transform and synchronizes it to both other processes. Return restores the same authority in the original window; all three then roll over and rejoin successfully. Peak: four native windows across three processes.
- **Radmin:** three actual processes converge using this machine's Radmin adapter. This is one physical computer; a remote VPN tunnel or second computer was not tested.

## Native compilation and measurements

The collaboration runner freezes acknowledged revision **247**, builds it through the actual H1A Tool/Invader path while later editing reaches revision 248, and reopens the separate cache. Readback finds cache family 13, 58 collision triangles, both authored portals and 2,239 tags. The 88,880,670-byte cache has SHA-256 `f94cbbbbf0643fb5accb2211f5930273e547891e48c1617ec285b706d8ca4b1e`. Compilation is not a new gameplay/traversal result.

Exact synchronization samples, journal bytes, heap samples, build/recovery/rollover timing, application hashes and regression counts are in [the metadata receipt](fixtures/c59-professional-workspace.json). Timings include local IPC and React consumption and were collected alongside regression work; they are not a matched before/after startup benchmark or a network latency claim. The final native build took about 108 seconds. The focused rollover/reinvitation path after the detached-host test took about 6.01 seconds. The final full crash-recovery runner's rollover/rejoin/further-edit stage took about 7.13 seconds. Its early/late sustained-edit medians are 891/898 ms, respectively; this finite workload does not establish a multi-hour stability guarantee.

Existing bounds remain: 100 shared Undo transactions, 4,096 acknowledged operation identities, a 24 MiB journal, 24-hour running-session lifetime and at most 32 retained sessions per project. Rollover is explicit; nothing silently evicts acknowledged identities or deletes older evidence. A multi-hour endurance/power-loss or disk-corruption guarantee is not established.

## Repairs found during acceptance

1. Generic panel windows originally retained duplicate editor chrome and a hidden Canvas. They now mount panel controls/state without that renderer and retain only essential native navigation/window controls.
2. Minimized WebView2 pages did not become `document.hidden`. Native resize/focus notifications now query minimized/visible state, without an idle polling loop.
3. Rollover initially failed because its new snapshot reason was absent from the core allowlist. The shared constant and actual snapshot readback regression now cover it. Successful polling also erased the rejection; operation errors now remain until another explicit action.
4. The broader window survey found a real freeze opening the next native map window. Window construction was dispatched while holding the document-history mutex, allowing a synchronous parent history request to block the UI thread. A reserved single-writer lease now fences edits before construction; the mutex is released during native dispatch and a failed creation restores prior ownership. Destroy-event recovery also runs off the UI thread. The complete 25-case survey then passes.
5. The old title-bar test could choose the Layout summary as its supposedly empty double-click point. Its selector now excludes interactive descendants; native maximize/fullscreen assertions remain intact.
6. An attempted test-side IPC timing wrapper could not replace Tauri's immutable invoke property. That failed diagnostic remains private; final timing uses Spark's existing opt-in profiler without substituting native calls.
7. The complete Online collaboration path found that picking an already-retained map opened its drawer with the session details still closed. The setup now reuses the header's explicit reveal event, rather than relying only on an initial-mount saved flag.

Failed attempts remain under `.local/c59-professional-workspace-20261103`; they are not marked successful or deleted. Source/tag integrity checks, Baboon/Invader semantic reconciliation and the compiler pipeline remain in place. No network command starts a tool or broadcasts arbitrary offset patches.

## Remaining gates and delivery

- Actual second-computer LAN/VPN delivery, physical multi-monitor movement/unplug, automatic reopening of every previously open native window and whole-process RAM budgeting remain open. Native panel geometry and original layout return are tested separately from a complete OS-window-session restore.
- Production Steam transport requires an appropriately authorized application integration. Release builds refuse the Spacewar module before opening a picker or launching it. The old debug research is retained; it is not a shipping transport.
- SparkLink source convergence does not prove Halo game co-op, AI parity, cross-runtime lobby translation, full render/audio parity or a new playable conversion.
- Direct compiled-map structural editing and generalized imported-terrain topology remain unfinished. **Player-verified Megaworld region connections remain 0.** C57 traversal and C56 native actor/Firefight gates are unchanged.
- The local release-mode executable is a test build of version 0.4.1. C49's sealed installer/portable remains the prior distribution candidate; no new installer, portable package, Linux package, GitHub Release asset or remote push is claimed.

See [push notes](C59_PUSH_NOTES.md), [SparkLink setup](SPARKLINK_SETUP.md) and [the cumulative ledger](MASTER_FEATURE_LEDGER.md). The owner continues the local-master push workflow without force pushes, ruleset changes or rewriting the public alpha tag.
