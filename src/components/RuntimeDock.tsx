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
import { exportPlannedFirefightRound } from '../haloScript';
import { downloadLocalText } from '../exportHelpers';
import { useMapState, writeMapSession, compiledSourceSessionId, compiledSourceHint, COMPILED_SOURCE_KEY } from '../mapSession';
import type { Project, RuntimeId, Settings, Workspace } from '../types';
import type {
  RuntimeWorkbenchReport,
  CompiledSourceProject,
  NativeScriptAttachment,
  WorkingScriptSources,
  WorkingScriptSource,
  FirefightSourcePlan,
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

type ScriptEditorAttachment=NativeScriptAttachment&{sourceKey:string;reviewed:boolean;fileSha256:string};

export default function RuntimeDock({
  onEdit,
  project,
  settings,
  dirty,
  working,
  epoch,
  onSave,
  onNavigate,
  onOpenCompiled,
  onOpenSourceProject,
}: {
  project: Project | null;
  onEdit: (project:Project,description:string)=>void;
  settings: Settings;
  dirty: boolean;
  working: boolean;
  epoch: number;
  onSave: () => Promise<void>;
  onNavigate: (workspace: Workspace) => void;
  onOpenCompiled: (buildId: string) => void;
  onOpenSourceProject?: (id:string) => Promise<boolean> | void;
}) {
  const id = project?.id ?? 'global';
  const [storedSource]=useMapState<unknown>(compiledSourceSessionId(project),COMPILED_SOURCE_KEY,()=>null);
  const sourceHint=compiledSourceHint(storedSource,project);
  const sourceKey=JSON.stringify([project?.id,sourceHint?.sourceProjectId,sourceHint?.buildId,sourceHint?.outputSha256]);
  const currentSourceKey=useRef(sourceKey);currentSourceKey.current=sourceKey;
  const sourceRequest=useRef(0);
  const [sourceResult,setSourceResult]=useState<{key:string;source?:CompiledSourceProject;error?:string}|null>(null);
  const [sourceBusy,setSourceBusy]=useState<string|null>(null);
  const sourceLink=sourceResult?.key===sourceKey?sourceResult.source:undefined;
  const sourceError=sourceResult?.key===sourceKey?sourceResult.error:undefined;
  const sourceProjectId=sourceHint?.sourceProjectId,sourceBuildId=sourceHint?.buildId,sourceOutputSha=sourceHint?.outputSha256;
  const inspectSource=useCallback(async()=>{
    if(!native||!project?.id||!sourceProjectId||!sourceBuildId||!sourceOutputSha)return null;
    const request=++sourceRequest.current,key=sourceKey;
    setSourceBusy(key);
    try {
      const source=await call<CompiledSourceProject>('compiled_source_project',{
        compiledProjectId:project.id,sourceProjectId,buildId:sourceBuildId,
      });
      if(request!==sourceRequest.current||currentSourceKey.current!==key)return null;
      if(source.projectId!==sourceProjectId||source.buildId!==sourceBuildId||source.outputSha256.toLowerCase()!==sourceOutputSha)
        throw Error('The editable source link changed; open the source through File → Open saved project.');
      setSourceResult({key,source});return source;
    } catch(problem) {
      if(request===sourceRequest.current&&currentSourceKey.current===key)setSourceResult({key,error:String(problem)});
      return null;
    } finally {
      if(request===sourceRequest.current)setSourceBusy(null);
    }
  },[project?.id,sourceProjectId,sourceBuildId,sourceOutputSha,sourceKey]);
  useEffect(()=>{setSourceResult(null);void inspectSource();return()=>{sourceRequest.current++;};},[inspectSource]);
  async function openEditableSource(){
    const key=sourceKey,source=await inspectSource();
    if(!source||currentSourceKey.current!==key||!onOpenSourceProject)return;
    try {await onOpenSourceProject(source.projectId);}
    catch(problem){if(currentSourceKey.current===key)setSourceResult({key,error:String(problem)});}
  }
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
  const scriptEditor=useRef<HTMLDetailsElement>(null);
  const [scriptsOpen,setScriptsOpen]=useState(false);
  const currentProject=useRef(project);currentProject.current=project;
  const savedScript=project?.scenarioScriptDraft;
  const [scriptReview,setScriptReview]=useState<{draft:NonNullable<Project['scenarioScriptDraft']>;sha256:string}|null>(null);
  const scriptAttachment:ScriptEditorAttachment|null=savedScript?{
    filename:savedScript.filename,content:savedScript.content,fileSha256:savedScript.fileSha256,sourceKey:savedScript.sourceKey,
    sha256:scriptReview?.draft===savedScript?scriptReview.sha256:'',reviewed:scriptReview?.draft===savedScript,
    ...(savedScript.replaceExisting?{replacesSha256:savedScript.fileSha256}:{})
  }:null;
  useEffect(()=>{scriptSelection.current++;setScriptReview(null);},[project?.id,savedScript]);
  const [applyFirefightLoadout,setApplyFirefightLoadout]=useMapState<boolean>(id,'firefight.applyNativeLoadout',false);
  const scriptSourceKey=JSON.stringify([project?.id,runtime,report?.workingSource?.buildId,report?.workingSource?.tagsDirectory,report?.workingSource?.projectFingerprint,workingTarget,project?.firefight,applyFirefightLoadout]);
  const currentScriptSourceKey=useRef(scriptSourceKey);currentScriptSourceKey.current=scriptSourceKey;
  const selectedScript=scriptAttachment?.sourceKey===scriptSourceKey?scriptAttachment:null;
  const moduleRequest=useRef(0);
  const [moduleInventory,setModuleInventory]=useState<{key:string;value:WorkingScriptSources}|null>(null);
  const [moduleBusy,setModuleBusy]=useState(false);
  const [moduleName,setModuleName]=useMapState<string>(id,'sourceScripts.module','');
  const [moduleSearch,setModuleSearch]=useMapState<string>(id,'sourceScripts.search','');
  const modules=moduleInventory?.key===scriptSourceKey?moduleInventory.value:null;
  const pickedModule=modules?.modules.find(module=>module.filename===moduleName);
  useEffect(()=>{
    moduleRequest.current++;setModuleBusy(false);
  },[scriptSourceKey]);
  const [firefightActivation,setFirefightActivation]=useState<'manual'|'startup'>('manual');
  const [firefightSource,setFirefightSource]=useState<{sourceKey:string;plan:FirefightSourcePlan;script:NativeScriptAttachment;reviewed:boolean}|null>(null);
  const selectedFirefightSource=firefightSource?.sourceKey===scriptSourceKey?firefightSource:null;
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
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
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
  useEffect(()=>{
    if(!details||!scriptsOpen)return;
    const frame=requestAnimationFrame(()=>scriptEditor.current?.querySelector<HTMLInputElement>('input[type="file"]')?.focus());
    return()=>cancelAnimationFrame(frame);
  },[details,scriptsOpen,report?.workingSource?.buildId]);
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
        !['editTags', 'editLevel', 'testScene', 'workingTags', 'workingScripts'].includes(detail.actionId)
      )
        return;
      setDetails(true);
      if(detail.actionId==='workingScripts'){setScriptsOpen(true);return;}
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
  function sourceSelectionMatches(selection:WorkingScriptSources,source:NonNullable<RuntimeWorkbenchReport['workingSource']>) {
    return selection.projectId===project?.id&&selection.buildId===source.buildId&&selection.tagsDirectory===source.tagsDirectory
      &&selection.projectFingerprint===source.projectFingerprint;
  }
  async function listScriptModules() {
    const source=report?.workingSource;if(!native||!project||!source?.projectFingerprint||dirty||busy||working||moduleBusy)return;
    const request=++moduleRequest.current,scope=generation.current,key=scriptSourceKey;
    setModuleBusy(true);setError('');
    try {
      const value=await call<WorkingScriptSources>('working_script_sources',{projectId:project.id,expectedBuildId:source.buildId,
        expectedSourceDirectory:source.tagsDirectory,expectedProjectFingerprint:source.projectFingerprint});
      if(request!==moduleRequest.current||scope!==generation.current||key!==currentScriptSourceKey.current)return;
      if(!sourceSelectionMatches(value,source))throw Error('The recovered script listing belongs to a different source revision. Refresh its selection.');
      setModuleInventory({key,value});
      setModuleName(name=>value.modules.some(module=>module.filename===name)?name:value.modules.find(module=>!module.unavailable)?.filename??value.modules[0]?.filename??'');
    } catch(problem){if(request===moduleRequest.current&&scope===generation.current&&key===currentScriptSourceKey.current)setError(String(problem));}
    finally{if(request===moduleRequest.current)setModuleBusy(false);}
  }
  async function openScriptModule() {
    const source=report?.workingSource,inventory=modules,module=pickedModule,draft=currentProject.current?.scenarioScriptDraft;
    if(!native||!project||!source?.projectFingerprint||!inventory||!module||module.unavailable||dirty||busy||working||moduleBusy)return;
    if(draft&&!window.confirm('Replace the current project script draft with this recovered module? Project Undo can restore the previous draft.'))return;
    const request=++moduleRequest.current,scope=generation.current,key=scriptSourceKey,selection=++scriptSelection.current;
    setModuleBusy(true);setError('');
    try {
      const value=await call<WorkingScriptSource>('working_script_source',{projectId:project.id,expectedBuildId:source.buildId,
        expectedSourceDirectory:source.tagsDirectory,expectedProjectFingerprint:source.projectFingerprint,
        expectedSourcesSha256:inventory.sourceSha256,filename:module.filename,expectedSha256:module.sha256});
      const bytes=new TextEncoder().encode(value.script.content);
      if(!bytes.length||bytes.length>1048576)throw Error('The recovered module exceeded its editor limit; the previous draft was retained.');
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const sha256=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
      if(request!==moduleRequest.current||scope!==generation.current||selection!==scriptSelection.current||key!==currentScriptSourceKey.current)return;
      if(currentProject.current?.scenarioScriptDraft!==draft)throw Error('The project draft changed while opening source; the current draft was retained.');
      if(!sourceSelectionMatches(value.selection,source)||value.selection.sourceSha256!==inventory.sourceSha256||
        value.script.filename!==module.filename||value.script.sha256!==module.sha256||sha256!==module.sha256||
        value.script.replacesSha256!==module.sha256)throw Error('Recovered source identity changed; refresh the module list before editing.');
      keepScriptDraft({...value.script,fileSha256:sha256,sourceKey:key,reviewed:false});
    } catch(problem){if(request===moduleRequest.current&&scope===generation.current&&selection===scriptSelection.current&&key===currentScriptSourceKey.current)setError(String(problem));}
    finally{if(request===moduleRequest.current)setModuleBusy(false);}
  }
  function keepScriptDraft(input:ScriptEditorAttachment|null) {
    const latest=currentProject.current;
    if(!latest||latest.id!==project?.id)return;
    const draft=input?{filename:input.filename,content:input.content,fileSha256:input.fileSha256,
      sourceKey:input.sourceKey,replaceExisting:!!input.replacesSha256}:null;
    if(draft&&(new TextEncoder().encode(draft.content).length>1048576||new TextEncoder().encode(draft.sourceKey).length>131072||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(draft.content))){
      setError('Script drafts must remain within 1 MiB of UTF8 text without binary controls; the previous project draft was retained.');return;
    }
    if(JSON.stringify(latest.scenarioScriptDraft??null)===JSON.stringify(draft))return;
    scriptSelection.current++;
    onEdit({...latest,scenarioScriptDraft:draft},draft?'Edit scenario script draft':'Remove scenario script draft');
  }
  async function selectScript(file:File|undefined) {
    const selection=++scriptSelection.current,request=generation.current,key=scriptSourceKey;
    setError('');
    if(!file)return;
    if(scriptAttachment&&scriptAttachment.sha256!==scriptAttachment.fileSha256&&!window.confirm('Replace the edited script draft? Export it first if you want to retain a separate copy.'))return;
    try {
      if(!/^[A-Za-z0-9_-]{1,31}\.hsc$/.test(file.name)||file.name.toLowerCase()==='global_scripts.hsc')throw Error('Choose a scenario .hsc module with a safe name of 1–31characters. Existing global source is preserved separately.');
      if(!file.size||file.size>1048576)throw Error('HaloScript source must be nonempty and at most 1 MiB.');
      const bytes=await file.arrayBuffer();
      const content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
      if(!content.trim()||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(content))throw Error('Choose valid UTF8 HaloScript text without binary control characters.');
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const sha256=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
      if(request!==generation.current||selection!==scriptSelection.current||key!==currentScriptSourceKey.current)return;
      keepScriptDraft({filename:file.name,content,sha256,fileSha256:sha256,sourceKey:key,reviewed:false});
    }catch(problem){if(request===generation.current&&selection===scriptSelection.current&&key===currentScriptSourceKey.current)setError(String(problem));}
  }
  async function reviewScriptSource() {
    const input=selectedScript,draft=project?.scenarioScriptDraft;if(!input||!draft)return;
    const selection=++scriptSelection.current,request=generation.current,key=scriptSourceKey;
    setScriptReview(null);setError('');
    try {
      const bytes=new TextEncoder().encode(input.content);
      if(!input.content.trim()||bytes.length>1048576||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(input.content))
        throw Error('Review requires nonempty UTF8 HaloScript within 1 MiB without binary control characters.');
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const sha256=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
      if(request!==generation.current||selection!==scriptSelection.current||key!==currentScriptSourceKey.current)return;
      if(currentProject.current?.scenarioScriptDraft===draft)setScriptReview({draft,sha256});
    } catch(problem){if(request===generation.current&&selection===scriptSelection.current)setError(String(problem));}
  }
  async function prepareFirefightSource(){
    if(!native||!project||dirty||working||busy||!workingSourceAvailable||!report?.workingSource)return;
    const request=generation.current,key=scriptSourceKey,selection=++scriptSelection.current;
    setBusy(true);setError('');setFirefightSource(null);
    try {
      const plan=await call<FirefightSourcePlan>('prepare_firefight_source',{projectId:project.id,applyPlayerLoadout:applyFirefightLoadout});
      if(plan.projectId!==project.id||plan.buildId!==report.workingSource.buildId||plan.tagsDirectory!==report.workingSource.tagsDirectory)throw Error('Native source selection changed; refresh and prepare again.');
      const source=exportPlannedFirefightRound(plan.request.operation,firefightActivation,plan.previousController?.content.includes('(script startup gs_ff_bootstrap')??false,!!plan.hud,plan.request.playerProfile?.name);
      const bytes=new TextEncoder().encode(source.content);if(!bytes.length||bytes.length>1048576)throw Error('Generated controller exceeds the reviewed1MiB bound.');
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const sha256=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
      if(request!==generation.current||selection!==scriptSelection.current||key!==currentScriptSourceKey.current)return;
      setFirefightSource({sourceKey:key,plan,script:{filename:source.filename,content:source.content,sha256},reviewed:false});
    }catch(problem){if(request===generation.current&&selection===scriptSelection.current&&key===currentScriptSourceKey.current)setError(String(problem));}
    finally{if(request===generation.current)setBusy(false);}
  }
  async function buildWorkingTags(bspAudio?: BspAudioRequest, compileScripts=false, attachment?:NativeScriptAttachment, firefight?:NonNullable<typeof firefightSource>) {
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
    if(authoringPending&&!compileScripts){setError('Firefight rules changed. For new or recorded generated groups and their controller, review Firefight groups & controller. For existing encounters, review their bound source and choose Attach source & compile or Compile scripts & build.');return;}
    if(firefight&&(!selectedFirefightSource?.reviewed||firefight!==selectedFirefightSource||attachment?.sha256!==firefight.script.sha256))return;
    if(attachment&&!firefight&&(!selectedScript?.reviewed||selectedScript.sha256!==attachment.sha256||selectedScript.replacesSha256!==attachment.replacesSha256||!report?.workingSource))return;
    const request = generation.current;
    setBusy(true);
    setError('');
    try {
      await call<string>('build_working_tags', { projectId: project.id, compileScripts, ...(bspAudio ? { bspAudio } : {}),
        expectedBuildId:report.workingSource.buildId,expectedSourceDirectory:report.workingSource.tagsDirectory,
        ...(attachment?{scriptAttachment:{filename:attachment.filename,content:attachment.content,sha256:attachment.sha256,...(attachment.replacesSha256?{replacesSha256:attachment.replacesSha256}:{})}}:{}),
        ...(firefight?{encounterAppend:firefight.plan.request,expectedTagIdentity:firefight.plan.tagIdentity}:{}) });
      if (request === generation.current) {
        setDetails(false);
        setNotice(
          compileScripts?'Compiling reviewed scenario HaloScript, then a separate native map. Missing original modules or compiler/readback failures leave the previous-good cache unchanged.':'Compiling a separate map from saved working tags, retaining their existing compiled scripts. To apply edited .hsc source, use Compile scripts & build.',
        );
        onNavigate('build');
      }
    } catch (e) {
      if (request === generation.current) {setError(String(e));if(firefight)setFirefightSource(null);}
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
          {native&&sourceHint&&onOpenSourceProject&&<button
            className="runtime-dock-tag-changes"
            disabled={busy||working||sourceBusy===sourceKey}
            title={sourceLink?'Open '+sourceLink.title+' in its retained Level Editor. Current source may contain later edits; this compiled map stays separate.':'Check the retained native source link. If unavailable, use File → Open saved project; no source is reconstructed from this cache.'}
            onClick={()=>void (sourceLink?openEditableSource():inspectSource())}
          >{sourceBusy===sourceKey?'Checking source…':sourceLink?'Edit source':'Check editable source'}</button>}
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
        {sourceError&&!details&&<div className="runtime-dock-notice" role="alert">Editable source: {sourceError}. Use File → Open saved project if its retained native build is unavailable.</div>}
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
          {sourceLink&&<Notice tone="info">Edit source opens {sourceLink.title} with its retained document history. {sourceLink.authoringChanged?'The authoring revision has changed since this build. ':''}Current native source may also contain later tool edits. This compiled inspection remains a separate map.</Notice>}
          {sourceError&&<Notice>Editable source: {sourceError}. Use File → Open saved project for manual selection; this cache is not reconstructed source.</Notice>}
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
            Firefight rules are saved but not compiled. The retained source belongs to the earlier build; it is available for a reviewed controller rebuild only. For new encounters, use Build new Firefight groups & controller below to review and stage groups plus source together. For existing encounters, export the current bound controller in Firefight rules → Advanced script export, then attach it below. For an existing controller, edit/review its original module through Open script source folder and choose Compile scripts &amp; build. A tag-only build cannot apply these rules.
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
          {project?.firefight&&report?.workingSource&&workingSourceAvailable&&<details className="native-script-attachment">
            <summary>Firefight groups &amp; controller</summary>
            <p className="subtle">Prepare new inactive encounters with a controller, or revise recorded generated groups and their exact controller. Review old and new actors, counts, locations, source and exclusive script ownership. Native group revisions require unchanged generated fields at the end of the encounter list, with the same group names/order. Original encounters, palettes, scripts and starting profiles stay. By default the controller keeps scenario equipment; optionally apply the saved loadout through a separate reviewed native profile. Handwritten changes or adding/removing groups require separate reconciliation. Failure preserves previous-good source/cache and never restarts a game.</p>
            <label><input type="checkbox" checked={applyFirefightLoadout} disabled={busy||working||dirty} onChange={event=>{scriptSelection.current++;setFirefightSource(null);setApplyFirefightLoadout(event.target.checked);}}/>Apply saved Firefight player loadout · append/reuse a separate native profile</label>
            <label>Controller activation<select aria-label="New Firefight controller activation" value={firefightActivation} disabled={busy||working||dirty} onChange={event=>{scriptSelection.current++;setFirefightSource(null);setFirefightActivation(event.target.value as 'manual'|'startup');}}><option value="manual">Manual · set gs_ff_start true in reviewed source</option><option value="startup">Start automatically after map load</option></select></label>
            <button disabled={busy||working||dirty||!native||!!report.sourceIssue||!!report.toolsIssue} onClick={()=>void prepareFirefightSource()}>Prepare groups &amp; controller</button>
            {selectedFirefightSource&&<>
              <p>{selectedFirefightSource.plan.request.operation.encounters.length} {selectedFirefightSource.plan.previousController?'reviewed groups':'new groups'} · source <code className="wrap-code">{selectedFirefightSource.plan.tagIdentity}</code></p>
              {selectedFirefightSource.plan.request.playerProfile&&<p>Player loadout: {selectedFirefightSource.plan.request.playerProfile.reuse?'reuse reviewed':'append'} <strong>{selectedFirefightSource.plan.request.playerProfile.name}</strong> at native index {selectedFirefightSource.plan.request.playerProfile.index}; existing profiles stay. Primary: {selectedFirefightSource.plan.request.playerProfile.profile.primaryWeapon}; secondary: {selectedFirefightSource.plan.request.playerProfile.profile.secondaryWeapon??'none'}.</p>}
              <small>Original script inventory <code className="wrap-code">{selectedFirefightSource.plan.request.scriptsSha256}</code></small>
              <ol className="native-encounter-queue">{selectedFirefightSource.plan.request.operation.encounters.map(entry=><li key={entry.name}><span><strong>{entry.name}</strong> · {entry.count} × {entry.actorPath}<small>Zone center {entry.position.join(' / ')} · grid {entry.grid?.offset??0} / {entry.grid?.total??entry.count}</small></span></li>)}</ol>
              {selectedFirefightSource.plan.previousGroups.length>0&&<details><summary>Recorded source layout before revision</summary><ol className="native-encounter-readback">{selectedFirefightSource.plan.previousGroups.map(group=><li key={group.name}><strong>{group.name}</strong> · {group.positions.length} × {group.actorPath}<ol>{group.positions.map((position,index)=><li key={index}><code>{position.map(value=>value.toFixed(4)).join(' · ')}</code></li>)}</ol></li>)}</ol></details>}
              <details><summary>Review {selectedFirefightSource.plan.groups.reduce((sum,group)=>sum+group.positions.length,0)} planned starting/firing positions</summary><ol className="native-encounter-readback">{selectedFirefightSource.plan.groups.map(group=><li key={group.name}><strong>{group.name}</strong><ol>{group.positions.map((position,index)=><li key={index}><code>{position.map(value=>value.toFixed(4)).join(' · ')}</code></li>)}</ol></li>)}</ol></details>
              <p>{selectedFirefightSource.script.filename} · <code className="wrap-code">{selectedFirefightSource.script.sha256}</code></p>
              {selectedFirefightSource.plan.previousController&&<details><summary>Review recorded controller being revised · {selectedFirefightSource.plan.previousController.filename}</summary><code className="wrap-code">{selectedFirefightSource.plan.previousController.sha256}</code><label>Previous generated source<textarea readOnly rows={6} spellCheck={false} style={{width:'100%',boxSizing:'border-box'}} value={selectedFirefightSource.plan.previousController.content}/></label></details>}
              {selectedFirefightSource.plan.hud&&<details><summary>Review native HUD · retain {selectedFirefightSource.plan.hud.originalCount} message indices</summary>
                <p>Only recorded generated messages may change. New names append at the end; original text, icons and indices stay. A separate derived tag is built; the original tag is retained.</p>
                <code className="wrap-code">{selectedFirefightSource.plan.hud.review.outputTagPath}.hud_message_text</code>
                <label>Existing native HUD messages<textarea readOnly rows={5} spellCheck={false} style={{width:'100%',boxSizing:'border-box'}} value={JSON.stringify(selectedFirefightSource.plan.hud.inputMessages,null,2)}/></label>
                <label>Reviewed native HUD messages<textarea readOnly rows={5} spellCheck={false} style={{width:'100%',boxSizing:'border-box'}} value={JSON.stringify(selectedFirefightSource.plan.hud.messages,null,2)}/></label>
                <small>Authoring source SHA256 <code className="wrap-code">{selectedFirefightSource.plan.hud.review.sourceSha256}</code></small>
              </details>}
              <label>Review generated controller<textarea readOnly rows={6} spellCheck={false} style={{width:'100%',boxSizing:'border-box'}} value={selectedFirefightSource.script.content}/></label>
              <label><input type="checkbox" checked={selectedFirefightSource.reviewed} disabled={busy||working||dirty} onChange={event=>{const reviewed=event.target.checked;setFirefightSource(old=>old?.sourceKey===scriptSourceKey?{...old,reviewed}:old);}}/>I reviewed original scripts, encounter locations, the exact generated module being revised (if shown), new controller source, HUD messages, player loadout choice and exclusive wave ownership.</label>
              <div className="button-row"><button disabled={busy||working||dirty||!selectedFirefightSource.reviewed||toolTags.report?.status==='saving'||integrityBlocks(toolTags.report?.integrity)||!!report.sourceIssue||!!report.toolsIssue} onClick={()=>void buildWorkingTags(undefined,true,selectedFirefightSource.script,selectedFirefightSource)}>{selectedFirefightSource.plan.previousController?'Build Firefight revision':'Build new groups & controller'}</button><button disabled={busy||working} onClick={()=>{scriptSelection.current++;setFirefightSource(null);}}>Clear prepared source</button></div>
              <p className="subtle">Temporary planned source, not compiled readback or gameplay proof. Forerunner’s separate finite encounter director must stay off for these scripted waves.</p>
            </>}
          </details>}
          {scriptAttachment&&!selectedScript&&<Notice tone="info">Your project script draft is retained. Its original source selection is not currently active or verified; it was not applied.
            <button onClick={()=>downloadLocalText(scriptAttachment.filename,scriptAttachment.content,'text/plain;charset=utf-8')}>Export retained script draft</button>
          </Notice>}
          {project&&report?.workingSource&&workingSourceAvailable&&<details ref={scriptEditor} open={scriptsOpen} onToggle={event=>setScriptsOpen(event.currentTarget.open)} className="native-script-attachment">
            <summary>Edit or attach scenario HaloScript</summary>
            <p className="subtle">Choose a recovered scenario module or new UTF8 .hsc file, up to 1 MiB. You can edit AI and cutscene script bodies here. Revising an existing module requires its exact original file and explicit revision selection; writes occur only in a separate build candidate. Original source must be fully recovered, and existing native script/global identities remain protected. This control retains original native script/global identities; global-source files and structural identity changes need further native editing support. Draft edits use project Undo/Redo and Save; reopening restores the draft, which must be reviewed again before compilation. Saving a draft does not change native source or the running game. Successful builds retain the revised module; Project Undo changes drafts, not compiled source revisions.</p>
            <div className="button-row">
              <button disabled={!native||busy||working||moduleBusy||dirty||!report.workingSource.projectFingerprint} onClick={()=>void listScriptModules()}>{moduleBusy?'Reading source…':modules?'Refresh recovered modules':'List recovered modules'}</button>
              {modules&&<label>Find module<input type="search" value={moduleSearch} onChange={event=>setModuleSearch(event.target.value)} placeholder="Script filename"/></label>}
            </div>
            {modules&&<div>
              {modules.modules.length>0?<><label>Recovered scenario module<select value={moduleName}
                disabled={moduleBusy||busy||working} onChange={event=>setModuleName(event.target.value)}>
                {modules.modules.filter(module=>module.filename===moduleName||module.filename.toLowerCase().includes(moduleSearch.toLowerCase())).map(module=>
                  <option key={module.filename} value={module.filename}>{module.filename}{module.unavailable?' · read-only':''}</option>)}
              </select></label>
                {pickedModule&&<p className="subtle">{pickedModule.bytes.toLocaleString()} bytes · {pickedModule.unavailable??'Original module is available for a separate reviewed revision.'}</p>}
                <button disabled={!pickedModule||!!pickedModule.unavailable||moduleBusy||busy||working||dirty} onClick={()=>void openScriptModule()}>Edit selected module</button>
              </>:<p className="subtle">No recovered scenario modules are present. Recover the original campaign source before editing it, or choose a new .hsc file below.</p>}
              {moduleSearch&&!modules.modules.some(module=>module.filename.toLowerCase().includes(moduleSearch.toLowerCase()))&&<p className="subtle">No filenames match. Clear the search to see the recovered modules; the current selection is retained.</p>}
            </div>}
            {dirty&&<p className="subtle">Save the project to refresh or open recovered modules.</p>}
            <label>Recovered or new HaloScript module<input type="file" accept=".hsc" style={{maxWidth:'100%',minWidth:0}} disabled={busy||working} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';void selectScript(file);}}/></label>
            {selectedScript&&<>
              <p><strong>{selectedScript.filename}</strong> · <code className="wrap-code">{selectedScript.sha256||'Edited draft — review to calculate its hash'}</code></p>
              <label>Edit source<textarea rows={10} spellCheck={false} disabled={busy||working}
                style={{width:'100%',boxSizing:'border-box'}} value={selectedScript.content} onChange={event=>{
                  keepScriptDraft({...selectedScript,content:event.target.value,sha256:'',reviewed:false});
                }}/></label>
              <label><input type="checkbox" checked={!!selectedScript.replacesSha256} disabled={busy||working}
                onChange={event=>keepScriptDraft({...selectedScript,replacesSha256:event.target.checked?selectedScript.fileSha256:undefined,reviewed:false})}/>
                Revise the existing scenario module from this exact original file
              </label>
              {selectedScript.replacesSha256&&<p className="subtle">Original SHA256: <code className="wrap-code">{selectedScript.replacesSha256}</code>.
                Changed/missing source is refused. Edit the text, then review it before compiling.</p>}
              <div className="button-row">
                <button disabled={busy||working||!dirty} onClick={()=>void onSave().catch(problem=>setError(String(problem)))}>Save project draft</button>
                <button onClick={()=>downloadLocalText(selectedScript.filename,selectedScript.content,'text/plain;charset=utf-8')}>Export script draft</button>
              </div>
              <p className="subtle">{dirty?'Save the project before reviewing or compiling this draft.':'Project draft saved. Review its source before compiling.'} Use project Undo/Redo to restore draft edits; compiled native revisions stay separate.</p>
              <label><input type="checkbox" checked={selectedScript.reviewed} disabled={busy||working||dirty} onChange={event=>{if(event.target.checked){void reviewScriptSource();}else{scriptSelection.current++;setScriptReview(null);}}}/>I reviewed this source and its native scenario references.</label>
              <div className="button-row">
                <button disabled={!native||busy||working||dirty||!selectedScript.reviewed||!/^[a-f0-9]{64}$/.test(selectedScript.sha256)||selectedScript.sha256===selectedScript.replacesSha256||toolTags.report?.status==='saving'||integrityBlocks(toolTags.report?.integrity)||!!report.sourceIssue||!!report.toolsIssue||report.processes.some(p=>p.projectId===project.id&&p.status==='running')}
                  onClick={()=>void buildWorkingTags(undefined,true,selectedScript)}>{selectedScript.replacesSha256?'Build reviewed script revision':'Attach source & compile'}</button>
                <button disabled={busy||working} onClick={()=>keepScriptDraft(null)}>Remove project draft</button>
              </div>
              <p className="subtle">Compilation checks references and preserves other modules and original native script identities. It does not prove actor spawning, gameplay, wave rules or Forerunner compatibility. Missing encounters, loadout profiles or navigation must be authored separately.</p>
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
