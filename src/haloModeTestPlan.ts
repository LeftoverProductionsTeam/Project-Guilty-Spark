/** Halo CE five-mode OWNER test plan generated from an editable scenario.
 * The source marker matrix is not a compiler result, game-launch proof,
 * or multiplayer simulation. Every real-game case starts as NOT RUN.
 * Test reports contain no original tag paths, cache content or credentials.
 */
import type {QuickForgeDocument} from './forge';
import {auditClassicNetgame,classicModeChecklist} from './haloGametypeScenario.ts';
import type {ClassicGameMode} from './haloGametypeScenario.ts';
export type ModeProofStage='scenario'|'tool'|'game'|'network';
export interface ModeTestCase {id:string;stage:ModeProofStage;description:string;status:'not-run';evidence:null;}
export interface HaloModeTestGroup {
  mode:ClassicGameMode; label:string;
  sourceChecks:'needs-review'|'marker-checks-passed';
  eligibleStarts:number;sourceNotes:string[];tests:ModeTestCase[];
}
export interface HaloModeTestPlan {
  schema:'guiltyspark-halo1-five-mode-test-plan/v1';
  scope:'scenario-source-and-manual-qa-plan';
  name:string; template:string; targetRuntimeProfile:string;
  fingerprint:{kind:'not-hashed'; note:string};
  severeNetgameCodes:string[];
  sourceOnly:true;compiledHaloMap:false;gameplayVerified:false;multiplayerVerified:false;
  modes:HaloModeTestGroup[];
  instructions:string;
}
const TESTS:Record<ClassicGameMode,{stage:ModeProofStage;description:string}[]>= {
  slayer:[
    {stage:'scenario',description:'Review real player starts and safe clearances in Sapien.'},
    {stage:'tool',description:'Build an isolated scenario for the chosen editing kit and record output digest.'},
    {stage:'game',description:'Load the compiled map; verify spawns, weapons, collision and a complete Slayer match.'},
    {stage:'network',description:'Have a second client join the same verified map revision and finish a match.'},
  ],
  ctf:[
    {stage:'scenario',description:'Inspect red and blue flags and every spawn near the appropriate flag; watch for disabled teams.'},
    {stage:'tool',description:'Build and verify the exact compiled map after flag and player-start changes.'},
    {stage:'game',description:'Capture, return and score flags for both teams; verify neither is stuck waiting to spawn.'},
    {stage:'network',description:'Test two real clients on different teams with CTF scoring and respawns.'},
  ],
  oddball:[
    {stage:'scenario',description:'Verify Oddball markers start with usage 0 and indices are consecutive.'},
    {stage:'tool',description:'Rebuild and record the compiled map identity after any ball-marker edit.'},
    {stage:'game',description:'Find the ball, pick it up, score, drop and respawn it without missing item dependencies.'},
    {stage:'network',description:'Have two clients exchange the ball and check authoritative scoring.'},
  ],
  king:[
    {stage:'scenario',description:'Verify hill 0 and at least one other moving hill; never use a two-point boundary.'},
    {stage:'tool',description:'Compile netgame flag geometry using the correct native Halo 1 editing kit.'},
    {stage:'game',description:'Confirm a hill scores at the expected footprint and moving-hill changes occur without a crash.'},
    {stage:'network',description:'Confirm both clients agree on hill ownership and scoring across a hill change.'},
  ],
  race:[
    {stage:'scenario',description:'Inspect race checkpoints 0..N and any optional race-vehicle markers and drivable clearance.'},
    {stage:'tool',description:'Compile and verify the race checkpoint order in the final scenario.'},
    {stage:'game',description:'Finish a complete Race and Rally variant with every checkpoint, spawn and lap update.'},
    {stage:'network',description:'Confirm two clients follow the same checkpoint sequence and finish rankings.'},
  ],
};
const CASE_IDS:Record<ClassicGameMode,string>={slayer:'SLAYER',ctf:'CTF',oddball:'ODDBALL',king:'KING',race:'RACE'};
export function makeFiveModeTestPlan(doc:Pick<QuickForgeDocument,'name'|'template'|'runtimeId'|'objectives'|'spawns'|'gameMode'>):HaloModeTestPlan {
  if(!doc||!Array.isArray(doc.objectives)||doc.objectives.length>200 ||
     !Array.isArray(doc.spawns)||doc.spawns.length>256 ||
     typeof doc.name!=='string'||doc.name.length>100 ||
     typeof doc.template!=='string'||doc.template.length>64 ||
     typeof doc.runtimeId!=='string'||doc.runtimeId.length>64)
    throw new Error('Cannot create an owner test plan from an invalid/oversized scenario source');
  const modeMatrix=classicModeChecklist(doc);
  const findings=auditClassicNetgame(doc);
  const severeNetgameCodes=[...new Set(findings.filter(f=>f.severity==='error').map(f=>f.code))].sort();
  return {schema:'guiltyspark-halo1-five-mode-test-plan/v1',scope:'scenario-source-and-manual-qa-plan',
    name:doc.name,template:doc.template,targetRuntimeProfile:doc.runtimeId,
    fingerprint:{kind:'not-hashed',note:'This plan is not cryptographically pinned to a saved project. Attach an independently verified build receipt and cache SHA-256 to all gameplay evidence.'},
    severeNetgameCodes,sourceOnly:true,compiledHaloMap:false,gameplayVerified:false,multiplayerVerified:false,
    modes:modeMatrix.map(entry=>({mode:entry.mode,label:entry.label,
      sourceChecks:entry.ready?'marker-checks-passed':'needs-review',eligibleStarts:entry.count,
      sourceNotes:entry.notes.slice(0,16),
      tests:TESTS[entry.mode].map(({stage,description},i)=>({id:`H1-${CASE_IDS[entry.mode]}-${i+1}`,stage,description,status:'not-run',evidence:null})),
    })),
    instructions:'Use Creator Studio > Playtest lab to record real results. Do not mark PASS until a real compiled map and target runtime have been tested with evidence. Never install over stock Halo files or run public matchmaking with unverified mods.',
  };
}

import type {PlaytestRecord} from './creatorStudio';
/** Add only missing manual-case records. Never override evidence or outcomes.
 * A generated record is an untested *assignment*, not a pass/fail verdict.
 */
export function seedFiveModePlaytests(existing:readonly PlaytestRecord[], plan:HaloModeTestPlan,
  targetLabel:string, nextId:()=>string):PlaytestRecord[] {
  if(!Array.isArray(existing)||existing.length>500 || plan.schema!=='guiltyspark-halo1-five-mode-test-plan/v1' ||
     typeof targetLabel!=='string'||targetLabel.length<1||targetLabel.length>120)
    throw new Error('Invalid Playtest Lab seed request');
  const ids=new Set(existing.map(record=>record.id));
  const known=new Set(existing.map(record=>record.caseId));
  const additions:PlaytestRecord[]=[];
  for(const group of plan.modes){
    for(const test of group.tests){
      if(known.has(test.id))continue;
      if(existing.length+additions.length>=500)throw new Error('Playtest Lab maximum of 500 records reached');
      const id=nextId();
      if(typeof id!=='string'||! /^[A-Za-z0-9_-]{1,72}$/.test(id)||ids.has(id))
        throw new Error('New playtest ID must be unique and bounded');
      ids.add(id);known.add(test.id);
      additions.push({id,caseId:test.id,target:targetLabel,verdict:'notRun',performedAt:'',evidence:'',
        notes:`${test.description} Source status: ${group.sourceChecks}. Record actual runtime build, result, reproduction and rollback.`,
        manuallyReported:true});
    }
  }
  return [...existing,...additions];
}
