# Firefight engine boundary

`crates/spark-core/src/firefight.rs` implements deterministic **offline authoring simulation**. Project rules, actual source actor-variant identities and spawn zones are editable in the existing application. The separate HaloScript authoring/exporter produces source that still needs a valid scenario and real script compilation.

The director tracks preparation, countdown, wave start, active/boss waves, completion, intermission, next wave, victory and defeat. Pending requests count toward capacity. Spawn acknowledgements, kills, player lives/revives and actor progress use explicit IDs; stale/duplicate events are refused. Failed spawns retry with bounded new IDs; stuck actors stop the simulation rather than disappearing or awarding unearned score. Deterministic scaling, finite/endless rounds and event/time limits are tested.

Recovered Zombie Apocalypse presets resolve real imported actor-variant paths and source hashes. They do not replace historical actors with unrelated stock enemies. Original spawner mechanics, missing sounds and malformed placements remain separate restoration work.

No game-side director bridge, network wave protocol, synchronized score or playable Firefight mission has been verified. The build workflow blocks Firefight execution claims. [Current tests and limitations](CONTINUATION_32_ENGINEERING.md), [original mechanics](ZOMBIE_AUDIO_AND_SPAWN_EVIDENCE.md) and [multiplayer feasibility](MCC_MULTIPLAYER_AI_FEASIBILITY.md) remain authoritative.
