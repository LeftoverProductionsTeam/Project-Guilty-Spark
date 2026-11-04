import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const local = path.join(projectRoot, '.toolchain');
const bin = path.join(local, 'cargo/bin');
const rustup = process.argv[2] === 'rustup';
const tool = rustup ? 'rustup' : 'cargo';
const executable = path.join(bin, process.platform === 'win32' ? `${tool}.exe` : tool);
const env = existsSync(executable)
  ? {
      ...process.env,
      CARGO_HOME: path.join(local, 'cargo'),
      RUSTUP_HOME: path.join(local, 'rustup'),
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    }
  : { ...process.env };
// A single regenerable output cache, independent of the terminal's location.
// Explicit caller overrides and debuggable profiles remain available.
env.CARGO_TARGET_DIR ??= path.join(projectRoot, '.local/build/cargo');
env.CARGO_PROFILE_DEV_DEBUG ??= '0';
env.CARGO_PROFILE_TEST_DEBUG ??= '0';
env.CARGO_INCREMENTAL ??= '0';
const child = spawn(existsSync(executable) ? executable : tool, process.argv.slice(rustup ? 3 : 2), {
  env,
  stdio: 'inherit',
  windowsHide: true,
});
child.on('exit', (code) => process.exit(code ?? 1));
