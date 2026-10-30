import {useEffect,useRef,useState} from 'react';
import type {AnchorHTMLAttributes} from 'react';
import {createPortal} from 'react-dom';
import {call,native} from '../api';
/** Browser previews keep ordinary links. Desktop clicks, middle-clicks and
 * context actions use the user's system browser instead of WebView windows. */
export default function ExternalBrowserLink({href,children,...props}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string}) {
  const [error,setError]=useState('');
  const [menu,setMenu]=useState<{x:number;y:number}|null>(null);
  const anchor=useRef<HTMLAnchorElement>(null),popup=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!menu)return;
    popup.current?.querySelector('button')?.focus();
    const dismiss=(event:PointerEvent)=>{if(!popup.current?.contains(event.target as Node))setMenu(null);};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setMenu(null);anchor.current?.focus();}};
    document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',key);};
  },[menu]);
  async function open(){try{setError('');await call('open_external_url',{url:href});}catch(e){setError(String(e));}}
  return <><a {...props} ref={anchor} href={href} target="_blank" rel="noopener noreferrer" onClick={e=>{if(native){e.preventDefault();void open();}}} onAuxClick={e=>{if(native&&e.button===1){e.preventDefault();void open();}}} onContextMenu={e=>{if(native){e.preventDefault();setMenu({x:Math.max(8,Math.min(e.clientX,innerWidth-198)),y:Math.max(8,Math.min(e.clientY,innerHeight-92))});}}}>{children}</a>{menu&&createPortal(<div ref={popup} role="menu" aria-label="External link" className="gs-external-link-menu" style={{position:'fixed',left:menu.x,top:menu.y,zIndex:2147483001}}><button role="menuitem" onClick={()=>{setMenu(null);void open();}}>Open in browser</button><button role="menuitem" onClick={()=>{setMenu(null);void navigator.clipboard.writeText(href).catch(e=>setError(String(e)));}}>Copy link</button></div>,document.body)}{error&&<small role="alert">{error}</small>}</>;
}
