import {describe,it,expect} from 'vitest';
import {surfacePages} from './surfacePages';
describe('responsive control pages',()=>{
 it('keeps short surfaces on one page and refuses nonfinite layout values',()=>{expect(surfacePages(80,100,[])).toEqual([0]);expect(surfacePages(Infinity,100,[])).toEqual([0]);expect(surfacePages(100,NaN,[])).toEqual([0]);});
 it('gives every crossing control a complete view without exceeding the content',()=>{const rows=Array.from({length:80},(_,i)=>({top:i*31,bottom:i*31+29}));for(const height of [72,113,235,467]){const pages=surfacePages(2480,height,rows);for(const row of rows)expect(pages.some(at=>row.top>=at-.5&&row.bottom<=at+height+.5)).toBe(true);expect(pages.every(at=>at>=0&&at<=2480-height)).toBe(true);}});
 it('covers staggered controls in neighboring columns and a tall label',()=>{const rows=[{top:4,bottom:74},{top:62,bottom:96},{top:79,bottom:142},{top:130,bottom:200}];const pages=surfacePages(200,100,rows);for(const row of rows)expect(pages.some(at=>row.top>=at&&row.bottom<=at+100)).toBe(true);});
});
