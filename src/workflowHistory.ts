import type { Workspace } from './types';
export interface WorkflowRoute {
  workspace: Workspace;
  projectId: string | null;
  settingsTab: 'tools' | 'dependencies';
}
export interface WorkflowHistory {
  current: WorkflowRoute;
  back: WorkflowRoute[];
  forward: WorkflowRoute[];
}
const LIMIT = 200;
const same = (a: WorkflowRoute, b: WorkflowRoute) =>
  a.workspace === b.workspace && a.projectId === b.projectId && a.settingsTab === b.settingsTab;
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
