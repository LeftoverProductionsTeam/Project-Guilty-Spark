import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadMedia } from '../machinimaCapture';
import { addHmvObjective, addHmvPlacement, addHmvTeleporterPair, canPlaceHmvSpawn, changeHmvObjectiveSlot, changeHmvTeleporterChannel, exportForerunnerTextHmv, exportForgeSidecar, FORGE_SIDECAR_LIMIT, hmvPlacementTag, importForgeSidecar, inspectForgeSidecar, removeForgeSidecar, showHmvDevices, showHmvMarkers, updateHmvLayoutDetails, updateHmvPlacementProperties, updateHmvSpawnProperties } from '../forgeSidecar';
import { HMV_LIMIT, HMV_NAME, HMV_OBJECTIVES, HMV_SPAWN_MODES, HMV_TELEPORTER_CHANNELS, hmvObjectiveDefinition, isHmvDeviceGroup, supportsChupathingyForge, supportsHmvMap, type ForgeLayoutTarget, type HmvObjectiveType, type HmvPlacementProperties, type HmvSpawnProperties } from '../forgeHmv';
import type { MapInspection, Project, SceneObject } from '../types';
import { useMapState } from '../mapSession';
import { verifyForerunnerLocalForge } from '../runtimeWorkbench';
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
  const [checkingLocalForge,setCheckingLocalForge] = useState(false);
  const [objectiveType, setObjectiveType] = useState<HmvObjectiveType>(0);
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
  const metadata = summary?.metadata;
  const properties = selected && summary?.properties.get(selected.id);
  const selectedDevice = selectedTag && isHmvDeviceGroup(selectedTag.class);
  const spawn = summary?.spawns.find(row => row.id === selected?.id);
  const sceneIds = new Set(project.scene.map(object => object.id));
  const hiddenDevices = summary?.devices.filter(id => !sceneIds.has(id)) ?? [];
  const hiddenSpawns = summary?.spawns.filter(record => !sceneIds.has(record.id)) ?? [];
  const teleporters = summary?.teleporters ?? [];
  const endpoint = teleporters.find(record => record.id === selected?.id);
  const hiddenTeleporters = teleporters.filter(record => !sceneIds.has(record.id));
  const objectives = summary?.objectives ?? [];
  const objective = objectives.find(record => record.id === selected?.id);
  const objectiveDefinition = objective && hmvObjectiveDefinition(objective.properties.type);
  const hiddenObjectives = objectives.filter(record => !sceneIds.has(record.id));
  const visibleMarkers = (summary?.spawns.length ?? 0) - hiddenSpawns.length + teleporters.length - hiddenTeleporters.length
    + objectives.length - hiddenObjectives.length;
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

  async function exportForerunner(target: ForgeLayoutTarget) {
    const snapshot = current.current;
    const request = ticket.current;
    setProblem('');
    try {
      if (target === 'forerunner-local') {
        setCheckingLocalForge(true);
        await verifyForerunnerLocalForge();
      }
      if (request !== ticket.current) return;
      if (snapshot.project !== current.current.project || snapshot.map !== current.current.map) {
        throw Error('The Forge layout changed during the runtime check. Export the current layout again.');
      }
      const output = exportForgeSidecar(snapshot.project, snapshot.map, target);
      if (typeof output !== 'string') downloadMedia('import.hmv', new Blob([Uint8Array.from(output).buffer]));
    } catch (error) {
      if (request === ticket.current) setProblem(String(error));
    } finally {
      if (target === 'forerunner-local') setCheckingLocalForge(false);
    }
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

  function addTeleporters() {
    if (!selected) return;
    try {
      ticket.current++;
      const result = addHmvTeleporterPair(project, map, selected);
      edit(result.project, 'Add Forge teleporter pair');
      onSelect(result.selectedId);
      setProblem('');
    } catch (error) { setProblem(String(error)); }
  }

  function changeTeleportChannel(channel: number) {
    if (!selected || !endpoint) return;
    try {
      const next = changeHmvTeleporterChannel(project, map, selected, channel);
      if (next !== project) edit(next, 'Move linked teleporters to another channel');
      setProblem('');
    } catch (error) { setProblem(String(error)); }
  }

  function addObjective() {
    if (!selected) return;
    try {
      ticket.current++;
      const result = addHmvObjective(project, map, selected, objectiveType);
      edit(result.project, 'Add Forge objective');
      onSelect(result.selectedId);
      setProblem('');
    } catch (error) { setProblem(String(error)); }
  }

  function changeObjectiveSlot(slot: number) {
    if (!selected || !objective) return;
    try {
      const next = changeHmvObjectiveSlot(project, map, selected, slot);
      if (next !== project) edit(next, 'Change Forge objective index');
      setProblem('');
    } catch (error) { setProblem(String(error)); }
  }

  function showMarkers(kind: 'spawns' | 'teleporters' | 'objectives') {
    const missing = { spawns: hiddenSpawns, teleporters: hiddenTeleporters, objectives: hiddenObjectives }[kind];
    try {
      const next = showHmvMarkers(project, map, kind);
      if (next !== project && missing.length) {
        edit(next, 'Show Forge ' + kind);
        onSelect(missing[0].id);
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
      {selectedDevice && <p className="subtle">Forge places this device with its tag defaults. For linked switches, power groups or scripts, edit the scenario’s native device placements.</p>}
    </>}

    {canAddHmv && map.header.scenarioType === 1 && <>
      <button type="button" disabled={!selected} onClick={addTeleporters}>
        Add teleporter pair near selection
      </button>
      <div className="button-row">
        <select aria-label="Forge objective type" value={objectiveType} onChange={event => {
          const definition = hmvObjectiveDefinition(Number(event.target.value));
          if (definition) setObjectiveType(definition.type);
        }}>
          {HMV_OBJECTIVES.map(definition => <option key={definition.type} value={definition.type}>{definition.name}</option>)}
        </select>
        <button type="button" disabled={!selected} onClick={addObjective}>Add objective near selection</button>
      </div>
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
    {compatible && endpoint && <fieldset key={endpoint.id}>
      <legend>Teleporter properties</legend>
      <p>{endpoint.role === 'sender' ? 'Sender' : 'Receiver'}</p>
      <label className="field-label">Channel for linked endpoints
        <select value={endpoint.channel} onChange={event => changeTeleportChannel(Number(event.target.value))}>
          {Array.from({ length: HMV_TELEPORTER_CHANNELS }, (_, channel) => (
            <option key={channel} value={channel}
              disabled={channel !== endpoint.channel && teleporters.some(record => record.channel === channel)}>
              Channel {channel + 1}
            </option>
          ))}
        </select>
      </label>
      <p className="subtle">Move the sender and receiver into place separately. Changing the channel moves their entire linked group.</p>
    </fieldset>}
    {compatible && objective && objectiveDefinition && <fieldset key={objective.id}>
      <legend>{objectiveDefinition.name}</legend>
      <label className="field-label">{objectiveDefinition.slotLabel}
        <select value={objective.properties.slot} onChange={event => changeObjectiveSlot(Number(event.target.value))}>
          {Array.from({ length: objectiveDefinition.slots }, (_, slot) => (
            <option key={slot} value={slot}>{objectiveDefinition.type === 0 ? (slot === 0 ? 'Red' : 'Blue') : slot + 1}</option>
          ))}
        </select>
      </label>
      {objectiveDefinition.type === 8 && <p className="subtle">Give the points around one hill the same hill number.</p>}
    </fieldset>}
    {layout ? <>
      <p>{metadata && <><strong>{metadata.details.title}</strong> · </>}{layout.name}</p>
      {compatible && metadata && <details>
        <summary>Layout details</summary>
        <form key={JSON.stringify(metadata)} onSubmit={event => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          try {
            const next = updateHmvLayoutDetails(project, map, {
              title: String(values.get('title') ?? ''),
              author: String(values.get('author') ?? ''),
              description: String(values.get('description') ?? ''),
            });
            if (next !== project) edit(next, 'Edit Forge layout details');
            setProblem('');
          } catch (error) { setProblem(String(error)); }
        }}>
          <label className="field-label">Layout title
            <input name="title" defaultValue={metadata.details.title} required maxLength={31} />
          </label>
          <label className="field-label">Layout author
            <input name="author" defaultValue={metadata.details.author} maxLength={31} />
          </label>
          <label className="field-label">Layout description
            <input name="description" defaultValue={metadata.details.description} maxLength={127} />
          </label>
          {metadata.date && <p className="subtle">Saved in Forge on {metadata.date}</p>}
          <p className="subtle">The title and author each allow 31 UTF-8 bytes. The description allows 127.</p>
          <button type="submit">Apply layout details</button>
        </form>
      </details>}
      {summary&&<p role="status">{summary.editable + visibleMarkers - hiddenDevices.length} editable placements · {summary.retained - visibleMarkers + hiddenDevices.length} other records preserved.</p>}
      {!!hiddenDevices.length && <button type="button" onClick={() => {
        try {
          const next = showHmvDevices(project, map);
          if (next !== project) {
            edit(next, 'Show Forge devices');
            onSelect(hiddenDevices[0]);
          }
          setProblem('');
        } catch (error) { setProblem(String(error)); }
      }}>Show layout devices</button>}
      {!!hiddenSpawns.length && <button type="button" onClick={() => showMarkers('spawns')}>Show layout spawns</button>}
      {!!hiddenTeleporters.length && <button type="button" onClick={() => showMarkers('teleporters')}>Show layout teleporters</button>}
      {!!hiddenObjectives.length && <button type="button" onClick={() => showMarkers('objectives')}>Show layout objectives</button>}
      <p className="subtle">Move or rotate placements, then export a separate layout copy for the matching base map. {layout.bytes && 'Use Duplicate or Remove in Transform. Position markers and adjust yaw.'}</p>
      {summary?.forerunner && supportsChupathingyForge(map) && <p className="subtle">In Chupathingy’s local Forge, put the HMV in <code>forge/{summary.forerunner.mapName}/</code> under the game’s save folder, then select it in Multiplayer → Forge. Use the matching Xbox map.</p>}
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
      {summary?.hmvConversionIssue !== undefined && <div>
        <button type="button" disabled={!compatible || summary.hmvConversionIssue !== null} onClick={() => {
          try {
            const { bytes, name } = exportForerunnerTextHmv(project, map);
            downloadMedia(name, new Blob([Uint8Array.from(bytes).buffer]));
            setProblem('');
          } catch (error) { setProblem(String(error)); }
        }}>Export text layout as HMV</button>
        <p className="subtle">{summary.hmvConversionIssue ?? (supportsChupathingyForge(map)
          ? 'Use the HMV in Chupathingy’s local Forge on the exact Xbox map. Put it in the map’s folder under forge in the game’s save directory.'
          : 'Use this HMV with the exact base map in an HMV-capable runtime. Forerunner’s Forge Tools expects the file as import.hmv.')}</p>
      </div>}
      {summary?.forerunner && <div>
        <button type="button" disabled={!compatible || checkingLocalForge || !!summary.forerunner.issue}
          onClick={() => void exportForerunner('forerunner')}>Export for Forerunner</button>
        {!!summary.devices.length && summary.forerunnerLocalIssue === null && <>
          <button type="button" disabled={!compatible || checkingLocalForge}
            onClick={() => void exportForerunner('forerunner-local')}>{checkingLocalForge ? 'Checking Local Forge…' : 'Export for Forerunner Local Forge'}</button>
          <p className="subtle">Put <code>import.hmv</code> in <code>forge/{summary.forerunner.mapName}/</code> under the reviewed runtime’s save folder. Open <strong>Forge → Local Forge</strong> on the exact map, then choose <strong>Forge Tools → Load Layout (.HMV)</strong>.</p>
        </>}
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
