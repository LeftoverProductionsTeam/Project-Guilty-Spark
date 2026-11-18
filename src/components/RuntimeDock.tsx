import {inspectScenarioBindings} from '../scenarioBindings';
import {emptyCreatorStudio,exportStudioEvidence} from '../creatorStudio';
import MissionSourceReview from './MissionSourceReview';
import {appendNativeCameraShot,nativeCinematicSource,nativeCinematicPrefix,nativeCinematicTakeKey} from '../nativeCinematic';
import {PREFERRED_RUNTIME} from '../runtimeWorkbench';
import {beginProjectMutation} from '../projectMutation';
import {createLatestRefresh} from '../latestRefresh';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
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
import { exportPlannedFirefightRound,exportHaloCeTransport,readNativeTransportSource,nativeTransportPrefix,recoveredCampaignMission,composeRecoveredCampaignMission,haloSourceDeclarations,readRecoveredMissionSource,recoveredMissionPrefix,reviewRecoveredCampaignMission } from '../haloScript';
import type {NativeTransportOptions,NativeMissionReview} from '../haloScript';
import { downloadLocalText } from '../exportHelpers';
import { useMapState, readMapSession, writeMapSession, compiledSourceSessionId, compiledSourceHint, COMPILED_SOURCE_KEY } from '../mapSession';
import type { Project, RuntimeId, Settings, Workspace } from '../types';
import type {
  RuntimeWorkbenchReport,
  CompiledSourceProject,
  NativeScriptAttachment,
  WorkingScriptSources,
  WorkingScriptSource,
  FirefightSourcePlan,
  MissionHudSourcePlan,
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
  const reportKey=JSON.stringify([project?.id??null,runtime]);
  const [reportState,setReportState]=useState<{key:string;value:RuntimeWorkbenchReport}|null>(null);
  const report=reportState?.key===reportKey?reportState.value:null;
  function setReport(next:RuntimeWorkbenchReport|null|((previous:RuntimeWorkbenchReport|null)=>RuntimeWorkbenchReport|null)){
    setReportState(previous=>{const current=previous?.key===reportKey?previous.value:null;
      const value=typeof next==='function'?next(current):next;
      return value?{key:reportKey,value}:null;});
  }

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
  const [cinematicName,setCinematicName]=useMapState<string>(id,'director.nativeCinematicName','gs_cinematic');
  const [cinematicCamera,setCinematicCamera]=useState('');
  const [cinematicPlan,setCinematicPlan]=useState<{key:string;shotsKey:string;name:string;tagIdentity:string;content:string;original?:string}|null>(null);
  const [transport,setTransport]=useMapState<NativeTransportOptions>(id,'sourceScripts.transport',{faction:'unsc',pilot:'',pilotSeat:'',outbound:'',inbound:'',hub:'extraction_return',field:'extraction_zone'});
  const latestTransport=useRef(transport);latestTransport.current=transport;
  const [recoveredMissionOpen,setRecoveredMissionOpen]=useState(false);
  const [recoveredActivation,setRecoveredActivation]=useMapState<'manual'|'startup'>(id,'native-mission-startup',()=>readMapSession<unknown>(id,'sourceScripts.missionActivation','manual')==='startup'?'startup':'manual');
  const [missionModule,setMissionModule]=useMapState<string>(id,'sourceScripts.missionModule','');
  const pickedMissionModule=modules?.modules.find(module=>module.filename===missionModule);
  const [missionOriginal,setMissionOriginal]=useState<{key:string;filename:string;sha256:string;content:string}|null>(null);
  const [retiredStartups,setRetiredStartups]=useState<string[]>([]),[replaceMissionCallback,setReplaceMissionCallback]=useState(false),[missionOwnershipConfirmed,setMissionOwnershipConfirmed]=useState(false);
  const reviewedMissionOriginal=missionOriginal?.key===scriptSourceKey&&missionOriginal.filename===missionModule&&pickedMissionModule?.sha256===missionOriginal.sha256&&!pickedMissionModule.unavailable?missionOriginal:null;

  const missionCompositionLocked=reviewedMissionOriginal?.content.startsWith(recoveredMissionPrefix)??false;
  const missionDeclarations=useMemo(()=>reviewedMissionOriginal?haloSourceDeclarations(reviewedMissionOriginal.content):[],[reviewedMissionOriginal]);
  const [recoveredMissionPlan,setRecoveredMissionPlan]=useState<{key:string;tagIdentity:string;content:string;studioKey:string;activation:'manual'|'startup'}|null>(null);
  const recoveredStudioKey=useMemo(()=>JSON.stringify({missions:project?.studio?.missions??[],shots:project?.studio?.shots??[]}),[project?.studio?.missions,project?.studio?.shots]);
  useEffect(()=>{
    const open=(event:Event)=>{const detail=(event as CustomEvent<{projectId:string;activation:'manual'|'startup'}>).detail;if(detail?.projectId!==project?.id)return;setDetails(true);setScriptsOpen(true);setRecoveredMissionOpen(true);setRecoveredActivation(detail.activation);};
    window.addEventListener('guilty-spark-open-native-mission',open);return()=>window.removeEventListener('guilty-spark-open-native-mission',open);
  },[project?.id]);
  const nativeCameras=modules?.cameraReview;
  const takeCamera=nativeCameras?.cameras.find(p=>String(p.index)===cinematicCamera)??nativeCameras?.cameras[0];
  const currentCinematic=cinematicPlan?.key===scriptSourceKey&&cinematicPlan.tagIdentity===nativeCameras?.tagIdentity&&cinematicPlan.shotsKey===nativeCinematicTakeKey(project?.studio)&&cinematicPlan.name===cinematicName.trim()&&cinematicPlan.content===selectedScript?.content?cinematicPlan:null;
  const nativeCinematicDraft=selectedScript?.content.startsWith(nativeCinematicPrefix)??false;
  const nativeTransportDraft=selectedScript?.content.startsWith(nativeTransportPrefix)??false;
  const nativeRecoveredMissionDraft=selectedScript?.content.startsWith(recoveredMissionPrefix)??false;
  const currentRecoveredMissionIdentity=nativeRecoveredMissionDraft&&recoveredMissionPlan?.key===scriptSourceKey&&recoveredMissionPlan.content===selectedScript?.content&&recoveredMissionPlan.studioKey===recoveredStudioKey&&recoveredMissionPlan.activation===recoveredActivation&&recoveredMissionPlan.tagIdentity===nativeCameras?.tagIdentity?recoveredMissionPlan.tagIdentity:null;
  function transportFlightIssue(options:NativeTransportOptions){
    const name=options.faction==='unsc'?'extraction_pelican':'extraction_spirit';
    const vehicles=modules?.transportReview?.vehicles.filter(vehicle=>vehicle.name===name);
    if(vehicles?.length!==1)return 'Read the actual named aircraft from native transport source.';
    const {flight,flightIssue}=vehicles[0];
    if(flightIssue)return flightIssue;
    if(!flight)return 'Native human-plane flight settings have not been read.';
    if([flight.throttle,flight.avoidanceDistance,flight.pathfindingRadius].some((value,index)=>!Number.isFinite(value)||value<=0||value>(index===0?1:12)))return 'Native plane AI flight is disabled or outside the supported range. Use positive throttle up to1 and both distances up to12.';
    return null;
  }
  function transportRouteIssue(options:NativeTransportOptions){
    const routes=modules?.transportReview?.flightRoutes;
    if(!routes)return 'Read native transport source to inspect the actual flight commands and pad bounds.';
    for(const [name,pad,required,opposite]of [[options.outbound,options.field,"extraction_zone","extraction_return"],[options.inbound,options.hub,"extraction_return","extraction_zone"]]){
      const selected=routes.filter(route=>route.name===name);
      if(selected.length!==1)return 'Choose a unique native flight route for '+(pad||'each pad')+'.';
      const route=selected[0];if(route.issue)return route.issue;
      if(!route.finalPosition||!route.arrivalVolumes.includes(pad))return 'Route '+name+' final aircraft-origin point is not verified inside pad '+pad+'. Review its final point and the pad geometry; fixed or unreadable volumes cannot be certified by this profile.';
      if(!route.arrivalVolumes.includes(required)||route.arrivalVolumes.includes(opposite))return 'Forerunner extraction requires route '+name+' to finish inside '+required+' and outside '+opposite+'. A custom pad must have its final route point inside the supported shared mission area. Review the route and shared areas; custom pad names alone do not change runtime settlement.';
    }
    return null;
  }
  function transportPilotIssue(options:NativeTransportOptions){
    if(!options.pilot||!options.pilotSeat)return 'Choose a real native pilot and driver seat, then review their animation binding.';
    const aircraft=options.faction==='unsc'?'extraction_pelican':'extraction_spirit',matches=modules?.transportReview?.pilotBindings?.filter(row=>row.aircraft===aircraft&&row.pilot===options.pilot);
    if(matches?.length!==1)return 'Read native transport source to verify the pilot actor, biped and animation graph against this aircraft.';
    return matches[0].issue??(matches[0].seats.filter(seat=>seat===options.pilotSeat).length===1?null:'The selected pilot animation graph has no unique exact driver-seat label. Choose compatible source; existing actors are preserved.');
  }
  function transportCrewIssue(options:NativeTransportOptions){
    const crew=options.crew??[],refs=modules?.transportReview;
    if(!Array.isArray(crew)||crew.length>8)return 'Review at most eight permanent NPC crew assignments.';
    const scopes=[options.pilot,...crew.map(member=>member?.group??'')].filter(Boolean),overlap=(a:string,b:string)=>{a=a.toLowerCase();b=b.toLowerCase();return a===b||a.startsWith(b+'/')||b.startsWith(a+'/');};
    const role=options.faction==='unsc'?'pelican':'spirit',missions=project?.studio?.missions??[];
    if(scopes.some(scope=>(refs?.protectedGroups??[]).some(owner=>overlap(scope,owner))))return 'Choose dedicated pilot/crew groups. Recipe-owned and mission encounter groups keep their existing controller.';
    for(const beat of missions.filter(beat=>['escort','encounterCleared'].includes(beat.trigger))){for(const scope of scopes.filter(scope=>overlap(scope,beat.encounterName))){const member=crew.find(member=>member.group.toLowerCase()===scope.toLowerCase());if(scope.toLowerCase()===options.pilot.toLowerCase()||!member?.releaseAtInsertion||beat.trigger!=='escort'||beat.squadNumber!=null||beat.transportInsertion!==role||member.group.toLowerCase()!==beat.encounterName.toLowerCase())return 'Choose dedicated pilot/crew groups. Recipe-owned and mission encounter groups keep their existing controller.';}}

    if(!crew.length)return null;
    const aircraft=options.faction==='unsc'?'extraction_pelican':'extraction_spirit',vehicles=refs?.vehicles.filter(row=>row.name===aircraft);
    if(vehicles?.length!==1)return 'Read the current native aircraft and crew references.';
    const vehicle=vehicles[0],used=new Set([options.pilotSeat.toLowerCase()]);
    for(let index=0;index<crew.length;index++){
      const member=crew[index];if(!member?.group||!member.seat)return 'Choose a native group and exact seat for crew '+(index+1)+'.';
      if(scopes.some((scope,i)=>scopes.slice(0,i).some(other=>overlap(scope,other)))||used.has(member.seat.toLowerCase()))return 'Pilot and permanent crew need separate nonoverlapping groups and unique seats.';used.add(member.seat.toLowerCase());
      if(vehicle.seats.filter(label=>label.toLowerCase().includes(member.seat.toLowerCase())).length!==1)return 'Native loading matches seat-name substrings. Choose a full crew seat label that selects only one vehicle seat.';
      const matches=refs?.pilotBindings?.filter(row=>row.aircraft===aircraft&&row.pilot===member.group);
      if(refs?.pilots.filter(name=>name===member.group).length!==1||matches?.length!==1)return 'Crew '+(index+1)+' needs one source-bound actor at every native difficulty. Read transport source again.';
      if(matches[0].crewIssue||matches[0].crewSeats?.filter(seat=>seat===member.seat).length!==1)return matches[0].crewIssue??'Crew '+(index+1)+' has no unique compatible non-driver seat. Choose matching actor animations.';
      if(member.create&&refs?.scriptCreatedPilots?.filter(name=>name===member.group).length!==1)return 'Deferred crew creation needs a dedicated not-initially-created native group; existing actors remain untouched.';
    }
    if(!vehicle.seats.some(seat=>!vehicle.pilotSeats?.includes(seat)&&!used.has(seat.toLowerCase())))return 'Leave at least one unassigned non-driver seat for player passengers.';
    return null;
  }
  function transportCameraIssue(options:NativeTransportOptions){
    for(const camera of [options.insertionCamera,options.departureCamera]){
      if(!camera)continue;const matches=nativeCameras?.cameras.filter(point=>point.name===camera.marker);
      if(matches?.length!==1||nativeCameras!.cameras.filter(point=>point.name.toLowerCase()===camera.marker.toLowerCase()).length!==1)return 'Relative camera '+camera.marker+' is missing or ambiguous. Author a uniquely named native point, accept its source revision and read transport source again.';
      const point=matches[0];if(!Number.isFinite(point.fovRadians)||point.fovRadians<5*Math.PI/180||point.fovRadians>150*Math.PI/180)return 'Relative camera '+camera.marker+' has an unsupported lens. Review its native point before preparing.';
    }return null;
  }
  function transportReferencesMatch(options:NativeTransportOptions){
    const refs=modules?.transportReview;if(!refs)return false;const name=options.faction==='unsc'?'extraction_pelican':'extraction_spirit';
    const vehicles=refs.vehicles.filter(v=>v.name===name);
    return !transportCrewIssue(options)&&!transportCameraIssue(options)&&!transportPilotIssue(options)&&(!options.createPilot||refs.scriptCreatedPilots?.filter(name=>name===options.pilot).length===1)&&!transportFlightIssue(options)&&!transportRouteIssue(options)&&vehicles.length===1&&vehicles[0].pilotSeats?.filter(seat=>seat===options.pilotSeat).length===1&&refs.pilots.filter(value=>value===options.pilot).length===1&&
      [options.departureCue,options.arrivalCue].filter((cue):cue is string=>!!cue).every(cue=>nativeCameras?.scriptNames.filter(value=>value===cue).length===1)&&
      [options.outbound,options.inbound].every(route=>refs.routes.filter(value=>value===route).length===1)&&
      ['_boarded','_called','_landed'].every(suffix=>refs.groups.includes(name+suffix));
  }
  let currentTransportIdentity:string|null=null;
  if(nativeTransportDraft&&nativeCameras&&report?.workingSource?.target==='gbx-custom'&&nativeCameras.scenarioType===0){
    try{const options=readNativeTransportSource(selectedScript!.content);if(transportReferencesMatch(options)&&[options.hub,options.field].every(name=>nativeCameras.triggerVolumes.filter(v=>v===name).length===1))currentTransportIdentity=nativeCameras.tagIdentity;}catch{/* Edited source needs the explicit manual-source route. */}
  }
  useEffect(()=>{
    moduleRequest.current++;setModuleBusy(false);
    return()=>{moduleRequest.current++;};
  },[scriptSourceKey]);
  const [firefightActivation,setFirefightActivation]=useState<'manual'|'startup'>('manual');
  const [firefightSource,setFirefightSource]=useState<{sourceKey:string;plan:FirefightSourcePlan;script:NativeScriptAttachment;reviewed:boolean}|null>(null);
  const selectedFirefightSource=firefightSource?.sourceKey===scriptSourceKey?firefightSource:null;
  const [missionHud,setMissionHud]=useState<{sourceKey:string;missionsKey:string;plan:MissionHudSourcePlan;reviewed:boolean}|null>(null);
  const missionsKey=JSON.stringify(project?.studio?.missions??[]);
  const selectedMissionHud=missionHud?.sourceKey===scriptSourceKey&&missionHud.missionsKey===missionsKey?missionHud:null;
  const currentReport = useRef(report);
  currentReport.current = report;
  const detailsDialog = useRef<HTMLElement | null>(null);
  const errorNotice=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(details&&error)errorNotice.current?.scrollIntoView({block:'nearest'});},[details,error]);
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
    const frame=requestAnimationFrame(()=>{const target=recoveredMissionOpen?scriptEditor.current?.querySelector<HTMLElement>('.native-recovered-mission-source button:not([disabled])'):scriptEditor.current?.querySelector<HTMLInputElement>('input[type="file"]');target?.focus();});
    return()=>cancelAnimationFrame(frame);
  },[details,scriptsOpen,recoveredMissionOpen,report?.workingSource?.buildId]);
  const reportRefresh=useRef<ReturnType<typeof createLatestRefresh<{runtimeId:RuntimeId;projectId:string|null},RuntimeWorkbenchReport>>|null>(null);
  useEffect(()=>{
    // Source admission hashes native inputs. Reuse the shared trailing-refresh
    // queue so a burst of saved revisions cannot fan out identical native work.
    const queue=createLatestRefresh<{runtimeId:RuntimeId;projectId:string|null},RuntimeWorkbenchReport>(input=>call('runtime_workbench_report',input),()=>{});
    reportRefresh.current=queue;
    return()=>{queue.dispose();if(reportRefresh.current===queue)reportRefresh.current=null;};
  },[]);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!native) return;
    setBusy(true);
    setError('');
    try {
      const queue=reportRefresh.current;if(!queue)return;
      const next=await queue.request({runtimeId:runtime,projectId:project?.id??null});
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
  // A refresh of the same map/runtime must not erase its verified source key.
  // Busy still fences actions; changed source identities invalidate selections.
  useEffect(()=>{setReport(null);},[runtime,project?.id]);
  useEffect(() => {
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
  async function readRecoveredMissionReview(input:Project):Promise<NativeMissionReview>{
    const source=report?.workingSource,inventory=modules,module=pickedMissionModule,key=scriptSourceKey;
    if(!source||!inventory||!module||module.unavailable||dirty||busy||working||moduleBusy||inventory.cameraReview?.scenarioType!==0)throw Error('Save, read native mission source and choose an available generated campaign module first.');
    const request=++moduleRequest.current;setModuleBusy(true);setError('');
    try{
      const value=await call<WorkingScriptSource>('working_script_source',{projectId:input.id,expectedBuildId:source.buildId,expectedSourceDirectory:source.tagsDirectory,expectedProjectFingerprint:source.projectFingerprint,expectedSourcesSha256:inventory.sourceSha256,filename:module.filename,expectedSha256:module.sha256});
      if(request!==moduleRequest.current||key!==currentScriptSourceKey.current||currentProject.current!==input)throw Error('Source or project changed during mission review. No data was adopted.');
      if(!sourceSelectionMatches(value.selection,source)||value.selection.sourceSha256!==inventory.sourceSha256||value.script.filename!==module.filename||value.script.sha256!==module.sha256||value.script.replacesSha256!==module.sha256)throw Error('Recovered mission source identity changed. Read source again.');
      const review=await reviewRecoveredCampaignMission(input,value.script,source.target??'');
      if(request!==moduleRequest.current||key!==currentScriptSourceKey.current||currentProject.current!==input)throw Error('Source or project changed during mission review. No data was adopted.');
      return review;
    }finally{if(request===moduleRequest.current)setModuleBusy(false);}
  }
  async function verifyRecoveredMissionReview(input:Project,review:NativeMissionReview){
    const fresh=await readRecoveredMissionReview(input);
    if(!review.recovered||fresh.recovered?.sha256!==review.recovered.sha256||fresh.recovered?.target!==review.recovered.target||fresh.module.filename!==review.module.filename||fresh.module.content!==review.module.content)throw Error('Recovered mission changed after review. No local data was adopted.');
  }
  function recoveredMissionAdopted(review:NativeMissionReview){
    const composition=review.recovered?.composition;
    setRecoveredMissionPlan(null);setMissionOwnershipConfirmed(false);
    setMissionModule(composition?review.module.filename:'');
    setMissionOriginal(composition?{key:scriptSourceKey,filename:review.module.filename,sha256:review.recovered!.sha256,content:review.module.content}:null);
    setRetiredStartups(composition?.retiredStartups??[]);setReplaceMissionCallback(composition?.replaceExtractionCallback??false);
    setNotice('Recovered mission data applied through project history. Save, then read source again and review controller ownership before preparing its next native revision. Camera geometry and native files were not edited.');
  }
  async function listScriptModules(includeCameras=false,includeTransport=false,includeMission=false) {
    const source=report?.workingSource;if(!native||!project||!source?.projectFingerprint||dirty||busy||working||moduleBusy)return;
    const request=++moduleRequest.current,key=scriptSourceKey;
    setModuleBusy(true);setError('');if(includeTransport||includeMission)setModuleInventory(null);if(includeMission)setRecoveredMissionPlan(null);
    try {
      const value=await call<WorkingScriptSources>('working_script_sources',{projectId:project.id,expectedBuildId:source.buildId,
        expectedSourceDirectory:source.tagsDirectory,expectedProjectFingerprint:source.projectFingerprint,...(includeCameras?{includeCameras:true}:{}),...(includeTransport?{includeTransport:true}:{}),...(includeMission?{includeMission:true}:{})});
      if(request!==moduleRequest.current||key!==currentScriptSourceKey.current){if(currentProject.current?.id===project.id)setNotice('The runtime or editable source changed while reading modules. Use List recovered modules for the current source.');return;}
      if(!sourceSelectionMatches(value,source))throw Error('The recovered script listing belongs to a different source revision. Refresh its selection.');
      setModuleInventory({key,value});
      setModuleName(name=>value.modules.some(module=>module.filename===name)?name:value.modules.find(module=>!module.unavailable)?.filename??value.modules[0]?.filename??'');
    } catch(problem){if(request===moduleRequest.current&&key===currentScriptSourceKey.current)setError(String(problem));}
    finally{if(request===moduleRequest.current)setModuleBusy(false);}
  }
  function addCinematicCamera(){
    const latest=currentProject.current;if(!latest||!takeCamera)return;
    try{const studio=appendNativeCameraShot(latest.studio,takeCamera,crypto.randomUUID());onEdit({...latest,studio},'Add existing native camera to cinematic take');setCinematicPlan(null);setNotice('Camera added. Edit timing/order in Machinima; native camera geometry is unchanged.');}catch(problem){setError(String(problem));}
  }
  async function prepareCinematicSource(){
    const input=currentProject.current,source=report?.workingSource,inventory=modules,review=nativeCameras;if(!input||!source||!inventory||!review||dirty||busy||working||moduleBusy)return;
    const request=++moduleRequest.current,selection=++scriptSelection.current,key=scriptSourceKey,shotsKey=nativeCinematicTakeKey(input.studio),draft=input.scenarioScriptDraft;
    setModuleBusy(true);setError('');const release=beginProjectMutation(input.id);
    try{
      if(!input.studio)throw Error('Add saved camera shots first.');const name=cinematicName.trim();if(!/^[A-Za-z_][A-Za-z0-9_]{0,30}$/.test(name)||name.toLowerCase()==='global_scripts')throw Error('Choose a scenario function name of1–31letters/digits/underscores; global source is protected.');
      const previous=inventory.modules.find(m=>m.filename.toLowerCase()===(name+'.hsc').toLowerCase());if(previous?.unavailable)throw Error(previous.unavailable);
      if(review.scriptNames.some(n=>n.toLowerCase()===name.toLowerCase())&&!previous)throw Error('This function belongs to another native module. Choose an unused cinematic function/module name; original source was retained.');
      let original:string|undefined;if(previous){const value=await call<WorkingScriptSource>('working_script_source',{projectId:input.id,expectedBuildId:source.buildId,expectedSourceDirectory:source.tagsDirectory,expectedProjectFingerprint:source.projectFingerprint,expectedSourcesSha256:inventory.sourceSha256,filename:previous.filename,expectedSha256:previous.sha256});
        if(!sourceSelectionMatches(value.selection,source)||value.selection.sourceSha256!==inventory.sourceSha256||value.script.sha256!==previous.sha256)throw Error('Native source changed while reviewing the cinematic module.');original=value.script.content;}
      const controller=name+'_start',retainController=!!original?.startsWith(nativeCinematicPrefix)&&original.replaceAll('\r\n','\n').includes('\n(script startup '+controller+'\n');
      if((input.studio.cinematicTriggerVolume!=null||retainController)&&review.scriptNames.some(n=>n.toLowerCase()===controller.toLowerCase())&&!retainController)throw Error('The cinematic trigger function belongs to other native source. Choose another function name or use the recovered module editor; no source was changed.');
      const generated=nativeCinematicSource(input.studio,review.cameras,name,{triggerVolumes:review.triggerVolumes,scenarioType:review.scenarioType,retainController});
      if(draft&&draft.content!==generated.content&&!window.confirm('Replace the current project script draft with the timed cinematic? Project Undo restores it; original native source is retained.'))return;
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(generated.content)),sha256=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
      if(selection!==scriptSelection.current||key!==currentScriptSourceKey.current||currentProject.current?.id!==input.id||nativeCinematicTakeKey(currentProject.current?.studio)!==shotsKey||currentProject.current?.scenarioScriptDraft!==draft)return;
      keepScriptDraft({filename:generated.filename,content:generated.content,sha256,fileSha256:previous?.sha256??sha256,sourceKey:key,reviewed:false,...(previous?{replacesSha256:previous.sha256}:{})});setCinematicPlan({key,shotsKey,name:cinematicName.trim(),tagIdentity:review.tagIdentity,content:generated.content,original});
      setNotice('Timed cinematic source prepared. Save and review before building. '+generated.warnings.join(' '));
    }catch(problem){if(selection===scriptSelection.current&&key===currentScriptSourceKey.current)setError(String(problem));}
    finally{release();if(request===moduleRequest.current)setModuleBusy(false);}
  }
  async function readMissionComposition(){
    const source=report?.workingSource,inventory=modules,previous=modules?.modules.find(row=>row.filename===missionModule),input=currentProject.current;
    if(!input||!source||!inventory||!previous||previous.unavailable||dirty||busy||working||moduleBusy)return;
    const request=++moduleRequest.current,key=scriptSourceKey;setModuleBusy(true);setError('');setMissionOriginal(null);setMissionOwnershipConfirmed(false);setRecoveredMissionPlan(null);
    try{
      const value=await call<WorkingScriptSource>('working_script_source',{projectId:input.id,expectedBuildId:source.buildId,expectedSourceDirectory:source.tagsDirectory,expectedProjectFingerprint:source.projectFingerprint,expectedSourcesSha256:inventory.sourceSha256,filename:previous.filename,expectedSha256:previous.sha256});
      if(!sourceSelectionMatches(value.selection,source)||value.selection.sourceSha256!==inventory.sourceSha256||value.script.sha256!==previous.sha256)throw Error('Mission source changed during ownership review.');
      haloSourceDeclarations(value.script.content);
      const prior=value.script.content.startsWith(recoveredMissionPrefix)?await readRecoveredMissionSource(value.script.content):null;
      if(prior&&!prior.composition)throw Error('This is the separate generated mission module. Keep the new-module workflow or reconcile through the manual editor.');
      if(request!==moduleRequest.current||key!==currentScriptSourceKey.current)return;
      setMissionOriginal({key,filename:previous.filename,sha256:previous.sha256,content:value.script.content});setRetiredStartups(prior?.composition?.retiredStartups??[]);setReplaceMissionCallback(prior?.composition?.replaceExtractionCallback??false);
    }catch(problem){if(request===moduleRequest.current&&key===currentScriptSourceKey.current)setError(String(problem));}finally{if(request===moduleRequest.current)setModuleBusy(false);}
  }
  async function prepareRecoveredMission(){
    const input=currentProject.current,source=report?.workingSource,inventory=modules,review=nativeCameras,refs=modules?.missionReview;
    if(!input||!source||!inventory||!review||!refs||dirty||busy||working||moduleBusy)return;
    const studio=input.studio??emptyCreatorStudio(),studioKey=JSON.stringify({missions:studio.missions,shots:studio.shots}),activation=recoveredActivation;
    const request=++moduleRequest.current,selection=++scriptSelection.current,key=scriptSourceKey,draft=input.scenarioScriptDraft;
    setModuleBusy(true);setError('');const release=beginProjectMutation(input.id);
    try {
      if(!['gbx-custom','mcc-cea'].includes(source.target??'')||review.scenarioType!==0)throw Error('Recovered mission source requires reviewed CE609 or MCC solo source.');
      const composition=missionModule?reviewedMissionOriginal:null;
      if(missionModule&&(!composition||!missionOwnershipConfirmed))throw Error('Read and explicitly review the selected original module ownership before preparing a composed revision.');
      const generated=composition?await composeRecoveredCampaignMission(studio,activation,source.target==='gbx-custom',composition.content,{filename:composition.filename,sourceSha256:composition.sha256,retiredStartups,replaceExtractionCallback:replaceMissionCallback}):recoveredCampaignMission(studio,activation,source.target==='gbx-custom');
      const scopes=[...new Set(studio.missions.flatMap(beat=>beat.squadNumber==null?[]:[beat.squadNumber]))];
      for(const number of scopes){
        const matches=refs.extractionSquads?.filter(row=>row.terminal.number===number);
        if(matches?.length!==1||!matches[0].terminal.readiness)throw Error('Squad'+number+' needs its reviewed native selection terminal and readiness gate. Author them in AI & scenario, accept/build, then read mission source again.');
      }
      for(const beat of studio.missions){const guide=beat.guidance;if(!guide)continue;
        if(guide.object!=null){if(refs.objectIssue)throw Error(refs.objectIssue);if(refs.objects?.filter(object=>object.name.toLowerCase()===guide.object!.toLowerCase()).length!==1)throw Error('Objective waypoint object is missing or ambiguous. Bind a unique native object in the source, accept/build and read source again.');}
        else if(refs.flags?.filter(flag=>flag.name.toLowerCase()===guide.flag?.toLowerCase()).length!==1)throw Error('Objective waypoint flag is missing or ambiguous. Author it in AI & scenario, accept/build, then read source again.');
      }
      const insertionModules=new Map<string,NativeTransportOptions>();
      for(const beat of studio.missions.filter(beat=>beat.transportInsertion)){
        const role=beat.transportInsertion!,filename='gs_'+role+'_transport.hsc';let config=insertionModules.get(role);
        if(!config){const matches=inventory.modules.filter(row=>row.filename.toLowerCase()===filename);if(matches.length!==1||matches[0].unavailable)throw Error('Build the matching generated '+role+' transport source before linking insertion objectives. No draft was replaced.');const module=matches[0];const value=await call<WorkingScriptSource>('working_script_source',{projectId:input.id,expectedBuildId:source.buildId,expectedSourceDirectory:source.tagsDirectory,expectedProjectFingerprint:source.projectFingerprint,expectedSourcesSha256:inventory.sourceSha256,filename:module.filename,expectedSha256:module.sha256});if(!sourceSelectionMatches(value.selection,source)||value.selection.sourceSha256!==inventory.sourceSha256||value.script.sha256!==module.sha256)throw Error('Native transport source changed during mission preparation.');config=readNativeTransportSource(value.script.content);if(config.faction!==(role==='pelican'?'unsc':'covenant'))throw Error('Transport faction does not match the selected rescue delivery.');insertionModules.set(role,config);}
        if(beat.trigger==='triggerVolume'){
          if(!config.trackPlayerInsertion||config.field!==beat.triggerRef)throw Error('Build the matching transport with Confirm player insertion enabled and use its exact field pad for this objective.');
          continue;
        }
        if(config.crew?.filter(member=>member.releaseAtInsertion&&member.group.toLowerCase()===beat.encounterName.toLowerCase()).length!==1)throw Error('Transport source must own exactly this rescue group and Disembark at first insertion. Build/review it, then read mission source again.');
      }
      const bindings=inspectScenarioBindings([generated],null,null,[],review.triggerVolumes.map(name=>({name})),refs.devices,refs.squads,refs.weapons);
      for(const row of bindings){
        if(['hud_message:','sound:','weapon:','forerunner_extraction:','forerunner_squad:','cutscene_flag:','waypoint_object:','transport_insertion:','transport_arrival:'].some(prefix=>row.dependency.startsWith(prefix)))continue;
        if(row.dependency.startsWith('cutscene_camera_point:')){if(review.cameras.filter(camera=>camera.name===row.dependency.slice('cutscene_camera_point:'.length)).length!==1)throw Error('Native camera reference is missing or ambiguous: '+row.dependency);continue;}
        if(row.status!=='presentInNativeSource')throw Error('Native mission reference is missing or ambiguous: '+row.dependency);
      }
      for(const beat of studio.missions.filter(beat=>beat.trigger==='encounterCleared'||beat.trigger==='escort')){
        const name=beat.encounterName.split('/')[0],matches=refs.encounters.filter(row=>row.name===name);
        if(matches.length!==1)throw Error('Native encounter is missing or ambiguous: '+name);
        if(matches[0].initiallyCreated)throw Error('Mission encounters must be script-created; disable initial actor creation through the reviewed native source editor.');
        if(refs.protectedEncounters.includes(name))throw Error('This encounter is recipe-owned; use its existing controller instead of a second spawn owner.');
      }
      if(studio.missions.some(beat=>beat.trigger==='forerunnerExtractionSettled')){
        for(const name of ['extraction_zone','extraction_return'])if(review.triggerVolumes.filter(value=>value===name).length!==1)throw Error('Native extraction pad is missing or ambiguous: '+name);
        for(const name of ['extraction_deploy','extraction_activate'])if(refs.devices.filter(value=>value.name===name&&value.class==='ctrl').length!==1)throw Error('Native extraction control is missing or ambiguous: '+name);
      }
      const previous=inventory.modules.find(module=>module.filename.toLowerCase()===generated.filename.toLowerCase());
      let original:string|undefined;
      if(previous){
        if(previous.unavailable)throw Error(previous.unavailable);
        const value=await call<WorkingScriptSource>('working_script_source',{projectId:input.id,expectedBuildId:source.buildId,expectedSourceDirectory:source.tagsDirectory,expectedProjectFingerprint:source.projectFingerprint,expectedSourcesSha256:inventory.sourceSha256,filename:previous.filename,expectedSha256:previous.sha256});
        if(!sourceSelectionMatches(value.selection,source)||value.selection.sourceSha256!==inventory.sourceSha256||value.script.sha256!==previous.sha256)throw Error('Native mission source changed during mission preparation.');
        if(composition){if(value.script.content!==composition.content||value.script.sha256!==composition.sha256)throw Error('Reviewed original module changed. Read its ownership again.');}else await readRecoveredMissionSource(value.script.content);original=value.script.content;
      }
      const names=(text:string)=>haloSourceDeclarations(text).filter(row=>row.kind==='script').map(row=>row.name);
      const previousNames=original?names(original):[];
      if(names(generated.content).some(name=>review.scriptNames.some(value=>value.toLowerCase()===name.toLowerCase())&&!previousNames.some(value=>value.toLowerCase()===name.toLowerCase())))throw Error('A mission function already belongs to another source module; original source was retained.');
      if(previousNames.some(name=>!names(generated.content).some(value=>value.toLowerCase()===name.toLowerCase())))throw Error('The revised mission would remove an existing native function. Preserve/reconcile it through the manual source editor.');
      if(draft&&!draft.content.startsWith(recoveredMissionPrefix))throw Error('Another script draft is open. Preserve it through the existing editor before preparing this mission.');
      const fresh=await call<WorkingScriptSources>('working_script_sources',{projectId:input.id,expectedBuildId:source.buildId,expectedSourceDirectory:source.tagsDirectory,expectedProjectFingerprint:source.projectFingerprint,includeCameras:true,includeMission:true});
      if(!sourceSelectionMatches(fresh,source)||fresh.sourceSha256!==inventory.sourceSha256||fresh.cameraReview?.tagIdentity!==review.tagIdentity)throw Error('Native source changed during mission preparation; read source again.');
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(generated.content)),sha256=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
      if(selection!==scriptSelection.current||key!==currentScriptSourceKey.current||currentProject.current?.id!==input.id||JSON.stringify({missions:currentProject.current.studio?.missions??[],shots:currentProject.current.studio?.shots??[]})!==studioKey||currentProject.current.scenarioScriptDraft!==draft)return;
      keepScriptDraft({filename:generated.filename,content:generated.content,sha256,fileSha256:previous?.sha256??sha256,sourceKey:key,reviewed:false,...(previous?{replacesSha256:previous.sha256}:{})});
      setRecoveredMissionPlan({key,tagIdentity:review.tagIdentity,content:generated.content,studioKey,activation});
      setNotice('Recovered mission draft prepared. Save, review and compile. Camera points keep their native source poses. Startup waits for players; manual activation needs another script. Native readback and gameplay remain separate checks.');
    }catch(problem){if(selection===scriptSelection.current&&key===currentScriptSourceKey.current)setError(String(problem));}
    finally{release();if(request===moduleRequest.current)setModuleBusy(false);}
  }
  async function prepareTransportSource(){
    const input=currentProject.current,source=report?.workingSource,inventory=modules,review=nativeCameras;
    if(!input||!source||!inventory||!review||dirty||busy||working||moduleBusy)return;
    const request=++moduleRequest.current,selection=++scriptSelection.current,key=scriptSourceKey,options=transport,draft=input.scenarioScriptDraft;
    setModuleBusy(true);setError('');const release=beginProjectMutation(input.id);
    try{
      if(source.target!=='gbx-custom'||review.scenarioType!==0)throw Error('Transport controllers need reviewed CE609 solo source for Forerunner. Other engines do not drive these signals.');
      const generated=exportHaloCeTransport(options);
      const crewIssue=transportCrewIssue(options);if(crewIssue)throw Error(crewIssue+' No draft was replaced.');
      const cameraIssue=transportCameraIssue(options);if(cameraIssue)throw Error(cameraIssue+' No draft was replaced.');
      const pilotIssue=transportPilotIssue(options);if(pilotIssue)throw Error(pilotIssue+' No draft was replaced.');
      const flightIssue=transportFlightIssue(options);if(flightIssue)throw Error(flightIssue+' Open AI & scenario → Edit native scenario & assets, select the matching native vehicle, then Native aircraft AI flight settings. Preview, Accept, Save/rebuild and read transport source again. No draft was replaced.');
      const routeIssue=transportRouteIssue(options);if(routeIssue)throw Error(routeIssue+' Open AI & scenario → Edit native scenario & assets → Map scenario → Existing AI command lists, review the route against the map, Preview/Accept, Save/rebuild and read transport source again. No draft was replaced.');
      if(!transportReferencesMatch(options))throw Error('Choose the actual named aircraft, one unique native pilot seat, a single-pilot encounter/squad with matching creation ownership, two nonempty native routes and all three dedicated signals. Read native transport source after authoring them; no source was replaced.');
      for(const name of [options.hub,options.field])if(review.triggerVolumes.filter(value=>value===name).length!==1)throw Error('Missing or ambiguous native pad volume '+name+'. Author it with the existing scenario area tools, Save/rebuild and read source again.');
      const previous=inventory.modules.find(module=>module.filename.toLowerCase()===generated.filename.toLowerCase());
      let original:string|undefined;
      if(previous){
        if(previous.unavailable)throw Error(previous.unavailable);
        const value=await call<WorkingScriptSource>('working_script_source',{projectId:input.id,expectedBuildId:source.buildId,expectedSourceDirectory:source.tagsDirectory,expectedProjectFingerprint:source.projectFingerprint,expectedSourcesSha256:inventory.sourceSha256,filename:previous.filename,expectedSha256:previous.sha256});
        if(!sourceSelectionMatches(value.selection,source)||value.selection.sourceSha256!==inventory.sourceSha256||value.script.sha256!==previous.sha256)throw Error('Native transport module changed; read the current source again.');
        readNativeTransportSource(value.script.content);original=value.script.content;
      }
      const names=(text:string)=>haloSourceDeclarations(text).filter(row=>row.kind==='script').map(row=>row.name);
      const previousNames=original?names(original):[];
      if(names(generated.content).some(name=>review.scriptNames.some(value=>value.toLowerCase()===name.toLowerCase())&&!previousNames.some(value=>value.toLowerCase()===name.toLowerCase())))throw Error('A transport function already belongs to another native module. Preserve that source and use Edit selected module; no replacement was made.');
      if(draft&&draft.content!==generated.content&&!window.confirm('Replace the current project script draft with the transport controller? Project Undo restores it; original native source remains in its previous build.'))return;
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(generated.content)),sha256=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
      if(selection!==scriptSelection.current||key!==currentScriptSourceKey.current||currentProject.current?.id!==input.id||latestTransport.current!==options||currentProject.current.scenarioScriptDraft!==draft)return;
      keepScriptDraft({filename:generated.filename,content:generated.content,sha256,fileSha256:previous?.sha256??sha256,sourceKey:key,reviewed:false,...(previous?{replacesSha256:previous.sha256}:{})});
      setNotice('Transport source prepared. Save, review the native references, then attach and compile. This does not verify landing, flight or banking.');
    }catch(problem){if(selection===scriptSelection.current&&key===currentScriptSourceKey.current)setError(String(problem));}
    finally{release();if(request===moduleRequest.current)setModuleBusy(false);}
  }
  async function openScriptModule() {
    const source=report?.workingSource,inventory=modules,module=pickedModule,draft=currentProject.current?.scenarioScriptDraft;
    if(!native||!project||!source?.projectFingerprint||!inventory||!module||module.unavailable||dirty||busy||working||moduleBusy)return;
    if(draft&&!window.confirm('Replace the current project script draft with this recovered module? Project Undo can restore the previous draft.'))return;
    const request=++moduleRequest.current,key=scriptSourceKey,selection=++scriptSelection.current;
    setModuleBusy(true);setError('');
    try {
      const value=await call<WorkingScriptSource>('working_script_source',{projectId:project.id,expectedBuildId:source.buildId,
        expectedSourceDirectory:source.tagsDirectory,expectedProjectFingerprint:source.projectFingerprint,
        expectedSourcesSha256:inventory.sourceSha256,filename:module.filename,expectedSha256:module.sha256});
      const bytes=new TextEncoder().encode(value.script.content);
      if(!bytes.length||bytes.length>1048576)throw Error('The recovered module exceeded its editor limit; the previous draft was retained.');
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const sha256=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
      if(request!==moduleRequest.current||selection!==scriptSelection.current||key!==currentScriptSourceKey.current)return;
      if(currentProject.current?.scenarioScriptDraft!==draft)throw Error('The project draft changed while opening source; the current draft was retained.');
      if(!sourceSelectionMatches(value.selection,source)||value.selection.sourceSha256!==inventory.sourceSha256||
        value.script.filename!==module.filename||value.script.sha256!==module.sha256||sha256!==module.sha256||
        value.script.replacesSha256!==module.sha256)throw Error('Recovered source identity changed; refresh the module list before editing.');
      keepScriptDraft({...value.script,fileSha256:sha256,sourceKey:key,reviewed:false});
    } catch(problem){if(request===moduleRequest.current&&selection===scriptSelection.current&&key===currentScriptSourceKey.current)setError(String(problem));}
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
    const selection=++scriptSelection.current,key=scriptSourceKey;
    setError('');
    if(!file)return;
    if(scriptAttachment&&scriptAttachment.sha256!==scriptAttachment.fileSha256&&!window.confirm('Replace the edited script draft? Export it first if you want to retain a separate copy.'))return;
    const input=currentProject.current;if(!input)return;const release=beginProjectMutation(input.id);
    try {
      if(!/^[A-Za-z0-9_-]{1,31}\.hsc$/.test(file.name)||file.name.toLowerCase()==='global_scripts.hsc')throw Error('Choose a scenario .hsc module with a safe name of 1–31characters. Existing global source is preserved separately.');
      if(!file.size||file.size>1048576)throw Error('HaloScript source must be nonempty and at most 1 MiB.');
      const bytes=await file.arrayBuffer();
      const content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
      if(!content.trim()||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(content))throw Error('Choose valid UTF8 HaloScript text without binary control characters.');
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const sha256=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
      // A status refresh may temporarily remove the report while this local
      // file is decoding. Retain its original source key as an unreviewed draft;
      // changed native source stays stale and cannot gain build authority.
      if(selection!==scriptSelection.current||currentProject.current?.id!==input.id)return;
      keepScriptDraft({filename:file.name,content,sha256,fileSha256:sha256,sourceKey:key,reviewed:false});
    }catch(problem){if(selection===scriptSelection.current&&currentProject.current?.id===input.id)setError(String(problem));}
    finally{release();}
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
  async function prepareMissionHud(){
    if(!native||!project||dirty||working||busy||!workingSourceAvailable||!report?.workingSource)return;
    const request=generation.current,key=scriptSourceKey;setBusy(true);setError('');
    try {
      const plan=await call<MissionHudSourcePlan>('prepare_mission_hud',{projectId:project.id});
      if(request!==generation.current||key!==currentScriptSourceKey.current||JSON.stringify(currentProject.current?.studio?.missions??[])!==missionsKey)return;
      if(plan.projectId!==project.id||plan.buildId!==report.workingSource.buildId||plan.tagsDirectory!==report.workingSource.tagsDirectory||plan.projectFingerprint!==report.workingSource.projectFingerprint)throw Error('Native source selection changed; prepare mission messages again.');
      setMissionHud({sourceKey:key,missionsKey,plan,reviewed:false});
    }catch(problem){if(request===generation.current){setMissionHud(null);setError(String(problem));}}
    finally{if(request===generation.current)setBusy(false);}
  }
  async function buildWorkingTags(bspAudio?: BspAudioRequest, compileScripts=false, attachment?:NativeScriptAttachment, firefight?:NonNullable<typeof firefightSource>,mission?:NonNullable<typeof missionHud>) {
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
    if(authoringPending&&!compileScripts){setError('Campaign or Firefight authoring changed. For recovered missions, prepare the current mission source. For new or recorded generated groups and their controller, review Firefight groups & controller. For existing encounters, review their bound source and choose Attach source & compile or Compile scripts & build.');return;}
    if(firefight&&(!selectedFirefightSource?.reviewed||firefight!==selectedFirefightSource||attachment?.sha256!==firefight.script.sha256))return;
    if(attachment&&!firefight&&(!selectedScript?.reviewed||selectedScript.sha256!==attachment.sha256||selectedScript.replacesSha256!==attachment.replacesSha256||!report?.workingSource))return;
    if(attachment?.content.startsWith(nativeCinematicPrefix)&&!currentCinematic){setError('The take or source changed. Read native cameras and prepare its cinematic source again.');return;}
    if(nativeRecoveredMissionDraft&&!currentRecoveredMissionIdentity){setError('Read native mission source and prepare again after changing missions, camera references or source. Preserve handwritten changes through the explicit manual route.');return;}
    if(nativeTransportDraft&&!currentTransportIdentity){setError('Read native transport source again and check both pad volumes before compiling generated transport source. Preserve handwritten changes through the manual source route.');return;}
    if(mission&&(!selectedMissionHud?.reviewed||mission!==selectedMissionHud||firefight||!!attachment&&!compileScripts))return;
    const sourceKey = scriptSourceKey;
    setBusy(true);
    setError('');
    try {
      await call<string>('build_working_tags', { projectId: project.id, compileScripts, ...(bspAudio ? { bspAudio } : {}),...(mission?{missionHud:mission.plan.hud.review}:{}),
        expectedBuildId:report.workingSource.buildId,expectedSourceDirectory:report.workingSource.tagsDirectory,
        ...(attachment?{scriptAttachment:{filename:attachment.filename,content:attachment.content,sha256:attachment.sha256,...(attachment.replacesSha256?{replacesSha256:attachment.replacesSha256}:{})}}:{}),
        ...(firefight?{encounterAppend:firefight.plan.request,expectedTagIdentity:firefight.plan.tagIdentity}:nativeCinematicDraft&&currentCinematic?{expectedTagIdentity:currentCinematic.tagIdentity}:nativeTransportDraft&&currentTransportIdentity?{expectedTagIdentity:currentTransportIdentity}:nativeRecoveredMissionDraft&&currentRecoveredMissionIdentity?{expectedTagIdentity:currentRecoveredMissionIdentity}:{}) });
      if (sourceKey === currentScriptSourceKey.current) {
        setDetails(false);
        setNotice(
          compileScripts?'Compiling reviewed scenario HaloScript, then a separate native map. Missing original modules or compiler/readback failures leave the previous-good cache unchanged.':'Compiling a separate map from saved working tags, retaining their existing compiled scripts. To apply edited .hsc source, use Compile scripts & build.',
        );
        onNavigate('build');
      }
    } catch (e) {
      if (sourceKey === currentScriptSourceKey.current) {setError(String(e));if(firefight)setFirefightSource(null);}
    } finally {
      if (sourceKey === currentScriptSourceKey.current) setBusy(false);
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
          {error && <div ref={errorNotice} role="alert"><Notice>{error}</Notice></div>}
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
            Campaign or Firefight authoring is saved but not compiled. The retained source belongs to the earlier build. For campaign objectives, use Creator Studio → Prepare recovered mission source, then review and compile below. For new encounters, use Build new Firefight groups & controller below to review and stage groups plus source together. For existing encounters, export the current bound controller in Firefight rules → Advanced script export, then attach it below. For an existing controller, edit/review its original module through Open script source folder and choose Compile scripts &amp; build. A tag-only build cannot apply these rules.
            <details><summary>Source and authored revisions</summary><p className="wrap-code">Compiled source: {report.workingSource.sourceProjectFingerprint}<br/>Saved authoring: {report.workingSource.projectFingerprint}</p></details>
          </Notice>}
          {project && report?.workingSource && h1aSource && !authoringPending && <WorkingTagChanges {...toolTags} />}
          {showH1aTools && !authoringPending && <BaboonTools project={project} dirty={dirty} epoch={epoch} />}
          {workingSourceAvailable && project && report?.workingSource && !authoringPending && (
            <NativeTagOperations project={project} dirty={dirty} epoch={epoch} onLevelEditor={()=>onNavigate('quickforge')} />
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
            <details className="native-transport-source"><summary>Forerunner dropship controller</summary>
              <p className="subtle">Author native insertion and evacuation using existing named aircraft, pilot AI, command lists and pad volumes. Spark prepares an ordinary .hsc module in the same project draft; Forerunner owns deployment, physical boarding and durable banking. No mandatory raid timer.</p>
              <button disabled={!native||busy||working||moduleBusy||dirty} onClick={()=>void listScriptModules(true,true)}>Read native transport source</button>
              {nativeTransportDraft&&<div className="button-row"><button type="button" disabled={busy||working||moduleBusy} onClick={()=>{try{setTransport(readNativeTransportSource(selectedScript!.content));}catch(problem){setError(String(problem));}}}>Load transport configuration from draft</button><button type="button" disabled={busy||working||moduleBusy} onClick={()=>{if(selectedScript)keepScriptDraft({...selectedScript,content:selectedScript.content.slice(nativeTransportPrefix.length),reviewed:false});}}>Use transport draft as manual HaloScript</button></div>}
              {nativeCameras&&<fieldset disabled={busy||working||moduleBusy||dirty||report.workingSource?.target!=='gbx-custom'||nativeCameras.scenarioType!==0}>
                <label>Aircraft faction<select aria-label="Transport faction" value={transport.faction} onChange={event=>setTransport({...transport,faction:event.target.value as NativeTransportOptions['faction']})}><option value="unsc">UNSC · Pelican</option><option value="covenant">Covenant · Spirit</option></select></label>
                {([['pilot','Pilot encounter / squad'],['pilotSeat','Pilot native seat label'],['outbound','Insertion command list'],['inbound','Return command list'],['hub','Hub pad volume'],['field','Landing pad volume']] as const).map(([field,label])=>{
                  const refs=modules?.transportReview;
                  const options=field==='pilot'?refs?.pilots:field==='pilotSeat'?refs?.vehicles.find(vehicle=>vehicle.name===(transport.faction==='unsc'?'extraction_pelican':'extraction_spirit'))?.pilotSeats:field==='hub'||field==='field'?nativeCameras.triggerVolumes:refs?.routes;
                  const values=[...new Set(options??[])];return <label key={field}>{label}<select aria-label={label} value={transport[field]} onChange={event=>setTransport({...transport,[field]:event.target.value})}><option value="">Choose an existing native reference</option>{transport[field]&&!values.includes(transport[field])&&<option value={transport[field]}>{transport[field]} · unavailable in current source</option>}{values.map(value=><option key={value} value={value}>{value}</option>)}</select></label>;
                })}
                <label><input type="checkbox" checked={transport.createPilot??false} disabled={!transport.createPilot&&!modules?.transportReview?.scriptCreatedPilots?.includes(transport.pilot)} onChange={event=>setTransport({...transport,createPilot:event.target.checked,...(!event.target.checked?{holdParkedPilot:undefined}:{})})}/>Create deferred pilot on map load</label>
                <p className="subtle">Opt in only after reviewing all existing pilot-spawn scripts. Requires a single-pilot group whose native encounter has initial creation disabled. The controller places it once when no pilot is alive, then uses the actual driver seat. It never erases or replaces actors. Leave off when existing source creates the pilot. Duplicate ownership, actor navigation and seat entry still need gameplay checks.</p>
                <label title="Pause the owned pilot while parked. Native boarding, landing and recall still determine when it can fly."><input type="checkbox" checked={transport.holdParkedPilot??false} disabled={!transport.createPilot} onChange={event=>setTransport({...transport,holdParkedPilot:event.target.checked||undefined})}/>Hold pilot AI while parked</label>
                {transport.holdParkedPilot&&<p className="subtle">The pilot takes its native driver seat and settles on the hub pad before the first pause. It resumes for the reviewed flight route and pauses again after each confirmed landing. The aircraft keeps its normal collision and seating.</p>}
                {transport.createPilot&&!modules?.transportReview?.scriptCreatedPilots?.includes(transport.pilot)&&<Notice>Read current native transport source and choose a deferred single-pilot group, or clear Create deferred pilot on map load. Automatic pilot creation cannot be owned by both the scenario and this controller.</Notice>}
                <details><summary>Permanent native NPC crew · {(transport.crew??[]).length}</summary>
                  <p className="subtle">Assign dedicated single-actor groups to exact non-driver seats with matching actor/biped animations. Crew stays aboard by default. Disembark at first insertion releases only captured NPCs at the first landing; link the same group to a shared escort using Rescue troop source. Enable Hold from combat until disembarkation for a troop this controller creates. The captured troop’s AI resumes after first landing and exit. It does not reinsert or respawn troops on later trips. At least one passenger seat must remain free. No player is force-boarded. Creation requires explicit ownership of a deferred group; existing actors are never erased or respawned.</p>
                  {(transport.crew??[]).map((member,index)=>{const refs=modules?.transportReview,aircraft=transport.faction==='unsc'?'extraction_pelican':'extraction_spirit',binding=refs?.pilotBindings?.find(row=>row.aircraft===aircraft&&row.pilot===member.group);const update=(patch:Partial<NonNullable<NativeTransportOptions['crew']>[number]>)=>setTransport({...transport,crew:transport.crew!.map((row,i)=>i===index?{...row,...patch}:row)});return <div className="native-transport-crew" key={index}>
                    <label>Crew encounter / squad<select aria-label={'Crew group '+(index+1)} value={member.group} onChange={event=>update({group:event.target.value})}><option value="">Choose dedicated native group</option>{member.group&&!refs?.pilots.includes(member.group)&&<option value={member.group}>{member.group} · unavailable</option>}{refs?.pilots.map(group=><option key={group} value={group}>{group}</option>)}</select></label>
                    <label>Native crew seat<select aria-label={'Crew seat '+(index+1)} value={member.seat} onChange={event=>update({seat:event.target.value})}><option value="">Choose compatible non-driver seat</option>{member.seat&&!binding?.crewSeats?.includes(member.seat)&&<option value={member.seat}>{member.seat} · unavailable</option>}{binding?.crewSeats?.map(seat=><option key={seat} value={seat}>{seat}</option>)}</select></label>
                    <label><input type="checkbox" aria-label={'Create deferred crew '+(index+1)} checked={member.create??false} disabled={!member.create&&!refs?.scriptCreatedPilots?.includes(member.group)} onChange={event=>update({create:event.target.checked,...(!event.target.checked?{holdUntilInsertion:undefined}:{})})}/>Create deferred crew on map load</label>
                    <label><input type="checkbox" aria-label={'Disembark troop '+(index+1)} checked={member.releaseAtInsertion??false} onChange={event=>update({releaseAtInsertion:event.target.checked,...(!event.target.checked?{holdUntilInsertion:undefined}:{})})}/>Disembark at first insertion</label>
                    <label><input type="checkbox" aria-label={'Hold troop until insertion '+(index+1)} checked={member.holdUntilInsertion??false} disabled={!member.create||!member.releaseAtInsertion} onChange={event=>update({holdUntilInsertion:event.target.checked||undefined})}/>Hold from combat until disembarkation</label>
                    <button type="button" aria-label={'Remove crew '+(index+1)} onClick={()=>setTransport({...transport,crew:transport.crew!.filter((_,i)=>i!==index)})}>Remove crew</button>
                    {binding&&<p className="subtle">{member.group} · {binding.actors.join(', ')} · {binding.animationGraphs.join(', ')} · {binding.crewIssue??'Source animation labels match; actual seating remains a game test.'}</p>}
                  </div>;})}
                  <button type="button" disabled={(transport.crew??[]).length>=8} onClick={()=>setTransport({...transport,crew:[...(transport.crew??[]),{group:'',seat:''}]})}>Add native crew assignment</button>
                </details>
                <label><input type="checkbox" checked={transport.returnAfterInsertion??false} onChange={event=>setTransport({...transport,returnAfterInsertion:event.target.checked,...(!event.target.checked?{trackPlayerInsertion:undefined}:{})})}/>Return empty after insertion and recall for pickup</label>
                <label><input type="checkbox" checked={transport.trackPlayerInsertion??false} disabled={!transport.returnAfterInsertion} onChange={event=>setTransport({...transport,trackPlayerInsertion:event.target.checked||undefined})}/>Confirm player insertion</label>
                <p className="subtle">After every player passenger leaves and all permanent NPC crew remain correctly seated at the landing zone, the aircraft follows Return to the hub and waits there closed. A real field recall sends it along Insertion again. Evacuation still requires actual boarding and the correct landing volume; gear settles only after the final return callback. Turn off to keep the aircraft at the landing zone. Reused routes must be safe in both phases; configure slower final approaches and real hull clearance.</p>
                <details><summary>Aircraft-relative cameras · optional</summary><p className="subtle">Select native points for insertion and evacuation departure. Their XYZ and orientation are offsets from the moving aircraft, not world positions. These shared cinematics affect all viewers, temporarily control input, then restore it; they are not private squad cameras. Empty returns and recall flights do not play them.</p>
                {([['insertionCamera','Insertion relative camera'],['departureCamera','Departure relative camera']] as const).map(([field,label])=><div key={field}><label>{label}<select aria-label={label} value={transport[field]?.marker??''} onChange={event=>setTransport({...transport,[field]:event.target.value?{marker:event.target.value,durationMs:transport[field]?.durationMs??3000}:undefined})}><option value="">Off</option>{transport[field]&&!nativeCameras.cameras.some(point=>point.name===transport[field]?.marker)&&<option value={transport[field]!.marker}>Missing · {transport[field]!.marker}</option>}{nativeCameras.cameras.filter(point=>/^[A-Za-z_][A-Za-z0-9_]{0,30}$/.test(point.name)).map(point=><option key={point.index} value={point.name}>{point.name}</option>)}</select></label>{transport[field]&&<><label>Duration · seconds<input aria-label={label+' duration'} type="number" min={0.1} max={30} step={0.1} value={transport[field]!.durationMs/1000} onChange={event=>setTransport({...transport,[field]:{...transport[field]!,durationMs:Math.round(Number(event.target.value)*1000)}})}/></label><p className="subtle">Native offset {nativeCameras.cameras.find(point=>point.name===transport[field]?.marker)?.position.join(', ')??'Unavailable'}. Edit pose/lens using AI & scenario → Edit native scenario & assets → Existing cutscene cameras. Add native camera point works when none exist; Preview → Accept → Save/rebuild → read source again.</p></>}</div>)}
                </details>
                {transportCameraIssue(transport)&&<Notice>{transportCameraIssue(transport)}</Notice>}
                {([['departureCue','Departure camera/dialogue function'],['arrivalCue','Arrival camera/dialogue function']] as const).map(([field,label])=><label key={field}>{label}<input aria-label={label} maxLength={31} value={transport[field]??''} onChange={event=>setTransport({...transport,[field]:event.target.value})}/></label>)}
                <details><summary>Available native transport references</summary><p>Pilots: {modules?.transportReview?.pilots.join(', ')||'No single-pilot group found'}</p><p>Routes: {modules?.transportReview?.routes.join(', ')||'No nonempty command list found'}</p>{modules?.transportReview?.vehicles.map(vehicle=><p key={vehicle.name}>{vehicle.name} · {vehicle.tagPath} · seats: {vehicle.seats.join(', ')} · pilot: {vehicle.pilotSeats?.join(', ')||'No verified driver seat'} · {vehicle.flightIssue||(!vehicle.flight?'Flight settings unavailable':`AI throttle ${vehicle.flight.throttle}, avoidance ${vehicle.flight.avoidanceDistance}, radius ${vehicle.flight.pathfindingRadius}`)}</p>)}{modules?.transportReview?.flightRoutes?.filter(route=>[transport.outbound,transport.inbound].includes(route.name)).map(route=><p key={route.name}>{route.name} · {route.commands} actions / {route.points} points · {route.issue||('final origin '+route.finalPosition?.join(', ')+' · contained by: '+(route.arrivalVolumes.join(', ')||'No readable pad'))}</p>)}{modules?.transportReview?.pilotBindings?.filter(row=>row.pilot===transport.pilot&&row.aircraft===(transport.faction==='unsc'?'extraction_pelican':'extraction_spirit')).map(row=><p key={row.aircraft+row.pilot}>{row.pilot} · actors: {row.actors.join(', ')||'Unread'} · animation graphs: {row.animationGraphs.join(', ')||'Unread'} · {row.issue||('Compatible driver labels: '+row.seats.join(', '))}</p>)}<p>Dedicated groups: {modules?.transportReview?.groups.join(', ')||'None found'}</p></details>
                {transportCrewIssue(transport)&&<Notice>{transportCrewIssue(transport)} Review native source, dedicated actor groups and compatible non-driver animations before preparing.</Notice>}
                {transportPilotIssue(transport)&&<Notice>{transportPilotIssue(transport)} Review Available native transport references below. Use the existing AI/source tools to import/select a compatible actor and its graph; refresh before preparing.</Notice>}
                {transportFlightIssue(transport)&&<Notice>{transportFlightIssue(transport)} Open AI & scenario → Edit native scenario & assets, select the matching vehicle, then Native aircraft AI flight settings. Preview → Accept → Save/rebuild → read transport source again.</Notice>}
                {transportRouteIssue(transport)&&<Notice>{transportRouteIssue(transport)} Edit AI & scenario → Edit native scenario & assets → Map scenario → Existing AI command lists; use Show command route in Level Editor. Native pad geometry can be edited in the same source controls. Preview/Accept, Save/rebuild and read source again. These checks do not prove hull clearance or ground contact.</Notice>}
                <button type="button" disabled={!!transportCrewIssue(transport)||!!transportCameraIssue(transport)||!!transportPilotIssue(transport)||!!transportFlightIssue(transport)||!!transportRouteIssue(transport)||!!transport.createPilot&&!modules?.transportReview?.scriptCreatedPilots?.includes(transport.pilot)} onClick={()=>void prepareTransportSource()}>Prepare transport script draft</button>
              </fieldset>}
              <p className="subtle">Use CE609 solo source. Create pilot AI and real seats with the existing AI/tag tools; routes with AI & scenario → Edit native scenario & assets → Map scenario → Existing AI command lists. Pad volumes must already exist. Read native transport source again after restarting or changing source; generated builds pin the current tag identity. Load transport configuration from draft restores its saved choices. Bind the matching craft and three dedicated boarding/recall/landing groups. The source waits for both real landing and its pad; it never treats hover or time as arrival. Optional camera/dialogue functions must already exist and end cinematics. Players disembark normally; returning craft stays closed until Forerunner wakes its crew-settlement callback. Native compilation checks references; pilot failure/recovery, clearances, repeat trips and multiplayer need actual game acceptance. Hand-edited modules are preserved and require Edit selected module.</p>
            </details>
            {(!project.quickForge||project.quickForge.native)&&<details className="native-recovered-mission-source" open={recoveredMissionOpen} onToggle={event=>setRecoveredMissionOpen(event.currentTarget.open)}><summary>Recovered campaign mission source</summary>
              <p>Use saved Mission Director objectives with this native solo scenario. Read the current references, prepare, Save and review the draft, then Attach source &amp; compile. Native camera points own their poses; use the existing cinematic/source tools to edit them. Missing dependencies stop the build.</p>
              <button type="button" disabled={busy||working||dirty||moduleBusy} onClick={()=>void listScriptModules(true,false,true)}>Read native mission source</button>
              <label>Recovered mission activation<select value={recoveredActivation} disabled={busy||working||moduleBusy} onChange={event=>setRecoveredActivation(event.target.value as 'manual'|'startup')}><option value="manual">Manual · wake gs_mission from another script</option><option value="startup">Startup · wait for players</option></select></label>
              <label>Mission source destination<select aria-label="Mission source destination" value={missionModule} disabled={busy||working||moduleBusy} onChange={event=>{setMissionModule(event.target.value);setMissionOriginal(null);setMissionOwnershipConfirmed(false);setRecoveredMissionPlan(null);}}><option value="">New gs_mission.hsc module</option>{missionModule&&(!pickedMissionModule||pickedMissionModule.unavailable)&&<option value={missionModule}>{pickedMissionModule?'Unavailable':'Missing'} selected module · {missionModule}</option>}{modules?.modules.filter(row=>!row.unavailable).map(row=><option key={row.filename} value={row.filename}>Reviewed revision · {row.filename}</option>)}</select></label>
              <p className="subtle">To restore editable objectives from an existing Spark-authored native module, choose it above and review its recovered mission data. Apply rechecks source and uses project Undo/Redo; it does not execute HaloScript or change native files.</p>
              <MissionSourceReview project={project} edit={onEdit} onActivation={setRecoveredActivation}
                exportLocal={()=>downloadLocalText('mission-draft.json',exportStudioEvidence(project.studio??emptyCreatorStudio(),project),'application/json')}
                nativeSource={{key:JSON.stringify([scriptSourceKey,missionModule,pickedMissionModule?.sha256,modules?.sourceSha256,nativeCameras?.tagIdentity]),disabled:busy||working||dirty||moduleBusy||!pickedMissionModule||!!pickedMissionModule.unavailable||!workingSourceAvailable||nativeCameras?.scenarioType!==0,read:readRecoveredMissionReview,verify:verifyRecoveredMissionReview,applied:recoveredMissionAdopted}}/>
              {missionModule&&<details open><summary>Review original controller ownership</summary>
                <button type="button" disabled={busy||working||dirty||moduleBusy||!pickedMissionModule||!!pickedMissionModule.unavailable} onClick={()=>void readMissionComposition()}>Read original mission module</button>
                {(!pickedMissionModule||pickedMissionModule.unavailable)&&<p>{pickedMissionModule?.unavailable??'The selected module is unavailable in this source. Read native mission source, then choose an available module or the new-module workflow.'}</p>}
                {reviewedMissionOriginal&&<>
                  <p>Original {reviewedMissionOriginal.filename} · SHA256 {reviewedMissionOriginal.sha256.slice(0,12)}. Selected startup bodies will sleep permanently; every other original form and comment remains. Review the complete draft before compiling. The previous native build keeps the original file.</p>
                  <details><summary>Inspect original module source</summary><textarea aria-label="Original mission module source" readOnly rows={6} value={reviewedMissionOriginal.content}/></details>
                  {missionCompositionLocked&&<p>This module already has reviewed controller ownership. Objective edits remain subject to the native source checks; changing retired controllers or callback ownership requires the manual source editor or the previous native build.</p>}
                  {missionDeclarations.filter(row=>row.kind==='script'&&row.type==='startup'&&row.name!=='gs_mission_bootstrap').map(row=><label key={row.name}><input type="checkbox" checked={retiredStartups.includes(row.name)} disabled={busy||working||moduleBusy||missionCompositionLocked} onChange={event=>{setRetiredStartups(names=>event.target.checked?[...names,row.name]:names.filter(name=>name!==row.name));setMissionOwnershipConfirmed(false);setRecoveredMissionPlan(null);}}/>Retire startup body · {row.name}</label>)}
                  {missionDeclarations.some(row=>row.kind==='script'&&row.name==='forerunner_extraction_complete')&&<label><input type="checkbox" checked={replaceMissionCallback} disabled={busy||working||moduleBusy||missionCompositionLocked} onChange={event=>{setReplaceMissionCallback(event.target.checked);setMissionOwnershipConfirmed(false);setRecoveredMissionPlan(null);}}/>Replace the dormant extraction callback body with the new mission's settlement gate; original callback side effects are replaced.</label>}
                  <label><input type="checkbox" aria-label="Confirm original mission ownership" checked={missionOwnershipConfirmed} disabled={busy||working||moduleBusy} onChange={event=>{setMissionOwnershipConfirmed(event.target.checked);setRecoveredMissionPlan(null);}}/>I reviewed the selected controller changes and remaining startup/continuous scripts for competing gameplay ownership.</label>
                </>}
              </details>}
              <button type="button" disabled={busy||working||dirty||moduleBusy||!modules?.missionReview||!nativeCameras||!!missionModule&&(!reviewedMissionOriginal||!missionOwnershipConfirmed)} onClick={()=>void prepareRecoveredMission()}>Prepare recovered mission draft</button>
              {nativeRecoveredMissionDraft&&<button type="button" disabled={busy||working||moduleBusy} onClick={()=>{if(selectedScript){const end=selectedScript.content.indexOf('\n',recoveredMissionPrefix.length);keepScriptDraft({...selectedScript,content:selectedScript.content.slice(end+1),reviewed:false});setRecoveredMissionPlan(null);}}}>Use mission draft as manual HaloScript</button>}
              {nativeRecoveredMissionDraft&&!currentRecoveredMissionIdentity&&<small>Mission or source review is stale. Read source and prepare again before compiling.</small>}
            </details>}
            <details className="native-cinematic-source"><summary>Timed cinematic · existing cameras</summary>
              <p className="subtle">Use native camera names and poses with the saved Machinima timeline. Source review pins the complete tag library. Choose manual invocation or a native trigger area below.</p>
              <button disabled={!native||busy||working||moduleBusy||dirty} onClick={()=>void listScriptModules(true)}>Read native cameras &amp; modules</button>
              {nativeCameras&&<><label>Existing native camera<select aria-label="Existing cinematic camera" value={takeCamera?.index??''} disabled={busy||working||moduleBusy} onChange={e=>setCinematicCamera(e.target.value)}>{nativeCameras.cameras.map(p=><option key={p.index} value={p.index}>{p.index} · {p.name||'Unnamed camera'}</option>)}</select></label>
                <div className="button-row"><button disabled={!takeCamera||busy||working||moduleBusy} onClick={addCinematicCamera}>Add native camera to take</button><button onClick={()=>{setDetails(false);onNavigate('machinima');}}>Edit take timing in Machinima</button></div>
                <label>Cinematic function / module<input aria-label="Cinematic function name" maxLength={31} value={cinematicName} disabled={busy||working||moduleBusy} onChange={e=>{setCinematicName(e.target.value);setCinematicPlan(null);}}/></label>
                <label>Start cinematic<select aria-label="Cinematic activation" disabled={busy||working||moduleBusy||!project.studio?.shots.length} value={project.studio?.cinematicTriggerVolume==null?'manual':'area'} onChange={event=>{const latest=currentProject.current;if(!latest?.studio)return;onEdit({...latest,studio:{...latest.studio,cinematicTriggerVolume:event.target.value==='area'?nativeCameras.triggerVolumes[0]:null}},'Change cinematic activation');setCinematicPlan(null);}}><option value="manual">Manual call / area trigger off</option><option value="area" disabled={nativeCameras.scenarioType!==0||!nativeCameras.triggerVolumes?.length}>Player enters an existing area</option></select></label>
                {project.studio?.cinematicTriggerVolume!=null&&<label>Trigger area<select aria-label="Cinematic trigger area" disabled={busy||working||moduleBusy} value={project.studio.cinematicTriggerVolume} onChange={event=>{const latest=currentProject.current;if(!latest?.studio)return;onEdit({...latest,studio:{...latest.studio,cinematicTriggerVolume:event.target.value}},'Change cinematic trigger area');setCinematicPlan(null);}}>{!nativeCameras.triggerVolumes?.includes(project.studio.cinematicTriggerVolume)&&<option value={project.studio.cinematicTriggerVolume}>Missing area · choose again</option>}{nativeCameras.triggerVolumes?.map((name,index)=><option key={index} value={name}>{name}</option>)}</select></label>}
                <p className="subtle">Area activation is once per map load, after a player enters the named native volume. Save settings, prepare and review, then compile. Turning it off and rebuilding preserves its existing controller identity in a disabled state. Other mission camera scripts are unchanged; gameplay and co-op camera ownership need testing.</p>
                {(!nativeCameras.triggerVolumes?.length||nativeCameras.scenarioType!==0)&&<p className="subtle">Area activation needs campaign source with an existing native trigger volume. No missing volume is generated here.</p>}
                <button disabled={busy||working||!dirty} onClick={()=>void onSave().catch(problem=>setError(String(problem)))}>Save take settings</button>
                <button disabled={busy||working||moduleBusy||dirty||!project.studio?.shots.length} onClick={()=>void prepareCinematicSource()}>Prepare timed cinematic source</button></>}
              {currentCinematic?.original&&<details><summary>Original module retained for review</summary><textarea aria-label="Original cinematic module" rows={8} readOnly value={currentCinematic.original}/></details>}
              {nativeCinematicDraft&&!currentCinematic&&<Notice tone="info">The saved take or native source needs a fresh cinematic review before building. Read cameras and prepare again.</Notice>}
              {nativeCinematicDraft&&<button disabled={busy||working} onClick={()=>{if(selectedScript){keepScriptDraft({...selectedScript,content:selectedScript.content.slice(nativeCinematicPrefix.length),reviewed:false});setCinematicPlan(null);}}}>Use draft as manual HaloScript</button>}
              <p className="subtle">Change camera geometry in Tags → Existing cutscene cameras and accept it first. Timeline pose changes must match native source; they are never silently ignored. Review an existing module before replacement; the compiler refuses losing original scripts/globals. Reprepare after restart or source/take changes. With area activation off, call the cinematic function from a recovered campaign module and rebuild to connect a manual trigger. Playback and camera/input restoration require gameplay testing.</p>
            </details>
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
                <button disabled={!native||busy||working||dirty||!selectedScript.reviewed||!/^[a-f0-9]{64}$/.test(selectedScript.sha256)||selectedScript.sha256===selectedScript.replacesSha256||nativeCinematicDraft&&!currentCinematic||nativeTransportDraft&&!currentTransportIdentity||nativeRecoveredMissionDraft&&!currentRecoveredMissionIdentity||toolTags.report?.status==='saving'||integrityBlocks(toolTags.report?.integrity)||!!report.sourceIssue||!!report.toolsIssue||report.processes.some(p=>p.projectId===project.id&&p.status==='running')}
                  onClick={()=>void buildWorkingTags(undefined,true,selectedScript)}>{selectedScript.replacesSha256?'Build reviewed script revision':'Attach source & compile'}</button>
                <button disabled={busy||working} onClick={()=>keepScriptDraft(null)}>Remove project draft</button>
              </div>

              <p className="subtle">Compilation checks references and preserves other modules and original native script identities. It does not prove actor spawning, gameplay, wave rules or Forerunner compatibility. Missing encounters, loadout profiles or navigation must be authored separately.</p>
            </>}
              <details className="native-mission-hud">
                <summary>Campaign objective HUD messages</summary>
                <p className="subtle">Edit objective text in Creator Studio, then Save and prepare its native message review here. Use the listed message names in your HaloScript. Build text alone to retain existing compiled scripts, or review an edited module to build both. Runtime display and objective progression need game checks.</p>
                <button disabled={!native||busy||working||dirty||!project.studio?.missions.length} onClick={()=>void prepareMissionHud()}>Prepare mission HUD messages</button>
                {selectedMissionHud&&<>
                  <p>{selectedMissionHud.plan.hud.originalCount} original messages preserved; {selectedMissionHud.plan.hud.messages.length} messages in the proposed native HUD. Existing indices and button symbols are retained.</p>
                  <ul aria-label="Campaign HUD message review">{selectedMissionHud.plan.hud.messages.filter(message=>/^gs_mission_(obj|cue|fail)_\d+$/.test(message.name)).map(message=><li key={message.name}><code>{message.name}</code> — {message.panels.map(panel=>panel.kind==='text'?panel.value:`[button ${panel.value}]`).join('')}</li>)}</ul>
                  <button onClick={()=>downloadLocalText('mission-hud-review.json',JSON.stringify(selectedMissionHud.plan.hud.messages,null,2),'application/json')}>Export message review</button>
                  <label><input type="checkbox" checked={selectedMissionHud.reviewed} disabled={busy||working||dirty} onChange={event=>setMissionHud({...selectedMissionHud,reviewed:event.target.checked})}/>I reviewed the mission messages and their HaloScript references.</label>
                  <button disabled={!native||busy||working||dirty||!selectedMissionHud.reviewed||toolTags.report?.status==='saving'||integrityBlocks(toolTags.report?.integrity)||!!report.sourceIssue||!!report.toolsIssue||report.processes.some(p=>p.projectId===project.id&&p.status==='running')}
                    onClick={()=>void buildWorkingTags(undefined,false,undefined,undefined,selectedMissionHud)}>Build mission HUD text</button>
                  {selectedScript&&<button disabled={!native||busy||working||dirty||!selectedScript.reviewed||!selectedMissionHud.reviewed||!/^[a-f0-9]{64}$/.test(selectedScript.sha256)||selectedScript.sha256===selectedScript.replacesSha256||toolTags.report?.status==='saving'||integrityBlocks(toolTags.report?.integrity)||!!report.sourceIssue||!!report.toolsIssue||report.processes.some(p=>p.projectId===project.id&&p.status==='running')}
                    onClick={()=>void buildWorkingTags(undefined,true,selectedScript,undefined,selectedMissionHud)}>Build script &amp; mission HUD</button>}
                </>}
              </details>
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
