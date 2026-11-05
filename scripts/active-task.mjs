// Small file checkpoint helper. It never changes Git, runs native tools,
// dispatches queue messages, removes data, or performs recovery automatically.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const maximum = 32 * 1024;
// These are recovery instructions, not a queue scheduler or proof of acceptance.
// Legacy active/blocked checkpoints remain readable without restoring the old
// rule that a human-only check stops all independent engineering.
const recoveries = new Map([
  ['active', 'resume-after-verification'],
  ['implementation incomplete', 'continue-implementation'],
  ['automated acceptance incomplete', 'continue-automated-acceptance'],
  ['awaiting human verification', 'preserve-human-gate-and-continue-independent'],
  ['technically blocked', 'review-dependency-and-continue-independent'],
  ['blocked', 'review-dependency-and-continue-independent'],
  ['accepted', 'ready-for-next'],
]);
export function parseCheckpoint(text) {
  if (Buffer.byteLength(text) > maximum)
    throw Error('Keep the active checkpoint within 32 KiB; reference evidence.');
  const field = (name) => text.match(new RegExp(`^${name}: (.+)$`, 'm'))?.[1]?.trim();
  const task = field('Task'),
    status = field('Status');
  if (!task || !recoveries.has(status))
    throw Error('Checkpoint requires Task and an explicit supported Status.');
  for (const label of ['Starting revision', 'Latest verified revision', 'Next action'])
    if (!field(label)) throw Error(`Checkpoint requires ${label}.`);
  for (const heading of [
    'Acceptance',
    'Verified milestones',
    'Changed work',
    'Failures and blockers',
    'Operations and safe checkpoint',
    'Deferred requests',
  ])
    if (!text.includes(`## ${heading}`)) throw Error(`Checkpoint is missing ${heading}.`);
  return {
    task,
    status,
    nextAction: field('Next action'),
    recovery: recoveries.get(status),
    // No parsed status grants permission to skip its evidence requirements.
    // Safe independent work remains possible while those requirements are open.
    independentWork: 'continue-when-safe',
  };
}
function regularAncestors(file) {
  for (let p = file; ; p = path.dirname(p)) {
    let info;
    try {
      info = fs.lstatSync(p);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (info?.isSymbolicLink()) throw Error(`Linked checkpoint path refused: ${p}`);
    if (p === path.dirname(p)) break;
  }
}
function read(file) {
  regularAncestors(file);
  if (fs.statSync(file).size > maximum)
    throw Error('Existing checkpoint exceeds 32 KiB; preserve it and review manually.');
  return fs.readFileSync(file, 'utf8');
}
function atomic(file, text) {
  regularAncestors(file);
  const tmp = path.join(path.dirname(file), `.active-task-${crypto.randomUUID()}.tmp`);
  let owned = false;
  try {
    const handle = fs.openSync(tmp, 'wx');
    owned = true;
    try {
      fs.writeFileSync(handle, text);
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fs.renameSync(tmp, file);
    owned = false;
  } finally {
    if (owned && fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}
export function writeCheckpoint(root, text) {
  const state = parseCheckpoint(text),
    directory = path.join(root, 'docs'),
    file = path.join(directory, 'ACTIVE_TASK.md');
  regularAncestors(directory);
  fs.mkdirSync(directory, { recursive: true });
  if (fs.existsSync(file)) {
    const previous = read(file);
    parseCheckpoint(previous);
    atomic(path.join(directory, 'ACTIVE_TASK.previous.md'), previous);
  }
  atomic(file, text);
  if (read(file) !== text)
    throw Error('Checkpoint readback differs; previous valid checkpoint remains available.');
  return state;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const input = process.argv[2];
  console.log(
    JSON.stringify(
      input
        ? writeCheckpoint(root, read(path.resolve(input)))
        : parseCheckpoint(read(path.join(root, 'docs/ACTIVE_TASK.md'))),
    ),
  );
}
