import { it, expect } from 'vitest';
import { checkedSaveReceipt, applyLibraryReceipt } from './libraryReceipts';
import type { Bootstrap, LibraryEntry, Project } from './types';
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
