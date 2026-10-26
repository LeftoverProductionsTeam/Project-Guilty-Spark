import { useState } from 'react';
import type { EditorEnvironment } from '../environment';
import { DEFAULT_ENVIRONMENT, fromHex, toHex, validateEnvironment } from '../environment';
import { downloadLocalText } from '../exportHelpers';
import { HelpTip, Notice, NumberField } from './ui';

/** Shared controls for live World inspection and persistent QuickForge source authorship.
 * The caller decides whether changes are saved or intentionally session-only.
 */
export default function EnvironmentControls({value,onChange,persisted=false,skyPath=null}: {
  value:EditorEnvironment; onChange:(next:EditorEnvironment)=>void; persisted?:boolean; skyPath?:string|null;
}) {
  const [error,setError] = useState('');
  const edit=<K extends keyof EditorEnvironment>(key:K, newValue:EditorEnvironment[K])=> {
    const next={...value,[key]:newValue};
    try { validateEnvironment(next);setError('');onChange(next); }
    catch(e) { setError(String(e)); }
  };
  return <div className="gs-environment-controls">
    <p className="forge-hint">{persisted?'Saved project lighting/fog intent.':'Temporary, read-only inspection lighting/fog.'} Visual preview only; Halo sky/fog tags, baked radiosity and PVS are not edited.</p>
    <label className="gs-env-switch" title="Switch between these preview colors and the original editor lighting. This does not touch the game or its files.">
      <input type="checkbox" checked={value.previewEnabled} onChange={e=>edit('previewEnabled',e.target.checked)}/> Use environment preview
    </label>
    <div className="gs-env-grid">
      {([['skyColor','Sky/backdrop','Preview backdrop color; real Halo sky is a 3D model referenced from a .sky tag.'],
        ['ambientColor','Ambient tint','Approximation of Halo indoor/outdoor ambient radiosity tint.'],
        ['sunColor','Sun color','Editor-only directional source; the real sky tag influences baked lighting.'],
        ['fogColor','Fog color','Preview distance fog; Halo atmospheric fog belongs to the sky tag, planar fog to a fog tag.']] as const).map(([key,label,help])=>
        <label className="forge-field" title={help} key={key}>{label} <HelpTip help={help}/>
          <input type="color" aria-label={label} value={toHex(value[key])} onChange={e=>edit(key,fromHex(e.target.value))}/>
        </label>)}
      {([['ambientIntensity','Ambient brightness',0,5,0.05,'0 is no ambient fill; larger values brighten unlit faces in the editor, not Halo lightmaps.'],
        ['sunIntensity','Sun brightness',0,10,0.1,'Changes the viewport light; Halo radiosity must be recompiled.'],
        ['sunAzimuth','Sun bearing (degrees)',-180,180,1,'Horizontal sun direction measured around Z axis.'],
        ['sunElevation','Sun elevation (degrees)',-90,90,1,'Positive values place sun above the horizon; negative values place it below.']] as const)
        .map(([key,label,min,max,step,help])=><div className="forge-field" title={help} key={key}>
          <NumberField label={label} value={value[key]} min={min} max={max} step={step} onCommit={n=>edit(key,n)}/>
        </div>)}
    </div>
    <label className="gs-env-switch" title="Show a distance-based fog approximation in the editor, not an actual Halo sky or fog tag edit.">
      <input type="checkbox" checked={value.fogEnabled} onChange={e=>edit('fogEnabled',e.target.checked)}/> Enable preview distance fog
    </label>
    {value.fogEnabled && <div className="gs-env-grid">
      <div className="forge-field"><NumberField label="Fog begins (world units)" value={value.fogNear} min={0} max={19999} step={1} onCommit={n=>edit('fogNear',n)}/></div>
      <div className="forge-field"><NumberField label="Fog fully obscures (world units)" value={value.fogFar} min={1} max={20000} step={1} onCommit={n=>edit('fogFar',n)}/></div>
    </div>}
    {error && <Notice tone="warning">{error}</Notice>}
    <div className="analysis-actions">
      <button className="small-button" title="Restore the preview baseline. Does not change any game files." onClick={()=>{setError('');onChange(structuredClone(DEFAULT_ENVIRONMENT));}}>Reset preview</button>
      <button className="small-button" title="Export a JSON authoring intent with a warning that it is not a compiled .sky or .fog tag." onClick={()=>downloadLocalText('guilty-spark-environment-intent.json',
        JSON.stringify({schemaVersion:1,kind:'guilty-spark-environment-intent',status:'AUTHORING_ONLY_NOT_COMPILED',haloSkyTag:skyPath,environment:value},null,2)+'\n','application/json')}>Export preview settings</button>
    </div>
    <Notice tone="info">Fog distances and illumination in Three.js will not reproduce Halo's sun/sky shader or baked BSP lightmap. Use matching H1 Guerilla/Sapien/Tool and a real in-engine test for final lighting.</Notice>
  </div>;
}
