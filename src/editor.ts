import type { Project, Tag, TagField, TagReference, Vec3 } from './types';
export interface HistoryState {
  current: Project | null;
  past: Project[];
  future: Project[];
  dirty: boolean;
}
export type HistoryAction =
  | { type: 'load'; project: Project }
  | { type: 'edit'; project: Project; description: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'saved' }
  | { type: 'builds'; project: Project };
export const initialHistory: HistoryState = { current: null, past: [], future: [], dirty: false };
export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === 'load') return { current: action.project, past: [], future: [], dirty: false };
  if (action.type === 'saved') return { ...state, dirty: false };
  if (!state.current) return state;
  if (action.type === 'edit') {
    const p = {
      ...action.project,
      modifiedAt: new Date().toISOString(),
      history: [
        ...action.project.history,
        { id: crypto.randomUUID(), timestamp: new Date().toISOString(), description: action.description },
      ].slice(-2000),
    };
    return { current: p, past: [...state.past, state.current].slice(-100), future: [], dirty: true };
  }
  if (action.type === 'undo' && state.past.length)
    return {
      current: state.past.at(-1)!,
      past: state.past.slice(0, -1),
      future: [state.current, ...state.future],
      dirty: true,
    };
  if (action.type === 'redo' && state.future.length)
    return {
      current: state.future[0],
      past: [...state.past, state.current],
      future: state.future.slice(1),
      dirty: true,
    };
  if (action.type === 'builds' && action.project.id === state.current.id) {
    const merge = (p: Project) => ({ ...p, builds: action.project.builds });
    return {
      ...state,
      current: merge(state.current),
      past: state.past.map(merge),
      future: state.future.map(merge),
    };
  }
  return state;
}
export function fieldValue(project: Project, tag: Tag, field: TagField): number {
  return project.tagEdits.find((e) => e.tagId === tag.id && e.fieldKey === field.key)?.value ?? field.value;
}
export function effectiveReferenceId(project: Project, tag: Tag, reference: TagReference): number {
  const field = tag.fields.find((f) => f.kind === 'reference' && f.offset === reference.offset);
  return field ? fieldValue(project, tag, field) : reference.targetId;
}
export function setTagValue(project: Project, tag: Tag, field: TagField, value: number): Project {
  if (!Number.isFinite(value) || value < field.min || value > field.max)
    throw new Error(`${field.label} must be between ${field.min} and ${field.max}`);
  const edits = project.tagEdits.filter((e) => e.tagId !== tag.id || e.fieldKey !== field.key);
  if (value !== field.value) edits.push({ tagId: tag.id, fieldKey: field.key, value });
  return { ...project, tagEdits: edits };
}
export function replaceVector(vector: Vec3, index: number, value: number): Vec3 {
  const copy = [...vector] as Vec3;
  if (!Number.isFinite(value) || Math.abs(value) > 1e6)
    throw new Error('Transform must be finite and within one million units');
  copy[index] = value;
  return copy;
}
export const shortPath = (path: string) => path.split(/[\\/]/).at(-1) ?? path;
export const classNames: Record<string, string> = {
  weap: 'Weapon',
  proj: 'Projectile',
  scnr: 'Scenario',
  sbsp: 'Structure BSP',
  bitm: 'Bitmap',
  'snd!': 'Sound',
  bipd: 'Biped',
  vehi: 'Vehicle',
  scen: 'Scenery',
  antr: 'Animation graph',
  mod2: 'Model',
  senv: 'Environment shader',
  soso: 'Model shader',
  matg: 'Globals',
  actv: 'Actor variant',
  coll: 'Collision model',
  eqip: 'Equipment',
  jpt: 'Damage effect',
};
export const formatNumber = (n: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
export function thumbnail(mesh: { positions: number[]; indices: number[] }): string | null {
  if (!mesh.positions.length) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 320;
  const c = canvas.getContext('2d');
  if (!c) return null;
  const p = mesh.positions;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    minX = Math.min(minX, p[i]);
    maxX = Math.max(maxX, p[i]);
    minY = Math.min(minY, p[i + 1]);
    maxY = Math.max(maxY, p[i + 1]);
  }
  c.fillStyle = '#0e1921';
  c.fillRect(0, 0, 640, 320);
  c.strokeStyle = '#66cbb05c';
  c.lineWidth = 0.6;
  const s = Math.min(590 / (maxX - minX || 1), 275 / (maxY - minY || 1));
  const ox = (640 - (maxX - minX) * s) / 2,
    oy = (320 - (maxY - minY) * s) / 2;
  const step = Math.max(3, Math.ceil(mesh.indices.length / 18000 / 3) * 3);
  for (let i = 0; i < mesh.indices.length; i += step) {
    c.beginPath();
    for (let j = 0; j < 3; j++) {
      const v = mesh.indices[i + j] * 3;
      const x = (p[v] - minX) * s + ox,
        y = 320 - ((p[v + 1] - minY) * s + oy);
      if (j === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.stroke();
  }
  return canvas.toDataURL('image/png');
}
