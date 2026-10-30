import { describe, expect, it } from 'vitest';
import { studioDifferences } from './studioClient';
import type { QuickForgeDocument } from './forge';
const base: QuickForgeDocument = {
  schemaVersion: 1,
  name: 'shared',
  template: 'emptyArena',
  runtimeId: 'mccSteam',
  gameMode: 'slayer',
  skyPath: null,
  buildQuality: 'draft',
  geometry: [],
  materials: [],
  placements: [],
  spawns: [],
  objectives: [],
};
describe('shared conflict review', () => {
  it('explains semantic field and publication conflicts without dumping tag bytes',()=>{
    const mine=structuredClone(base),shared=structuredClone(base);
    mine.native={source:{inventorySha256:'a'.repeat(64),fieldTag:'weapons/pistol/pistol.weapon',fieldTagSha256:'b'.repeat(64),boundingRadius:.1,templateTag:'boulder.scenery',templateSha256:'c'.repeat(64),dependencies:{},previewSha256:'d'.repeat(64),previewTagId:1,previewTagPath:'boulder'},fields:[{id:'pistolBoundingRadius',boundingRadius:.3}],assets:[{id:'asset',name:'Rock',sha256:'c'.repeat(64),bytes:Array(632).fill(0)}]};
    shared.native=structuredClone(mine.native);shared.native.fields[0].boundingRadius=.4;shared.native.assets=[];
    const rows=studioDifferences(mine,shared);
    expect(rows).toHaveLength(2);expect(rows[0]).toMatchObject({mine:'0.3',shared:'0.4'});expect(rows[1]).toMatchObject({shared:'Not published'});expect(JSON.stringify(rows).length).toBeLessThan(400);
  });
  it('shows remote additions, local deletions and scalar differences', () => {
    const shared = structuredClone(base);
    shared.name = 'other revision';
    shared.spawns.push({
      id: 'spawn',
      name: 'Start',
      position: [0, 0, 1],
      facing: 0,
      team: 0,
      gameModes: ['slayer'],
      visible: true,
      locked: false,
    });
    expect(studioDifferences(base, shared)).toEqual([
      { target: 'spawns/spawn', mine: 'Absent', shared: 'Present' },
      { target: 'name', mine: '"shared"', shared: '"other revision"' },
    ]);
  });
  it('does not report another PCs library identity as a shared conflict', () => {
    const mine = structuredClone(base);
    mine.placements.push({
      id: 'vehicle',
      name: 'Warthog',
      tagClass: 'vehi',
      tagPath: 'vehicles/warthog/mp_warthog',
      tagId: 1,
      sourceSha256: 'a'.repeat(64),
      sourceProjectId: 'local-only',
      position: [0, 0, 1],
      rotation: [0, 0, 0],
      team: 0,
      respawnSeconds: 30,
      visible: true,
      locked: false,
    });
    const shared = structuredClone(mine);
    shared.placements[0].sourceProjectId = null;
    expect(studioDifferences(mine, shared)).toEqual([]);
  });
  it('keeps a large conflict review bounded while retaining the full source separately', () => {
    const shared = structuredClone(base);
    shared.spawns = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      name: 'Start',
      position: [i, 0, 1],
      facing: 0,
      team: 0,
      gameModes: ['slayer'],
      visible: true,
      locked: false,
    }));
    expect(studioDifferences(base, shared)).toHaveLength(12);
    expect(shared.spawns).toHaveLength(100);
  });
});
