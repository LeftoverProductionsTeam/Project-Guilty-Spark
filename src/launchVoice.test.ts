import {beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({call:vi.fn(),read:vi.fn(),write:vi.fn(),models:vi.fn()}));
vi.mock('./api',()=>({native:true,call:mock.call}));
vi.mock('./mapSession',()=>({readMapSession:mock.read,writeMapSession:mock.write}));
vi.mock('./homeShowcase',()=>({preloadHomeModels:mock.models}));
import {DEFAULT_INTERFACE} from './interfacePreferences';
import type {Bootstrap} from './types';
beforeEach(()=>{vi.resetModules();mock.call.mockReset();mock.read.mockReturnValue('character:johnson');mock.write.mockReset();mock.models.mockReset();});
it('prepares one matching greeting despite multiple mounts or windows and uses saved volume',async()=>{
  mock.call.mockImplementation(async(command)=>command==='prepare_launch_voice'?{lineId:'native-line',character:'johnson',availableLines:200}:true);
  const {startLaunchVoice}=await import('./launchVoice');const preferences=()=>({...DEFAULT_INTERFACE,launchVoiceVolume:.4});
  const first=startLaunchVoice({}as Bootstrap,preferences);expect(startLaunchVoice({}as Bootstrap,preferences)).toBe(first);await first;await startLaunchVoice({}as Bootstrap,preferences);
  expect(mock.call.mock.calls).toEqual([['prepare_launch_voice',{character:'johnson'}],['play_launch_voice',{character:'johnson',lineId:'native-line',volume:.4}]]);
});
it('honors mute before launch and while source recovery is running',async()=>{
  const {startLaunchVoice}=await import('./launchVoice');await startLaunchVoice({}as Bootstrap,()=>({...DEFAULT_INTERFACE,launchVoiceEnabled:false}));expect(mock.call).not.toHaveBeenCalled();
  vi.resetModules();let enabled=true;mock.call.mockImplementation(async command=>{if(command==='prepare_launch_voice'){enabled=false;return{lineId:'one',availableLines:1};}});
  await(await import('./launchVoice')).startLaunchVoice({}as Bootstrap,()=>({...DEFAULT_INTERFACE,launchVoiceEnabled:enabled}));
  expect(mock.call.mock.calls.map(c=>c[0])).toEqual(['prepare_launch_voice','stop_launch_voice']);
});
it('reports missing original dialogue once and never substitutes a different character',async()=>{
  mock.read.mockReturnValue('character:cortana');mock.call.mockRejectedValue(Error('Missing original source'));
  const {startLaunchVoice}=await import('./launchVoice');await startLaunchVoice({}as Bootstrap,()=>DEFAULT_INTERFACE);await startLaunchVoice({}as Bootstrap,()=>DEFAULT_INTERFACE);
  expect(mock.call).toHaveBeenCalledTimes(1);expect(mock.call).toHaveBeenCalledWith('prepare_launch_voice',{character:'cortana'});expect(mock.write.mock.lastCall?.[2]).toContain('Missing original source');
});
