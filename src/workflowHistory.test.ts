import { describe, expect, it } from 'vitest';
import { startWorkflow, travelWorkflow, visitWorkflow, workflowTarget,restoreWorkflowSnapshot,workflowSnapshot } from './workflowHistory';
import type { WorkflowRoute } from './workflowHistory';
const route = (
  workspace: WorkflowRoute['workspace'],
  projectId: string | null = 'a',
  settingsTab: WorkflowRoute['settingsTab'] = 'tools',
): WorkflowRoute => ({ workspace, projectId, settingsTab });
describe('workflow location history stays separate from edit history', () => {
  it('restores bounded recent places without reopening maps or accepting unknown routes',()=>{
    let history=startWorkflow(route('tags','a'));history=visitWorkflow(history,route('assets','a'),true);history=visitWorkflow(history,route('creator','b'),true);
    const snapshot=workflowSnapshot(history),restored=restoreWorkflowSnapshot(snapshot,route('library',null));
    expect(restored.current.workspace).toBe('library');expect(restored.back.map(r=>r.workspace)).toEqual(['tags','assets','creator']);
    expect(restoreWorkflowSnapshot({version:1,recent:[{...route('tags'),workspace:'https://example.com'}]},route('library')).back).toEqual([]);
    expect(restoreWorkflowSnapshot({version:1,recent:Array(100).fill(route('tags'))},route('library')).back).toHaveLength(24);
  });
  it('returns to the exact learning section without recording background tab preferences as navigation',()=>{
    const guides:WorkflowRoute={...route('learning'),learningSection:'guides'};
    const glossary:WorkflowRoute={...guides,learningSection:'glossary'};
    let history=visitWorkflow(startWorkflow(guides),glossary,false);
    history=visitWorkflow(history,{...route('tags'),learningSection:'glossary'},true);
    history=travelWorkflow(history,'back',()=>true);expect(history.current).toEqual(glossary);
    history=travelWorkflow(history,'back',()=>true);expect(history.current).toEqual(guides);
    history=travelWorkflow(history,'forward',()=>true);expect(history.current).toEqual(glossary);
    const background=visitWorkflow(startWorkflow(route('library')),{...route('library'),learningSection:'academy'},false);
    expect(background.back).toHaveLength(0);
  });
  it('restores both maps, tools and settings tabs in both directions', () => {
    const a = route('tags'),
      b = route('tags', 'b'),
      settings = route('settings', 'b', 'dependencies');
    let history = visitWorkflow(visitWorkflow(startWorkflow(a), b, true), settings, false);
    history = travelWorkflow(history, 'back', () => true);
    expect(history.current).toEqual(b);
    history = travelWorkflow(history, 'back', () => true);
    expect(history.current).toEqual(a);
    history = travelWorkflow(history, 'forward', () => true);
    expect(history.current).toEqual(b);
    history = travelWorkflow(history, 'forward', () => true);
    expect(history.current).toEqual(settings);
    expect(visitWorkflow(history, settings, false)).toBe(history);
  });
  it('skips closed map views and clears forward only after a new visible navigation', () => {
    let history = visitWorkflow(
      visitWorkflow(startWorkflow(route('library', null)), route('tags', 'closed'), true),
      route('build', 'b'),
      true,
    );
    const available = (r: WorkflowRoute) => r.projectId !== 'closed';
    expect(workflowTarget(history, 'back', available)?.workspace).toBe('library');
    history = travelWorkflow(history, 'back', available);
    expect(history.current.workspace).toBe('library');
    history = visitWorkflow(history, route('library', 'b'), false);
    expect(history.forward).toHaveLength(1);
    history = visitWorkflow(history, route('academy', 'b'), false);
    expect(history.forward).toEqual([]);
  });
  it('bounds navigation without changing caller routes or adding duplicate visits', () => {
    const original = route('tags');
    let history = startWorkflow(original);
    for (let i = 0; i < 250; i++) history = visitWorkflow(history, route('tags', String(i)), true);
    expect(history.back).toHaveLength(200);
    expect(original).toEqual(route('tags'));
    const next = visitWorkflow(history, history.current, true);
    expect(next).toBe(history);
    expect(travelWorkflow(history, 'forward', () => true)).toBe(history);
  });
});
