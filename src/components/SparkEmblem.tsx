import {lazy,Suspense,useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {LoaderCircle} from 'lucide-react';
import {native} from '../api';
import {preloadHomeModels,isHaloMonitor} from '../homeShowcase';
import type {Bootstrap} from '../types';
import type {ForgeAsset} from '../forge';
const NativeModelPreview=lazy(()=>import('./NativeModelPreview'));
let snapshot='';const listeners=new Set<()=>void>();
export function publishSparkEmblem(value:string){if(snapshot||!value.startsWith('data:image/png;base64,')||value.length>4*1024*1024)return;snapshot=value;listeners.forEach(fn=>fn());}
export default function SparkEmblem({data}:{data:Bootstrap}){
  const anchor=useRef<HTMLSpanElement>(null),[position,setPosition]=useState<{left:number;top:number}|null>(null);
  useLayoutEffect(()=>{
    const target=anchor.current;if(!target)return;
    const update=()=>{const rect=target.getBoundingClientRect();setPosition(previous=>previous?.left===rect.left-10&&previous.top===rect.top-8?previous:{left:rect.left-10,top:rect.top-8});};
    const observer=new ResizeObserver(update);observer.observe(target);update();
    window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
    return()=>{observer.disconnect();window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};
  },[]);
  const image=useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},()=>snapshot);
  const [monitor,setMonitor]=useState<ForgeAsset|null>(null),[unavailable,setUnavailable]=useState(!native);
  useEffect(()=>{
    if(!native||image)return;
    let alive=true;setUnavailable(false);
    void preloadHomeModels(data).then(assets=>{if(!alive)return;const owned=assets.find(isHaloMonitor);setMonitor(owned??null);setUnavailable(!owned);}).catch(()=>{if(alive)setUnavailable(true);});
    return()=>{alive=false;};
  },[data.dataDirectory,data.installation.mccPath,image]);
  // The menu button owns input/layout. Only the visual escapes the rounded
  // application and its optional window glass/tint; it never intercepts tabs.
  const visual=image?<img src={image} alt="" data-spark-emblem="owned-monitor"/>:<>
    {unavailable?<span className="gs-spark-label" title="Link an owned Halo source containing the monitor to show Guilty Spark here.">SPARK</span>:<LoaderCircle className="gs-spark-loading" aria-label="Loading Guilty Spark model"/>}
    {monitor&&!unavailable&&<span className="gs-spark-render" aria-hidden="true"><Suspense fallback={null}><NativeModelPreview asset={monitor} showcase animate={false} live={false} onSnapshot={publishSparkEmblem}/></Suspense></span>}
  </>;
  return <><span className="gs-spark-anchor" ref={anchor} aria-hidden="true"/>{position&&createPortal(<span className="gs-spark-emblem" style={position} aria-hidden="true">{visual}</span>,document.body)}</>;
}
