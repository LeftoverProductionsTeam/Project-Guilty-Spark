import type { Workspace } from './types';
import {WORKBENCH_GUIDES} from './workbenchGuide';
export type LearningSection = 'guides' | 'glossary' | 'academy';
export interface WorkflowRoute {
  workspace: Workspace;
  projectId: string | null;
  settingsTab: 'tools' | 'dependencies' | 'interface' | 'storage';
  learningSection?: LearningSection;
  /** Source-bound view metadata only; never project edits or native byte patches. */
  place?: {sourceSha256:string|null;values:Record<string,unknown>};
}
export interface WorkflowHistory {
  current: WorkflowRoute;
  back: WorkflowRoute[];
  forward: WorkflowRoute[];
}
const LIMIT = 200;
const same = (a: WorkflowRoute, b: WorkflowRoute) =>
  a.workspace === b.workspace &&
  a.projectId === b.projectId &&
  a.settingsTab === b.settingsTab &&
  (a.workspace !== 'learning' || (a.learningSection ?? 'guides') === (b.learningSection ?? 'guides'));
function lastAvailable(stack: WorkflowRoute[], available: (route: WorkflowRoute) => boolean) {
  for (let i = stack.length - 1; i >= 0; i--) if (available(stack[i])) return i;
  return -1;
}
export const startWorkflow = (route: WorkflowRoute): WorkflowHistory => ({
  current: { ...route },
  back: [],
  forward: [],
});
/** Only locations belong here. Project edits and their undo stacks stay in MapDocuments. */
export function visitWorkflow(
  history: WorkflowHistory,
  route: WorkflowRoute,
  mapContextVisible: boolean,
): WorkflowHistory {
  if (same(history.current, route)) return history;
  const visibleChange =
    history.current.workspace !== route.workspace ||
    (route.workspace === 'learning' && history.current.learningSection !== route.learningSection) ||
    (mapContextVisible && history.current.projectId !== route.projectId) ||
    (route.workspace === 'settings' && history.current.settingsTab !== route.settingsTab);
  if (!visibleChange) return { ...history, current: { ...route } };
  return { current: { ...route }, back: [...history.back.slice(-(LIMIT - 1)), history.current], forward: [] };
}
export function workflowTarget(
  history: WorkflowHistory,
  direction: 'back' | 'forward',
  available: (route: WorkflowRoute) => boolean,
): WorkflowRoute | null {
  const at = lastAvailable(history[direction], available);
  return at < 0 ? null : history[direction][at];
}
export function travelWorkflow(
  history: WorkflowHistory,
  direction: 'back' | 'forward',
  available: (route: WorkflowRoute) => boolean,
): WorkflowHistory {
  const stack = history[direction],
    at = lastAvailable(stack, available);
  if (at < 0) return history;
  const opposite = direction === 'back' ? 'forward' : 'back';
  return {
    ...history,
    current: stack[at],
    [direction]: stack.slice(0, at),
    [opposite]: [...history[opposite].slice(-(LIMIT - 1)), history.current],
  };
}
/** A bounded, deduplicated view onto the existing history, not a second stack. */
export function recentWorkflow(history:WorkflowHistory):WorkflowRoute[]{
  const recent:WorkflowRoute[]=[];
  for(const route of [...history.back].reverse().concat(history.forward)){
    if(same(route,history.current)||recent.some(prior=>same(prior,route)))continue;
    recent.push(route);if(recent.length===24)break;
  }
  return recent;
}
function checkedRoute(value:unknown):WorkflowRoute|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const r=value as Record<string,unknown>;
  if(typeof r.workspace!=='string'||!Object.hasOwn(WORKBENCH_GUIDES,r.workspace)||!(r.projectId===null||typeof r.projectId==='string'&&/^[\w-]{1,80}$/.test(r.projectId))||!['tools','dependencies','interface','storage'].includes(String(r.settingsTab)))return null;
  const route:WorkflowRoute={workspace:r.workspace as Workspace,projectId:r.projectId as string|null,settingsTab:r.settingsTab as WorkflowRoute['settingsTab']};
  if(['guides','glossary','academy'].includes(String(r.learningSection)))route.learningSection=r.learningSection as LearningSection;
  if(r.place&&typeof r.place==='object'){
    const place=r.place as Record<string,unknown>;
    if((place.sourceSha256===null||typeof place.sourceSha256==='string'&&/^[a-f0-9]{64}$/i.test(place.sourceSha256))&&place.values&&typeof place.values==='object'&&!Array.isArray(place.values)&&JSON.stringify(place.values).length<8192)route.place={sourceSha256:place.sourceSha256 as string|null,values:place.values as Record<string,unknown>};
  }
  return route;
}
/** Resume navigation metadata only. Documents still require native admission. */
export function restoreWorkflowSnapshot(value:unknown,route:WorkflowRoute):WorkflowHistory {
  const fallback=startWorkflow(route);
  if(!value||typeof value!=='object'||JSON.stringify(value).length>131072)return fallback;
  const saved=value as Record<string,unknown>;
  if(saved.version!==1||!Array.isArray(saved.recent))return fallback;
  const recent=saved.recent.slice(0,24).map(checkedRoute).filter((r):r is WorkflowRoute=>!!r&&!same(r,route));
  return {...fallback,back:recent.reverse()};
}
export function workflowSnapshot(history:WorkflowHistory){
  const values=[history.current,...recentWorkflow(history)].slice(0,24).map((route,index)=>index<8?route:{...route,place:undefined});
  const recent:WorkflowRoute[]=[];let size=0;
  for(const value of values){const safe=checkedRoute(value);if(!safe)continue;const bytes=JSON.stringify(safe).length;if(size+bytes>120000)break;recent.push(safe);size+=bytes;}
  return {version:1,recent};
}
