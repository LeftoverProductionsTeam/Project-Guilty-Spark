// Browser-only regression fixture for the real shared pager. No native IPC or mocked bounds.
import {createElement,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import PagedSurface from '../../../src/components/PagedSurface';
import {headerMenuKeyDown} from '../../../src/components/WorkspacePanels';
export function mountLateTools(){
 const node=document.createElement('div');node.className='application';document.body.append(node);
 const w=window as any;w.__pagingClicks=[];
 function Commands(){const [count,setCount]=useState(9),[overflow,setOverflow]=useState(false);w.__setPagingCommands=setCount;w.__overflowPagingCommand=setOverflow;return createElement('div',{style:{position:'fixed',top:80,left:280,width:246,zIndex:100000}},createElement(PagedSurface,{label:'Late Tools',name:'late-tools-regression',scope:'late-tools-regression',maxHeight:360,children:Array.from({length:count},(_,index)=>createElement('button',{key:index,style:{display:'block',width:overflow&&index===12?400:'100%',height:36,minHeight:36,margin:0,boxSizing:'border-box'},onClick:()=>w.__pagingClicks.push(index)},'Fixture command '+(index+1)))}));}
 w.__pagingRoot=createRoot(node);w.__pagingRoot.render(createElement(Commands));
}
export function growLateTools(){flushSync(()=>(window as any).__setPagingCommands(13));}

export function overflowLateTools(){flushSync(()=>{(window as any).__setPagingCommands(13);(window as any).__overflowPagingCommand(true);});}

// Opening a menu can receive End before its first measured page exists.
export function mountOpeningView(){
 const node=document.createElement('div');node.className='application';document.body.append(node);
 const root=createRoot(node);(window as any).__openingViewRoot=root;
 flushSync(()=>root.render(createElement('div',{style:{position:'fixed',top:80,left:280,width:246,zIndex:100000}},
  createElement('details',{className:'gs-layout-menu gs-view-menu',onKeyDown:headerMenuKeyDown},
   createElement('summary',{'aria-label':'Opening View menu'},'View'),
   createElement('div',null,createElement(PagedSurface,{label:'Opening View',name:'opening-view-regression',scope:'opening-view-regression',maxHeight:140,children:
    ['Fullscreen fixture','Save fixture layout','Restore fixture layout','Reset fixture layout'].map(label=>createElement('button',{key:label,style:{display:'block',width:'100%',height:52,minHeight:52,margin:0,boxSizing:'border-box'}},label))}))))));
 const field=document.createElement('input');field.setAttribute('aria-label','Later submenu input');field.style.cssText='position:fixed;top:80px;left:560px;width:180px';node.append(field);
}
