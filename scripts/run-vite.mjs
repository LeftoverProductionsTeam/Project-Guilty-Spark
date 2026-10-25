import { spawn } from 'node:child_process';
spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], {
  stdio: 'inherit',
  windowsHide: true,
}).on('exit', (code) => process.exit(code ?? 1));
