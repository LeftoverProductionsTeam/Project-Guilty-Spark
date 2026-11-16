import {NATIVE_DEVICE_VIEW,deviceMatches,deviceDraft,deviceObjectId} from '../nativeDevicePlacement';
import type {NativeDeviceView} from '../nativeDevicePlacement';
import {useWorkspaceFileActions} from './WorkspacePanels';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { beginProjectMutation } from '../projectMutation';
import {call,native} from '../api';
import type {NativeTagContext} from '../nativeOperations';
import {NATIVE_VOLUME_VIEW,nativeVolumeMatches,volumeDraft} from '../nativeTriggerVolume';
import type {NativeVolumeView} from '../nativeTriggerVolume';
import CampaignEncounters from './CampaignEncounters';
import MissionSourceReview from './MissionSourceReview';
import { Camera, ClipboardCheck, Download, Film, Flag, Plus, Server, ShieldCheck, Trash2 } from 'lucide-react';
import type { MapInspection, Project, Vec3 } from '../types';
import {
  emptyCreatorStudio, exportStudioEvidence, validateCreatorStudio, addBlackEchoDraft, connectBlackEchoObjectives, missionBranchGroups, missionCinematicShots, missionCameraUsers,
} from '../creatorStudio';
import type { CameraShot, CreatorStudioDocument, MissionBeat, PlaytestRecord } from '../creatorStudio';
import { Notice, NumberField, PageTitle, Pill } from './ui';
import { attachNativeCampaignMission, cinematicMarker, nativeMissionBinding, exportHaloCeMission, exportHaloCeCinematic, exportHaloCeFirefight, scriptManifest } from '../haloScript';
import type { ScriptExport } from '../haloScript';
import { sourceZip } from '../sourceZip';
import { assembleHceekSourcePack } from '../hceekSourcePack';
import type { Activation } from '../hceekSourcePack';
import { inspectScenarioBindings } from '../scenarioBindings';
import MultiplayerWorkbench from './MultiplayerWorkbench';
import {makeFiveModeTestPlan, seedFiveModePlaytests} from '../haloModeTestPlan';
import {forgeTargets} from '../forge';
import PowerupStudio from './PowerupStudio';
import {NATIVE_AI_START_VIEW} from '../nativeAiStart';
import type {NativeAiStartView} from '../nativeAiStart';
import {useMapState,readMapSession,writeMapSession} from '../mapSession';
import SoundAudition from './SoundAudition';
import {attachAssetImport} from '../nativeAssetImport';
import {prepareMissionSound} from '../nativeSoundPlacement';
import type {NativeAssetImport} from '../types';
import ExternalBrowserLink from './ExternalBrowserLink';

const bindingLabels = {
  presentInImportedCache:'In source map', absentInImportedCache:'Not in source map',
  presentInAuthoringSource:'Authored', absentInAuthoringSource:'Missing in source',
  presentInNativeSource:'In native source', absentInNativeSource:'Missing / ambiguous native reference',
  notInspectable:'Review required',
};
type Pane = 'mission' | 'cinematic' | 'powerups' | 'server' | 'playtest';
function freshId(): string { return crypto.randomUUID(); }
function safeDownload(filename: string, contents: string, mime = 'text/plain;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the webview time to start the download before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function VectorEditor({ title, value, onChange }: {
  title: string; value: Vec3; onChange: (next: Vec3) => void;
}) {
  return <div className="studio-vector"><span>{title}</span><div>
    {(['X', 'Y', 'Z'] as const).map((axis, i) =>
      <NumberField key={axis} label={`${title} ${axis}`} value={value[i]} min={-4096} max={4096}
        onCommit={(n) => onChange(value.map((p, index) => index === i ? n : p) as Vec3)} />)}
  </div></div>;
}

