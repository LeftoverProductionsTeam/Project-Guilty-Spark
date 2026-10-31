import {test,expect} from '@playwright/test';
// Synthetic IPC/UI contracts only. They are not native texture evidence.
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    const w=window as any;w.isTauri=true;w.calls=[];
    w.__TAURI_INTERNALS__={invoke:async(command:string,args:any)=>{
      w.calls.push({command,args});
      const candidates=[{path:'C:/original/bitmaps.map',reason:'Original'},{path:'C:/mcc/bitmaps.map',reason:'MCC compatibility'}];
      if(command==='bitmap_resource_candidates')return candidates;
      if(command==='review_bitmap_resource_candidates'){
        if(w.deferReview)await new Promise(resolve=>{w.releaseReview=resolve;});
        return {projectId:args.projectId,sourceSha256:args.projectId==='map-a'?'a':'b',candidates:candidates.map((c,i)=>({...c,coverage:{verifiedImages:i?1:510,missingOrMismatchedImages:i?499:2,unsupportedImages:i?44:32,internalImages:142,sharedNativeImages:i?0:45,cubemapImages:27,volumeImages:5}}))};
      }
      throw Error('Unexpected command '+command);
    }};
  });
  await page.goto('/tests/ui/fixtures/textureResources.html');
});
test('coverage is explicit, compact and checked only on demand',async({page})=>{
  await page.getByText('Found resources · 2',{exact:true}).click();
  expect(await page.evaluate(()=>(window as any).calls.some((c:any)=>c.command==='review_bitmap_resource_candidates'))).toBe(false);
  await page.getByRole('button',{name:'Check image coverage',exact:true}).click();
  await expect(page.getByText('510 verified · 2 missing / mismatched · 32 outside flat preview · 142 embedded',{exact:true})).toBeVisible();
  await expect(page.getByText('1 verified · 499 missing / mismatched · 44 outside flat preview · 142 embedded',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Connect partial resources',exact:true})).toHaveCount(2);
  const overflow=await page.locator('.gs-texture-connection').evaluate(e=>e.scrollWidth>e.clientWidth+1);
  expect(overflow).toBe(false);
  const heights=await page.locator('.gs-texture-candidates article').evaluateAll(rows=>rows.map(row=>row.getBoundingClientRect().height));
  expect(heights.every(height=>height<150)).toBe(true);
});
test('a recovered location and secondary pin publish a new preview identity',async({page})=>{
  const identity=page.getByLabel('Texture retry identity');
  await page.getByRole('button',{name:'Recover same primary pin'}).click();
  await expect(identity).toContainText('D:/recovered');
  await expect(identity).toContainText('mcc-shared-bitmaps.map');
  await expect(identity).toContainText('primary');
});
test('a late review for another map cannot populate the current drawer',async({page})=>{
  await page.evaluate(()=>{(window as any).deferReview=true;});
  await page.getByText('Found resources · 2',{exact:true}).click();
  await page.getByRole('button',{name:'Check image coverage',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).releaseReview)).toBe('function');
  await page.getByRole('button',{name:'Switch map',exact:true}).click();
  await page.evaluate(()=>{(window as any).releaseReview();});
  await expect(page.getByRole('button',{name:'Check image coverage',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'Recheck image coverage',exact:true})).toHaveCount(0);
  await expect(page.getByText('510 verified',{exact:false})).toHaveCount(0);
});
