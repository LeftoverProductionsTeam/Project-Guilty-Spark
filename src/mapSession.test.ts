import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const prefix = 'guilty-spark-map-session-v1:';
let data: Map<string, string>, blocked: boolean;
beforeEach(() => {
  vi.resetModules();
  data = new Map();
  blocked = false;
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (blocked) throw Error('quota');
      data.set(key, value);
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
test('a warm window merges a peer preference before saving a different key', async () => {
  data.set(prefix + 'a', JSON.stringify({ workspace: 'world', layout: { width: 300 } }));
  const session = await import('./mapSession');
  const layout = session.readMapSession('a', 'layout', null);
  data.set(
    prefix + 'a',
    JSON.stringify({ workspace: 'world', layout: { width: 300 }, 'director.recordingFolder': 'D:/takes' }),
  );
  session.writeMapSession('a', 'director.docked', true);
  expect(JSON.parse(data.get(prefix + 'a')!)).toMatchObject({
    'director.recordingFolder': 'D:/takes',
    'director.docked': true,
  });
  expect(session.readMapSession('a', 'layout', null)).toBe(layout);
});
test('native windows inherit a handoff once, then retain independent selections and cameras',async()=>{
  const session=await import('./mapSession');
  session.configureMapViewWindow('main');
  session.writeMapSession('a','world.selection','door-a');
  const mainChanged=vi.fn();const stop=session.subscribeMapSession(['a'],'world.selection',mainChanged);
  session.configureMapViewWindow('editor-one');
  expect(session.readMapSession('a','world.selection',null)).toBe('door-a');
  session.writeMapSession('a','world.selection','door-b');
  expect(mainChanged).not.toHaveBeenCalled();
  session.configureMapViewWindow('main');
  expect(session.readMapSession('a','world.selection',null)).toBe('door-a');
  session.writeMapSession('a','world.selection','door-c');expect(mainChanged).toHaveBeenCalledTimes(1);
  session.configureMapViewWindow('editor-one');expect(session.readMapSession('a','world.selection',null)).toBe('door-b');
  session.configureMapViewWindow('editor-two');expect(session.readMapSession('a','world.selection',null)).toBe('door-c');
  stop();
});
test('shared non-view preferences and source revision isolation survive window-local UI scoping',async()=>{
  const session=await import('./mapSession');session.configureMapViewWindow('main');
  session.writeMapSession('a','studio.openRequest',true);session.writeMapSession('a','camera.world.PerspectiveCamera',{position:[1,2,3]});
  session.configureMapViewWindow('editor-one');expect(session.readMapSession('a','studio.openRequest',false)).toBe(true);
  session.writeMapSession('a','studio.openRequest',false);session.writeMapSession('a','camera.world.PerspectiveCamera',{position:[4,5,6]});
  session.configureMapViewWindow('main');expect(session.readMapSession('a','studio.openRequest',true)).toBe(false);
  expect(session.readMapSession('a','camera.world.PerspectiveCamera',null)).toEqual({position:[1,2,3]});
  expect(session.readMapSession('b','camera.world.PerspectiveCamera',null)).toBeNull();
});
test('asset contexts, child selections and native animation preferences remain independent per map and window',async()=>{
  const session=await import('./mapSession');
  session.configureMapViewWindow('main');
  const keys=['tags.contexts','tags.context-selection','tags.preview.animation','bitmap.face.7','bitmap.image.7'];
  for(const key of keys)session.writeMapSession('a',key,key==='tags.preview.animation'?true:{one:'main'});
  session.configureMapViewWindow('asset-popout');
  for(const key of keys)session.writeMapSession('a',key,key==='tags.preview.animation'?false:{one:'popout'});
  session.configureMapViewWindow('main');
  expect(session.readMapSession('a',keys[0],null)).toEqual({one:'main'});
  expect(session.readMapSession('a',keys[1],null)).toEqual({one:'main'});
  expect(session.readMapSession('a',keys[2],false)).toBe(true);
  expect(session.readMapSession('a','bitmap.face.7',null)).toEqual({one:'main'});
  expect(session.readMapSession('a','bitmap.image.7',null)).toEqual({one:'main'});
  expect(session.readMapSession('b',keys[0],null)).toBeNull();
  session.configureMapViewWindow('asset-popout');expect(session.readMapSession('a',keys[2],true)).toBe(false);
});
test('a storage event refreshes just that map without replacing unchanged objects', async () => {
  data.set(prefix + 'a', JSON.stringify({ workspace: 'world', layout: { width: 300 } }));
  data.set(prefix + 'b', JSON.stringify({ workspace: 'tags' }));
  const session = await import('./mapSession');
  const layout = session.readMapSession('a', 'layout', null);
  expect(session.readMapSession('b', 'workspace', '')).toBe('tags');
  data.set(
    prefix + 'a',
    JSON.stringify({ workspace: 'world', layout: { width: 300 }, 'director.recordingFolder': 'D:/takes' }),
  );
  window.dispatchEvent(
    Object.assign(new Event('storage'), { key: prefix + 'a', newValue: data.get(prefix + 'a') }),
  );
  expect(session.readMapSession('a', 'director.recordingFolder', '')).toBe('D:/takes');
  expect(session.readMapSession('a', 'layout', null)).toBe(layout);
  expect(session.readMapSession('b', 'workspace', '')).toBe('tags');
});
test('an explicit write compares with the latest peer value, not its stale cache', async () => {
  data.set(prefix + 'a', JSON.stringify({ mode: 'old' }));
  const session = await import('./mapSession');
  expect(session.readMapSession('a', 'mode', '')).toBe('old');
  data.set(prefix + 'a', JSON.stringify({ mode: 'peer' }));
  session.writeMapSession('a', 'mode', 'old');
  expect(JSON.parse(data.get(prefix + 'a')!).mode).toBe('old');
});
test('quota failure retains in-memory preferences and a later save persists them together', async () => {
  data.set(prefix + 'a', JSON.stringify({ workspace: 'world' }));
  const session = await import('./mapSession');
  blocked = true;
  session.writeMapSession('a', 'workspace', 'machinima');
  session.writeMapSession('a', 'director.recordingFolder', 'D:/takes');
  expect(session.readMapSession('a', 'workspace', '')).toBe('machinima');
  blocked = false;
  session.writeMapSession('a', 'director.docked', true);
  expect(JSON.parse(data.get(prefix + 'a')!)).toMatchObject({
    workspace: 'machinima',
    'director.recordingFolder': 'D:/takes',
    'director.docked': true,
  });
});

test('camera preferences notify their map and key without waking other retained workspaces', async()=>{
  const session=await import('./mapSession');
  const camera=vi.fn(),query=vi.fn(),otherMap=vi.fn(),combined=vi.fn();
  const stop=session.subscribeMapSession(['a'],'camera.world',camera);
  session.subscribeMapSession(['a'],'tags.query',query);
  session.subscribeMapSession(['b'],'camera.world',otherMap);
  session.subscribeMapSession(['a','a','b'],'camera.world',combined);
  session.writeMapSession('a','camera.world',{position:[1,2,3]});
  expect(camera).toHaveBeenCalledTimes(1);expect(combined).toHaveBeenCalledTimes(1);
  expect(query).not.toHaveBeenCalled();expect(otherMap).not.toHaveBeenCalled();
  session.writeMapSession('a','camera.world',{position:[1,2,3]});
  expect(camera).toHaveBeenCalledTimes(1);
  stop();session.writeMapSession('a','camera.world',{position:[3,2,1]});
  expect(camera).toHaveBeenCalledTimes(1);expect(combined).toHaveBeenCalledTimes(2);
});

test('a no-op write publishes a peer key that arrived before its storage notification',async()=>{
  data.set(prefix+'a',JSON.stringify({mode:'world',layout:{width:300}}));
  const session=await import('./mapSession');
  const oldLayout=session.readMapSession('a','layout',null),changed=vi.fn(),mode=vi.fn();
  session.subscribeMapSession(['a'],'layout',changed);session.subscribeMapSession(['a'],'mode',mode);
  data.set(prefix+'a',JSON.stringify({mode:'world',layout:{width:400}}));
  session.writeMapSession('a','mode','world');
  expect(session.readMapSession('a','layout',null)).not.toBe(oldLayout);
  expect(session.readMapSession('a','layout',null)).toEqual({width:400});
  expect(changed).toHaveBeenCalledTimes(1);expect(mode).not.toHaveBeenCalled();
});

test('peer notifications retain object identity and ignore unrelated or malformed storage',async()=>{
  data.set(prefix+'a',JSON.stringify({layout:{width:300},mode:'world'}));
  const session=await import('./mapSession');const layout=session.readMapSession('a','layout',null);
  const changed=vi.fn(),other=vi.fn();
  session.subscribeMapSession(['a'],'layout',changed);session.subscribeMapSession(['b'],'mode',other);
  const event=()=>window.dispatchEvent(Object.assign(new Event('storage'),{key:prefix+'a',newValue:data.get(prefix+'a')}));
  data.set(prefix+'a',JSON.stringify({layout:{width:300},mode:'tags'}));event();
  expect(session.readMapSession('a','layout',null)).toBe(layout);expect(changed).not.toHaveBeenCalled();
  data.set(prefix+'a','malformed');event();expect(changed).not.toHaveBeenCalled();
  data.set(prefix+'a',JSON.stringify({layout:{width:500},mode:'tags'}));event();
  expect(changed).toHaveBeenCalledTimes(1);expect(other).not.toHaveBeenCalled();
  data.clear();window.dispatchEvent(Object.assign(new Event('storage'),{key:null}));
  expect(changed).toHaveBeenCalledTimes(2);expect(other).toHaveBeenCalledTimes(1);
  expect(session.readMapSession('a','layout','reset')).toBe('reset');
});

test('window browsing and category choices do not follow another live window',async()=>{
 const session=await import('./mapSession');session.configureMapViewWindow('main');session.writeMapSession('global','library.query','main-map');session.writeMapSession('global','interface.section','appearance');session.writeMapSession('a','hosting.runtime','mccSteam');
 session.configureMapViewWindow('editor-two');expect(session.readMapSession('global','library.query','')).toBe('main-map');session.writeMapSession('global','library.query','other-map');session.writeMapSession('global','interface.section','sounds');session.writeMapSession('a','hosting.runtime','haloCustomEdition');
 session.configureMapViewWindow('main');expect(session.readMapSession('global','library.query','')).toBe('main-map');expect(session.readMapSession('global','interface.section','')).toBe('appearance');expect(session.readMapSession('a','hosting.runtime','')).toBe('mccSteam');
 session.writeMapSession('global','home.model','johnson');session.configureMapViewWindow('editor-two');expect(session.readMapSession('global','home.model','')).toBe('johnson');
});

test('runtime dashboard pages and engine setup stay independent across live windows',async()=>{
 const session=await import('./mapSession');session.configureMapViewWindow('runtime-one');
 session.writeMapSession('global','tools.dashboard','setup');session.writeMapSession('global','tools.enginePackage','openh1');
 session.configureMapViewWindow('runtime-two');session.writeMapSession('global','tools.dashboard','packs');session.writeMapSession('global','tools.enginePackage','faber');
 session.configureMapViewWindow('runtime-one');expect(session.readMapSession('global','tools.dashboard','')).toBe('setup');expect(session.readMapSession('global','tools.enginePackage','')).toBe('openh1');
 session.configureMapViewWindow('runtime-two');expect(session.readMapSession('global','tools.dashboard','')).toBe('packs');expect(session.readMapSession('global','tools.enginePackage','')).toBe('faber');
});


test('global workspace scroll remains window-local across shared preference updates',async()=>{
 const session=await import('./mapSession');session.configureMapViewWindow('main');
 session.writeMapSession('global','scroll.settings',{'surface.settings-interface':[399,0]});
 session.configureMapViewWindow('tools-popout');session.writeMapSession('global','scroll.settings',{'surface.settings-interface':[120,0]});
 expect(session.readMapSession('global','scroll.settings',{})).toEqual({'surface.settings-interface':[120,0]});
 session.configureMapViewWindow('main');
 expect(session.readMapSession('global','scroll.settings',{})).toEqual({'surface.settings-interface':[399,0]});
});


test('native AI coordinate proposals stay window-local and never enter restart storage',async()=>{
 const session=await import('./mapSession');session.configureMapViewWindow('main');
 const draft={key:'source-point',values:['1','2','3'],active:true,reviewRequest:42};
 session.writeMapSession('a','world.ai-start',draft);session.writeMapSession('a','world.grid',true);
 expect(session.readMapSession('a','world.ai-start',null)).toEqual(draft);
 session.configureMapViewWindow('second');expect(session.readMapSession('a','world.trigger-volume',null)).toBeNull();expect(session.readMapSession('a','world.ai-start',null)).toBeNull();
 session.writeMapSession('a','world.ai-start',{...draft,key:'second'});
 session.configureMapViewWindow('main');expect(session.readMapSession('a','world.ai-start',null)).toEqual(draft);
 expect([...data.values()].every(text=>!text.includes('world.ai-start'))).toBe(true);
 vi.resetModules();const restarted=await import('./mapSession');restarted.configureMapViewWindow('main');
 expect(restarted.readMapSession('a','world.ai-start',null)).toBeNull();
 expect(restarted.readMapSession('a','world.grid',false)).toBe(true);
});

test('a quota failure retains ordinary settings without persisting a transient AI proposal',async()=>{
 const session=await import('./mapSession');session.configureMapViewWindow('main');blocked=true;
 session.writeMapSession('a','world.grid',true);session.writeMapSession('a','world.ai-start',{key:'pending'});
 blocked=false;session.writeMapSession('a','world.snap',true);
 expect(JSON.parse(data.get(prefix+'a')!)).not.toHaveProperty('world.ai-start');
 expect(session.readMapSession('a','world.ai-start',null)).toEqual({key:'pending'});
 expect(session.readMapSession('a','world.grid',false)).toBe(true);
});

test('camera and AI source proposals survive ordinary writes together but never reach another window or restart',async()=>{
 const session=await import('./mapSession');session.configureMapViewWindow('main');
 session.writeMapSession('a','world.trigger-volume',{active:true});session.writeMapSession('a','world.ai-start',{kind:'patrol',key:'native-ai'});session.writeMapSession('a','world.cutscene-camera',{sourceSha256:'a'.repeat(64),active:true});
 blocked=true;session.writeMapSession('a','world.grid',true);blocked=false;session.writeMapSession('a','world.snap',true);
 expect(session.readMapSession('a','world.ai-start',null)).toEqual({kind:'patrol',key:'native-ai'});expect(session.readMapSession('a','world.cutscene-camera',null)).toMatchObject({active:true});
 expect([...data.values()].every(text=>!text.includes('world.ai-start')&&!text.includes('world.cutscene-camera')&&!text.includes('world.trigger-volume'))).toBe(true);
 session.configureMapViewWindow('second');expect(session.readMapSession('a','world.cutscene-camera',null)).toBeNull();
 vi.resetModules();const restarted=await import('./mapSession');restarted.configureMapViewWindow('main');expect(restarted.readMapSession('a','world.trigger-volume',null)).toBeNull();expect(restarted.readMapSession('a','world.cutscene-camera',null)).toBeNull();expect(restarted.readMapSession('a','world.ai-start',null)).toBeNull();expect(restarted.readMapSession('a','world.grid',false)).toBe(true);
});

test('mission expansion stays window-local and restores without touching authored content',async()=>{
 const session=await import('./mapSession');session.configureMapViewWindow('main');session.writeMapSession('a','creator-mission-expanded',{first:true});
 session.configureMapViewWindow('other');session.writeMapSession('a','creator-mission-expanded',{second:true});
 session.configureMapViewWindow('main');expect(session.readMapSession('a','creator-mission-expanded',{})).toEqual({first:true});
 vi.resetModules();const restarted=await import('./mapSession');restarted.configureMapViewWindow('main');expect(restarted.readMapSession('a','creator-mission-expanded',{})).toEqual({first:true});
});
