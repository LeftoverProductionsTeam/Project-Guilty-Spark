import {test,expect} from '@playwright/test';
// This fixture tests the real browser decoder/controls against synthetic IPC.
// It does not count as evidence about installed Halo assets or native reads.
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    const w=window as any;w.isTauri=true;
    w.__TAURI_INTERNALS__={invoke:async(command:string,args:any)=>{
      if(!['preview_owned_cache_bitmap','preview_owned_reflection_cube'].includes(command))throw Error('Unexpected command '+command);
      if(args.bitmapTagId===11)await new Promise(resolve=>{w.releaseImage=resolve;});
      if(w.holdFrame&&args.imageIndex===1)await new Promise(resolve=>{w.releaseFrame=resolve;});
      if(w.holdMip&&args.mipLevel===1)await new Promise(resolve=>{w.releaseMip=resolve;});
      const mip=args.mipLevel??0,edge=args.bitmapTagId===8?4>>mip:1;
      const kind=args.bitmapTagId===8?'1555':'4444',buffer=new ArrayBuffer(128+edge*edge*2),v=new DataView(buffer);
      new Uint8Array(buffer).set([68,68,83,32]);
      for(const [at,value]of [[4,124],[12,edge],[16,edge],[20,edge*2],[76,32],[80,0x41],[88,16],[92,kind==='1555'?0x7c00:0x0f00],[96,kind==='1555'?0x03e0:0x00f0],[100,kind==='1555'?0x001f:0x000f],[104,kind==='1555'?0x8000:0xf000]])v.setUint32(at,value,true);
      for(let pixel=0;pixel<edge*edge;pixel++)v.setUint16(128+pixel*2,kind==='1555'?(mip?0x801f:args.imageIndex?0x83e0:0xfc00):(args.imageIndex?0x8123:0xf123),true);
      if(command==='preview_owned_reflection_cube'){
        w.cubeReads=(w.cubeReads??0)+1;
        return {sourceSha256:(args.projectId==='map-a'?'a':'c').repeat(64),resourceSha256:'b'.repeat(64),bitmapTagId:args.bitmapTagId,faces:Array.from({length:6},(_,face)=>{
          const bytes=new Uint8Array(buffer.slice(0));new DataView(bytes.buffer).setUint16(128,0xf000+(face+1)*0x111,true);
          return {bitmapTagId:args.bitmapTagId,imageIndex:0,imageCount:1,width:1,height:1,format:'A4R4G4B4',sourceSha256:(args.projectId==='map-a'?'a':'c').repeat(64),sourceKind:'verified-resource',resourceSha256:'b'.repeat(64),ddsBase64:btoa(String.fromCharCode(...bytes))};
        })};
      }
      return {bitmapTagId:args.bitmapTagId,imageIndex:args.imageIndex,mipLevel:mip,mipLevels:args.bitmapTagId===8?3:1,imageCount:2,width:edge,height:edge,
        format:kind==='1555'?'A1R5G5B5':'A4R4G4B4',sourceSha256:(args.projectId==='map-a'?'a':'c').repeat(64),sourceKind:'verified-resource',resourceSha256:(args.bitmapTagId===10?'d':'b').repeat(64),sharedNativeBitmapPath:args.bitmapTagId===8?'test/original':undefined,
        ddsBase64:btoa(String.fromCharCode(...new Uint8Array(buffer)))};
    }};
  });
  await page.goto('/tests/ui/fixtures/bitmapPreview.html');
});
test('native frame bounds, pixels and frame position survive a tag switch',async({page})=>{
  const canvas=page.getByLabel('Verified original bitmap pixels');
  await expect(canvas).toHaveAttribute('data-format','A1R5G5B5');
  expect(await canvas.evaluate((e:HTMLCanvasElement)=>[...e.getContext('2d')!.getImageData(0,0,1,1).data])).toEqual([255,0,0,255]);
  await expect(page.getByRole('button',{name:'Previous bitmap image'})).toBeDisabled();
  await page.getByRole('button',{name:'Next bitmap image'}).click();
  await expect(canvas).toHaveAttribute('data-image-index','1');
  expect(await canvas.evaluate((e:HTMLCanvasElement)=>[...e.getContext('2d')!.getImageData(0,0,1,1).data])).toEqual([0,255,0,255]);
  await expect(page.getByRole('button',{name:'Next bitmap image'})).toBeDisabled();
  await page.getByRole('button',{name:'4444 bitmap',exact:true}).click();
  await expect(canvas).toHaveAttribute('data-format','A4R4G4B4');
  await page.getByRole('button',{name:'1555 bitmap',exact:true}).click();
  await expect(canvas).toHaveAttribute('data-image-index','1');
  await expect(page.getByText('Reuses original pixels',{exact:false})).toBeVisible();
});
test('4444 alpha survives the original pixel canvas',async({page})=>{
  await page.getByRole('button',{name:'4444 bitmap',exact:true}).click();
  const canvas=page.getByLabel('Verified original bitmap pixels');
  await expect(canvas).toHaveAttribute('data-format','A4R4G4B4');
  expect(await canvas.evaluate((e:HTMLCanvasElement)=>[...e.getContext('2d')!.getImageData(0,0,1,1).data])).toEqual([17,34,51,255]);
  await page.getByRole('button',{name:'Next bitmap image'}).click();
  await expect(canvas).toHaveAttribute('data-image-index','1');
  expect(await canvas.evaluate((e:HTMLCanvasElement)=>e.getContext('2d')!.getImageData(0,0,1,1).data[3])).toBe(136);
});
test('a changed pin clears the old pixels instead of substituting an image',async({page})=>{
  await expect(page.getByLabel('Verified original bitmap pixels')).toBeVisible();
  await page.getByRole('button',{name:'Changed resource',exact:true}).click();
  await expect(page.getByText('The external bitmap resource changed',{exact:false})).toBeVisible();
  await expect(page.getByLabel('Verified original bitmap pixels')).toHaveCount(0);
});
test('a late bitmap cannot replace a different map preview',async({page})=>{
  await page.getByRole('button',{name:'Delayed bitmap',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).releaseImage)).toBe('function');
  await page.getByRole('button',{name:'Switch map',exact:true}).click();
  await expect(page.getByLabel('Verified original bitmap pixels')).toHaveAttribute('data-source-sha256','c'.repeat(64));
  await page.evaluate(()=>{(window as any).releaseImage();});
  await expect(page.getByLabel('Verified original bitmap pixels')).toHaveAttribute('data-source-sha256','c'.repeat(64));
});
test('a new frame never labels old pixels while native loading is pending',async({page})=>{
  await expect(page.getByLabel('Verified original bitmap pixels')).toHaveAttribute('data-image-index','0');
  await page.evaluate(()=>{(window as any).holdFrame=true;});
  await page.getByRole('button',{name:'Next bitmap image'}).click();
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).releaseFrame)).toBe('function');
  await expect(page.getByLabel('Verified original bitmap pixels')).toHaveCount(0);
  await page.evaluate(()=>{(window as any).releaseFrame();});
  const canvas=page.getByLabel('Verified original bitmap pixels');
  await expect(canvas).toHaveAttribute('data-image-index','1');
  expect(await canvas.evaluate((e:HTMLCanvasElement)=>[...e.getContext('2d')!.getImageData(0,0,1,1).data])).toEqual([0,255,0,255]);
});

