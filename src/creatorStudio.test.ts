import {historyReducer,initialHistory} from './editor';
import type {Project} from './types';
import {attachNativeCampaignMission,reviewNativeCampaignMission,sameMissionData,exportHaloCeMission} from './haloScript';
import {defaultNativePlayerProfile} from './firefight';
import { describe, expect, it } from 'vitest';
import { addBlackEchoDraft, blackEchoMission, emptyCreatorStudio, exportHaloCeServerInit, exportStudioEvidence, validateCreatorStudio, missionSoundProblems } from './creatorStudio';

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
   startingProfile:defaultNativePlayerProfile(),spawns:[{position:[2,3,.1]}],geometry:{preserve:'authored geometry'},campaignEncounters:[],
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
 expect(module.content).toContain('(sound_impulse_start "gs_assets_source/sound/radio distress" none 0.75)');
 expect(module.content).toContain('(hud_set_help_text gs_mission_cue_1)');
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
 const mixed=structuredClone(project);mixed.studio!.missions[1].conditionVolume='rally';expect(validateCreatorStudio(mixed.studio!)).not.toEqual([]);
 const legacy=emptyCreatorStudio();legacy.missions=[{...project.studio!.missions[0],escortFailure:undefined}];const original=exportHaloCeMission(legacy).content;expect(original).toContain('(sleep_until false 15)');expect(original).not.toContain('gs_result_');
});
