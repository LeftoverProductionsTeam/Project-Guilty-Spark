# QuickForge BSP pipeline

Editable `.gsproject` geometry → bounded source validation → JMS 8200 → isolated tag staging → Halo Tool `structure` → Invader scenario configuration → Tool `lightmaps` → Invader cache build → engine/scenario/CRC checks → separate package and game acceptance.

The native mesh generator and source exporter share brush geometry. Grid snapping is authoring only. Imported cache BSPs remain read-only; there is no arbitrary binary BSP resizing or general room/tunnel Boolean reconstruction.

In Settings, distinguish **classic HEK** from **H1A Editing Kit**, select the separately installed kit, select complete legal editable base tags, and select Invader. Classic Tool uses conventional `data`/`tags` paths inside the isolated job. H1A uses its documented content-directory overrides. MCC and CE targets are gated by the selected kit generation; native extended-engine compilation remains unverified.

Exports produce original JMS, authoring JSON, a scenario command plan and dependency/blocker records. A compiler job copies tags into a new owned directory and hashes inputs/tools. It rejects stale generated namespaces and ambiguous shader basenames before Tool execution. Normal cancellation waits for sensitive tag-writing phases to finish, then stops remaining stages. A crash/power loss can still leave the isolated output incomplete.

Draft lighting uses fast radiosity; final lighting uses the configured higher-quality command. Neither option promises a fixed compilation time. A validated receipt requires actual outputs and structural/cache checks. Exported source, a configured folder, or a zero tool exit alone cannot certify a playable map.

**C32 result:** native source export verified; Tool compilation blocked because no kit/complete editable tag tree is configured. See [current evidence](CONTINUATION_32_ENGINEERING.md). Deployment remains an explicit separate operation using the existing owned-output safeguards and exact-scenario metadata requirements.

References: [Tool](https://c20.reclaimers.net/h1/h1-ek/h1-tool/), [materials](https://c20.reclaimers.net/h1/source-data/h1-materials/), [box level](https://c20.reclaimers.net/h1/guides/levels/box-level/).
