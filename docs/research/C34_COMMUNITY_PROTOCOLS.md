# C34 community protocol integration evidence

Research and read-only provider observation: 2026-10-28. This record describes
the implementation in `crates/spark-core/src/community_servers.rs` and its app
integration. It does not certify a game join, dedicated server, two-client game,
or 128-player performance.

## Pinned primary sources and reuse boundary

| Project | Revision inspected | Commit timestamp UTC | Evidence used |
| --- | --- | --- | --- |
| ChupathingyCE | `c5a07c69589ab8d40180fc99eac993bc06b06ebb` | 2026-10-28 22:29:37 | Delta List, invitation handoff, game-owned compatibility and actor/co-op boundaries |
| OpenCE | `f2597b704d59e66257dba7629f22a0f78f5f3d09` | 2026-10-28 17:38:54 | Runtime prerequisites, Custom Edition folders, invitation handoff and advertised capacity |

Sources at those revisions:

- [Delta services and framing](https://github.com/ChupathingyCE/chupathingyce/blob/c5a07c69589ab8d40180fc99eac993bc06b06ebb/docs/delta.md)
- [Compatibility design and implementation stages](https://github.com/ChupathingyCE/chupathingyce/blob/c5a07c69589ab8d40180fc99eac993bc06b06ebb/docs/delta-compatibility.md)
- [Current protocol constants and compatibility rows](https://github.com/ChupathingyCE/chupathingyce/blob/c5a07c69589ab8d40180fc99eac993bc06b06ebb/port/linux/include/delta.h)
- [Runtime setup and invitation CLI](https://github.com/ChupathingyCE/chupathingyce/blob/c5a07c69589ab8d40180fc99eac993bc06b06ebb/port/linux/README.md)
- [Dedicated server administration](https://github.com/ChupathingyCE/chupathingyce/blob/c5a07c69589ab8d40180fc99eac993bc06b06ebb/server/docs/admin.md)
- [Netcode ownership and BSP progression](https://github.com/ChupathingyCE/chupathingyce/blob/c5a07c69589ab8d40180fc99eac993bc06b06ebb/port/linux/NETCODE.md)
- [Actor integration](https://github.com/ChupathingyCE/chupathingyce/blob/c5a07c69589ab8d40180fc99eac993bc06b06ebb/port/linux/game/network_actors.c)
- [Campaign integration](https://github.com/ChupathingyCE/chupathingyce/blob/c5a07c69589ab8d40180fc99eac993bc06b06ebb/port/linux/game/network_coop.c)
- [OpenCE prerequisites and capacity claims](https://github.com/OpenCommunityEdition/OpenCE/blob/f2597b704d59e66257dba7629f22a0f78f5f3d09/README.md)
- [OpenCE runtime and invite documentation](https://github.com/OpenCommunityEdition/OpenCE/blob/f2597b704d59e66257dba7629f22a0f78f5f3d09/port/linux/README.md)

ChupathingyCE's inspected root license is GPLv3; OpenCE's is AGPLv3. These
repositories are research sources, not dependencies linked or shipped by this
slice. No engine implementation, signed compatibility table loader, tunnel,
cryptography or game assets were copied. Spark's original Rust code reads the
documented public response and constructs the documented invitation argument.
Any future engine extension needs its own licensing/provenance review.

## Actual provider response

One ordinary read-only `GET https://stats.chupathingy.org/v1/games` returned
HTTP 200 and `application/json` on 2026-10-28 at approximately 23:27 UTC.
The captured response was 30,986 bytes with a `games` array of 47 rows. It
contained announced Delta games, OpenCE broker listings, and older listings
without an identified protocol. Maximum advertised capacity was 128; this is
an advertisement, not a measured or game-verified limit.

The observation retained field types and aggregate counts only in this record.
The raw snapshot is ignored local research material; no real invitation,
player name, roster, account information or game endpoint is a test fixture.
The unit fixture substitutes synthetic names and invitation bytes.

Observed fields included `invite`, `name`, `map`, `gametype`, `engine`,
`players`, `maximum_players`, `open`, `in_progress`, `version`, `age`,
`source`, `platform`, `hosting`, `protocol`, `family`, `build`,
`capabilities`, `verified`, and `locked`. Some flags are 0/1 integers;
others are booleans. Empty optional strings occur. The provider's
`verified` flag is a provider claim, not Spark's evidence tier.

The response did **not** contain an advertised Delta wire range, map file
digest or a host address. Its invitation is 64 hexadecimal digits. Spark
does not discover addresses, probe hosts, exchange keys, link profiles,
announce/withdraw games, upload stats or call administration endpoints while
browsing.

## Implemented contract and bounds

The core API has no network or process side effects:

| Entry point | Behavior |
| --- | --- |
| `parse_delta_listing(bytes, fetched_at_unix)` | Validate and isolate rows, normalize map families, deduplicate invitation identities, produce a serializable listing without invitation tokens or rosters |
| `profile_from_inventory(registration, installation, inventory)` | Bind the selected registration to its inspected executable and local map/resource inventory |
| `assess_join(server, client)` | Return concrete setup blockers or `readyForRuntimeCheck`, always with connection outcome `notObserved` |
| `prepare_join(server, client, now_unix)` | Recheck freshness and prerequisites; return one typed `halo://join/<64hex>` argument, never a shell command |
| `ListingRefreshGate` | Limit attempted refreshes, including failures; do not extend stale cache lifetime after an error |

The app owns the bounded HTTPS client and process lifecycle. The intended
request policy is a fixed provider endpoint, no redirects, no arbitrary
server-supplied URLs, a 15-second request deadline, a 1 MiB response ceiling,
512 rows maximum, and a shared 30-second minimum interval and cache TTL.
Reject oversized bodies before parsing. Honor the interval on service errors
and explicit refresh clicks. Cache expiry is not renewed on failed refresh.

The parser bounds unsigned counts, protocol numbers, age, string lengths,
path components and capabilities. Its maximum accepted numeric player count
is 1024 solely as a metadata/display bound, not a supported engine capacity.
An upstream advertisement older than 120 seconds cannot become a join;
time spent in Spark's cache also counts against that age. Wrong envelopes
fail the request. Malformed/duplicate rows are skipped and counted without
including hostile text in diagnostics. Unknown optional fields are ignored;
unknown protocol/family rows remain visible but cannot join.

Serialized listings expose SHA-256 invitation IDs, not invitations. Both the
server and join-target debug representations redact invitation material.
Preparation never uses the OS URI association: the app must select the
explicit inspected registered executable, revalidate it, and pass the URI
as one argv element. This avoids accidentally opening another `halo://`
handler or evaluating names/launch parameters with a shell.

## Compatibility decisions

The following distinctions are retained in code:

- Delta List is a community provider. It is not MCC's lobby API, a classic
  Halo PC/CE server protocol, or Spark's editor collaboration session.
- An OpenCE-derived runtime loading a Custom Edition cache does not make a
  classic Custom Edition executable compatible with its invite tunnel.
- The JSON `version` is the legacy network number. It is not the app build,
  Delta major, wire ID, operating system or content version.
- The pinned `delta.h` identifies Delta major 1 and wire `chupa-39a`.
  Its wire rows reach `chupa-28a`, with the console floor at `chupa-32a`.
  The compatibility design document also contains older exact-wire and
  in-progress sections. Spark does not infer a wire or supported range from
  the app version, JSON legacy number, or those design sections.
- Spark currently requires an exact **declared** local legacy number for a
  prepared handoff. A different/unknown number remains blocked pending a
  proven game-owned negotiation path. No signed table is downloaded or
  impersonated, and no version field is rewritten to force a join. This
  conservative bound can hide otherwise compatible cross-version joins;
  the runtime's own browser remains the supported investigation route.
- Even an exact declared number is only a handoff prerequisite. The game
  still owns its wire handshake, mode support, authoritative content checks
  and final refusal. A started process or forwarded invitation is not an
  observed successful connection.

Map identity is family-specific: Xbox, CE (`@ce`), PC (`@pc`), HaloMD
(`@md`), and named Xbox packs. Logical level paths are accepted as metadata;
traversal, URLs and conflicting suffix/family claims are rejected. The same
filename in another family is not a match. The inventory helper accepts
only inspected cache generations in matching family folders. A valid Xbox
`ui.map` is a necessary startup prerequisite, not proof of all base assets.
MCC cache generation 13 does not satisfy that requirement.

For CE resources, the matching folder needs inspected `bitmaps.map`,
`sounds.map` and `loc.map`. OpenCE uses `custom_maps`; Chupathingy supports
its documented `maps_ce` family folder as well. PC/HaloMD resource handling
is conservative in the current helper and must be validated per actual
runtime/content build. Named packs remain visible but the existing inventory
adapter does not inventory arbitrary pack folders, so Spark explains missing
content rather than fabricating a match. No automatic download is started.

The listing has no map hash. Spark can report an inspected local map, never
remote hash equality. Chupathingy's game-owned MAP capability can check a
Halo PC-family file identity after joining; legacy-only combinations have
weaker checks. Same-named modified maps must not be labelled verified by the
browser. A real two-client test with deliberate same-name content mismatch
remains required before a gameplay compatibility claim.

Full, closed, locked/password, stale, missing-data, malformed, unknown-version
and wrong-runtime cases do not generate invitation targets. Passwords are not
accepted or logged by Spark; password-wrapped invitations are not implemented.

## Separate game and hosting integration boundaries

The inspected upstream actor implementation makes the host own AI decisions
and sends actor controls/corrections to clients. Its co-op implementation
replicates host script/device/named-object state and whole-party BSP
progression. These are engine features; reading a server list or relaying a
Spark editor TCP session does not enable them in MCC or a classic CE client.
Whole-party BSP progression is not independent per-player world streaming.
No actor/co-op engine code was copied into Spark in this slice.

Delta Control is optional. It uses authenticated administration on its own
endpoint, plain HTTP on loopback or HTTPS off-loopback, with bearer-token
credentials and command authorization. Spark has not contacted any public
server's administration endpoint and does not enable it. Delta Link's
account/server linking is also separate from a game invitation.

Upstream player-host and dedicated-host defaults can be public. Spark must
not silently launch a host using those defaults. A controlled host lifecycle
needs explicit owner approval, `network.host_public=false` or the documented
dedicated-server private setting, verified binary/content identity, owner-held
authentication, and two actual clients. No private server was started by this
research/provider implementation, and no public server was joined or probed.

## Verification and remaining acceptance

Focused Rust tests cover the observed JSON shape, untrusted names and URI
payloads, malformed numeric/flag/path fields, envelope bounds, duplicate
invitations, token redaction, unknown protocol, wrong runtimes, map-family and
resource mismatch, base-data requirements, locked/full/old games, cache expiry,
clock rollback and refresh throttling. Tests use synthetic metadata, not a
real roster or invitation.

The real provider capture is separately parsed locally as a schema check.
`node scripts/cargo.mjs run -p spark-core --example community_listing_check --
<captured-response.json>` reads only an explicitly provided local response and
prints aggregate counts. The captured 30,986-byte response parsed 47 rows with
zero rejected rows. This check exposed 26 valid rows with empty `gametype`
labels; they now remain listed with an unknown label instead of being dropped.
`node scripts/cargo.mjs test -p spark-core --lib community_servers -- --nocapture`
passed all 15 focused tests after that correction and inventory-helper tests.
App/native and real game outcome evidence belongs in the C34 engineering
report and cumulative ledger. A real compatible community join, actual
content-mismatch refusal, controlled private host with two game clients,
disconnect recovery and measured scaling remain acceptance gates. The
provider makes those paths inspectable; it does not replace their tests.
