import {describe,expect,it} from 'vitest';
import {validSparkEmblemPicture} from './sparkEmblemCache';
describe('owned monitor portrait cache',()=>{
 it('reuses only a versioned PNG from the exact owned source, tag and resource pins',()=>{
  const hash='a'.repeat(64),picture={version:1,sourceHash:hash,tagId:42,resources:'pinned-originals',png:'data:image/png;base64,iVBORw0KGgoAAA'};
  expect(validSparkEmblemPicture(picture,hash,42,'pinned-originals')).toBe(true);
  for(const changed of [{version:0},{sourceHash:'b'.repeat(64)},{tagId:43},{resources:'new-pins'},{png:'https://example.invalid/image.png'},{png:'data:image/svg+xml,anything'},{png:'data:image/png;base64,iVBORw0KGgo'+'A'.repeat(180000)}])
   expect(validSparkEmblemPicture({...picture,...changed},hash,42,'pinned-originals')).toBe(false);
 });
});
