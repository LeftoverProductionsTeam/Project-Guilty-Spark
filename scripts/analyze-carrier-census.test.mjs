// Synthetic diagnostic regressions only. No game-play acceptance is produced.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';
const script=path.resolve('scripts/analyze-carrier-census.mjs'),none=0xffffffff,id=0x12010002;
const identity={runtime:'opence-build-335',role:'host',readOnly:true,atomicSnapshot:false,detailedCensus:true,exeSha256:'788fb4095664b9417f64f9d40a5668e6d0775823407e9d5a7b517587536766a0',pdbSha256:'b3755a3d5a7864e0ba30be6dd457c3f361c62a2bc0a04c18860a713f1931c800',synthetic:true};
const unit=(extra={})=>({id,parentId:0x22010001,seat:0,position:[0,0,0],health:1,damageFlags:0,...extra});
const object=sample=>{const {seat,...base}=sample;return {...base,type:0,velocity:[0,0,0],unit:{seat,animationIndex:38,animationFrame:0}};};
const frame=(tick,actors,objects)=>({state:{serverTick:tick,actorPoolCount:actors.length,actors,details:{objects},objectTags:[]}});
async function fixture(run){const root=await fs.mkdtemp(path.join(os.tmpdir(),'spark-carrier-analysis-'));try{await run(root);}finally{if(path.dirname(path.resolve(root))!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('spark-carrier-analysis-')||(await fs.lstat(root)).isSymbolicLink())throw Error('Unexpected temporary fixture path');await fs.rm(root,{recursive:true});}}
async function analyze(root,frames,header=identity,completed=true){const input=path.join(root,'native.ndjson'),output=path.join(root,'report.json');await fs.writeFile(input,[header,...frames,...(completed?[{completed:true,inputsRechecked:true}]:[])].map(JSON.stringify).join('\n'));const child=spawnSync(process.execPath,[script,output,input],{windowsHide:true,encoding:'utf8'});return {child,input,output,report:child.status===0?JSON.parse(await fs.readFile(output,'utf8')):null};}
test('follows a salted unit into the corpse table after it disappears from the active actor list',()=>fixture(async root=>{
 const live=unit(),dead=unit({health:-.31,damageFlags:12,parentId:none,seat:65535,position:[94,-153,.1]});
 const result=await analyze(root,[frame(1,[live],[object(live)]),frame(2,[],[object(dead)]),frame(3,[],[]),frame(4,[],[]),frame(5,[],[])]);
 assert.equal(result.child.status,0,result.child.stderr);const actor=result.report.trials[0].actors[0];assert.equal(actor.nativeDeadFlagObserved,true);assert.equal(actor.minimumHealth,-.31);assert.equal(actor.liveUnparentedSamples,0);assert.equal(actor.corpseUnparentedSamples,1);assert.equal(actor.absentFromFinalCompleteSnapshots,true);assert.equal(result.report.lifecycleAccepted,false);
}));
test('a reused object slot with a different salt does not establish death or cleanup for the old unit',()=>fixture(async root=>{
 const live=unit(),other=unit({id:id+0x10000,health:-1,damageFlags:12,parentId:none,seat:65535});
 const frames=[frame(1,[live],[object(live)]),frame(2,[],[object(live),object(other)]),frame(3,[],[object(live)]),frame(4,[],[object(live)])];
 const {child,report}=await analyze(root,frames);assert.equal(child.status,0,child.stderr);const actor=report.trials[0].actors[0];assert.equal(actor.nativeDeadFlagObserved,false);assert.equal(actor.absentFromFinalCompleteSnapshots,false);assert.equal(actor.minimumHealth,1);
}));
test('live ejection, nonlethal damage and advancing animation frames stay separate from corpse detachment',()=>fixture(async root=>{
 const seated=unit(),released=unit({parentId:none,seat:65535,position:[94,-153,.4]}),hurt=unit({...released,position:[95,-153,.4],health:.8}),last=object(hurt);last.unit.animationFrame=3;
 const {child,report}=await analyze(root,[frame(1,[seated],[object(seated)]),frame(2,[released],[object(released)]),frame(3,[hurt],[last])]);assert.equal(child.status,0,child.stderr);const actor=report.trials[0].actors[0];assert.equal(actor.liveUnparentedSamples,2);assert.equal(actor.nonlethalHealthReductionObserved,true);assert.equal(actor.animationFrameProgressObserved,true);assert.deepEqual(actor.liveUnparentedPositionBounds,[[94,95],[-153,-153],[.4,.4]]);assert.equal(actor.nativeDeadFlagObserved,false);
}));
test('requires a complete observer run and never overwrites existing evidence',()=>fixture(async root=>{
 const first=await analyze(root,[frame(1,[],[])],identity,false);assert.notEqual(first.child.status,0);await assert.rejects(fs.stat(first.output),{code:'ENOENT'});await fs.writeFile(first.output,'previous accepted evidence');const child=spawnSync(process.execPath,[script,first.output,first.input],{windowsHide:true,encoding:'utf8'});assert.notEqual(child.status,0);assert.equal(await fs.readFile(first.output,'utf8'),'previous accepted evidence');
}));
test('refuses to interpret another executable or symbol layout as build-335 damage flags',()=>fixture(async root=>{
 const {child,output}=await analyze(root,[frame(1,[],[])],{...identity,exeSha256:'0'.repeat(64)});assert.notEqual(child.status,0);assert.match(child.stderr,/Unsupported native unit flag schema/);await assert.rejects(fs.stat(output),{code:'ENOENT'});
}));
