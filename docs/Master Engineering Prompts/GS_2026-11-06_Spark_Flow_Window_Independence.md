# GUILTY SPARK — SPARK FLOW MULTIWINDOW INDEPENDENCE & ANIMATED TAB TEAR-OFF

## Finish the window experience without compromising native editing

Continue from actual local master and preserve all current uncommitted work, especially the accepted native door-placement workflow, C71 changes, 475 feature requirements and existing P0 recovery protections.

The latest user observations identify two unfinished behaviors:

1. Opening the Monitor/workspace selector in one window unexpectedly opens selectors in other Spark windows.
2. Pulling a tab away from the title bar lacks convincing visual feedback that the tab is becoming an independent window.

Fix both as part of a focused, end-to-end multiwindow workflow improvement.

### 1. Make every native workspace window an independent UI entity

Every window must have its own independent:

- Workspace selector and popup open/close state.
- Navigation sidebar.
- Active workspace, tab selection and navigation history.
- Open menus, dialogs, tooltips and transient notifications.
- Focus, keyboard shortcuts and modal behavior.
- Camera position, viewport controls, selection and panel layout.
- Tab drag state and window detachment feedback.
- Window position, dimensions, maximized/fullscreen state and restore context.

Opening a Monitor selector in Window A must never automatically open the same selector in Windows B or C.

Navigating Window B must not redirect Window A.

Closing or minimizing Window C must not unexpectedly alter the other windows' UI.

**Important distinction:** Independent window interfaces do not mean independent, conflicting copies of the same project.

Shared documents must continue using the existing authoritative source identity, native editing ownership, revisioned Undo history, collaboration mechanisms and single-writer protection.

Preserve the ability for multiple windows to observe one project without creating conflicting native authors.

### 2. Find the actual cross-window selector bug

Inspect:

- `src/components/OpenWork.tsx`
- `src/App.tsx`
- `src/mapSession.ts`
- `src/useWorkspaceWindows.ts`
- `src/components/WorkspacePanels.tsx`
- `src-tauri/src/workspace_windows.rs`
- Current local changes not yet pushed to GitHub.

Trace the actual control the user calls Monitor, including its event origin and state ownership.

The published OpenWork popup already uses local React state. Do not assume that component is necessarily the problem.

Audit globally persisted UI keys, WebView storage notifications, application-wide Tauri events and window-targeted events.

The existing `chrome.sidebar` global persistence is a concrete state-isolation concern. Evaluate other comparable UI keys.

Correct accidental global state sharing while retaining intentionally shared preferences, project data, library changes and collaboration events.

Prefer local component state for transient controls and window-labeled persistence for settings that should survive a particular window's restart.

Do not duplicate the project database or introduce another window-state framework.

### 3. Give tab dragging actual visual feedback

Keep the established compact title bar, existing rectangular tab styling and its current layout.

Enhance the existing `MapTabs` and `tabDetach` implementation.

The intended interaction:

**Pointer down → begin dragging → tab visually lifts → floating tab/window preview follows → detachment threshold becomes obvious → release → new native window opens.**

Requirements:

- A normal click still selects the tab.
- Small pointer movement does not detach it.
- Dragging within the strip still supports reordering.
- Once the tab is lifted, provide subtle scale/elevation/shadow feedback.
- When the pointer crosses the detach threshold, show a small floating preview indicating that releasing will open a new window.
- The original tab should visibly communicate its pending transfer without disappearing prematurely.
- The preview should follow the pointer smoothly while the owning WebView can track it.
- On a successful native handoff, transition visually from the dragged tab to the new window.
- On cancellation or failure, restore the original tab without changing its document or history.
- Preserve keyboard and context-menu alternatives to mouse dragging.
- Respect reduced-motion accessibility settings.

Avoid elaborate animation that increases GPU load, redraws the 3D scene unnecessarily, obscures native window controls or interferes with external Windows file drops.

If a true OS-level cross-monitor drag cannot be supported by the current WebView pointer events, implement the best truthful visual handoff that is actually supported. Do not claim seamless cross-monitor dragging without testing it.

### 4. Treat detachment as a transaction, not a visual trick

