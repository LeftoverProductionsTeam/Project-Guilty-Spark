import {describe,it,expect} from 'vitest';
import {documentReducer,emptyMapDocuments,activeDocument} from './mapDocuments';
import type {MapDocuments} from './mapDocuments';
import type {Project} from './types';
const project=(id:string):Project=>({schemaVersion:1,id,title:id,createdAt:'',modifiedAt:'',source:null,provenance:{creator:'',community:'',releaseYear:null,description:'',sourceUrl:'',permissions:''},scene:[],assets:[],tagEdits:[],history:[],builds:[]});
const open=(state:MapDocuments,p:Project)=>documentReducer(state,{type:'open',open:{project:p,inspection:null}});
describe('Independent open map documents',()=>{
  it('late texture pins update only resource metadata without changing selection or undo',()=>{
    const a={...project('a'),source:{sha256:'a'.repeat(64),resourceSha256:{}}}as Project;let s=open(emptyMapDocuments(100),a);s=documentReducer(s,{type:'history',action:{type:'edit',project:{...a,title:'edited A'},description:'edit during resource scan'}});s=open(s,project('b'));
    s=documentReducer(s,{type:'resources',project:{...a,source:{...a.source!,resourceDirectory:'owned',resourceSha256:{'bitmaps.map':'b'.repeat(64)}}}});expect(s.activeId).toBe('b');expect(s.documents[0].history.current?.title).toBe('edited A');expect(s.documents[0].history.past[0].source?.resourceDirectory).toBe('owned');expect(s.documents[0].history.dirty).toBe(true);
  });
  it('keeps edits, undo and redo isolated across tab switches',()=>{
    let s=open(emptyMapDocuments(100),project('a'));s=documentReducer(s,{type:'history',action:{type:'edit',project:{...project('a'),title:'edited A'},description:'A edit'}});
    s=open(s,project('b'));s=documentReducer(s,{type:'history',action:{type:'edit',project:{...project('b'),title:'edited B'},description:'B edit'}});
    s=documentReducer(s,{type:'select',id:'a'});expect(activeDocument(s)?.history.current?.title).toBe('edited A');
    s=documentReducer(s,{type:'history',action:{type:'undo'}});expect(activeDocument(s)?.history.current?.title).toBe('a');expect(s.documents[1].history.current?.title).toBe('edited B');
    s=documentReducer(s,{type:'history',action:{type:'redo'}});expect(activeDocument(s)?.history.current?.title).toBe('edited A');
  });
  it('routes late asset loads and save acknowledgements to their own document',()=>{
    const a=project('a');let s=open(open(emptyMapDocuments(100),a),project('b'));
    s=documentReducer(s,{type:'mesh',id:'a',assetId:'asset-a',mesh:{positions:[0,0,0],indices:[],normals:[],uvs:[]}as never});
    expect(s.documents[0].meshes['asset-a']).toBeDefined();expect(s.documents[1].meshes).toEqual({});
    s=documentReducer(s,{type:'history',action:{type:'edit',project:{...a,title:'new'},description:'edit while saving'}});
    s=documentReducer(s,{type:'saved',id:'a',project:a});expect(s.documents[0].history.dirty).toBe(true);
    const edited=s.documents[0].history.current!;s=documentReducer(s,{type:'saved',id:'a',project:edited});expect(s.documents[0].history.dirty).toBe(false);expect(s.activeId).toBe('b');
  });
  it('updates all limits and closes only the requested tab',()=>{
    let s=open(open(emptyMapDocuments(100),project('a')),project('b'));s=documentReducer(s,{type:'history',action:{type:'history-limit',limit:50}});expect(s.documents.every(d=>d.history.limit===50)).toBe(true);
    s=documentReducer(s,{type:'close',id:'a'});expect(s.activeId).toBe('b');s=documentReducer(s,{type:'close',id:'b'});expect(s.activeId).toBeNull();expect(s.documents).toEqual([]);
  });
});
