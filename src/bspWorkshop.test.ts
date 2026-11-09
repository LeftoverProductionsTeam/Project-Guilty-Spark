import { describe, it, expect } from 'vitest';
import {
  placeWorkshopPrimitive,
  boxBrush,
  clipBrush,
  extrudeFace,
  rampBrush,
  worldVertex,
  workshopPivot,
  localVertex,
  viewAxes,
  snapNumber,
  workshopFromPrimitives,
  workshopSurfaceSelection,
  drawWorkshopShape,
  renameWorkshopBrush,
  moveWorkshopVertices,
  joinWorkshopFaces,
} from './bspWorkshop';
import { beginProjectMutation, projectMutationPending } from './projectMutation';
import { cross, sub, dot } from './bspWorkshop';
import type { BspBrush } from './bspWorkshop';
import type { QuickForgeDocument } from './forge';
function volume(b: BspBrush) {
  return b.faces.reduce(
    (sum, f) =>
      sum +
      f.vertices
        .slice(1, -1)
        .reduce(
          (s, i, j) =>
            s + dot(b.vertices[f.vertices[0]], cross(b.vertices[i], b.vertices[f.vertices[j + 2]])) / 6,
          0,
        ),
    0,
  );
}
function manifold(b: BspBrush) {
  const edges = new Map<string, string[]>();
  for (const f of b.faces)
    for (let i = 0; i < f.vertices.length; i++) {
      const a = f.vertices[i],
        c = f.vertices[(i + 1) % f.vertices.length],
        key = [Math.min(a, c), Math.max(a, c)].join(':');
      edges.set(key, [...(edges.get(key) ?? []), `${a}:${c}`]);
    }
  return [...edges.values()].every((v) => v.length === 2 && v[0] !== v[1]);
}
describe('editable Workshop source', () => {
  it('draws the same named room, corridor and ramp sources available in the demo', () => {
    const source = {schemaVersion: 1 as const, brushes: [], portals: []};
    const a = drawWorkshopShape(source, 'room', [-8, -6, 0], [8, 6, 5], 'm', 'a');
    const b = drawWorkshopShape({...source, brushes: [a]}, 'room', [20, -6, 0], [36, 6, 5], 'm', 'b');
    const corridor = drawWorkshopShape(source, 'corridor', [7, -2, 0], [21, 2, 3], 'm', 'c');
    const ramp = drawWorkshopShape(source, 'ramp', [-3, -3, 0], [3, 1, 1.5], 'm', 'r');
    expect([a.name, b.name, corridor.name, ramp.name]).toEqual(['Room 1', 'Room 2', 'Corridor 1', 'Ramp 1']);
    expect([a.role, b.role, corridor.role, ramp.role]).toEqual(['space', 'space', 'space', 'solid']);
    expect(manifold(ramp)).toBe(true);
    const renamed = renameWorkshopBrush(a, '  Control room  ');
    expect(renamed.name).toBe('Control room'); expect(renamed.id).toBe(a.id); expect(renamed.faces).toEqual(a.faces);
    expect(a.name).toBe('Room 1');
    for (const name of ['', '\n', 'bad\u0000name', '🙂'.repeat(26)]) expect(() => renameWorkshopBrush(a, name)).toThrow();
  });
  it('keeps perspective and orthographic pivots on the same transformed volume or selected face', () => {
    const brush=boxBrush('box','solid',[-2,-3,0],[2,3,4],'metal');
    brush.position=[8,9,10];brush.rotation=[.1,.2,.7];brush.scale=[2,3,4];
    const all=brush.vertices.map(vertex=>worldVertex(brush,vertex));
    expect(workshopPivot(brush)).toEqual(all.reduce((center,p)=>center.map((v,k)=>v+p[k]/all.length) as [number,number,number],[0,0,0] as [number,number,number]));
    const selected=brush.faces[3].vertices,pivot=workshopPivot(brush,selected);
    for(let k=0;k<3;k++)expect(pivot[k]).toBeCloseTo(selected.reduce((sum,index)=>sum+all[index][k]/selected.length,0),8);
    expect(workshopPivot(brush,[...selected,...selected])).toEqual(pivot);
    expect(()=>workshopPivot(brush,[999])).toThrow(/no longer exist/);
  });
  it('moves only the selected source vertices along world axes under rotated nonuniform transforms', () => {
    const b = boxBrush('box', 'space', [-1, -1, 0], [1, 1, 2], 'm');
    b.rotation = [0.1, 0.2, 0.5]; b.scale = [2, 3, 4]; b.position = [5, 6, 7];
    const before = structuredClone(b), selected = b.faces[3].vertices;
    const moved = moveWorkshopVertices(b, selected, [1, -2, 0.5]);
    for (let i = 0; i < b.vertices.length; i++) {
      const a = worldVertex(b, b.vertices[i]), next = worldVertex(moved, moved.vertices[i]);
      next.forEach((value, k) => expect(value - a[k]).toBeCloseTo(selected.includes(i) ? [1, -2, 0.5][k] : 0, 8));
    }
    expect(b).toEqual(before); expect(moved.faces).toEqual(b.faces);
    expect(() => moveWorkshopVertices(b, [999], [1, 0, 0])).toThrow();
    expect(() => moveWorkshopVertices(b, [0], [Infinity, 0, 0])).toThrow();
  });
  it('resolves a clicked evaluated face only against its current source brush', () => {
    const brush = boxBrush('room', 'space', [-2, -2, 0], [2, 2, 3], 'metal');
    const source = {schemaVersion: 1 as const, brushes: [brush], portals: []};
    const pick = {brushId: brush.id, faceId: brush.faces[0].id};
    const selection = workshopSurfaceSelection(source, pick)!;
    expect(selection.vertices).toEqual(brush.faces[0].vertices);
    selection.vertices.reverse();
    expect(selection.vertices).not.toEqual(brush.faces[0].vertices);
    expect(workshopSurfaceSelection(source, {...pick, brushId: 'foreign'})).toBeNull();
    expect(workshopSurfaceSelection(source, {...pick, faceId: 'stale-face'})).toBeNull();
    expect(workshopSurfaceSelection({...source, brushes: []}, pick)).toBeNull();
    expect(workshopSurfaceSelection(undefined, pick)).toBeNull();
    expect(workshopSurfaceSelection(source, null)).toBeNull();
  });
  it('creates a closed box and true triangular ramp with positive solid orientation', () => {
    const b = boxBrush('box', 'space', [-1, -2, 0], [1, 2, 3], 'metal');
    expect(volume(b)).toBe(24);
    expect(manifold(b)).toBe(true);
    const r = rampBrush('ramp', [-1, -2, 0], [1, 2, 3], 'metal');
    expect(volume(r)).toBe(12);
    expect(manifold(r)).toBe(true);
    expect(r.vertices.length).toBe(6);
  });
  it('preserves local/world coordinates under all rotation axes and nonuniform scale', () => {
    const b = boxBrush('b', 'solid', [0, 0, 0], [2, 2, 2], 'm');
    b.position = [4, -8, 7];
    b.rotation = [0.12, -0.3, 0.95];
    b.scale = [0.5, 2, 3];
    const point: [number, number, number] = [0.2, 0.8, 1.3],
      world = worldVertex(b, point);
    localVertex(b, world).forEach((x, k) => expect(x).toBeCloseTo(point[k], 10));
    expect(viewAxes).toEqual({ top: [0, 1, 2], front: [0, 2, 1], side: [1, 2, 0] });
    expect(snapNumber(-1.26, 0.5)).toBe(-1.5);
  });
  it('clips a volume with a real closing face while retaining original face UVs', () => {
    const b = boxBrush('b', 'solid', [-2, -2, -2], [2, 2, 2], 'm');
    b.faces[0].uvScale = [2, 3];
    b.faces[0].uvOffset = [0.2, 0.3];
    b.faces[0].uvRotation = 45;
    const clipped = clipBrush(b, [1, 0, 0], 0, 'cap');
    expect(volume(clipped)).toBeCloseTo(32);
    expect(manifold(clipped)).toBe(true);
    expect(clipped.faces.find((f) => f.id === 'face-0')).toMatchObject({
      uvScale: [2, 3],
      uvOffset: [0.2, 0.3],
      uvRotation: 45,
    });
    expect(clipped.faces.find((f) => f.id === 'cap')).toBeTruthy();
    expect(b.vertices.length).toBe(8);
    expect(() => clipBrush(b, [0, 0, 0], 0, 'cap')).toThrow();
    expect(() => clipBrush(b, [1, 0, 0], 50, 'cap')).toThrow();
    expect(() => clipBrush(b, [1, 0, 0], -50, 'cap')).toThrow();
  });
  it('extrudes the selected polygon into a separate convex source brush', () => {
    const b = boxBrush('b', 'space', [-1, -1, 0], [1, 1, 2], 'm'),
      e = extrudeFace(b, 'face-3', 5, 'extruded');
    expect(volume(e)).toBeCloseTo(20);
    expect(manifold(e)).toBe(true);
    expect(e.vertices.every((v) => v[0] >= 1)).toBe(true);
    expect(e.faces.every((f) => f.materialId === 'm')).toBe(true);
    expect(() => extrudeFace(b, 'missing', 2, 'e')).toThrow();
    expect(() => extrudeFace(b, 'face-3', 0, 'e')).toThrow();
  });
  it('joins matching opposed source walls with a closed overlapping corridor and refuses incompatible seams', () => {
    const a = boxBrush('a', 'space', [-8, -6, 0], [8, 6, 5], 'm');
    const b = boxBrush('b', 'space', [20, -6, 0], [36, 6, 5], 'm');
    a.faces[3].uvScale = [2, 3];
    const before = JSON.stringify([a, b]), corridor = joinWorkshopFaces(a, 'face-3', b, 'face-5', 'c', 'Hallway');
    expect(manifold(corridor)).toBe(true); expect(volume(corridor)).toBeCloseTo(12.25 * 12 * 5);
    expect(Math.min(...corridor.vertices.map(v => v[0]))).toBe(7.875);
    expect(Math.max(...corridor.vertices.map(v => v[0]))).toBe(20.125);
    expect(corridor.worldUv).toBe(true); expect(corridor.faces.every(f => f.uvScale[0] === 2 && f.uvScale[1] === 3)).toBe(true);
    expect(JSON.stringify([a, b])).toBe(before);
    expect(() => joinWorkshopFaces(a, 'face-3', b, 'face-3', 'bad', 'Bad')).toThrow(/parallel/);
    expect(() => joinWorkshopFaces(a, 'face-3', {...b, scale: [1, 0.5, 1]}, 'face-5', 'bad', 'Bad')).toThrow(/matching width/);
    expect(() => joinWorkshopFaces(a, 'face-3', a, 'face-5', 'bad', 'Bad')).toThrow(/different/);
  });
  it('retains pre-existing source rather than accepting unsupported primitive conversion', () => {
    const doc = {
      native: undefined,
      geometry: [
        {
          id: 'a',
          name: 'Terrain',
          kind: 'terrain',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          dimensions: [8, 8, 2],
          materialId: 'm',
          steps: 4,
        },
      ],
      materials: [],
      placements: [],
    } as unknown as QuickForgeDocument;
    const before = JSON.stringify(doc);
    expect(() => workshopFromPrimitives(doc)).toThrow(/separate Workshop/);
    expect(JSON.stringify(doc)).toBe(before);
  });
  it('locks only the affected project until every concurrent local lease releases', () => {
    const a = beginProjectMutation('a'),
      b = beginProjectMutation('a');
    expect(projectMutationPending('a')).toBe(true);
    expect(projectMutationPending('b')).toBe(false);
    a();
    a();
    expect(projectMutationPending('a')).toBe(true);
    b();
    expect(projectMutationPending('a')).toBe(false);
  });
});

