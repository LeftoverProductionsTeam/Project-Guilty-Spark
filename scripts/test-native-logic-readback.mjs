// Finish independent readback of an already compiled external revision without
// replacing a project the owner may have continued editing during compilation.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,expect as assertion} from '@playwright/test';
const expect=assertion.configure({timeout:120000});
const [appArg,inputArg,outputArg]=process.argv.slice(2);
if(!outputArg)throw Error('test-native-logic-readback <Spark exe> <preserved external-build attempt.json> <fresh output>');
const app=path.resolve(appArg),input=path.resolve(inputArg),output=path.resolve(outputArg);
const prior=JSON.parse(await fs.readFile(input,'utf8'));
if(prior.mockedIpc!==false||!prior.reconciled?.accepted||!prior.invalidReconcileRejected||!prior.postFixCorruptionRetest?.rejected||prior.build?.status!=='validated')throw Error('Requires genuine accepted source, refused corruption and validated native build evidence');
const hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
expect(await hash(prior.build.output)).toBe(prior.build.sha256);
await fs.mkdir(output,{recursive:false});
const executable=path.join(output,'GuiltySpark-readback.exe');await fs.copyFile(app,executable,fs.constants.COPYFILE_EXCL);
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const child=spawn(executable,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:path.join(output,'library'),WEBVIEW2_USER_DATA_FOLDER:path.join(output,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
const receipt={...prior,complete:false,previousAttempt:input,readbackAppSha256:await hash(app),readbackInSeparateLibrary:true,sourceProjectWritten:false,error:undefined,stack:undefined};
let browser;
try{
 await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
 await expect.poll(()=>browser.contexts().flatMap(c=>c.pages()).some(p=>p.url().includes('tauri.localhost'))).toBe(true);
 const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('tauri.localhost'));
 const call=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
 const [opened]=await call('import_paths',{paths:[prior.build.output]});
 expect(opened.inspection.sha256).toBe(prior.build.sha256);
 const door=opened.inspection.tags.find(t=>t.class==='mach'&&t.path.replaceAll('\\','/').endsWith('door small/door small'));
 const radius=door?.fields.find(f=>f.label==='Bounding radius'||f.key==='bounding_radius');
 expect(radius?.value).toBeCloseTo(0.5,6);receipt.compiledBoundingRadius=radius.value;
 const names=opened.inspection.scripts.map(s=>s.name);
 expect(names).toEqual(expect.arrayContaining(prior.compiledScripts?.map(s=>s.name)??['gs_logic_init']));
 receipt.compiledScripts=opened.inspection.scripts;
 const authoring=JSON.parse(await fs.readFile(path.join(path.dirname(input),'../native-ui-twelfth/acceptance.json'),'utf8'));
 expect(names).toEqual(expect.arrayContaining(authoring.nativeScriptNames));
 const directory=path.join(path.dirname(input),'../native-ui-twelfth/library/jobs',`baboon-${prior.resumedPreparedSession}`);
 const journal=JSON.parse(await fs.readFile(path.join(directory,'handoff.json'),'utf8'));
 for(const [relative,expectedHash] of Object.entries(journal.initialBaseline))expect(await hash(path.join(directory,'baseline',...relative.split('/')))).toBe(expectedHash);
 receipt.startingInventoryVerified=Object.keys(journal.initialBaseline).length;
 expect(await hash(authoring.nativeBuild.build.output)).toBe(prior.parentSha256);
 expect(await hash(prior.build.output)).toBe(prior.build.sha256);
 const tag=journal.selectedTag.split('/');
 expect(await hash(path.join(directory,'HCEEK','tags',...tag))).toBe(await hash(path.join(prior.reconciled.source,...tag)));
 receipt.complete=true;
 await fs.writeFile(path.join(output,'acceptance.json'),JSON.stringify(receipt,null,2));
 console.log('PASS actual compiled radius 0.5 and original Logic scripts; all starting tags and parent cache unchanged. Owner geometry changes preserved separately.');
}catch(e){receipt.error=String(e);await fs.writeFile(path.join(output,'failure.json'),JSON.stringify(receipt,null,2));throw e;}
finally{await browser?.close();child.kill();}
