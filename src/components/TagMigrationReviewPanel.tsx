import { useMemo, useState } from 'react';
import { Archive, Download, FileSearch, GitCompareArrows, ShieldAlert } from 'lucide-react';
import type { MapInspection, Project } from '../types';
import { exportTagMigrationReview, reviewTagMigration } from '../tagMigrationReview';
import { downloadLocalText } from '../exportHelpers';
import { Pill } from './ui';

/** No native process, map mutation, or filesystem write. Explicitly user-selected JSON only. */
export default function TagMigrationReviewPanel({project,inspection,notify}:{
  project:Project;inspection:MapInspection;notify:(message:string)=>void;
}) {
  const [contents,setContents]=useState('');
  const [filename,setFilename]=useState('');
  const [fileError,setFileError]=useState('');
  const outcome=useMemo(()=>{
    if(!contents)return {report:null,error:null};
    try{return {report:reviewTagMigration(contents,project,inspection),error:null};}
    catch(error){return {report:null,error:String(error)};}
  },[contents,project,inspection]);
  const report=outcome.report;
  async function selectFile(file:File|undefined){
    setFileError('');setContents('');setFilename('');
    if(!file)return;
    if(file.size>524288 || file.size<=0 || !/\.json$/i.test(file.name)){
      setFileError('Select a JSON reference manifest no larger than 512 KiB.');return;
    }
    try{
      const text=await file.text();
      if(text.length>524288)throw new Error('Manifest exceeds 512 KiB');
      setContents(text);setFilename(file.name);
    }catch(error){setFileError(`Could not read manifest: ${String(error)}`);}
  }
  return <section className="gs-tag-migration" aria-label="Cross-map tag migration preview">
    <div className="gs-lineage-heading">
      <div><span className="gs-lineage-kicker"><Archive size={13}/> 07 Halo Modding Brain · Time Machine</span>
        <h3><GitCompareArrows size={17}/> Cross-map Tag Migration Preview</h3></div>
      <Pill>Read-only reference archaeology</Pill>
    </div>
    <p className="subtle">Old Eschaton/HMT-style transplants need more than matching datum IDs. Export a <strong>tag reference + dependencies</strong> JSON manifest from one map, open the destination map here, then select the JSON to compare class/path identities. Source and destination caches stay untouched.</p>
    <div className="gs-migration-actions">
      <label htmlFor="gs-migration-file"><FileSearch size={14}/> Review a previously exported tag manifest</label>
      <input id="gs-migration-file" type="file" accept=".json,application/json" aria-label="Choose a source map tag-reference JSON manifest"
        onChange={e=>void selectFile(e.target.files?.[0])}/>
      {filename&&<small>Loaded locally: {filename}</small>}
    </div>
    {(fileError||outcome.error)&&<p role="alert" className="gs-lineage-warning"><ShieldAlert size={14}/>{fileError||outcome.error}</p>}
    {report&&<div aria-live="polite">
      <div className="gs-lineage-stats">
        <span><strong>{report.selected.length}</strong> selected source tags</span>
        <span><strong>{report.counts.selected['identity-present']}</strong> matching identities</span>
        <span><strong>{report.counts.selected['not-present']+report.counts.selected['class-conflict']}</strong> require review</span>
        <span><strong>{report.counts.dependencies['missing-from-target']+report.counts.dependencies['unknown-source-path']+report.counts.dependencies['class-conflict']+report.counts.dependencies['inconsistent-source-reference']}</strong> unresolved references</span>
      </div>
      <div className="gs-migration-identity"><div><small>Source cache SHA-256</small><code>{report.source.sha256}</code></div>
        <div><small>Destination cache SHA-256</small><code>{report.target.sha256}</code></div></div>
      <p className="gs-lineage-warning"><ShieldAlert size={14}/>{report.compatibility==='same-engine-and-cache-version'
        ? 'Engine label and cache version match, but binary compatibility, tag contents and safe import are NOT established.'
        : 'Different or unconfirmed engine/cache version: do not transplant automatically. Port using engine-specific tools.'}</p>
      {report.sameCache&&<p className="gs-lineage-warning">Source and destination are the SAME cache. This is not a transfer validation.</p>}
      <details className="gs-lineage-detail" open>
        <summary>Selected source tag identities ({report.selected.length})</summary>
        <div className="gs-lineage-list">
          {report.selected.slice(0,64).map((item,i)=><div key={i} className="gs-migration-row">
            <div><code>{item.class}</code> <strong>{item.path}</strong><small>{item.note}</small></div>
            <Pill tone={item.status==='identity-present'?'blue':'amber'}>{item.status.replaceAll('-',' ')}</Pill>
          </div>)}
          {report.selected.length>64&&<p className="subtle">Showing 64 of {report.selected.length} selected tags; the report contains bounded totals for all.</p>}
        </div>
      </details>
      <details className="gs-lineage-detail">
        <summary>Indexed dependency comparison ({report.counts.dependencyReferencesScanned}; {report.counts.displayedDependencyRows} displayed)</summary>
        <div className="gs-lineage-list">
          {report.dependencies.map((item,i)=><div key={i} className="gs-migration-row">
            <div><code>{item.fromClass} → {item.targetClass}</code>
              <strong>{item.targetPath??'Reference target path not indexed'}</strong></div>
            <Pill tone={item.status==='present-in-target'?'blue':'amber'}>{item.status.replaceAll('-',' ')}</Pill>
          </div>)}
          {report.dependencies.length===0&&<p className="subtle">No references were indexed in the selected source tags. That does not establish an empty underlying dependency tree.</p>}
        </div>
      </details>
      <div className="gs-migration-actions">
        <button type="button" onClick={()=>{
          try{downloadLocalText('guilty-spark-tag-migration-review.json',exportTagMigrationReview(report),'application/json');
            notify('Path-free, read-only tag migration review saved. No Halo tags were copied or imported.');}
          catch(error){notify(`Migration review export refused: ${String(error)}`);}
        }}><Download size={13}/> Export metadata-only review</button>
        <span className="subtle">No automatic import, extraction, game-file replacement or tag data transfer.</span>
      </div>
      <p className="gs-lineage-footer">Even a matching class/path is only an identity match; compiled tag fields and external resources can differ. For real migration, use a compatible Invader/Editing Kit extraction into isolated source folders, resolve the full dependency closure, compile a new map and test it in the target engine. Original files are never overwritten by this preview.</p>
    </div>}
  </section>;
}
