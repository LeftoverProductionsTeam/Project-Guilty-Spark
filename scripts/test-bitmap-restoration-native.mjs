// Real owned-cache / native IPC / WebView2 acceptance. No mock IPC, source
// rewrites, guessed filename aliases, or game-memory access. Private QA only.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,expect as assertion} from '@playwright/test';
const expect=assertion.configure({timeout:60000}),args=new Map();
for(let i=2;i<process.argv.length;i+=2)args.set(process.argv[i],process.argv[i+1]);
if(!args.get('--app')||!args.get('--output')||!args.get('--map')||[...args.keys()].some(k=>!['--app','--output','--map'].includes(k)))throw Error('Required: --app built.exe --output fresh-directory --map owned-Zombie-Demo.map');
const input=path.resolve(args.get('--map')),output=path.resolve(args.get('--output')),folder=path.dirname(input);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const source=await fs.readFile(input),resource=await fs.readFile(path.join(folder,'bitmaps.map'));
const sourceHash=hash(source),resourceHash=hash(resource);
if(sourceHash!=='b38f35508188872b2535888193de80f766d92d3b8d53a8ada7be4fc9808a996d'||resourceHash!=='5357828124ed03b9b47dad563434465af742075ae1c991f6bb733320996f1bea')throw Error('This gate requires the exact original owned Zombie map and bitmap pack.');
await fs.mkdir(output);
const exe=path.join(output,'GuiltySpark-bitmap-restoration.exe');await fs.copyFile(path.resolve(args.get('--app')),exe,fs.constants.COPYFILE_EXCL);
const receipt={schemaVersion:1,appSha256:hash(await fs.readFile(exe)),sourceSha256:sourceHash,resourceSha256:resourceHash,mockedIpc:false,complete:false,javascriptOrGpuErrors:[],gameLaunched:false};
const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
const child=spawn(exe,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:path.join(output,'library'),WEBVIEW2_USER_DATA_FOLDER:path.join(output,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
let browser,page;
const call=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
const normalize=value=>value.replaceAll('\\','/').toLowerCase();
const entries=new Map();
const names=resource.readUInt32LE(4),table=resource.readUInt32LE(8),count=resource.readUInt32LE(12);
if(count>65536||table+count*12>resource.length)throw Error('Unexpected owned resource index bounds');
for(let i=0;i<count;i++){
  const at=table+i*12,start=names+resource.readUInt32LE(at),end=resource.indexOf(0,start);
  if(end<start||end-start>1024)throw Error('Unbounded owned resource name');
  const name=normalize(resource.toString('utf8',start,end)),rows=entries.get(name)??[];
  rows.push({offset:resource.readUInt32LE(at+8),size:resource.readUInt32LE(at+4)});entries.set(name,rows);
}
function records(tag,header){
  const at=tag.dataOffset,n=source.readUInt32LE(at+96),ptr=header.tagOffset+source.readUInt32LE(at+100)-0x4bf10000;
  if(n>2048||ptr<header.tagOffset||ptr+n*48>header.tagOffset+header.tagSize)throw Error('Unexpected source bitmap array');
  const images=Array.from({length:n},(_,image)=>{
    const p=ptr+image*48,format=source.readUInt16LE(p+12),width=source.readUInt16LE(p+4),height=source.readUInt16LE(p+6);
    const top=[14,15,16].includes(format)?Math.ceil(width/4)*Math.ceil(height/4)*(format===14?8:16):width*height*({0:1,1:1,3:2,6:2,8:2,9:2,10:4,11:4}[format]??0);
    return {tag,image,format,width,height,kind:source.readUInt16LE(p+10),external:!!(source.readUInt16LE(p+14)&0x100),raw:source.readUInt32LE(p+24),size:source.readUInt32LE(p+28),top};
  });
  return {tag,images,signature:Buffer.concat(images.map((_,i)=>source.subarray(ptr+i*48,ptr+i*48+32))).toString('hex')};
}
async function choose(name){
  const drawer=page.locator('.gs-navigation-drawer');if(!await drawer.isVisible())await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();
  await drawer.getByRole('button',{name,exact:true}).click();
}
async function selectBitmap(record){
  await page.getByLabel('Filter tag class',{exact:true}).selectOption('bitm');
  await page.getByLabel('Search tags',{exact:true}).fill(record.tag.path);
  const name=record.tag.path.split(/[\\/]/).at(-1);
  await page.locator('.tag-row').filter({has:page.getByText(name,{exact:true})}).first().click();
  const canvas=page.getByLabel('Verified original bitmap pixels',{exact:true});
  await expect(canvas).toHaveAttribute('data-source-sha256',sourceHash);
  await expect(canvas).toHaveAttribute('data-resource-sha256',resourceHash);
  return canvas;
}
async function checkPackedCanvas(canvas,record){
  const captured=await canvas.evaluate(element=>{
    const pixels=element.getContext('2d').getImageData(0,0,element.width,element.height).data;
    return {width:element.width,height:element.height,pixels:Array.from(pixels)};
  });
  expect(captured.width).toBe(record.width);expect(captured.height).toBe(record.height);
  const alphaLevels=new Set();let opaque=0;
  for(let i=0;i<record.width*record.height;i++){
    const word=resource.readUInt16LE(record.raw+i*2);
    const rgba=record.format===8?[Math.round(((word>>10)&31)*255/31),Math.round(((word>>5)&31)*255/31),Math.round((word&31)*255/31),(word&0x8000)?255:0]:[((word>>8)&15)*17,((word>>4)&15)*17,(word&15)*17,((word>>12)&15)*17];
    const actual=captured.pixels.slice(i*4,i*4+4);if(actual[3]!==rgba[3])throw Error('Canvas alpha differs from the original native frame at pixel '+i);alphaLevels.add(rgba[3]);
    // Canvas compositing may discard RGB under transparency. Opaque pixels
    // have no premultiply/unpremultiply loss and must agree byte-for-byte.
    if(rgba[3]===255){if(actual.some((value,channel)=>value!==rgba[channel]))throw Error('Opaque canvas color differs from original pixels at '+i);opaque++;}
  }
  return {format:record.format===8?'A1R5G5B5':'A4R4G4B4',width:record.width,height:record.height,alphaLevels:[...alphaLevels].sort((a,b)=>a-b),opaquePixelsChecked:opaque,canvasSha256:hash(Buffer.from(captured.pixels))};
}
try{
  await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect.poll(()=>browser.contexts().flatMap(c=>c.pages()).some(p=>p.url().includes('tauri.localhost'))).toBe(true);
  page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('tauri.localhost'));
  page.on('pageerror',e=>receipt.javascriptOrGpuErrors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&/THREE|WebGL|shader/i.test(m.text()))receipt.javascriptOrGpuErrors.push(m.text());});
  const boot=await call('bootstrap');await call('save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false,preferredHalo:'mccSteam'}});
  let [open]=await call('import_paths',{paths:[input]});const id=open.project.id;
  await call('claim_project_document',{id});open.project.title='Original bitmap restoration QA';await call('save_project',{project:open.project});
  const groups=open.inspection.tags.filter(t=>t.class==='bitm'&&!t.external&&t.dataOffset!=null).map(t=>records(t,open.inspection.header));
  const all=groups.flatMap(g=>g.images),flat=all.filter(r=>r.external&&r.kind===0&&r.top>0);
  const absent=flat.filter(r=>!entries.has(normalize(r.tag.path+'_'+r.image)));
  const packed=flat.filter(r=>[8,9].includes(r.format));expect(absent.length).toBe(47);expect(packed.length).toBe(12);
  const targets=[...new Map([...absent,...packed].map(r=>[r.tag.id+':'+r.image,r])).values()];
  const restored=[],refused=[];const started=performance.now();
  for(let i=0;i<targets.length;i+=24){
    const batch=await call('preview_owned_cache_bitmap_batch',{projectId:id,requests:targets.slice(i,i+24).map(r=>({bitmapTagId:r.tag.id,imageIndex:r.image}))});
    expect(batch.sourceSha256).toBe(sourceHash);expect(batch.resourceSha256).toBe(resourceHash);
    for(let n=0;n<batch.items.length;n++){
      const record=targets[i+n],item=batch.items[n];expect(item.bitmapTagId).toBe(record.tag.id);expect(item.imageIndex).toBe(record.image);
      if(!item.preview){refused.push({path:record.tag.path,image:record.image,error:item.error,code:item.errorCode});continue;}
      const preview=item.preview,witness=preview.sharedNativeBitmapPath??record.tag.path;
      expect(preview.sourceSha256).toBe(sourceHash);expect(preview.resourceSha256).toBe(resourceHash);expect(preview.sourceKind).toBe('verified-resource');
      expect(preview.imageCount).toBe(groups.find(g=>g.tag.id===record.tag.id).images.length);
      const resourceEntries=entries.get(normalize(witness+'_'+record.image));expect(resourceEntries).toHaveLength(1);
      expect(record.raw).toBeGreaterThanOrEqual(resourceEntries[0].offset);expect(record.raw+record.size).toBeLessThanOrEqual(resourceEntries[0].offset+resourceEntries[0].size);
      if(preview.sharedNativeBitmapPath){
        const original=groups.find(g=>g.tag.path===witness);expect(original).toBeTruthy();
        expect(original.signature).toBe(groups.find(g=>g.tag.id===record.tag.id).signature);
      }
      const dds=Buffer.from(preview.ddsBase64,'base64');expect(dds.subarray(128)).toEqual(resource.subarray(record.raw,record.raw+record.top));
      restored.push({path:record.tag.path,image:record.image,format:preview.format,sharedNativeBitmapPath:preview.sharedNativeBitmapPath??null,rawTopSha256:hash(dds.subarray(128)),bytes:record.top});
    }
  }
  receipt.originalPixelReads={elapsedMs:performance.now()-started,restored,refused};
  expect(restored.filter(r=>r.sharedNativeBitmapPath).length).toBe(45);expect(restored.filter(r=>['A1R5G5B5','A4R4G4B4'].includes(r.format)).length).toBe(12);expect(refused).toHaveLength(2);
  expect(refused.map(r=>r.path.split(/[\\/]/).at(-1)).sort()).toEqual(['shield charge flares+','shield charge rings+']);
  console.log('phase: 57 newly readable original images match the exact source/resource bytes; two unproven images refused');
  const coverage=await call('review_bitmap_resource_candidates',{projectId:id});receipt.coverage=coverage.candidates.map(({reason,sha256,coverage,error})=>({reason,sha256,coverage,error}));
  const own=receipt.coverage.find(r=>r.sha256===resourceHash).coverage;
  expect(own).toMatchObject({verifiedImages:510,sharedNativeImages:45,missingOrMismatchedImages:2,unsupportedImages:32,cubemapImages:27,volumeImages:5,internalImages:142});
  await call('plugin:window|maximize',{label:'main'});await page.reload();await choose('Map library');
  await page.locator('.map-card').filter({has:page.getByRole('heading',{name:open.project.title,exact:true})}).click();await choose('Tag editor');
  receipt.nativeUi=[];
  for(const format of [8,9]){
    const record=packed.find(r=>r.format===format&&r.image===0),group=groups.find(g=>g.tag.id===record.tag.id);
    const canvas=await selectBitmap(record);await expect(canvas).toHaveAttribute('data-format',format===8?'A1R5G5B5':'A4R4G4B4');
    const checked=await checkPackedCanvas(canvas,record);receipt.nativeUi.push({path:record.tag.path,...checked});
    if(group.images.length>1){await page.getByRole('button',{name:'Next bitmap image',exact:true}).click();await expect(canvas).toHaveAttribute('data-image-index','1');await checkPackedCanvas(canvas,group.images[1]);await page.getByRole('button',{name:'Previous bitmap image',exact:true}).click();await expect(canvas).toHaveAttribute('data-image-index','0');}
    await page.screenshot({path:path.join(output,`original-packed-${format}.png`)});
  }
  const alias=absent.find(r=>r.image===0&&restored.some(x=>x.path===r.tag.path&&x.sharedNativeBitmapPath));
  const aliasCanvas=await selectBitmap(alias);await expect(page.getByText('Reuses original pixels',{exact:false})).toBeVisible();
  await page.screenshot({path:path.join(output,'original-shared-pixels.png')});
  const selectedFrame=Number(await aliasCanvas.getAttribute('data-image-index'));
  // Restore the same tag through the existing per-map drawer state. This is
  // native rendering via a real persisted selection, not mocked React/IPC.
  await page.evaluate(({id,tag})=>{const key='guilty-spark-map-session-v1:'+id,value=JSON.parse(localStorage.getItem(key)||'{}');value['viewport.tags.selected']=tag;value['world.selection']=null;localStorage.setItem(key,JSON.stringify(value));},{id,tag:alias.tag.id});
  await page.reload();await choose('Map library');await page.locator('.map-card').filter({has:page.getByRole('heading',{name:open.project.title,exact:true})}).click();await choose('Level editor');await page.getByRole('button',{name:'Toggle Object tags',exact:true}).click();
  await expect(page.getByLabel('Verified original bitmap pixels')).toHaveAttribute('data-image-index',String(selectedFrame));
  await expect(page.getByText('Reuses original pixels',{exact:false})).toBeVisible();receipt.drawerPreviewAndFrameState=true;
  await page.screenshot({path:path.join(output,'bitmap-tag-drawer.png')});
  const snapshot=(await call('open_project',{id})).project;expect(snapshot.tagEdits).toEqual([]);
  const privateFolder=path.join(output,'private-resources');await fs.mkdir(privateFolder);
  for(const name of Object.keys(snapshot.source.resourceSha256))await fs.copyFile(path.join(folder,name),path.join(privateFolder,name),fs.constants.COPYFILE_EXCL);
  await call('connect_halo_textures',{projectId:id,mode:'path',path:privateFolder});
  const damaged=path.join(privateFolder,'bitmaps.map');await fs.chmod(damaged,0o600);const file=await fs.open(damaged,'r+');const at=(await file.stat()).size-1,byte=Buffer.alloc(1);await file.read(byte,0,1,at);byte[0]^=1;await file.write(byte,0,1,at);await file.sync();await file.close();
  const rejected=await call('preview_owned_cache_bitmap_batch',{projectId:id,requests:[{bitmapTagId:alias.tag.id,imageIndex:0},{bitmapTagId:packed[0].tag.id,imageIndex:0},{bitmapTagId:3867149580,imageIndex:0}]});
  expect(rejected.items[0].preview).toBeFalsy();expect(rejected.items[1].preview).toBeFalsy();expect(rejected.items[2].preview.sourceKind).toBe('internal-cache');
  receipt.changedPrivatePack={aliasRefused:rejected.items[0].error,packedRefused:rejected.items[1].error,embeddedStillReadable:true};
  await call('connect_halo_textures',{projectId:id,mode:'path',path:folder});
  expect(hash(await fs.readFile(input))).toBe(sourceHash);expect(hash(await fs.readFile(path.join(folder,'bitmaps.map')))).toBe(resourceHash);expect(hash(await fs.readFile(snapshot.source.preservedPath))).toBe(sourceHash);
  expect(receipt.javascriptOrGpuErrors).toEqual([]);receipt.originalMapResourceAndPreservedSourceUnchanged=true;receipt.complete=true;
  await fs.writeFile(path.join(output,'acceptance.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({complete:true,restored:restored.length,refused:refused.length,coverage:own,ui:receipt.nativeUi,changedPack:receipt.changedPrivatePack}));
}catch(error){
  if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
  await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({error:String(error),receipt},null,2));throw error;
}finally{await browser?.close();child.kill();}
