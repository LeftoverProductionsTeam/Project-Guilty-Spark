// Narrow, opt-in experiment for the supplied Zombie Apocalypse Demo artifact.
// It never replaces missing audio, installs a map, or claims playability.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const value = (key) => { const i = args.indexOf(key); if (i < 0 || !args[i + 1]) throw new Error(`Required: ${key}`); return path.resolve(args[i + 1]); };
const source = value('--source');
const resources = value('--resources');
const invader = value('--invader');
const output = value('--output');
const diagnosePlacement = args.includes('--diagnose-corrupt-placement');
const repairMixedPalettes = args.includes('--repair-mixed-palettes');
if (repairMixedPalettes && !diagnosePlacement) throw new Error('Mixed-palette recovery requires the earlier corrupt-placement diagnosis');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const hashFile = (file) => sha(fs.readFileSync(file));
const inside = (child, parent) => { const rel = path.relative(parent, child); return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); };
if (inside(output, path.dirname(source)) || inside(output, resources) || inside(output, invader)) throw new Error('Output must be a fresh directory outside source, resource, and tool directories');
const bytes = fs.readFileSync(source);
const originalSha = sha(bytes);
if (originalSha !== 'b38f35508188872b2535888193de80f766d92d3b8d53a8ada7be4fc9808a996d') throw new Error('This evidence-specific experiment only accepts the audited Demo source SHA-256; it is not a general repair');
const resourceHashes = Object.fromEntries(['bitmaps.map', 'sounds.map'].map((name) => [name, hashFile(path.join(resources, name))]));
if (repairMixedPalettes && (resourceHashes['bitmaps.map'] !== '5357828124ed03b9b47dad563434465af742075ae1c991f6bb733320996f1bea' || resourceHashes['sounds.map'] !== '9426e8d19b662eeb5a6c516951e080758d8f77a0ee41f52bdf0ed0a929245a59')) {
  throw new Error('Mixed-palette recovery requires the audited Demo resource banks');
}
const executables = Object.fromEntries(['extract', 'build', 'edit'].map((name) => { const exe = path.join(invader, `invader-${name}${process.platform === 'win32' ? '.exe' : ''}`); return [name, { path: exe, sha256: hashFile(exe) }]; }));
fs.mkdirSync(output); // Fail if any output directory already exists.
const tags = path.join(output, 'tags'); const maps = path.join(output, 'output');
fs.mkdirSync(tags); fs.mkdirSync(maps);
const manifest = {
  schemaVersion: 1, profile: 'Recovery edition — missing event audio omitted', faithful: false, playable: false,
  source, sourceSha256: originalSha, resources, resourceSha256: resourceHashes, tools: executables,
  diagnosticPlacementChangesEnabled: diagnosePlacement, mixedPaletteRepairEnabled: repairMixedPalettes, changes: [], commands: [], results: [],
  exclusions: ['sound\\dialog\\multiplayer1\\scorpion.sound', 'sound\\dialog\\multiplayer1\\hill_occupied.sound'],
  limitations: ['Two custom event sounds are absent, not restored', 'No game installation or archived executable is used', 'A successful compile would still require independent validation and target-game load testing'],
};
const save = () => fs.writeFileSync(path.join(output, 'recovery-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const recordBytes = (buffer, offset, replacement, reason) => { const before = buffer.subarray(offset, offset + replacement.length).toString('hex'); replacement.copy(buffer, offset); manifest.changes.push({ offset, before, after: replacement.toString('hex'), reason }); };
const capacity = Buffer.alloc(2); capacity.writeUInt16LE(18875);
if (bytes.readUInt16LE(43949194) !== 0xcaca) throw new Error('Unexpected unused script header');
recordBytes(bytes, 43949194, capacity, 'Normalize unused script capacity: source has zero scripts and globals');
for (const [offset, id, slot, name] of [[49227018, 0xe6be054a, 25, 'scorpion'], [49227274, 0xe6ce055a, 41, 'hill_occupied']]) {
  if (bytes.readUInt32LE(offset + 12) !== id) throw new Error('Unexpected multiplayer sound dependency');
  const replacement = Buffer.from(bytes.subarray(offset, offset + 16)); replacement.fill(0, 4, 12); replacement.writeUInt32LE(0xffffffff, 12);
  recordBytes(bytes, offset, replacement, `Omit unavailable ${name} event audio from globals.multiplayer_information[0].sounds[${slot}]; no substitution`);
}
const input = path.join(output, 'recovery-edition-missing-event-audio-omitted.map');
fs.writeFileSync(input, bytes); manifest.input = input; manifest.inputSha256 = sha(bytes); save();
const run = (tool, parameters, name) => {
  const result = spawnSync(executables[tool].path, parameters, { cwd: output, encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 32 * 1024 * 1024 });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}${result.error ? `\nPROCESS ERROR: ${result.error.message}\n` : ''}`;
  fs.writeFileSync(path.join(output, `${name}.log`), log);
  manifest.commands.push({ tool, parameters, log: `${name}.log`, exitCode: result.status, signal: result.signal, error: result.error?.message ?? null }); save();
  return { exitCode: result.status, stdout: result.stdout ?? '', log, incomplete: !!result.error };
};
const scenarioTag = "fonzie's zombie apocalypse.scenario";
const compile = (name, target = 'mcc-cea', destination = maps) => {
  const result = run('build', ['-g', target, '-t', tags, '-m', destination, '--resource-usage', 'none', "fonzie's zombie apocalypse"], name);
  const state = result.exitCode === 0 && !result.incomplete ? 'compiled-unverified' : 'blocked';
  manifest.results.push({ step: name, target, state, playable: false }); save(); return result;
};

function recoverMixedPalettes() {
  const scenario = path.join(tags, scenarioTag);
  const beforeSha256 = hashFile(scenario);
  const native = (operation, parameters, step) => {
    const result = run('edit', ['-t', tags, ...parameters, scenarioTag], step);
    if (result.exitCode !== 0 || result.incomplete) throw new Error(operation + ' failed');
    return result.stdout.replaceAll('\r\n', '\n').replace(/\n$/, '').split('\n');
  };
  const paths = ['scenery_palette[*].name', 'scenery[*].type', 'biped_palette[*].name'];
  const query = (field, step) => native('Read ' + field, ['-G', field], step);
  const read = (phase) => paths.map((field, index) => query(field, phase + '-palette-' + index));
  const [scenery, placements, bipeds] = read('before');
  const legacySlots = [10, 15, 22];
  const expectedPlacements = [[], [], [95]];
  const uses = (index) => placements.flatMap((type, row) => Number(type) === index ? [row] : []);
  const spawner = 'mgm\\fonzie\\sparky\\tags\\ai respawning\\evolved zombie spawnerorig.weapon';
  const marine = 'mgm\\fonzie\\sparky\\tags\\characters\\hiding marine.biped';
  const expectedTags = [spawner, spawner, marine];
  if (scenery.length !== 39 || bipeds.length !== 1
    || legacySlots.some((slot, index) => scenery[slot]?.toLowerCase() !== expectedTags[index] || JSON.stringify(uses(slot)) !== JSON.stringify(expectedPlacements[index]))
    || native('Count existing bipeds', ['-C', 'bipeds'], 'biped-count')[0] !== '0') {
    throw new Error('The audited mixed palette or Marine placement changed');
  }
  const commonFields = ['name', 'not_placed.automatically', 'not_placed.on_easy', 'not_placed.on_normal',
    'not_placed.on_hard', 'not_placed.use_player_appearance', 'desired_permutation', 'position',
    'rotation', 'appearance_player_index'];
  const commonValues = native('Read Marine placement', commonFields.flatMap(field => ['-G', 'scenery[95].' + field]), 'marine-read');
  if (commonValues.length !== commonFields.length) throw new Error('Marine placement fields could not be read');
  const rotation = commonValues[commonFields.indexOf('rotation')].split(',').map(Number);
  if (rotation.length !== 3 || !rotation.every(Number.isFinite)) throw new Error('Invalid Marine rotation');
  const sourceValue = (field, value) => {
    if (field === 'name' && value === '65535') return '-1';
    // Invader displays Euler angles in degrees and accepts raw radians for set.
    if (field === 'rotation') return rotation.map(angle => angle * Math.PI / 180).join(',');
    return value;
  };
  const nullDependency = (value, group) => value === '' || value === '.' + group;
  const emptyUnused = scenery.flatMap((value, index) => nullDependency(value, 'scenery') && uses(index).length === 0 ? [index] : []);
  const removeScenery = [...legacySlots, ...emptyUnused].sort((a, b) => a - b);
  const keptBipeds = bipeds.filter(value => !nullDependency(value, 'biped'));
  const marineType = String(keptBipeds.length);
  const reindexed = placements.map((value, index) => {
    if (index === 95 || value === '65535') return '65535';
    const type = Number(value);
    if (!Number.isInteger(type) || type < 0 || type >= scenery.length || removeScenery.includes(type)) {
      throw new Error('An additional scenery placement has an unresolved palette index');
    }
    return String(type - removeScenery.filter(slot => slot < type).length);
  });
  const edits = [
    ...(keptBipeds.length ? [] : ['-E', 'biped_palette[0]']),
    '-I', 'bipeds', '1', 'end', '-I', 'biped_palette', '1', 'end',
    '-S', 'biped_palette[' + marineType + '].name', marine, '-S', 'bipeds[0].type', marineType,
    ...commonFields.flatMap((field, index) => ['-S', 'bipeds[0].' + field, sourceValue(field, commonValues[index])]),
    ...removeScenery.slice().reverse().flatMap(index => ['-E', 'scenery_palette[' + index + ']']),
    ...reindexed.flatMap((type, index) => ['-S', 'scenery[' + index + '].type', type === '65535' ? '-1' : type]),
  ];
  native('Repair scenario palettes', edits, 'mixed-palette-repair');
  const [afterScenery, afterPlacements, afterBipeds] = read('after');
  const moved = native('Read native biped placement', [...commonFields, 'type'].flatMap(field => ['-G', 'bipeds[0].' + field]), 'marine-readback');
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const rotationIndex = commonFields.indexOf('rotation');
  const nativeRotation = moved[rotationIndex]?.split(',').map(Number);
  const rotationMatches = nativeRotation?.length === 3
    && nativeRotation.every((angle, index) => Number.isFinite(angle) && Math.abs(angle - rotation[index]) <= 0.0001);
  const expectedScenery = scenery.filter((_, index) => !removeScenery.includes(index));
  if (!same(afterScenery, expectedScenery) || !same(afterPlacements, reindexed)
    || !same(afterBipeds, [...keptBipeds, marine]) || moved.length !== commonValues.length + 1
    || moved.at(-1) !== marineType || !rotationMatches
    || commonValues.some((value, index) => index !== rotationIndex && value !== moved[index])) {
    throw new Error('Mixed-palette repair did not preserve the reviewed placement and remaining palette indices');
  }
  manifest.changes.push({tag:scenarioTag, reason:'Move the existing Hiding Marine to the native biped block, remove now-unused invalid palette entries and reindex scenery',
    sourceScenery:95, destinationBiped:0, removedSceneryPalette:removeScenery, beforeSha256, afterSha256:hashFile(scenario)});
  save();
}

try {
  const extraction = run('extract', ['-t', tags, '-m', resources, ...manifest.exclusions.flatMap((s) => ['-e', s]), input], 'extract');
  if (extraction.exitCode !== 0 || extraction.incomplete || /^(?:ERROR:|FATAL ERROR:|Failed to extract )/m.test(extraction.log) || !/Extracted 2823 out of 2823 matched tags/.test(extraction.log)) throw new Error('Complete 2823-tag extraction was not established');
  manifest.results.push({ step: 'extract', state: '2823-of-2823', playable: false }); save();
  compile('compile-01');
  if (diagnosePlacement) {
    const scenario = path.join(tags, "fonzie's zombie apocalypse.scenario");
    const baseline = fs.readFileSync(scenario); fs.writeFileSync(path.join(output, 'scenario-before-diagnostic-edits.tag'), baseline);
    for (const [field, step, explanation] of [
      ['name', 'compile-02', 'Clear an invalid scenery[0] name index against an empty object_names table'],
      ['type', 'compile-03', 'Disable scenery[0] type10704, which is outside the39-entry palette in all three related variants; the intended object was not recovered'],
    ]) {
      const before = fs.readFileSync(scenario);
      const edited = run('edit', ['-t', tags, '-S', `scenery[0].${field}`, '-1', "fonzie's zombie apocalypse.scenario"], `diagnostic-${field}`);
      if (edited.exitCode !== 0 || edited.incomplete) throw new Error('Diagnostic tag edit failed');
      const after = fs.readFileSync(scenario); const differences = [];
      if (before.length !== after.length) throw new Error('Unexpected diagnostic tag length change');
      for (let at = 0; at < before.length;) { if (before[at] === after[at]) { at++; continue; } let end = at + 1; while (end < before.length && before[end] !== after[end]) end++; differences.push({ offset: at, before: before.subarray(at, end).toString('hex'), after: after.subarray(at, end).toString('hex') }); at = end; }
      manifest.changes.push({ tag: "fonzie's zombie apocalypse.scenario", reason: explanation, beforeSha256: sha(before), afterSha256: sha(after), differences }); save();
      compile(step);
    }
  }
  if (repairMixedPalettes) {
    recoverMixedPalettes();
    for (const target of ['gbx-custom', 'mcc-cea']) {
      const destination = path.join(maps, target);
      fs.mkdirSync(destination);
      compile('compile-mixed-' + target, target, destination);
    }
  }
} catch (error) {
  manifest.error = String(error); process.exitCode = 1;
} finally {
  manifest.sourceSha256After = hashFile(source);
  manifest.resourceSha256After = Object.fromEntries(Object.keys(resourceHashes).map((name) => [name, hashFile(path.join(resources, name))]));
  if (manifest.sourceSha256After !== originalSha || JSON.stringify(manifest.resourceSha256After) !== JSON.stringify(resourceHashes)) { manifest.integrityFailure = true; process.exitCode = 1; }
  save();
  console.log(JSON.stringify({ profile: manifest.profile, playable: false, results: manifest.results, error: manifest.error ?? null, manifest: path.join(output, 'recovery-manifest.json') }, null, 2));
}
