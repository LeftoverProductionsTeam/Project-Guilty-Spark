import assert from 'node:assert/strict';
import {auditMultiplayerSpawns} from '../src/multiplayerSpawnAudit.ts';
const start=(id,team,point,gameModes=['allGames'])=>({id,team,position:point,gameModes});
const flag=(id,team,y)=>({id,team,kind:'ctfFlag',position:[0,y,0],sequence:0});
const base={name:'source-only test',template:'guiltySparkTestArena',
  spawns:[...Array.from({length:16},(_,i)=>start(`r${i}`,0,[-9+(i%4)*6,-12+Math.floor(i/4)*3,0.1])),
          ...Array.from({length:16},(_,i)=>start(`b${i}`,1,[-9+(i%4)*6,3+Math.floor(i/4)*3,0.1]))],
  objectives:[flag('red',0,-10.5),flag('blue',1,10.5)]};
const clean=auditMultiplayerSpawns(base);
assert.equal(clean.ctfTeamEligible.red,16);
assert.equal(clean.ctfTeamEligible.blue,16);
assert.equal(clean.totalFindings,0,JSON.stringify(clean.findings));
assert(Object.values(clean.modeCoverage).every(v=>v===32));
assert.equal(clean.engineVerified,false);
assert.equal(clean.mapCompiled,false);
assert(!JSON.stringify(clean).includes('position'), 'Report must not expose source coordinates');
const short=auditMultiplayerSpawns({...base,spawns:base.spawns.slice(0,4)});
assert(short.findings.some(f=>f.code==='CTF_TEAM_EMPTY'&&f.severity==='blocker'));
assert(short.findings.some(f=>f.code==='CTF_TEAM_SPAWN_RECOMMENDATION'));
const wrong={...base,spawns:base.spawns.map(s=>s.id==='r0'?{...s,position:[0,12,0.1]}:s)};
assert(auditMultiplayerSpawns(wrong).findings.some(f=>f.code==='CTF_START_ENEMY_SIDE'));
const crowded={...base,spawns:[{...base.spawns[0]},{...base.spawns[1],position:base.spawns[0].position}]};
assert(auditMultiplayerSpawns(crowded).findings.some(f=>f.code==='NEAR_DUPLICATE_STARTS'));
assert.throws(()=>auditMultiplayerSpawns({...base,spawns:[...base.spawns,base.spawns[0]]}),/unique/);
assert.throws(()=>auditMultiplayerSpawns({...base,spawns:[{...base.spawns[0],position:[Infinity,0,0]}]}),/malformed/);
assert.throws(()=>auditMultiplayerSpawns({...base,spawns:Array.from({length:257},(_,i)=>start(`x${i}`,0,[i,0,0]))}),/oversized/);
assert.equal(auditMultiplayerSpawns({...base,spawns:[]}).modeCoverage.race,0);
assert.throws(()=>auditMultiplayerSpawns({...base,objectives:[null]}),/malformed/);
assert.throws(()=>auditMultiplayerSpawns({...base,spawns:[{...base.spawns[0],team:99}]}),/malformed/);
console.log('PASS: source-only Halo multiplayer spawn audit, team counts, CTF positioning, crowding, bounds and privacy');
