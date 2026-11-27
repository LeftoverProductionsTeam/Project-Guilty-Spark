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
  project?:Pick<Project,'scene'|'nativeAssetImports'|'inheritedBspConnections'|'bspAssembly'>;
  readOnly:boolean;
  onLayout:(layout:MegaworldLayout,description:string)=>void;
}){
  const saved=layout.extraction?.[region.regionId];
  const savedKey=JSON.stringify(saved??null);
  const [review,setReview]=useState<{key:string;points:ExtractionPoints;support:boolean[]}|null>(null);
  const candidates=review?.points??null;
  const [draft,setDraft]=useState<{savedKey:string;pool:ExtractionPool}|null>(null);
  const [preview,setPreview]=useState<{key:string;draw:ExtractionPoints}|null>(null);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  const pool=draft?.savedKey===savedKey?draft.pool:saved??{playerStarts:[],weapons:[],vehicles:[]};
  const poolKey=JSON.stringify(pool);
  const assignedElsewhere=new Set(Object.entries(layout.extraction??{}).filter(([id])=>id!==region.regionId)
    .flatMap(([,entry])=>entry.authoredVehicleIds??[]));
  const editorVehicles=new Map<string,ExtractionPoints['vehicles'][number]>();
  for(const object of project?.scene??[]){
    const source=object.sourceModel;
    if(!object.visible||source?.class!=='vehi'||object.sourceOffset!=null||object.rotationOffset!=null
      ||object.assetId!=null||!object.scale.every(n=>n===1)||assignedElsewhere.has(object.id)) continue;
    const binding=project?.nativeAssetImports?.find(item=>item.tagClass==='vehi'&&item.sourceProjectId===source.projectId
      &&item.sourceSha256===source.sourceSha256&&item.tagId===source.tagId&&item.tagPath===source.path);
    if(binding) editorVehicles.set(object.id,{row:-1,label:object.name,position:object.position});
  }
  const origin=[...(project?.inheritedBspConnections??[]),project?.bspAssembly].find(route=>route?.atlasOrigin)?.atlasOrigin;
  const editorRows=[...editorVehicles];
  const reviewKey=JSON.stringify([region.translation,region.yawDegrees,origin,editorRows.map(([id,point])=>[id,point.position])]);
  const currentReview=review?.key===reviewKey;
  const placedVehicles=new Map(editorRows.filter((_,index)=>currentReview&&review.support[index]));
  let selection:ExtractionPoints|null=null, feedback='';
  if(candidates){
    if(pool.authoredVehicleIds?.length&&!currentReview) feedback='Read native points again to verify the current vehicle positions.';
    else try { selection=selectedExtractionPoints(pool,candidates,placedVehicles); }
    catch(problem){ feedback=problem instanceof Error?problem.message:String(problem); }
  }
  async function readPoints(){
    setWorking(true);
    setError('');
    setPreview(null);
    setReview(null);
    try {
      const points=await call<ExtractionPoints&{authoredVehicleSupport?:boolean[]}>('review_atlas_extraction_points',{
        layout,regionId:region.regionId,atlasOrigin:origin,authoredPositions:editorRows.map(([,point])=>point.position),
      });
      setReview({key:reviewKey,points,support:points.authoredVehicleSupport??[]});
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
      {!!editorVehicles.size&&!placedVehicles.size&&<p className="atlas-note">{currentReview
        ? 'None of the editor-placed vehicles has supported ground in this region.'
        : 'Read native points again after moving a vehicle or this region.'}</p>}
      {(placedVehicles.size>0||!!pool.authoredVehicleIds?.length)&&<label>Editor-placed vehicle points
        <select multiple size={3} aria-label="Editor-placed vehicle points" value={pool.authoredVehicleIds??[]} disabled={readOnly}
          onChange={event=>{
            const ids=Array.from(event.currentTarget.selectedOptions,option=>option.value);
            setDraft({savedKey,pool:{...pool,authoredVehicleIds:ids}});
            setPreview(null);
          }}>
          {[...placedVehicles].map(([id,point])=><option key={id} value={id}>{point.label} · {point.position.map(n=>n.toFixed(1)).join(', ')}</option>)}
          {(pool.authoredVehicleIds??[]).filter(id=>!placedVehicles.has(id)).map(id=><option key={id} value={id}>{editorVehicles.get(id)?.label??'Unavailable placement'} · unsupported or unreviewed</option>)}
        </select>
        <small>Spark checks the source terrain here and verifies the final vehicle row when you export.</small>
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
