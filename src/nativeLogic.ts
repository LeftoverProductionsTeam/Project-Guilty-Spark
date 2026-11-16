import type { ForgeNode, QuickForgeDocument } from './forge';
import type { Vec3 } from './types';

export interface LogicTrigger {
  /** Optional authoring binding written to the standard scenario name. */
  nativeName?: string;
  id: string;
  name: string;
  position: Vec3;
  rotation: Vec3;
  dimensions: Vec3;
  visible: boolean;
  locked: boolean;
}
export type LogicEvent = { kind: 'enter' | 'exit'; triggerId: string } | { kind: 'timer'; seconds: number };
export type LogicAction =
  | { kind: 'devicePosition' | 'devicePower'; targetId: string; value: number }
  | { kind: 'delay'; seconds: number };
export interface LogicRule {
  id: string;
  name: string;
  enabled: boolean;
  once: boolean;
  event: LogicEvent;
  actions: LogicAction[];
  condition?: { targetId: string; atLeast: number } | null;
}
export interface NativeLogicDocument {
  schemaVersion: 1;
  triggers: LogicTrigger[];
  devices: { placementId: string; initialPosition: number; powered: boolean; nativeName?: string }[];
  rules: LogicRule[];
  manualSource?: string | null;
  handwrittenSources?: { filename: string; content: string }[];
}
export interface NativeLogicSource {
  filename: string;
  content: string;
  sha256: string;
  manual: boolean;
  regions: { ruleId: string; name: string; nativeName: string; firstLine: number; lastLine: number }[];
}
export function logicDocument(doc: QuickForgeDocument): NativeLogicDocument {
  return structuredClone(doc.logic ?? { schemaVersion: 1, triggers: [], devices: [], rules: [] });
}
/** Explicit native binding. Display names/UUIDs and handwritten source stay intact.
 * Blank restores the existing generated name; a copied object needs its own binding.
 */
export function setNativeLogicName(doc:QuickForgeDocument,node:ForgeNode,name:string):QuickForgeDocument {
  const logic=logicDocument(doc),value=name.trim();
  if(logic.manualSource!=null)throw Error('Return to generated logic before changing native names. Keep handwritten source separately.');
  if(value&&(!/^[a-z][a-z0-9_]{0,30}$/.test(value)||value.startsWith('gs_')))
    throw Error('Use 1–31 lowercase letters, digits or underscores, starting with a letter. gs_ is reserved for generated names.');
  const trigger=node.type==='trigger'?logic.triggers.find(t=>t.id===node.value.id):undefined;
  const vehicle=node.type==='placement'?doc.placements.find(p=>p.id===node.value.id&&p.tagClass==='vehi'):undefined;
  if(vehicle&&value&&(doc.native||!['campaign','firefight','zombie'].includes(doc.gameMode)))throw Error('Vehicle script names require editable solo source. Multiplayer collections and recovered BSP recipes keep their own native source workflow.');
  const device=node.type==='placement'?doc.placements.find(p=>p.id===node.value.id&&['mach','ctrl'].includes(p.tagClass)):undefined;
  if(!trigger&&!device&&!vehicle)throw Error('Select an existing native trigger, door, control terminal or solo vehicle.');
  if((trigger??device??vehicle)!.locked)throw Error('Unlock this object before changing its native name.');
  const existing=vehicle?.nativeName??trigger?.nativeName??logic.devices.find(d=>d.placementId===device?.id)?.nativeName;
  if(value===(existing??''))return doc;
  if(value&&[...logic.triggers.filter(t=>t.id!==trigger?.id).map(t=>t.nativeName),
      ...logic.devices.filter(d=>d.placementId!==device?.id).map(d=>d.nativeName),
      ...doc.placements.filter(p=>p.id!==vehicle?.id).map(p=>p.nativeName)].includes(value))
    throw Error('Another object already uses this native name. Choose a unique binding.');
  if(vehicle){
    if(value&&!existing&&logic.devices.length+doc.placements.filter(p=>p.nativeName).length>=512)throw Error('Native scenario object name limit512 reached.');
    return {...doc,logic,placements:doc.placements.map(p=>{if(p.id!==vehicle.id)return p;const copy={...p};if(value)copy.nativeName=value;else delete copy.nativeName;return copy;})};
  }
  if(trigger) {
    if(value)trigger.nativeName=value;else delete trigger.nativeName;
  } else {
    let binding=logic.devices.find(d=>d.placementId===device!.id);
    if(!binding) {
      if(!value)return doc;
      if(device!.tagClass!=='ctrl')throw Error('Connect this door to its trigger first. Naming alone must not change automatic door behavior.');
      if(logic.devices.length>=64)throw Error('The native device binding budget is full.');
      binding={placementId:device!.id,initialPosition:0,powered:true};logic.devices.push(binding);
    }
    if(value)binding.nativeName=value;else delete binding.nativeName;
  }
  return {...doc,logic};
}

