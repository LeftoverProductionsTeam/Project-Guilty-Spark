import ExternalBrowserLink from './ExternalBrowserLink';
import { useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import type { Bootstrap, RuntimeReport, Settings, Workspace } from '../types';
import { reconcileSettingsDraft } from '../settings';
interface Kit {
  root: string;
  generation: string;
  editableTags: string;
  sourceData: string;
  tools: {
    name: string;
    purpose: string;
    path: string | null;
    state: string;
    sha256: string | null;
    executed: boolean;
  }[];
  notes: string[];
  sdkArchive?: { path: string | null; state: string; bytes: number } | null;
}
interface SetupReport {
  schemaVersion: number;
  platform?: string;
  runtimes: RuntimeReport[];
  kits: Kit[];
  mccInstalled: boolean;
  invaderConfigured: boolean;
}
export default function ConnectGames({
  data,
  onApply,
  navigate,
  mode = 'all',
  onDraftChange,
}: {
  data: Bootstrap;
  onApply: (settings: Settings) => Promise<void>;
  navigate: (w: Workspace) => void;
  mode?: 'all' | 'tools';
  onDraftChange?: (settings: Settings) => void;
}) {
  const [report, setReport] = useState<SetupReport | null>(null),
    [draft, setDraft] = useState(data.settings);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  async function refresh() {
    setBusy(true);
    try {
      setReport(await call<SetupReport>('halo_setup_report'));
      setError('');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (native) void refresh();
  }, []);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const previousSettings = useRef(data.settings);
  useEffect(() => {
    const previous = previousSettings.current;
    setDraft((current) => reconcileSettingsDraft(current, previous, data.settings));
    previousSettings.current = data.settings;
  }, [data.settings]);
  useEffect(() => onDraftChange?.(draft), [draft]);
  async function browse(key: 'hekDirectory' | 'hekTagsDirectory' | 'invaderDirectory') {
    try {
      const chosen = await call<string | null>('choose_setting_path', { key });
      if (chosen) setDraft((d) => ({ ...d, [key]: chosen }));
    } catch (e) {
      setError(String(e));
    }
  }
  async function connect() {
    setBusy(true);
    try {
      await onApply(draft);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function prepare(sdkArchive?: string) {
    setBusy(true);
    setError('');
    setMessage(
      'Preparing a separate MCC tagset. This may require several GiB; storage is checked before extraction.',
    );
    try {
      await onApply(draft);
      const tags = await call<string>('prepare_mcc_conversion_tools', {
        projectId: null,
        ...(sdkArchive ? { sdkArchive } : {}),
      });
      if (!mounted.current) return;
      const connected = await call<Bootstrap>('bootstrap');
      if (!mounted.current) return;
      const current = latestDraft.current;
      if (
        current.hekDirectory !== draft.hekDirectory ||
        current.hekFlavor !== draft.hekFlavor ||
        current.hekTagsDirectory !== draft.hekTagsDirectory
      )
        throw Error(
          'Tool choices changed during preparation. Your newer choices are retained; review the prepared SDK in Settings.',
        );
      const next = {
        ...current,
        hekDirectory: connected.settings.hekDirectory,
        hekFlavor: 'h1aEk' as const,
        hekTagsDirectory: tags,
      };
      await onApply(next);
      setDraft(next);
      setMessage(
        'Prepared MCC tags are connected and saved. Build preflight still checks project dependencies.',
      );
      await refresh();
    } catch (e) {
      setError(String(e));
      setMessage('');
    } finally {
      setBusy(false);
    }
  }
  async function chooseSdk() {
    try {
      const selected = await call<string | null>('choose_setting_path', { key: 'hekSdkArchive' });
      if (selected) await prepare(selected);
    } catch (problem) {
      setError(String(problem));
    }
  }
  const installed = report?.runtimes.filter((r) => r.installation) ?? [];
  const foundKit = report?.kits.find((kit) => kit.generation.startsWith('h1aEk'));
  const wantsMcc = draft.preferredHalo ? draft.preferredHalo === 'mccSteam' : draft.hekFlavor === 'h1aEk';
  return (
    <section className="analysis-card gs-connect-games" aria-label="Connect Your Halo Games">
      <div className="section-heading">
        <div>
          <div className="section-label">YOUR HALO WORKBENCH</div>
          <h2>{mode === 'tools' ? 'Your editing tools' : 'Connect Your Halo Games'}</h2>
        </div>
        <button className="small-button" disabled={!native || busy} onClick={() => void refresh()}>
          Check installations
        </button>
      </div>
      <div className={`gs-connection-steps ${mode === 'tools' ? 'gs-tools-only' : ''}`}>
        {mode === 'all' && (
          <article>
            <h3>1 · Your games</h3>
            <p>
              Keep each Halo edition connected separately. A game supplies playable content; an editing kit
              supplies authoring tools.
            </p>
            {installed.map((r) => (
              <p key={r.id}>
                <strong>{r.name}</strong>
                <br />
                {r.installation?.identity}
                <br />
                <small>{r.installation?.validation} · file inspection; gameplay untested</small>
              </p>
            ))}
            {!installed.length && (
              <p>
                {native
                  ? 'No registered game found yet. Choose your installed runtime folder below.'
                  : 'Open the desktop app to detect installed games.'}
              </p>
            )}
            <button className="small-button" onClick={() => navigate('runtimes')}>
              Connect another Halo edition
            </button>
            <details>
              <summary>All supported runtime records</summary>
              <ul>
                {report?.runtimes.map((r) => (
                  <li key={r.id}>
                    {r.name} · {r.installation ? 'registered' : 'not detected / not registered'}
                  </li>
                ))}
              </ul>
              <p>
                Mac, HaloMD and Trial remain preservation targets on Windows; importing their maps does not
                validate a local game runtime.
              </p>
            </details>
          </article>
        )}
        <article>
          <h3>2 · Your Map Builder</h3>
          <p>
            {!wantsMcc
              ? 'Choose the editing kit that matches your target: legacy HEK for Halo Custom Edition, or the MCC kit when rebuilding for MCC. Map inspection can be used before connecting tools.'
              : foundKit
                ? 'Halo: CE Mod Tools - MCC was found. Select the detected kit below, then prepare or connect its editable tags.'
                : `${report?.mccInstalled ? 'MCC is installed, but its map-building tools are a separate installation. ' : ''}Install the free Halo: CE Mod Tools - MCC package through Steam to edit and compile Halo 1 content.`}
          </p>
          {wantsMcc && (
            <>
              <ExternalBrowserLink
                className="button"
                href="https://store.steampowered.com/app/1532190/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Steam listing
              </ExternalBrowserLink>
              <p>
                <small>
                  Steam Library → Tools → Halo: CE Mod Tools - MCC → Install. Follow the kit’s supplied tag
                  extraction instructions into a fresh working copy.
                </small>
              </p>
            </>
          )}
          {wantsMcc && foundKit && (
            <button
              className="small-button"
              disabled={busy}
              onClick={() =>
                setDraft({
                  ...draft,
                  hekDirectory: foundKit.root,
                  hekFlavor: 'h1aEk',
                  hekTagsDirectory: draft.hekFlavor === 'h1aEk' ? draft.hekTagsDirectory : null,
                })
              }
            >
              Use detected MCC editing kit
            </button>
          )}
          <label>
            Map Builder folder
            <input
              aria-label="Setup Map Builder folder"
              value={draft.hekDirectory ?? ''}
              placeholder="C:\SteamLibrary\steamapps\common\HCEEK"
              onChange={(e) => setDraft({ ...draft, hekDirectory: e.target.value || null })}
            />
          </label>
          <button
            className="small-button"
            disabled={!native || busy}
            onClick={() => void browse('hekDirectory')}
          >
            Browse Map Builder
          </button>
          <label>
            Editing kit generation
            <select
              aria-label="Setup editing kit generation"
              value={draft.hekFlavor ?? ''}
              onChange={(e) =>
                setDraft({ ...draft, hekFlavor: (e.target.value || null) as Settings['hekFlavor'] })
              }
            >
              <option value="">Select the installed kit</option>
              <option value="h1aEk">MCC · H1A editing kit</option>
              <option value="legacyHek">Custom Edition · legacy HEK</option>
            </select>
          </label>
        </article>
        <article>
          <h3>3 · Editable Halo Tags</h3>
          <p>
            The game data files that describe weapons, vehicles, enemies, textures and level settings. Halo’s
            editing tools use these files to build maps.
          </p>
          <label>
            Editable Halo Tags folder
            <input
              aria-label="Setup Editable Halo Tags folder"
              value={draft.hekTagsDirectory ?? ''}
              placeholder="C:\HaloProjects\MyTagset\tags"
              onChange={(e) => setDraft({ ...draft, hekTagsDirectory: e.target.value || null })}
            />
          </label>
          <button
            className="small-button"
            disabled={!native || busy}
            onClick={() => void browse('hekTagsDirectory')}
          >
            Browse Editable Halo Tags
          </button>
          <p>
            <small>
              Source images and models belong in the kit’s data folder. The Level Editor reconnects verified
              legacy textures and MCC texture packs when needed. Self-contained maps load embedded textures.
            </small>
          </p>
          {draft.hekFlavor === 'h1aEk' && report?.platform !== 'linux' && report?.platform !== 'macos' && (
            <>
              <button disabled={!native || busy || !draft.hekDirectory} onClick={() => void prepare()}>
                Prepare MCC editable tags
              </button>
              <p>
                <small>
                  Extracts only tags from your installed SDK into Spark’s working cache. Existing complete MCC
                  tags are reused.
                </small>
              </p>
            </>
          )}
          <div className="button-row">
            {wantsMcc && report?.platform !== 'linux' && report?.platform !== 'macos' && (
              <button type="button" disabled={!native || busy} onClick={() => void chooseSdk()}>
                Choose SDK archive &amp; prepare tags
              </button>
            )}
            <ExternalBrowserLink
              href="https://learn.microsoft.com/en-us/halo-master-chief-collection/general/overview-tools"
              target="_blank"
              rel="noopener noreferrer"
            >
              Official tools &amp; SDK install guide
            </ExternalBrowserLink>
          </div>
          <p>
            <small>
              Already have source? Choose its editable tags folder above. Otherwise select the installed SDK
              .7z file, including one outside the tool folder. Spark prepares a separate tagset and remembers
              it; it does not move the archive or overwrite existing tags. The archive supplies MCC source; CE
              still needs a separately reviewed compatible tagset.
            </small>
          </p>
          <button
            disabled={!native || busy || !draft.hekDirectory || !draft.hekFlavor}
            onClick={() => void connect()}
          >
            Check and connect editing kit
          </button>
          <h3>Invader tools</h3>
          <p>
            Used for classic map extraction, tag checks and native camera script preparation. Select the
            extracted tools folder containing invader-info, invader-extract, invader-edit and invader-script.
          </p>
          <label>
            Invader tools folder
            <input
              aria-label="Setup Invader tools folder"
              value={draft.invaderDirectory ?? ''}
              placeholder="C:\HaloTools\Invader"
              onChange={(e) => setDraft({ ...draft, invaderDirectory: e.target.value || null })}
            />
          </label>
          <button
            className="small-button"
            disabled={!native || busy}
            onClick={() => void browse('invaderDirectory')}
          >
            Browse Invader tools
          </button>
          <ExternalBrowserLink href="https://github.com/SnowyMouse/invader/releases" target="_blank" rel="noopener noreferrer">
            Official Invader releases
          </ExternalBrowserLink>
        </article>
      </div>
      {report?.kits.length === 0 && (
        <p role="status">
          No editing kit detected. MCC by itself does not include Map Builder, Guerilla, Sapien or Standalone.
        </p>
      )}
      {report?.kits.map((kit) => (
        <details key={kit.root}>
          <summary>{kit.generation} · tools found and file checks</summary>
          <p className="path-text">{kit.root}</p>
          <p>{kit.editableTags}</p>
          {kit.sdkArchive && (
            <p>
              <strong>SDK archive found</strong> · {kit.sdkArchive.state}
              <br />
              <small className="path-text">{kit.sdkArchive.path}</small>
            </p>
          )}
          <p>{kit.sourceData}</p>
          <ul>
            {kit.tools.map((t) => (
              <li key={t.name}>
                <strong>{t.purpose}</strong> · {t.state}
                <br />
                <small className="path-text">{t.path ?? 'Select a complete editing-kit folder'}</small>
              </li>
            ))}
          </ul>
          <details>
            <summary>Advanced Diagnostics · file identities</summary>
            <pre>{JSON.stringify(kit, null, 2)}</pre>
          </details>
        </details>
      ))}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <p>
        <ExternalBrowserLink href="https://c20.reclaimers.net/h1/h1-ek/" target="_blank" rel="noopener noreferrer">
          Community editing-kit guide
        </ExternalBrowserLink>{' '}
        ·{' '}
        <ExternalBrowserLink href="https://c20.reclaimers.net/general/mod-tools/" target="_blank" rel="noopener noreferrer">
          Steam installation steps
        </ExternalBrowserLink>
      </p>
    </section>
  );
}
