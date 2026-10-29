# Current native working tags — C34

The Runtime Dock's **Build current tool edits** path compiles the current job-owned editable tagset. Ordinary source-project builds regenerate/extract their inputs; they cannot stand in for preserving edits saved in Sapien or Guerilla. The two actions remain explicit. QuickForge's authored document is not silently rewritten from external tag edits; **Open compiled map** exposes the actual resulting cache separately.

[`working_tags.rs`](../../crates/spark-core/src/working_tags.rs) checks the saved project/build fingerprint, standard receipt, exact parent native compiler provenance and cache snapshot. It copies current tags into a fresh owned job, compares the complete bounded source inventory before/after compilation, preserves the scenario's campaign/multiplayer/UI type and original script names, and verifies cache identity/index, CRC, protection and stubs. Only job-owned `.hsc` source scripts follow the build; JMS/textures or SDK masters are not recopied. Missing scripts or lost original names cause refusal, not an accepted broken campaign.

The native caller separately validates the official selected toolkit/PE architecture and paths. Tool architecture is independent of gameplay architecture: the installed H1A Tool is x86 while the reviewed Steam MCC game memory adapter is x64. Tool arguments use native backslash tag paths even though stored identities normalize separators. Executable hashes are rechecked; a filename or successful exit code is insufficient.

The child job retains standard `receipt.json`, compact `working-tags-receipt.json`, and separately hashed input/final tag inventory files. Optional script inventories are separately pinned. Opening another tool therefore need not deserialize two full tag trees. Previous jobs, editable input tags and source maps are never overwritten. Native Tool uses the existing protected write phase: cancellation waits until the current native writer exits instead of forcefully killing it. Game safety/playability is not inferred from those checks.

## Actual local acceptance

[Metadata-only verification fixture](../fixtures/working-tags-native-verification.json) records the exact hashes and limits. Full owned tags/maps/logs remain under `.local/` and are excluded from source releases.

The preserved C33 room job contained 11,544 tags / 1,822,259,786 bytes. A dependency-only derived input selected the parent cache's real indexed tags plus actual source scenario/globals dependencies: **2,240 files / 116,552,443 bytes**. No full SDK master or 1.70 GiB tree copy was needed.

A real Invader edit moved native `player_starting_locations[0].position` from **(-8, -10.666667, 0.1)** to **(-7.5, -10.666667, 0.1)** in the fresh input copy. Official H1A Tool (Steam app 1532190, installed build 11722677) produced a new **v13 / multiplayer-type-1 cache with 2,239 tags and 12 collision triangles**. The actual output cache read back the changed position; CRC mismatch/protection/stub checks each returned zero. Its SHA-256 is `85d2390bdeced18f8f7617b751ddcbf42555ab4533aa8a993ebb0dcd28f9095b`.

Input/final tag inventory hashes were identical. The input scenario and original parent cache hashes were unchanged; all **11,544 original C33 tag files** were independently rehashed afterward, with no changes. The accepted operation took 56,577 ms including its validation/staging/compile/readback; this is a single timing, not a performance improvement claim.

The first native attempt caught a real defect: Tool rejects `/` in tag-index paths. It returned a failed load despite process exit behavior that could look successful. The pipeline retained a failed receipt and accepted no cache. The native argument spelling was corrected, a regression was added, and the bounded retry passed. Both jobs remain private evidence. The accepted room has no campaign script sources; HSC copying/concurrent-script rejection have source tests, not native campaign acceptance.

No Halo/Standalone process, memory write, game session or gameplay acceptance was involved. Full campaign/UI working-tag compilation, human play and peers remain separate gates.

## Reproduction and isolated native UI fixture

The explicit owner-run harness takes private JSON inputs and never downloads/discovers game data:

```powershell
node scripts/cargo.mjs run -p spark-core --locked --example qa_working_tags -- <private-project.gsproject> <working-input.json> <owned-jobs-root> <fresh-job-uuid> <expected-spawn-x> <expected-spawn-y> <expected-spawn-z> <private-result.json>
```

`WorkingTagsInput` contains the accepted parent `BuildRecord`, job-owned tags directory, scenario path/type, and separately inspected H1A Tool / Invader-info paths. The project must contain that actual parent record. Never fabricate native provenance or use SDK master tags as an editable parent.

For native desktop QA, `qa_runtime_library` seeds a **fresh isolated** library through the core `Library::save` API. It refuses existing destinations, symlinks, executables, more than 20,000 files or 256 MiB. It verifies the original cache/tag/manifest/project identities, copies only required context, rewrites replica paths and appends the verified build. It does not weaken production IPC build-history validation, change project IDs, launch programs or modify the original job.

```powershell
node scripts/cargo.mjs run -p spark-core --locked --example qa_runtime_library -- <accepted-working-job> <private-project.gsproject> <fresh-library-root>
```

The actual C34 fixture copied **2,246 files / 206,019,818 bytes**, retaining cache/tag/inventory bytes. A redundant `workspace/maps` cache and transient Tool logs were omitted; the validated output and source context remain. The marker `spark-native-ui-fixture.json` identifies the project/build for the desktop tests. These are private QA inputs, not public source assets or an alternative import backdoor.
