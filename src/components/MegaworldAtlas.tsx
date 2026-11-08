import '../megaworldLayout.css';
import {useState} from 'react';
import {call,native} from '../api';
import {useMapState} from '../mapSession';
import {assemblyRoutes} from '../bspAssembly';
import type {OpenProject,Project} from '../types';
import {NumberField} from './ui';
import {addLayoutRegions,originalRegions,originalMultiplayerMaps,regionFootprint,overlappingRegions,spreadLayout} from '../megaworldLayout';
import type {AtlasRegion as Region,MegaworldLayout} from '../megaworldLayout';
type Atlas={regions:Region[];caches:{path:string;error:string|null}[];elapsedMs:number;limitations:string[]};
export default function MegaworldAtlas({projectId,assembly,sourceSha,layout,onLayout,readOnly=false}:{projectId:string;assembly?:Project['bspAssembly'];sourceSha?:string;layout?:MegaworldLayout|null;onLayout:(layout:MegaworldLayout,description:string)=>void;readOnly?:boolean}){
  const [open,setOpen]=useMapState(projectId,'megaworld.atlas',false);
  const [atlas,setAtlas]=useState<Atlas|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [search,setSearch]=useState(''),[runtime,setRuntime]=useState('all'),[page,setPage]=useState(0),[selected,setSelected]=useState<string|null>(null);
  const rows=atlas?.regions.filter(r=>(runtime==='all'||r.runtimes.includes(runtime))&&`${r.mapName} ${r.bspName}`.toLowerCase().includes(search.toLowerCase()))??[];
  const region=atlas?.regions.find(r=>r.id===selected);
  const base=atlas?.regions.find(r=>r.cacheSha256===sourceSha&&r.bspIndex===0),donor=atlas?.regions.find(r=>r.cacheSha256===assembly?.donorSource.sha256&&r.bspIndex===assembly.donorBspIndex);
  const placed=(r:Region,translated:boolean)=>{const angle=translated?(assembly?.yawDegrees??0)*Math.PI/180:0,c=Math.cos(angle),s=Math.sin(angle),t=translated?assembly?.translation??[0,0,0]:[0,0,0];return [[r.minimum[0],r.minimum[1]],[r.minimum[0],r.maximum[1]],[r.maximum[0],r.maximum[1]],[r.maximum[0],r.minimum[1]]].map(([x,y])=>[x*c-y*s+t[0],-(x*s+y*c+t[1])]);};
  const polygons=base&&donor&&assembly?[placed(base,false),placed(donor,true)]:[];
  const routes=assembly?assemblyRoutes(assembly):[];
  const route=routes.flatMap(r=>r.points.map(p=>[p[0],-p[1]]));
  const points=[...polygons.flat(),...route],low=points.length?[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))]:[0,0],high=points.length?[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]:[1,1];
  async function scan(){setBusy(true);setError('');try{setAtlas(await call<Atlas>('megaworld_atlas'));setPage(0);}catch(e){setError(String(e));}finally{setBusy(false);}}
  function add(regions:Region[]){if(readOnly)return;try{onLayout(addLayoutRegions(layout,regions),'Add Atlas source regions');setError('');}catch(e){setError(String(e));}}
  function addOriginals(){try{const found=originalRegions(atlas?.regions.filter(r=>runtime==='all'||r.runtimes.includes(runtime))??[]);if(!found.regions.length)throw Error('No original multiplayer regions in this runtime scan.');add(found.regions);}catch(e){setError(String(e));}}
  async function importRegion(){if(!region)return;setBusy(true);setError('');try{const result=await call<OpenProject>('import_megaworld_region',{regionId:region.id});window.dispatchEvent(new CustomEvent('gs:atlas-open',{detail:result}));}catch(e){setError(String(e));}finally{setBusy(false);}}
  return <details className="megaworld-atlas" open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary>Megaworld Atlas <small>{atlas?`${atlas.regions.length} source regions`:'owned map regions'}</small></summary>
    {open&&<><div className="atlas-controls"><button disabled={!native||busy} onClick={()=>void scan()}>{busy?'Inspecting complete source caches…':atlas?'Rescan installed maps':'Scan installed maps'}</button><input aria-label="Find Atlas region" placeholder="Map or BSP…" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/><select aria-label="Atlas runtime" value={runtime} onChange={e=>{setRuntime(e.target.value);setPage(0);}}><option value="all">All installed Halos</option>{[...new Set(atlas?.regions.flatMap(r=>r.runtimes)??[])].map(r=><option key={r}>{r}</option>)}</select></div>
    <LayoutEditor layout={layout} atlas={atlas} onLayout={onLayout} readOnly={readOnly}/>
    {atlas&&<div className="atlas-controls"><button onClick={addOriginals} disabled={busy||readOnly}>Add originals to layout</button><small>Choose a runtime to keep source editions explicit.</small></div>}
    {assembly&&<div className="atlas-region"><b>Authored connection · {assembly.donorTitle}</b><p>Donor position {assembly.translation.map(n=>n.toFixed(2)).join(', ')} · yaw {assembly.yawDegrees}° · {assembly.tunnelPoints.length} route points</p>{polygons.length>0&&<svg width="100%" height="110" role="img" aria-label="Authored region bounds and physical connection in top view" viewBox={`${low[0]-8} ${low[1]-8} ${Math.max(1,high[0]-low[0])+16} ${Math.max(1,high[1]-low[1])+16}`}><polygon points={polygons[0].map(p=>p.join(',')).join(' ')} fill="#58b9b324" stroke="#58b9b3" vectorEffect="non-scaling-stroke"/><polygon points={polygons[1].map(p=>p.join(',')).join(' ')} fill="#d19a6024" stroke="#d19a60" vectorEffect="non-scaling-stroke"/>{routes.map((r,i)=><polyline key={r.id} aria-label={r.label+' draft'} points={r.points.map(p=>[p[0],-p[1]].join(',')).join(' ')} stroke={['#fff','#80cbbf','#e4be77'][i]} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke"><title>{r.label} · draft, not gameplay verified</title></polyline>)}</svg>}</div>}
    {error&&<p role="alert">{error}</p>}
    {atlas&&<><div className="atlas-list" role="list" aria-label="Owned BSP regions">{rows.slice(page*12,page*12+12).map(r=><button role="listitem" aria-pressed={selected===r.id} key={r.id} onClick={()=>setSelected(r.id)} title={`${r.coordinates}\nSHA-256 ${r.cacheSha256}`}><b>{r.mapName} / {r.bspName}</b><small>{r.scenarioType===0?'Campaign':'Multiplayer'} · v{r.cacheVersion} · {r.collisionTriangles.toLocaleString()} collision / {r.renderTriangles.toLocaleString()} render triangles</small></button>)}</div><div className="atlas-controls"><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous</button><span>{rows.length?`${page*12+1}–${Math.min((page+1)*12,rows.length)} / ${rows.length}`:'No matching source regions'}</span><button disabled={(page+1)*12>=rows.length} onClick={()=>setPage(p=>p+1)}>Next</button></div></>}
    {region&&<div className="atlas-region"><b>{region.mapName} · {region.bspName}</b><dl><dt>Bounds XYZ</dt><dd>{region.minimum.map(n=>n.toFixed(1)).join(', ')} → {region.maximum.map(n=>n.toFixed(1)).join(', ')}</dd><dt>World transform</dt><dd>{region.translation.join(', ')} · yaw {region.yawDegrees}° (source coordinates)</dd><dt>Topology</dt><dd>{region.boundaryEdges} boundary / {region.nonmanifoldEdges} nonmanifold edges · {region.degenerateTriangles} degenerate triangles</dd><dt>Materials</dt><dd>{region.shaders.length} native shader identities</dd></dl><div className="atlas-controls"><button disabled={busy||readOnly||layout?.regions.some(r=>r.regionId===region.id)} onClick={()=>add([region])}>Add region to layout</button><button disabled={busy} onClick={()=>void importRegion()}>Open preserved source in Level Editor</button></div><p>Import both sources, then use Construction → Connect another map’s BSP. A CE connection requires matching extracted CE tags and an explicit CE target. A campaign donor imports geometry and optional scenery; its AI/scripts remain separate.</p></div>}
    {atlas&&<details><summary>Inventory diagnostics · {atlas.caches.filter(c=>c.error).length} unavailable caches · {(atlas.elapsedMs/1000).toFixed(1)} s</summary>{atlas.caches.filter(c=>c.error).map(c=><p key={c.path}>{c.path.split(/[\\/]/).at(-1)}: {c.error}</p>)}</details>}
    <p className="atlas-note">One physically merged resident BSP. Native compilation, painted-detail preservation and a real two-way player walkthrough are separate acceptance gates.</p></>}
  </details>;
}

function LayoutEditor({layout,atlas,onLayout,readOnly=false}:{layout?:MegaworldLayout|null;atlas:Atlas|null;onLayout:(layout:MegaworldLayout,description:string)=>void;readOnly?:boolean}){
  const [selection,setSelection]=useState(''),[error,setError]=useState('');
  const regions=layout?.regions??[],selected=regions.find(r=>r.regionId===selection)??regions[0];
  if(!regions.length)return <p className="atlas-note">Select a source region and add it to a saved layout. Plans use source bounds; they do not compile or connect maps.</p>;
  const footprints=regions.map(regionFootprint),points=footprints.flat(),low=[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))],high=[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
  const overlaps=overlappingRegions(regions),missing=atlas?regions.filter(r=>!atlas.regions.some(a=>a.id===r.regionId)):[];
  function transform(axis:number,value:number){if(!selected||readOnly)return;onLayout({schemaVersion:1,regions:regions.map(r=>r.regionId!==selected.regionId?r:axis===3?{...r,yawDegrees:value}:{...r,translation:r.translation.map((n,i)=>i===axis?value:n) as [number,number,number]})},'Move Atlas region');}
  const originalNames=new Set(regions.filter(r=>r.bspIndex===0).map(r=>r.mapName.toLowerCase()));
  return <section className="atlas-layout" aria-label="Saved region layout">
    <div className="atlas-controls"><b>Region layout · {regions.length}</b><small>Plan only · not compiled</small><button disabled={readOnly} onClick={()=>{try{onLayout(spreadLayout(layout!,selected?.regionId),'Arrange Atlas hex cluster');setError('');}catch(e){setError(String(e));}}}>Hex cluster draft</button></div>{error&&<p role="alert">{error}</p>}
    <svg width="100%" height="180" role="img" aria-label="Planned source bounds in top view" viewBox={
      [low[0]-8,-high[1]-8,Math.max(1,high[0]-low[0])+16,Math.max(1,high[1]-low[1])+16].join(' ')}>
      {regions.map((r,i)=><g key={r.regionId}><polygon points={footprints[i].map(p=>p[0]+','+-p[1]).join(' ')} fill={r.regionId===selected?.regionId?'#58b9b344':'#8194ad18'} stroke={overlaps.some(pair=>pair.includes(r.regionId))?'#e8b074':'#58b9b3'} vectorEffect="non-scaling-stroke" onClick={()=>setSelection(r.regionId)}><title>{r.mapName} / {r.bspName}</title></polygon></g>)}
    </svg>
    <label>Planned region <select aria-label="Planned Atlas region" value={selected?.regionId} onChange={e=>setSelection(e.target.value)}>{regions.map(r=><option value={r.regionId} key={r.regionId}>{r.mapName} · v{r.cacheVersion} · BSP {r.bspIndex+1}</option>)}</select></label>
    {selected&&<><div className="atlas-transform">{['X','Y','Z','Yaw'].map((axis,i)=><label key={axis}>{axis}<NumberField disabled={readOnly} label={'Atlas region '+axis} value={i===3?selected.yawDegrees:selected.translation[i]} onCommit={value=>transform(i,value)} min={i===3?-360000:-1000000} max={i===3?360000:1000000}/></label>)}</div><div className="atlas-controls"><button disabled={readOnly} onClick={()=>onLayout({schemaVersion:1,regions:regions.filter(r=>r.regionId!==selected.regionId)},'Remove Atlas region')}>Remove region plan</button><small title={selected.cacheSha256}>Source {selected.cacheSha256.slice(0,10)} · v{selected.cacheVersion}</small></div></>}
    <p className="atlas-note">{originalMultiplayerCount(originalNames)}/19 original multiplayer names planned. {overlaps.length} overlapping bounds; this is not a collision test or a connected-world claim.</p>
    {!!overlaps.length&&<details><summary>Review overlapping bounds</summary>{overlaps.slice(0,12).map(pair=><p key={pair.join('|')}>{pair.map(id=>regions.find(r=>r.regionId===id)!.mapName).join(' / ')}</p>)}{overlaps.length>12&&<small>{overlaps.length-12} more pairs; move regions apart to review.</small>}</details>}
    {!!missing.length&&<p role="status">{missing.length} saved source identities are unavailable in this scan. Restore their originals or rescan; plans are preserved.</p>}
    <p className="atlas-note">Hex rings use source bounds, not finished terrain seams. Individual map sizes differ. Save keeps this plan with the project; Undo/Redo restores your changes. Construction builds the separately selected source connection. Layout transforms alone do not change the game or compiled cache.</p>
  </section>;
}
function originalMultiplayerCount(names:Set<string>){return originalMultiplayerMaps.filter(name=>names.has(name)).length;}
