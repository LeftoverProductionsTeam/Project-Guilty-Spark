import { useId, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Info, ShieldCheck } from 'lucide-react';
import type { Workspace } from '../types';
import type { WorkbenchEvidence } from '../workbenchGuide';
import { describeWorkbench } from '../workbenchGuide';
import { HelpTip } from './ui';

/** Compact by default; all actions only navigate to existing workspaces. */
export default function WorkbenchGuide({workspace,evidence,onNavigate}:{
  workspace:Workspace;
  evidence:WorkbenchEvidence;
  onNavigate:(target:Workspace)=>void;
}) {
  const [expanded,setExpanded]=useState(false);
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
    {expanded && <div id={panelId} className="gs-guide-details">
      <div className="gs-guide-explainer" role="status"><Info size={16}/><span>{guide.explanation}</span></div>
      <div className="gs-guide-columns">
        <div><strong>Available here</strong><p>{guide.can}</p></div>
        <div><strong>Not yet proven</strong><p>{guide.cannot}</p></div>
        <div><strong>Old-school tip</strong><p>{guide.tip}</p></div>
      </div>
      <div className="gs-guide-actions"><span>{guide.sourceReminder}</span>
        <button type="button" onClick={()=>onNavigate(guide.target)}><ChevronRight size={14}/>{guide.action}</button>
        <button type="button" onClick={()=>onNavigate('academy')}><BookOpen size={14}/>Modding Academy</button>
      </div>
    </div>}
  </section>;
}
