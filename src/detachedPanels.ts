/** Only panels with a complete, reconstructable local workspace can detach.
 * Game controllers and SparkLink retain their existing session ownership. */
export function canDetachPanel(workspace:string,panel:string,hasProject:boolean):boolean {
  if (['help','source-changes'].includes(panel)) return true;
  if (panel==='compare-info') return workspace==='compare';
  if (!hasProject) return false;
  if (panel==='project-setup') return true;
  if (panel==='tag-relationships') return workspace==='tags';
  if (['engine-recording','director-keys','director-lens'].includes(panel)) return workspace==='machinima';
  return ['world','quickforge','live'].includes(workspace)&&[
    'navigation','construction','objects','object-tags','asset-library','map-sounds',
    'inspector','forge-palette','workshop-object','forge-inspector',
  ].includes(panel);
}
export function requestedPanel(search=location.search,activeWorkspace?:string):string|null {
  const query=new URLSearchParams(search),panel=query.get('panel'),workspace=query.get('workspace')??'world';
  const family=(value:string)=>['world','quickforge','live','level'].includes(value)?'level':value;
  if(activeWorkspace&&family(activeWorkspace)!==family(workspace))return null;
  // C43's selected-tag handoff opens the complete Tag editor, as before.
  if (panel==='object-tags'&&workspace==='tags') return null;
  return panel&&canDetachPanel(workspace,panel,query.has('project'))?panel:null;
}
