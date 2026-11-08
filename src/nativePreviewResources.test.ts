import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('./api',()=>({call:vi.fn()}));
import {call} from './api';
import {clearNativePreviewResources,nativePreviewResource,nativePreviewResourceStats} from './nativePreviewResources';
import {publishTextureResources} from './textureResourceScope';
const hash='a'.repeat(64),args={projectId:'preview-project',tagId:42,sourceSha256:hash};
beforeEach(()=>{clearNativePreviewResources();vi.mocked(call).mockReset();});
describe('one shared native preview resource broker',()=>{
 it('coalesces independent concurrent consumers and gives each a separate immutable-source copy',async()=>{
  let resolve!:(v:unknown)=>void;vi.mocked(call).mockImplementation(()=>new Promise(r=>{resolve=r;}));
  const first=nativePreviewResource<any>('preview_owned_object_model',args,hash);
  const second=nativePreviewResource<any>('preview_owned_object_model',{...args},hash);
  expect(call).toHaveBeenCalledTimes(1);resolve({sourceSha256:hash,objectTagId:42,mesh:{positions:[1,2,3]}});
  const [a,b]=await Promise.all([first,second]);a.mesh.positions[0]=99;expect(b.mesh.positions[0]).toBe(1);
  const third=await nativePreviewResource<any>('preview_owned_object_model',args,hash);expect(third.mesh.positions[0]).toBe(1);
  expect(call).toHaveBeenCalledTimes(1);expect(nativePreviewResourceStats().hits).toBe(2);
 });
 it('rejects changed source or tag identity, never caches missing pixels, and retries failed calls',async()=>{
  vi.mocked(call).mockResolvedValueOnce({sourceSha256:'b'.repeat(64),objectTagId:42});
  await expect(nativePreviewResource('preview_owned_object_model',args,hash)).rejects.toThrow(/identity/);
  vi.mocked(call).mockResolvedValueOnce({sourceSha256:hash,objectTagId:43});
  await expect(nativePreviewResource('preview_owned_object_model',args,hash)).rejects.toThrow(/tag identity/);
  const batch={projectId:'preview-project',requests:[{bitmapTagId:1,imageIndex:0}]};
  vi.mocked(call).mockResolvedValue({sourceSha256:hash,items:[{preview:null,error:'missing source'}]});
  await nativePreviewResource('preview_owned_cache_bitmap_batch',batch,hash);await nativePreviewResource('preview_owned_cache_bitmap_batch',batch,hash);
  expect(call).toHaveBeenCalledTimes(4);expect(nativePreviewResourceStats().entries).toBe(0);
 });
 it('does not reuse resources after resource pins change, even when source and requested model are unchanged',async()=>{
  vi.mocked(call).mockResolvedValue({sourceSha256:hash,objectTagId:42});
  const source={sha256:hash,resourceDirectory:'owned',resourceSha256:{'bitmaps.map':'b'.repeat(64)}} as any;
  publishTextureResources({id:args.projectId,source});
  await nativePreviewResource('preview_owned_object_model',args,hash);
  publishTextureResources({id:args.projectId,source:{...source,resourceSha256:{'bitmaps.map':'c'.repeat(64)}}});
  await nativePreviewResource('preview_owned_object_model',args,hash);expect(call).toHaveBeenCalledTimes(2);
 });
});

it('reuses an unchanged model after minutes away and releases only a closed map',async()=>{
 const {releaseNativePreviewResources}=await import('./nativePreviewResources');
 vi.mocked(call).mockResolvedValue({sourceSha256:hash,objectTagId:42,mesh:{positions:[1,2,3]}});
 await nativePreviewResource('preview_owned_object_model',args,hash);
 const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+600000);
 try{await nativePreviewResource('preview_owned_object_model',args,hash);expect(call).toHaveBeenCalledTimes(1);
 releaseNativePreviewResources('another-map');expect(nativePreviewResourceStats().entries).toBe(1);
 releaseNativePreviewResources(args.projectId);expect(nativePreviewResourceStats().entries).toBe(0);}finally{clock.mockRestore();}
});

it('never retains native responses beyond the saved CPU share and trims on a lower limit',async()=>{
 const {savePreviewBudgets,nativePreviewBudget}=await import('./resourceBudgets');
 const {trimNativePreviewResources}=await import('./nativePreviewResources');
 const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)});
 vi.stubGlobal('window',{dispatchEvent:vi.fn()});
 try{
  savePreviewBudgets({decodedMiB:32,textureMiB:64,warmEditors:1});
  vi.mocked(call).mockImplementation(async(_command,params:any)=>({sourceSha256:hash,objectTagId:params.tagId,payload:'p'.repeat(300000)}));
  for(let tagId=1;tagId<=25;tagId++)await nativePreviewResource('preview_owned_object_model',{...args,tagId},hash);
  expect(nativePreviewResourceStats().bytes).toBeGreaterThan(8*1024**2);
  savePreviewBudgets({decodedMiB:16,textureMiB:64,warmEditors:1});trimNativePreviewResources();
  expect(nativePreviewResourceStats().bytes).toBeLessThanOrEqual(nativePreviewBudget());
  expect(nativePreviewResourceStats().entries).toBeLessThan(25);
 }finally{vi.unstubAllGlobals();}
});
