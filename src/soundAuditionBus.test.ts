import { describe, expect, it, vi } from 'vitest';
import type { call } from './api';
import { createSoundAuditionBus } from './soundAuditionBus';
const hash='a'.repeat(64),track={projectId:'source',tagId:42,sourceHash:hash};
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};};
function fixture(){
  const sources:any[]=[],gains:any[]=[],order:string[]=[];
  const context={state:'running',resume:vi.fn(async()=>{order.push('resume');}),decodeAudioData:vi.fn(async()=>({duration:1.25})),destination:{},
    createBufferSource:()=>{const s={buffer:null,loop:false,onended:null,start:vi.fn(),stop:vi.fn(),connect:vi.fn(),disconnect:vi.fn()};sources.push(s);return s;},
    createGain:()=>{const g={gain:{value:1},connect:vi.fn(),disconnect:vi.fn()};gains.push(g);return g;}};
  const report={sourceSha256:hash,warnings:[],permutations:[{available:true,chainStart:true,pitchRange:0,permutation:0},{available:true,pitchRange:2,permutation:3}]};
  const preview={sourceSha256:hash,mime:'audio/wav',bytes:[1,2,3],sha256:hash,name:'Native sample'};
  const invoke=vi.fn(async(command:string)=>command==='inspect_sound'?report:preview);
  const bus=createSoundAuditionBus({context:()=>context as unknown as AudioContext,invoke:invoke as unknown as typeof call,digest:async()=>hash});
  return {bus,context,sources,gains,order,report,preview,invoke};
}
describe('native sample audition ownership',()=>{
  it('resumes during activation, plays the explicitly selected sample and reports decoded duration',async()=>{
    const f=fixture();await f.bus.play('A',async()=>{f.order.push('tracks');return [{...track,pitchRange:2,permutation:3}];});
    expect(f.order).toEqual(['resume','tracks']);expect(f.invoke.mock.calls[1]).toEqual(['preview_sound',{projectId:'source',tagId:42,pitchRange:2,permutation:3}]);
    expect(f.bus.getSnapshot()).toMatchObject({owner:'A',phase:'playing',duration:1.25,name:'Native sample'});
    f.bus.configure('A',{volume:.3,repeat:true});expect(f.gains[0].gain.value).toBe(.3);expect(f.sources[0].loop).toBe(true);
  });
  it('cancels a slow native preview without starting a late source',async()=>{
    const f=fixture(),waiting=deferred<any>();f.invoke.mockImplementation(async(command:string)=>command==='inspect_sound'?f.report:waiting.promise);
    const play=f.bus.play('A',async()=>[track]);await vi.waitFor(()=>expect(f.invoke).toHaveBeenCalledTimes(2));
    f.bus.stop('A');waiting.resolve(f.preview);await play;expect(f.sources).toHaveLength(0);expect(f.bus.getSnapshot().phase).toBe('idle');
  });
  it('keeps volume and repeat changes made while a verified sample is still loading',async()=>{
    const f=fixture(),waiting=deferred<any>();f.invoke.mockImplementation(async(command:string)=>command==='inspect_sound'?f.report:waiting.promise);
    const play=f.bus.play('A',async()=>[track]);await vi.waitFor(()=>expect(f.invoke).toHaveBeenCalledTimes(2));
    f.bus.configure('A',{volume:.2,repeat:true});f.bus.configure('B',{volume:1,repeat:false});waiting.resolve(f.preview);await play;
    expect(f.sources[0].loop).toBe(true);expect(f.gains[0].gain.value).toBe(.2);
  });
  it('notifies displaced cards and cannot stop a newer owner during stale unmount',async()=>{
    const f=fixture(),notify=vi.fn();const unsubscribe=f.bus.subscribe(notify);
    await f.bus.play('A',async()=>[track]);const ended=f.sources[0].onended;
    await f.bus.play('B',async()=>[track]);f.bus.stop('A');ended();
    expect(f.sources[0].stop).toHaveBeenCalledOnce();expect(f.sources[1].stop).not.toHaveBeenCalled();
    expect(f.bus.getSnapshot().owner).toBe('B');expect(notify).toHaveBeenCalled();unsubscribe();
  });
  it('never decodes stale sources or substituted and corrupted native payloads',async()=>{
    for(const bad of ['source','checksum','mime','missing']){
      const f=fixture();if(bad==='source')f.preview.sourceSha256='b'.repeat(64);if(bad==='checksum')f.preview.sha256='b'.repeat(64);if(bad==='mime')f.preview.mime='text/html';if(bad==='missing')f.preview.bytes=[];
      await f.bus.play('A',async()=>[track]);expect(f.context.decodeAudioData).not.toHaveBeenCalled();expect(f.bus.getSnapshot().error).not.toBe('');
    }
  });
  it('rejects an unavailable explicit permutation instead of playing another sample',async()=>{
    const f=fixture();await f.bus.play('A',async()=>[{...track,pitchRange:99,permutation:3}]);expect(f.invoke).toHaveBeenCalledOnce();expect(f.sources).toHaveLength(0);
  });
  it('reports codec and device failures without claiming playback',async()=>{
    const f=fixture();f.context.decodeAudioData.mockRejectedValue(Error('codec'));await f.bus.play('A',async()=>[track]);expect(f.bus.getSnapshot().error).toContain('codec');
    f.context.state='suspended';await f.bus.play('B',async()=>[track]);expect(f.bus.getSnapshot().error).toContain('device');expect(f.sources).toHaveLength(0);
  });
});
