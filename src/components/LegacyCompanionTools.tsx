import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, FolderPlus, Play, RefreshCw, Trash2 } from 'lucide-react';
import { call, native } from '../api';
import { companionOfferLabel, cannotGuaranteeCompatibility, mayOfferLaunch, validatedDashboard } from '../legacyCompanions';
import type { CompanionDashboard, CompanionFormat } from '../legacyCompanions';
import { Notice, Pill } from './ui';

/** Historical side-by-side tools are an OPTIONAL bridge, never the editor architecture. */
export default function LegacyCompanionTools(){
  const [dashboard,setDashboard]=useState<CompanionDashboard|null>(null);
  const [selectedTool,setSelectedTool]=useState('escha');
  const [format,setFormat]=useState<CompanionFormat>('mac-app');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const refresh=useCallback(async()=>{
    if(!native)return;
    setBusy(true);setError('');
    try {setDashboard(validatedDashboard(await call<CompanionDashboard>('legacy_companion_dashboard')));}
    catch(e){setError(String(e));}
    finally{setBusy(false);}
  },[]);
  useEffect(()=>{if(native)void refresh();},[refresh]);
  const selected=useMemo(()=>dashboard?.catalog.find(t=>t.id===selectedTool),[dashboard,selectedTool]);
  const detected=dashboard?.runtimes.find(r=>r.id===format);
  async function add(){
    if(!native)return;
    setBusy(true);setError('');setMessage('');
    try{
      const path=await call<string|null>('choose_legacy_companion_path',{format});
      if(!path)return;
      // No automatic launch. This step only pins a locally selected binary hash.
      const next=await call<CompanionDashboard>('register_legacy_companion',{toolId:selectedTool,format,path});
      setDashboard(validatedDashboard(next));setMessage('Companion registered and fingerprinted. It has NOT been launched or tested.');
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  async function launch(registrationId:string,name:string){
    if(!dashboard)return;
    const registration=dashboard.registrations.find(r=>r.id===registrationId);
    if(!registration||!mayOfferLaunch(registration,dashboard))return;
    if(!window.confirm(`Launch the separately installed ${name} outside Guilty Spark?\n\nThe legacy application may change files it opens. Keep working copies separate from your original Halo installation. Spark will not send it any map or arguments automatically.\n\nThis does NOT prove the app works on this runtime.`))return;
    setBusy(true);setError('');setMessage('');
    try{
      const result=await call<string>('launch_legacy_companion',{registrationId,confirmExternalLaunch:true});
      setMessage(result);
      await refresh();
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  async function remove(registrationId:string){
    if(!window.confirm('Remove this registration from Spark? The installed application will NOT be deleted.'))return;
    setBusy(true);setError('');setMessage('');
    try {setDashboard(validatedDashboard(await call<CompanionDashboard>('unregister_legacy_companion',{registrationId})));
      setMessage('Removed Spark registration; files were left unchanged.');
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  return <div className="gs-companions" aria-label="Legacy companion applications">
    <div className="section-heading"><h3>Classic companion tools · run alongside Spark</h3>
      <button type="button" className="small-button" onClick={()=>void refresh()} disabled={!native||busy}><RefreshCw size={13}/> Refresh compatibility</button></div>
    <p>Optional support for separately installed old editors—not a launcher replacing Spark. You can keep their windows open while Spark manages source reviews and builds. All checks are local and read-only until you explicitly launch a registered executable.</p>
    {!native&&<Notice tone="info">Open the desktop edition to detect Windows/Wine/macOS runtime candidates and register locally installed legacy applications. Browser mode cannot check installed programs.</Notice>}
    {dashboard&&<>
      <div className="gs-companion-runtimes">
        {dashboard.runtimes.map(runtime=><div className="gs-companion-runtime" key={runtime.id}>
          <Pill tone={runtime.available?'green':'amber'}>{runtime.available?'Runtime candidate':'Unavailable or undetected'}</Pill>
          <strong>{runtime.id==='windows-pe'?'Windows executable / Wine':'Native macOS app bundle'}</strong>
          <small>{runtime.detail}</small>
        </div>)}
      </div>
      <p className="subtle"><AlertTriangle size={14}/> {cannotGuaranteeCompatibility}</p>
      <div className="gs-companion-catalog">
        {dashboard.catalog.map(tool=><button type="button" key={tool.id} className={tool.id===selectedTool?'selected':''}
          aria-pressed={tool.id===selectedTool} onClick={()=>{setSelectedTool(tool.id);setFormat(tool.preferredFormat);}}>
          <span><strong>{tool.name}</strong><small>{tool.historicalRole}</small></span>
          <Pill tone={tool.installed?'green':tool.runtimeDetected?'muted':'amber'}>{tool.installed?'Registered':tool.runtimeDetected?'Possible':'Needs runtime'}</Pill>
        </button>)}
      </div>
      {selected&&<div className="gs-companion-register">
        <p><strong>{selected.name}</strong> — {companionOfferLabel(selected)}. <span className="subtle">Spark does not scan your disk for unregistered applications or download them.</span></p>
        <div className="gs-companion-picker">
          <label>Installed app format
            <select aria-label="Installed companion format" value={format} onChange={e=>setFormat(e.target.value as CompanionFormat)}>
              <option value="windows-pe">Windows application (.exe)</option>
              <option value="mac-app">macOS application (.app folder)</option>
            </select>
          </label>
          <button className="small-button" type="button" disabled={busy} onClick={()=>void add()} title="Choose a local executable and remember its hash. Never launches automatically.">
            <FolderPlus size={14}/> Register owned copy</button>
        </div>
        <small>{detected?.detail ?? 'Choose a format to view candidate runtime evidence.'} Choosing a path does not install or run any software.</small>
      </div>}
      {dashboard.registrations.length>0&&<div className="gs-companion-registered">
        <h4>Registered companion applications</h4>
        {dashboard.registrations.map(reg=><div className="gs-companion-row" key={reg.id}>
          <div><strong>{reg.name}</strong> <small>{reg.fileName}</small><span className="subtle">{reg.runtime} · {reg.detail}</span></div>
          <Pill tone={reg.status==='available-to-try'?'green':'amber'}>{reg.status==='available-to-try'?'Verified binary · untested app':reg.status}</Pill>
          <button className="small-button" type="button" disabled={busy||!mayOfferLaunch(reg,dashboard)}
            onClick={()=>void launch(reg.id,reg.name)} title="Explicitly launch this hashed local application in a separate window; no Halo map is passed automatically"><Play size={13}/> Launch</button>
          <button className="small-button" type="button" disabled={busy} onClick={()=>void remove(reg.id)} title="Remove registration only"><Trash2 size={13}/> Forget</button>
        </div>)}
      </div>}
      <p className="subtle">{dashboard.discoveryScope} Learn more: <a href="https://www.winehq.org/" target="_blank" rel="noreferrer">Wine compatibility <ExternalLink size={12}/></a> · <a href="https://support.apple.com/en-us/103076" target="_blank" rel="noreferrer">macOS 32-bit limits <ExternalLink size={12}/></a>.</p>
    </>}
    {busy&&<p role="status" className="subtle">Checking the selected local application…</p>}
    {error&&<Notice>{error}</Notice>}
    {message&&<p role="status" className="gs-companion-confirm">{message}</p>}
  </div>;
}
