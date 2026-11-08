import {useEffect,useState} from 'react';
import {getCurrentWebview} from '@tauri-apps/api/webview';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {native} from './api';
import {windowUiScale} from './uiScale';
/** Use platform WebView zoom so layout, pointer coordinates and WebGL density
 * agree. Serialize changes so a slow older resize cannot override a newer one. */
export function useInterfaceScale(requested:number|null){
 const [state,setState]=useState({scale:1,error:''});
 useEffect(()=>{
  if(!native)return;
  let live=true,timer:ReturnType<typeof setTimeout>,unlisten:(()=>void)|undefined;
  let chain=Promise.resolve(),last=-1;
  try{
   const appWindow=getCurrentWindow(),view=getCurrentWebview();
   const scheduleUpdate=()=>{chain=chain.then(async()=>{
    if(!live)return;
    try{
     const [size,dpi]=await Promise.all([appWindow.innerSize(),appWindow.scaleFactor()]);
     if(!live)return;
     const scale=windowUiScale(requested,size.width/dpi,size.height/dpi);
     if(scale!==last){await view.setZoom(scale);last=scale;}
     if(!live)return;
     document.documentElement.dataset.gsUiScale=String(scale);
     setState(old=>old.scale===scale&&!old.error?old:{scale,error:''});
    }catch(error){if(live)setState(old=>({...old,error:String(error)}));}
   });};
   const resize=()=>{clearTimeout(timer);timer=setTimeout(scheduleUpdate,100);};
   void appWindow.onResized(resize).then(stop=>{if(live)unlisten=stop;else stop();}).catch(()=>{});
   scheduleUpdate();
  }catch(error){setState(old=>({...old,error:String(error)}));}
  return()=>{live=false;clearTimeout(timer);unlisten?.();};
 },[requested]);
 return state;
}
