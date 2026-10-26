# 07 Halo Modding Brain — Source continuation 2

## Baseline

Exactly the previous delivered `Project_Guilty_Spark_07_Halo_Modding_Brain_v0.3_Source_Continuation.zip`, not an older v0.3.0 tree. See `SOURCE_DIFF_FROM_PREVIOUS.txt` for baseline-relative file hashes and changed paths.

## What's new

- User-selected Halo-style DXT DDS (BC1/2/3) and standard image preview in actual BSP shader material regions, with bounded decoding and safe disposal.
- Sculptable terrain tile source brush with heightfield persistence, raise/lower/flatten/smooth editing, 3D preview and rebuilt source JMS geometry.
- Hollow, sealed-annulus cave tunnel brush with non-closed end passages. Note: this is *not* an integrated traversable compiled BSP cave.
- Source-only Halo CE mission, cinematic and finite Firefight script exporters with strict scenario reference validation; explicit manual gate rather than a fake completion signal; dependency manifests.
- One-click ZIP export of generated HSC sources and their binding manifests, with ZIP path-safety tests.
- Rust Creator Studio persistence accepts optional trigger-volume/timer/camera binding fields. Creator Studio remains outside compiled-game build fingerprints to avoid invalidating historical build receipts for metadata-only changes.
- New Rust terrain/cave unit tests and all-offline frontend tests; do not mistake unrun Rust tests for a pass.

## How to try safely

**Step 1 only:** extract this ZIP into a new folder, not the old editor directory or any Halo game installation. Then run `npm run test:offline` from that source folder with Node 22. Report the result before performing any compiler or in-game step.

Full build on Windows later requires owner-installed Node/pnpm, a Rust toolchain and Windows SDK/WebView2. The source tree intentionally keeps package version `0.3.0`, because a compiled release has not been validated.

See `PHASE_01_TO_10_ACCEPTANCE.md` for the scope and proof requirements.
