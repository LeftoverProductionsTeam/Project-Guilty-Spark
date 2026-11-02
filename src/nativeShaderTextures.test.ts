import { expect, it } from 'vitest';
import { nativeShaderTextureRole } from './nativeShaderTextures';
it('loads every decoded generic and Chicago layer without accepting fabricated stages',()=>{
  for(const prefix of ['Chicago','Transparent'])for(let index=1;index<=3;index++)
    expect(nativeShaderTextureRole(`${prefix} layer ${index}`)).toBe(`layer${index}`);
  expect(nativeShaderTextureRole('Multipurpose map')).toBe('multipurpose');
  expect(nativeShaderTextureRole('Diffuse map')).toBe('base');
  for(const label of ['Transparent layer 0','Transparent layer 4','Chicago layer 999','Reflection cube map','unknown'])
    expect(nativeShaderTextureRole(label)).toBeUndefined();
});
