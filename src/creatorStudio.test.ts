import type {NativeTagContext} from './nativeOperations';
import {inspectScenarioBindings} from './scenarioBindings';
import {historyReducer,initialHistory} from './editor';
import type {Project} from './types';
import {applyNativeCampaignMission,attachNativeCampaignMission,reviewNativeCampaignMission,sameMissionData,exportHaloCeMission,nativeMissionBinding} from './haloScript';
import {defaultNativePlayerProfile} from './firefight';
import { describe, expect, it } from 'vitest';
import { connectBlackEchoObjectives, addBlackEchoDraft, blackEchoMission, emptyCreatorStudio, exportHaloCeServerInit, exportStudioEvidence, validateCreatorStudio, missionSoundProblems, missionCinematicShots, missionCameraUsers } from './creatorStudio';

describe('Project-integrated Creator Studio', () => {
  it('starts private without fabricated gameplay evidence', () => {
    const doc = emptyCreatorStudio();
    expect(validateCreatorStudio(doc)).toEqual([]);
    expect(doc.server.publicListing).toBe(false);
    expect(doc.playtests).toEqual([]);
  });
  it('builds safe, reviewable CE-only map rotation and not a live server', () => {
    const doc = emptyCreatorStudio();
    doc.server.rotation.push({ id: 'r1', map: 'bloodgulch', gameVariant: 'slayer' });
    const text = exportHaloCeServerInit(doc);
    expect(text).toContain('sv_public 0');
    expect(text).toContain('sv_mapcycle_add bloodgulch slayer');
    expect(text).not.toContain('sv_rcon_password');
    doc.server.rotation[0].gameVariant = 'Team Slayer';
    expect(exportHaloCeServerInit(doc)).toContain('sv_mapcycle_add bloodgulch "Team Slayer"');
    doc.server.runtime = 'mcc';
    expect(() => exportHaloCeServerInit(doc)).toThrow(/no verified/);
  });
  it('refuses control-character and newline command injection', () => {
    const doc = emptyCreatorStudio();
    doc.server.rotation.push({ id: 'r1', map: 'bloodgulch\nsv_public 1', gameVariant: 'slayer' });
    expect(validateCreatorStudio(doc).length).toBeGreaterThan(0);
    expect(() => exportHaloCeServerInit(doc)).toThrow(/Unsafe/);
    doc.server.rotation[0].map = 'bloodgulch';
    doc.server.name = 'LAN"\nsv_public 1';
    expect(() => exportHaloCeServerInit(doc)).toThrow(/Unsafe/);
  });
  it('refuses PASS without manually reported evidence', () => {
    const doc = emptyCreatorStudio();
    doc.playtests.push({id: 'test1', caseId: 'NET-001', target:'Halo CE', verdict:'pass', performedAt:'', evidence:'', notes:'', manuallyReported:true});
    expect(validateCreatorStudio(doc)).not.toEqual([]);
    doc.playtests[0].evidence = 'Observed 2-client session, recording #abc';
    expect(validateCreatorStudio(doc)).toEqual([]);
    const report = JSON.parse(exportStudioEvidence(doc,{id:'one',title:'Test',source:null},'2026-10-25T00:00:00Z'));
    expect(report.liveGameVerifiedAutomatically).toBe(false);
    expect(report.server.status).toBe('draftNotDeployed');
  });
  it('rejects out-of-range camera coordinates and duplicate IDs', () => {
    const doc = emptyCreatorStudio();
    doc.shots.push({id:'a',name:'intro',durationMs:4000,cameraPosition:[1,2,10000],lookAt:[0,0,0],fov:60,subtitle:''});
    expect(validateCreatorStudio(doc).length).toBeGreaterThan(0);
    doc.shots[0].cameraPosition = [1,2,3];
    doc.missions.push({id:'a',title:'Start',objective:'Go',trigger:'manual',encounterName:''});
    expect(validateCreatorStudio(doc).length).toBeGreaterThan(0);
  });
  it('accepts the native optional camera-marker null on save/reopen',()=>{const doc=emptyCreatorStudio();doc.shots.push({id:'native',name:'Shot',durationMs:3000,cameraPosition:[1,2,3],lookAt:[0,0,0],fov:60,subtitle:'',cameraMarker:null});expect(validateCreatorStudio(doc)).toEqual([]);});
});


it('retains the Black Echo objective bindings through saved-data serialization without a timer or forced level exit',()=>{
 let index=0;const studio=emptyCreatorStudio();studio.missions=blackEchoMission(()=>`echo_${++index}`);
 expect(validateCreatorStudio(studio)).toEqual([]);
 const restored=JSON.parse(JSON.stringify(studio));expect(validateCreatorStudio(restored)).toEqual([]);
 expect(restored.missions).toEqual(studio.missions);
 expect(studio.missions.some(beat=>beat.trigger==='timer'||beat.completeMission)).toBe(false);
 expect(studio.missions[1]).toMatchObject({trigger:'escort',encounterName:'be_marines',triggerRef:'be_survivors',minimumSurvivors:1});expect(studio.missions[3]).toMatchObject({trigger:'manual',triggerRef:'be_artifact'});expect(studio.missions[6].trigger).toBe('manual');
 expect(studio.missions[4]).toMatchObject({conditionVolume:'be_containment',encounterName:'be_flood',trigger:'encounterCleared'});
 restored.missions[4].conditionVolume='unsafe volume';expect(validateCreatorStudio(restored)).not.toEqual([]);
});

