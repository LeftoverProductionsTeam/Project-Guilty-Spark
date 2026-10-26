# Multiplayer hosting boundary

Use Runtimes & friends to inspect a separately installed runtime and its documented hosting/menu plan. Generic application opening does not select a map or create a lobby. Supported interfaces differ by runtime; the app does not invent direct hosting/join command-line switches.

Peer manifests compare map/resource/build identities and optional gameplay configuration/player-count declarations. Agreement is local/self-reported evidence. It never proves a network session, EAC state or synchronized AI. Source/server handoffs remain drafts until tested with the exact runtime and native game-type records.

MCC uses its owned local package workflow and the official Steam launch selector. Exact-scenario Excession metadata is required. Ordinary custom multiplayer does not automatically synchronize arbitrary AI. Campaign co-op needs a deliberately authored, tested mission; MCC Halo CE's two-player limit is distinct from other engines' research goals.

No LAN/private-online/two-client acceptance passed in C32. Complete the original arena compiler/game-load gate, then follow [the multiplayer test plan](MULTIPLAYER_TEST_PLAN.md) and [runtime compatibility](RUNTIME_COMPATIBILITY.md). Extended co-op, expanded player limits, split screen and VR remain explicit research/implementation debt.
