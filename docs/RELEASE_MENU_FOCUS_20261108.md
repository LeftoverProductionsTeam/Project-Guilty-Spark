# Release menu focus repair — 8 November2026

The exact6d9bb4b Windows candidate was correctly refused by the release gate. Six groups passed, then the full browser suite reported255passes/1failure: View → End could lose Reset layout focus. The installer/portable/source files were built and staged, but are unsealed and unaccepted. No publication occurred; C49 and the sealed c035b68 candidate remain protected.

## Cause and scoped repair

A keyboard request can arrive before an opening menu has its first measured pages. The old pager tried one animation-frame callback using its previous layout. The next real measurement made Reset layout inert/off-page on page1 of2 and the browser returned focus to body. This is a user-facing focus lifecycle defect, not grounds to relax a timeout or hide an assertion.

The existing PagedSurface now remembers the requested control through actual layout measurement and page selection, then focuses it after its page is reachable. New pointer/keyboard input cancels the older request; unrelated focused controls retain ownership. The same mounted controls, history/state owner, source identities, paging algorithm, reachability checks and storage budgets remain. No new menu/controller or arbitrary delay was added.

The directly observed map-creation notice also distinguishes Preview materials assigned from native tag preparation. Preview assignment is not a claim that all textures have decoded or that native compilation is ready. Missing source prerequisites still appear explicitly; native validation is unchanged.

## Evidence

Private E = C:/Users/patri/AppData/Local/Temp/GuiltySpark-Engineering-d49eb02588bf.

- Failed exact release: E/release-6d9bb4b-preview3/gates-windows/gates.json and browser.log. Diagnostic: View remains open, Reset layout inert:true/aria-hidden:true/offpage:true, active element body.
- Initial R280 fixture missed the race because its first measurement was already queued; its pass is not a reproduction. R281/R282 defer measurement before mount, then wait for actual measured pages. R282 reproduces the same body/inert/page1 failure. R283 repeats that unchanged-source failure five times; the attempted source edit was refused by its exact line-ending anchor and did not apply.
- R284 after the real source repair:15/15 strict focused cases pass. R285 adds later-input ownership and zero-scroll assertions:20/20pass across five repeats of four cases. Measured result: page2, Reset fixture layout focused, inert:false/offpage:false, viewport scrollTop0. The competing input retains focus/value x after its later gesture.
- R286 full frontend:472tests/103files pass; TypeScript passes. No Rust source changed after the previously accepted894/9ignored result; the next exact-source release gate will repeat the full matrix.
- Direct Windows Computer Use initializes again. On the actual unsealed portable app, File → New → Multiplayer Map creates an isolated owned project, Ctrl+S reaches Saved, and normal Alt+F4 closes it. The disposable library/profile is removed. This spot check does not certify every command, restart recovery or game behavior. It exposed the ambiguous material notice above. The new focus behavior still requires source-matched native/package verification.

Next: commit this bounded repair with refreshed source checksums, run all nine release groups on that exact clean revision, then build/verify a fresh Windows candidate. Do not seal or publish the failed6d9 preview3. Hosted CI still requires the owner's push/workflow action. Human traversal, real two-computer/gameplay, physical multi-monitor/DPI, headset, Linux/macOS and full product acceptance remain open.

## Exact release follow-through

dc4456ed58d3bdc26889e210fdaf7d51dced1f92 passes all nine release groups including258browser cases, then actual packaged native preview/project tests. Direct Computer Use observes View→End visibly focusing Reset layout and the corrected map-creation notice. Real installer/portable startup and owned uninstall pass; preview4 is sealed and independently verified locally. No hosted-CI/publication, physical monitor or gameplay pass is inferred. See RELEASE_CANDIDATE_20261108.md for exact files/hashes and owner handoff.
