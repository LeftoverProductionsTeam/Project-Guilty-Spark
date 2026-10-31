import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterWorkspaceFinder} from '../src/workspaceFinder.ts';
const fixtures=[
  {id:'library',label:'Map library',help:'Preserve local maps'},
  {id:'map-finder',label:'Community maps',help:'HaloMods download archive browsing',keywords:'download classic map'},
  {id:'quickforge',label:'QuickForge',help:'BSP tunnels and collision source editing'},
  {id:'tags',label:'Tag editor',help:'Shader class and dependency browse'},
];
assert.deepEqual(filterWorkspaceFinder(fixtures,'maps').map(x=>x.id),['map-finder','library']);
assert.deepEqual(filterWorkspaceFinder(fixtures,'HaloMods').map(x=>x.id),['map-finder']);
assert.deepEqual(filterWorkspaceFinder(fixtures,'BSP collision').map(x=>x.id),['quickforge']);
assert.equal(filterWorkspaceFinder(fixtures,'absent').length,0);
assert.equal(filterWorkspaceFinder(fixtures,'  ').length,4);
assert.equal(filterWorkspaceFinder(fixtures,'',1).length,1);
assert.equal(filterWorkspaceFinder(fixtures,'',-1).length,0);
const app=readFileSync('src/App.tsx','utf8');
assert.ok(app.includes("e.key.toLowerCase() === 'k'"));
assert.ok(app.replace(/\s+/g,'').includes('<WorkspaceFinderitems={finderItems}'));
assert.ok(app.includes('setShowFinder(false)'));
assert.ok(app.includes("e.target.closest('input,textarea,[contenteditable=\"true\"]')"));
assert.ok(app.replace(/\s+/g,'').includes("['number','range'].includes(text.type)"),'numeric controls use project undo while text fields retain native undo');
const finder=readFileSync('src/components/WorkspaceFinder.tsx','utf8');
for(const frag of ['role="dialog"','aria-modal="true"','onKeyDown','ArrowDown','ArrowUp','Escape','onNavigate','onClose','Close workspace search','document.addEventListener(\'keydown\',onKey,true)'])assert.ok(finder.includes(frag),`Missing keyboard/accessibility element ${frag}`);
const ui=readFileSync('src/components/ui.tsx','utf8');
assert.ok(ui.includes('role="tooltip"'));
assert.ok(ui.includes('aria-describedby={visible ? id : undefined}'));
assert.ok(ui.includes("event.key === 'Escape'"));
assert.ok(ui.includes('type="button" className="gs-helptip"'));
const css=readFileSync('src/styles.css','utf8');
for(const frag of ['.gs-help-wrapper.is-visible .gs-help-bubble', '.gs-finder-backdrop','@media(prefers-reduced-motion:reduce)','.gs-map-source-grid'])assert.ok(css.includes(frag));
const academy=readFileSync('src/tutorialAcademy.ts','utf8');
assert.ok(academy.includes("id:'communityMaps'"));
assert.ok(academy.includes("'map-finder'"));
console.log('C30 keyboard navigation, accessible tooltips, Academy handoff and source-only UI contracts verified');
