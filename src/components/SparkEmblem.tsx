import {lazy,Suspense,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {LoaderCircle} from 'lucide-react';
import {native} from '../api';
import {preloadHomeModels,isHaloMonitor} from '../homeShowcase';
import type {Bootstrap} from '../types';
import type {ForgeAsset} from '../forge';
import {useMapState} from '../mapSession';
import {useTextureResourceScope} from '../textureResourceScope';
import {validSparkEmblemPicture} from '../sparkEmblemCache';
import type {SparkEmblemPicture} from '../sparkEmblemCache';
const NativeModelPreview=lazy(()=>import('./NativeModelPreview'));
export default function SparkEmblem({data}:{data:Bootstrap}){
  const anchor=useRef<HTMLSpanElement>(null),[position,setPosition]=useState<{left:number;top:number}|null>(null);
  useLayoutEffect(()=>{
    const target=anchor.current;if(!target)return;
    // Overlap the application's rounded clip, but stay inside the actual
    // WebView/OS window: negative coordinates crop the monitor's silhouette.
    const update=()=>{const rect=target.getBoundingClientRect(),left=Math.max(0,rect.left-24),top=Math.max(0,rect.top-24);setPosition(previous=>previous?.left===left&&previous.top===top?previous:{left,top});};
    const observer=new ResizeObserver(update);observer.observe(target);update();
    window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
    return()=>{observer.disconnect();window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};
  },[]);
  const [monitor,setMonitor]=useState<ForgeAsset|null>(null),[unavailable,setUnavailable]=useState(!native);
  const resources=useTextureResourceScope(monitor?.sourceProjectId);
  const [cached,setCached]=useMapState<SparkEmblemPicture|null>('global','corner.monitorPortrait',()=>null);
  const image=monitor&&validSparkEmblemPicture(cached,monitor.sourceSha256??'',monitor.tagId??0,resources)?cached.png:'';
  useEffect(()=>{
    if(!native)return;
    let alive=true;setUnavailable(false);
    void preloadHomeModels(data).then(assets=>{if(!alive)return;const owned=assets.find(isHaloMonitor);setMonitor(owned??null);setUnavailable(!owned);}).catch(()=>{if(alive)setUnavailable(true);});
    return()=>{alive=false;};
  },[data.dataDirectory,data.installation.mccPath]);
  // The menu button owns input/layout. Only the visual escapes the rounded
  // application and its optional window glass/tint; it never intercepts tabs.
  const visual=image?<img src={image} alt="" data-spark-emblem="owned-monitor"/>:<>
    {unavailable?<span className="gs-spark-label" title="Link an owned Halo source containing the monitor to show Guilty Spark here.">SPARK</span>:<LoaderCircle className="gs-spark-loading" aria-label="Loading Guilty Spark model"/>}
  </>;
  return <><span className="gs-spark-anchor" ref={anchor} aria-hidden="true"/>{position&&createPortal(<>
    <span className="gs-spark-emblem" style={position} aria-hidden="true">{visual}</span>
    {monitor&&!unavailable&&!image&&<span className="gs-spark-capture" aria-hidden="true"><Suspense fallback={null}><NativeModelPreview asset={monitor} showcase portrait animate={false} live={false} onSnapshot={png=>{
      const picture:SparkEmblemPicture={version:1,sourceHash:monitor.sourceSha256??'',tagId:monitor.tagId??0,resources,png};
      if(validSparkEmblemPicture(picture,picture.sourceHash,picture.tagId,resources))setCached(picture);
    }}/></Suspense></span>}
  </>,document.body)}</>;
}
