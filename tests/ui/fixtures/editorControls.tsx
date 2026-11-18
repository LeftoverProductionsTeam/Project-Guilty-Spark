import NativeCommandLists from '../../../src/components/NativeCommandLists';
import NativeDevicePlacements from '../../../src/components/NativeDevicePlacements';
import NativeTriggerVolumes from '../../../src/components/NativeTriggerVolumes';
import NativeCutsceneCameras from '../../../src/components/NativeCutsceneCameras';
import {useState} from 'react';
import NativeSquadBehaviorEditor from '../../../src/components/NativeSquadBehavior';
import NativeSquadPatrol from '../../../src/components/NativeSquadPatrol';
import NativeStartingPositions from '../../../src/components/NativeStartingPositions';
import {useMapState} from '../../../src/mapSession';
import {NATIVE_AI_START_VIEW} from '../../../src/nativeAiStart';
import type {NativeAiStartView} from '../../../src/nativeAiStart';
import type {NativeTagContext} from '../../../src/nativeOperations';
import {createRoot} from 'react-dom/client';
import {Matrix4} from 'three';
import {NumberField,HelpTip} from '../../../src/components/ui';
import WorkspacePanels,{WorkspacePanel} from '../../../src/components/WorkspacePanels';
import useEndToFloor from '../../../src/useEndToFloor';
import ExternalBrowserLink from '../../../src/components/ExternalBrowserLink';
import '../../../src/styles.css';
import '../../../src/workbenchCompact.css';
const floor={positions:[-10,-10,0,10,-10,0,10,10,0,-10,10,0],indices:[0,1,2,0,2,3]};
const support={positions:[-2,-2,2,2,-2,2,2,2,2,-2,2,2],indices:[0,1,2,0,2,3]};
function Fixture(){
  const [value,setValue]=useState(1),[commits,setCommits]=useState<number[]>([]),[z,setZ]=useState(5),[drops,setDrops]=useState<number[]>([]),[error,setError]=useState('');
  useEndToFloor({enabled:true,revision:String(z),selected:[{id:'a',name:'Synthetic selection',matrix:new Matrix4().makeTranslation(0,0,z),collision:{positions:[-.5,-.5,0,.5,.5,1],indices:[]}}],others:[{id:'support',name:'Synthetic actual collision',matrix:new Matrix4(),collision:support}],terrain:floor,onDrop:delta=>{setZ(z+delta);setDrops(d=>[...d,delta]);},onError:setError});
  return <div className="application" style={{display:'flex',height:'100vh',padding:0}}><WorkspacePanels id="interaction-fixture" workspace="world" onNavigationToggle={()=>{}} navigationOpen={false}>
    <div data-testid="main-flow" style={{padding:16}}><NumberField label="Test position" value={value} min={-10} max={10} step={.1} onCommit={next=>{setValue(next);setCommits(c=>[...c,next]);}}/><button>Leave field</button><output data-testid="commits">{JSON.stringify(commits)}</output><output data-testid="height">{z}</output><output data-testid="drops">{JSON.stringify(drops)}</output><output role="alert">{error}</output><input aria-label="Typing here"/><ExternalBrowserLink href="https://c20.reclaimers.net/h1/scripting/">Script documentation</ExternalBrowserLink></div>
    <WorkspacePanel id="inspector" label="Inspector"><div className="forge-live-panel"><p>Compact drawer content</p><div style={{overflow:'hidden',width:260,height:35}}><HelpTip help="This explanation must escape the clipping container and stay above the viewport."/></div></div></WorkspacePanel>
    </WorkspacePanels></div>;
}
function NativeAiDraftFixture(){
 const [busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[operation,setOperation]=useState<unknown>(null);
 const facing=location.search.includes('facing'),firing=location.search.includes('firing'),commands=location.search.includes('commands');
 const context={projectId:'ai-panel-fixture',buildId:'source',tag:'levels/test/test.scenario',class:'scnr',tagSha256:'a'.repeat(64),startEditIssue:null,combatEditIssue:null,...(commands?{scenarioCommandLists:[{index:0,name:'guard',commands:2},{index:1,name:'patrol',commands:3}]}:{}),scenarioCombat:[{encounter:0,name:'guards',points:[{index:0,position:[1,2,3],group:'z'}],squads:[]}],protectedSquadEncounters:[],scenarioStartSquads:[{encounter:0,squad:0,encounterName:'guards',name:'original',normalCount:1,insaneCount:1,starts:[{index:0,position:[1,2,3],...(facing?{facingRadians:Math.PI/2}:{}),...(commands?{commandList:-1}:{})}]}]} as NativeTagContext;
 const [draft]=useMapState<NativeAiStartView|null>(context.projectId,NATIVE_AI_START_VIEW,()=>null);
 return <><button onClick={()=>setDirty(v=>!v)}>Toggle project dirty</button><button onClick={()=>setBusy(false)}>Finish preview</button><output data-testid="ai-operation">{JSON.stringify(operation)}</output><output data-testid="ai-draft">{JSON.stringify(draft)}</output>{[true,false].map((active,index)=><section key={index} data-testid={'ai-inspector-'+index}><NativeStartingPositions kind={firing?'firing':'start'} context={context} busy={active&&busy} dirty={dirty} onPreview={value=>{setOperation(value);setBusy(true);}} onDraftChange={()=>{}}/></section>)}</>;
}
function NativeBehaviorFixture(){
 const [dirty,setDirty]=useState(false),[revision,setRevision]=useState(0),[operation,setOperation]=useState<unknown>(null);
 const source={...(new URLSearchParams(location.search).has('upgrades')?{majorUpgrade:'normal'}:{}),...(new URLSearchParams(location.search).has('migration')?{automaticMigration:false}:{}),initialState:'none',returnState:'alert',patrolCount:0,starts:[{index:0,initialState:'alert',returnState:'none'},{index:1,initialState:'none',returnState:'none'}]};
 const context={projectId:'behavior-fixture',buildId:'build',class:'scnr',tag:'level.scenario',tagSha256:(revision?'b':'a').repeat(64)} as NativeTagContext;
 return <><button onClick={()=>setDirty(!dirty)}>Toggle project dirty</button><button onClick={()=>setRevision(revision+1)}>Refresh source revision</button><output data-testid="behavior-original">{JSON.stringify(source)}</output><output data-testid="behavior-operation">{JSON.stringify(operation)}</output><NativeSquadBehaviorEditor context={context} squadChoice={{encounter:0,squad:0,encounterName:'guards',name:'original',normalCount:1,insaneCount:1}} source={source} issue={null} busy={false} dirty={dirty} onPreview={setOperation} onDraftChange={()=>setOperation(null)}/></>;
}
function NativePatrolFixture(){
 const [dirty,setDirty]=useState(false),[revision,setRevision]=useState(0),[protectedGroup,setProtected]=useState(false),[operation,setOperation]=useState<unknown>(null);
 const source={points:[{sourceIndex:0,position:[1,2,3] as [number,number,number],facingRadians:0,weight:1,waitSeconds:[0,2] as [number,number],animation:7,sequenceId:-4},{sourceIndex:1,position:[4,2,3] as [number,number,number],facingRadians:.5,weight:2,waitSeconds:[1,3] as [number,number],animation:-1,sequenceId:0}]};
 const behavior={initialState:'moving_loop',returnState:'alert',patrolCount:2,starts:[]};
 const context={projectId:'patrol-fixture',buildId:'build',class:'scnr',tag:'level.scenario',tagSha256:(revision?'b':'a').repeat(64),protectedSquadEncounters:protectedGroup?['guards']:[],scenarioCombat:[{encounter:0,name:'guards',points:[],squads:[{index:0,name:'original',patrol:source,behavior,groups:{attacking:[],attackingSearch:[],attackingGuard:[],defending:[],defendingSearch:[],defendingGuard:[]}}]}]} as NativeTagContext;
 const [draft]=useMapState<NativeAiStartView|null>(context.projectId,NATIVE_AI_START_VIEW,()=>null);
 return <><button onClick={()=>setDirty(!dirty)}>Toggle project dirty</button><button onClick={()=>{setRevision(revision+1);setOperation(null);}}>Refresh source revision</button><button onClick={()=>{setProtected(!protectedGroup);setOperation(null);}}>Toggle source protection</button><output data-testid="patrol-source">{JSON.stringify(source)}</output><output data-testid="patrol-operation">{JSON.stringify(operation)}</output><output data-testid="patrol-draft">{JSON.stringify(draft)}</output><NativeSquadPatrol context={context} squadChoice={{encounter:0,squad:0,encounterName:'guards',name:'original',normalCount:1,insaneCount:1}} source={source} behavior={behavior} issue={protectedGroup?'Recipe-owned source retained':null} busy={false} dirty={dirty} onPreview={setOperation} onDraftChange={()=>setOperation(null)}/></>;
}
function NativeCameraFixture(){
 const [revision,setRevision]=useState(0),[dirty,setDirty]=useState(false),[operation,setOperation]=useState<unknown>(null);const context={projectId:'camera-fixture',buildId:'build',tag:'level.scenario',class:'scnr',tagSha256:(revision?'b':'a').repeat(64),scenarioCameras:[{index:0,name:'intro',position:[1,2,3],orientationRadians:[0,0,0],fovRadians:Math.PI/3}]} as NativeTagContext;
 return <><button onClick={()=>setRevision(v=>v+1)}>Refresh source revision</button><button onClick={()=>setDirty(v=>!v)}>Toggle project dirty</button><output data-testid="camera-operation">{JSON.stringify(operation)}</output><NativeCutsceneCameras context={context} busy={false} dirty={dirty} onPreview={setOperation} onDraftChange={()=>setOperation(null)} onLevelEditor={()=>{}}/></>;
}
function NativeVolumeFixture(){
 const [revision,setRevision]=useState(0),[dirty,setDirty]=useState(false),[operation,setOperation]=useState<unknown>(null);const context={projectId:'volume-fixture',buildId:'build',tag:'level.scenario',class:'scnr',tagSha256:(revision?'b':'a').repeat(64),scenarioVolumes:[{name:'intro_area',kind:1,geometry:{forward:[1,0,0],up:[0,0,1],corner:[0,0,0],dimensions:[4,6,8]}}]} as NativeTagContext;
 return <><button onClick={()=>setRevision(v=>v+1)}>Refresh source revision</button><button onClick={()=>setDirty(v=>!v)}>Toggle project dirty</button><output data-testid="volume-operation">{JSON.stringify(operation)}</output><NativeTriggerVolumes context={context} busy={false} dirty={dirty} onPreview={setOperation} onDraftChange={()=>setOperation(null)} onLevelEditor={()=>{}}/></>;
}
function NativeDeviceFixture(){
 const [dirty,setDirty]=useState(false),[revision,setRevision]=useState(0),[operation,setOperation]=useState<unknown>(null);const context={projectId:'device-fixture',buildId:'b',tag:'level.scenario',class:'scnr',tagSha256:(revision?'b':'a').repeat(64),scenarioDevices:[{class:'ctrl',index:0,nameIndex:0,name:'terminal',tagPath:'devices/terminal',position:[1,2,3],rotationRadians:[0,0,0]}]} as NativeTagContext;
 return <><button onClick={()=>setDirty(!dirty)}>Toggle project dirty</button><button onClick={()=>setRevision(n=>n+1)}>Refresh source revision</button><output data-testid="device-operation">{JSON.stringify(operation)}</output><NativeDevicePlacements context={context} busy={false} dirty={dirty} onPreview={setOperation} onDraftChange={()=>setOperation(null)} onLevelEditor={()=>{}}/></>;
}
function NativeCommandFixture(){
 const [dirty,setDirty]=useState(false),[revision,setRevision]=useState(0),[shared,setShared]=useState(false),[protectedList,setProtected]=useState(false),[operation,setOperation]=useState<unknown>(null);
 const context={projectId:'command-source-fixture',buildId:'build',tag:'level.scenario',class:'scnr',tagSha256:(revision?'b':'a').repeat(64),protectedCommandLists:protectedList?[0]:[],commandSourceIssue:shared?'Shared source editing is unavailable':null,commandSource:{atoms:['pause','go_to','loop'],referenceCounts:[0,0,0,1,1],lists:[{index:0,name:'patrol',flags:[false,false,false,false,false,false],bsp:-1,commands:[{atom:'go_to',modifier:0,parameters:[0,0],point1:0,point2:-1,animation:-1,script:-1,recording:-1,command:-1,objectName:-1},{atom:'loop',modifier:0,parameters:[0,0],point1:-1,point2:-1,animation:-1,script:-1,recording:-1,command:0,objectName:-1}],points:[[1,2,3],[4,5,6]]}]}} as NativeTagContext;
 context.commandSource!.lists.push({...structuredClone(context.commandSource!.lists[0]),index:1,name:'independent route'});
 return <><button onClick={()=>setDirty(!dirty)}>Toggle project dirty</button><button onClick={()=>setRevision(n=>n+1)}>Refresh source revision</button><button onClick={()=>setShared(!shared)}>Toggle shared source</button><button onClick={()=>setProtected(!protectedList)}>Toggle recipe-owned list</button><output data-testid="command-operation">{JSON.stringify(operation)}</output><NativeCommandLists context={context} busy={false} dirty={dirty} onPreview={setOperation} onDraftChange={()=>setOperation(null)}/></>;
}
createRoot(document.getElementById('root')!).render(location.search.startsWith('?native-command-source')?<NativeCommandFixture/>:location.search.startsWith('?native-device')?<NativeDeviceFixture/>:location.search.startsWith('?native-volume')?<NativeVolumeFixture/>:location.search.startsWith('?native-camera')?<NativeCameraFixture/>:location.search.startsWith('?native-patrol')?<NativePatrolFixture/>:location.search.startsWith('?native-behavior')?<NativeBehaviorFixture/>:location.search.startsWith('?native-ai')?<NativeAiDraftFixture/>:<Fixture/>);
