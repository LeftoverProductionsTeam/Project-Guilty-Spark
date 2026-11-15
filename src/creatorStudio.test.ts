import type {Project} from './types';
import {attachNativeCampaignMission,reviewNativeCampaignMission,sameMissionData} from './haloScript';
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
