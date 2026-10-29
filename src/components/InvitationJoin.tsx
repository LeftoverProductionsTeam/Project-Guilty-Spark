import { useEffect, useRef, useState } from 'react';
import { Link2, Play, ShieldCheck } from 'lucide-react';
import { call, native } from '../api';
import { useMapState } from '../mapSession';
import type { RuntimeId } from '../types';
import { Notice, Pill } from './ui';

type Client = 'mccSteam' | 'chupathingyCe' | 'openCe' | 'webOpenCe';
interface Preview {
  id: string | null;
  expiresAtUnix: number;
  executable: string | null;
  executableSha256: string | null;
  dataRoot: string | null;
  route: {
    kind: string;
    client: Client;
    canHandoff: boolean;
    translationStatus: string;
    detail: string;
    requirements: string[];
    gameplayVerified: false;
  };
}
const names: Record<Client, string> = {
  mccSteam: 'Halo 1 · MCC (Steam)',
  chupathingyCe: 'ChupathingyCE',
  openCe: 'OpenCE native',
  webOpenCe: 'OpenCE web client',
};

export default function InvitationJoin({
  mapId,
  runtime,
  onRuntime,
  onSetup,
}: {
  mapId: string;
  runtime: RuntimeId;
  onRuntime: (runtime: RuntimeId) => void;
  onSetup: () => void;
}) {
  const [client, setClient] = useMapState<Client>(
    mapId,
    'invitation.client',
    runtime === 'chupathingyCe' || runtime === 'openCe' ? runtime : 'mccSteam',
  );
  const [value, setValue] = useState(''),
    [preview, setPreview] = useState<Preview | null>(null),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setPreview(null);
    setConsent(false);
    setBusy(false);
    setError('');
    setMessage('');
    return () => {
      generation.current++;
    };
  }, [mapId, client]);
  async function inspect() {
    const request = ++generation.current;
    setBusy(true);
    setError('');
    setMessage('');
    setConsent(false);
    setPreview(null);
    try {
      const next = await call<Preview>('invitation_prepare', { invitation: value, client });
      if (request === generation.current) {
        setPreview(next);
        setValue('');
      }
    } catch (e) {
      if (request === generation.current) setError(String(e));
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  async function handoff() {
    if (!preview?.id || !preview.route.canHandoff || !consent) return;
    const request = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const result = await call<{ status: string; detail: string }>('invitation_handoff', {
        previewId: preview.id,
        confirmed: consent,
      });
      if (request === generation.current) {
        setMessage(result.detail);
        setPreview(null);
        setConsent(false);
      }
    } catch (e) {
      if (request === generation.current) {
        setError(String(e));
        setPreview(null);
      }
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  return (
    <section className="analysis-card invitation-join" aria-label="Join by invitation">
      <div className="section-heading">
        <h2>
          <Link2 size={16} />
          Join by invitation
        </h2>
        <Pill>Private · kept in memory</Pill>
      </div>
      <p>
        Paste a community game link, an MCC Steam lobby invitation, or an official OpenCE web room/game link.
        Spark checks the requested client and shows whether it can hand off the invitation or needs a protocol
        bridge.
      </p>
      <div className="button-row">
        <label className="invitation-input">
          Invitation
          <input
            aria-label="Game invitation"
            type="password"
            value={value}
            disabled={busy}
            maxLength={2048}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setValue(e.target.value);
              setPreview(null);
              setConsent(false);
            }}
            placeholder="Paste invitation…"
          />
        </label>
        <label>
          Join with
          <select
            aria-label="Invitation game client"
            value={client}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.value as Client;
              setClient(next);
              if (next !== 'webOpenCe') onRuntime(next);
            }}
          >
            {Object.entries(names).map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button disabled={!native || busy || !value.trim()} onClick={() => void inspect()}>
          <ShieldCheck size={14} />
          {busy ? 'Checking…' : 'Check invitation & adapter'}
        </button>
      </div>
      {!native && (
        <Notice tone="info">
          Invitation preparation and native client inspection require the desktop app.
        </Notice>
      )}
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="info">{message}</Notice>}
      {preview && (
        <div aria-live="polite">
          <h3>
            {preview.route.canHandoff ? 'Client handoff available' : 'Protocol bridge / setup required'}
          </h3>
          <p>{preview.route.detail}</p>
          {preview.route.translationStatus === 'mccProtocolBridgeMissing' && (
            <Notice>
              MCC-to-OpenCE/Chupathingy/WebRTC gameplay translation is not implemented. Recognizing or
              rewriting the invitation does not translate game packets, players or actors. This route cannot
              join through MCC.
            </Notice>
          )}
          {preview.executable && (
            <p className="path-text">
              Inspected client: {preview.executable}
              <br />
              <small>SHA-256: {preview.executableSha256}</small>
              {preview.dataRoot&&<><br/>Content folder: {preview.dataRoot}</>}
            </p>
          )}
          {preview.route.requirements.map((item) => (
            <p className="subtle" key={item}>
              {item}
            </p>
          ))}
          {preview.id && preview.route.canHandoff ? (
            <>
              <label className="toggle-setting">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                Open this invitation in {names[client]}.{' '}
                {client === 'webOpenCe'
                  ? 'The website may download its runtime and requires my own compatible game data.'
                  : 'The game will validate the lobby and content.'}
              </label>
              <button disabled={!consent || busy} onClick={() => void handoff()}>
                <Play size={14} />
                Hand invitation to client
              </button>
            </>
          ) : (
            <button onClick={onSetup}>Open runtime &amp; dependency setup</button>
          )}
        </div>
      )}
      <p className="subtle">
        A client launch is not an observed connection. MCC uses its own lobby/game protocol; a community
        invitation cannot be turned into an MCC lobby ID. The eight-player campaign/Firefight and 128-player
        goals need engine support and separate game acceptance.
      </p>
    </section>
  );
}
