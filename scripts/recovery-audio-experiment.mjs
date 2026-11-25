// Narrow, opt-in experiment for the supplied Zombie Apocalypse Demo artifact.
// It never replaces missing audio, installs a map, or claims playability.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { assertQaOutputPath } from './native-qa-storage.mjs';
import { carrierAnimationSource } from './recover-zombie-carriers-native.mjs';
import { prepareNativeAdpcmWave } from './prepare-native-adpcm-waves.mjs';

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
const nativeMccTool = args.includes('--mcc-tool') ? value('--mcc-tool') : null;
const repairStandardCarrier = args.includes('--repair-standard-carrier');
const repairCarrierInertia = args.includes('--repair-carrier-inertia');
const repairLegacyTitle = args.includes('--repair-legacy-title');
const repairVorbisTail = args.includes('--repair-vorbis-tail');
const stageLegacySpawners = args.includes('--stage-legacy-spawners');
const compileClassicCe = args.includes('--compile-classic-ce');
if (repairStandardCarrier && !nativeMccTool) throw new Error('Standard carrier repair requires the reviewed native MCC Tool');
if (repairCarrierInertia && !repairStandardCarrier) throw new Error('Carrier inertia repair requires the reviewed original carrier build');
if (repairLegacyTitle && !repairCarrierInertia) throw new Error('Legacy title repair requires the reviewed inertia-corrected cache');
if (repairVorbisTail && !repairLegacyTitle) throw new Error('Vorbis tail recovery requires the reviewed title-corrected cache');
if (stageLegacySpawners && !repairVorbisTail) throw new Error('Legacy spawner staging requires the full reviewed source recovery');
if (compileClassicCe && !stageLegacySpawners) throw new Error('Classic CE recovery requires the reviewed audio, carrier and legacy spawner overlays');
const mccPinIndex = args.indexOf('--mcc-tool-sha256');
const mccPin = mccPinIndex < 0 ? null : args[mccPinIndex + 1];
if (args.includes('--mcc-tool-sha256') !== Boolean(nativeMccTool)
  || nativeMccTool && (!repairRoundsHud || !/^[a-f\d]{64}$/.test(mccPin ?? ''))) {
  throw new Error('Native MCC recovery requires the full audited repair and an exact lowercase --mcc-tool-sha256');
}
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
const invaderCommands = nativeMccTool ? ['extract', 'build', 'edit', 'info'] : ['extract', 'build', 'edit'];
if (repairCarrierInertia) invaderCommands.push('crc');
if (compileClassicCe) invaderCommands.push('bitmap', 'bludgeon', 'sound');
const executables = Object.fromEntries(invaderCommands.map((name) => {
  const exe = path.join(invader, `invader-${name}${process.platform === 'win32' ? '.exe' : ''}`);
  return [name, { path: exe, sha256: hashFile(exe) }];
}));
if (repairCarrierInertia && executables.crc.sha256 !== 'b15603c344c590760a81816866d3834dbb117504a2c935e39c380d3c9ab391e9') {
  throw new Error('Carrier inertia repair requires the exact reviewed Invader CRC tool');
}
if (nativeMccTool) {
  const stat = fs.lstatSync(nativeMccTool);
  const resolvedTool = fs.realpathSync(nativeMccTool);
  if (!stat.isFile() || path.basename(resolvedTool).toLowerCase() !== 'tool.exe'
    || inside(output, path.dirname(resolvedTool)) || inside(resolvedTool, output)
    || hashFile(resolvedTool) !== mccPin) {
    throw new Error('The reviewed installed MCC Tool or isolated output path changed');
  }
  await assertQaOutputPath(output, { reservationBytes: 512 * 1024 * 1024 });
  executables.mcc = { path: resolvedTool, sha256: mccPin };
}
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
function editTag(tag, parameters, step, directory = tags) {
  const result = run('edit', ['-t', directory, ...parameters, tag], step);
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

function hashTagInventory(directory = tags) {
  const hashes = {};
  if (!fs.lstatSync(directory).isDirectory()) throw new Error('Derived tag root is not a regular directory');
  const root = fs.realpathSync(directory);
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name);
      const info = fs.lstatSync(file);
      if (info.isSymbolicLink() || !inside(fs.realpathSync(file), root)) {
        throw new Error('Derived tag tree contains a link');
      }
      if (info.isDirectory()) pending.push(file);
      else if (info.isFile()) hashes[path.relative(root, file)] = hashFile(file);
      else throw new Error('Derived tag tree contains an unexpected file type');
    }
  }
  return hashes;
}

const standardCarrier = 'mgm/fonzie/sparky/tags/zombie container.vehicle';
const recoveredCarrierStem = 'spark_recovery/zombie_carrier';
const recoveredCarrierGraph = recoveredCarrierStem + '/zombie_carrier.model_animations';
const modelNodeFields = ['name', 'first_child_node_index', 'next_sibling_node_index'];
const normalizeNativePath = value => value.replaceAll('\\', '/');
const noNode = value => Number(value) === 65535 ? -1 : Number(value);

function readCarrierGraph(directory, phase) {
  const fields = [
    'units[0].label', 'units[0].weapons[0].name', 'units[0].weapons[0].animations[0].animation',
    'animations[0].name', 'animations[0].node_list_checksum', 'animations[0].node_count',
    'animations[0].frame_count',
    ...Array.from({ length: 5 }, (_, i) => modelNodeFields.map(key => 'nodes[' + i + '].' + key)).flat(),
  ];
  const result = run('edit', ['-t', directory, '-C', 'nodes', '-C', 'units', '-C', 'animations',
    ...fields.flatMap(field => ['-G', field]), recoveredCarrierGraph], phase);
  if (result.exitCode !== 0 || result.incomplete) throw new Error('Native carrier graph readback failed');
  return result.stdout.trimEnd().split(/\r?\n/);
}

function recoverStandardCarrier() {
  const model = 'weapons/gravity rifle/gravity rifle.gbxmodel';
  const originalGraph = 'mgm/fonzie/sparky/tags/zombie container.model_animations';
  const pins = {
    [standardCarrier]: 'e2904fb8fab3ee57c1a0a4ed5f96f2ad7ff4b478f127f4c026c900363ed7c467',
    [model]: '45a8dab6c1769364ce42e6e91323a35ae8a94cbe2e6f07aa41d354319014e83f',
    [originalGraph]: '6d98fd7563522e41f0c42ada1e56512531685b9b835ab6c12c443023085e5d36',
  };
  const carrierFile = path.join(tags, standardCarrier);
  if (Object.entries(pins).some(([tag, pin]) => hashFile(path.join(tags, tag)) !== pin) ||
      editTag(standardCarrier, ['-G', 'model', '-G', 'animation_graph'], 'carrier-original-binding')
        .map(normalizeNativePath).join('\n') !== [model, originalGraph].join('\n')) {
    throw new Error('The original standard carrier model and graph identities changed');
  }
  const keys = [...modelNodeFields, 'default_translation', 'default_rotation'];
  const nodeQuery = Array.from({ length: 5 }, (_, i) => keys.map(key => 'nodes[' + i + '].' + key)).flat();
  const [count, checksum, ...values] = editTag(model, ['-C', 'nodes', '-G', 'node_list_checksum',
    ...nodeQuery.flatMap(key => ['-G', key])], 'carrier-model-rig');
  if (count !== '5' || checksum !== '1344912864' || values.length !== 25) {
    throw new Error('The original standard carrier rig is no longer the reviewed five-node rig');
  }
  const nodes = Array.from({ length: 5 }, (_, i) => {
    const [name, child, sibling, translation, rotation] = values.slice(i * 5, i * 5 + 5);
    return { name, child: noNode(child), sibling: noNode(sibling),
      translation: translation.split(',').map(Number), rotation: rotation.split(',').map(Number) };
  });
  const sourceDirectory = path.join(output, 'data', recoveredCarrierStem, 'animations');
  fs.mkdirSync(sourceDirectory, { recursive: true });
  fs.writeFileSync(path.join(sourceDirectory, 'stand unarmed idle.jma'),
    carrierAnimationSource(nodes, Number(checksum)), { flag: 'wx' });

  const before = hashTagInventory();
  const graphFile = path.join(tags, recoveredCarrierGraph);
  if (fs.existsSync(graphFile)) throw new Error('The derived carrier graph already exists');
  fs.mkdirSync(path.dirname(graphFile), { recursive: true });
  const built = run('mcc', ['-tags_dir', 'tags', '-data_dir', 'data', '-game_root_dir', '.',
    'animations', recoveredCarrierStem.replaceAll('/', '\\')], 'carrier-native-animation');
  if (built.exitCode !== 0 || built.incomplete || /exception halt|### failed/i.test(built.log) || !fs.lstatSync(graphFile).isFile()) {
    throw new Error('H1A Tool did not compile the derived carrier idle graph');
  }
  const readback = readCarrierGraph(tags, 'carrier-source-graph-readback');
  const rig = values.filter((_, i) => i % 5 < 3);
  const expected = ['5', '1', '1', 'stand', 'unarmed', '0', 'stand unarmed idle', checksum, '5', '1', ...rig];
  if (JSON.stringify(readback) !== JSON.stringify(expected)) throw new Error('Compiled carrier idle state or node hierarchy differs');

  const originalListing = editTag(standardCarrier, ['-L'], 'carrier-before-rebind');
  editTag(standardCarrier, ['-S', 'animation_graph', recoveredCarrierGraph], 'carrier-rebind');
  const updatedListing = editTag(standardCarrier, ['-L'], 'carrier-after-rebind');
  const withoutBinding = listing => listing.filter(line => !line.trimStart().startsWith('animation_graph '));
  const binding = editTag(standardCarrier, ['-G', 'animation_graph'], 'carrier-source-binding')[0];
  if (normalizeNativePath(binding) !== recoveredCarrierGraph ||
      JSON.stringify(withoutBinding(originalListing)) !== JSON.stringify(withoutBinding(updatedListing))) {
    throw new Error('Rebinding changed authored carrier fields outside its animation reference');
  }
  const after = hashTagInventory();
  const graphKey = path.normalize(recoveredCarrierGraph);
  const vehicleKey = path.normalize(standardCarrier);
  if (Object.keys(after).length !== Object.keys(before).length + 1 || !after[graphKey] ||
      Object.keys(before).some(tag => tag !== vehicleKey && before[tag] !== after[tag]) ||
      hashFile(executables.mcc.path) !== executables.mcc.sha256) {
    throw new Error('Carrier recovery changed an unreviewed tag or native tool');
  }
  manifest.changes.push({tag:standardCarrier, reason:'Bind the original five-node carrier to a separate native stand/unarmed idle graph',
    beforeSha256:pins[standardCarrier], afterSha256:hashFile(carrierFile), retainedOriginalGraphSha256:pins[originalGraph],
    graph:recoveredCarrierGraph, graphSha256:hashFile(graphFile), modelSha256:pins[model], checksum:Number(checksum)});
  save();
  return readback;
}

