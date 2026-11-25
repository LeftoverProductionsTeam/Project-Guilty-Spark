import {defaultNativePlayerProfile} from './firefight';
import { expect, it } from 'vitest';
import {
  setNativeLogicName,
  setDevicePositionControl,
  setNativeTransportSignals,
  transportSignalNames,
  addLogicTrigger,
  addHandwrittenSource,
  centerDoorTrigger,
  connectDoor,
  connectVehicleCrew,
  copyDeviceBehavior,
  extractionLayout,
} from './nativeLogic';
import {
  duplicateForgeNodes,
  appendForgeNodes,
  forgeGeometryKey,
  forgeNodes,
  removeForgeNodes,
  transformForgeNode,
} from './forge';
import { mergeForge } from './forgeSession';
import { historyReducer, initialHistory } from './editor';
import type { Project } from './types';
import type { QuickForgeDocument } from './forge';
const base: QuickForgeDocument = {
  schemaVersion: 1,
  name: 'Native events',
  template: 'customBlank',
  runtimeId: 'mccSteam',
  gameMode: 'slayer',
  skyPath: null,
  buildQuality: 'draft',
  materials: [],
  geometry: [],
  spawns: [],
  objectives: [],
  placements: [
    {
      id: 'door',
      name: 'Door',
      tagClass: 'mach',
      tagPath: 'levels/a10/devices/doors/door small/door small',
      tagId: 7,
      sourceProjectId: 'source',
      sourceSha256: 'a'.repeat(64),
      position: [14, 0, 0],
      rotation: [0, 0, 0],
      team: 0,
      respawnSeconds: 0,
      visible: true,
      locked: false,
    },
  ],
};
function level() {
  const added = addLogicTrigger(base, [11, 0, 1.5]);
  return connectDoor(added.document, added.id, 'door');
}
it('links a native switch to a machine without mutating the prior project',()=>{
  const initial:QuickForgeDocument={...base,placements:[{...base.placements[0]},
    {...base.placements[0],id:'switch',tagClass:'ctrl',name:'Hall switch'}]};
  const linked=setDevicePositionControl(initial,'door','switch');
  expect(initial.logic).toBeUndefined();
  expect(linked.logic?.devices).toMatchObject([
    {placementId:'switch',initialPosition:0,powered:true},
    {placementId:'door',positionControlId:'switch',initialPosition:0,powered:true},
  ]);
  expect(setDevicePositionControl(linked,'door','switch')).toBe(linked);
  const reopened=JSON.parse(JSON.stringify(linked)) as QuickForgeDocument;
  expect(reopened.logic?.devices.find(device=>device.placementId==='door')?.positionControlId).toBe('switch');
  const disconnected=setDevicePositionControl(reopened,'door','');
  expect(disconnected.logic?.devices.find(device=>device.placementId==='door')?.positionControlId).toBeUndefined();
  const removed=removeForgeNodes(linked,['switch']);
  expect(removed.logic?.devices).toMatchObject([{placementId:'door'}]);
  expect(removed.logic?.devices[0].positionControlId).toBeUndefined();
  expect(()=>setDevicePositionControl(initial,'door','door')).toThrow(/non-Extraction control/);
});

