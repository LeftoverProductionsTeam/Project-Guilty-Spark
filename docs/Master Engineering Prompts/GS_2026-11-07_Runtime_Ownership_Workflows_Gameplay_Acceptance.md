# GUILTY SPARK — RUNTIME OWNERSHIP, COMPLETE WORKFLOWS & GAMEPLAY ACCEPTANCE

Continue the current active work on local master. Do not restart completed work or interrupt running native tests unnecessarily.

## 1. Two supported runtime setup modes

In the existing Games & Tools setup, users must be offered:

**A. Use Existing Runtimes**
- Select existing Chupathingy, OpenH1, OpenCE, Faber, MCC or other compatible installations.
- Discover and validate their executables, required files, map directories, settings and mods.
- Treat supplied installations as user-owned; never automatically replace, relocate, upgrade, delete or reorganize them.
- Preserve each runtime's existing settings, saves and mod configuration.
- Allow individual runtimes to be disconnected without deleting their files.

**B. Spark-Managed Dynamic Runtimes**
- Let Spark create one organized managed runtime location.
- Download and install verified official engine packages into isolated, versioned internal directories.
- Present one shared Halo content library for original maps, Custom Edition maps and resources.
- Maintain compatible engine-specific data views and separate writable profiles.
- Preserve user mods independently of stock engine packages.
- Support runtime selection, updates, verification and rollback without replacing unrelated engine files.

Both modes must support one-click launch and survive app restart.

A user should never need to maintain six duplicate sets of original Halo maps.

Preserve existing user-designated game installations, ISOs, `.map` files, extracted assets, C49 release and recovery files.

Prove both setup modes through actual mouse/keyboard controls, then launch at least two real runtimes and verify original hashes remain unchanged.

## 2. Dual wielding and sprint

These are not stock Halo CE features.

Audit the actual installed runtime revisions and Spark source before claiming support.

If a runtime has an existing, verified implementation, integrate its configuration and native gameplay controls.

If no implementation exists, record the missing engine capability, identify an appropriate opt-in engine-side approach and keep it separate from stock compatibility.

**Dual wielding acceptance:**
- Equip two supported weapons simultaneously.
- Independently fire each weapon.
- Handle independent ammunition, reloads, pickups, swaps and dropping.
- Validate HUD, first-person/third-person animations and controller mappings.
- Validate multiplayer host/peer weapon state and damage.
- Preserve ordinary single-weapon behavior when disabled.

**Sprint acceptance:**
- Activate and deactivate sprint with a configurable input.
- Demonstrate actual movement and animation state changes.
- Validate acceleration, turning, jumping, weapon handling and collisions.
- Verify interaction with vehicles, AI, multiplayer prediction and synchronization.
- Preserve classic Halo movement when disabled.

Implement these only for approved runtime capabilities. Do not fake dual wielding by rapidly swapping one weapon, or fake sprint by changing a movement-speed setting without working input/state/gameplay.

If native support is missing, distinguish editor configuration from playable runtime support.

## 3. Guided walkthrough

Finish the user-facing walkthrough in Spark's existing interface.

It must be accessible to first-time users and manually restartable.

Include actual controls for opening maps, inspecting tags, editing levels, importing assets, building maps, selecting runtimes and launching gameplay.

Allow users to skip, close, restart and permanently disable the walkthrough in Settings.

Validate mouse, keyboard, menu, button and pop-out workflows. Ensure the guide does not obscure critical editing controls.

## 4. MegaWorld — all 19 map regions

Continue the real Timberland–Sidewinder seam, resolving the native shader-dependency failure before calling the connection accepted.

The full 19-region goal includes:

- Natural, edge-to-edge BSP terrain connections.
- Mountain routes, sniper positions, caves, tunnels, doors and multi-region paths.
- Vehicle-capable traversal through or around all 19 regions.
- Preservation of original interiors and distinctive map architecture.
- A randomized, host-authoritative teleporter web.
- Correct collision, visibility, portals, physics, lighting, materials and gameplay.

Vehicle access around an enclosed map must not be misrepresented as a Warthog driving through every original interior.

Investigate safe BSP optimization, visibility culling, resource budgets, level-of-detail techniques and runtime-specific limits. Do not blindly decimate collision or original playable geometry.

Test Warthog handling on real slopes, curves, transitions and intersections.

Record traversal acceptance for each neighboring region pair and confirm vehicle connectivity across the complete world.

## 5. Required proof

For every feature, verify the actual user journey:

**Find control → operate → Undo/Redo where applicable → Save → close → reopen → native build → launch → actual gameplay → multiplayer or VR acceptance where applicable.**

Report each stage separately.

Keep OpenH1 Windows VR pending until an upstream-compatible implementation is available and tested. Continue Spark's independent VR editor authoring work without duplicating OpenH1.

Do not introduce new worktrees, duplicate subsystems, uncontrolled downloads or destructive runtime-file swapping.

**Finish the runtime setup currently in progress, verify its real launch paths, then return to the first native MegaWorld terrain seam. Keep dual wielding, sprint and VR gameplay open until their respective engines actually prove them.**

No feature is complete because a toggle exists. It must work from the user's actual controls through the native game.