import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadMedia } from '../machinimaCapture';
import { addHmvPlacement, canPlaceHmvSpawn, exportForgeSidecar, FORGE_SIDECAR_LIMIT, hmvPlacementTag, importForgeSidecar, inspectForgeSidecar, removeForgeSidecar, showHmvSpawns, updateHmvPlacementProperties, updateHmvSpawnProperties } from '../forgeSidecar';
import { HMV_LIMIT, HMV_NAME, HMV_SPAWN_MODES, supportsHmvMap, type HmvPlacementProperties, type HmvSpawnProperties } from '../forgeHmv';
import type { MapInspection, Project, SceneObject } from '../types';
import { useMapState } from '../mapSession';
import { Notice, NumberField } from './ui';

export default function ForgeSidecarPanel({ project, map, edit, selected, onSelect, openRequest }: {
  project: Project;
  map: MapInspection;
  edit: (next: Project, description: string) => void;
  selected?: SceneObject;
  onSelect: (id: string) => void;
  openRequest: number;
}) {
  const current = useRef({project,map});
  current.current = {project,map};
  const ticket = useRef(0);
  const [expanded,setExpanded] = useMapState(project.id,'world.forge-sidecar',false);
  useEffect(() => { if (openRequest) setExpanded(true); }, [openRequest]);
  useEffect(() => () => { ticket.current++; }, []);
  const [problem,setProblem] = useState('');
  const layout = project.forgeSidecar;
  const summary = useMemo(() => {
    if (!layout) return null;
    try { return inspectForgeSidecar(layout,map); } catch { return null; }
  }, [layout,map]);
  const compatible = project.source?.sha256 === map.sha256 && !project.quickForge
    && (map.header.version === 5 && map.header.scenarioType === 1
      || map.header.version === 609 && [0, 1].includes(map.header.scenarioType));
  const canAddHmv = compatible && supportsHmvMap(map) && (!layout || layout.bytes);
  const selectedTag = canAddHmv && hmvPlacementTag(project, map, selected);
  const selectedSpawn = canAddHmv && canPlaceHmvSpawn(project, map, selected);
  const properties = selected && summary?.properties.get(selected.id);
  const spawn = summary?.spawns.find(row => row.id === selected?.id);
  const sceneIds = new Set(project.scene.map(object => object.id));
  const hiddenSpawns = summary?.spawns.filter(record => !sceneIds.has(record.id)) ?? [];
  const visibleSpawns = (summary?.spawns.length ?? 0) - hiddenSpawns.length;
  if (!compatible && !layout) return null;

  async function open(file: File) {
    const request = ++ticket.current;
    const base = map.sha256;
    setProblem('');
    try {
      const hmv = HMV_NAME.test(file.name);
      if (!(hmv ? file.size <= HMV_LIMIT : /\.txt$/i.test(file.name) && file.size <= FORGE_SIDECAR_LIMIT)) {
        throw Error('Choose an OpenCE Forge .txt (up to 1 MiB) or a Forge .hmv (up to 64 KiB).');
      }
      const bytes = await file.arrayBuffer();
      const input = hmv ? new Uint8Array(bytes) : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      if (request !== ticket.current) return;
      const latest = current.current;
      if (latest.map.sha256 !== base) throw Error('The base map changed. Choose the layout again.');
      const result = importForgeSidecar(latest.project,latest.map,file.name,input);
      edit(result.project,'Import Forge layout');
    } catch (error) {
      if (request === ticket.current) setProblem(String(error));
    }
  }

  function addPlacement() {
    if (!selected) return;
    try {
      ticket.current++;
      const result = addHmvPlacement(project, map, selected);
      edit(result.project, layout ? 'Add Forge placement' : 'Create Forge layout');
      onSelect(result.selectedId);
      setProblem('');
    } catch (error) { setProblem(String(error)); }
  }

  function changeProperties(patch: Partial<HmvPlacementProperties>) {
    if (!selected || !properties) return;
    try {
      const next = updateHmvPlacementProperties(project, map, selected, { ...properties, ...patch });
      if (next !== project) edit(next, 'Change Forge placement properties');
      setProblem('');
    } catch (error) { setProblem(String(error)); }
  }

  function changeSpawn(patch: Partial<HmvSpawnProperties>) {
    if (!selected || !spawn) return;
    try {
      const next = updateHmvSpawnProperties(project, map, selected, { ...spawn.properties, ...patch });
      if (next !== project) edit(next, 'Change Forge player spawn');
      setProblem('');
    } catch (error) { setProblem(String(error)); }
  }

  function showSpawns() {
    try {
      const next = showHmvSpawns(project, map);
      if (next !== project && hiddenSpawns.length) {
        edit(next, 'Show Forge player spawns');
        onSelect(hiddenSpawns[0].id);
      }
      setProblem('');
    } catch (error) { setProblem(String(error)); }
  }

  return <details className="forge-sidecar-panel" open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}>
    <summary>Forge layout</summary>
    {canAddHmv && <>
      <button type="button" disabled={!selectedTag && !selectedSpawn} onClick={addPlacement}>
        {selectedSpawn ? (layout ? 'Add selected spawn to HMV' : 'Create HMV from selected spawn')
          : (layout ? 'Add selected object to HMV' : 'Create HMV from selected object')}
      </button>
      {!selectedTag && !selectedSpawn && <p className="subtle">Select a player spawn or unscaled object from this map.</p>}
    </>}

    {compatible && selected && properties && <fieldset key={selected.id}>
      <legend>Placement properties</legend>
      <label className="field-label">Team
        <select value={properties.team} onChange={event => changeProperties({ team: Number(event.target.value) })}>
          <option value={-1}>Unassigned</option>
          <option value={0}>Red</option>
          <option value={1}>Blue</option>
          {[2, 3, 4, 5, 6, 7].map(team => <option key={team} value={team}>Team {team}</option>)}
        </select>
      </label>
      <label className="field-label">Respawn delay (seconds)
        <NumberField label="Respawn delay (seconds)" value={properties.respawnSeconds} min={0} max={600} step={1}
          onCommit={respawnSeconds => changeProperties({ respawnSeconds })} />
      </label>
      <label><input type="checkbox" checked={properties.placeAtStart}
        onChange={event => changeProperties({ placeAtStart: event.target.checked })} /> Place at start</label>
      <label className="field-label">Physics
        <select value={properties.physics} onChange={event => changeProperties({ physics: event.target.value as HmvPlacementProperties['physics'] })}>
          <option value="normal">Normal</option>
          <option value="fixed">Fixed</option>
          <option value="phased">Phased</option>
        </select>
      </label>
    </fieldset>}
    {compatible && spawn && <fieldset key={spawn.id}>
      <legend>Player spawn properties</legend>
      <label className="field-label">Spawn team
        <select value={spawn.properties.team} onChange={event => changeSpawn({ team: Number(event.target.value) })}>
          <option value={-1}>Any team</option>
          <option value={0}>Red</option>
          <option value={1}>Blue</option>
        </select>
      </label>
      <label><input type="checkbox" checked={spawn.properties.initial}
        onChange={event => changeSpawn({ initial: event.target.checked })} /> Initial spawn</label>
      <p className="subtle">Select the game types that use this spawn. Clear all to include every game type.</p>
      <div aria-label="Spawn game types" role="group">
        {HMV_SPAWN_MODES.map((mode, index) => <label key={mode}>
          <input type="checkbox" checked={!!(spawn.properties.modes & (1 << index))} onChange={() => changeSpawn({
            modes: spawn.properties.modes ^ (1 << index),
          })} /> {mode}
        </label>)}
      </div>
    </fieldset>}
    {layout ? <>
      <p>{layout.name}</p>
      {summary&&<p role="status">{summary.editable + visibleSpawns} editable placements · {summary.retained - visibleSpawns} other records preserved.</p>}
      {!!hiddenSpawns.length && <button type="button" onClick={showSpawns}>Show layout spawns</button>}
      <p className="subtle">Move or rotate placements, then export a separate layout copy for the matching base map. {layout.bytes && 'Use Duplicate or Remove in Transform to edit placements. Move player spawns and adjust yaw.'}</p>
      {summary?.forerunner && map.header.version === 5 && <p className="subtle">In Chupathingy builds with Forge, put the copy in <code>forge/{summary.forerunner.mapName}/</code> under the game’s save folder, then select it in Multiplayer → Forge.</p>}
      <button type="button" disabled={!compatible || !summary} onClick={()=>{
        try {
          const output = exportForgeSidecar(project,map);
          if (typeof output === 'string') {
            downloadMedia(layout.name.slice(0,-4)+'-spark.txt',new Blob([output],{type:'text/plain;charset=utf-8'}));
          } else {
            downloadMedia(layout.name.slice(0,-4).slice(0,22)+'-spark.hmv',new Blob([Uint8Array.from(output).buffer]));
          }
          setProblem('');
        } catch (error) { setProblem(String(error)); }
      }}>Export Forge layout copy</button>
      {summary?.forerunner && <div>
        <button type="button" disabled={!compatible || !!summary.forerunner.issue} onClick={()=>{
          try {
            const output = exportForgeSidecar(project, map, 'forerunner');
            if (typeof output !== 'string') downloadMedia('import.hmv', new Blob([Uint8Array.from(output).buffer]));
            setProblem('');
          } catch (error) { setProblem(String(error)); }
        }}>Export for Forerunner</button>
        <p className="subtle">{summary.forerunner.issue ?? <>Copy <code>import.hmv</code> to <code>forge/{summary.forerunner.mapName}/</code> in the save folder of a Forerunner build with HMV support. In an empty Forge session on this map, choose <strong>Forge Tools → Load Layout (.HMV)</strong>.{summary.forerunner.hasScenery && ' A network host cannot load layouts with scenery.'}</>}</p>
      </div>}
      <button type="button" onClick={()=>{
        ticket.current++;
        edit(removeForgeSidecar(project),'Remove imported Forge layout');
        setProblem('');
      }}>Remove layout from project</button>
    </> : <label>Import Forge layout<input aria-label="Import Forge layout" type="file" accept={map.header.scenarioType === 1 ? ".txt,.hmv" : ".hmv"} onChange={event=>{
      const file=event.target.files?.[0];
      event.target.value='';
      if (file) void open(file);
    }}/></label>}
    {layout && !summary && <Notice tone="error">Open the matching preserved map and check the layout before exporting.</Notice>}
    {problem&&<Notice tone="error">{problem}</Notice>}
  </details>;
}
