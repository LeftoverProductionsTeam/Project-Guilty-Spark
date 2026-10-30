# C35 r11 — Rendering repair and a connected editing workflow

Continue the existing C35 branch from R10 commit 5bbbcd7e925b7f67d6d6fced3ebec86de739ab1b. Sources, user projects, SDK files and earlier release artifacts remain preserved. This pass addresses the reported hollow models, black decals/teleporters and workbench navigation problems.

## Rendering

Cached Halo triangles are converted to the renderer's front-face convention using their authored normals. Source vertex/UV data, material slots and triangle identities remain unchanged. Imported workshop meshes retain their authored winding. Environment shaders show front surfaces with back-face culling; model and transparent shaders retain their explicit two-sided settings.

Read-only transparent-generic metadata now includes bounded texture stages, register-combiner operations, source constants and UV animation. The material audit and viewport planner accept that decoded shader type. This routing matters: decoding a texture independently does not prove that the viewport actually assigns it. Native checks require the teleporter/material IDs in the viewport's assigned shader set.

MCC texture packs remain the preferred exact imeta/ipak source. Some legacy shader images are absent there but present in MCC's own bitmaps.map. That file is separately SHA-256 pinned; the fallback requires the exact tag/image key and the entire declared raw span inside its unique indexed entry, with readback hash verification. Existing MCC projects refresh their resource binding when opened. No filename guessing or unrelated bitmap replacement is used.

Decals use their source framebuffer operation, intensity and top-row texture orientation. Pure addition and alpha-multiply-add use distinct blend factors. Painted markings retain clipped BSP geometry and lightmap coordinates. Environment and transparent materials no longer gain opaque fallback semantics through an unsupported primary-material audit.

## Workbench flow

The brand/title row and map tabs are one 40-pixel header, reduced to 34 pixels in fullscreen. Window actions are small unoutlined icons, centered in the actual upper-right header layout through a portal. Their pointer targets avoid the resize corner. There is one fullscreen mode, activated by F11 or its button; the separate Focus mode and header-hiding workflow are retired. Map tabs, viewport editing tools, runtime actions and current drawers remain available.

Drawer tabs use quiet shared surfaces and a clear active accent. Drawers attach to their edge instead of appearing as separate bright frames. The sliders icon opens position/size/pinning controls. Escape closes that popup before the drawer; another Escape exits fullscreen. Narrow editing strips provide More for every drawer. The original selected theme remains in use and there is no screen-covering drawer backdrop.

The Object tags drawer fits its contents instead of filling the screen with unused space. Field controls are tighter; long forms still scroll. The full Tag Editor puts editable fields first, with extraction, transfer and complete native editing under disclosures. Distinct React keys for duplication and lineage panels prevent a previous tag's duplicate controls from surviving a tag change. A regression switches between different tags and requires exactly one panel for the new selection.

Tag Editor groups the real cache index into collapsible classes. Expanding a class reveals all its matching tags; choosing a tag retains the shared field editor, dependency navigation and history. Search opens matching classes; collapse state, selection and filters are remembered per map. Folding a class does not clear the selected tag. Native tag editing is available through the existing runtime tool-plan workflow.

Spark exposes its audited typed fields directly. A complete arbitrary-field schema for every Halo tag class is still not implemented. Full source-tag editing requires compatible extracted tags and the matching native editor, followed by a build. Unknown bytes are preserved rather than advertised as editable controls.

The flow audit covers remembered onboarding, map switching, per-map selections/tools/history, source versus build/play runtime labels, direct tag drawers, asset placement, native tool handoff, narrow layouts and fullscreen restoration. The source map's cache family is explicit in Level Editor, independent of the chosen runtime.

## Evidence and limits

Validation results and exact executable identities are recorded in [native evidence](fixtures/c35-rendering-workflow-native-verification.json). Regression checks include GPU pixels for single-sided exterior faces, source blending and generic stages; native Blood Gulch/Zombie Demo inspection; real renderer shader assignment; window hit targets; class-tree selection; and original-file hashes. Render screenshots stay in private local QA storage.

Final checks: 464 Rust tests passed with five opt-in tests ignored; 206 frontend tests in 43 files; 75 browser tests; and 59 offline checks. TypeScript, Vite, the release executable and the NSIS installer build successfully. The isolated native rendering, close-up and offline audio/viewport runs use the same R11 executable hash. These checks establish the reported editor behavior, not full engine rendering parity.

A supplementary focused native R10 audio run verified actual authored ambience, gain changes, zero rendered output while muted and uninterrupted playback through drawers. Its executable hash is retained separately; it does not become an R11 physical listening or engine-audio claim.

Full shader/game lighting parity, object-driven shader functions, native game sound/event acoustics and gameplay acceptance remain separate work. No Halo game process or multiplayer test was fabricated for this UI/rendering pass.

## Reproduction

Use scripts/test-rendering-workflow-native.mjs with --app, --output, --demo and --mcc; --closeups yes selects the model and portal close-ups. Inputs must be the owner's Demo Blood Gulch/Zombie variant and installed MCC Blood Gulch. The output directory must be new. The harness creates its own library and WebView profile and only closes its own process.

The source ZIP excludes maps, pixels, SDK tags, binaries, private QA data, build caches and latestspark.zip. R8 and R10 files present before this pass are independently rehashed; absent older release files are not reconstructed. Master is unchanged. The user retains the push/merge step.
