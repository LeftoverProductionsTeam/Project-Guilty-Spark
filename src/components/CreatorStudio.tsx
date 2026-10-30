import { useState } from 'react';
import { Camera, ClipboardCheck, Download, Film, Flag, Plus, Server, ShieldCheck, Trash2 } from 'lucide-react';
import type { MapInspection, Project, Vec3 } from '../types';
import {
  emptyCreatorStudio, exportStudioEvidence, validateCreatorStudio,
} from '../creatorStudio';
import type { CameraShot, CreatorStudioDocument, MissionBeat, PlaytestRecord } from '../creatorStudio';
import { Notice, NumberField, PageTitle, Pill } from './ui';
import { exportHaloCeMission, exportHaloCeCinematic, exportHaloCeFirefight, scriptManifest } from '../haloScript';
import type { ScriptExport } from '../haloScript';
import { sourceZip } from '../sourceZip';
import { assembleHceekSourcePack } from '../hceekSourcePack';
import type { Activation } from '../hceekSourcePack';
import { inspectScenarioBindings } from '../scenarioBindings';
import MultiplayerWorkbench from './MultiplayerWorkbench';
import {makeFiveModeTestPlan, seedFiveModePlaytests} from '../haloModeTestPlan';
import {forgeTargets} from '../forge';
import PowerupStudio from './PowerupStudio';
import {useMapState} from '../mapSession';
import ExternalBrowserLink from './ExternalBrowserLink';

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
export default function CreatorStudio({ project, inspection, edit, notify, onOpenRuntimes, onBuild }: {
  project: Project;
  inspection: MapInspection | null;
  edit: (next: Project, description: string) => void;
  notify: (message: string, tone?: string) => void;
  onOpenRuntimes: () => void;
  onBuild: () => void;
}) {
  const [pane, setPane] = useMapState<Pane>(project.id,'creator-studio-pane','mission');
  const [scriptActivation,setScriptActivation]=useState<Activation>('none');
  const [error, setError] = useState('');
  const studio = project.studio ?? emptyCreatorStudio();
  const bindingChecks = (() => {
    const scripts: ScriptExport[]=[];
    try { if(studio.missions.length) scripts.push(exportHaloCeMission(studio)); } catch { /* incomplete authoring has no safe export yet */ }
    try { if(studio.shots.length) scripts.push(exportHaloCeCinematic(studio)); } catch { /* unresolved marker */ }
    try { if(project.firefight) scripts.push(exportHaloCeFirefight(project.firefight)); } catch { /* invalid/endless wave authoring */ }
    const validSource = inspection?.sha256 && inspection.sha256 === project.source?.sha256;
    return inspectScenarioBindings(scripts, validSource ? inspection : null);
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
  function updateBeat(id: string, patch: Partial<MissionBeat>) {
    change({ ...studio, missions: studio.missions.map(m => m.id === id ? { ...m, ...patch } : m) }, 'Update mission beat');
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
      <p>Places your generated scripts under the matching <code>data/levels/quickforge/.../scripts/</code> folder inside a review-only ZIP. Requires a QuickForge singleplayer Firefight/Zombie source project and separately owned editing tools. No Halo files are modified.</p>
      <div className="studio-fields"><label>Script startup (optional)
        <select aria-label="HCEEK startup selection" value={scriptActivation} onChange={e=>setScriptActivation(e.target.value as Activation)}>
          <option value="none">None — manual activation</option>
          <option value="mission">Start mission only (review first)</option>
          <option value="firefight">Start finite Firefight only (review first)</option>
        </select></label></div>
      <button type="button" onClick={exportHceekTree}><Download size={15}/> Export HCEEK source tree ZIP</button>
      <small className="studio-hint">The official compiler and actual target game must independently validate the scripts, BSP, AI, lighting and network behavior.</small>
    </div></details>
    {bindingChecks.length>0 && <details className="analysis-card studio-bindings"><summary>Scenario references · {bindingChecks.length} to check</summary>
      <p>Imported map names are evidence only; your editable scenario must still be compiled and playtested.</p>
      {bindingChecks.map(check => <div className="squad-row" key={check.dependency}>
        <span><code>{check.dependency}</code> — {check.detail}</span>
        <Pill tone={check.status==='presentInImportedCache'?'green':'muted'}>{check.status}</Pill>
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
      <div className="analysis-actions"><button type="button" onClick={()=>exportScript('mission')}><Download size={15}/> Export mission .hsc</button><button type="button" onClick={()=>exportScript('mission',true)}>Export required tags list</button></div>
      {studio.missions.length === 0 && <p className="studio-empty">No authored mission beats. Add an objective to start a custom campaign flow.</p>}
      {studio.missions.map((beat, i) => <div className="studio-record" key={beat.id}>
        <div className="studio-record-heading"><strong>{String(i + 1).padStart(2, '0')} · {beat.title || 'Untitled beat'}</strong><button type="button" aria-label={`Remove beat ${i + 1}`} onClick={() => change({ ...studio, missions: studio.missions.filter(m => m.id !== beat.id) }, 'Remove mission beat')}><Trash2 size={15}/></button></div>
        <div className="studio-fields"><label>Title<input maxLength={120} value={beat.title} onChange={e => updateBeat(beat.id, { title: e.target.value })}/></label>
        <label title="Choose when this objective starts. Volumes and encounters must have the same names in your editable scenario.">Trigger<select value={beat.trigger} onChange={e => updateBeat(beat.id, { trigger: e.target.value as MissionBeat['trigger'] })}>
          <option value="manual">Manually advanced</option><option value="triggerVolume">Trigger volume (needs scenario binding)</option>
          <option value="encounterCleared">Encounter cleared (needs AI binding)</option><option value="timer">Timer (needs script binding)</option></select></label>
        <label title="The encounter name from Sapien’s AI hierarchy; this does not create or place actors by itself.">Encounter name (optional)<input maxLength={128} value={beat.encounterName} placeholder="scenario encounter reference" onChange={e => updateBeat(beat.id, { encounterName: e.target.value })}/></label></div>
        {beat.trigger === 'manual' && <p className="subtle">Mission waits at this beat until another HaloScript trigger calls <code>gs_complete_{i+1}</code>.</p>}
        {beat.trigger === 'triggerVolume' && <label>Scenario trigger-volume identifier<input maxLength={31} spellCheck={false} placeholder="gs_entry_volume" value={beat.triggerRef ?? ''} onChange={e => updateBeat(beat.id, {triggerRef:e.target.value})}/></label>}
        {beat.trigger === 'timer' && <label>Delay (seconds)<NumberField label="Mission beat delay seconds" min={1} max={600} value={beat.timerSeconds ?? 5} step={1} onCommit={n => updateBeat(beat.id,{timerSeconds:Math.round(n)})}/></label>}
        <label className="studio-wide">Objective / direction<textarea value={beat.objective} rows={2} maxLength={2048} onChange={e => updateBeat(beat.id, { objective: e.target.value })}/></label>
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
