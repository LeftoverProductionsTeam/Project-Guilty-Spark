import {useSyncExternalStore} from 'react';
import {CircleDot} from 'lucide-react';
let snapshot='';const listeners=new Set<()=>void>();
export function publishSparkEmblem(value:string){if(snapshot||!value.startsWith('data:image/png;base64,')||value.length>4*1024*1024)return;snapshot=value;listeners.forEach(fn=>fn());}
export default function SparkEmblem(){
  const image=useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},()=>snapshot);
  return image?<img src={image} alt=""/>:<CircleDot size={24} aria-hidden="true"/>;
}
