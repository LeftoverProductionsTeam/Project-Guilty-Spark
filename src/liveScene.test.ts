import {describe,it,expect} from 'vitest';
import {matchesLiveMap,runtimeScene} from './liveScene';
import type {LiveStatus} from './components/LiveObjectInspector';
import type {Project,MapInspection} from './types';
const object={datum:123,tagDatum:7,tagPath:'weapons/pistol/pistol',kind:2,position:[1,2,3],forward:[0,1,0],up:[0,0,1],parentDatum:4294967295,scale:2,velocity:[0,0,0],player:false};
const status={pid:1,snapshot:{identity:{scenario:'levels/test/bloodgulch/bloodgulch',checksum:1234,tagCount:1,scenarioDatum:9},objects:[object]}}as LiveStatus;
const project={source:{sha256:'a'}}as Project;
const inspection={sha256:'a',tagChecksum:1234,header:{crc32:9999},scenarioPath:'levels\\test\\bloodgulch\\bloodgulch',tags:[{id:7,path:'weapons/pistol/pistol'}]}as MapInspection;
describe('Live source map binding',()=>{
  it('matches the actual tag checksum rather than the different cache-header CRC',()=>{expect(matchesLiveMap(project,inspection,status)).toBe(true);expect(matchesLiveMap(project,{...inspection,tagChecksum:9999},status)).toBe(false);expect(matchesLiveMap({...project,source:{...project.source!,sha256:'b'}},inspection,status)).toBe(false);});
  it('rejects same-name variants with different tag identities or counts',()=>{expect(matchesLiveMap(project,{...inspection,tags:[{id:7,path:'different/model'}]as never},status)).toBe(false);expect(matchesLiveMap(project,{...inspection,tags:[]},status)).toBe(false);});
  it('keeps game positions, uniform size and source tag models with the correct Z-up orientation',()=>{const scene=runtimeScene(status);expect(scene[0].position).toEqual([1,2,3]);expect(scene[0].rotation[0]).toBeCloseTo(Math.PI/2);expect(scene[0].scale).toEqual([2,2,2]);expect(scene[0].tagId).toBe(7);expect(scene[0].assetId).toBeNull();expect(runtimeScene({...status,snapshot:{...status.snapshot,objects:[{...object,parentDatum:99}as never]}})).toEqual([]);});
});
