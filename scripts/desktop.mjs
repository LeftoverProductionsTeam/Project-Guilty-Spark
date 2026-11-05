import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { admitCargoOutput, watchOutputBudget, stopQaProcess } from './native-qa-storage.mjs';
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
const admission = process.argv.slice(2).some(argument => argument === 'build' || argument === 'dev')
  ? await admitCargoOutput(env.CARGO_TARGET_DIR) : null;
const child=spawn(process.execPath, [path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'), ...process.argv.slice(2)], {
  cwd: root,
  env,
  stdio: 'inherit',
  windowsHide: true,
});
const monitor=admission&&watchOutputBudget(admission.path,{budget:admission.budget,minimumFree:4*1024**3,onExceeded:async error=>{console.error(String(error));await stopQaProcess(child);}});
const interrupt=async()=>{await stopQaProcess(child);await monitor?.stop();process.exit(130);};
process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
child.on('error',async error=>{console.error(error);await monitor?.stop();process.exitCode=1;});
child.on('exit',async code=>{await monitor?.sample();const result=await monitor?.stop();process.exit(result?.error?1:code??1);});
