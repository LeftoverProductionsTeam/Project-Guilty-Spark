import {useState} from 'react';
import {call,native} from '../api';
import {previewExtractionRoll,selectedExtractionPoints} from '../megaworldLayout';
import type {ExtractionPoints,ExtractionPool,LayoutRegion,MegaworldLayout} from '../megaworldLayout';

const fields=[
  ['playerStarts','Possible player starts'],
  ['weapons','Weapon points'],
  ['vehicles','Vehicle points'],
] as const;
const pointLabel=(point:ExtractionPoints['weapons'][number])=>String(point.row+1)+'. '+point.label.split('/').at(-1);

export default function AtlasExtraction({region,layout,readOnly,onLayout}:{
  region:LayoutRegion;
  layout:MegaworldLayout;
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
  let selection:ExtractionPoints|null=null, feedback='';
  if(candidates){
    try { selection=selectedExtractionPoints(pool,candidates); }
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
        This region has no eligible native vehicle placement. Add an unnamed multiplayer vehicle on supported ground in an editable copy of the region, then review the rebuilt source before saving its pool.
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
