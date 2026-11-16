import { useEffect, useRef, useState } from 'react';
import type { MissionBeat } from '../creatorStudio';
import { applyNativeCampaignMission, reviewNativeCampaignMission, sameMissionData, sameCinematicData } from '../haloScript';
import type { NativeMissionReview } from '../haloScript';
import type { Project } from '../types';
import { Notice } from './ui';

function BeatView({side,beat,index}:{side:string;beat?:MissionBeat;index:number}) {
  return <section>
    <h4>{side}{beat?' · beat '+(index+1):''}</h4>
    {!beat?<p>No matching beat.</p>:<>
      {(['id','title','trigger','encounterName','triggerRef','timerSeconds','hudObjective','checkpoint','completeMission'] as const).map(field=><label key={field}>
        {{id:'Identity',title:'Title',trigger:'Trigger',encounterName:'Encounter',triggerRef:'Volume',timerSeconds:'Delay (seconds)',hudObjective:'Native HUD objective',checkpoint:'Checkpoint request',completeMission:'Level completion request'}[field]}
        <input aria-label={side+' mission '+field} readOnly value={String(beat[field]??'')}/>
      </label>)}
      {beat.createWeaponObject&&<label>Create native weapon<input aria-label={side+' mission create weapon'} readOnly value={beat.createWeaponObject}/></label>}
      {beat.cinematicCue&&<label>Camera scene<input aria-label={side+' mission camera scene'} readOnly value={beat.cinematicCue.phase+' · '+beat.cinematicCue.firstShotId+' → '+beat.cinematicCue.lastShotId}/></label>}
      <label>Objective / direction<textarea aria-label={side+' mission objective'} rows={3} readOnly value={beat.objective}/></label>
      <label>HUD objective text<textarea aria-label={side+' mission HUD text'} rows={2} readOnly value={beat.hudText??''}/></label>
    </>}
  </section>;
}
/** Explicit data reconciliation, separate from native compilation or game control. */
export default function MissionSourceReview({project,edit,onActivation,onCinematic,exportLocal}:{
  project:Project;edit:(next:Project,description:string)=>void;
  onActivation:(value:'manual'|'startup')=>void;onCinematic:(value:boolean)=>void;exportLocal:()=>void;
}) {
  const [review,setReview]=useState<NativeMissionReview|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [selected,setSelected]=useState('');
  const latest=useRef<Project|null>(project);latest.current=project;
  useEffect(()=>{latest.current=project;return()=>{latest.current=null;};},[project.id]);
  useEffect(()=>{setReview(null);setConfirmed(false);setError('');},[project.id]);
  const current=!!review&&review.projectId===project.id&&review.document===project.quickForge&&sameMissionData(project.studio?.missions??[],review.localMissions)&&(!review.binding.cinematic||sameCinematicData(project.studio?.shots??[],review.localShots));
  const differs=!!review&&(!sameMissionData(review.localMissions,review.binding.missions)||!!review.binding.cinematic&&!sameCinematicData(review.localShots,review.binding.cinematic));
  const identities=review?[...new Set([...review.localMissions,...review.binding.missions].map(beat=>beat.id))]:[];
  const identity=identities.includes(selected)?selected:identities[0];
  const local=review?.localMissions.find(beat=>beat.id===identity),attached=review?.binding.missions.find(beat=>beat.id===identity);
  async function inspect() {
    if(busy)return;
    const input=latest.current;if(!input)return;
    setBusy(true);setError('');setReview(null);setConfirmed(false);
    try {
      const next=await reviewNativeCampaignMission(input),now=latest.current;
      if(!now||now.id!==input.id||now.quickForge!==next.document||!sameMissionData(now.studio?.missions??[],next.localMissions)||!!next.binding.cinematic&&!sameCinematicData(now.studio?.shots??[],next.localShots))
        throw Error('Source or local mission data changed during review. Review again; no data was applied.');
      setReview(next);setSelected('');
    } catch(problem) {if(latest.current?.id===input.id)setError(String(problem));}
    finally {setBusy(false);}
  }
  function adopt() {
    if(!review||!current||!differs||!confirmed)return;
    try {
      const now=latest.current;if(!now||now.id!==project.id)throw Error('This project closed. No data was applied.');
      const next=applyNativeCampaignMission(now,review);
      if(next!==now)edit(next,'Use reviewed attached mission data');
      onActivation(review.binding.activation);onCinematic(!!review.binding.cinematic&&review.binding.cinematicIntro!==false);
      setReview(null);setConfirmed(false);setError('');
    } catch(problem) {setError(String(problem));}
  }
  return <details>
    <summary>Review attached mission data</summary>
    <p className="studio-hint">A shared source module can contain mission data different from your local draft.
      Review its data and checksum before choosing. This review does not execute or replace source modules.</p>
    <button type="button" disabled={busy} onClick={()=>void inspect()}>{busy?'Reading source…':'Review attached mission'}</button>
    {error&&<Notice>{error}</Notice>}
    {review&&!current&&<Notice>The source or local draft changed. Review again before applying data.</Notice>}
    {review&&current&&<>
      <p className="studio-hint">Local: {review.localMissions.length} beats · Attached: {review.binding.missions.length} beats ·
        Attached activation: {review.binding.activation==='startup'?'startup':'manual'}. Source checksum matches;
        native compilation and gameplay are unverified.</p>
      {review.binding.cinematic&&<div><p>Applying also replaces local camera shots with the reviewed scenes ({review.binding.cinematic.length} shots). Undo restores both.</p>
        <ul>{review.binding.cinematic.map((shot,i)=><li key={shot.id}>{i+1}. {shot.name} · {shot.durationMs} ms · XYZ {shot.cameraPosition.join(', ')} → {shot.lookAt.join(', ')} · FOV {shot.fov}° · roll {shot.roll??0}°</li>)}</ul></div>}
      <p className="studio-hint">Prepared intro: {review.binding.cinematic&&review.binding.cinematicIntro!==false?'enabled':'off'} · Objective scenes: {review.binding.missions.filter(beat=>beat.cinematicCue!=null).length}.</p>
      <label>Compare beat<select aria-label="Compare mission beat" value={identity??''}
        onChange={event=>setSelected(event.target.value)}>{identities.map(id=>{
          const left=review.localMissions.findIndex(beat=>beat.id===id),right=review.binding.missions.findIndex(beat=>beat.id===id);
          const beat=review.binding.missions[right]??review.localMissions[left];
          return <option key={id} value={id}>Local {left<0?'—':left+1} / Attached {right<0?'—':right+1} · {beat?.title||id}</option>;
        })}</select></label>
      <div className="studio-fields">
        <BeatView side="Local" beat={local} index={review.localMissions.findIndex(beat=>beat.id===identity)}/>
        <BeatView side="Attached" beat={attached} index={review.binding.missions.findIndex(beat=>beat.id===identity)}/>
      </div>
      {!differs?<p>Mission data already matches. No replacement is needed.</p>:<>
        <button type="button" onClick={exportLocal}>Export local creator evidence</button>
        <label><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>
          Replace local mission beats and any included camera shots with the reviewed attached data. Undo restores the previous draft.</label>
        <button type="button" disabled={!confirmed} onClick={adopt}>Use attached mission data</button>
      </>}
      <button type="button" onClick={()=>{setReview(null);setConfirmed(false);}}>Keep local mission data</button>
      <p className="studio-hint">Cameras change only when the attached source includes an intro. Server settings, source modules and runtime selection stay unchanged.
        Keeping a different local draft still requires Prepare mission before a build; stale-source checks remain active.</p>
    </>}
  </details>;
}
