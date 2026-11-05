// Opt-in phase of the existing native lifecycle runner. Actual Blender and
// Halo tools operate only on a small, private creator-owned source fixture.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chooseTool} from '../tests/ui/helpers/navigation.ts';
const run=promisify(execFile),hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
export async function nativeGeometryRoundTrip({main,root,invoke,expect,report,step,invaderDirectory}){
  const blender=path.resolve(process.env.SPARK_GEOMETRY_BLENDER??''),tags=path.resolve(process.env.SPARK_GEOMETRY_TAGS??''),kit=path.resolve(process.env.SPARK_GEOMETRY_KIT??'');
  for(const file of [blender,path.join(tags,'globals/globals.globals'),path.join(kit,'tool.exe'),path.join(invaderDirectory,'invader-edit.exe')])if(!(await fs.stat(file)).isFile())throw Error('Missing selected DCC/native input: '+file);
  const fixtureFile=path.resolve('artifacts/qa/part2-native-structural-input/project.gsproject');
  const fixtureHash=await hash(fixtureFile),fixture=JSON.parse(await fs.readFile(fixtureFile,'utf8'));
  const boot=await invoke(main,'bootstrap');
  await invoke(main,'save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false,hekDirectory:kit,hekTagsDirectory:tags,hekFlavor:'h1aEk',invaderDirectory:path.resolve(invaderDirectory)}});
  const created=await invoke(main,'create_quickforge_project',{title:'C70 genuine Blender round trip',template:'smallIndoorArena',target:'mccSteam'});
  const project={...created.project,quickForge:structuredClone(fixture.quickForge)};
  // Reuse the accepted room geometry, not its foreign library's door binding.
  // This gate proves DCC scenery; the separate two-way door acceptance remains.
  project.quickForge.placements=[];project.quickForge.logic=null;
  project.quickForge.name=project.title;
  project.quickForge.materials.push({id:'dcc-model',name:'default',shaderPath:'levels/a10/shaders/obj-door small',color:[.3,.3,.3]});
  await invoke(main,'save_project',{project});
  const original=path.join(root,'creator-cube.obj');
  const vertices=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],quads=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
  let obj='# Creator-owned closed cube; no Halo content bundled\n'+vertices.map(v=>'v '+v.join(' ')).join('\n')+'\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\n';
  for(const [a,b,c,d]of quads)obj+=`f ${a+1}/1 ${b+1}/2 ${c+1}/3\nf ${a+1}/1 ${c+1}/3 ${d+1}/4\n`;
  await fs.writeFile(original,obj,{flag:'wx'});const originalHash=await hash(original);
  const imported=await invoke(main,'import_asset',{id:project.id,path:original});
  const originalAsset=imported.asset,assetHash=await hash(originalAsset.path);
  await main.reload();await chooseTool(main,'Map library');await main.locator(`.map-card[data-project-id="${project.id}"]`).click();await chooseTool(main,'Asset workshop');
  await expect(main.locator('.workshop-page')).toBeVisible();
  const handoff=main.getByRole('region',{name:'External geometry handoff',exact:true});
  await handoff.getByRole('button',{name:'Prepare Blender edit',exact:true}).click();
  await expect(handoff.getByLabel('Blender OBJ working file',{exact:true})).toBeVisible({timeout:20000});
  const working=await handoff.getByLabel('Blender OBJ working file',{exact:true}).inputValue();
  const baseline=working.replace(/working\.obj$/,'baseline.obj'),baselineHash=await hash(baseline);
  const script=path.join(root,'blender-edit.py');
  await fs.writeFile(script,`import bpy,sys,json\nfrom pathlib import Path\np=Path(sys.argv[sys.argv.index('--')+1])\nbpy.ops.object.select_all(action='SELECT')\nbpy.ops.object.delete(use_global=False)\nbpy.ops.wm.obj_import(filepath=str(p),forward_axis='Y',up_axis='Z')\nobjects=[o for o in bpy.context.scene.objects if o.type=='MESH']\nassert len(objects)==1\nmesh=objects[0].data\nbefore=[list(v.co) for v in mesh.vertices]\nfor vertex in mesh.vertices: vertex.co.x*=1.5\nmesh.update()\nbpy.ops.wm.obj_export(filepath=str(p),check_existing=False,forward_axis='Y',up_axis='Z',export_selected_objects=True,export_uv=True,export_normals=True,export_materials=False,export_triangulated_mesh=True)\nprint('SPARK_DCC_EDIT='+json.dumps({'version':bpy.app.version_string,'vertices':len(mesh.vertices),'triangles':sum(len(f.vertices)-2 for f in mesh.polygons),'maxXBefore':max(v[0] for v in before),'maxXAfter':max(v.co.x for v in mesh.vertices)}))\n`,{flag:'wx'});
  const toolHash=await hash(blender),edited=await run(blender,['--background','--factory-startup','--disable-autoexec','--python',script,'--',working],{windowsHide:true,timeout:90000,maxBuffer:1024*1024});
  await fs.writeFile(path.join(root,'blender-process.json'),JSON.stringify({executable:blender,sha256:toolHash,scriptSha256:await hash(script),exitCode:0,...edited},null,2));
  await expect(handoff.getByRole('status')).toContainText('External geometry save detected',{timeout:20000});
  const reviewedHash=await hash(working);expect(reviewedHash).not.toBe(baselineHash);
  const before=(await invoke(main,'open_project',{id:project.id})).project;
  await handoff.getByRole('button',{name:'Import reviewed geometry copy',exact:true}).click();
  await expect.poll(async()=>(await invoke(main,'open_project',{id:project.id})).project.assets.length).toBe(2);
  await main.keyboard.press('Control+s');
  await expect.poll(async()=>(await invoke(main,'open_project',{id:project.id})).project.scene.length).toBe(before.scene.length+1);
  const adopted=(await invoke(main,'open_project',{id:project.id})).project,newAsset=adopted.assets.find(a=>a.id!==originalAsset.id);
  expect(newAsset.sha256).toBe(reviewedHash);expect(newAsset.id).not.toBe(originalAsset.id);
  await main.keyboard.press('Control+z');await main.keyboard.press('Control+s');
  await expect.poll(async()=>(await invoke(main,'open_project',{id:project.id})).project.scene.length).toBe(before.scene.length);
  await main.keyboard.press('Control+y');await main.keyboard.press('Control+s');
  await expect.poll(async()=>(await invoke(main,'open_project',{id:project.id})).project.scene.filter(o=>o.assetId===newAsset.id).length).toBe(1);
  await main.reload();await chooseTool(main,'Map library');await main.locator(`.map-card[data-project-id="${project.id}"]`).click();await chooseTool(main,'Asset workshop');
  await expect(main.locator('.asset-list>button')).toHaveCount(2);
  expect(await hash(original)).toBe(originalHash);expect(await hash(originalAsset.path)).toBe(assetHash);expect(await hash(baseline)).toBe(baselineHash);
  step('Actual Blender edits a private OBJ; Spark detects, reviews and imports it, then author Undo/Redo/Save/reopen preserves both sources');
  const jobId=await invoke(main,'quickforge_build',{projectId:project.id});
  let build;await expect.poll(async()=>{
    const p=(await invoke(main,'open_project',{id:project.id})).project;build=p.builds.find(b=>b.id===jobId);
    const receipt=await invoke(main,'quickforge_build_report',{projectId:project.id});
    if(receipt?.jobId===jobId&&['blocked','failed'].includes(receipt.status))throw Error('Native DCC build rejected: '+receipt.blockers.join('; '));
    if(build&&build.status!=='validated')throw Error('Native DCC build failed: '+build.message);
    return !!build;
  },{timeout:180000}).toBe(true);
  const job=path.join(root,'library/jobs',jobId),modelSources=JSON.parse(await fs.readFile(path.join(job,'workspace/custom-model-sources.json'),'utf8'));
  const tool=name=>path.join(path.resolve(invaderDirectory),name+'.exe');
  const crc=await run(tool('invader-info'),['-T','crc32_mismatched',build.output],{windowsHide:true,timeout:30000});expect(crc.stdout.trim()).toBe('0');
  const independent=path.join(root,'independent-model-tags');await fs.mkdir(independent);
  const native=[];
  for(const model of modelSources){
    await run(tool('invader-extract'),['-r','-s',model.tag+'.scenery','-t',independent,build.output],{windowsHide:true,timeout:30000});
    const result=await run(tool('invader-edit'),['-t',independent,'-C','geometries',model.tag+'.gbxmodel'],{windowsHide:true,timeout:30000});expect(Number(result.stdout.trim())).toBeGreaterThan(0);
    const collision=await run(tool('invader-edit'),['-t',independent,'-C','nodes',model.tag+'.model_collision_geometry'],{windowsHide:true,timeout:30000});expect(Number(collision.stdout.trim())).toBeGreaterThan(0);
    native.push({tag:model.tag,sourceSha256:model.sourceSha256,bounds:model.bounds,triangles:model.triangles,renderGeometries:Number(result.stdout.trim()),collisionNodes:Number(collision.stdout.trim())});
  }
  const reopened=await invoke(main,'open_built_map',{projectId:project.id,buildId:jobId});
  expect(reopened.inspection.objects.filter(o=>o.kind==='Scenery').length).toBeGreaterThanOrEqual(2);
  if(process.env.SPARK_GEOMETRY_FIDELITY==='1'){
    const fidelity=JSON.parse(await fs.readFile(path.join(job,'output/custom-model-verification.json'),'utf8'));
    expect(fidelity).toHaveLength(2);
    for(const model of fidelity){expect(model.fidelity.windingPreserved).toBe(true);expect(model.fidelity.maxUvError).toBeLessThanOrEqual(.00005);expect(model.fidelity.minimumNormalDot).toBeGreaterThanOrEqual(.999);}
    await main.reload();await chooseTool(main,'Map library');await main.locator(`.map-card[data-project-id="${reopened.project.id}"]`).click();await chooseTool(main,'Tag editor');
    const target=reopened.inspection.tags.find(tag=>tag.class==='scen'&&tag.path.replaceAll('\\','/')===modelSources[1].tag);
    await main.getByRole('textbox',{name:'Search tags',exact:true}).fill(target.path);await main.getByRole('combobox',{name:'Filter tag class',exact:true}).selectOption('scen');await main.locator('.tag-row').click();
    const preview=main.getByRole('region',{name:'Actual model preview',exact:true}).locator('.native-model-preview');
    await expect(preview).toHaveAttribute('data-model-ready','true',{timeout:90000});
    await expect(preview).toHaveAttribute('data-model-first-frame','true',{timeout:90000});
    await expect(preview).toHaveAttribute('data-model-material-gaps','0');
    expect(Number(await preview.getAttribute('data-model-textures'))).toBeGreaterThan(0);
    expect(Number(await preview.getAttribute('data-model-reflections'))).toBeGreaterThan(0);
    await expect(preview).toHaveAttribute('data-model-triangles','12');
    await main.screenshot({path:path.join(root,'compiled-asset-preview.png')});
    report.assetFidelity={nativeReadback:fidelity,preview:await preview.evaluate(element=>({...element.dataset})),exactEngineAppearanceClaimed:false};
    step('Compiled imported asset renders in the actual Tag Inspector with source textures/reflection cube and zero material gaps; strict native fidelity is recorded');
  }
  expect(await hash(fixtureFile)).toBe(fixtureHash);expect(await hash(originalAsset.path)).toBe(assetHash);expect(await hash(baseline)).toBe(baselineHash);
  report.geometryRoundTrip={projectId:project.id,buildId:jobId,blenderSha256:toolHash,baselineSha256:baselineHash,editedSha256:reviewedHash,originalAssetSha256:assetHash,modelSources:native,output:build.output,outputSha256:build.sha256,crcMismatch:0,sourceProjectUnchanged:true,gameplayAccepted:false};
  step('DCC revised geometry compiles through actual H1A model/collision/scenery and map tools; independent Invader/native cache readback passes');
}
