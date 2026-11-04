// Deliberately unsafe native tags remain in a separate QA copy; never launch it.
import fs from 'node:fs/promises';
import {safeQaCopy} from './qa-safe-copy.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const a = process.argv.slice(2);
if (a.length !== 5)
  throw Error(
    'test-native-music-conflict <qa_sound_classes.exe> <accepted-emitter.json> <H1A kit> <Invader> <fresh-short-root>',
  );
const [auditExe, acceptedFile, kit, invader, root] = a.map((v) => path.resolve(v));
if (root.length > 90) throw Error('Use a short owned test directory');
const accepted = JSON.parse(await fs.readFile(acceptedFile, 'utf8'));
if (!accepted.complete || accepted.build?.status !== 'validated')
  throw Error('A genuine accepted native emitter build is required');
await fs.mkdir(root);
const workspace = path.join(root, 'workspace');
const hash = async (file) =>
  crypto
    .createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
const before = await hash(accepted.build.build.output);
const run = (exe, args) =>
  execFileSync(exe, args, {
    cwd: workspace,
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: 90000,
  });
await safeQaCopy(accepted.build.sources.directory, workspace, {
  recursive: true,
  errorOnExist: true,
  force: false,
});
const receipt = {
  schemaVersion: 1,
  complete: false,
  actualNativeCompiler: true,
  unsafeMapLaunched: false,
  sourceSha256: before,
};
try {
  run(auditExe, [accepted.build.build.output, 'safe', path.join(root, 'safe-audit.json')]);
  const tags = path.join(workspace, 'tags'),
    edit = path.join(invader, 'invader-edit.exe');
  const sound = accepted.sourceExactCompiledSamples[0].compiledPath.replaceAll('\\', '/') + '.sound';
  const invoke = (args, tag) =>
    run(
      edit,
      ['-t', tags, ...args, tag].map((v) => v.replaceAll('/', '\\')),
    );
  invoke(['-S', 'sound_class', 'music'], sound);
  if (invoke(['-G', 'sound_class'], sound).trim() !== 'music') throw Error('Music class did not read back');
  const bsp = accepted.build.sources.scenarioPath.replaceAll('\\', '/') + '.scenario_structure_bsp';
  const count = Number(invoke(['-C', 'background_sound_palette'], bsp).trim());
  if (!Number.isInteger(count) || count < 0 || count > 255) throw Error('Invalid background palette');
  invoke(
    [
      '-I',
      'background_sound_palette',
      '1',
      'end',
      '-S',
      `background_sound_palette[${count}].background_sound`,
      accepted.compiled.loopPath + '.sound_looping',
      '-S',
      'clusters[*].background_sound',
      String(count),
    ],
    bsp,
  );
  const tool = path.join(kit, 'tool.exe');
  const output = run(tool, [
    '-data_dir',
    'data',
    '-tags_dir',
    'tags',
    '-game_root_dir',
    '.',
    'build-cache-file',
    accepted.build.sources.scenarioPath,
    'classic',
    'none',
  ]);
  await fs.writeFile(path.join(root, 'native-compiler.log'), output);
  if (!output.toLowerCase().includes('successfully built cache file.'))
    throw Error('Native compiler did not confirm output');
  const unsafe = path.join(workspace, 'maps', accepted.build.sources.bspName + '.map');
  run(auditExe, [unsafe, 'music-conflict', path.join(root, 'unsafe-audit.json')]);
  const audit = JSON.parse(await fs.readFile(path.join(root, 'unsafe-audit.json'), 'utf8'));
  if (!audit.complete || !audit.rejected) throw Error('Native music conflict was not rejected');
  receipt.audit = audit;
  receipt.nativeToolSha256 = await hash(tool);
  receipt.invaderEditSha256 = await hash(edit);
  receipt.previousGoodUnchanged = (await hash(accepted.build.build.output)) === before;
  if (!receipt.previousGoodUnchanged) throw Error('Previous accepted map changed');
  receipt.complete = true;
} catch (error) {
  receipt.error = String(error);
  throw error;
} finally {
  await fs.writeFile(path.join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
}
