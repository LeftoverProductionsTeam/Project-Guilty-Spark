import assert from 'node:assert/strict';
import {auditClassicNetgame,makeTeleporterPair,nextFreeTeleportChannel,teleporterLinks,raceCoursePoints} from '../src/haloGametypeScenario.ts';
const src=()=>({gameMode:'race',objectives:[],spawns:[{id:'s',team:0,position:[0,0,0],gameModes:['allGames']},{id:'t',team:1,position:[5,5,0],gameModes:['allGames']}]});
const ids=(()=>{let n=0;return()=>`tp-${n++}`;})();
const pair=makeTeleporterPair([0,0,0],[7,3,0],0,ids);
assert.equal(pair.length,2);assert.equal(pair[0].kind,'teleportFrom');assert.equal(pair[1].kind,'teleportTo');
assert.equal(nextFreeTeleportChannel({...src(),objectives:pair}),1);
const ctf={...src(),gameMode:'ctf',objectives:[{id:'red',kind:'ctfFlag',position:[-8,0,0],team:0,sequence:0,facing:0},
 {id:'blue',kind:'ctfFlag',position:[8,0,0],team:1,sequence:0,facing:0}],spawns:[{id:'a',position:[-6,0,0],team:0,gameModes:['allGames']},
 {id:'b',position:[-5,0,0],team:0,gameModes:['allGames']}]};
const {classicModeChecklist,nextFreeRaceCheckpointId}=await import('../src/haloGametypeScenario.ts');
assert.equal(nextFreeRaceCheckpointId({objectives:[{id:'r0',kind:'raceCheckpoint',sequence:0},{id:'r2',kind:'raceCheckpoint',sequence:2}]}),1);
assert.equal(nextFreeRaceCheckpointId({objectives:Array.from({length:32},(_,i)=>({kind:'raceCheckpoint',sequence:i}))}),null);
assert(!classicModeChecklist(ctf).find(x=>x.mode==='ctf').ready);
ctf.spawns.push({id:'c',position:[6,0,0],team:1,gameModes:['allGames']});
assert(classicModeChecklist(ctf).find(x=>x.mode==='ctf').ready);
assert.equal(teleporterLinks(pair)[0].channel,0);
assert(!auditClassicNetgame({...src(),objectives:pair}).some(i=>i.code==='CE_TELEPORT_CHANNEL_UNPAIRED'));
assert(auditClassicNetgame({...src(),objectives:pair.slice(0,1)}).some(i=>i.code==='CE_TELEPORT_CHANNEL_UNPAIRED'&&i.severity==='error'));
assert.throws(()=>makeTeleporterPair([0,0,0],[0.1,0.2,0],1),/away/);
assert.throws(()=>makeTeleporterPair([0,0,0],[1,0,0],16),/channel/);
const raceVehicles=Array.from({length:17},(_,i)=>({id:`v-${i}`,name:'vehicle',kind:'raceVehicle',team:0,sequence:0,facing:0,position:[i,0,0]}));
assert(auditClassicNetgame({...src(),objectives:raceVehicles}).some(i=>i.code==='CE_RACE_VEHICLE_LIMIT'&&i.severity==='error'));
const checkpoints=[{id:'c2',kind:'raceCheckpoint',team:-1,sequence:2,position:[2,0,0]},
 {id:'c0',kind:'raceCheckpoint',team:-1,sequence:0,position:[0,0,0]},
 {id:'c1',kind:'raceCheckpoint',team:-1,sequence:1,position:[1,0,0]}];
assert.deepEqual(raceCoursePoints(checkpoints),[[0,0,0],[1,0,0],[2,0,0]]);
assert.deepEqual(raceCoursePoints(checkpoints.filter(o=>o.sequence!==1)),[]);
assert(auditClassicNetgame({...src(),objectives:pair.concat([{...pair[1],id:'exit2',position:[15,0,0]}])}).some(i=>i.code==='CE_TELEPORT_MULTIPLE_EXITS'));
assert.deepEqual(teleporterLinks([{...pair[0],position:[0,0,0]},{...pair[1],position:[1,0,0]}]),[{channel:0,start:[0,0,0],end:[1,0,0]}]);
console.log('PASS: Halo CE race vehicles, teleporter channel pairing, bounded live-route visualization, malformed input rejection');
