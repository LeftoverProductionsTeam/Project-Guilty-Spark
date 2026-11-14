import { useCallback, useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import type { Project } from '../types';
import {
  notifyNativeSource,
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

/** Lazy, map-bound native operations. Reading a compiled tag does not grant
 * editing access to its native source; the desktop checks that separately. */
export default function NativeTagOperations({
  project,
  tagId,
  dirty = false,
  epoch = 0,
}: {
  project: Project;
  tagId?: number;
  dirty?: boolean;
  epoch?: number;
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
  const [encounterQueue,setEncounterQueue]=useState<NativeEncounterAppend[]>([]);
  const queuedActors=encounterQueue.reduce((sum,entry)=>sum+(entry.count??1),0);
  const validEncounterDraft=!!context?.canAppendEncounter&&context.actorVariants?.includes(actorPath)&&/^[A-Za-z0-9_]{1,31}$/.test(encounterName)&&Number.isInteger(Number(actorCount))&&Number(actorCount)>=1&&Number(actorCount)<=32&&actorSpacing.trim()!==''&&Number.isFinite(Number(actorSpacing))&&Number(actorSpacing)>=0.25&&Number(actorSpacing)<=16&&actorPosition.every(v=>v.trim()!==''&&Number.isFinite(Number(v))&&Math.abs(Number(v))<=2048);
  const encounterDraft=():NativeEncounterAppend=>({name:encounterName,actorPath,position:actorPosition.map(Number) as [number,number,number],startActive,count:Number(actorCount),spacing:Number(actorSpacing)});
  const generation = useRef(0);
  const projectId = project.id;
  const ceSource=context?.sourceTarget==='gbx-custom'||project.buildTargets?.some(target=>target.id===project.activeBuildTarget&&['haloCustomEdition','chupathingyCe'].includes(target.runtimeId));
  const [nativeTag, setNativeTag] = useState<number | null>(null),
    [choices, setChoices] = useState<{ id: number; class: string; path: string }[]>([]);
  const selectedTagId = tagId ?? nativeTag;
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
      setRadius(result.boundingRadius?.toString() ?? '');
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
    setEncounterQueue([]);
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
    void perform(async (current) => {
      const result = await call<NativePreview>('native_operation_preview', {
        projectId,
        tagId: selectedTagId,
        operation,
      });
      if (current !== generation.current) return;
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
    <details className="native-tag-operations" onToggle={(e) => setExpanded(e.currentTarget.open)}>
      <summary>
        Invader · native checks &amp; reviewed edits <Pill>Working source</Pill>
      </summary>
      <p className="subtle">
        Check native dependencies or preview a specific tag edit. Accepted edits become a separate source
        revision; use Build working tag edits to compile a new map.
      </p>
      {!native && <Notice tone="info">Open the desktop app to use installed native tools.</Notice>}
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
          <code className="native-tag-path">{context.tag}</code>
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
        <section aria-label="Native edit preview">
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
          {!!preview.actorPositions?.length&&<details><summary>{preview.actorPositions.length} reviewed source starting positions</summary>
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
