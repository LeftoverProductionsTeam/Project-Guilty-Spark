import {describe,expect,it} from 'vitest';
import {textureResourceScope} from './textureResourceScope';
import type {Project} from './types';
const source:NonNullable<Project['source']>={originalPath:'C:/map.map',preservedPath:'C:/library/source.map',sha256:'map',cacheVersion:13,engine:'mcc',scenarioPath:'test',resourceDirectory:'C:/resources',resourceSha256:{'mcc-textures':'same-primary','mcc-shared-bitmaps.map':'old-secondary'}};
describe('texture retry and preview identity',()=>{
  it('retries after a secondary resource pin or same-hash location changes',()=>{
    const original=textureResourceScope(source);
    expect(textureResourceScope({...source,resourceSha256:{...source.resourceSha256,'mcc-shared-bitmaps.map':'new-secondary'}})).not.toBe(original);
    expect(textureResourceScope({...source,resourceDirectory:'D:/recovered'})).not.toBe(original);
  });
  it('normalizes pin order and leaves unrelated editing metadata out of the cache identity',()=>{
    expect(textureResourceScope({...source,resourceSha256:{'mcc-shared-bitmaps.map':'old-secondary','mcc-textures':'same-primary'}})).toBe(textureResourceScope(source));
    expect(textureResourceScope({...source,originalPath:'D:/relocated-original.map'})).toBe(textureResourceScope(source));
    expect(textureResourceScope({...source,sha256:'other-map'})).not.toBe(textureResourceScope(source));
    expect(textureResourceScope(null)).toBe('');
  });
});
