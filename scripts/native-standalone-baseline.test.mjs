import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeTagPath,nextNativeDependencies} from './native-standalone-baseline.mjs';
test('native SDK baseline admits only archive-backed tag paths and rejects traversal/streams',()=>{
 for(const value of ['../globals.globals','levels/../a.scenario','C:/x.scenario','/x.scenario','a:stream.bitmap','x\n.scenario','a//b.sound','x'])assert.throws(()=>nativeTagPath(value));
 assert.equal(nativeTagPath('levels\\test\\bloodgulch\\bloodgulch.scenario'),'levels/test/bloodgulch/bloodgulch.scenario');
});
test('dependency waves preserve exact publisher archive spelling and never restage a visited cycle',()=>{
 const index=new Map([['tags/a.scenario','tags/A.scenario'],['tags/b.bitmap','tags/B.bitmap']]);
 assert.deepEqual(nextNativeDependencies(['A.scenario','a.scenario','b.bitmap'],index,new Set()),['tags/A.scenario','tags/B.bitmap']);
 assert.deepEqual(nextNativeDependencies(['a.scenario','b.bitmap'],index,new Set(['a.scenario','b.bitmap'])),[]);
 assert.throws(()=>nextNativeDependencies(['missing.sound'],index,new Set()),/absent/);
});

test('JIT missing markers require a real archive provider; broken staged bytes are never accepted',()=>{const index=new Map([['tags/a.sky','tags/a.sky']]);assert.deepEqual(nextNativeDependencies(['a.sky [BROKEN]'],index,new Set()),['tags/a.sky']);assert.throws(()=>nextNativeDependencies(['a.sky [BROKEN]'],index,new Set(['a.sky'])),/remains broken/);assert.throws(()=>nextNativeDependencies(['missing.sky [BROKEN]'],index,new Set()),/absent/);});

test('H1A mode bindings use only the exact same native path and never require a duplicate tag',()=>{const index=new Map([['tags/sky/clear.gbxmodel','tags/sky/clear.gbxmodel']]),bindings=new Map();assert.deepEqual(nextNativeDependencies(['sky/clear.model [BROKEN]'],index,new Set(),bindings),['tags/sky/clear.gbxmodel']);assert.equal(bindings.get('sky/clear.model'),'sky/clear.gbxmodel');assert.deepEqual(nextNativeDependencies(['sky/clear.model [BROKEN]'],index,new Set(['sky/clear.gbxmodel']),bindings),[]);assert.throws(()=>nextNativeDependencies(['other/clear.model [BROKEN]'],index,new Set()),/absent/);});
