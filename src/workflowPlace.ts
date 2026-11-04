import type {Project} from './types';
import type {WorkflowRoute} from './workflowHistory';
import {readMapSession,writeMapSession} from './mapSession';

const keys=['tags.selection','tags.focus','tags.query','tags.filter','tags.classes','world.selection','world.surface-selection','world.mode','world.bsp','world.view','world.ortho','world.fly','forge.selection','forge.sourceSurface','forge.tab','forge.bspWorkshop','forge.mode','bsp.selection','bsp.tool','bsp.maximized','creator-studio-pane',
  ...['world','forge','machinima'].flatMap(channel=>['PerspectiveCamera','OrthographicCamera'].map(type=>`camera.${channel}.${type}`)),
  ...['top','front','side','perspective'].map(view=>`bsp.view.${view}`),
  ...['level','tags','assets','creator','machinima','build','preservation'].map(workspace=>`scroll.${workspace}`)];
export function captureWorkflowPlace(route:WorkflowRoute,project:Project|null|undefined):WorkflowRoute {
  if(!project||project.id!==route.projectId)return route;
  const values:Record<string,unknown>={};
  for(const key of keys){const value=readMapSession<unknown>(project.id,key,undefined);if(value!==undefined&&JSON.stringify(value).length<4096)values[key]=value;}
  if(JSON.stringify(values).length>32768)return route;
  return {...route,place:{sourceSha256:project.source?.sha256??null,values}};
}
export function restoreWorkflowPlace(route:WorkflowRoute,project:Project|null|undefined):boolean {
  if(!route.place)return true;
  if(!project||project.id!==route.projectId||route.place.sourceSha256!==(project.source?.sha256??null)||JSON.stringify(route.place.values).length>32768)return false;
  for(const [key,value] of Object.entries(route.place.values))if(keys.includes(key)&&JSON.stringify(value).length<4096)writeMapSession(project.id,key,value);
  return true;
}
