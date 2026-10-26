/** Attributed references to actual historical tutorial writers, not rewritten
 * articles presented as their words. Source titles/author names are confirmed by
 * the CE3 index and Halomaps 2005 archive; linked pages remain external.
 */
import type { LessonId } from './tutorialAcademy';
export interface ForumTutorial {
 id:string; title:string; author:string; topic:string; source:string; url:string;
 lessons:LessonId[]; confidence:'indexedWithAuthor';
}
const CE3='https://haloce3.com/tutorial-index/';
const HALOMAPS='https://www.halomaps.org/hce/detail.cfm?fid=1535';
export const FORUM_TUTORIALS:readonly ForumTutorial[]=[
 {id:'popeak49',author:'PopeAK49',title:'Getting Started — Halo CE level creation',topic:'HEK, Sapien and Tool pipeline',source:'CE3 tutorial index (2015)',url:CE3,lessons:['arena','preservation','toolWorkbench'],confidence:'indexedWithAuthor'},
 {id:'higuy',author:'Higuy',title:"Higuy's Terrain Tutorial",topic:'Level terrain modeling',source:'CE3 tutorial index (2015)',url:CE3,lessons:['terrain','caves'],confidence:'indexedWithAuthor'},
 {id:'mattdratt-sp',author:'MattDratt',title:'Setting up a SinglePlayer Map and Scripts',topic:'Campaign & scripts',source:'CE3 tutorial index (2015)',url:CE3,lessons:['campaign','firefight'],confidence:'indexedWithAuthor'},
 {id:'mattdratt-ai',author:'MattDratt',title:'AI Following the Player',topic:'AI scripting',source:'CE3 tutorial index (2015)',url:CE3,lessons:['campaign','firefight'],confidence:'indexedWithAuthor'},
 {id:'jesse',author:'Jesse',title:'How to make a HUD',topic:'User interface design',source:'CE3 tutorial index (2015)',url:CE3,lessons:['preservation'],confidence:'indexedWithAuthor'},
 {id:'moses',author:'MosesofEgypt',title:'Proper LOD Creation',topic:'3D assets and model detail levels',source:'CE3 tutorial index (2015)',url:CE3,lessons:['assets'],confidence:'indexedWithAuthor'},
 {id:'evildave-edges',author:'EViLDaVE',title:'Fixing Open Edges & Other Tool Geometry Errors',topic:'BSP integrity and compiler diagnostics',source:'Halo Wiki tutorial collection archived by Halomaps (2005)',url:HALOMAPS,lessons:['toolDiagnostics','caves','arena','legacyIntegrity'],confidence:'indexedWithAuthor'},
 {id:'evildave-sky',author:'EViLDaVE',title:'Creating your own Sky Gearbox Models',topic:'Sky & visual atmosphere',source:'Halo Wiki tutorial collection archived by Halomaps (2005)',url:HALOMAPS,lessons:['environment','lightmaps'],confidence:'indexedWithAuthor'},
 {id:'supersunny-cptlag',author:'SuperSunny and CptLag',title:'Making Custom Sound Tags',topic:'Weapon/audio asset pipeline',source:'Halo Wiki tutorial collection archived by Halomaps (2005)',url:HALOMAPS,lessons:['assets','tags'],confidence:'indexedWithAuthor'},
 {id:'steelix',author:'Steelix B',title:'Creating sprite / sequence bitmap tags',topic:'Bitmaps and shaders',source:'Halo Wiki tutorial collection archived by Halomaps (2005)',url:HALOMAPS,lessons:['lightmaps','assets'],confidence:'indexedWithAuthor'},
 {id:'masterchief123',author:'MasterChief_123',title:'Wind in Sapien',topic:'Scenario environment settings',source:'Halo Wiki tutorial collection archived by Halomaps (2005)',url:HALOMAPS,lessons:['environment'],confidence:'indexedWithAuthor'},
 {id:'xzzy',author:'Xzzy',title:'Net Game Flags Placement',topic:'Multiplayer objectives and flags',source:'Halo Wiki tutorial collection archived by Halomaps (2005)',url:HALOMAPS,lessons:['multiplayer','multiplayerWorkshop','gametypeObjectives'],confidence:'indexedWithAuthor'},
 {id:'kirby',author:'Kirby_422',title:'Halo CE Scripting Tutorial',topic:'HaloScript research',source:'Halomaps Tutorials category',url:'https://halomaps.org/hce/index.cfm?sid=23&sort=-3',lessons:['campaign','firefight'],confidence:'indexedWithAuthor'},
];
export function tutorialSourcesForLesson(id:LessonId):ForumTutorial[] {return FORUM_TUTORIALS.filter(t=>t.lessons.includes(id));}
