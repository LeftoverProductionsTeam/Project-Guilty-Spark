import * as THREE from 'three';
import type { ShaderPreview, ShaderStage } from './types';

/** Framebuffer enum from Halo's tag definitions. Add and alpha-multiply-add
 * have distinct source factors; multiplying all glow by alpha loses signs. */
export function applyHaloBlend(material: THREE.Material, blend: number) {
  material.transparent = true;
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc =
    blend === 1 || blend === 2
      ? THREE.DstColorFactor
      : blend === 0 || blend === 7
        ? THREE.SrcAlphaFactor
        : THREE.OneFactor;
  material.blendDst =
    blend === 0
      ? THREE.OneMinusSrcAlphaFactor
      : blend === 1
        ? THREE.ZeroFactor
        : blend === 2
          ? THREE.SrcColorFactor
          : THREE.OneFactor;
  if (blend === 4) material.blendEquation = THREE.ReverseSubtractEquation;
  if (blend === 5 || blend === 6)
    material.blendEquation = blend === 5 ? THREE.MinEquation : THREE.MaxEquation;
  material.blendEquationAlpha = THREE.AddEquation;
  material.blendSrcAlpha = THREE.OneFactor;
  material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
}

const number = (v: number) =>
  Number.isFinite(v) && Math.abs(v) <= 65536 ? (Number.isInteger(v) ? `${v}.0` : `${v}`) : '0.0';
const rgba = (v: number[]) => `vec4(${v.map(number).join(',')})`;
const constants = ['0.0', '1.0', '0.5', '-1.0', '-0.5'];
function input(selector: number, alpha: boolean) {
  if (selector < 5) return alpha ? constants[selector] : `vec3(${constants[selector]})`;
  const register = `reg[${(selector - 5) % 10}]`;
  return alpha
    ? `${register}.${selector >= 15 ? 'b' : 'a'}`
    : selector >= 15
      ? `vec3(${register}.a)`
      : `${register}.rgb`;
}
function mapping(value: string, mode: number, alpha: boolean) {
  const one = alpha ? '1.0' : 'vec3(1.0)',
    half = alpha ? '0.5' : 'vec3(0.5)',
    clamped = `max(${value},${alpha ? '0.0' : 'vec3(0.0)'})`;
  return [
    clamped,
    `(${one}-${clamped})`,
    `(${clamped}*2.0-${one})`,
    `(${one}-${clamped}*2.0)`,
    `(${clamped}-${half})`,
    `(${half}-${clamped})`,
    value,
    `(-${value})`,
  ][mode];
}
function outputMapping(value: string, mode: number) {
  return [
    value,
    `(${value}*0.5)`,
    `(${value}*2.0)`,
    `(${value}*4.0)`,
    `(${value}-0.5)`,
    `(${value}*2.0-1.0)`,
  ][mode];
}
const destination = [-1, 6, 7, 4, 5, 0, 1, 2, 3];
function valid(stage: ShaderStage) {
  return (
    stage.colorInputs.length === 8 &&
    stage.alphaInputs.length === 8 &&
    stage.colorOutputs.length === 6 &&
    stage.alphaOutputs.length === 4 &&
    [...stage.colorInputs, ...stage.alphaInputs].every(
      (v, i) => Number.isInteger(v) && v >= 0 && v <= (i % 2 ? 7 : 24),
    ) &&
    [
      stage.colorOutputs[0],
      stage.colorOutputs[2],
      stage.colorOutputs[4],
      ...stage.alphaOutputs.slice(0, 3),
    ].every((v) => Number.isInteger(v) && v >= 0 && v <= 8) &&
    [stage.colorOutputs[1], stage.colorOutputs[3]].every((v) => v === 0 || v === 1) &&
    [stage.colorOutputs[5], stage.alphaOutputs[3]].every((v) => Number.isInteger(v) && v >= 0 && v <= 5)
  );
}

/** Compile the bounded tag register program, never source text from a map.
 * All input values are read before parallel stage outputs are committed. */
export function genericCombiner(metadata?: ShaderPreview): string {
  if (metadata?.kind !== 'generic') return '';
  const stages = (metadata.stages ?? []).slice(0, 7);
  if (!stages.length) return 'base=maps[0];';
  if (!stages.every(valid)) throw new Error('Unsupported transparent register program');
  let source = `vec4 reg[10];for(int i=0;i<4;i++)reg[i]=maps[i];
    reg[4]=vec4(1.0);float facing=abs(dot(normalize(haloNormal),normalize(-haloView)));
    reg[5]=vec4(1.0-facing);reg[6]=vec4(0.0);reg[7]=vec4(0.0);`;
  for (const [index, s] of stages.entries()) {
    source += `\n{reg[8]=mix(${rgba(s.constant0Lower)},${rgba(s.constant0Upper)},haloWave(${number(s.constant0Function)},time/max(abs(${number(s.constant0Period)}),0.001)));
      reg[9]=${rgba(s.constant1)};float mux=reg[6].a;`;
    for (const [prefix, fields, alpha] of [
      ['c', s.colorInputs, false],
      ['a', s.alphaInputs, true],
    ] as const) {
      for (let j = 0; j < 4; j++)
        source += `${alpha ? 'float' : 'vec3'} ${prefix}${j}=${mapping(input(fields[j * 2], alpha), fields[j * 2 + 1], alpha)};`;
    }
    const c = s.colorOutputs,
      a = s.alphaOutputs;
    source += `vec3 cab=${c[1] ? 'vec3(dot(c0,c1))' : 'c0*c1'},ccd=${c[3] ? 'vec3(dot(c2,c3))' : 'c2*c3'};
      vec3 csum=${s.flags & 1 ? '(mux>=0.5?ccd:cab)' : '(cab+ccd)'};
      float aab=a0*a1,acd=a2*a3,asum=${s.flags & 2 ? '(mux>=0.5?acd:aab)' : '(aab+acd)'};`;
    for (const [channel, outputs, values, mode] of [
      ['rgb', [c[0], c[2], c[4]], ['cab', 'ccd', 'csum'], c[5]],
      ['a', a.slice(0, 3), ['aab', 'acd', 'asum'], a[3]],
    ] as const) {
      for (let j = 0; j < 3; j++)
        if (outputs[j])
          source += `reg[${destination[outputs[j]]}].${channel}=clamp(${outputMapping(values[j], mode)},-1.0,1.0);`;
    }
    source += `} // stage ${index}\n`;
  }
  return source + 'base=clamp(reg[6],0.0,1.0);';
}

/** Shared source-defined UV waves. Object-driven inputs remain a documented
 * preview limit; global time waves do not depend on the editor camera. */
export const haloWaveGlsl = `
float haloWave(float fn,float phase){
  if(fn<0.5)return 1.0;if(fn<1.5)return 0.0;
  if(fn<3.5)return cos(phase*6.28318530718)*0.5+0.5;
  if(fn<5.5)return 1.0-abs(fract(phase)*2.0-1.0);
  if(fn<7.5)return fract(phase);
  return fract(sin(floor(phase)*12.9898+78.233)*43758.5453);
}`;
