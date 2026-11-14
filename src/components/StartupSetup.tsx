import {PREFERRED_RUNTIME,runtimeProfileLabel,runtimeProfileName,type OpenCeFlavor} from '../runtimeWorkbench';
import { useEffect,useRef,useState } from 'react';
import { Check, FolderOpen, Gamepad2, Layers3, Hammer, Users, type LucideIcon } from 'lucide-react';
import type { Bootstrap, RuntimeId, Settings, Workspace } from '../types';
import { call, native } from '../api';
import ConnectGames from './ConnectGames';
import CustomEditionSetup from './CustomEditionSetup';
import { primaryRuntimes, useRuntimeConnections } from '../useRuntimeConnections';
const halos: { id: RuntimeId; name: string; icon: LucideIcon; description: string; bestFor: string; offers: string[] }[] = [
  {
    id: 'mccSteam',
    name: 'Halo CE in MCC',
    icon: Gamepad2,
    description: 'The official Halo collection, with classic and remastered Combat Evolved.',
    bestFor: 'Creating and playing MCC mods.',
    offers: ['Campaign & multiplayer', 'Steam Workshop', 'Official mod tools'],
  },
  {
    id: 'haloCustomEdition',
    name: 'Halo Custom Edition',
    icon: Hammer,
    description: 'The classic PC edition built for community maps and Halo modding.',
    bestFor: 'Classic custom maps and original editing tools.',
    offers: ['Custom maps', 'Dedicated servers', 'Halo Editing Kit'],
  },
  {
    id: 'chupathingyCe',
    name: 'ChupathingyCE',
    icon: Users,
    description: 'A community Halo port bringing the Xbox experience to modern devices.',
    bestFor: 'Co-op and split-screen with friends.',
    offers: ['Online campaign co-op', 'Split-screen', 'Community servers'],
  },
  {
    id: 'arenaEvolved', name: 'Arena Evolved', icon: Users,
    description: 'An independent community Halo runtime with bots, custom modes and owned MCC map support.',
    bestFor: 'Exploring Arena Evolved multiplayer and dedicated hosting.',
    offers: ['Owned MCC & CE content', 'Bots & custom modes', 'Version-specific compatibility'],
  },
  {
    id: 'openCe',
    name: 'OpenCE Flavors',
    icon: Layers3,
    description: 'Choose OpenCE, Faber or OpenH1 for your Halo projects.',
    bestFor: 'Community engines, co-op and custom maps.',
    offers: ['Online campaign co-op', 'Custom Edition maps', 'Map downloads'],
  },
];
halos.sort((a,b)=>Number(b.id===PREFERRED_RUNTIME)-Number(a.id===PREFERRED_RUNTIME));
export default function StartupSetup({
  data,
  onApply,
  navigate,
  onSetupFlavor,
}: {
  data: Bootstrap;
  onApply: (settings: Settings) => Promise<void>;
  navigate: (w: Workspace) => void;
  onSetupFlavor: (flavor: OpenCeFlavor) => void;
}) {
  const connections = useRuntimeConnections(data);
  const [choice, setChoice] = useState<RuntimeId>(data.settings.preferredHalo ?? PREFERRED_RUNTIME),
    [step, setStep] = useState(data.settings.onboardingCompleted ? 2 : data.settings.preferredHalo ? 1 : 0),
    [draft, setDraft] = useState(data.settings),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const selectedRuntime = connections.reports.find(item => item.id === choice);
  const selectedCandidate = connections.detected.find(item => item.runtimeId === choice);
  const [modDirectory, setModDirectory] = useState(data.settings.modDirectory ?? '');
  const [choosingMods, setChoosingMods] = useState(false);
  const [modError, setModError] = useState('');
  const flavorIntent=useRef(0);
  const flavorProfiles=connections.profiles.filter(profile=>profile.runtimeId==='openCe');
  const flavorProfile=flavorProfiles.find(profile=>profile.id===connections.reports.find(report=>report.id==='openCe')?.installation?.registrationId)??flavorProfiles[0];
  const selectedHaloName=choice==='openCe'&&flavorProfile?runtimeProfileName(flavorProfile):halos.find(halo=>halo.id===choice)?.name;
  async function selectFlavor(key:string) {
    const intent=++flavorIntent.current;
    if(key.startsWith('setup:')){setChoice('openCe');onSetupFlavor(key.slice(6) as OpenCeFlavor);return;}
    const profile=flavorProfiles.find(profile=>'profile:'+profile.id===key);if(!profile)return;
    setBusy(true);setError('');
    try{
      await call('activate_runtime_registration',{registrationId:profile.id});
      window.dispatchEvent(new Event('guilty-spark-runtime-connections-changed'));
      if(mounted.current&&intent===flavorIntent.current)setChoice('openCe');
    }catch(problem){if(mounted.current&&intent===flavorIntent.current)setError(String(problem));}
    finally{if(mounted.current)setBusy(false);}
  }
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(() => {
    if (step !== 1 || !native) return;
    let current = true;
    void call<{ modDirectory: string }>('storage_mod_locations').then(locations => {
      if (current) setModDirectory(locations.modDirectory);
    }).catch(problem => { if (current) setModError(String(problem)); });
    return () => { current = false; };
  }, [step]);
  async function chooseModFolder() {
    if (!native || choosingMods) return;
    setChoosingMods(true);
    setModError('');
    try {
      const locations = await call<{ modDirectory: string }>('storage_choose_mod_location', { runtimeId: null, reset: false });
      if (mounted.current) setModDirectory(locations.modDirectory);
    } catch (problem) {
      if (mounted.current) setModError(String(problem));
    } finally {
      if (mounted.current) setChoosingMods(false);
    }
  }
  async function save(settings: Settings, next: number) {
    setBusy(true);
    setError('');
    try {
      await onApply(settings);
      if(!mounted.current)return;
      setDraft(settings);
      setStep(next);
      if (settings.onboardingCompleted) navigate('how-to');
    } catch (error) {
      if(mounted.current)setError(String(error));
    } finally {
      if(mounted.current)setBusy(false);
    }
  }
  if (step === 2)
    return (
      <section className="analysis-card gs-setup-saved">
        <h2>Your workbench is ready</h2>
        <p>
          {halos.find((h) => h.id === (data.settings.preferredHalo ?? choice))?.name ?? 'Your Halo'} · game
          and tool choices are saved on this device.
        </p>
        <p>Setup will not reopen on each boot. Change these choices here whenever you need to.</p>
        <p className="subtle">Using several engines? In Games &amp; tools → Runtime folders, share one compatible content library across OpenCE, Faber and Chupathingy. Keep Xbox maps in maps and CE maps/resources in maps_ce; stock CE and MCC keep their own native layouts.</p>
        <div className="analysis-actions">
          <button className="primary" onClick={() => navigate('how-to')}>
            Open Learning center
          </button>
          <button onClick={() => setStep(0)}>Change Halo or tools</button>
        </div>
      </section>
    );
  return (
    <section className="gs-first-setup" aria-label="First launch Halo setup">
      <ol className="gs-setup-progress" aria-label="Setup progress">
        <li aria-current={step === 0 ? 'step' : undefined}>1 · Choose your Halo</li>
        <li aria-current={step === 1 ? 'step' : undefined}>2 · Connect tools</li>
        <li>3 · Learning center</li>
      </ol>
      {step === 0 ? (
        <section className="analysis-card">
          <h2>Which Halo are you working with?</h2>
          <p className="subtle">Chupathingy is Spark’s recommended runtime. You can also connect MCC, Custom Edition, OpenCE and other compatible editions.</p>
          <p>
            Choose where you want to create and play. You can switch later or connect more than one Halo.
          </p>
          <div className="gs-halo-choices" role="group" aria-label="Your Halo edition">
            {primaryRuntimes.map(id => halos.find(h => h.id === id)!).map((h) => {
              const installed = connections.reports.find(item => item.id === h.id)?.installation;
              const candidate = connections.detected.find(item => item.runtimeId === h.id);
              const connected = installed?.validation === 'pass';
              const status = connected ? 'Connected' : candidate ? (candidate.contentReady ? 'Detected' : 'Needs content') : connections.checking ? 'Checking…' : 'Not connected';
              const RuntimeIcon = h.icon;
              const card = (
              <button
                key={h.id}
                className={choice === h.id ? 'selected' : ''}
                aria-pressed={choice === h.id}
                data-connected={connected}
                title={installed?.root ?? candidate?.root ?? h.description}
                onClick={() => {flavorIntent.current++;setChoice(h.id);}}
              >
                <span className="gs-halo-card-heading">
                  <span className="gs-halo-emblem" aria-hidden="true"><RuntimeIcon size={25} strokeWidth={1.6} /></span>
                  <strong>{h.name}</strong>
                  {choice === h.id && <Check className="gs-halo-selected" size={15} aria-hidden="true" />}
                </span>
                <small className="gs-halo-description">{h.description}</small>
                <span className="gs-halo-best-for"><b>Best for</b> {h.bestFor}</span>
                <span className="gs-halo-offers" aria-label="Runtime features">{h.offers.map(offer => <span key={offer}>{offer}</span>)}</span>
                <span className="gs-halo-status" data-ready={connected || !!candidate?.contentReady}><i aria-hidden="true" />{status}</span>
              </button>
              );
              return h.id==='openCe'?<div key={h.id} className={'gs-halo-flavors-card'+(choice===h.id?' selected':'')} data-connected={connected}>
                {card}
                <label className="gs-setup-flavor"><span>OpenCE flavor</span>
                  <select aria-label="Setup OpenCE flavor" disabled={busy} value={flavorProfile?'profile:'+flavorProfile.id:''} onChange={event=>void selectFlavor(event.target.value)}>
                    <option value="" disabled>Choose a flavor…</option>
                    {flavorProfiles.length>0&&<optgroup label="Connected engines">{flavorProfiles.map(profile=><option key={profile.id} value={'profile:'+profile.id}>{runtimeProfileLabel(profile)}</option>)}</optgroup>}
                    <optgroup label="Connect or install">{([['opence','OpenCE'],['faber','Faber'],['openh1','OpenH1'],['forerunner','Forerunner']] as const).filter(([,name])=>!flavorProfiles.some(profile=>runtimeProfileName(profile)===name)).map(([id,name])=><option key={id} value={'setup:'+id}>{name} · setup</option>)}</optgroup>
                  </select>
                </label>
              </div>:card;
            })}
          </div>
          <details className="gs-legacy-targets"><summary>Legacy import and export targets</summary>
            <p>Halo PC, Xbox, Demo, Mac and HaloMD remain available through advanced import, export and build targets. A preserved map does not establish a connected game installation.</p>
          </details>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void save({ ...data.settings, preferredHalo: choice, onboardingCompleted: false }, 1)
            }
          >
            {busy?'Saving Halo choice…':'Continue to tools'}
          </button>
        </section>
      ) : (
        <>
          <p>
            Your Halo: <strong>{selectedHaloName}</strong>. Existing tool folders are
            prefilled. Connect them now or keep the editor available and configure them later.
          </p>
          <div className="analysis-actions gs-setup-connection" aria-label="Selected runtime connection">
            <span>{selectedRuntime?.installation?.validation === 'pass' ? 'Connected · installation verified' : selectedCandidate ? selectedCandidate.detail : 'Connect your game separately from its editing tools.'}</span>
            {selectedCandidate && <button disabled={!!connections.connecting} onClick={() => void connections.connect(selectedCandidate)}>
              {connections.connecting ? 'Connecting…' : 'Connect detected game'}
            </button>}
            <button onClick={() => navigate('runtimes')}>Runtime setup</button>
          </div>
          <details className="gs-setup-mod-folder">
            <summary>Mods &amp; exported maps · optional</summary>
            <p>Would you like to choose a folder for your Halo mods and exported maps?</p>
            <div><code>{modDirectory || 'Spark’s separate Mods folder (default)'}</code>
              <button disabled={!native || busy || choosingMods} onClick={() => void chooseModFolder()}>
                <FolderOpen size={14} />{choosingMods ? 'Choosing…' : 'Choose mod folder'}
              </button>
            </div>
            <small>Keep the default or choose your own location. Original game maps stay in place. Change folders and per-Halo export preferences later in Settings → Storage.</small>
            {modError && <p role="status">{modError} You can continue setup and choose a folder later.</p>}
          </details>
          <ConnectGames
            data={data}
            onApply={onApply}
            navigate={navigate}
            mode="tools"
            onDraftChange={setDraft}
          />
          {choice === 'haloCustomEdition' && <CustomEditionSetup />}
          <div className="analysis-actions">
            <button disabled={busy} onClick={() => setStep(0)}>
              Back to Halo choice
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void save({ ...draft, preferredHalo: choice, onboardingCompleted: true }, 2)}
            >
              Save setup & open help
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void save({ ...data.settings, preferredHalo: choice, onboardingCompleted: true }, 2)
              }
            >
              Configure tools later
            </button>
          </div>
        </>
      )}
      {busy&&<p role="status">Saving your selection. You can still use the sidebar while setup finishes.</p>}
      {error && <p role="alert">{error}</p>}
      {connections.error && <p role="status">{connections.error}</p>}
    </section>
  );
}
