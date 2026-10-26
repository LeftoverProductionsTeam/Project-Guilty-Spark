import assert from 'node:assert/strict';
import {createTagExchangeBundle} from '../src/haloExchange.ts';
import {reviewTagMigration,exportTagMigrationReview} from '../src/tagMigrationReview.ts';
const sha=(t)=>t.repeat(64);
const sourceHash=sha('a'),targetHash=sha('b');
const tag=(id,cls,path,refs=[])=>({id,index:id,class:cls,path,external:false,fields:[],references:refs,dataOffset:0});
const ref=(targetId,cls,label='link')=>({targetId,class:cls,label,offset:32});
const sourceTags=[
 tag(1,'weap','weapons\\pistol',[ref(2,'proj'),ref(3,'bitm'),ref(4,'snd!'),ref(5,'shdr'),ref(99,'actr')]),
 tag(2,'proj','projectiles\\bolt'),tag(3,'bitm','textures\\markings'),tag(4,'snd!','sounds\\blip'),tag(5,'shdr','shaders\\gray'),
];
const sourceOpen={project:{source:{sha256:sourceHash}},inspection:{sha256:sourceHash,header:{version:7,engine:'Halo CE'},scenarioPath:'levels\\test\\arena',tags:sourceTags}};
const bundle=createTagExchangeBundle(sourceOpen,[1,2]);
assert.equal(bundle.tags.length,2);
// Source shows an unknown target (unindexed reference) and a manually reclassified target path conflict.
const targetTags=[tag(24,'weap','weapons/pistol'),tag(28,'proj','projectiles/bolt'),tag(66,'soso','textures/markings')];
const destination={source:{sha256:targetHash,cacheVersion:7,engine:'Halo CE'},tagEdits:[]};
const inspected={sha256:targetHash,header:{version:7,engine:'Halo CE'},tags:targetTags};
const report=reviewTagMigration(JSON.stringify(bundle),{...destination},inspected);
assert.equal(report.compatibility,'same-engine-and-cache-version');
assert.equal(report.sameCache,false);
assert.deepEqual(report.counts.selected,{'identity-present':2,'not-present':0,'class-conflict':0});
assert.deepEqual(report.counts.dependencies,{
 'present-in-target':1,'in-selected-source':0,'missing-from-target':2,
 'class-conflict':1,'unknown-source-path':1,'inconsistent-source-reference':0,
});
assert.equal(report.counts.dependencyReferencesScanned,5);
assert.equal(report.limitations.tagBytesTransferred,false);
assert.equal(report.limitations.safeToOverwriteDestination,false);
const json=exportTagMigrationReview(report);
assert.equal(JSON.parse(json).format,'guilty-spark-tag-migration-preview/v1');
for(const x of ['weapons/pistol','projectiles/bolt','sounds/blip','textures/markings','levels\\test','C:\\Users'])
 assert.equal(json.includes(x),false,`report leaks source path ${x}`);
assert.match(json,/no automatic import is authorized/i);
// A separate source tree may contain a referenced tag selected for extraction but missing in destination.
const onlyWeapon={...bundle,tags:[bundle.tags[0],{...bundle.tags[1],path:'shaders\\gray',class:'shdr',id:5}]};
const included=reviewTagMigration(JSON.stringify(onlyWeapon),destination,inspected);
assert.equal(included.counts.dependencies['in-selected-source'],1);
// Collision on selected identity path when target class differs.
const conflictingTarget={...inspected,tags:[tag(10,'soso','weapons\\pistol')]};
const collision=reviewTagMigration(JSON.stringify(bundle),destination,conflictingTarget);
assert.equal(collision.counts.selected['class-conflict'],1);
// Datum IDs in destination have no meaning relative to the source.
const swapped={...inspected,tags:[tag(1,'proj','projectiles\\bolt'),tag(2,'weap','weapons\\pistol')]};
const noDatumUse=reviewTagMigration(JSON.stringify(bundle),destination,swapped);
assert.equal(noDatumUse.counts.selected['identity-present'],2);
// Never claim compatibility when known cache version or engine differ.
const diff=reviewTagMigration(JSON.stringify(bundle),{...destination,source:{...destination.source,cacheVersion:13}},{...inspected,header:{version:13,engine:'MCC H1A'}});
assert.equal(diff.compatibility,'incompatible-or-unconfirmed');
assert(diff.cautions.some(c=>/never automatically transplant/i.test(c)));
// Same hash is self-comparison, not migration proof.
const self=reviewTagMigration(JSON.stringify(bundle),{...destination,source:{sha256:sourceHash,cacheVersion:7}},
 {...inspected,sha256:sourceHash});
assert.equal(self.sameCache,true);
// SHA mismatch blocks comparison; duplicate datum/identity ambiguity blocks false clean reports.
assert.throws(()=>reviewTagMigration(JSON.stringify(bundle),destination,{...inspected,sha256:sourceHash}),/source\/cache version/);
assert.throws(()=>reviewTagMigration(JSON.stringify(bundle),destination,{...inspected,tags:[...targetTags,tag(24,'weap','other')] }),/ambiguous/);
assert.throws(()=>reviewTagMigration(JSON.stringify(bundle),destination,{...inspected,tags:[...targetTags,tag(17,'weap','WEAPONS\\PISTOL')] }),/ambiguous/);
const inconsistent=JSON.parse(JSON.stringify(bundle));
inconsistent.tags[0].dependencies[0].path='projectiles\\wrong';
const flagged=reviewTagMigration(JSON.stringify(inconsistent),destination,inspected);
assert.equal(flagged.counts.dependencies['inconsistent-source-reference'],1);
// Cannot fake successful compilation or import in exported report.
assert.throws(()=>exportTagMigrationReview({...report,limitations:{...report.limitations,safeToOverwriteDestination:true}}),/read-only/);
// Untyped and malicious classes, impossible reference IDs and path traversal are rejected by the existing bounded parser.
const hostile=JSON.parse(JSON.stringify(bundle));hostile.tags[0].dependencies[0].path='../windows/system.ini';
assert.throws(()=>reviewTagMigration(JSON.stringify(hostile),destination,inspected),/Unsafe dependency/);
const rogue=JSON.parse(JSON.stringify(bundle));rogue.tags[0].dependencies[0].class='?????';
assert.throws(()=>reviewTagMigration(JSON.stringify(rogue),destination,inspected),/Unsafe dependency/);
const stale=JSON.parse(JSON.stringify(bundle));stale.tags[0].dependencies[0].targetId=-1;
assert.throws(()=>reviewTagMigration(JSON.stringify(stale),destination,inspected),/Unsafe dependency/);
// 256 is the established bound per selected tag. Audit must declare display truncation, not show all 256 as clean.
const wide=JSON.parse(JSON.stringify(bundle));
wide.tags[0].dependencies=Array.from({length:256},(_,i)=>({label:'ref',class:'proj',path:`projectiles\\other${i}`,targetId:1000+i}));
const large=reviewTagMigration(JSON.stringify(wide),destination,inspected);
assert.equal(large.counts.dependencyReferencesScanned,256);
assert.equal(large.counts.displayedDependencyRows,96);
assert(large.cautions.some(x=>/first 96/.test(x)));
console.log('PASS: cross-map tag-migration review, class/path matches instead of datum IDs, missing/conflicting/unindexed dependencies, version guards, safe export');
