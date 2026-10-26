import assert from 'node:assert/strict';
import {makeCompilerTriageReport} from '../src/haloCompilerTriage.ts';
import {analyzeHaloToolLog} from '../src/haloToolDiagnostics.ts';
import {parseHaloWrl} from '../src/haloWrl.ts';
const hash='A'.repeat(64), nextHash='b'.repeat(64);
const source={sameDocument:true,ready:true,blockers:[],warnings:['local, private: C:\\secret\\map'],
  triangles:12,meshIntegrity:{tJunctionScanComplete:false}};
const toolLog=analyzeHaloToolLog([
  '### ERROR edge is open C:\\private\\client\\cache.map',
  '### Warning found nearly coplanar surfaces',
  '### ERROR unexpected future compiler stage C:\\secret',
].join('\n'));
const wrl=parseHaloWrl('#VRML 1.0 ascii\nSeparator { Coordinate3 { point [0 0 0,100 0 0] } IndexedLineSet { coordIndex [0,1,-1] } }');
const association={sampledPrimitives:1,totalPrimitives:1,ambiguousPrimitives:0,unmatchedPrimitives:0,
  candidates:[{brushId:'C:\\do_not_export\\brush-name',diagnosticSamples:1,closestDistance:0}],note:'secret'};
const args={sourceSha256:hash,preflight:source,toolLog,toolLogLoadedSourceHash:hash.toLowerCase(),
  wrl,wrlLoadedSourceHash:hash,brushAssociation:association};
const evidence=makeCompilerTriageReport(args);
assert.equal(evidence.sourceSha256,hash.toLowerCase());
assert.equal(evidence.status,'compiler-errors-observed');
assert.equal(evidence.source.tJunctionScanComplete,false);
assert.equal(evidence.toolLog.codes.find(x=>x.code==='OPEN_EDGE').errors,1);
assert.equal(evidence.toolLog.unclassifiedMessages,1);
assert.equal(evidence.wrl.errorEdges,1);
assert.equal(evidence.wrl.candidateBrushes,1);
for(const key of ['toolExecutionVerified','compiledBspVerified','collisionVerified','portalsVerified','gameplayVerified'])assert.equal(evidence[key],false);
const text=JSON.stringify(evidence);
assert(!text.includes('C:\\')&&!text.includes('private')&&!text.includes('cache.map')&&!text.includes('do_not_export'));
assert(!text.includes('point')&&!text.includes('secret'));
assert.throws(()=>makeCompilerTriageReport({...args,toolLogLoadedSourceHash:nextHash}),/reimport it/);
assert.throws(()=>makeCompilerTriageReport({...args,wrlLoadedSourceHash:nextHash}),/reimport it/);
assert.throws(()=>makeCompilerTriageReport({...args,preflight:{...source,sameDocument:false}}),/current QuickForge/);
assert.throws(()=>makeCompilerTriageReport({...args,toolLog:null,wrl:null}),/Import a current/);
assert.throws(()=>makeCompilerTriageReport({...args,sourceSha256:'bad'}),/SHA-256/);
assert.throws(()=>makeCompilerTriageReport({...args,brushAssociation:{...association,ambiguousPrimitives:2}}),/Malformed WRL/);
const blocked=makeCompilerTriageReport({...args,preflight:{...source,blockers:['private redacted text'],ready:false}});
assert.equal(blocked.status,'source-export-blocked');
assert.equal(blocked.source.blockers,1);
assert(!JSON.stringify(blocked).includes('redacted text'));
const noError=makeCompilerTriageReport({...args,toolLog:analyzeHaloToolLog('All tasks seem done'),wrl:null,brushAssociation:null});
assert.equal(noError.status,'diagnostics-need-review');
assert.equal(noError.toolExecutionVerified,false);
assert.match(noError.nextActions.join(' '),/No failure was proven/);
const wrlOnly=makeCompilerTriageReport({...args,toolLog:null,wrl,brushAssociation:null});
assert.equal(wrlOnly.toolLog.imported,false);
assert.equal(wrlOnly.wrl.errorEdges,1);
assert.equal(wrlOnly.sourceIdentity,'user-asserted-not-cryptographically-linked-to-tool-job');
console.log('PASS: source-stale refusal, bounded local compiler triage, path-free serialization and no false build/play certification');
