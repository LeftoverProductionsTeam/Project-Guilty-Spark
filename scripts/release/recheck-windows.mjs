import { assertQaOutputPath } from '../native-qa-storage.mjs';
// Re-open a sealed older candidate without comparing it to newer dist/ bytes.
// Its original acceptance remains in the manifest; this is a fresh startup and
// payload check of that exact immutable candidate, not a new source release.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium,expect} from '@playwright/test';
import {loadAssets} from './draft.mjs';
const [sealed,portable,candidate,output]=process.argv.slice(2);
if(process.platform!=='win32'||!sealed||!portable||!candidate||!output)throw Error('recheck-windows <sealed directory> <extracted portable exe> <exe to launch> <fresh evidence>');
const root=path.resolve(output),exec=promisify(execFile),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const assets=await loadAssets([sealed]),m=assets.identity;
const python=process.env.SPARK_RELEASE_PYTHON??'python';
await exec(python,['-B','scripts/release/package.py','verify',path.resolve(sealed)]);
const portableHash=sha(await fs.readFile(portable));
if(portableHash!==m.executableSha256)throw Error('Extracted portable differs from the sealed candidate');
const app=path.resolve(candidate),appHash=sha(await fs.readFile(app));
let payload={portableExecutableSha256:portableHash,installedExecutableSha256:appHash,bundleMarkerRewrite:'none'};
if(appHash!==portableHash)payload=JSON.parse((await exec(python,['-B','scripts/release/package.py','windows-payload',path.resolve(portable),app])).stdout);
await fs.mkdir(await assertQaOutputPath(root));
const endpoint=net.createServer();await new Promise(r=>endpoint.listen(0,'127.0.0.1',r));const port=endpoint.address().port;await new Promise(r=>endpoint.close(r));
const began=performance.now(),child=spawn(app,[],{cwd:path.dirname(app),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,GUILTY_SPARK_DATA_DIR:path.join(root,'library'),WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-address=127.0.0.1 --remote-debugging-port=${port}`}});
let browser;
const report={schemaVersion:1,sourceCommit:m.sourceCommit,sourceTree:m.sourceTree,applicationVersion:m.applicationVersion,releaseTag:m.releaseTag,appSha256:appHash,payload,originalAcceptance:m.verification.complete,mockedIpc:false,complete:false,errors:[]},chunks=[];
for(const stream of [child.stdout,child.stderr])stream.on('data',b=>chunks.push(b));
try{
  await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false),{timeout:90000}).toBe(true);
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);let page;
  await expect.poll(()=>{page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('tauri.localhost'));return !!page;}).toBe(true);
  page.on('pageerror',e=>report.errors.push(String(e)));await expect(page.locator('.application')).toBeVisible({timeout:90000});
  const boot=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('bootstrap'));
  expect(boot.applicationVersion).toBe(m.applicationVersion);expect(Array.isArray(boot.entries)).toBe(true);expect(boot.settings).toBeTruthy();
  await expect(page.getByText('Loading workspace…',{exact:true})).toBeHidden({timeout:90000});await expect(page.locator('main h1').first()).toBeVisible({timeout:90000});
  report.workspaceHeading=await page.locator('main h1').first().innerText();report.workspaceReadyMs=performance.now()-began;
  await page.screenshot({path:path.join(root,'startup.png')});await page.waitForTimeout(1000);
  if(report.errors.length)throw Error(report.errors.join('\n'));
  report.complete=true;console.log(JSON.stringify(report));
}finally{await fs.writeFile(path.join(root,'startup.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(root,'process.log'),Buffer.concat(chunks));await browser?.close().catch(()=>{});child.kill();}
