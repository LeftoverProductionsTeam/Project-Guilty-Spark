import { useEffect } from 'react';
import { classNames, effectiveReferenceId, setTagValue, shortPath } from '../editor';
import { useMapState } from '../mapSession';
import type { MapInspection, Project, TagField } from '../types';
import TagFields from './TagFields';
import BitmapPreview from './BitmapPreview';
import SmartEditPanel from './SmartEditPanel';
import { Notice, Pill } from './ui';
import '../viewportAssets.css';

/** A source-bound tag drawer. It shares project edits, never the full editor's navigation state. */
export default function ViewportTags({
  project,
  inspection,
  requestedTagId,
  requestRevision,
  edit,
  notify,
  onFullEditor,
  onSave,
  onSelectMap,
}: {
  project: Project;
  inspection: MapInspection;
  requestedTagId: number | null;
  requestRevision: number;
  edit: (project: Project, description: string) => void;
  notify: (message: string) => void;
  onFullEditor?: (tagId: number) => void;
  onSave?: () => Promise<void>;
  onSelectMap?: (id:string)=>void;
}) {
  const [selected, select] = useMapState<number | null>(project.id, 'viewport.tags.selected', null);
  const [advanced, setAdvanced] = useMapState(project.id, 'viewport.tags.offsets', false);
  useEffect(() => {
    if (requestedTagId !== null && inspection.tags.some((tag) => tag.id === requestedTagId))
      select(requestedTagId);
  }, [requestedTagId, requestRevision, inspection.sha256, select]);
  const tag = inspection.tags.find((tag) => tag.id === selected);
  if (!tag) return <p>Select a map object to inspect its tags. The viewport and camera stay in place.</p>;
  const change = (field: TagField, value: number) => {
    try {
      if (
        field.kind === 'reference' &&
        !inspection.tags.some((candidate) => candidate.id === value && candidate.class === field.targetClass)
      )
        throw Error('Choose a tag of the required class from this map.');
      edit(setTagValue(project, tag, field, value), `${shortPath(tag.path)}: ${field.label}`);
    } catch (reason) {
      notify(String(reason));
    }
  };
  return (
    <div className="viewport-tags" data-history-project={project.id}>
      <div className="panel-heading">
        <strong>{shortPath(tag.path)}</strong>
        <Pill>{classNames[tag.class] ?? tag.class}</Pill>
      </div>
      <code className="viewport-tag-path">{tag.path}</code>
      {(tag.class!=='bitm'||tag.fields.length>0)&&<><p className="subtle">
        Tag changes affect every object using this tag. Review the save plan to create a validated game map.
      </p>
      <label className="checkbox-label">
        <input type="checkbox" checked={advanced} onChange={(event) => setAdvanced(event.target.checked)} />
        Show offsets
      </label></>}
      {tag.class==='bitm'&&<BitmapPreview key={`${project.id}:${tag.id}`} project={project} tagId={tag.id}/>}
      <TagFields project={project} tag={tag} tags={inspection.tags} advanced={advanced} change={change} />
      <SmartEditPanel project={project} onSave={onSave} onSelectMap={onSelectMap} notify={notify}/>
      {tag.external && (
        <Notice>
          This tag is stored in the map’s shared resources. Editing requires matching source tags and a
          compatible rebuild.
        </Notice>
      )}
      {!!tag.references.length && (
        <details open>
          <summary>Dependencies</summary>
          <div className="viewport-tag-links">
            {tag.references.map((reference, index) => {
              const target = inspection.tags.find(
                (candidate) => candidate.id === effectiveReferenceId(project, tag, reference),
              );
              return (
                <button
                  key={`${index}:${reference.label}`}
                  disabled={!target}
                  onClick={() => target && select(target.id)}
                >
                  {reference.label} → {target ? shortPath(target.path) : 'Unavailable dependency'}
                </button>
              );
            })}
          </div>
        </details>
      )}
      {selected !== requestedTagId && requestedTagId !== null && (
        <button onClick={() => select(requestedTagId)}>Back to object tag</button>
      )}
      {onFullEditor && <button onClick={() => onFullEditor(tag.id)}>Open in full Tag editor</button>}
      {onSave && (tag.class!=='bitm'||tag.fields.length>0) && (
        <button onClick={() => void onSave().catch((reason) => notify(String(reason)))}>
          Save tag changes
        </button>
      )}
    </div>
  );
}