it('drop-in Workshop stairs preserve material density, have eight finite solid treads and undo as one source edit',()=>{
  const doc={workshop:{schemaVersion:1,brushes:[boxBrush('room','space',[-12,-12,0],[12,12,8],'metal')],portals:[]},materials:[{id:'metal'}],geometry:[],native:undefined} as unknown as QuickForgeDocument;
  const original=JSON.stringify(doc);const placed=placeWorkshopPrimitive(doc,'stairs',[1,2,0],'metal');
  expect(JSON.stringify(doc)).toBe(original);expect(placed.document.workshop!.brushes).toHaveLength(9);
  const steps=placed.document.workshop!.brushes.slice(1);expect(new Set(steps.map(s=>s.id)).size).toBe(8);
  expect(steps.map(s=>Math.max(...s.vertices.map(v=>worldVertex(s,v)[2])))).toEqual([.27,.52,.77,1.02,1.27,1.52,1.77,2.02]);
  for(const step of steps){expect(step.role).toBe('solid');expect(step.worldUv).toBe(true);expect(step.faces.every(face=>face.materialId==='metal')).toBe(true);expect(volume(step)).toBeGreaterThan(0);}
  for(const kind of ['room','wall','ramp','box'] as const){const next=placeWorkshopPrimitive(doc,kind,[2,3,0],'metal');expect(next.document.workshop!.brushes).toHaveLength(2);expect(next.document.workshop!.brushes[1].role).toBe(kind==='room'?'space':'solid');}
  expect(()=>placeWorkshopPrimitive(doc,'wall',[NaN,0,0],'metal')).toThrow(/position/);
  expect(()=>placeWorkshopPrimitive(doc,'wall',[0,0,0],'missing')).toThrow(/material/);
});

it('Workshop shape placement respects the native64-volume limit without changing prior source',()=>{
  const doc={workshop:{schemaVersion:1,brushes:Array.from({length:56},(_,i)=>boxBrush('room-'+i,'space',[-12,-12,0],[12,12,8],'metal')),portals:[]},materials:[{id:'metal'}],geometry:[]} as unknown as QuickForgeDocument;
  expect(placeWorkshopPrimitive(doc,'stairs',[0,0,0],'metal').document.workshop!.brushes).toHaveLength(64);
  doc.workshop!.brushes.push(boxBrush('extra','space',[-12,-12,0],[12,12,8],'metal'));const before=JSON.stringify(doc);
  expect(()=>placeWorkshopPrimitive(doc,'stairs',[0,0,0],'metal')).toThrow(/64 source volumes/);expect(JSON.stringify(doc)).toBe(before);
});
