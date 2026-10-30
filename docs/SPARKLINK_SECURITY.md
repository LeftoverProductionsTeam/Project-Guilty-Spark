# SparkLink security boundary

This is a bounded design review and regression record, not an independent penetration test or security certification. The first implementation shares QuickForge source on a private LAN/VPN. The host and local OS remain trusted. See [exact implementation and evidence](CONTINUATION_39_ENGINEERING.md).

## Protected boundaries

Modern LAN sessions use rustls TLS 1.3 with the exact invitation certificate as the trust root. The private invitation join path refuses a LAN invitation without its certificate; plaintext requires the explicit Advanced address/key route. There is no disabled certificate verification, custom cipher, global trust-store change or automatic plaintext downgrade. The ephemeral private signing key stays in host memory. Recovery generates a fresh certificate and invitations. Certificate generation/validation use [rcgen](https://docs.rs/rcgen/) and [rustls](https://docs.rs/rustls/); their resolved versions and licenses are recorded separately.

Joining requires a high-entropy Editor/Viewer invitation. Each member then uses a separate random credential; the host journal retains its SHA-256, not its raw value. Roles and revocations are checked at the authoritative server for every mutation. A revoked credential cannot use an old connection or rejoin using its existing identity. Revocation also rotates invitation keys. The owner alone manages roles and native builds.

The protocol has only join, poll, source proposal, inverse operation and leave messages. It exposes no generic file read/write, process launch, shell, archive extraction, game-memory or native-tool command. Documents reject unknown fields and validate native tag paths, finite transforms and authoring limits. Incoming frames are bounded at 4 MiB, persisted pending proposals at 2 MiB and journals at 24 MiB. Private IPv4 endpoints only, eight online participants, 64 retained identities, eight concurrent socket workers, timeouts, per-member request limits and bounded transaction/ack histories constrain work. These bounds do not establish internet-facing denial-of-service resistance.

Host acceptance checks operation identity, authenticated author, base revision, expected state, source validation and active structure leases. Journal publication verifies its current head before writing a new checkpoint and head. Recovery checks exact hashes/identity and takes an exclusive OS file lock. Acknowledgement follows persistence. These checks protect against stale/replayed/conflicting network proposals and accidental local corruption; they do not defend against a malicious administrator controlling the host's files or process.

Native IPC additionally binds session controls and private invitations to the owning map/window. Other windows receive only the active map's descriptive status. Guest network messages cannot invoke those local IPC commands. Build bindings and recovery paths are constructed under owned roots from validated UUIDs, not received arbitrary filesystem paths.

## Remaining risks and non-goals

- An invitation is a bearer secret. Send it over a trusted private channel; certificate pinning cannot rescue a deliberately replaced invitation. Display names are self-declared.
- The trusted host can inspect and edit shared source. This is not an end-to-end encrypted multi-party system hiding data from the host.
- Guest credentials and pending drafts are stored in the local private library, not an OS credential vault. Protect the local account/data root. No production Steam identity, account service, relay authorization or internet rendezvous is added.
- Legacy address/key mode is explicitly opt-in and remains unencrypted/in-memory. The optional Spacewar helper uses its separate SDK transport. Neither route is counted as a fresh TLS/multi-machine acceptance.
- The native-content extension transfers only complete scenery files matching the exact locally admitted template SHA-256, at most 16 KiB each and eight publications. Every participant must independently admit the same source/dependency inventory. A field proposal names the supported semantic operation; it cannot supply an offset or byte patch. No network message starts a validator, editor or compiler. Arbitrary model/sound/animation uploads and executable transfers remain unsupported. [Native admission and actual acceptance](C39_NATIVE_CONTENT_ACCEPTANCE.md).
- No automatic host election, hostile-host recovery, online service, arbitrary offline merge or universal filesystem durability guarantee is claimed. Power loss, physical disk corruption and permission failures still require recovery review.
- Eight configured slots are not an eight-machine performance result. The actual process count, network and measurements belong in the evidence receipt. Halo engine changes and game-peer replication retain separate authority and acceptance gates.

The regression suite includes wrong-certificate refusal, malformed protocol/credentials/oversized frames, public endpoint refusal, replay deduplication, same-cell/edit-delete conflicts, Viewer/Owner boundaries, exclusive recovery and corrupt-checkpoint refusal. Native process acceptance exercises the subset recorded in its receipt. Existing source/SDK preservation rules remain in effect.
