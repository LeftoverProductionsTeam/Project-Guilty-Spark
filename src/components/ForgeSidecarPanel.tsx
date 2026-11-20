import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadMedia } from '../machinimaCapture';
import { exportForgeSidecar, FORGE_SIDECAR_LIMIT, importForgeSidecar, inspectForgeSidecar, removeForgeSidecar } from '../forgeSidecar';
import { HMV_LIMIT, HMV_NAME } from '../forgeHmv';
import type { MapInspection, Project } from '../types';
import { useMapState } from '../mapSession';
import { Notice } from './ui';

export default function ForgeSidecarPanel({ project, map, edit, openRequest }: {
  project: Project;
  map: MapInspection;
  edit: (next: Project, description: string) => void;
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
  const compatible = project.source?.sha256 === map.sha256 && map.header.scenarioType === 1
    && [5,609].includes(map.header.version) && !project.quickForge;
  if (!compatible && !layout) return null;

  async function open(file: File) {
    const request = ++ticket.current;
    const base = map.sha256;
    setProblem('');
    try {
      const hmv = HMV_NAME.test(file.name);
      if (!(hmv ? file.size <= HMV_LIMIT : /\.txt$/i.test(file.name) && file.size <= FORGE_SIDECAR_LIMIT)) {
        throw Error('Choose an OpenCE Forge .txt (up to 1 MiB) or a Chupathingy .hmv (up to 64 KiB).');
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

  return <details className="forge-sidecar-panel" open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}>
    <summary>Forge layout</summary>
    {layout ? <>
      <p>{layout.name}</p>
      {summary&&<p role="status">{summary.editable} editable placements · {summary.retained} other records preserved.</p>}
      <p className="subtle">Move or rotate placements, then export a separate layout copy for the matching base map.</p>
      {layout.bytes && <p className="subtle">For Chupathingy builds with Forge, put the copy in <code>forge/{map.header.name}/</code> under the game’s save folder, then select it in Multiplayer → Forge.</p>}
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
      <button type="button" onClick={()=>{
        ticket.current++;
        edit(removeForgeSidecar(project),'Remove imported Forge layout');
        setProblem('');
      }}>Remove layout from project</button>
    </> : <label>Import Forge layout<input aria-label="Import Forge layout" type="file" accept={map.header.version === 5 ? ".txt,.hmv" : ".txt"} onChange={event=>{
      const file=event.target.files?.[0];
      event.target.value='';
      if (file) void open(file);
    }}/></label>}
    {layout && !summary && <Notice tone="error">Open the matching preserved map and check the layout before exporting.</Notice>}
    {problem&&<Notice tone="error">{problem}</Notice>}
  </details>;
}
