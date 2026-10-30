import {useState} from 'react';
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
createRoot(document.getElementById('root')!).render(<Fixture/>);
