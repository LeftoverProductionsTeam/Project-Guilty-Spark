import {useEffect,useRef,useState} from 'react';
import type {ViewportAsset} from '../viewportAssets';
import Sound from './Sound';
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
    [render, setRender] = useState(false),
    [audition, setAudition] = useState(false),
    [tracks, setTracks] = useState<{ tagId: number; sourceId: string }[]>([]);
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
  async function previewSound(){try{setError('');if(item.kind==='sound'){if(item.looping){const emitters=await librarySoundEmitters(item,[0,0,0]);setTracks([...new Map(emitters.map(e=>[e.tagId,{tagId:e.tagId,sourceId:e.sourceProjectId??item.sourceId}])).values()]);}else setTracks([{tagId:item.tagId,sourceId:item.sourceId}]);}setAudition(true);}catch(e){setError(String(e));}}
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
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              void previewSound();
            }}
          >
            Preview {item.looping ? 'sound tracks' : 'sound'}
          </button>
          {audition &&
            tracks.map((t) => (
              <Sound key={t.tagId} projectId={t.sourceId} tagId={t.tagId} sourceHash={item.sourceSha256} />
            ))}
        </>
      ) : (
        <small>{item.kind === 'mesh' ? 'Custom model' : 'Custom sound'}</small>
      )}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
