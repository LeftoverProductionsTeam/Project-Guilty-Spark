import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createLatestRefresh } from '../latestRefresh';
import { assemblySignature } from '../bspAssembly';
import { BSP_STRUCTURE_WITNESS, type BspStructureWitness } from '../haloWrl';
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
import RuntimeLiveRebuild from './RuntimeLiveRebuild';
import SmartEditPanel from './SmartEditPanel';
import MapExport from './MapExport';
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
  onReviewGeometry,
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
  onReviewGeometry: () => void;
  onSave:(persist?:boolean)=>Promise<void>;
  edit:(project:Project,description:string)=>void;
}) {
  const [report, setReport] = useState<CompatibilityReport | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [template, setTemplate] = useState<TemplateReport | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [checking, setChecking] = useState(true);
  const [preparing,setPreparing]=useState(false);
  const [view,setView]=useMapState<'build'|'portability'>(project.id,'build.view','build');
  const [inputsOpen,setInputsOpen]=useMapState(project.id,'build.inputsOpen',false),
    [resourcesOpen,setResourcesOpen]=useMapState(project.id,'build.resourcesOpen',false),
    [reportOpen,setReportOpen]=useMapState(project.id,'build.reportOpen',false),
    [historyOpen,setHistoryOpen]=useMapState(project.id,'build.historyOpen',false);
  const target=project.buildTargets?.find(t=>t.id===project.activeBuildTarget);
  const ceTarget=target?.builder==='invader-ce'&&['haloCustomEdition','chupathingyCe'].includes(target.runtimeId);
  type Audit = [PromiseSettledResult<CompatibilityReport>,PromiseSettledResult<Readiness>,PromiseSettledResult<TemplateReport|null>];
  const reportsRefresh=useRef<ReturnType<typeof createLatestRefresh<{id:string;ceTarget:boolean},Audit>>|null>(null);
  useEffect(()=>{
    const queue=createLatestRefresh(async({id,ceTarget}:{id:string;ceTarget:boolean}):Promise<Audit>=>Promise.allSettled([
      call<CompatibilityReport>('compatibility',{id}),
      call<Readiness>('launch_readiness',{id}),
      ceTarget?Promise.resolve(null):call<TemplateReport>('inspect_template',{id}),
    ]),()=>{});
    reportsRefresh.current=queue;
    return()=>{queue.dispose();if(reportsRefresh.current===queue)reportsRefresh.current=null;};
  },[]);
  useEffect(() => {
    let cancelled = false;
    async function fetchReports() {
      if (!native || !project.source) return;
      // Keep the repair workflow mounted while saving and refreshing its audit.
      setChecking(true);
      setIssues([]);
      const queue=reportsRefresh.current;if(!queue)return;
      const results = await queue.request({id:project.id,ceTarget:!!ceTarget});
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
    void fetchReports().catch(error=>{
      if(cancelled)return;
      setReport(null);setReadiness(null);setTemplate(null);setChecking(false);
      setIssues(['Build checks: '+String(error)]);
    });
    return () => {
      cancelled = true;
    };
  }, [project.id, project.modifiedAt, project.builds.length,project.conversionProfile,project.activeBuildTarget,project.buildTargets,project.megaworldRuntimeRegistrationId,dirty, data.settings, epoch]);
  const separateBsps = project.bspAssembly?.separateNativeBsps === true;
  const targetName=ceTarget?(target!.runtimeId==='chupathingyCe'?'Chupathingy':'Custom Edition'):'MCC';
  const projectLogs = logs.filter((l) => l.projectId === project.id);
  const last = projectLogs.at(-1);
  const [witness] = useMapState<BspStructureWitness | null>(project.id, BSP_STRUCTURE_WITNESS, () => null);
  const canReviewGeometry = last?.phase === 'failed' && witness?.jobId === last.jobId
    && !!project.bspAssembly && witness.sourceSha256 === project.source?.sha256
    && witness.assemblySignature === assemblySignature(project.bspAssembly);
  const validated = dirty || checking
    ? undefined
    : ceTarget ? project.builds.find(b=>b.status==='validated'&&['gbx-custom','ce-existing'].includes(b.target)&&b.id===readiness?.currentValidatedBuildId) : project.builds.find((b) => b.id === readiness?.currentValidatedBuildId);
  const steps = [
    ['validate', 'Inspect source'],
    ['extract', 'Extract tags'],
    ['compile', `Build ${targetName} cache`],
    ['verify', 'Validate output'],
  ];
  return (
    <div className="build-page">
      <PageTitle
        eyebrow="BUILD & PLAYTEST"
        title="Build & playtest"
        description={'Create a playable copy for ' + targetName + ' from ' + project.title + '.'}
        actions={
          <>
            {validated && <><button onClick={()=>onOpenCompiled(validated.id)}><FolderOpen size={14}/>{['mcc-direct','ce-direct'].includes(validated.target)?'Open edited map copy':'Open compiled map'}</button><button onClick={()=>{writeMapSession(project.id,'portability.compare-build',validated.id);setView('portability');}}>Review native changes</button></>}
            <button onClick={()=>void onAction(async()=>{if(dirty)await onSave(true);onRefresh();})}>
              <RefreshCw size={14} />
              {dirty?'Save & refresh checks':'Refresh checks'}
            </button>
            {view==='build'&&<button className="primary" onClick={onStart} disabled={checking || !report?.ready || !!activeJob}>
              <Hammer size={15} />
              {project.shapeDraft?.vehicleMount ? (dirty ? 'Save & build vehicle attachment' : 'Build vehicle attachment') : separateBsps ? (dirty ? 'Save & build native BSPs' : 'Build native BSPs') : ceTarget?(dirty?`Save & build for ${targetName}`:`Build for ${targetName}`):(dirty ? 'Save & convert to MCC' : 'Convert map to MCC')}
            </button>}
          </>
        }
      />
      <SmartEditPanel project={project} onSave={onSave} notify={message=>{void onAction(async()=>{onRefresh();return message;},message);}}/>
      <div className="build-workflow-tabs" role="tablist" aria-label="Build workflows"><button role="tab" aria-selected={view==='build'} onClick={()=>setView('build')}>Build & playtest</button><button role="tab" aria-selected={view==='portability'} onClick={()=>setView('portability')}>Portability Lab</button></div>
      {view==='portability'&&<Suspense fallback={<p role="status">Loading Portability Lab…</p>}><PortabilityLab project={project} dirty={dirty} onSave={onSave} onBuild={()=>setView('build')} onSettings={onSettings}/></Suspense>}
      <RuntimeLiveRebuild project={project} runtimeId="openCe"
        vehicleBuildId={view==='build'&&validated?.target==='mcc-cea'&&project.shapeDraft?.vehicleMount ? validated.id : null}
        onSave={()=>onSave(true)}/>
      {view==='build'&&checking&&<p role="status">Checking saved map dependencies…</p>}
      {view==='build'&&canReviewGeometry&&<section className="build-next-step" aria-label="Native structure failure">
        <strong>Halo Tool found a geometry problem</strong>
        <button type="button" onClick={onReviewGeometry}>Show affected geometry in Level Editor</button>
      </section>}
      {view==='build'&&report&&!report.ready&&report.blockers.length>0&&<section className="build-next-step" aria-label="What to fix before building">
        <strong>Before you can build</strong><p>{report.blockers[0]}</p>
        <button onClick={()=>setReportOpen(true)}>Show all {report.blockers.length} checks</button>
        {/resource|sounds\.map|bitmaps\.map/i.test(report.blockers[0])&&<button onClick={onResources}>Locate original resources</button>}
      </section>}
      <div className="build-columns" hidden={view!=='build'}>
        <div className="build-main">
          <details className="surface build-conversion" open={inputsOpen} onToggle={event=>setInputsOpen(event.currentTarget.open)}><summary>Build inputs &amp; conversion <small>Source resources and {targetName} toolchain</small></summary>
            <p>{separateBsps ? (ceTarget
              ? 'Build two native BSPs from the matching editable region tags. CE609 includes donor pickups and retains the base starts and flags.'
              : 'Build two native BSPs from the matching editable region tags. The MCC13 output includes donor starts, pickups and teleporters. Regional gameplay needs a runtime with reviewed support.') : ceTarget?`${project.bspAssembly?"Rebuild the connected CE regions":"Compile this scenario from its complete matching editable CE tags"}, producing a standard CE cache for ${targetName}. Select and review that tagset in Engine build targets; a stock SDK cannot replace the original scenario. Existing tags and maps stay unchanged. Pending cache edits cannot be silently omitted. Native compilation and actual engine loading are checked separately.`:"Extract the original map’s custom tags, layer them over a verified copy of your legal MCC SDK tags, and compile a native MCC cache. Source maps and SDK master tags stay unchanged. The game load is a separate check."}</p>
            <BuildTargets project={project} defaults={data.settings} onSave={onSave} onChange={next=>edit(next,'Configure map conversion target')}/>
            {!ceTarget&&<>
            <button disabled={!native||preparing||!!activeJob} onClick={()=>{setPreparing(true);void onAction(async()=>{await call('prepare_mcc_conversion_tools',{projectId:project.id});onRefresh();},'MCC tools and editable tags are prepared. Your choices are saved.').finally(()=>setPreparing(false));}}>{preparing?'Preparing installed MCC tools…':'Prepare installed MCC tools'}</button>
            <p className="subtle">If the SDK is not installed: Steam → Library → include Tools → Halo: CE Mod Tools - MCC. Preparation extracts its bundled tags into Spark’s local cache and remembers the folders.</p>
            </>}
            {project.source?.sha256==='b38f35508188872b2535888193de80f766d92d3b8d53a8ada7be4fc9808a996d'&&<label>Zombie Apocalypse conversion profile<select aria-label="Zombie Apocalypse conversion profile" value={project.conversionProfile??'faithful'} onChange={e=>edit({...project,conversionProfile:e.target.value as Project['conversionProfile']},'Choose Zombie Apocalypse conversion profile')}><option value="faithful">Faithful · require the two original missing custom audio cues</option><option value="zombie-recovery">Recovery edition · omit two unavailable cues and disable one corrupt placement</option></select></label>}
            {project.conversionProfile==='zombie-recovery'&&<Notice>The recovery edition retains the actual vehicle-based zombie spawners and valid mixed-class placements. Two missing custom sounds and the corrupt first placement are recorded as omissions. Runtime behavior still needs testing.</Notice>}
            {!ceTarget&&!project.bspAssembly&&project.source?.cacheVersion===609&&data.entries.find(entry=>entry.id===project.id)?.scenarioType===1&&<label className="toggle-setting"><input aria-label="Use MCC multiplayer UI dependencies" type="checkbox" checked={project.conversionProfile==='mcc-multiplayer-ui'} onChange={e=>edit({...project,conversionProfile:e.target.checked?'mcc-multiplayer-ui':'faithful'},'Choose MCC multiplayer UI compatibility')}/><span>Use MCC multiplayer UI dependencies<small>Replaces the CE startup multiplayer UI collection with your installed MCC SDK version. Custom entries under that collection are not retained. The change is recorded; custom UI/HUD and game loading still need testing.</small></span></label>}
          </details>
          {issues.map((issue) => (
            <Notice key={issue}>{issue}</Notice>
          ))}
          <details className="surface build-resources" open={resourcesOpen} onToggle={event=>setResourcesOpen(event.currentTarget.open)}>
            <summary>Source resources <code className="path-text" title={project.source?.resourceDirectory??data.settings.resourceDirectory??undefined}>
              {project.source?.resourceDirectory ??
                data.settings.resourceDirectory ??
                'Choose the matching resource folder'}
            </code></summary>
            <p className="subtle">
              Select the matching original bitmaps.map, sounds.map and loc.map directory for this project.
              Unrelated runtime resource sets can change assets or fail extraction.
            </p>
            <button disabled={!!activeJob} onClick={onResources}>
              <FolderOpen size={14} />
              {dirty ? 'Save & choose source resources…' : 'Choose source resources…'}
            </button>
          </details>
          {!!report?.bitmapDependencies?.required&&<ConversionBitmapRepair project={project} settings={data.settings} audit={report.bitmapDependencies} disabled={!!activeJob} onSave={onSave} onUse={next=>edit(next,'Use repaired bitmap dependency tagset')}/>}
          <section className="surface build-target">
            <div className="section-label">Build target</div>
            <div className="target-heading">
              <div className="target-icon">
                <Hammer size={24} />
              </div>
              <div>
                <h2>{ceTarget?`Halo 1 · ${targetName}`:"Halo 1 · The Master Chief Collection"}</h2>
                <p>Cache version {ceTarget?609:13} · {report?.pipeline??'Verified extraction and target compilation'}</p>
              </div>
              <Pill tone={checking ? '' : report?.ready ? 'green' : 'amber'}>
                {checking ? 'Checking build inputs…' : report?.ready ? 'Ready to build' : report ? 'Build blocked' : 'Build checks unavailable'}
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
          {[13,609].includes(project.source?.cacheVersion??0) && !project.quickForge && !project.firefight && !project.assets.length && !project.nativeAssetImports?.length && !project.nativeLighting && !project.bspAssembly && !project.animationAssignments?.length && !project.powerups?.length && !project.tagDuplicates?.length && !project.tagRenames?.length && !project.studio?.engineMachinima?.enabled && (!project.conversionProfile || project.conversionProfile === 'faithful') && (
            <details className="surface build-existing-cache">
              <summary>Check an unchanged {project.source?.cacheVersion===609?'CE':'MCC'} cache <Pill>Cache {project.source?.cacheVersion}</Pill></summary>
              <p className="subtle">
                An unchanged source can be checked and exported directly. This verifies its structure,
                protection flags and CRC; it does not compile edits, convert formats or certify in-game playability.
              </p>
              <button
                disabled={dirty || !!activeJob || project.tagEdits.length > 0}
                onClick={() =>
                  void onAction(
                    () => call('validate_existing', { id: project.id }),
                    'Existing cache checked and copied unchanged. No compilation or conversion was performed.',
                  )
                }
              >
                <FileCheck2 size={14} />
                Validate existing {project.source?.cacheVersion===609?'CE':'MCC'} cache
              </button>
            </details>
          )}
          {report && (
            <details className="surface compatibility" open={report.blockers.length>0||reportOpen} onToggle={event=>setReportOpen(event.currentTarget.open)}>
              <summary>Compatibility report <Pill tone={report.ready?'green':'amber'}>{report.blockers.length} blockers · {report.warnings.length} notes</Pill></summary>
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
            </details>
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
          <details className="surface build-history" open={historyOpen} onToggle={event=>setHistoryOpen(event.currentTarget.open)}>
            <summary>Build history <Pill>{project.builds.length} jobs</Pill></summary>
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
                      {b.status==='validated'&&b.output&&<MapExport projectId={project.id} buildId={b.id} runtimeId={b.target.startsWith('mcc')?'mccSteam':project.quickForge?.runtimeId??'haloCustomEdition'} onSave={onSave}/>}
                    </div>
                    <Pill tone={b.status === 'validated' ? 'green' : 'amber'}>{b.status}</Pill>
                  </div>
                ))
            ) : (
              <p className="subtle">No builds have been run for this project.</p>
            )}
          </details>
        </div>
        <aside className="build-sidebar">
          {ceTarget?<section className="surface"><h3>{targetName} playtest</h3><p>Build a standard Custom Edition cache with the selected source tags. Recovered scenario modules are available in Runtime & Tools → Details → Edit or attach scenario HaloScript after a validated source build. Draft Save and native source compilation are separate steps. Select the matching runtime profile for testing; multiplayer maps use Online to host or join.</p><p>{readiness?.currentBuildMessage??'Save and build before starting a playtest.'}</p><small>Map loading, player movement and vehicle travel need their own game tests.</small></section>:<>
          <section className="surface">
            <div className="section-heading">
              <h3>
                <Package size={16} />
                Local MCC package
              </h3>
            </div>
            <p className="subtle" title="Excession creates MCC’s package description files. Spark preserves them and installs your map in a separate mod folder.">
              Package your validated map with an Excession description.
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
              label="MCC package description"
              detail={template?.title || 'Choose an Excession package template for this scenario'}
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
            <CheckRow ok={!dirty && !!readiness?.packageValid} label="Package matches saved edits" detail="Checks file identity and the saved project revision. An in-game playtest is a separate step." />
            <details className="mod-mode-note">
              <summary><Pill tone="amber">Anti-cheat disabled required</Pill></summary>
              <p>
                Steam must use <strong>Play Halo: MCC Anti-Cheat Disabled (Mods and Limited Services)</strong>
                .
              </p>
              <small>
                Guilty Spark opens Steam’s normal launch workflow. It cannot verify or silently select the
                anti-cheat mode.
              </small>
            </details>
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
          <small className="build-acceptance-note">Compilation, package validation and an in-game playtest are separate checks.</small>
        </>}
        </aside>
      </div>
    </div>
  );
}
