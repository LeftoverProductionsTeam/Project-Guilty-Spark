import {useEffect,useId,Suspense} from 'react';
import {navigateComposite} from '../keyboardNavigation';
import PagedSurface from './PagedSurface';
import {PREFERRED_RUNTIME} from '../runtimeWorkbench';
import {useState,type ReactNode} from 'react';
import RuntimeRegistration from './RuntimeRegistration';
import RuntimeModPacks from './RuntimeModPacks';
import ManagedRuntimes from './ManagedRuntimes';
import ExternalBrowserLink from './ExternalBrowserLink';
import { Check, FolderOpen, Gamepad2, RefreshCw, Settings2 } from 'lucide-react';
import { call,native } from '../api';
import { useMapState,writeMapSession } from '../mapSession';
import { runtimeNames,runtimeProfileName,runtimeProfileLabel } from '../runtimeWorkbench';
import type { Bootstrap, Project, RuntimeId } from '../types';
import { primaryRuntimes, useRuntimeConnections } from '../useRuntimeConnections';
import { Notice } from './ui';
import { useRevealWorkspacePanel } from './WorkspacePanels';
import ToolEcosystem from './ToolEcosystem';
import '../gamesTools.css';


export default function GamesTools({
  data,
  project,
  busy,
  onSelectMap,
  onLibrary,
  onSetup,
  onOpenWorkspace,
  children,
}: {
  data: Bootstrap;
  project: Project | null;
  busy: boolean;
  onSelectMap: (id: string) => void;
  onLibrary: () => void;
  onSetup: (id: RuntimeId) => void;
  onOpenWorkspace: (target: 'tags' | 'build' | 'quickforge' | 'assets') => void;
  children: ReactNode;
}) {
  const [runtime, setRuntime] = useMapState<RuntimeId>(
    project?.id ?? 'global',
    'hosting.runtime',
    project?.quickForge?.runtimeId ?? data.settings.preferredHalo ?? PREFERRED_RUNTIME,
  );
  const [search, setSearch] = useMapState(project?.id ?? 'global', `tools.search.${runtime}`, '');
  const [advanced, setAdvanced] = useMapState('global', 'tools.advanced', false);
  const { reports, detected, profiles, checking, connecting, error, refresh, connect } = useRuntimeConnections(data);
  const [flavorError,setFlavorError]=useState('');
  const [foldersFor,setFoldersFor]=useMapState<RuntimeId|null>('global','tools.connectRuntime',null);
  type Dashboard='tools'|'setup'|'packs'|'preferences';
  const [section,setSection]=useMapState<Dashboard>('global','tools.dashboard','tools');
  const [visited,setVisited]=useState<Set<Dashboard>>(()=>new Set(['tools',section]));
  useEffect(()=>{setVisited(old=>old.has(section)?old:new Set([...old,section]));},[section]);
  const dashboard=useId();
  function chooseSection(next:Dashboard){setSection(next);setVisited(old=>new Set([...old,next]));if(next==='preferences')setAdvanced(true);}
  function openFolders(){chooseSection('setup');if(runtime==='mccSteam')onSetup(runtime);else setFoldersFor(runtime);}

  const selectedReport=reports.find(report=>report.id===runtime);
  const reveal = useRevealWorkspacePanel();
  const installation = reports.find((report) => report.id === runtime)?.installation;
  const candidate = detected.find(item => item.runtimeId === runtime);
  return (
    <div className="analysis-page games-tools-page">
      <header className="games-tools-heading">
        <h1>Games &amp; tools</h1>
        <span>Choose your Halo to see its editors.</span>
        <button disabled={!native || checking} onClick={() => void refresh()}>
          <RefreshCw size={14} />
          {checking ? 'Checking…' : 'Recheck connections'}
        </button>
      </header>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="halo-runtime-grid" role="group" aria-label="Halo versions">
        {primaryRuntimes.map((id) => {
          const found = reports.find((report) => report.id === id)?.installation;
          const available = detected.find(item => item.runtimeId === id);
          const connected = found?.validation === 'pass';
          const status = connected
            ? 'Connected'
            : found
              ? 'Needs attention'
              : available
                ? (available.contentReady ? 'Detected' : 'Needs content')
              : checking
                ? 'Checking…'
                : 'Not connected';
          return (
            <button
              key={id}
              className="halo-runtime-card"
              data-connected={connected}
              aria-pressed={runtime === id}
              aria-label={`${runtimeNames[id]} · ${status}`}
              title={
                found || available
                  ? `${runtimeNames[id]}: ${found?.root ?? available?.root}`
                  : `Connect ${runtimeNames[id]} to use its installed tools and content`
              }
              onClick={() => setRuntime(id)}
            >
              <Gamepad2 size={17} />
              <strong>{runtimeNames[id]}</strong>
              <span>
                {connected && <Check size={11} />} {status}
              </span>
            </button>
          );
        })}
      </div>
      {['openCe','chupathingyCe'].includes(runtime)&&<label className="games-tools-flavors">OpenCE flavors · community engines
        <select aria-label="Community engine flavor" value={profiles.find(item=>item.id===installation?.registrationId)?.id??''} onChange={event=>{const id=event.target.value;if(id.startsWith('setup:')){const flavor=id.slice(6);writeMapSession('global','tools.enginePackage',flavor);writeMapSession('global','tools.downloadOpen',flavor!=='forerunner');if(flavor==='forerunner'){setRuntime('openCe');setFoldersFor('openCe');}chooseSection('setup');return;}const candidate=detected.find(item=>item.executableSha256===id);if(candidate){void connect(candidate);return;}const profile=profiles.find(item=>item.id===id);if(profile)void call('activate_runtime_registration',{registrationId:id}).then(()=>{setRuntime(profile.runtimeId);window.dispatchEvent(new Event('guilty-spark-runtime-connections-changed'));}).catch(error=>setFlavorError(String(error)));}}>
          <option value="" disabled>Choose an engine or connect one…</option>
          {profiles.filter(item=>['openCe','chupathingyCe'].includes(item.runtimeId)).map(item=><option value={item.id} key={item.id}>{runtimeProfileLabel(item)}</option>)}
          {detected.filter(item=>['openCe','chupathingyCe'].includes(item.runtimeId)&&!profiles.some(profile=>profile.executable.replaceAll('\\','/').toLowerCase()===item.executable.replaceAll('\\','/').toLowerCase())).map(item=><option value={item.executableSha256} key={item.executableSha256}>Connect {runtimeProfileName({...item,id:'detected',networkVersion:null})} · {item.version??'detected'}</option>)}
          <option value="setup:openh1">OpenH1 · setup / download</option><option value="setup:faber">Faber · setup / download</option><option value="setup:forerunner">Forerunner · connect installed build</option>
        </select><small>Engine files and profiles stay independent. OpenH1 Windows VR remains unverified.</small>{flavorError&&<span role="alert">{flavorError}</span>}
      </label>}
      {runtime==='arenaEvolved'&&<Notice tone="info">Arena Evolved 0.7.7-beta can read owned MCC, Xbox and CE content. Connect its folders below; executable launch is awaiting release verification. <ExternalBrowserLink href="https://github.com/PeterRichardsonGolf/Halo-CE-Arena-Evolved/releases/tag/v0.7.7-beta">Official release &amp; setup</ExternalBrowserLink></Notice>}
      <div className="games-tools-context">
        <label>
          Map
          <select
            aria-label="Map for external tools"
            disabled={busy}
            value={project?.id ?? ''}
            onChange={(event) => {
              if (event.target.value) onSelectMap(event.target.value);
            }}
          >
            <option value="" disabled>
              Choose a map…
            </option>
            {data.entries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title} · {entry.engine}
              </option>
            ))}
            {project && !data.entries.some((entry) => entry.id === project.id) && (
              <option value={project.id}>{project.title}</option>
            )}
          </select>
        </label>
        <button onClick={onLibrary}>
          <FolderOpen size={14} />
          Open a map
        </button>
        <label className="games-tools-search">
          Find tool
          <input
            aria-label="Search runtime tools"
            placeholder="Editor, compiler, model…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button disabled={!native||busy||checking} onClick={openFolders}><FolderOpen size={14}/>Runtime folders…</button>
        <button disabled={connecting !== null} onClick={() => candidate?.contentReady && !installation ? void connect(candidate) : onSetup(runtime)} title={candidate?.detail}>
          <Settings2 size={14} />
          {connecting === runtime ? 'Connecting…' : installation?.validation === 'pass' ? 'Connect tools' : candidate?.contentReady ? 'Connect detected Halo' : 'Connect this Halo'}
        </button>
      </div>
      <div className="games-tools-sections" role="tablist" aria-label="Runtime dashboard" onKeyDown={navigateComposite}>
        <button role="tab" id={dashboard+'-tools'} aria-controls={dashboard+'-pane-tools'} aria-selected={section==='tools'} tabIndex={section==='tools'?0:-1} onClick={()=>chooseSection('tools')}>Tools</button>
        <button role="tab" id={dashboard+'-setup'} aria-controls={dashboard+'-pane-setup'} aria-selected={section==='setup'} tabIndex={section==='setup'?0:-1} onClick={()=>chooseSection('setup')}>Runtime setup</button>
        <button role="tab" id={dashboard+'-packs'} aria-controls={dashboard+'-pane-packs'} aria-selected={section==='packs'} tabIndex={section==='packs'?0:-1} onClick={()=>chooseSection('packs')}>Packs</button>
        <button role="tab" id={dashboard+'-preferences'} aria-controls={dashboard+'-pane-preferences'} aria-selected={section==='preferences'} tabIndex={section==='preferences'?0:-1} onClick={()=>chooseSection('preferences')}>Preferences</button>
      </div>
      <div className="games-tools-pane" role="tabpanel" id={dashboard+'-pane-tools'} aria-labelledby={dashboard+'-tools'} hidden={section!=='tools'}>{visited.has('tools')&&<PagedSurface name="runtime-tools" label="Tools" scope={project?.id??'global'} fill>
      <div className="games-tools-save-flow">
        <span>
          <strong>Edit → save in the tool → review in Spark.</strong> Working map saves are checked every 2
          seconds. Clean maps reload; unsaved Spark changes stay separate. Managed native tags require
          integrity review and a rebuild.
        </span>
        <button disabled={!project?.source} onClick={() => reveal('source-changes')}>
          Review external changes
        </button>
        <button
          disabled={!project}
          onClick={() => onOpenWorkspace('build')}
          title="Build, conversion and legacy export targets"
        >
          Export / convert
        </button>
      </div>
      <ToolEcosystem
        key={`${project?.id ?? 'global'}:${runtime}`}
        project={project}
        runtime={runtime}
        settings={data.settings}
        compact
        heading={`${runtimeNames[runtime]} tools`}
        search={search}
        onSettings={() => onSetup(runtime)}
        onOpenWorkspace={onOpenWorkspace}
      />
      </PagedSurface>}</div>
      <div className="games-tools-pane" role="tabpanel" id={dashboard+'-pane-setup'} aria-labelledby={dashboard+'-setup'} hidden={section!=='setup'}>{visited.has('setup')&&<PagedSurface name="runtime-setup" label="Runtime setup" scope={project?.id??'global'} fill>
      {foldersFor===runtime&&runtime!=='mccSteam'&&selectedReport&&<RuntimeRegistration key={`registration:${runtime}`} report={selectedReport} initialOpen onRegistered={()=>void refresh()}/>}
      <ManagedRuntimes onUseFolders={openFolders} onInstalled={id=>{setRuntime(id);void refresh();}}/>
      </PagedSurface>}</div>
      <div className="games-tools-pane" role="tabpanel" id={dashboard+'-pane-packs'} aria-labelledby={dashboard+'-packs'} hidden={section!=='packs'}>{visited.has('packs')&&<PagedSurface name="runtime-packs" label="Packs" scope={project?.id??'global'} fill>
      <RuntimeModPacks key={`packs:${installation?.registrationId??runtime}`} registrationId={installation?.registrationId} runtime={runtime}/>      </PagedSurface>}</div>
      <div className="games-tools-pane" role="tabpanel" id={dashboard+'-pane-preferences'} aria-labelledby={dashboard+'-preferences'} hidden={section!=='preferences'}>{visited.has('preferences')&&<PagedSurface name="runtime-preferences" label="Preferences" scope={project?.id??'global'} fill>
      <details
        className="games-tools-advanced"
        open={advanced}
        onToggle={(event) => setAdvanced(event.currentTarget.open)}
      >
        <summary>Advanced folders, backups &amp; preferences</summary>
        <Suspense fallback={<p role="status">Opening preferences…</p>}>{children}</Suspense>
      </details>
      </PagedSurface>}</div>
    </div>
  );
}