function writeCrcCheckedDerivative(map, sourceSha256, staged, folderName, phase) {
  const folder = path.join(output, folderName);
  fs.mkdirSync(folder);
  const candidate = path.join(folder, path.basename(map));
  fs.writeFileSync(candidate, staged, { flag: 'wx' });
  const crc = run('crc', ['--fix-header', candidate], phase + '-crc');
  const readback = fs.readFileSync(candidate);
  if (crc.exitCode !== 0 || crc.incomplete || !readback.subarray(0, 0x64).equals(staged.subarray(0, 0x64))
      || !readback.subarray(0x68).equals(staged.subarray(0x68)) || hashFile(map) !== sourceSha256
      || hashFile(executables.crc.path) !== executables.crc.sha256) {
    throw new Error(phase + ' changed bytes outside the reviewed change and CRC fields');
  }
  const info = run('info', ['-T', 'crc32_mismatched', candidate], phase + '-readback-crc');
  if (info.exitCode !== 0 || info.incomplete || !['0', 'false'].includes(info.stdout.trim().toLowerCase())) {
    throw new Error('Independent readback rejected the repaired cache CRC');
  }
  return { path: candidate, cacheSha256: sha(readback) };
}

function writeReviewedCarrierInverse(map, nativeSha256) {
  // These native MCC offsets apply only to the exact original-carrier recovery build.
  const reviewedSha256 = 'd520d509aa6a23a3fa67d37c28cc74459835ae53c0a4dae615f910e87b60b958';
  const original = fs.readFileSync(map);
  if (nativeSha256 !== reviewedSha256 || sha(original) !== reviewedSha256) {
    throw new Error('The compiled Zombie cache differs from the reviewed carrier physics layout');
  }
  const physics = 86_351_258;
  const inverseAt = 86_351_422;
  const pointsCount = original.readUInt32LE(physics + 0x74);
  const tagStart = original.readUInt32LE(0x10);
  const points = tagStart + original.readUInt32LE(physics + 0x78) - (original.readUInt32LE(tagStart) - 0x28);
  const triple = offset => [0, 4, 8].map(delta => original.readFloatLE(offset + delta));
  const center = triple(physics + 12);
  const mass = Array.from({ length: pointsCount }, (_, i) => original.readFloatLE(points + i * 128 + 0x2c));
  const originalInverse = Array.from({ length: 9 }, (_, i) => original.readFloatLE(inverseAt + i * 4));
  if (pointsCount !== 15 || mass.some(value => !Number.isFinite(value) || value <= 0) || originalInverse.some(Number.isFinite)) {
    throw new Error('The reviewed carrier needs 15 positive masses and a fully nonfinite stored inverse');
  }

  // Reconstruct the point-mass tensor about the authored center, then invert it.
  const relative = mass.map((_, i) => triple(points + i * 128 + 0x38).map((value, axis) => value - center[axis]));
  const tensor = (row, column) => relative.reduce((sum, point, i) => sum + mass[i] * (
    (row === column ? point.reduce((subtotal, value) => subtotal + value * value, 0) : 0) - point[row] * point[column]
  ), 0);
  const [xx, xy, xz, yy, yz, zz] = [[0,0], [0,1], [0,2], [1,1], [1,2], [2,2]].map(([row, column]) => tensor(row, column));
  const cofactors = [yy*zz-yz*yz, xz*yz-xy*zz, xy*yz-xz*yy, xx*zz-xz*xz, xy*xz-xx*yz, xx*yy-xy*xy];
  const [a,b,c,d,e,f] = cofactors;
  const determinant = xx*a + xy*b + xz*c;
  if (!Number.isFinite(determinant) || determinant <= 0 || xx <= 0 || f <= 0) {
    throw new Error('The carrier masses do not yield a positive invertible inertia tensor');
  }
  const inverse = [a,b,c,b,d,e,c,e,f].map(value => Math.fround(value / determinant));
  if (inverse.some(value => !Number.isFinite(value))) throw new Error('The carrier inverse contains a nonfinite value');
  const staged = Buffer.from(original);
  inverse.forEach((value, i) => staged.writeFloatLE(value, inverseAt + i * 4));
  const candidate = writeCrcCheckedDerivative(map, nativeSha256, staged, 'mcc-carrier-inertia', 'carrier-inertia');
  manifest.results.push({ step: 'repair-carrier-inertia', ...candidate, sourceCacheSha256: nativeSha256,
    inverseOffset: inverseAt, massPoints: pointsCount, inverse, playable: false });
  save();
  return candidate;
}

function writeReviewedLegacyTitle(parent) {
  // Score-hint slot 100 is a custom title in this exact cache, not a stock hint.
  const reviewedSha256 = '95bd7990b2aa3259f44119f4caa63d3b393e61186e19bd1faf8e65a53e8206d2';
  const original = fs.readFileSync(parent.path);
  if (parent.cacheSha256 !== reviewedSha256 || sha(original) !== reviewedSha256) {
    throw new Error('The inertia-corrected cache differs from the reviewed legacy title layout');
  }
  const start = 89_024_390;
  const expected = Buffer.from('Zombie Apocalypse   ', 'utf16le');
  if (!original.subarray(start, start + expected.length).equals(expected)) {
    throw new Error('The title slot does not contain the reviewed padded string');
  }
  const offset = start + expected.length - 2;
  const staged = Buffer.from(original);
  staged.writeUInt16LE(0, offset);
  const candidate = writeCrcCheckedDerivative(parent.path, reviewedSha256, staged, 'mcc-legacy-title', 'legacy-title');
  manifest.results.push({ step: 'repair-legacy-title', ...candidate, sourceCacheSha256: reviewedSha256,
    tag: 'ui/multiplayer_game_text.unicode_string_list', slot: 100, offset,
    title: 'Zombie Apocalypse', replacedTrailingPaddingBytes: 1, playable: false });
  save();
  return candidate;
}

function writeReviewedVorbisTails(parent) {
  // Each final Ogg page keeps its original checksum. A single changed payload
  // byte independently restores that checksum and the complete decoded sample.
  const reviewedSha256 = 'dca4f32e3d74d27db6bc761fb3ddff317280c19147e9b37f4a121e8abe28d73c';
  const original = fs.readFileSync(parent.path);
  if (parent.cacheSha256 !== reviewedSha256 || sha(original) !== reviewedSha256) {
    throw new Error('The title-corrected cache differs from the reviewed Vorbis payload layout');
  }
  const gameModeBefore = '2829fc18637767d6c155bd5d5fbbef10e0803dc5ae7fbf0249c3de1d1ab0de6c';
  const gameModeAfter = '12a8d073b0d798a6b74f998085c731106fa07f702016b3a61084afdf1b7a3021';
  const reviewed = [
    ['double_kill', 57_970_691, 31_651,
      '04c3946a26f8b2cef14b27f683d1f574faa2a755c7e427d8d70f432e027d8769',
      'e7543b75af071977b4483912b354a0a68169488baacf4f80f0b118bcb45f87e8', 406_528],
    ['30_seconds_to_win', 63_880_899, 273_445,
      'e3a11897764a650803907ef2c0d1ed15cf7500c153124b4a7c977f1fe27fc9a4',
      '82999d6a9b6ea0b60a2fab556c81bccbdf7bca562e9ff80d3170d648d64a8ac2', 551_936],
    ['blue_team_30_to_win', 64_211_064, 20_765,
      '64bd0e55a98d303627124cac85e67d088ceef0e8230e0d41d250bc5113fd168c',
      'ec6157aab5571a1f63332f32daaeed038c95dff2cbdb78bde48b5b8d84bb9b38', 215_040],
    ['slayer', 64_423_182, 27_477, gameModeBefore, gameModeAfter, 233_472],
    ['capture_the_flag', 64_450_659, 27_477, gameModeBefore, gameModeAfter, 233_472],
  ];
  const staged = Buffer.from(original);
  const restored = reviewed.map(([name, start, length, beforeSha256, afterSha256, verifiedFrames]) => {
    const offset = start + length - 1;
    if (original[offset] !== 0 || sha(original.subarray(start, offset + 1)) !== beforeSha256) {
      throw new Error('Unexpected original Vorbis bytes for ' + name);
    }
    staged[offset] = 0x0e;
    if (sha(staged.subarray(start, offset + 1)) !== afterSha256) {
      throw new Error('Restored Vorbis bytes do not match the full-decoding witness for ' + name);
    }
    return { tag: 'sound/dialog/multiplayer1/' + name + '.sound', pitchRange: 0, permutation: 0,
      offset, length, beforeSha256, afterSha256, verifiedFrames, sampleRate: 44100, channels: 2 };
  });
  const candidate = writeCrcCheckedDerivative(parent.path, reviewedSha256, staged, 'mcc-vorbis-restored', 'vorbis-tail');
  // Native Invader serialization makes the same repairs available as an
  // overlay for future source builds, without rewriting the recovered tag tree.
  const sourceOverlay = path.join(output, 'vorbis-native-tags');
  fs.mkdirSync(sourceOverlay);
  const extracted = run('extract', ['-t', sourceOverlay, '-G',
    ...restored.flatMap(({ tag }) => ['-s', tag]), candidate.path], 'vorbis-native-tag-overlay');
  if (extracted.exitCode !== 0 || extracted.incomplete || /Failed to extract|ERROR:/.test(extracted.log)
      || !/Extracted 5 out of 5 matched tags?\b/.test(extracted.log)) {
    throw new Error('Native extraction did not export all five repaired sound tags');
  }
  for (const sound of restored) {
    const file = path.join(sourceOverlay, sound.tag);
    const tag = fs.readFileSync(file);
    const sample = staged.subarray(sound.offset + 1 - sound.length, sound.offset + 1);
    const at = tag.indexOf(sample);
    if (!fs.lstatSync(file).isFile() || at < 0 || tag.indexOf(sample, at + 1) !== -1) {
      throw new Error('Native source tag did not retain one exact repaired sample for ' + sound.tag);
    }
    sound.exportedTagSha256 = sha(tag);
  }
  manifest.results.push({ step: 'repair-vorbis-tail', ...candidate, sourceCacheSha256: reviewedSha256,
    restored, sourceOverlay, replacedPayloadBytes: restored.length, playable: false });
  save();
}

