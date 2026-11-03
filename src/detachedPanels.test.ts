import {test,expect} from 'vitest';
import {canDetachPanel,requestedPanel} from './detachedPanels';

test('native drawer routes retain the source workspace and reject session controllers or injected queries',()=>{
  for(const panel of ['inspector','objects','asset-library','map-sounds','construction','navigation'])
    expect(requestedPanel(`?project=local&workspace=world&panel=${panel}`)).toBe(panel);
  for(const panel of ['director-keys','director-lens','engine-recording'])
    expect(requestedPanel(`?project=local&workspace=machinima&panel=${panel}`)).toBe(panel);
  expect(requestedPanel('?workspace=compare&panel=compare-info')).toBe('compare-info');
  expect(requestedPanel('?workspace=library&panel=help')).toBe('help');
  for(const panel of ['connection','sparklink','../inspector','inspector&project=other'])
    expect(canDetachPanel('world',panel,true)).toBe(false);
  expect(requestedPanel('?workspace=world&panel=inspector')).toBeNull();
  expect(requestedPanel('?workspace=tags&project=local&panel=object-tags&tag=1')).toBeNull();
  expect(requestedPanel('?workspace=world&project=local&panel=inspector','library')).toBeNull();
  expect(requestedPanel('?workspace=world&project=local&panel=inspector','quickforge')).toBe('inspector');
});
