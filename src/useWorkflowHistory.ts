import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import { startWorkflow, travelWorkflow, visitWorkflow, workflowTarget } from './workflowHistory';
import type { WorkflowRoute } from './workflowHistory';
import type { Workspace } from './types';

export function useWorkflowHistory(
  route: WorkflowRoute,
  mapWorkspaces: Workspace[],
  restore: (route: WorkflowRoute) => void,
  available: (route: WorkflowRoute) => boolean,
) {
  const history = useRef(startWorkflow(route)),
    latest = useRef({ restore, available }),
    moving = useRef(false);
  latest.current = { restore, available };
  const [, redraw] = useReducer((n) => n + 1, 0);
  useLayoutEffect(() => {
    const next = visitWorkflow(history.current, route, mapWorkspaces.includes(route.workspace));
    if (next !== history.current) {
      history.current = next;
      redraw();
    }
  }, [route.workspace, route.projectId, route.settingsTab, mapWorkspaces]);
  const travel = useCallback((direction: 'back' | 'forward') => {
    if (moving.current || !workflowTarget(history.current, direction, latest.current.available)) return;
    // Commit a typed numeric/text field before selecting another retained document.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    moving.current = true;
    requestAnimationFrame(() => {
      moving.current = false;
      const next = travelWorkflow(history.current, direction, latest.current.available);
      if (next === history.current) return;
      window.dispatchEvent(new Event('gs:save-viewport-context'));
      history.current = next;
      latest.current.restore(next.current);
      redraw();
    });
  }, []);
  useEffect(() => {
    const modal = () =>
      [...document.querySelectorAll('[role="dialog"]')].some((el) => el.getClientRects().length > 0);
    const key = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || modal()) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      travel(event.key === 'ArrowLeft' ? 'back' : 'forward');
    };
    const pointer = (event: PointerEvent) => {
      if (![3, 4].includes(event.button) || modal()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      travel(event.button === 3 ? 'back' : 'forward');
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', pointer, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', pointer, true);
    };
  }, [travel]);
  return {
    back: workflowTarget(history.current, 'back', available),
    forward: workflowTarget(history.current, 'forward', available),
    goBack: () => travel('back'),
    goForward: () => travel('forward'),
  };
}
