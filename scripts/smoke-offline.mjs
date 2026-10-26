// Offline, dependency-free verification for source-only authoring/preview logic.
// Node 22+ --experimental-strip-types; no maps, network, filesystem writes or Halo install needed.
import assert from 'node:assert/strict';
import { emptyCreatorStudio, validateCreatorStudio, exportHaloCeServerInit, exportStudioEvidence } from '../src/creatorStudio.ts';
import { DEFAULT_INTERFACE, sanitizeInterfacePreferences } from '../src/interfacePreferences.ts';
import { hasRenderGeometry, resolveBspMesh, shaderForTriangle, shaderLegend } from '../src/renderView.ts';
import { createPreviewEvidence } from '../src/qaEvidence.ts';

const studio = emptyCreatorStudio();
assert.deepEqual(validateCreatorStudio(studio), []);
assert.equal(studio.server.publicListing, false);
studio.server.rotation.push({ id: 'testmap', map: 'bloodgulch', gameVariant: 'slayer' });
const config = exportHaloCeServerInit(studio);
assert.ok(config.includes('sv_mapcycle_add bloodgulch slayer'));
assert.ok(config.includes('sv_public 0'));
assert.ok(!config.includes('sv_rcon_password'));
studio.server.rotation[0].gameVariant = 'Team Slayer';
assert.ok(exportHaloCeServerInit(studio).includes('sv_mapcycle_add bloodgulch "Team Slayer"'));
studio.server.rotation[0].gameVariant = 'slayer; sv_public 1';
assert.ok(validateCreatorStudio(studio).length);
studio.server.rotation[0].gameVariant = 'slayer';
studio.server.rotation[0].gameVariant = 'slayer\nsv_public 1';
assert.ok(validateCreatorStudio(studio).length);
assert.throws(() => exportHaloCeServerInit(studio), /Unsafe/);
studio.server.rotation[0].gameVariant = 'slayer';
studio.server.runtime = 'mcc';
assert.throws(() => exportHaloCeServerInit(studio), /no verified/);
studio.server.runtime = 'haloCustomEdition';
studio.playtests.push({ id:'qa01', caseId:'QA-001', target:'Halo Custom Edition', verdict:'pass', performedAt:'', evidence:'', notes:'', manuallyReported:true });
assert.ok(validateCreatorStudio(studio).length);
studio.playtests[0].evidence = 'Recorded a genuine in-engine session.';
assert.deepEqual(validateCreatorStudio(studio), []);
const report = JSON.parse(exportStudioEvidence(studio, {id:'project',title:'Test World',source:null}, '2026-10-25T00:00:00Z'));
assert.equal(report.liveGameVerifiedAutomatically, false);
assert.equal(report.server.status, 'draftNotDeployed');

const preferences = sanitizeInterfacePreferences({schemaVersion:1,theme:'invalid',uiAudioEnabled:true,uiVolume:500,reducedMotion:false,cues:{}});
assert.equal(preferences.theme, DEFAULT_INTERFACE.theme);
assert.equal(preferences.uiVolume, 1);

const inspection = {
  sha256:'a'.repeat(64), header: {name:'bloodgulch',engine:'Halo PC',version:6},
  tags:[{id:42,class:'senv',path:'levels\\test\\rock'}],
  objects:[{kind:'Scenery',tagId:7},{kind:'Scenery',tagId:8}],
  renderMesh: {label:'BSP',source:'halo-render-untextured', positions:[0,0,0,1,0,0,0,1,0], indices:[0,1,2],
    parts:[{name:'BSP 1',indexStart:0,indexCount:3}],materialRanges:[{shaderTagId:42,bspIndex:0,lightmapIndex:0,indexStart:0,indexCount:3}]},
  mesh:{label:'Collision',source:'halo-collision',positions:[],indices:[]},
  modelMeshes:{'7':{positions:[],indices:[],label:'model',source:'halo-model-untextured'}},
  resources:[{name:'bitmaps.map',required:true,found:false,reason:'C:\\Users\\Pat\\private'}], diagnostics:[{code:'MISSING_ASSET',severity:'warning',message:'/Users/pat/private/game.map missing'}],
};
assert.ok(hasRenderGeometry(inspection));
assert.equal(resolveBspMesh(inspection,'materials',0)?.indices.length,3);
assert.equal(shaderForTriangle(inspection.renderMesh,0),42);
assert.equal(shaderLegend(inspection.renderMesh)[0].triangles,1);
const preview = JSON.parse(createPreviewEvidence(inspection,'2026-10-25T00:00:00Z'));
assert.equal(preview.viewport.render.triangles,1);
assert.equal(preview.acceptance.verifiedInGame,false);
assert.equal(preview.acceptance.sourceIntegrityIndependentlyRechecked,false);
assert.equal(preview.acceptance.generatorWritesSourceData,false);
assert.ok(!JSON.stringify(preview).includes('/Users/pat/'));
assert.ok(!JSON.stringify(preview).includes('Users\\\\Pat'));
console.log('PASS: Creator Studio validation, CE server safety, QA truthfulness, UI preferences and real-geometry-only preview logic (24 checks).');
