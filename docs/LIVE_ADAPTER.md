# Live Halo adapter and shared QuickForge

C35 r6 adds [live-session recovery](C35_LIVE_SESSION_RECOVERY.md). After sampling fails, use **Game connection → Release previous live session** to restore a verified current target or retire records for a proven obsolete target. Uncertain cleanup retains remaining records and blocks new edits for retry. Cleanup receipts state what actually happened; disconnect does not undo object position edits. Reconnect and bind objects again after release. Connection IDs also keep old live history and position/size requests out of a newer connection.

C33 adds a Windows process-memory transport for MCC Halo 1 and a separate two-editor source session. The adapter is **experimental**. The reviewed Steam build has been tested in a running Blood Gulch session: object movement, readback, restoration and vehicle resizing. The owner confirmed correct tire contact and driving at 2× after the suspension correction. Two-computer game replication remains unverified.

## MCC connection

1. Connect your Steam MCC installation in Start here.
2. Launch MCC using Steam's **Anti-Cheat Disabled (Mods and Limited Services)** option. Enter Halo 1 and load your compiled QuickForge map.
3. In QuickForge, expand **Live Halo adapter · MCC**, confirm that launch mode, then select **Connect running MCC**.
4. Select an asset placement. Bind it to the intended matching live tag/class instance, identified by position and object datum.
5. Enable **Send bound position edits live**. Subsequent position edits, including undo and redo, are sampled every 150 ms. Batches are serialized and read back; failed or changed instances pause updates.

QuickForge live updates send existing-object **positions**. The loaded scenario must match `levels/quickforge/<project slug>/<project slug>`. Binding an object from a different map is refused. **Live lab → Live Halo 1 objects · MCC** also works with the currently loaded map and provides direct, typed position and uniform-size controls with undo/redo. Neither interface accepts arbitrary addresses.

| Operation | Current adapter behavior |
|---|---|
| Identify process, module, current map and objects | Implemented; requires the exact reviewed executable/module hashes |
| Existing scenery, vehicle, weapon, equipment or biped position | Typed write with object salt, tag identity, expected position and memory readback checks |
| Other editor's position edit | Source session delivers the edit; each locally enabled and bound adapter attempts its own update |
| World weapon and equipment size | Live lab, 0.1×–4×; explicit shared tag scope updates all matching dropped items and future drops; attached/first-person presentation is separate |
| Scenery size | Live lab, 0.1×–4×; individual model/bounds update and physics wake-up |
| Vehicle size | Live lab, 0.5×–2×; every vehicle sharing the physics tag is resized together, including matching rocket/regular Warthogs |
| Rotation, creation, deletion | Not sent |
| New BSP, extensions, tunnels, portals or lightmaps | Rebuild and reload required |
| Free camera plus animated player control | Not implemented in the game adapter; the director rehearsal is an editor preview |
| Halo Custom Edition / Chimera | No enabled adapter profile yet |
| Engine collision relinking and network replication | Not verified by a memory readback; actual game tests remain required |

The adapter opens the known MCC process with ordinary Windows read/write permissions. It does not inject code, create remote threads, patch executable pages, change page protections, alter anti-cheat, or write installed game files. It refuses visible Easy Anti-Cheat processes and also requires the user's explicit launch-mode declaration. This is not a complete detector of anti-cheat state.

The reviewed profile is Steam MCC **1.3528.0.0**:

- `MCC-Win64-Shipping.exe` SHA-256: `be70d6dcd1a884f10ceb342a7a2dcb35ee0fa43181b66a1d19c3d830e9834691`
- `halo1.dll` SHA-256: `0a12dc561780f449d3f4d0df10bb8d3bc7be7840a5beb2b236f672eb6cd42e6c`

These matched the tested installation. Unknown hashes are rejected; an update requires a reviewed profile and new game acceptance. Process lifetime, module base, map header/checksum, table pointers, object body/header type, salt and tag datum are checked again before operations. A map change invalidates the connection. A level reload can reuse identical pointers and identities; the scaling journal is retired only after tag fields and live vehicle sizes are independently back at baseline.

## World weapon and equipment size

Halo reapplies the authored item tag's scale during updates. A successful object-field write alone was immediately overwritten in the real game. Spark now changes the reviewed shared item-size field together with the matching dropped objects' model sizes/bounds. **Resize all matching world items** shows the affected count before applying. Future drops use the same temporary size. Attached/mounted and first-person models are refused by this world-item path.

The native UI tested the shotgun (authored size 1.7×) and frag grenade (1.75×) at 0.5× and 2×, with Ctrl+Z, Ctrl+Y and restoration back to the authored values. Normal disconnect/close restores shared item tags as well as vehicle physics, including a zero authored sentinel where present. A source map is never rewritten.

## Vehicle scale and physics

Choose a live vehicle, review the shared-instance count, and select **Resize all vehicles sharing this physics**. All affected vehicles must be parked and unoccupied before changing size, undoing or restoring. A moving or occupied family is refused before writes. A family with untracked changes, invalid inertia, inconsistent mass points or suspension shared outside its physics scope is also refused.

