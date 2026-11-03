# Guilty Spark — Live Editing, External Tool Interoperability and UI Design Audit

**Research checkpoint:** 2026-11-03 | Supplement to the v6 research ledger | **Status:** source-backed design proposals, not a product implementation claim.

## Critical interpretation of new Discord report

User-supplied snippets:

- **Sako, 8:06 PM:** says they built a Tool GUI which enumerates commands and automatically fills arguments. Public download/tool version are unknown. yayoranges called it handy.
- **Renette, 10:05 PM:** says Assembly can poke in-game values/references, not add structural elements in that live mode; reports fatal errors when poking some animations, while Editing Kit tag reload may leave AI actors as visually present bipeds without AI and may continue consuming object budget until map reset.
- **User, 10:11 PM (Pyro):** requests solutions to these failure modes. There is no permalink or exact game/runtime version in the provided text.

**Correction:** Read the "can't add anything" statement as about live in-memory poking, not all Assembly features. [Original Assembly/XboxChaos guide](https://xboxchaos.haloman30.com/topic/4518-map-modding-getting-started/index.html) documents tag extraction and injection *offline* for supported games. [c20 Assembly overview](https://c20.reclaimers.net/general/community-tools/assembly/) warns that cache editing can omit compiler-derived fields and is less appropriate for large changes. [Community introduction](https://assembly-halo.fandom.com/wiki/Introduction_to_Assembly) explains Poke versus Save and live structural restrictions.

**Evidence status:** We verified general software behavior through documentation; Renette's specific animation, decontrol and budget assertions remain **firsthand/unverified** with unknown engine, version, tooling and reproduction. Store separately as `DISCORD-006`, `DISCORD-007`, and `DISCORD-008`. Do not infer that every Halo 1 runtime has this defect.

## Key competitor safety pattern (already exists)

[Baboon v0.2.2](https://github.com/Zoephie/Baboon/releases/tag/v0.2.2) documents **Campaign Evolved** live tag poking (Windows) with field-level diff and byte count, game/tag-module hash checking, no new memory allocations or block resizing, explicit unsupported-field refusal, atomic recovery and Undo Last Poke. This is a strong **safety benchmark** for Spark, but **not evidence of Halo 1 support** or a unique invention.

Baboon v0.3.2 also documents historical wrong-active-kit and hidden-tab targeting fixes, source-accurate tag UI semantics and retained shader values. See [release notes](https://github.com/Zoephie/Baboon/releases/tag/v0.3.2). Reuse the *principles*, not unreviewed third-party source code. [H1 Editing Kit overview](https://c20.reclaimers.net/h1/h1-ek/) documents differing native tool engines and build expectations.

## Spark UI proposal — a single, contextual edit workbench

```text
PROJECT: Timberland + Sidewinder    SOURCE: CE derived copy   TARGET: OpenCE [verified version]
EDITOR: Tunnel BSP     SELECTION: tunnel_wall_17     SOURCE: rev 234 [modified]
─────────────────────────────────────────────────────────────────────────────────
INSPECTOR                           NATIVE ACTION            ACTIVE TEST
Geometry | Materials | Collision   [Rebuild & Playtest ▾]    OpenCE: session 14
- Selected face: 17              Live Preview: unavailable   Map: compiled rev 229
- Material: tunnel_metal         Reload: unavailable         Runtime: rev 229
- Seam: detected                 Rebuild: supported         AI: no live telemetry
- Collision: pending             Why? new BSP requires      Test evidence: not run
                                  structure compilation
─────────────────────────────────────────────────────────────────────────────────
DEPENDENCY REVIEW | COMPILER DIAGNOSTICS | SOURCE DIFF | GAME EVIDENCE | UNDO
```

The example is *illustrative*, not an actual screenshot or currently implemented Spark feature. Keep it compact: default controls should be task-oriented; developer logs, exact generated commands, raw tag offsets and version profiles stay behind expandable details. Panel layouts and resizable/detachable windows remain user-controlled.

## Operation classification — UI contract

| Change being authored | Default UI route | Why |
|---|---|---|
| Known scalar field supported by verified runtime adapter | **Live Preview** (optional) | State can be ephemeral; show a field diff and Undo, then offer persistence through source save/build. |
| Simple referenced tag swap | **Verify per runtime** | Reference and resource registry can differ; never assume all pointers work live. |
| Change block length; add a new tag or new asset | **Native Edit / Rebuild** | A live process may require memory allocation, tag registration and derived runtime fields. |
| Change animation for existing AI | **Rebuild or known-safe reload only** | Community reports of crashes and decontrolled actors require per-version reproduction; fail closed otherwise. |
| BSP geometry, collision, portal | **Native structural rebuild** | Collision/portals/resources must be authored and compiled, not rendered as a transient overlay. |
| Runtime not recognized, unsupported live API, missing telemetry | **Unavailable with reason** | No arbitrary memory poking or anti-cheat bypass, no invented "live link" capability. |

## UI requirements in order of payoff

1. **Contextual Apply control:** classify actual edit and its verified native route. Do not add four top-level buttons for actions most editors cannot perform. Refuse unsafe paths, explain the next supported path.
2. **Source / Build / Game state ribbon:** show independent hashes/revisions. An ephemeral live poke is not a saved mod; a compiled map is not proof of playable AI; a green runtime icon is not a multiplayer acceptance result.
3. **Capability-aware inspector:** properties plus restrictions and provenance on one screen. Show *why* an edit can't be live, as data, not a generic error popup.
4. **Runtime Health drawer:** source-backed AI actor/controller and object budget diagnostics *where exposed*; unavailable if not. Red/green indicators must not imply health without evidence.
5. **Native Tool command palette:** list supported Tool verbs by edition; auto-fill arguments from current asset and source root; show output path, compile command and validation; preserve advanced console access.
6. **External tool handoff:** launch Sapien/Guerilla/Baboon/Blender on an explicit source copy/project, detect revisions, reconcile the right kit, and retain scene camera, selection, undo and panel layout.
7. **Undo and recovery across boundaries:** snapshot original source, stage risky edits, save accepted output separately, and recover from rejected builds. Runtime rollback must be limited to safe supported operations.
8. **Interaction reliability:** no focus or tab targeting bugs, lost edits after blur, expensive full redraw at idle, draggable popup confirmations on stale content, or pane restoration off-screen. Upstream Baboon bugs are historical fixed benchmarks, not current defects.

## Acceptance suite for Codex (do not claim success from unit tests alone)

- Verify source map identity/engine and record hashes before edits. Preserve original Halo maps and C49 packages.
- In each of MCC, CE, OpenCE and Chupathingy, select a scalar field, a new element, a BSP face and an animation. Record *why* each action chooses Live Preview, Reload, Rebuild or Unsupported; unknown runtime/build must fail closed.
- On a supported runtime adapter only, test field-level live edit, atomic undo and game reload; source/cache/game status must stay distinct.
- On unsupported adapters do not perform blind process-memory writes. No escalation, anti-cheat circumvention or direct gameplay memory patching without supported and reviewed interfaces.
- Test a native animation reload with an AI actor **only where the engine safely supports instrumentation**: verify controller/actor state, targeting, object budget, destruction and recovery after map restart; classify the Discord report as not reproduced until actual evidence exists.
- Rebuild a BSP change with collision and portals, launch a real game client and test traversal. Do not substitute a visual preview or compiler readback.
- Launch multiple different editor kits, start an external build, change focus/tabs, and verify the originating project owns all writes, status, undo and errors.
- Test constrained 800x600 layout, maximized and detached multi-monitor panels, CPU/GPU idle retention and rollback after crashing child tool; preserve user state.

## Research registry entries

New source IDs: `SRC-108`..`SRC-113` including one private/user-supplied excerpt without URL. New findings: `ASSEMBLY-001`..`004`, `DISCORD-006`..`008`, `UI-037`..`042`, `RUNTIME-052`. Canonical additive delta: `RESEARCH_DELTA_20261103_LIVE_EDIT.jsonl`.

These are evidence records and a **proposed implementation contract**, not proof that Spark's current local branch is missing or already implements each feature. Inspect current HEAD first; merge into the existing retained editor, native build and runtime adapter architecture rather than creating competing submodules.
