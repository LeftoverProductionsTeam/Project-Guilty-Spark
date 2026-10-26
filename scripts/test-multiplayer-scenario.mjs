import assert from 'node:assert/strict';
import {previewMultiplayerScenarioRequirements} from '../src/multiplayerScenario.ts';
import {emptyCreatorStudio} from '../src/creatorStudio.ts';
const config=emptyCreatorStudio().server;
const doc={runtimeId:'haloCustomEdition',geometry:[],materials:[],placements:[],spawns:[],objectives:[]};
assert.deepEqual(previewMultiplayerScenarioRequirements(null,config),[]);
config.rotation=[{id:'1',map:'bloodgulch',gameVariant:'ctf'},{id:'2',map:'bloodgulch',gameVariant:'race'}];
let warnings=previewMultiplayerScenarioRequirements(doc,config);
assert(warnings.some(w=>w.code==='CTF_FLAGS_INCOMPLETE'));
assert(warnings.some(w=>w.code==='RACE_CHECKPOINTS_MISSING'));
assert(warnings.some(w=>w.code==='FEW_PLAYER_STARTS'));
let fixed={...doc,spawns:[{visible:true,gameModes:['ctf','race']},{visible:true,gameModes:['ctf','race']}],
  objectives:[{visible:true,kind:'ctfFlag',team:0},{visible:true,kind:'ctfFlag',team:1},
    {visible:true,kind:'raceCheckpoint',sequence:1},{visible:true,kind:'raceCheckpoint',sequence:2}]};
warnings=previewMultiplayerScenarioRequirements(fixed,config);
assert(!warnings.some(w=>w.code==='CTF_FLAGS_INCOMPLETE'||w.code==='RACE_CHECKPOINTS_MISSING'));
warnings=previewMultiplayerScenarioRequirements({...fixed,runtimeId:'mccSteam'},config);
assert(warnings.some(w=>w.code==='SOURCE_RUNTIME_MISMATCH'));
console.log('PASS: source-only objective prerequisites for CTF/race, spawn and runtime warnings without compiled-game claims');
