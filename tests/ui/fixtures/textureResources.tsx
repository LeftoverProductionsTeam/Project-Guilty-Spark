// Synthetic UI contract; real owned-cache recovery is a separate native gate.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import HaloTextures from '../../../src/components/HaloTextures';
import {publishTextureResources,useTextureResourceScope} from '../../../src/textureResourceScope';
import type {Project} from '../../../src/types';
import '../../../src/styles.css';
const initial={id:'map-a',source:{sha256:'a',cacheVersion:6,resourceDirectory:'C:/original',resourceSha256:{'bitmaps.map':'primary'}}} as Project;
function Harness(){
  const [project,setProject]=useState(initial);
  const resource=useTextureResourceScope(project.id);
  return <main style={{width:360,padding:12}}>
    <button onClick={()=>{const next={...project,source:{...project.source!,resourceDirectory:'D:/recovered',resourceSha256:{...project.source!.resourceSha256,'mcc-shared-bitmaps.map':'secondary'}}};setProject(next);publishTextureResources(next);}}>Recover same primary pin</button>
    <output aria-label="Texture retry identity">{resource}</output>
    <button onClick={()=>setProject({...initial,id:'map-b',source:{...initial.source!,sha256:'b'}})}>Switch map</button>
    <HaloTextures project={project} notify={()=>{}} onConnected={async open=>{setProject(open.project);}}/>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
