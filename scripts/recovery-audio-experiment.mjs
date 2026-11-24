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
const repairShieldNoise = args.includes('--repair-shield-noise');
const repairSurvivorSpawn = args.includes('--repair-survivor-spawn');
const repairRoundsHud = args.includes('--repair-rounds-hud');
if (repairRoundsHud && !repairSurvivorSpawn) throw new Error('Rounds HUD recovery requires the Survivor-spawn repair');
if (repairSurvivorSpawn && !repairShieldNoise) throw new Error('Survivor-spawn recovery requires the shield-noise repair');
if (repairShieldNoise && !repairMixedPalettes) throw new Error('Shield-noise recovery requires the mixed-palette repair');
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
  diagnosticPlacementChangesEnabled: diagnosePlacement, mixedPaletteRepairEnabled: repairMixedPalettes, shieldNoiseRepairEnabled: repairShieldNoise, survivorSpawnRepairEnabled: repairSurvivorSpawn, roundsHudRepairEnabled: repairRoundsHud, changes: [], commands: [], results: [],
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
function editTag(tag, parameters, step) {
  const result = run('edit', ['-t', tags, ...parameters, tag], step);
  if (result.exitCode !== 0 || result.incomplete) throw new Error(step + ' failed');
  return result.stdout.replaceAll('\r\n', '\n').replace(/\n$/, '').split('\n');
}
const compile = (name, target = 'mcc-cea', destination = maps) => {
  const result = run('build', ['-g', target, '-t', tags, '-m', destination, '--resource-usage', 'none', "fonzie's zombie apocalypse"], name);
  const state = result.exitCode === 0 && !result.incomplete ? 'compiled-unverified' : 'blocked';
  manifest.results.push({ step: name, target, state, playable: false }); save(); return result;
};

function recoverMixedPalettes() {
  const scenario = path.join(tags, scenarioTag);
  const beforeSha256 = hashFile(scenario);
  const native = (parameters, step) => editTag(scenarioTag, parameters, step);
  const paths = ['scenery_palette[*].name', 'scenery[*].type', 'biped_palette[*].name'];
  const query = (field, step) => native(['-G', field], step);
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
    || native(['-C', 'bipeds'], 'biped-count')[0] !== '0') {
    throw new Error('The audited mixed palette or Marine placement changed');
  }
  const commonFields = ['name', 'not_placed.automatically', 'not_placed.on_easy', 'not_placed.on_normal',
    'not_placed.on_hard', 'not_placed.use_player_appearance', 'desired_permutation', 'position',
    'rotation', 'appearance_player_index'];
  const commonValues = native(commonFields.flatMap(field => ['-G', 'scenery[95].' + field]), 'marine-read');
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
  native(edits, 'mixed-palette-repair');
  const [afterScenery, afterPlacements, afterBipeds] = read('after');
  const moved = native([...commonFields, 'type'].flatMap(field => ['-G', 'bipeds[0].' + field]), 'marine-readback');
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

