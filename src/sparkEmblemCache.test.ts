import {afterEach,describe,expect,it,vi} from 'vitest';
import {validSparkEmblemPicture,readSparkEmblemPicture,saveSparkEmblemPicture} from './sparkEmblemCache';
afterEach(()=>vi.unstubAllGlobals());
describe('owned monitor portrait cache',()=>{
 it('stores the captured PNG separately and restores it on the next launch of that library',()=>{
  const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
  const picture={version:2 as const,sourceHash:'a'.repeat(64),tagId:42,resources:'pinned-originals',png:'data:image/png;base64,iVBORw0KGgoAAA'};
  expect(saveSparkEmblemPicture('library-a',picture)).toBe(true);
  expect(readSparkEmblemPicture('library-a')).toEqual(picture);expect(readSparkEmblemPicture('library-b')).toBeNull();
  expect([...values.keys()]).toEqual(['guilty-spark-monitor-picture-v3']);
  expect(saveSparkEmblemPicture('library-a',{...picture,tagId:NaN})).toBe(false);
  values.set('guilty-spark-monitor-picture-v3','broken');expect(readSparkEmblemPicture('library-a')).toBeNull();
 });
 it('reuses only a versioned PNG from the exact owned source, tag and resource pins',()=>{
  const hash='a'.repeat(64),picture={version:2,sourceHash:hash,tagId:42,resources:'pinned-originals',png:'data:image/png;base64,iVBORw0KGgoAAA'};
  expect(validSparkEmblemPicture(picture,hash,42,'pinned-originals')).toBe(true);
  for(const changed of [{version:0},{version:1},{sourceHash:'b'.repeat(64)},{tagId:43},{resources:'new-pins'},{png:'https://example.invalid/image.png'},{png:'data:image/svg+xml,anything'},{png:'data:image/png;base64,iVBORw0KGgo'+'A'.repeat(180000)}])
   expect(validSparkEmblemPicture({...picture,...changed},hash,42,'pinned-originals')).toBe(false);
 });
});
