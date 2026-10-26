import { useState } from 'react';
import { BookOpen, CheckCircle2, ChevronRight, CircleHelp, Hammer, LockKeyhole } from 'lucide-react';
import type { MapInspection, Project, Settings, Workspace } from '../types';
import { academyLessons, observedStep } from '../tutorialAcademy';
import { tutorialSourcesForLesson } from '../forumTutorials';
import type { LessonId } from '../tutorialAcademy';
import { HelpTip, Notice, PageTitle, Pill } from './ui';
import LegacyWorkflowLab from './LegacyWorkflowLab';
import '../academy.css';

/** Lessons are grounded in actual workspaces and observably saved project state.
 * Manual game verification cannot be self-awarded by clicking a checkbox.
 */
export default function Academy({project,inspection,settings,navigate}:{project:Project|null;inspection:MapInspection|null;settings?:Partial<Settings>|null;navigate:(target:Workspace)=>void}){
  const [active,setActive]=useState<LessonId>('preservation');
  const lesson=academyLessons.find(item=>item.id===active)!;
  const observable=lesson.steps.filter(step=>observedStep(step,project)!==null);
  const proven=observable.filter(step=>observedStep(step,project)===true);
  return <div className="analysis-page gs-academy">
    <PageTitle eyebrow="HALO MODDING ACADEMY / LEARN BY BUILDING" title="Learn the old magic. Understand the engine."
      description="Hands-on Halo 1 tutorials inspired by the classic HEK, Eschaton, SwordEdit and MacGamingMods community. Every step explains what it changes, why it matters and what still needs an actual game test."/>
    <Notice tone="info">Academy uses the current project as evidence. A green source-state check is not proof that a mod compiles or runs in Halo. Unsupported operations remain clearly labeled rather than silently marked completed.</Notice>
    <LegacyWorkflowLab project={project} inspection={inspection} settings={settings} navigate={navigate}/>
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
              <p>{step.action}</p><p className="subtle"><strong>Why this matters:</strong> {step.why}</p>
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
        <details className="gs-lesson-source" open><summary><BookOpen size={16}/> Original forum tutorials and credited authors</summary>
          <p>These links point to independently authored Halo modding tutorials indexed by CE3 and Halo Maps. Guilty Spark's interactive lesson is a separate, modern implementation—not a reproduction of anyone else's work. Historical links may be archived or unavailable.</p>
          {tutorialSourcesForLesson(active).map(source=><article className="gs-forum-source" key={source.id}>
            <strong>{source.title}</strong><span> by <strong>{source.author}</strong></span>
            <p className="subtle">{source.topic} · {source.source}</p>
            <a href={source.url} target="_blank" rel="noopener noreferrer" title={`Read the archival tutorial listing crediting ${source.author}`}>Open author-attributed source</a>
          </article>)}
          {tutorialSourcesForLesson(active).length===0&&<p>Visit the historical tutorial indexes below for further reading; this lesson has no specifically matched credited article yet.</p>}
          <p><a href="https://haloce3.com/tutorial-index/" target="_blank" rel="noreferrer">CE3's named tutorial authors</a> · <a href="https://www.halomaps.org/hce/detail.cfm?fid=1535" target="_blank" rel="noreferrer">2005 Halo Wiki community tutorial archive</a></p>
        </details>
        <details className="gs-lesson-source"><summary><CircleHelp size={16}/> Halo modding vocabulary / what the buttons mean</summary>
          <dl className="gs-academy-glossary">
            <dt>Map cache (.map)</dt><dd>A compiled, engine-versioned Halo level. Guilty Spark preserves originals; inspection is not permission to write arbitrary bytes.</dd>
            <dt>Tag / tag reference</dt><dd>A game object's settings and links. A cache's tag ID and path are references; actual editable .tag data has to be correctly extracted or authored with dependencies.</dd>
            <dt>BSP (Binary Space Partition)</dt><dd>Halo's compiled level structure. Your editable source mesh is geometry input, not proof of correct BSP partitions, collision, visibility, lightmaps or AI navigation.</dd>
            <dt>JMS source</dt><dd>Classic Halo model/world geometry handoff format. Tool compiles it into supported game tags; JMS alone cannot be loaded as a finished map.</dd>
            <dt>Right-mouse flight (RMB + WASD)</dt><dd>Hold the right mouse button over the map, move the mouse to aim, and use WASD to fly. R/F moves vertically, Shift boosts. Release RMB to stop flying; use left-click to select.</dd>
            <dt>XYZ transform gizmo</dt><dd>Select an object and use Move (W): red arrow = X, green arrow = Y, blue arrow = Z. E rotates; R scales only supported geometry. Dragging stages a source edit; it does not rewrite the original map.</dd>
            <dt>Halo netgame flags / usage IDs</dt><dd>Scenario markers control multiplayer objectives. Their usage_id means different things per type: CTF team (0/1), numbered Oddball spawn, ordered Race checkpoint or a King hill group. Do not treat every usage_id as a player team.</dd>
            <dt>Race vehicle and teleporter flags</dt><dd>Race vehicle markers (maximum 16) are separate from Race checkpoints. Teleport from/to markers share a channel/usage ID (0–15 in Guilty Spark); both ends must exist. The Race/teleport path lines are visual authoring guides only.</dd>
            <dt>King of the Hill boundary</dt><dd>One hill marker yields a 2×2-unit square; 3–8 markers sharing the same group ID define a convex boundary. Exactly two markers are invalid and can crash Halo. The translucent editor preview is not a compiled scoring volume.</dd>
            <dt>Pre-export source integrity</dt><dd>Wait for live geometry regeneration; invalid or out-of-date mesh arrays block JMS export. A green source status still does not certify successful Halo structure compilation or a sealed collision BSP.</dd>
            <dt>Grid Snap (G)</dt><dd>Move on a chosen coordinate interval; turn it off for free positioning.</dd>
            <dt>Mesh Snap (M)</dt><dd>Align compatible face, cave rim or terrain-border geometry. Only exact source seams can omit redundant caps/walls. This does not compile Halo collisions.</dd>
            <dt>Source collision / First person</dt><dd>Test the regenerated triangles immediately with local gravity/body collision. It is a debugging sandbox, not the running Halo engine.</dd>
            <dt>Shader tag vs bitmap</dt><dd>A shader controls how several bitmap textures and engine effects are combined. A bitmap may be the base color, detail, bump or transparent mask. Do not automatically use a bump/detail map as the base.</dd>
            <dt>Material Audit / exact primary bitmap</dt><dd>The cache reader validates the shader_environment base bitmap ID or shader_model diffuse bitmap ID against the same map's tag table. Status resolved means the reference is real, not that pixels or engine lighting were decoded. Export metadata to compare assets; invalid, missing or unsupported references are never guessed.</dd>
            <dt>BSP lightmap page</dt><dd>A compiled lightmap is baked illumination with a second UV coordinate channel. Page 0 of BSP 1 is NOT automatically the same image as page 0 of BSP 2; use bsp_0_page_0.png and bsp_1_page_0.png for explicit assignment. This viewer does not reproduce Halo radiosity fully.</dd>
            <dt>Environment sun / ambient / fog</dt><dd>QuickForge's saved editor environment and World Editor's temporary comparison affect only preview pixels. Sky tag handles atmospheric fog, indoor/outdoor ambient and directional radiosity; fog tags are for BSP fog planes. Neither workflow automatically patches or recompiles game tags.</dd>
            <dt>Legacy scenario safety</dt><dd>Before exporting, check overlapping player starts, conflicting origins of identical tag paths, absent bitmaps/sounds resources, and AI pressure. Most historic editor crashes can only be eliminated by validating real tags, engine collision, and multiplayer clients.</dd>
            <dt>Portal / PVS</dt><dd>Portals and the potentially visible set determine structural connections and what the engine draws. Carving a cave in an existing BSP requires recompilation, not just visual overlap.</dd>
            <dt>Halo Tool WRL error overlay</dt><dd>After Tool structure reports malformed level geometry, import its local Halo 1 WRL file in QuickForge's build diagnostics. Colored edges and faces show the error location. Frame WRL moves the editor camera; edits make old diagnostic geometry stale, so recompile and reload.</dd>
            <dt>BSP source topology review</dt><dd>QuickForge analyzes positions across separately shaded triangle vertices to flag boundary seams, non-manifold edges, face-winding conflicts, degenerate and duplicate faces, and independent shell candidates. Open edges warn, while known destructive geometry defects block source export. You can select an affected brush or export a SHA-linked, coordinate-free report; the analysis does not actually weld triangles or replace Tool structure, collision, portals, PVS or in-game proof.</dd>
            <dt>Tag Test / Build</dt><dd>Tag Test starts an installed development Halo runtime where supported. Build is a separate toolchain job; both require actual runtime testing before marking a feature playable.</dd>
          </dl>
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
