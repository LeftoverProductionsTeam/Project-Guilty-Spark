import assert from 'node:assert/strict';
import {academyLessons,observedStep} from '../src/tutorialAcademy.ts';
const ids=new Set();
for(const lesson of academyLessons){assert.ok(lesson.steps.length>=3);for(const step of lesson.steps){assert.ok(step.title&&step.action&&step.why&&step.workspace);assert.ok(!ids.has(`${lesson.id}.${step.id}`));ids.add(`${lesson.id}.${step.id}`);if(step.availability==='manualGate')assert.equal(observedStep(step,null),null);}}
const arena=academyLessons.find(l=>l.id==='arena');
assert.equal(observedStep(arena.steps[0],null),false);
assert.equal(observedStep(arena.steps[0],{quickForge:{geometry:[],spawns:[]}}),true);
assert.equal(observedStep(arena.steps[2],{quickForge:{geometry:[],spawns:[]}}),false);
assert.equal(observedStep(arena.steps[2],{quickForge:{geometry:[],spawns:[{},{}]}}),true);
const modes=academyLessons.find(l=>l.id==='gametypeObjectives');
const preset=modes.steps.find(x=>x.id==='preset');
assert(preset);
assert.equal(observedStep(preset,null),false);
assert.equal(observedStep(preset,{quickForge:{template:'emptyArena'}}),false);
assert.equal(observedStep(preset,{quickForge:{template:'guiltySparkTestArena'}}),true);
assert(modes.steps.some(x=>x.id==='planQA'&&x.evidence==='none'));
assert(academyLessons.find(l=>l.id==='lightmaps').steps.some(x=>x.id==='audit'));
console.log(`PASS: ${academyLessons.length} guided Halo 1 lesson paths, observable vs manual gates, unique steps`);
