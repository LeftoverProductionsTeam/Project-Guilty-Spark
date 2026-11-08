# Latest-source Windows release candidate — 7 November 2026

This continuation preserves upstream README commit 5095e9b9ea0979448cd571d56659b4076e5930a2, the 205b4e7 Atlas foundation, unfinished terrain seam source, runtime packages, walkthrough and native pack management. The application version remains 0.4.1; the new intended tag is v0.4.1-preview.2. Existing tags and the accepted C49 packages are never replaced. Each generated manifest binds its own exact source commit and tree.

## Delivery and permissions

The owner selected “Prepare the verified files; I’ll push and run the release workflow.” Git’s dry-run push reported no saved login. The connected GitHub account can read the repository, but no available connector dispatches a workflow or uploads Release assets while preserving the exact local commit. No remote source or Release write is claimed. The public Releases API returned an empty list during this continuation.

After reviewing the locally verified commit, push existing master normally. Open Actions → Release candidate (build or draft) → Run workflow. Set source_commit to the complete pushed commit from the local package manifest, preview_number to 2 (or another unused number), prepare_draft to true and build_linux to true to attempt Linux. The workflow requires master ancestry, complete gates, real startup and package checks; it attaches only accepted platform files to a new draft and re-downloads every asset to verify its hash. It never publishes automatically or overwrites a tag. If branch protection blocks the push, preserve the commit and report the rule; do not force or weaken it.

## Acceptance boundaries

Local test and package results are recorded below only after the corresponding operation finishes. Host-local install/startup is not clean-machine Windows acceptance. Signing, no-Halo VM/upgrade/repair and broad GPU compatibility remain separate release gates. No game maps, resource banks, runtime engines, SDK tags or private logs enter the installer/portable/source assets.

Linux: this Windows host has no WSL distribution, Linux build environment or native Linux GUI. Genuine AppImage/DEB builds and X11/Wayland startup therefore require the existing Linux CI job or a native host. Do not attach failed or unlaunched packages. macOS: no macOS/Xcode/signing environment exists here; app/DMG packaging, startup, entitlements and notarization remain unaccepted. Windows can proceed independently.

## MegaWorld development map

The newest retained successful native prototype identified during this continuation is closure-native-r6-megaworld.map: 82,753,578 bytes, SHA-256 2611cac26411cea6197d72bfe691bc894c8d1920e8b6f209ccddd9ec39d067ae. Its recorded build target is MCC classic (mcc-cea), 16,252 collision triangles, independent connected BSP reference and CRC mismatch count zero. It contains the Timberland/Sidewinder prototype, not a compiled 19-map world.

Original CE Timberland: 69d539409004bde866e3fb510d43fa9e155fb8dd0525fe6e2ffe1efe3664e0ea. Original CE Sidewinder: ac8580a914f96249fa10fd95ee10065a4513fd6147f1d1e2d768adae59407b4a. The bounded native receipt retains the original project identity, alignment/route metadata and independent readback; the ephemeral original native-output workspace is disposed. The source base was 9078cd8 with a recorded dirty-source fingerprint; the subsequent prototype integration is 6c0c62f. Do not falsely label the old cache as built from this release commit or the newer natural-seam source.

Human two-way region traversal, Warthog routes, portal behavior in actual gameplay and peer acceptance remain open. Raw source project/native cache resources include proprietary Halo content; redistribution rights are not established. The cache stays private. Only Spark-owned build recipes, source code, hash/geometry diagnostics and permitted metadata are included in public source.

## Current regression and package record

Verification is in progress; final result and exact output identities are stored in the external candidate manifest and release handoff. A local source commit, successful compiler, preview image or staging step alone is not complete release acceptance.
