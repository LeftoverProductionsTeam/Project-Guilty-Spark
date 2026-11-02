// Opt-in real Windows application check. No mocked IPC, game/tool execution,
// downloads, memory writes or installed-game changes. Fresh owned library only.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,expect as assertion} from '@playwright/test';
const expect=assertion.configure({timeout:120000});
if(process.argv.length!==4)throw Error('test-flagship-ui-native <built Spark.exe> <fresh output directory>');
const [app,root]=process.argv.slice(2).map(p=>path.resolve(p));await fs.mkdir(root);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),exe=path.join(root,'GuiltySpark-C51-qa.exe');
await fs.copyFile(app,exe,fs.constants.COPYFILE_EXCL);
const report={schemaVersion:1,mockedIpc:false,complete:false,appSha256:hash(await fs.readFile(exe)),errors:[],screenshots:[],layouts:[]};
const endpoint=net.createServer();await new Promise(r=>endpoint.listen(0,'127.0.0.1',r));const port=endpoint.address().port;await new Promise(r=>endpoint.close(r));
const child=spawn(exe,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:path.join(root,'library'),WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
await fs.writeFile(path.join(root,'owned-process.json'),JSON.stringify({pid:child.pid,port}));let browser,page,call;
async function nav(label){await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();await page.locator('.gs-navigation-drawer').getByRole('button',{name:label,exact:true}).click();}
async function shot(name){const file=path.join(root,name+'.png');await page.screenshot({path:file});report.screenshots.push({file:name+'.png',sha256:hash(await fs.readFile(file))});}
try{
 await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);await expect.poll(()=>browser.contexts().flatMap(c=>c.pages()).some(p=>p.url().includes('tauri.localhost'))).toBe(true);
 page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('tauri.localhost'));page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(String(e)));
 call=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
 const boot=await call('bootstrap');await call('save_settings',{settings:{...boot.settings,onboardingCompleted:true,preferredHalo:'mccSteam',autoBuild:false}});
 const found=await call('discover_halo_connections');report.discovered=found.map(({runtimeId,contentReady,executableSha256})=>({runtimeId,contentReady,executableSha256}));
 for(const runtimeId of ['haloCustomEdition','openCe','chupathingyCe']){
  const source=found.find(candidate=>candidate.runtimeId===runtimeId&&candidate.contentReady);if(!source)continue;
  await call('register_runtime',{registration:{id:crypto.randomUUID(),runtimeId,root:source.root,executable:source.executable,dataRoot:source.dataRoot,version:null,networkVersion:null}});
 }
 await page.reload();await expect(page.locator('.flagship-grid>button')).toHaveCount(8);await expect(page.locator('.home-model-caption')).toContainText('monitor');
 const model=page.locator('.home-native-model .native-model-preview');await expect(model).toHaveAttribute('data-model-ready','true');await expect(model).toHaveAttribute('data-model-textures',/^[1-9]\d*$/);await expect(model).toHaveAttribute('data-model-reflections',/^[1-9]\d*$/);
 report.model=await model.evaluate(node=>({...node.dataset}));await shot('home');
 const cdp=await page.context().newCDPSession(page),parsed=[];cdp.on('Debugger.scriptParsed',event=>parsed.push(event));await cdp.send('Debugger.enable');report.servedSource=[];
 for(const url of await page.locator('script[src]').evaluateAll(nodes=>nodes.map(node=>node.src))){const script=parsed.find(row=>row.url===url);if(!script)throw Error('No native loaded-source record');const {scriptSource}=await cdp.send('Debugger.getScriptSource',{scriptId:script.scriptId});const local=path.join('dist',new URL(url).pathname.replace(/^\//,''));expect(hash(scriptSource)).toBe(hash(await fs.readFile(local)));report.servedSource.push({file:local,sha256:hash(scriptSource)});}
 for(const [width,height,dpi] of [[1440,900,1],[1280,720,1],[960,650,1],[1280,720,1.5]]){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:dpi,mobile:false});await page.waitForTimeout(150);
  const layout=await page.evaluate(()=>{const main=document.querySelector('main');return {width:innerWidth,height:innerHeight,bodyOverflow:document.documentElement.scrollWidth>innerWidth+1,workspaceOverflow:main.scrollWidth>main.clientWidth+1,mainScroll:main.scrollHeight-main.clientHeight};});
  expect(layout.bodyOverflow).toBe(false);expect(layout.workspaceOverflow).toBe(false);await expect(page.getByRole('button',{name:'Close window',exact:true})).toBeInViewport();report.layouts.push({...layout,dpi});
 }
 await cdp.send('Emulation.clearDeviceMetricsOverride');await cdp.detach();
 await page.getByRole('group',{name:'Your Halo installations',exact:true}).getByRole('button',{name:/MCC/}).click();await expect(page.getByRole('tab',{name:'Games & tools',exact:true})).toBeVisible();await shot('runtimes');
 await page.getByRole('button',{name:'HOME',exact:true}).click();
 const created=await call('create_quickforge_project',{title:'C51 native Workshop source',template:'customBlank',target:'mccSteam'});report.projectId=created.project.id;
 await page.reload();await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'C51 native Workshop source',exact:true})}).click();
 await page.getByRole('button',{name:'BSP Workshop',exact:true}).click();
 await page.getByRole('button',{name:'Two rooms + corridor + ramp',exact:true}).click();
 const workshop=page.getByLabel('Native BSP Workshop',{exact:true});await expect(workshop).toBeVisible();
 await expect(workshop).toHaveAttribute('data-source-valid','true');await shot('workshop');
 await nav('Features & workflows');await expect(page.locator('.flagship-grid>button')).toHaveCount(8);await expect(page.locator('.flagship-research')).toContainText('Future research');await shot('features');
 expect(report.errors).toEqual([]);report.runtimeReports=await call('runtime_report');report.complete=true;
}catch(error){report.error=String(error);process.exitCode=1;if(page)await shot('failure').catch(()=>{});}
finally{await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2),{flag:'wx'});if(browser)await browser.close().catch(()=>{});if(child.exitCode===null)child.kill();console.log(JSON.stringify({complete:report.complete,appSha256:report.appSha256,layouts:report.layouts,error:report.error}));}
