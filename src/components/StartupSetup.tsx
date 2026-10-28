import { useEffect,useRef,useState } from 'react';
import type { Bootstrap, RuntimeId, Settings, Workspace } from '../types';
import ConnectGames from './ConnectGames';
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
    id: 'haloPc',
    name: 'Halo PC',
    description: 'Preserve and inspect classic PC maps; runtime/tool support varies.',
  },
  {
    id: 'macDemo',
    name: 'Halo Demo / Mac preservation',
    description: 'Inspect owned legacy content on Windows. This does not run PowerPC game executables.',
  },
  {
    id: 'chupathingyCe',
    name: 'ChupathingyCE',
    description: 'Register this separately installed runtime in Runtimes & friends.',
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
  const [choice, setChoice] = useState<RuntimeId>(data.settings.preferredHalo ?? 'mccSteam'),
    [step, setStep] = useState(data.settings.onboardingCompleted ? 2 : data.settings.preferredHalo ? 1 : 0),
    [draft, setDraft] = useState(data.settings),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
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
            Open How-to & Glossary
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
            {halos.map((h) => (
              <button
                key={h.id}
                className={choice === h.id ? 'selected' : ''}
                aria-pressed={choice === h.id}
                onClick={() => setChoice(h.id)}
              >
                <strong>{h.name}</strong>
                <small>{h.description}</small>
                {h.id === 'mccSteam' && data.installation.mccPath && (
                  <span>MCC detected on this computer</span>
                )}
              </button>
            ))}
          </div>
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
          <ConnectGames
            data={data}
            onApply={onApply}
            navigate={navigate}
            mode="tools"
            onDraftChange={setDraft}
          />
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
    </section>
  );
}
