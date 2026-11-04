import {useEffect,useRef,useState} from 'react';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {call} from '../api';
import type {Bootstrap} from '../types';
import {readSparkEmblemPicture} from '../sparkEmblemCache';
import {readInterfacePreferences,applyInterfacePreferences} from '../interfacePreferences';
import {writeMapSession} from '../mapSession';
import './desktopSpark.css';

let bootstrap:Promise<Bootstrap>|undefined;
/** A shortcut into this application's command hub, not another project host. */
export default function DesktopSpark(){
  const [image,setImage]=useState(''),[error,setError]=useState('');
  const press=useRef<{x:number;y:number}|null>(null),dragged=useRef(false);
  useEffect(()=>{
    let alive=true,scope='';
    const refresh=()=>{
      applyInterfacePreferences(readInterfacePreferences(),document.documentElement);
      if(scope)setImage(readSparkEmblemPicture(scope)?.png??'');
    };
    void (bootstrap??=call<Bootstrap>('bootstrap')).then(data=>{
      if(!alive)return;scope=JSON.stringify([data.dataDirectory,data.installation.mccPath??null]);refresh();
    }).catch(e=>{if(alive)setError(String(e));});
    const focus=()=>void call('recover_workspace_window').catch(e=>setError(String(e)));
    window.addEventListener('storage',refresh);window.addEventListener('focus',focus);
    return()=>{alive=false;window.removeEventListener('storage',refresh);window.removeEventListener('focus',focus);};
  },[]);
  const hide=()=>{writeMapSession('global','workspace.desktopOrb',false);void call('show_spark_companion',{visible:false}).catch(e=>setError(String(e)));};
  return <div className="spark-desktop-orb" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();hide();}}}>
    <button className="spark-desktop-open" aria-label="Open Spark command hub" title={error||'Open Spark · drag to move · Esc to hide'}
      onPointerDown={event=>{if(event.button===0){press.current={x:event.screenX,y:event.screenY};dragged.current=false;}}}
      onPointerMove={event=>{
        const start=press.current;if(!start||!(event.buttons&1)||dragged.current||Math.hypot(event.screenX-start.x,event.screenY-start.y)<5)return;
        dragged.current=true;press.current=null;
        void getCurrentWindow().startDragging().then(()=>call('remember_spark_companion')).catch(e=>setError(String(e)));
      }}
      onPointerUp={()=>{press.current=null;}}
      onClick={()=>{if(dragged.current){dragged.current=false;return;}void call('open_spark_command_hub').catch(e=>setError(String(e)));}}>
      {image?<img src={image} alt="" draggable={false}/>:<span>SPARK</span>}
    </button>
    <button className="spark-desktop-hide" aria-label="Hide Spark companion" title="Hide companion" onClick={hide}>×</button>
    {error&&<span className="spark-desktop-error" role="alert">Unable to open Spark</span>}
  </div>;
}
