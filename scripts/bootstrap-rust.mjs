import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve('.toolchain');
await mkdir(root, { recursive: true });
const installer = path.join(root, 'rustup-init.exe');
const response = await fetch('https://win.rustup.rs/x86_64');
if (!response.ok) throw new Error(`Rust bootstrap download failed: ${response.status}`);
await writeFile(installer, Buffer.from(await response.arrayBuffer()));
const env = { ...process.env, RUSTUP_HOME: path.join(root, 'rustup'), CARGO_HOME: path.join(root, 'cargo') };
const processHandle = spawn(
  installer,
  ['-y', '--no-modify-path', '--profile', 'minimal', '--default-toolchain', 'stable'],
  { env, stdio: 'inherit', windowsHide: true },
);
processHandle.on('exit', (code) => process.exit(code ?? 1));