function stageReviewedLegacySpawners() {
  const editorSha = '02e5f41da7f5dbfade250921869239f8d21c36c336cb0be081a9910dca17aa12';
  if (executables.edit.sha256 !== editorSha || hashFile(executables.edit.path) !== editorSha) {
    throw new Error('Legacy spawner staging requires the reviewed native tag editor');
  }
  const reviewed = [
    ['evolved', 'mgm/fonzie/sparky/tags/ai respawning/evolved zombie spawnerorig.weapon',
      'a19be43a61c567327d067b4f11b0dc5bcf7e690c63aaa91a9e405306cca6a7a9',
      'mgm/fonzie/sparky/tags/evolved zombie container.vehicle'],
    ['alpha', 'origmgm/fonzie/sparky/tags/ai respawning/alpha zombie spawner.weapon',
      'fd657f5f8727c8e3b44df345861596bf0e263379974478de8ca50f8259dcd468',
      'mgm/fonzie/sparky/tags/alpha zombie containerorig.vehicle'],
    ['standard', 'mgm/fonzie/sparky/tags/ai respawning/zombie spawner.weapon',
      '2d17c3a69b700e727825dac093b4f236c8f526d2d0ba7af89038a5a4fe3863c0', standardCarrier],
  ];
  const directory = path.join(output, 'legacy-spawner-tags');
  fs.mkdirSync(directory);
  const stem = 'spark_recovery/legacy_spawner/';
  fs.mkdirSync(path.join(directory, stem), { recursive: true });
  const trigger = 'triggers[0].projectile';
  const edit = (tag, params, phase) => editTag(tag, params, phase, directory);
  const expectValues = (actual, expected, label) => {
    if (JSON.stringify(actual.map(normalizeNativePath)) !== JSON.stringify(expected)) {
      throw new Error('Native legacy spawner readback differs: ' + label);
    }
  };
  const spawners = [];
  for (const [name, weapon, weaponSha256, carrier] of reviewed) {
    const original = path.join(tags, weapon);
    if (hashFile(original) !== weaponSha256 || !fs.lstatSync(path.join(tags, carrier)).isFile()) {
      throw new Error('Original weapon or carrier identity differs: ' + name);
    }
    expectValues(editTag(weapon, ['-C', 'triggers', '-G', trigger], name + '-original-spawner'),
      ['1', carrier], name + ' original');
    const originalFields = editTag(weapon, ['-L'], name + '-original-spawner-fields');
    const projectile = stem + name + '.projectile';
    const effect = stem + name + '.effect';
    edit(effect, ['-N', '-I', 'locations', '1', 'end', '-I', 'events', '1', 'end',
      '-I', 'events[0].parts', '1', 'end', '-S', 'events[0].parts[0].location', '0',
      '-S', 'events[0].parts[0].type', carrier], name + '-carrier-effect');
    expectValues(edit(effect, ['-C', 'locations', '-C', 'events', '-C', 'events[0].parts',
      '-C', 'events[0].particles', '-G', 'events[0].parts[0].location', '-G', 'events[0].parts[0].type'],
    name + '-legacy-effect-readback'), ['1', '1', '1', '0', '0', carrier], name + ' effect');
    edit(projectile, ['-N', '-S', 'creation_effect', effect, '-S', 'timer', '0.1,0.1'],
      name + '-carrier-projectile');
    expectValues(edit(projectile, ['-G', 'creation_effect', '-G', 'timer', '-G', 'detonation_timer_starts',
      '-G', 'initial_velocity', '-G', 'final_velocity'], name + '-legacy-projectile-readback'),
    [effect, '0.100000,0.100000', 'immediately', '0.000000', '0.000000'], name + ' projectile');
    const copy = path.join(directory, weapon);
    fs.mkdirSync(path.dirname(copy), { recursive: true });
    fs.copyFileSync(original, copy, fs.constants.COPYFILE_EXCL);
    edit(weapon, ['-S', trigger, projectile], name + '-bind-legacy-spawner');
    expectValues(edit(weapon, ['-C', 'triggers', '-G', trigger], name + '-legacy-weapon-readback'),
      ['1', projectile], name + ' weapon');
    const updatedFields = edit(weapon, ['-L'], name + '-legacy-spawner-fields');
    const triggerText = value => /projectile \([^()]+\.(?:projectile|vehicle)\)/.test(value);
    if (originalFields.filter(triggerText).length !== 1 || updatedFields.filter(triggerText).length !== 1 ||
        JSON.stringify(originalFields.filter(line => !triggerText(line))) !== JSON.stringify(updatedFields.filter(line => !triggerText(line))) ||
        hashFile(original) !== weaponSha256) {
      throw new Error('Legacy staging changed weapon fields outside the first trigger dependency: ' + name);
    }
    spawners.push({ name, weapon, projectile, effect, carrier, originalWeaponSha256: weaponSha256,
      overlaySha256: Object.fromEntries([weapon, projectile, effect].map(tag => [tag, hashFile(path.join(directory, tag))])) });
  }
  if (hashFile(executables.edit.path) !== editorSha) throw new Error('Native tag editor changed during legacy staging');
  manifest.results.push({ step: 'stage-legacy-spawners', directory, spawners, playable: false,
    limitations: ['Native source overlay only. Carrier egress, collision and replication still need a separate engine trial.'] });
  save();
}

