import {useEffect,useRef,useState} from 'react';
import {call} from '../api';
import type {MeshData} from '../types';
import type {ViewportAsset} from '../viewportAssets';
import Sound from './Sound';
import {librarySoundEmitters} from '../viewportAssets';
const thumbs=new Map<string,string>();
let running=0;const queue:(()=>void)[]=[];
function schedule(action:()=>Promise<void>){return new Promise<void>((resolve,reject)=>{const start=()=>{running++;void action().then(resolve,reject).finally(()=>{running--;queue.shift()?.();});};if(running<2)start();else queue.push(start);});}
function thumbnail(mesh:MeshData){
  const canvas=document.createElement('canvas');canvas.width=192;canvas.height=128;const c=canvas.getContext('2d');if(!c)throw Error('Preview canvas unavailable');
  const positions=mesh.positions;if(!positions.length||mesh.indices.length>600000)throw Error('Model exceeds thumbnail budget');
  const points:number[][]=[];for(let i=0;i<positions.length;i+=3){const [x,y,z]=positions.slice(i,i+3);points.push([(x-y)*.707,(x+y)*.36-z*.88,(x+y)*.6+z*.5]);}
  const min=[Infinity,Infinity],max=[-Infinity,-Infinity];for(const p of points)for(let a=0;a<2;a++){min[a]=Math.min(min[a],p[a]);max[a]=Math.max(max[a],p[a]);}const scale=Math.min(174/Math.max(.001,max[0]-min[0]),110/Math.max(.001,max[1]-min[1]));
  const faces:number[][]=[];for(let i=0;i<mesh.indices.length;i+=3)faces.push([mesh.indices[i],mesh.indices[i+1],mesh.indices[i+2]]);faces.sort((a,b)=>a.reduce((s,i)=>s+points[i][2],0)-b.reduce((s,i)=>s+points[i][2],0));
  c.fillStyle='#0b1721';c.fillRect(0,0,192,128);for(const face of faces){c.beginPath();face.forEach((index,n)=>{const p=points[index],x=96+(p[0]-(min[0]+max[0])/2)*scale,y=64+(p[1]-(min[1]+max[1])/2)*scale;if(n)c.lineTo(x,y);else c.moveTo(x,y);});c.closePath();const p=positions;const [a,b,d]=face;const ux=p[b*3]-p[a*3],uy=p[b*3+1]-p[a*3+1],uz=p[b*3+2]-p[a*3+2],vx=p[d*3]-p[a*3],vy=p[d*3+1]-p[a*3+1],vz=p[d*3+2]-p[a*3+2];const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const shade=75+Math.abs((nx*.35-ny*.4+nz*.8)/Math.max(.001,Math.hypot(nx,ny,nz)))*100;c.fillStyle=`rgb(${shade*.75},${shade*.94},${shade})`;c.fill();}return canvas.toDataURL('image/png');
}
export default function LibraryAssetPreview({item}:{item:ViewportAsset}) {
  const host=useRef<HTMLDivElement>(null);const [src,setSrc]=useState(thumbs.get(item.key)??''),[error,setError]=useState(''),[audition,setAudition]=useState(false),[tracks,setTracks]=useState<{tagId:number;sourceId:string}[]>([]);
  useEffect(()=>{if(item.kind!=='model'||src)return;let active=true;const observer=new IntersectionObserver(rows=>{if(!rows.some(r=>r.isIntersecting))return;observer.disconnect();void schedule(async()=>{if(!active)return;const result=await call<{sourceSha256:string;objectTagId:number;mesh:MeshData}>('preview_owned_object_model',{projectId:item.sourceId,tagId:item.asset.tagId,sourceSha256:item.asset.sourceSha256});if(result.sourceSha256!==item.asset.sourceSha256||result.objectTagId!==item.asset.tagId)throw Error('Model source changed');const url=thumbnail(result.mesh);thumbs.set(item.key,url);while(thumbs.size>128)thumbs.delete(thumbs.keys().next().value!);if(active)setSrc(url);}).catch(e=>{if(active)setError(String(e));});});if(host.current)observer.observe(host.current);return()=>{active=false;observer.disconnect();};},[item.key,src]);
  async function previewSound(){try{setError('');if(item.kind==='sound'){if(item.looping){const emitters=await librarySoundEmitters(item,[0,0,0]);setTracks([...new Map(emitters.map(e=>[e.tagId,{tagId:e.tagId,sourceId:e.sourceProjectId??item.sourceId}])).values()]);}else setTracks([{tagId:item.tagId,sourceId:item.sourceId}]);}setAudition(true);}catch(e){setError(String(e));}}
  return <div className="library-asset-preview" ref={host}>{item.kind==='model'?(src?<img src={src} alt={`${item.name} actual model geometry`} width="192" height="128"/>:<small>{error?'Model unavailable':'Loading source model…'}</small>):item.kind==='sound'?<><button type="button" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();void previewSound();}}>Preview {item.looping?'sound tracks':'sound'}</button>{audition&&tracks.map(t=><Sound key={t.tagId} projectId={t.sourceId} tagId={t.tagId} sourceHash={item.sourceSha256}/>)}</>:<small>{item.kind==='mesh'?'Custom model':'Custom sound'}</small>}{error&&<small role="alert">{error}</small>}</div>;
}
