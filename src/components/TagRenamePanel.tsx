import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import type { MapInspection, Project, Tag } from '../types';
import { renamedTagPath, queueTagRename } from '../tagRenames';
import { shortPath } from '../editor';

export default function TagRenamePanel({project, inspection, tag, edit}: {
  project: Project; inspection: MapInspection; tag: Tag; edit: (project: Project, description: string) => void;
}) {
  const path = renamedTagPath(project, tag);
  const [value, setValue] = useState(shortPath(path)), [error, setError] = useState('');
  useEffect(() => { setValue(shortPath(path)); setError(''); }, [project.id, tag.id, path]);
  const root = ['scnr', 'sbsp', 'matg'].includes(tag.class);
  return <details className="tag-rename-panel">
    <summary><Pencil size={12}/>{path !== tag.path ? 'Custom name · queued' : 'Rename tag'}</summary>
    {root ? <p>Scenario, BSP and globals roots keep their dedicated build paths. Other tag names can be changed here.</p> : <>
      <form onSubmit={event => {
        event.preventDefault();
        try { edit(queueTagRename(project, inspection, tag, value), `Rename tag ${shortPath(tag.path)} → ${value.trim()}`); setError(''); }
        catch(reason) { setError(String(reason)); }
      }}>
        <label>Custom tag name<input aria-label="Custom tag name" value={value} maxLength={240} onChange={event => setValue(event.target.value)} placeholder="My custom weapon"/></label>
        <button type="submit">Rename tag</button>
        {path !== tag.path && <button type="button" onClick={() => edit({...project, tagRenames: project.tagRenames?.filter(rename => rename.sourceTagId !== tag.id)}, 'Restore original tag name')}>Reset name</button>}
      </form>
      <small>A name keeps the current folder; enter a full relative path to move it. Rebuild a map copy to update native references. Ctrl+Z undoes the queued rename.</small>
      {path !== tag.path && <code className="wrap-code">{path}</code>}
      {error && <p role="alert">{error}</p>}
    </>}
  </details>;
}
