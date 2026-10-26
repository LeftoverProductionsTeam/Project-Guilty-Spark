import { AudioLines, ExternalLink, Image as ImageIcon, Palette, RotateCcw, ShieldCheck, Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import type { InterfacePreferences, CueName, ThemeName } from '../interfacePreferences';
import { cueNames, DEFAULT_INTERFACE } from '../interfacePreferences';
import { Notice, PageTitle, Pill } from './ui';

const themes: { id: ThemeName; title: string; description: string }[] = [
  { id: 'halo-ce', title: 'Halo CE Classic', description: 'Original-game-inspired navy, blue and restrained cyan' },
  { id: 'unsc', title: 'UNSC / MJOLNIR', description: 'Muted armor olive, tactical amber and utilitarian steel' },
  { id: 'covenant', title: 'Covenant Plasma', description: 'Deep purple, indigo and controlled plasma highlights' },
  { id: 'forerunner', title: 'Guilty Spark / Forerunner', description: 'Cool teal, blue-black and ancient geometric framing' },
];
const eventLabels: Record<CueName, string> = { select: 'Menu navigation', confirm: 'Confirm / save', warning: 'Warning / error' };

export default function InterfaceStudio({
  preferences, onChange, onPreview, onOpenTags, canBrowseSounds,
  bitmapTags, bitmapStatus, bitmapLoading, bitmapActive, onChooseBitmap, onClearBitmap,
}: {
  preferences: InterfacePreferences;
  onChange: (next: InterfacePreferences) => void;
  onPreview: (cue: CueName) => void;
  onOpenTags: () => void;
  canBrowseSounds: boolean;
  bitmapTags: {id:number;path:string}[];
  bitmapStatus: string;
  bitmapLoading: boolean;
  bitmapActive: boolean;
  onChooseBitmap: (id:number)=>void;
  onClearBitmap: ()=>void;
}) {
  const [bitmapQuery,setBitmapQuery]=useState('');
  const [chosenBitmap,setChosenBitmap]=useState<number|null>(preferences.bitmap?.bitmapTagId ?? null);
  const eligible=bitmapTags.filter(tag=>tag.path.toLowerCase().includes(bitmapQuery.toLowerCase())).slice(0,100);
  return <div className="analysis-page interface-studio">
    <PageTitle eyebrow="INTERFACE STUDIO · LOCAL PROFILE"
      title="Make the workbench yours."
      description="Four original Halo CE-inspired palettes, quiet-by-default controls and optional sounds from Halo maps you supplied. Nothing is uploaded or packaged with the app."
      actions={<button onClick={() => onChange({ ...DEFAULT_INTERFACE, cues: {} })}><RotateCcw size={14}/> Restore defaults</button>}/>
    <section className="analysis-card">
      <h2><Palette size={19}/> Visual identity</h2>
      <div className="interface-theme-grid">
        {themes.map((theme) => <button
          type="button" key={theme.id} aria-pressed={preferences.theme === theme.id}
          className={`interface-theme-option interface-theme-${theme.id}${preferences.theme === theme.id ? ' active' : ''}`}
          onClick={() => onChange({ ...preferences, theme: theme.id })}>
          <span className="interface-swatch" aria-hidden="true" />
          <strong>{theme.title}</strong><small>{theme.description}</small>
          {preferences.theme === theme.id && <Pill tone="green">Selected</Pill>}
        </button>)}
      </div>
      <label className="interface-control"><input type="checkbox" checked={preferences.reducedMotion}
        onChange={(event) => onChange({ ...preferences, reducedMotion: event.target.checked })}/>
        Reduced motion and interface transitions</label>
      <Notice tone="info">The palettes are original Halo-inspired UI styles. Your own verified game bitmaps can optionally decorate the header, while nine-slice layouts, sprite atlases and exact Halo menu reproduction remain separate work.</Notice>
    </section>
    <section className="analysis-card interface-bitmap-workshop">
      <h2><ImageIcon size={19}/> Local Halo bitmap · workbench header</h2>
      <p>Choose a <code>bitm</code> tag from a Halo map you imported. Spark reads its verified top mipmap, uses a temporary in-memory picture as a modern header accent, and remembers only the exact source hash and tag ID. It cannot ship or cache original Halo art in the editor.</p>
      {bitmapTags.length ? <>
        <input type="search" value={bitmapQuery} maxLength={160} onChange={e=>setBitmapQuery(e.target.value)} placeholder="Find your bitmap tag (e.g. ui, menu, forerunner)…" aria-label="Search local Halo bitmaps" />
        <select aria-label="Select owned bitmap tag" value={chosenBitmap??''} onChange={e=>setChosenBitmap(e.target.value?Number(e.target.value):null)}>
          <option value="">Select bitmap tag</option>
          {eligible.map(tag=><option key={tag.id} value={tag.id}>{tag.path} · #{tag.id}</option>)}
          {chosenBitmap!==null && !eligible.some(tag=>tag.id===chosenBitmap) &&
            <option value={chosenBitmap}>Current selected tag #{chosenBitmap} (outside filter)</option>}
        </select>
        <div className="analysis-actions">
          <button type="button" className="primary" disabled={bitmapLoading || chosenBitmap===null || !bitmapTags.some(t=>t.id===chosenBitmap)}
            onClick={()=>chosenBitmap!==null&&onChooseBitmap(chosenBitmap)}>{bitmapLoading?'Reading local game bitmap…':'Use verified bitmap as header art'}</button>
          <button type="button" disabled={!preferences.bitmap} onClick={()=>{onClearBitmap();setChosenBitmap(null);}}>Clear local art</button>
        </div>
      </> : <p className="subtle">Open a locally preserved Halo cache project to unlock compatible bitmap references. Unsupported/compressed/cubemap resources are intentionally refused.</p>}
      <p role="status" className="interface-bitmap-status"><ShieldCheck size={14}/>{bitmapStatus} {bitmapActive?'· Applied to the app header':''}</p>
      <p className="subtle">A bitmap used as a decorative banner is not necessarily a Halo UI atlas. Full bitmap panel/sprite composition will require an explicit layout editor and tag-verified cropping.</p>
    </section>
    <section className="analysis-card">
      <h2><AudioLines size={19}/> Sound workshop · local Halo sources</h2>
      <p>Assign existing, decodable <code>snd!</code> permutations from your own imported maps. Cue definitions store only a local project/tag reference. No audio is bundled or uploaded.</p>
      <label className="interface-control">
        <input type="checkbox" checked={preferences.uiAudioEnabled}
          onChange={(e) => onChange({ ...preferences, uiAudioEnabled: e.target.checked })}/>
        {preferences.uiAudioEnabled ? <Volume2 size={16}/> : <VolumeX size={16}/>} Enable optional menu sounds
      </label>
      <label className="interface-volume">UI sound volume · {Math.round(preferences.uiVolume * 100)}%
        <input type="range" min={0} max={100} value={Math.round(preferences.uiVolume*100)}
          onChange={(e) => onChange({ ...preferences, uiVolume: Number(e.target.value)/100 })}/>
      </label>
      <div className="interface-cue-list">
        {cueNames.map((cue) => <div className="interface-cue-row" key={cue}>
          <span><strong>{eventLabels[cue]}</strong><small>{preferences.cues[cue]?.label ?? 'Silent · no sound assigned'}</small></span>
          <button disabled={!preferences.uiAudioEnabled || !preferences.cues[cue]} onClick={() => onPreview(cue)} type="button">Preview</button>
          <button disabled={!preferences.cues[cue]} type="button" onClick={() => onChange({ ...preferences, cues: { ...preferences.cues, [cue]: undefined } })}>Clear</button>
        </div>)}
      </div>
      <button className="primary" type="button" disabled={!canBrowseSounds} onClick={onOpenTags}>
        <ExternalLink size={14}/> Browse imported sound tags
      </button>
      {!canBrowseSounds && <p className="subtle">Open an imported Halo map first to assign real source sounds. The UI stays silent until you opt in.</p>}
    </section>
    <p className="interface-local"><ShieldCheck size={14}/> All preferences stay on this device. Stock Halo source files remain unchanged.</p>
  </div>;
}
