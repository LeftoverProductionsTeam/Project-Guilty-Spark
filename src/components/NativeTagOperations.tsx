import NativeVehicleFlight from './NativeVehicleFlight';
import NativeTransportAppend from './NativeTransportAppend';
import NativeFactionKits from './NativeFactionKits';
import NativeCommandLists from './NativeCommandLists';
import {NATIVE_COMMAND_VIEW} from '../nativeOperations';
import type {NativeCommandDraft} from '../nativeOperations';
import NativeDevicePlacements from './NativeDevicePlacements';
import {NATIVE_DEVICE_VIEW} from '../nativeDevicePlacement';
import type {NativeDeviceView} from '../nativeDevicePlacement';
import NativeTriggerVolumes from './NativeTriggerVolumes';
import {NATIVE_VOLUME_VIEW} from '../nativeTriggerVolume';
import type {NativeVolumeView} from '../nativeTriggerVolume';
import { useCallback, useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import type { Project } from '../types';
import {
  notifyNativeSource, campaignTacticalModes,campaignMccSearchReview,
  type NativeCombatSource,
  type NativeOperation,
  type NativeEncounterAppend,
  type NativeTagContext,
  type NativePreview,
  type NativeAccepted,
  type NativeDependencies,
} from '../nativeOperations';
import { Notice, Pill } from './ui';
import './nativeTools.css';
import BaboonTools from './BaboonTools';
import NativeSquadScaling from './NativeSquadScaling';
import NativeSquadBehaviorEditor from './NativeSquadBehavior';
import NativeSquadPatrol from './NativeSquadPatrol';
import NativeCutsceneCameras,{NativeObjectiveFlags} from './NativeCutsceneCameras';
import {NATIVE_CAMERA_VIEW} from '../nativeCutsceneCamera';
import type {NativeCameraView} from '../nativeCutsceneCamera';
import NativeStartingPositions from './NativeStartingPositions';
import {useMapState} from '../mapSession';
import {NATIVE_AI_START_VIEW,nativeAiStartMatches} from '../nativeAiStart';
import type {NativeAiStartView} from '../nativeAiStart';

/** Lazy, map-bound native operations. Reading a compiled tag does not grant
 * editing access to its native source; the desktop checks that separately. */
export default function NativeTagOperations({
  project,
  tagId,
  dirty = false,
  epoch = 0,
  onLevelEditor,
  workspace = false,
}: {
  project: Project;
  tagId?: number;
  dirty?: boolean;
  epoch?: number;
  onLevelEditor?:()=>void;
  workspace?:boolean;
}) {
  const [expanded, setExpanded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [context, setContext] = useState<NativeTagContext | null>(null),
    [radius, setRadius] = useState('');
  const [preview, setPreview] = useState<NativePreview | null>(null),
    [accepted, setAccepted] = useState<NativeAccepted | null>(null),
    [dependencies, setDependencies] = useState<NativeDependencies | null>(null);
  const [encounterName,setEncounterName]=useState('gs_source_actor'),[actorPath,setActorPath]=useState(''),
    [actorPosition,setActorPosition]=useState<[string,string,string]>(['0','0','0']),[startActive,setStartActive]=useState(false),
    [actorCount,setActorCount]=useState('1'),[actorSpacing,setActorSpacing]=useState('0.75');
  const [squadKey,setSquadKey]=useState(''),[normalCount,setNormalCount]=useState(''),[insaneCount,setInsaneCount]=useState('');
  const [normalScale,setNormalScale]=useState(1),[insaneScale,setInsaneScale]=useState(1);
  const [tacticalGroups,setTacticalGroups]=useState<NativeCombatSource['groups']|null>(null),[tacticalMode,setTacticalMode]=useState<typeof campaignTacticalModes[number]>('attacking');
  const squadChoice=context?.scenarioSquads?.find(row=>`${row.encounter}:${row.squad}`===squadKey);
  useEffect(()=>{
    setNormalCount(squadChoice?.normalCount.toString()??'');setInsaneCount(squadChoice?.insaneCount.toString()??'');
    setNormalScale(1);setInsaneScale(1);
  },[squadChoice]);
  const squadEditIssue=context?.squadEditIssue??(squadChoice&&context?.protectedSquadEncounters?.some(name=>name===squadChoice.encounterName.replace(/[A-Z]/g,char=>char.toLowerCase()))
    ?'Direct count edits are unavailable for this recipe-owned group. Change population in its original authoring workflow; manually appended groups require source reconciliation.':null);
  const validCounts=!!squadChoice&&[normalCount,insaneCount].every(value=>value.trim()!==''&&Number.isInteger(Number(value))&&Number(value)>=0&&Number(value)<=32);
  const populationChanged=!!squadChoice&&(Number(normalCount)!==squadChoice.normalCount||Number(insaneCount)!==squadChoice.insaneCount);
  const canScale=!!squadChoice&&squadChoice.normalCount>=0&&squadChoice.insaneCount>=0;
  const scaledNormal=squadChoice&&canScale?Math.min(32,Math.round(squadChoice.normalCount*normalScale)):0;
  const scaledInsane=squadChoice&&canScale?Math.min(32,Math.round(squadChoice.insaneCount*insaneScale)):0;
  const tacticalSource=context?.scenarioCombat?.find(row=>row.encounter===squadChoice?.encounter)?.squads.find(row=>row.index===squadChoice?.squad&&row.name===squadChoice?.name);
  useEffect(()=>{setTacticalGroups(tacticalSource?structuredClone(tacticalSource.groups):null);},[context?.tagSha256,squadKey,JSON.stringify(tacticalSource?.groups)]);
  const tacticalReview=tacticalGroups?campaignMccSearchReview({groups:tacticalGroups}):null;
  const tacticalChanged=!!tacticalGroups&&!!tacticalSource&&JSON.stringify(tacticalGroups)!==JSON.stringify(tacticalSource.groups);
  const tacticalIssue=context?.combatEditIssue??squadEditIssue;
  const tacticalBlocked=busy||dirty||!!tacticalIssue;
  const tacticalLabel=(s:string)=>s.replace(/[A-Z]/g,c=>' '+c.toLowerCase()).replace(/^./,c=>c.toUpperCase());
  const [hudArray,setHudArray]=useState(''),[hudIndex,setHudIndex]=useState('0');
  const hudGroup=context?.hudArrays?.find(array=>array.name===hudArray);
  const canDuplicateHudDraft=!!context?.canDuplicateHud&&/^[a-f0-9]{64}$/i.test(context.tagSha256??'')&&hudIndex.trim()!==''&&!!hudGroup&&hudGroup.count!=null&&hudGroup.count>0&&hudGroup.count<hudGroup.maximum&&Number.isInteger(Number(hudIndex))&&Number(hudIndex)>=0&&Number(hudIndex)<hudGroup.count;
  const [encounterQueue,setEncounterQueue]=useState<NativeEncounterAppend[]>([]);
  const queuedActors=encounterQueue.reduce((sum,entry)=>sum+(entry.count??1),0);
  const validEncounterDraft=!!context?.canAppendEncounter&&context.actorVariants?.includes(actorPath)&&/^[A-Za-z0-9_]{1,31}$/.test(encounterName)&&Number.isInteger(Number(actorCount))&&Number(actorCount)>=1&&Number(actorCount)<=32&&actorSpacing.trim()!==''&&Number.isFinite(Number(actorSpacing))&&Number(actorSpacing)>=0.25&&Number(actorSpacing)<=16&&actorPosition.every(v=>v.trim()!==''&&Number.isFinite(Number(v))&&Math.abs(Number(v))<=2048);
  const encounterDraft=():NativeEncounterAppend=>({name:encounterName,actorPath,position:actorPosition.map(Number) as [number,number,number],startActive,count:Number(actorCount),spacing:Number(actorSpacing)});
  const generation = useRef(0),proposalGeneration=useRef(0);
  function invalidateProposal(){proposalGeneration.current++;if(!accepted)setPreview(null);}
  const projectId = project.id;
  const ceSource=context?.sourceTarget==='gbx-custom'||project.buildTargets?.some(target=>target.id===project.activeBuildTarget&&['haloCustomEdition','chupathingyCe'].includes(target.runtimeId));
  const [nativeTag, setNativeTag] = useState<number | null>(null),
    [choices, setChoices] = useState<{ id: number; class: string; path: string }[]>([]);
  const selectedTagId = tagId ?? nativeTag;
  const [commandView]=useMapState<NativeCommandDraft|null>(project.id,NATIVE_COMMAND_VIEW,()=>null);
  const [deviceView]=useMapState<NativeDeviceView|null>(project.id,NATIVE_DEVICE_VIEW,()=>null);
  const [volumeView]=useMapState<NativeVolumeView|null>(project.id,NATIVE_VOLUME_VIEW,()=>null);
  const [cameraView]=useMapState<NativeCameraView|null>(project.id,NATIVE_CAMERA_VIEW,()=>null);
  const [aiDraft]=useMapState<NativeAiStartView|null>(project.id,NATIVE_AI_START_VIEW,()=>null);
  useEffect(()=>{if(tagId===undefined&&(aiDraft?.reviewRequest||cameraView?.reviewRequest||volumeView?.reviewRequest||deviceView?.reviewRequest||commandView?.reviewRequest)){setNativeTag(null);setExpanded(true);}},[project.id,tagId,aiDraft?.reviewRequest,cameraView?.reviewRequest,volumeView?.reviewRequest,deviceView?.reviewRequest,commandView?.reviewRequest]);
  useEffect(()=>{if(context&&aiDraft?.kind==='patrol'&&aiDraft.reviewRequest&&nativeAiStartMatches(aiDraft,context))setSquadKey(`${aiDraft.encounter}:${aiDraft.squad}`);},[context,aiDraft?.reviewRequest]);
  useEffect(() => {
    setNativeTag(null);
    setChoices([]);
  }, [projectId, tagId]);
  useEffect(() => {
    if (!expanded || tagId !== undefined || !native) return;
    let active = true;
    void call<typeof choices>('native_tag_inventory', { projectId })
      .then((rows) => {
        if (active) setChoices(rows);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [expanded, projectId, tagId, project.builds.length]);
  const refresh = useCallback(async () => {
    if (!native) return;
    const current = generation.current;
    try {
      const result = await call<NativeTagContext>('native_tag_context', { projectId, tagId: selectedTagId });
      if (current !== generation.current) return;
      setContext(result);
      setSquadKey(key=>result.scenarioSquads?.some(row=>`${row.encounter}:${row.squad}`===key)?key:result.scenarioSquads?.[0]?`${result.scenarioSquads[0].encounter}:${result.scenarioSquads[0].squad}`:'');
      setRadius(result.boundingRadius?.toString() ?? '');
      setHudArray(previous=>result.hudArrays?.some(array=>array.name===previous)?previous:result.hudArrays?.find(array=>array.count!=null&&array.count>0&&array.count<array.maximum)?.name??result.hudArrays?.[0]?.name??'');
      setHudIndex('0');
    } catch (e) {
      if (current === generation.current) {
        setContext(null);
        setError(String(e));
      }
    }
  }, [projectId, selectedTagId]);
  useEffect(() => {
    generation.current++;
    setContext(null);
    setPreview(null);
    setAccepted(null);
    setDependencies(null);
    setError('');
    setBusy(false);
    setEncounterQueue([]);setHudArray('');setHudIndex('0');setSquadKey('');
    setEncounterName('gs_source_actor');setActorPath('');setActorPosition(['0','0','0']);setStartActive(false);setActorCount('1');setActorSpacing('0.75');
    return () => {
      generation.current++;
    };
  }, [projectId, selectedTagId, epoch]);
  useEffect(() => {
    if (expanded) void refresh();
  }, [expanded, refresh, epoch, project.builds.length]);
  async function perform(work: (current: number) => Promise<void>) {
    const current = generation.current;
    setBusy(true);
    setError('');
    try {
      await work(current);
    } catch (e) {
      if (current === generation.current) setError(String(e));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  function makePreview(operation: NativeOperation) {
    if (dirty) return;
    const proposal=++proposalGeneration.current;
    void perform(async (current) => {
      const result = await call<NativePreview>('native_operation_preview', {
        projectId,
        tagId: selectedTagId,
        operation,
      });
      if (current !== generation.current||proposal!==proposalGeneration.current) return;
      setPreview(result);
      setAccepted(null);
    });
  }
  function accept(restore = false) {
    if (!preview || dirty) return;
    void perform(async (current) => {
      const result = await call<NativeAccepted>('native_operation_accept', {
        projectId,
        operationId: preview.id,
        restore,
      });
      notifyNativeSource(projectId);
      if (current !== generation.current) return;
      setAccepted(result);
      setPreview({ ...preview, currentState: restore ? 'before' : 'after' });
      await refresh();
    });
  }
  return (
    <details className={'native-tag-operations'+(workspace?' native-source-workspace':'')} open={expanded} onToggle={(e) => setExpanded(e.currentTarget.open)}>
      <summary>
        {workspace?'Edit native scenario & assets':'Invader · native checks & reviewed edits'} <Pill>Working source</Pill>
      </summary>
      <p className="subtle">
        {workspace?'Preview → review → accept a source revision. Save, then rebuild to update the map.':'Check native dependencies or preview a specific tag edit. Accepted edits become a separate source revision; use Build working tag edits to compile a new map.'}
      </p>
      {!native && <Notice tone="info">Open the desktop app to use installed native tools.</Notice>}
      {context&&<code className="native-tag-path">{context.tag}</code>}
      {tagId === undefined && choices.length > 0 && (
        <label className="native-history">
          Native tag
          <select
            aria-label="Native tag"
            value={nativeTag ?? ''}
            disabled={busy}
            onChange={(e) => setNativeTag(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">Map scenario</option>
            {choices.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.class} · {tag.path}
              </option>
            ))}
          </select>
        </label>
      )}
      {context && (
        <>
          {!!context.history.length && (
            <label className="native-history">
              Retained previews &amp; recovery
              <select
                aria-label="Retained native previews"
                value={preview?.id ?? ''}
                onChange={(e) => {
                  setPreview(context.history.find((item) => item.id === e.target.value) ?? null);
                  setAccepted(null);
                }}
              >
                <option value="">Choose a retained edit…</option>
                {context.history.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fieldChanges[0]?.after.trim()} ·{' '}
                    {item.currentState === 'after'
                      ? 'current tag matches edit'
                      : item.currentState === 'before'
                        ? 'current tag matches original'
                        : 'later changes need review'}{' '}
                    · {item.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="button-row">
            <button
              type="button"
              disabled={busy || !native}
              onClick={() =>
                void perform(async (current) => {
                  const result = await call<NativeDependencies>('native_dependency_check', {
                    projectId,
                    tagId: selectedTagId,
                  });
                  if (current === generation.current) setDependencies(result);
                })
              }
            >
              Check native dependencies
            </button>
            <button type="button" disabled={busy} onClick={() => void refresh()}>
              Refresh source
            </button>
          </div>
          <div className="native-source-editors">
          {context.class==='scnr'&&<details className="native-squad-difficulty">
            <summary>Existing squads, difficulty &amp; tactics</summary>
            <p className="subtle">Edit the native normal/insane population fields of an existing squad. The engine controls how those fields affect difficulty. AI damage, health and automatic player-count scaling require their own runtime support.</p>
            {squadEditIssue&&<Notice tone="info">{squadEditIssue}</Notice>}
            {!!context.scenarioSquads?.length?<><label>Encounter / squad<select aria-label="Native source squad" value={squadKey} disabled={busy||dirty}
              onChange={event=>{setSquadKey(event.target.value);if(!accepted)setPreview(null);}}>
              {context.scenarioSquads.map(row=><option key={`${row.encounter}:${row.squad}`} value={`${row.encounter}:${row.squad}`}>
                {row.encounterName||'Unnamed encounter'} / {row.name||'Unnamed squad'} · {row.encounter}:{row.squad}
              </option>)}
            </select></label>
              {squadChoice&&<>
                <div className="native-field-edit">
                  <label>Normal field · currently {squadChoice.normalCount}<input type="number" min={0} max={32} step={1} value={normalCount} disabled={busy||dirty||!!squadEditIssue}
                    onChange={event=>{setNormalCount(event.target.value);if(!accepted)setPreview(null);}}/></label>
                  <label>Insane field · currently {squadChoice.insaneCount}<input type="number" min={0} max={32} step={1} value={insaneCount} disabled={busy||dirty||!!squadEditIssue}
                    onChange={event=>{setInsaneCount(event.target.value);if(!accepted)setPreview(null);}}/></label>
                </div>
                <details><summary>Scale squad population</summary>
                  <p className="subtle">Multipliers start from this source revision's counts, round to whole actors and cap each field at32. Review the resulting counts before accepting; this does not change the number of authored starting positions.</p>
                  <label>Normal population × {normalScale.toFixed(2)}<input aria-label="Normal squad population multiplier" type="range" min={0} max={4} step={0.25} value={normalScale}
                    disabled={busy||dirty||!canScale||!!squadEditIssue} onChange={event=>setNormalScale(Number(event.target.value))}/></label>
                  <label>Insane population × {insaneScale.toFixed(2)}<input aria-label="Insane squad population multiplier" type="range" min={0} max={4} step={0.25} value={insaneScale}
                    disabled={busy||dirty||!canScale||!!squadEditIssue} onChange={event=>setInsaneScale(Number(event.target.value))}/></label>
                  {canScale?<p role="status">Normal: {squadChoice.normalCount} → {scaledNormal} · Insane: {squadChoice.insaneCount} → {scaledInsane}</p>
                    :<p className="subtle">This source uses a negative/unset count. Preview and accept explicit native counts first; then scale that source revision.</p>}
                  <button disabled={busy||dirty||!canScale||!!squadEditIssue} onClick={()=>{setNormalCount(String(scaledNormal));setInsaneCount(String(scaledInsane));if(!accepted)setPreview(null);}}>Use scaled counts</button>
                </details>
                <button disabled={busy||dirty||!!squadEditIssue||!validCounts||!populationChanged||!/^[a-f0-9]{64}$/i.test(context.tagSha256??'')}
                  onClick={()=>makePreview({kind:'encounterSquadCounts',encounter:squadChoice.encounter,squad:squadChoice.squad,
                    encounterName:squadChoice.encounterName,squadName:squadChoice.name,normalCount:Number(normalCount),insaneCount:Number(insaneCount),sourceSha256:context.tagSha256!})}>Preview squad counts</button>
                <NativeSquadPatrol context={context} squadChoice={squadChoice} source={tacticalSource?.patrol} behavior={tacticalSource?.behavior} issue={tacticalSource?.patrolIssue??context.combatEditIssue??squadEditIssue} busy={busy} dirty={dirty} onPreview={makePreview} onDraftChange={invalidateProposal} onLevelEditor={onLevelEditor}/>
                <NativeSquadBehaviorEditor context={context} squadChoice={squadChoice} source={tacticalSource?.behavior} issue={tacticalSource?.behaviorIssue??context.combatEditIssue??squadEditIssue} busy={busy} dirty={dirty} onPreview={makePreview} onDraftChange={invalidateProposal}/>
                <details className="native-tactical-groups"><summary>Native tactical firing groups</summary>
                  <p className="subtle">Choose which existing encounter firing groups this squad may use when attacking/searching/guarding/defending. This does not create positions or force movement, cover or line of sight.</p>
                  {tacticalIssue&&<Notice tone="info">{tacticalIssue}</Notice>}
                  {tacticalGroups&&tacticalSource?<><label>Tactical context<select aria-label="Native tactical context" value={tacticalMode} disabled={tacticalBlocked} onChange={e=>setTacticalMode(e.target.value as typeof tacticalMode)}>{campaignTacticalModes.map(mode=><option key={mode} value={mode}>{tacticalLabel(mode)}</option>)}</select></label>
                    <fieldset disabled={tacticalBlocked}><legend>Eligible native groups</legend><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(2.3rem,1fr))',gap:4}}>{Array.from({length:26},(_,i)=>String.fromCharCode(97+i)).map(g=><label key={g} style={{display:'flex',alignItems:'center',gap:3}}><input type="checkbox" aria-label={'Native firing group '+g.toUpperCase()+' for '+tacticalLabel(tacticalMode)} checked={tacticalGroups[tacticalMode].includes(g)} onChange={e=>{const values=tacticalGroups[tacticalMode];setTacticalGroups({...tacticalGroups,[tacticalMode]:e.target.checked?[...values,g].sort():values.filter(v=>v!==g)});invalidateProposal();}}/>{g.toUpperCase()}</label>)}</div></fieldset>
                    <p className="subtle">{tacticalGroups[tacticalMode].length?tacticalGroups[tacticalMode].join(', ').toUpperCase():'No groups eligible'}. Draft selections are not accepted native source.</p>
                    <details><summary>MCC search-group compatibility</summary><p className="subtle">The pinned MCC compiler includes attacking groups in both search contexts. Proposed attacking search: {tacticalReview?.groups.attackingSearch.join(', ').toUpperCase()||'none'}; defending search: {tacticalReview?.groups.defendingSearch.join(', ').toUpperCase()||'none'}. Apply to this draft explicitly; source changes only after Preview and Accept. Other compilers require separate verification.</p><button disabled={tacticalBlocked||!tacticalReview?.changed} onClick={()=>{if(tacticalReview){setTacticalGroups(tacticalReview.groups);invalidateProposal();}}}>Include attacking groups in both search contexts</button></details>
                    <div className="button-row"><button disabled={tacticalBlocked||!tacticalChanged||context.sourceTarget==='mcc-cea'&&!!tacticalReview?.changed||!/^[a-f0-9]{64}$/i.test(context.tagSha256??'')} onClick={()=>makePreview({kind:'encounterSquadFiringGroups',encounter:squadChoice.encounter,squad:squadChoice.squad,encounterName:squadChoice.encounterName,squadName:squadChoice.name,groups:structuredClone(tacticalGroups),sourceSha256:context.tagSha256!})}>Preview native tactical groups</button><button disabled={busy||!tacticalChanged} onClick={()=>{setTacticalGroups(structuredClone(tacticalSource.groups));invalidateProposal();}}>Reset tactical draft</button></div>
                    {context.sourceTarget==='mcc-cea'&&tacticalReview?.changed&&<p className="subtle">Review MCC search-group compatibility before previewing this target's changes.</p>}
                    <p className="subtle">Preview → inspect exact changed bits → Accept as new source revision. Restore before-edit tag restores that revision's original source. Save/restart and build working tag edits; compiled masks must match. Project Undo does not reverse an accepted native revision.</p>
                  </>:!tacticalIssue&&<p className="subtle">Tactical source telemetry unavailable. Refresh native source controls; no zero masks are assumed.</p>}
                </details>
                <p className="subtle">Review below → Accept as new source revision → Build working tag edits (CE source uses Build CE working tag edits). Restore before-edit tag reverses this source revision. Draft count fields are not project edits or a running-game change.</p>
              </>}
            </>:!context.squadEditIssue&&<p className="subtle">This native scenario has no existing squads. Use encounter authoring to add them.</p>}
            {!!context.scenarioSquads?.length&&<NativeSquadScaling context={context} busy={busy} dirty={dirty} onPreview={makePreview} onDraftChange={invalidateProposal}/>}
          </details>}
          {context.class==='vehi'&&<NativeVehicleFlight context={context} busy={busy} dirty={dirty} onPreview={makePreview} onDraftChange={invalidateProposal}/>}
          {context.class==='vehi'&&<details className="native-vehicle-seats"><summary>Native vehicle seats</summary><p className="subtle">Read-only native seat labels, in source order. In Campaign source, Logic / Events → AI vehicle seating uses a case-sensitive part of a label. Each matching row is one seat; duplicate labels are separate seats. Build verifies capacity. Actual occupancy, AI driving and animations require gameplay testing.</p>{context.vehicleSeatIssue&&<Notice>{context.vehicleSeatIssue}</Notice>}{context.vehicleSeats&&<><ol>{context.vehicleSeats.map((label,index)=><li key={index}><code>{label||'(unnamed seat)'}</code></li>)}</ol>{!context.vehicleSeats.length&&<p>This vehicle has no native seats.</p>}</>}</details>}
          {context.class==='scnr'&&<NativeFactionKits context={context} busy={busy} dirty={dirty} onPreview={makePreview} onDraftChange={invalidateProposal}/>}
          {context.class==='scnr'&&<NativeTransportAppend context={context} busy={busy} dirty={dirty} onPreview={makePreview} onDraftChange={invalidateProposal}/>}
          {context.class==='scnr'&&<NativeCommandLists context={context} busy={busy} dirty={dirty} onPreview={makePreview} onDraftChange={invalidateProposal} onLevelEditor={project.quickForge?undefined:onLevelEditor}/>}
          {context.class==='scnr'&&<NativeDevicePlacements context={context} busy={busy} dirty={dirty} onPreview={makePreview} onDraftChange={invalidateProposal} onLevelEditor={project.quickForge?undefined:onLevelEditor}/>}
          {context.class==='scnr'&&<NativeTriggerVolumes context={context} busy={busy} dirty={dirty} onPreview={makePreview} onDraftChange={invalidateProposal} onLevelEditor={onLevelEditor}/>}
          {context.class==='scnr'&&<NativeObjectiveFlags context={context} busy={busy} dirty={dirty} onPreview={makePreview} onDraftChange={invalidateProposal} onLevelEditor={project.quickForge?undefined:onLevelEditor}/>}
          {context.class==='scnr'&&<NativeCutsceneCameras context={context} busy={busy} dirty={dirty} onPreview={makePreview} onDraftChange={invalidateProposal} onLevelEditor={project.quickForge?undefined:onLevelEditor}/>}
          {context.class==='scnr'&&<NativeStartingPositions kind="player" context={context} busy={busy} dirty={dirty} onPreview={makePreview} onDraftChange={invalidateProposal} onLevelEditor={project.quickForge?undefined:onLevelEditor}/>}
          {context.class==='scnr'&&<NativeStartingPositions context={context} busy={busy} dirty={dirty} onPreview={makePreview} onDraftChange={invalidateProposal} onLevelEditor={onLevelEditor}/>}
          {context.class==='scnr'&&<NativeStartingPositions kind="firing" context={context} busy={busy} dirty={dirty} onPreview={makePreview} onDraftChange={invalidateProposal} onLevelEditor={onLevelEditor}/>}
          {!!context.hudArrays?.length&&<details className="native-hud-structure">
            <summary>Duplicate native HUD element</summary>
            <p className="subtle">Append a copy of an existing element without moving original indices. Preview checks the copied fields and current dependencies. Accept the source revision, use Build working tag edits, then open the compiled HUD to edit its new layout. Your original tags stay unchanged.</p>
            <div className="native-field-edit">
              <label>Element group<select aria-label="Native HUD element group" value={hudArray} disabled={busy||dirty} onChange={event=>{setHudArray(event.target.value);setHudIndex('0');if(!accepted)setPreview(null);}}>
                <option value="">Choose a native group…</option>{context.hudArrays.map(array=><option key={array.name} value={array.name} disabled={array.count==null}>{array.label} · {array.count??'unavailable'} / {array.maximum}</option>)}
              </select></label>
              <label>Copy element<select aria-label="Native HUD source element" value={hudIndex} disabled={busy||dirty||!hudGroup?.count} onChange={event=>{setHudIndex(event.target.value);if(!accepted)setPreview(null);}}>
                {hudGroup?.count?Array.from({length:hudGroup.count},(_,index)=><option key={index} value={index}>Element {index+1}</option>):<option value="0">No source element</option>}
              </select></label>
              <button type="button" disabled={busy||dirty||!canDuplicateHudDraft} onClick={()=>makePreview({kind:'hudDuplicate',array:hudArray,index:Number(hudIndex),sourceSha256:context.tagSha256!})}>Preview HUD duplicate</button>
            </div>
            {hudGroup?.issue&&<p className="subtle">{hudGroup.issue}</p>}
            {hudGroup&&hudGroup.count!=null&&hudGroup.count===hudGroup.maximum&&<p className="subtle">This native group is full.</p>}
            {context.hudStructureIssue&&<Notice tone="info">{context.hudStructureIssue}</Notice>}
          </details>}
          {context.class==='scnr'&&<details className="native-encounter-authoring">
            <summary>Append native AI encounter</summary>
            <p className="subtle">Add one source-backed squad, or queue up to 16 named groups / 128 total starts for one reviewed source revision. Each squad has up to 32 starting and firing positions. Existing encounters stay in place. Accept, then Build working tag edits; collision and navigation still need native review.</p>
            {!context.canAppendEncounter&&<Notice tone="info">Requires unshared singleplayer CE/H1A working source with its matching reviewed native writer and build target. Multiplayer AI uses its runtime-specific path.</Notice>}
            <div className="native-encounter-actions">
              <button disabled={busy||dirty||!context.canAppendEncounter||!context.firefightPlan}
                title="Prepares saved source-bound wave groups with their authored zones. Preview only; no controller, loadout or source revision is applied until separately reviewed."
                onClick={()=>context.firefightPlan&&makePreview(context.firefightPlan)}>Preview saved Firefight groups</button>
            </div>
            {context.firefightPlan&&<p className="subtle">{context.firefightPlan.encounters.length} saved groups · {context.firefightPlan.encounters.reduce((sum,entry)=>sum+(entry.count??1),0)} starts. Shared zones use partitioned grids. Existing player equipment is retained; review all source positions and native navigation before gameplay.</p>}
            {context.firefightPlanIssue&&<p className="subtle">Saved-group preparation: {context.firefightPlanIssue}. Manual encounter authoring remains separate.</p>}
            <label>Encounter name<input aria-label="Native encounter name" maxLength={31} value={encounterName} disabled={busy||dirty} onChange={e=>{setEncounterName(e.target.value);if(!accepted)setPreview(null);}}/></label>
            <label>Actor variant<select aria-label="Native encounter actor" value={actorPath} disabled={busy||dirty} onChange={e=>{setActorPath(e.target.value);if(!accepted)setPreview(null);}}>
              <option value="">Choose an actor from this source…</option>{context.actorVariants?.map(path=><option key={path} value={path}>{path}</option>)}
            </select></label>
            {!context.actorVariants?.length&&<p className="subtle">No indexed actor variant has an available file in this working tagset. Recover/build compatible actor source with its dependencies first.</p>}
            <div className="native-encounter-squad">
              <label>Actors<input aria-label="Native squad actor count" type="number" min={1} max={32} step={1} value={actorCount} disabled={busy||dirty} onChange={e=>{setActorCount(e.target.value);if(!accepted)setPreview(null);}}/></label>
              <label>Spacing<input aria-label="Native squad spacing" type="number" min={0.25} max={16} step={0.25} value={actorSpacing} disabled={busy||dirty} onChange={e=>{setActorSpacing(e.target.value);if(!accepted)setPreview(null);}}/></label>
            </div>
            <p className="subtle">Starts use an X/Y grid centered below, with spacing in native world units. Review every position in the preview; spacing is not collision or pathfinding validation.</p>
            <fieldset><legend>Native spawn grid center</legend><div className="native-encounter-position">{(['X','Y','Z'] as const).map((axis,index)=><label key={axis}>{axis}<input aria-label={'Native actor '+axis} type="number" step="0.25" min={-2048} max={2048} disabled={busy||dirty} value={actorPosition[index]} onChange={e=>{setActorPosition(old=>old.map((v,i)=>i===index?e.target.value:v) as [string,string,string]);if(!accepted)setPreview(null);}}/></label>)}</div></fieldset>
            <label><input type="checkbox" checked={startActive} disabled={busy||dirty} onChange={e=>{setStartActive(e.target.checked);if(!accepted)setPreview(null);}}/>Allow initial creation</label>
            <p className="subtle">Unchecked keeps the new encounter not initially created. Activate its name through reviewed scenario HaloScript; this does not attach a Firefight controller or prove spawning.</p>
            <div className="native-encounter-actions">
              <button disabled={busy||dirty||!validEncounterDraft} onClick={()=>makePreview({kind:'appendEncounter',...encounterDraft()})}>Preview encounter append</button>
              <button disabled={busy||dirty||!validEncounterDraft||encounterQueue.length>=16||queuedActors+Number(actorCount)>128||encounterQueue.some(entry=>entry.name.toLowerCase()===encounterName.toLowerCase())}
                onClick={()=>{setEncounterQueue(rows=>[...rows,encounterDraft()]);setEncounterName('');setPreview(null);setAccepted(null);}}>Queue this encounter</button>
            </div>
            {!!encounterQueue.length&&<section aria-label="Reviewed encounter group list">
              <p className="subtle">{encounterQueue.length} groups · {queuedActors} starts. This is a temporary review list; Accept retains the resulting native source. Each name can then be bound to a Firefight wave through source-backed controller export after native build/readback.</p>
              <ol className="native-encounter-queue">{encounterQueue.map((entry,index)=><li key={entry.name}>
                <span><strong>{entry.name}</strong> · {entry.count} × {entry.actorPath}<small>{entry.position.join(' / ')} · spacing {entry.spacing} · {entry.startActive?'initially active':'script activation'}</small></span>
                <button aria-label={'Remove queued encounter '+entry.name} disabled={busy||dirty} onClick={()=>{setEncounterQueue(rows=>rows.filter((_,i)=>i!==index));setPreview(null);setAccepted(null);}}>Remove</button>
              </li>)}</ol>
              <button disabled={busy||dirty||!context.canAppendEncounter||encounterQueue.some(entry=>!context.actorVariants?.includes(entry.actorPath))} onClick={()=>makePreview({kind:'appendEncounters',encounters:encounterQueue})}>Preview all queued encounters</button>
              <button disabled={busy||dirty} onClick={()=>{setEncounterQueue([]);setPreview(null);setAccepted(null);}}>Clear review list</button>
            </section>}
          </details>}
          </div>
          {context.boundingRadius !== null && (
            <div className="native-field-edit">
              <label>
                Native bounding radius
                <input
                  aria-label="Native bounding radius"
                  type="number"
                  min="0"
                  max="100000"
                  step="0.01"
                  value={radius}
                  disabled={busy || dirty}
                  onChange={(e) => {
                    setRadius(e.target.value);
                    if (!accepted) setPreview(null);
                  }}
                />
              </label>
              <button
                type="button"
                disabled={
                  busy ||
                  dirty ||
                  !context.canEdit ||
                  radius.trim() === '' ||
                  !Number.isFinite(Number(radius)) ||
                  Number(radius) < 0 ||
                  Number(radius) > 100000 ||
                  Number(radius) === context.boundingRadius
                }
                onClick={() => makePreview({ kind: 'boundingRadius', value: Number(radius) })}
              >
                Preview radius edit
              </button>
            </div>
          )}
          {context.lensFlareScale !== null && (
            <div className="button-row">
              <span>Lens-flare rotation scale (Invader degrees): {context.lensFlareScale}</span>
              <button
                type="button"
                disabled={busy || dirty || !context.canRepair}
                onClick={() => makePreview({ kind: 'lensFlareScaleRepair' })}
              >
                Preview legacy 360-radian → 0 repair
              </button>
            </div>
          )}
          {(context.editIssue || context.repairIssue) && (
            <Notice tone="info">{context.editIssue ?? context.repairIssue}</Notice>
          )}
        </>
      )}
      {dirty && (
        <Notice tone="info">Save your Spark draft before previewing or accepting native edits.</Notice>
      )}
      {busy && <p role="status">Checking native source…</p>}
      {error && <Notice>{error}</Notice>}
      {dependencies && (
        <section aria-label="Native dependency result">
          <Pill tone={dependencies.complete ? 'green' : 'amber'}>
            {dependencies.complete ? 'References present' : 'Needs review'}
          </Pill>
          <p>{dependencies.detail}</p>
          <details>
            <summary>
              {dependencies.dependencies.length} native references · {dependencies.tool}
            </summary>
            <ul>
              {dependencies.dependencies.map((row) => (
                <li key={row.path}>
                  <code>{row.path}</code>
                  {(!row.present || row.reportedBroken) && ' · broken / missing'}
                </li>
              ))}
            </ul>
            <pre>{dependencies.output}</pre>
          </details>
        </section>
      )}
      {preview && (
        <section className="native-source-preview" aria-label="Native edit preview">
          <strong>{preview.tag}</strong>
          <p>{preview.detail}</p>
          <ul>
            {preview.fieldChanges.map((change, i) => (
              <li key={i}>
                <code>{change.before}</code> → <code>{change.after}</code>
              </li>
            ))}
          </ul>
          <p className="subtle">
            {preview.changedBytes} binary bytes differ. Writer: {preview.toolId}; the accepted revision
            retains the complete native file. Unexposed fields still require native review.
          </p>
          {!!preview.actorPositions?.length&&<details><summary>{preview.actorPositions.length} reviewed source positions</summary>
            <p className="subtle">These positions passed the native source scalar comparison. Game collision, navigation and spawning remain unverified.</p>
            <ol className="native-encounter-readback">{preview.actorPositions.map((position,index)=><li key={index}><code>{position.map(value=>value.toFixed(4)).join(' · ')}</code></li>)}</ol>
          </details>}
          <div className="button-row">
            <button
              type="button"
              disabled={busy || dirty || preview.currentState !== 'before'}
              onClick={() => accept()}
            >
              Accept as new source revision
            </button>
            <button
              type="button"
              disabled={busy || dirty || preview.currentState !== 'after'}
              onClick={() => accept(true)}
            >
              Restore before-edit tag
            </button>
          </div>
        </section>
      )}
      {accepted && (
        <Notice tone="info">
          {accepted.detail} {accepted.files.toLocaleString()} native files retained.
        </Notice>
      )}
      {context && !ceSource && tagId === undefined && (
        <BaboonTools project={project} tagId={selectedTagId ?? undefined} dirty={dirty} epoch={epoch} />
      )}
    </details>
  );
}
