# Host validated CE project builds without replacing installed maps

Online now offers the current map's validated CE output alongside installed maps. Starting a project version resolves its native project/build IDs and verifies its saved revision, owned job/receipt, target/header and exact output bytes before preparing a private server copy. Stock and project maps with the same filename remain distinct.

The compact workflow preserves an unavailable project choice instead of silently selecting stock content, guides missing/dirty builds back to the current map's build workspace, follows the newly validated revision after rebuilding, and ignores delayed results for a different project. Active servers retain their frozen built content while source editing continues. Clients are told they need the matching saved map copy.

Validation uses real desktop UI/native IPC, Halo Tool, Invader and CE dedicated processes. A newly built Workshop named bloodgulch loads from its own snapshot while stock Blood Gulch remains byte-identical. Stale/unowned references, corrupted output and redirected receipts are refused; restored valid bytes host again. Prior lifecycle/game-type/window cleanup checks are repeated. Exact identities, totals and measurements are in docs/fixtures/ce-project-host-native.json.

The existing source/reconciliation pipeline, C35–C39 history and unfinished direct compiled-map research are preserved. No client join, traversal, gameplay parity, new LAN/public exposure or game-peer/AI replication is certified. No remote push or repository ruleset change was performed.
