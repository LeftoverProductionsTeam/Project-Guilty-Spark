import { withDevelopmentWorkspace, runDevelopmentCommand } from './native-qa-storage.mjs';
try {
  await withDevelopmentWorkspace('vite', (context) =>
    runDevelopmentCommand(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', ...process.argv.slice(2)],
      context,
    ),
  );
} catch (error) {
  console.error(String(error));
  process.exitCode = 1;
}
