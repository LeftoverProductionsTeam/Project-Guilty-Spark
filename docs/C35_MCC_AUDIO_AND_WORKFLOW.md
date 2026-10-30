# C35 r12 — automatic MCC audio and usable sound controls

This pass continues the existing C35 workbench. It fixes the overlapping sound controls, connects supported installed audio automatically, and preserves every authored main track when importing a looping sound. Existing map edits, per-map histories, texture bindings, source files and earlier releases remain preserved.

## Sound workflow

Opening a source map now checks its original/configured resources and the connected MCC installation. Classic caches use an exactly matched, hash-pinned `sounds.map`. MCC Halo 1 caches use the installed classic `sounds_adpcm.fsb` with its `sounds_adpcm.lst.bin` index. MCC's Custom Edition `sounds.map` is not substituted for stock MCC sound offsets. The audio binding is separate from texture resources and does not change the native build fingerprint.

Discovery runs outside the UI thread. Its result merges only audio metadata into the latest project and every undo/redo snapshot, including when another map becomes active before the result returns. It neither launches Halo nor modifies the installation. Already pinned resources retain their identity; changed bytes are rejected rather than silently accepted.

The bank reader checks bounded FSB5/index dimensions, exact tag and pitch-group paths, original pitch indices, complete permutation names, rate, channel count, frame count and encoded length. A documented classic `old_sfx` namespace mapping is permitted only after an exact path lookup fails. It rechecks the same open file handles after reading the selected span. Unsupported formats and missing samples remain explicit.

**Add all source tracks** and sound-library placement import every authored main track together, retaining each gain and its intro/loop/end reference. The edit is atomic: a failed sample or an exceeded 64-emitter limit leaves no partial group. Ctrl+Z and redo operate on the whole import. **Import current BSP ambience** saves the current assigned group for editing and Director audio. Stable identities let the saved mix replace the automatic group without doubling voices. Alternate/detail/script behaviors remain separate.

The sound styles previously lived in a lazily loaded hosting stylesheet. Opening the sound drawer before hosting therefore left fieldsets and labels unstyled. The mixer now imports its own scoped stylesheet. Volume, voice-limit and emitter fields have visible labels; mute/solo controls have explicit spacing; buttons wrap and numeric inputs fit narrow drawers. The existing theme and nonmodal editing flow remain intact.

## Verification

The real MCC Blood Gulch source resolves both Warthog engine tracks. Core inspection verifies all **16 permutations across four authored phases**, and selected previews pass WAV frame/rate/channel checks. The source SHA-256 is `1b712ba7e0f634716f55cd7c840737ab2aa9dd9ae17c1bb161a158e7c4e6b102`. The pinned bank is `d9a70adcb681bcb152a50ea61904fc921d2d94aff3000fe3d2827823c9e49e88`; its index is `d469b6d72c7d8f6d141da2b61c14b29862a57d3563ebb195e3829f18db742a78`.

The final Windows executable automatically connects the bank without a folder picker, imports/saves both tracks, and undoes/redoes the group together without changing scene objects or tag edits. Its production WebView2 mixer renders both real tracks with relative waveform error below `0.000001`; removing the second track produces a measurable mismatch, and mute produces zero output. Actual drawer checks at 280, 360 and 520 pixels retain separated mute/solo labels and contained inputs. A native 360-pixel screenshot was visually reviewed. The same executable also passes the existing Zombie Demo/MCC rendering, selected-image/material, tag-tree, header/window-hit-target and fullscreen regressions.

Validation passes **471 Rust tests** with five opt-in tests ignored, **216 frontend tests in 44 files**, **77 browser tests**, **59 offline checks**, TypeScript and the Windows release/NSIS build. The 13 focused thread tests are included in the Rust total. Vite's existing large-main-chunk warning remains; no new performance benchmark is claimed.

Final metrics and artifact hashes are recorded in the [sanitized verification receipt](fixtures/c35-mcc-audio-native-verification.json). The opt-in native harness uses a copied development executable, fresh QA library/profile and the owner's local source map. Private audio, screenshots and complete logs stay outside Git and the source ZIP. The normal user library and installed game files are excluded from edits.

## Thread-release regression

The Windows suite exposed a shutdown race between the thread liveness probe and `ResumeThread`. Cleanup now makes one resume attempt and, after a zero/error result, briefly observes the same retained handle for actual termination. An unknown or still-live handle remains a mismatch/failure; cleanup never adds a second decrement to hide it. Deterministic interleaving tests and actual owned child-process tests cover this behavior. Process exit alone is not taken as proof that a particular retained thread handle is signaled. See Microsoft's [resume-count semantics](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-resumethread), [wait results](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-waitforsingleobject) and [process termination](https://learn.microsoft.com/en-us/windows/win32/procthread/terminating-a-process).

## Remaining gates

This reader supports MCC classic ADPCM effects. **CELT music/dialogue**, native vehicle RPM/function modulation, alternate/detail/script sound events, acoustic obstruction/reverb and complete game audio parity remain open. Native mixer verification uses WebView2 offline rendering; it does not establish speaker/headphone listening or in-game sound behavior.

Engine-owned update boundaries, abnormal-exit recovery, paired dual-wield firing, player sword/lunge, arbitrary live spawning/BSP replacement, game-peer replication, foreign-lobby translation and expanded-player acceptance remain open. No Halo process or game-memory write was part of this pass. All 319 cumulative requirement identities remain in the ledger; they are not completion totals.
