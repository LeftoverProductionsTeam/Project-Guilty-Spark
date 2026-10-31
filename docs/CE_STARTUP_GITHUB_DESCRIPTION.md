# Complete CE first-run files and add checked startup guidance

Continue `d3b4d29` with the existing native build, source preservation and private-client safeguards intact. Checked extraction now retains the EULA module and known chat-control DLLs; private client snapshots retain the EULA module and text. Missing or invalid startup files are reported by name, while existing dedicated-server-capable registrations remain usable. Replacement installation uses a new separate folder.

CE client launch now requests a normal visible window explicitly, owns the suspended process and binds its cleanup job before resuming. Unicode arguments remain bounded and quoted; executable paths and arguments are never supplied by remote or frontend callers. First-run help adds a menu-only setup action using the isolated test profile, a dependency-setup shortcut, and recovery guidance when a playtest remains open without verified connection evidence.

Validation includes real Windows child startup flags, genuine desktop/native host and compiler cases, a fresh checked HTTPS extraction, source/game inventory preservation and the combined Rust/frontend/browser/offline suites. Exact measurements and final binary identities are in `docs/CE_STARTUP_AND_FIRST_RUN.md` and its linked receipts.

The earlier zero-player evidence is preserved. These changes do not certify that the previous invisible-window stall or a real client join is resolved. Visual first-run completion, player joining, collision traversal, gameplay parity, game-peer replication and direct compiled-map editing remain open. Publication stays owner-controlled; no protected-master push, ruleset change or remote CI success is claimed.