function campaignDraft():Project {
 return {id:'owned_campaign',title:'Owned campaign',studio:emptyCreatorStudio(),quickForge:{schemaVersion:1,gameMode:'campaign',runtimeId:'haloCustomEdition',native:null,
   startingProfile:defaultNativePlayerProfile(),spawns:[{position:[2,3,.1]}],geometry:{preserve:'authored geometry'},placements:[],campaignEncounters:[],
   logic:{schemaVersion:1,triggers:[],devices:[],rules:[],handwrittenSources:[{filename:'owned.hsc',content:'; preserve authored radio source'}]}}} as unknown as Project;
}
it('creates one additive operation draft with real named areas, preserving existing source and area ownership',async()=>{
 const project=campaignDraft();project.quickForge!.logic!.triggers.push({id:'existing',nativeName:'be_insert',name:'My insertion',position:[-5,0,2],rotation:[0,0,0],dimensions:[2,2,3],visible:true,locked:true});
 const before=JSON.stringify(project);let count=0;const next=addBlackEchoDraft(project,()=>`beat_${++count}`);
 expect(JSON.stringify(project)).toBe(before);expect(next.quickForge!.logic!.triggers).toHaveLength(5);
 expect(next.quickForge!.logic!.triggers[0]).toEqual(project.quickForge!.logic!.triggers[0]);
 expect(next.quickForge!.geometry).toEqual(project.quickForge!.geometry);expect(next.quickForge!.logic!.handwrittenSources).toEqual(project.quickForge!.logic!.handwrittenSources);
 expect(next.studio!.missions).toHaveLength(7);expect(validateCreatorStudio(next.studio!)).toEqual([]);
 expect(()=>addBlackEchoDraft(next,()=> 'collision')).toThrow(/current operation/);
 await expect(attachNativeCampaignMission(next,'manual')).rejects.toThrow(/be_marines/);
 next.quickForge!.campaignEncounters=['be_marines','be_covenant','be_flood','be_defense'].map((name,index)=>({id:'group_'+index,name,actorPath:'characters/grunt/grunt minor plasma pistol',position:[0,0,0],count:1,spacing:1,startActive:false}));
 const prepared=await attachNativeCampaignMission(next,'manual');expect(prepared.quickForge!.logic!.handwrittenSources!.some(source=>source.filename==='gs_mission.hsc')).toBe(true);
 expect((await reviewNativeCampaignMission(prepared)).binding.missions[4].conditionVolume).toBe('be_containment');
 expect(sameMissionData(next.studio!.missions,JSON.parse(JSON.stringify(next.studio!.missions)))).toBe(true);
 const broken=structuredClone(next);broken.quickForge!.logic!.triggers=broken.quickForge!.logic!.triggers.filter(trigger=>trigger.nativeName!=='be_containment');
 await expect(attachNativeCampaignMission(broken,'manual')).rejects.toThrow(/be_containment/);
});
it('refuses original native source and exhausted marker capacity without altering the project',()=>{
 const native=campaignDraft();native.quickForge!.native={} as NonNullable<typeof native.quickForge>['native'];expect(()=>addBlackEchoDraft(native,()=> 'beat')).toThrow(/editable/);
 const full=campaignDraft();full.quickForge!.logic!.triggers=Array.from({length:64},(_,i)=>({id:'area_'+i,name:'Area '+i,position:[0,0,0],rotation:[0,0,0],dimensions:[3,3,3],locked:false,visible:true}));const before=JSON.stringify(full);
 expect(()=>addBlackEchoDraft(full,()=> 'beat')).toThrow(/64-volume/);expect(JSON.stringify(full)).toBe(before);
});

it('keeps native marker bounds and handmade mission sources protected before applying a starter',()=>{
 const edge=campaignDraft();edge.quickForge!.spawns[0].position=[1499,0,0];const before=JSON.stringify(edge);
 expect(()=>addBlackEchoDraft(edge,()=> 'beat')).toThrow(/1500/);expect(JSON.stringify(edge)).toBe(before);
 const authored=campaignDraft();authored.quickForge!.logic!.handwrittenSources!.push({filename:'GS_MISSION.HSC',content:'; authored mission, preserve'});
 const preserved=JSON.stringify(authored);expect(()=>addBlackEchoDraft(authored,()=> 'beat')).toThrow(/reconcile/);expect(JSON.stringify(authored)).toBe(preserved);
});


it('prepares a native radio cue with an exact included closure and preserved caption source',async()=>{
 const project=campaignDraft(),binding={id:'sound_import',nativePath:'gs_assets_source/sound/radio distress',tagClass:'snd!',tagPath:'sound/radio distress'};
 project.nativeAssetImports=[binding as NonNullable<Project['nativeAssetImports']>[number]];
 project.studio!.missions=[{id:'radio',title:'Rescue',objective:'Find survivors',trigger:'manual',encounterName:'',
   soundCue:{importId:binding.id,soundPath:binding.nativePath,phase:'start',gain:.75,delayMs:250,caption:'Marine: We need help.'}}];
 expect(missionSoundProblems(project)).toEqual([]);expect(validateCreatorStudio(project.studio!)).toEqual([]);
 const prepared=await attachNativeCampaignMission(project,'manual'),module=prepared.quickForge!.logic!.handwrittenSources!.find(source=>source.filename==='gs_mission.hsc')!;
 expect(module.content).toContain('(sound_impulse_start "gs_assets_source\\sound\\radio distress" none 0.75)');
 expect(module.content).toContain('(hud_set_help_text gs_mission_cue_1)');
 // Old forward-slash v1 modules remain reviewable; preparation emits native
 // typed references without interpreting arbitrary handwritten source as ours.
 const legacy=structuredClone(prepared),owned=legacy.quickForge!.logic!.handwrittenSources!.find(source=>source.filename==='gs_mission.hsc')!,end=owned.content.indexOf('\n');
 const oldBinding=JSON.parse(owned.content.slice(nativeMissionBinding.length,end)),oldBody=owned.content.slice(end+1).replaceAll('gs_assets_source\\sound\\radio distress','gs_assets_source/sound/radio distress');
 oldBinding.sourceSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(oldBody))),byte=>byte.toString(16).padStart(2,'0')).join('');owned.content=nativeMissionBinding+JSON.stringify(oldBinding)+'\r\n'+oldBody;
 expect((await reviewNativeCampaignMission(legacy)).binding.missions[0].soundCue).toEqual(project.studio!.missions[0].soundCue);const upgraded=await attachNativeCampaignMission(legacy,'manual');expect(upgraded.quickForge!.logic!.handwrittenSources!.find(source=>source.filename==='gs_mission.hsc')!.content).toBe(module.content);
 const restored=JSON.parse(JSON.stringify(prepared));expect((await reviewNativeCampaignMission(restored)).binding.missions[0].soundCue).toEqual(project.studio!.missions[0].soundCue);
 expect(sameMissionData([{...project.studio!.missions[0],soundCue:undefined}],[{...project.studio!.missions[0],soundCue:null}])).toBe(true);
 const lost=structuredClone(project);lost.nativeAssetImports=[];await expect(attachNativeCampaignMission(lost,'manual')).rejects.toThrow(/included native sound/);
 const wrong=structuredClone(project);wrong.nativeAssetImports![0].tagClass='lsnd';expect(missionSoundProblems(wrong)).not.toEqual([]);
 const mismatch=structuredClone(project);mismatch.studio!.missions[0].soundCue!.soundPath='sound/another';expect(missionSoundProblems(mismatch)).not.toEqual([]);
 for(const path of ['../secret','/absolute','sound//radio','sound/./radio','sound/../../other','sound/" ) (ai_erase_all)','sound/é']){
   const draft=structuredClone(project.studio!);draft.missions[0].soundCue!.soundPath=path;expect(validateCreatorStudio(draft)).not.toEqual([]);
 }
 const bad=structuredClone(project.studio!);bad.missions[0].soundCue!.caption='%unsafe';expect(validateCreatorStudio(bad)).not.toEqual([]);
});


