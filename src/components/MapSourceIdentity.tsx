import {useEffect,useState} from 'react';
import {call,native} from '../api';
import {useMapState} from '../mapSession';
import {assertMapSourceIdentity,mapSourceIdentityKey} from '../sourceIdentity';
import type {MapSourceIdentity as Identity} from '../sourceIdentity';
import type {Project} from '../types';
import {runtimeNames} from '../runtimeWorkbench';
const operationLabels:Record<string,string>={inspect:'Read map',assetPreview:'Preview assets',compiledCacheEdit:'Direct map edits',looseTagRebuild:'Rebuild tags',bspTopology:'Rebuild BSP source'};
const statusLabels={available:'Reader verified',requiresPreflight:'Needs checks',unsupported:'Unavailable',requiresSource:'Needs source'};

/** Expanded on demand: exact byte verification must not stall every map tab. */
export default function MapSourceIdentity({project}:{project:Project}) {
  const [open,setOpen]=useMapState(project.id,'source.identityOpen',false);
  const [identity,setIdentity]=useState<Identity|null>(null),[error,setError]=useState(''),[epoch,setEpoch]=useState(0),[busy,setBusy]=useState(false);
  const sourceKey=mapSourceIdentityKey(project);
  useEffect(()=>{const changed=()=>setEpoch(value=>value+1);window.addEventListener('guilty-spark-runtime-connections-changed',changed);
    return()=>window.removeEventListener('guilty-spark-runtime-connections-changed',changed);},[]);
  useEffect(()=>{
    setIdentity(null);setError('');
    if(!open||!native||!project.source){setBusy(false);return;}
    let active=true;setBusy(true);
    void call<Identity>('inspect_map_source',{projectId:project.id}).then(value=>{
      assertMapSourceIdentity(value,project);
      if(!value.contract)throw Error('Source contract is unavailable in this native build');
      if(active)setIdentity(value);
    }).catch(reason=>{if(active)setError(String(reason));}).finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;};
  },[sourceKey,open,epoch]);
  if(!project.source)return null;
  return <details className="gs-source-identity" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>Native source identity · cache {project.source.cacheVersion}</summary>
    {open&&<div aria-busy={busy}>
      {busy&&<small>Verifying preserved source and installed runtime paths…</small>}
      {error&&<p role="alert">{error}</p>}
      {identity&&<>
        <strong>{identity.contract.edition}</strong>
        <dl><dt>Build</dt><dd>{identity.contract.build||'Not declared by this cache'}</dd>
          <dt>Source SHA-256</dt><dd title={identity.source.sha256}>{identity.source.sha256}</dd>
          <dt>Preserved file</dt><dd>{identity.source.preservedPath}</dd>
          <dt>Original location</dt><dd>{identity.runtimeOrigin?runtimeNames[identity.runtimeOrigin.runtimeId]:'Unknown or ambiguous; cache decoding still uses its native format'}</dd>
          <dt>Linked resource pins</dt><dd>{Object.keys(identity.source.resourceSha256??{}).join(', ')||'No external resource pins; embedded payloads remain native'}</dd></dl>
        <div className="gs-source-routes">{identity.contract.operations.map(route=><span key={route.operation} title={route.detail}><b>{operationLabels[route.operation]??route.operation}</b> · {statusLabels[route.status]}</span>)}</div>
        <details><summary>Compilation routes &amp; installations</summary>
          <ul>{identity.contract.compilationTargets.map(route=><li key={route.operation}><b>{runtimeNames[route.operation as keyof typeof runtimeNames]??route.operation}</b> · {statusLabels[route.status]}<small>{route.detail}</small></li>)}</ul>
          <ul>{identity.runtimeInstallations.map(installation=><li key={`${installation.runtimeId}:${installation.root}`} title={installation.root}>
            {runtimeNames[installation.runtimeId]} · {installation.cacheFamilyMatches?'input-family candidate':'different input family'}{installation.originalLocation?' · original byte location':''}</li>)}</ul>
          <small>Input-family agreement is not a game-load, shader, multiplayer or Live Link test. Hosting selection never changes this source contract.</small>
        </details>
      </>}
    </div>}
  </details>;
}
