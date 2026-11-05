import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { admitCargoOutput, watchOutputBudget, stopQaProcess } from './native-qa-storage.mjs';
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
env.CARGO_TARGET_DIR ??= path.join(projectRoot, 'target');
if (path.resolve(env.CARGO_TARGET_DIR).split(path.sep).some((part) => part.toLowerCase() === '.local'))
  throw Error('The obsolete .local output tree is disabled. Use the shared root target/ cache or a reviewed external output directory.');
env.CARGO_PROFILE_DEV_DEBUG ??= '0';
env.CARGO_PROFILE_TEST_DEBUG ??= '0';
env.CARGO_INCREMENTAL ??= '0';
const admission = !rustup && ['build','test','check','clippy','bench','run','doc','rustc'].includes(process.argv[2])
  ? await admitCargoOutput(env.CARGO_TARGET_DIR) : null;
const child = spawn(existsSync(executable) ? executable : tool, process.argv.slice(rustup ? 3 : 2), {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
  windowsHide: true,
});
const monitor = admission && watchOutputBudget(admission.path, { budget: admission.budget, minimumFree: 4*1024**3, onExceeded: async error => { console.error(String(error)); await stopQaProcess(child); } });
const interrupt = async () => { await stopQaProcess(child); await monitor?.stop(); process.exit(130); };
process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
child.on('error',async error=>{console.error(error);await monitor?.stop();process.exitCode=1;});
child.on('exit', async (code) => { await monitor?.sample(); const result=await monitor?.stop(); process.exit(result?.error ? 1 : code ?? 1); });
