import {describe,it,expect} from 'vitest';
import {DoubleSide} from 'three';
import {createChromaMaterial,isChromaSubject} from './chromaKey';
describe('capture-only greenscreen',()=>{
  it('preserves only actual weapons, vehicles, bipeds and player representations',()=>{
    for(const group of ['weap','vehi','bipd'])expect(isChromaSubject(group,'Scenery')).toBe(true);
    for(const group of ['scen','eqip','mach','sbsp'])expect(isChromaSubject(group,'Vehicle')).toBe(false);
    expect(isChromaSubject(undefined,'Player spawn')).toBe(true);
    expect(isChromaSubject('scen','warthog')).toBe(false);
    expect(isChromaSubject('itmc','Netgame item',[{class:'weap'}])).toBe(true);
    expect(isChromaSubject('itmc','Netgame item',[{class:'eqip'},{class:'weap'}])).toBe(false);
  });
  it('writes real geometry depth with exact unlit green without tinting native materials',()=>{
    const matte=createChromaMaterial();expect(matte.color.getHexString()).toBe('00ff00');expect(matte.depthTest).toBe(true);expect(matte.depthWrite).toBe(true);expect(matte.transparent).toBe(false);expect(matte.side).toBe(DoubleSide);expect(matte.toneMapped).toBe(false);expect(matte.fog).toBe(false);matte.dispose();
  });
});