it('owns native survivor creation once and rejects impossible population or destination before rebuilding',async()=>{
 const project=campaignDraft();let index=0;const draft=addBlackEchoDraft(project,()=> 'escort_'+(++index));
 draft.quickForge!.campaignEncounters=['be_marines','be_covenant','be_flood','be_defense'].map(name=>({name,actorPath:'characters/marine/marine',position:[0,0,0],startActive:false,count:3,spacing:1,difficulty:{normal:2,insane:3}}));
 draft.studio!.missions[1].minimumSurvivors=2;
 const prepared=await attachNativeCampaignMission(draft,'manual');expect((await reviewNativeCampaignMission(prepared)).binding.missions[1].minimumSurvivors).toBe(2);
 const impossible=structuredClone(draft);impossible.studio!.missions[1].minimumSurvivors=3;await expect(attachNativeCampaignMission(impossible,'manual')).rejects.toThrow(/difficulty population/);
 const absent=structuredClone(draft);absent.studio!.missions[1].triggerRef='missing_rally';await expect(attachNativeCampaignMission(absent,'manual')).rejects.toThrow(/missing_rally/);
 const duplicate=structuredClone(draft);duplicate.studio!.missions.push({...duplicate.studio!.missions[1],id:'another_spawn'});await expect(attachNativeCampaignMission(duplicate,'manual')).rejects.toThrow(/one mission spawn owner/);
 const active=structuredClone(draft);active.quickForge!.campaignEncounters![0].startActive=true;await expect(attachNativeCampaignMission(active,'manual')).rejects.toThrow(/initial actor creation/);
 const before=JSON.stringify(draft);await attachNativeCampaignMission(draft,'manual');expect(JSON.stringify(draft)).toBe(before);
});


it('authors terminal activation through native source bindings and refuses missing, active or incompatible controls',async()=>{
 const project=campaignDraft(),doc=project.quickForge!;project.history=[];
 doc.placements=[{id:'terminal',name:'Communications terminal',tagClass:'ctrl',tagPath:'devices/control',tagId:7,sourceProjectId:'owned',sourceSha256:'a'.repeat(64),position:[2,0,0],rotation:[0,0,0],team:0,respawnSeconds:0,visible:true,locked:false}];
 doc.logic!.devices=[{placementId:'terminal',nativeName:'restore_comms',initialPosition:0,powered:true}];
 project.studio!.missions=[{id:'restore',title:'Restore communications',objective:'Use the terminal',trigger:'deviceActivated',encounterName:'',triggerRef:'restore_comms'}];
 const before=JSON.stringify(project),prepared=await attachNativeCampaignMission(project,'startup');
 expect(JSON.stringify(project)).toBe(before);
 const edited=historyReducer({...initialHistory,current:project},{type:'edit',project:prepared,description:'Prepare terminal objective'});
 const undone=historyReducer(edited,{type:'undo'});expect(undone.current).toEqual(project);
 const redone=historyReducer(undone,{type:'redo'});expect(redone.current!.quickForge).toEqual(prepared.quickForge);expect(redone.current!.studio).toEqual(prepared.studio);
 const reviewed=await reviewNativeCampaignMission(prepared);
 expect(reviewed.binding.missions[0].trigger).toBe('deviceActivated');
 expect(sameMissionData(project.studio!.missions,reviewed.binding.missions)).toBe(true);
 const script=exportHaloCeMission(project.studio!);
 expect(script.dependencies).toEqual(['device_control:restore_comms']);
 expect(script.content).toContain('(sleep_until (< (device_get_position restore_comms) 0.5) 1)');
 expect(script.content).toContain('(sleep_until (>= (device_get_position restore_comms) 0.5) 1)');
 expect(script.content.indexOf('(< (device_get_position')).toBeLessThan(script.content.indexOf('(>= (device_get_position'));
 expect(script.content).not.toContain('device_set_position');expect(script.content).not.toContain('gs_complete_1');
 const saved=JSON.parse(JSON.stringify(prepared));expect((await reviewNativeCampaignMission(saved)).binding.missions).toEqual(project.studio!.missions);
 for(const kind of ['missing','duplicate','machine','unpowered','active','invalid-position'] as const){
  const bad=structuredClone(project),source=bad.quickForge!;
  if(kind==='missing')source.logic!.devices=[];
  if(kind==='duplicate')source.logic!.devices.push({...source.logic!.devices[0]});
  if(kind==='machine')source.placements[0].tagClass='mach';
  if(kind==='unpowered')source.logic!.devices[0].powered=false;
  if(kind==='active')source.logic!.devices[0].initialPosition=0.5;
  if(kind==='invalid-position')source.logic!.devices[0].initialPosition=NaN;
  await expect(attachNativeCampaignMission(bad,'manual')).rejects.toThrow(/native control/);
 }
 const unsafe=structuredClone(project.studio!);unsafe.missions[0].triggerRef='unsafe ) (quit';expect(()=>exportHaloCeMission(unsafe)).toThrow();
});

