import assert from 'node:assert/strict';
import {DEFAULT_ENVIRONMENT, environmentValue, validateEnvironment, toHex,fromHex,sunlightPosition,environmentHandoff,hasCustomEnvironment} from '../src/environment.ts';
const base=environmentValue();assert.deepEqual(base,DEFAULT_ENVIRONMENT);
base.fogColor[0]=0; assert.notDeepEqual(base.fogColor,DEFAULT_ENVIRONMENT.fogColor,'defaults must never be mutated');
assert.equal(toHex([1,.5,0]),'#ff8000');assert.deepEqual(fromHex('#0000ff'),[0,0,1]);
assert.throws(()=>fromHex('blue'));
const edited={...environmentValue(),fogEnabled:true,fogNear:10,fogFar:200,sunElevation:25};
validateEnvironment(edited);assert.equal(hasCustomEnvironment(edited),true);
assert.equal(sunlightPosition(edited).length,3);
for(const profile of [{...edited,fogNear:200},{...edited,fogFar:10}, {...edited,sunIntensity:-1}, {...edited,skyColor:[2,0,0]}, {...edited,ambientIntensity:NaN}, {...edited,fogEnabled:'yes'}]){
  assert.throws(()=>validateEnvironment(profile));
}
const out=JSON.parse(environmentHandoff(edited,'levels\\test\\sky'));
assert.equal(out.status,'AUTHORING_ONLY_NOT_COMPILED');assert.equal(out.haloSkyTag,'levels\\test\\sky');
assert.equal(out.environment.fogFar,200);
console.log('PASS: bounded editable environment profiles, default isolation, preview sun, authoring-only export');
