import { useCallback, useState } from 'react';
import { Download, RefreshCw, Plus, Trash2, Gamepad2, Server, ShieldCheck } from 'lucide-react';
import { call, native } from '../api';
import type { RuntimeInventory } from '../types';
import type { QuickForgeDocument } from '../forge';
import { previewMultiplayerScenarioRequirements } from '../multiplayerScenario';
import type { CreatorStudioDocument, GameTypeDesign, ServerRuntime } from '../creatorStudio';
import { exportHaloCeServerInit } from '../creatorStudio';
import {
  HALO_CE_STOCK_VARIANTS, HALO_CE_BASE_FAMILIES, analyzeHaloCeSession,
  defaultGameTypeDesign, exportSessionHandoff,
} from '../multiplayerSetup';
import { Notice, NumberField, Pill } from './ui';
import { packageHaloCeSession } from '../multiplayerPackage';
import '../multiplayer.css';

const nameFor=(n:number)=>String(n+1).padStart(2,'0');
function freshId():string {return crypto.randomUUID();}
function downloadText(filename:string,text:string,mime='text/plain;charset=utf-8'){
  const url=URL.createObjectURL(new Blob([text],{type:mime}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
export default function MultiplayerWorkbench({studio,forge,onChange,notify,onError,onOpenRuntimes}:{
  studio:CreatorStudioDocument;
  forge:QuickForgeDocument|null|undefined;
  onChange:(next:CreatorStudioDocument,description:string)=>void;
  notify:(message:string,tone?:string)=>void;
  onError:(message:string)=>void;
  onOpenRuntimes:()=>void;
}){
  const server=studio.server;
  const [inventory,setInventory]=useState<RuntimeInventory|null>(null);
  const [scanning,setScanning]=useState(false);
  const [scanError,setScanError]=useState('');
  const readiness=analyzeHaloCeSession(server,inventory);
  const sourceWarnings=previewMultiplayerScenarioRequirements(forge,server);
  const patch=(next:Partial<typeof server>,label:string)=>onChange({...studio,server:{...server,...next}},label);
  const updateGame=(id:string,fields:Partial<GameTypeDesign>)=>{
    const runtimeRules=['name','baseVariant','teamPlay','scoreLimit','timeLimitMinutes','respawnSeconds','friendlyFire','startingEquipment','specialRules'];
    const changed=runtimeRules.some(key=>key in fields);
    patch({gameTypes:(server.gameTypes??[]).map(p=>p.id===id?{...p,...(changed?{nativeStatus:'draft' as const,nativeEvidence:''}:{}),...fields}:p)},'Edit custom game type design');
  };
  const scan=useCallback(async()=>{
    setScanning(true);setScanError('');setInventory(null);
    try {
      const result=await call<RuntimeInventory>('runtime_inventory',{runtimeId:'haloCustomEdition'});
      if(result.runtimeId!=='haloCustomEdition')throw new Error('Wrong runtime inventory returned');
      setInventory(result);
    }catch(error){setScanError(String(error));}finally{setScanning(false);}
  },[]);
  function addDesign(template:'standard'|'rockets'|'zombie'){
    const next=defaultGameTypeDesign(freshId(),
      template==='rockets'?'Rocket Slayer':template==='zombie'?'Zombie Apocalypse':`My Custom Match ${(server.gameTypes??[]).length+1}`);
    if(template==='rockets')next.startingEquipment='rockets';
    if(template==='zombie'){
      next.specialRules='infectionConcept';
      next.notes='Design-only: AI infection/spawn replication is unsupported by stock CE gametype settings. Requires custom scripting and real network tests.';
    }
    if((server.gameTypes??[]).some(g=>g.name.toLowerCase()===next.name.toLowerCase()))next.name=`Custom Match ${String((server.gameTypes??[]).length+1)}`;
    patch({gameTypes:[...(server.gameTypes??[]),next]},'Add game type design');
  }
  function exportSafeConfig(){
    try{
      if(!readiness.readyForManualLocalTest)throw new Error('Resolve the preflight blockers before exporting the ready-for-review config.');
      const text=exportHaloCeServerInit(studio);
      downloadText('guilty-spark-ce-init-REVIEW.txt',text);
      onError('');notify('Review-only Halo CE server config exported. No runtime or network settings were changed.','success');
    }catch(e){onError(String(e));}
  }
  function exportBundle(){
    try{
      const bytes=packageHaloCeSession(studio,inventory);
      const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/zip'}));
      const a=document.createElement('a');a.href=url;a.download='guilty-spark-ce-private-session-REVIEW.zip';
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
      onError('');notify('Source-only private session bundle prepared; no map, savegame or executable was packaged.','success');
    }catch(e){onError(String(e));}
  }
  function exportHandoff(){
    try {downloadText('guilty-spark-multiplayer-handoff.json',exportSessionHandoff(studio,inventory),'application/json');
      onError('');notify('Multiplayer design and map-proof manifest exported; server remains stopped.','success');}
    catch(e){onError(String(e));}
  }
  return <div className="gs-multiplayer-workbench">
    <section className="analysis-card">
      <div className="section-heading"><h2><Server size={18}/> Multiplayer Session Setup</h2><Pill>{server.runtime==='haloCustomEdition'?'Halo CE configuration supported':'Design-only target'}</Pill></div>
      <p>Choose a runtime, scan the real installed multiplayer maps, select a variant, and export a private-server review file. <strong>Nothing is deployed, executed, or exposed to the network.</strong></p>
      <div className="studio-fields">
        <label title="The engine determines map compatibility, dedicated-server commands, and multiplayer AI behavior.">Target runtime
          <select aria-label="Multiplayer target runtime" value={server.runtime} onChange={e=>{setInventory(null);patch({runtime:e.target.value as ServerRuntime},'Change server runtime');}}>
            <option value="haloCustomEdition">Halo Custom Edition (stock dedicated server)</option>
            <option value="haloPC">Halo PC (design only)</option>
            <option value="haloDemo">Halo Demo (design only)</option>
            <option value="mcc">MCC H1A (custom game lobby; no CE init exporter)</option>
            <option value="openCE">OpenCE (unverified server contract)</option>
            <option value="chupathingyCE">ChupathingyCE (unverified server contract)</option>
          </select>
        </label>
        <label title="Only printable names are accepted. No remote admin or RCON details are saved.">Server name
          <input maxLength={63} value={server.name} onChange={e=>patch({name:e.target.value},'Rename server plan')} />
        </label>
        <label title="Halo CE's traditional server player limit is 16.">Maximum players
          <NumberField value={server.maxPlayers} onCommit={n=>patch({maxPlayers:Math.round(n)},'Change player cap')} label="Player limit" min={1} max={16} step={1}/>
        </label>
      </div>
      <label className="checkbox-label" title="Local and invite-only play is the safe default. Changing this does not update firewall or router rules.">
        <input type="checkbox" checked={server.publicListing} onChange={e=>patch({publicListing:e.target.checked},'Change public listing intent')}/>
        Request public listing in the exported configuration (off by default)
      </label>
      <div className="analysis-actions">
        <button type="button" disabled={scanning||!native||server.runtime!=='haloCustomEdition'} onClick={()=>void scan()} title="Read your registered Halo CE map inventory; verify source cache metadata and SHA-256. No files are changed.">
          <RefreshCw size={15}/> {scanning?'Scanning...':'Scan installed CE maps'}
        </button>
        <button type="button" onClick={onOpenRuntimes} title="Register a verified Halo CE installation or view supported tool adapters.">Choose installed runtime</button>
        <Pill tone={inventory?'green':'muted'}>{inventory?`${readiness.verifiedMaps.length} verified multiplayer maps`:'No verified map inventory'}</Pill>
      </div>
      {!native&&<Notice tone="info">Installed-map inspection requires the Tauri desktop application. Browser mode offers design and tutorial previews only.</Notice>}
      {scanError&&<Notice>{scanError}</Notice>}
      {inventory?.diagnostics?.map((entry,i)=><p className="subtle" key={i}>{entry}</p>)}
      {server.runtime!=='haloCustomEdition'&&<Notice>Other engines require their own session APIs and map formats. This workbench will not export a classic Halo CE init.txt for a mismatched runtime.</Notice>}
    </section>
    <section className="analysis-card">
      <div className="section-heading"><h2><Gamepad2 size={18}/> Map rotation</h2><button disabled={server.rotation.length>=128} onClick={()=>patch({rotation:[...server.rotation,{id:freshId(),map:readiness.verifiedMaps[0]?.map??'bloodgulch',gameVariant:'slayer'}]},'Add match')} title="Add a map and game-type pairing to the planned server rotation"><Plus size={15}/> Add match</button></div>
      <p>Select a map from the scanned list or enter a safe basename. An existing source .map is not automatically installed on every player's computer.</p>
      <datalist id="gs-ce-map-names">{readiness.verifiedMaps.map(m=><option key={m.sha256} value={m.map}/>)}</datalist>
      <datalist id="gs-ce-variant-names">{HALO_CE_STOCK_VARIANTS.map(v=><option key={v} value={v}/>)}{(server.gameTypes??[]).map(t=><option key={t.id} value={t.name}/>)}</datalist>
      {server.rotation.length===0&&<p className="subtle">Add your first map to create a private session rotation.</p>}
      {server.rotation.map((entry,i)=><div className="gs-match-row" key={entry.id}>
        <strong>#{nameFor(i)}</strong>
        <label title="Only a valid, hashed multiplayer .map from the selected installed CE runtime can pass preflight.">Map
          <input list="gs-ce-map-names" maxLength={64} value={entry.map} spellCheck={false}
            onChange={e=>patch({rotation:server.rotation.map(r=>r.id===entry.id?{...r,map:e.target.value}:r)},'Select map')}/>
        </label>
        <label title="Pick an official stock gametype or a native Halo-created variant declared in Game Type Workshop.">Game type
          <input list="gs-ce-variant-names" maxLength={64} spellCheck={false} value={entry.gameVariant}
            onChange={e=>patch({rotation:server.rotation.map(r=>r.id===entry.id?{...r,gameVariant:e.target.value}:r)},'Choose game type')}/>
        </label>
        <button aria-label={`Remove map rotation ${i+1}`} title="Remove this rotation entry without altering any installed maps" onClick={()=>patch({rotation:server.rotation.filter(r=>r.id!==entry.id)},'Remove map from rotation')}><Trash2 size={15}/></button>
      </div>)}
    </section>
    <section className="analysis-card">
      <div className="section-heading"><h2>Custom Game Type Workshop</h2><Pill>Native variant files not written</Pill></div>
      <p>Design Rockets, Snipers, or your own custom rules without editing <code>blam.lst</code>. Save the matching game type inside Halo CE's native multiplayer editor or a separately trusted tool. Only then declare its local source below. These controls record intent, not working game rules.</p>
      <div className="analysis-actions">
        <button onClick={()=>addDesign('standard')} disabled={(server.gameTypes??[]).length>=64} title="Start a custom variant design based on Slayer"><Plus size={15}/> New game type</button>
        <button onClick={()=>addDesign('rockets')} disabled={(server.gameTypes??[]).length>=64} title="Plan a Rockets variant; configure its actual starting weapons in Halo CE">Rockets template</button>
        <button onClick={()=>addDesign('zombie')} disabled={(server.gameTypes??[]).length>=64} title="Document the Zombie Apocalypse idea without falsely enabling multiplayer AI">Zombie design concept</button>
      </div>
      {(server.gameTypes??[]).map(t=><details className="gs-gametype" key={t.id}>
        <summary><strong>{t.name}</strong> <Pill tone={t.nativeStatus==='userConfirmedInGame'?'green':'muted'}>{t.nativeStatus==='userConfirmedInGame'?'Saved in game (user claim)':'Design only'}</Pill> <Pill tone={t.specialRules==='standard'?'muted':'amber'}>{t.specialRules}</Pill></summary>
        <div className="studio-fields">
          <label title="Exactly match the custom game type name stored in your Halo CE savegame folders.">Name<input maxLength={64} value={t.name} onChange={e=>updateGame(t.id,{name:e.target.value})}/></label>
          <label title="The Halo mode family determines the relevant native game-type options.">Base mode<select value={t.baseVariant} onChange={e=>updateGame(t.id,{baseVariant:e.target.value as GameTypeDesign['baseVariant']})}>
            {HALO_CE_BASE_FAMILIES.map(f=><option key={f} value={f}>{f}</option>)}</select></label>
          <label>Score goal <NumberField label="Score goal (design only)" value={t.scoreLimit} min={0} max={1000} step={1} onCommit={n=>updateGame(t.id,{scoreLimit:Math.round(n)})}/></label>
          <label>Time limit (min) <NumberField label="Game time limit (design only)" value={t.timeLimitMinutes} min={0} max={180} step={1} onCommit={n=>updateGame(t.id,{timeLimitMinutes:Math.round(n)})}/></label>
          <label>Respawn delay (sec) <NumberField label="Respawn delay (design only)" value={t.respawnSeconds} min={0} max={120} step={1} onCommit={n=>updateGame(t.id,{respawnSeconds:Math.round(n)})}/></label>
          <label title="An intended starting loadout. Halo CE itself or a compatible native editor must implement it.">Equipment intent<select value={t.startingEquipment} onChange={e=>updateGame(t.id,{startingEquipment:e.target.value as GameTypeDesign['startingEquipment']})}>
            <option value="mapDefault">Map default</option><option value="rockets">Rockets</option><option value="snipers">Snipers</option><option value="custom">Other / custom</option>
          </select></label>
          <label title="Special rules beyond stock Halo CE cannot be activated through init.txt.">Special rules<select value={t.specialRules} onChange={e=>updateGame(t.id,{specialRules:e.target.value as GameTypeDesign['specialRules'],nativeStatus:'draft',nativeEvidence:''})}>
            <option value="standard">Stock-mode rules only</option><option value="infectionConcept">Infection design (not implemented)</option><option value="firefightConcept">Firefight/AI design (not implemented)</option>
          </select></label>
          <label title="User declaration; Guilty Spark has not read or verified the binary native variant. Fill the evidence field below before confirming the status.">Native save status<select value={t.nativeStatus} onChange={e=>updateGame(t.id,{nativeStatus:e.target.value as GameTypeDesign['nativeStatus']})}>
            <option value="draft">Draft only</option><option value="userConfirmedInGame">I saved this named variant in Halo CE</option>
          </select></label>
        </div>
        <div className="gs-rule-switches">
          <label className="checkbox-label" title="Design intent: enable team-versus-team play in the actual variant editor"><input type="checkbox" checked={t.teamPlay} onChange={e=>updateGame(t.id,{teamPlay:e.target.checked})}/> Teams</label>
          <label className="checkbox-label" title="Design intent: friendly fire must be configured in Halo CE or a native editor"><input type="checkbox" checked={t.friendlyFire} onChange={e=>updateGame(t.id,{friendlyFire:e.target.checked})}/> Friendly fire</label>
        </div>
        <label title="Describe the source of the native variant, not a password or user directory path.">Local native save evidence (user declaration, no passwords)
          <input value={t.nativeEvidence} maxLength={180} placeholder="Example: Created under Halo CE → Multiplayer → Edit Game Types" onChange={e=>updateGame(t.id,{nativeEvidence:e.target.value})}/>
        </label>
        <label title="Record rules that can't yet be represented as stock Halo game-type data.">Rule design notes
          <textarea maxLength={1000} rows={2} value={t.notes} onChange={e=>updateGame(t.id,{notes:e.target.value})}/>
        </label>
        <div className="analysis-actions">
          <button title="Add this variant to the map rotation; native readiness is still separately required" onClick={()=>patch({rotation:[...server.rotation,{id:freshId(),map:readiness.verifiedMaps[0]?.map??'bloodgulch',gameVariant:t.name}]},'Add custom variant to rotation')} disabled={server.rotation.length>=128}>Add to rotation</button>
          <button title="Remove this design, not the native game type in Halo" onClick={()=>patch({gameTypes:(server.gameTypes??[]).filter(g=>g.id!==t.id)},'Remove custom game type')}><Trash2 size={14}/> Remove design</button>
        </div>
      </details>)}
      {!(server.gameTypes??[]).length&&<p className="subtle">No custom game type designs yet. Stock Slayer, CTF, Oddball, King, Race and other built-in types can be used directly in rotation.</p>}
      <Notice tone="info"><strong>Network AI boundary:</strong> Halo CE's stock multiplayer protocol does not synchronize AI behavior. A Zombie Apocalypse concept will remain blocked for network play until an engine-specific synchronization implementation passes real multi-client testing.</Notice>
    </section>
    <section className="analysis-card">
      <div className="section-heading"><h2><ShieldCheck size={18}/> Preflight and handoff</h2><Pill tone={readiness.readyForManualLocalTest?'green':'amber'}>{readiness.readyForManualLocalTest?'Ready for manual local test':'Blocked / inspection needed'}</Pill></div>
      <p>Green means the configuration, user declarations, and verified cache metadata agree—not that a server launched or a second player joined.</p>
      {readiness.findings.map((item,i)=><div className="gs-session-finding" key={i}>
        <Pill tone={item.severity==='blocker'?'amber':item.severity==='warning'?'muted':'green'}>{item.severity}</Pill>
        <span><strong>{item.code}</strong> — {item.message}</span>
      </div>)}
      {!readiness.findings.length&&<Notice tone="info">Map and variant preflight has no known blockers. This is still not a gameplay verification.</Notice>}
      {!!forge&&<details className="gs-gametype"><summary>Editable source scenario checklist ({sourceWarnings.length} advisories)</summary>
        <p className="subtle">These warnings concern the currently open QuickForge source, NOT the installed maps in the rotation. Resolve spawns and objectives in QuickForge and validate actual compiled map flags in Sapien.</p>
        {sourceWarnings.map((w,i)=><p key={i}><strong>{w.code}:</strong> {w.message}</p>)}
        {!sourceWarnings.length&&<p>No obvious spawn/objective issues in the authored source. Compiled engine checks are still required.</p>}
      </details>}
      <div className="analysis-actions">
        <button type="button" onClick={exportHandoff} title="Download a portable JSON handoff with design data, map hashes and explicit unresolved checks"><Download size={15}/> Export session plan JSON</button>
        <button type="button" disabled={!readiness.readyForManualLocalTest} onClick={exportBundle}
          title="Download a safe review ZIP: manifest, init.txt, and manual setup checklist, no copyrighted maps or credentials"><Download size={15}/> Export private session ZIP</button>
        <button type="button" className="primary" disabled={!readiness.readyForManualLocalTest} onClick={exportSafeConfig}
          title="Export a validated review-only init.txt; you must set up and run the Halo CE server yourself"><Download size={15}/> Export CE init.txt for review</button>
      </div>
      <small className="studio-hint">No server processes started; no UPnP, NAT, router, Windows Firewall, anti-cheat, installed maps, game types, or existing config files are modified.</small>
    </section>
  </div>;
}
