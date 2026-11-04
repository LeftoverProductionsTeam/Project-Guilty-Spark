import { AudioLines, ExternalLink, Image as ImageIcon, Palette, RotateCcw, ShieldCheck, Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import type {ReactNode} from 'react';
import type { InterfacePreferences, CueName, ThemeName } from '../interfacePreferences';
import { cueNames, DEFAULT_INTERFACE } from '../interfacePreferences';
import { PageTitle, Pill } from './ui';
import {useMapState} from '../mapSession';
import {native} from '../api';
import './interfaceStudio.css';

const themes: { id: ThemeName; title: string; description: string }[] = [
  { id: 'halo-ce', title: 'Halo CE Classic', description: 'Original-game-inspired navy, blue and restrained cyan' },
  { id: 'unsc', title: 'UNSC / MJOLNIR', description: 'Muted armor olive, tactical amber and utilitarian steel' },
  { id: 'covenant', title: 'Covenant Plasma', description: 'Deep purple, indigo and controlled plasma highlights' },
  { id: 'forerunner', title: 'Guilty Spark / Forerunner', description: 'Cool teal, blue-black and ancient geometric framing' },
  { id: 'dark-glow', title: 'Dark Glow', description: 'Deep charcoal, white text and your own luminous accent colors' },
];
const eventLabels: Record<CueName, string> = { select: 'Menu navigation', confirm: 'Confirm / save', warning: 'Warning / error' };

export default function InterfaceStudio({
  preferences, onChange, onPreview, onOpenTags, canBrowseSounds,
  bitmapTags, bitmapStatus, bitmapLoading, bitmapActive, onChooseBitmap, onClearBitmap,
  homeModelSettings,
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
  homeModelSettings?:ReactNode;
}) {
  const [savedSection,setSection]=useMapState('global','interface.section','appearance');
  const [desktopOrb,setDesktopOrb]=useMapState('global','workspace.desktopOrb',false);
  const [launchVoiceStatus]=useMapState('global','home.voice.status','One matching character line per launch; no repeats until all recoverable lines have played.');
  const section=['appearance','window','sounds','art'].includes(savedSection)?savedSection:'appearance';
  const [bitmapQuery,setBitmapQuery]=useState('');
  const [chosenBitmap,setChosenBitmap]=useState<number|null>(preferences.bitmap?.bitmapTagId ?? null);
  const eligible=bitmapTags.filter(tag=>tag.path.toLowerCase().includes(bitmapQuery.toLowerCase())).slice(0,100);
  return <div className="analysis-page interface-studio interface-compact">
    <PageTitle eyebrow="INTERFACE STUDIO · LOCAL PROFILE"
      title="Make the workbench yours."
      description="Appearance and optional Halo menu sounds. Changes are saved on this device."
      actions={<button onClick={() => onChange({ ...DEFAULT_INTERFACE, cues: {} })}><RotateCcw size={14}/> Restore defaults</button>}/>
    <nav className="interface-sections" role="tablist" aria-label="Interface categories" onKeyDown={event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      const tabs=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')],at=tabs.indexOf(document.activeElement as HTMLButtonElement);
      if(at<0)return;event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(at+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      tabs[next]?.focus();tabs[next]?.click();
    }}>{([['appearance','Appearance'],['window','Window'],['sounds','Menu sounds'],['art','Header art']] as const).map(([id,label])=>
      <button key={id} role="tab" id={`interface-${id}`} aria-controls="interface-category" aria-selected={section===id} tabIndex={section===id?0:-1} onClick={()=>setSection(id)}>{label}</button>)}</nav>
    <div id="interface-category" role="tabpanel" aria-labelledby={`interface-${section}`} className={`interface-section-grid interface-section-${section}`}>
    {section==='appearance'&&<>
    <section className="analysis-card">
      <h2><Palette size={19}/> Visual identity</h2>
      {homeModelSettings}
      <div className="interface-theme-grid">
        {themes.map((theme) => <button
          type="button" key={theme.id} aria-pressed={preferences.theme === theme.id}
          className={`interface-theme-option interface-theme-${theme.id}${preferences.theme === theme.id ? ' active' : ''}`}
          title={theme.description} onClick={() => onChange({ ...preferences, theme: theme.id })}>
          <span className="interface-swatch" aria-hidden="true" />
          <span className="interface-theme-copy"><strong>{theme.title}</strong><small>{theme.description}</small></span>
          {preferences.theme === theme.id && <Pill tone="green">Selected</Pill>}
        </button>)}
      </div>
      <div className="interface-behavior-settings" role="group" aria-label="Workspace behavior">
      <label className="interface-control"><input type="checkbox" checked={preferences.reducedMotion}
        onChange={(event) => onChange({ ...preferences, reducedMotion: event.target.checked })}/>
        Reduced motion and interface transitions</label>
      <label className="interface-control"><input type="checkbox" checked={preferences.workspaceTransitions} onChange={e=>onChange({...preferences,workspaceTransitions:e.target.checked})}/>Subtle workspace fades</label>
      <label className="interface-control"><input type="checkbox" checked={preferences.shieldLoading} onChange={e=>onChange({...preferences,shieldLoading:e.target.checked})}/>Shield loading animation</label>
      <label className="interface-control"><input type="checkbox" checked={preferences.restoreWorkspaceLayout} onChange={e=>onChange({...preferences,restoreWorkspaceLayout:e.target.checked})}/>Restore my saved workspace layout on launch</label>
      </div>
      <small className="interface-palette-note">Original palettes. Use Header art for a verified image from your maps.</small>
    </section>
    <section className="analysis-card gs-glow-workshop" aria-label="Dark Glow colors">
      <h2><Palette size={19}/> Dark Glow</h2>
      <p>Choose your glow colors. Surfaces stay dark and text stays white.</p>
      {preferences.theme!=='dark-glow'&&<button type="button" className="primary" onClick={()=>onChange({...preferences,theme:'dark-glow'})}>Use Dark Glow</button>}
      <div className="gs-glow-color-grid">
        <label>Primary glow <input type="color" aria-label="Primary glow color" value={preferences.glowPrimary} onChange={e=>onChange({...preferences,glowPrimary:e.target.value})}/><code>{preferences.glowPrimary.toUpperCase()}</code></label>
        <label>Secondary glow <input type="color" aria-label="Secondary glow color" value={preferences.glowSecondary} onChange={e=>onChange({...preferences,glowSecondary:e.target.value})}/><code>{preferences.glowSecondary.toUpperCase()}</code></label>
      </div>
      <label className="interface-volume">Glow strength · {Math.round(preferences.glowIntensity*100)}%
        <input type="range" aria-label="Glow strength" min="0" max="100" step="1" value={Math.round(preferences.glowIntensity*100)} onChange={e=>onChange({...preferences,glowIntensity:Number(e.target.value)/100})}/>
      </label>
      <div className="gs-glow-preview" aria-label="Glow color preview"><span>PRIMARY</span><span>SECONDARY</span></div>
      <button type="button" onClick={()=>onChange({...preferences,glowPrimary:DEFAULT_INTERFACE.glowPrimary,glowSecondary:DEFAULT_INTERFACE.glowSecondary,glowIntensity:DEFAULT_INTERFACE.glowIntensity})}>Reset glow colors</button>
    </section>
    </>}
    {section==='window'&&<section className="analysis-card gs-window-appearance">
      <h2>Window glass</h2>
      <label className="interface-control"><input type="checkbox" disabled={!native} checked={desktopOrb===true} onChange={event=>setDesktopOrb(event.target.checked)}/>Show desktop Spark companion</label>
      <small>Optional shortcut to Open Work. Drag to move; Esc or × hides it. Uses your saved monitor portrait.</small>
      <p>Adjust the window’s controls, panels, text and viewport. The Spark corner emblem stays solid.</p>
      <label>Window transparency · {Math.round((1-preferences.windowOpacity)*100)}%
        <input aria-label="Whole window transparency" type="range" min="0" max="90" step="1" value={Math.round((1-preferences.windowOpacity)*100)} onChange={e=>onChange({...preferences,windowOpacity:1-Number(e.target.value)/100})}/>
      </label>
      <label>Window tint <input aria-label="Whole window tint" type="color" value={preferences.windowTint} onChange={e=>onChange({...preferences,windowTint:e.target.value})}/></label>
      <label>Tint strength · {Math.round(preferences.windowTintStrength*100)}%
        <input aria-label="Window tint strength" type="range" min="0" max="50" step="1" value={Math.round(preferences.windowTintStrength*100)} onChange={e=>onChange({...preferences,windowTintStrength:Number(e.target.value)/100})}/>
      </label>
      <button onClick={()=>onChange({...preferences,windowOpacity:1,windowTintStrength:0})}>Reset window glass</button>
      <small>Ctrl+Alt+O restores full opacity and clears the tint. These settings stay on this device.</small>
    </section>}
    {section==='art'&&<section className="analysis-card interface-bitmap-workshop">
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
    </section>}
    {section==='sounds'&&<section className="analysis-card interface-sound-workshop">
      <h2><AudioLines size={19}/> Sound workshop · local Halo sources</h2>
      <p>Choose a sound in the Tag editor and assign it to a menu event.</p>
      <div className="interface-sound-options">
      <label className="interface-control"><input type="checkbox" aria-label="Character greeting on launch" checked={preferences.launchVoiceEnabled} onChange={e=>onChange({...preferences,launchVoiceEnabled:e.target.checked})}/>Character greeting on launch</label>
      <label className="interface-volume">Launch voice · {Math.round(preferences.launchVoiceVolume*100)}%<input aria-label="Launch voice volume" type="range" min={0} max={100} value={Math.round(preferences.launchVoiceVolume*100)} onChange={e=>onChange({...preferences,launchVoiceVolume:Number(e.target.value)/100})}/></label>
      <label className="interface-control">
        <input type="checkbox" checked={preferences.uiAudioEnabled}
          onChange={(e) => onChange({ ...preferences, uiAudioEnabled: e.target.checked })}/>
        {preferences.uiAudioEnabled ? <Volume2 size={16}/> : <VolumeX size={16}/>} Enable optional menu sounds
      </label>
      <label className="interface-volume">UI sound volume · {Math.round(preferences.uiVolume * 100)}%
        <input aria-label="UI sound volume" type="range" min={0} max={100} value={Math.round(preferences.uiVolume*100)}
          onChange={(e) => onChange({ ...preferences, uiVolume: Number(e.target.value)/100 })}/>
      </label>
      </div>
      <small className="interface-voice-status" role="status">{launchVoiceStatus} Choose your character under Appearance. Windows uses linked original campaign PCM/ADPCM; unsupported dialogue stays silent.</small>
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
      {!canBrowseSounds && <p className="subtle">Open a map to assign its sounds. Menu sounds are opt-in.</p>}
    </section>}
    </div>
    <p className="interface-local"><ShieldCheck size={14}/> All preferences stay on this device. Stock Halo source files remain unchanged.</p>
  </div>;
}
