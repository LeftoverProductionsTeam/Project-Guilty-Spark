import {useWorkspaceFileActions} from './WorkspacePanels';
import { useEffect, useId, useRef, useState } from 'react';
import { beginProjectMutation } from '../projectMutation';
import CampaignEncounters from './CampaignEncounters';
import MissionSourceReview from './MissionSourceReview';
import { Camera, ClipboardCheck, Download, Film, Flag, Plus, Server, ShieldCheck, Trash2 } from 'lucide-react';
import type { MapInspection, Project, Vec3 } from '../types';
import {
  emptyCreatorStudio, exportStudioEvidence, validateCreatorStudio, addBlackEchoDraft, missionBranchGroups,
} from '../creatorStudio';
import type { CameraShot, CreatorStudioDocument, MissionBeat, PlaytestRecord } from '../creatorStudio';
import { Notice, NumberField, PageTitle, Pill } from './ui';
import { attachNativeCampaignMission, nativeMissionBinding, exportHaloCeMission, exportHaloCeCinematic, exportHaloCeFirefight, scriptManifest } from '../haloScript';
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
export default function CreatorStudio({ project, inspection, edit, notify, onOpenRuntimes, onBuild, onLevelEditor }: {
  project: Project;
  inspection: MapInspection | null;
  edit: (next: Project, description: string) => void;
  notify: (message: string, tone?: string) => void;
  onOpenRuntimes: () => void;
  onBuild: () => void;
  onLevelEditor?:()=>void;
}) {
  const [pane, setPane] = useMapState<Pane>(project.id,'creator-studio-pane','mission');
  const [scriptActivation,setScriptActivation]=useState<Activation>('none');
  const [missionActivation,setMissionActivation]=useMapState<'manual'|'startup'>(project.id,'native-mission-startup','manual');
  const [preparingMission,setPreparingMission]=useState(false);
  const latestProject=useRef(project);latestProject.current=project;
  const activeProject=useRef<string|null>(project.id);
  useEffect(()=>{activeProject.current=project.id;return()=>{activeProject.current=null;};},[project.id]);
  const [error, setError] = useState('');
  const [includingSound,setIncludingSound]=useState(false);
  const [cueSources,setCueSources]=useMapState<Record<string,string>>(project.id,'mission-cue-sources',{});
  const studio = project.studio ?? emptyCreatorStudio();
  const branchDecisions=(()=>{try{return [...missionBranchGroups(studio.missions)];}catch{return [];}})();
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
  const bindingChecks = (() => {
    const scripts: ScriptExport[]=[];
    try { if(studio.missions.length) scripts.push(exportHaloCeMission(studio)); } catch { /* incomplete authoring has no safe export yet */ }
    try { if(studio.shots.length) scripts.push(exportHaloCeCinematic(studio)); } catch { /* unresolved marker */ }
    try { if(project.firefight&&project.quickForge?.gameMode!=='campaign') scripts.push(exportHaloCeFirefight(project.firefight)); } catch { /* invalid/endless wave authoring */ }
    return inspectScenarioBindings(scripts,sourceInspection,project.quickForge);
  })();
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
      const exported: ScriptExport = kind === 'mission' ? exportHaloCeMission(studio)
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
      if (studio.missions.length) scripts.push(exportHaloCeMission(studio));
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
      const candidate=await attachNativeCampaignMission(input,activation);
      if(activeProject.current!==input.id||latestProject.current.id!==input.id||
        latestProject.current.quickForge!==input.quickForge||latestProject.current.studio!==input.studio)
        throw Error('The map or mission changed during preparation. Review again; no older source was reapplied.');
      edit({...latestProject.current,quickForge:candidate.quickForge},'Prepare native campaign mission source');
      notify('Mission HaloScript attached to source. Save, then use Build & playtest; compilation and gameplay remain unverified.','success');
    } catch(problem) {if(activeProject.current===input.id)setError(String(problem));}
    finally {release();setPreparingMission(false);}
  }
  function selectMissionArea(name:string,device=false){
    const doc=project.quickForge;
    const area=device?(doc?.logic?.devices??[]).filter(binding=>binding.nativeName===name)
      .flatMap(binding=>doc!.placements.filter(placement=>placement.id===binding.placementId&&placement.tagClass==='ctrl')):
      doc?.logic?.triggers.filter(trigger=>trigger.nativeName===name)??[];
    if(!onLevelEditor||area.length!==1){setError('Select one existing named source area or native control before opening the Level Editor.');return;}
    const actor=readMapSession<NativeAiStartView|null>(project.id,NATIVE_AI_START_VIEW,null);
    if(actor?.active)writeMapSession(project.id,NATIVE_AI_START_VIEW,{...actor,active:false});
    writeMapSession(project.id,'forge.selection',[area[0].id]);writeMapSession(project.id,'forge.zone',null);
    writeMapSession(project.id,'forge.sourceSurface',null);writeMapSession(project.id,'forge.workshopSelection',null);
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
      <div><strong>Start with one objective</strong><ol><li>Add a mission beat or camera shot.</li><li>Use names that exist in your scenario’s AI, trigger volumes or camera points.</li><li>Export the script pack, compile it with your matching editing kit, then playtest.</li></ol></div>
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
        <Pill tone={check.status==='presentInImportedCache'||check.status==='presentInAuthoringSource'?'green':'muted'}>{bindingLabels[check.status]}</Pill>
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
        <button className="primary" type="button" disabled={studio.missions.length >= 128} onClick={() => change({ ...studio,
          missions: [...studio.missions, { id: freshId(), title: `Beat ${studio.missions.length + 1}`, objective: '', trigger: 'manual', encounterName: '' }] }, 'Add mission beat')}><Plus size={15}/> Add beat</button></div>
      <div className="analysis-actions"><button type="button" disabled={studio.missions.length>0||project.quickForge?.gameMode!=='campaign'||!!project.quickForge?.native}
        title={studio.missions.length?'Use an empty mission in a separate project to preserve this operation.':'Use editable Campaign / scripted solo source. Adds objectives and selectable areas; does not deploy gameplay.'}
        onClick={()=>{try{edit(addBlackEchoDraft(project,freshId),'Create Operation Black Echo blueprint');setError('');notify('Black Echo objectives and five areas added. Move markers onto playable terrain and bind be_marines, enemies and your audio. Native rescue needs gameplay testing; collection, inventory settlement and squad behavior need actual runtime logic.','info');}catch(error){setError(String(error));}}}>Create Black Echo draft</button>
        <button type="button" onClick={()=>exportScript('mission')}><Download size={15}/> Export mission .hsc</button><button type="button" onClick={()=>exportScript('mission',true)}>Export required tags list</button></div>
      <details className="studio-handoff">
        <summary>Native mission build</summary>
        <p className="studio-hint">Attach generated mission source to this editable campaign.
          Existing handmade or edited modules are preserved. Choose startup deliberately; manual activation
          needs another script to call <code>(wake gs_mission)</code>. Activation changes apply when you prepare the source.</p>
        <label>Activation for next preparation<select aria-label="Native mission activation" value={missionActivation}
          disabled={preparingMission} onChange={event=>setMissionActivation(event.target.value as 'manual'|'startup')}>
          <option value="manual">Manual — another script starts the mission</option>
          <option value="startup">Startup — after native logic and loadout initialization</option>
        </select></label>
        <button type="button" disabled={preparingMission||!studio.missions.length}
          onClick={()=>void prepareNativeMission()}> {preparingMission?'Preparing source…':'Prepare mission for native build'} </button>
        <p className="studio-hint">{project.quickForge?.logic?.handwrittenSources?.some(source=>
          source.filename.toLowerCase()==='gs_mission.hsc'&&source.content.startsWith(nativeMissionBinding))
          ?'A mission binding is attached. Changed mission data requires preparation again; edited source is preserved and blocks automatic replacement.'
          :'No generated mission binding is attached. Separate exported script packs are not attached automatically.'}</p>
        <p className="studio-hint">Save before Build &amp; playtest. The build checks the saved mission binding,
          module hash, encounter/volume names, HUD messages and compiled script identities. Actual HUD display,
          accepted checkpoint restoration and native level progression require separate game acceptance.</p>
        <MissionSourceReview project={project} edit={edit} onActivation={setMissionActivation} exportLocal={report}/>
      </details>
      <CampaignEncounters project={project} edit={edit}/>
      <datalist id={encounterChoices}>{[...new Set([
        ...(project.quickForge?.gameMode==='campaign'?project.quickForge.campaignEncounters??[]:[]).map(entry=>entry.name),
        ...(sourceInspection?.encounters??[]).map(entry=>entry.name),
      ])].map(name=><option key={name} value={name}/>)}</datalist>
      <datalist id={volumeChoices}>{(project.quickForge?.logic?.triggers??[]).filter(trigger=>trigger.nativeName)
        .map(trigger=><option key={trigger.id} value={trigger.nativeName}>{trigger.name}</option>)}</datalist>
      {studio.missions.length === 0 && <p className="studio-empty">No authored mission beats. Add an objective to start a custom campaign flow.</p>}
      {studio.missions.map((beat, i) => <div className="studio-record" key={beat.id}>
        <div className="studio-record-heading"><strong>{String(i + 1).padStart(2, '0')} · {beat.title || 'Untitled beat'}</strong><button type="button" aria-label={`Remove beat ${i + 1}`} onClick={() => change({ ...studio, missions: studio.missions.filter(m => m.id !== beat.id) }, 'Remove mission beat')}><Trash2 size={15}/></button></div>
        <div className="studio-fields"><label>Title<input maxLength={120} value={beat.title} onChange={e => updateBeat(beat.id, { title: e.target.value })}/></label>
        <label title="Choose what completes this objective after it starts. Use matching native source names for volumes, encounters and controls.">Trigger<select value={beat.trigger} onChange={e => updateBeat(beat.id, { trigger: e.target.value as MissionBeat['trigger'] })}>
          <option value="manual">Manually advanced</option><option value="triggerVolume">Trigger volume (needs scenario binding)</option>
          <option value="deviceActivated">Terminal activated (native control)</option><option value="encounterCleared">Encounter cleared (needs AI binding)</option><option value="escort">Survivor escort to area (native AI)</option><option value="timer">Timer (needs script binding)</option></select></label>
        <label title="Choose an authored campaign group below or an exact encounter from the imported scenario. This reference alone does not place actors.">Encounter name (optional)<input list={encounterChoices} maxLength={128} value={beat.encounterName} placeholder="scenario encounter reference" onChange={e => updateBeat(beat.id, { encounterName: e.target.value })}/></label></div>
        {beat.trigger === 'manual' && <p className="subtle">Mission waits at this beat until another HaloScript trigger calls <code>gs_complete_{i+1}</code>.</p>}
        {(beat.trigger === 'triggerVolume'||beat.trigger==='escort'||beat.trigger==='manual'&&beat.triggerRef!=null) && <label>{beat.trigger==='manual'?'Reference area · authoring only':beat.trigger==='escort'?'Survivor destination volume':'Scenario trigger-volume identifier'}<input list={volumeChoices} maxLength={31} spellCheck={false} placeholder="gs_entry_volume" value={beat.triggerRef ?? ''} onChange={e => updateBeat(beat.id, {triggerRef:e.target.value})}/></label>}
        {beat.trigger==='deviceActivated'&&<>
          <label>Native control terminal<select aria-label={'Mission terminal '+(i+1)} value={beat.triggerRef??''} onChange={event=>updateBeat(beat.id,{triggerRef:event.target.value})}>
            <option value="">Choose an authored native control</option>
            {beat.triggerRef&&!project.quickForge?.logic?.devices.some(device=>device.nativeName===beat.triggerRef&&project.quickForge?.placements.some(placement=>placement.id===device.placementId&&placement.tagClass==='ctrl'))&&<option value={beat.triggerRef}>{beat.triggerRef} · missing source binding</option>}
            {(project.quickForge?.logic?.devices??[]).filter(device=>device.nativeName&&project.quickForge?.placements.some(placement=>placement.id===device.placementId&&placement.tagClass==='ctrl'))
              .map(device=><option key={device.placementId} value={device.nativeName}>{device.nativeName}</option>)}
          </select></label>
          {onLevelEditor&&<button type="button" disabled={!project.quickForge?.logic?.devices.some(device=>device.nativeName===beat.triggerRef&&project.quickForge?.placements.some(placement=>placement.id===device.placementId&&placement.tagClass==='ctrl'))}
            onClick={()=>selectMissionArea(beat.triggerRef??'',true)}>Select objective terminal in Level Editor</button>}
          <p className="studio-hint">Place and name a native control in Logic / Events, power it and start below half position. This step waits for inactive → activated.
            Already-active devices must return inactive first; Spark does not reset them. Scripts can also activate a control.
            This is a shared native objective condition, not technology pickup, loot settlement or per-squad progress.</p>
        </>}
        {beat.trigger === 'timer' && <label>Delay (seconds)<NumberField label="Mission beat delay seconds" min={1} max={600} value={beat.timerSeconds ?? 5} step={1} onCommit={n => updateBeat(beat.id,{timerSeconds:Math.round(n)})}/></label>}
        {onLevelEditor&&(beat.trigger==='triggerVolume'||beat.trigger==='escort'||beat.trigger==='manual'&&beat.triggerRef!=null)&&<button type="button"
          disabled={!project.quickForge?.logic?.triggers.some(trigger=>trigger.nativeName===beat.triggerRef)}
          title="Select the existing native area in the Level Editor. Use its move/scale handles; then return to Mission director."
          onClick={()=>selectMissionArea(beat.triggerRef??'')}>Select objective area in Level Editor</button>}
        {beat.trigger==='escort'&&<>
          <NumberField label={'Minimum survivors '+(i+1)} min={1} max={32} step={1} value={beat.minimumSurvivors??1}
            onCommit={value=>updateBeat(beat.id,{minimumSurvivors:Math.round(value)})}/>
          <p className="studio-hint">The mission creates this source group, assigns the human team and asks it to follow the closest players.
            All remaining survivors must reach the selected native volume, with at least this many alive. A player entering alone cannot complete rescue.
            Below the minimum, this mission script stops and shows failure; the world keeps running. Own this group's spawn in one beat only.
            Minimum must fit all authored native difficulty populations. Choose real Marine assets and playable AI navigation; pathfinding, co-op and gameplay remain separate tests.</p>
        </>}
        <label className="studio-wide">Objective / direction<textarea value={beat.objective} rows={2} maxLength={2048} onChange={e => updateBeat(beat.id, { objective: e.target.value })}/></label>
        <label><input type="checkbox" checked={beat.conditionVolume!=null} disabled={beat.completeMission===true}
          onChange={event=>updateBeat(beat.id,{conditionVolume:event.target.checked?'':undefined,conditionGroup:undefined,conditionOutside:undefined})}/>Optional step / branch · condition on a named area</label>
        {beat.conditionVolume!=null&&<div><label>Optional step condition volume<input list={volumeChoices} maxLength={31} spellCheck={false}
          aria-label={'Optional condition '+(i+1)} value={beat.conditionVolume} onChange={event=>changeConditionVolume(beat,event.target.value)}/></label>
          {onLevelEditor&&<button type="button" disabled={!project.quickForge?.logic?.triggers.some(trigger=>trigger.nativeName===beat.conditionVolume)}
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
          <small>Skipped steps run no encounter, HUD, cue or checkpoint. A shared decision waits for a player, samples once at its first member, then keeps that result for every member even after players move. Editing its area updates every member in one Undo action. This is shared native scenario state; it does not bank loot or provide independent squad/replay state.</small></div>}
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
        <details><summary>Native objective &amp; completion</summary>
          <label><input type="checkbox" checked={beat.hudObjective===true}
            onChange={event=>updateBeat(beat.id,{hudObjective:event.target.checked?true:undefined,
              ...(event.target.checked&&beat.hudText==null?{hudText:beat.title}:{})})}/>Show native HUD objective while this beat is active</label>
          {beat.hudObjective&&<label>HUD objective text<input aria-label={'HUD objective '+(i+1)} maxLength={254}
            value={beat.hudText??''} onChange={event=>updateBeat(beat.id,{hudText:event.target.value})}/></label>}
          <p className="studio-hint">HUD text is separate from direction notes: 1–254 UTF-16 characters, no percent signs or control characters.
            The prepared native build creates a standard message tag; a script-only export does not include that tag.</p>
          <label><input type="checkbox" checked={beat.checkpoint===true}
            disabled={beat.completeMission===true&&beat.checkpoint!==true}
            onChange={event=>updateBeat(beat.id,{checkpoint:event.target.checked?true:undefined})}/>Request a safe checkpoint after this beat</label>
          <p className="studio-hint">The engine may refuse or time out a save when unsafe. This does not prove a saved checkpoint.</p>
          <label title="Only the final unconditional beat can request completion; disable its checkpoint and optional condition first.">
            <input type="checkbox" checked={beat.completeMission===true}
              disabled={beat.completeMission!==true&&(i+1!==studio.missions.length||beat.checkpoint===true||beat.conditionVolume!=null)}
              onChange={event=>updateBeat(beat.id,{completeMission:event.target.checked?true:undefined})}/>Request native level completion after this beat
          </label>
          <p className="studio-hint">Completion can advance the campaign according to the selected engine's level configuration.
            Prepare mission again after changes. HUD display, save restoration and level progression require native/game testing.</p>
        </details>
      </div>)}
    </section>}
    {pane === 'cinematic' && <section className="analysis-card">
      <div className="studio-heading"><div><h2><Camera size={18}/> Cinematic director</h2><p>Camera keyframes and a Halo CE .hsc exporter. Place each named cutscene_camera_point in the scenario first; FOV and subtitles remain editor metadata.</p></div>
        <button className="primary" type="button" disabled={studio.shots.length >= 256} onClick={() => change({ ...studio,
          shots: [...studio.shots, { id: freshId(), name: `Shot ${studio.shots.length + 1}`, durationMs: 3000,
            cameraPosition: [0, -8, 3], lookAt: [0, 0, 1], fov: 60, subtitle: '' }] }, 'Add cinematic shot')}><Plus size={15}/> Add shot</button></div>
      <div className="analysis-actions"><button type="button" onClick={()=>exportScript('cinematic')}><Download size={15}/> Export cinematic .hsc</button><button type="button" onClick={()=>exportScript('cinematic',true)}>Export required camera points</button></div>
      {studio.shots.length === 0 && <p className="studio-empty">No camera shots yet. Create a timeline for your mission's intro or ending.</p>}
      {studio.shots.map((shot, i) => <div className="studio-record" key={shot.id}>
        <div className="studio-record-heading"><strong>{String(i + 1).padStart(2, '0')} · {shot.name || 'Untitled shot'}</strong><Pill>{(shot.durationMs / 1000).toFixed(1)}s</Pill>
          <button type="button" aria-label={`Remove shot ${i + 1}`} onClick={() => change({ ...studio, shots: studio.shots.filter(s => s.id !== shot.id) }, 'Remove cinematic shot')}><Trash2 size={15}/></button></div>
        <div className="studio-fields"><label>Name<input maxLength={120} value={shot.name} onChange={e => updateShot(shot.id, { name: e.target.value })}/></label>
          <label>Duration (ms)<NumberField label="Duration" value={shot.durationMs} min={100} max={600000} step={100} onCommit={n => updateShot(shot.id, { durationMs: Math.round(n) })}/></label>
          <label>FOV (degrees)<NumberField label="FOV" value={shot.fov} min={10} max={140} onCommit={n => updateShot(shot.id, { fov: n })}/></label></div>
        <label className="studio-wide">Sapien cutscene_camera_point name<input maxLength={31} spellCheck={false} placeholder="gs_shot_01" value={shot.cameraMarker ?? ''} onChange={e=>updateShot(shot.id,{cameraMarker:e.target.value})}/></label>
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
