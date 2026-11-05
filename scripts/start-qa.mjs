import { spawn } from 'node:child_process';
import { mkdirSync, openSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assertQaOutputPath } from './native-qa-storage.mjs';
await assertQaOutputPath(path.resolve('artifacts/qa'));
mkdirSync('artifacts/qa', { recursive: true });
const executable = path.resolve(
  process.argv.includes('--release') ? 'target/release/GuiltySpark.exe' : 'target/debug/GuiltySpark.exe',
);
const env = { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9223' };
if (process.argv.includes('--default-data')) delete env.GUILTY_SPARK_DATA_DIR;
else env.GUILTY_SPARK_DATA_DIR = path.resolve('artifacts/qa/desktop-data');
const out = openSync('artifacts/qa/desktop.log', 'a');
const child = spawn(executable, [], {
  cwd: process.cwd(),
  env,
  detached: true,
  stdio: ['ignore', out, out],
  windowsHide: false,
});
child.unref();
writeFileSync('artifacts/qa/process.json', JSON.stringify({ pid: child.pid, executable }));
console.log(
  `QA desktop started (PID ${child.pid}). CDP port 9223; data: ${env.GUILTY_SPARK_DATA_DIR ?? 'normal per-user application directory'}.`,
);
