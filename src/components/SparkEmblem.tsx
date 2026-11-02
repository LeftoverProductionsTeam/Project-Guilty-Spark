import {lazy,Suspense,useEffect,useState,useSyncExternalStore} from 'react';
import {LoaderCircle} from 'lucide-react';
import {native} from '../api';
import {preloadHomeModels,isHaloMonitor} from '../homeShowcase';
import type {Bootstrap} from '../types';
import type {ForgeAsset} from '../forge';
const NativeModelPreview=lazy(()=>import('./NativeModelPreview'));
let snapshot='';const listeners=new Set<()=>void>();
export function publishSparkEmblem(value:string){if(snapshot||!value.startsWith('data:image/png;base64,')||value.length>4*1024*1024)return;snapshot=value;listeners.forEach(fn=>fn());}
export default function SparkEmblem({data}:{data:Bootstrap}){
  const image=useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},()=>snapshot);
  const [monitor,setMonitor]=useState<ForgeAsset|null>(null),[unavailable,setUnavailable]=useState(!native);
  useEffect(()=>{
    if(!native||image)return;
    let alive=true;setUnavailable(false);
    void preloadHomeModels(data).then(assets=>{if(!alive)return;const owned=assets.find(isHaloMonitor);setMonitor(owned??null);setUnavailable(!owned);}).catch(()=>{if(alive)setUnavailable(true);});
    return()=>{alive=false;};
  },[data.dataDirectory,data.installation.mccPath,image]);
  if(image)return <img src={image} alt="" data-spark-emblem="owned-monitor"/>;
  return <>
    {unavailable?<span className="gs-spark-label" title="Link an owned Halo source containing the monitor to show Guilty Spark here.">SPARK</span>:<LoaderCircle className="gs-spark-loading" aria-label="Loading Guilty Spark model"/>}
    {monitor&&!unavailable&&<span className="gs-spark-render" aria-hidden="true"><Suspense fallback={null}><NativeModelPreview asset={monitor} showcase animate={false} live={false} onSnapshot={publishSparkEmblem}/></Suspense></span>}
  </>;
}
