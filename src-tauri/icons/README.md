# Monitor application artwork

`icon.png` is the unaltered 256 × 256 front portrait captured from Spark's actual native Monitor preview. It is the master for the application icon and immediate menu picture. Capture identity, encoder version and each generated file hash are recorded in `app-icon-provenance.json`.

Use the installed Tauri icon encoder with this master and an owned disposable output directory. Regenerate the existing desktop targets; generate the extra 64-pixel PNG with `--png 64`. Preserve the master PNG, and discard unused generated mobile directories. Do not copy game maps, models or native tags into this folder.

The Windows ICO contains 16, 24, 32, 48, 64 and 256-pixel 32-bit images. `scripts/verify-app-icon.ps1` independently extracts the compiled Windows executable icon and compares its pixels and transparency with this ICO. Generated ICNS artwork is not a tested macOS application.

The menu eye/aura tint is saved in Interface Studio → Appearance → Monitor eye. The distributed application icon retains the captured blue eye. Native asset previews still use their exact source/resource identities; this branding image does not certify a map or shader.

Halo and the Monitor character/game artwork belong to Microsoft. See the provenance attribution; the repository code license does not grant rights to Microsoft artwork.
