import { useCallback, useEffect, useLayoutEffect, useReducer, useRef,useState } from 'react';
import { travelWorkflow, visitWorkflow, workflowTarget, recentWorkflow,restoreWorkflowSnapshot,workflowSnapshot } from './workflowHistory';
import {readMapSession,writeMapSession} from './mapSession';
import {native} from './api';
import {getCurrentWindow} from '@tauri-apps/api/window';
import type { WorkflowRoute } from './workflowHistory';
import type { Workspace } from './types';

export function useWorkflowHistory(
  route: WorkflowRoute,
  mapWorkspaces: Workspace[],
  restore: (route: WorkflowRoute) => void,
  available: (route: WorkflowRoute) => boolean,
  capture:(route:WorkflowRoute)=>WorkflowRoute=route=>route,
) {
  const session=`global:window:${native?getCurrentWindow().label:'browser'}`;
  const [initial]=useState(()=>restoreWorkflowSnapshot(readMapSession(session,'workflow.history',null),route));
  const history=useRef(initial);
  const
    latest = useRef({ restore, available, capture }),
    moving = useRef(false);
  latest.current = { restore, available, capture };
  const [revision, redraw] = useReducer((n) => n + 1, 0);
  useEffect(()=>writeMapSession(session,'workflow.history',workflowSnapshot(history.current)),[revision,session]);
  useLayoutEffect(() => {
    const before=history.current;
    const next = visitWorkflow(before, route, mapWorkspaces.includes(route.workspace));
    if (next !== history.current) {
      if(next.back.at(-1)===before.current)next.back[next.back.length-1]=latest.current.capture(before.current);
      history.current = next;
      redraw();
    }
  }, [route.workspace, route.projectId, route.settingsTab, route.learningSection, mapWorkspaces]);
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
      const current=latest.current.capture(history.current.current);
      const recorded=travelWorkflow({...history.current,current},direction,latest.current.available);
      history.current = recorded;
      latest.current.restore(recorded.current);
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
    recent:recentWorkflow(history.current),
    restore:(route:WorkflowRoute)=>{if(latest.current.available(route)){window.dispatchEvent(new Event('gs:save-viewport-context'));latest.current.restore(route);}},
    back: workflowTarget(history.current, 'back', available),
    forward: workflowTarget(history.current, 'forward', available),
    goBack: () => travel('back'),
    goForward: () => travel('forward'),
  };
}