/** Authoring-space review only. Native collision, use distance, source tags and
 * actual runtime admission still need independent native/game verification. */
export function extractionLayout(doc:QuickForgeDocument,options:{activationPowered?:boolean}={}) {
  const logic=doc.logic,issues:{message:string;objectId?:string}[]=[];
  const terminal=(name:string,label:string,requiredPower=true)=>{
    const bindings=logic?.devices.filter(d=>d.nativeName===name)??[];
    const placements=bindings.flatMap(d=>doc.placements.filter(p=>p.id===d.placementId));
    const value=bindings.length===1&&placements.length===1&&placements[0].tagClass==='ctrl'?placements[0]:undefined;
    if(!value)issues.push({message:label+' needs one named native control terminal.',objectId:placements[0]?.id});
    else if(bindings[0].powered!==requiredPower)issues.push({message:label+(requiredPower?' has startup power turned off.':' must start unpowered so mission objectives gate evacuation.'),objectId:value.id});
    return value;
  };
  const zone=(name:string,label:string)=>{
    const values=logic?.triggers.filter(t=>t.nativeName===name)??[];
    if(values.length!==1)issues.push({message:label+' needs one named trigger volume.',objectId:values[0]?.id});
    return values.length===1?values[0]:undefined;
  };
  const deploy=terminal('extraction_deploy','Deployment'),activate=terminal('extraction_activate','Activation',options.activationPowered??true);
  const activation=zone('extraction_zone','Activation area'),returnZone=zone('extraction_return','Safe return area');
  const inside=(point:Vec3,volume:LogicTrigger)=>{
    if(point.some(v=>!Number.isFinite(v))||volume.position.some(v=>!Number.isFinite(v))||
      volume.rotation.some(v=>!Number.isFinite(v))||volume.dimensions.some(v=>!Number.isFinite(v)||v<=0)||
      Math.abs(volume.rotation[0])>1e-5||Math.abs(volume.rotation[1])>1e-5)return false;
    const dx=point[0]-volume.position[0],dy=point[1]-volume.position[1],yaw=volume.rotation[2];
    return [dx*Math.cos(yaw)+dy*Math.sin(yaw),-dx*Math.sin(yaw)+dy*Math.cos(yaw),point[2]-volume.position[2]]
      .every((v,i)=>Math.abs(v)<=volume.dimensions[i]/2+1e-5);
  };
  if(deploy&&returnZone&&!inside(deploy.position,returnZone))
    issues.push({message:'Deployment terminal origin is outside the safe return volume.',objectId:deploy.id});
  if(deploy&&activation&&inside(deploy.position,activation))
    issues.push({message:'Deployment terminal must be outside the activation volume.',objectId:deploy.id});
  if(activate&&activation&&!inside(activate.position,activation))
    issues.push({message:'Activation terminal origin is outside its activation volume.',objectId:activate.id});
  if(returnZone&&activation) {
    const c=Math.cos(returnZone.rotation[2]),s=Math.sin(returnZone.rotation[2]);
    const corners=[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>[
      returnZone.position[0]+c*x*returnZone.dimensions[0]/2-s*y*returnZone.dimensions[1]/2,
      returnZone.position[1]+s*x*returnZone.dimensions[0]/2+c*y*returnZone.dimensions[1]/2,
      returnZone.position[2]+z*returnZone.dimensions[2]/2,
    ] as Vec3)));
    if(corners.every(p=>inside(p,activation)))
      issues.push({message:'The return volume is entirely inside activation; Forerunner requires a return outside activation.',objectId:returnZone.id});
    // Every authored start is emitted into the native scenario, including hidden
    // rows. Forerunner's solo fallback can select starts with multiplayer modes;
    // neither visibility nor team/game-mode metadata proves a row unreachable.
    if(!doc.spawns.length)issues.push({message:'Author at least one player start inside the safe hub and outside activation.',objectId:returnZone.id});
    for(const spawn of doc.spawns){
      if(!inside(spawn.position,returnZone))issues.push({message:'Player start '+(spawn.name||spawn.id)+' is outside the safe hub return volume.',objectId:spawn.id});
      if(inside(spawn.position,activation))issues.push({message:'Player start '+(spawn.name||spawn.id)+' is inside activation; move it into the safe hub outside activation.',objectId:spawn.id});
    }
  }
  if(logic?.manualSource!=null)issues.push({message:'Handwritten HaloScript owns startup behavior; metadata power settings need native review.'});
  if(!['haloCustomEdition','chupathingyCe'].includes(doc.runtimeId))
    issues.push({message:'The current Forerunner authoring handoff needs a standard Custom Edition build target. Other source formats require explicit conversion.'});
  if(doc.gameMode==='campaign') {
    if(!doc.startingProfile)issues.push({message:'Choose Campaign starting loadout in Map properties before building solo source.'});
    if(logic?.handwrittenSources?.some(source=>source.filename.toLowerCase()==='gs_firefight.hsc'))
      issues.push({message:'A survival HaloScript module is still present. Review and remove it explicitly before building independent Extraction source.'});
  } else if(!['firefight','zombie'].includes(doc.gameMode))
    issues.push({message:'This source exports multiplayer. In Map properties, choose Campaign / scripted solo for standard solo Extraction content.'});
  else issues.push({message:'This solo route includes survival authoring. An independent Extraction campaign must not start a second Firefight controller.'});
  const bindings=[deploy,activate,activation,returnZone].filter(Boolean).length;
  const present=[...(logic?.devices??[]),...(logic?.triggers??[])].some(t=>t.nativeName?.startsWith('extraction_'));
  const playerStarts={total:doc.spawns.length,safe:returnZone&&activation
    ?doc.spawns.filter(spawn=>inside(spawn.position,returnZone)&&!inside(spawn.position,activation)).length:null};
  return {present,bindings,deploy,activate,activation,returnZone,playerStarts,issues};
}

