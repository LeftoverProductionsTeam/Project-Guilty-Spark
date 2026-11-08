# Owner request — Persistent MegaWorld extraction, 7 November 2026

Status: requested; native gameplay, authoring and peer acceptance not yet implemented or accepted. Keep the active compact responsive UI/release gate first. Reuse existing MegaWorld, Creator Studio, native scenario/AI/Firefight, runtime adapters and source-preservation systems.

## Requested gameplay

- Begin an extraction mode akin to Marathon on MegaWorld.
- Start with a plasma pistol and no shields.
- A Chupathingy-compatible menu lets the player choose inventory to take in, collect items, extract them and bank them. Overshields, health packs, better weapons and ammunition should matter.
- No raid timer. The world persists.
- Include real dual wielding and sprint. Do not rename a speed change or an editor preview as completed native mechanics.
- Reuse supported OpenCE/Chupathingy bots, like their Red vs Blue server behavior, without assuming identical implementations.
- Spark's workflow tools must author the complete mode and map features, not require a hidden engineering demo.
- Covenant and Flood spawn in the world, synchronize for players and create PvPvE pressure alongside hostile players.
- Package the mode through a maintained, documented Chupathingy drop-in loader. A plain native map must not be claimed to add engine-level persistence or an unavailable plugin interface.
- Proximity voice is optional per server/game mode; ordinary Halo and other servers remain unchanged. Milenko may implement it if the verified engine changes are sufficiently small; no contact or upstream changes are authorized.
- Investigate opt-in proximity chat through Chupathingy's existing voice system. This is a feasibility request, not confirmation of a positional API.

## Native boundaries

Standard maps/tags/HaloScript remain independent where the engine supports them. Durable banked inventory, persistent world ownership, PvPvE replication, dual wielding, sprint and positional voice may need maintained engine-specific support. Confirm actual version-pinned interfaces before writing an adapter. No guessed fields, arbitrary memory writes, microphone capture, new competing networking/voice stack or public server by default.

## Acceptance to preserve

Author the map and encounters through visible Spark controls; compile and inspect standard output; load the exact target; prove loadout, shield/health/loot behavior, extraction and bank persistence across restart; verify actual bots/Covenant/Flood combat and loot consistency with real peers, late join and reconnect; verify dual wielding/sprint animations and ownership; test voice only after deliberate opt-in with real positional and mute behavior. A simulator, matching IDs, timer-free UI or an inventory sidecar alone is not gameplay acceptance.