it('authors stable shared mission paths through history, source review and save without rewriting old modules',async()=>{
 const base=campaignDraft();base.history=[];const a={id:'take',title:'Contain',objective:'Inside route',trigger:'timer' as const,timerSeconds:1,encounterName:'',conditionVolume:'choice',conditionGroup:'choice_decision'},b={...a,id:'avoid',title:'Bypass',conditionOutside:true};
 base.quickForge!.logic!.triggers=[{id:'choice',nativeName:'choice',name:'Choice',position:[0,0,0],rotation:[0,0,0],dimensions:[4,4,4],visible:true,locked:false}];
 const next={...base,studio:{...base.studio!,missions:[a,b]}};let history=historyReducer({...initialHistory,current:base},{type:'edit',project:next,description:'Author alternate mission paths'});
 expect(validateCreatorStudio(next.studio!)).toEqual([]);
 history=historyReducer(history,{type:'undo'});expect(history.current?.studio!.missions).toEqual([]);
 history=historyReducer(history,{type:'redo'});expect(history.current?.studio!.missions).toEqual([a,b]);
 const saved=JSON.parse(JSON.stringify(history.current));const output=exportHaloCeMission(saved.studio).content;
 expect(output).toContain('(sleep_until (> (list_count (players)) 0) 1)');
 expect(output).toContain('(global boolean gs_branch_1_ready false)');expect(output).toContain('(global boolean gs_branch_1_inside false)');
 expect(output.match(/set gs_branch_1_inside /g)).toHaveLength(2); // one guarded sampling site per member; only the first can run.
 expect(output).toContain('(if gs_branch_1_inside (begin');expect(output).toContain('(if (not gs_branch_1_inside) (begin');
 expect(output.split('(if (not gs_branch_1_ready)').length-1).toBe(2);
 const prepared=await attachNativeCampaignMission(saved,'manual');const reviewed=await reviewNativeCampaignMission(prepared);
 expect(sameMissionData(reviewed.binding.missions,[a,b])).toBe(true);expect(reviewed.binding.missions[1].conditionOutside).toBe(true);
 const revised=structuredClone(prepared);revised.studio!.missions=revised.studio!.missions.map(beat=>({...beat,conditionOutside:beat.conditionOutside===true?undefined:true}));
 const rebuilt=await attachNativeCampaignMission(revised,'manual');const revision=await reviewNativeCampaignMission(rebuilt);
 expect(revision.binding.missions[0].conditionOutside).toBe(true);expect(revision.binding.missions[1].conditionOutside).toBeUndefined();
 expect(prepared.quickForge!.logic!.handwrittenSources!.find(source=>source.filename==='gs_mission.hsc')!.content).not.toBe(rebuilt.quickForge!.logic!.handwrittenSources!.find(source=>source.filename==='gs_mission.hsc')!.content);
 const old=campaignDraft();old.quickForge!.logic!.triggers=structuredClone(base.quickForge!.logic!.triggers);old.studio!.missions=[{...a,conditionGroup:undefined}];const original=await attachNativeCampaignMission(old,'manual');
 expect((await reviewNativeCampaignMission(original)).binding.missions[0].conditionGroup).toBeUndefined();
 for(const patch of [{conditionVolume:'other'},{conditionGroup:'unsafe id'},{conditionOutside:'outside'},{conditionVolume:undefined}]) {
  const broken=structuredClone(next);Object.assign(broken.studio!.missions[1],patch);expect(validateCreatorStudio(broken.studio!)).not.toEqual([]);
 }
});

it('routes a continued rescue failure separately from success and refuses dangling outcome references',async()=>{
 const project=campaignDraft();project.history=[];project.quickForge!.logic!.triggers=[{id:'rally',nativeName:'rally',name:'Rescue destination',position:[0,0,0],rotation:[0,0,0],dimensions:[4,4,4],visible:true,locked:false}];
 project.quickForge!.campaignEncounters=[{name:'survivors',actorPath:'characters/marine_armored/marine_armored assault rifle',position:[0,0,0],startActive:false,count:2,spacing:1}];
 project.studio!.missions=[{id:'rescue',title:'Rescue',objective:'Escort',trigger:'escort',encounterName:'survivors',triggerRef:'rally',minimumSurvivors:1,escortFailure:'continue',checkpoint:true},
 {id:'success',title:'Success',objective:'Normal route',trigger:'manual',encounterName:'',conditionResult:{beatId:'rescue',failed:false}},
 {id:'failure',title:'Failure',objective:'Recovery route',trigger:'manual',encounterName:'',conditionResult:{beatId:'rescue',failed:true}}];
 expect(validateCreatorStudio(project.studio!)).toEqual([]);const body=exportHaloCeMission(project.studio!).content;
 expect(body).toContain('(set gs_result_1_failed true)');expect(body).toContain('(set gs_result_1_done true)');expect(body).not.toContain('(sleep_until false 15)');
 expect(body).toContain('(if (not gs_result_1_failed) (begin');expect(body).toContain('(if (and gs_result_1_done (not gs_result_1_failed)) (begin');expect(body).toContain('(if (and gs_result_1_done gs_result_1_failed) (begin');
 expect(body.indexOf('(if (not gs_result_1_failed) (begin')).toBeLessThan(body.indexOf('(game_save)'));
 const prepared=await attachNativeCampaignMission(project,'manual'),restored=JSON.parse(JSON.stringify(prepared));expect((await reviewNativeCampaignMission(restored)).binding.missions).toEqual(project.studio!.missions);
 for(const patch of [{beatId:'missing',failed:true},{beatId:'failure',failed:false},{beatId:'rescue',failed:'yes'}]) {
  const bad=structuredClone(project);bad.studio!.missions[1].conditionResult=patch as any;expect(validateCreatorStudio(bad.studio!)).not.toEqual([]);
 }
 for(const patch of [{escortFailure:'stop'},{trigger:'timer'},{escortFailure:'invalid'}]) {const bad=structuredClone(project);Object.assign(bad.studio!.missions[0],patch);expect(validateCreatorStudio(bad.studio!)).not.toEqual([]);}
 const mixed=structuredClone(project);mixed.studio!.missions[1].conditionVolume='rally';mixed.studio!.missions[1].conditionGroup='rally_decision';expect(validateCreatorStudio(mixed.studio!)).toEqual([]);const combined=exportHaloCeMission(mixed.studio!).content;expect(combined.indexOf('(if (and gs_result_1_done (not gs_result_1_failed))')).toBeLessThan(combined.indexOf('(set gs_branch_1_inside'));await attachNativeCampaignMission(mixed,'manual');
 const legacy=emptyCreatorStudio();legacy.missions=[{...project.studio!.missions[0],escortFailure:undefined}];const original=exportHaloCeMission(legacy).content;expect(original).toContain('(sleep_until false 15)');expect(original).not.toContain('gs_result_');
});


