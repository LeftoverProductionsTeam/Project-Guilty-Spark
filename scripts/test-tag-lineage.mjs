import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'gs-lineage-test-'));
const original=readFileSync(new URL('../src/tagLineage.ts',import.meta.url),'utf8');
const rewritten=original.replace("from './editor'","from './editor.ts'");
assert.notEqual(rewritten,original,'Isolated test needs a single editor import');
writeFileSync(join(dir,'tagLineage.ts'),rewritten);
writeFileSync(join(dir,'editor.ts'),`export function effectiveReferenceId(project,tag,ref){return ref.targetId;}`);
const { inspectTagLineage, exportTagLineageReport }=await import(pathToFileURL(join(dir,'tagLineage.ts')).href);
const sha='a1'.repeat(32);
const tag=(id,cls,path,references=[],fields=[],external=false)=>({id,class:cls,path,fields,references,external});
const ref=(id,cls,label='child',offset=16)=>({targetId:id,class:cls,label,offset});
const project={source:{sha256:sha},tagEdits:[]};
const inspection={sha256:sha,header:{version:7,engine:'Halo PC'},tags:[
 tag(1,'weap','secret\\pistol',[ref(2,'proj'),ref(5,'snd!'),ref(9,'bitm')]),
 tag(2,'proj','secret\\rocket',[ref(1,'weap')]),
 tag(5,'snd!','private\\sound',[]),
 tag(8,'bitm','private\\other',[]),
]};
const report=inspectTagLineage(project,inspection,1);
assert.equal(report.sourceSha256,sha);
assert(report.edges.some(e=>e.status==='cycle'));
assert(report.edges.some(e=>e.status==='missing'));
assert.equal(report.evidence.completeTagDependencyTree,false);
assert.equal(report.evidence.compilerVerified,false);
const json=exportTagLineageReport(report);
for(const secret of ['secret\\pistol','secret\\rocket','private\\sound','private\\other'])assert.ok(!json.includes(secret),`Leaked path ${secret}`);
assert.throws(()=>inspectTagLineage(project,{...inspection,sha256:'ff'.repeat(32)},1),/SHA-256/);
assert.throws(()=>inspectTagLineage(project,inspection,100),/absent|missing/i);
console.log('PASS: multi-depth cache tag lineage follows observed edges/cycles, refuses wrong hashes and path leaks, never certifies true editable-tag export');
