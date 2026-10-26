import assert from 'node:assert/strict';
import {makeFiveModeTestPlan} from '../src/haloModeTestPlan.ts';
const doc={name:'Guilty Spark Test Arena',template:'guiltySparkTestArena',runtimeId:'haloCustomEdition',gameMode:'slayer',
 objectives:[{id:'ball',name:'Ball',kind:'oddball',team:0,sequence:0,position:[0,0,0],facing:0}],
 spawns:[{id:'red',name:'red',position:[-8,0,0],team:0,gameModes:['allGames']},
   {id:'blue',name:'blue',position:[8,0,0],team:1,gameModes:['allGames']}],
};
const plan=makeFiveModeTestPlan(doc);
assert.equal(plan.modes.length,5);
assert.deepEqual(plan.modes.map(m=>m.mode),['slayer','ctf','oddball','king','race']);
assert.equal(plan.modes.flatMap(m=>m.tests).length,20);
assert.equal(plan.modes.flatMap(m=>m.tests).every(t=>t.status==='not-run'&&t.evidence===null),true);
assert.equal(plan.sourceOnly,true);
assert.equal(plan.compiledHaloMap,false);
assert.equal(plan.gameplayVerified,false);
assert.equal(plan.multiplayerVerified,false);
assert.equal(plan.modes[0].sourceChecks,'marker-checks-passed');
assert.equal(plan.modes.find(m=>m.mode==='ctf').sourceChecks,'needs-review');
assert.equal(plan.modes.find(m=>m.mode==='king').sourceChecks,'needs-review');
assert.equal(plan.modes.find(m=>m.mode==='oddball').sourceChecks,'marker-checks-passed');
assert(plan.modes.every(m=>m.tests.some(t=>t.stage==='tool')&&m.tests.some(t=>t.stage==='network')));
const frozen=JSON.stringify(doc);makeFiveModeTestPlan(doc);assert.equal(JSON.stringify(doc),frozen);
assert.throws(()=>makeFiveModeTestPlan({...doc,objectives:Array(201).fill(doc.objectives[0])}),/oversized/);
assert.throws(()=>makeFiveModeTestPlan({...doc,name:'x'.repeat(101)}),/invalid/);
console.log('PASS: five-mode plan is deterministic, source-only and every runtime/network check requires real owner evidence');
const {seedFiveModePlaytests}=await import('../src/haloModeTestPlan.ts');
let counter=0;const ids=()=>`seed-${counter++}`;
const first=seedFiveModePlaytests([],plan,'Halo Custom Edition',ids);
assert.equal(first.length,20);
assert(first.every(x=>x.verdict==='notRun'&&x.evidence===''&&x.manuallyReported===true));
const edited={...first[0],verdict:'pass',evidence:'owner proof',performedAt:'2026-10-26T17:00:00Z'};
const second=seedFiveModePlaytests([edited,...first.slice(1)],plan,'Halo Custom Edition',ids);
assert.equal(second.length,20);
assert.deepEqual(second[0],edited); // no automatic overwrite of human evidence
const partial=seedFiveModePlaytests([edited],plan,'Halo Custom Edition',ids);
assert.equal(partial.length,20);
assert.deepEqual(partial[0],edited);
assert.throws(()=>seedFiveModePlaytests([],plan,'Halo',()=> 'duplicate'),/unique/);
console.log('PASS: Playtest Lab seeding is idempotent, never overwrites manual evidence and never pre-marks tests passed');
