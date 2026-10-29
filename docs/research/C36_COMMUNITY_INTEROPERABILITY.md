# C36 community multiplayer integration

The existing browser, provider deduplication, runtime/content checks and private invitation handoff remain in place. Spark does not add a gameplay protocol or a separate public server pool. A successful invitation handoff remains distinct from joining, spawning and playing.

## Implemented correction

Spark rejected a valid Chupathingy private invitation: `halo://join/p` followed by 72 hexadecimal digits. The [pinned header](https://github.com/ChupathingyCE/chupathingyce/blob/fa0f2df4958459e82359df6f41b325a7344d477c/port/linux/src/p2p_internal.h) and [parser](https://github.com/ChupathingyCE/chupathingyce/blob/fa0f2df4958459e82359df6f41b325a7344d477c/port/linux/src/p2p_crypto.c) define its host hash, door and check. Spark now recognizes the exact bounded format and hands the opaque argument only to the inspected Chupathingy client. The game owns the password prompt and cryptographic validation. OpenCE, web and MCC routes refuse this format. Existing content, executable, window-owner and expiry checks remain required.

Five focused invitation tests pass, including two new cases for the protected format, wrong clients, redaction, truncation, extension, oversized values and command/URL injection. No client, server or game was launched by these tests. No engine or cryptographic code was copied.

## Audited upstream boundaries

| Project | Revision | Scope established by source |
|---|---|---|
| Chupathingy | `fa0f2df4958459e82359df6f41b325a7344d477c` | Built-in legacy announce 32; accepted legacy range 11–40; Delta wire `chupa-39a`. Effective signed-table values can change independently. |
| OpenCE | `70c5e600ea345345db040ce1914903cc6746b46e` | Built-in legacy announce 39; native/browser interoperability belongs to its own documented implementation. |
| Warthog Xbox | `66d1392c2cfc10d52b62d431ad2cf41844a705ad` | Test homebrew target; its declared capabilities do not establish stock Xbox, Gearbox or MCC interoperability. |
| Project Reclaimer releases | `19988e213f79d2b17b2239f1e58019f52e375650` | Halo 3 releases; unpublished engine source is not an open Halo 1 adapter. |

These are pinned observations, not a new permanently valid compatibility table. Chupathingy's [Delta documentation](https://github.com/ChupathingyCE/chupathingyce/blob/fa0f2df4958459e82359df6f41b325a7344d477c/docs/delta.md) excludes browser-build interoperability. Its [compatibility design](https://github.com/ChupathingyCE/chupathingyce/blob/fa0f2df4958459e82359df6f41b325a7344d477c/docs/delta-compatibility.md) includes planned sections. Read those separately from implemented guarantees. Compare the actual [OpenCE revision](https://github.com/OpenCommunityEdition/OpenCE/tree/70c5e600ea345345db040ce1914903cc6746b46e), [Warthog revision](https://github.com/ChupathingyCE/chupathingyce/tree/66d1392c2cfc10d52b62d431ad2cf41844a705ad) and [Reclaimer release repository](https://github.com/ProjectReclaimer/project-reclaimer-releases/tree/19988e213f79d2b17b2239f1e58019f52e375650).

The observed Delta List response returned 50 listings over HTTP 200, without map digests or Delta wire/range fields. Spark's exact-number gate remains conservative and can reject compatible cross-version clients. It must not be relaxed on unsigned/incomplete listing data. Legacy announcement numbers, accepted ranges, signed effective compatibility and Delta wire versions are different concepts.

A local search found MCC and H1A TagTest, but no configured OpenCE/Chupathingy private-test client in the inspected locations. A real private join still needs that client, its required owned Xbox base UI/content, matching target map and a controlled host/client encounter. Listing and parser evidence do not prove gameplay, AI agreement or expanded player counts. MCC-to-community wire translation remains unimplemented.

Modern Chupathingy/Warthog sources carry GPLv3 obligations; current OpenCE carries AGPLv3 obligations. Source visibility and process separation do not by themselves resolve reuse requirements. This correction uses original Rust validation of a documented invitation grammar; no upstream engine code or proprietary content is redistributed.
