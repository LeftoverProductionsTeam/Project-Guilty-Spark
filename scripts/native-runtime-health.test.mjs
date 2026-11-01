import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRuntimeHealth, nativeSoundStreamingFailures } from './native-runtime-health.mjs';
import { analyzeRun } from './analyze-community-runtime-native.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

test('engine repairs to animation hierarchy remain semantic faults with the exact native tag', () => {
  const text = "the map 'zombie_apocalypse' is corrected: tag 'gs_compat\\carrier_idle\\carrier_idle' (antr): animation_graph_check has the root node's sibling 1: none\n" +
    "the map 'zombie_apocalypse' is corrected: tag 'gs_compat\\carrier_idle\\carrier_idle' (antr): animation_graph_check has node 1 unreached from the root: made the root's child";
  const result = parseRuntimeHealth(text);
  assert.equal(result.status, 'native-faults-observed');
  assert.equal(result.faults[0].kind, 'nativeAnimationHierarchyCorrected');
  assert.equal(result.faults[0].source, 'gs_compat/carrier_idle/carrier_idle (antr)');
  assert.equal(result.faults[0].minimumOccurrences, 2);
});

test('native compiler sound omissions override success without confusing optional pack notices', () => {
  const optional = 'Failed to read data file header sounds\n### FAILED TO OPEN DATA-CACHE FILE.\nsuccessfully built cache file.';
  assert.equal(nativeSoundStreamingFailures(optional).length, 0);
  assert.equal(nativeSoundStreamingFailures('streaming tags...failed to load sound for adding to cache file.\nsuccessfully built cache file.').length, 1);
  assert.throws(() => nativeSoundStreamingFailures('x'.repeat(16 * 1024 * 1024 + 1)), /bound/);
});

test('a normal join cannot hide repeated native empty-tag assertions', () => {
  const h = parseRuntimeHealth(
    [
      '11.01.26 04:57:20  successfully joined a net game',
      '11.01.26 04:57:20  EXCEPTION assert in c:\\halo\\SOURCE\\cache\\cache_files.c,#522: release build',
      '11.01.26 04:57:20  ffffffff is not a tag index: an empty tag is used',
      '11.01.26 04:57:24  EXCEPTION assert in c:\\halo\\SOURCE\\cache\\cache_files.c,#522: (release build, failed 10000 times)',
    ].join('\n'),
  );
  assert.equal(h.status, 'native-faults-observed');
  assert.deepEqual(h.faults[0], {
    kind: 'nativeAssertion',
    source: 'cache/cache_files.c:522',
    firstLine: 2,
    loggedRecords: 2,
    minimumOccurrences: 10000,
  });
  assert.equal(h.faults[1].kind, 'invalidTagReference');
  assert.equal(h.contentAcceptance, false);
});
test('crashes, failed object creation and tag-class mismatches are separate faults', () => {
  const h = parseRuntimeHealth(
    "OUT OF OBJECTS: cannot create zombie container\nlast line repeated 8 times\ncrash: exception c0000005 at 00c00000\nexpected tag group 'proj' but got 'vehi' for ffffffff",
  );
  assert.equal(h.faults[0].minimumOccurrences, 9);
  assert.deepEqual(
    h.faults.map((f) => f.kind),
    ['objectCreationFailed', 'nativeCrash', 'tagClassMismatch'],
  );
});

test('invalid blocks, failed biped exits and deferred actor capacity cannot hide behind a join', () => {
  // Synthetic parser fixture reproducing separately retained native messages.
  const h = parseRuntimeHealth(
    "successfully joined a net game\n#-1 is not a block element index in [#0,#0): an empty one is used\ncouldn't teleport the biped out far enough from the vehicle...\nlast line repeated 7 times\nWARNING: cannot create mounted weapons for zombie container, exceeded MAXIMUM_NUMBER_OF_MOUNTED_WEAPON_UNITS",
  );
  assert.deepEqual(h.faults.map((f) => f.kind), [
    'invalidBlockReference', 'bipedExitPlacementFailed', 'mountedActorCapacityExceeded',
  ]);
  assert.equal(h.faults[1].minimumOccurrences, 8);
  assert.equal(h.status, 'native-faults-observed');
  assert.equal(h.contentAcceptance, false);
});

