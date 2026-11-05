import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  withDevelopmentWorkspace,
  runDevelopmentCommand,
  embeddedFrontendConfig,
  exportDevelopmentBuild,
} from './native-qa-storage.mjs';
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
env.CARGO_PROFILE_DEV_DEBUG ??= '0';
env.CARGO_PROFILE_TEST_DEBUG ??= '0';
env.CARGO_INCREMENTAL ??= '0';
export function prepareDesktopArguments(input, config, { owned = false } = {}) {
  const split = input.indexOf('--');
  const args = input.slice(0, split < 0 ? input.length : split),
    cargo = split < 0 ? [] : input.slice(split);
  const exportIndex = args.indexOf('--export-to');
  let exportTo;
  if (exportIndex >= 0) {
    exportTo = args[exportIndex + 1];
    if (!exportTo || exportTo.startsWith('--')) throw Error('Choose a build export folder');
    args.splice(exportIndex, 2);
  }
  if (args.includes('--export-to')) throw Error('Choose only one build export folder');
  if (args[0] === 'build' && !args.includes('--no-bundle') && !exportTo && !owned)
    throw Error(
      'Packaging needs --export-to <folder outside the checkout>. Compiler output is otherwise disposable.',
    );
  if (args[0] === 'build') {
    const features = args.indexOf('--features');
    if (features >= 0) {
      if (!args[features + 1] || args[features + 1].startsWith('--')) throw Error('Missing desktop features');
      args[features + 1] = [...new Set([...args[features + 1].split(','), 'tauri/custom-protocol'])].join(
        ',',
      );
    } else args.push('--features', 'tauri/custom-protocol');
  }
  if (['build', 'dev'].includes(args[0])) args.push('--config', config);
  return { args: [...args, ...cargo], exportTo };
}
async function main() {
  try {
    await withDevelopmentWorkspace('desktop', async (context) => {
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
      const config = JSON.stringify(embeddedFrontendConfig(context.env.SPARK_FRONTEND_DIST));
      const { args, exportTo } = prepareDesktopArguments(process.argv.slice(2), config, {
        owned: Boolean(process.env.SPARK_BUILD_WORKSPACE),
      });
      await runDevelopmentCommand(
        process.execPath,
        [path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'), ...args],
        context,
      );
      if (exportTo)
        console.log(
          JSON.stringify({
            exported: await exportDevelopmentBuild(
              path.join(context.env.CARGO_TARGET_DIR, args.includes('--debug') ? 'debug' : 'release'),
              path.resolve(exportTo),
            ),
          }),
        );
    });
  } catch (error) {
    console.error(String(error));
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
