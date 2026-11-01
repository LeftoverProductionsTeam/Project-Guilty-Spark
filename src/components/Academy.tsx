import { lazy, Suspense, useEffect, useState } from 'react';
import { readMapSession, useMapState, writeMapSession } from '../mapSession';
import { BookOpen, CheckCircle2, ChevronRight, CircleHelp, Hammer, LockKeyhole, SquareArrowOutUpRight } from 'lucide-react';
import {call,native} from '../api';
import type { MapInspection, Project, Settings, Workspace } from '../types';
import { academyLessons, observedStep } from '../tutorialAcademy';
import { tutorialSourcesForLesson } from '../forumTutorials';
import type { LessonId } from '../tutorialAcademy';
import { HelpTip, Notice, PageTitle, Pill } from './ui';
const LegacyWorkflowLab=lazy(()=>import('./LegacyWorkflowLab'));
import '../academy.css';

/** Lessons are grounded in actual workspaces and observably saved project state.
 * Manual game verification cannot be self-awarded by clicking a checkbox.
 */
export default function Academy({project,inspection,settings,navigate,embedded=false}:{project:Project|null;inspection:MapInspection|null;settings?:Partial<Settings>|null;navigate:(target:Workspace)=>void;embedded?:boolean}){
  const [active,setActive]=useState<LessonId>(()=>{const requested=new URLSearchParams(location.search).get('lesson'),saved=readMapSession('global','learning.lesson','preservation');return academyLessons.some(item=>item.id===requested)?requested as LessonId:academyLessons.some(item=>item.id===saved)?saved as LessonId:'preservation';});
  useEffect(()=>writeMapSession('global','learning.lesson',active),[active]);
  const [legacyOpen,setLegacyOpen]=useMapState('global','learning.legacyOpen',false);
  const [legacyMounted,setLegacyMounted]=useState(legacyOpen);
  const [windowError,setWindowError]=useState('');
  const lesson=academyLessons.find(item=>item.id===active)!;
  const observable=lesson.steps.filter(step=>observedStep(step,project)!==null);
  const proven=observable.filter(step=>observedStep(step,project)===true);
  const popout=<button disabled={!native} onClick={()=>void call('open_workspace_window',{workspace:'academy',context:active}).catch(e=>setWindowError(String(e)))} title="Keep this lesson open in a resizable window on another monitor"><SquareArrowOutUpRight size={14}/>Pop out lesson</button>;
  return <div className={`${embedded?'':'analysis-page '}gs-academy`}>
    {embedded?<div className="learning-academy-toolbar"><strong>Hands-on lessons</strong>{popout}</div>:<PageTitle eyebrow="HALO MODDING ACADEMY / LEARN BY BUILDING" title="Learn the old magic. Understand the engine."
      description="Hands-on lessons with the steps, tools and engine concepts you need."
      actions={popout}/>}
    {windowError&&<Notice tone="error">{windowError}</Notice>}
    <details className="learning-evidence-note"><summary>How lesson progress is checked</summary><p>Academy uses the current project as evidence. A green source-state check is not proof that a mod compiles or runs in Halo. Unsupported operations remain clearly labeled rather than silently marked completed.</p></details>
    <details className="learning-classic-workflows" open={legacyOpen} onToggle={event=>{const open=event.currentTarget.open;if(open)setLegacyMounted(true);setLegacyOpen(open);}}><summary>Classic workflows &amp; companion tools</summary>{(legacyOpen||legacyMounted)&&<Suspense fallback={<p role="status">Loading classic workflows…</p>}><LegacyWorkflowLab project={project} inspection={inspection} settings={settings} navigate={navigate}/></Suspense>}</details>
    <div className="gs-academy-layout">
      <aside className="gs-academy-lessons" aria-label="Modding tutorial lessons">
        {academyLessons.map(item=>{
          const observed=item.steps.filter(step=>observedStep(step,project)!==null);
          const done=observed.filter(step=>observedStep(step,project)===true).length;
          return <button key={item.id} className={`gs-lesson-item ${active===item.id?'active':''}`}
            aria-current={active===item.id?'step':undefined} onClick={()=>setActive(item.id)} title={item.goal}>
            <span className="gs-lesson-heading"><BookOpen size={17}/><strong>{item.title}</strong></span>
            <small>{item.difficulty} · {done}/{observed.length} observable checkpoints</small>
          </button>;
        })}
      </aside>
      <section className="gs-academy-body" aria-live="polite">
        <div className="gs-lesson-intro"><Pill>{lesson.difficulty}</Pill><h2>{lesson.title}</h2><p>{lesson.goal}</p>
          <p className="subtle"><strong>Learning outcome:</strong> {lesson.outcome}</p>
          <p className="subtle">Project evidence: {proven.length}/{observable.length} observable checks. Remaining manual requirements are not counted.</p>
        </div>
        <ol className="gs-lesson-steps">
          {lesson.steps.map((step,index)=>{
            const state=observedStep(step,project);
            return <li key={step.id} className="gs-lesson-step">
              <div className="gs-lesson-step-heading"><span className="gs-step-index">{index+1}</span><h3>{step.title}</h3>
                <HelpTip help={step.why}/>
              </div>
              <p>{step.action}</p><details className="learning-step-reason"><summary>Why this matters</summary><p className="subtle">{step.why}</p></details>
              <div className="gs-step-footer">
                {step.availability==='manualGate' ? <><Pill tone="amber">Needs compiler / engine proof</Pill><span className="subtle"><LockKeyhole size={13}/> No automatic completion</span></>
                : state===true ? <Pill tone="green"><CheckCircle2 size={13}/> Saved source evidence</Pill>
                  : state===false ? <Pill>Not yet seen in project</Pill> : <Pill>Guided manual exercise</Pill>}
                <button className="small-button" onClick={()=>navigate(step.workspace)}
                  title={`Open ${step.workspace} to perform or inspect: ${step.title}. This does not mark it complete.`}>
                  <Hammer size={13}/> Open {step.workspace} <ChevronRight size={13}/>
                </button>
              </div>
            </li>;
          })}
        </ol>
        <details className="gs-lesson-source"><summary><BookOpen size={16}/> Original forum tutorials and credited authors</summary>
          <p>These links point to independently authored Halo modding tutorials indexed by CE3 and Halo Maps. Guilty Spark's interactive lesson is a separate, modern implementation—not a reproduction of anyone else's work. Historical links may be archived or unavailable.</p>
          {tutorialSourcesForLesson(active).map(source=><article className="gs-forum-source" key={source.id}>
            <strong>{source.title}</strong><span> by <strong>{source.author}</strong></span>
            <p className="subtle">{source.topic} · {source.source}</p>
            <a href={source.url} target="_blank" rel="noopener noreferrer" title={`Read the archival tutorial listing crediting ${source.author}`}>Open author-attributed source</a>
          </article>)}
          {tutorialSourcesForLesson(active).length===0&&<p>Visit the historical tutorial indexes below for further reading; this lesson has no specifically matched credited article yet.</p>}
          <p><a href="https://haloce3.com/tutorial-index/" target="_blank" rel="noreferrer">CE3's named tutorial authors</a> · <a href="https://www.halomaps.org/hce/detail.cfm?fid=1535" target="_blank" rel="noreferrer">2005 Halo Wiki community tutorial archive</a></p>
        </details>
        <details className="gs-lesson-source"><summary><CircleHelp size={16}/> Where this workflow came from</summary>
          <p>The legacy Halo Editing Kit follows source geometry (.jms) → Tool structure BSP → Guerilla/Sapien scenario and tags → lightmaps/build → in-game testing. Guilty Spark's goal is to make those stages understandable and eventually integrated without concealing engine limitations.</p>
          <p><button className="small-button" title="Open reference-linked credits and locally saved nominations" onClick={()=>navigate('community')}>Visit Community Thanks</button></p>
          <p><a href="https://www.reclaimers.net/h1/h1-ek/" target="_blank" rel="noreferrer">Reclaimers: Halo 1 Editing Kit</a> · <a href="https://nikon.bungie.org/misc/hek_tutorial/references/general/dev_tools_overview.html" target="_blank" rel="noreferrer">Bungie-era HEK development tools</a></p>
        </details>
      </section>
    </div>
  </div>;
}
