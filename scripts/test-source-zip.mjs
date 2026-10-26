import assert from 'node:assert/strict';
import { sourceZip } from '../src/sourceZip.ts';
import { exportHaloCeMission, scriptManifest } from '../src/haloScript.ts';
import { emptyCreatorStudio } from '../src/creatorStudio.ts';
const studio=emptyCreatorStudio();
studio.missions=[{id:'one',title:'First Contact',objective:'Test',trigger:'manual',encounterName:''}];
const script=exportHaloCeMission(studio);
const bundle=sourceZip([{name:script.filename,contents:script.content},{name:script.filename+'.manifest.json',contents:scriptManifest(script)}]);
assert.equal(new DataView(bundle.buffer).getUint32(0,true),0x04034b50);
assert.equal(new DataView(bundle.buffer).getUint32(bundle.length-22,true),0x06054b50);
assert.ok(bundle.length>script.content.length);
assert.throws(()=>sourceZip([{name:'../../bad.txt',contents:'hi'}]),/Unsafe/);
assert.throws(()=>sourceZip([{name:'A.txt',contents:'A'},{name:'a.txt',contents:'b'}]),/Duplicate/);
assert.throws(()=>sourceZip(Array.from({length:33},(_,i)=>({name:`x${i}.txt`,contents:'a'}))),/1-32/);
assert.deepEqual(sourceZip([{name:'x.txt',contents:'test'}]),sourceZip([{name:'x.txt',contents:'test'}]));
// Python or unzip -t performs a second, independent archive interoperability check.
console.log('PASS: deterministic safe source ZIP, bundled CE mission/dependencies, input limits');
