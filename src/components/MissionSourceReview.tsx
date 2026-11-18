import { useEffect, useRef, useState } from 'react';
import type { MissionBeat } from '../creatorStudio';
import {emptyCreatorStudio,missionSoundProblems} from '../creatorStudio';
import {beginProjectMutation} from '../projectMutation';
import { applyNativeCampaignMission, reviewNativeCampaignMission, sameMissionData, sameCinematicData } from '../haloScript';
import type { NativeMissionReview } from '../haloScript';
import type { Project } from '../types';
import { Notice } from './ui';

function BeatView({side,beat,other,index}:{side:string;beat?:MissionBeat;other?:MissionBeat;index:number}) {
  const changed=(field:keyof MissionBeat)=>JSON.stringify(beat?.[field]??null)!==JSON.stringify(other?.[field]??null);
  const gameplay: {field:keyof MissionBeat;label:string;value:string}[]=beat?[
    {field:'encounterTeam',label:'Encounter team',value:beat.encounterTeam?{source:'Preserve authored team',human:'Human / UNSC',covenant:'Covenant',flood:'Flood'}[beat.encounterTeam]:beat.trigger==='escort'?'Legacy human team and player alliance':'Preserve authored team'},
    {field:'squadNumber',label:'Objective scope',value:beat.squadNumber==null?'Shared mission':'Forerunner squad '+beat.squadNumber},
    {field:'allowSharedPresentation',label:'Shared HUD / radio',value:beat.allowSharedPresentation?'Explicitly allowed':'Not opted in'},
    {field:'transportInsertion',label:'Rescue troop source',value:beat.transportInsertion?'First '+(beat.transportInsertion==='pelican'?'Pelican':'Spirit')+' insertion':beat.trigger==='escort'?'Mission spawns this group':'Not applicable'},
    {field:'minimumSurvivors',label:'Minimum survivors',value:beat.trigger==='escort'?String(beat.minimumSurvivors??1):'Not applicable'},
    {field:'escortRequiresPlayer',label:'Rescue arrival',value:beat.trigger!=='escort'?'Not applicable':beat.escortRequiresPlayer?'Survivors and a player':'Survivors'},
    {field:'escortFailure',label:'On rescue failure',value:beat.trigger!=='escort'?'Not applicable':beat.escortFailure==='continue'?'Continue to authored failure handling':'Stop mission; world stays active'},
    {field:'weaponPath',label:'Collected native weapon',value:beat.weaponPath||'Not selected'},
    {field:'conditionVolume',label:'Optional branch area',value:beat.conditionVolume||'No area condition'},
    {field:'conditionGroup',label:'Shared area decision',value:beat.conditionGroup||'Evaluate this objective separately'},
    {field:'conditionVisitDuring',label:'Collection objective to watch',value:beat.conditionVisitDuring||'No visit history'},
    {field:'conditionOutside',label:'Area condition',value:beat.conditionVolume==null?'No area condition':beat.conditionVisitDuring?beat.conditionOutside?'Not visited':'Visited':beat.conditionOutside?'Outside':'Inside'},
    {field:'conditionResult',label:'Earlier rescue result',value:beat.conditionResult?(beat.conditionResult.failed?'Failure':'Success')+' of '+beat.conditionResult.beatId:'No rescue-result condition'},
    {field:'guidance',label:'Objective waypoint',value:beat.guidance?(beat.guidance.object!=null?'Moving object: '+beat.guidance.object:'Location flag: '+beat.guidance.flag)+' · height '+beat.guidance.height:'Off'},
    {field:'soundCue',label:'Radio / native sound',value:beat.soundCue?[beat.soundCue.phase+' · gain '+beat.soundCue.gain+' · delay '+beat.soundCue.delayMs+' ms',beat.soundCue.soundPath,'Included asset: '+beat.soundCue.importId,'Caption: '+beat.soundCue.caption].join('\n'):'No sound cue'},
  ]:[];
  const differences=gameplay.filter(row=>changed(row.field)).length;
  return <section>
    <h4>{side}{beat?' · beat '+(index+1):''}</h4>
    {!beat?<p>No matching beat.</p>:<>
      {(['id','title','trigger','encounterName','triggerRef','timerSeconds','hudObjective','checkpoint','completeMission'] as const).map(field=><label key={field} data-changed={changed(field)||undefined}>
        {{id:'Identity',title:'Title',trigger:'Trigger',encounterName:'Encounter',triggerRef:'Volume',timerSeconds:'Delay (seconds)',hudObjective:'Native HUD objective',checkpoint:'Checkpoint request',completeMission:'Level completion request'}[field]}
        <input aria-label={side+' mission '+field} readOnly value={String(beat[field]??'')}/>
      </label>)}
      {beat.createWeaponObject&&<label data-changed={changed('createWeaponObject')||undefined}>Create native weapon<input aria-label={side+' mission create weapon'} readOnly value={beat.createWeaponObject}/></label>}
      {beat.cinematicCue&&<label data-changed={changed('cinematicCue')||undefined}>Camera scene<input aria-label={side+' mission camera scene'} readOnly value={beat.cinematicCue.phase+' · '+beat.cinematicCue.firstShotId+' → '+beat.cinematicCue.lastShotId}/></label>}
      <label data-changed={changed('objective')||undefined}>Objective / direction<textarea aria-label={side+' mission objective'} rows={3} readOnly value={beat.objective}/></label>
      <label data-changed={changed('hudText')||undefined}>HUD objective text<textarea aria-label={side+' mission HUD text'} rows={2} readOnly value={beat.hudText??''}/></label>
      <details className="mission-review-gameplay" open={differences>0}>
        <summary>Gameplay & conditions{differences?' · '+differences+' differences':''}</summary>
        <div className="studio-fields">{gameplay.map(({field,label,value})=><label key={field} data-changed={changed(field)||undefined}>
          {label}{changed(field)&&<small>Different from {side==='Local'?'source data':'local draft'}</small>}
          <textarea aria-label={side+' mission '+field} rows={field==='soundCue'?4:2} readOnly value={value}/>
        </label>)}</div>
      </details>
    </>}
  </section>;
}
/** Explicit data reconciliation, separate from native compilation or game control. */
export default function MissionSourceReview({project,edit,onActivation,onCinematic,exportLocal,nativeSource}:{
  project:Project;edit:(next:Project,description:string)=>void;
  onActivation:(value:'manual'|'startup')=>void;onCinematic?:(value:boolean)=>void;exportLocal:()=>void;
  nativeSource?:{key:string;disabled:boolean;read:(project:Project)=>Promise<NativeMissionReview>;verify:(project:Project,review:NativeMissionReview)=>Promise<void>;applied?:(review:NativeMissionReview)=>void};
}) {
  const [review,setReview]=useState<NativeMissionReview|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [selected,setSelected]=useState('');
  const sourceRef=useRef(nativeSource);sourceRef.current=nativeSource;const pending=useRef(false),reviewKey=useRef('');
  const sourceKey=nativeSource?.key??'attached',sourceLabel=nativeSource?'Recovered':'Attached',sourceWord=nativeSource?'recovered':'attached';
  const latest=useRef<Project|null>(project);latest.current=project;
  useEffect(()=>{latest.current=project;return()=>{latest.current=null;};},[project.id]);
  useEffect(()=>{setReview(null);setConfirmed(false);setError('');},[project.id,sourceKey]);
  const current=!!review&&reviewKey.current===sourceKey&&(!review.recovered||review.recovered.project===project)&&review.projectId===project.id&&review.document===project.quickForge&&sameMissionData(project.studio?.missions??[],review.localMissions)&&(!review.binding.cinematic||sameCinematicData(project.studio?.shots??[],review.localShots));
  const differs=!!review&&(!sameMissionData(review.localMissions,review.binding.missions)||!!review.binding.cinematic&&!sameCinematicData(review.localShots,review.binding.cinematic));
  const identities=review?[...new Set([...review.localMissions,...review.binding.missions].map(beat=>beat.id))]:[];
  const identity=identities.includes(selected)?selected:identities[0];
  const local=review?.localMissions.find(beat=>beat.id===identity),attached=review?.binding.missions.find(beat=>beat.id===identity);
  async function inspect() {
    if(pending.current||nativeSource?.disabled)return;
    const input=latest.current,origin=sourceRef.current,key=origin?.key??'attached';if(!input)return;
    pending.current=true;setBusy(true);setError('');setReview(null);setConfirmed(false);
    try {
      const next=origin?await origin.read(input):await reviewNativeCampaignMission(input),now=latest.current;
      if(!now||now.id!==input.id||(sourceRef.current?.key??'attached')!==key||next.recovered&&next.recovered.project!==now||now.quickForge!==next.document||!sameMissionData(now.studio?.missions??[],next.localMissions)||!!next.binding.cinematic&&!sameCinematicData(now.studio?.shots??[],next.localShots))
        throw Error('Source or local mission data changed during review. Review again; no data was applied.');
      reviewKey.current=key;setReview(next);setSelected('');
    } catch(problem) {if(latest.current?.id===input.id&&(sourceRef.current?.key??'attached')===key)setError(String(problem));}
    finally {pending.current=false;setBusy(false);}
  }
  async function adopt() {
    if(!review||!current||!differs||!confirmed||pending.current||nativeSource?.disabled)return;
    const input=latest.current,origin=sourceRef.current,key=sourceKey;if(!input)return;
    const release=beginProjectMutation(input.id);pending.current=true;setBusy(true);setError('');
    try {
      if(origin)await origin.verify(input,review);
      const now=latest.current;
      if(!now||now.id!==input.id||(sourceRef.current?.key??'attached')!==key||origin&&now!==input)throw Error('Source or local mission data changed during adoption. Review again; no data was applied.');
      const next=applyNativeCampaignMission(now,review);
      if(next!==now)edit(next,'Use reviewed '+sourceWord+' mission data');
      onActivation(review.binding.activation);onCinematic?.(!!review.binding.cinematic&&review.binding.cinematicIntro!==false);origin?.applied?.(review);
      setReview(null);setConfirmed(false);setError('');
    } catch(problem) {if(latest.current?.id===input.id&&(sourceRef.current?.key??'attached')===key)setError(String(problem));}
    finally {release();pending.current=false;setBusy(false);}
  }
  const soundProblems=review?missionSoundProblems({...project,studio:{...(project.studio??emptyCreatorStudio()),missions:review.binding.missions,shots:review.binding.cinematic??project.studio?.shots??[]}}):[];
  return <details className="mission-source-review">
    <summary>Review {sourceWord} mission data</summary>
    <p className="studio-hint">A source module can contain mission data different from your local draft.
      Review its data and checksum before choosing. This review does not execute or replace source modules.</p>
    <button type="button" disabled={busy||nativeSource?.disabled} onClick={()=>void inspect()}>{busy?'Reading source…':'Review '+sourceWord+' mission'}</button>
    {error&&<Notice>{error}</Notice>}
    {review&&!current&&<Notice>The source or local draft changed. Review again before applying data.</Notice>}
    {review&&current&&<>
      <p className="studio-hint">Local: {review.localMissions.length} beats · {sourceLabel}: {review.binding.missions.length} beats ·
        {sourceLabel} activation: {review.binding.activation==='startup'?'startup':'manual'}. Source checksum matches;
        native compilation and gameplay are unverified.</p>
      {review.recovered&&<p className="studio-hint">Native module {review.module.filename} · SHA256 {review.recovered.sha256.slice(0,12)}. Apply rechecks the pinned source. This adopts mission data; source files and controller ownership still require separate review before rebuilding.</p>}
      {!!soundProblems.length&&<Notice>Included sound bindings need attention before rebuilding. In Creator Studio → Radio / sound cue, {nativeSource?'use Reconnect saved native sound for its exact path in this campaign, or include/select the real source sound.':'include the real source sound and select it again.'} Existing source and sound choices are preserved. {soundProblems.join(' ')}</Notice>}
      {review.binding.cinematic&&<div><p>Applying also replaces local camera shots with the reviewed scenes ({review.binding.cinematic.length} shots). Undo restores both.</p>
        <ul>{review.binding.cinematic.map((shot,i)=><li key={shot.id}>{i+1}. {shot.name} · {shot.durationMs} ms · XYZ {shot.cameraPosition.join(', ')} → {shot.lookAt.join(', ')} · FOV {shot.fov}° · roll {shot.roll??0}°</li>)}</ul></div>}
      <p className="studio-hint">Prepared intro: {review.binding.cinematic&&review.binding.cinematicIntro!==false?'enabled':'off'} · Objective scenes: {review.binding.missions.filter(beat=>beat.cinematicCue!=null).length}.</p>
      <label>Compare beat<select aria-label="Compare mission beat" disabled={busy} value={identity??''}
        onChange={event=>setSelected(event.target.value)}>{identities.map(id=>{
          const left=review.localMissions.findIndex(beat=>beat.id===id),right=review.binding.missions.findIndex(beat=>beat.id===id);
          const beat=review.binding.missions[right]??review.localMissions[left];
          return <option key={id} value={id}>Local {left<0?'—':left+1} / {sourceLabel} {right<0?'—':right+1} · {beat?.title||id}</option>;
        })}</select></label>
      <div className="studio-fields">
        <BeatView side="Local" beat={local} other={attached} index={review.localMissions.findIndex(beat=>beat.id===identity)}/>
        <BeatView side={sourceLabel} beat={attached} other={local} index={review.binding.missions.findIndex(beat=>beat.id===identity)}/>
      </div>
      {!differs?<p>Mission data already matches. No replacement is needed.</p>:<>
        <button type="button" disabled={busy} onClick={()=>{try{exportLocal();}catch(problem){setError(String(problem));}}}>Export local creator evidence</button>
        <label><input type="checkbox" disabled={busy} checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>
          Replace local mission beats and any included camera shots with the reviewed {sourceWord} data. Undo restores the previous draft.</label>
        <button type="button" disabled={!confirmed||busy||nativeSource?.disabled} onClick={()=>void adopt()}>Use {sourceWord} mission data</button>
      </>}
      <button type="button" disabled={busy} onClick={()=>{setReview(null);setConfirmed(false);}}>Keep local mission data</button>
      <p className="studio-hint">Camera shots change only when the reviewed source includes saved shots, whether used as an intro or an objective scene. Server settings, source modules and runtime selection stay unchanged.
        Keeping a different local draft still requires Prepare mission before a build; stale-source checks remain active.</p>
    </>}
  </details>;
}
