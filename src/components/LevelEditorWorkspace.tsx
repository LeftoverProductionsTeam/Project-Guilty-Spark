import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Layers3, Plus, Radio } from 'lucide-react';
import LiveEditor from './LiveEditor';
import BspAssembly from './BspAssembly';
import {useMapState} from '../mapSession';
import type { Project, MapInspection, MeshData, OpenProject } from '../types';

/** One map viewer; document type selects its source tools and an exact live
 * identity selects runtime poses. A different running map never replaces an
 * open source document without the user's explicit Open action. */
export default function LevelEditorWorkspace({
  project,
  inspection,
  assetMeshes,
  source,
  newMap,
  intent,
  notify,
  onOpenMap,
  onBeforeResources,
  onResourcesConnected,
  onSourceEdit,
  entries,
  onBuild,
}: {
  project: Project | null;
  inspection: MapInspection | null;
  assetMeshes: Record<string, MeshData>;
  source: ReactNode;
  newMap: ReactNode;
  intent: 'world' | 'quickforge' | 'live';
  notify: (message: string) => void;
  onOpenMap: () => Promise<void>;
  onBeforeResources: () => Promise<void>;
  onResourcesConnected: (open: OpenProject) => Promise<void>;
  onSourceEdit: (project: Project, description: string) => void;
  entries:import('../types').LibraryEntry[];
  onBuild:()=>void;
}) {
  const [target, setTarget] = useMapState<'auto' | 'source' | 'live'>(project?.id??'new-map','level.target',intent === 'live' ? 'live' : 'auto');
  const [creating, setCreating] = useState(false),
    [live, setLive] = useState(false);
  useEffect(() => {
    if (intent === 'live') {
      setTarget('live');
      setCreating(false);
    }
  }, [intent]);
  useEffect(() => setCreating(false), [project?.id]);
  const mode = creating ? 'source' : target;
  return (
    <div className="level-editor-workspace">
      <header className="level-editor-context">
        {live ? <Radio size={17} /> : <Layers3 size={17} />}
        <strong>LEVEL EDITOR</strong>
        <span role="status">
          {live
            ? 'Live Halo session'
            : creating || project?.quickForge
              ? 'QuickForge source'
              : project?.source
                ? 'Source map'
                : 'New map'}
        </span>
        <label>
          Editing target
          <select
            aria-label="Editing target"
            value={target}
            onChange={(e) => {
              setCreating(false);
              setTarget(e.target.value as typeof target);
            }}
          >
            <option value="auto">Automatic</option>
            <option value="source">Source document</option>
            <option value="live">Running Halo session</option>
          </select>
        </label>
        <button
          type="button"
          className="small-button"
          onClick={() => {
            setCreating(true);
            setTarget('source');
          }}
        >
          <Plus size={14} />
          New QuickForge map
        </button>
        {creating && project && (
          <button
            type="button"
            className="small-button"
            onClick={() => {
              setCreating(false);
              setTarget('auto');
            }}
          >
            Return to open map
          </button>
        )}
      </header>
      {project?.source&&!project.quickForge&&<BspAssembly key={project.id} project={project} entries={entries} onEdit={onSourceEdit} onSave={onBeforeResources} onBuild={onBuild}/>}
      <section className="level-editor-body" aria-label="Map viewer">
        <LiveEditor
          onSourceEdit={onSourceEdit}
          project={project}
          inspection={inspection}
          assetMeshes={assetMeshes}
          notify={notify}
          mode={mode}
          sourceViewport={creating ? newMap : source}
          onLiveState={setLive}
          onOpenMap={onOpenMap}
          onBeforeResources={onBeforeResources}
          onResourcesConnected={onResourcesConnected}
        />
      </section>
    </div>
  );
}
