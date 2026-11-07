import {useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import applicationMonitor from '../../src-tauri/icons/icon.png';

/** Permanent, lossless application artwork. No native source read, 3D renderer
 * or capture is needed for the menu button. Asset/showcase previews stay separate. */
export default function SparkEmblem(){
  const anchor=useRef<HTMLSpanElement>(null),[position,setPosition]=useState<{left:number;top:number}|null>(null);
  useLayoutEffect(()=>{
    const target=anchor.current;if(!target)return;
    // Overlap the application's rounded clip, but stay inside the actual
    // WebView/OS window: negative coordinates crop the monitor's silhouette.
    const update=()=>{const rect=target.getBoundingClientRect(),left=Math.max(0,rect.left-24),top=Math.max(0,rect.top-24);setPosition(previous=>previous?.left===left&&previous.top===top?previous:{left,top});};
    const observer=new ResizeObserver(update);observer.observe(target);update();
    window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
    return()=>{observer.disconnect();window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};
  },[]);
  return <><span className="gs-spark-anchor" ref={anchor} aria-hidden="true"/>{position&&createPortal(
    <span className="gs-spark-emblem" data-portrait="true" style={position} aria-hidden="true"><img src={applicationMonitor} alt="" width={256} height={256} decoding="sync" fetchPriority="high" draggable={false} data-spark-emblem="app-monitor"/><span className="gs-spark-eye"/></span>,document.body)}</>;
}
