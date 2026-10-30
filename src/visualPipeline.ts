import { Vector2,WebGLRenderTarget,HalfFloatType } from 'three';
import type { WebGLRenderer, Scene, Camera } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { RenderFeatures } from './renderFeatures';
/** One composer owns output conversion. Source Halo materials supply linear
 * output only while this pipeline is active, avoiding a second gamma pass. */
export function createVisualPipeline(
  gl: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  withBloom: boolean,
  withDof: boolean,
) {
  const target=new WebGLRenderTarget(1,1,{type:HalfFloatType});
  target.samples=gl.getContext().getContextAttributes()?.antialias?Math.min(4,gl.capabilities.maxSamples):0;
  const composer = new EffectComposer(gl,target),
    render = new RenderPass(scene, camera);
  const bloom = withBloom ? new UnrealBloomPass(new Vector2(256, 256), 0.35, 0.4, 0.9) : null;
  const bokeh = withDof
    ? new BokehPass(scene, camera, { focus: 20, aperture: 0.0001, maxblur: 0.005 })
    : null;
  const grade = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      exposure: { value: 1 },
      saturation: { value: 1 },
      contrast: { value: 1 },
      vignette: { value: 0 },
      filmic: { value: false },
    },
    vertexShader:
      'varying vec2 effectUv;void main(){effectUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec2 effectUv;uniform sampler2D tDiffuse;uniform float exposure,saturation,contrast,vignette;uniform bool filmic;
    vec3 displayColor(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-.055,step(vec3(.0031308),c));}
    void main(){vec4 original=texture2D(tDiffuse,effectUv);vec3 c=max(original.rgb*exposure,vec3(0.0));
      if(filmic)c=clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.0,1.0);
      c=mix(vec3(dot(c,vec3(.2126,.7152,.0722))),c,saturation);c=(c-.18)*contrast+.18;
      vec2 p=effectUv*2.0-1.0;c*=1.0-vignette*smoothstep(.25,1.4,dot(p,p));gl_FragColor=vec4(displayColor(c),original.a);}`,
  });
  grade.material.toneMapped = false;
  composer.addPass(render);
  if (bloom) composer.addPass(bloom);
  if (bokeh) composer.addPass(bokeh);
  composer.addPass(grade);
  return {
    composer,
    update(profile: RenderFeatures, dof?: { focus: number; blur: number }) {
      const p = profile.enabled ? profile : null;
      grade.uniforms.exposure.value = p ? 2 ** p.exposureEv : 1;
      grade.uniforms.saturation.value = p?.saturation ?? 1;
      grade.uniforms.contrast.value = p?.contrast ?? 1;
      grade.uniforms.vignette.value = p?.vignette ?? 0;
      grade.uniforms.filmic.value = p?.toneMapping === 'filmic';
      if (bloom) {
        bloom.enabled = !!p?.bloom;
        bloom.strength = p?.bloomStrength ?? 0;
        bloom.threshold = p?.bloomThreshold ?? 0.9;
        bloom.radius = p?.bloomRadius ?? 0.4;
      }
      if (bokeh) {
        bokeh.enabled = !!dof;
        if (dof) {
          const uniforms = bokeh.uniforms as Record<string, { value: number }>;
          uniforms.focus.value = dof.focus;
          uniforms.aperture.value = dof.blur * 0.001;
          uniforms.maxblur.value = dof.blur * 0.02;
        }
      }
    },
    resize(width: number, height: number, dpr: number, quality: RenderFeatures['quality']) {
      const scale = quality === 'performance' ? 0.5 : quality === 'balanced' ? 0.75 : 1;
      const density = Math.min(dpr * scale, Math.sqrt(4_194_304 / Math.max(1, width * height)));
      composer.setPixelRatio(density);
      composer.setSize(width, height);
    },
    dispose() {
      render.dispose();
      bloom?.dispose();
      bokeh?.dispose();
      grade.dispose();
      composer.dispose();
    },
  };
}
