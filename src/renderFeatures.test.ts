import {describe,it,expect} from 'vitest';
import {DEFAULT_RENDER_FEATURES,renderFeatures,validRenderFeatures} from './renderFeatures';
describe('saved renderer extensions',()=>{
  it('keeps old projects on authored source appearance',()=>{expect(renderFeatures(undefined).enabled).toBe(false);expect(renderFeatures(null)).toEqual(DEFAULT_RENDER_FEATURES);expect(validRenderFeatures({...DEFAULT_RENDER_FEATURES})).toBe(true);});
  it('rejects nonfinite, excessive and unknown imported settings',()=>{for(const p of [{...DEFAULT_RENDER_FEATURES,exposureEv:Infinity},{...DEFAULT_RENDER_FEATURES,normalStrength:-1},{...DEFAULT_RENDER_FEATURES,quality:'unbounded'},{...DEFAULT_RENDER_FEATURES,unknown:true}])expect(validRenderFeatures(p)).toBe(false);});
});
