import { useMemo } from 'react';
import { Download, GitBranch, ShieldAlert } from 'lucide-react';
import type { MapInspection, Project, Tag } from '../types';
import { exportTagLineageReport, inspectTagLineage } from '../tagLineage';
import { downloadLocalText } from '../exportHelpers';
import { shortPath } from '../editor';
import { Pill } from './ui';

/** Read-only, source-hash-bound descendant and direct incoming reference review. */
export default function TagLineageInspector({project,inspection,tag,onNavigate,notify}:{
  project:Project;inspection:MapInspection;tag:Tag;onNavigate:(id:number)=>void;notify:(message:string)=>void;
}) {
  const result=useMemo(()=>{
    try{return {report:inspectTagLineage(project,inspection,tag.id),error:null};}
    catch(error){return {report:null,error:String(error)};}
  },[project.source?.sha256,project.tagEdits,inspection,tag.id]);
  const report=result.report;
  const byId=useMemo(()=>new Map(inspection.tags.map(t=>[t.id,t])),[inspection]);
  return <section className="gs-tag-lineage" aria-label="Tag lineage inspector">
    <div className="gs-lineage-heading">
      <div><span className="gs-lineage-kicker"><GitBranch size={13}/> 07 Halo Modding Brain</span>
        <h3>Tag Lineage Inspector</h3></div>
      <button type="button" className="small-button" disabled={!report} onClick={()=>{
        if(!report)return;
        try{
          downloadLocalText(`gs_tag_lineage_${tag.id.toString(16)}.json`,exportTagLineageReport(report),'application/json');
          notify('Source-hash-linked lineage audit exported; no tag paths or Halo asset bytes included.');
        }catch(error){notify(`Lineage export refused: ${String(error)}`);}
      }}><Download size={13}/> Export audit</button>
    </div>
    {result.error&&<p role="alert" className="gs-lineage-warning">{result.error}. Select the matching preserved cache to continue.</p>}
    {report&&<>
      <div className="gs-lineage-stats">
        <span><strong>{report.nodes.length}</strong> indexed tags visited</span>
        <span><strong>{report.edges.length}</strong> observed links</span>
        <span><strong>{report.incomingObserved}</strong> direct incoming</span>
        <span><strong>{report.issues.missing+report.issues.wrongClass+report.issues.ambiguous+report.issues.invalid}</strong> unresolved</span>
      </div>
      <p className="subtle">Eschaton/HMT-style follow-the-reference discovery, now attached to this exact source SHA. Staged reference edits are reflected, not written to the map. The parser indexes only known relationships.</p>
      {report.truncations.length>0&&<p role="status" className="gs-lineage-warning"><ShieldAlert size={14}/> Bounded scan: {report.truncations.join(', ')}. This is an incomplete view.</p>}
      {report.scans.indexedReferenceFieldsMissing>0&&<p className="gs-lineage-warning">{report.scans.indexedReferenceFieldsMissing} typed reference fields lack indexed relationships. Inspect them individually before extraction.</p>}
      <details open className="gs-lineage-detail">
        <summary>Dependency walk - {report.edges.length} inspected links</summary>
        <div className="gs-lineage-list">
          {report.edges.slice(0,72).map((edge,i)=>{
            const target=edge.targetId===null?undefined:byId.get(edge.targetId);
            const linked=!!target&&(edge.status==='resolved'||edge.status==='cycle');
            return <button key={`${edge.fromId}-${edge.targetId}-${i}`} type="button" className="gs-lineage-link"
              disabled={!linked} style={{paddingLeft:`${12+Math.min(edge.depth,5)*11}px`}}
              title={linked?'Inspect the referenced tag':'Reference is not a verified matching tag'}
              onClick={()=>{if(linked && target)onNavigate(target.id);}}>
              <span className="gs-lineage-edge"><small>{edge.expectedClass}</small>
                <strong>{target&&linked?shortPath(target.path):edge.status.replaceAll('-',' ')}</strong>
                <small>{edge.label} / depth {edge.depth}{edge.edited?' / overlay':''}</small></span>
              <Pill tone={linked?'green':'amber'}>{edge.status}</Pill>
            </button>;
          })}
          {!report.edges.length&&<p className="subtle">No references were indexed for this tag. This does not prove the actual source has no dependencies.</p>}
          {report.edges.length>72&&<p className="subtle">Showing 72 of {report.edges.length} observed links. Export the audit for all inspected edges.</p>}
        </div>
      </details>
      <details className="gs-lineage-detail">
        <summary>Who references this tag? - {report.incomingObserved} observed links</summary>
        <div className="gs-lineage-list">
          {report.incoming.map((ref,i)=>{
            const source=byId.get(ref.fromId);
            return <button type="button" key={`${ref.fromId}-${i}`} className="gs-lineage-link" disabled={!source}
              onClick={()=>{if(source)onNavigate(source.id);}}>
              <span className="gs-lineage-edge"><small>{ref.tagClass}</small>
                <strong>{source?shortPath(source.path):'Not available'}</strong>
                <small>{ref.edited?'Staged project reference':'Indexed cache reference'}</small></span>
              <GitBranch size={13}/>
            </button>;
          })}
          {!report.incomingObserved&&<p className="subtle">No incoming references found in the bounded, known-reference scan.</p>}
        </div>
      </details>
      <p className="gs-lineage-footer">Reference discovery is not a complete recursive .tag extraction. Missing schemas, external tag bodies and engine-specific runtime fields require Invader/MEK or compatible Editing Kit tools, plus real compilation and gameplay testing.</p>
    </>}
  </section>;
}
