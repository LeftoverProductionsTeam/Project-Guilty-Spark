// Drives the REAL AppImage and extracted Debian ELF under Xvfb/WebKitGTK.
// No mock IPC, sandbox switches, Windows renaming or application test plugin.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
const [directory, commit, output] = process.argv.slice(2);
if (process.platform !== 'linux' || !directory || !/^[a-f0-9]{40}$/.test(commit ?? '') || !output)
  throw Error('smoke-linux <candidate directory> <full commit> <fresh evidence directory>');
const root = path.resolve(output),
  packages = path.resolve(directory);
await fs.mkdir(root, { recursive: false });
const manifest = JSON.parse(await fs.readFile(path.join(packages, 'candidate.json')));
if (manifest.sourceCommit !== commit || manifest.platform !== 'linux-x64')
  throw Error('Linux candidate identity differs');
const image = manifest.artifacts.find((a) => a.kind === 'appimage'),
  deb = manifest.artifacts.find((a) => a.kind === 'debian');
const imagePath = path.join(packages, image.file),
  debPath = path.join(packages, deb.file);
const hash = (data) => crypto.createHash('sha256').update(data).digest('hex');
await fs.chmod(imagePath, 0o755);
execFileSync('dpkg-deb', ['--extract', debPath, path.join(root, 'debian')]);
const debApp = path.join(root, 'debian/usr/bin/GuiltySpark');
if (hash(await fs.readFile(debApp)) !== manifest.debianExecutableSha256)
  throw Error('Debian extraction differs');
const imagePayloadRoot = path.join(root, 'appimage-payload');
await fs.mkdir(imagePayloadRoot);
execFileSync(imagePath, ['--appimage-extract', 'usr/bin/GuiltySpark'], { cwd: imagePayloadRoot });
const imageApp = path.join(imagePayloadRoot, 'squashfs-root/usr/bin/GuiltySpark');
if (hash(await fs.readFile(imageApp)) !== manifest.appImageExecutableSha256)
  throw Error('AppImage executable differs beyond its Tauri bundle marker');
const freePort = async () => {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
};
const receipt = {
  schemaVersion: 1,
  sourceCommit: commit,
  applicationVersion: manifest.applicationVersion,
  executableSha256: manifest.executableSha256,
  debianExecutableSha256: hash(await fs.readFile(debApp)),
  appImageExecutableSha256: hash(await fs.readFile(imageApp)),
  mockedIpc: false,
  complete: false,
  platform: 'linux-x64',
  appImageLaunched: false,
  debianBinaryLaunched: false,
  checks: [],
};
try {
  for (const [label, application] of [
    ['appimage', imagePath],
    ['debian', debApp],
  ]) {
    const port = await freePort(),
      nativePort = await freePort(),
      logs = [];
    const child = spawn('tauri-driver', ['--port', String(port), '--native-port', String(nativePort)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        APPIMAGE_EXTRACT_AND_RUN: '1',
        GUILTY_SPARK_DATA_DIR: path.join(root, label + '-library'),
      },
    });
    for (const s of [child.stdout, child.stderr]) s.on('data', (b) => logs.push(b));
    let session;
    const call = async (route, body, method = 'POST') => {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, {
        method,
        signal: AbortSignal.timeout(90000),
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const value = await response.json();
      if (!response.ok || value.value?.error) throw Error(JSON.stringify(value));
      return value.value;
    };
    try {
      const deadline = Date.now() + 30000;
      while (true) {
        try {
          await call('/status', null, 'GET');
          break;
        } catch (e) {
          if (Date.now() > deadline || child.exitCode !== null) throw e;
          await new Promise((r) => setTimeout(r, 300));
        }
      }
      const started = await call('/session', {
        capabilities: { alwaysMatch: { 'tauri:options': { application } } },
      });
      session = started.sessionId;
      await call(`/session/${session}/timeouts`, { script: 90000 });
      const result = await call(`/session/${session}/execute/async`, {
        script: `const done=arguments[arguments.length-1]; (async()=>{
          const boot=await window.__TAURI_INTERNALS__.invoke('bootstrap');
          const version=boot.applicationVersion;
          const deadline=Date.now()+60000;
          while(!document.querySelector('.application')&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
          const app=document.querySelector('.application');
          const rect=app?.getBoundingClientRect();
          return {version,ready:!!boot.settings&&Array.isArray(boot.entries),visible:!!rect&&rect.width>0&&rect.height>0};
        })().then(done,e=>done({error:String(e)}));`,
        args: [],
      });
      if (result.error || !result.ready || !result.visible || result.version !== manifest.applicationVersion)
        throw Error('Actual Linux native bootstrap failed: ' + JSON.stringify(result));
      if (label === 'appimage') receipt.appImageLaunched = true;
      else receipt.debianBinaryLaunched = true;
      receipt.checks.push({
        package: label,
        nativeBootstrap: true,
        frontendVisible: true,
        versionMatches: true,
      });
    } finally {
      if (session) await call(`/session/${session}`, null, 'DELETE').catch(() => {});
      child.kill();
      await fs.writeFile(path.join(root, label + '-driver.log'), Buffer.concat(logs));
    }
  }
  receipt.complete = true;
} finally {
  await fs.writeFile(path.join(root, 'startup.json'), JSON.stringify(receipt, null, 2) + '\n');
}
