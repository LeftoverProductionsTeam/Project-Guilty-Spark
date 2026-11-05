# Overnight engineering — 5 November 2026

Continue from67589b0 on canonical local master. Preserve the475-row cumulative ledger, original Master Engineering Prompts04–28 and all existing source/evidence. Owner explicitly authorizes independent work while human/approval gates remain pending. This report records completed workflows, not whole-directive acceptance.

## Configured native map export

The local commit containing this section closes the missing connection between Storage's mod/runtime export preferences and actual map output. The existing Build history and Smart Edit result expose one compact Export map control. Explicit export uses the selected runtime folder or mod/default folder. Build jobs remain authoritative; export does not convert, install, launch or publish a map.

Existing build/native validation, runtime format-family rules and shared storage reservations are reused. Export streams64KiB chunks, validates the exact saved project/build receipt and source hash, reserves space, refuses original game/tool/project trees, preserves native filename/bytes and verifies the final hash. Repeated identical exports reuse their file; modified, incomplete or foreign exports are preserved and refused. Optional Spark receipt metadata stays beside the standard map. Changing the hosting runtime cannot reinterpret source bytes.

Evidence in `artifacts/overnight-20261105` and `artifacts/qa/overnight-native-export`:

- Core filesystem contracts:3passed, including20identical exports with zero growth, CE/OpenCE/Chupathingy byte reuse, wrong target, changed source, foreign directory, tampered export and quota refusal.
- Browser contracts:6passed, including explicit save-first/runtime choice/refusal and stale cross-map result isolation. These use synthetic IPC, separately from native acceptance.
- Native application unit tests:135passed/2ignored. Storage/continuity13passed; TypeScript and embedded desktop build pass.
- Actual embedded Windows application:3cases/0errors. Owned MCC BSP/material queues settle; real pistol edit/Undo/Save/direct-map copy independently reads0.225 with Invader CRC mismatch0 and original unchanged. Explicit export to the default configured folder has SHA45c596247b213ddb1532f2c3dadd6e3d484c5b1d2fabef4f177b376b7280f5c7, reuses identical output and refuses CE before creating Mods. Tested executable SHA6a7637ec105949ab30fbff4ac31324ba762702081e5b2ced451458bb99e24441.

The native runner now uses the existing shared QA reservation lifecycle for every mode. The first export acceptance used the preceding preflight-only runner; its complete receipts remain genuine and its directory is retained. No test was relabeled to imply a hard OS filesystem quota.

## Explicit open gates and next work

Part2's compiler admission and sampled writer checks do not provide an OS hard disk ceiling. Windows' documented [NTFS quota command](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/fsutil-quota) applies per volume/user; applying it would affect unrelated files. No volume/security/system changes were made. This platform constraint remains open, alongside clean-machine/platform acceptance and deliberately unimplemented unattended backup deletion. The backup policy remains a cap with explicit reviewed cleanup.

Next actionable queue item is Master Prompt05/C70's existing private Blender OBJ fork → actual external edit/save detection → reviewed import → author Undo/Save/reopen → native model/collision/scenery compilation and independent readback. Existing tag-editor/Invader reconciliation and native compiler evidence is preserved. Prompt06 asset studio, broader conversion/Megaworld/AI/gameplay and all human/peer/release gates remain pending under their original identities. No new editor, networking stack, discovery manager or scheduler is introduced.
