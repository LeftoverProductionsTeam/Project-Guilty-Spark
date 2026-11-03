import { useEffect, useState } from 'react';
import type { Bootstrap } from '../types';
import type { ForgeAsset } from '../forge';
import { preloadHomeModels } from '../homeShowcase';
import {characterChoice,characterFromChoice,homeCharacters} from '../homeCharacters';
import { useMapState } from '../mapSession';
export const showcaseKey=(asset:ForgeAsset)=>`${asset.sourceSha256}:${asset.tagId}${asset.modelVariant?':'+asset.modelVariant:''}`;
export function useShowcaseChoices(data:Bootstrap){
  const [models,setModels]=useState<ForgeAsset[]>([]);
  useEffect(()=>{let alive=true;void preloadHomeModels(data).then(items=>{if(alive)setModels(items);}).catch(()=>{});return()=>{alive=false;};},[data.dataDirectory,data.installation.mccPath]);
  return models;
}
export default function ShowcaseChoice({data}:{data:Bootstrap}){
  const models=useShowcaseChoices(data);
  const [selected,setSelected]=useMapState('global','home.model','automatic');
  return <label className="showcase-choice">Home character &amp; launch voice
    <select aria-label="Home showcase model" value={characterFromChoice(selected)||models.some(m=>showcaseKey(m)===selected)?selected:'automatic'} onChange={e=>setSelected(e.target.value)}>
      <option value="automatic">Guilty Spark · default</option>
      {homeCharacters.map(c=><option key={c.id} value={characterChoice(c.id)}>{c.label} · matching launch voice</option>)}
      <optgroup label="Other local models">{models.map(model=><option key={showcaseKey(model)} value={showcaseKey(model)}>{model.name} · {model.path}</option>)}</optgroup>
    </select>
    <small>Saved for next launch. Uses linked campaign models and recoverable original dialogue.</small>
  </label>;
}
