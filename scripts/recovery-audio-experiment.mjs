// Narrow, opt-in experiment for the supplied Zombie Apocalypse Demo artifact.
// It never replaces missing audio, installs a map, or claims playability.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { assertQaOutputPath } from './native-qa-storage.mjs';
import { carrierAnimationSource } from './recover-zombie-carriers-native.mjs';

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
if (repairStandardCarrier && !nativeMccTool) throw new Error('Standard carrier repair requires the reviewed native MCC Tool');
if (repairCarrierInertia && !repairStandardCarrier) throw new Error('Carrier inertia repair requires the reviewed original carrier build');
if (repairLegacyTitle && !repairCarrierInertia) throw new Error('Legacy title repair requires the reviewed inertia-corrected cache');
if (repairVorbisTail && !repairLegacyTitle) throw new Error('Vorbis tail recovery requires the reviewed title-corrected cache');
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

function hashTagInventory() {
  const hashes = {};
  if (!fs.lstatSync(tags).isDirectory()) throw new Error('Derived tag root is not a regular directory');
  const root = fs.realpathSync(tags);
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
  manifest.results.push({ step: 'repair-vorbis-tail', ...candidate, sourceCacheSha256: reviewedSha256,
    restored, replacedPayloadBytes: restored.length, playable: false });
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
} catch (error) {
  manifest.error = String(error); process.exitCode = 1;
} finally {
  manifest.sourceSha256After = hashFile(source);
  manifest.resourceSha256After = Object.fromEntries(Object.keys(resourceHashes).map((name) => [name, hashFile(path.join(resources, name))]));
  if (manifest.sourceSha256After !== originalSha || JSON.stringify(manifest.resourceSha256After) !== JSON.stringify(resourceHashes)) { manifest.integrityFailure = true; process.exitCode = 1; }
  save();
  console.log(JSON.stringify({ profile: manifest.profile, playable: false, results: manifest.results, error: manifest.error ?? null, manifest: path.join(output, 'recovery-manifest.json') }, null, 2));
}
