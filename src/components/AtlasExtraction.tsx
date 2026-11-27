import {useState} from 'react';
import {call,native} from '../api';
import type {Project} from '../types';
import {previewExtractionRoll,selectedExtractionPoints} from '../megaworldLayout';
import type {ExtractionPoints,ExtractionPool,LayoutRegion,MegaworldLayout} from '../megaworldLayout';

const fields=[
  ['playerStarts','Possible player starts'],
  ['weapons','Weapon points'],
  ['vehicles','Vehicle points'],
] as const;
const pointLabel=(point:ExtractionPoints['weapons'][number])=>point.row<0?point.label:String(point.row+1)+'. '+point.label.split('/').at(-1);

export default function AtlasExtraction({region,layout,project,readOnly,onLayout}:{
  region:LayoutRegion;
  layout:MegaworldLayout;
  project?:Pick<Project,'scene'|'nativeAssetImports'>;
  readOnly:boolean;
  onLayout:(layout:MegaworldLayout,description:string)=>void;
}){
  const saved=layout.extraction?.[region.regionId];
  const savedKey=JSON.stringify(saved??null);
  const [candidates,setCandidates]=useState<ExtractionPoints|null>(null);
  const [draft,setDraft]=useState<{savedKey:string;pool:ExtractionPool}|null>(null);
  const [preview,setPreview]=useState<{key:string;draw:ExtractionPoints}|null>(null);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  const pool=draft?.savedKey===savedKey?draft.pool:saved??{playerStarts:[],weapons:[],vehicles:[]};
  const poolKey=JSON.stringify(pool);
  const assignedElsewhere=new Set(Object.entries(layout.extraction??{}).filter(([id])=>id!==region.regionId)
    .flatMap(([,entry])=>entry.authoredVehicleIds??[]));
  const placedVehicles=new Map<string,ExtractionPoints['vehicles'][number]>();
  for(const object of project?.scene??[]){
    const source=object.sourceModel;
    if(!object.visible||source?.class!=='vehi'||object.sourceOffset!=null||object.rotationOffset!=null
      ||object.assetId!=null||!object.scale.every(n=>n===1)||assignedElsewhere.has(object.id)) continue;
    const binding=project?.nativeAssetImports?.find(item=>item.tagClass==='vehi'&&item.sourceProjectId===source.projectId
      &&item.sourceSha256===source.sourceSha256&&item.tagId===source.tagId&&item.tagPath===source.path);
    if(binding) placedVehicles.set(object.id,{row:-1,label:object.name,position:object.position});
  }
  let selection:ExtractionPoints|null=null, feedback='';
  if(candidates){
    try { selection=selectedExtractionPoints(pool,candidates,placedVehicles); }
    catch(problem){ feedback=problem instanceof Error?problem.message:String(problem); }
  }
  async function readPoints(){
    setWorking(true);
    setError('');
    setPreview(null);
    setCandidates(null);
    try {
      setCandidates(await call<ExtractionPoints>('review_atlas_extraction_points',{layout,regionId:region.regionId}));
    }catch(problem){setError(String(problem));}
    finally{setWorking(false);}
  }
  function save(){
    onLayout({...layout,extraction:{...layout.extraction,[region.regionId]:pool}},'Set '+region.mapName+' Extraction pool');
    setDraft(null);
  }
  function remove(){
    const extraction={...layout.extraction};
    delete extraction[region.regionId];
    onLayout({...layout,extraction},'Remove '+region.mapName+' Extraction pool');
    setDraft(null);
    setPreview(null);
  }
  return <details className="atlas-region">
    <summary>Extraction spawns and loot{saved?' · Saved':''}</summary>
    <p className="atlas-note">Choose two possible player starts. Plan one shared roll per match for this region: three weapons and one vehicle at separate points.</p>
    <button disabled={!native||working} onClick={()=>void readPoints()}>{working?'Reviewing native points…':'Read native points'}</button>
    {error&&<p role="alert">{error}</p>}
    {candidates&&<>
      {!candidates.vehicles.length&&<p role="status" className="atlas-note">
        This region has no stock vehicle point. Place an imported native vehicle on supported ground in World, then assign it here.
      </p>}
      <div className="atlas-controls">
        {fields.map(([kind,label])=><label key={kind}>{label} ({pool[kind].length} selected)
          <select multiple size={5} aria-label={label} value={pool[kind].map(String)} disabled={readOnly}
            onChange={event=>{
              const rows=Array.from(event.currentTarget.selectedOptions,option=>Number(option.value));
              setDraft({savedKey,pool:{...pool,[kind]:rows}});
              setPreview(null);
            }}>
            {candidates[kind].map(point=><option key={point.row} value={point.row}
              title={point.position.map(axis=>axis.toFixed(2)).join(', ')}>{pointLabel(point)}</option>)}
          </select>
        </label>)}
      </div>
      {(placedVehicles.size>0||!!pool.authoredVehicleIds?.length)&&<label>Editor-placed vehicle points
        <select multiple size={3} aria-label="Editor-placed vehicle points" value={pool.authoredVehicleIds??[]} disabled={readOnly}
          onChange={event=>{
            const ids=Array.from(event.currentTarget.selectedOptions,option=>option.value);
            setDraft({savedKey,pool:{...pool,authoredVehicleIds:ids}});
            setPreview(null);
          }}>
          {[...placedVehicles].map(([id,point])=><option key={id} value={id}>{point.label} · {point.position.map(n=>n.toFixed(1)).join(', ')}</option>)}
          {(pool.authoredVehicleIds??[]).filter(id=>!placedVehicles.has(id)).map(id=><option key={id} value={id}>Unavailable placement</option>)}
        </select>
        <small>Choose vehicles on this region’s terrain. Export checks their native BSP and placement.</small>
      </label>}
      {feedback&&<p role="status" className="atlas-note">{feedback}</p>}
      <div className="atlas-controls">
        <button disabled={!selection||readOnly||poolKey===savedKey} onClick={save}>Save region pool</button>
        <button disabled={!selection} onClick={()=>{if(selection)setPreview({key:poolKey,draw:previewExtractionRoll(selection)});}}>Preview a roll</button>
        {saved&&<button disabled={readOnly} onClick={remove}>Remove region pool</button>}
      </div>
      {preview?.key===poolKey&&<ul aria-label="Previewed Extraction roll">{fields.map(([kind,label])=>
        <li key={kind}>{label} {preview.draw[kind].map(pointLabel).join(', ')}</li>)}</ul>}
    </>}
    <p className="atlas-note">Saved with the Atlas. In-game rolls require Forerunner support.</p>
  </details>;
}
