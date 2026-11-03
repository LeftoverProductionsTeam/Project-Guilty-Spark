import {expect,it,vi} from 'vitest';
import {createLatestRefresh} from './latestRefresh';

function delayed<T>() { let resolve!: (value:T)=>void, reject!: (error:unknown)=>void; const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; }

it('coalesces invalidations, publishes only the newest reply and never reuses a completed snapshot',async()=>{
  const a=delayed<string>(),b=delayed<string>(),c=delayed<string>(),publish=vi.fn();
  const read=vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise).mockReturnValueOnce(c.promise);
  const q=createLatestRefresh(read,publish),first=q.request('a');
  for(let i=0;i<100;i++)expect(q.request('newest')).toBe(first);
  expect(read).toHaveBeenCalledTimes(1);a.resolve('stale');
  await vi.waitFor(()=>expect(read).toHaveBeenCalledTimes(2));expect(read.mock.calls[1]).toEqual(['newest']);expect(publish).not.toHaveBeenCalled();
  b.resolve('current');await expect(first).resolves.toBe('current');expect(publish.mock.calls).toEqual([['current']]);
  const next=q.request('after');expect(read).toHaveBeenCalledTimes(3);c.resolve('fresh');await next;
  expect(publish.mock.calls).toEqual([['current'],['fresh']]);
});

it('retries a superseded failure but surfaces the latest failure and permits recovery',async()=>{
  const a=delayed<string>(),b=delayed<string>(),publish=vi.fn(),read=vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise).mockResolvedValueOnce('recovered');
  const q=createLatestRefresh(read,publish),pending=q.request('a');q.request('b');a.reject(Error('old source gone'));
  await vi.waitFor(()=>expect(read).toHaveBeenCalledTimes(2));const rejected=expect(pending).rejects.toThrow('latest invalid');b.reject(Error('latest invalid'));await rejected;
  expect(publish).not.toHaveBeenCalled();await q.request('retry');expect(publish).toHaveBeenCalledWith('recovered');
});

it('disposes without publishing a late reply and a new owner can refresh independently',async()=>{
  const a=delayed<string>(),publish=vi.fn(),old=createLatestRefresh(()=>a.promise,publish),pending=old.request(undefined);
  const rejected=expect(pending).rejects.toThrow('closed');old.dispose();await rejected;
  a.resolve('late');await Promise.resolve();expect(publish).not.toHaveBeenCalled();await expect(old.request(undefined)).rejects.toThrow('closed');
  const next=createLatestRefresh(async()=> 'new owner',publish);await next.request(undefined);expect(publish.mock.calls).toEqual([['new owner']]);
});

it('save receipts fence active reads without causing idle global reloads',async()=>{
  const a=delayed<string>(),read=vi.fn().mockReturnValueOnce(a.promise).mockResolvedValueOnce('saved revision'),publish=vi.fn(),q=createLatestRefresh(read,publish);
  expect(q.invalidateActive(undefined)).toBeUndefined();expect(read).not.toHaveBeenCalled();
  const pending=q.request(undefined);expect(q.invalidateActive(undefined)).toBe(pending);a.resolve('before save');await pending;
  expect(publish.mock.calls).toEqual([['saved revision']]);expect(q.invalidateActive(undefined)).toBeUndefined();expect(read).toHaveBeenCalledTimes(2);
});
