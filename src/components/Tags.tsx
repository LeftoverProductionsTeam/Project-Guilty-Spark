import TagFields from './TagFields';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowRight, FileCode2, GitBranch, RotateCcw, Search, Sparkles } from 'lucide-react';
import type { LibraryEntry, MapInspection, Project, Tag, TagField } from '../types';
import {
  classNames,
  effectiveReferenceId,
  formatNumber,
  setTagValue,
  shortPath,
} from '../editor';
import { Empty, Notice, Pill } from './ui';
import Sound from './Sound';
import TagLineageInspector from './TagLineageInspector';
import TagMigrationReviewPanel from './TagMigrationReviewPanel';
import TagDuplicatePanel from './TagDuplicatePanel';
import type { CueName, LocalCueReference } from '../interfacePreferences';
import { createTagExchangeBundle } from '../haloExchange';
import { downloadLocalText } from '../exportHelpers';
import { call, native } from '../api';
import {useMapState} from '../mapSession';
export default function Tags({
  project,
  inspection,
  entries,
  onSelectMap,
  edit,
  notify,
  focusTagId,
  onFocusHandled,
  onAssignSound,
  onResources,
}: {
  project: Project;
  inspection: MapInspection | null;
  entries: LibraryEntry[];
  onSelectMap: (id: string) => void;
  edit: (p: Project, d: string) => void;
  notify: (m: string) => void;
  focusTagId?: number | null;
  onFocusHandled?:()=>void;
  onAssignSound?: (cue: CueName, ref: LocalCueReference) => void;
  onResources?:()=>void;
}) {
  const [query, setQuery] = useMapState(project.id,'tags.query','');
  const [filter, setFilter] = useMapState(project.id,'tags.filter','all');
  const [selected, setSelected] = useMapState<number | null>(project.id,'tags.selection',
    inspection?.tags.find((t) => t.class === 'weap')?.id ?? inspection?.tags[0]?.id ?? null,
  );
  const [limit, setLimit] = useMapState(project.id,'tags.limit',300);
  const [advanced, setAdvanced] = useMapState(project.id,'tags.advanced',false);
  const [extractingTag,setExtractingTag] = useState<number|null>(null);
  const [exchangeJobs,setExchangeJobs] = useState<{
    jobId:string;sourceProjectId:string;sourceEngine:string;sourceVersion:number;
    sourceSha256:string;requestedTag:string;fileCount:number;totalBytes:number;
  }[]>([]);
  const [selectedExchange,setSelectedExchange]=useState('');
  const [stagingTag,setStagingTag]=useState(false);
  const [stagedReceipt,setStagedReceipt]=useState<{
    jobId:string;tagRoot:string;fileCount:number;totalBytes:number;notice:string;status:string;
  }|null>(null);
  const [extractionReceipt,setExtractionReceipt] = useState<{
    jobId:string;tagRoot:string;files:{path:string;bytes:number;sha256:string}[];
    totalBytes:number;status:string;requestedTag:string;notice:string;
  }|null>(null);
  async function refreshTagExchanges() {
    if (!native) return;
    try {
      const result=await call<typeof exchangeJobs>('list_tag_exchanges');
      setExchangeJobs(result);
    } catch(error) {notify(`Could not list extracted tag sources: ${String(error)}`);}
  }
  useEffect(() => {
    if(native) void refreshTagExchanges();
  // Source jobs are refreshed on mount or explicit user action.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setStagedReceipt(null);
  }, [project.id]);
  useEffect(() => {
    if (focusTagId !== null && focusTagId !== undefined && inspection?.tags.some((tag) => tag.id === focusTagId)) {
      navigateToTag(focusTagId);
      onFocusHandled?.();
    }
  // Navigation is keyed to the explicitly requested tag or imported source, not every list render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTagId, inspection?.sha256]);
  const tags = inspection?.tags ?? [];
  const selectedTag = tags.find((t) => t.id === selected);
  const classes = useMemo(() => [...new Set(tags.map((t) => t.class))].sort(), [tags]);
  const shown = useMemo(
    () =>
      tags.filter(
        (t) =>
          (filter === 'all' || t.class === filter) &&
          (t.path.toLowerCase().includes(query.toLowerCase()) ||
            t.class.toLowerCase().includes(query.toLowerCase())),
      ),
    [tags, query, filter],
  );
  // Referenced tags are often outside the active class/search filters.
  // Make the destination visible in the left browser, not just the inspector.
  function navigateToTag(id: number) {
    const tag = tags.find((candidate) => candidate.id === id);
    if (!tag) return;
    setQuery('');
    setFilter(tag.class);
    // A large class might contain hundreds of entries. Do not hide a linked
    // target behind the default pagination limit.
    const classIndex = tags.filter((candidate) => candidate.class === tag.class).findIndex((candidate) => candidate.id === id);
    setLimit(Math.max(300, classIndex + 1));
    setSelected(id);
    setExtractionReceipt(null);
  }
  function change(tag: Tag, field: TagField, value: number) {
    try {
      if (field.kind === 'reference' && !tags.some((t) => t.id === value && t.class === field.targetClass))
        throw new Error('Choose a tag of the required class from this map');
      edit(setTagValue(project, tag, field, value), `${shortPath(tag.path)}: ${field.label}`);
    } catch (e) {
      notify(String(e));
    }
  }
  const projectile = selectedTag?.fields.find((f) => f.kind === 'reference' && f.targetClass === 'proj');
  const rocket = tags.find((t) => t.class === 'proj' && /rocket/i.test(t.path));
  if (!inspection)
    return (
      <Empty icon={<FileCode2 size={30} />} title="Open a Halo map to browse its tags">
        The tag browser reads the source cache’s real tag index. An asset-only project does not contain Halo
        tags.
      </Empty>
    );
  return (
    <div className="tag-layout">
      <aside className="panel tag-browser">
        <div className="panel-heading">
          <strong>Tag browser</strong>
          <Pill>{formatNumber(tags.length)}</Pill>
        </div>
        <label className="section-label" htmlFor="tag-map-select">Map source</label>
        <select
          id="tag-map-select"
          className="class-filter"
          aria-label="Select Halo map"
          value={project.id}
          onChange={(e) => { if (e.target.value !== project.id) onSelectMap(e.target.value); }}
        >
          {entries.filter((entry) => entry.tagCount > 0 || entry.id === project.id).map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.title} · {entry.engine}
            </option>
          ))}
        </select>
        <div className="panel-search">
          <Search size={14} />
          <input
            aria-label="Search tags"
            placeholder="Search paths or classes…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(300);
            }}
          />
        </div>
        <select
          className="class-filter"
          aria-label="Filter tag class"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setLimit(300);
          }}
        >
          <option value="all">All tag classes</option>
          {classes.map((c) => (
            <option key={c} value={c}>
              {classNames[c] ?? c} ({c})
            </option>
          ))}
        </select>
        <div className="tag-list">
          {shown.slice(0, limit).map((t) => (
            <button
              className={`tag-row ${selected === t.id ? 'selected' : ''}`}
              key={t.id}
              onClick={() => setSelected(t.id)}
            >
              <span className={`tag-class class-${t.class}`}>{t.class}</span>
              <span>
                <strong>{shortPath(t.path)}</strong>
                <small>{t.path.split(/[\\/]/).slice(0, -1).join(' / ')}</small>
              </span>
              {project.tagEdits.some((e) => e.tagId === t.id) && <span className="edit-dot" />}
            </button>
          ))}
          {shown.length > limit && (
            <button className="load-more" onClick={() => setLimit((v) => v + 300)}>
              Show more tags ({shown.length - limit} remaining)
            </button>
          )}
          {shown.length === 0 && <div className="list-empty">No tags match this search.</div>}
        </div>
        <div className="panel-foot">{shown.length} matching · indexed from cache</div>
      </aside>
      <section className="tag-detail">
        {inspection.header.scenarioType===2&&<Notice>
          Interface map · browse its actual widgets, HUD definitions, fonts, strings and bitmap dependencies here.
          Widget links are followed one at a time, including cyclic collections. Game event handlers remain engine-controlled.
        </Notice>}
        {selectedTag ? (
          <>
            <div className="tag-detail-heading">
              <div className="eyebrow">
                {classNames[selectedTag.class] ?? 'Tag'} · {selectedTag.class}
              </div>
              <h2>{shortPath(selectedTag.path)}</h2>
              <code>{selectedTag.path}</code>
              <div className="tag-badges">
                <Pill tone="blue">ID {selectedTag.id.toString(16).toUpperCase()}</Pill>
                <Pill>{selectedTag.external ? 'External resource' : 'Embedded tag'}</Pill>
                <Pill tone={selectedTag.fields.length ? 'green' : 'muted'}>
                  {selectedTag.fields.length ? 'Typed fields available' : 'Inspection only'}
                </Pill>
              </div>
              <div className="tag-exchange-actions">
                <button type="button" className="small-button" title="Exports tag identities and dependency references in JSON, not actual Halo tag or texture bytes. Importers must verify source hash and cache version." onClick={() => {
                  try {
                    const bundle=createTagExchangeBundle({project,inspection},[selectedTag.id]);
                    downloadLocalText(`gs_tag_${selectedTag.class.replace(/[^A-Za-z0-9]/g,'_')}_${selectedTag.id.toString(16)}.json`,JSON.stringify(bundle,null,2),'application/json');
                    notify('Tag identity and dependency references exported. This is not an extracted .tag file.');
                  } catch (error) {notify(`Reference export failed: ${String(error)}`);}
                }}>Export tag reference + dependencies</button>
                <button type="button" className="small-button" title="Opt-in Invader process extracts actual compatible tag files to a separate managed directory; this never edits the original .map or target scenario." disabled={!native || !project.source || extractingTag!==null}
                  onClick={async()=>{
                    if (!selectedTag) return;
                    setExtractingTag(selectedTag.id);
                    setExtractionReceipt(null);
                    try {
                      const receipt=await call<NonNullable<typeof extractionReceipt>>('extract_selected_tag_tree', {
                        projectId:project.id,tagId:selectedTag.id,
                      });
                      setExtractionReceipt(receipt);
                      await refreshTagExchanges();
                      notify(`Invader extracted ${receipt.files.length} real tag files to an isolated local folder. Not imported into any other map.`);
                    } catch(error){notify(`Actual tag extraction rejected: ${String(error)}`);}
                    finally{setExtractingTag(null);}
                  }}>{extractingTag===selectedTag.id ? 'Extracting…' : 'Extract real .tag + dependencies (Invader)'}</button>
                <span className="subtle">Requires owner-installed Invader in Settings and matching original resource maps. Actual extraction is opt-in and never overwrites game tags.</span>
                {extractionReceipt &&
                  <div className="tag-extraction-receipt" role="status">
                    <strong>{extractionReceipt.files.length} files / {formatNumber(extractionReceipt.totalBytes)} bytes · {extractionReceipt.status}</strong>
                    <code>{extractionReceipt.tagRoot}</code>
                    <button type="button" className="small-button" onClick={async()=>{
                      try{await call('reveal_folder',{kind:'tagExchange',id:extractionReceipt.jobId});}
                      catch(error){notify(`Cannot open extracted folder: ${String(error)}`);}
                    }}>Open isolated extracted tags</button>
                    <span>{extractionReceipt.notice}</span>
                  </div>}
                {native && project.source && <div className="tag-staging-panel">
                  <strong>Cross-map .tag staging (isolated, no scenario edits)</strong>
                  <button type="button" className="small-button" title="Re-check extraction job receipts stored in Guilty Spark managed storage. No files are copied." disabled={stagingTag} onClick={()=>void refreshTagExchanges()}>Refresh extracted source jobs</button>
                  <select aria-label="Select extracted tag tree from another compatible map" value={selectedExchange}
                    onChange={e=>{setSelectedExchange(e.target.value);setStagedReceipt(null);}}>
                    <option value="">Choose extracted tags from another map</option>
                    {exchangeJobs.filter(j=>j.sourceProjectId!==project.id && j.sourceEngine===project.source?.engine && j.sourceVersion===project.source?.cacheVersion).map(j=>(
                      <option key={j.jobId} value={j.jobId}>{j.requestedTag} · {j.fileCount} files · {j.sourceSha256.slice(0,12)}</option>
                    ))}
                  </select>
                  <button type="button" className="small-button" title="Verify original tag and dependency hashes, then copy the tag tree into a new isolated destination folder. Never merges into a scenario or stock installation." disabled={!selectedExchange || stagingTag} onClick={async()=>{
                    setStagingTag(true);setStagedReceipt(null);
                    try {
                      const result=await call<NonNullable<typeof stagedReceipt>>('stage_tag_exchange_into_project',{projectId:project.id,sourceJobId:selectedExchange});
                      setStagedReceipt(result);
                      notify(`Copied ${result.fileCount} verified .tag files into an isolated local staging area. Scenario unchanged.`);
                    }catch(error){notify(`Cross-map tag staging refused: ${String(error)}`);}
                    finally{setStagingTag(false);}
                  }}>{stagingTag ? 'Verifying and staging…' : 'Stage verified tags in this project'}</button>
                  {stagedReceipt && <div className="tag-extraction-receipt" role="status">
                    <strong>{stagedReceipt.status} · {stagedReceipt.fileCount} verified tag files</strong>
                    <code>{stagedReceipt.tagRoot}</code>
                    <button type="button" className="small-button" onClick={async()=>{
                      try{await call('reveal_folder',{kind:'tagImport',id:`${project.id}:${stagedReceipt.jobId}`});}
                      catch(error){notify(`Could not open staging directory: ${String(error)}`);}
                    }}>Open isolated imported tags</button>
                    <span>{stagedReceipt.notice}</span>
                  </div>}
                  <span className="subtle">Same Halo engine/cache version only. All tag bytes are re-hashed before and after copying into new managed storage. You must still resolve dependencies and compile a compatible scenario.</span>
                </div>}
              </div>
            </div>
            <TagDuplicatePanel key={`${project.id}:${selectedTag.id}`} project={project} inspection={inspection} source={selectedTag} edit={edit} />
            {projectile && rocket && (
              <div className="preset-bar">
                <div>
                  <Sparkles size={18} />
                  <span>
                    <strong>A little 2007 energy</strong>
                    <small>Swap this weapon’s first trigger to an existing rocket projectile.</small>
                  </span>
                </div>
                <button onClick={() => change(selectedTag, projectile, rocket.id)}>
                  Use rocket projectile
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
            <div className="field-table">
              <div className="field-table-title">
                <h3>Properties</h3>
                <label className="checkbox-label">
                  <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
                  Show offsets
                </label>
              </div>
              <TagFields project={project} tag={selectedTag} tags={tags} advanced={advanced} change={(field,value)=>change(selectedTag,field,value)} />
            </div>
            {selectedTag.class === 'snd!' && (
              <>{onResources&&<button className="small-button" onClick={onResources}>Locate Halo Sounds folder</button>}<Sound key={`${selectedTag.id}:${project.source?.resourceSha256?.['sounds.map']}`} projectId={project.id} tagId={selectedTag.id} sourceHash={project.source?.sha256 ?? ''} onAssign={onAssignSound} /></>
            )}
            {selectedTag.references.length > 0 && (
              <div className="reference-list">
                <h3>Referenced tags</h3>
                {selectedTag.references.map((ref) => {
                  const target = tags.find((t) => t.id === effectiveReferenceId(project, selectedTag, ref));
                  return (
                    <button
                      key={`${ref.offset}-${ref.targetId}`}
                      disabled={!target}
                      onClick={() => target && navigateToTag(target.id)}
                    >
                      <GitBranch size={14} />
                      <span>
                        <small>{ref.label}</small>
                        <strong>{target?.path ?? 'Unresolved reference'}</strong>
                      </span>
                      <Pill>{ref.class}</Pill>
                      <ArrowRight size={14} />
                    </button>
                  );
                })}
              </div>
            )}
            <TagLineageInspector key={`${project.id}:${selectedTag.id}`} project={project} inspection={inspection} tag={selectedTag} onNavigate={navigateToTag} notify={notify} />
            <TagMigrationReviewPanel key={`${project.id}:${inspection.sha256}`} project={project} inspection={inspection} notify={notify} />
            <Notice tone="info">
              Edits are stored in your .gsproject. The source map stays unchanged. Use Build &amp; Playtest to
              extract, rebuild and validate the edited cache.
            </Notice>
          </>
        ) : (
          <Empty icon={<FileCode2 />} title="Select a tag">
            Inspect properties and relationships, then make changes in your project.
          </Empty>
        )}
      </section>
      <aside className="panel relationships">
        <div className="panel-heading">
          <strong>Relationships</strong>
          <GitBranch size={15} />
        </div>
        {selectedTag && (
          <>
            <div className="dependency-graph">
              <div className="graph-origin">
                <FileCode2 size={18} />
                <strong>{shortPath(selectedTag.path)}</strong>
                <small>{selectedTag.class}</small>
              </div>
              {selectedTag.references.length > 0 && <div className="graph-trunk" />}
              {selectedTag.references.slice(0, 6).map((ref) => {
                const targetId = effectiveReferenceId(project, selectedTag, ref);
                const target = tags.find((t) => t.id === targetId);
                return (
                  <button
                    key={ref.offset}
                    className="graph-target"
                    disabled={!target}
                    onClick={() => navigateToTag(targetId)}
                  >
                    <span className="graph-branch" />
                    <Pill>{ref.class}</Pill>
                    <span>{shortPath(target?.path ?? 'unresolved')}</span>
                    <ArrowRight size={12} />
                  </button>
                );
              })}
              {selectedTag.references.length === 0 && (
                <p className="subtle">No relationships are indexed for this schema.</p>
              )}
            </div>
            <div className="inspector-section">
              <div className="section-label">Project changes</div>
              <div className="change-count">
                {project.tagEdits.length}
                <span>edited fields</span>
              </div>
              <p className="subtle">A typed overlay preserves the original data, including unknown fields.</p>
              {project.tagEdits.length > 0 && (
                <button
                  className="small-button"
                  onClick={() => edit({ ...project, tagEdits: [] }, 'Reset all tag edits')}
                >
                  <RotateCcw size={13} />
                  Reset all tag edits
                </button>
              )}
            </div>
            <div className="inspector-section">
              <div className="section-label">Recent history</div>
              {project.history
                .slice(-6)
                .reverse()
                .map((h) => (
                  <div className="history-row" key={h.id}>
                    <ArrowDownToLine size={12} />
                    <span>
                      {h.description}
                      <small>
                        {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </small>
                    </span>
                  </div>
                ))}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
