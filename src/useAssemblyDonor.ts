import {useEffect,useState,useMemo} from 'react';
import {call,native} from './api';
import type {OpenProject,Project} from './types';
import {assemblySignature} from './bspAssembly';
import type {AssemblyReport,BspAssembly} from './bspAssembly';
import {useMapState} from './mapSession';
import {assemblyViewportSource,currentAssemblyPreview,currentAssemblyDraftPreview} from './assemblyViewport';
import {publishTextureResources} from './textureResourceScope';
/** One RAM source admission per saved donor identity, independent of motion. */
export function useAssemblyDonor(project:Project){
 const [draft]=useMapState<BspAssembly|null>(project.id,'bsp.draft',()=>project.bspAssembly??null);
 const [baseline]=useMapState(project.id,'bsp.applied',()=>assemblySignature(project.bspAssembly??null));
 const [preview,setPreview]=useState<AssemblyReport['viewport']>(undefined);
 const accept=(value:AssemblyReport['viewport'])=>currentAssemblyPreview(project,value)??currentAssemblyDraftPreview(project,draft,baseline,value);
 const joined=accept(preview),plan=joined?.assembly??project.bspAssembly;
 useEffect(()=>{const received=(event:Event)=>{const value=(event as CustomEvent<AssemblyReport['viewport']>).detail;
  if(accept(value))setPreview(value);
 };window.addEventListener('gs:bsp-source-preview',received);return()=>window.removeEventListener('gs:bsp-source-preview',received);},[project.id,project.source?.sha256,project.bspAssembly,draft,baseline]);
 const key=plan?JSON.stringify([project.id,plan.donorSource.sha256,plan.donorSource.preservedPath,plan.donorSource.resourceDirectory,plan.donorSource.resourceSha256]):'';
 const [state,setState]=useState<{key:string;open:OpenProject|null;error:string}>({key:'',open:null,error:''});
 useEffect(()=>{let live=true;if(!key||!native)return;setState({key,open:null,error:''});
 void call<OpenProject>('open_bsp_assembly_donor',{projectId:project.id}).then(open=>{if(!live)return;if(open.inspection?.sha256!==plan?.donorSource.sha256)throw Error('Saved donor source identity changed');publishTextureResources(open.project);setState({key,open,error:''});}).catch(error=>{if(live)setState({key,open:null,error:String(error)});});
 return()=>{live=false;};},[key]);
 const donor=useMemo(()=>{if(!plan||state.key!==key||!state.open)return {source:null,error:state.key===key?state.error:'',loading:!!plan&&native&&!(state.key===key&&state.error)};try{return {source:assemblyViewportSource(state.open,plan),error:'',loading:false};}catch(error){return {source:null,error:String(error),loading:false};}},[state,key,plan?.donorBspIndex,plan?.includeDonorScenery]);
 return {...donor,preview:joined};
}
