import fs from 'node:fs/promises';
import net from 'node:net';
import { withDevelopmentWorkspace, runDevelopmentCommand } from './native-qa-storage.mjs';
import { checkSourceEntrypoints } from './check-source-entrypoints.mjs';
const kind = process.argv[2] ?? 'unit';
if (!['unit', 'browser', 'offline'].includes(kind)) throw Error('Choose unit, browser or offline tests');
try {
  await checkSourceEntrypoints();
  await withDevelopmentWorkspace(`frontend-${kind}`, async (context) => {
    if (kind === 'browser' && !context.env.SPARK_UI_TEST_PORT) {
      // Own this run's page server. A developer's existing Vite process can
      // disappear or serve different source; it is never test evidence.
      const server = net.createServer();
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      context.env.SPARK_UI_TEST_PORT = String(server.address().port);
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
    if (kind === 'offline') {
      const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
      for (const command of pkg.scripts['test:offline:commands'].split(' && ')) {
        const [node, ...args] = command.split(' ');
        if (node !== 'node') throw Error('Offline command must use the existing Node runner');
        await runDevelopmentCommand(process.execPath, args, context);
      }
    } else
      await runDevelopmentCommand(
        process.execPath,
        kind === 'unit'
          ? ['node_modules/vitest/vitest.mjs', 'run', ...process.argv.slice(3)]
          : ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(3)],
        context,
      );
  });
} catch (error) {
  console.error(String(error));
  process.exitCode = 1;
}
