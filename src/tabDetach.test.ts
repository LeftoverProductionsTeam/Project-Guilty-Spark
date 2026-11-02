import {expect,it} from 'vitest';
import {shouldDetachTab} from './tabDetach';
it('detaches only a deliberate drag outside the strip and preserves clicks and tab navigation',()=>{
  const strip={left:100,right:700,top:0,bottom:34},start={x:170,y:16};
  expect(shouldDetachTab(start,{x:170,y:150},strip)).toBe(true);
  expect(shouldDetachTab(start,{x:-50,y:16},strip)).toBe(true);
  expect(shouldDetachTab(start,{x:180,y:20},strip)).toBe(false);
  expect(shouldDetachTab(start,{x:350,y:18},strip)).toBe(false);
  expect(shouldDetachTab(start,{x:172,y:50},strip)).toBe(false);
});
