import {describe, expect, it} from 'vitest';
import type {MapInspection, Project, Tag} from './types';
import {historyReducer, initialHistory} from './editor';
import {queueTagRename, renamedTagPath} from './tagRenames';
import {editRevisionKey} from './smartEdit';
describe('native custom tag names', () => {
  const tag={id:1,class:'weap',path:'weapons/pistol/pistol'} as Tag;
  const inspection={sha256:'a'.repeat(64),header:{version:13},tags:[tag,{id:2,class:'weap',path:'weapons/other'}]} as MapInspection;
  const project={id:'a',source:{sha256:inspection.sha256},tagEdits:[],history:[],scene:[],assets:[]} as unknown as Project;
  it('keeps native IDs and original inspection immutable, persists names and supports undo/redo', () => {
    const before=JSON.stringify(inspection),next=queueTagRename(project,inspection,tag,'My pistol');
    expect(next.tagRenames).toEqual([{sourceTagId:1,path:'weapons/pistol/My pistol'}]);
    expect(renamedTagPath(next,tag)).toBe('weapons/pistol/My pistol');expect(JSON.stringify(inspection)).toBe(before);
    expect(editRevisionKey(next)).not.toBe(editRevisionKey(project));
    let history=historyReducer(initialHistory,{type:'load',project});history=historyReducer(history,{type:'edit',project:next,description:'Rename pistol'});
    history=historyReducer(history,{type:'undo'});expect(history.current?.tagRenames).toBeUndefined();
    history=historyReducer(history,{type:'redo'});expect(JSON.parse(JSON.stringify(history.current)).tagRenames).toEqual(next.tagRenames);
    expect(queueTagRename(next,inspection,tag,'pistol').tagRenames).toEqual([]);
  });
  it('rejects collisions, unsafe paths, stale revisions and fixed engine roots', () => {
    for(const name of ['../escape','C:/escape','bad?name','folder//name','folder/nul','weapons/other'])expect(()=>queueTagRename(project,inspection,tag,name)).toThrow();
    expect(()=>queueTagRename({...project,source:{...project.source!,sha256:'b'.repeat(64)}},inspection,tag,'custom')).toThrow(/revision/);
    expect(()=>queueTagRename(project,{...inspection,tags:[{...tag,class:'sbsp'}]}, {...tag,class:'sbsp'},'custom')).toThrow(/dedicated/);
  });
});