it('prepares a source-bound cinematic intro with mission history, review and stale-camera protection',async()=>{
 const project=campaignDraft();project.history=[];project.studio!.missions=[{id:'begin',title:'Begin',objective:'Move out',trigger:'timer',timerSeconds:1,encounterName:''}];
 project.studio!.shots=[{id:'approach',name:'Approach',durationMs:1200,cameraPosition:[2,-4,3],lookAt:[4,0,1],fov:60,subtitle:'Rehearsal only',roll:12},
  {id:'cut',name:'Cut to ridge',durationMs:1800,cameraPosition:[25,0,3],lookAt:[29,0,1],fov:70,subtitle:'',easing:'cut'}];
 const original=JSON.stringify(project),prepared=await attachNativeCampaignMission(project,'startup',true);
 expect(JSON.stringify(project)).toBe(original);const review=await reviewNativeCampaignMission(prepared),content=review.module.content;
 expect(review.binding.cinematic).toEqual(project.studio!.shots);expect(content).toContain('(camera_set gs_cs_001 0)');expect(content).toContain('(camera_set gs_cs_002 0)');
 expect(content).toContain('(player_enable_input false)');expect(content).toContain('(player_enable_input true)');expect(content.indexOf('(gs_cinematic)')).toBeGreaterThan(content.indexOf('(sleep_until (> (list_count (players)) 0) 1)'));
 let history=historyReducer({...initialHistory,current:project},{type:'edit',project:prepared,description:'Prepare story intro'});
 history=historyReducer(history,{type:'undo'});expect(history.current).toEqual(project);history=historyReducer(history,{type:'redo'});
 const restored=JSON.parse(JSON.stringify(history.current));expect((await reviewNativeCampaignMission(restored)).binding).toEqual(review.binding);
 restored.studio.shots[0].cameraPosition[0]=8;const revised=await attachNativeCampaignMission(restored,'startup');expect((await reviewNativeCampaignMission(revised)).binding.cinematic![0].cameraPosition[0]).toBe(8);
 const local=structuredClone(prepared);local.studio!.shots[0].cameraPosition[0]=12;const reconcile=await reviewNativeCampaignMission(local);
 const accepted=applyNativeCampaignMission(local,reconcile);expect(accepted.studio!.shots).toEqual(project.studio!.shots);expect(accepted.quickForge).toBe(local.quickForge);
 const stale={...local,studio:structuredClone(local.studio)};stale.studio!.shots[0].cameraPosition[0]=13;expect(()=>applyNativeCampaignMission(stale,reconcile)).toThrow(/changed after review/);
 const noIntro=await attachNativeCampaignMission(revised,'manual',false);expect((await reviewNativeCampaignMission(noIntro)).binding.cinematic).toBeUndefined();
 const recording=structuredClone(project);recording.studio!.engineMachinima={enabled:true,playback:'sequence',autoStart:false};await expect(attachNativeCampaignMission(recording,'manual',true)).rejects.toThrow(/both would own/);
 const duplicate=structuredClone(project);duplicate.studio!.shots.forEach(shot=>shot.cameraMarker='same_camera');await expect(attachNativeCampaignMission(duplicate,'manual',true)).rejects.toThrow(/unique/);
 const coincident=structuredClone(project);coincident.studio!.shots[0].lookAt=[2,-4,3];await expect(attachNativeCampaignMission(coincident,'manual',true)).rejects.toThrow(/distinct look-at/);
 const changed=structuredClone(prepared);changed.quickForge!.logic!.handwrittenSources!.find(source=>source.filename==='gs_mission.hsc')!.content+='; handwritten';await expect(attachNativeCampaignMission(changed,'manual',true)).rejects.toThrow(/checksum/);
});


it('authors per-objective shot ranges without forcing an intro or bypassing conditional success',async()=>{
 const project=campaignDraft();project.history=[];
 project.studio!.shots=[{id:'approach',name:'Approach',durationMs:1000,cameraPosition:[0,-4,3],lookAt:[4,0,1],fov:60,subtitle:''},
  {id:'ending',name:'Ending',durationMs:1500,cameraPosition:[25,0,3],lookAt:[29,0,1],fov:70,subtitle:'',easing:'cut'}];
 project.studio!.missions=[{id:'first',title:'Insertion',objective:'Move out',trigger:'timer',timerSeconds:1,encounterName:'',cinematicCue:{firstShotId:'approach',lastShotId:'approach',phase:'start'}},
  {id:'finish',title:'Return',objective:'Finish',trigger:'timer',timerSeconds:1,encounterName:'',completeMission:true,cinematicCue:{firstShotId:'ending',lastShotId:'ending',phase:'complete'}}];
 expect(validateCreatorStudio(project.studio!)).toEqual([]);expect(missionCinematicShots(project.studio!,project.studio!.missions[0]).map(shot=>shot.id)).toEqual(['approach']);expect(missionCameraUsers(project.studio!,'approach').map(beat=>beat.id)).toEqual(['first']);
 const original=JSON.stringify(project),prepared=await attachNativeCampaignMission(project,'startup',false),review=await reviewNativeCampaignMission(prepared);expect(JSON.stringify(project)).toBe(original);
 expect(review.binding.cinematicIntro).toBe(false);expect(review.binding.cinematic).toEqual(project.studio!.shots);const content=review.module.content;
 expect(content).not.toContain('(script static void gs_cinematic');expect(content).toContain('(script static void gs_scene_1');expect(content).toContain('(camera_set gs_cs_002 0)');expect(content.slice(content.indexOf('(script dormant gs_mission')).indexOf('(gs_scene_1)')).toBeLessThan(content.slice(content.indexOf('(script dormant gs_mission')).indexOf('(sleep 30)'));expect(content.indexOf('(gs_scene_2)')).toBeLessThan(content.indexOf('(game_won)'));
 let history=historyReducer({...initialHistory,current:project},{type:'edit',project:prepared,description:'Prepare mission scenes'});history=historyReducer(history,{type:'undo'});expect(history.current).toEqual(project);history=historyReducer(history,{type:'redo'});expect((await reviewNativeCampaignMission(JSON.parse(JSON.stringify(history.current)))).binding).toEqual(review.binding);
 const deleted=structuredClone(project);deleted.studio!.shots.shift();expect(validateCreatorStudio(deleted.studio!).join(';')).toMatch(/existing first and last/);
 const inverted=structuredClone(project);inverted.studio!.missions[0].cinematicCue!.firstShotId='ending';expect(validateCreatorStudio(inverted.studio!).join(';')).toMatch(/timeline order/);
 const unsafe=structuredClone(project);(unsafe.studio!.missions[0].cinematicCue as any).phase='(game_won)';expect(validateCreatorStudio(unsafe.studio!).join(';')).toMatch(/Invalid mission camera scene/);
 const named=structuredClone(project);named.studio!.shots[0].name='  (sleep_until gs_logic_ready 1)';const combined=await attachNativeCampaignMission(named,'startup',true);const generated=(await reviewNativeCampaignMission(combined)).module.content;
 const flow=generated.slice(generated.indexOf('(script dormant gs_mission'));expect(flow).toContain('  (sleep_until gs_logic_ready 1)\r\n  (sleep_until (> (list_count (players)) 0) 1)\r\n  (gs_cinematic)');
 expect(generated.split('(script static void gs_scene_1')[1].split('(script static void gs_scene_2')[0]).not.toMatch(/^  \(gs_cinematic\)/m);
 const recording=structuredClone(project);recording.studio!.engineMachinima={enabled:true,playback:'sequence',autoStart:false};await expect(attachNativeCampaignMission(recording,'manual',false)).rejects.toThrow(/both would own/);
 const hud=structuredClone(project.studio!);hud.missions[0].hudObjective=true;hud.missions[0].hudText='Move out';const entry=exportHaloCeMission(hud).content;expect(entry.indexOf('(gs_scene_1)')).toBeLessThan(entry.indexOf('(hud_set_objective_text gs_mission_obj_1)'));
 const source=structuredClone(project.studio!);source.missions[0].conditionVolume='gate';const conditional=exportHaloCeMission(source).content;expect(conditional.indexOf('(if (volume_test_objects gate (players))')).toBeLessThan(conditional.indexOf('(gs_scene_1)'));
 source.missions[0]={...source.missions[0],trigger:'escort',triggerRef:'rally',encounterName:'marines',escortFailure:'continue',cinematicCue:{firstShotId:'approach',lastShotId:'ending',phase:'complete'}};const rescued=exportHaloCeMission(source).content;expect(rescued.indexOf('(if (not gs_result_1_failed) (begin')).toBeLessThan(rescued.indexOf('(gs_scene_1)'));
});

