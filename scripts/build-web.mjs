import { spawnSync } from 'node:child_process';
for (const args of [
  ['node_modules/typescript/bin/tsc', '-b'],
  ['node_modules/vite/bin/vite.js', 'build'],
]) {
  const child = spawnSync(process.execPath, args, { stdio: 'inherit', windowsHide: true });
  if (child.status !== 0) process.exit(child.status ?? 1);
}