| Quantity | Uniform factor s |
|---|---|
| Model size, bounds, contact sphere positions/radii, center of mass | s |
| Ground/water depth, antigravity offsets/height | s |
| Suspension animation full extension/compression ground depths | s |
| Total mass and each mass point's cached mass | s³ |
| Inertia tensor and cached moments | s⁵ |
| Inverse inertia | s⁻⁵ |
| Density, gravity scale and dimensionless friction coefficients | unchanged |

These dimensional laws maintain density and couple visual and physical length. Vehicle control still uses the game's authored drive system. Physics and suspension tag edits are shared by matching definitions; Spark refuses visual-only vehicle resizing. Native zero scale means unscaled, effective 1×; undo restores that zero sentinel when applicable. Positive authored item scales are retained as the undo baseline.

The experimental native transport serializes cooperating writers and currently suspends observed MCC threads around several typed field operations. Normal/unwind cleanup attempts one resume for each successful suspend; resume return values, elapsed pause limits and abnormal-termination recovery remain unaccepted ([transport audit](research/C34_LIVE_WRITE_AUDIT.md)). It performs no executable-memory writes or remote calls. Fields are read back; a failed transaction rolls back attempted writes, including a partially written field. An incomplete rollback blocks subsequent resizing and requires a map reload or game restart.

Keep Spark running while using resized vehicles. A 300 ms keeper aligns newly respawned matching vehicle models and bounds with the shared physics. This is not a first-tick engine spawn hook; frame-perfect respawn alignment is not claimed. Normal disconnect and window close restore active vehicle families after parking/exiting. Forced termination cannot guarantee restoration; reloading the map resets temporary tag data. Source map and installed game files are never rewritten.

The first 2× trial exposed sinking tires because suspension animation distances had remained at normal size. Scaling contact geometry alone was insufficient. The corrected pass scales the four Warthog suspension channels, and the owner confirmed the revised tire contact and driving. Other vehicle types need their own in-game visual/handling acceptance; tag readback alone is not that evidence.

The 0.5× Warthog write/readback/restore also passed. Its manual driving result was not received before cleanup, so small-vehicle handling remains unverified. All temporary sizes were restored after testing.

## Two editors

Both people open Spark and a local QuickForge project. The host opens **Shared QuickForge · two editors** and chooses **Host editing session**. The guest enters the host's private IPv4 address, displayed port, and private session key, then chooses **Join and use shared map**. Source backups are made before starting or joining.

The guest adopts the shared QuickForge document. Game assets are not transferred. Asset references are resolved by source SHA-256 to a project in each person's own library. Missing owned assets remain unavailable. The connection ends when that QuickForge editor is closed.

The host serializes revisions. Independent entity/property/axis edits merge; conflicting edits and edit/delete races pause synchronization and retain the local draft. Export that draft before choosing **Use shared version and resume**. Remote changes are rebased across local undo snapshots so undoing X movement retains a collaborator's Y movement.

This is a private LAN/VPN TCP connection with a random session key, a two-editor limit, 4 MiB frame bounds, and bounded revision history. It is **not encrypted**. Only private/loopback/CGNAT IPv4 peers are accepted. No firewall rules, public forwarding, relay service or automatic game hosting are configured. A firewall prompt may need the owner's normal private-network approval.

Each person must connect and bind the local game adapter separately. Source revision agreement is not a game acknowledgement. Authoritative game networking may overwrite a client's memory change. No two-computer MCC replication or co-op acceptance is claimed.

## Evidence and attribution

Core tests exercise movement, nonfinite/stale requests, type/salt changes, coupled dimensions, mass/inertia, suspension depths, shared variants, occupied/moving refusal, partial-write rollback, native zero scale, respawns and restoration after vehicles disappear or the map reloads. A Windows test reads this test process through the real transport. A real TCP socket test covers concurrent revisions, conflict refusal, wrong credentials and the two-editor limit. Native two-window results are recorded in the C33 test card. Fixture tests do not certify game behavior.

Address layout facts are attributed to [HaloCheckpointManager's pinned pointer data](https://github.com/Burnt-o/HaloCheckpointManager/blob/c5f4069a9e79060d0eeb85105636fe17b6b77563/HCMInternal/InternalPointerData.xml) by Maurice Dix / Burnt-o, distributed under the [MIT license](research/LICENSE-HaloCheckpointManager.txt). Spark's transport, checks, transactions, UI and protocol are original implementations. HCM is not bundled or injected.

The [H1A Standalone documentation](https://c20.reclaimers.net/h1/h1-ek/h1-standalone-build/) describes loose-tag reload via `map_name` and the absence of multiplayer networking. Standalone's debug camera is not evidence of independent animated player control or two-player live editing.

The [physics](https://c20.reclaimers.net/h1/tags/physics/) and [model animations](https://c20.reclaimers.net/h1/tags/model_animations/) documentation distinguishes mass-point contacts from render collision geometry and describes suspension depth fields. Tag layout facts were cross-checked against Invader's schemas and the owner's installed, hash-matched module. External implementation code and owned binaries are not bundled.