/** Create just the missing standard volume, through the existing authoring
 * helper/history path. Never move terminals, replace zones, teleport or add AI. */
export function addExtractionZone(doc:QuickForgeDocument,role:'activation'|'return') {
  const logic=logicDocument(doc),name=role==='activation'?'extraction_zone':'extraction_return';
  const matches=logic.triggers.filter(t=>t.nativeName===name);
  if(matches.length>1)throw Error('Resolve duplicate native volume names before editing this setup.');
  if(matches.length)return {document:doc,id:matches[0].id};
  const terminalName=role==='activation'?'extraction_activate':'extraction_deploy';
  const bindings=logic.devices.filter(d=>d.nativeName===terminalName);
  const terminal=bindings.length===1?doc.placements.find(p=>p.id===bindings[0].placementId&&p.tagClass==='ctrl'):undefined;
  if(!terminal)throw Error('Place a control terminal and choose its native Extraction role first.');
  if(logic.triggers.length>=64)throw Error('The native trigger-volume budget is full.');
  const added=addLogicTrigger(doc,[terminal.position[0],terminal.position[1],terminal.position[2]+1.5]);
  const trigger=added.document.logic!.triggers.find(t=>t.id===added.id)!;
  trigger.name=role==='activation'?'Extraction activation area':'Extraction safe return area';
  trigger.dimensions=[6,6,4];trigger.rotation=[0,0,terminal.rotation[2]];
  return {document:setNativeLogicName(added.document,{type:'trigger',value:trigger},name),id:added.id};
}

export function addLogicTrigger(
  doc: QuickForgeDocument,
  position: Vec3,
): { document: QuickForgeDocument; id: string } {
  const logic = logicDocument(doc),
    id = crypto.randomUUID();
  logic.triggers.push({
    id,
    name: `Trigger ${logic.triggers.length + 1}`,
    position: [...position],
    rotation: [0, 0, 0],
    dimensions: [3, 3, 3],
    visible: true,
    locked: false,
  });
  return { document: { ...doc, logic }, id };
}
/** Reusable parameterized behavior template; its bindings are instance IDs,
 * never extra fields in a device tag or native binary patches. */