it('makes simple door entry repeatable and explicitly centers a return-accessible trigger', () => {
  const d = level(),
    id = d.logic!.triggers[0].id;
  expect(d.logic!.rules[0].once).toBe(false);
  const fitted = centerDoorTrigger(d, id, 'door');
  expect(fitted.logic!.triggers[0]).toMatchObject({ id, position: [14, 0, 1.5], dimensions: [6, 3, 3] });
  expect(fitted.logic!.rules).toEqual(d.logic!.rules);
  expect(d.logic!.triggers[0].position).toEqual([11, 0, 1.5]);
  d.logic!.triggers[0].locked = true;
  expect(() => centerDoorTrigger(d, id, 'door')).toThrow(/Unlock/);
});
function project(doc: QuickForgeDocument): Project {
  return {
    schemaVersion: 1,
    id: 'local',
    title: 'Logic',
    createdAt: '',
    modifiedAt: '',
    source: null,
    provenance: {
      creator: '',
      community: '',
      releaseYear: null,
      description: '',
      sourceUrl: '',
      permissions: '',
    },
    scene: [],
    assets: [],
    tagEdits: [],
    history: [],
    builds: [],
    quickForge: doc,
  };
}
it('binds a trigger to the placed native device, preserves source identity and reuses geometry', () => {
  const d = level();
  expect(base.logic).toBeUndefined();
  expect(d.logic?.devices).toEqual([{ placementId: 'door', initialPosition: 0, powered: true }]);
  expect(d.placements).toEqual(base.placements);
  expect(forgeGeometryKey(d)).toBe(forgeGeometryKey(base));
  expect(d.logic?.rules[0].event.kind).toBe('enter');
  expect(() => connectDoor(d, 'missing', 'door')).toThrow();
  const bad = structuredClone(d);
  bad.placements[0].tagClass = 'scen';
  expect(() => connectDoor(bad, bad.logic!.triggers[0].id, 'door')).toThrow();
});
it('undo restores deletion and all dependent logic in one document transaction', () => {
  const d = level(),
    deleted = removeForgeNodes(d, ['door']);
  expect(deleted.logic?.rules).toHaveLength(0);
  expect(deleted.logic?.devices).toHaveLength(0);
  expect(deleted.logic?.triggers).toHaveLength(1);
  let h = historyReducer(initialHistory, { type: 'load', project: project(d) });
  h = historyReducer(h, {
    type: 'edit',
    project: project(deleted),
    description: 'Delete door and connections',
  });
  h = historyReducer(h, { type: 'undo' });
  expect(h.current?.quickForge).toEqual(d);
  h = historyReducer(h, { type: 'redo' });
  expect(h.current?.quickForge).toEqual(deleted);
});
it('duplicates only trigger geometry with a new identity and requires explicit new bindings', () => {
  const d = level(),
    trigger = forgeNodes(d).find((n) => n.type === 'trigger')!;
  const copied = appendForgeNodes(d, [trigger], [0, 4, 0]);
  expect(copied.ids[0]).not.toBe(trigger.value.id);
  expect(copied.document.logic?.triggers).toHaveLength(2);
  expect(copied.document.logic?.rules).toEqual(d.logic?.rules);
  expect(copied.document.logic?.triggers[1].position).toEqual([11, 4, 1.5]);
  expect(() => transformForgeNode(trigger, [0, 0, 1], [0.1, 0, 0])).toThrow(/yaw/);
  expect(() => transformForgeNode(trigger, [1600, 0, 1], [0, 0, 0])).toThrow();
  expect(() => transformForgeNode(trigger, [0, 0, 1], [0, 0, 0], [100, 1, 1])).toThrow(/128/);
});
it('preserves locked trigger rules and merges or rejects graphs without overwriting the peer draft', () => {
  const d = level();
  d.logic!.triggers[0].locked = true;
  expect(removeForgeNodes(d, [d.logic!.triggers[0].id])).toEqual(d);
  const own = structuredClone(d),
    peer = structuredClone(d);
  own.logic!.rules[0].once = !d.logic!.rules[0].once;
  peer.name = 'Peer rename';
  expect(mergeForge(d, own, peer).name).toBe('Peer rename');
  peer.logic!.rules[0].enabled = false;
  expect(() => mergeForge(d, own, peer)).toThrow(/Logic/);
  expect(peer.logic!.rules[0].enabled).toBe(false);
  const clear = { ...d, logic: undefined };
  expect(mergeForge(d, clear, d).logic).toBeUndefined();
});
it('copies a complete device setup into independent rotated instance bindings with one Undo', () => {
  const d = level();
  d.placements.push({
    ...structuredClone(d.placements[0]),
    id: 'second-door',
    name: 'Second door',
    position: [28, 6, 0],
    rotation: [0, 0, Math.PI / 2],
  });
  const original = structuredClone(d);
  const copied = copyDeviceBehavior(d, 'door', 'second-door');
  expect(d).toEqual(original);
  const logic = copied.document.logic!;
  expect(logic.devices.map((b) => b.placementId)).toEqual(['door', 'second-door']);
  expect(logic.triggers[1].position).toEqual([28, 3, 1.5]);
  expect(logic.triggers[1].rotation[2]).toBeCloseTo(Math.PI / 2);
  expect(logic.rules[1].actions).toEqual([{ kind: 'devicePosition', targetId: 'second-door', value: 1 }]);
  expect(logic.rules[1].event).toEqual({ kind: 'enter', triggerId: copied.triggerIds[0] });
  expect(new Set(logic.rules.map((r) => r.id)).size).toBe(2);
  const h = historyReducer(historyReducer(initialHistory, { type: 'load', project: project(d) }), {
    type: 'edit',
    project: project(copied.document),
    description: 'Copy behavior',
  });
  expect(historyReducer(h, { type: 'undo' }).current?.quickForge).toEqual(d);
  expect(() => copyDeviceBehavior(copied.document, 'door', 'second-door')).toThrow(/already has/);
  const shared = structuredClone(d);
  shared.logic!.rules[0].actions.push({ kind: 'devicePower', targetId: 'second-door', value: 1 });
  expect(() => copyDeviceBehavior(shared, 'door', 'second-door')).toThrow();
});
it('preserves handwritten source bytes and refuses ambiguous imports or invisible graph changes', () => {
  const d = level(),
    content = '; original comment\r\n(global short user_counter 41)\r\n';
  const added = addHandwrittenSource(d, 'mission notes.hsc', content);
  expect(added.logic?.handwrittenSources).toEqual([{ filename: 'mission notes.hsc', content }]);
  expect(d.logic?.handwrittenSources).toBeUndefined();
  expect(() => addHandwrittenSource(added, 'MISSION NOTES.hsc', '; replacement')).toThrow(/already exists/);
  for (const name of [
    '../escape.hsc',
    'CON.hsc',
    'NUL.any.hsc',
    'gs_logic.hsc',
    'global_scripts.hsc',
    'file.HSC',
  ])
    expect(() => addHandwrittenSource(d, name, content)).toThrow();
  expect(() => addHandwrittenSource(d, 'user.hsc', '\ufeff; BOM')).toThrow(/ASCII/);
  const manual = structuredClone(d);
  manual.logic!.manualSource = '; retained manual override';
  expect(() => connectDoor(manual, manual.logic!.triggers[0].id, 'door')).toThrow(/paused/);
  expect(addHandwrittenSource(manual, 'user.hsc', content).logic?.manualSource).toBe(
    manual.logic!.manualSource,
  );
  const peer = structuredClone(added);
  peer.logic!.handwrittenSources![0].content = '; peer changed source';
  const own = structuredClone(added);
  own.logic!.rules[0].once = true;
  expect(() => mergeForge(added, own, peer)).toThrow(/Logic/);
});


