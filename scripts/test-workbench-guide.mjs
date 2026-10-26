import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {describeWorkbench,WORKBENCH_GUIDES} from '../src/workbenchGuide.ts';
import {WORKSPACE_TOOLTIPS} from '../src/firstRun.ts';

const zero={desktop:false,project:false,source:false,inspectedSource:false,forge:false,toolFolder:false,unsaved:false,runningJob:false};
assert.deepEqual(Object.keys(WORKBENCH_GUIDES).sort(),Object.keys(WORKSPACE_TOOLTIPS).sort(),
  'Every existing workspace, including footer-only workspaces, has grounded contextual guidance');
for(const [id,guide] of Object.entries(WORKBENCH_GUIDES)){
  assert.ok(guide.can.length>=40 && guide.cannot.length>=45 && guide.tip.length>=35,`Unhelpful guide for ${id}`);
  assert.ok(guide.can !== guide.cannot && guide.tip!==guide.can,`Repeated guide content in ${id}`);
  assert.ok(guide.followUp in WORKBENCH_GUIDES,`Unknown guide navigation for ${id}`);
  for(const evidence of [zero,{...zero,desktop:true,project:true,source:true,inspectedSource:true,forge:true,toolFolder:true,unsaved:true,runningJob:true}]) {
    const result=describeWorkbench(id,evidence);
    assert.ok(result.target in WORKBENCH_GUIDES,`Unsafe navigation target for ${id}`);
    assert.ok(result.sourceReminder.includes('PLAYABLE HALO MAP'),`Missing game-proof boundary for ${id}`);
  }
}
const source=describeWorkbench('tags',{...zero,project:true,source:true,inspectedSource:false});
assert.equal(source.status,'Source inspection pending');
assert.equal(source.target,'library');
assert.equal(describeWorkbench('tags',{...zero,project:true,source:true,inspectedSource:true}).status,'Source inspection matched');
assert.equal(describeWorkbench('world',zero).status,'Select a project');
assert.equal(describeWorkbench('build',zero).target,'library');
assert.equal(describeWorkbench('build',{...zero,project:true}).status,'No Halo source to compile');
assert.equal(describeWorkbench('build',{...zero,project:true,source:true}).target,'settings');
assert.equal(describeWorkbench('build',{...zero,project:true,source:true,toolFolder:true}).status,'Tool folder recorded');
assert.equal(describeWorkbench('quickforge',zero).target,'academy');
assert.ok(describeWorkbench('build',{...zero,project:true,source:true,toolFolder:true,runningJob:true}).explanation.includes('still running'));
assert.ok(describeWorkbench('tags',{...zero,project:true,source:true,inspectedSource:true,unsaved:true}).explanation.includes('unsaved'));
assert.ok(describeWorkbench('tags',{...zero,project:true,source:true,inspectedSource:true}).explanation.includes('Browser preview'));
for(const id of ['library','map-finder','academy','community','interface']){
  assert.equal(describeWorkbench(id,zero).status,'Workspace available');
}
const app=readFileSync('src/App.tsx','utf8');
assert.ok(app.includes('<WorkbenchGuide key={workspace}') && app.includes('data.settings.hekDirectory'));
assert.ok(app.includes('inspection.sha256.toLowerCase()===current.source.sha256.toLowerCase()'));
assert.ok(app.includes('keywords:`${WORKBENCH_GUIDES[id].can}'));
const ui=readFileSync('src/components/ui.tsx','utf8');
for (const token of ['onMouseEnter','onMouseLeave','onFocus','onBlur','aria-describedby={visible ? id : undefined}',"event.key === 'Escape'","event.stopPropagation()"])
  assert.ok(ui.includes(token),`Tooltip misses ${token}`);
const view=readFileSync('src/components/WorkbenchGuide.tsx','utf8');
for(const token of ['aria-expanded={expanded}','aria-controls={panelId}','Available here','Not yet proven','Old-school tip','onNavigate(guide.target)','onNavigate(\'academy\')'])
  assert.ok(view.includes(token),`Field Guide UI misses ${token}`);
const css=readFileSync('src/styles.css','utf8');
assert.ok(css.includes('.gs-workbench-guide')&&css.includes('.gs-help-wrapper.is-visible .gs-help-bubble'));
const finder=readFileSync('src/components/WorkspaceFinder.tsx','utf8');
assert.ok(finder.includes('Math.max(0,results.length-1)')&&finder.includes('aria-live="polite"')&&finder.includes('activeIndex'));
console.log('C31 field-guide evidence gates, 19 workspace contexts, focus/Escape tooltips and safe navigation passed');
