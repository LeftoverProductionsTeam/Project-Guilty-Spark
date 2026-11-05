import { assertQaOutputPath } from './native-qa-storage.mjs';
// Opt-in desktop acceptance against real native IPC and owner-selected Halo tools.
// Gameplay and third-party GUI interaction remain separate acceptance gates.
import { chromium, expect as assertion } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
import {nativeLogicRoundTrip} from './native-logic-roundtrip.mjs';
const expect=assertion.configure({timeout:45000}),a=process.argv.slice(2),resume=a.length===7&&a[6]==='--resume-build';
if(a.length!==6&&!resume)throw Error('test-native-logic-authoring <Spark exe> <fresh root> <H1A kit> <owned tags> <Invader> <owned MCC source map with a device_machine> [--resume-build]');
const [app,root,kit,tags,invader,cache]=a.slice(0,6).map(p=>path.resolve(p));
if(!resume)await fs.mkdir(await assertQaOutputPath(root),{recursive:false});const data=path.join(root,'library');if(!resume)await fs.mkdir(data);
const hash=async p=>crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
const receipt={schemaVersion:1,appSha256:await hash(app),sourceCacheSha256:await hash(cache),mockedIpc:false,gameplayVerified:false,externalGuiEdited:false,complete:false};
if(resume){const previous=JSON.parse(await fs.readFile(path.join(root,'failure.json'),'utf8'));if(previous.mockedIpc!==false||!previous.oneActionConnectionUndoRedo||!previous.saveReopenPreservesLogic||!previous.triggerTransformUndo||previous.sourceCacheSha256!==receipt.sourceCacheSha256||previous.appSha256!==receipt.appSha256)throw Error('Resume requires the same executable/source and recorded genuine UI authoring checks');Object.assign(receipt,previous,{error:undefined,stack:undefined,resumedBuild:true,authoringEvidence:'failure.json',complete:false});}
const errors=[],socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const exe=path.join(root,'GuiltySpark-logic-qa.exe');if(!resume)await fs.copyFile(app,exe,fs.constants.COPYFILE_EXCL);else expect(await hash(exe)).toBe(receipt.appSha256);
const child=spawn(exe,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:data,WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
await fs.writeFile(path.join(root,'owned-process.json'),JSON.stringify({pid:child.pid,port},null,2));
let browser,page,call;
try {
 await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
 await expect.poll(()=>browser.contexts().flatMap(c=>c.pages()).some(p=>p.url().includes('tauri.localhost'))).toBe(true);
 page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('tauri.localhost'));
 page.setDefaultTimeout(120000);
 page.on('pageerror',e=>errors.push(String(e)));
 call=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
 await nativeLogicRoundTrip({page,root,kit,tags,invader,cache,call,receipt,expect,resume});
 expect(errors).toEqual([]);receipt.pageErrors=errors;receipt.complete=true;
 await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(receipt,null,2));console.log('PASS real desktop door placement, visual event, native HSC, Undo, reopen and MCC Tool build. Gameplay remains a separate gate.');
}catch(e){receipt.error=String(e);receipt.stack=e.stack;receipt.pageErrors=errors;const name=resume?`failure-resume-${Date.now()}`:'failure';await page?.screenshot({path:path.join(root,`${name}.png`)}).catch(()=>{});await fs.writeFile(path.join(root,`${name}.json`),JSON.stringify(receipt,null,2));throw e;}
finally{await browser?.close();child.kill();}
