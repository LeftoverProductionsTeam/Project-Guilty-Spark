import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
const local = path.resolve('.toolchain');
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
  : process.env;
const child = spawn(existsSync(executable) ? executable : tool, process.argv.slice(rustup ? 3 : 2), {
  env,
  stdio: 'inherit',
  windowsHide: true,
});
child.on('exit', (code) => process.exit(code ?? 1));
