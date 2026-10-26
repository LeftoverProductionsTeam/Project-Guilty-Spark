import assert from 'node:assert/strict';
import {STARTER_PATHS,WORKSPACE_TOOLTIPS,starterEvidence} from '../src/firstRun.ts';
const targets=new Set();
for(const p of STARTER_PATHS){assert.ok(p.steps.length>=4);for(const step of p.steps){assert.ok(step.target in WORKSPACE_TOOLTIPS);assert.ok(step.why.length>=25);targets.add(step.target);}}
assert.ok(targets.has('quickforge')&&targets.has('runtimes')&&targets.has('creator'));
const data={settings:{hekDirectory:null,invaderDirectory:null}};
assert.ok(starterEvidence('convert',null,data)[0].includes('No editing-kit'));
assert.ok(starterEvidence('inspect',{source:{sha256:'abc'}},data)[0].includes('selected'));
console.log(`PASS: ${STARTER_PATHS.length} real onboarding pathways with contextual tooltip and provenance gates`);
