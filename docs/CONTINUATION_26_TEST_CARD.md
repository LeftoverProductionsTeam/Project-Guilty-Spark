# Continuation 26 Windows and Halo acceptance card

**Baseline:** C25 verified source. **Delivery:** C26 cumulative SOURCE ZIP. Do not mistake an offline script for Halo gameplay evidence.

| Check | Evidence required | Status |
| --- | --- | --- |
| C25 ZIP baseline SHA and integrity | Exact external SHA256 + no damaged ZIP entries | PASS (source recovery) |
| C26 dependency-free offline suite | `npm run test:offline`, all existing and new modules | PASS (container) |
| C26 TypeScript changed pure modules | strict `tsc --noEmit`, all added dependency-free files | PASS (container) |
| Changed React components syntax | TypeScript TSX transpiler syntactic diagnostics | PASS (container) |
| C26 ZIP extraction + manifest | Re-extract release, compare all stored hashes, re-run tests | PASS (container) |
| Rust/Cargo and native Tauri build | `cargo test` + Windows desktop startup and real event handling | NOT RUN: Rust/Windows unavailable here |
| Genuine owned `bitm` UI image | actual preserved source, verified original SHA/resource and displayed header; clears on switch | NOT RUN on owner's game |
| Room/tunnel CSG and collision | sealed manifold world, source aperture, Tool WRL, compiled collision map | NOT IMPLEMENTED for arbitrary cuts |
| Unique small seam translation | near-miss exactly paired tunnels, undo/redo and source revalidation | PASS synthetic source; NOT RUN native editor UI |
| OBJ serialization integrity | emitted source face order, positions, normal/UV quantization, truncated/corrupt refusal | PASS offline; NOT RUN external OBJ importer |
| JMS source import and native Halo Tool | version 8200, first actual structure/collision/portal build, unmodified originals | NOT RUN |
| Real imported tag/BSP edit and round-trip | per-class tag read-edit-save-compile, reference integrity and in-game proof | NOT IMPLEMENTED; partial read-only inspection/extraction exists |
| Five multiplayer modes / Firefight / Zombie | compile and start game, score objectives, AI network with 2 clients | NOT RUN / not implemented as full gameplay |

**First recommended user action:** Extract C26 ZIP in a new, empty directory. Once confirmed, proceed with native prerequisites and desktop startup ONE STEP AT A TIME. Never overwrite the C25 backup or original Halo map.
