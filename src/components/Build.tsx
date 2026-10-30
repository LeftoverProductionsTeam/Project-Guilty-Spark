import { lazy, Suspense, useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  Circle,
  FileCheck2,
  FolderOpen,
  Hammer,
  Package,
  Play,
  RefreshCw,
  Square,
  Terminal,
  Trash2,
} from 'lucide-react';
import type { Bootstrap, CompatibilityReport, JobEvent, Project, Readiness, TemplateReport } from '../types';
import { call, native } from '../api';
import { CheckRow, Notice, PageTitle, Pill } from './ui';
import BuildTargets from './BuildTargets';
import ConversionBitmapRepair from './ConversionBitmapRepair';
import {useMapState,writeMapSession} from '../mapSession';
import './portabilityLab.css';
const PortabilityLab=lazy(()=>import('./PortabilityLab'));
export default function Build({
  project,
  data,
  logs,
  activeJob,
  dirty,
  epoch,
  onStart,
  onAction,
  onSettings,
  onRefresh,
  onResources,
  onOpenCompiled,
  onSave,
  edit,
}: {
  project: Project;
  data: Bootstrap;
  logs: JobEvent[];
  activeJob: string | null;
  dirty: boolean;
  epoch: number;
  onStart: () => void;
  onAction: (f: () => Promise<unknown>, success?: string) => Promise<void>;
  onSettings: () => void;
  onRefresh: () => void;
  onResources: () => void;
  onOpenCompiled: (buildId:string) => void;
  onSave:()=>Promise<void>;
  edit:(project:Project,description:string)=>void;
}) {
  const [report, setReport] = useState<CompatibilityReport | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [template, setTemplate] = useState<TemplateReport | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [checking, setChecking] = useState(true);
  const [preparing,setPreparing]=useState(false);
  const [view,setView]=useMapState<'build'|'portability'>(project.id,'build.view','build');
  useEffect(() => {
    let cancelled = false;
    async function fetchReports() {
      if (!native || !project.source) return;
      // Keep the repair workflow mounted while saving and refreshing its audit.
      setChecking(true);
      setIssues([]);
      const results = await Promise.allSettled([
        call<CompatibilityReport>('compatibility', { id: project.id }),
        call<Readiness>('launch_readiness', { id: project.id }),
        call<TemplateReport>('inspect_template', { id: project.id }),
      ]);
      if (cancelled) return;
      setReport(results[0].status === 'fulfilled' ? results[0].value : null);
      setReadiness(results[1].status === 'fulfilled' ? results[1].value : null);
      setTemplate(results[2].status === 'fulfilled' ? results[2].value : null);
      setChecking(false);
      const labels = ['Compatibility check', 'Launch readiness', 'Metadata template'];
      setIssues(
        results.flatMap((result, index) =>
          result.status === 'rejected' ? [`${labels[index]}: ${String(result.reason)}`] : [],
        ),
      );
    }
    void fetchReports();
    return () => {
      cancelled = true;
    };
  }, [project.id, project.modifiedAt, project.builds.length,project.conversionProfile,project.activeBuildTarget,project.buildTargets,dirty, data.settings, epoch]);
  const projectLogs = logs.filter((l) => l.projectId === project.id);
  const last = projectLogs.at(-1);
  const validated = dirty || checking
    ? undefined
    : project.builds.find((b) => b.id === readiness?.currentValidatedBuildId);
  const steps = [
    ['validate', 'Inspect source'],
    ['extract', 'Extract tags'],
    ['compile', 'Build MCC cache'],
    ['verify', 'Validate output'],
  ];
  return (
    <div className="build-page">
      <PageTitle
        eyebrow="BUILD & PLAYTEST"
        title="From archive to in-game."
        description="A traceable pipeline. A separate package. Your installation protected."
        actions={
          <>
            {validated && <><button onClick={()=>onOpenCompiled(validated.id)}><FolderOpen size={14}/>Open compiled map</button><button onClick={()=>{writeMapSession(project.id,'portability.compare-build',validated.id);setView('portability');}}>Review native changes</button></>}
            <button onClick={()=>void onAction(async()=>{if(dirty)await onSave();onRefresh();})}>
              <RefreshCw size={14} />
              {dirty?'Save & refresh checks':'Refresh checks'}
            </button>
            {view==='build'&&<button className="primary" onClick={onStart} disabled={checking || !report?.ready || !!activeJob}>
              <Hammer size={15} />
              {dirty ? 'Save & convert to MCC' : 'Convert map to MCC'}
            </button>}
          </>
        }
      />
      <div className="build-workflow-tabs" role="tablist" aria-label="Build workflows"><button role="tab" aria-selected={view==='build'} onClick={()=>setView('build')}>Build & playtest</button><button role="tab" aria-selected={view==='portability'} onClick={()=>setView('portability')}>Portability Lab</button></div>
      {view==='portability'&&<Suspense fallback={<p role="status">Loading Portability Lab…</p>}><PortabilityLab project={project} dirty={dirty} onSave={onSave} onBuild={()=>setView('build')} onSettings={onSettings}/></Suspense>}
      {view==='build'&&checking&&<p role="status">Checking saved map dependencies…</p>}
      <div className="build-columns" hidden={view!=='build'}>
        <div className="build-main">
          <section className="surface build-conversion"><h3>Map conversion · CE / PC / Demo to MCC Halo 1</h3>
            <p>Extract the original map’s custom tags, layer them over a verified copy of your legal MCC SDK tags, and compile a native MCC cache. Source maps and SDK master tags stay unchanged. The game load is a separate check.</p>
            <BuildTargets project={project} defaults={data.settings} onChange={next=>edit(next,'Configure map conversion target')}/>
            <button disabled={!native||preparing||!!activeJob} onClick={()=>{setPreparing(true);void onAction(async()=>{await call('prepare_mcc_conversion_tools',{projectId:project.id});onRefresh();},'MCC tools and editable tags are prepared. Your choices are saved.').finally(()=>setPreparing(false));}}>{preparing?'Preparing installed MCC tools…':'Prepare installed MCC tools'}</button>
            <p className="subtle">If the SDK is not installed: Steam → Library → include Tools → Halo: CE Mod Tools - MCC. Preparation extracts its bundled tags into Spark’s local cache and remembers the folders.</p>
            {project.source?.sha256==='b38f35508188872b2535888193de80f766d92d3b8d53a8ada7be4fc9808a996d'&&<label>Zombie Apocalypse conversion profile<select aria-label="Zombie Apocalypse conversion profile" value={project.conversionProfile??'faithful'} onChange={e=>edit({...project,conversionProfile:e.target.value as Project['conversionProfile']},'Choose Zombie Apocalypse conversion profile')}><option value="faithful">Faithful · require the two original missing custom audio cues</option><option value="zombie-recovery">Recovery edition · omit two unavailable cues and disable one corrupt placement</option></select></label>}
            {project.conversionProfile==='zombie-recovery'&&<Notice>The recovery edition retains the actual vehicle-based zombie spawners and valid mixed-class placements. Two missing custom sounds and the corrupt first placement are recorded as omissions. Runtime behavior still needs testing.</Notice>}
            {project.source?.cacheVersion===609&&data.entries.find(entry=>entry.id===project.id)?.scenarioType===1&&<label className="toggle-setting"><input aria-label="Use MCC multiplayer UI dependencies" type="checkbox" checked={project.conversionProfile==='mcc-multiplayer-ui'} onChange={e=>edit({...project,conversionProfile:e.target.checked?'mcc-multiplayer-ui':'faithful'},'Choose MCC multiplayer UI compatibility')}/><span>Use MCC multiplayer UI dependencies<small>Replaces the CE startup multiplayer UI collection with your installed MCC SDK version. Custom entries under that collection are not retained. The change is recorded; custom UI/HUD and game loading still need testing.</small></span></label>}
          </section>
          {issues.map((issue) => (
            <Notice key={issue}>{issue}</Notice>
          ))}
          <section className="surface build-resources">
            <h3>Source resource directory</h3>
            <code className="path-text">
              {project.source?.resourceDirectory ??
                data.settings.resourceDirectory ??
                'No source resource directory configured'}
            </code>
            <p className="subtle">
              Select the matching original bitmaps.map, sounds.map and loc.map directory for this project.
              Unrelated runtime resource sets can change assets or fail extraction.
            </p>
            <button disabled={!!activeJob} onClick={onResources}>
              <FolderOpen size={14} />
              {dirty ? 'Save & choose source resources…' : 'Choose source resources…'}
            </button>
          </section>
          {!!report?.bitmapDependencies?.required&&<ConversionBitmapRepair project={project} settings={data.settings} audit={report.bitmapDependencies} disabled={!!activeJob} onSave={onSave} onUse={next=>edit(next,'Use repaired bitmap dependency tagset')}/>}
          <section className="surface build-target">
            <div className="section-label">Build target</div>
            <div className="target-heading">
              <div className="target-icon">
                <Hammer size={24} />
              </div>
              <div>
                <h2>Halo 1 · The Master Chief Collection</h2>
                <p>Cache version 13 · {report?.pipeline??'Verified extraction and target compilation'}</p>
              </div>
              <Pill tone={report?.ready ? 'green' : 'amber'}>
                {report?.ready ? 'Ready to build' : 'Dependencies required'}
              </Pill>
            </div>
            <div className="build-steps">
              {steps.map(([id, label], i) => (
                <div key={id} className={last?.phase === id ? 'step current' : 'step'}>
                  <span>{last?.phase === 'validated' ? <Check size={14} /> : i + 1}</span>
                  <strong>{label}</strong>
                  {i < 3 && <ArrowRight size={13} />}
                </div>
              ))}
            </div>
            {activeJob && (
              <>
                <div className="progress-track">
                  <div style={{ width: `${Math.max(last?.progress ?? 0, 3)}%` }} />
                </div>
                <div className="job-progress">
                  <span>
                    {last?.phase ?? 'Starting'} · {last?.progress ?? 0}%
                  </span>
                  <button
                    className="small-button"
                    onClick={() =>
                      void onAction(
                        () => call('cancel_build', { jobId: activeJob }),
                        'Cancellation requested. Write-sensitive compilation may defer stopping until a safe boundary; watch the job status.',
                      )
                    }
                  >
                    <Square size={11} />
                    Cancel job
                  </button>
                </div>
              </>
            )}
          </section>
          {project.source?.cacheVersion === 13 && !project.bspAssembly && !project.animationAssignments?.length && !project.powerups?.length && !project.tagDuplicates?.length && !project.studio?.engineMachinima?.enabled && (!project.conversionProfile || project.conversionProfile === 'faithful') && (
            <div className="surface">
              <div className="section-heading">
                <h3>Already built for MCC?</h3>
                <Pill>Cache 13 only</Pill>
              </div>
              <p className="subtle">
                An unchanged MCC source can be checked and packaged directly. This verifies its structure,
                protection flags and CRC; it does not convert a legacy map or certify in-game playability.
              </p>
              <button
                disabled={dirty || !!activeJob || project.tagEdits.length > 0}
                onClick={() =>
                  void onAction(
                    () => call('validate_existing', { id: project.id }),
                    'Existing MCC cache checked and copied unchanged. No conversion was performed.',
                  )
                }
              >
                <FileCheck2 size={14} />
                Validate existing MCC cache
              </button>
            </div>
          )}
          {report && (
            <section className="surface compatibility">
              <div className="section-heading">
                <h3>Compatibility report</h3>
                <Pill tone={report.ready ? 'green' : 'amber'}>{report.blockers.length} blockers</Pill>
              </div>
              {report.blockers.map((b, i) => (
                <div className="report-line blocked" key={i}>
                  <Circle size={10} />
                  <p>{b}</p>
                </div>
              ))}
              {report.warnings.map((w, i) => (
                <div className="report-line" key={i}>
                  <Circle size={9} />
                  <p>{w}</p>
                </div>
              ))}
              {report.blockers.length > 0 && (
                <button className="small-button" onClick={onSettings}>
                  Configure paths
                  <ArrowRight size={13} />
                </button>
              )}
            </section>
          )}
          <section className="surface log-panel">
            <div className="section-heading">
              <h3>
                <Terminal size={16} />
                Build output
              </h3>
              <Pill>Structured local logs</Pill>
            </div>
            <div className="build-log" role="log" aria-label="Build log">
              {projectLogs.length ? (
                projectLogs.slice(-350).map((l, i) => (
                  <div key={`${l.timestamp}-${i}`} className={`log-line ${l.severity}`}>
                    <time>{new Date(l.timestamp).toLocaleTimeString('en-US', { hour12: false })}</time>
                    <span className="log-phase">{l.phase}</span>
                    <span>{l.message}</span>
                  </div>
                ))
              ) : (
                <div className="log-wait">
                  <Terminal size={20} />
                  <p>Tool output will appear here when a build starts.</p>
                  <small>Jobs run in isolated project directories with cancellation and time limits.</small>
                </div>
              )}
            </div>
          </section>
          <section className="surface">
            <div className="section-heading">
              <h3>Build history</h3>
              <Pill>{project.builds.length} jobs</Pill>
            </div>
            {project.builds.length ? (
              project.builds
                .slice()
                .reverse()
                .map((b) => (
                  <div className="build-history-item" key={b.id}>
                    <FileCheck2 size={18} />
                    <div>
                      <strong>
                        {b.status === 'validated'
                          ? 'Structurally validated'
                          : b.status === 'cancelled'
                            ? 'Cancelled'
                            : 'Build failed'}
                      </strong>
                      <small>
                        {new Date(b.timestamp).toLocaleString()} · {b.target}
                      </small>
                      <p>{b.message}</p>
                      {b.output && <code>{b.output}</code>}
                    </div>
                    <Pill tone={b.status === 'validated' ? 'green' : 'amber'}>{b.status}</Pill>
                  </div>
                ))
            ) : (
              <p className="subtle">No builds have been run for this project.</p>
            )}
          </section>
        </div>
        <aside className="build-sidebar">
          <section className="surface">
            <div className="section-heading">
              <h3>
                <Package size={16} />
                Local MCC package
              </h3>
            </div>
            <p className="subtle">
              Official Excession metadata is preserved, then paired with the validated cache in a dedicated
              mod folder.
            </p>
            <CheckRow
              ok={!!validated}
              label="Validated build for current edits"
              detail={
                dirty ? 'Unsaved edits require a fresh check after saving.' : readiness?.currentBuildMessage
              }
            />
            <CheckRow
              ok={!!template?.valid}
              label="Excession metadata template"
              detail={template?.title || 'Exact scenario metadata is required'}
            />
            {template?.blockers.map((b, i) => (
              <div className="compact-warning" key={i}>
                {b}
              </div>
            ))}
            <CheckRow ok={!!readiness?.registered} label="ModManifest registration" />
            <button
              className="primary full"
              disabled={!validated || !template?.valid || !!activeJob || dirty}
              onClick={() =>
                void onAction(
                  () => call('install_package', { id: project.id, buildId: validated?.id }),
                  'Owned package created and its mod root registered. MCC load test is still pending.',
                )
              }
            >
              <Package size={15} />
              Install local package
            </button>
            <button
              className="small-button full"
              disabled={!readiness?.packageValid || !!activeJob}
              onClick={() =>
                void onAction(
                  () => call('remove_package', { id: project.id }),
                  'Guilty Spark-owned package removed. Existing manifest roots and unrelated mods were preserved.',
                )
              }
            >
              <Trash2 size={13} />
              Remove owned package
            </button>
          </section>
          <section className="surface launch-panel">
            <div className="section-label">Playtest readiness</div>
            <CheckRow ok={!!readiness?.mccFound} label="MCC located" />
            <CheckRow ok={!!readiness?.halo1Installed} label="Halo 1 installed" />
            <CheckRow ok={!!readiness?.steamAvailable} label="Steam available" />
            <CheckRow ok={!dirty && !!readiness?.packageValid} label="Current package verified" />
            <div className="mod-mode-note">
              <Pill tone="amber">Anti-cheat disabled required</Pill>
              <p>
                Steam must use <strong>Play Halo: MCC Anti-Cheat Disabled (Mods and Limited Services)</strong>
                .
              </p>
              <small>
                Guilty Spark opens Steam’s normal launch workflow. It cannot verify or silently select the
                anti-cheat mode.
              </small>
            </div>
            <button
              className="primary full launch-button"
              disabled={!readiness?.launchReady || dirty || !!activeJob}
              onClick={() => void onAction(() => call('launch_mcc', { id: project.id }))}
            >
              <Play size={15} />
              Launch in Steam<span>Mods &amp; Limited Services</span>
            </button>
            <p className="microcopy">
              Select the map inside MCC after launching. An in-game load has not been verified.
            </p>
          </section>
          <button
            className="small-button full"
            onClick={() => void onAction(() => call('reveal_folder', { kind: 'project', id: project.id }))}
          >
            <FolderOpen size={14} />
            Open project folder
          </button>
          <Notice>
            {project.title} acceptance requires a successful conversion, a registered local package, and an
            in-game load test of the converted map.
          </Notice>
        </aside>
      </div>
    </div>
  );
}