function extractionSource():QuickForgeDocument {
 const terminal=(id:string,x:number)=>({...base.placements[0],id,name:id,tagClass:'ctrl' as const,position:[x,0,0] as [number,number,number]});
 const zone=(id:string,x:number,nativeName:string)=>({id,name:id,nativeName,position:[x,0,1] as [number,number,number],rotation:[0,0,0] as [number,number,number],dimensions:[6,6,4] as [number,number,number],visible:true,locked:false});
 return {...base,runtimeId:'haloCustomEdition',gameMode:'campaign',startingProfile:defaultNativePlayerProfile(),
   placements:[terminal('deploy',0),terminal('activate',20)],
   spawns:[{id:'safe',name:'Safe start',position:[0,0,0],facing:0,team:0,gameModes:[],visible:true,locked:false}],
   logic:{schemaVersion:1,rules:[],triggers:[zone('hub',0,'extraction_return'),zone('field',20,'extraction_zone')],
     devices:[{placementId:'deploy',nativeName:'extraction_deploy',powered:true,initialPosition:0},{placementId:'activate',nativeName:'extraction_activate',powered:true,initialPosition:0}]}};
}
it('requires every selectable Extraction start in the hub, including hidden and multiplayer-filtered starts',()=>{
 const doc=extractionSource(),original=structuredClone(doc);
 expect(extractionLayout(doc).issues).toEqual([]);
 doc.spawns.push({...doc.spawns[0],id:'unsafe',name:'Field start',position:[20,0,0],visible:false,locked:true,team:1,gameModes:['slayer']});
 const review=extractionLayout(doc);
 expect(review.playerStarts).toEqual({total:2,safe:1});
 expect(review.issues.filter(issue=>issue.objectId==='unsafe').map(issue=>issue.message)).toEqual([
   'Player start Field start is outside the safe hub return volume.',
   'Player start Field start is inside activation; move it into the safe hub outside activation.',
 ]);
 expect(doc.spawns[1].position).toEqual([20,0,0]); // Review must not silently move or discard authored data.
 expect(doc.spawns[0]).toEqual(original.spawns[0]);
 doc.spawns[1].position=[1,1,0];expect(extractionLayout(doc).issues).toEqual([]);
});
it('reports missing Extraction starts and does not call unknown hub bindings safe',()=>{
 const doc=extractionSource();doc.spawns=[];
 expect(extractionLayout(doc).issues.some(issue=>issue.message.includes('at least one player start'))).toBe(true);
 doc.logic!.triggers=doc.logic!.triggers.filter(zone=>zone.nativeName!=='extraction_zone');
 expect(extractionLayout(doc).playerStarts.safe).toBeNull();
});