test('runtime sample truncation and cleared wrong-class references remain content faults', () => {
  // Synthetic messages; genuine source/cache/runtime records remain separate.
  const h = parseRuntimeHealth(
    "the map 'example' is corrected: tag 'sound\\custom\\music' (snd!): pitch_ranges[0].permutations[0].samples has 8691840 bytes, more than the game's 4194304: cut to 4194304\n" +
    "the map 'example' is corrected: tag 'weapons\\pistol\\melee' (jpt!): sound names e1ca0056, not a tag of snd! (wrong group: instance handle e1ca0056, group 'jpt!'): none\n" +
    "the map 'example' is corrected: tag 'ui\\strings' (ustr): strings[0] is not terminated: terminated",
  );
  assert.deepEqual(h.faults.map((f) => [f.kind, f.source]), [
    ['nativeSoundSampleTruncated', 'sound/custom/music (snd!)'],
    ['nativeDependencyCleared', 'weapons/pistol/melee (jpt!)'],
  ]);
  assert.equal(h.status, 'native-faults-observed');
  assert.equal(h.contentAcceptance, false);
});
test('optional startup noise is counted without granting content acceptance', () => {
  const h = parseRuntimeHealth(
    "### ERROR no DirectSound for bink\n### ERROR failed to open bink file ''\nfile_open('z:\\lastprof.txt') error 0x00000002\nsuccessfully joined a net game",
  );
  assert.equal(h.startupNoiseRecords, 3);
  assert.equal(h.status, 'no-classified-native-faults');
  assert.equal(h.contentAcceptance, false);
  assert.equal(parseRuntimeHealth('### ERROR invalid native object').unclassifiedErrorRecords, 1);
});
test('oversized logs, lines and record counts refuse analysis', () => {
  assert.throws(() => parseRuntimeHealth('x'.repeat(8 * 1024 * 1024 + 1)), /bound/);
  assert.throws(() => parseRuntimeHealth('x'.repeat(16385)), /bound/);
  assert.throws(() => parseRuntimeHealth('\n'.repeat(120000)), /bound/);
});

test('execution analysis binds ANSI native logs and refuses changed bytes or redirected log directories', () => {
  // Synthetic parser inputs only; this is not evidence that a game joined.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spark-native-health-'));
  try {
    const executed = [];
    for (const role of ['host', 'client']) {
      fs.mkdirSync(path.join(root, role, 'logs'), { recursive: true });
      fs.writeFileSync(path.join(root, role, 'stdio.log'), '');
      const bytes = Buffer.concat([
        Buffer.from('historical tag '),
        Buffer.from([0xe9]),
        Buffer.from('\nffffffff is not a tag index: an empty tag is used\n'),
      ]);
      fs.writeFileSync(path.join(root, role, 'logs/debug.txt'), bytes);
      executed.push({
        role,
        runtime: 'synthetic-parser-fixture',
        exeSha256: '1'.repeat(64),
        exitCode: 0,
        forced: false,
        inputsUnchanged: true,
        nativeDebugLog: {
          path: 'logs/debug.txt',
          bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
      });
    }
    fs.writeFileSync(
      path.join(root, 'execution.json'),
      JSON.stringify({
        schemaVersion: 1,
        private: true,
        publicListing: false,
        routerFirewallChanges: false,
        executed,
        errors: [],
      }),
    );
    const result = analyzeRun(root);
    assert.equal(result.verdict.status, 'invalid-or-failed-evidence');
    assert.equal(result.verdict.nativeContentAcceptance, false);
    assert.equal(result.nativeHealth[0].boundAtExecution, true);
    assert.equal(result.nativeHealth[0].textEncoding, 'windows-1252');
    fs.appendFileSync(path.join(root, 'host/logs/debug.txt'), 'changed');
    assert.throws(() => analyzeRun(root), /differs/);
    fs.renameSync(path.join(root, 'host/logs'), path.join(root, 'original-host-logs'));
    fs.symlinkSync(path.join(root, 'original-host-logs'), path.join(root, 'host/logs'), 'junction');
    assert.throws(() => analyzeRun(root), /owned directory/);
  } finally {
    const target = path.resolve(root),
      temporary = path.resolve(os.tmpdir());
    assert.equal(path.dirname(target), temporary);
    assert(path.basename(target).startsWith('spark-native-health-'));
    fs.rmSync(target, { recursive: true, force: true });
  }
});
