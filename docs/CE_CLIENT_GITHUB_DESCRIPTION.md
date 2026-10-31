# Prepare and launch matching CE playtest clients

Continue `306c6e5` without replacing source history or unfinished research. Online → Host game now prepares and launches a local CE client from the private server's exact game snapshot. Validated project builds retain their saved revision and native cache identity, including when their filename matches a stock map. Test profiles remain separate from the user's normal saves.

Launch rechecks in-memory copy identities, refuses altered files and added plugins, and holds checked inputs against write/delete sharing while the client runs. Editable receipts do not authorize execution. Actions are scoped to the owning Spark window/session, support cancellation and reject concurrent preparations. Client stop leaves its server available; server/window closure and abrupt Spark exit clean up owned children. No remote execution, raw patch broadcast or arbitrary console command path was added.

Validation uses genuine desktop/native IPC, the CE engine and Halo Tool/Invader compilation, plus Rust, frontend, browser and offline regressions. The final evidence and measurements are in `docs/fixtures/ce-matching-client-native.json` and `docs/CE_MATCHING_CLIENT_PLAYTEST.md`.

File preparation and process launch are accepted separately from a joined player. Client joining, first-run visual acceptance, collision traversal, gameplay/render/audio parity, classic CE LAN/public exposure, game-peer/AI replication and universal conversion remain open. Direct compiled-map authoring remains unfinished, and all C35–C39 source/reconciliation safeguards and experimental research are preserved.

Publication is owner-controlled. This local continuation does not push to protected master, bypass repository rules or change the ruleset. Remote CI and clean-machine installation have not been verified by these local tests.
