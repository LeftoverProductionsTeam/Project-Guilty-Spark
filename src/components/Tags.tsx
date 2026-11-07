import NativeModelPreview from './NativeModelPreview';
import BitmapPreview from './BitmapPreview';
import { catalogAssets } from '../forge';
import TagFields from './TagFields';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowRight, ChevronRight, FileCode2, GitBranch, RotateCcw, Search, Sparkles } from 'lucide-react';
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
import {useMapState,writeMapSession} from '../mapSession';
import BaboonTools from './BaboonTools';
import NativeTagOperations from './NativeTagOperations';
import SmartEditPanel from './SmartEditPanel';
import TagRenamePanel from './TagRenamePanel';
import { renamedTagPath } from '../tagRenames';
import { WorkspacePanel, useWorkspaceFileActions } from './WorkspacePanels';
import { defaultTagContext, inspectTagContexts, isTagContext, TAG_CONTEXTS } from '../tagContexts';
import type { TagContext } from '../tagContexts';
import LogicEvents from './LogicEvents';
import '../tagWorkspace.css';
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
  onNativeEditor,
  onLevelEditor,
  hasUnsavedChanges = false,
  onSave,
}: {
  project: Project;
  inspection: MapInspection | null;
  entries: LibraryEntry[];
  onSelectMap: (id: string) => void;
  edit: (p: Project, d: string) => void;
  notify: (m: string) => void;
  focusTagId?: number | null;
  onFocusHandled?: () => void;
  onAssignSound?: (cue: CueName, ref: LocalCueReference) => void;
  onResources?: () => void;
  onNativeEditor?: () => void;
  onLevelEditor?: () => void;
  hasUnsavedChanges?: boolean;
  onSave?: () => Promise<void>;
}) {
  const [query, setQuery] = useMapState(project.id,'tags.query','');
  const [filter, setFilter] = useMapState(project.id,'tags.filter','all');
  const [selected, setSelected] = useMapState<number | null>(project.id,'tags.selection',
    inspection?.tags.find((t) => t.class === 'weap')?.id ?? inspection?.tags[0]?.id ?? null,
  );
  const [expanded, setExpanded] = useMapState<Record<string,boolean>>(project.id,'tags.classes',{});
  const [advanced, setAdvanced] = useMapState(project.id,'tags.advanced',false);
  const [animatePreview,setAnimatePreview] = useMapState(project.id,'tags.preview.animation',false);
  const [contexts,setContexts] = useMapState<Record<string,TagContext>>(project.id,'tags.contexts',{});
  const [relatedSelection,setRelatedSelection] = useMapState<Record<string,number|string>>(project.id,'tags.context-selection',{});
  const [openedContexts,setOpenedContexts] = useState<Record<string,true>>({});
  const [previewMaterials,setPreviewMaterials] = useState<{key:string;ids:number[]}|null>(null);
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
  async function extractSelectedTag() {
    if (!selectedTag) return;
    setExtractingTag(selectedTag.id);
    setExtractionReceipt(null);
    try {
      const receipt = await call<NonNullable<typeof extractionReceipt>>(
        'extract_selected_tag_tree',
        {
          projectId: project.id,
          tagId: selectedTag.id,
        },
      );
      setExtractionReceipt(receipt);
      await refreshTagExchanges();
      notify(
        `Invader extracted ${receipt.files.length} real tag files to an isolated local folder. Not imported into any other map.`,
      );
    } catch (error) {
      notify(`Actual tag extraction rejected: ${String(error)}`);
    } finally {
      setExtractingTag(null);
    }
  }
  useWorkspaceFileActions('tags:'+project.id,selectedTag ? [
    {id:'export-tag',label:'Export tag + dependencies…',hint:'Extract original source tags through Invader. Staged edits require their native build first.',disabled:!native||!project.source||extractingTag!==null,run:()=>{chooseContext('Native Output');void extractSelectedTag();}},
    {id:'tag-native-output',label:'Tag native output…',run:()=>chooseContext('Native Output')},
  ]:[]);
  const contextKey = `${inspection?.sha256}:${selectedTag?.id}`;
  const context = isTagContext(contexts[contextKey]) ? contexts[contextKey] : selectedTag ? defaultTagContext(selectedTag) : 'Properties';
  const chooseContext = (value: TagContext) => setContexts(previous => ({...previous,[contextKey]:value}));
  useEffect(()=>{setOpenedContexts(previous=>({...previous,[`${contextKey}:${context}`]:true}));},[contextKey,context]);
  const openedContext = (value:TagContext) => context===value||!!openedContexts[`${contextKey}:${value}`];
  const related = useMemo(() => selectedTag && inspection ? inspectTagContexts(project,inspection,selectedTag) : null,
    [inspection,selectedTag,project.source?.sha256,project.tagEdits]);
  const relatedTag = (kind:string, options:Tag[]) => options.find(tag=>tag.id===relatedSelection[`${contextKey}:${kind}`])??options[0];
  const captureMaterials=useCallback((ids:number[])=>setPreviewMaterials({key:contextKey,ids}),[contextKey]);
  const previewShaderIds=previewMaterials?.key===contextKey?previewMaterials.ids:[];
  const materials=useMemo(()=>[...(related?.materials??[])].sort((a,b)=>Number(previewShaderIds.includes(b.id))-Number(previewShaderIds.includes(a.id))),[related,previewMaterials,contextKey]);
  const material = relatedTag('material',materials);
  const bitmaps=useMemo(()=>material?material.references.flatMap(reference=>{
    const target=reference.class==='bitm'?tags.find(tag=>tag.id===effectiveReferenceId(project,material,reference)&&tag.class==='bitm'):undefined;
    return target?[target]:[];
  }).filter((tag,index,values)=>values.findIndex(value=>value.id===tag.id)===index):related?.bitmaps??[],[material,related,inspection,project.tagEdits]);
  const bitmap = relatedTag(`bitmap:${material?.id??'asset'}`,bitmaps);
  const sound = relatedTag('sound',related?.sounds??[]);
  const logicPlacements = project.quickForge?.placements.filter(placement=>placement.tagId===selectedTag?.id&&placement.sourceProjectId===project.id&&placement.sourceSha256===project.source?.sha256)??[];
  const logicPlacement = logicPlacements.find(placement=>placement.id===String(relatedSelection[`${contextKey}:logic`]))??logicPlacements[0];
  useEffect(()=>{
    if(focusTagId!=null&&selectedTag?.id!==focusTagId)return;
    if(new URLSearchParams(location.search).get('panel')==='object-tags'&&selectedTag)
      writeMapSession(project.id,'viewport.tags.selected',selectedTag.id);
  },[project.id,selectedTag?.id,focusTagId]);
  const selectedModel = useMemo(
    () =>
      selectedTag && ['mod2','mode'].includes(selectedTag.class) && project.source
        ? { tagId: selectedTag.id, sourceProjectId: project.id, sourceSha256: project.source.sha256 }
        : catalogAssets({ project, inspection }).find((asset) => asset.tagId === selectedTag?.id),
    [project.id, project.source?.sha256, inspection, selectedTag?.id],
  );
  const classes = useMemo(() => [...new Set(tags.map((t) => t.class))].sort(), [tags]);
  const shown = useMemo(
    () =>
      tags.filter(
        (t) =>
          (filter === 'all' || t.class === filter) &&
          (renamedTagPath(project,t).toLowerCase().includes(query.toLowerCase()) || t.path.toLowerCase().includes(query.toLowerCase()) ||
            t.class.toLowerCase().includes(query.toLowerCase())),
      ),
    [tags, query, filter, project.tagRenames],
  );
  const grouped=useMemo(()=>{const groups=new Map<string,Tag[]>();for(const tag of shown){const group=groups.get(tag.class)??[];group.push(tag);groups.set(tag.class,group);}return [...groups].sort(([a],[b])=>a.localeCompare(b));},[shown]);
  // Referenced tags are often outside the active class/search filters.
  // Make the destination visible in the left browser, not just the inspector.
  function navigateToTag(id: number) {
    const tag = tags.find((candidate) => candidate.id === id);
    if (!tag) return;
    setQuery('');
    setFilter('all');
    // A large class might contain hundreds of entries. Do not hide a linked
    // target behind the default pagination limit.
    setExpanded(old=>({...old,[tag.class]:true}));
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
  function renderAssetContexts() {
    if (!selectedTag || !related) return null;
    const pick = (kind:string, options:Tag[], selected:Tag|undefined) => {const family=kind.split(':')[0];return options.length>0&&<label className="tag-context-pick">
      {family === 'material' ? 'Shader' : family === 'bitmap' ? 'Bitmap' : 'Sound tag'}
      <select aria-label={`Asset ${family}`} value={selected?.id??''} onChange={event=>setRelatedSelection(previous=>({...previous,[`${contextKey}:${kind}`]:Number(event.target.value)}))}>
        {options.map(tag=><option key={tag.id} value={tag.id}>{shortPath(renamedTagPath(project,tag))} · {tag.class}</option>)}
      </select>
    </label>;};
    return <>
      <div className="tag-context-panel" role="tabpanel" id="tag-panel-Materials" aria-labelledby="tag-context-Materials" hidden={context!=='Materials'}>
        {related.error&&<Notice>{related.error}</Notice>}
        {pick('material',materials,material)}
        {material&&<>
          <code>{renamedTagPath(project,material)}</code>
          <dl className="tag-material-summary">
            <dt>Shader</dt><dd>{material.shaderPreview?.kind??material.class}</dd>
            <dt>UV scale</dt><dd>{material.shaderPreview?.uvScale.join(' × ')}</dd>
            <dt>Surfaces</dt><dd>{material.shaderPreview?.twoSided?'Both sides':'Front faces'}</dd>
            <dt>Alpha</dt><dd>{material.shaderPreview?.alphaTest?'Cutout':material.shaderPreview?.alphaBlended?'Blended':'Opaque'}</dd>
            <dt>Reflection</dt><dd>{material.shaderPreview?.reflection?'Source cubemap':'None indexed'}</dd>
            {selectedModel&&<><dt>Preview</dt><dd>{previewShaderIds.includes(material.id)?'Used by this model':'Other referenced shader'}</dd></>}
          </dl>
          {material.fields.length>0?<div className="field-table"><TagFields project={project} tag={material} tags={tags} advanced={advanced} change={(field,value)=>change(material,field,value)}/></div>:<p className="subtle">Read-only shader inspection. Edit its full schema through Native Output.</p>}
          <button className="small-button" onClick={()=>navigateToTag(material.id)}>Open shader tag</button>
          <p className="subtle">Source shader data. Rebuild a map copy to preview saved native changes.</p>
        </>}
        {pick(`bitmap:${material?.id??'asset'}`,bitmaps,bitmap)}
        {bitmap&&openedContext('Materials')&&<BitmapPreview key={`${project.id}:${inspection?.sha256}:${bitmap.id}`} project={project} tagId={bitmap.id} cube={tags.some(tag=>tag.shaderPreview?.reflection?.bitmapTagId===bitmap.id)}/>}
        {!material&&!bitmap&&!related.error&&<p className="subtle">No shader or bitmap is indexed for this tag. Follow Dependencies or use a compatible native tag editor.</p>}
        {related.warning&&<p className="subtle">{related.warning}</p>}
      </div>
      <div className="tag-context-panel" role="tabpanel" id="tag-panel-Animation" aria-labelledby="tag-context-Animation" hidden={context!=='Animation'}>
        <h3>Native animation</h3>
        {related.animations.map(tag=><button className="tag-related-link" key={tag.id} onClick={()=>navigateToTag(tag.id)}>{shortPath(tag.path)} <Pill>{tag.class}</Pill></button>)}
        <p className="subtle">{selectedModel&&selectedTag.references.some(reference=>reference.label==='Animation graph')?'Enable Native animation in the preview, then choose a source clip and Play or Pause. Only clips with a matching native rig can play.':'This tag has no supported object animation preview. Inspect a biped or object that references its native animation graph.'}</p>
      </div>
      <div className="tag-context-panel" role="tabpanel" id="tag-panel-Collision" aria-labelledby="tag-context-Collision" hidden={context!=='Collision'}>
        <h3>Native collision</h3>
        <p className="subtle">{selectedModel&&related.collision?'The preview shows the object’s actual first-permutation collision in its default pose. Render triangles are never used as a collision substitute. Use Native Output to rebuild structural changes.':'Collision preview requires a supported object with an attached collision model and matching bone hierarchy. Open its scenery, weapon, vehicle, biped or device tag.'}</p>
      </div>
      <div className="tag-context-panel" role="tabpanel" id="tag-panel-Sound" aria-labelledby="tag-context-Sound" hidden={context!=='Sound'}>
        {pick('sound',related.sounds,sound)}
        {sound&&openedContext('Sound')&&<Sound key={`${sound.id}:${JSON.stringify(project.source?.audioResources??project.source?.resourceSha256)}`} projectId={project.id} tagId={sound.id} sourceHash={project.source?.sha256??''} active={context==='Sound'} onAssign={onAssignSound} onResources={onResources}/>}
        {!sound&&<p className="subtle">No playable sound tag is indexed for this asset. Follow Dependencies to its sound or looping-sound references.</p>}
      </div>
      <div className="tag-context-panel" role="tabpanel" id="tag-panel-Logic" aria-labelledby="tag-context-Logic" hidden={context!=='Logic'}>
        <h3>Logic / Events</h3>
        {logicPlacement&&project.quickForge&&<>
          <label>Scenario instance<select aria-label="Logic asset instance" value={logicPlacement.id} onChange={event=>setRelatedSelection(previous=>({...previous,[`${contextKey}:logic`]:event.target.value}))}>{logicPlacements.map(placement=><option key={placement.id} value={placement.id}>{placement.name}</option>)}</select></label>
          {openedContext('Logic')&&<LogicEvents key={logicPlacement.id} document={project.quickForge} node={{type:'placement',value:logicPlacement}} commit={(document,description)=>edit({...project,quickForge:document},description)} onSelect={id=>{writeMapSession(project.id,'forge.selection',[id]);onLevelEditor?.();}}/>}
        </>}
        {!logicPlacement&&<p className="subtle">Behavior belongs to a placed scenario instance. Drag this asset into an editable map, select the instance, then open Logic / Events to connect a trigger or edit native HaloScript. Asset tags have no added script fields.</p>}
        {onLevelEditor&&<button className="small-button" onClick={onLevelEditor}>Open Level Editor</button>}
      </div>
    </>;
  }
  if (!inspection)
    return (
      project.builds.some(build=>build.status==='validated')?<section className="analysis-card"><h2>Native working tags</h2><p>Choose a tag from this map’s validated build. Native tools edit a separate source revision; Build working tag edits compiles the result.</p><NativeTagOperations project={project} dirty={hasUnsavedChanges}/></section>:
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
        <label className="section-label" htmlFor="tag-map-select">
          Map source
        </label>
        <select
          id="tag-map-select"
          className="class-filter"
          aria-label="Select Halo map"
          value={project.id}
          onChange={(e) => {
            if (e.target.value !== project.id) onSelectMap(e.target.value);
          }}
        >
          {entries
            .filter((entry) => entry.tagCount > 0 || entry.id === project.id)
            .map((entry) => (
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
              const value=e.target.value.toLowerCase();
              if(value.trim())setExpanded(old=>({...old,...Object.fromEntries(tags.filter(tag=>tag.path.toLowerCase().includes(value)||tag.class.toLowerCase().includes(value)).map(tag=>[tag.class,true]))}));
            }}
          />
        </div>
        <select
          className="class-filter"
          aria-label="Filter tag class"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            if(e.target.value!=='all')setExpanded(old=>({...old,[e.target.value]:true}));
          }}
        >
          <option value="all">All tag classes</option>
          {classes.map((c) => (
            <option key={c} value={c}>
              {classNames[c] ?? c} ({c})
            </option>
          ))}
        </select>
        <div className="tag-tree-actions">
          <button
            className="small-button"
            onClick={() => setExpanded(Object.fromEntries(classes.map((c) => [c, false])))}
          >
            Collapse all classes
          </button>
        </div>
        <div className="tag-list" aria-label="Tags by class">
          {grouped.map(([c, members]) => {
            const open=expanded[c]??(!!query.trim()||filter===c||selectedTag?.class===c);
            return <div className="tag-class-group" key={c}>
            <button className="tag-class-toggle" aria-label={`Toggle ${classNames[c]??c} class (${c})`} aria-expanded={open} aria-controls={`tag-class-${c}`} onClick={()=>setExpanded(old=>({...old,[c]:!open}))}>
              <ChevronRight size={14} className={open?'expanded':''}/><strong>{classNames[c]??c}</strong><code>{c}</code><span>{formatNumber(members.length)}</span>
            </button>
            {open&&<div id={`tag-class-${c}`} role="group" aria-label={`${classNames[c]??c} tags`}>{members.map((t) => (
            <button
              className={`tag-row ${selected === t.id ? 'selected' : ''}`}
              key={t.id}
              aria-pressed={selected===t.id}
              onClick={() => {setSelected(t.id);setExtractionReceipt(null);}}
            >
              <FileCode2 size={14}/>
              <span>
                <strong>{shortPath(renamedTagPath(project,t))}</strong>
                <small>{renamedTagPath(project,t).split(/[\\/]/).slice(0, -1).join(' / ')}</small>
              </span>
              {(project.tagEdits.some((e) => e.tagId === t.id)||project.tagRenames?.some(rename=>rename.sourceTagId===t.id)) && <span className="edit-dot" />}
            </button>
          ))}</div>}
          </div>;
          })}
          {shown.length === 0 && <div className="list-empty">No tags match this search.</div>}
        </div>
        <div className="panel-foot">{shown.length} matching · indexed from cache</div>
      </aside>
      <section className="tag-detail">
        {inspection.header.scenarioType === 2 && (
          <Notice>
            Interface map · browse its actual widgets, HUD definitions, fonts, strings and bitmap dependencies
            here. Widget links are followed one at a time, including cyclic collections. Game event handlers
            remain engine-controlled.
          </Notice>
        )}
        {selectedTag ? (
          <div className={`tag-selection-layout${selectedModel?' has-model':''}${selectedTag.class==='snd!'?' is-sound':''}`}>
            <div className="tag-properties-pane">
            <div className="tag-detail-heading">
              <div className="eyebrow">
                {classNames[selectedTag.class] ?? 'Tag'} · {selectedTag.class}
              </div>
              <h2>{shortPath(renamedTagPath(project,selectedTag))}</h2>
              <code>{renamedTagPath(project,selectedTag)}</code>
              <TagRenamePanel project={project} inspection={inspection} tag={selectedTag} edit={edit}/>
              <div className="tag-badges">
                <Pill tone="blue">ID {selectedTag.id.toString(16).toUpperCase()}</Pill>
                <Pill>{selectedTag.external ? 'External resource' : 'Embedded tag'}</Pill>
                <Pill tone={selectedTag.fields.length ? 'green' : 'muted'}>
                  {selectedTag.fields.length ? 'Typed fields available' : 'Inspection only'}
                </Pill>
              </div>
            </div>
            <div className="tag-context-tabs" role="tablist" aria-label="Asset contexts">
              {TAG_CONTEXTS.map(label=><button key={label} type="button" role="tab"
                id={`tag-context-${label.replaceAll(' ','-')}`} aria-controls={`tag-panel-${label.replaceAll(' ','-')}`}
                aria-selected={context===label} tabIndex={context===label?0:-1}
                onClick={()=>chooseContext(label)} onKeyDown={event=>{
                  const index=TAG_CONTEXTS.indexOf(label);
                  const next=event.key==='Home'?0:event.key==='End'?TAG_CONTEXTS.length-1:event.key==='ArrowRight'?(index+1)%TAG_CONTEXTS.length:event.key==='ArrowLeft'?(index+TAG_CONTEXTS.length-1)%TAG_CONTEXTS.length:null;
                  if(next===null)return;event.preventDefault();chooseContext(TAG_CONTEXTS[next]);
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
                }}>{label}</button>)}
            </div>
            <div className="tag-context-panel" role="tabpanel" id="tag-panel-Properties" aria-labelledby="tag-context-Properties" hidden={context!=='Properties'}>
            <div className="field-table">
              <div className="field-table-title">
                <h3>Editable fields · {selectedTag.fields.length}</h3>
                <label className="checkbox-label">
                  <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
                  Show offsets
                </label>
              </div>
              <TagFields
                project={project}
                tag={selectedTag}
                tags={tags}
                advanced={advanced}
                change={(field, value) => change(selectedTag, field, value)}
              />
              <SmartEditPanel project={project} onSave={onSave} onSelectMap={onSelectMap} notify={notify}/>
            </div>
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
            </div>
            <div className="tag-context-panel" role="tabpanel" id="tag-panel-Native-Output" aria-labelledby="tag-context-Native-Output" hidden={context!=='Native Output'}>
              <details className="tag-secondary-actions">
                <summary>Extract, export or transfer tags</summary>
                <div className="tag-exchange-actions">
                  <button
                    type="button"
                    className="small-button"
                    title="Exports tag identities and dependency references in JSON, not actual Halo tag or texture bytes. Importers must verify source hash and cache version."
                    onClick={() => {
                      try {
                        const bundle = createTagExchangeBundle({ project, inspection }, [selectedTag.id]);
                        downloadLocalText(
                          `gs_tag_${selectedTag.class.replace(/[^A-Za-z0-9]/g, '_')}_${selectedTag.id.toString(16)}.json`,
                          JSON.stringify(bundle, null, 2),
                          'application/json',
                        );
                        notify(
                          'Tag identity and dependency references exported. This is not an extracted .tag file.',
                        );
                      } catch (error) {
                        notify(`Reference export failed: ${String(error)}`);
                      }
                    }}
                  >
                    Export tag reference + dependencies
                  </button>
                  <button
                    type="button"
                    className="small-button"
                    title="Opt-in Invader process extracts actual compatible tag files to a separate managed directory; this never edits the original .map or target scenario."
                    disabled={!native || !project.source || extractingTag !== null}
                    onClick={() => void extractSelectedTag()}
                  >
                    {extractingTag === selectedTag.id
                      ? 'Extracting…'
                      : 'Extract real .tag + dependencies (Invader)'}
                  </button>
                  <span className="subtle">
                    Requires owner-installed Invader in Settings and matching original resource maps. Actual
                    extraction is opt-in and never overwrites game tags.
                  </span>
                  {extractionReceipt && (
                    <div className="tag-extraction-receipt" role="status">
                      <strong>
                        {extractionReceipt.files.length} files / {formatNumber(extractionReceipt.totalBytes)}{' '}
                        bytes · {extractionReceipt.status}
                      </strong>
                      <code>{extractionReceipt.tagRoot}</code>
                      <button
                        type="button"
                        className="small-button"
                        onClick={async () => {
                          try {
                            await call('reveal_folder', { kind: 'tagExchange', id: extractionReceipt.jobId });
                          } catch (error) {
                            notify(`Cannot open extracted folder: ${String(error)}`);
                          }
                        }}
                      >
                        Open isolated extracted tags
                      </button>
                      <span>{extractionReceipt.notice}</span>
                    </div>
                  )}
                  {native && project.source && (
                    <div className="tag-staging-panel">
                      <strong>Cross-map .tag staging (isolated, no scenario edits)</strong>
                      <button
                        type="button"
                        className="small-button"
                        title="Re-check extraction job receipts stored in Guilty Spark managed storage. No files are copied."
                        disabled={stagingTag}
                        onClick={() => void refreshTagExchanges()}
                      >
                        Refresh extracted source jobs
                      </button>
                      <select
                        aria-label="Select extracted tag tree from another compatible map"
                        value={selectedExchange}
                        onChange={(e) => {
                          setSelectedExchange(e.target.value);
                          setStagedReceipt(null);
                        }}
                      >
                        <option value="">Choose extracted tags from another map</option>
                        {exchangeJobs
                          .filter(
                            (j) =>
                              j.sourceProjectId !== project.id &&
                              j.sourceEngine === project.source?.engine &&
                              j.sourceVersion === project.source?.cacheVersion,
                          )
                          .map((j) => (
                            <option key={j.jobId} value={j.jobId}>
                              {j.requestedTag} · {j.fileCount} files · {j.sourceSha256.slice(0, 12)}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        className="small-button"
                        title="Verify original tag and dependency hashes, then copy the tag tree into a new isolated destination folder. Never merges into a scenario or stock installation."
                        disabled={!selectedExchange || stagingTag}
                        onClick={async () => {
                          setStagingTag(true);
                          setStagedReceipt(null);
                          try {
                            const result = await call<NonNullable<typeof stagedReceipt>>(
                              'stage_tag_exchange_into_project',
                              { projectId: project.id, sourceJobId: selectedExchange },
                            );
                            setStagedReceipt(result);
                            notify(
                              `Copied ${result.fileCount} verified .tag files into an isolated local staging area. Scenario unchanged.`,
                            );
                          } catch (error) {
                            notify(`Cross-map tag staging refused: ${String(error)}`);
                          } finally {
                            setStagingTag(false);
                          }
                        }}
                      >
                        {stagingTag ? 'Verifying and staging…' : 'Stage verified tags in this project'}
                      </button>
                      {stagedReceipt && (
                        <div className="tag-extraction-receipt" role="status">
                          <strong>
                            {stagedReceipt.status} · {stagedReceipt.fileCount} verified tag files
                          </strong>
                          <code>{stagedReceipt.tagRoot}</code>
                          <button
                            type="button"
                            className="small-button"
                            onClick={async () => {
                              try {
                                await call('reveal_folder', {
                                  kind: 'tagImport',
                                  id: `${project.id}:${stagedReceipt.jobId}`,
                                });
                              } catch (error) {
                                notify(`Could not open staging directory: ${String(error)}`);
                              }
                            }}
                          >
                            Open isolated imported tags
                          </button>
                          <span>{stagedReceipt.notice}</span>
                        </div>
                      )}
                      <span className="subtle">
                        Same Halo engine/cache version only. All tag bytes are re-hashed before and after
                        copying into new managed storage. You must still resolve dependencies and compile a
                        compatible scenario.
                      </span>
                    </div>
                  )}
                </div>
              </details>
              <details className="tag-native-editing">
                <summary>Complete native tag editing</summary>
                <p>
                  Spark edits the typed fields indexed above. Extract this tag and its dependencies for a full
                  source tagset, then open the matching native tag editor. Unknown cache fields remain
                  preserved. Build the working tags to apply full-schema changes.
                </p>
                {onNativeEditor && (
                  <button disabled={!native} onClick={onNativeEditor}>
                    Open native tag editor
                  </button>
                )}
              </details>
            <div className="tag-native-tools">
            <BaboonTools project={project} tagId={selectedTag.id} dirty={hasUnsavedChanges} />
            <NativeTagOperations project={project} tagId={selectedTag.id} dirty={hasUnsavedChanges} />
            <TagDuplicatePanel
              key={`duplicate:${project.id}:${selectedTag.id}`}
              project={project}
              inspection={inspection}
              source={selectedTag}
              edit={edit}
            />
            </div>

            <Notice tone="info">
              Edits stay in this project until you publish a map copy. Review the save plan above for a
              direct cache edit or the matching native build route. Your original map stays unchanged.
            </Notice>
            </div>
            <div className="tag-context-panel" role="tabpanel" id="tag-panel-Dependencies" aria-labelledby="tag-context-Dependencies" hidden={context!=='Dependencies'}>
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
            <TagLineageInspector
              key={`lineage:${project.id}:${selectedTag.id}`}
              project={project}
              inspection={inspection}
              tag={selectedTag}
              onNavigate={navigateToTag}
              notify={notify}
            />
            <TagMigrationReviewPanel
              key={`migration:${project.id}:${inspection.sha256}`}
              project={project}
              inspection={inspection}
              notify={notify}
            />
            </div>
            {renderAssetContexts()}
            </div>
            {selectedModel&&<section className="tag-model-preview" aria-label="Actual model preview">
              {selectedTag.references.some(reference=>reference.label==='Animation graph')&&<label className="tag-preview-animation-toggle checkbox-label"><input type="checkbox" checked={animatePreview} onChange={event=>setAnimatePreview(event.target.checked)}/> Native animation</label>}
              <NativeModelPreview key={`${project.id}:${selectedModel.tagId}`} asset={selectedModel} environment={project.worldEnvironment} animate={animatePreview&&selectedTag.references.some(reference=>reference.label==='Animation graph')} surface={context==='Collision'&&related?.collision?'collision':'render'} onMaterials={captureMaterials}/>
            </section>}
          </div>
        ) : (
          <Empty icon={<FileCode2 />} title="Select a tag">
            Inspect properties and relationships, then make changes in your project.
          </Empty>
        )}
      </section>
      <WorkspacePanel id="tag-relationships" label="Tag relationships" defaultDock="right"><aside className="panel relationships">
        <div className="panel-heading">
          <strong>Relationships</strong>
          <GitBranch size={15} />
        </div>
        {selectedTag && (
          <>
            <div className="dependency-graph">
              <div className="graph-origin">
                <FileCode2 size={18} />
                <strong>{shortPath(renamedTagPath(project,selectedTag))}</strong>
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
                    <span>{target?shortPath(renamedTagPath(project,target)):'unresolved'}</span>
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
      </aside></WorkspacePanel>
    </div>
  );
}
