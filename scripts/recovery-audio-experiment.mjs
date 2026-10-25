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
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const hashFile = (file) => sha(fs.readFileSync(file));
const inside = (child, parent) => { const rel = path.relative(parent, child); return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); };
if (inside(output, path.dirname(source)) || inside(output, resources) || inside(output, invader)) throw new Error('Output must be a fresh directory outside source, resource, and tool directories');
const bytes = fs.readFileSync(source);
const originalSha = sha(bytes);
if (originalSha !== 'b38f35508188872b2535888193de80f766d92d3b8d53a8ada7be4fc9808a996d') throw new Error('This evidence-specific experiment only accepts the audited Demo source SHA-256; it is not a general repair');
const resourceHashes = Object.fromEntries(['bitmaps.map', 'sounds.map'].map((name) => [name, hashFile(path.join(resources, name))]));
const executables = Object.fromEntries(['extract', 'build', 'edit'].map((name) => { const exe = path.join(invader, `invader-${name}${process.platform === 'win32' ? '.exe' : ''}`); return [name, { path: exe, sha256: hashFile(exe) }]; }));
fs.mkdirSync(output); // Fail if any output directory already exists.
const tags = path.join(output, 'tags'); const maps = path.join(output, 'output');
fs.mkdirSync(tags); fs.mkdirSync(maps);
const manifest = {
  schemaVersion: 1, profile: 'Recovery edition — missing event audio omitted', faithful: false, playable: false,
  source, sourceSha256: originalSha, resources, resourceSha256: resourceHashes, tools: executables,
  diagnosticPlacementChangesEnabled: diagnosePlacement, changes: [], commands: [], results: [],
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
  return { exitCode: result.status, log, incomplete: !!result.error };
};
const compile = (name) => {
  const result = run('build', ['-g', 'mcc-cea', '-t', tags, '-m', maps, '--resource-usage', 'none', "fonzie's zombie apocalypse"], name);
  const state = result.exitCode === 0 && !result.incomplete ? 'compiled-unverified' : 'blocked';
  manifest.results.push({ step: name, state, playable: false }); save(); return result;
};
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
} catch (error) {
  manifest.error = String(error); process.exitCode = 1;
} finally {
  manifest.sourceSha256After = hashFile(source);
  manifest.resourceSha256After = Object.fromEntries(Object.keys(resourceHashes).map((name) => [name, hashFile(path.join(resources, name))]));
  if (manifest.sourceSha256After !== originalSha || JSON.stringify(manifest.resourceSha256After) !== JSON.stringify(resourceHashes)) { manifest.integrityFailure = true; process.exitCode = 1; }
  save();
  console.log(JSON.stringify({ profile: manifest.profile, playable: false, results: manifest.results, error: manifest.error ?? null, manifest: path.join(output, 'recovery-manifest.json') }, null, 2));
}
