# C59 push summary

Title: **Unify detachable workspaces and durable SparkLink session rollover**

Eligible map drawers now detach into real native windows and return their project, editing lease, layout and durable history to the original window. Inactive/minimized editors pause actual draws, and a third open map retires the oldest GPU context while keeping document/selection/Undo state. Native window creation no longer holds the history mutex across UI dispatch, fixing a freeze exposed by the complete workspace survey.

Online separates runtime-specific Host/Join from SparkLink source collaboration. Durable LAN/VPN hosts can explicitly roll over the exact acknowledged revision into a fresh session with new invitations and a fresh shared Undo history; previous journals and snapshots remain. Pending edits and active source tools block the handoff, rejected operation errors remain visible, and release builds refuse the Spacewar test bridge. Existing external-tool reconciliation, native transactions and source/build safeguards are preserved.

Validation: **664 Rust tests passed, 8 ignored; 355 frontend; 154 browser; 59 offline scripts.** Native checks cover 23 workspace routes plus both geometry views, actual detached-panel/history/frame/GPU lifecycle, three independent Windows processes, sustained BSP edits, native compilation, host-death/offline-edit recovery, rollover/rejoin and same-machine Radmin convergence. Exact artifact hashes and measurements are recorded in [the receipt](fixtures/c59-professional-workspace.json).

Two-computer networking, physical monitor disconnects, complete window-session restoration, authorized Steam production transport, whole-process RAM budgets and game-peer AI/co-op remain open. No new game traversal/audio acceptance, installer/portable replacement or public Release upload is included. Local master is prepared for the owner to push normally; no force push or repository-rule change was made.

[Exact workflows, failed-run repairs and limitations](CONTINUATION_59_WORKSPACE.md).