/** Project-backed design tools; none of these controls execute commands in a game. */
export default function CreatorStudio({ project, inspection, edit, notify, onOpenRuntimes, onBuild, onLevelEditor, onMachinima }: {
  project: Project;
  inspection: MapInspection | null;
  edit: (next: Project, description: string) => void;
  notify: (message: string, tone?: string) => void;
  onOpenRuntimes: () => void;
  onBuild: () => void;
  onLevelEditor?:()=>void;
  onMachinima?:()=>void;
}) {
  const [pane, setPane] = useMapState<Pane>(project.id,'creator-studio-pane','mission');
  const [openBeats,setOpenBeats]=useMapState<Record<string,boolean>>(project.id,'creator-mission-expanded',{});
  const [scriptActivation,setScriptActivation]=useState<Activation>('none');
  const [missionActivation,setMissionActivation]=useMapState<'manual'|'startup'>(project.id,'native-mission-startup','manual');
  const [nextCinematic,setNextCinematic]=useMapState<'source'|'enabled'|'disabled'>(project.id,'native-mission-intro','source');
  const attachedCinematic=project.quickForge?.logic?.handwrittenSources?.some(source=>source.content.startsWith(nativeMissionBinding)&&source.content.split('\n',1)[0].includes('"cinematic":[')&&!source.content.split('\n',1)[0].includes('"cinematicIntro":false'))??false;
  const missionCinematic=nextCinematic==='source'?attachedCinematic:nextCinematic==='enabled';
  const [preparingMission,setPreparingMission]=useState(false);
  const [nativeAreas,setNativeAreas]=useState<NativeTagContext|null>(null),[readingNativeAreas,setReadingNativeAreas]=useState(false);
  const nativeAreaGeneration=useRef(0),nativeBuildsKey=project.builds.map(build=>build.id+':'+build.status).join('|');
  useEffect(()=>{nativeAreaGeneration.current++;setNativeAreas(null);setReadingNativeAreas(false);const changed=(event:Event)=>{if((event as CustomEvent<{projectId:string}>).detail?.projectId===project.id){nativeAreaGeneration.current++;setNativeAreas(null);setReadingNativeAreas(false);}};window.addEventListener('guilty-spark-native-source-changed',changed);return()=>{nativeAreaGeneration.current++;window.removeEventListener('guilty-spark-native-source-changed',changed);};},[project.id,nativeBuildsKey]);
  const latestProject=useRef(project);latestProject.current=project;
  const activeProject=useRef<string|null>(project.id);
  useEffect(()=>{activeProject.current=project.id;return()=>{activeProject.current=null;};},[project.id]);
  const [error, setError] = useState('');
  const [includingSound,setIncludingSound]=useState(false);
  const [cueSources,setCueSources]=useMapState<Record<string,string>>(project.id,'mission-cue-sources',{});
  const studio = useMemo(()=>project.studio ?? emptyCreatorStudio(),[project.studio]);
  const recoveredSource=!project.quickForge||!!project.quickForge.native;
  const forerunnerMission=['haloCustomEdition','chupathingyCe'].includes(project.quickForge?.runtimeId??'')||!!(recoveredSource&&nativeAreas?.sourceTarget==='gbx-custom'&&nativeAreas.canAppendEncounter);
  const branchDecisions=useMemo(()=>{try{return [...missionBranchGroups(studio.missions)];}catch{return [];}},[studio.missions]);
  const earlierRescues=(index:number)=>studio.missions.slice(0,index).filter(beat=>beat.trigger==='escort'&&beat.escortFailure==='continue');
  function changeConditionVolume(beat:MissionBeat,volume:string){
    change({...studio,missions:studio.missions.map(row=>row.id===beat.id||beat.conditionGroup!=null&&row.conditionGroup===beat.conditionGroup?{...row,conditionVolume:volume}:row)},'Change mission branch volume');
  }
  const encounterChoices=useId(), volumeChoices=useId();
  const sourceInspection=inspection?.sha256&&inspection.sha256===project.source?.sha256?inspection:null;
  useWorkspaceFileActions('creator:'+project.id,[
    {id:'prepare-native-mission',label:'Prepare campaign mission source…',run:()=>prepareNativeMission()},
    {id:'script-pack',label:'Export CE script sources…',run:()=>exportSourcePack()},
    {id:'creator-evidence',label:'Export creator evidence…',run:()=>report()},
    {id:'native-source-tree',label:'Export HCEEK source tree…',run:()=>exportHceekTree()},
  ]);
  // Opening/collapsing controls must not regenerate every mission script and binding.
  const bindingChecks = useMemo(() => {
    const scripts: ScriptExport[]=[];
    try { if(studio.missions.length) scripts.push(exportHaloCeMission(studio,{forerunner:forerunnerMission})); } catch { /* incomplete authoring has no safe export yet */ }
    try { if(studio.shots.length) scripts.push(exportHaloCeCinematic(studio)); } catch { /* unresolved marker */ }
    try { if(project.firefight&&project.quickForge?.gameMode!=='campaign') scripts.push(exportHaloCeFirefight(project.firefight)); } catch { /* invalid/endless wave authoring */ }
    return inspectScenarioBindings(scripts,sourceInspection,project.quickForge,studio.missions.some(beat=>beat.cinematicCue!=null)?studio.shots.map(cinematicMarker):[],nativeAreas?.scenarioVolumes,nativeAreas?.scenarioDevices,nativeAreas?.scenarioSquads);
  },[studio,project.firefight,project.quickForge,sourceInspection,nativeAreas,forerunnerMission]);
  const change = (next: CreatorStudioDocument, label: string) => {
    const problems = validateCreatorStudio(next);
    if (problems.length) { setError(problems.join('; ')); return; }
    setError('');
    edit({ ...project, studio: next }, label);
  };
  function report() {
    try {
      safeDownload('guilty-spark-creator-evidence.json', exportStudioEvidence(studio, project), 'application/json');
      notify('Creator evidence exported. It records your manual verdicts, not verified gameplay.', 'success');
    } catch (e) { setError(String(e)); }
  }
  function exportScript(kind: 'mission' | 'cinematic' | 'firefight', manifest = false) {
    try {
      const exported: ScriptExport = kind === 'mission' ? exportHaloCeMission(studio,{forerunner:forerunnerMission})
        : kind === 'cinematic' ? exportHaloCeCinematic(studio)
        : exportHaloCeFirefight(project.firefight ?? (() => { throw new Error('Create Firefight waves first'); })());
      if(manifest) safeDownload(exported.filename + '.manifest.json', scriptManifest(exported), 'application/json');
      else safeDownload(exported.filename, exported.content);
      setError('');
      notify('Authoring source exported; Sapien still needs matching encounter/camera/trigger tags and compilation.', 'success');
    } catch(e) { setError(String(e)); }
  }
  function exportSourcePack() {
    try {
      const scripts: ScriptExport[] = [];
      if (studio.missions.length) scripts.push(exportHaloCeMission(studio,{forerunner:forerunnerMission}));
      if (studio.shots.length) scripts.push(exportHaloCeCinematic(studio));
      if (project.firefight) scripts.push(exportHaloCeFirefight(project.firefight));
      if (!scripts.length) throw new Error('Create a mission, cinematic, or finite Firefight configuration first.');
      const contents = scripts.flatMap(script => [
        { name:script.filename, contents:script.content },
        { name:`${script.filename}.manifest.json`, contents:scriptManifest(script) },
      ]);
      const metadata = JSON.stringify({schemaVersion:1,kind:'guilty-spark-h1-authoring-pack',
        compileStatus:'notCompiled',gameplayVerified:false,gameFilesIncluded:false,
        scripts:scripts.map(s => ({name:s.filename,activation:s.activation ?? null,dependencies:s.dependencies,warnings:s.warnings}))},null,2);
      const bytes=sourceZip([{name:'READ_ME_FIRST.json',contents:metadata},...contents]);
      const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/zip'}));
      const a=document.createElement('a');a.href=url;a.download='guilty-spark-ce-script-sources.zip';
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
      setError('');
      notify('Source-only script pack exported. It needs manually prepared scenario dependencies and official compilation.', 'success');
    } catch(e) {setError(String(e));}
  }
  function exportHceekTree() {
    try {
      const bundle=assembleHceekSourcePack(project,scriptActivation);
      const bytes=new Uint8Array(bundle.bytes);
      const url=URL.createObjectURL(new Blob([bytes],{type:'application/zip'}));
      const link=document.createElement('a');link.href=url;link.download='guilty-spark-h1a-hceek-staging.zip';
      document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
      setError('');notify('HCEEK data-tree source ZIP exported for review; it has not compiled or modified a scenario.', 'success');
    } catch(error) {setError(String(error));}
  }
  async function prepareNativeMission() {
    if(preparingMission)return;
    const input=latestProject.current,activation=missionActivation;
    const release=beginProjectMutation(input.id);setPreparingMission(true);setError('');
    try {
      if(!input.quickForge||input.quickForge.native){
        if(!native)throw Error('Open the desktop app to read recovered native mission source.');
        window.dispatchEvent(new CustomEvent('guilty-spark-open-native-mission',{detail:{projectId:input.id,activation}}));notify('Recovered mission source review opened in Runtime & Tools. Save changes, read source and prepare its reviewed draft there.','info');return;
      }
      const candidate=await attachNativeCampaignMission(input,activation,missionCinematic);
      if(activeProject.current!==input.id||latestProject.current.id!==input.id||
        latestProject.current.quickForge!==input.quickForge||latestProject.current.studio!==input.studio)
        throw Error('The map or mission changed during preparation. Review again; no older source was reapplied.');
      edit({...latestProject.current,quickForge:candidate.quickForge},'Prepare native campaign mission source');
      notify('Mission HaloScript attached to source. Save, then use Build & playtest; compilation and gameplay remain unverified.','success');
    } catch(problem) {if(activeProject.current===input.id)setError(String(problem));}
    finally {release();setPreparingMission(false);}
  }
  function sourceAreas(name:string){return project.quickForge?.native?[]:project.quickForge?.logic?.triggers.filter(trigger=>trigger.nativeName===name)??[];}
  function nativeControl(name:string){if(!name)return null;const rows=nativeAreas?.scenarioDevices?.filter(row=>row.class==='ctrl'&&row.name===name)??[];return rows.length===1?rows[0]:null;}
  function sourceControls(){return (project.quickForge?.logic?.devices??[]).filter(device=>device.nativeName&&project.quickForge?.placements.some(placement=>placement.id===device.placementId&&placement.tagClass==='ctrl'));}
  function canSelectMissionControl(name:string){return sourceControls().filter(row=>row.nativeName===name).length===1||!readingNativeAreas&&!nativeAreas?.deviceEditIssue&&!!nativeControl(name);}
  function nativeArea(name:string){const rows=nativeAreas?.scenarioVolumes?.map((original,index)=>({original,index})).filter(row=>row.original.name===name)??[];return rows.length===1?rows[0]:null;}
  function canSelectMissionArea(name:string){const authored=sourceAreas(name);if(authored.length)return authored.length===1;const area=nativeArea(name);return !readingNativeAreas&&!nativeAreas?.triggerEditIssue&&!!area?.original.geometry&&area.original.kind===1;}
  async function readNativeAreas(){
    if(readingNativeAreas)return;
    const input=latestProject.current,generation=++nativeAreaGeneration.current;setReadingNativeAreas(true);setError('');
    try{const context=await call<NativeTagContext>('native_tag_context',{projectId:input.id});
      if(generation!==nativeAreaGeneration.current||activeProject.current!==input.id)return;
      if(context.projectId!==input.id||context.class!=='scnr'||!/^[a-f0-9]{64}$/i.test(context.tagSha256??'')||!latestProject.current.builds.some(build=>build.id===context.buildId&&build.status==='validated'))throw Error('A current verified native scenario source is required. Build or connect its matching source first.');
      setNativeAreas(context);
    }catch(problem){if(generation===nativeAreaGeneration.current){setNativeAreas(null);setError(String(problem));}}
    finally{if(generation===nativeAreaGeneration.current)setReadingNativeAreas(false);}
  }
  async function selectMissionArea(name:string,device=false){
    const doc=project.quickForge;
    const area=device?(doc?.logic?.devices??[]).filter(binding=>binding.nativeName===name)
      .flatMap(binding=>doc!.placements.filter(placement=>placement.id===binding.placementId&&placement.tagClass==='ctrl')):sourceAreas(name);
    if(!onLevelEditor){setError('The Level Editor is unavailable in this window.');return;}
    if(area.length===1){selectSourceObject(area[0].id);return;}
    if(device&&nativeAreas&&nativeControl(name)&&!nativeAreas.deviceEditIssue){
      const original=nativeControl(name)!,context=nativeAreas,input=latestProject.current,generation=++nativeAreaGeneration.current;setReadingNativeAreas(true);setError('');
      try{const current=await call<NativeTagContext>('native_tag_context',{projectId:input.id});if(generation!==nativeAreaGeneration.current||activeProject.current!==input.id)return;
        const proposed:NativeDeviceView={projectId:input.id,buildId:context.buildId,tag:context.tag,sourceSha256:context.tagSha256!,original,...deviceDraft(original),active:true,focus:Date.now()};
        if(!deviceMatches(proposed,current)||!latestProject.current.builds.some(build=>build.id===current.buildId&&build.status==='validated')){setNativeAreas(null);throw Error('Native source changed. Read native controls again; no older placement was shown or applied.');}
        const old=readMapSession<NativeDeviceView|null>(input.id,NATIVE_DEVICE_VIEW,null);writeMapSession(input.id,NATIVE_DEVICE_VIEW,old&&old.original.class===original.class&&old.original.index===original.index&&deviceMatches(old,current)?{...old,active:true,focus:Date.now()}:proposed);writeMapSession(input.id,'world.selection',deviceObjectId(original));writeMapSession(input.id,'world.ai-start',null);writeMapSession(input.id,'world.cutscene-camera',null);writeMapSession(input.id,'world.trigger-volume',null);onLevelEditor();
      }catch(problem){if(generation===nativeAreaGeneration.current)setError(String(problem));}finally{if(generation===nativeAreaGeneration.current)setReadingNativeAreas(false);}return;
    }
    const selected=!device&&area.length===0?nativeArea(name):null,context=nativeAreas;
    if(!selected?.original.geometry||!context?.tagSha256||!canSelectMissionArea(name)){setError('Read native scenario areas, then choose one uniquely named editable area; native controls use their own source workflow.');return;}
    const generation=++nativeAreaGeneration.current,input=latestProject.current;setReadingNativeAreas(true);setError('');
    try{
      const current=await call<NativeTagContext>('native_tag_context',{projectId:input.id});
      if(generation!==nativeAreaGeneration.current||activeProject.current!==input.id)return;
      const old=readMapSession<NativeVolumeView|null>(input.id,NATIVE_VOLUME_VIEW,null);
      const proposed:NativeVolumeView={projectId:input.id,buildId:context.buildId,tag:context.tag,sourceSha256:context.tagSha256,index:selected.index,original:selected.original,...volumeDraft(selected.original.geometry),active:true,focus:Date.now(),mode:'translate'};
      if(!nativeVolumeMatches(proposed,current)||!latestProject.current.builds.some(build=>build.id===current.buildId&&build.status==='validated')){setNativeAreas(null);throw Error('Native source changed. Read native scenario areas again; no older area was shown or applied.');}
      writeMapSession(input.id,NATIVE_DEVICE_VIEW,null);writeMapSession(input.id,NATIVE_AI_START_VIEW,null);writeMapSession(input.id,'world.cutscene-camera',null);
      writeMapSession(input.id,NATIVE_VOLUME_VIEW,old&&old.index===selected.index&&nativeVolumeMatches(old,current)?{...old,active:true,focus:Date.now()}:proposed);
      writeMapSession(input.id,'forge.cameraMode','orbit');writeMapSession(input.id,'forge.bspWorkshop',false);onLevelEditor();
    }catch(problem){if(generation===nativeAreaGeneration.current)setError(String(problem));}
    finally{if(generation===nativeAreaGeneration.current)setReadingNativeAreas(false);}
  }
  function selectSourceObject(id:string){
    if(!onLevelEditor)return;
    const device=readMapSession<NativeDeviceView|null>(project.id,NATIVE_DEVICE_VIEW,null);if(device?.active)writeMapSession(project.id,NATIVE_DEVICE_VIEW,{...device,active:false});
    const actor=readMapSession<NativeAiStartView|null>(project.id,NATIVE_AI_START_VIEW,null);
    if(actor?.active)writeMapSession(project.id,NATIVE_AI_START_VIEW,{...actor,active:false});
    const volume=readMapSession<NativeVolumeView|null>(project.id,NATIVE_VOLUME_VIEW,null);if(volume?.active)writeMapSession(project.id,NATIVE_VOLUME_VIEW,{...volume,active:false});
    const camera=readMapSession<{active:boolean}|null>(project.id,'world.cutscene-camera',null);if(camera?.active)writeMapSession(project.id,'world.cutscene-camera',{...camera,active:false});
    writeMapSession(project.id,'forge.selection',[id]);writeMapSession(project.id,'forge.zone',null);
    writeMapSession(project.id,'forge.sourceSurface',null);writeMapSession(project.id,'forge.workshopSelection',null);
    writeMapSession(project.id,'forge.mode','translate');writeMapSession(project.id,'forge.frame',readMapSession<number>(project.id,'forge.frame',0)+1);
    writeMapSession(project.id,'forge.bspWorkshop',false);writeMapSession(project.id,'forge.cameraMode','orbit');onLevelEditor();
  }
  function updateBeat(id: string, patch: Partial<MissionBeat>) {
    change({ ...studio, missions: studio.missions.map(m => m.id === id ? { ...m, ...patch } : m) }, 'Update mission beat');
  }
  function selectMissionSound(beat:MissionBeat,binding:NativeAssetImport){
    updateBeat(beat.id,{soundCue:{importId:binding.id,soundPath:binding.nativePath.replaceAll('\\','/'),
      phase:beat.soundCue?.phase??'start',gain:beat.soundCue?.gain??1,delayMs:beat.soundCue?.delayMs??0,caption:beat.soundCue?.caption??''}});
  }
  async function includeMissionSound(beatId:string){
    if(includingSound)return;
    const input=latestProject.current,beat=input.studio?.missions.find(beat=>beat.id===beatId);
    const emitter=input.audioPreview?.emitters.find(emitter=>emitter.id===cueSources[beatId]);
    if(!beat||!emitter){setError('Choose a saved native one-shot sound from Map sounds first.');return;}
    const release=beginProjectMutation(input.id);setIncludingSound(true);setError('');
    try{
      const binding=await prepareMissionSound(input,emitter),latest=latestProject.current;
      if(activeProject.current!==input.id||latest.id!==input.id||latest.studio!==input.studio||
        latest.quickForge!==input.quickForge||latest.audioPreview!==input.audioPreview)
        throw Error('The map, mission or sound changed during inclusion. No older cue was applied; prepared tags remain available for retry.');
      const cue={importId:binding.id,soundPath:binding.nativePath.replaceAll('\\','/'),phase:'start' as const,
        gain:Math.max(0,Math.min(1,emitter.gain)),delayMs:0,caption:''};
      const next=attachAssetImport(latest,binding);
      edit({...next,studio:{...latest.studio!,missions:latest.studio!.missions.map(row=>row.id===beatId?{...row,soundCue:cue}:row)}},'Include native mission radio sound');
      notify('Native sound included and linked to this objective. Preview uses the source; Save and prepare mission again before building.','success');
    }catch(problem){if(activeProject.current===input.id)setError(String(problem));}
    finally{release();setIncludingSound(false);}
  }
  function updateShot(id: string, patch: Partial<CameraShot>) {
    change({ ...studio, shots: studio.shots.map(s => s.id === id ? { ...s, ...patch } : s) }, 'Update cinematic shot');
  }
  function seedStockModeTests() {
    try {
      if(!project.quickForge)throw new Error('Open or create a QuickForge source map first');
      const plan=makeFiveModeTestPlan(project.quickForge);
      const target=forgeTargets[project.quickForge.runtimeId]??project.quickForge.runtimeId;
      const next=seedFiveModePlaytests(studio.playtests,plan,target,freshId);
      if(next.length===studio.playtests.length){notify('All twenty stock Halo 1 test cases already exist. Your recorded evidence was preserved.');return;}
      const added=next.length-studio.playtests.length;
      change({...studio,playtests:next},`Prepare ${added} manual Halo 1 mode test cases`);
      notify(`${added} untested game-mode checks prepared. Run the real engine and record evidence before marking any result PASS.`);
    }catch(e){setError(String(e));}
  }
  function updatePlaytest(id: string, patch: Partial<PlaytestRecord>) {
    change({ ...studio, playtests: studio.playtests.map(p => p.id === id ? { ...p, ...patch } : p) }, 'Update manual playtest record');
  }
  return <div className="analysis-page creator-studio">
    <PageTitle eyebrow="PROJECT GUILTY SPARK / CREATOR STUDIO" title="Direct the experience."
      description="Design original mission beats, cinematic shots, dedicated-server rotations and manual QA evidence—all in your saved project."
      actions={<div className="analysis-actions"><button type="button" onClick={report}><Download size={15}/> Export evidence JSON</button><button className="primary" type="button" onClick={exportSourcePack}><Download size={15}/> Export CE script pack</button></div>} />
    <section className="studio-guide" aria-label="Creator Studio quick start">
      <div><strong>Start with one objective</strong><ol><li>Add a mission beat or camera shot.</li><li>Bind existing encounters and areas, or author them below. Prepared intros create their camera points.</li><li>Prepare editable campaign source, Save, then Build & playtest. Use script-pack export for a separate external scenario.</li></ol></div>
      <nav aria-label="HaloScript learning resources"><strong>Learn HaloScript</strong>
        <ExternalBrowserLink href="https://c20.reclaimers.net/general/scripting/">Scripting basics</ExternalBrowserLink>
        <ExternalBrowserLink href="https://c20.reclaimers.net/h1/scripting/">Halo 1 function reference</ExternalBrowserLink>
        <ExternalBrowserLink href="https://c20.reclaimers.net/h1/scripting/limits/">Common mistakes &amp; limits</ExternalBrowserLink>
        <ExternalBrowserLink href="https://c20.reclaimers.net/h1/h1-ek/h1-sapien/">Bind and compile in Sapien</ExternalBrowserLink>
      </nav>
    </section>
    <details className="analysis-card studio-handoff"><summary>Export &amp; compile setup</summary><div>
      <h2>QuickForge → Editing Kit source handoff</h2>
      <p>Places your generated scripts under the matching <code>data/levels/quickforge/.../scripts/</code> folder inside a review-only ZIP. Requires a QuickForge Campaign / scripted solo, Firefight or Zombie source project and separately owned editing tools. No Halo files are modified.</p>
      <div className="studio-fields"><label>Script startup (optional)
        <select aria-label="HCEEK startup selection" value={scriptActivation} onChange={e=>setScriptActivation(e.target.value as Activation)}>
          <option value="none">None — manual activation</option>
          <option value="mission">Start mission only (review first)</option>
          <option value="firefight" disabled={project.quickForge?.gameMode==='campaign'}>Start finite Firefight only (review first)</option>
        </select></label></div>
      {project.quickForge?.gameMode==='campaign'&&scriptActivation==='firefight'&&
        <p className="studio-hint">Choose manual activation or mission startup for this independent campaign. Saved Firefight rules remain inactive.</p>}
      <button type="button" disabled={project.quickForge?.gameMode==='campaign'&&scriptActivation==='firefight'}
        title={project.quickForge?.gameMode==='campaign'&&scriptActivation==='firefight'?'Choose manual activation or mission startup first.':undefined}
        onClick={exportHceekTree}><Download size={15}/> Export HCEEK source tree ZIP</button>
      <small className="studio-hint">This script-only pack excludes scenario and starting-loadout tags. Use the Level Editor native build for those.</small>
      <small className="studio-hint">The official compiler and actual target game must independently validate the scripts, BSP, AI, lighting and network behavior.</small>
    </div></details>
    {bindingChecks.length>0 && <details className="analysis-card studio-bindings"><summary>Scenario references · {bindingChecks.length} to check</summary>
      <p>Authored source names and imported cache names are separate evidence. Native compilation and gameplay are still required.</p>
      {bindingChecks.map(check => <div className="squad-row" key={check.dependency}>
        <span><code>{check.dependency}</code> — {check.detail}</span>
        <Pill tone={check.status==='presentInImportedCache'||check.status==='presentInAuthoringSource'||check.status==='presentInNativeSource'?'green':'muted'}>{bindingLabels[check.status]}</Pill>
      </div>)}
    </details>}
    <p className="studio-hint">Exports are Halo CE .hsc source. Matching scenario assets, native compilation and an in-game test are required.</p>
    <div className="studio-tabs" role="tablist" aria-label="Creator Studio sections">
      {([
        ['mission', 'Mission director', Flag],
        ['cinematic', 'Cinematic timeline', Film],
        ['powerups', 'Custom power-ups', Plus],
        ['server', 'Halo server', Server],
        ['playtest', 'Playtest lab', ClipboardCheck],
      ] as const).map(([id, label, Icon]) =>
        <button key={id} role="tab" aria-selected={pane === id} className={pane === id ? 'active' : ''} type="button" onClick={() => setPane(id)}><Icon size={16}/>{label}</button>)}
    </div>
    {error && <Notice>{error}</Notice>}
    {pane==='powerups'&&<PowerupStudio project={project} inspection={inspection} edit={edit} onBuild={onBuild}/>}
    {pane === 'mission' && <section className="analysis-card">
      <div className="studio-heading"><div><h2><Flag size={18}/> Mission director</h2><p>Ordered objectives and scenario triggers with a Halo CE .hsc source generator. Every trigger must exist in your editable scenario.</p></div>
        <button className="primary" type="button" disabled={studio.missions.length >= 128} onClick={() => {const id=freshId();change({ ...studio,
          missions: [...studio.missions, { id, title: `Beat ${studio.missions.length + 1}`, objective: '', trigger: 'manual', encounterName: '' }] }, 'Add mission beat');setOpenBeats(previous=>({...previous,[id]:true}));}}><Plus size={15}/> Add beat</button></div>
      <div className="analysis-actions">{recoveredSource&&<button type="button" disabled={!native||readingNativeAreas||!project.builds.some(build=>build.status==='validated')} title="Read the current native areas, script-created encounters, placed weapons and starting profiles. No source is modified." onClick={()=>void readNativeAreas()}>{readingNativeAreas?'Reading native source…':nativeAreas?'Refresh native Black Echo source':'Read native Black Echo source'}</button>}<button type="button" disabled={studio.missions.length>0||(recoveredSource?!nativeAreas||readingNativeAreas:project.quickForge?.gameMode!=='campaign')}
        title={studio.missions.length?'Use an empty mission in a separate project to preserve this operation.':recoveredSource?'Read native scenario areas first. Uses existing Black Echo areas and script-created encounters; native source is not replaced.':'Use editable Campaign / scripted solo source. Adds objectives and selectable areas; does not deploy gameplay.'}
        onClick={()=>{try{edit(addBlackEchoDraft(project,freshId,nativeAreas),'Create Operation Black Echo blueprint');setError('');notify(recoveredSource?'Black Echo objectives use the inspected existing native areas and encounters. Original tags and scripts are unchanged; review, Save and prepare source before compiling.':'Black Echo objectives and five areas added. Move markers onto playable terrain and bind be_marines, enemies and your audio. Native rescue needs gameplay testing; collection, inventory settlement and squad behavior need actual runtime logic.','info');}catch(error){setError(String(error));}}}>Create Black Echo draft</button>
        <button type="button" disabled={!forerunnerMission||readingNativeAreas} title="Connect the known Black Echo blueprint to real native weapon ownership and Forerunner's settled-survivor callback. Source modules are preserved; choose a technology weapon and prepare again." onClick={()=>{try{edit(connectBlackEchoObjectives(project,freshId,nativeAreas),'Connect Black Echo native objectives');setError('');notify('Native objectives configured. Select the technology weapon; author the deployment/extraction controls, hub and field volumes before preparing. Only Forerunner executes settled extraction.','info');}catch(problem){setError(String(problem));}}}>Connect Forerunner Black Echo objectives</button>
        <button type="button" onClick={()=>exportScript('mission')}><Download size={15}/> Export mission .hsc</button><button type="button" onClick={()=>exportScript('mission',true)}>Export required tags list</button></div>
      <details className="studio-handoff">
        <summary>Native mission build</summary>
        <p className="studio-hint">Attach generated mission source to this editable campaign.
          Existing handmade or edited modules are preserved. Choose startup deliberately; manual activation
          needs another script to call <code>(wake gs_mission)</code>. Activation changes apply when you prepare the source.</p>
        <label>Activation for next preparation<select aria-label="Native mission activation" value={missionActivation}
          disabled={preparingMission} onChange={event=>setMissionActivation(event.target.value as 'manual'|'startup')}>
          <option value="manual">Manual — another script starts the mission</option>
          <option value="startup">{recoveredSource?'Startup — wait for players in recovered source':'Startup — after native logic and loadout initialization'}</option>
        </select></label>
        {project.quickForge&&!project.quickForge.native&&<><label className="checkbox-label"><input type="checkbox" checked={missionCinematic} disabled={preparingMission}
          onChange={event=>setNextCinematic(event.target.checked?'enabled':'disabled')}/>Play saved camera shots as the mission intro</label>
        <p className="studio-hint">{studio.shots.length} saved shots. Preparation snapshots position, look-at, roll and FOV into native camera points. Objective camera scenes also use these saved shots, independently of the intro checkbox.
          The intro waits for a player, then restores input and camera before objectives. Cut snaps; other moves use native interpolation.
          Subtitles are rehearsal notes. Disable Machinima in-game recording first; edited shots require preparation again. Native playback still needs game testing.</p></>}
        {(!project.quickForge||project.quickForge.native)&&<p className="studio-hint">Recovered source uses the existing reviewed HaloScript editor. Scene camera points must already exist in native source; author their poses with the native camera editor. Use the existing native cinematic source controls for an intro. Original startup scripts remain active until explicitly revised.</p>}
        <button type="button" disabled={preparingMission||!studio.missions.length}
          onClick={()=>void prepareNativeMission()}> {preparingMission?'Preparing source…':!project.quickForge||project.quickForge.native?'Prepare recovered mission source…':'Prepare mission for native build'} </button>
        <p className="studio-hint">{recoveredSource?'Recovered mission source stays in the saved project draft until reviewed and compiled through Runtime & Tools. Read and prepare again after source changes or restart.':project.quickForge?.logic?.handwrittenSources?.some(source=>
          source.filename.toLowerCase()==='gs_mission.hsc'&&source.content.startsWith(nativeMissionBinding))
          ?'A mission binding is attached. Changed mission or included intro shots require preparation again; edited source is preserved and blocks automatic replacement.'
          :'No generated mission binding is attached. Separate exported script packs are not attached automatically.'}</p>
        <p className="studio-hint">{recoveredSource?'Save the recovered draft, review native references and objective HUD messages, then attach/compile through the source editor. Existing startup code remains active until explicitly revised.':'Save before Build & playtest. The build checks the saved mission binding, module hash, encounter/volume names, HUD messages and compiled script identities.'} Actual HUD display, checkpoint restoration and native level progression require separate game acceptance.</p>
        <MissionSourceReview project={project} edit={edit} onActivation={setMissionActivation} onCinematic={enabled=>setNextCinematic(enabled?'enabled':'disabled')} exportLocal={report}/>
      </details>
      <CampaignEncounters project={project} edit={edit} onSelectStart={onLevelEditor?selectSourceObject:undefined}/>
      <datalist id={encounterChoices}>{[...new Set([
        ...(project.quickForge?.gameMode==='campaign'?project.quickForge.campaignEncounters??[]:[]).map(entry=>entry.name),
        ...(sourceInspection?.encounters??[]).map(entry=>entry.name),
      ])].map(name=><option key={name} value={name}/>)}</datalist>
      <details className="studio-handoff studio-native-areas"><summary>Recovered scenario areas &amp; controls</summary>
        <button type="button" disabled={!native||readingNativeAreas||!project.builds.some(build=>build.status==='validated')} onClick={()=>void readNativeAreas()}>{readingNativeAreas?'Reading native areas…':'Read native scenario areas'}</button><button type="button" disabled={!native||readingNativeAreas||!project.builds.some(build=>build.status==='validated')} onClick={()=>void readNativeAreas()}>Read native controls</button>
        <p className="studio-hint">Read the latest verified native scenario, then use its names in area objectives, optional conditions and terminal objectives. Select objective area in Level Editor opens the real native box. Review trigger source returns to its existing Preview/Accept/Restore workflow; Save and rebuild after accepting. Script-only mission exports do not change native scripts automatically.</p>
        {!project.builds.some(build=>build.status==='validated')&&<p className="studio-hint">Connect matching native source and complete its validated build first. The original map stays unchanged.</p>}
        {nativeAreas&&<p className="studio-hint">{nativeAreas.scenarioVolumes?.length??0} native areas · {nativeAreas.scenarioDevices?.length??0} controls/machines · source {nativeAreas.tagSha256?.slice(0,12)}. Native compilation and gameplay remain separate checks.</p>}
        {nativeAreas?.missionSourceIssue&&<Notice tone="info">{nativeAreas.missionSourceIssue}</Notice>}
        {nativeAreas?.deviceEditIssue&&<Notice tone="info">{nativeAreas.deviceEditIssue}</Notice>}
        {nativeAreas?.triggerEditIssue&&<Notice tone="info">{nativeAreas.triggerEditIssue}</Notice>}
        {nativeAreas?.scenarioVolumes?.some(area=>!area.geometry||area.kind!==1)&&<p className="studio-hint">Fixed or unsupported native boxes retain their names but require the matching native editor for geometry.</p>}
      </details>
      <datalist id={volumeChoices}>{[...new Set([...(project.quickForge?.logic?.triggers??[]).flatMap(trigger=>trigger.nativeName?[trigger.nativeName]:[]),...(nativeAreas?.scenarioVolumes??[]).map(area=>area.name).filter(Boolean)])].map(name=><option key={name} value={name}/>)}</datalist>
      {studio.missions.length === 0 && <p className="studio-empty">No authored mission beats. Add an objective to start a custom campaign flow.</p>}
      {studio.missions.length>0&&<div className="studio-beat-list-tools"><span className="studio-hint">Expand a beat to edit. Collapse keeps edits; Save stores the project.</span><button type="button" disabled={!studio.missions.some(beat=>openBeats[beat.id]===true)} onClick={()=>setOpenBeats({})}>Collapse all beats</button></div>}
      {studio.missions.map((beat, i) => <details className="studio-record studio-mission-record" key={beat.id} open={openBeats[beat.id]===true}
        onToggle={event=>{if(event.target!==event.currentTarget)return;const open=event.currentTarget.open;if(open!==(openBeats[beat.id]===true))setOpenBeats(previous=>previous[beat.id]===open?previous:{...previous,[beat.id]:open});}}>
        <summary className="studio-beat-summary"><strong>{String(i + 1).padStart(2, '0')} · {beat.title || 'Untitled beat'}</strong><span>{({manual:'Manual',triggerVolume:'Area',weaponOwned:'Collection',forerunnerExtractionSettled:'Extraction',deviceActivated:'Terminal',encounterCleared:'Combat',escort:'Escort',timer:'Delay'} as const)[beat.trigger]}</span>{beat.hudObjective&&<small>HUD</small>}{beat.soundCue&&<small>Radio</small>}{beat.cinematicCue&&<small>Scene</small>}</summary>
        {openBeats[beat.id]===true&&<div className="studio-beat-body">
        <div className="studio-fields studio-beat-fields"><label>Title<input maxLength={120} value={beat.title} onChange={e => updateBeat(beat.id, { title: e.target.value })}/></label>
        <label title={studio.missions.some(row=>row.conditionResult?.beatId===beat.id)?'Later objectives use this rescue result. Remove those conditions before changing its trigger.':'Choose what completes this objective after it starts. Use matching native source names for volumes, encounters and controls.'}>Trigger<select value={beat.trigger} disabled={studio.missions.some(row=>row.conditionResult?.beatId===beat.id)} onChange={e => updateBeat(beat.id, { trigger: e.target.value as MissionBeat['trigger'],...(e.target.value!=='escort'?{escortFailure:undefined}:{}),...(e.target.value==='forerunnerExtractionSettled'?{triggerRef:'extraction_activate'}:{}) })}>
          <option value="manual">Manually advanced</option><option value="triggerVolume">Trigger volume (needs scenario binding)</option>
          <option value="weaponOwned">Native weapon collected (actual ownership)</option><option value="forerunnerExtractionSettled" disabled={!forerunnerMission}>Forerunner extraction settled (engine callback)</option><option value="deviceActivated">Terminal activated (native control)</option><option value="encounterCleared">Encounter cleared (needs AI binding)</option><option value="escort">Survivor escort to area (native AI)</option><option value="timer">Timer (needs script binding)</option></select></label>
        <label title="Choose an authored campaign group below or an exact encounter from the imported scenario. This reference alone does not place actors.">Encounter name (optional)<input list={encounterChoices} maxLength={128} value={beat.encounterName} placeholder="scenario encounter reference" onChange={e => updateBeat(beat.id, { encounterName: e.target.value })}/></label><button className="studio-beat-remove" type="button" aria-label={`Remove beat ${i + 1}`} disabled={studio.missions.some(row=>row.conditionResult?.beatId===beat.id)} title={studio.missions.some(row=>row.conditionResult?.beatId===beat.id)?'Remove dependent rescue-result conditions first.':'Remove this mission beat'} onClick={() => change({ ...studio, missions: studio.missions.filter(m => m.id !== beat.id) }, 'Remove mission beat')}><Trash2 size={15}/></button></div>
        {beat.trigger === 'manual' && <p className="subtle">Mission waits at this beat until another HaloScript trigger calls <code>gs_complete_{i+1}</code>.</p>}
        {(beat.trigger === 'triggerVolume'||beat.trigger==='escort'||beat.trigger==='manual'&&beat.triggerRef!=null) && <label>{beat.trigger==='manual'?'Reference area · authoring only':beat.trigger==='escort'?'Survivor destination volume':'Scenario trigger-volume identifier'}<input list={volumeChoices} maxLength={31} spellCheck={false} placeholder="gs_entry_volume" value={beat.triggerRef ?? ''} onChange={e => updateBeat(beat.id, {triggerRef:e.target.value})}/></label>}
        {beat.trigger==='weaponOwned'&&<><label>Technology weapon tag<input aria-label={'Mission collection weapon '+(i+1)} list={'mission-weapon-tags-'+i} maxLength={240} spellCheck={false} value={beat.weaponPath??''} placeholder="Choose a placed, included native weapon" onChange={e=>updateBeat(beat.id,{weaponPath:e.target.value})}/><datalist id={'mission-weapon-tags-'+i}>{[...new Set([...(project.quickForge?.placements??[]).filter(p=>p.tagClass==='weap').map(p=>p.tagPath),...(nativeAreas?.missionSource?.weapons??[]).filter(row=>!row.startingEquipment).map(row=>row.tagPath)])].map(path=><option key={path} value={path}/>)}</datalist></label><p className="studio-hint">Checks one actual native player inventory per tick. Use a placed technology weapon absent from the starting loadout. An area or terminal activation does not satisfy collection. This is shared mission progress, not an independent squad inventory.</p></>}
        {beat.trigger==='weaponOwned'&&nativeAreas?.missionSource&&<label>Choose placed native technology<select aria-label={'Choose native technology weapon '+(i+1)} value={nativeAreas.missionSource.weapons.some(row=>row.tagPath===beat.weaponPath)?(beat.weaponPath??''):''} onChange={event=>updateBeat(beat.id,{weaponPath:event.target.value})}><option value="">Choose a placed weapon absent from all starting profiles…</option>{nativeAreas.missionSource.weapons.map(row=><option key={row.tagPath} value={row.tagPath} disabled={row.startingEquipment}>{row.tagPath} · {row.placements.length} placements{row.startingEquipment?' · granted at start':''}</option>)}</select><small>Read native scenario areas to refresh. These are source placements, not proof of actual spawning; compile/readback and gameplay remain separate.</small></label>}
        {beat.trigger==='forerunnerExtractionSettled'&&<p className="studio-hint">Forerunner only. The final objective powers extraction_activate after earlier objectives. The engine wakes forerunner_extraction_complete only after living survivors physically return and gear settles. Author extraction_deploy, initially unpowered extraction_activate, extraction_zone, extraction_return and valid hub starts. No mandatory raid timer, loot award or automatic teleport is added. Legacy runtime exports are refused.</p>}
        {beat.trigger==='deviceActivated'&&<>
          <label>Native control terminal<select aria-label={'Mission terminal '+(i+1)} value={beat.triggerRef??''} onChange={event=>updateBeat(beat.id,{triggerRef:event.target.value})}>
            <option value="">Choose an authored or recovered native control</option>
            {beat.triggerRef&&!sourceControls().some(device=>device.nativeName===beat.triggerRef)&&!nativeControl(beat.triggerRef)&&<option value={beat.triggerRef}>{beat.triggerRef} · missing or ambiguous source binding</option>}
            {sourceControls().map(device=><option key={device.placementId} value={device.nativeName!}>{device.nativeName}</option>)}
            {[...new Set((nativeAreas?.scenarioDevices??[]).filter(device=>device.class==='ctrl'&&device.name&&!sourceControls().some(row=>row.nativeName===device.name)).map(device=>device.name))].filter(name=>!!nativeControl(name)).map(name=><option key={'native:'+name} value={name}>{name} · native source</option>)}
          </select></label>
          {onLevelEditor&&<button type="button" disabled={!canSelectMissionControl(beat.triggerRef??'')}
            onClick={()=>void selectMissionArea(beat.triggerRef??'',true)}>Select objective terminal in Level Editor</button>}
          <p className="studio-hint">Place and name a native control in Logic / Events, power it and start below half position. This step waits for inactive → activated.
            Already-active devices must return inactive first; Spark does not reset them. Scripts can also activate a control.
            This is a shared native objective condition, not technology pickup, loot settlement or per-squad progress.</p>
        </>}
        {beat.trigger === 'timer' && <label>Delay (seconds)<NumberField label="Mission beat delay seconds" min={1} max={600} value={beat.timerSeconds ?? 5} step={1} onCommit={n => updateBeat(beat.id,{timerSeconds:Math.round(n)})}/></label>}
        {onLevelEditor&&(beat.trigger==='triggerVolume'||beat.trigger==='escort'||beat.trigger==='manual'&&beat.triggerRef!=null)&&<button type="button"
          disabled={!canSelectMissionArea(beat.triggerRef??'')}
          title="Select an authored area, or read Recovered scenario areas above to select its real native box. Use its handles; review native source before accepting changes."
          onClick={()=>selectMissionArea(beat.triggerRef??'')}>Select objective area in Level Editor</button>}
        {beat.trigger==='escort'&&<>
          <NumberField label={'Minimum survivors '+(i+1)} min={1} max={32} step={1} value={beat.minimumSurvivors??1}
            onCommit={value=>updateBeat(beat.id,{minimumSurvivors:Math.round(value)})}/>
          <label title="Later rescue-result conditions require continuation. Remove those conditions before choosing Stop.">On rescue failure<select aria-label={'On rescue failure '+(i+1)} value={beat.escortFailure??'stop'}
            onChange={event=>updateBeat(beat.id,{escortFailure:event.target.value==='continue'?'continue':undefined})}>
            <option value="stop" disabled={studio.missions.some(row=>row.conditionResult?.beatId===beat.id)}>Stop this mission · world stays active</option><option value="continue">Continue to failure handling</option>
          </select></label>
          <p className="studio-hint">The mission creates this source group, assigns the human team and asks it to follow the closest players.
            All remaining survivors must reach the selected native volume, with at least this many alive. A player entering alone cannot complete rescue.
            Below the minimum, the mission shows failure. By default it stops; Continue to failure handling records the result and advances without success cues/checkpoints. Use earlier rescue result conditions on later objectives. The world keeps running. Own this group's spawn in one beat only.
            Minimum must fit all authored native difficulty populations. Choose real Marine assets and playable AI navigation; pathfinding, co-op and gameplay remain separate tests.</p>
        </>}
        <label className="studio-wide">Objective / direction<textarea value={beat.objective} rows={2} maxLength={2048} onChange={e => updateBeat(beat.id, { objective: e.target.value })}/></label>
        <label className="checkbox-label"><input type="checkbox" checked={beat.conditionVolume!=null||beat.conditionResult!=null} disabled={beat.completeMission===true}
          onChange={event=>updateBeat(beat.id,{conditionVolume:event.target.checked?'':undefined,conditionGroup:undefined,conditionOutside:undefined,conditionResult:undefined})}/>Optional step / branch · area or rescue result</label>
        {(beat.conditionVolume!=null||beat.conditionResult!=null)&&<label>Condition kind<select aria-label={'Mission condition source '+(i+1)} value={beat.conditionResult?(beat.conditionVolume!=null?'both':'result'):'area'}
          onChange={event=>{const mode=event.target.value;if(mode!=='area'){const source=earlierRescues(i).find(row=>row.id===beat.conditionResult?.beatId)??earlierRescues(i)[0];if(!source){setError('Configure an earlier survivor escort to continue on failure first.');return;}updateBeat(beat.id,{conditionResult:beat.conditionResult??{beatId:source.id,failed:false},conditionVolume:mode==='both'?(beat.conditionVolume??''):undefined,conditionGroup:mode==='both'?beat.conditionGroup:undefined,conditionOutside:mode==='both'?beat.conditionOutside:undefined});}
            else updateBeat(beat.id,{conditionResult:undefined,conditionVolume:beat.conditionVolume??''});}}>
          <option value="area">Named area decision</option><option value="result" disabled={!earlierRescues(i).length}>Earlier rescue result</option><option value="both" disabled={!earlierRescues(i).length}>Area and earlier rescue result</option>
        </select></label>}
        {beat.conditionResult&&<div>
          <label>Earlier rescue<select aria-label={'Mission rescue result '+(i+1)} value={beat.conditionResult.beatId}
            onChange={event=>updateBeat(beat.id,{conditionResult:{beatId:event.target.value,failed:beat.conditionResult!.failed}})}>
            {earlierRescues(i).map(source=><option key={source.id} value={source.id}>{source.title||'Untitled rescue'}</option>)}
          </select></label>
          <label>Run this step after<select aria-label={'Mission rescue outcome '+(i+1)} value={beat.conditionResult.failed?'failure':'success'}
            onChange={event=>updateBeat(beat.id,{conditionResult:{beatId:beat.conditionResult!.beatId,failed:event.target.value==='failure'}})}>
            <option value="success">Successful rescue</option><option value="failure">Failed rescue</option>
          </select></label>
          <small>The earlier rescue must continue on failure. This condition controls entry; this step’s Trigger still controls completion. When an area is also configured, both conditions must pass; an ineligible rescue route never samples the area decision. A skipped rescue has no result, so both paths skip. Failed rescues run no success cue or checkpoint; these routes do not grant loot or reset the world.</small>
        </div>}
        {beat.conditionVolume!=null&&<div><label>Optional step condition volume<input list={volumeChoices} maxLength={31} spellCheck={false}
          aria-label={'Optional condition '+(i+1)} value={beat.conditionVolume} onChange={event=>changeConditionVolume(beat,event.target.value)}/></label>
          {onLevelEditor&&<button type="button" disabled={!canSelectMissionArea(beat.conditionVolume??'')}
            onClick={()=>selectMissionArea(beat.conditionVolume??'')}>Select optional area in Level Editor</button>}
          <label>Decision<select aria-label={'Mission branch decision '+(i+1)} value={beat.conditionGroup==null?'independent':'group:'+beat.conditionGroup}
            onChange={event=>{const value=event.target.value,group=value==='new'?freshId():value.startsWith('group:')?value.slice(6):undefined;
              const shared=branchDecisions.find(([id])=>id===group)?.[1];updateBeat(beat.id,{conditionGroup:group,conditionVolume:shared?.volume??beat.conditionVolume});}}>
            <option value="independent">Check when this step begins</option><option value="new">New shared decision for this step</option>
            {branchDecisions.map(([id,group])=><option key={id} value={'group:'+id}>{group.firstBeat.title||'Untitled decision'} · {group.volume||'choose area'}</option>)}
          </select></label>
          <label>Run this step when<select aria-label={'Mission branch outcome '+(i+1)} value={beat.conditionOutside===true?'outside':'inside'}
            onChange={event=>updateBeat(beat.id,{conditionOutside:event.target.value==='outside'?true:undefined})}>
            <option value="inside">A player is inside the area</option><option value="outside">No players are inside the area</option>
          </select></label>
          <small>Skipped steps run no encounter, HUD, cue or checkpoint. A shared decision waits for a player, samples once at its first eligible member, then keeps that result for every member even after players move. Editing its area updates every member in one Undo action. This is shared native scenario state; it does not bank loot or provide independent squad/replay state.</small></div>}
        <details><summary>Radio / sound cue{beat.soundCue?' · included':''}</summary>
          <label>Included native sound<select aria-label={'Mission sound '+(i+1)} value={beat.soundCue?.importId??''}
            onChange={event=>{const binding=project.nativeAssetImports?.find(binding=>binding.id===event.target.value&&binding.tagClass==='snd!');if(binding)selectMissionSound(beat,binding);else updateBeat(beat.id,{soundCue:undefined});}}>
            <option value="">No cue</option>
            {beat.soundCue&&!project.nativeAssetImports?.some(binding=>binding.id===beat.soundCue!.importId&&binding.tagClass==='snd!')&&<option value={beat.soundCue.importId}>Missing included sound · choose again</option>}
            {(project.nativeAssetImports??[]).filter(binding=>binding.tagClass==='snd!').map(binding=><option key={binding.id} value={binding.id}>{binding.tagPath}</option>)}
          </select></label>
          <div className="studio-fields"><label>From Map sounds<select aria-label={'Rehearsal sound '+(i+1)} value={cueSources[beat.id]??''}
            onChange={event=>setCueSources({...cueSources,[beat.id]:event.target.value})}>
            <option value="">Choose a saved one-shot</option>
            {(project.audioPreview?.emitters??[]).filter(emitter=>!emitter.loopingSource&&!emitter.customSound).map(emitter=><option key={emitter.id} value={emitter.id}>{emitter.name}</option>)}
          </select></label><button type="button" disabled={includingSound||!cueSources[beat.id]||!project.quickForge||!!project.quickForge.native||project.quickForge.gameMode!=='campaign'}
            onClick={()=>void includeMissionSound(beat.id)}>Include sound for objective {i+1}</button></div>
          <p className="studio-hint">Drag an owned native sound from Asset library into Level Editor → Map sounds first, or choose an already included sound.
            Creator recordings need native sound tags; importing a WAV for rehearsal alone does not compile it.</p>
          {beat.soundCue&&<>
            <div className="studio-fields"><label>Play cue<select aria-label={'Cue timing '+(i+1)} value={beat.soundCue.phase}
              onChange={event=>updateBeat(beat.id,{soundCue:{...beat.soundCue!,phase:event.target.value as 'start'|'complete'}})}>
              <option value="start">When objective starts</option><option value="complete">After objective completes</option></select></label>
              <NumberField label={'Radio gain '+(i+1)} value={beat.soundCue.gain} min={0} max={1} step={.05}
                onCommit={gain=>updateBeat(beat.id,{soundCue:{...beat.soundCue!,gain}})}/>
              <NumberField label={'Cue delay milliseconds '+(i+1)} value={beat.soundCue.delayMs} min={0} max={60000} step={100}
                onCommit={delayMs=>updateBeat(beat.id,{soundCue:{...beat.soundCue!,delayMs:Math.round(delayMs)}})}/>
            </div>
            <label>Radio caption · native HUD help text<input aria-label={'Radio caption '+(i+1)} maxLength={254} value={beat.soundCue.caption}
              onChange={event=>updateBeat(beat.id,{soundCue:{...beat.soundCue!,caption:event.target.value}})}/></label>
            <SoundAudition label={'Preview objective '+(i+1)+' sound'} volume={beat.soundCue.gain}
              enabled={!!project.nativeAssetImports?.some(binding=>binding.id===beat.soundCue!.importId&&binding.tagClass==='snd!')}
              tracks={async()=>{const binding=project.nativeAssetImports?.find(binding=>binding.id===beat.soundCue!.importId&&binding.tagClass==='snd!');
                if(!binding)throw Error('The source sound is missing.');return [{projectId:binding.sourceProjectId,sourceHash:binding.sourceSha256,tagId:binding.tagId}];}}/>
            <small>The shared native mission pauses for this unpositioned cue (up to ten minutes). The engine chooses the sound permutation and applies its original sound class.
              Captions use the HUD help channel, with no percent signs or control characters. Other scripts may replace that channel. Preview is a source audition; native playback and multiplayer delivery need game testing.</small>
          </>}
        </details>
        <details><summary>Camera scene</summary>
          <label className="checkbox-label"><input type="checkbox" checked={beat.cinematicCue!=null} disabled={!studio.shots.length&&beat.cinematicCue==null}
            onChange={event=>updateBeat(beat.id,{cinematicCue:event.target.checked?{firstShotId:studio.shots[0].id,lastShotId:studio.shots.at(-1)!.id,phase:'start'}:undefined})}/>Play a camera scene for this objective</label>
          {!studio.shots.length&&<p>Add shots in Cinematic timeline first.</p>}
          <button type="button" onClick={()=>setPane('cinematic')}>Edit scene shots</button>
          {beat.cinematicCue&&<>
            <div className="studio-fields"><label>Scene timing<select aria-label={'Mission scene timing '+(i+1)} value={beat.cinematicCue.phase}
              onChange={event=>updateBeat(beat.id,{cinematicCue:{...beat.cinematicCue!,phase:event.target.value as 'start'|'complete'}})}>
              <option value="start">Before objective starts</option><option value="complete">After objective succeeds</option></select></label>
              <label>First shot<select aria-label={'Mission first shot '+(i+1)} value={beat.cinematicCue.firstShotId}
                onChange={event=>{const first=studio.shots.findIndex(shot=>shot.id===event.target.value),last=studio.shots.findIndex(shot=>shot.id===beat.cinematicCue!.lastShotId);updateBeat(beat.id,{cinematicCue:{...beat.cinematicCue!,firstShotId:event.target.value,...(first>last?{lastShotId:event.target.value}:{})}});}}>
                {studio.shots.map((shot,index)=><option key={shot.id} value={shot.id}>{index+1} · {shot.name||'Untitled shot'}</option>)}</select></label>
              <label>Last shot<select aria-label={'Mission last shot '+(i+1)} value={beat.cinematicCue.lastShotId}
                onChange={event=>{const last=studio.shots.findIndex(shot=>shot.id===event.target.value),first=studio.shots.findIndex(shot=>shot.id===beat.cinematicCue!.firstShotId);updateBeat(beat.id,{cinematicCue:{...beat.cinematicCue!,lastShotId:event.target.value,...(last<first?{firstShotId:event.target.value}:{})}});}}>
                {studio.shots.map((shot,index)=><option key={shot.id} value={shot.id}>{index+1} · {shot.name||'Untitled shot'}</option>)}</select></label></div>
            <p className="studio-hint">{(()=>{try{const shots=missionCinematicShots(studio,beat);return shots.length+' shots · '+shots.reduce((total,shot)=>total+shot.durationMs,0)/1000+' seconds.';}catch{return 'Select existing scene boundaries in timeline order.';}})()} A skipped objective plays no scene; a failed escort skips its success scene.
              Completion scenes run before checkpoint or level completion. Native playback and restored control require game testing.</p>
          </>}
          <p className="studio-hint">Prepare mission for native build snapshots these shots even with the separate mission intro off. Save and rebuild after changing a scene or shot.
            Disable in-game recording first. Raw script exports still need the named native camera points.</p>
        </details>
        <details className="studio-native-objective"><summary>Native objective &amp; completion</summary>
          <div className="studio-native-hud-fields"><label className="checkbox-label"><input type="checkbox" checked={beat.hudObjective===true}
            onChange={event=>updateBeat(beat.id,{hudObjective:event.target.checked?true:undefined,
              ...(event.target.checked&&beat.hudText==null?{hudText:beat.title}:{})})}/>{project.quickForge&&!project.quickForge.native?'Show native HUD objective while this beat is active':'Author native HUD objective text for this beat'}</label>
          {beat.hudObjective&&<label>HUD objective text<input aria-label={'HUD objective '+(i+1)} maxLength={254}
            value={beat.hudText??''} onChange={event=>updateBeat(beat.id,{hudText:event.target.value})}/></label>}</div>
          <details className="studio-native-notes"><summary>HUD setup &amp; native limitations</summary><p className="studio-hint">HUD text is separate from direction notes: 1–254 UTF-16 characters, no percent signs or control characters.
            {project.quickForge&&!project.quickForge.native?'The prepared native build creates a standard message tag; a script-only export does not include that tag.':'For recovered source, Save and use Runtime & Tools → Details → Edit or attach scenario HaloScript → Campaign objective HUD messages. Review HaloScript calls to these message names separately.'}</p><p className="studio-hint">The engine can refuse unsafe checkpoints. Completion follows the selected campaign configuration. Prepare again after changes; HUD display, checkpoint restoration and level progression need game verification.</p></details>
          <div className="studio-native-completion"><label className="checkbox-label" title="The engine may refuse or time out a checkpoint when unsafe."><input type="checkbox" checked={beat.checkpoint===true}
            disabled={beat.completeMission===true&&beat.checkpoint!==true}
            onChange={event=>updateBeat(beat.id,{checkpoint:event.target.checked?true:undefined})}/>Request a safe checkpoint after this beat</label>
          <label className="checkbox-label" title="Only the final unconditional beat can request completion; disable its checkpoint and optional condition first.">
            <input type="checkbox" checked={beat.completeMission===true}
              disabled={beat.completeMission!==true&&(i+1!==studio.missions.length||beat.checkpoint===true||beat.conditionVolume!=null||beat.conditionResult!=null)}
              onChange={event=>updateBeat(beat.id,{completeMission:event.target.checked?true:undefined})}/>Request native level completion after this beat
          </label></div>
        </details>
      </div>}
      </details>)}
    </section>}
    {pane === 'cinematic' && <section className="analysis-card">
      <div className="studio-heading"><div><h2><Camera size={18}/> Cinematic director</h2><p>Edit saved shots here or in Machinima. For an editable campaign, select a shot range in an objective’s Camera scene or enable the mission intro, then Prepare mission for native build to include native camera position, orientation and FOV. The separate raw export still requires existing scenario markers; subtitles remain rehearsal notes.</p></div>
        <button className="primary" type="button" disabled={studio.shots.length >= 256} onClick={() => change({ ...studio,
          shots: [...studio.shots, { id: freshId(), name: `Shot ${studio.shots.length + 1}`, durationMs: 3000,
            cameraPosition: [0, -8, 3], lookAt: [0, 0, 1], fov: 60, subtitle: '' }] }, 'Add cinematic shot')}><Plus size={15}/> Add shot</button></div>
      <div className="analysis-actions">{onMachinima&&<button type="button" onClick={onMachinima} title="Edit the same saved shots in the visual Machinima workspace. Use Mission director to include these shots as a native intro; in-game recording takes remain separate."><Camera size={15}/>Edit cameras visually</button>}<button type="button" onClick={()=>exportScript('cinematic')}><Download size={15}/> Export cinematic .hsc</button><button type="button" onClick={()=>exportScript('cinematic',true)}>Export required camera points</button></div>
      {studio.shots.length === 0 && <p className="studio-empty">No camera shots yet. Create a timeline for your mission's intro or ending.</p>}
      {studio.shots.map((shot, i) => <div className="studio-record" key={shot.id}>
        <div className="studio-record-heading"><strong>{String(i + 1).padStart(2, '0')} · {shot.name || 'Untitled shot'}</strong><Pill>{(shot.durationMs / 1000).toFixed(1)}s</Pill>
          <button type="button" aria-label={`Remove shot ${i + 1}`} disabled={missionCameraUsers(studio,shot.id).length>0} title={missionCameraUsers(studio,shot.id).length?'Change this mission scene boundary in Mission director before deleting the shot.':undefined} onClick={() => change({ ...studio, shots: studio.shots.filter(s => s.id !== shot.id) }, 'Remove cinematic shot')}><Trash2 size={15}/></button></div>
        <div className="studio-fields"><label>Name<input maxLength={120} value={shot.name} onChange={e => updateShot(shot.id, { name: e.target.value })}/></label>
          <label>Duration (ms)<NumberField label="Duration" value={shot.durationMs} min={100} max={600000} step={100} onCommit={n => updateShot(shot.id, { durationMs: Math.round(n) })}/></label>
          <label>FOV (degrees)<NumberField label="FOV" value={shot.fov} min={10} max={140} onCommit={n => updateShot(shot.id, { fov: n })}/></label></div>
        <label className="studio-wide">Native camera point name · optional for prepared scenes<input maxLength={31} spellCheck={false} placeholder={'gs_cs_'+String(i+1).padStart(3,'0')} value={shot.cameraMarker ?? ''} onChange={e=>updateShot(shot.id,{cameraMarker:e.target.value})}/></label>
        <div className="studio-fields studio-camera"><VectorEditor title="Camera XYZ" value={shot.cameraPosition} onChange={v => updateShot(shot.id, {cameraPosition: v})}/>
          <VectorEditor title="Look at XYZ" value={shot.lookAt} onChange={v => updateShot(shot.id, {lookAt: v})}/></div>
        <label className="studio-wide">Subtitle / dialogue cue<textarea value={shot.subtitle} rows={2} maxLength={2048} onChange={e => updateShot(shot.id, {subtitle: e.target.value})}/></label>
      </div>)}
      <div className="studio-total">Timeline length: {(studio.shots.reduce((n, s) => n + s.durationMs, 0) / 1000).toFixed(1)} seconds · {studio.shots.length} shots</div>
    </section>}
    {pane === 'server' && <MultiplayerWorkbench studio={studio} forge={project.quickForge} onChange={change} notify={notify} onError={setError} onOpenRuntimes={onOpenRuntimes} />}
    {pane === 'mission' && project.firefight && <section className="analysis-card">
      <h2><Flag size={18}/> Firefight encounter script</h2>
      <p>Export conservative finite waves as HaloScript. You must create matching AI encounters in Sapien; multiplayer, score, revives, and infection are not exported.</p>
      <div className="analysis-actions"><button type="button" onClick={()=>exportScript('firefight')}><Download size={15}/> Export waves .hsc</button><button type="button" onClick={()=>exportScript('firefight',true)}>Export encounter binding list</button></div>
    </section>}
    {pane === 'playtest' && <section className="analysis-card">
      <div className="studio-heading"><div><h2><ClipboardCheck size={18}/> Playtest lab</h2><p>Owner-recorded game tests tied to this project. No generated PASS badges, synthetic network claims or hidden uploads.</p></div>
        <div className="analysis-actions">
          <button type="button" disabled={!project.quickForge || studio.playtests.length >= 500}
            title="Add 20 stock Halo 1 source/Tool/game/network test cases without changing any existing manual results or pretending they passed."
            onClick={seedStockModeTests}><ClipboardCheck size={15}/> Seed five-mode tests</button>
          <button type="button" className="primary" disabled={studio.playtests.length >= 500} onClick={() => change({ ...studio,
            playtests: [...studio.playtests, { id:freshId(), caseId:'QA-001', target:'Halo Custom Edition', verdict:'notRun',
              performedAt:'', evidence:'', notes:'', manuallyReported:true }] }, 'Add playtest record')}><Plus size={15}/> Add test</button>
        </div></div>
      {studio.playtests.length === 0 && <p className="studio-empty">Record your first real map-load, render check or multiplayer test after running it on your machine.</p>}
      {studio.playtests.map((test, i) => <div className="studio-record" key={test.id}>
        <div className="studio-record-heading"><strong>{test.caseId} · {test.target || 'Unassigned target'}</strong><Pill tone={test.verdict === 'pass' ? 'green' : 'muted'}>{test.verdict}</Pill>
          <button type="button" aria-label={`Remove test ${i + 1}`} onClick={() => change({ ...studio, playtests: studio.playtests.filter(p => p.id !== test.id) }, 'Remove manual playtest')}><Trash2 size={15}/></button></div>
        <div className="studio-fields"><label>Test ID<input maxLength={120} value={test.caseId} onChange={e => updatePlaytest(test.id, {caseId:e.target.value})}/></label>
          <label>Runtime / build<input maxLength={120} value={test.target} onChange={e => updatePlaytest(test.id, {target:e.target.value})}/></label>
          <label>Manual outcome<select value={test.verdict} onChange={e => updatePlaytest(test.id, {verdict:e.target.value as PlaytestRecord['verdict']})}>
            <option value="notRun">Not run</option><option value="blocked">Blocked</option><option value="fail">Failed</option><option value="pass">Passed (requires evidence first)</option></select></label></div>
        <label className="studio-wide">Evidence / screenshot or log reference (required for PASS)
          <textarea rows={2} maxLength={2048} value={test.evidence} onChange={e => updatePlaytest(test.id, {evidence:e.target.value})}/></label>
        <label className="studio-wide">Reproduction, symptoms, rollback and notes
          <textarea rows={2} maxLength={4096} value={test.notes} onChange={e => updatePlaytest(test.id, {notes:e.target.value})}/></label>
        <button type="button" disabled={test.verdict === 'notRun'} onClick={() => updatePlaytest(test.id, {performedAt: new Date().toISOString()})}>Stamp manual test date</button>
        <small className="studio-hint">This is your claimed test result, not automated verification.</small>
      </div>)}
    </section>}
    <p className="studio-foot"><ShieldCheck size={15}/> Creator Studio edits only this Guilty Spark project and exports user-reviewed drafts. No stock map, server or runtime modifications.</p>
  </div>;
}
