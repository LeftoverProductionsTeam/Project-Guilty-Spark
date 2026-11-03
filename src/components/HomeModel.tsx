import { useEffect, useState } from 'react';
import { native } from '../api';
import type { Bootstrap } from '../types';
import type { ForgeAsset } from '../forge';
import { preloadHomeModels,preloadHomeCharacter } from '../homeShowcase';
import {characterChoice,characterFromChoice,homeCharacters} from '../homeCharacters';
import NativeModelPreview from './NativeModelPreview';
import {useMapState} from '../mapSession';
import {showcaseKey} from './ShowcaseChoice';

export default function HomeModel({ data }: { data: Bootstrap }) {
  const [selection,setSelection]=useMapState('global','home.model','automatic');
  const [models, setModels] = useState<ForgeAsset[]>([]),
    [selectedModel,setSelectedModel]=useState<ForgeAsset|null>(null),
    [message, setMessage] = useState('Finding your Halo models…');
  useEffect(() => {
    let alive = true;
    if (!native) {
      setMessage('Connect an owned Halo installation to preview its models.');
      return;
    }
    setSelectedModel(null);setMessage('Finding your Halo character…');
    const character=characterFromChoice(selection);
    void preloadHomeModels(data)
      .then((choices) => {
        if (!alive) return;
        if (!choices.length) {
          setMessage('Link a Halo maps folder in the asset drawer to show its actual models here.');
          return;
        }
        setModels(choices);
      })
      .catch((error) => {
        if (alive) setMessage(String(error));
      });
    if(character)void preloadHomeCharacter(data,character).then(asset=>{if(!alive)return;setSelectedModel(asset);if(!asset)setMessage(`Link campaign maps containing ${homeCharacters.find(c=>c.id===character)?.label} in Asset library.`);}).catch(error=>{if(alive)setMessage(String(error));});
    return () => {alive=false;};
  }, [data.dataDirectory, data.installation.mccPath,data.settings.preferredHalo,selection]);
  const model = characterFromChoice(selection)?selectedModel:models.find(asset=>showcaseKey(asset)===selection);
  return (
    <div className="home-native-model">
      {model ? (
        <NativeModelPreview key={showcaseKey(model)} asset={model} showcase/>
      ) : (
        <span className="model-preview-loading">{message}</span>
      )}
        <div className="home-model-caption">
          <span>{model?`${model.name} · actual Halo model`:'Choose your Home character'}</span>
          <select aria-label="Home model" value={selection} onChange={event=>setSelection(event.target.value)}>
            <option value="automatic">Guilty Spark · default</option>
            {homeCharacters.map(c=><option key={c.id} value={characterChoice(c.id)}>{c.label}</option>)}
            <optgroup label="Other local models">{models.map(asset=><option value={showcaseKey(asset)} key={showcaseKey(asset)}>{asset.name}</option>)}</optgroup>
          </select>
        </div>
    </div>
  );
}
