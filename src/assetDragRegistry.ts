import type {PointerEvent} from 'react';
import type {ViewportAsset} from './viewportAssets';
const retained=new Map<string,{asset:ViewportAsset;expires:number}>();
export function draggedAsset(key:string){const row=retained.get(key);return row&&row.expires>performance.now()?row.asset:undefined;}
export function beginAssetTransfer(item:ViewportAsset,projectId:string,event:PointerEvent){
  if(event.button!==0)return;
  retained.set(item.key,{asset:item,expires:performance.now()+30000});while(retained.size>64)retained.delete(retained.keys().next().value!);
  window.dispatchEvent(new CustomEvent('guilty-spark-asset-drag-start',{detail:{projectId,key:item.key,pointer:event.pointerId,x:event.clientX,y:event.clientY}}));
}
