import {PREFERRED_RUNTIME} from '../runtimeWorkbench';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play,
  TestTube2,
  Layers3,
  FileCode2,
  Hammer,
  Package,
  Search,
  Server,
  Wrench,
  RefreshCw,
  ChevronUp,
  X,
  LoaderCircle,
} from 'lucide-react';
import { call, native } from '../api';
import { useMapState, writeMapSession } from '../mapSession';
import type { Project, RuntimeId, Settings, Workspace } from '../types';
import type {
  RuntimeWorkbenchReport,
  NativeScriptAttachment,
  RuntimeDockAction,
  ToolLaunchPlan,
  ToolProcessView,
} from '../runtimeWorkbench';
import { availabilityLabel, evidenceLabel, runtimeNames } from '../runtimeWorkbench';
import { Notice } from './ui';
import WorkingTagChanges, { useWorkingTagChanges } from './WorkingTagChanges';
import { integrityBlocks, type NativeTagIntegrityReport } from '../nativeTagIntegrity';
import BspAudioEditor, { type BspAudioRequest } from './BspAudioEditor';
import BaboonTools from './BaboonTools';
import NativeTagOperations from './NativeTagOperations';
import '../runtimeWorkbench.css';

const actions = [
  ['play', 'Play Halo', Play],
  ['testScene', 'Test Scene', TestTube2],
  ['editLevel', 'Edit level', Layers3],
  ['editTags', 'Edit tags', FileCode2],
  ['build', 'Build', Hammer],
  ['publish', 'Publish', Package],
  ['findGames', 'Find games', Search],
  ['host', 'Host', Server],
  ['legacy', 'Legacy tools', Wrench],
] as const;

