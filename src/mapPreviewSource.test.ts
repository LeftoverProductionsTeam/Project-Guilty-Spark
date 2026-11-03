import {beforeEach,expect,it,vi} from 'vitest';
import {openMapPreviewSource} from './mapPreviewSource';
const {call}=vi.hoisted(()=>({call:vi.fn()}));vi.mock('./api',()=>({call,native:true}));
function source(version:number,pins:Record<string,string>={}) {return {project:{id:'source',source:{sha256:'same-source',resourceSha256:pins}},inspection:{header:{version}}};}
beforeEach(()=>call.mockReset());
it('uses source cache version and existing pins for MCC instead of hosting preferences',async()=>{
  const initial=source(13),connected=source(13,{'mcc-textures':'pack'});call.mockResolvedValueOnce(initial).mockResolvedValueOnce(connected);
  expect(await openMapPreviewSource('source')).toBe(connected);expect(call.mock.calls).toEqual([['open_project',{id:'source'}],['connect_mcc_texture_resources',{projectId:'source'}]]);
  call.mockReset().mockResolvedValueOnce(connected);expect(await openMapPreviewSource('source')).toBe(connected);expect(call).toHaveBeenCalledTimes(1);
});
it.each([6,7,609])('uses verified classic admission for cache %i without substituting missing pixels',async version=>{
  const initial=source(version);call.mockResolvedValueOnce(initial).mockResolvedValueOnce(null);expect(await openMapPreviewSource('source')).toBe(initial);
  expect(call.mock.calls[1]).toEqual(['auto_connect_classic_textures',{projectId:'source'}]);
});
it('keeps embedded and Xbox source reads intact and does not cache failed resource resolution',async()=>{
  const xbox=source(5);call.mockResolvedValueOnce(xbox);expect(await openMapPreviewSource('source')).toBe(xbox);expect(call).toHaveBeenCalledTimes(1);
  const initial=source(13);call.mockResolvedValueOnce(initial).mockRejectedValueOnce(Error('not installed'));expect(await openMapPreviewSource('source')).toBe(initial);
  call.mockResolvedValueOnce(initial).mockResolvedValueOnce(source(13,{'mcc-textures':'now present'}));expect((await openMapPreviewSource('source')).project.source?.resourceSha256?.['mcc-textures']).toBe('now present');
});
it('surfaces source reads and rejects resources returned for another identity',async()=>{
  call.mockRejectedValueOnce(Error('source hash changed'));await expect(openMapPreviewSource('source')).rejects.toThrow('source hash changed');
  call.mockResolvedValueOnce(source(13)).mockResolvedValueOnce({...source(13),project:{id:'other',source:{sha256:'different'}}});
  await expect(openMapPreviewSource('source')).rejects.toThrow('preserved map');
});
