import {useEffect,useRef,useState} from 'react';
import type {ViewportAsset} from '../viewportAssets';
import SoundAudition from './SoundAudition';
import NativeModelPreview from './NativeModelPreview';
import {librarySoundEmitters} from '../viewportAssets';
import {useTextureResourceScope} from '../textureResourceScope';
const thumbs=new Map<string,string>();
let running=0;
const queue:(()=>void)[]=[];
function schedule(action:()=>Promise<void>){return new Promise<void>((resolve,reject)=>{const start=()=>{running++;void action().then(resolve,reject).finally(()=>{running--;queue.shift()?.();});};if(running<2)start();else queue.push(start);});}
export default function LibraryAssetPreview({ item }: { item: ViewportAsset }) {
  const scope=useTextureResourceScope(item.sourceId);
  const cacheKey=item.key+':'+scope;
  return <AssetPreview key={cacheKey} item={item} cacheKey={cacheKey}/>;
}
function AssetPreview({item,cacheKey}:{item:ViewportAsset;cacheKey:string}) {
  const host = useRef<HTMLDivElement>(null),
    complete = useRef<((url: string) => void) | null>(null);
  const [src, setSrc] = useState(thumbs.get(cacheKey) ?? ''),
    [error, setError] = useState(''),
    [render, setRender] = useState(false);
  useEffect(() => {
    if(item.kind!=='model'||src)return;
    let active=true;
    const observer = new IntersectionObserver((rows) => {
      if(!rows.some(r=>r.isIntersecting))return;
      observer.disconnect();
      void schedule(async () => {
        if(!active)return;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            complete.current = null;
            if (active) setRender(false);
            reject(Error('Model preview timed out. Open the source to inspect its missing resources.'));
          }, 30000);
          complete.current = (url) => {
            clearTimeout(timer);
            if (active) {
              if (url) {
                thumbs.set(cacheKey,url);
                while(thumbs.size>128)thumbs.delete(thumbs.keys().next().value!);
                setSrc(url);
              }
              setRender(false);
            }
            complete.current = null;
            resolve();
          };
          setRender(true);
        });
      }).catch((e) => {
        if(active)setError(String(e));
      });
    });
    if(host.current)observer.observe(host.current);
    return () => {
      active=false;
      observer.disconnect();
      complete.current?.('');
    };
  }, [cacheKey, src]);
  return (
    <div className="library-asset-preview" ref={host}>
      {item.kind === 'model' ? (
        render ? (
          <NativeModelPreview asset={item.asset} live={false} onSnapshot={(url) => complete.current?.(url)} />
        ) : src ? (
          <img
            src={src}
            draggable={false}
            alt={'Actual textured Halo model: ' + item.name}
            width="192"
            height="128"
          />
        ) : (
          <small>{error ? 'Model unavailable' : 'Reading source model…'}</small>
        )
      ) : item.kind === 'sound' ? (
        <>
          <SoundAudition tracks={async()=>{
            if(!item.looping)return [{projectId:item.sourceId,tagId:item.tagId,sourceHash:item.sourceSha256}];
            const emitters=await librarySoundEmitters(item,[0,0,0]);
            return [...new Map(emitters.map(e=>[e.tagId,{projectId:e.sourceProjectId??item.sourceId,tagId:e.tagId,sourceHash:item.sourceSha256}])).values()];
          }}/>
        </>
      ) : (
        <small>{item.kind === 'mesh' ? 'Custom model' : 'Custom sound'}</small>
      )}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
