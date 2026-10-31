import { useEffect, useState } from 'react';
import { native } from '../api';
import type { Bootstrap } from '../types';
import type { ForgeAsset } from '../forge';
import { preloadHomeModels } from '../homeShowcase';
import NativeModelPreview from './NativeModelPreview';

export default function HomeModel({ data }: { data: Bootstrap }) {
  const [models, setModels] = useState<ForgeAsset[]>([]),
    [index, setIndex] = useState(0),
    [message, setMessage] = useState('Finding your Halo models…');
  useEffect(() => {
    let alive = true;
    if (!native) {
      setMessage('Connect an owned Halo installation to preview its models.');
      return;
    }
    void preloadHomeModels(data)
      .then((choices) => {
        if (!alive) return;
        if (!choices.length) {
          setMessage('Link a Halo maps folder in the asset drawer to show its actual models here.');
          return;
        }
        setModels(choices);
        const monitor = choices.findIndex((asset) => /(?:^|[\\/])(?:monitor|343)[\\/]/i.test(asset.path));
        setIndex(monitor >= 0 ? monitor : Math.floor(Math.random() * choices.length));
      })
      .catch((error) => {
        if (alive) setMessage(String(error));
      });
    return () => {
      alive = false;
    };
  }, [data.dataDirectory, data.installation.mccPath]);
  const model = models[index % Math.max(1, models.length)];
  return (
    <div className="home-native-model">
      {model ? (
        <NativeModelPreview asset={model} showcase />
      ) : (
        <span className="model-preview-loading">{message}</span>
      )}
      {model && (
        <div className="home-model-caption">
          <span>{model.name} · actual Halo model</span>
          {models.length > 1 && (
            <button onClick={() => setIndex((value) => (value + 1) % models.length)}>Next model</button>
          )}
        </div>
      )}
    </div>
  );
}
