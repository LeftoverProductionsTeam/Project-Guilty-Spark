import { useEffect, useState } from 'react';
import type { Bootstrap } from '../types';
import type { ForgeAsset } from '../forge';
import { preloadHomeModels } from '../homeShowcase';
import { useMapState } from '../mapSession';
export const showcaseKey=(asset:ForgeAsset)=>`${asset.sourceSha256}:${asset.tagId}`;
export function useShowcaseChoices(data:Bootstrap){
  const [models,setModels]=useState<ForgeAsset[]>([]);
  useEffect(()=>{let alive=true;void preloadHomeModels(data).then(items=>{if(alive)setModels(items);}).catch(()=>{});return()=>{alive=false;};},[data.dataDirectory,data.installation.mccPath]);
  return models;
}
export default function ShowcaseChoice({data}:{data:Bootstrap}){
  const models=useShowcaseChoices(data);
  const [selected,setSelected]=useMapState('global','home.model','automatic');
  return <label className="showcase-choice">Home model
    <select aria-label="Home showcase model" value={models.some(m=>showcaseKey(m)===selected)?selected:'automatic'} onChange={e=>setSelected(e.target.value)}>
      <option value="automatic">Guilty Spark / first compatible model</option>
      {models.map(model=><option key={showcaseKey(model)} value={showcaseKey(model)}>{model.name} · {model.path}</option>)}
    </select>
    {!models.length&&<small>Connect Halo maps to choose their original models.</small>}
  </label>;
}
