import type {Project} from './types';
import {attachNativeCampaignMission,reviewNativeCampaignMission,sameMissionData} from './haloScript';
import {defaultNativePlayerProfile} from './firefight';
import { describe, expect, it } from 'vitest';
import { addBlackEchoDraft, blackEchoMission, emptyCreatorStudio, exportHaloCeServerInit, exportStudioEvidence, validateCreatorStudio } from './creatorStudio';

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
 expect(studio.missions[1].trigger).toBe('manual');expect(studio.missions[6].trigger).toBe('manual');
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
 await expect(attachNativeCampaignMission(next,'manual')).rejects.toThrow(/be_covenant/);
 next.quickForge!.campaignEncounters=['be_covenant','be_flood','be_defense'].map((name,index)=>({id:'group_'+index,name,actorPath:'characters/grunt/grunt minor plasma pistol',position:[0,0,0],count:1,spacing:1,startActive:false}));
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