function recoverShieldNoise() {
  const shader = 'mgm/fonzie/sparky/tags/player/survivor/shield hit.shader_transparent_plasma';
  const bitmap = 'characters/floodcombat elite/bitmaps/flood tentacles.bitmap';
  const volume = 'spark_recovery/zombie/shield noise volume.bitmap';
  const asDependency = (tag) => tag.replaceAll('/', '\\');
  const duplicateFile = path.join(tags, volume);
  const original = fs.readFileSync(path.join(tags, bitmap));
  const bindingFields = ['primary_noise_map', 'secondary_noise_map'];
  const bitmapFields = ['type', 'bitmap_data[0].type', 'bitmap_data[0].depth',
    'bitmap_data[0].width', 'bitmap_data[0].height', 'bitmap_data[0].format', 'bitmap_data[0].mipmap_count'];
  const read = (tag, fields, step) => editTag(tag, fields.flatMap(field => ['-G', field]), step);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const before = read(bitmap, bitmapFields, 'shield-original-bitmap');
  const expected = ['2d_textures', '2d_texture', '1', '128', '128', 'dxt3', '7'];
  if (!same(before, expected) || !same(editTag(bitmap, ['-C', 'bitmap_data'], 'shield-original-image-count'), ['1'])
    || original.length !== 22156 || !same(read(shader, bindingFields, 'shield-before-binding'), [asDependency(bitmap), asDependency(bitmap)])) {
    throw new Error('The audited single-slice shield source or its two dependency paths changed');
  }
  fs.mkdirSync(path.dirname(duplicateFile), { recursive: true });
  fs.copyFileSync(path.join(tags, bitmap), duplicateFile, fs.constants.COPYFILE_EXCL);
  editTag(volume, ['-n', '-S', 'type', '3d_textures', '-S', 'bitmap_data[0].type', '3d_texture'], 'shield-create-volume');
  const converted = fs.readFileSync(duplicateFile);
  const typeOffsets = [65, 22119]; // audited bitmap tag and image record enum bytes
  if (!same(read(volume, bitmapFields, 'shield-volume-readback'), ['3d_textures', '3d_texture', ...expected.slice(2)])
    || converted.length !== original.length
    || typeOffsets.some(offset => original[offset] !== 0 || converted[offset] !== 1)
    || original.some((byte, offset) => byte !== converted[offset] && !(offset >= 40 && offset <= 43) && !typeOffsets.includes(offset))) {
    throw new Error('Native shield volume changed bytes outside its two type enums and tag checksum');
  }
  const shieldFile = path.join(tags, shader);
  const oldShader = hashFile(shieldFile);
  const otherShaderFields = (step) => editTag(shader, ['-L'], step)
    .filter(line => !/\b(?:primary|secondary)_noise_map \(/.test(line));
  const otherBefore = otherShaderFields('shield-original-material');
  editTag(shader, bindingFields.flatMap(field => ['-S', field, volume]), 'shield-bind-volume');
  if (!same(read(shader, bindingFields, 'shield-binding-readback'), [asDependency(volume), asDependency(volume)])
    || !same(otherShaderFields('shield-material-readback'), otherBefore)
    || !fs.readFileSync(path.join(tags, bitmap)).equals(original)) {
    throw new Error('Shield bindings, unaffected material fields or original Flood bitmap changed unexpectedly');
  }
  manifest.changes.push({tag:shader, reason:'Bind the Survivor shield to a separate depth-one native volume containing the original DXT3 mip chain',
    originalBitmap:bitmap, originalBitmapSha256:sha(original), volume, volumeSha256:sha(converted), preservedPixelBytes:true,
    beforeSha256:oldShader, afterSha256:hashFile(shieldFile)});
  save();
}

function recoverSurvivorSpawn() {
  const biped = 'mgm/fonzie/sparky/tags/player/survivor.biped';
  const effect = 'effects/coop teleport.effect';
  const originalEffectSha256 = hashFile(path.join(tags, effect));
  const bipedFile = path.join(tags, biped);
  const beforeSha256 = hashFile(bipedFile);
  const fields = ['spawned_actor', 'spawned_actor_count', 'spawned_velocity'];
  const read = step => editTag(biped, fields.flatMap(field => ['-G', field]), step);
  const otherFields = step => editTag(biped, ['-L'], step).filter(line => !/\bspawned_actor\s+(?:\(|dependency\b)/.test(line));
  const before = read('survivor-spawn-source');
  if (JSON.stringify(before) !== JSON.stringify(['effects\\coop teleport.effect', '0,0', '0.000000'])) {
    throw new Error('The audited Survivor actor-spawn field is no longer dormant');
  }
  const otherBefore = otherFields('survivor-original');
  editTag(biped, ['-S', 'spawned_actor', '.actor_variant'], 'survivor-clear-dormant-spawn');
  const after = read('survivor-spawn-readback');
  if (JSON.stringify(after) !== JSON.stringify(['.actor_variant', ...before.slice(1)])
    || JSON.stringify(otherFields('survivor-fields-readback')) !== JSON.stringify(otherBefore)
    || hashFile(path.join(tags, effect)) !== originalEffectSha256) {
    throw new Error('Survivor spawn normalization changed another field or the teleport effect');
  }
  manifest.changes.push({tag:biped, reason:'Clear a cross-class spawn dependency whose authored actor count is zero',
    previousDependency:effect, effectSha256:originalEffectSha256, spawnCount:[0,0],
    beforeSha256, afterSha256:hashFile(bipedFile)});
  save();
}

function recoverRoundsHud() {
  const black = 'ui/shell/bitmaps/black.bitmap';
  const blackLight = 'levels/test/prisoner/bitmaps/black light.bitmap';
  const bitmapHashes = {};
  const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
  for (const [index, bitmap] of [black, blackLight].entries()) {
    const shape = editTag(bitmap, ['-C', 'bitmap_group_sequence', '-C', 'bitmap_data',
      '-G', 'bitmap_group_sequence[0].first_bitmap_index', '-G', 'bitmap_group_sequence[0].bitmap_count',
      '-C', 'bitmap_group_sequence[0].sprites'], 'hud-bitmap-sequence-' + index);
    if (!same(shape, ['1', '1', '0', '1', '0'])) {
      throw new Error('The audited HUD bitmap no longer resolves to one nonsprite sequence: ' + bitmap);
    }
    bitmapHashes[bitmap] = hashFile(path.join(tags, bitmap));
  }
  const audited = [
    { id: 'rounds', hud: 'ui/hud/master rounds.weapon_hud_interface',
      groups: [{ array: 'static_elements', bitmapField: 'interface_bitmap', bitmaps: [black, black], sequences: ['1', '2'] }] },
    { id: 'main', hud: 'mgm/fonzie/sparky/tags/zombie apocalypse hud.weapon_hud_interface',
      groups: [
        { array: 'static_elements', bitmapField: 'interface_bitmap', bitmaps: [black, blackLight, blackLight], sequences: ['6', '0', '0'] },
        { array: 'meter_elements', bitmapField: 'meter_bitmap', bitmaps: [blackLight], sequences: ['6'] },
      ] },
  ];
  for (const { id, hud, groups } of audited) {
    const hudFile = path.join(tags, hud);
    const original = fs.readFileSync(hudFile);
    const readArguments = groups.flatMap(({ array, bitmapField }) => ['-C', array,
      '-G', array + '[*].' + bitmapField, '-G', array + '[*].sequence_index']);
    const read = phase => editTag(hud, readArguments, id + '-hud-' + phase);
    const shape = source => groups.flatMap(({ bitmaps, sequences }) =>
      [String(bitmaps.length), ...bitmaps.map(tag => tag.replaceAll('/', '\\')), ...sequences.map(source)]);
    if (!same(read('before'), shape(value => value))) throw new Error('Audited HUD bindings changed: ' + hud);
    // Both native drawing paths reduce positive indices modulo the sequence
    // count. These nonsprite texture groups select the same image at zero.
    const fields = groups.flatMap(({ array, sequences }) => sequences.flatMap((value, index) =>
      value === '0' ? [] : [{ field: array + '[' + index + '].sequence_index', index: Number(value) }]));
    editTag(hud, fields.flatMap(({ field }) => ['-S', field, '0']), id + '-hud-wrap');
    const after = fs.readFileSync(hudFile);
    const oldIndices = fields.map(({ index }) => index);
    const changedPayload = [];
    for (let offset = 64; offset < original.length; offset++) {
      if (original[offset] !== after[offset]) changedPayload.push([original[offset], after[offset]]);
    }
    if (!same(read('readback'), shape(() => '0')) || original.length !== after.length
      || !original.subarray(0, 40).equals(after.subarray(0, 40))
      || !original.subarray(44, 64).equals(after.subarray(44, 64))
      || changedPayload.some(([, value]) => value !== 0)
      || !same(changedPayload.map(([value]) => value).sort(), oldIndices.slice().sort())) {
      throw new Error('HUD normalization changed a field outside the audited sequence references: ' + hud);
    }
    manifest.changes.push({tag:hud, reason:'Use the same authored image already selected by native static/meter drawing',
      bitmapHashes, fields:fields.map(({field})=>field), oldSequenceIndices:oldIndices,
      newSequenceIndices:fields.map(()=>0), beforeSha256:sha(original), afterSha256:sha(after)});
  }
  if (Object.entries(bitmapHashes).some(([tag, hash]) => hashFile(path.join(tags, tag)) !== hash)) {
    throw new Error('An original HUD bitmap changed during normalization');
  }
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
  if (repairShieldNoise) {
    recoverShieldNoise();
    for (const target of ['gbx-custom', 'mcc-cea']) {
      const destination = path.join(maps, target + '-shield');
      fs.mkdirSync(destination);
      compile('compile-shield-' + target, target, destination);
    }
  }
  if (repairSurvivorSpawn) {
    recoverSurvivorSpawn();
    for (const target of ['gbx-custom', 'mcc-cea']) {
      const destination = path.join(maps, target + '-survivor');
      fs.mkdirSync(destination);
      compile('compile-survivor-' + target, target, destination);
    }
  }
  if (repairRoundsHud) {
    recoverRoundsHud();
    for (const target of ['gbx-custom', 'mcc-cea']) {
      const destination = path.join(maps, target + '-rounds');
      fs.mkdirSync(destination);
      compile('compile-rounds-' + target, target, destination);
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
