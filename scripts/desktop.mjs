import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
const local = path.resolve('.toolchain');
const bin = path.join(local, 'cargo/bin');
const env = existsSync(bin)
  ? {
      ...process.env,
      CARGO_HOME: path.join(local, 'cargo'),
      RUSTUP_HOME: path.join(local, 'rustup'),
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    }
  : process.env;
spawn(process.execPath, ['node_modules/@tauri-apps/cli/tauri.js', ...process.argv.slice(2)], {
  env,
  stdio: 'inherit',
  windowsHide: true,
}).on('exit', (code) => process.exit(code ?? 1));