test('reflection inspection shares the validated six-face cache and retains its selected native face',async({page})=>{
  await page.getByRole('button',{name:'Reflection cube',exact:true}).click();
  const canvas=page.getByLabel('Verified original bitmap pixels'),faces=page.getByRole('combobox',{name:'Cubemap face',exact:true});
  await expect(faces.locator('option')).toHaveCount(6);await expect(canvas).toHaveAttribute('data-cube-face','0');
  const first=await canvas.evaluate((element:HTMLCanvasElement)=>[...element.getContext('2d')!.getImageData(0,0,1,1).data]);
  await faces.selectOption('5');await expect(canvas).toHaveAttribute('data-cube-face','5');
  const last=await canvas.evaluate((element:HTMLCanvasElement)=>[...element.getContext('2d')!.getImageData(0,0,1,1).data]);expect(last).not.toEqual(first);
  await page.getByRole('button',{name:'1555 bitmap',exact:true}).click();await page.getByRole('button',{name:'Reflection cube',exact:true}).click();
  await expect(canvas).toHaveAttribute('data-cube-face','5');expect(await page.evaluate(()=>(window as any).cubeReads)).toBe(1);
  await expect(canvas).toHaveAttribute('data-source-sha256','a'.repeat(64));
});

test('original detail selection retains its image and clears stale pixels during a native request',async({page})=>{
  const detail=page.getByRole('combobox',{name:'Original texture detail',exact:true}),canvas=page.getByLabel('Verified original bitmap pixels');
  await expect(detail.locator('option')).toHaveCount(3);await expect(canvas).toHaveAttribute('width','4');
  await page.evaluate(()=>{(window as any).holdMip=true;});await detail.selectOption('1');
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).releaseMip)).toBe('function');
  await expect(canvas).toHaveCount(0);await expect(detail).toBeDisabled();
  await page.evaluate(()=>{(window as any).holdMip=false;(window as any).releaseMip();});
  await expect(canvas).toHaveAttribute('data-mip-level','1');await expect(canvas).toHaveAttribute('width','2');
  expect(await canvas.evaluate((e:HTMLCanvasElement)=>[...e.getContext('2d')!.getImageData(0,0,1,1).data])).toEqual([0,0,255,255]);
  await page.getByRole('button',{name:'4444 bitmap',exact:true}).click();await expect(detail).toHaveCount(0);
  await page.getByRole('button',{name:'1555 bitmap',exact:true}).click();await expect(detail).toHaveValue('1');
  await page.getByRole('button',{name:'Next bitmap image'}).click();await expect(canvas).toHaveAttribute('data-image-index','1');await expect(detail).toHaveValue('0');
  await page.getByRole('button',{name:'Previous bitmap image'}).click();await expect(detail).toHaveValue('1');
  await page.reload();await expect(detail).toHaveValue('1');await expect(canvas).toHaveAttribute('data-mip-level','1');
});