export default function RuntimeDock({
  project,
  settings,
  dirty,
  working,
  epoch,
  onSave,
  onNavigate,
  onOpenCompiled,
}: {
  project: Project | null;
  settings: Settings;
  dirty: boolean;
  working: boolean;
  epoch: number;
  onSave: () => Promise<void>;
  onNavigate: (workspace: Workspace) => void;
  onOpenCompiled: (buildId: string) => void;
}) {
  const id = project?.id ?? 'global';
  const [runtime, setRuntime] = useMapState<RuntimeId>(
    id,
    'hosting.runtime',
    project?.quickForge?.runtimeId ?? settings.preferredHalo ?? PREFERRED_RUNTIME,
  );
  const [report, setReport] = useState<RuntimeWorkbenchReport | null>(null);
  const [details, setDetails] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [plan, setPlan] = useState<ToolLaunchPlan | null>(null),
    [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState('');
  const workingTarget=report?.workingSource?.target ?? (runtime==='mccSteam'&&report?.workingSource?'mcc-cea':null);
  const workingSourceAvailable=workingTarget==='mcc-cea'||workingTarget==='gbx-custom';
  const h1aSource=workingTarget==='mcc-cea';
  const showH1aTools=h1aSource||(!workingTarget&&runtime==='mccSteam');
  const authoringPending=report?.workingSource?.authoringPending===true;
  const toolTags = useWorkingTagChanges(
    project?.id ?? null,
    h1aSource && !authoringPending ? (report?.workingSource?.buildId ?? null) : null,
    report?.workingSource?.tagsDirectory ?? null,
  );
  const [handoffIntegrity, setHandoffIntegrity] = useState<{
    projectId: string;
    integrity?: NativeTagIntegrityReport;
  } | null>(null);
  useEffect(() => {
    const listener = (event: Event) => {
      const value = (event as CustomEvent<{ projectId: string; integrity?: NativeTagIntegrityReport }>)
        .detail;
      if (value?.projectId === project?.id) setHandoffIntegrity(value);
    };
    window.addEventListener('guilty-spark-tag-integrity', listener);
    return () => window.removeEventListener('guilty-spark-tag-integrity', listener);
  }, [project?.id]);
  const invalidToolFiles = toolTags.report?.integrity?.invalidFiles ?? 0;
  const invalidHandoffFiles =
    handoffIntegrity?.projectId === project?.id ? (handoffIntegrity?.integrity?.invalidFiles ?? 0) : 0;
  const generation = useRef(0);
  const scriptSelection = useRef(0);
  const [scriptAttachment,setScriptAttachment]=useState<(NativeScriptAttachment&{sourceKey:string;reviewed:boolean})|null>(null);
  const scriptSourceKey=JSON.stringify([project?.id,runtime,report?.workingSource?.buildId,report?.workingSource?.tagsDirectory,report?.workingSource?.projectFingerprint,workingTarget,project?.firefight]);
  const currentScriptSourceKey=useRef(scriptSourceKey);currentScriptSourceKey.current=scriptSourceKey;
  const selectedScript=scriptAttachment?.sourceKey===scriptSourceKey?scriptAttachment:null;
  const currentReport = useRef(report);
  currentReport.current = report;
  const detailsDialog = useRef<HTMLElement | null>(null);
  const planDialog = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    if (!details && !plan) return;
    const element = plan ? planDialog.current : detailsDialog.current,
      prior = document.activeElement as HTMLElement | null;
    if (!element) return;
    const controls = () =>
      [
        ...element.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]',
        ),
      ].filter((node) => node.offsetParent !== null);
    const frame = requestAnimationFrame(() => controls()[0]?.focus());
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        event.stopPropagation();
        setDetails(false);
        setPlan(null);
      }
      if (event.key === 'Tab') {
        const items = controls(),
          first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    element.addEventListener('keydown', keydown, true);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('keydown', keydown, true);
      if (prior?.isConnected) prior.focus();
    };
  }, [details, !!plan]);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!native) return;
    setBusy(true);
    setError('');
    try {
      const next = await call<RuntimeWorkbenchReport>('runtime_workbench_report', {
        runtimeId: runtime,
        projectId: project?.id ?? null,
      });
      if (request === generation.current) setReport(next);
    } catch (e) {
      if (request === generation.current) {
        setReport(null);
        setError(String(e));
      }
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }, [runtime, project?.id, settings.hekDirectory, settings.hekFlavor, settings.hekTagsDirectory, epoch]);
  useEffect(() => {
    const listener = (event: Event) => {
      if ((event as CustomEvent<{ projectId: string }>).detail?.projectId === project?.id) void refresh();
    };
    window.addEventListener('guilty-spark-native-source-changed', listener);
    return () => window.removeEventListener('guilty-spark-native-source-changed', listener);
  }, [project?.id, refresh]);
  useEffect(() => {
    setReport(null);
    setPlan(null);
    setConsent(false);
    setNotice('');
    void refresh();
    return () => {
      generation.current++;
    };
  }, [refresh]);
  useEffect(() => {
    if (!native || !report?.processes.some((p) => p.status === 'running')) return;
    let alive = true;
    const timer = setInterval(
      () =>
        void call<ToolProcessView[]>('runtime_tool_processes')
          .then((processes) => {
            if (alive) {
              const changed = processes.some(
                (p) => currentReport.current?.processes.find((old) => old.id === p.id)?.status !== p.status,
              );
              setReport((previous) => (previous ? { ...previous, processes } : previous));
              if (changed) void refresh();
            }
          })
          .catch(() => {}),
      3000,
    );
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [report?.processes.some((p) => p.status === 'running'), refresh]);

  function routeServers(tab: 'servers' | 'hosting') {
    writeMapSession(id, 'hosting.tab', tab);
    onNavigate('runtimes');
  }
  useEffect(() => {
    const request = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId: string; actionId: string; runtimeId?: RuntimeId }>)
        .detail;
      if (
        detail?.projectId !== project?.id ||
        !['editTags', 'editLevel', 'testScene', 'workingTags'].includes(detail.actionId)
      )
        return;
      setDetails(true);
      if (detail.runtimeId && detail.runtimeId !== runtime) {
        setRuntime(detail.runtimeId);
        return;
      }
      if (detail.actionId === 'workingTags') return;
      if (working || busy) {
        setError('Wait for the active operation before preparing a native editor.');
        return;
      }
      const action = report?.actions.find((action) => action.id === detail.actionId);
      if (action) void act(action);
    };
    window.addEventListener('guilty-spark-runtime-tool', request);
    return () => window.removeEventListener('guilty-spark-runtime-tool', request);
  }, [project?.id, report, runtime, dirty, working, busy]);
  async function act(action: RuntimeDockAction) {
    setError('');
    setNotice('');
    if (action.id === 'findGames') {
      routeServers('servers');
      return;
    }
    if (action.id === 'host') {
      routeServers('hosting');
      return;
    }
    if (action.id === 'legacy') {
      onNavigate('academy');
      return;
    }
    if (action.id === 'build' || action.id === 'publish') {
      onNavigate(project?.quickForge && action.id === 'build' ? 'quickforge' : 'build');
      return;
    }
    if (action.availability === 'running') {
      setDetails(true);
      return;
    }
    if (action.availability !== 'ready') {
      setDetails(true);
      return;
    }
    if (dirty) {
      setDetails(true);
      setError('Save this map before preparing an external game or tool launch.');
      return;
    }
    setBusy(true);
    const request = generation.current;
    try {
      if (action.id === 'play') {
        const message = await call<string>('launch_registered_runtime', { runtimeId: runtime });
        if (request === generation.current) setNotice(message);
      } else if (project) {
        const preview = await call<ToolLaunchPlan>('prepare_runtime_tool', {
          runtimeId: runtime,
          projectId: project.id,
          actionId: action.id,
        });
        if (request === generation.current) {
          setConsent(false);
          setPlan(preview);
        }
      }
    } catch (e) {
      if (request === generation.current) {
        setError(String(e));
        setDetails(true);
      }
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  async function launch() {
    if (!plan || !consent || dirty) return;
    setBusy(true);
    setError('');
    const request = generation.current;
    try {
      const process = await call<ToolProcessView>('launch_runtime_tool', {
        planId: plan.id,
        confirmed: consent,
      });
      if (request === generation.current) {
        setNotice(process.detail);
        setPlan(null);
        setConsent(false);
        await refresh();
      }
    } catch (e) {
      if (request === generation.current) {
        setError(String(e));
        setPlan(null);
        setDetails(true);
      }
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  async function selectScript(file:File|undefined) {
    const selection=++scriptSelection.current,request=generation.current,key=scriptSourceKey;
    setScriptAttachment(null);setError('');
    if(!file)return;
    try {
      if(!/^[A-Za-z0-9_-]{1,31}\.hsc$/.test(file.name)||file.name.toLowerCase()==='global_scripts.hsc')throw Error('Choose a new .hsc module with a safe name of 1–31characters. Existing global source is preserved separately.');
      if(!file.size||file.size>1048576)throw Error('New HaloScript source must be nonempty and at most 1 MiB.');
      const bytes=await file.arrayBuffer();
      const content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
      if(!content.trim()||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(content))throw Error('Choose valid UTF8 HaloScript text without binary control characters.');
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const sha256=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
      if(request!==generation.current||selection!==scriptSelection.current||key!==currentScriptSourceKey.current)return;
      setScriptAttachment({filename:file.name,content,sha256,sourceKey:key,reviewed:false});
    }catch(problem){if(request===generation.current&&selection===scriptSelection.current&&key===currentScriptSourceKey.current)setError(String(problem));}
  }
  async function buildWorkingTags(bspAudio?: BspAudioRequest, compileScripts=false, attachment?:NativeScriptAttachment) {
    if (
      !project ||
      dirty ||
      working ||
      busy ||
      toolTags.report?.status === 'saving' ||
      integrityBlocks(toolTags.report?.integrity)
    )
      return;
    if(!report?.workingSource||!workingSourceAvailable)return;
    if(authoringPending&&!compileScripts){setError('Firefight rules changed. Review their bound controller and choose Attach source & compile or Compile scripts & build.');return;}
    if(attachment&&(!selectedScript?.reviewed||selectedScript.sha256!==attachment.sha256||!report?.workingSource))return;
    const request = generation.current;
    setBusy(true);
    setError('');
    try {
      await call<string>('build_working_tags', { projectId: project.id, compileScripts, ...(bspAudio ? { bspAudio } : {}),
        expectedBuildId:report.workingSource.buildId,expectedSourceDirectory:report.workingSource.tagsDirectory,
        ...(attachment?{scriptAttachment:{filename:attachment.filename,content:attachment.content,sha256:attachment.sha256}}:{}) });
      if (request === generation.current) {
        setDetails(false);
        setNotice(
          compileScripts?'Compiling reviewed scenario HaloScript, then a separate native map. Missing original modules or compiler/readback failures leave the previous-good cache unchanged.':'Compiling a separate map from saved working tags, retaining their existing compiled scripts. To apply edited .hsc source, use Compile scripts & build.',
        );
        onNavigate('build');
      }
    } catch (e) {
      if (request === generation.current) setError(String(e));
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  const selected = Object.hasOwn(runtimeNames, runtime) ? runtime : 'mccSteam';
  return (
    <>
      <footer className="runtime-dock" aria-label="Runtime & Tools Dock">
        <div className="runtime-dock-heading">
          <strong>Runtime &amp; tools</strong>
          <span>{project?.title ?? 'Choose a map to use its tools'}</span>
          <span className="runtime-dock-save">
            {working ? 'Working…' : dirty ? 'Unsaved changes' : 'Saved'}
          </span>
          {!!toolTags.report?.changedFiles && (
            <button className="runtime-dock-tag-changes" onClick={() => setDetails(true)}>
              {toolTags.report.changedFiles} saved tool edit{toolTags.report.changedFiles === 1 ? '' : 's'}
            </button>
          )}
          {(invalidToolFiles > 0 || invalidHandoffFiles > 0) && (
            <button role="alert" className="runtime-dock-tag-changes" onClick={() => setDetails(true)}>
              Native save integrity warning · {invalidToolFiles + invalidHandoffFiles} files
            </button>
          )}
          <button
            className="runtime-dock-details"
            aria-label="Runtime and tool details"
            aria-expanded={details}
            onClick={() => setDetails((v) => !v)}
          >
            <ChevronUp size={12} />
            Details
          </button>
        </div>
        <div className="runtime-dock-actions">
          {actions.map(([id, label, Icon]) => {
            const action = report?.actions.find((a) => a.id === id);
            const state = action?.availability ?? 'setupRequired';
            const running = report?.processes.some(
              (p) => p.projectId === project?.id && p.actionId === id && p.status === 'running',
            );
            return (
              <button
                key={id}
                data-state={running ? 'running' : state}
                disabled={
                  busy ||
                  working ||
                  (!native && !['build', 'publish', 'findGames', 'host', 'legacy'].includes(id))
                }
                title={
                  action
                    ? `${action.description}\n${action.nextAction}`
                    : native
                      ? 'Inspect the current runtime and configure its matching tools.'
                      : 'Native runtime inspection requires the desktop app.'
                }
                onClick={() =>
                  action
                    ? void act(action)
                    : ['findGames', 'host', 'legacy', 'build', 'publish'].includes(id)
                      ? void act({
                          id,
                          operation: id,
                          label,
                          availability: 'setupRequired',
                          description: '',
                          nextAction: '',
                          requiresConfirmation: false,
                        })
                      : setDetails(true)
                }
              >
                <span>
                  <Icon size={13} />
                  {label}
                </span>
                <small>{!native ? 'Desktop' : running ? 'Running' : availabilityLabel[state]}</small>
              </button>
            );
          })}
        </div>
        {notice && (
          <div className="runtime-dock-notice" role="status">
            {notice}
            <button aria-label="Dismiss runtime message" onClick={() => setNotice('')}>
              <X size={12} />
            </button>
          </div>
        )}
        {error && !details && (
          <div className="runtime-dock-notice" role="alert">
            {error}
          </div>
        )}
      </footer>
      {showH1aTools && !authoringPending && <BaboonTools project={project} dirty={dirty} epoch={epoch} monitorOnly />}
      {details && (
      <div className="modal-backdrop">
        <section
          ref={detailsDialog}
          className="modal runtime-details-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="runtime-details-title"
        >
          <div className="section-heading">
            <h2 id="runtime-details-title">{runtimeNames[selected]} · runtime &amp; tools</h2>
            <button aria-label="Close runtime details" onClick={() => setDetails(false)}>
              <X size={18} />
            </button>
          </div>
          {!native && (
            <Notice tone="info">
              Use the desktop app to inspect the installed runtime, tools and owned content.
            </Notice>
          )}
          {error && <Notice>{error}</Notice>}
          {dirty && (
            <Notice tone="info">
              This map has unsaved changes.{' '}
              <button
                onClick={() =>
                  void onSave()
                    .then(refresh)
                    .catch((e) => setError(String(e)))
                }
              >
                Save map
              </button>
            </Notice>
          )}
          {report?.sourceIssue && (
            <Notice tone="info">
              {report.sourceIssue}{' '}
              <button
                onClick={() => {
                  setDetails(false);
                  onNavigate(project?.quickForge ? 'quickforge' : project ? 'build' : 'library');
                }}
              >
                Open map / build sources
              </button>
            </Notice>
          )}
          {report?.toolsIssue && (
            <Notice tone="info">
              {report.toolsIssue}{' '}
              <button
                onClick={() => {
                  setDetails(false);
                  onNavigate('settings');
                }}
              >
                Set up matching tools
              </button>
            </Notice>
          )}
          <div className="button-row">
            <button disabled={busy || !native} onClick={() => void refresh()}>
              <RefreshCw size={13} />
              Refresh inspection
            </button>
            <button
              onClick={() => {
                setDetails(false);
                routeServers('servers');
              }}
            >
              Play &amp; servers
            </button>
          </div>
          {workingSourceAvailable && <small>Working source: {workingTarget==='gbx-custom'?'Custom Edition · Invader native rebuild':'MCC Halo 1 · H1A native rebuild'}. Source format is independent of the hosting runtime.</small>}
          {authoringPending && report?.workingSource && <Notice>
            Firefight rules are saved but not compiled. The retained source belongs to the earlier build; it is available for a reviewed controller rebuild only. Export the current bound controller in Firefight rules → Advanced script export, then attach it below. For an existing controller, edit/review its original module through Open script source folder and choose Compile scripts &amp; build. A tag-only build cannot apply these rules.
            <details><summary>Source and authored revisions</summary><p className="wrap-code">Compiled source: {report.workingSource.sourceProjectFingerprint}<br/>Saved authoring: {report.workingSource.projectFingerprint}</p></details>
          </Notice>}
          {project && report?.workingSource && h1aSource && !authoringPending && <WorkingTagChanges {...toolTags} />}
          {showH1aTools && !authoringPending && <BaboonTools project={project} dirty={dirty} epoch={epoch} />}
          {workingSourceAvailable && project && report?.workingSource && !authoringPending && (
            <NativeTagOperations project={project} dirty={dirty} epoch={epoch} />
          )}
          {project && report?.workingSource && h1aSource && !authoringPending && (
            <BspAudioEditor
              key={project.id + report.workingSource.buildId}
              projectId={project.id}
              parentBuildId={report.workingSource.buildId}
              blocked={
                busy ||
                working ||
                dirty ||
                toolTags.report?.status === 'saving' ||
                !!report.sourceIssue ||
                !!report.toolsIssue ||
                report.processes.some((p) => p.projectId === project.id && p.status === 'running')
              }
              onBuild={buildWorkingTags}
            />
          )}
          {project && report?.workingSource && workingSourceAvailable && (
            <div className="button-row">
              <button
                disabled={
                  authoringPending ||
                  !native ||
                  !report ||
                  busy ||
                  working ||
                  dirty ||
                  toolTags.report?.status === 'saving' ||
                  integrityBlocks(toolTags.report?.integrity) ||
                  !!report?.sourceIssue ||
                  !!report?.toolsIssue ||
                  report?.processes.some((p) => p.projectId === project.id && p.status === 'running')
                }
                onClick={() => void buildWorkingTags()}
              >
                <Hammer size={13} />
                {workingTarget==='gbx-custom'?'Build CE working tag edits':'Build working tag edits'}
              </button>
              <button
                disabled={busy||working||dirty||toolTags.report?.status==='saving'||integrityBlocks(toolTags.report?.integrity)||!!report?.sourceIssue||!!report?.toolsIssue||report?.processes.some(p=>p.projectId===project.id&&p.status==='running')}
                title="Compile this scenario's reviewed .hsc modules before building its native map. Requires complete original modules and matching Invader-script; other scenarios and unrelated global scripts are excluded."
                onClick={()=>void buildWorkingTags(undefined,true)}
              >Compile scripts &amp; build</button>
              <button disabled={busy||working||!native||!report?.workingSource} title="Open this native build's data folder. Edit the selected scenario's scripts directory; unrelated scenario/global source is not adopted. Save and close external editors before compiling."
                onClick={()=>void call('reveal_folder',{kind:'workingScripts',id:project.id+':'+report.workingSource!.buildId}).catch(problem=>setError(String(problem)))}
              >Open script source folder</button>
              {report?.workingBuild && (
                <button
                  disabled={busy || working || dirty}
                  onClick={() => {
                    setDetails(false);
                    onOpenCompiled(report.workingBuild!.id);
                  }}
                >
                  Open working-tags build
                </button>
              )}
              <small>
                Save and close the native tools first. This preserves working tag changes in a new cache; the
                ordinary build regenerates source. {workingTarget==='gbx-custom'&&'Keep this source workspace for further CE native edits; Open working-tags build opens the compiled result for inspection.'}
              </small>
            </div>
          )}
          {project&&report?.workingSource&&workingSourceAvailable&&<details className="native-script-attachment">
            <summary>Attach new controller/script source</summary>
            <p className="subtle">Choose a reviewed UTF8 .hsc module, up to 1 MiB. It is added only to a separate build candidate; an existing module with the same name is never replaced. Original scripts must be fully recovered. The selected file is not saved in the project draft; successful output retains it in the new native source. Project Undo does not remove a compiled source module.</p>
            <label>New HaloScript module<input type="file" accept=".hsc" style={{maxWidth:'100%',minWidth:0}} disabled={busy||working||dirty} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';void selectScript(file);}}/></label>
            {selectedScript&&<>
              <p><strong>{selectedScript.filename}</strong> · <code className="wrap-code">{selectedScript.sha256}</code></p>
              <label>Review source<textarea readOnly rows={6} spellCheck={false} style={{width:'100%',boxSizing:'border-box'}} value={selectedScript.content}/></label>
              <label><input type="checkbox" checked={selectedScript.reviewed} disabled={busy||working||dirty} onChange={event=>{const reviewed=event.target.checked;setScriptAttachment(old=>old?.sourceKey===scriptSourceKey?{...old,reviewed}:old);}}/>I reviewed this source and its native scenario references.</label>
              <div className="button-row">
                <button disabled={!native||busy||working||dirty||!selectedScript.reviewed||toolTags.report?.status==='saving'||integrityBlocks(toolTags.report?.integrity)||!!report.sourceIssue||!!report.toolsIssue||report.processes.some(p=>p.projectId===project.id&&p.status==='running')}
                  onClick={()=>void buildWorkingTags(undefined,true,selectedScript)}>Attach source &amp; compile</button>
                <button disabled={busy||working} onClick={()=>{scriptSelection.current++;setScriptAttachment(null);}}>Clear selection</button>
              </div>
              <p className="subtle">Compilation checks references and preserves original module/script inventories. It does not prove actor spawning, gameplay, wave rules or Forerunner compatibility. Missing encounters, loadout profiles or navigation must be authored separately.</p>
            </>}
          </details>}
          {report && (
            <>
              <p className="subtle">
                {report.report.target.family} · {report.report.target.edition} ·{' '}
                {report.report.target.distribution} · {report.report.target.platform} /{' '}
                {report.report.target.architecture}
              </p>
              <div className="runtime-capability-list">
                {report.report.capabilities.map((item) => (
                  <div key={item.operation}>
                    <strong>{item.operation.replace(/([A-Z])/g, ' $1')}</strong>
                    <span>
                      {availabilityLabel[item.availability]} · {evidenceLabel[item.evidenceLevel]}
                    </span>
                    <p>{item.detail}</p>
                    {item.gates.length > 0 && <small>{item.gates.map((g) => g.detail).join(' ')}</small>}
                  </div>
                ))}
              </div>
              <details>
                <summary>Retained runtime and research targets ({report.profiles.length})</summary>
                {report.profiles.map((profile) => (
                  <p key={profile.profileId}>
                    <strong>{profile.label}</strong> ·{' '}
                    {profile.implementedAdapter ? 'Operation-specific adapter' : 'Research target'}
                    <br />
                    <small>{profile.detail}</small>
                  </p>
                ))}
              </details>
              {report.processes.map((process) => (
                <p key={process.id}>
                  {process.actionId} · PID {process.processId} · {process.status}
                  {process.exitCode !== null && ` (${process.exitCode})`}
                  <br />
                  <small>{process.detail}</small>
                </p>
              ))}
            </>
          )}
        </section>
      </div>
      )}
      {plan && (
        <div className="modal-backdrop">
          <section
            ref={planDialog}
            className="modal runtime-details-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="runtime-launch-title"
          >
            <div className="section-heading">
              <h2 id="runtime-launch-title">
                Open{' '}
                {plan.actionId === 'testScene'
                  ? 'Standalone scene test'
                  : plan.actionId === 'editLevel'
                    ? 'Sapien'
                    : 'Guerilla'}
              </h2>
              <button disabled={busy} aria-label="Cancel tool launch" onClick={() => setPlan(null)}>
                <X size={18} />
              </button>
            </div>
            <p>{plan.detail}</p>
            <dl className="runtime-launch-paths">
              <dt>Executable</dt>
              <dd>{plan.executable}</dd>
              <dt>SHA-256</dt>
              <dd>{plan.executableSha256}</dd>
              <dt>Tool architecture</dt>
              <dd>{plan.executableArchitecture}</dd>
              <dt>Working tags</dt>
              <dd>{plan.tagsDirectory}</dd>
              <dt>Scenario</dt>
              <dd>{plan.scenarioFile}</dd>
            </dl>
            <details>
              <summary>Exact launch arguments and startup script</summary>
              <pre>
                {JSON.stringify(plan.arguments, null, 2)}
                {plan.startupScript && `\n${plan.startupScript}`}
              </pre>
            </details>
            <label className="toggle-setting">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              Allow this installed tool to open and edit this derived working tag folder.
            </label>
            <div className="button-row">
              <button disabled={!consent || busy || dirty} onClick={() => void launch()}>
                {busy ? <LoaderCircle size={14} className="spin" /> : <Play size={14} />}Open tool
              </button>
              <button disabled={busy} onClick={() => setPlan(null)}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