export function connectDoor(
  doc: QuickForgeDocument,
  triggerId: string,
  targetId: string,
  kind: 'enter' | 'exit' = 'enter',
  position = 1,
): QuickForgeDocument {
  const logic = logicDocument(doc);
  if (logic.manualSource != null)
    throw Error(
      'Visual logic is paused while its generated source is overridden. Keep that source, or explicitly return to generated HaloScript before changing connections.',
    );
  if (
    !logic.triggers.some((t) => t.id === triggerId) ||
    !doc.placements.some((p) => p.id === targetId && p.tagClass === 'mach')
  )
    throw Error('Choose an existing trigger volume and a device-machine placement.');
  if (!Number.isFinite(position) || position < 0 || position > 1)
    throw Error('Device position must be between closed (0) and open (1).');
  if (!logic.devices.some((d) => d.placementId === targetId))
    logic.devices.push({ placementId: targetId, initialPosition: 0, powered: true });
  logic.rules.push({
    id: crypto.randomUUID(),
    name: `${kind === 'enter' ? 'Enter' : 'Leave'} → ${position === 1 ? 'open' : 'close'} door`,
    enabled: true,
    once: false,
    event: { kind, triggerId },
    actions: [{ kind: 'devicePosition', targetId, value: position }],
  });
  return { ...doc, logic };
}
/** Explicit template reuse. Clone the complete self-contained behavior with
 * new trigger/rule identities; never share hidden bindings between instances. */
export function copyDeviceBehavior(
  doc: QuickForgeDocument,
  fromId: string,
  toId: string,
): { document: QuickForgeDocument; triggerIds: string[] } {
  const logic = logicDocument(doc);
  if (logic.manualSource != null)
    throw Error(
      'Behavior copying requires generated logic. Handwritten source cannot be safely rebound automatically.',
    );
  const from = doc.placements.find((p) => p.id === fromId && p.tagClass === 'mach');
  const to = doc.placements.find((p) => p.id === toId && p.tagClass === 'mach');
  const binding = logic.devices.find((d) => d.placementId === fromId);
  if (!from || !to || fromId === toId || !binding)
    throw Error('Choose two different placed devices and a source with configured behavior.');
  if (to.locked) throw Error('Unlock the destination device before copying its behavior.');
  if ([from, to].some((p) => Math.abs(p.rotation[0]) > 0.00001 || Math.abs(p.rotation[1]) > 0.00001))
    throw Error(
      'Automatic trigger copying currently supports yaw-only devices. Rebind tilted devices manually.',
    );
  const related = (r: LogicRule, id: string) =>
    r.actions.some((a) => a.kind !== 'delay' && a.targetId === id) || r.condition?.targetId === id;
  const rules = logic.rules.filter((r) => related(r, fromId));
  if (!rules.length) throw Error('The source device has no behavior to copy.');
  if (logic.rules.some((r) => related(r, toId)))
    throw Error('The destination already has behavior. Its existing connections were preserved.');
  if (
    rules.some(
      (r) =>
        r.actions.some((a) => a.kind !== 'delay' && a.targetId !== fromId) ||
        (r.condition && r.condition.targetId !== fromId),
    )
  )
    throw Error(
      'This setup controls another device. Copying it requires explicit rebinding; no connection was dropped.',
    );
  const ids = new Set(rules.flatMap((r) => (r.event.kind === 'timer' ? [] : [r.event.triggerId])));
  const sourceTriggers = [...ids].map((id) => logic.triggers.find((t) => t.id === id));
  if (sourceTriggers.some((t) => !t)) throw Error('A source trigger is missing; repair it before copying.');
  if (
    logic.triggers.length + ids.size > 64 ||
    logic.rules.length + rules.length > 32 ||
    (!logic.devices.some((d) => d.placementId === toId) && logic.devices.length >= 64)
  )
    throw Error('Copying this setup would exceed the supported native logic budget.');
  const remap = new Map<string, string>();
  const angle = to.rotation[2] - from.rotation[2],
    c = Math.cos(angle),
    s = Math.sin(angle);
  for (const trigger of sourceTriggers) {
    const t = trigger!;
    const id = crypto.randomUUID(),
      x = t.position[0] - from.position[0],
      y = t.position[1] - from.position[1];
    remap.set(t.id, id);
    logic.triggers.push({
      ...structuredClone(t),
      nativeName: undefined,
      id,
      name: `${t.name} · ${to.name}`.slice(0, 160),
      position: [
        to.position[0] + c * x - s * y,
        to.position[1] + s * x + c * y,
        to.position[2] + t.position[2] - from.position[2],
      ],
      rotation: [0, 0, Math.atan2(Math.sin(t.rotation[2] + angle), Math.cos(t.rotation[2] + angle))],
      locked: false,
    });
  }
  const targetNativeName=logic.devices.find(d=>d.placementId===toId)?.nativeName;
  logic.devices = logic.devices.filter((d) => d.placementId !== toId);
  logic.devices.push({ ...binding, nativeName: targetNativeName, placementId: toId });
  for (const rule of rules)
    logic.rules.push({
      ...structuredClone(rule),
      id: crypto.randomUUID(),
      name: `${rule.name} · ${to.name}`.slice(0, 160),
      event:
        rule.event.kind === 'timer'
          ? { ...rule.event }
          : { ...rule.event, triggerId: remap.get(rule.event.triggerId)! },
      actions: rule.actions.map((a) => (a.kind === 'delay' ? { ...a } : { ...a, targetId: toId })),
      condition: rule.condition ? { ...rule.condition, targetId: toId } : undefined,
    });
  return { document: { ...doc, logic }, triggerIds: [...remap.values()] };
}
/** Import exact source text, without stripping comments, BOMs or line endings.
 * The file picker checks bytes before decoding; native compilation owns syntax. */
