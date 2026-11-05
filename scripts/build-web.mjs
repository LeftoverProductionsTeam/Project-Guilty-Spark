import { withDevelopmentWorkspace, runDevelopmentCommand } from './native-qa-storage.mjs';
try {
  await withDevelopmentWorkspace('frontend', async (context) => {
    await runDevelopmentCommand(
      process.execPath,
      ['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false'],
      context,
    );
    await runDevelopmentCommand(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], context);
  });
} catch (error) {
  console.error(String(error));
  process.exitCode = 1;
}