it('validates optional loadout and debrief controls inside the safe hub',()=>{
 const doc=extractionSource();
 const [deploy]=doc.placements;
 const loadout={...deploy,id:'loadout',position:[1,0,0] as typeof deploy.position};
 const debrief={...deploy,id:'debrief',position:[-1,0,0] as typeof deploy.position};
 doc.placements.push(loadout,debrief);
 doc.logic!.devices.push(
  {placementId:'loadout',nativeName:'extraction_loadout',powered:true,initialPosition:0},
  {placementId:'debrief',nativeName:'extraction_debrief',powered:true,initialPosition:0},
 );
 expect(extractionLayout(doc)).toMatchObject({loadout,debrief,issues:[]});
 doc.logic!.devices.at(-1)!.powered=false;
 loadout.position=[20,0,0];
 const review=extractionLayout(doc);
 expect(review.issues.map(issue=>issue.objectId)).toEqual(['debrief','loadout']);
 expect(review.bindings).toBe(4);
});

it('retains the same safe-hub checks while mission objectives gate activation power',()=>{const doc=extractionSource();doc.logic!.devices[1].powered=false;expect(extractionLayout(doc,{activationPowered:false}).issues).toEqual([]);expect(extractionLayout(doc).issues.some(i=>i.message.includes('power'))).toBe(true);doc.spawns[0].position=[20,0,0];expect(extractionLayout(doc,{activationPowered:false}).issues.some(i=>i.objectId==='safe')).toBe(true);});


