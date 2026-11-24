import { useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import { relocateRuntimeRegistration,type CompanionRuntimeDiscovery } from '../runtimeWorkbench';
import type { RuntimeReport, RuntimeRegistration, RuntimeInstallation } from '../types';
import { Notice, Pill } from './ui';
const tone = (status: string) => (status === 'pass' ? 'green' : 'amber');

export default function Registration({
  report,
  onRegistered,
  initialOpen = false,
}: {
  report: RuntimeReport;
  initialOpen?: boolean;
  onRegistered: (reports: RuntimeReport[]) => void;
}) {
  const installation = report.installation;
  const [draft, setDraft] = useState<RuntimeRegistration>({
    id: installation?.registrationId ?? crypto.randomUUID(),
    runtimeId: report.id,
    root: installation?.root ?? '',
    executable: installation?.executable ?? '',
    dataRoot: installation?.dataRoot ?? null,
    version: installation?.version ?? null,
    networkVersion: installation?.networkVersion ?? null,
  });
  const [profiles, setProfiles] = useState<RuntimeRegistration[]>([]);
  useEffect(() => {
    let current = true;
    if (native)
      void call<RuntimeRegistration[]>('list_runtime_registrations')
        .then((items) => {
          if (current) {setProfiles(items);const stored=items.find(item=>item.id===installation?.registrationId);if(stored)setDraft(value=>['id','runtimeId','root','executable','dataRoot','version','networkVersion'].every(key=>value[key as keyof RuntimeRegistration]===stored[key as keyof RuntimeRegistration])?stored:value);}
        })
        .catch((e) => {
          if (current) setError(String(e));
        });
    return () => {
      current = false;
    };
  }, [report.id, report.installation?.registrationId]);
  async function useProfile(id: string) {
    const chosen = profiles.find((item) => item.id === id);
    if (!chosen) return;
    setBusy(true);
    setError('');
    setMessage('');
    // A stale executable must remain editable even when strict activation refuses it.
    // Selection opens its saved draft; activation still requires the existing checks.
    setDraft(chosen);
    setInspection(null);
    setInspected('');
    setCompanion(null);
    companionRequest.current++;
    try {
      onRegistered(await call<RuntimeReport[]>('activate_runtime_registration', { registrationId: id }));
      window.dispatchEvent(new Event('guilty-spark-runtime-connections-changed'));
    } catch (e) {
      setError('Saved profile opened for review; activation was refused. '+String(e));
    } finally {
      setBusy(false);
    }
  }
  async function prepareCe() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await call<{ copied: string[]; reused: string[]; bytesCopied: number }>(
        'prepare_runtime_ce_resources',
        { registrationId: draft.id, expectedDataRoot: draft.dataRoot || draft.root },
      );
      setMessage(
        'Custom Edition support ready: ' +
          result.copied.length +
          ' banks added, ' +
          result.reused.length +
          ' reused. Original files are unchanged.',
      );
      window.dispatchEvent(new Event('guilty-spark-runtime-connections-changed'));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const [inspection, setInspection] = useState<RuntimeInstallation | null>(null);
  const [inspected, setInspected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const fingerprint = JSON.stringify(draft);
  const [companion,setCompanion]=useState<CompanionRuntimeDiscovery|null>(null);
  const companionContext=useRef(fingerprint);
  companionContext.current=fingerprint;
  const companionRequest=useRef(0);
  useEffect(()=>setCompanion(null),[fingerprint]);
  useEffect(()=>()=>{companionRequest.current+=1;},[]);
  async function readCompanion(){
    if(busy||!inspection?.executableSha256||inspected!==fingerprint||
      !profiles.some(profile=>profile.id===draft.id&&JSON.stringify(profile)===fingerprint))return;
    const request=++companionRequest.current;
    const selectedFingerprint=fingerprint;
    const selectedSha=inspection.executableSha256;
    const current=()=>companionRequest.current===request&&companionContext.current===selectedFingerprint;
    setBusy(true);setError('');setCompanion(null);
    try{
      const response=await call<CompanionRuntimeDiscovery>('inspect_companion_runtime',{registrationId:draft.id,expectedExecutableSha256:selectedSha});
      if(!current())return;
      if(response.registrationId!==draft.id||response.executableSha256!==selectedSha)throw new Error('Runtime identity changed during discovery. Inspect the selected profile again.');
      setCompanion(response);
    }
    catch(problem){if(current())setError(String(problem));}
    finally{if(companionRequest.current===request)setBusy(false);}
  }
  async function reviewCompanion(){
    const response=companion,selectedFingerprint=fingerprint;
    if(busy||!response?.dependencySha256||response.reviewIssue||!response.capabilitiesSha256||inspected!==fingerprint||response.executableSha256!==inspection?.executableSha256||!profiles.some(profile=>profile.id===draft.id&&JSON.stringify(profile)===fingerprint))return;
    const selected={...draft,reviewedCompanion:{executableSha256:response.executableSha256,dependencySha256:response.dependencySha256,capabilities:response.capabilities}};
    const request=++companionRequest.current;setBusy(true);setError('');setMessage('');
    try{
      const reports=await call<RuntimeReport[]>('register_runtime',{registration:selected});
      const saved=await call<RuntimeRegistration[]>('list_runtime_registrations');
      if(companionRequest.current!==request||companionContext.current!==selectedFingerprint)return;
      const retained=saved.find(profile=>profile.id===selected.id);if(!retained?.reviewedCompanion||JSON.stringify(retained.reviewedCompanion)!==JSON.stringify(selected.reviewedCompanion))throw Error('The reviewed runtime profile was not retained. Inspect this profile again.');
      setProfiles(saved);setDraft(retained);setInspection(null);setInspected('');setCompanion(null);onRegistered(reports);
      setMessage('This exact Forerunner build and its SDL library are saved. Inspect registration again to check readiness. Changes to either file require a new review; map loading and gameplay still need testing.');
      window.dispatchEvent(new Event('guilty-spark-runtime-connections-changed'));
    }catch(problem){if(companionRequest.current===request&&companionContext.current===selectedFingerprint)setError(String(problem));}
    finally{if(companionRequest.current===request)setBusy(false);}
  }
  async function browse(kind: 'executable' | 'root' | 'dataRoot') {
    try {
      const value = await call<string | null>('choose_runtime_path', { kind });
      if (value)
        setDraft((d) => (kind === 'root' ? relocateRuntimeRegistration(d, value) : { ...d, [kind]: value }));
    } catch (e) {
      setError(String(e));
    }
  }
  async function inspect() {
    setBusy(true);
    setInspection(null);
    setInspected('');
    setMessage('');
    setError('');
    try {
      setInspection(await call<RuntimeInstallation>('inspect_runtime_registration', { registration: draft }));
      if (report.id!=='openCe'&&draft.dataRoot && draft.dataRoot !== draft.root) await call('inspect_runtime_launch',{registration:draft});
      setInspected(fingerprint);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function register() {
    setBusy(true);
    setError('');
    try {
      const reports=await call<RuntimeReport[]>('register_runtime', { registration: draft });
      const profiles=await call<RuntimeRegistration[]>('list_runtime_registrations');
      const retained=profiles.find(profile=>profile.id===draft.id);
      if(!retained)throw Error('The saved runtime profile is unavailable. Reopen runtime folders before continuing.');
      const inspected=reports.find(report=>report.installation?.registrationId===retained.id)?.installation??null;
      setProfiles(profiles);setDraft(retained);setInspection(inspected);setInspected(inspected?JSON.stringify(retained):'');onRegistered(reports);
      window.dispatchEvent(new Event('guilty-spark-runtime-connections-changed'));
      setMessage('Registration saved. Runtime files were not changed.');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="analysis-card registration" open={initialOpen}>
      <summary>
        {installation ? 'Update' : 'Connect'} {report.name} folders
      </summary>
      <p className="subtle">
        Inspection reads paths and hashes the executable. Registration records a local configuration; it does
        not install or run downloaded code. Use your installed runtime, not an executable from an untrusted
        mod archive.
      </p>
      <fieldset disabled={busy}>
        {profiles.filter((item) => item.runtimeId === report.id).length > 0 && (
          <label>
            Saved engine
            <select
              aria-label="Saved engine profile"
              value={profiles.some((item) => item.id === draft.id) ? draft.id : ''}
              onChange={(event) => void useProfile(event.target.value)}
            >
              {!profiles.some((item) => item.id === draft.id) && <option value="">New engine</option>}
              {profiles
                .filter((item) => item.runtimeId === report.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.root.replaceAll('\\', '/').split('/').filter(Boolean).at(-1)}
                    {item.version ? ' · ' + item.version : ''}
                  </option>
                ))}
            </select>
          </label>
        )}
        {report.id === 'openCe' && (
          <button
            onClick={() => {
              setDraft({
                id: crypto.randomUUID(),
                runtimeId: report.id,
                root: '',
                executable: '',
                dataRoot: null,
                version: null,
                networkVersion: null,
              });
              setInspection(null);
              setMessage(
                'Connect another installed OpenCE-family engine, such as Forerunner, Faber or OpenH1. Existing profiles stay available.',
              );
            }}
          >
            Add another OpenCE engine
          </button>
        )}
        <p className="subtle">
          Moved your game? Choose its installation folder. Paths inside that folder move together; separate
          data folders stay where you selected them. Inspect, then save.
        </p>
        {(['root', 'executable', 'dataRoot'] as const).map((kind) => (
          <label key={kind}>
            {kind === 'root'
              ? 'Installation directory'
              : kind === 'executable'
                ? 'Installed executable'
                : 'Runtime data root (contains maps / maps_ce / other runtime folders)'}
            <div className="path-input">
              <input
                aria-label={
                  kind === 'root'
                    ? 'Installation directory'
                    : kind === 'executable'
                      ? 'Installed executable'
                      : 'Runtime data root'
                }
                value={draft[kind] ?? ''}
                onChange={(e) =>
                  setDraft((d) =>
                    kind === 'root'
                      ? relocateRuntimeRegistration(d, e.target.value)
                      : { ...d, [kind]: e.target.value || (kind === 'dataRoot' ? null : '') },
                  )
                }
              />
              <button onClick={() => void browse(kind)}>Browse</button>
            </div>
          </label>
        ))}
        {(report.id === 'openCe' || report.id === 'chupathingyCe') && (
          <div className="runtime-shared-content">
            <label>
              Share an existing content library
              <select
                aria-label="Shared runtime content"
                value=""
                onChange={(event) => {
                  if (event.target.value) setDraft((d) => ({ ...d, dataRoot: event.target.value }));
                }}
              >
                <option value="">Choose a connected library…</option>
                {Array.from(
                  new Map(
                    profiles
                      .filter((item) => item.runtimeId === 'openCe' || item.runtimeId === 'chupathingyCe')
                      .map((item) => [item.dataRoot || item.root, item]),
                  ).entries(),
                ).map(([root, item]) => (
                  <option key={root} value={root}>
                    {item.root.replaceAll('\\', '/').split('/').filter(Boolean).at(-1)} · maps
                  </option>
                ))}
              </select>
            </label>
            <p className="subtle">
              One content folder for supported engines: Xbox maps in maps; CE maps and banks in maps_ce.
              Executables stay separate. Save this profile before setup. Stock CE and MCC keep their native
              layouts.
            </p>
            <button
              disabled={!profiles.some((item) => item.id === draft.id)}
              onClick={() => void prepareCe()}
            >
              Set up Custom Edition maps
            </button>
            <small>
              Finds the three banks in your connected CE installation, verifies them, and adds only missing
              files. Different existing banks are preserved.
            </small>
          </div>
        )}
        <div className="compare-selectors">
          <label>
            Runtime build (user declaration)
            <input
              value={draft.version ?? ''}
              maxLength={128}
              onChange={(e) => setDraft((d) => ({ ...d, version: e.target.value || null }))}
              placeholder="Unknown until you supply a build token"
            />
          </label>
          <label>
            Network version (user declaration)
            <input
              value={draft.networkVersion ?? ''}
              maxLength={128}
              onChange={(e) => setDraft((d) => ({ ...d, networkVersion: e.target.value || null }))}
              placeholder="Unknown until you supply a network token"
            />
          </label>
        </div>
        <div className="analysis-actions">
          <button disabled={!draft.root || !draft.executable} onClick={() => void inspect()}>
            Inspect registration
          </button>
          <button
            className="primary"
            disabled={!inspection || (inspection.validation !== 'pass' && report.id !== 'arenaEvolved') || inspected !== fingerprint}
            onClick={() => void register()}
          >
            {report.id==='arenaEvolved'?'Save folders (launch unverified)':'Save registration'}
          </button>
        </div>
      </fieldset>
      {inspection && inspected === fingerprint && (
        <>
          <Pill tone={tone(inspection.validation)}>{inspection.validation}</Pill>
          <p>
            Executable SHA-256:{' '}
            <code className="wrap-code">{inspection.executableSha256 ?? 'Unavailable'}</code>
          </p>
          {inspection.diagnostics.map((d, i) => (
            <Notice key={i}>{d}</Notice>
          ))}
        </>
      )}
      {report.id==='openCe'&&<section className="runtime-companion">
        {draft.reviewedCompanion&&<><Pill>Reviewed build {draft.reviewedCompanion.capabilities.build.commit}</Pill><button disabled={busy} onClick={()=>{setDraft(current=>{const next={...current};delete next.reviewedCompanion;return next;});setInspection(null);setInspected('');setMessage('Build review removed from this draft. Inspect and save registration before reviewing a replacement. The installed runtime and saved profile remain unchanged until Save registration.');}}>Clear build review from draft</button></>}
        <button disabled={busy||!native||!inspection?.executableSha256||inspected!==fingerprint||!profiles.some(profile=>profile.id===draft.id&&JSON.stringify(profile)===fingerprint)} onClick={()=>void readCompanion()}>Read Forerunner capabilities</button>
        <p className="subtle">Save and inspect the installed profile first. This optional query runs the engine's help and advertised read-only version-1 contract; it does not start a map. Engine detection is separate from gameplay acceptance.</p>
        {companion&&<details open><summary>{companion.capabilities.engine} · contract {companion.capabilities.contract_version}</summary>
          <p>{companion.capabilities.build.platform} / {companion.capabilities.build.architecture} · build <code>{companion.capabilities.build.commit}</code></p>
          <p>Advertised operations: {companion.capabilities.operations.join(', ')}</p>
          <p>Declared native features: {companion.capabilities.native_features?.join(', ')||'None advertised'}. Map requirements are checked separately; declaration is not gameplay acceptance.</p>
          {!!companion.capabilities.map_targets?.length && <>
            <p>Declared map targets</p>
            <ul>
              {companion.capabilities.map_targets.map(target => <li key={target.cache_version + ':' + target.invader_engine}>
                {target.cache_version === 609 ? 'Custom Edition (CE609)' :
                  target.cache_version === 13 ? 'MCC Halo 1 (MCC13)' : 'Cache version ' + target.cache_version}
                {' · '}{(target.tag_space_bytes / 1048576).toLocaleString()} MiB{target.default ? ' · Default' : ''}
                {target.max_netgame_flags != null && ` · ${target.max_netgame_flags.toLocaleString()} multiplayer flags`}
                {target.required_feature && <> · Requires <code>{target.required_feature}</code></>}
              </li>)}
            </ul>
            <p className="subtle">Map target declarations describe the loader. The reviewed startup contract below controls which maps Spark can launch.</p>
          </>}
          <p>Network version {companion.capabilities.network.advertised_version} · native layout {companion.capabilities.network.native_layout_version}. These values do not prove peer compatibility.</p>
          {companion.capabilities.startup_map?<>
            <p>Advertised startup: {companion.capabilities.startup_map.selector} · cache {companion.capabilities.startup_map.cache_version} · {companion.capabilities.startup_map.scenario_type}. Profile: {companion.capabilities.startup_map.profile}.</p>
            <p className="subtle">Fresh start: {companion.capabilities.startup_map.fresh_start?'yes':'no'} · hosts a network game: {companion.capabilities.startup_map.network_host?'yes':'no'}. Discovery alone does not enable startup. Review and save this exact build to use the supported private-session startup path.</p>
          </>:<p className="subtle">This build does not advertise authored-map startup. Use the native custom campaign chooser for an eligible staged solo test.</p>}
          {companion.dependencySha256&&<p>SDL library SHA-256: <code className="wrap-code">{companion.dependencySha256}</code></p>}
          {companion.capabilitiesSha256&&<p>Contract identity: <code className="wrap-code">{companion.capabilitiesSha256}</code></p>}
          {companion.reviewIssue&&<Notice>{companion.reviewIssue}</Notice>}
          <button disabled={busy||!companion.dependencySha256||!companion.capabilitiesSha256||!!companion.reviewIssue||inspected!==fingerprint} onClick={()=>void reviewCompanion()}>Review and save this Forerunner build</button>
          <p className="subtle">Use only an installed build you trust. Saving checks its executable, matching SDL library and versioned contract again, then pins them in this profile. A changed build needs a fresh review. This is your local review, not an upstream signature.</p>
          <p className="subtle">Discovery does not confirm a loaded map, enable live editing or establish multiplayer support. To try a built CE solo project with an admitted Forerunner build, use Level editor → Game connection → Start staged solo test, then select the map in Forerunner. Native Windows interaction and gameplay acceptance remain separate.</p>
        </details>}
      </section>}
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="info">{message}</Notice>}
    </details>
  );
}
