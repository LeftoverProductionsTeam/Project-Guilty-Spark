import {useEffect,useState} from 'react';
import type {Project} from '../types';
import type {DdsImage} from '../haloDds';
import {native} from '../api';
import {bitmapSequenceFrame,readOwnedBitmapLayout} from '../ownedBitmapLayout';
import type {BitmapSequenceFrame,OwnedBitmapLayout} from '../ownedBitmapLayout';
import {readOwnedBitmapImage} from '../ownedBitmapPreview';
import {pixelPreviewBudget} from '../resourceBudgets';
import {textureResourceScope} from '../textureResourceScope';

export interface HudArtworkTarget {layerId:string;bitmapTagId:number;sequenceIndex:number;frameIndex:number}
export interface HudArtworkLayer {layerId:string;bitmapTagId:number;frame:BitmapSequenceFrame;image:DdsImage}
interface ArtworkState {scope:string;layers:HudArtworkLayer[];errors:{layerId:string;reason:string}[];loading:boolean}

/** HUD composition borrows the existing checked decoder/cache. It retains no
 * extra global or disk cache. Only unique source images count against the active
 * view budget; reserve the other two thirds for view-owned atlas canvases and painting ImageData. */
export function useHudArtworks(project:Project,targets:HudArtworkTarget[],enabled:boolean){
  const resourceScope=textureResourceScope(project.source),requestKey=JSON.stringify(targets);
  const [budget,setBudget]=useState(()=>Math.min(pixelPreviewBudget()/3,16*1024*1024));
  const [attempt,setAttempt]=useState(0);
  const scope=JSON.stringify([project.id,resourceScope,requestKey,enabled,budget,attempt]);
  const [state,setState]=useState<ArtworkState>({scope:'',layers:[],errors:[],loading:false});
  useEffect(()=>{
    const changed=()=>setBudget(Math.min(pixelPreviewBudget()/3,16*1024*1024));
    window.addEventListener('spark-preview-budgets',changed);
    const storage=(event:StorageEvent)=>{if(event.key==='spark.previewBudgets.v1')changed();};
    window.addEventListener('storage',storage);
    return()=>{window.removeEventListener('spark-preview-budgets',changed);window.removeEventListener('storage',storage);};
  },[]);
  useEffect(()=>{
    let alive=true;
    setState({scope,layers:[],errors:[],loading:enabled&&targets.length>0});
    if(!enabled||targets.length===0)return;
    const run=async()=>{
      if(!native||!project.source)throw Error('Open a preserved map in the desktop app to compose its original HUD artwork.');
      const ids=[...new Set(targets.map(target=>target.bitmapTagId))];
      if(targets.length>512||ids.length>64)throw Error('This HUD exceeds the bounded composite inventory. Choose Selected element to inspect it in sections.');
      const metadata=new Map<number,OwnedBitmapLayout>(),failures=new Map<number,string>();
      for(const id of ids){
        if(!alive)return;
        try{metadata.set(id,await readOwnedBitmapLayout(project,id));}
        catch(reason){failures.set(id,String(reason));}
      }
      if(!alive)return;
      const errors:ArtworkState['errors']=[],planned:{target:HudArtworkTarget;frame:BitmapSequenceFrame;key:string}[]=[];
      const images=new Map<string,{bitmapTagId:number;imageIndex:number;width:number;height:number}>();
      let reserved=0;
      for(const target of targets){
        try{
          const layout=metadata.get(target.bitmapTagId);
          if(!layout)throw Error(failures.get(target.bitmapTagId)??'Original bitmap metadata is unavailable.');
          const sequence=layout.sequences[target.sequenceIndex],count=sequence?(sequence.sprites.length||sequence.imageCount):0;
          // Frame selection is an inspector preference; out-of-range preferences
          // reset to the first real frame, never to a different native sequence.
          const frameIndex=Number.isInteger(target.frameIndex)&&target.frameIndex>=0&&target.frameIndex<count?target.frameIndex:0;
          const frame=bitmapSequenceFrame(layout,target.sequenceIndex,frameIndex),image=layout.images[frame.imageIndex];
          const key=target.bitmapTagId+':'+frame.imageIndex;
          if(!images.has(key)){
            const bytes=image.width*image.height*4;
            if(reserved+bytes>budget)throw Error('Original artwork exceeds this view’s memory allowance. Choose Selected element or adjust preview memory in Settings.');
            reserved+=bytes;images.set(key,{bitmapTagId:target.bitmapTagId,imageIndex:frame.imageIndex,width:image.width,height:image.height});
          }
          planned.push({target,frame,key});
        }catch(reason){errors.push({layerId:target.layerId,reason:String(reason)});}
      }
      const decoded=new Map<string,DdsImage>(),imageErrors=new Map<string,string>(),pending=[...images.entries()];
      let cursor=0;
      // Four bounded reads, shared with BitmapPreview. No duplicate atlas reads
      // for layers that use different sequences in the same native image.
      await Promise.all(Array.from({length:Math.min(4,pending.length)},async()=>{
        while(alive){
          const next=pending[cursor++];if(!next)return;
          const [key,target]=next;
          try{
            const {image}=await readOwnedBitmapImage(project,target.bitmapTagId,target.imageIndex);
            if(image.width!==target.width||image.height!==target.height)throw Error('Bitmap pixels differ from the admitted native layout dimensions.');
            if(alive)decoded.set(key,image);
          }catch(reason){if(alive)imageErrors.set(key,String(reason));}
        }
      }));
      if(!alive)return;
      const layers:HudArtworkLayer[]=[];
      for(const {target,frame,key} of planned){
        const image=decoded.get(key);
        if(image)layers.push({layerId:target.layerId,bitmapTagId:target.bitmapTagId,frame,image});
        else errors.push({layerId:target.layerId,reason:imageErrors.get(key)??'Original image did not load.'});
      }
      setState({scope,layers,errors,loading:false});
    };
    void run().catch(reason=>{if(alive)setState({scope,layers:[],errors:[{layerId:'',reason:String(reason)}],loading:false});});
    return()=>{alive=false;};
  },[scope]);
  const shown:ArtworkState=state.scope===scope?state:{scope,layers:[],errors:[],loading:enabled&&targets.length>0};
  return {...shown,retry:()=>setAttempt(value=>value+1),budget};
}
