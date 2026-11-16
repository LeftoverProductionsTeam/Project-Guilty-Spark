import assert from 'node:assert/strict';
import { inspectScenarioBindings } from '../src/scenarioBindings.ts';
const exports=[{dependencies:['ai_encounter:test/grunts','ai_encounter:test/elites','trigger_volume:entrance','cutscene_camera_point:wide','ai_encounter:missing'],generatedOnly:true}];
const inspected={encounters:[{name:'test',squads:['grunts']} ]};
let results=inspectScenarioBindings(exports,inspected);
assert.deepEqual(results.map(r=>r.status),['presentInImportedCache','absentInImportedCache','notInspectable','notInspectable','absentInImportedCache']);
assert.ok(results[0].detail.includes('editable scenario'));
results=inspectScenarioBindings(exports,null);
assert.equal(results.length,5);assert.ok(results.every(r=>r.status==='notInspectable'));
results=inspectScenarioBindings([{dependencies:['ai_encounter:test/grunts','ai_encounter:test/grunts']}],inspected);
assert.equal(results.length,1);
console.log('PASS: preview dependency evidence, squad validation, duplicate suppression, no compiled-game claims');

const cameras=[{dependencies:['cutscene_camera_point:gs_cs_001','cutscene_camera_point:missing']}];
results=inspectScenarioBindings(cameras,null,{gameMode:'campaign',native:null},['gs_cs_001']);
assert.deepEqual(results.map(row=>row.status),['presentInAuthoringSource','absentInAuthoringSource']);assert.match(results[0].detail,/Planned native camera/);
assert.equal(inspectScenarioBindings(cameras,null,{gameMode:'campaign',native:null},['gs_cs_001','gs_cs_001'])[0].status,'absentInAuthoringSource');
assert.equal(inspectScenarioBindings(cameras,null,{gameMode:'campaign',native:{source:{}}},['gs_cs_001'])[0].status,'notInspectable');
console.log('PASS: exact planned camera identities; missing, ambiguous and imported source never gain native admission');

const nativeVolumes=[{name:'entrance'},{name:'ambiguous'},{name:'ambiguous'}];
const volumeScripts=[{dependencies:['trigger_volume:entrance','trigger_volume:missing','trigger_volume:ambiguous']}];
results=inspectScenarioBindings(volumeScripts,inspected,undefined,[],nativeVolumes);
assert.deepEqual(results.map(row=>row.status),['presentInNativeSource','absentInNativeSource','absentInNativeSource']);assert.match(results[0].detail,/compilation.*separate/);assert.match(results[2].detail,/ambiguous/);
assert.equal(inspectScenarioBindings(volumeScripts,null,undefined,[],nativeVolumes)[0].status,'presentInNativeSource');
assert.equal(inspectScenarioBindings(volumeScripts,inspected)[0].status,'notInspectable');
assert.equal(inspectScenarioBindings(volumeScripts,null,{gameMode:'campaign',native:{source:{}}},[],nativeVolumes)[0].status,'presentInNativeSource');
assert.equal(inspectScenarioBindings(volumeScripts,null,{gameMode:'campaign',logic:{triggers:[{nativeName:'entrance'}]}},[],[])[0].status,'presentInAuthoringSource');
console.log('PASS: native source areas remain distinct from imported cache and authored volume evidence; missing/ambiguous names refused');

const controlScripts=[{dependencies:['device_control:terminal','device_control:missing']}];
assert.deepEqual(inspectScenarioBindings(controlScripts,null,undefined,[],undefined,[{class:'ctrl',name:'terminal'}]).map(row=>row.status),['presentInNativeSource','absentInNativeSource']);
assert.equal(inspectScenarioBindings(controlScripts,null,undefined,[],undefined,[{class:'mach',name:'terminal'}])[0].status,'absentInNativeSource');
assert.equal(inspectScenarioBindings(controlScripts,null,undefined,[],undefined,[{class:'ctrl',name:'terminal'},{class:'ctrl',name:'terminal'}])[0].status,'absentInNativeSource');