// Decode the complete owned stream at its authored rate, then reuse the
// audited C46 frame preparation before handing it to native Invader.
async function prepareClassicSoundWave(page, stream, expectedFrames) {
  const wave = await page.evaluate(async ({ base64, expectedFrames }) => {
    const encoded = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    const context = new OfflineAudioContext(2, 1, 44100);
    const decoded = await context.decodeAudioData(encoded.buffer);
    const { length: frames, numberOfChannels: channels, sampleRate: rate } = decoded;
    if (frames !== expectedFrames || channels !== 2 || rate !== 44100) throw new Error('Changed owned sound dimensions');
    const bytes = new Uint8Array(44 + frames * channels * 2);
    const view = new DataView(bytes.buffer);
    const writeText = (offset, text) => bytes.set(new TextEncoder().encode(text), offset);
    writeText(0, 'RIFF');
    view.setUint32(4, bytes.length - 8, true);
    writeText(8, 'WAVEfmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    writeText(36, 'data');
    view.setUint32(40, bytes.length - 44, true);
    for (let channel = 0; channel < channels; channel++) {
      const samples = decoded.getChannelData(channel);
      for (let frame = 0; frame < frames; frame++) {
        const sample = Math.round(samples[frame] * 32768);
        view.setInt16(44 + (frame * channels + channel) * 2, Math.max(-32768, Math.min(32767, sample)), true);
      }
    }
    const pieces = [];
    for (let at = 0; at < bytes.length; at += 24576) pieces.push(btoa(String.fromCharCode(...bytes.subarray(at, at + 24576))));
    return pieces.join('');
  }, { base64: stream.toString('base64'), expectedFrames });
  return prepareNativeAdpcmWave(Buffer.from(wave, 'base64'));
}

async function prepareClassicCeTags() {
  const before = hashTagInventory();
  const directory = path.join(output, 'classic-ce-tags');
  fs.cpSync(tags, directory, { recursive: true, force: false, errorOnExist: true });
  const audio = manifest.results.find(row => row.step === 'repair-vorbis-tail');
  const spawners = manifest.results.find(row => row.step === 'stage-legacy-spawners');
  const stage = (source, tag, expected) => {
    const from = path.join(source, tag), to = path.join(directory, tag);
    if (!inside(from, source) || !inside(to, directory) || !fs.lstatSync(from).isFile() ||
        !inside(fs.realpathSync(from), source) || hashFile(from) !== expected) {
      throw new Error('Classic CE overlay differs from its reviewed native tag: ' + tag);
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    if (hashFile(to) !== expected) throw new Error('Native overlay copy did not verify: ' + tag);
  };
  for (const row of audio.restored) stage(audio.sourceOverlay, row.tag, row.exportedTagSha256);
  for (const row of spawners.spawners) {
    for (const [tag, expected] of Object.entries(row.overlaySha256)) stage(spawners.directory, tag, expected);
  }
  const edit = (tag, args, phase) => editTag(tag, args, phase, directory);
  const get = (tag, fields, phase) => edit(tag, fields.flatMap(field => ['-G', field]), phase);
  const expect = (actual, expected, phase) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Classic CE native readback differs: ' + phase);
  };
  const restoredBuffers = audio.restored.map(row => {
    const permutation = 'pitch_ranges[0].permutations[0]';
    const bufferSize = permutation + '.buffer_size';
    const fields = ['format', 'channel_count', permutation + '.format', bufferSize];
    const original = get(row.tag, fields, 'classic-sound-before-' + path.basename(row.tag));
    if (!['ogg_vorbis', '16-bit_pcm'].includes(original[0]) ||
        original[1] !== 'stereo' || row.channels !== 2 || original[2] !== 'ogg_vorbis') {
      throw new Error('Unexpected restored sound format: ' + row.tag);
    }
    expect(edit(row.tag, ['-C', 'pitch_ranges', '-C', 'pitch_ranges[0].permutations'], 'classic-sound-count'),
      ['1', '1'], 'single restored sound permutation');
    const filename = path.join(directory, row.tag);
    const originalBytes = fs.readFileSync(filename);
    const oggAt = originalBytes.indexOf('OggS');
    const sample = originalBytes.subarray(oggAt, oggAt + row.length);
    if (oggAt < 0 || sha(sample) !== row.afterSha256) throw new Error('Restored Vorbis bytes differ: ' + row.tag);
    const decodedBytes = String(row.verifiedFrames * row.channels * 2);
    const args = ['-n', '-S', bufferSize, decodedBytes];
    if (original[0] !== 'ogg_vorbis') args.push('-S', 'format', 'ogg_vorbis');
    edit(row.tag, args, 'classic-sound-buffer-' + path.basename(row.tag));
    expect(get(row.tag, fields, 'classic-sound-after-' + path.basename(row.tag)),
      ['ogg_vorbis', 'stereo', 'ogg_vorbis', decodedBytes], 'decoded 16-bit buffer size');
    const current = fs.readFileSync(filename);
    if (current.length !== originalBytes.length || !current.subarray(oggAt, oggAt + row.length).equals(sample)) {
      throw new Error('Buffer metadata edit changed Vorbis data: ' + row.tag);
    }
    return {tag: row.tag, decodedBytes: Number(decodedBytes), sampleSha256: row.afterSha256};
  });

  const effect = 'weapons/pistol/melee.damage_effect';
  const sound = 'sound/dialog/flood/pain.sound';
  expect(get('weapons/fuel rod gun/explosion.damage_effect', ['sound'], 'classic-melee-linked-sound')
    .map(normalizeNativePath), [sound], 'authored nested sound');
  const meleeFields = ['type', 'maximum_intensity', 'high_frequency_vibrate_frequency', 'sound',
    'duration', 'color', 'damage_lower_bound', 'damage_upper_bound', 'radius'];
  const meleeBefore = ['lighten', '3.000000', '3.000000', 'weapons/fuel rod gun/explosion.damage_effect',
    '3.000000', '0.000000,1.000000,0.090196,0.113725', '400.000000', '400.000000,400.000000', '4.000000,4.000000'];
  expect(get(effect, meleeFields, 'classic-melee-before').map(normalizeNativePath), meleeBefore, 'original melee');
  const fieldsWithout = (rows, fields) => rows.filter(row => !fields.some(field => row.trimStart().startsWith(field + ' ')));
  const meleeListing = edit(effect, ['-L'], 'classic-melee-fields-before');
  edit(effect, ['-S', 'maximum_intensity', '1', '-S', 'high_frequency_vibrate_frequency', '1', '-S', 'sound', sound], 'classic-melee-rebind');
  const meleeAfter = [meleeBefore[0], '1.000000', '1.000000', sound, ...meleeBefore.slice(4)];
  expect(get(effect, meleeFields, 'classic-melee-after').map(normalizeNativePath), meleeAfter, 'target melee');
  const changedMelee = ['maximum_intensity', 'high_frequency_vibrate_frequency', 'sound'];
  expect(fieldsWithout(edit(effect, ['-L'], 'classic-melee-fields-after'), changedMelee),
    fieldsWithout(meleeListing, changedMelee), 'unchanged melee fields');

  const damageBounds = [
    ['characters/hunter/melee.damage_effect', 10, 3, 3],
    ['mgm/kiyoshi/broke/tags/molotov explosion.damage_effect', 2, 2, 2],
    ['weapons/ball/melee.damage_effect', 3, 1, 1],
    ['weapons/flag/melee.damage_effect', 3, 1, 1],
    ['weapons/flamethrower/melee.damage_effect', 3, 1.5, 1.5],
    ['weapons/shotgun/melee.damage_effect', 3, 1, 1],
    ['weapons/sniper rifle/melee.damage_effect', 3, 1, 1],
  ];
  const cappedDamageFields = ['maximum_intensity', 'damage_stun', 'damage_maximum_stun'];
  for (const [tag, ...values] of damageBounds) {
    expect(get(tag, cappedDamageFields, 'classic-damage-before'), values.map(value => value.toFixed(6)),
      'original flash and stun values for ' + tag);
    const changed = cappedDamageFields.filter((_, i) => values[i] > 1);
    const listing = edit(tag, ['-L'], 'classic-damage-fields-before');
    edit(tag, changed.flatMap(field => ['-S', field, '1']), 'classic-damage-bounds');
    expect(get(tag, cappedDamageFields, 'classic-damage-after'), ['1.000000', '1.000000', '1.000000'],
      'CE flash and stun values for ' + tag);
    expect(fieldsWithout(edit(tag, ['-L'], 'classic-damage-fields-after'), changed),
      fieldsWithout(listing, changed), 'unchanged damage fields for ' + tag);
  }

  const turret = 'mgm/fonzie/sparky/tags/weapons/undead demolisher turret.actor_variant';
  if (hashFile(path.join(directory, turret)) !== '0b283abfa21831e05ecbb5065aed2f33f4505c11cb5b9e0bfcc270af90af1f0f') {
    throw new Error('Demolisher turret differs from the audited source');
  }
  const grenadeFields = ['grenade_type', 'trajectory_type', 'grenade_stimulus'];
  const inactiveGrenades = ['grenade_chance', 'grenade_count', 'grenade_velocity', 'grenade_ranges'];
  const disabled = ['0.000000', '0,0', '0.000000', '0.000000,0.000000'];
  expect(get(turret, inactiveGrenades, 'classic-turret-before'), disabled, 'zero turret grenade chance and inventory');
  const legalEnums = ['human_fragmentation', 'toss', 'never'];
  edit(turret, grenadeFields.flatMap((field, i) => ['-S', field, legalEnums[i]]), 'classic-turret-enums');
  expect(get(turret, [...grenadeFields, ...inactiveGrenades], 'classic-turret-after'),
    [...legalEnums, ...disabled], 'inactive turret grenade values');

  const vehicleFields = ['vehicle_palette[*].name', 'vehicles[*].type'];
  const [palette, types] = vehicleFields.map((field, i) => get(scenarioTag, [field], 'classic-vehicles-before-' + i));
  const empty = palette.flatMap((tag, i) => tag === '' || tag === '.vehicle' ? [i] : []);
  expect(empty, [1, 2], 'unused vehicle palette entries');
  expect(types, ['0', '3', '3', '3', '3', '4', '0'], 'original vehicle placements');
  const placements = types.map(type => Number(type));
  const remapped = placements.map(type => type - empty.filter(slot => slot < type).length);
  edit(scenarioTag, [...empty.slice().reverse().flatMap(i => ['-E', 'vehicle_palette[' + i + ']']),
    ...remapped.flatMap((type, i) => ['-S', 'vehicles[' + i + '].type', String(type)])], 'classic-vehicles-reindex');
  expect(get(scenarioTag, [vehicleFields[0]], 'classic-vehicles-palette-after'),
    palette.filter((_, i) => !empty.includes(i)), 'remaining vehicle palette');
  expect(get(scenarioTag, [vehicleFields[1]], 'classic-vehicles-placements-after'), remapped.map(String), 'remapped vehicle placements');
  // The original model uses fifteen light-class references in shader slots
  // and is intentionally unrendered. Keep the geometry, rig and collision,
  // with a native transparent material for engines that require shader tags.
  const model = 'vehicles/rwarthog/rwarthog.gbxmodel';
  const shader = 'spark_recovery/classic_ce/invisible_carrier.shader_transparent_chicago';
  const bitmapStem = 'spark_recovery/classic_ce/invisible_carrier';
  const bitmap = bitmapStem + '.bitmap';
  const standardModel = 'weapons/gravity rifle/gravity rifle.gbxmodel';
  const carrierModels = [[model, 15], [standardModel, 3]];
  const data = path.join(output, 'classic-ce-data');
  const image = path.join(data, bitmapStem + '.tga');
  fs.mkdirSync(path.dirname(image), { recursive: true });
  const pixels = Buffer.alloc(18 + 16 * 16 * 4);
  pixels[2] = 2; // Uncompressed BGRA TGA, including eight alpha bits.
  pixels.writeUInt16LE(16, 12);
  pixels.writeUInt16LE(16, 14);
  pixels[16] = 32;
  pixels[17] = 0x28;
  // Invader removes entirely transparent plates. Opaque black contributes
  // zero RGB with the native additive framebuffer blend.
  for (let offset = 21; offset < pixels.length; offset += 4) pixels[offset] = 255;
  fs.writeFileSync(image, pixels, { flag: 'wx' });
  fs.mkdirSync(path.dirname(path.join(directory, bitmap)), { recursive: true });
  const texture = run('bitmap', ['-t', directory, '-d', data, '-F', '32-bit', '-u', 'alpha_blend',
    bitmapStem], 'classic-carrier-transparent-bitmap');
  if (texture.exitCode !== 0 || texture.incomplete || !fs.lstatSync(path.join(directory, bitmap)).isFile()) {
    throw new Error('Native tool did not compile the transparent carrier texture');
  }
  edit(shader, ['-N', '-S', 'framebuffer_blend_function', 'add', '-I', 'maps', '1', 'end',
    '-S', 'maps[0].map', bitmap, '-S', 'maps[0].map_u_scale', '1', '-S', 'maps[0].map_v_scale', '1'],
    'classic-carrier-transparent-shader');
  expect(get(shader, ['framebuffer_blend_function', 'maps[0].map'], 'classic-carrier-transparent-readback')
    .map(normalizeNativePath), ['add', bitmap], 'native zero-color material');
  for (const [carrierModel, slots] of carrierModels) {
    const originalShaders = get(carrierModel, ['shaders[*].shader'], 'classic-carrier-shaders-before').map(normalizeNativePath);
    expect(originalShaders, Array(slots).fill('effects/lights/coop teleport.light'), 'original light placeholders for ' + carrierModel);
    edit(carrierModel, originalShaders.flatMap((_, i) => ['-S', 'shaders[' + i + '].shader', shader]), 'classic-carrier-rebind-shaders');
    expect(get(carrierModel, ['shaders[*].shader'], 'classic-carrier-shaders-after').map(normalizeNativePath),
      originalShaders.map(() => shader), 'target carrier material for ' + carrierModel);
  }
  // Classic CE requires two render and collision regions here. Add tire
  // metadata without adding collision surfaces to the original compact hull.
  const sharedCarriers = [
    'mgm/fonzie/sparky/tags/evolved zombie container.vehicle',
    'mgm/fonzie/sparky/tags/alpha zombie containerorig.vehicle',
  ];
  const ammoCollision = 'powerups/sniper rifle ammo/sniper rifle ammo.model_collision_geometry';
  const carrierCollision = 'spark_recovery/classic_ce/evolved_carrier.model_collision_geometry';
  const originalCollision = fs.readFileSync(path.join(directory, ammoCollision));
  expect(sha(originalCollision), '96eef6de3ceffca4f990f7d6d17716c8f37a7c942c5c440a7967a9942983ee5a',
    'original compact collision tag');
  const readCarrier = tag => get(tag, ['model', 'collision_model'], 'classic-carrier-binding').map(normalizeNativePath);
  expect(readCarrier(standardCarrier), [standardModel, ammoCollision], 'original Standard carrier binding');
  const renderRegions = get(model, ['regions[*].name', 'regions[*].permutations[*].name'], 'classic-evolved-render-regions');
  expect(renderRegions, ['hull', 'tire', '__base', '__base', '~blur'], 'Evolved render region order');
  const sourceFields = ['regions[*].name', 'regions[*].permutations[*].name', 'nodes[0].region', 'nodes[0].name'];
  expect(get(ammoCollision, sourceFields, 'classic-evolved-collision-before'),
    ['__unnamed', '__base', '0', 'frame ammo'], 'original single collision region');
  const derivedCollision = path.join(directory, carrierCollision);
  fs.copyFileSync(path.join(directory, ammoCollision), derivedCollision, fs.constants.COPYFILE_EXCL);
  edit(carrierCollision, ['-n', '-S', 'regions[0].name', 'hull', '-I', 'regions', '1', 'end',
    '-S', 'regions[1].name', 'tire', '-I', 'regions[1].permutations', '2', 'end',
    '-S', 'regions[1].permutations[0].name', '__base', '-S', 'regions[1].permutations[1].name', '~blur'],
    'classic-evolved-collision-regions');
  expect(get(carrierCollision, sourceFields, 'classic-evolved-collision-after'),
    [...renderRegions, '0', 'frame ammo'], 'carrier collision regions and original node');
  expect(edit(carrierCollision, ['-V', '-C', 'nodes', '-C', 'nodes[0].bsps', '-C', 'pathfinding_spheres'],
    'classic-evolved-collision-counts'), ['matched', '1', '1', '0'], 'original hull BSP and no extra collision nodes');
  const fixedCollision = fs.readFileSync(derivedCollision);
  const nodeAnchor = Buffer.from('frame ammo');
  const oldNode = originalCollision.indexOf(nodeAnchor);
  const newNode = fixedCollision.indexOf(nodeAnchor);
  if (oldNode < 0 || newNode < 0 || originalCollision.indexOf(nodeAnchor, oldNode + 1) !== -1 ||
      fixedCollision.indexOf(nodeAnchor, newNode + 1) !== -1 ||
      !fixedCollision.subarray(newNode).equals(originalCollision.subarray(oldNode))) {
    throw new Error('Matching Evolved regions changed the original node or collision BSP bytes');
  }
  for (const carrier of sharedCarriers) {
    expect(readCarrier(carrier), [model, ammoCollision], 'original carrier binding for ' + carrier);
    edit(carrier, ['-S', 'collision_model', carrierCollision], 'classic-bind-carrier-collision');
    expect(readCarrier(carrier), [model, carrierCollision], 'reviewed carrier binding for ' + carrier);
  }
  expect(hashFile(path.join(directory, ammoCollision)), sha(originalCollision), 'preserved ammo collision tag');

  const physics = 'fzero/zombie/zombiephysics.physics';
  const moment = ['-G', 'moment_scale', '-G', 'mass', '-C', 'mass_points'];
  expect(edit(physics, moment, 'classic-carrier-inertia-before'),
    ['0.000000', '10000.000000', '15'], 'original zero moment scale and authored mass points');
  const originalPhysics = fieldsWithout(edit(physics, ['-L'], 'classic-carrier-physics-fields-before'), ['moment_scale']);
  // The MCC repair reconstructed the unit-scale tensor from those same
  // mass points. Classic Tool data requires that scale to be explicit.
  edit(physics, ['-S', 'moment_scale', '1'], 'classic-carrier-unit-moment-scale');
  expect(edit(physics, moment, 'classic-carrier-inertia-after'),
    ['1.000000', '10000.000000', '15'], 'unit moment scale and unchanged mass points');
  expect(fieldsWithout(edit(physics, ['-L'], 'classic-carrier-physics-fields-after'), ['moment_scale']),
    originalPhysics, 'unchanged authored carrier physics fields');
  const rotationalBitmaps = [
    ['halo3/weapons/fire-grenade/bitmaps/fire-ball1+.bitmap', '533325045c53df2811f1c08e3c2bac6cca3ad7413e0e6b9250aa2063284e642f', 344064, 1],
    ['halo3/weapons/fire-grenade/bitmaps/flame+.bitmap', 'bca0242071cca2a98dfacd14ee226296f7a1b41b026c61a146aea87828e991ff', 344064, 1],
    ['h2/effects/particles/smoke_soft/smoke_soft+.bitmap', '7f6291b95c91f79087320e94b4c3a437b95350199a8cb2b6370fa2ac8c8179c9', 86016, 1],
    ['halo3/weapons/fire-grenade/bitmaps/burning-fire_animated+.bitmap', '265e32c90f1071074a8baef2f967d320931cfc8ff6cf1c470ba091d60585a0fa', 1376256, 6],
  ];
  const [ball, flame, smoke, burning] = rotationalBitmaps.map(([tag]) => tag);
  const parent = 'halo3/weapons/fire-grenade/effects/particle-system/';
  const state = 'particle_types[0].particle_states';
  for (const [name, bitmaps] of [
    ['fire-explosion+', [ball, flame, flame, flame, smoke]],
    ['single_fire-cloud+', [burning, flame, flame, smoke, smoke]],
  ]) {
    expect(get(parent + name + '.particle_system', ['particle_types[0].complex_sprite_render_mode',
      state + '[*].bitmaps', state + '[*].sequence_index'], 'classic-fire-state-bindings-' + name).map(normalizeNativePath),
      ['rotational', ...bitmaps, ...bitmaps.map(() => '0')], 'original rotational states of ' + name);
  }
  for (const [sprite, expectedSha, pixelBytes, frames] of rotationalBitmaps) {
    const frameCount = String(frames);
    const spriteFile = path.join(directory, sprite);
    const originalSprite = fs.readFileSync(spriteFile);
    if (sha(originalSprite) !== expectedSha) {
      throw new Error('The original fire sprite differs from the audited native layout');
    }
    const sequence = 'bitmap_group_sequence';
    expect(edit(sprite, ['-C', sequence, '-C', sequence + '[0].sprites'], 'classic-fire-sprite-before'), ['1', frameCount], 'original fire sequence');
    // Use the engine's existing same-sequence fallback as an explicit second
    // rotational slot. The typed edit touches only the disposable CE tag.
    edit(sprite, ['-n', '-c', sequence + '[0]', 'end'], 'classic-fire-sprite-rotation-slot');
    expect(edit(sprite, ['-V', '-C', sequence, '-C', sequence + '[0].sprites', '-C', sequence + '[1].sprites'],
      'classic-fire-sprite-after'), ['matched', '2', frameCount, frameCount], 'two checksum-valid references to the original sprite');
    const copied = fs.readFileSync(spriteFile);
    const sequenceStart = 172 + pixelBytes, sequenceSize = 64, spriteSize = 32 * frames;
    const originalSequence = originalSprite.subarray(sequenceStart, sequenceStart + sequenceSize);
    const originalFrame = originalSprite.subarray(sequenceStart + sequenceSize, sequenceStart + sequenceSize + spriteSize);
    const frameStart = sequenceStart + 2 * sequenceSize;
    const prefix = Buffer.from(copied.subarray(0, sequenceStart));
    originalSprite.copy(prefix, 40, 40, 44); // Tag writer updates checksum.
    if (copied.readUInt32BE(148) !== 2) throw new Error('Unexpected native sequence count');
    prefix.writeUInt32BE(1, 148);
    if (!prefix.equals(originalSprite.subarray(0, sequenceStart))
        || !copied.subarray(sequenceStart, frameStart).equals(Buffer.concat([originalSequence, originalSequence]))
        || !copied.subarray(frameStart, frameStart + 2 * spriteSize).equals(Buffer.concat([originalFrame, originalFrame]))
        || !copied.subarray(frameStart + 2 * spriteSize).equals(originalSprite.subarray(sequenceStart + sequenceSize + spriteSize))) {
      throw new Error('Rotational slot changed original pixel bytes or sprite fields');
    }
  }
  const feignDeath = [
    ['evolved zombie', '4.000000', '0.800000', 'halo3/weapons/fire-grenade/fire.effect'],
    ['alpha zombieorig', '2.000000', '0.300000', 'effects/coop teleport.effect'],
    ['alpha zombieorigshot', '2.000000', '0.300000', 'effects/coop teleport.effect'],
  ];
  const chance = 'feign_death_chance';
  for (const [name, originalChance, threshold, dormantEffect] of feignDeath) {
    const biped = 'mgm/fonzie/sparky/tags/zombies/' + name + '.biped';
    const fields = [chance, 'feign_death_threshold', 'feign_death_time', 'spawned_actor', 'spawned_actor_count'];
    const changed = [chance, 'spawned_actor'];
    const reads = fields.flatMap(field => ['-G', field]);
    const original = fieldsWithout(edit(biped, ['-L'], 'classic-feign-fields-before-' + name), changed);
    expect(edit(biped, reads, 'classic-feign-before-' + name).map(normalizeNativePath),
      [originalChance, threshold, '1.000000', dormantEffect, '0,0'], 'original feign behavior of ' + name);
    edit(biped, ['-S', chance, '1', '-S', 'spawned_actor', '.actor_variant'], 'classic-biped-compatibility-' + name);
    expect(edit(biped, reads, 'classic-feign-after-' + name),
      ['1.000000', threshold, '1.000000', '.actor_variant', '0,0'], 'CE feign behavior of ' + name);
    expect(fieldsWithout(edit(biped, ['-L'], 'classic-feign-fields-after-' + name), changed),
      original, 'unchanged biped fields of ' + name);
  }
  const carrierActor = 'mgm/fonzie/sparky/tags/zombies/evolved zombie orig.actor_variant';
  const tracking = 'target_tracking';
  const aimFields = ['weapon', 'major_variant', tracking];
  const unarmed = ['.weapon', '.actor_variant'];
  expect(get(carrierActor, aimFields, 'classic-evolved-aim-before'),
    [...unarmed, '2.000000'], 'original unarmed Evolved actor tracking');
  const actorListing = edit(carrierActor, ['-L'], 'classic-evolved-fields-before');
  edit(carrierActor, ['-S', tracking, '1'], 'classic-evolved-inactive-tracking-cap');
  expect(get(carrierActor, aimFields, 'classic-evolved-aim-after'),
    [...unarmed, '1.000000'], 'CE unarmed Evolved actor tracking');
  expect(fieldsWithout(edit(carrierActor, ['-L'], 'classic-evolved-fields-after'), [tracking]),
    fieldsWithout(actorListing, [tracking]), 'unchanged Evolved actor fields');
  // Classic multiplayer can encode seven carried grenades per
  // slot. Keep both authored Molotov references and zero starting counts.
  const globals = 'globals/globals.globals';
  const maximum = ['grenades[0].maximum_count', 'grenades[1].maximum_count'];
  const grenadeRules = ['grenades[*].maximum_count', 'grenades[*].mp_spawn_default', 'grenades[*].projectile'];
  const molotov = 'mgm/kiyoshi/broke/tags/equipment/molotov.projectile';
  expect(get(globals, grenadeRules, 'classic-global-grenades-before').map(normalizeNativePath),
    ['8', '8', '0', '0', molotov, molotov], 'original multiplayer Molotov inventory');
  const inventoryListing = edit(globals, ['-L'], 'classic-global-fields-before');
  edit(globals, maximum.flatMap(field => ['-S', field, '7']), 'classic-multiplayer-grenade-cap');
  expect(get(globals, grenadeRules, 'classic-global-grenades-after').map(normalizeNativePath),
    ['7', '7', '0', '0', molotov, molotov], 'Classic multiplayer Molotov inventory');
  expect(edit(globals, ['-L'], 'classic-global-fields-after'),
    inventoryListing.map(line => line.replace(/(\bmaximum_count )\(8\)/, '$1(7)')), 'only the two grenade caps changed');

  const dormantMaterialEffects = [
    [3, 'alpha zombieorig'], [13, 'zombie'], [17, 'evolved zombie'],
  ];
  const materialEffects = get(globals, ['materials[*].effect'], 'classic-material-effects-before').map(normalizeNativePath);
  expect(materialEffects.flatMap((tag, i) => tag.endsWith('.effect') ? [] : [i]),
    dormantMaterialEffects.map(([i]) => i), 'only the reviewed legacy material misbindings');
  for (const [i, name] of dormantMaterialEffects) {
    const material = 'materials[' + i + ']';
    const fields = [material + '.maximum_vitality', material + '.effect'];
    expect(get(globals, fields, 'classic-material-before').map(normalizeNativePath),
      ['0.000000', 'mgm/fonzie/sparky/tags/zombies/' + name + '.biped'], 'dormant breakable-material entry');
    edit(globals, ['-S', fields[1], '.effect'], 'classic-clear-dormant-material-effect');
    materialEffects[i] = '.effect';
  }
  expect(get(globals, ['materials[*].effect'], 'classic-material-effects-after').map(normalizeNativePath),
    materialEffects, 'preserve all valid breakable-material effects');

  const modifier = 'modifier_shader';
  const molotovVisuals = [modifier, 'creation_effect', 'attachments[0].type', 'effect'];
  const nativeFire = ['effects/coop teleport.effect', 'scenery/emitters/burning_flame/effects/burning.effect',
    'halo3/weapons/fire-grenade/explosion.effect'];
  expect(get(molotov, molotovVisuals, 'classic-molotov-visuals-before').map(normalizeNativePath),
    ['weapons/flamethrower/effects/flame detonation.effect', ...nativeFire], 'legacy shader misbinding and active fire effects');
  const projectileListing = edit(molotov, ['-L'], 'classic-molotov-fields-before');
  edit(molotov, ['-S', modifier, '.shader_model'], 'classic-molotov-clear-invalid-shader');
  expect(get(molotov, molotovVisuals, 'classic-molotov-visuals-after').map(normalizeNativePath),
    ['.shader_model', ...nativeFire], 'original native Molotov effect chain');
  expect(fieldsWithout(edit(molotov, ['-L'], 'classic-molotov-fields-after'), [modifier]),
    fieldsWithout(projectileListing, [modifier]), 'unchanged Molotov projectile fields');

  const hud = 'ui/hud/default.hud_globals';
  const splitFont = 'ui/small_ui.font';
  const hudFonts = ['fullscreen_font', 'splitscreen_font'];
  expect(get(hud, hudFonts, 'classic-hud-fonts-before').map(normalizeNativePath),
    ['ui/large_ui.font', '.font'], 'original fullscreen HUD and absent split-screen font');
  if (!fs.lstatSync(path.join(directory, splitFont)).isFile()) throw new Error('Original split-screen font is missing');
  const hudListing = edit(hud, ['-L'], 'classic-hud-fields-before');
  edit(hud, ['-S', 'splitscreen_font', splitFont], 'classic-hud-stock-split-font');
  expect(get(hud, hudFonts, 'classic-hud-fonts-after').map(normalizeNativePath),
    ['ui/large_ui.font', splitFont], 'CE split-screen font and original fullscreen font');
  expect(fieldsWithout(edit(hud, ['-L'], 'classic-hud-fields-after'), ['splitscreen_font']),
    fieldsWithout(hudListing, ['splitscreen_font']), 'unchanged HUD layout');

  // The same legacy decoded-length defect also occurs in intact cues.
  // Use the native decoder-backed repair with only that fix enabled.
  const bufferFixSha = '094c844b9bdc494341d0fd08c07bd0d23344ea224c71205ce9846e46452205f3';
  if (executables.bludgeon.sha256 !== bufferFixSha || hashFile(executables.bludgeon.path) !== bufferFixSha) {
    throw new Error('Classic CE audio staging requires the reviewed native sound repair tool');
  }
  const beforeSoundRepair = hashTagInventory(directory);
  const fixedBuffers = run('bludgeon', ['-t', directory, '-j', '2', '-T', 'incorrect-sound-buffer', '-b', '*.sound'],
    'classic-sound-decoded-buffer-repair');
  if (fixedBuffers.exitCode !== 0 || fixedBuffers.incomplete || /failed|error:/i.test(fixedBuffers.log)) {
    throw new Error('Native CE sound buffer repair did not complete on intact audio');
  }
  const afterSoundRepair = hashTagInventory(directory);
  expect(Object.keys(afterSoundRepair), Object.keys(beforeSoundRepair), 'unchanged tag tree contents during audio repair');
  const repairedSoundBuffers = Object.entries(afterSoundRepair).filter(([tag, hash]) => hash !== beforeSoundRepair[tag]).map(([tag]) => tag);
  if (repairedSoundBuffers.some(tag => !tag.endsWith('.sound'))
      || restoredBuffers.some(row => repairedSoundBuffers.includes(path.normalize(row.tag)))) {
    throw new Error('Native sound buffer repair changed an unrelated or independently verified tag');
  }

  const menuTextRepairs = [
    ['ui/multiplayer_game_text.unicode_string_list', 191, [3, 4, 13, 67, 69, 70, 76, 77, 81, 97, 98, 100]],
    ['ui/random_player_names.unicode_string_list', 40, Array.from({length: 40}, (_, i) => i).filter(i => i !== 18 && i !== 26)],
    ['ui/shell/main_menu/mp_map_list.unicode_string_list', 21, [9]],
    ['ui/shell/main_menu/multiplayer_type_select/mp_map_select/map_data.unicode_string_list', 20, [9]],
    ['ui/shell/strings/loading.unicode_string_list', 10, [2, 3, 5, 6, 8, 9]],
  ];
  for (const [tag, count, missingTerminator] of menuTextRepairs) {
    const readMenuStrings = () => {
      const data = fs.readFileSync(path.join(directory, tag));
      if (data.readUInt32BE(64) !== count) throw new Error('Unexpected multiplayer text slot count: ' + tag);
      // HEK header, UnicodeStringList reflexive and TagDataOffset records.
      let offset = 76 + 20 * count;
      const strings = Array.from({ length: count }, (_, i) => {
        const length = data.readUInt32BE(76 + 20 * i);
        if (length < 2 || length % 2 !== 0 || offset + length > data.length) {
          throw new Error('Unexpected multiplayer text slot length: ' + tag);
        }
        const slot = data.subarray(offset, offset + length);
        offset += length;
        return slot;
      });
      if (offset !== data.length) throw new Error('Unexpected trailing multiplayer text data: ' + tag);
      return strings;
    };
    const originalMenu = readMenuStrings();
    expect(originalMenu.flatMap((slot, i) => slot.readUInt16LE(slot.length - 2) === 0 ? [] : [i]),
      missingTerminator, 'original missing CE string terminators in ' + tag);
    if (tag === menuTextRepairs[0][0]) {
      expect(originalMenu[100].toString('utf16le').trimEnd(), 'Zombie Apocalypse', 'original custom title');
    }
    const repair = run('bludgeon', ['-t', directory, '-T', 'invalid-strings', tag], 'classic-menu-string-terminators');
    if (repair.exitCode !== 0 || repair.incomplete || /failed|error:/i.test(repair.log)) {
      throw new Error('Native CE multiplayer text repair failed: ' + tag);
    }
    if (readMenuStrings().some((slot, i) => !slot.equals(missingTerminator.includes(i)
      ? Buffer.concat([originalMenu[i], Buffer.alloc(2)]) : originalMenu[i]))) {
      throw new Error('CE text repair changed original multiplayer text bytes or indices: ' + tag);
    }
  }

  // The legacy Survivor stores 4.5 radians, outside the native camera's
  // valid range. Use the owned stock CE multiplayer default on this target.
  const survivor = 'mgm/fonzie/sparky/tags/player/survivor.biped';
  const cameraFov = 'camera_field_of_view';
  expect(get(survivor, [cameraFov], 'classic-survivor-fov-before'),
    ['257.831008'], 'original out-of-range Survivor camera angle');
  const cameraListing = edit(survivor, ['-L'], 'classic-survivor-fields-before');
  edit(survivor, ['-S', cameraFov, String(70 * Math.PI / 180)], 'classic-survivor-native-fov');
  expect(get(survivor, [cameraFov], 'classic-survivor-fov-after'), ['70.000000'], 'stock CE player camera angle');
  expect(fieldsWithout(edit(survivor, ['-L'], 'classic-survivor-fields-after'), [cameraFov]),
    fieldsWithout(cameraListing, [cameraFov]), 'unchanged Survivor biped fields');

  const longSounds = [
    ['sound/dialog/multiplayer1/game_over', 'scripted_effect', 'game_over', 3_877_619, 7_726_080, 0, 133, 49,
      '065138d8c89610477cb4cda4f595bec7158bd62d9c17a3fef7ad51bb0f1bb9db', '777c1fa1c1d8439a6f5b1cbc0df1655eace6ef9dab03d46e64a9853121660891'],
    ['sound/dialog/multiplayer1/ghost', 'scripted_effect', 'ghost', 5_251_966, 7_392_384, 0, 127, 28,
      '1d7fd059c0b2b4608ca108965b0973617dd66ef633ec7a3e2eed4d988470b6df', '0ebce0127ca771e3b2b0151c49aadffc6b9599da876025721c70fc0f954a905e'],
    ['sparky/sound/sparkmusic/v1_hit_themes/killer_tracks_invaders', 'music', 'Killer Tracks - CEZ4064 4 - Inv',
      3_708_886, 4_127_091, 13, 71, 0,
      '1e01df20b18bcae0b903ba27308dd78e2feffffa63bff8f7afbcb63d98c7d281', 'ee001e99aff89eb3cf058e751acf2b709a4901bfcc71acb19f548af891a16500'],
  ];
  const soundToolSha = '764f3633697e69090e3c2f3df30060cc8b129ca3fc648a45514f998dd94822e3';
  if (hashFile(executables.sound.path) !== soundToolSha) throw new Error('Classic CE requires the reviewed native sound encoder');
  const soundChains = [];
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    for (const [stem, soundClass, label, encodedBytes, frames, padding, chunks, mouthBytes, sourceSha, pcmSha] of longSounds) {
      const tag = stem + '.sound';
      const filename = path.join(directory, tag);
      const original = fs.readFileSync(filename);
      // HEK sound header, one pitch range and fixed-size permutation headers.
      const permutationStart = 64 + 164 + 72;
      const permutationSize = 124;
      const samplesField = permutationStart + 64;
      const mouthField = permutationStart + 84;
      const subtitleField = permutationStart + 104;
      const originalSamplesAt = permutationStart + permutationSize;
      const stream = original.subarray(originalSamplesAt, originalSamplesAt + encodedBytes);
      const originalMouth = original.subarray(originalSamplesAt + encodedBytes);
      if (original.readUInt32BE(samplesField) !== encodedBytes || original.readUInt32BE(mouthField) !== mouthBytes
          || original.readUInt32BE(subtitleField) !== 0 || originalMouth.length !== mouthBytes || sha(stream) !== sourceSha) {
        throw new Error('Long sound differs from the reviewed HEK layout or stream: ' + tag);
      }
      const root = 'pitch_ranges[0].permutations[0].';
      const fields = ['format', 'channel_count', 'sound_class', root + 'name'];
      expect(get(tag, fields, 'classic-long-sound-before'), ['ogg_vorbis', 'stereo', soundClass, label],
        'original long sound metadata for ' + tag);
      expect(edit(tag, ['-C', 'pitch_ranges', '-C', 'pitch_ranges[0].permutations'], 'classic-long-sound-count'),
        ['1', '1'], 'single original long permutation for ' + tag);
      const header = phase => {
        const rows = edit(tag, ['-L'], phase);
        const pitchRanges = rows.findIndex(line => line.startsWith('pitch_ranges['));
        if (pitchRanges < 0) throw new Error('Cannot review the native sound header: ' + tag);
        return rows.slice(0, pitchRanges).filter(line => !/\b(?:split_long_sound_into_permutations|format|xbox_adpcm|ogg_vorbis)\s/.test(line));
      };
      const beforeHeader = header('classic-long-sound-header-before');
      const settingFields = [root + 'gain', root + 'skip_fraction', 'pitch_ranges[0].natural_pitch', 'pitch_ranges[0].bend_bounds'];
      const settings = get(tag, settingFields, 'classic-long-sound-authored');
      const wave = await prepareClassicSoundWave(page, stream, frames);
      if (wave.decodedPcmSha256 !== pcmSha || wave.compiledFrames !== frames + padding || wave.paddingFrames !== padding) {
        throw new Error('Decoded sound differs from the reviewed complete stream: ' + tag);
      }
      const soundData = path.join(data, stem);
      fs.mkdirSync(soundData, { recursive: true });
      fs.writeFileSync(path.join(soundData, label + '.wav'), wave.bytes, { flag: 'wx' });
      const split = run('sound', ['-t', directory, '-d', data, '-F', 'xbox_adpcm', '-c', soundClass,
        '-C', 'stereo', '-r', '44100', '-s', '-j', '2', stem], 'classic-native-split-sound');
      if (split.exitCode !== 0 || split.incomplete) throw new Error('Native long sound encoding failed: ' + tag);
      const generated = fs.readFileSync(filename);
      const dataStart = permutationStart + permutationSize * chunks;
      const lengths = Array.from({ length: chunks }, (_, i) => {
        const fieldOffset = i * permutationSize;
        if (generated.readUInt32BE(mouthField + fieldOffset) !== 0 || generated.readUInt32BE(subtitleField + fieldOffset) !== 0) {
          throw new Error('Unexpected ancillary data in generated sound: ' + tag);
        }
        return generated.readUInt32BE(samplesField + fieldOffset);
      });
      const encoded = generated.subarray(dataStart);
      if (lengths.some(n => n <= 0 || n % 72 !== 0) || lengths.reduce((sum, n) => sum + n, 0) !== encoded.length
          || encoded.length / 72 * 64 !== frames + padding) {
        throw new Error('Generated ADPCM blocks do not cover the verified complete stream: ' + tag);
      }
      const firstChunkEnd = dataStart + lengths[0];
      if (mouthBytes) {
        const merged = Buffer.concat([generated.subarray(0, firstChunkEnd), originalMouth, generated.subarray(firstChunkEnd)]);
        merged.writeUInt32BE(mouthBytes, mouthField);
        fs.writeFileSync(filename, merged);
      }
      // The native writer retains the source root label and regenerates the
      // checksum while keeping the original mouth data on the first chunk.
      edit(tag, ['-n', '-S', root + 'name', label,
        ...settingFields.flatMap((field, i) => ['-S', field, settings[i]])], 'classic-restore-native-sound-settings');
      expect(edit(tag, ['-V'], 'classic-long-sound-checksum'), ['matched'], 'native checksum for ' + tag);
      expect(get(tag, settingFields, 'classic-long-sound-authored-after'), settings, 'preserved pitch and root gain for ' + tag);
      expect(header('classic-long-sound-header-after'), beforeHeader, 'unchanged native header for ' + tag);
      expect(get(tag, fields, 'classic-long-sound-after'), ['xbox_adpcm', 'stereo', soundClass, label], 'chained native sound for ' + tag);
      const links = get(tag, ['pitch_ranges[0].permutations[*].next_permutation_index'], 'classic-long-sound-links');
      if (links.length !== chunks || links.some((index, i) => Number(index) !== (i + 1 < chunks ? i + 1 : 65535))) {
        throw new Error('Native long sound chain has a missing or unexpected link: ' + tag);
      }
      const final = fs.readFileSync(filename);
      if (final.readUInt32BE(mouthField) !== mouthBytes
          || !final.subarray(firstChunkEnd, firstChunkEnd + mouthBytes).equals(originalMouth)
          || !Buffer.concat([final.subarray(dataStart, firstChunkEnd), final.subarray(firstChunkEnd + mouthBytes)]).equals(encoded)) {
        throw new Error('Native metadata edit changed an encoded sample or the original mouth data: ' + tag);
      }
      soundChains.push({ tag, originalVorbisSha256: sourceSha, frames, paddingFrames: padding, chunks, mouthBytes });
    }
  } finally {
    await browser.close();
  }

  expect(hashTagInventory(), before, 'preserved MCC source tree');

  manifest.results.push({
    step: 'stage-classic-ce', state: 'native-source-reviewed', playable: false,
    restoredBuffers, repairedSoundBuffers,
    longSounds: soundChains,
    melee: { original: meleeBefore, target: meleeAfter, fields: meleeFields },
    damageBounds: damageBounds.map(([tag, ...original]) => ({tag, original, fields: cappedDamageFields})),
    inactiveTurretGrenadeFields: legalEnums,
    removedUnusedVehicleSlots: empty,
    invisibleCarrier: { models: carrierModels.map(([tag]) => tag), shader, bitmap, collision: carrierCollision, sharedCarriers },
    physics: { tag: physics, momentScale: 1 },
    rotationalSprites: { tags: [ball, flame, smoke, burning], unchangedPixelBytes: true },
    normalizedZombieBipeds: feignDeath.map(([name]) => name),
    unarmedCarrierTracking: carrierActor,
    grenadeInventoryMaximum: { original: 8, classicCe: 7 },
    molotovNativeEffects: nativeFire,
    splitScreenFont: splitFont,
    survivorCameraDegrees: 70,
    terminatedMenuStrings: menuTextRepairs.map(([tag, , slots]) => ({tag, slots})),
    clearedDormantMaterialEffects: dormantMaterialEffects.map(([i]) => i),
    unchangedRecoveredSource: true,
  });
  save();
  return directory;
}

