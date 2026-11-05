import { assertQaOutputPath } from './native-qa-storage.mjs';
// Actual source-derived corner image, cache reuse and menu/text hit regions.
// No image is bundled or fetched from the internet; the owner's installed
// campaign model is rendered once through Spark's normal native reader.
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import net from 'node:net';import {spawn} from 'node:child_process';import {chromium,expect as assertion} from '@playwright/test';
const [app,destination]=process.argv.slice(2);if(!destination)throw Error('test-native-monitor-portrait <packaged.exe> <fresh-output>');const root=path.resolve(destination),expect=assertion.configure({timeout:120000});await fs.mkdir(await assertQaOutputPath(root));const exe=path.join(root,'GuiltySpark-monitor-portrait.exe');await fs.copyFile(path.resolve(app),exe,fs.constants.COPYFILE_EXCL);
const report={complete:false,mockedIpc:false,appSha256:crypto.createHash('sha256').update(await fs.readFile(exe)).digest('hex'),errors:[]};
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));const launch=()=>spawn(exe,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:path.join(root,'library'),WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});let child=launch(),browser,page;
const firstLaunch=performance.now();
const call=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
try{
 await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);await expect.poll(()=>browser.contexts().flatMap(c=>c.pages()).some(p=>p.url().includes('tauri.localhost'))).toBe(true);page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('tauri.localhost'));page.on('pageerror',e=>report.errors.push(String(e)));
 const boot=await call('bootstrap');await call('save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false}});await page.reload();const image=page.locator('img[data-spark-emblem="owned-monitor"]');await expect(image).toBeVisible();
 report.firstProfilePortraitMs=performance.now()-firstLaunch;report.picture=await image.evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight,png:img.src}));expect(report.picture.width).toBe(256);expect(report.picture.height).toBe(256);await expect(page.locator('.gs-spark-capture canvas')).toHaveCount(0);const encoded=report.picture.png.split(',')[1];await fs.writeFile(path.join(root,'owned-monitor-front.png'),Buffer.from(encoded,'base64'));report.picture.sha256=crypto.createHash('sha256').update(Buffer.from(encoded,'base64')).digest('hex');delete report.picture.png;
 const picture=await image.getAttribute('src');await page.mouse.move(20,200);await page.mouse.move(1200,300,{steps:12});expect(await image.getAttribute('src')).toBe(picture);
 const nav=page.getByRole('button',{name:'Toggle workspace navigation',exact:true});await nav.click();await expect(page.locator('.gs-navigation-drawer')).toBeVisible();await nav.click();await expect(page.locator('.gs-navigation-drawer')).toBeHidden();
 const current=await call('bootstrap'),source=current.entries.find(e=>e.version===13&&e.title.toLowerCase()==='c40');expect(source,'Installed owned monitor campaign source').toBeTruthy();await page.reload();await expect(image).toBeVisible();await page.locator('.map-card').filter({has:page.getByRole('heading',{name:source.title,exact:true})}).click();await expect(page.getByRole('tab',{name:source.title,exact:true})).toBeVisible();await nav.click();await page.locator('.gs-navigation-drawer').getByRole('button',{name:'Tag editor',exact:true}).click();await expect(page.locator('.editor-bar .breadcrumb')).toBeVisible();
 report.bounds=await page.evaluate(()=>{const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return{frame:rect('.application'),monitor:rect('.gs-spark-emblem'),home:rect('.gs-home-button'),breadcrumb:rect('.editor-bar .breadcrumb'),curve:getComputedStyle(document.querySelector('.application')).borderTopLeftRadius};});
 expect(report.bounds.monitor.y).toBe(0);expect(report.bounds.monitor.x).toBe(0);expect(report.bounds.frame.x).toBe(16);expect(report.bounds.frame.y).toBe(16);expect(report.bounds.home.x).toBeGreaterThanOrEqual(report.bounds.monitor.right);expect(report.bounds.breadcrumb.x).toBeGreaterThanOrEqual(report.bounds.monitor.right);await page.screenshot({path:path.join(root,'corner-with-tag-editor.png')});
 await page.addInitScript(()=>{window.__portraitCaptures=0;new MutationObserver(rows=>{for(const row of rows)for(const node of row.addedNodes)if(node instanceof Element){if(node.matches('.gs-spark-capture canvas')||node.querySelector('.gs-spark-capture canvas'))window.__portraitCaptures++;}}).observe(document,{subtree:true,childList:true});});await page.reload();await expect(image).toBeVisible();await page.waitForTimeout(1500);expect(await page.evaluate(()=>window.__portraitCaptures)).toBe(0);expect(await image.getAttribute('src')).toBe(picture);report.cachedPictureSurvivesReloadWithoutCornerRenderer=true;
 // Home must keep the same live model/canvas and animation state while parked.
 await page.getByRole('button',{name:'HOME',exact:true}).click();
 const home=page.locator('.home-native-model .native-model-preview');
 const firstModel=performance.now();
 await expect(home).toHaveAttribute('data-model-ready','true');
 await expect(home.locator('canvas')).toBeVisible();
 report.firstHomeWaitMs=performance.now()-firstModel;
 await expect(home.locator('canvas')).toHaveAttribute('data-gs-animation',/verified-skeletal-animation/);
 await page.evaluate(()=>{
   window.__homeCanvas=document.querySelector('.home-native-model canvas');
   window.__previewCalls=[];
   const invoke=window.__TAURI_INTERNALS__.invoke;
   window.__TAURI_INTERNALS__.invoke=function(command,args,...rest){
     if(/^preview_owned_(object_model|cache_bitmap_batch|reflection_cube|model_animation|source)/.test(command))window.__previewCalls.push({command,at:performance.now()});
     return invoke.call(this,command,args,...rest);
   };
 });
 await nav.click();await page.locator('.gs-navigation-drawer').getByRole('button',{name:'Settings & tools',exact:true}).click();
 await expect(home).toBeHidden();
 await page.waitForTimeout(250);
 const paused=await page.evaluate(()=>({animation:JSON.parse(window.__homeCanvas.dataset.gsAnimation),pose:window.__homeCanvas.dataset.gsShowcasePose}));
 await page.waitForTimeout(1250);
 const parked=await page.evaluate(()=>({animation:JSON.parse(window.__homeCanvas.dataset.gsAnimation),pose:window.__homeCanvas.dataset.gsShowcasePose}));
 expect(parked.animation.time).toBe(paused.animation.time);expect(parked.pose).toBe(paused.pose);
 const resumeStart=performance.now();await page.getByRole('button',{name:'HOME',exact:true}).click();
 await expect(home).toHaveAttribute('data-model-ready','true');await expect(home.locator('canvas')).toBeVisible();
 report.homeResumeMs=performance.now()-resumeStart;
 expect(await page.evaluate(()=>document.querySelector('.home-native-model canvas')===window.__homeCanvas)).toBe(true);
 await expect.poll(()=>page.evaluate(()=>JSON.parse(window.__homeCanvas.dataset.gsAnimation).time)).toBeGreaterThan(parked.animation.time);
 report.previewReadsOnHomeResume=await page.evaluate(()=>window.__previewCalls);
 expect(report.previewReadsOnHomeResume).toEqual([]);
 report.parkedAnimation=paused.animation;report.homeRetainedCanvasAndAnimation=true;
 await page.screenshot({path:path.join(root,'home-resumed.png')});
 // Close this owned process normally so WebView storage is flushed, then launch
 // the same application/profile again. A reload alone is not this acceptance.
 let exited=new Promise(resolve=>child.once('exit',resolve));
 await call('close_application').catch(()=>{});
 await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>reject(Error('Owned app did not exit normally')),15000))]);
 await browser.close().catch(()=>{});browser=null;
 const restartStart=performance.now();child=launch();
 await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
 const context=browser.contexts()[0];
 await context.addInitScript(()=>{window.__portraitCaptures=0;new MutationObserver(rows=>{for(const row of rows)for(const node of row.addedNodes)if(node instanceof Element&&(node.matches('.gs-spark-capture canvas')||node.querySelector('.gs-spark-capture canvas')))window.__portraitCaptures++;}).observe(document,{subtree:true,childList:true});});
 await expect.poll(()=>browser.contexts().flatMap(c=>c.pages()).some(p=>p.url().includes('tauri.localhost'))).toBe(true);
 page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('tauri.localhost'));page.on('pageerror',e=>report.errors.push(String(e)));
 // Install observation before a fresh document for deterministic full-lifecycle coverage.
 await page.reload();const restored=page.locator('img[data-spark-emblem="owned-monitor"]');await expect(restored).toBeVisible();
 report.repeatLaunchPortraitMs=performance.now()-restartStart;
 expect(await restored.getAttribute('src')).toBe(picture);
 await expect(page.locator('.home-native-model .native-model-preview')).toHaveAttribute('data-model-ready','true');
 await page.waitForTimeout(1500);
 expect(await page.evaluate(()=>window.__portraitCaptures)).toBe(0);report.cachedPictureSurvivesProcessRestart=true;
 report.measurementConditions='Same optimized executable, owned MCC model, one machine, real WebView/native calls. Fresh profile first load versus saved-profile relaunch; OS file cache not purged. Home resume measured after materials/animation were ready. Not a whole-application cold/warm benchmark.';
 expect(report.errors).toEqual([]);report.complete=true;
}catch(error){report.error=String(error);report.stack=error.stack;process.exitCode=1;await page?.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});}
finally{await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));await browser?.close().catch(()=>{});if(child.exitCode===null)child.kill();console.log(JSON.stringify(report));}
