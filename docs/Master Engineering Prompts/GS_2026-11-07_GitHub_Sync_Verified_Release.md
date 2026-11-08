# PROJECT GUILTY SPARK — GITHUB SYNC & VERIFIED RELEASE BUILD

**Execute this task now. Do not stop at planning or documentation.**

Repository: `LeftoverProductionsTeam/Project-Guilty-Spark`

The latest GitHub README update is commit `5095e9b9ea0979448cd571d56659b4076e5930a2`. Preserve and integrate it.

## Objective

Publish Guilty Spark's latest validated source to GitHub, update outdated project documentation, prepare the latest development map for appropriate distribution, and produce real downloadable release candidates.

### 1. Safely synchronize development

- Inspect current local master, dirty files, staged edits, active jobs, preserved assets and Git history.
- Reconcile GitHub's new README commit with local development. Do not overwrite either version blindly.
- Preserve the current runtime-manager work, 19-map Atlas, Timberland–Sidewinder seam, walkthrough, mod management, OpenH1 integration research and all previous features.
- Finish relevant regression tests and commit the validated changes to the existing canonical master.
- Push the validated source to GitHub using a normal non-force push. Respect branch protection; report any blocked push instead of bypassing it.
- Do not create additional branches, worktrees or repository copies.

### 2. Latest development map

Locate the newest **actual compiled MegaWorld development map** and matching source project.

Verify:
- Exact source commit and native build receipt.
- Original source-map hashes.
- Native compilation and independent readback.
- Presence of both original regions and intended connections.
- Current gameplay acceptance status.
- Ownership, attribution and redistribution rights.

Do not mistake a 19-map Atlas sidecar for a compiled 19-map world.

Do not upload proprietary Halo assets or a map containing unlicensed redistributed content. If the compiled cache cannot legally be distributed, publish the permitted source/metadata/evidence and retain the binary privately.

Preserve all original maps and previous-good builds.

### 3. Refresh GitHub documentation

Update README, ROADMAP, CHANGELOG and relevant current-feature documentation against the exact committed source.

Prominently describe:
- Guilty Spark's all-in-one Halo creator vision.
- 19-map MegaWorld Atlas and actual connection status.
- Chupathingy as the preferred standard runtime.
- OpenH1 as the VR editing and gameplay integration target.
- OpenCE/Faber creator integration.
- Shared Halo library and runtime management.
- Native map, tag, BSP, asset, machinima and multiplayer workflows.
- Verified features versus experimental or unfinished capabilities.
- Installation, first-run setup and downloadable releases.

Use current verified screenshots where available.

Never claim unverified Warthog traversal, full multiplayer AI synchronization, in-headset VR editing or Windows OpenH1 VR support.

### 4. Build genuine releases

Reuse the existing `.github/workflows/release.yml`, `scripts/release/` packaging and verification systems.

**Windows x64 — required**
- Build the latest validated source.
- Produce a real NSIS installer.
- Produce a portable ZIP.
- Run package verification, application startup and install/uninstall tests.
- Generate source/binary hashes and release notes.

**Linux x64 — attempt**
- Build actual AppImage and DEB packages.
- Run native startup verification.
- Record failures accurately; do not publish unsuccessful packages.

**macOS — investigate and implement where feasible**
- Audit Tauri/macOS packaging requirements.
- Produce a real `.app`/`.dmg` only when dependencies, packaging and native launch validation pass.
- Do not relabel a Windows/Linux artifact as a macOS release.

Never remove or overwrite the preserved C49 Windows packages.

### 5. GitHub Release delivery

Run the existing release-candidate workflow against the **exact newly pushed commit**, not an older C49 snapshot.

Use a new versioned release candidate, leaving prior tags intact.

Create a GitHub draft pre-release containing all verified platform packages, SHA-256 manifests, release notes and accurate known limitations.

Verify uploaded assets by downloading them and checking their hashes. Do not confuse temporary GitHub Actions artifacts with release attachments.

Do not make the draft public unless the required release checks pass and publication is authorized. Do not package game maps, runtimes or proprietary Halo assets into the Spark installer.

Update the README download instructions to point to actual release assets only after they exist.

### 6. Finish with proof

Report:
- Latest local and GitHub commit SHA.
- Exact source changes pushed.
- README/roadmap status.
- Development map identity and distribution status.
- Windows installer name, size, checksum and GitHub location.
- Windows portable ZIP name, size, checksum and GitHub location.
- Linux/macOS build outcomes.
- Draft release URL and verification evidence.
- Any genuinely unresolved release blockers.

**Completion requires real binaries, verified packaging, synced source and correctly updated documentation.**

Do not spend this session adding unrelated features or merely proposing more work.

**Get Guilty Spark into a verified, downloadable release-candidate state while preserving every existing feature and original Halo asset.**