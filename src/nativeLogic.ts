import type { ForgeNode, QuickForgeDocument } from './forge';
import type { Vec3 } from './types';

export interface LogicTrigger {
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
  devices: { placementId: string; initialPosition: number; powered: boolean }[];
  rules: LogicRule[];
  manualSource?: string | null;
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
export function centerDoorTrigger(doc:QuickForgeDocument,triggerId:string,targetId:string):QuickForgeDocument {
  const logic=logicDocument(doc),trigger=logic.triggers.find(t=>t.id===triggerId),door=doc.placements.find(p=>p.id===targetId&&p.tagClass==='mach');
  if(!trigger||!door)throw Error('Choose an existing trigger and door first.');
  if(trigger.locked)throw Error('Unlock the trigger before centering it.');
  trigger.position=[door.position[0],door.position[1],door.position[2]+1.5];
  trigger.rotation=[0,0,door.rotation[2]];
  trigger.dimensions=[6,3,3];
  return {...doc,logic};
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
  return node?.type === 'trigger' || (node?.type === 'placement' && node.value.tagClass === 'mach');
}
