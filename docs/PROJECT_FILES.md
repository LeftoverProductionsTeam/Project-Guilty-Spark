# Spark project, session and native files

A Spark `.gsproject` is the existing versioned project descriptor. It stores source identities, staged edits, references, target settings and optional QuickForge source. Native Halo tags, JMS, scenarios, BSPs and compiled caches retain their existing formats. SparkLink does not require a new Halo tag format or game protocol.

C39 adds private application session metadata outside the native tag tree:

| File/state | Purpose |
| --- | --- |
| `studio-sessions/<owned UUID>/state-a.json`, `state-b.json` | Alternating bounded source checkpoints, validated transactions, acknowledgement identities and member credential hashes. |
| `studio-sessions/<owned UUID>/head.json` | Atomic selector binding one exact checkpoint hash, session and revision. |
| Session host lock | Exclusive OS lock; stale process death releases ownership. A filename alone is not the lock. |
| Private library settings | Host-session index, guest identity/credential and the retained unacknowledged proposal for each map. Do not publish the database. |
| `jobs/<owned UUID>/studio-binding.json` | Frozen session/revision, project fingerprint and portable document hash for an authoritative native build. |
| `jobs/<owned UUID>/workspace/project.gsproject` | Existing QuickForge build input snapshot. Opening that result does not mark the newer draft built. |

Checkpoint schema 1 and network protocol 4 describe application collaboration only. Operation UUIDs are stable across retries; authoritative revision and authenticated author identify accepted changes. A name or matching filename does not establish ownership or asset compatibility. Source references use exact SHA-256/native tag identities; local library IDs are resolved on each PC.

Cameras, selection, drawers and recording preferences use the existing per-map local session state and are not synchronized. The native-content extension stores an immutable source inventory, one semantic field and bounded complete admitted `.scenery` publications in the optional shared native document. Private `studio-native/<UUID>/tags` forks and admission/recovery receipts remain outside the native game format; build materialization writes standard native tags into a fresh isolated tree. General tag schemas, arbitrary binary assets, scripts, assembled BSP projects and project-wide collaboration remain separate future phases. Preserve the full local library and source dependencies when backing up; a descriptor or journal alone cannot recreate missing assets.
