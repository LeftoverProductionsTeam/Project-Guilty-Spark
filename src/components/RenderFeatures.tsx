import RendererQuality from './RendererQuality';
import type {Project} from '../types';
import {DEFAULT_RENDER_FEATURES,renderFeatures} from '../renderFeatures';
import type {RenderFeatures as Features} from '../renderFeatures';
export default function RenderFeatures({project,edit}:{project:Project;edit:(p:Project,description:string)=>void}){
  const p=renderFeatures(project.renderFeatures);
  function update<K extends keyof Features>(key:K,value:Features[K]){edit({...project,renderFeatures:{...p,[key]:value}},'Change renderer '+key);}
  const range=(key: keyof Features,label:string,min:number,max:number,step:number)=><label key={key}>{label}<input type="range" aria-label={label} min={min} max={max} step={step} value={p[key] as number} onChange={e=>update(key,Number(e.target.value) as never)}/><output>{Number(p[key]).toFixed(2)}</output></label>;
  return <details className="gs-render-features"><summary>Advanced rendering · surface detail, HDR &amp; bloom</summary><RendererQuality projectId={project.id}/>
    <label><input type="checkbox" checked={p.enabled} onChange={e=>update('enabled',e.target.checked)}/>Enable renderer enhancements</label>
    <p>Shared by source, live, QuickForge and machinima views. Uses verified source normal/multipurpose maps where available. These are editor effects; they do not install OpenSauce or change the game renderer.</p>
    {p.enabled&&<>
      <label><input type="checkbox" checked={p.normalMaps} onChange={e=>update('normalMaps',e.target.checked)}/>Source normal maps</label>{range('normalStrength','Normal strength',0,2,.05)}
      <label><input type="checkbox" checked={p.specular} onChange={e=>update('specular',e.target.checked)}/>Masked directional specular preview</label>{range('specularStrength','Specular strength',0,2,.05)}
      <label><input type="checkbox" checked={p.selfIllumination} onChange={e=>update('selfIllumination',e.target.checked)}/>Source model self-illumination</label>{range('selfIllumStrength','Self-illumination strength',0,4,.05)}
      <label><input type="checkbox" checked={p.bloom} onChange={e=>update('bloom',e.target.checked)}/>Bloom</label>{range('bloomStrength','Bloom strength',0,2,.05)}{range('bloomThreshold','Bloom threshold',0,4,.05)}{range('bloomRadius','Bloom spread',0,1,.05)}
      {range('exposureEv','Exposure stops',-4,4,.1)}{range('saturation','Color saturation',0,2,.05)}{range('contrast','Contrast',.5,1.5,.05)}{range('vignette','Vignette',0,1,.05)}
      <label>Tone mapping<select aria-label="Tone mapping" value={p.toneMapping} onChange={e=>update('toneMapping',e.target.value as Features['toneMapping'])}><option value="source">Source color response</option><option value="filmic">Filmic HDR</option></select></label>
      <label>Effect quality<select aria-label="Effect quality" value={p.quality} onChange={e=>update('quality',e.target.value as Features['quality'])}><option value="performance">Performance</option><option value="balanced">Balanced</option><option value="full">Full</option></select></label>
    </>}
    <button className="small-button" onClick={()=>edit({...project,renderFeatures:{...DEFAULT_RENDER_FEATURES}},'Restore authored renderer response')}>Restore source appearance</button>
    <small>Baked incident-light directions, cube-map reflections and extended OpenSauce shader tags remain separate renderer work.</small>
  </details>;
}
