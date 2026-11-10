import {afterEach,describe,expect,it,vi} from 'vitest';
import {afterProjectMutation,beginProjectMutation,projectMutationPending} from './projectMutation';
afterEach(()=>vi.useRealTimers());
describe('Save boundaries around in-flight source changes',()=>{
 it('captures completed geometry and defaults once while leaving another project independent',async()=>{
  const releaseGeometry=beginProjectMutation('save-a'),releaseDefaults=beginProjectMutation('save-a',{history:false});
  let source={geometry:'before',shader:'pending'};const saved=afterProjectMutation('save-a',()=>source);
  const other={project:'b'};expect(await afterProjectMutation('save-b',()=>other)).toBe(other);
  expect(projectMutationPending('save-a')).toBe(true);
  source={...source,geometry:'after'};releaseGeometry();
  expect(projectMutationPending('save-a')).toBe(false);
  let captured=false;void saved.then(()=>{captured=true;});await Promise.resolve();expect(captured).toBe(false);
  source={...source,shader:'native-metal'};releaseDefaults();
  const snapshot=await saved;source={geometry:'later edit',shader:'custom'};
  expect(snapshot).toEqual({geometry:'after',shader:'native-metal'});expect(source.geometry).toBe('later edit');
 });
 it('freezes an idle Save at request time and does not wait for a subsequently started edit',async()=>{
  let source='at Save';const saved=afterProjectMutation('save-idle',()=>source);
  const release=beginProjectMutation('save-idle');source='later';expect(await saved).toBe('at Save');release();release();
  expect(projectMutationPending('save-idle')).toBe(false);
 });
 it('reports a stalled source transaction without cancelling it or capturing stale data',async()=>{
  vi.useFakeTimers();const release=beginProjectMutation('save-stalled');const capture=vi.fn(()=> 'stale');
  const saved=afterProjectMutation('save-stalled',capture,100);const refused=expect(saved).rejects.toThrow(/still pending/);
  await vi.advanceTimersByTimeAsync(101);await refused;expect(capture).not.toHaveBeenCalled();expect(projectMutationPending('save-stalled')).toBe(true);
  release();await Promise.resolve();expect(capture).not.toHaveBeenCalled();expect(projectMutationPending('save-stalled')).toBe(false);
 });
});