it('connects Forerunner Black Echo to real ownership and settled-return source without replacing the blueprint or user modules',async()=>{
 const project=campaignDraft();project.history=[];project.quickForge!.runtimeId='haloCustomEdition';let id=0;const connected=connectBlackEchoObjectives(project,()=> 'native_echo_'+(++id));
 let history=historyReducer({...initialHistory,current:project},{type:'edit',project:connected,description:'Connect native Black Echo objectives'});history=historyReducer(history,{type:'undo'});expect(history.current?.studio!.missions).toHaveLength(0);history=historyReducer(history,{type:'redo'});expect(history.current?.studio!.missions).toEqual(connected.studio!.missions);
 expect(project.studio!.missions).toHaveLength(0);expect(connected.studio!.missions[0].trigger).toBe('deviceActivated');expect(connected.studio!.missions[0].triggerRef).toBe('extraction_deploy');expect(connected.studio!.missions[3].trigger).toBe('weaponOwned');expect(connected.studio!.missions[6].trigger).toBe('forerunnerExtractionSettled');
 expect(connected.quickForge!.logic!.handwrittenSources).toEqual(project.quickForge!.logic!.handwrittenSources);
 const beats=connected.studio!.missions;expect(()=>exportHaloCeMission(connected.studio!)).toThrow(/Forerunner/);
 beats[3].weaponPath='weapons/technology';const output=exportHaloCeMission(connected.studio!,{forerunner:true});
 expect(output.content).toContain('(unit_has_weapon (unit (list_get (players) gs_collector_4)) "weapons\\technology")');
 expect(output.content).toContain('(script dormant forerunner_extraction_complete');expect(output.content).not.toContain('gs_complete_4');expect(output.content).not.toContain('gs_complete_7');
 expect(output.content.indexOf('(device_set_power extraction_activate 0)')).toBeLessThan(output.content.indexOf('(ai_place be_marines)'));
 expect(output.content.indexOf('(device_set_power extraction_activate 1)')).toBeGreaterThan(output.content.indexOf('(ai_place be_defense)'));
 expect(output.content).not.toContain('(game_won)');expect(output.dependencies).toContain('weapon:weapons/technology');
 const serialized=JSON.parse(JSON.stringify(connected));expect(validateCreatorStudio(serialized.studio)).toEqual([]);
 expect(serialized.studio.missions[3].weaponPath).toBe('weapons/technology');
 connected.quickForge!.campaignEncounters=['be_marines','be_covenant','be_flood','be_defense'].map(name=>({name,actorPath:'characters/grunt/grunt minor plasma pistol',position:[0,0,0],count:1,spacing:1,startActive:false}));
 connected.quickForge!.placements??=[];connected.quickForge!.placements.push({id:'tech',tagClass:'weap',tagPath:'weapons/technology'} as never);
 await expect(attachNativeCampaignMission(connected,'startup')).rejects.toThrow(/forerunner_extraction/);
 for(const [name,powered]of [['extraction_deploy',true],['extraction_activate',false]] as const){connected.quickForge!.placements.push({id:name,tagClass:'ctrl',tagPath:'devices/terminal',position:name==='extraction_deploy'?[2,3,1]:[10,3,1]} as never);connected.quickForge!.logic!.devices.push({placementId:name,nativeName:name,powered,initialPosition:0} as never);}
 for(const name of ['extraction_zone','extraction_return'])connected.quickForge!.logic!.triggers.push({id:name,nativeName:name,name,position:name==='extraction_return'?[2,3,1]:[10,3,1],rotation:[0,0,0],dimensions:name==='extraction_return'?[8,8,4]:[2,2,3]} as never);
 const prepared=await attachNativeCampaignMission(connected,'startup'),review=await reviewNativeCampaignMission(JSON.parse(JSON.stringify(prepared)));
 expect(review.binding.missions[3].weaponPath).toBe('weapons/technology');expect(review.binding.missions[6].trigger).toBe('forerunnerExtractionSettled');
 const legacy=structuredClone(connected);legacy.quickForge!.runtimeId='mccSteam';await expect(attachNativeCampaignMission(legacy,'startup')).rejects.toThrow(/legacy/);
 const starting=structuredClone(connected);starting.studio!.missions[3].weaponPath=starting.quickForge!.startingProfile!.primaryWeapon;starting.quickForge!.placements[0].tagPath=starting.studio!.missions[3].weaponPath!;await expect(attachNativeCampaignMission(starting,'startup')).rejects.toThrow(/starting equipment/);
});
it('refuses injected collection paths and early or conditional Forerunner settlement',()=>{
 const studio=emptyCreatorStudio();studio.missions=[{id:'collect',title:'Collect',objective:'Acquire',trigger:'weaponOwned',weaponPath:'bad" ) (ai_erase_all)',encounterName:''}];expect(()=>exportHaloCeMission(studio)).toThrow();
 studio.missions=[{id:'settle',title:'Return',objective:'Settle',trigger:'forerunnerExtractionSettled',triggerRef:'extraction_activate',encounterName:'',conditionVolume:'branch'}];expect(()=>exportHaloCeMission(studio,{forerunner:true})).toThrow(/unconditional/);
});

