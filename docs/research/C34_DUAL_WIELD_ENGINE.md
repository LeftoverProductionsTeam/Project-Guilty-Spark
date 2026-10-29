# C34 paired-weapon engine boundary

Inspected 2026-10-28, continuing the existing gameplay controls and C33 live
inventory work. The new source authoring transaction is implemented in
`crates/spark-core/src/dual_wield.rs`; it is not an assertion that native MCC
dual wielding is complete. No game process was modified or launched for this
slice. No upstream engine implementation was copied into Spark.

## Primary sources and versions

| Source | Pinned revision | Inspected contract |
| --- | --- | --- |
| [OpenCE weapon declarations](https://github.com/OpenCommunityEdition/OpenCE/blob/f2597b704d59e66257dba7629f22a0f78f5f3d09/source/items/weapons.h) | `f2597b704d59e66257dba7629f22a0f78f5f3d09`, 2026-10-28 17:38:54 UTC | Trigger and magazine state, FP animation slot enum, weapon control flags |
| [OpenCE weapon update](https://github.com/OpenCommunityEdition/OpenCE/blob/f2597b704d59e66257dba7629f22a0f78f5f3d09/source/items/weapons.c) | same revision | Two trigger evaluation, ammunition consumption, manual and automatic reload paths |
| [OpenCE unit update](https://github.com/OpenCommunityEdition/OpenCE/blob/f2597b704d59e66257dba7629f22a0f78f5f3d09/source/units/units.c) | same revision | The equipped weapon receives primary/secondary controls |
| [OpenCE player input](https://github.com/OpenCommunityEdition/OpenCE/blob/f2597b704d59e66257dba7629f22a0f78f5f3d09/source/game/player_control.c) | same revision | The inspected build maps a secondary trigger through its grenade input path |
| [OpenCE FP presentation](https://github.com/OpenCommunityEdition/OpenCE/blob/f2597b704d59e66257dba7629f22a0f78f5f3d09/source/interface/first_person_weapons.c) | same revision | One current weapon and one state-animation channel per local player |
| [Invader editor documentation](https://github.com/SnowyMouse/invader/blob/696830ff80af227e84e7237c2ef26eb2301ed110/README.md#invader-edit) and [implementation](https://github.com/SnowyMouse/invader/blob/696830ff80af227e84e7237c2ef26eb2301ed110/src/edit/edit.cpp) | `696830ff80af227e84e7237c2ef26eb2301ed110`, 2026-10-03 09:52:52 UTC | Typed `-t`, `-G`, `-C`, `-c key end`, `-S key value` argv and dependency/vector readback formats |
| [Invader weapon schema](https://github.com/SnowyMouse/invader/blob/696830ff80af227e84e7237c2ef26eb2301ed110/src/tag/hek/definition/weapon.json), [animation schema](https://github.com/SnowyMouse/invader/blob/696830ff80af227e84e7237c2ef26eb2301ed110/src/tag/hek/definition/model_animations.json) and [model schema](https://github.com/SnowyMouse/invader/blob/696830ff80af227e84e7237c2ef26eb2301ed110/src/tag/hek/definition/model.json) | same Invader revision | Class-specific references, two triggers/magazines, marker blocks, graph/node/clip fields |
| [c20 weapon reference](https://c20.reclaimers.net/h1/tags/object/item/weapon/) | Accessed 2026-10-28, maintained reverse engineering documentation | Secondary-trigger policy, trigger magazine references and muzzle markers |

OpenCE is AGPLv3; Invader is GPLv3. These sources were read for interoperability
facts. A future engine extension or bundled tool needs its own licensing and
redistribution decision. The source-tag transaction does not bundle either.

## What H1 actually provides

The inspected H1 path has one equipped inventory weapon. Both primary and
secondary trigger controls reach that weapon. A weapon tag supports two
trigger definitions, each referencing its own magazine, so a genuinely authored
paired weapon can consume separate ammunition without alternating the equipped
inventory slot. It is still one inventory weapon. The `normal` secondary mode
does not slave the primary or make one inhibit the other.

Stock manual reload in the inspected `weapons.c` calls magazine index 0.
Automatic empty-trigger reload can choose the trigger's magazine. Magazine 1
therefore does not establish independent manual offhand reload. Reload also
changes the shared weapon state and selects a shared first-person reload
animation. A controller must not invent separate left/right reload channels
from those fields. These are OpenCE source facts; they are not exact MCC binary
ABI evidence.

The native first-person graph maps primary fire to slot **2**, secondary fire
to **14**, reload-empty to **7**, and reload-full to **8**. Slots 7/8 describe
empty/full reloads, not different hands. The FP state machine has one current
animation state; triggering both guns does not, by itself, prove independent
recoil animation, sensible blended hands, or correct split HUD ammunition.

The inspected OpenCE input path drives a secondary control flag using its
grenade action. This is not proof that MCC maps right mouse to that flag. The
existing Spark `InputRouter` describes the desired LMB-left/RMB-right contract,
but an engine adapter must actually consume both controls in a private game.
The C33 inventory reader and `input_hooks_ready: false` do not supply that
missing capability. No new offsets or remote function addresses were inferred.

## Implemented source transaction

`author_pair(workspace, tags, protected_roots, spec, editor)` accepts an already
isolated build job's own `workspace/tags`. The caller must declare immutable
source/SDK roots. It refuses overlap, links/reparse paths, unsafe tag paths,
existing UUID output directories and unsupported target cache families.

The transaction:

1. Hashes the template weapon and provided paired FP model, animation graph
   and world model. Inputs must be regular source files of 64 bytes to 64 MiB.
2. Requires one real ammunition-consuming trigger and one magazine in the
   template. It refuses existing alternate fire, infinite-ammunition magazine
   references and flag/oddball-style `must_be_readied` templates.
3. Requires a separately authored paired FP model, two muzzle marker names in
   the provided FP/world models, matching FP model/graph node identities and
   checksums, nonempty compatible firing/reload clips and correct native graph
   slot assignments. It does not rewrite animation data or turn a stock
   single-gun model into paired geometry.
4. Creates a new `weapons/spark_pairs/<uuid>/paired.weapon` in the isolated
   tags. The editor copies the complete source magazine and trigger blocks,
   preserving their authored data. It assigns trigger 0 to magazine 0 and
   trigger 1 to magazine 1, `normal` secondary mode, no zoom, grenade prevention
   and secondary-overrides-grenade flags, and the paired asset references.
5. Sets finite, bounded per-hand projectile origins. It reads the origins,
   flags, references, trigger/magazine counts and bindings back, plus copied
   ammunition capacities, consumption, projectile, fire-rate and reload fields.
6. Rechecks every input SHA, rejects a no-op editor, hashes the persisted
   output and records a receipt. An error removes only this transaction's
   fresh output and receipt, never recursively removes source directories.

The tag editor is an injected typed interface. The embedding runner must pin
the executable, cap/timeout each subprocess, support cancellation and pass an
argument vector directly. `editor_arguments` constructs individual documented
arguments; it does not construct a shell command or execute a tool. The core
caps inspection at 512 editor calls and each returned field at 8192 bytes.
Regions, permutations, markers, nodes and animation counts have explicit
bounds. Custom Edition uses the legacy 256-clip bound; the H1A source path is
bounded to 2048. Those bounds are parser/tool limits, not performance claims.

The receipt status is `sourceTagsAuthoredGameplayUnverified` and
`nativeGameplayVerified` is always **false**. Source authoring does not install
the tag into the scenario, replace player inventory, compile a native cache,
change MCC input, grant game-peer replication or implement Halo 2 pickup rules.

## Validation and remaining native work

`node scripts/cargo.mjs test -p spark-core --test dual_wield --quiet`
passes **10 tests**. The filesystem tests exercise fresh namespacing, source
hash preservation, protected SDK refusal, model/graph identity and native slot
requirements, separate magazine bindings, copied ammunition fields, origin
readback, executor/no-op failure rollback, existing-target preservation,
untrusted inputs and response/traversal caps. The deterministic editor and tag
bytes are synthetic test fixtures, not native weapon assets or gameplay proof.

The smallest legitimate engine-owned continuation is a paired tag loaded in a
private test cache with real paired FP/world geometry and authored graph, then
an exact-build adapter that delivers both controls without changing inventory
slots, reads both magazine states, and implements offhand reload at the engine
boundary. A stock paired tag can be a firing experiment, not the whole feature.
For an owned OpenCE integration, its public source offers inspectable weapon
control/reload paths; implementing an extension there does not establish an
MCC adapter or permission to copy its engine implementation into Spark.

Native acceptance still needs separate LMB/RMB and simultaneous fire, each
hand's ammo consumption and reload, two visible guns and coherent recoil,
correct projectile/reticle origins, paired ammo HUD, pickup/drop/switch/death,
melee/grenade policy, and host-authoritative two-client results. No current
session consent or runtime measurements for those checks were obtained in this
slice. Existing sprint/camera evidence is not dual-wield evidence.

Automatic approval review rejected running local `invader-edit.exe --help`
because the action executed a local binary outside this research's trusted
executable scope. The rejected action was not retried or bypassed. Its file
SHA matches the C33 tool receipt, but that fact alone did not authorize another
execution. Source contract tests continued; actual Invader command execution,
native paired-asset compilation and in-game dual wielding remain unverified.
