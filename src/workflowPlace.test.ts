import {beforeEach,afterEach,expect,test,vi} from 'vitest';
import type {Project} from './types';
import type {WorkflowRoute} from './workflowHistory';
beforeEach(()=>{vi.resetModules();const values=new Map<string,string>();vi.stubGlobal('window',new EventTarget());vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});});
afterEach(()=>vi.unstubAllGlobals());
const project={id:'map-a',source:{sha256:'exact-source'}} as Project;
const route:WorkflowRoute={workspace:'tags',projectId:'map-a',settingsTab:'tools'};
test('Return to Work restores source-bound selection and view without source edits',async()=>{
  const {writeMapSession,readMapSession}=await import('./mapSession');const {captureWorkflowPlace,restoreWorkflowPlace}=await import('./workflowPlace');
  writeMapSession('map-a','tags.selection',42);writeMapSession('map-a','camera.world.PerspectiveCamera',{position:[1,2,3]});writeMapSession('map-a','tool.command','never capture this');
  const saved=captureWorkflowPlace(route,project);expect(saved.place?.values['tool.command']).toBeUndefined();
  writeMapSession('map-a','tags.selection',77);expect(restoreWorkflowPlace(saved,project)).toBe(true);expect(readMapSession('map-a','tags.selection',null)).toBe(42);
  expect(project.source?.sha256).toBe('exact-source');
});
test('stale source identity, foreign maps and injected non-view keys cannot be restored',async()=>{
  const {writeMapSession,readMapSession}=await import('./mapSession');const {captureWorkflowPlace,restoreWorkflowPlace}=await import('./workflowPlace');
  writeMapSession('map-a','tags.selection',42);const saved=captureWorkflowPlace(route,project);writeMapSession('map-a','tags.selection',77);
  expect(restoreWorkflowPlace(saved,{...project,id:'map-b'})).toBe(false);expect(restoreWorkflowPlace(saved,{...project,source:{...project.source!,sha256:'new-source'}})).toBe(false);
  expect(readMapSession('map-a','tags.selection',null)).toBe(77);
  saved.place!.values['tool.command']='injected';restoreWorkflowPlace(saved,project);expect(readMapSession('map-a','tool.command',null)).toBeNull();
});
