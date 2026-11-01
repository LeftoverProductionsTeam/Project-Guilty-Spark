import { spawnSync } from 'node:child_process';
const python = process.argv[2] ?? (process.platform === 'win32' ? 'python' : 'python3');
for (const [command, args] of [
  [python, ['-B', '-m', 'unittest', 'discover', '-s', 'scripts/release', '-p', 'test_*.py', '-v']],
  [process.execPath, ['--test', 'scripts/release/draft.test.mjs']],
]) {
  const run = spawnSync(command, args, { stdio: 'inherit', windowsHide: true });
  if (run.error) throw run.error;
  if (run.status !== 0) process.exit(run.status ?? 1);
}
