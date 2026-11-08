// Browser-only regression fixture for the real shared pager. No native IPC or mocked bounds.
import {createElement,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import PagedSurface from '../../../src/components/PagedSurface';
export function mountLateTools(){
 const node=document.createElement('div');node.className='application';document.body.append(node);
 const w=window as any;w.__pagingClicks=[];
 function Commands(){const [count,setCount]=useState(9),[overflow,setOverflow]=useState(false);w.__setPagingCommands=setCount;w.__overflowPagingCommand=setOverflow;return createElement('div',{style:{position:'fixed',top:80,left:280,width:246,zIndex:100000}},createElement(PagedSurface,{label:'Late Tools',name:'late-tools-regression',scope:'late-tools-regression',maxHeight:360,children:Array.from({length:count},(_,index)=>createElement('button',{key:index,style:{display:'block',width:overflow&&index===12?400:'100%',height:36,minHeight:36,margin:0,boxSizing:'border-box'},onClick:()=>w.__pagingClicks.push(index)},'Fixture command '+(index+1)))}));}
 w.__pagingRoot=createRoot(node);w.__pagingRoot.render(createElement(Commands));
}
export function growLateTools(){flushSync(()=>(window as any).__setPagingCommands(13));}

export function overflowLateTools(){flushSync(()=>{(window as any).__setPagingCommands(13);(window as any).__overflowPagingCommand(true);});}
