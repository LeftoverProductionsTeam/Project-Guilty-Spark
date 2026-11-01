# C44 commit / pull-request summary

## Title

C44: improve verified map loading and add pinned native AI diagnostics

## Description

Fix reflection cube faces sharing a decoded-image cache key and replace callback-heavy Base64 decoding with bounded native decoding plus an older-WebView fallback. Preserve complete source/resource checks, pixel ownership, rendering content and the original cache limits. Two paired native comparisons improve median map switches from 4.49 to 4.01 seconds; first loads improve 6.6–9%. Correct the earlier automation-export/native-IPC timing attribution. No startup, memory or GPU gain is claimed.

Add an opt-in Windows read-only observer for the exact OpenCE build-335 executable and publisher-matching PDB, plus bounded log analysis. Two actual private engine processes expose 42 shared AI identities, movement and firing controls. Keep full AI acceptance false and retain all discrepancies. Recheck the experimental Zombie Apocalypse recovery cache: it loads/joins, but host/client spawner/actor behavior still fails the AI-control gate. No previous-good build or original content is replaced.

Retain the full C35–C43 history, earlier branch references, dirty root checkout, experimental evidence and source snapshots. Update the README, current features and backlog with measured scope. General direct compiled-map structural editing remains open.

## Validation

- Windows locked workspace tests: 616 passed; seven opt-in tests remain ignored.
- Frontend: 284 passed. Browser: 136 passed. Offline scripts: 59 passed.
- Two MCC interface probes and three actor-analyzer tests passed; actual wrong-executable and altered-PDB identities are refused.
- Final native executable: seven durable-window/history cases and complete paired source-rendering checks.
- Three real Spark processes: native tag edit, validated asset publication/placement, ordered convergence, author undo, conflicts, permissions, corrupt-save refusal, equivalent Baboon-save replay and actual host restart recovery. Frozen revision 18 compiles the 0.5 pistol radius and 31-triangle asset at `[3, 2, 0.1]`; later revision 19 remains independent.
- Original 160 root untracked files, 67 Zombie Apocalypse files, 94 installed maps, prior references, eight C42/C43 artifacts and all 404 preceding ledger rows remain unchanged. Four C44 records are appended.

This is consolidated locally on master for the owner's publication workflow. No remote push, force push, rule change or publication is claimed. Protected-branch requirements still apply to remote integration. Installer, portable and source packages have separate checksums; clean-machine installation remains untested.
