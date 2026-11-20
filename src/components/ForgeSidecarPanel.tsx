import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadMedia } from '../machinimaCapture';
import { exportForgeSidecar, FORGE_SIDECAR_LIMIT, importForgeSidecar, inspectForgeSidecar, removeForgeSidecar } from '../forgeSidecar';
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
      if (!/\.txt$/i.test(file.name) || file.size > FORGE_SIDECAR_LIMIT) throw Error('Choose an OpenCE Forge .txt file under 1 MiB.');
      const text = new TextDecoder('utf-8', {fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer());
      if (request !== ticket.current) return;
      const latest = current.current;
      if (latest.map.sha256 !== base) throw Error('The base map changed. Choose the layout again.');
      const result = importForgeSidecar(latest.project,latest.map,file.name,text);
      edit(result.project,'Import OpenCE Forge layout');
    } catch (error) {
      if (request === ticket.current) setProblem(String(error));
    }
  }

  return <details className="forge-sidecar-panel" open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}>
    <summary>OpenCE Forge layout</summary>
    {layout ? <>
      <p>{layout.name}</p>
      {summary&&<p role="status">{summary.editable} editable placements · {summary.retained} other records preserved.</p>}
      <p className="subtle">Move or rotate imported placements in the viewport. Export writes a separate layout and preserves its other records. Use the matching base map to load it in Forge.</p>
      <button type="button" disabled={!compatible} onClick={()=>{
        try {
          const text=exportForgeSidecar(project,map);
          downloadMedia(layout.name.replace(/\.txt$/i,'')+'-spark.txt',new Blob([text],{type:'text/plain;charset=utf-8'}));
          setProblem('');
        } catch (error) { setProblem(String(error)); }
      }}>Export Forge layout copy</button>
      <button type="button" onClick={()=>{
        ticket.current++;
        edit(removeForgeSidecar(project),'Remove imported Forge layout');
        setProblem('');
      }}>Remove layout from project</button>
    </> : <label>Import Forge layout<input aria-label="Import Forge layout" type="file" accept=".txt,text/plain" onChange={event=>{
      const file=event.target.files?.[0];
      event.target.value='';
      if (file) void open(file);
    }}/></label>}
    {problem&&<Notice tone="error">{problem}</Notice>}
  </details>;
}
