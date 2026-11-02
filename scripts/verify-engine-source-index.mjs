// Read-only source-reference validation. No download, game, tool or remote call.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const index=JSON.parse(await fs.readFile(path.join(root,'docs/fixtures/engine-source-index.json')));
const safeRelative=p=>typeof p==='string'&&p.length>0&&!p.includes('\\')&&!p.includes(':')&&!p.startsWith('/')&&!p.split('/').some(s=>!s||s==='.'||s==='..');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const required=['capability','ownership','inputOutput','runtimeSupport','gap','integrationMethod','license','acceptance','status'];
const fail=reason=>{throw Error('Engine source index: '+reason);};
if(index.schemaVersion!==1||index.researchOnly!==true||index.gameplayAcceptance!==false||index.incorporatedEngineModules!==0)fail('source evidence must stay separate from runtime acceptance and incorporated code');
const projects=new Map();
for(const p of index.projects){
 if(projects.has(p.id)||!/^[a-z0-9-]+$/.test(p.id)||!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(p.repository)||!/^[a-f0-9]{40}$/.test(p.revision))fail('invalid or duplicate project pin');
 if(!safeRelative(p.licenseFile)||!/^[a-f0-9]{64}$/.test(p.licenseSha256)||p.licenseUrl!==`${p.repository}/blob/${p.revision}/${p.licenseFile}`)fail('missing pinned license identity');
 if(!(p.checkedOutFiles>0)||!(p.checkedOutBytes>0)||p.checkedOutBytes>128*1024*1024)fail('source inventory is missing or exceeds its selected-file budget');
 projects.set(p.id,p);
}
if(projects.size<6||index.behaviors.length<25)fail('required research scope is missing');
const seen=new Set(), covered=new Set();
const research=process.argv[2]?path.resolve(process.argv[2]):null;
for(const b of index.behaviors){
 const p=projects.get(b.sourceProject),l=b.sourceLocation,s=b.sparkEquivalent;
 if(!p||b.repository!==p.repository||b.revision!==p.revision||seen.has(b.id))fail('behavior has an invalid pin or duplicate identity');
 seen.add(b.id);covered.add(p.id);
 if(required.some(k=>typeof b[k]!=='string'||!b[k].trim()))fail('incomplete behavior '+b.id);
 if(!safeRelative(l.file)||!l.symbol||!Number.isSafeInteger(l.line)||l.line<1||!/^[a-f0-9]{64}$/.test(l.fileSha256))fail('unbounded source location '+b.id);
 if(l.url!==`${p.repository}/blob/${p.revision}/${l.file}#L${l.line}`)fail('unpinned source link '+b.id);
 if(!safeRelative(s.file)||!s.symbol||!s.equivalence?.includes('not proof'))fail('unsafe or overstated Spark mapping '+b.id);
 if(!(await fs.readFile(path.join(root,s.file),'utf8')).includes(s.symbol))fail('Spark owner no longer exists '+b.id);
 if(research){const bytes=await fs.readFile(path.join(research,p.id,l.file));if(digest(bytes)!==l.fileSha256||!bytes.toString('utf8').includes(l.symbol))fail('research source differs '+b.id);}
}
if(covered.size!==projects.size)fail('project has no reviewed behavior');
if(research)for(const p of projects.values()){
 const dir=path.join(research,p.id);
 if(execFileSync('git',['-C',dir,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==p.revision)fail('checkout revision moved '+p.id);
 if(execFileSync('git',['-C',dir,'status','--porcelain'],{encoding:'utf8'}).trim())fail('research checkout changed '+p.id);
 if(digest(await fs.readFile(path.join(dir,p.licenseFile)))!==p.licenseSha256)fail('license changed '+p.id);
}
console.log(JSON.stringify({projects:projects.size,behaviors:seen.size,pinnedLicenseAndSourceLinks:true,sparkOwnersVerified:true,researchHashesVerified:!!research,gameplayAcceptance:false}));
