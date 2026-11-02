import { useEffect,useRef,useState } from 'react';
import type { Bootstrap, RuntimeId, Settings, Workspace } from '../types';
import ConnectGames from './ConnectGames';
import CustomEditionSetup from './CustomEditionSetup';
import { primaryRuntimes, useRuntimeConnections } from '../useRuntimeConnections';
const halos: { id: RuntimeId; name: string; description: string }[] = [
  {
    id: 'mccSteam',
    name: 'Halo CE in MCC',
    description: 'Steam MCC plus the separate Halo: CE Mod Tools - MCC kit.',
  },
  {
    id: 'haloCustomEdition',
    name: 'Halo Custom Edition',
    description: 'Classic CE with a matching HEK or explicitly reviewed compatible tagset.',
  },
  {
    id: 'chupathingyCe',
    name: 'ChupathingyCE',
    description: 'Register this separately installed runtime in Online.',
  },
  {
    id: 'openCe',
    name: 'OpenCE',
    description: 'Keep this runtime’s tools, content and compatibility evidence separate.',
  },
];
export default function StartupSetup({
  data,
  onApply,
  navigate,
}: {
  data: Bootstrap;
  onApply: (settings: Settings) => Promise<void>;
  navigate: (w: Workspace) => void;
}) {
  const connections = useRuntimeConnections(data);
  const [choice, setChoice] = useState<RuntimeId>(data.settings.preferredHalo ?? 'mccSteam'),
    [step, setStep] = useState(data.settings.onboardingCompleted ? 2 : data.settings.preferredHalo ? 1 : 0),
    [draft, setDraft] = useState(data.settings),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const selectedRuntime = connections.reports.find(item => item.id === choice);
  const selectedCandidate = connections.detected.find(item => item.runtimeId === choice);
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
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
        <li>3 · How-to & Glossary</li>
      </ol>
      {step === 0 ? (
        <section className="analysis-card">
          <h2>Which Halo are you working with?</h2>
          <p>
            Choose your main edition. You can connect more editions later, each with its own tools and build
            targets.
          </p>
          <div className="gs-halo-choices" role="group" aria-label="Your Halo edition">
            {primaryRuntimes.map(id => halos.find(h => h.id === id)!).map((h) => {
              const installed = connections.reports.find(item => item.id === h.id)?.installation;
              const candidate = connections.detected.find(item => item.runtimeId === h.id);
              const connected = installed?.validation === 'pass';
              const status = connected ? 'Connected' : candidate ? (candidate.contentReady ? 'Detected' : 'Needs content') : connections.checking ? 'Checking…' : 'Not connected';
              return (
              <button
                key={h.id}
                className={choice === h.id ? 'selected' : ''}
                aria-pressed={choice === h.id}
                data-connected={connected}
                title={installed?.root ?? candidate?.root ?? h.description}
                onClick={() => setChoice(h.id)}
              >
                <strong>{h.name}</strong>
                <small>{h.description}</small>
                <span>{status}</span>
              </button>
              );
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
            Your Halo: <strong>{halos.find((h) => h.id === choice)?.name}</strong>. Existing tool folders are
            prefilled. Connect them now or keep the editor available and configure them later.
          </p>
          <div className="analysis-actions gs-setup-connection" aria-label="Selected runtime connection">
            <span>{selectedRuntime?.installation?.validation === 'pass' ? 'Connected · installation verified' : selectedCandidate ? selectedCandidate.detail : 'Connect your game separately from its editing tools.'}</span>
            {selectedCandidate && <button disabled={!!connections.connecting} onClick={() => void connections.connect(selectedCandidate)}>
              {connections.connecting ? 'Connecting…' : 'Connect detected game'}
            </button>}
            <button onClick={() => navigate('runtimes')}>Runtime setup</button>
          </div>
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