it('names a solo transport through native placement source, history and collaboration without changing display identity',()=>{
 const doc=structuredClone(base);doc.gameMode='campaign';doc.placements=[{...doc.placements[0],id:'ship',name:'My aircraft',tagClass:'vehi',tagPath:'vehicles/pelican/pelican'}];
 const node=forgeNodes(doc).find(n=>n.value.id==='ship')!;
 const named=setNativeLogicName(doc,node,'extraction_pelican');
 expect(named.placements[0]).toEqual({...doc.placements[0],nativeName:'extraction_pelican'});
 expect(doc.placements[0].nativeName).toBeUndefined();
 const initial=project(doc);
 let history=historyReducer(historyReducer(initialHistory,{type:'load',project:initial}),{type:'edit',project:{...initial,quickForge:named},description:'Bind transport'});
 history=historyReducer(history,{type:'undo'});expect(history.current?.quickForge?.placements[0].nativeName).toBeUndefined();
 history=historyReducer(history,{type:'redo'});expect(history.current?.quickForge?.placements[0].nativeName).toBe('extraction_pelican');
 expect(mergeForge(doc,named,doc).placements[0].nativeName).toBe('extraction_pelican');
 const copy=duplicateForgeNodes(named,['ship']);expect(copy.document.placements[0].nativeName).toBe('extraction_pelican');expect(copy.document.placements[1].nativeName).toBeUndefined();
 expect(setNativeLogicName(named,forgeNodes(named).find(n=>n.value.id==='ship')!,'').placements[0].nativeName).toBeUndefined();
});
it('refuses ambiguous, locked, multiplayer and manually-owned transport bindings without replacing source',()=>{
 const doc=structuredClone(base);doc.gameMode='campaign';doc.placements=[{...doc.placements[0],id:'ship',tagClass:'vehi',tagPath:'vehicles/pelican/pelican'}];
 const node=forgeNodes(doc).find(n=>n.value.id==='ship')!;
 for(const name of ['gs_reserved','../map','with space','UPPER'])expect(()=>setNativeLogicName(doc,node,name)).toThrow();
 doc.logic={schemaVersion:1,triggers:[],devices:[],rules:[]};doc.logic.triggers.push({id:'zone',name:'Existing zone',nativeName:'extraction_pelican',position:[0,0,0],rotation:[0,0,0],dimensions:[2,2,2],visible:true,locked:false});
 expect(()=>setNativeLogicName(doc,node,'extraction_pelican')).toThrow(/unique/);
 doc.logic.triggers=[];doc.placements[0].locked=true;expect(()=>setNativeLogicName(doc,node,'ship')).toThrow(/Unlock/);doc.placements[0].locked=false;
 doc.gameMode='slayer';expect(()=>setNativeLogicName(doc,node,'ship')).toThrow(/solo/);doc.gameMode='campaign';
 doc.logic.manualSource='; original';expect(()=>setNativeLogicName(doc,node,'ship')).toThrow(/handwritten/);
 expect(doc.placements[0].nativeName).toBeUndefined();
});


it('authors dedicated transport groups through history, sharing and copying without claiming live readiness',()=>{
 let doc=structuredClone(base);doc.gameMode='campaign';doc.placements=[{...doc.placements[0],id:'ship',name:'Aircraft',tagClass:'vehi',tagPath:'vehicles/pelican/pelican'}];
 const selected=()=>forgeNodes(doc).find(n=>n.value.id==='ship')!;
 expect(()=>setNativeTransportSignals(doc,selected(),true)).toThrow(/Bind one unique/);
 doc=setNativeLogicName(doc,selected(),'extraction_pelican');const enabled=setNativeTransportSignals(doc,selected(),true);
 expect(enabled.placements[0].transportSignals).toBe(true);expect(doc.placements[0].transportSignals).toBeUndefined();
 expect(transportSignalNames(enabled.placements[0].nativeName!)).toEqual(['extraction_pelican_boarded','extraction_pelican_called','extraction_pelican_landed']);
 expect(()=>setNativeLogicName(enabled,forgeNodes(enabled).find(n=>n.value.id==='ship')!,'extraction_spirit')).toThrow(/Disable/);
 expect(()=>setNativeLogicName(enabled,forgeNodes(enabled).find(n=>n.value.id==='ship')!,'')).toThrow(/Disable/);
 let history=historyReducer(historyReducer(initialHistory,{type:'load',project:project(doc)}),{type:'edit',project:project(enabled),description:'Enable transport groups'});
 history=historyReducer(history,{type:'undo'});expect(history.current?.quickForge?.placements[0].transportSignals).toBeUndefined();history=historyReducer(history,{type:'redo'});expect(history.current?.quickForge?.placements[0].transportSignals).toBe(true);
 expect(mergeForge(doc,enabled,doc).placements[0].transportSignals).toBe(true);
 const duplicate=duplicateForgeNodes(enabled,['ship']);expect(duplicate.document.placements[1].nativeName).toBeUndefined();expect(duplicate.document.placements[1].transportSignals).toBeUndefined();expect(duplicate.document.placements[0]).toEqual(enabled.placements[0]);
 const disabled=setNativeTransportSignals(enabled,forgeNodes(enabled).find(n=>n.value.id==='ship')!,false);expect(disabled.placements[0].transportSignals).toBe(false);
 expect(setNativeLogicName(disabled,forgeNodes(disabled).find(n=>n.value.id==='ship')!,'extraction_spirit').placements[0].nativeName).toBe('extraction_spirit');
});


