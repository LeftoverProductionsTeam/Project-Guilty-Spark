# Continuation 23 — one-step-at-a-time owner test card

This checklist is **reference only**. Give the user ONE action at a time and wait for the outcome before the next.

1. Download the exact full C23 source ZIP, compare its SHA-256 with the supplied digest, and extract into a **fresh empty folder**. Do not merge with C22 or an installed game directory.
2. Run the dependency-free `npm run test:offline` from the C23 source root with Node 22; inspect any failures before proceeding.
3. In an isolated trusted Windows developer environment, install only the project's approved dependencies and run `npm run build` and `cargo test --workspace`. Treat any compiler/type errors as blockers. There is no prebuilt Windows executable in this ZIP.
4. Create a new Guilty Spark Five-mode Test Arena and expand **Geometry & Build → BSP source topology**. Inspect shell counts, zero-area/duplicate issues and source warnings. Run the **Export BSP topology review** control; confirm `compilerVerified=false` and a source SHA-256. The report contains no coordinates or proprietary tags.
5. For a throwaway intentionally malformed brush, verify non-manifold, degenerate or winding issues prevent JMS source export. Revert the edit before any real build. Verify old versions are unchanged.
6. Only after source and native tests pass, select a legitimate, separately backed-up Halo CE Editing Kit in an isolated worktree. Export a uniquely named JMS, compile with `Tool structure` and inspect the authentic WRL/log; do not forcibly close Tool mid-write.
7. Confirm a real, newly compiled Halo map, collision, portals, lightmaps and five game modes in the matching Halo runtime; capture map hash, Tool identity and a second-client match. Mark each as **NOT RUN** until performed.

**Stop on unexpected output, source corruption or unknown tool version.** A clean C23 geometry report is not permission to replace real maps or stock tags.
