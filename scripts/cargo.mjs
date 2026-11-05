import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  withDevelopmentWorkspace,
  runDevelopmentCommand,
  embeddedFrontendConfig,
} from './native-qa-storage.mjs';
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
env.CARGO_PROFILE_DEV_DEBUG ??= '0';
env.CARGO_PROFILE_TEST_DEBUG ??= '0';
env.CARGO_INCREMENTAL ??= '0';
try {
  await withDevelopmentWorkspace('cargo', async (context) => {
    context.env = {
      ...env,
      ...context.env,
      CARGO_HOME: env.CARGO_HOME,
      RUSTUP_HOME: env.RUSTUP_HOME,
      PATH: env.PATH,
      CARGO_PROFILE_DEV_DEBUG: env.CARGO_PROFILE_DEV_DEBUG,
      CARGO_PROFILE_TEST_DEBUG: env.CARGO_PROFILE_TEST_DEBUG,
      CARGO_INCREMENTAL: env.CARGO_INCREMENTAL,
    };
    context.env.TAURI_CONFIG = JSON.stringify(embeddedFrontendConfig(context.env.SPARK_FRONTEND_DIST));
    if (!rustup && ['build', 'test', 'check', 'clippy', 'run', 'rustc'].includes(process.argv[2]))
      await runDevelopmentCommand(
        process.execPath,
        [path.join(projectRoot, 'scripts/build-web.mjs')],
        context,
      );
    await runDevelopmentCommand(
      existsSync(executable) ? executable : tool,
      process.argv.slice(rustup ? 3 : 2),
      context,
    );
  });
} catch (error) {
  console.error(String(error));
  process.exitCode = 1;
}