it('connects named campaign aircraft to existing AI through immutable source and project history',()=>{
 const original=structuredClone(base);original.gameMode='campaign';original.placements=[{...original.placements[0],id:'ship',tagClass:'vehi',name:'Aircraft',tagPath:'vehicles/pelican/pelican',nativeName:'extraction_pelican'}];
 original.campaignEncounters=[{name:'pilot',actorPath:'characters/marine_armored/marine_armored',position:[0,0,0],startActive:true,count:1,spacing:1}];
 const next=connectVehicleCrew(original,'ship','pilot','P-driver');
 expect(original.logic?.rules??[]).toHaveLength(0);expect(next.logic?.rules[0]).toMatchObject({enabled:true,once:true,event:{kind:'timer',seconds:.1},actions:[{kind:'aiVehicleLoad',targetId:'ship',encounterName:'pilot',seat:'P-driver'}]});
 let h=historyReducer(historyReducer(initialHistory,{type:'load',project:project(original)}),{type:'edit',project:project(next),description:'Seat pilot'});
 h=historyReducer(h,{type:'undo'});expect(h.current?.quickForge?.logic?.rules??[]).toHaveLength(0);h=historyReducer(h,{type:'redo'});expect(h.current?.quickForge?.logic?.rules).toEqual(next.logic?.rules);
 expect(JSON.parse(JSON.stringify(h.current)).quickForge.logic.rules).toEqual(next.logic?.rules);expect(mergeForge(original,next,original).logic?.rules).toEqual(next.logic?.rules);
 expect(removeForgeNodes(next,['ship']).logic?.rules).toHaveLength(0);
 expect(()=>setNativeLogicName(next,forgeNodes(next).find(node=>node.value.id==='ship')!,'')).toThrow(/seating connections/);
 expect(()=>connectVehicleCrew(next,'ship','pilot','P-passenger')).toThrow(/owner/);
});
it('refuses invalid AI seating without changing the original generated or manual source',()=>{
 const doc=structuredClone(base);doc.gameMode='campaign';doc.placements=[{...doc.placements[0],id:'ship',tagClass:'vehi',nativeName:'extraction_spirit'}];doc.campaignEncounters=[{name:'crew',actorPath:'characters/elite/elite',position:[0,0,0],startActive:false,count:2,spacing:1,difficulty:{normal:2,insane:2}}];
 const before=JSON.stringify(doc);
 for(const seat of ['', ' ', '\n', '"driver"', 'x'.repeat(32)])expect(()=>connectVehicleCrew(doc,'ship','crew',seat)).toThrow();
 expect(()=>connectVehicleCrew(doc,'missing','crew','driver')).toThrow();expect(()=>connectVehicleCrew(doc,'ship','missing','driver')).toThrow();expect(()=>connectVehicleCrew(doc,'ship','crew','driver',{kind:'enter',triggerId:'missing'})).toThrow();
 expect(JSON.stringify(doc)).toBe(before);doc.campaignEncounters[0].difficulty!.normal=0;expect(()=>connectVehicleCrew(doc,'ship','crew','driver')).toThrow(/every difficulty/);doc.campaignEncounters[0].difficulty!.normal=2;
 doc.logic={schemaVersion:1,triggers:[],devices:[],rules:[],manualSource:'; owned source'};expect(()=>connectVehicleCrew(doc,'ship','crew','driver')).toThrow(/manual/);expect(doc.logic.manualSource).toBe('; owned source');
});
