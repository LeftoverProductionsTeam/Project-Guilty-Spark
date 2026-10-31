// Synthetic UI only. Actual owned-cache pixel verification uses a native gate.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import BitmapPreview from '../../../src/components/BitmapPreview';
import type {Project} from '../../../src/types';
import '../../../src/styles.css';
function Harness(){
  const [tag,setTag]=useState(8),[id,setId]=useState('map-a');
  const project={id,source:{sha256:(id==='map-a'?'a':'c').repeat(64),resourceDirectory:'C:/owned',resourceSha256:{'bitmaps.map':'b'.repeat(64)}}} as Project;
  return <main style={{maxWidth:344,padding:12}}>
    <button onClick={()=>setTag(8)}>1555 bitmap</button><button onClick={()=>setTag(9)}>4444 bitmap</button>
    <button onClick={()=>setTag(10)}>Changed resource</button><button onClick={()=>setTag(11)}>Delayed bitmap</button>
    <button onClick={()=>{setId('map-b');setTag(9);}}>Switch map</button>
    <BitmapPreview key={id+':'+tag} project={project} tagId={tag}/>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
