# Windows CI: MCC manifest lookup

The reported Windows job compiled successfully, then failed three `mcc_steam` tests:

- `manifest_registration_preserves_existing_lines_and_backup`
- `preserves_utf16_manifest_and_rejects_invalid_encoding`
- `registration_from_canonical_windows_path_is_detected_and_idempotent`

Registration canonicalizes the selected directory before writing its manifest entry. Lookup previously normalized separators, case and Windows verbatim DOS/UNC prefixes but did not resolve the directory. An 8.3 directory alias and its long spelling therefore compared unequal. The earlier prefix correction was necessary but did not cover this case.

Lookup now canonicalizes an available selected directory, matching registration, and retains lexical lookup when the directory is unavailable. It does not rewrite the manifest or probe every unrelated manifest entry. No dependency, lockfile, CI environment or test assertion was weakened.

## Verification on Windows, 2026-10-30

| Check | Result |
|---|---|
| Unmodified source, real short-path `TEMP`/`TMP` supplied only to the test child | Exactly the same three failures; 13 passed, three failed |
| New existing-directory alias regression before the fix | Failed at the manifest lookup assertion |
| Fixed source, same short-path temporary folder, `cargo test -p spark-core --test mcc_steam --locked` | 17 passed, zero failed |
| Fixed source, same short-path temporary folder, `cargo test --workspace --locked` | 519 passed, zero failed, seven existing opt-in tests ignored; 34 result groups |

The temporary-folder alias was obtained from Windows `GetShortPathNameW`, rather than invented by replacing characters in a path. The full test command ran through `node scripts/cargo.mjs`, which selects this checkout's installed Rust toolchain and forwards the Cargo arguments unchanged. Private before/after logs remain in the isolated fix worktree's `.local` folder.

The added portable regression checks an existing `Child/..` alias, the normal directory, a trailing `.` and a different directory. It also confirms repeated registration leaves the manifest byte-identical. Existing Windows verbatim drive/UNC, UTF-8/UTF-16, backup, lock and malformed-input tests remain enabled.

This proves the local Windows failure and correction. GitHub-hosted CI has not been rerun by this change; its next run after pushing must supply that separate result. The broader C39/UI work and unmerged research remain independent.

## Push summary and description

**Summary:** Fix MCC manifest lookup for Windows short-path directory aliases

**Description:** Match manifest lookup to registration by resolving the selected existing mod folder before comparing its path. This fixes the three Windows CI failures caused by short directory aliases while preserving manifest contents, encoding, backups, locking and idempotence. Add an alias regression that fails before the fix. Verify all 17 manifest tests and the complete locked Windows workspace suite under a genuine short-path temporary folder: 519 passed, zero failed, seven existing opt-in tests ignored. GitHub-hosted confirmation is pending the next push.