it('recovered mission encounters use actual native source instead of stale imported cache names',()=>{
 const source={...emptyCreatorStudio(),missions:[{id:'one',title:'Clear',objective:'Clear',trigger:'encounterCleared' as const,encounterName:'guards/patrol'}]},script=exportHaloCeMission(source);
 const squads=[{encounter:0,encounterName:'guards',name:'patrol'}];expect(inspectScenarioBindings([script],null,null,[],[],[],squads).find(row=>row.dependency.startsWith('ai_encounter:'))?.status).toBe('presentInNativeSource');
 expect(inspectScenarioBindings([script],null,null,[],[],[],[]).find(row=>row.dependency.startsWith('ai_encounter:'))?.status).toBe('absentInNativeSource');
 expect(inspectScenarioBindings([script],null,null,[],[],[],[...squads,{...squads[0],encounter:1}]).find(row=>row.dependency.startsWith('ai_encounter:'))?.status).toBe('absentInNativeSource');
});

it('authors and connects the complete recovered Black Echo blueprint without replacing native content',()=>{
 const project=campaignDraft();project.history=[];project.quickForge=null;project.source={sha256:'c'.repeat(64)} as Project['source'];project.builds=[{id:'source',status:'validated',target:'gbx-custom'}] as Project['builds'];
 const box={forward:[1,0,0],up:[0,0,1],corner:[0,0,0],dimensions:[4,4,4]};
 const names=['be_marines','be_covenant','be_flood','be_defense'];
 const source={projectId:project.id,buildId:'source',class:'scnr',sourceTarget:'gbx-custom',canAppendEncounter:true,tagSha256:'a'.repeat(64),protectedSquadEncounters:[],scenarioVolumes:['be_insert','be_survivors','be_artifact','be_containment','be_extract','extraction_return','extraction_zone'].map(name=>({name,kind:1,geometry:box})),scenarioDevices:['extraction_deploy','extraction_activate'].map(name=>({name,class:'ctrl'})),scenarioSquads:names.map((encounterName,encounter)=>({encounter,encounterName,name:'squad'})),missionSource:{encounters:names.map(name=>({name,initiallyCreated:false})),weapons:[]}} as unknown as NativeTagContext;
 const before=JSON.stringify(project),native=JSON.stringify(source);let id=0;const draft=addBlackEchoDraft(project,()=>`recovered_${++id}`,source);expect(draft.studio!.missions).toHaveLength(7);expect(draft.quickForge).toBeNull();expect(JSON.stringify(project)).toBe(before);expect(JSON.stringify(source)).toBe(native);
 const connected=connectBlackEchoObjectives(draft,()=>`unused_${++id}`,source);expect(connected.studio!.missions.map(beat=>beat.id)).toEqual(draft.studio!.missions.map(beat=>beat.id));expect(connected.studio!.missions[3].trigger).toBe('weaponOwned');expect(connected.studio!.missions[6].trigger).toBe('forerunnerExtractionSettled');expect(connected.source).toBe(project.source);expect(connected.builds).toBe(project.builds);
 const broken=structuredClone(source);broken.scenarioVolumes!.pop();expect(()=>connectBlackEchoObjectives(draft,()=>'',broken)).toThrow(/extraction pad/);
 for(const kind of ['active','recipe','missing','stale','malformed'] as const){const bad=structuredClone(source);if(kind==='active')bad.missionSource!.encounters[0].initiallyCreated=true;if(kind==='recipe')bad.protectedSquadEncounters=['be_marines'];if(kind==='missing')bad.scenarioVolumes!.shift();if(kind==='stale')bad.buildId='other';if(kind==='malformed')bad.missionSourceIssue='Unreadable profile';expect(()=>addBlackEchoDraft(project,()=>'',bad)).toThrow();}
 expect(()=>connectBlackEchoObjectives(draft,()=>'',{...source,sourceTarget:'mcc-cea'})).toThrow(/CE609/);
 let history=historyReducer({...initialHistory,current:project},{type:'edit',project:connected,description:'Author recovered Black Echo'});history=historyReducer(history,{type:'undo'});expect(history.current).toEqual(project);history=historyReducer(history,{type:'redo'});expect(JSON.parse(JSON.stringify(history.current)).studio.missions).toEqual(connected.studio!.missions);
});

