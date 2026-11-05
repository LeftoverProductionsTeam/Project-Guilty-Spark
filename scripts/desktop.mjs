import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { admitCargoOutput } from './native-qa-storage.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const local = path.join(root, '.toolchain');
const bin = path.join(local, 'cargo/bin');
const env = existsSync(bin)
  ? {
      ...process.env,
      CARGO_HOME: path.join(local, 'cargo'),
      RUSTUP_HOME: path.join(local, 'rustup'),
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    }
  : { ...process.env };
env.CARGO_TARGET_DIR ??= path.join(root, 'target');
if (path.resolve(env.CARGO_TARGET_DIR).split(path.sep).some(part => part.toLowerCase() === '.local'))
  throw Error('Obsolete .local desktop compiler output is disabled; use the canonical shared target/ cache.');
env.CARGO_PROFILE_DEV_DEBUG ??= '0';
env.CARGO_PROFILE_TEST_DEBUG ??= '0';
env.CARGO_INCREMENTAL ??= '0';
if (process.argv.slice(2).some(argument => argument === 'build' || argument === 'dev'))
  await admitCargoOutput(env.CARGO_TARGET_DIR);
spawn(process.execPath, [path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'), ...process.argv.slice(2)], {
  cwd: root,
  env,
  stdio: 'inherit',
  windowsHide: true,
}).on('exit', (code) => process.exit(code ?? 1));
