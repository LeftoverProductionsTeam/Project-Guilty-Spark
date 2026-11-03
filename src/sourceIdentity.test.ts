import {expect,it} from 'vitest';
import {assertMapSourceIdentity,type MapSourceIdentity} from './sourceIdentity';
import type {Project} from './types';

const project={id:'owned',source:{sha256:'a'.repeat(64),cacheVersion:609,engine:'Halo Custom Edition',originalPath:'D:/CE/maps/test.map',preservedPath:'D:/Spark/source.map',scenarioPath:'levels/test/test',resourceDirectory:'D:/CE/maps',resourceSha256:{'bitmaps.map':'b'.repeat(64)}}} as unknown as Project;
const identity=()=>({schemaVersion:1,projectId:project.id,source:structuredClone(project.source),contract:{cacheVersion:609}} as MapSourceIdentity);
it('binds native replies to the exact preserved source, scenario and resource revision',()=>{
  assertMapSourceIdentity(identity(),project);
  for(const change of [
    (i:MapSourceIdentity)=>{i.projectId='other';},
    (i:MapSourceIdentity)=>{i.source.sha256='c'.repeat(64);},
    (i:MapSourceIdentity)=>{i.source.cacheVersion=13;},
    (i:MapSourceIdentity)=>{i.source.originalPath='D:/MCC/maps/test.map';},
    (i:MapSourceIdentity)=>{i.source.preservedPath='D:/other/source.map';},
    (i:MapSourceIdentity)=>{i.source.scenarioPath='levels/other';},
    (i:MapSourceIdentity)=>{i.source.resourceDirectory='D:/other/maps';},
    (i:MapSourceIdentity)=>{i.source.resourceSha256!['bitmaps.map']='d'.repeat(64);},
    (i:MapSourceIdentity)=>{i.source.audioResources={kind:'mccClassicAdpcm',directory:'D:/MCC/halo1',sha256:{'bank':'e'.repeat(64)}};},
    (i:MapSourceIdentity)=>{i.contract.cacheVersion=5;},
  ]) {const reply=identity();change(reply);expect(()=>assertMapSourceIdentity(reply,project)).toThrow(/different source or resource revision/);}
  const reply=identity();reply.source.scenarioPath='LEVELS\\TEST\\TEST';
  assertMapSourceIdentity(reply,project);
});
