import assert from 'node:assert/strict';
import {packageHaloCeSession} from '../src/multiplayerPackage.ts';
import {emptyCreatorStudio,validateCreatorStudio,exportHaloCeServerInit} from '../src/creatorStudio.ts';
import {HALO_CE_STOCK_VARIANTS,defaultGameTypeDesign,installedHaloCeMaps,stockVariant,analyzeHaloCeSession,exportSessionHandoff,gameTypeValidation} from '../src/multiplayerSetup.ts';
const hash='c'.repeat(64);
const inventory={runtimeId:'haloCustomEdition',registrationId:'test',maps:[
  {relativePath:'maps/bloodgulch.map',valid:true,scenarioType:1,cacheVersion:609,sha256:hash},
  {relativePath:'maps/wrong_version.map',valid:true,scenarioType:1,cacheVersion:7,sha256:hash},
  {relativePath:'maps/a10.map',valid:true,scenarioType:0,cacheVersion:609,sha256:hash},
  {relativePath:'maps/ui.map',valid:true,scenarioType:2,cacheVersion:609,sha256:hash},
  {relativePath:'maps/evil;sv_public 1.map',valid:true,scenarioType:1,cacheVersion:609,sha256:hash},
  {relativePath:'maps/corrupt.map',valid:false,scenarioType:1,cacheVersion:609,sha256:hash},
  {relativePath:'maps/no-hash.map',valid:true,scenarioType:1,cacheVersion:609,sha256:null},
  {relativePath:'maps/levels/hidden.map',valid:true,scenarioType:1,cacheVersion:609,sha256:hash},
],resources:[],diagnostics:[]};
assert.deepEqual(installedHaloCeMaps(inventory).map(m=>m.map),['bloodgulch']);
assert.deepEqual(installedHaloCeMaps({...inventory,runtimeId:'mccSteam'}),[]);
assert(stockVariant('Slayer') && stockVariant('classic_rockets'));
assert(!stockVariant('Zombie Apocalypse'));
const studio=emptyCreatorStudio();
assert.deepEqual(validateCreatorStudio(studio),[]);
studio.server.rotation.push({id:'rot',map:'bloodgulch',gameVariant:'slayer'});
const valid=analyzeHaloCeSession(studio.server,inventory);
assert.equal(valid.readyForManualLocalTest,true);
assert.equal(valid.verifiedMaps[0].sha256,hash);
assert.match(exportHaloCeServerInit(studio),/sv_public 0/);
assert.match(exportHaloCeServerInit(studio),/sv_mapcycle_add bloodgulch slayer/);
const zip=packageHaloCeSession(studio,inventory);assert.equal(new DataView(zip.buffer).getUint32(0,true),0x04034b50);
assert.throws(()=>packageHaloCeSession(studio,null),/preflight blockers/);
assert.equal(analyzeHaloCeSession(studio.server,null).readyForManualLocalTest,false);
assert.equal(analyzeHaloCeSession({...studio.server,maxPlayers:99},inventory).readyForManualLocalTest,false);
assert.equal(analyzeHaloCeSession({...studio.server,name:'Bad\nsv_public 1'},inventory).readyForManualLocalTest,false);
assert.equal(analyzeHaloCeSession({...studio.server,rotation:[{...studio.server.rotation[0]},{...studio.server.rotation[0]}]},inventory).readyForManualLocalTest,false);
assert.deepEqual(installedHaloCeMaps({...inventory,maps:[null,{relativePath:null}]}),[]);
studio.server.rotation[0].map='wrong_version';
assert(analyzeHaloCeSession(studio.server,inventory).findings.some(f=>f.code==='INCOMPATIBLE_CE_CACHE'));
studio.server.rotation[0].map='bloodgulch';
assert.equal(analyzeHaloCeSession(studio.server,{...inventory,runtimeId:'mccSteam'}).readyForManualLocalTest,false);
studio.server.rotation[0].gameVariant='Zombie Apocalypse';
assert.equal(analyzeHaloCeSession(studio.server,inventory).readyForManualLocalTest,false);
assert.throws(()=>exportHaloCeServerInit(studio),/not ready/);
const game=defaultGameTypeDesign('gt1','Zombie Apocalypse');
assert.equal(game.nativeStatus,'draft');
assert.equal(gameTypeValidation([game]).length,0);
studio.server.gameTypes=[game];
assert.equal(analyzeHaloCeSession(studio.server,inventory).readyForManualLocalTest,false);
game.nativeStatus='userConfirmedInGame';game.nativeEvidence='C:\\Users\\Pat\\Private local save';
assert.equal(analyzeHaloCeSession(studio.server,inventory).readyForManualLocalTest,true);
assert.match(exportHaloCeServerInit(studio),/"Zombie Apocalypse"/);
game.specialRules='infectionConcept';
assert.equal(analyzeHaloCeSession(studio.server,inventory).readyForManualLocalTest,false);
assert.throws(()=>exportHaloCeServerInit(studio),/not ready/);
game.specialRules='standard';
assert.deepEqual(validateCreatorStudio(studio),[]);
const handoff=JSON.parse(exportSessionHandoff(studio,inventory));
assert.equal(handoff.serverStarted,false);assert.equal(handoff.nativeGameTypeFilesWritten,false);
assert.equal(handoff.verifiedMaps.length,1);assert.equal(handoff.status,'READY_FOR_MANUAL_CHECK');
assert.equal(handoff.server.rotation[0].map,'bloodgulch');
assert(!JSON.stringify(handoff).includes('C:\\Users'));
const badVariants=[
  {...game,id:'gt2',name:'Zombie Apocalypse'},
  {...game,id:'gt2',name:'Bad\nsv_public 1'},
  {...game,id:'gt2',name:'Good',scoreLimit:9999},
  {...game,id:'gt2',name:'Good',nativeStatus:'userConfirmedInGame',nativeEvidence:''},
];
for(const bad of badVariants)assert(gameTypeValidation([game,bad]).length>0);
studio.server.rotation[0].gameVariant='slayer\r\nsv_public 1';
assert(validateCreatorStudio(studio).length>0);
assert.throws(()=>exportHaloCeServerInit(studio));
assert.equal(HALO_CE_STOCK_VARIANTS.length>=10,true);
console.log('PASS: CE session preflight, real cache proofs, custom variant readiness, script-injection guards, and no native/network writes');
