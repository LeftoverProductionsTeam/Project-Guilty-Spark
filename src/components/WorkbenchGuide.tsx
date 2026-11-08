import { useId, useState, useEffect } from 'react';
import { useRevealWorkspacePanel } from './WorkspacePanels';
import { BookOpen, ChevronDown, ChevronRight, Info, ShieldCheck } from 'lucide-react';
import type { Workspace } from '../types';
import type { WorkbenchEvidence } from '../workbenchGuide';
import { describeWorkbench } from '../workbenchGuide';
import { HelpTip } from './ui';

const tour:readonly {workspace:Workspace;label:string;action:string}[]=[
 {workspace:'get-started',label:'Welcome',action:'Choose your Halo and connect an owned installation.'},
 {workspace:'settings',label:'Games & tools',action:'Choose your Halo card, then Runtime setup. Connect existing runtime folders or review a managed download. Tools lists compatible editors.'},
 {workspace:'library',label:'Map library',action:'Import a map or open a preserved project. File keeps Save and Save As together.'},
 {workspace:'world',label:'Level editor',action:'Use Tools → Asset library to drag an asset into the map. Select it to move, duplicate or edit. BSP Workshop edits authored geometry.'},
 {workspace:'tags',label:'Tag editor',action:'Expand a class, choose a tag, inspect its preview and edit supported properties. Dependencies follow the source map.'},
 {workspace:'assets',label:'Asset workshop',action:'Inspect or import supported geometry and sound. Native output needs its matching toolchain.'},
 {workspace:'quickforge',label:'QuickForge',action:'Drop a room, wall, ramp or stairs, select its faces and reshape it. Source edits need a native build.'},
 {workspace:'scenario',label:'AI & scenario',action:'Use real scenario placements, encounter names and native tags. Test behavior in Halo.'},
 {workspace:'compare',label:'Compare variants',action:'Choose before and after sources. Filter changes and inspect only the differences you need.'},
 {workspace:'build',label:'Build & playtest',action:'Review the target, resources and tools. Build a separate map, validate it, then launch the matching game.'},
 {workspace:'runtimes',label:'Online & collaboration',action:'Choose Host, Join or Collaborate. SparkLink shares source edits; it is separate from game networking.'},
 {workspace:'live',label:'Live game',action:'Connect only an exact supported running build. Source, compiled output and temporary game changes are separate.'},
 {workspace:'firefight',label:'Firefight',action:'Choose actual actors and configure the wave plan. Compile and play the round to verify combat and completion.'},
 {workspace:'creator',label:'Creator Studio',action:'Connect objectives and events to real scenario objects. Keep generated and handwritten native scripts intact.'},
 {workspace:'machinima',label:'Machinima',action:'Capture named camera keys, save the take and replay it. Detach the Director for a second monitor.'},
 {workspace:'preservation',label:'Preservation',action:'Record creator credits and original provenance. Snapshots and source hashes protect your working copy.'},
 {workspace:'learning',label:'Learning center',action:'Find task guides, glossary and Academy lessons. You can restart this walkthrough in Interface Studio.'},
];
/** Compact by default; all actions only navigate to existing workspaces. */
export default function WorkbenchGuide({workspace,evidence,onNavigate,walkthroughEnabled=false,onWalkthroughChange}:{
  walkthroughEnabled?:boolean;
  onWalkthroughChange?:(enabled:boolean)=>void;
  workspace:Workspace;
  evidence:WorkbenchEvidence;
  onNavigate:(target:Workspace)=>void;
}) {
  const [expanded,setExpanded]=useState(false);
  const reveal=useRevealWorkspacePanel();
  useEffect(()=>{if(walkthroughEnabled)reveal('help');},[walkthroughEnabled]);
  const index=tour.findIndex(step=>step.workspace===workspace),at=index<0?0:index,step=tour[at];
  const panelId=useId();
  const guide=describeWorkbench(workspace,evidence);
  return <section className={`gs-workbench-guide ${expanded?'expanded':''}`} aria-label={`Field guide for ${guide.title}`}>
    <div className="gs-guide-summary">
      <span className="gs-guide-glyph" aria-hidden="true"><ShieldCheck size={16}/></span>
      <div className="gs-guide-label"><small>WORKSPACE HELP</small><strong>{guide.title}</strong></div>
      <span className="gs-guide-evidence" title={guide.explanation}>{guide.status}</span>
      <HelpTip help={`${guide.tip} ${guide.cannot}`}/>
      <button type="button" className="gs-guide-toggle" aria-expanded={expanded} aria-controls={panelId}
        onClick={()=>setExpanded(value=>!value)}>
        {expanded?'Hide guide':'Why / what next'} <ChevronDown size={15} aria-hidden="true"/>
      </button>
    </div>
    {!walkthroughEnabled&&<button type="button" onClick={()=>{onWalkthroughChange?.(true);onNavigate('get-started');}}>Start walkthrough</button>}
    {walkthroughEnabled&&<div className="gs-walkthrough" aria-label="Workspace walkthrough">
      <strong>Walkthrough · {at+1} / {tour.length} · {step.label}</strong><p>{step.action}</p>
      <div><button onClick={()=>onNavigate('get-started')}>Restart walkthrough</button><button disabled={at===0} onClick={()=>onNavigate(tour[at-1].workspace)}>Previous step</button>{at<tour.length-1?<button onClick={()=>onNavigate(tour[at+1].workspace)}>Next: {tour[at+1].label}</button>:<button onClick={()=>onWalkthroughChange?.(false)}>Finish walkthrough</button>}<button onClick={()=>onWalkthroughChange?.(false)}>Turn off walkthrough</button></div>
    </div>}
    {expanded && <div id={panelId} className="gs-guide-details">
      <div className="gs-guide-explainer" role="status"><Info size={16}/><span>{guide.explanation}</span></div>
      <div className="gs-guide-columns">
        <div><strong>Available here</strong><p>{guide.can}</p></div>
        <div><strong>Not yet proven</strong><p>{guide.cannot}</p></div>
        <div><strong>Old-school tip</strong><p>{guide.tip}</p></div>
      </div>
      <div className="gs-guide-actions"><span>{guide.sourceReminder}</span>
        <button type="button" onClick={()=>onNavigate(guide.target)}><ChevronRight size={14}/>{guide.action}</button>
        <button type="button" onClick={()=>onNavigate('academy')}><BookOpen size={14}/>Academy lessons</button>
      </div>
    </div>}
  </section>;
}
