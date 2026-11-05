import { beforeEach, expect, test, vi } from 'vitest';
const invoke=vi.hoisted(()=>vi.fn());
vi.mock('./api',()=>({call:invoke}));
beforeEach(()=>{vi.resetModules();invoke.mockReset();});
test('the preview and snap loader share one exact source request and retry a rejected read',async()=>{
  const {loadOwnedCollision}=await import('./useEndToFloor');
  const source={projectId:'a',sourceSha256:'a'.repeat(64),tagId:1},mesh={positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2],label:'native',source:'halo-model-collision'};
  let finish!:(value:unknown)=>void;invoke.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const first=loadOwnedCollision(source),second=loadOwnedCollision({...source});expect(second).toBe(first);expect(invoke).toHaveBeenCalledTimes(1);finish(mesh);expect(await first).toBe(mesh);
  invoke.mockRejectedValueOnce(Error('Source changed'));
  const changed={...source,sourceSha256:'b'.repeat(64)};
  await expect(loadOwnedCollision(changed)).rejects.toThrow('Source changed');
  invoke.mockResolvedValueOnce(null);expect(await loadOwnedCollision(changed)).toBeNull();expect(invoke).toHaveBeenCalledTimes(3);
  expect(await loadOwnedCollision(source)).toBe(mesh);expect(invoke).toHaveBeenCalledTimes(3);
});
test('collision entries are bounded and a failed evicted request cannot remove its newer replacement',async()=>{
  const {loadOwnedCollision}=await import('./useEndToFloor');
  const source={projectId:'a',sourceSha256:'a'.repeat(64),tagId:0};
  let reject!:(error:Error)=>void;invoke.mockImplementationOnce(()=>new Promise((_,fail)=>{reject=fail;}));
  const oldest=loadOwnedCollision(source);const rejection=expect(oldest).rejects.toThrow('late failure');
  invoke.mockResolvedValue(null);
  for(let tagId=1;tagId<=96;tagId++)await loadOwnedCollision({...source,tagId});
  const replacement=loadOwnedCollision(source);reject(Error('late failure'));await rejection;
  expect(loadOwnedCollision(source)).toBe(replacement);expect(invoke).toHaveBeenCalledTimes(98);
});
