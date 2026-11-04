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
  logic.devices = logic.devices.filter((d) => d.placementId !== toId);
  logic.devices.push({ ...binding, placementId: toId });
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
  return node?.type === 'trigger' || (node?.type === 'placement' && node.value.tagClass === 'mach');
}
