import { it, expect } from 'vitest';
import { checkedSaveReceipt, applyLibraryReceipt, applyBuildHistory } from './libraryReceipts';
import type { Bootstrap, LibraryEntry, Project, ProjectBuildHistory } from './types';
it('build metadata preserves unsaved authored content, dependencies and retained history',()=>{
  const project={id:'a',source:{sha256:'exact-source'},scene:[{id:'unsaved placement'}],tagEdits:[{tagId:1,value:9}],assets:[{id:'owned dependency'}],history:[{id:'undo'}],builds:[]} as unknown as Project;
  const receipt={projectId:'a',sourceSha256:'exact-source',builds:[{id:'native-output',status:'validated',projectFingerprint:'older saved revision'}]} as ProjectBuildHistory;
  const merged=applyBuildHistory(project,receipt);
  expect(merged.builds).toBe(receipt.builds);for(const key of ['source','scene','tagEdits','assets','history'] as const)expect(merged[key]).toBe(project[key]);
  expect(project.builds).toEqual([]);
  for(const wrong of [{...receipt,projectId:'b'},{...receipt,sourceSha256:'other-source'},{...receipt,builds:null},null])expect(()=>applyBuildHistory(project,wrong as ProjectBuildHistory)).toThrow('does not match');
  expect(applyBuildHistory({id:'local',source:null} as Project,{projectId:'local',sourceSha256:null,builds:[]}).builds).toEqual([]);
});
it('refuses a save receipt for a different project, source or cache while admitting asset workspaces', () => {
  const project={id:'a',source:{sha256:'owned',cacheVersion:7}} as Project;
  const entry={id:'a',sha256:'owned',version:7} as LibraryEntry;
  expect(checkedSaveReceipt(project,entry)).toBe(entry);
  for(const wrong of [{...entry,id:'b'},{...entry,sha256:'changed'},{...entry,version:13},null])
    expect(()=>checkedSaveReceipt(project,wrong as LibraryEntry)).toThrow('does not match');
  expect(checkedSaveReceipt({id:'asset',source:null} as Project,{id:'asset',sha256:null,version:null} as LibraryEntry).id).toBe('asset');
});
it('updates only the committed library row, retaining unrelated state and recency order', () => {
  const a={id:'a',modifiedAt:'2026-01-01'} as LibraryEntry,b={id:'b',modifiedAt:'2026-02-01'} as LibraryEntry;
  const data={entries:[b,a],settings:{autoBuild:false},logs:[],installation:{}} as unknown as Bootstrap;
  const receipt={...a,title:'Saved A',modifiedAt:'2026-03-01'};
  const next=applyLibraryReceipt(data,receipt);
  expect(next.entries).toEqual([receipt,b]);expect(data.entries).toEqual([b,a]);
  expect(next.settings).toBe(data.settings);expect(next.logs).toBe(data.logs);expect(next.installation).toBe(data.installation);
  expect(applyLibraryReceipt({...data,entries:[b]},receipt).entries).toEqual([receipt,b]);
});
