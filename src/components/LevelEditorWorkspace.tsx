import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Layers3, Plus, Radio } from 'lucide-react';
import LiveEditor from './LiveEditor';
import BspAssembly from './BspAssembly';
import{WorkspacePanel}from'./WorkspacePanels';
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
  onImportMap,onContinue,onDirector,
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
  onImportMap:()=>void;onContinue:(id:string)=>void;
  onDirector:()=>void;
}) {
  const [target, setTarget] = useMapState<'auto' | 'source' | 'live'>(project?.id??'new-map','level.target',intent === 'live' ? 'live' : 'auto');
  const [creating,setCreating]=useMapState(project?.id??'new-map','level.creating',false);
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (intent === 'live') {
      setTarget('live');
      setCreating(false);
    }
  }, [intent]);
  const mode = creating ? 'source' : target;
  const valid=!!project?.quickForge||!!project?.assets.length||!!project?.source&&inspection?.sha256===project.source.sha256;
  if(!valid&&!creating&&target!=='live')return <section className="gs-editing-choice"><h1>What would you like to work on?</h1><p>Open a map, build a new level, or connect to your game. Each keeps its own files and camera.</p><div><button onClick={onImportMap}>Open a Halo map</button><button onClick={()=>{setCreating(true);setTarget('source');}}>Create a new Halo level</button><button onClick={()=>setTarget('live')}>Connect to a running Halo game</button>{entries[0]&&<button onClick={()=>onContinue(entries[0].id)}>Continue {entries[0].title}</button>}</div></section>;
  return (
    <div className="level-editor-workspace">
      <header className="level-editor-context">
        {live ? <Radio size={17} /> : <Layers3 size={17} />}
        <strong>LEVEL EDITOR</strong>
        {valid&&<button className="small-button" onClick={onDirector}>Recording Director ↗</button>}
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
      {project?.source&&!project.quickForge&&<WorkspacePanel id="construction" label="Construction"><BspAssembly key={project.id} project={project} entries={entries} onEdit={onSourceEdit} onSave={onBeforeResources} onBuild={onBuild}/></WorkspacePanel>}
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
