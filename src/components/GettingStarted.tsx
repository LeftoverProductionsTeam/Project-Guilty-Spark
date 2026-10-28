import { useState } from 'react';
import { ArrowRight, BookOpen, Boxes, CircleHelp, Compass, Globe2, ShieldCheck, Users } from 'lucide-react';
import type { Bootstrap, Project, Settings, Workspace } from '../types';
import StartupSetup from './StartupSetup';
import { STARTER_PATHS, starterEvidence } from '../firstRun';
import type { StarterId } from '../firstRun';
import { Notice, PageTitle, Pill } from './ui';
import '../onboarding.css';
export default function GettingStarted({data,project,navigate,onApply}:{data:Bootstrap;project:Project|null;navigate:(target:Workspace)=>void;onApply:(s:Settings)=>Promise<void>}){
  const [selected,setSelected]=useState<StarterId>('inspect');
  const path=STARTER_PATHS.find(p=>p.id===selected)!;
  return <div className="analysis-page gs-get-started">
    <PageTitle eyebrow="WELCOME / GUILTY SPARK" title="Make a Halo world. Know what the engine needs."
      description="A single workbench for preserved maps, editable source geometry, tag references, scripted scenarios and runtime-specific tooling. Pick a goal and follow real, explained steps." />
    <StartupSetup data={data} onApply={onApply} navigate={navigate}/>
    <button onClick={()=>navigate('features')}>Explore Spark features &amp; workflows</button>
    <details className="gs-project-paths" open={!!data.settings.onboardingCompleted}><summary>Project ideas &amp; guided paths</summary>
    <div className="gs-starter-picker" role="group" aria-label="Choose your first project goal">{STARTER_PATHS.map(p=><button key={p.id} className={selected===p.id?'gs-starter-selected':''} onClick={()=>setSelected(p.id)} title={p.description} aria-pressed={selected===p.id}>
      <strong>{p.title}</strong><small>{p.level}</small></button>)}</div>
    <section className="analysis-card gs-starter-content"><div className="section-heading"><h2>{path.title}</h2><Pill>{path.level}</Pill></div><p>{path.description}</p>
      <div className="gs-evidence"><ShieldCheck size={17}/><span>{starterEvidence(selected,project,data).join(' · ')}</span></div>
      <ol className="gs-starter-steps">{path.steps.map((step,i)=><li key={step.id}>
        <div><span className="gs-step-index">{i+1}</span><strong>{step.label}</strong>{step.needsDesktop&&<Pill>Desktop action</Pill>}</div>
        <p><CircleHelp size={14}/>{step.why}</p>
        <button className="small-button" onClick={()=>navigate(step.target)} title={`Open ${step.target}; this action never asserts that ${step.label.toLowerCase()} is completed`}>Open {step.target} <ArrowRight size={14}/></button>
      </li>)}</ol></section>
    <div className="gs-welcome-links">
      <button onClick={()=>navigate('map-finder')} title="Find HaloMods, HaloMaps and HaloMD archive pages, then import a locally downloaded map"><Globe2 size={17}/> Find community maps</button>
      <button onClick={()=>navigate('academy')} title="Hands-on lessons explain each button and the Halo concepts behind it"><BookOpen size={17}/> Open Modding Academy</button>
      <button onClick={()=>navigate('runtimes')} title="View engine-specific tool compatibility and discover installed editing tools"><Boxes size={17}/> Choose compatible tools</button>
      <button onClick={()=>navigate('community')} title="Read the thank-you page for two decades of modding community contributions"><Users size={17}/> Thank the community</button>
      <button onClick={()=>navigate('library')} title="Open your safe, locally preserved source map library"><Compass size={17}/> Skip tour to Map Library</button>
    </div></details>
  </div>;
}
