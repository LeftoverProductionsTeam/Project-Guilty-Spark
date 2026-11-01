// Opt-in: installed BSP Atlas UI, real map decoding and bounded cache readback.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,expect as assertion} from '@playwright/test';
const expect=assertion.configure({timeout:90000});
const [app,destination,mapsDirectory]=process.argv.slice(2);
if(!app||!destination||!mapsDirectory)throw Error('test-inspection-cache-native <Spark.exe> <fresh output> <owned maps directory>');
const output=path.resolve(destination);await fs.mkdir(output);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const files=[];
for(const item of await fs.readdir(mapsDirectory,{withFileTypes:true})){
  if(item.isSymbolicLink())throw Error('Map directory contains a symbolic link');
  if(item.isFile()&&/\.map$/i.test(item.name)&&!['bitmaps.map','sounds.map','loc.map','ui.map'].includes(item.name.toLowerCase())){
    const file=path.resolve(mapsDirectory,item.name);files.push({file,bytes:(await fs.stat(file)).size});
  }
}
files.sort((a,b)=>a.bytes-b.bytes||a.file.localeCompare(b.file));
if(files.length<10)throw Error('Choose an owned directory with at least ten scenario maps');
const selected=files.slice(0,10);
const report={schemaVersion:1,mockedIpc:false,complete:false,maps:[],appSha256:sha(await fs.readFile(app)),errors:[]};
const exe=path.join(output,'Spark-cache-acceptance.exe');await fs.copyFile(app,exe,fs.constants.COPYFILE_EXCL);
const endpoint=net.createServer();await new Promise(r=>endpoint.listen(0,'127.0.0.1',r));const port=endpoint.address().port;await new Promise(r=>endpoint.close(r));
const child=spawn(exe,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:path.join(output,'library'),WEBVIEW2_USER_DATA_FOLDER:path.join(output,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
let browser,page;
const fingerprint=i=>sha(JSON.stringify({sha256:i.sha256,tags:i.tags,objects:i.objects,mesh:i.mesh,renderMesh:i.renderMesh,modelMeshes:i.modelMeshes,decals:i.decals}));
try{
  await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);await expect.poll(()=>{page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('tauri.localhost'));return !!page;}).toBe(true);
  const call=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  const boot=await call('bootstrap');await call('save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false}});
  await expect(page.getByRole('button',{name:'Pop out workspace',exact:true})).toBeVisible();
  const workshop=await call('create_quickforge_project',{title:'C43 Atlas and cache acceptance',template:'customBlank',target:'haloCustomEdition'});
  await page.reload();await page.locator('.map-card').filter({has:page.getByRole('heading',{name:workshop.project.title,exact:true})}).click();
  await page.getByRole('button',{name:'BSP Workshop',exact:true}).click();
  await page.getByRole('button',{name:'Two rooms + corridor + ramp',exact:true}).click();
  const atlasPanel=page.locator('.megaworld-atlas');await atlasPanel.locator(':scope > summary').click();
  const atlasAt=performance.now();await atlasPanel.getByRole('button',{name:'Scan installed maps',exact:true}).click();
  await expect(atlasPanel.getByRole('button',{name:'Rescan installed maps',exact:true})).toBeEnabled({timeout:180000});
  const atlas=JSON.parse(await fs.readFile(path.join(output,'library/megaworld-atlas.json'),'utf8'));
  expect(atlas.regions.length).toBeGreaterThan(0);expect(atlas.caches.filter(c=>c.error)).toEqual([]);
  const shown=Math.min(12,atlas.regions.length);await expect(atlasPanel.getByRole('listitem')).toHaveCount(shown);
  await atlasPanel.getByRole('listitem').first().click();await expect(atlasPanel.getByText('Bounds XYZ',{exact:true})).toBeVisible();
  if(atlas.regions.length>12){await atlasPanel.getByRole('button',{name:'Next',exact:true}).click();await expect(atlasPanel.getByText(new RegExp(`13–${Math.min(24,atlas.regions.length)} / ${atlas.regions.length}`))).toBeVisible();}
  report.atlas={elapsedMs:performance.now()-atlasAt,caches:atlas.caches.length,regions:atlas.regions.length,uniqueSourceHashes:new Set(atlas.regions.map(r=>r.cacheSha256)).size,regionIds:atlas.regions.map(r=>r.id).sort(),paged:true,sourceBoundsVisible:true};
  await page.screenshot({path:path.join(output,'atlas-native.png')});
  console.log(JSON.stringify({atlas:report.atlas}));
  let first;
  for(const {file,bytes}of selected){
    const sourceSha256=sha(await fs.readFile(file)),opened=(await call('import_paths',{paths:[file]}))[0];
    expect(opened.inspection.sha256).toBe(sourceSha256);
    const contentSha256=fingerprint(opened.inspection),cache=await call('inspection_cache_status');
    expect(cache.entries).toBeLessThanOrEqual(8);expect(cache.estimatedBytes).toBeLessThanOrEqual(256*1024*1024);
    const row={file,bytes,sourceSha256,contentSha256,projectId:opened.project.id,modelTypes:Object.keys(opened.inspection.modelMeshes).length,renderTriangles:(opened.inspection.renderMesh?.indices.length??0)/3,cache};report.maps.push(row);first??=row;
    console.log(JSON.stringify({map:path.basename(file),cache}));
  }
  report.beforeReopen=await call('inspection_cache_status');expect(report.beforeReopen.evictions).toBeGreaterThan(0);
  const reopened=await call('open_project',{id:first.projectId});expect(fingerprint(reopened.inspection)).toBe(first.contentSha256);report.reopenedContentSha256=fingerprint(reopened.inspection);
  report.afterReopen=await call('inspection_cache_status');
  for(const row of report.maps)expect(sha(await fs.readFile(row.file))).toBe(row.sourceSha256);
  report.complete=true;console.log(JSON.stringify({complete:true,decodedMaps:report.maps.length,cache:report.afterReopen}));
}catch(error){report.errors.push(String(error));console.error(error);process.exitCode=1;await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
finally{await fs.writeFile(path.join(output,'acceptance.json'),JSON.stringify(report,null,2));await browser?.close().catch(()=>{});if(child.exitCode===null)child.kill();}
