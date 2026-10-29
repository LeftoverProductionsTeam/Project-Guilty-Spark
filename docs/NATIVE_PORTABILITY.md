# Native Halo preservation and portability

Spark keeps native compatibility as the default. It does not add mandatory Halo tag classes, replace native tags with Spark containers, or introduce a game networking protocol. Editor layouts, camera/take metadata, undo, provenance, assembly recipes and compatibility reports belong outside native tags. Supported exported tags remain usable by their matching native tools without a Spark project file.

## Architecture and evidence

Original maps remain immutable managed copies. Authoring changes are semantic overlays; extraction, native editing and compilation use isolated derived files. A source hash, exact target, tool identity and dependency closure are prerequisites, not proof of gameplay. Target profiles come from the existing runtime registry, including separate PC/CE/demo/Mac/Xbox/MCC/community/extension identities. A shared cache number does not make their schemas or protocols interchangeable.

The former cache patcher rewrote every placement component during an unrelated tag edit. A renderer's JSON round trip can normalize negative zero, producing an unintended native byte change. C36 writes only changed components and semantically changed fields. Its preservation verifier checks every byte against permitted field/placement spans. Unknown bytes outside those spans must be identical. This proof covers the derived extraction input; later extractor/tool serialization and cache repacking have separate evidence.

Native MCC conversion inventories all loose input tags immediately before and after H1A Tool. Added, removed or changed files withhold acceptance. The input manifest and measured inventory times remain beside the job. Intentional compatibility edits occur before this checkpoint and remain separately recorded. This adds bounded full-tree I/O; it is an integrity cost, not a claimed optimization.

Semantic comparison resolves native class/path identities and reference destinations independently of relocated cache datums/offsets. It compares only inspected fields, reports missing/unpaired data and caps displayed lists while retaining full totals. It does not certify unknown payloads, visual/audio equivalence, script behavior or gameplay. Every accepted native conversion writes readable and machine-readable semantic reports.

Portability Lab lives under **Build & playtest**, keeping diagnostics outside the world viewport. It can inspect up to eight existing profiles, report reviewed model/shader/resource/script/extension hazards, verify unchanged bytes, save reports and compare an owned validated build. **Review native changes** returns to this comparison. Only the existing MCC imported-map conversion pipeline is implemented; other profile descriptors retain their exact limitations.

## BSP detail protection

[C20 documents](https://c20.reclaimers.net/h1/tags/detail_object_collection/) Sapien cluster-setting clears and CE/H1A detail-height shifts. Spark's BSP audio writer snapshots native detail counts and typed placement/cell/Z-reference metadata before serialization. The native source format is read by a pinned separately installed Invader, rather than treating loose tags as cache pointers.

Invader's inspected float display rounds values. Matching displayed Z references cannot establish exact native preservation after a save. Consequently, a BSP audio edit containing painted detail payload is stopped before writing; the original, copied BSP and snapshot remain recoverable. Empty-detail edits get a before/after detail gate. Unchanged whole native files remain exact evidence. This gate is intentionally conservative and covers Spark's BSP audio writer; generic external Sapien resaves are not thereby certified. A complete exact detail-payload reader and broader external-save snapshots remain work.

## Practical workflow

1. Open an owned map and select its target profiles in **Build & playtest → Portability Lab**.
2. Inspect findings. Use matching source resources and native tools; review unsupported classes, scripts and extensions. Save the JSON/readable report.
3. Verify untouched native bytes. A compressed/unsupported source must use a dedicated extraction path rather than an invented byte patch.
4. Prepare a separate target tagset and use the supported build workflow. Native `model`/`gbxmodel`, generic/Chicago shaders and H1A fields need explicit target-specific treatment; class renaming is not conversion.
5. Review semantic changes and native input preservation. Repacking is not byte identity, and structural compilation is not game acceptance.
6. Load the result in the matching runtime, then test visuals, sound, scripts, gameplay and peers separately.

Primary format/workflow references: [H1 tags](https://c20.reclaimers.net/h1/tags/), [porting](https://c20.reclaimers.net/h1/guides/porting-maps/), [Gearbox model](https://c20.reclaimers.net/h1/tags/gbxmodel/) and [generic transparent shaders](https://c20.reclaimers.net/h1/tags/shader/shader_transparent_generic/). This policy summarizes independently implemented behavior; it does not copy upstream implementations. C20 documentation retains CC BY-SA 3.0 attribution. See [community credits](../COMMUNITY_CREDITS.md), [C36 evidence](CONTINUATION_36_ENGINEERING.md) and [remaining limits](KNOWN_LIMITATIONS.md).
