import assert from 'node:assert/strict';
import {LEGACY_WORKFLOWS,planLegacyWorkflow,exportLegacyWorkflowPlan} from '../src/legacyWorkflowLab.ts';
const H='0123456789abcdef'.repeat(4),OTHER='f'.repeat(64);
const project={id:'private-id',title:'C:\\Users\\Pat\\source\\zombie.map',source:{sha256:H.toUpperCase(),cacheVersion:7,
 originalPath:'C:\\Users\\Pat\\Halo Demo\\bloodgulch.map',preservedPath:'/home/owner/game.map',engine:'Halo Demo'},
 provenance:{creator:'Unverified author',permissions:'Personal use - unverified',community:'',releaseYear:null,description:'',sourceUrl:''},
 quickForge:{geometry:[{id:'room-1',kind:'room'}]},studio:{},builds:[{status:'validated',output:'C:\\Users\\Pat\\maps\\evil.map'}]};
const inspection={sha256:H,tags:[{id:1,class:'bitm',path:'ui\\my_private_bitmap'},{id:2,class:'actv',path:'private\\ai'}],
 header:{engine:'Halo 1 PC'}};
const cfg={hekDirectory:'C:\\PRIVATE_HEK',invaderDirectory:null};
assert.equal(LEGACY_WORKFLOWS.length,7);
assert.equal(new Set(LEGACY_WORKFLOWS.map(w=>w.id)).size,7);
for(const w of LEGACY_WORKFLOWS){
  assert.match(w.reference,/^https:\/\//);
  assert.ok(w.required.length>1&&w.historicalTechnique&&w.modernWorkflow&&w.warning);
  const p=planLegacyWorkflow(w.id,project,inspection,cfg);
  assert.equal(p.workflow,w.id);
  assert.equal(p.source.sourceSha256,H);
  assert.equal(p.compiledBspVerified,false);
  assert.equal(p.collisionVerified,false);
  assert.equal(p.tagRoundTripVerified,false);
  assert.equal(p.gameRuntimeVerified,false);
  assert.equal(p.legacyEngineCompatibilityVerified,false);
  assert.ok(!p.checks.some(x=>x.kind==='in-game-verification'&&x.state==='observed'));
  assert.ok(!p.checks.some(x=>x.kind==='compiled-bsp'&&x.state==='observed'));
  const json=exportLegacyWorkflowPlan(w.id,project,inspection,cfg);
  assert.deepEqual(JSON.parse(json),p);
  for(const secret of ['C:\\Users','PRIVATE_HEK','/home/owner','ui\\my_private_bitmap','evil.map','private-id','Unverified author'])
    assert.ok(!json.includes(secret),`export leaked secret: ${secret}`);
  assert.ok(json.length<24_000);
}
const escha=planLegacyWorkflow('escha-tags',project,inspection,cfg);
assert(escha.checks.some(x=>x.kind==='matching-inspection'&&x.state==='observed'));
assert(escha.checks.some(x=>x.kind==='tool-configuration'&&x.state==='observed'));
assert(escha.source.formatNote.includes('provenance cannot be inferred'));
const zombie=planLegacyWorkflow('zombie-restoration',project,inspection,cfg);
assert(zombie.checks.some(x=>x.kind==='scenario-authorship'&&x.state==='observed'));
assert(zombie.checks.some(x=>x.kind==='creator-note'&&x.state==='observed'));
const mismatch=planLegacyWorkflow('hmt-assets',project,{...inspection,sha256:OTHER},cfg);
assert.equal(mismatch.source.inspectionMatchesSource,false);
assert.equal(mismatch.source.ownedBitmapReferences,0);
assert(mismatch.checks.some(x=>x.kind==='bitmap-index'&&x.state==='not-observed'));
const missing=planLegacyWorkflow('swordedit-placement',null,null,{});
assert.equal(missing.source.sourceSha256,null);
assert(missing.checks.some(x=>x.kind==='compiled-bsp'&&x.state==='manual-unverified'));
assert(missing.checks.some(x=>x.kind==='in-game-verification'&&x.state==='manual-unverified'));
assert.equal(missing.checks.find(x=>x.kind==='preserved-source')?.state,'not-observed');
const invalid=planLegacyWorkflow('halo-menu',{...project,source:{...project.source,sha256:'not-a-sha'}},inspection,cfg);
assert.equal(invalid.source.sourceSha256,null);
assert.equal(invalid.source.inspectionMatchesSource,false);
assert.throws(()=>planLegacyWorkflow('does-not-exist',project,inspection,cfg));
const forgedBuild={...project,builds:[{status:'success',message:'GAMEPLAY VERIFIED'}]};
assert.equal(planLegacyWorkflow('bsp-tunnels',forgedBuild,inspection,cfg).gameRuntimeVerified,false);
assert.equal(planLegacyWorkflow('bsp-tunnels',forgedBuild,inspection,cfg).compiledBspVerified,false);
console.log(`PASS: ${LEGACY_WORKFLOWS.length} historical workflows, source-hash identity, incomplete/mismatched provenance refusal, no paths or game bytes, no fake engine proof`);