Inspect the complete handoff:

`MapTabs` → `closeMap` / workspace pop-out → Tauri native window creation → document ownership transfer → new WebView initialization → source history restoration.

Use explicit states such as:

Idle → Dragging → Ready to detach → Transferring → Completed / Cancelled / Failed.

The UI must distinguish user intent from a successful native operation.

Do not close the original tab or present the transfer as complete until the appropriate native window and document handoff have been acknowledged.

If creation fails because of a native tool lock, source ownership, window limit, invalid route or other error, preserve the original document and make the error understandable.

Ensure duplicate pointer-up or rapid drag attempts cannot create multiple unintended editing windows.

Preserve the existing protection against losing dirty edits, invalidating Undo history or granting two independent writer leases.

### 5. Make workspace windows useful after detachment

A detached map editor should function as a real Spark workspace, not a temporary preview.

It should independently support applicable navigation, editing tools, project operations, window controls and history.

Users should be able to:

- Tear a map tab into a new window.
- Drag the window to another physical display.
- Change that window's workspace.
- Open an independent window from a workspace with no map tab.
- Reorder tabs within the window.
- Return a map or supported panel to its originating window.
- Keep editing after the original window closes where the existing ownership rules permit.
- Close, reopen and restore supported layout state without losing source history.

Keep the distinction between moving an editing document, opening an observing view and creating another independent workspace.

Do not silently convert an observing window into a second writer.

### 6. Check the surrounding UI and layout

Preserve the already verified 32-pixel compact header where supported.

Check title-bar controls, tabs, Studio, Work/Monitor, View, overflow menus, window drag region and OS window buttons.

Test narrow and wide layouts, including 800, 1024 and 1920 pixels.

Ensure controls never overlap, clip or become unreachable.

Maintain usable keyboard focus, Escape dismissal, pointer cancellation, tooltips, tab context menus and window dragging.

Keep actual source-editing panels and native tool dialogs usable while another window has focus.

### 7. Prove independence with real windows

Use at least three genuine native Spark windows:

- Window A: Main application with a map open.
- Window B: Detached map editor.
- Window C: Independent workspace without an active map.

Test the exact reported issue by opening Monitor in Window A and confirming the selectors in B and C remain closed.

Repeat the inverse.

Test simultaneous different workspaces, menu focus, window minimize/maximize, drag cancellation, rapid detachment, failed window creation and closing the original window.

Verify:

- Window-local UI state remains independent.
- Project identity and source history remain correct.
- Native writer ownership remains singular.
- Unsaved edits and Undo/Redo survive a valid handoff.
- Restart preserves the appropriate saved window layout.
- No unrelated global events mutate another window's transient UI.
- No repeated source copy or unnecessary SDK staging occurs.

Use browser tests for interaction logic and the actual Windows Tauri application for native acceptance.

Do not claim cross-monitor acceptance from a single simulated browser.

### 8. Keep progressing on the full Guilty Spark roadmap

This is a scoped Spark Flow improvement, not a replacement for the continuous feature-completion directive.

Preserve the C71 imported-map machine writer work, the validated door transformations and independent native readback.

Complete the current Save/restart and native validation gates.

After these window bugs are fixed and tested, resume the next highest-impact incomplete requirement from the original engineering prompts and 475-row ledger.

Continue implementing genuine Halo features rather than spending unnecessary cycles on UI-only refinements.

### 9. Completion report

Report:

- Exact root cause of the cross-window selector behavior.
- Which UI state was changed from shared to window-local.
- The new tab-detachment interaction and its failure behavior.
- Existing versus new native-window operations reused.
- Browser, Rust and native Windows test results.
- Screenshots or reproducible visual evidence where available.
- Document ownership and Undo/Save verification.
- Final native asset workflow status.
- Commit hash and working-tree state.
- Remaining game/human/platform acceptance gates.

Do not push or publish without authorization.

**Target experience: Every Spark window is an independent, fully usable workspace. Dragging a tab into a new window should feel intentional, fluid and safe, while every project remains protected by authoritative source and editing history.**

## ONE HALO. EVERY WORLD. EVERY TOOL. TOGETHER.