async function buildReviewedClassicCe() {
  const directory = await prepareClassicCeTags();
  const destination = path.join(output, 'classic-ce');
  fs.mkdirSync(destination);
  const result = run('build', ['-g', 'gbx-custom', '-t', directory, '-m', destination,
    '--resource-usage', 'none', "fonzie's zombie apocalypse"], 'compile-classic-ce');
  const fatal = result.log.split(/\r?\n/).findIndex(line => /FATAL ERROR:|^Error:/i.test(line));
  const diagnostic = fatal < 0 ? null : result.log.split(/\r?\n/).slice(fatal, fatal + 8).join(' ');
  if (result.exitCode !== 0 || result.incomplete || diagnostic) {
    manifest.results.push({step:'compile-classic-ce', target:'gbx-custom', state:'blocked', diagnostic, playable:false});
    save();
    throw new Error(diagnostic ?? 'Classic CE compiler did not complete');
  }
  const candidate = path.join(destination, "fonzie's zombie apocalypse.map");
  const info = field => run('info', ['-T', field, candidate], 'classic-ce-cache-' + field);
  const engine = info('engine'), crc = info('crc32_mismatched');
  if (engine.exitCode !== 0 || crc.exitCode !== 0 || engine.incomplete || crc.incomplete ||
      engine.stdout.trim() !== 'Halo Custom Edition (Gearbox)' || !['0','false'].includes(crc.stdout.trim().toLowerCase()) ||
      fs.readFileSync(candidate).readUInt32LE(4) !== 609) {
    throw new Error('Independent readback rejected the Classic CE cache format or CRC');
  }
  manifest.results.push({step:'compile-classic-ce', target:'gbx-custom', state:'compiled-cache-verified',
    cacheSha256:hashFile(candidate), path:candidate, playable:false});
  save();
}

