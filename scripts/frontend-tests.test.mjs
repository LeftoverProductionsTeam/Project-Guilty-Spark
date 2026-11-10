import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
// Real socket/process regression. No app/game behavior is inferred.
test(
  'browser checks refuse an occupied foreign server instead of adopting its pages',
  { timeout: 60000 },
  async () => {
    const paths = [];
    const server = http.createServer((request, response) => {
      paths.push(request.url);
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<html>Foreign server</html>');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    let child;
    try {
      const port = String(server.address().port),
        chunks = [];
      child = spawn(
        process.execPath,
        [
          'scripts/frontend-tests.mjs',
          'browser',
          'tests/ui/spark-flow.spec.ts',
          '--grep',
          '^Open Work is keyboard',
          '--workers=1',
        ],
        {
          windowsHide: true,
          env: { ...process.env, SPARK_UI_TEST_PORT: port, CI: '', SPARK_RELEASE_GATES: '' },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => chunks.push(chunk));
      const result = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code) => resolve(code));
      });
      const text = Buffer.concat(chunks).toString();
      assert.notEqual(result, 0);
      assert.match(text, /already used|already in use/i);
      assert.equal(
        paths.some((url) => url.includes('/tests/') || url.endsWith('.js')),
        false,
        'A foreign page must never become the test application',
      );
      assert.match(text, /temporaryOutputDisposed.*true/, 'The rejected run still cleans its owned staging');
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) child.kill();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
