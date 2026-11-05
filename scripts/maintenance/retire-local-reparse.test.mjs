import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {trustedScriptInvocation} from './windows-trusted-script.mjs';
const win={skip:process.platform!=='win32'},sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function fixture(t){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'spark-reparse-object-')),workspace=path.join(base,'workspace'),original=path.join(base,'original');
 await fs.mkdir(path.join(workspace,'.local'),{recursive:true});await fs.mkdir(original);await fs.writeFile(path.join(original,'sentinel.txt'),'original target is unchanged');
 t.after(async()=>{assert.equal(path.dirname(base),path.resolve(os.tmpdir()));assert(path.basename(base).startsWith('spark-reparse-object-'));await fs.rm(base,{recursive:true,force:true});});
 return {base,workspace,original,link:path.join(workspace,'.local','link'),plan:path.join(base,'plan.json'),candidates:path.join(base,'candidates.json'),journal:path.join(base,'journal.jsonl')};
}
async function run(f,mode){
 const parameters={Mode:mode,Workspace:f.workspace,Plan:f.plan,Candidates:f.candidates,Journal:f.journal};if(mode==='apply')parameters.PlanSha256=sha(await fs.readFile(f.plan));
 const invocation=await trustedScriptInvocation('scripts/maintenance/retire-local-reparse.ps1','scripts/maintenance/windows-reparse-objects.cs',parameters);
 const child=spawn('powershell.exe',invocation.args,{env:invocation.env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',error='';
 child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
 return {code,output,error};
}
test('native link-only retirement preserves an external original directory and its sentinel',win,async t=>{
 const f=await fixture(t);await fs.symlink(f.original,f.link,'junction');await fs.writeFile(path.join(f.workspace,'.local','ordinary.txt'),'ordinary file stays');
 const planned=await run(f,'plan');assert.equal(planned.code,0,planned.error||planned.output);const plan=JSON.parse(await fs.readFile(f.plan,'utf8'));assert.equal(plan.entries.length,1);assert.equal(plan.entries[0].capture.followedTarget,false);assert.equal(plan.entries[0].capture.tag,0xa0000003);
 const applied=await run(f,'apply');assert.equal(applied.code,0,applied.error||applied.output);assert.equal(JSON.parse(applied.output).removed,1);
 await assert.rejects(fs.lstat(f.link),{code:'ENOENT'});assert.equal(await fs.readFile(path.join(f.original,'sentinel.txt'),'utf8'),'original target is unchanged');assert.equal(await fs.readFile(path.join(f.workspace,'.local','ordinary.txt'),'utf8'),'ordinary file stays');
 const journal=(await fs.readFile(f.journal,'utf8')).trim().split('\n').map(JSON.parse);assert.deepEqual(journal.map(r=>r.event),['intent','removed']);
});
test('native opaque capture and same-handle retirement work on a broken junction',win,async t=>{
 const f=await fixture(t);await fs.symlink(path.join(f.base,'missing target'),f.link,'junction');
 const planned=await run(f,'plan');assert.equal(planned.code,0,planned.error||planned.output);const plan=JSON.parse(await fs.readFile(f.plan,'utf8'));const capture=plan.entries[0].capture;assert.equal(sha(Buffer.from(capture.rawBase64,'base64')),capture.rawSha256);
 const applied=await run(f,'apply');assert.equal(applied.code,0,applied.error||applied.output);assert.equal(JSON.parse(applied.output).removed,1);await assert.rejects(fs.lstat(f.link),{code:'ENOENT'});assert.equal(await fs.readFile(path.join(f.original,'sentinel.txt'),'utf8'),'original target is unchanged');
});
test('native link replacement is retained even when its target is unchanged',win,async t=>{
 const f=await fixture(t);await fs.symlink(f.original,f.link,'junction');assert.equal((await run(f,'plan')).code,0);await fs.rename(f.link,f.link+'.held');await fs.symlink(f.original,f.link,'junction');
 const applied=await run(f,'apply');assert.equal(applied.code,2,applied.error||applied.output);assert.equal(JSON.parse(applied.output).retained,1);assert((await fs.lstat(f.link)).isSymbolicLink());assert.equal(await fs.readFile(path.join(f.original,'sentinel.txt'),'utf8'),'original target is unchanged');
});
test('ordinary directories and link parents cannot enter a reparse retirement plan',win,async t=>{
 const f=await fixture(t);await fs.mkdir(f.link);await fs.writeFile(f.candidates,JSON.stringify({workspace:f.workspace,readOnly:true,links:['.local/link']}));
 const planned=await run(f,'plan');assert.equal(planned.code,2,planned.error||planned.output);const plan=JSON.parse(await fs.readFile(f.plan,'utf8'));assert.equal(plan.complete,false);assert.equal(plan.entries.length,0);assert.equal(plan.errors.length,1);assert((await fs.lstat(f.link)).isDirectory());assert.equal(await fs.readFile(path.join(f.original,'sentinel.txt'),'utf8'),'original target is unchanged');
});
test('native reparse capture refuses to traverse a linked parent',win,async t=>{
 const f=await fixture(t);await fs.symlink(f.original,f.link,'junction');await fs.symlink(path.join(f.base,'missing'),path.join(f.original,'child'),'junction');await fs.writeFile(f.candidates,JSON.stringify({workspace:f.workspace,readOnly:true,links:['.local/link/child']}));
 const planned=await run(f,'plan');assert.equal(planned.code,2,planned.error||planned.output);const plan=JSON.parse(await fs.readFile(f.plan,'utf8'));assert.equal(plan.entries.length,0);assert.match(plan.errors[0].error,/Parent is linked/);assert((await fs.lstat(path.join(f.original,'child'))).isSymbolicLink());assert.equal(await fs.readFile(path.join(f.original,'sentinel.txt'),'utf8'),'original target is unchanged');
});
async function directories(f,mode){
 const parameters={Mode:mode,Workspace:f.workspace,Plan:f.plan,Journal:f.journal};if(mode==='apply')parameters.PlanSha256=sha(await fs.readFile(f.plan));
 const invocation=await trustedScriptInvocation('scripts/maintenance/retire-local-empty-directories.ps1','scripts/maintenance/windows-reparse-objects.cs',parameters);
 const child=spawn('powershell.exe',invocation.args,{env:invocation.env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});return {code,output,error,result:()=>JSON.parse(output.slice(output.indexOf('{',output.indexOf('\n')+1)))};
}
function finalJson(output){const end=output.lastIndexOf('\n{');return JSON.parse(output.slice(end<0?0:end+1));}
test('native empty-only retirement removes a >400-character directory tree and safely replays its journal',win,async t=>{
 const f=await fixture(t),deep=path.join(f.workspace,'.local',...Array.from({length:12},(_,i)=>`directory_${i}_abcdefghijklmnop`));assert(deep.length>400);await fs.mkdir(deep,{recursive:true});
 const planned=await directories(f,'plan');assert.equal(planned.code,0,planned.error||planned.output);const plan=JSON.parse(await fs.readFile(f.plan,'utf8'));assert.equal(plan.regularFiles,0);assert.equal(plan.links.length,0);
 const applied=await directories(f,'apply');assert.equal(applied.code,0,applied.error||applied.output);assert.equal(finalJson(applied.output).removed,plan.directories);await assert.rejects(fs.lstat(path.join(f.workspace,'.local')),{code:'ENOENT'});
 const replay=await directories(f,'apply');assert.equal(replay.code,0,replay.error||replay.output);assert.equal(finalJson(replay.output).recovered,plan.directories);assert.equal(await fs.readFile(path.join(f.original,'sentinel.txt'),'utf8'),'original target is unchanged');
});
test('native empty-directory retirement refuses a file added after the reviewed plan',win,async t=>{
 const f=await fixture(t);await fs.mkdir(path.join(f.workspace,'.local','planned'));assert.equal((await directories(f,'plan')).code,0);const added=path.join(f.workspace,'.local','planned','new-original.txt');await fs.writeFile(added,'must stay');
 const applied=await directories(f,'apply');assert.equal(applied.code,2,applied.error||applied.output);assert.equal(finalJson(applied.output).complete,false);assert.equal(await fs.readFile(added,'utf8'),'must stay');assert.equal(await fs.readFile(path.join(f.original,'sentinel.txt'),'utf8'),'original target is unchanged');
});
test('native empty-directory retirement refuses an ordinary parent replacement',win,async t=>{
 const f=await fixture(t),parent=path.join(f.workspace,'.local','parent'),child=path.join(parent,'child');await fs.mkdir(child,{recursive:true});assert.equal((await directories(f,'plan')).code,0);await fs.rename(parent,parent+'.held');await fs.mkdir(parent);await fs.rename(path.join(parent+'.held','child'),child);
 const applied=await directories(f,'apply');assert.equal(applied.code,2,applied.error||applied.output);assert.equal(finalJson(applied.output).complete,false);assert((await fs.lstat(child)).isDirectory());assert((await fs.lstat(parent+'.held')).isDirectory());
});
test('an absent planned directory is not reported as recovered without a durable prior intent',win,async t=>{
 const f=await fixture(t),child=path.join(f.workspace,'.local','child');await fs.mkdir(child);assert.equal((await directories(f,'plan')).code,0);await fs.rmdir(child);
 const applied=await directories(f,'apply');assert.equal(applied.code,2,applied.error||applied.output);const outcome=finalJson(applied.output);assert.equal(outcome.complete,false);assert.equal(outcome.recovered,0);assert(outcome.errors.some(row=>/absent without prior reviewed intent/.test(row.error)));
 const journal=(await fs.readFile(f.journal,'utf8')).trim().split('\n').map(JSON.parse);assert(!journal.some(row=>row.path===child&&row.event==='intent'));assert.equal(await fs.readFile(path.join(f.original,'sentinel.txt'),'utf8'),'original target is unchanged');
});
