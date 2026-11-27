import {useEffect,useRef,useState} from 'react';
import applicationMonitor from '../../src-tauri/icons/icon.png';
import {currentMonitor,getCurrentWindow,PhysicalPosition,PhysicalSize} from '@tauri-apps/api/window';
import {call} from '../api';
import type {Bootstrap,Workspace} from '../types';
import {readSparkEmblemPicture} from '../sparkEmblemCache';
import {readInterfacePreferences,applyInterfacePreferences} from '../interfacePreferences';
import {writeMapSession} from '../mapSession';
import './desktopSpark.css';
import {mapWorkspaces,workspaceCatalog} from '../workspaceCatalog';
import type {WorkspaceWindow} from '../useWorkspaceWindows';
const shortcuts = ['library','quickforge','tags','machinima','build','runtimes','settings'] as const;

let bootstrap:Promise<Bootstrap>|undefined;
/** A shortcut into this application's command hub, not another project host. */
export default function DesktopSpark(){
  const [image,setImage]=useState(applicationMonitor),[error,setError]=useState('');
  const [menu,setMenu]=useState<{above:boolean;right:boolean}|null>(null);
  const anchor=useRef<{position:PhysicalPosition;size:PhysicalSize}|null>(null), changing=useRef(false);
  const press=useRef<{x:number;y:number}|null>(null),dragged=useRef(false);
  useEffect(()=>{
    let alive=true,scope='';
    const refresh=()=>{
      applyInterfacePreferences(readInterfacePreferences(),document.documentElement);
      if(scope)setImage(readSparkEmblemPicture(scope)?.png??applicationMonitor);
    };
    void (bootstrap??=call<Bootstrap>('bootstrap')).then(data=>{
      if(!alive)return;scope=JSON.stringify([data.dataDirectory,data.installation.mccPath??null]);refresh();
    }).catch(e=>{if(alive)setError(String(e));});
    window.addEventListener('storage',refresh);
    return()=>{alive=false;window.removeEventListener('storage',refresh);};
  },[]);
  const hide=()=>{writeMapSession('global','workspace.desktopOrb',false);void call('show_spark_companion',{visible:false}).catch(e=>setError(String(e)));};
  async function toggleMenu() {
    if(changing.current)return;
    changing.current=true;
    const win=getCurrentWindow();
    try {
      setError('');
      if(anchor.current){
        const {position,size}=anchor.current;
        await win.setSize(size);await win.setPosition(position);
        anchor.current=null;setMenu(null);return;
      }
      const [position,size,monitor,scale]=await Promise.all([win.outerPosition(),win.innerSize(),currentMonitor(),win.scaleFactor()]);
      if(!monitor)throw Error('Cannot find the companion display.');
      const area=monitor.workArea;
      const width=Math.min(Math.round(305*scale),area.size.width),height=Math.min(size.height+Math.round(272*scale),area.size.height);
      const bottom=area.position.y+area.size.height,rightEdge=area.position.x+area.size.width;
      const above=position.y+height>bottom,right=position.x+width>rightEdge;
      const x=Math.max(area.position.x,Math.min(rightEdge-width,right ? position.x+size.width-width : position.x));
      const y=Math.max(area.position.y,Math.min(bottom-height,above ? position.y+size.height-height : position.y));
      anchor.current={position,size};
      await win.setSize(new PhysicalSize(width,height));await win.setPosition(new PhysicalPosition(x,y));
      setMenu({above,right});
    }catch(e){setError(String(e));}finally{changing.current=false;}
  }
  async function openWorkspace(workspace:Workspace){
    try{
      if(menu)await toggleMenu();
      const views=mapWorkspaces.includes(workspace)?await call<WorkspaceWindow[]>('workspace_window_inventory'):[];
      const project=(views.find(view=>view.label==='main'&&view.project)??views.find(view=>view.writable&&view.project))?.project;
      if(project)await call('open_project_window',{id:project,workspace,observe:true,another:true});
      else await call('open_workspace_window',{workspace,another:true});
    }catch(e){setError(String(e));}
  }
  return <div className="spark-desktop-orb" data-expanded={!!menu} data-above={menu?.above} data-right={menu?.right} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();if(menu)void toggleMenu();else hide();}}}>
    <button className="spark-desktop-open" aria-label="Spark workspace launcher" aria-expanded={!!menu} title={error||'Open a workspace · drag to move'}
      onPointerDown={event=>{if(event.button===0&&!menu){press.current={x:event.screenX,y:event.screenY};dragged.current=false;}}}
      onPointerMove={event=>{
        const start=press.current;if(!start||!(event.buttons&1)||dragged.current||Math.hypot(event.screenX-start.x,event.screenY-start.y)<5)return;
        dragged.current=true;press.current=null;
        void getCurrentWindow().startDragging().then(()=>call('remember_spark_companion')).catch(e=>setError(String(e)));
      }}
      onPointerUp={()=>{press.current=null;}}
      onClick={()=>{if(dragged.current){dragged.current=false;return;}void toggleMenu();}}>
      {image?<img src={image} alt="" draggable={false}/>:<span>SPARK</span>}
    </button>
    {menu&&<section className="spark-desktop-menu" aria-label="Open workspace in a new window">
      <header><strong>Open a workspace</strong><button aria-label="Close workspace launcher" onClick={()=>void toggleMenu()}>×</button></header>
      {shortcuts.map(id=>{const item=workspaceCatalog.find(workspace=>workspace.id===id)!;const Icon=item.icon;return <button key={id} onClick={()=>void openWorkspace(id)}><Icon size={17}/>{item.label}<span aria-hidden="true">↗</span></button>;})}
    </section>}
    {!menu&&<button className="spark-desktop-hide" aria-label="Hide Spark companion" title="Hide companion" onClick={hide}>×</button>}
    {error&&<span className="spark-desktop-error" role="alert">{error}</span>}
  </div>;
}
