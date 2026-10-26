import assert from 'node:assert/strict';
import {matchWrlToSourceBrushes} from '../src/haloWrlSourceMatch.ts';

const mesh={
  positions:[0,0,0,1,0,0,0,1,0, 10,0,0,11,0,0,10,1,0],
  indices:[0,1,2,3,4,5],
  parts:[{brushId:'alpha',materialId:'m',indexStart:0,indexCount:3},
         {brushId:'beta',materialId:'m',indexStart:3,indexCount:3}],
};
const seg=(a,b)=>({start:a,end:b,color:[1,0,0],region:0});
const face=(a,b,c)=>({a,b,c,color:[1,0,0],region:0});
let review=matchWrlToSourceBrushes(mesh,{segments:[seg([.25,.25,0],[.75,.25,0])],faces:[face([10.1,.1,0],[10.4,.1,0],[10.1,.4,0])]});
assert.equal(review.sampledPrimitives,2);
assert.equal(review.ambiguousPrimitives,0);
assert.equal(review.unmatchedPrimitives,0);
assert.deepEqual(review.candidates.map(c=>c.brushId).sort(),['alpha','beta']);
assert(review.candidates.every(c=>c.diagnosticSamples===1));
assert.equal(review.candidates[0].closestDistance,0);
review=matchWrlToSourceBrushes(mesh,{segments:[seg([100,100,0],[101,100,0])],faces:[]});
assert.equal(review.candidates.length,0);assert.equal(review.unmatchedPrimitives,1);
const overlapping={...mesh,positions:[...mesh.positions.slice(0,9),...mesh.positions.slice(0,9)]};
review=matchWrlToSourceBrushes(overlapping,{segments:[seg([.25,.25,0],[.75,.25,0])],faces:[]});
assert.equal(review.candidates.length,0,'exactly overlapping brush AABBs must not guess identity');
assert.equal(review.ambiguousPrimitives,1);
assert.throws(()=>matchWrlToSourceBrushes({...mesh,indices:[0,1,999,3,4,5]},{segments:[seg([0,0,0],[1,0,0])],faces:[]}),/invalid or oversized/);
assert.throws(()=>matchWrlToSourceBrushes({...mesh,parts:[{brushId:'alpha',indexStart:0,indexCount:3}]},{segments:[seg([0,0,0],[1,0,0])],faces:[]}),/inventory/);
assert.throws(()=>matchWrlToSourceBrushes(mesh,{segments:[seg([Infinity,0,0],[1,0,0])],faces:[]}),/unsafe coordinate/);
const large=Array.from({length:1000},(_,i)=>seg([i%2?10.2:.2,.2,0],[i%2?10.4:.4,.2,0]));
review=matchWrlToSourceBrushes(mesh,{segments:large,faces:[]});
assert(review.sampledPrimitives<=192 && review.totalPrimitives===1000 && review.sampledPrimitives>=150);
assert(review.candidates.every(c=>c.diagnosticSamples<=192));
console.log('PASS: bounded WRL brush proximity, unique-vs-overlap attribution, malformed input refusal and sampling');