it('authors independent native squad operations without rewriting literals or shared inventory',()=>{
 const studio=emptyCreatorStudio();studio.missions=[
 {id:'start',title:'Deploy',objective:'Deploy',trigger:'deviceActivated',triggerRef:'extraction_deploy',encounterName:'',squadNumber:1},
 {id:'escort',title:'Rescue',objective:'Rescue',trigger:'escort',encounterName:'marines',triggerRef:'rally',escortFailure:'continue',squadNumber:1},
 {id:'branch',title:'Return',objective:'Return',trigger:'triggerVolume',triggerRef:'rally',encounterName:'',conditionResult:{beatId:'escort',failed:false},conditionVolume:'rally',conditionGroup:'branch',squadNumber:1},
 {id:'pickup',title:'Collect gs_mission',objective:'Collect',trigger:'weaponOwned',weaponPath:'weapons/gs_mission',encounterName:'',squadNumber:1},
 {id:'end',title:'Extract',objective:'Extract',trigger:'forerunnerExtractionSettled',triggerRef:'extraction_activate',encounterName:'',squadNumber:1},
 {id:'other',title:'Wait',objective:'Wait',trigger:'manual',encounterName:'',squadNumber:2},
 {id:'other-end',title:'Extract',objective:'Extract',trigger:'forerunnerExtractionSettled',triggerRef:'extraction_activate',encounterName:'',squadNumber:2}];
 expect(validateCreatorStudio(studio)).toEqual([]);
 expect(()=>exportHaloCeMission(studio)).toThrow(/Forerunner/);
 const script=exportHaloCeMission(studio,{forerunner:true});
 expect(script.content).toContain('(script static object_list forerunner_squad_01_players (list_get (players) 32767))');
 expect(script.content).toContain('(script continuous gs_sq01_mission');
 expect(script.content).toContain('(script continuous forerunner_squad_02_complete');
 expect(script.content).toContain('(script static void gs_sq02_complete_6');
 expect(script.content).toContain('(set gs_sq01_result_2_done false)');
 expect(script.content).toContain('(set gs_sq01_collected_4 false)');
 expect(script.content).toContain('(and gs_sq01_result_2_done (not gs_sq01_result_2_failed))');
 expect(script.content).toContain('(ai_follow_target_unit marines (unit (list_get (forerunner_squad_01_players) 0)))');
 expect(script.content).toContain('"weapons\\gs_mission"');
 expect(script.content).toContain('; 4: Collect gs_mission');
 expect(script.content).toContain('(device_group_set extraction_squad_01_ready 1)');
 expect(script.content).toContain('(device_group_set extraction_squad_02_ready 0)');
 expect(script.content).toContain('(and gs_sq01_running (not gs_sq01_settled_5)');
 expect(script.content).toContain('(if gs_sq01_settled_5 (sleep_until (or (= (list_count (forerunner_squad_01_players)) 0) (< (device_group_get extraction_squad_01_ready) 0.5)) 1))');
 expect(sameMissionData([{...studio.missions[0],allowSharedPresentation:undefined}],[{...studio.missions[0],allowSharedPresentation:null}])).toBe(true);
 expect(script.content).toContain('(if gs_sq01_aborted (sleep_until (= (list_count (forerunner_squad_01_players)) 0) 1))');
 expect(script.content).not.toMatch(/device_set_power|ai_set_team|ai_allegiance|game_save|game_won/);
 expect(script.dependencies).toEqual(expect.arrayContaining(['forerunner_squad:01','forerunner_squad:02','weapon:weapons/gs_mission']));
 expect(script.warnings.join(' ')).not.toMatch(/not independent squad|No .*independent squad quest/);
 const saved=JSON.parse(JSON.stringify(studio));expect(exportHaloCeMission(saved,{forerunner:true})).toEqual(script);
});
it('refuses unsafe squad mission ownership and preserves the authored source fields',()=>{
 const studio=emptyCreatorStudio();studio.missions=[{id:'fight',title:'Fight',objective:'Fight',trigger:'encounterCleared',encounterName:'guards',squadNumber:1},{id:'end',title:'End',objective:'End',trigger:'forerunnerExtractionSettled',triggerRef:'extraction_activate',encounterName:'',squadNumber:1}];
 const generate=()=>exportHaloCeMission(studio,{forerunner:true});
 studio.missions[0].hudObjective=true;studio.missions[0].hudText='Fight';expect(generate).toThrow(/Explicitly allow/);studio.missions[0].allowSharedPresentation=true;expect(generate().content).toContain('(hud_set_objective_text gs_mission_obj_1)');
 studio.missions[0].checkpoint=true;expect(generate).toThrow(/shared world/);delete studio.missions[0].checkpoint;
 studio.missions.push({...studio.missions[0],id:'collision',encounterName:'GUARDS/patrol',squadNumber:2},{...studio.missions[1],id:'end2',squadNumber:2});expect(generate).toThrow(/encounter spawn/);
 studio.missions.splice(2);studio.missions[0].conditionResult={beatId:'end',failed:false};expect(generate).toThrow();delete studio.missions[0].conditionResult;
 studio.missions[1].trigger='manual';expect(generate).toThrow(/final native settled/);
 expect(studio.missions[0].hudText).toBe('Fight');
});

it('authors personal native flag guidance with body-change and settlement cleanup',()=>{
 const studio=emptyCreatorStudio();studio.missions=[{id:'area',title:'Reach',objective:'Reach',trigger:'triggerVolume',triggerRef:'rally',encounterName:'',squadNumber:1,guidance:{flag:'objective',height:1}},{id:'end',title:'Return',objective:'Return',trigger:'forerunnerExtractionSettled',triggerRef:'extraction_activate',encounterName:'',squadNumber:1,guidance:{flag:'hub',height:2}}];
 const output=exportHaloCeMission(studio,{forerunner:true});expect(output.dependencies).toEqual(expect.arrayContaining(['cutscene_flag:objective','cutscene_flag:hub']));
 expect(output.content).toContain('(script static void gs_sq01_nav_update');
 expect(output.content).toContain('(activate_nav_point_flag default gs_sq01_nav_viewer objective 1)');
 expect(output.content).toContain('(deactivate_nav_point_flag gs_sq01_nav_viewer hub)');
 expect(output.content).toContain('(set gs_sq01_nav_5 (unit (list_get gs_sq01_nav_members 5)))');
 expect(output.content).not.toContain('(list_get gs_sq01_nav_members 6)');
 expect(output.content).toContain('(!= gs_sq01_nav_0 (unit (list_get gs_sq01_nav_members 0)))');
 const update=output.content.slice(output.content.indexOf('(script static void gs_sq01_nav_update'));expect(update.indexOf('(set gs_sq01_nav_viewer gs_sq01_nav_5)')).toBeLessThan(update.indexOf('(gs_sq01_nav_show)'));
 expect(output.content).toContain('(<= (list_count gs_sq01_nav_members) 6)');
 expect(output.content).toContain('(if gs_sq01_aborted (set gs_sq01_nav_stage 0))');
 expect(output.content).toContain('(set gs_sq01_nav_members (forerunner_squad_01_players))');
 const callback=output.content.slice(output.content.indexOf('(script continuous forerunner_squad_01_complete'));expect(callback.indexOf('(set gs_sq01_nav_stage 0)')).toBeLessThan(callback.indexOf('(set gs_sq01_settled_2 true)'));
 expect(exportHaloCeMission(JSON.parse(JSON.stringify(studio)),{forerunner:true})).toEqual(output);
 studio.missions.forEach(beat=>delete beat.squadNumber);expect(()=>exportHaloCeMission(studio,{forerunner:true})).toThrow(/squad scope/);
 studio.missions[0].guidance!.flag='bad ) (quit';expect(()=>exportHaloCeMission(studio,{forerunner:true})).toThrow();
});
