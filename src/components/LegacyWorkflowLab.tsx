import { useState } from 'react';
import { Archive, ArrowRight, BookOpenCheck, Download, ExternalLink, LockKeyhole, ShieldCheck } from 'lucide-react';
import type { MapInspection, Project, Settings, Workspace } from '../types';
import { LEGACY_WORKFLOWS, exportLegacyWorkflowPlan, planLegacyWorkflow } from '../legacyWorkflowLab';
import type { LegacyWorkflowId } from '../legacyWorkflowLab';
import { Notice, Pill } from './ui';
import LegacyCompanionTools from './LegacyCompanionTools';

/** A genuine source-aware historical lab; optional, explicitly registered companions are isolated.
 * The report never exports game bytes, installed file paths or fake engine proof.
 */
export default function LegacyWorkflowLab({project,inspection,settings,navigate}:{
  project:Project|null;inspection:MapInspection|null;settings?:Partial<Settings>|null;
  navigate:(workspace:Workspace)=>void;
}){
  const [selected,setSelected]=useState<LegacyWorkflowId>('escha-tags');
  const [error,setError]=useState('');
  const workflow=LEGACY_WORKFLOWS.find(w=>w.id===selected)!;
  const review=planLegacyWorkflow(selected,project,inspection,settings);
  const observed=review.checks.filter(x=>x.state==='observed').length;
  const manual=review.checks.filter(x=>x.state==='manual-unverified').length;
  function download(){
    try{
      const content=exportLegacyWorkflowPlan(selected,project,inspection,settings);
      const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
      try{
        const a=document.createElement('a');a.href=url;
        a.download=`guilty-spark-legacy-${selected}-plan.json`;a.click();setError('');
      }finally{setTimeout(()=>URL.revokeObjectURL(url),3000);}
    }catch(e){setError(String(e));}
  }
  return <section className="analysis-card gs-legacy-lab" aria-labelledby="gs-legacy-title">
    <div className="section-heading">
      <h2 id="gs-legacy-title"><Archive size={20}/> 07 Halo Modding Brain · Legacy Workflow Lab</h2>
      <Pill><BookOpenCheck size={13}/> Source-aware archaeology</Pill>
    </div>
    <p>Recover the <strong>feeling</strong> of classic Halo experimentation while keeping its fragile cache-patching habits in the history books. Choose a vintage technique to see its modern Spark equivalent, available project evidence, and the exact next workspace.</p>
    <div className="gs-legacy-picker" role="group" aria-label="Classic Halo modding technique">
      {LEGACY_WORKFLOWS.map(w=><button type="button" key={w.id} aria-pressed={selected===w.id}
        className={selected===w.id?'selected':''} title={`Review ${w.historicalTool}`}
        onClick={()=>{setSelected(w.id);setError('');}}>{w.title}</button>)}
    </div>
    <div className="gs-legacy-details" aria-live="polite">
      <div className="gs-legacy-summary">
        <div><span className="gs-legacy-overline">THE OLD MAGIC · {workflow.era}</span>
          <h3>{workflow.historicalTool}</h3><p>{workflow.historicalTechnique}</p></div>
        <div><span className="gs-legacy-overline">THE MODERN WORKBENCH</span>
          <h3>{workflow.title}</h3><p>{workflow.modernWorkflow}</p></div>
      </div>
      <p className="gs-legacy-warning"><LockKeyhole size={16}/>{workflow.warning}</p>
      <div className="section-heading"><h3>Evidence attached to this project</h3>
        <span className="subtle">{observed} observed · {manual} manual engine gate(s)</span></div>
      <div className="gs-legacy-checks">
        {review.checks.map(check=><div className="gs-legacy-check" key={check.kind}>
          {check.state==='observed'?<ShieldCheck size={16} aria-label="Source evidence present"/>:<LockKeyhole size={16} aria-label="Not verified"/>}
          <div><strong>{check.label}</strong><small>{check.detail}</small></div>
          <Pill tone={check.state==='observed'?'green':check.state==='manual-unverified'?'amber':undefined}>
            {check.state==='observed'?'Observed':check.state==='manual-unverified'?'Needs real test':'Not observed'}
          </Pill>
        </div>)}
      </div>
      {review.source.sourceSha256&&<p className="subtle">Preserved source SHA-256: <code>{review.source.sourceSha256}</code></p>}
      {review.source.sourceSha256&&!review.source.inspectionMatchesSource&&<Notice tone="info">The preserved source is known, but no matching tag inspection is loaded. Open that same map before treating tag counts or bitmap identities as evidence.</Notice>}
      <div className="analysis-actions gs-legacy-actions">
        <button type="button" className="primary" onClick={()=>navigate(workflow.workspace)}>
          Open {workflow.workspace} <ArrowRight size={14}/></button>
        <button type="button" onClick={download} title="Download a read-only, path-free source evidence and next-steps plan. Does not include game assets or prove compilation.">
          <Download size={14}/> Export safe workflow plan</button>
        <a href={workflow.reference} target="_blank" rel="noopener noreferrer" title="Read documented history; no old tools are downloaded or executed">
          Historical reference <ExternalLink size={13}/></a>
      </div>
      {error&&<Notice>{error}</Notice>}
      <p className="subtle">A green check only attests the local source state shown. The plan deliberately marks BSP compilation, collision, tag round-trip, game loading and engine compatibility as <strong>unverified</strong>. Companion apps only launch after an explicit user confirmation, from their separately installed locations.</p>
    </div>
    <div className="gs-legacy-migration-bridge">
      <strong>Original Eschaton/HMT tag injection, without blind cache surgery</strong>
      <p>Export a source tag-reference manifest, open a second owned map, and inspect missing dependencies and class/path conflicts. The Tags workspace now includes a read-only Cross-map Tag Migration Preview. It never considers source datum IDs portable or silently writes into either cache.</p>
      <button type="button" onClick={()=>navigate('tags')}>Open Cross-map Tag Migration Preview <ArrowRight size={14}/></button>
    </div>
    <LegacyCompanionTools/>
  </section>;
}