function compileOfficialMcc(carrierReadback) {
  const scenario = "fonzie's zombie apocalypse";
  const effect = 'weapons/pistol/melee.damage_effect';
  const readFields = ['type', 'maximum_intensity', 'damage_lower_bound', 'damage_upper_bound', 'radius', 'duration'];
  const read = (directory, phase) => {
    const result = run('edit', ['-t', directory, ...readFields.flatMap(field => ['-G', field]), effect], phase);
    if (result.exitCode !== 0 || result.incomplete) throw new Error('Pistol melee readback failed');
    return result.stdout.trimEnd().split(/\r?\n/);
  };
  const authored = read(tags, 'mcc-original-melee');
  const expected = ['lighten', '3.000000', '400.000000', '400.000000,400.000000', '4.000000,4.000000', '3.000000'];
  if (JSON.stringify(authored) !== JSON.stringify(expected)) throw new Error('Audited pistol melee values changed');
  const before = hashTagInventory();
  fs.mkdirSync(path.join(output, 'data'), { recursive: true });
  const nativeMaps = path.join(output, 'maps');
  fs.mkdirSync(nativeMaps);
  const result = run('mcc', ['-data_dir', 'data', '-tags_dir', 'tags', '-game_root_dir', '.',
    'build-cache-file', scenario, 'classic', 'none'], 'compile-official-mcc');
  const after = hashTagInventory();
  if (Object.keys(before).length !== Object.keys(after).length
    || Object.keys(before).some(file => before[file] !== after[file])
    || hashFile(executables.mcc.path) !== executables.mcc.sha256) {
    throw new Error('Official Tool changed its own bytes or the reviewed tag inputs');
  }
  if (result.exitCode !== 0 || result.incomplete || !/successfully built cache file\./i.test(result.log)
    || /### failed|exception halt/i.test(result.log)) {
    throw new Error('Official MCC Tool did not establish a completed cache');
  }
  const map = path.join(nativeMaps, scenario + '.map');
  if (!fs.lstatSync(map).isFile() || !inside(fs.realpathSync(map), fs.realpathSync(nativeMaps))) {
    throw new Error('Official Tool output is not a regular file in its native output directory');
  }
  const mapSha256 = hashFile(map);
  const info = (name) => {
    const checked = run('info', ['-T', name, map], 'official-mcc-' + name);
    if (checked.exitCode !== 0 || checked.incomplete) throw new Error('MCC cache validation failed for ' + name);
    return checked.stdout.trim();
  };
  const engine = info('engine');
  const crcMismatch = info('crc32_mismatched');
  if (engine !== 'Halo: Combat Evolved Anniversary (MCC)' || !['0', 'false'].includes(crcMismatch.toLowerCase())) {
    throw new Error('Official output has the wrong engine or a CRC mismatch: ' + engine + ', ' + crcMismatch);
  }
  const derived = path.join(output, 'mcc-readback-tags');
  fs.mkdirSync(derived);
  const selected = carrierReadback ? [effect, standardCarrier, recoveredCarrierGraph] : [effect];
  const extracted = run('extract', ['-t', derived, '-G', ...selected.flatMap(tag => ['-s', tag]), map], 'official-mcc-extract-readback');
  if (extracted.exitCode !== 0 || extracted.incomplete || /Failed to extract|ERROR:/.test(extracted.log) ||
      !new RegExp('Extracted ' + selected.length + ' out of ' + selected.length + ' matched tags?\\b').test(extracted.log)) {
    throw new Error('Compiled native effects and carrier data could not be independently extracted');
  }
  if (carrierReadback) {
    const binding = run('edit', ['-t', derived, '-G', 'animation_graph', standardCarrier], 'mcc-compiled-carrier-binding');
    if (binding.exitCode !== 0 || binding.incomplete || normalizeNativePath(binding.stdout.trim()) !== recoveredCarrierGraph ||
        JSON.stringify(readCarrierGraph(derived, 'mcc-compiled-carrier-graph')) !== JSON.stringify(carrierReadback)) {
      throw new Error('The compiled cache dropped or changed its reviewed standard carrier animation binding');
    }
  }
  const compiled = read(derived, 'mcc-compiled-melee');
  if (JSON.stringify(compiled) !== JSON.stringify(authored) || hashFile(map) !== mapSha256) {
    throw new Error('Official cache changed the authored flash, damage effect or cache bytes');
  }
  manifest.results.push({step:'compile-official-mcc', target:'mcc-cea', reportedEngine:engine, state:'compiled-melee-verified', playable:false,
    cacheSha256:mapSha256, tagCount:Object.keys(before).length, inputTagsUnchanged:true,
    ...(carrierReadback && { standardCarrier: { graph: recoveredCarrierGraph, nodes: 5, idle: 'stand unarmed idle' } }),
    damageEffect:Object.fromEntries(readFields.map((field, index) => [field, compiled[index]]))});
  save();
  if (repairCarrierInertia) {
    const fixedInertia = writeReviewedCarrierInverse(map, mapSha256);
    if (repairLegacyTitle) {
      const fixedTitle = writeReviewedLegacyTitle(fixedInertia);
      if (repairVorbisTail) writeReviewedVorbisTails(fixedTitle);
    }
  }
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
  const carrierReadback = repairStandardCarrier ? recoverStandardCarrier() : null;
  if (nativeMccTool) compileOfficialMcc(carrierReadback);
  if (stageLegacySpawners) stageReviewedLegacySpawners();
  if (compileClassicCe) await buildReviewedClassicCe();
} catch (error) {
  manifest.error = String(error); process.exitCode = 1;
} finally {
  manifest.sourceSha256After = hashFile(source);
  manifest.resourceSha256After = Object.fromEntries(Object.keys(resourceHashes).map((name) => [name, hashFile(path.join(resources, name))]));
  if (manifest.sourceSha256After !== originalSha || JSON.stringify(manifest.resourceSha256After) !== JSON.stringify(resourceHashes)) { manifest.integrityFailure = true; process.exitCode = 1; }
  save();
  console.log(JSON.stringify({ profile: manifest.profile, playable: false, results: manifest.results, error: manifest.error ?? null, manifest: path.join(output, 'recovery-manifest.json') }, null, 2));
}
