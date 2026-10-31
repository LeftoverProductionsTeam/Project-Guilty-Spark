# C41 startup and preview loading

Continues local master `4caf584` and its accepted native audio, asset/compiler and rendering work. This pass reduces serial loading waits. It does not add a new renderer or replace the existing source workflow.

## What changed

The home showcase now requests optional preview-resource preparation when opening a newly discovered MCC campaign source. Native source inspection/copy and MCC texture-pack hashing run concurrently. The result is bound only to a newly created source with the same inspected map identity. An existing project's selected resources are never replaced by this path. Before saving, Spark reads the latest project again, retains its current edits and refuses the automatic binding if its source/resource choice changed or another window owns it.

Model previews also read their first reflection alongside diffuse/detail textures. At most one raw cube response is prefetched for each model being loaded. The normal source/resource checks, six-face decoder and shared texture budget still apply before texture creation. Cancellation cannot admit a late texture into a retired preview. Other cubes retain the existing bounded sequential path.

Every original source copy, per-preview native hash check, resource pin, image decoder, rendering feature and native compiler guard remains in place. No image or shader is omitted to shorten readiness. The CPU decoded-image cache remains 64 MiB and the model preview texture budget remains unchanged.

## Measured result

The [native performance receipt](fixtures/c41-startup-overlap-performance.json) compares two independent fresh-library/WebView runs of each executable. Map work area, canvas resolution, source identities, material IDs, geometry, effects and all authored decals must match. The actual monitor retains its native geometry, diffuse texture, reflection and three animation clips. The OS disk cache is not flushed; results are local observations rather than performance guarantees.

| Measurement | Previous build | This build |
| --- | ---: | ---: |
| Process start to fully ready monitor | 5.949 s | **4.345 s** |
| Warm process to fully ready monitor | 3.275 s | **2.792 s** |
| Showcase initialization after shell | 4.501 s | **3.149 s** |
| Process-cold shell | 1.330 s | 1.086 s |
| Warm-process shell | 0.751 s | 0.767 s |
| First fully textured MCC Blood Gulch | 8.017 s | 7.658 s |
| First fully textured Zombie Apocalypse | 5.564 s | 5.386 s |
| Repeated map switching | 4.593 s | 4.576 s |
| Catalog, 150 of 1,082 assets | 4.097 s | 4.098 s |

Time to the ready showcase improves **27.0% process-cold** and **14.7% warm**. The native request trace confirms that the reflection and bitmap reads overlap rather than disappearing. Repeated switching and catalog preparation are effectively unchanged from the previous pass; the earlier map-switch/cache improvements remain intact.

Zombie Apocalypse still renders **124 materials, 75 compatible MCC bindings, 15 embedded lightmaps and eight decals**. Blood Gulch retains **151 materials, 15 lightmaps, eight decals and 68 reflection bindings**. Missing original Zombie cubemaps remain explicit.

No general CPU or memory reduction is claimed. Settled private bytes after repeat switching measured 1,362.5 → 1,414.2 MiB, while the warm-process checkpoint measured 765.3 → 715.1 MiB. Other checkpoints also varied. The raw process-tree CPU, GPU and memory observations remain in the receipt; allocation/GC timing and WebView behavior affect these samples.

## Regression and preservation

- **604 Windows Rust tests pass**, with seven existing opt-in cases ignored. The new binding test covers concurrent resource/source changes and retention of newer map edits.
- **269 frontend tests, 126 browser checks, 59 offline scripts and two interface probes** pass; TypeScript and optimized Windows/NSIS builds pass.
- Genuine desktop/native asset acceptance preserves the animated monitor, material/reflection previews, default grass/metal, recursive import, native model/collision/cache compilation, corruption refusal and the previous-good output.
- The original-loop native audio challenge passes again against this executable, including 25 source-exact permutations, native attachment/placement, 2,240 unchanged base-tag files and previous-good preservation after a damaged import. [Metadata receipt](fixtures/c41-startup-overlap-validation.json).
- Earlier measurements, releases, source snapshots, unsuccessful experiments, C35–C39 history and the unfinished direct structural compiled-map workflow are retained.

CE's usable menu, genuine client join and collision walkthrough remain unaccepted. In-game MCC listening, game-peer replication and complete rendering/audio parity remain separate gates. The owner is preparing OpenCE/Chupathingy/Xbox content; those folders were inspected read-only and left unchanged. Their gameplay readiness is not inferred from extracted executables or edited configuration files. No remote push, repository-rule change or online About update is claimed.