export function addHandwrittenSource(
  doc: QuickForgeDocument,
  filename: string,
  content: string,
): QuickForgeDocument {
  const logic = logicDocument(doc),
    modules = logic.handwrittenSources ?? [];
  const stem = filename.endsWith('.hsc') ? filename.slice(0, -4) : '';
  if (
    !stem.length ||
    stem.length > 31 ||
    /[\x00-\x1f\x7f-\uffff<>:"/\\|?*]/.test(filename) ||
    /^(gs_logic|global_scripts)\.hsc$/i.test(filename) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)
  )
    throw Error(
      'Use a plain ASCII .hsc filename with a native name of 1–31 characters. Generated names and Windows device names are reserved.',
    );
  if (modules.some((m) => m.filename.toLowerCase() === filename.toLowerCase()))
    throw Error('That source filename already exists; its original text was preserved.');
  const sourceLimit = doc.runtimeId === 'mccSteam' ? 1024 * 1024 : 256 * 1024;
  const moduleLimit = doc.runtimeId === 'mccSteam' ? 14 : 7;
  if (
    modules.length >= moduleLimit ||
    !content.length ||
    content.length > sourceLimit ||
    /[^\x01-\x7f]/.test(content)
  )
    throw Error(
      `Import ASCII HaloScript within ${sourceLimit / 1024} KiB, with at most ${moduleLimit} additional modules for this target. Global sources also count toward native limits.`,
    );
  logic.handwrittenSources = [...modules, { filename, content }];
  return { ...doc, logic };
}
export function centerDoorTrigger(
  doc: QuickForgeDocument,
  triggerId: string,
  targetId: string,
): QuickForgeDocument {
  const logic = logicDocument(doc),
    trigger = logic.triggers.find((t) => t.id === triggerId),
    door = doc.placements.find((p) => p.id === targetId && p.tagClass === 'mach');
  if (!trigger || !door) throw Error('Choose an existing trigger and door first.');
  if (trigger.locked) throw Error('Unlock the trigger before centering it.');
  trigger.position = [door.position[0], door.position[1], door.position[2] + 1.5];
  trigger.rotation = [0, 0, door.rotation[2]];
  trigger.dimensions = [6, 3, 3];
  return { ...doc, logic };
}
export function removeLogicReferences(
  doc: QuickForgeDocument,
  removed: Set<string>,
): NativeLogicDocument | undefined {
  if (!doc.logic) return undefined;
  return {
    ...doc.logic,
    triggers: doc.logic.triggers.filter((t) => !removed.has(t.id)),
    devices: doc.logic.devices.filter((d) => !removed.has(d.placementId)),
    rules: doc.logic.rules.filter(
      (r) =>
        !(r.event.kind !== 'timer' && removed.has(r.event.triggerId)) &&
        !r.actions.some((a) => a.kind !== 'delay' && removed.has(a.targetId)) &&
        !(r.condition && removed.has(r.condition.targetId)),
    ),
  };
}
export function isLogicTarget(node: ForgeNode | null): boolean {
  return node?.type === 'trigger' || (node?.type === 'placement' && ['mach','ctrl','vehi'].includes(node.value.tagClass));
}
