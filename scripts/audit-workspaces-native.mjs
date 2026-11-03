// Real packaged-app layout survey. Separate owned profile, real IPC and native
// windows; no game/tool execution. DPI emulation is reported, not monitor proof.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, expect as assertion } from '@playwright/test';

const [application, destination, ownedMap] = process.argv.slice(2);
const profileBsp = process.argv.includes('--profile-bsp');
const only=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7).split(',');
const strict=process.argv.includes('--strict');
if (!application || !destination || !ownedMap) throw Error('audit-workspaces-native <Spark.exe> <fresh-output> <owned-map>');
const root = path.resolve(destination), expect = assertion.configure({ timeout: 90000 });
await fs.mkdir(root);
const exe = path.join(root, 'GuiltySpark-audit.exe');
await fs.copyFile(path.resolve(application), exe, fs.constants.COPYFILE_EXCL);
const digest = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const sourceHash = await digest(ownedMap);
const report = { schemaVersion: 1, appSha256: await digest(exe), mockedIpc: false,
  originalMapSha256: sourceHash, monitorTransferTested: false, dpiEmulated: true,
  complete: false, routes: [], errors: [] };
const socket = net.createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const child = spawn(exe, [], { windowsHide: true, stdio: 'ignore', env: { ...process.env,
  GUILTY_SPARK_DATA_DIR: path.join(root, 'library'), WEBVIEW2_USER_DATA_FOLDER: path.join(root, 'webview'),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` } });
const routes = ['library','map-finder','get-started','features','learning','how-to','community','world','tags','assets','scenario','build','preservation','settings','compare','runtimes','live','quickforge','firefight','interface','creator','machinima','academy'];
const mapRoutes = new Set(['world','tags','assets','scenario','build','preservation','compare','live','quickforge','firefight','creator','machinima']);
let browser, main;
const invoke = (page, command, args = {}) => page.evaluate(({command,args}) => window.__TAURI_INTERNALS__.invoke(command,args), {command,args});
const save = () => fs.writeFile(path.join(root, 'audit.json'), JSON.stringify(report, null, 2));
async function layout(page) {
  return page.evaluate(() => {
    const rendered = element => !!element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
    const clipped = [], routedToMore = [];
    for (const element of document.querySelectorAll('button,input,select,textarea,[role="tab"]')) {
      if (!rendered(element)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.right <= innerWidth + 2 && rect.left >= -2) continue;
      const panelName = element.getAttribute('aria-label')?.replace(/^Toggle /, '');
      const menu = document.querySelector('.gs-panel-overflow');
      if (element.closest('.gs-panel-buttons') && menu && rendered(menu) &&
          [...menu.querySelectorAll('button')].some(button => button.textContent.trim() === panelName)) {
        routedToMore.push(panelName); continue;
      }
      // A reachable scrollable toolbar/list is not a clipped control.
      let ancestor = element.parentElement, scrollable = false;
      while (ancestor && ancestor !== document.body) {
        if (/(auto|scroll)/.test(getComputedStyle(ancestor).overflowX) && ancestor.scrollWidth > ancestor.clientWidth) { scrollable = true; break; }
        ancestor = ancestor.parentElement;
      }
      if (!scrollable) clipped.push({ name: (element.getAttribute('aria-label') || element.textContent || element.getAttribute('placeholder') || element.tagName).trim().slice(0,90), left: Math.round(rect.left), right: Math.round(rect.right) });
    }
    const main = document.querySelector('.gs-workspace-shell');
    const scrollAreas = [...document.querySelectorAll('main,section,aside,[role="tabpanel"],.gs-panel-content,.gs-workspace-content,.gs-settings-workspace,.interface-studio')].filter(element => {
      const css = getComputedStyle(element);
      return rendered(element) && /(auto|scroll)/.test(css.overflowY) && element.scrollHeight > element.clientHeight + 3;
    }).map(element => ({ className: element.className, available: element.clientHeight, content: element.scrollHeight }));
    const header=document.querySelector('.gs-compact-header');
    const controls=[...(header?.querySelectorAll('button,input,select,summary')??[])].filter(element=>{
      if(!rendered(element))return false;
      for(let p=element.parentElement;p&&p!==header;p=p.parentElement)
        if(p instanceof HTMLDetailsElement&&!p.open&&element!==p.querySelector(':scope>summary')&&!p.querySelector(':scope>summary')?.contains(element))return false;
      const r=element.getBoundingClientRect(),x=(r.left+r.right)/2,y=(r.top+r.bottom)/2;
      if(r.width<2||x<0||x>innerWidth||y<0||y>innerHeight)return false;
      for(let p=element.parentElement;p&&p!==header;p=p.parentElement){
        const css=getComputedStyle(p),b=p.getBoundingClientRect();
        if(/hidden|auto|scroll/.test(css.overflowX)&&(r.left<b.left-1||r.right>b.right+1))return false;
      }
      return true;
    });
    const headerOverlaps=[];
    for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){
      const a=controls[i],b=controls[j];if(a.contains(b)||b.contains(a))continue;
      const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();
      if(Math.min(ar.right,br.right)-Math.max(ar.left,br.left)>3&&Math.min(ar.bottom,br.bottom)-Math.max(ar.top,br.top)>3)
        headerOverlaps.push([a.getAttribute('aria-label')||a.textContent.trim(),b.getAttribute('aria-label')||b.textContent.trim()]);
    }
    return { viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },headerOverlaps,
      workspace: main?.getAttribute('data-workspace'), headings: [...document.querySelectorAll('h1')].filter(rendered).map(element => element.textContent),
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 2, clippedControls: clipped.slice(0,24), routedToMore, scrollAreas,
      closeButtons: [...document.querySelectorAll('button[aria-label="Close window"]')].filter(rendered).length };
  });
}
try {
  await expect.poll(() => fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.ok, () => false)).toBe(true);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect.poll(() => !!(main = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('tauri.localhost')))).toBe(true);
  const boot = await invoke(main, 'bootstrap');
  await invoke(main, 'save_settings', {settings:{...boot.settings,onboardingCompleted:true,autoBuild:false}});
  const open = (await invoke(main, 'import_paths', { paths: [path.resolve(ownedMap)] }))[0];
  const forge = await invoke(main, 'create_quickforge_project', {title:'C50 layout arena',template:'smallIndoorArena',target:'mccSteam'});
  const requested=profileBsp?['bsp-workshop']:[...routes,'quickforge-arena','bsp-workshop'];
  if(only?.some(route=>!requested.includes(route)))throw Error('Unknown audit route');
  for (const route of requested.filter(route=>!only||only.includes(route))) {
    const workspace = route === 'quickforge-arena' || route === 'bsp-workshop' ? 'world' : route;
    const document = route === 'quickforge-arena' || route === 'bsp-workshop' ? forge : open;
    const pages = new Set(browser.contexts().flatMap(c => c.pages()));
    const label = mapRoutes.has(workspace)
      ? await invoke(main, 'open_project_window', {id:document.project.id,workspace,observe:false})
      : await invoke(main, 'open_workspace_window', {workspace,context:null,section:null});
    let page;
    await expect.poll(() => !!(page = browser.contexts().flatMap(c => c.pages()).find(p => !pages.has(p) && p.url().includes('tauri.localhost')))).toBe(true);
    page.on('pageerror', error => report.errors.push({workspace,error:String(error)}));
    await expect(page.locator('.gs-workspace-shell')).toBeVisible();
    await expect(page.getByRole('button',{name:'Close window',exact:true})).toHaveCount(1);
    if (mapRoutes.has(workspace)) await expect(page.getByRole('tab').filter({hasText:document.project.title}).first()).toBeVisible();
    // A shell can precede the lazy workspace by several frames. Never audit
    // blank fallback content as a compact, successful layout.
    await expect.poll(() => page.evaluate(() => {
      const content = document.querySelector('.gs-workspace-content');
      return !!content && content.textContent.trim().length > 100 && !content.querySelector('.loading');
    })).toBe(true);
    if (route === 'bsp-workshop') {
      await page.getByRole('button',{name:'BSP Workshop',exact:true}).click();
      await page.getByRole('button',{name:'Two rooms + corridor + ramp',exact:true}).click();
      await expect(page.getByLabel('Native BSP Workshop')).toBeVisible();
      await expect(page.locator('.bsp-views .bsp-view')).toHaveCount(4);
      await expect(page.locator('.bsp-views canvas')).toHaveCount(1);
      await expect(page.locator('.bsp-views svg.bsp-ortho')).toHaveCount(3);
    }
    const entry = { workspace:route, nativeWindow: true, sizes: [], subviews: [] };
    report.routes.push(entry);
    const cdp = await page.context().newCDPSession(page);
    for (const size of [{width:800,height:600,dpr:1},{width:1280,height:720,dpr:1},{width:1920,height:1080,dpr:1},{width:1280,height:720,dpr:2}]) {
      await invoke(page, 'plugin:window|set_size', {label,value:{Logical:{width:size.width,height:size.height}}});
      const actual = await invoke(page, 'plugin:window|inner_size', {label});
      await cdp.send('Emulation.setDeviceMetricsOverride',{width:size.width,height:size.height,deviceScaleFactor:size.dpr,mobile:false});
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const result = await layout(page);
      if (result.routedToMore.length) {
        await page.getByLabel('More workspace drawers',{exact:true}).click();
        const menu = page.getByRole('menu',{name:'Workspace drawers',exact:true});
        for (const name of result.routedToMore) await expect(menu.getByRole('menuitemcheckbox',{name,exact:true})).toBeVisible();
        await page.getByLabel('More workspace drawers',{exact:true}).click();
      }
      entry.sizes.push({...result,requested:size,nativeSize:actual});
      if (size.width === 800 || size.width === 1920) await page.screenshot({path:path.join(root,`${route}-${size.width}.png`)});
    }
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
    // Exercise visible subview tabs, without map tabs or destructive actions.
    const names = await page.locator('[role="tablist"] button[role="tab"]').evaluateAll(elements => elements.filter(e => !e.closest('.map-tabs')).map(e => e.getAttribute('aria-label') || e.textContent.trim()));
    for (const name of [...new Set(names)]) {
      const tab = page.getByRole('tab',{name,exact:true});
      if (await tab.count() !== 1 || !await tab.isVisible()) continue;
      await tab.click();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      entry.subviews.push({ name, ...await layout(page) });
    }
    if (profileBsp) {
      await expect.poll(()=>page.getByLabel('Native BSP Workshop').getAttribute('data-textures')).not.toBe('0');
      await page.keyboard.press('Control+s');
      let saved;
      await expect.poll(async()=>!!((saved=await invoke(page,'open_project',{id:document.project.id})).project.quickForge.workshop)).toBe(true);
      const mesh=await invoke(page,'quickforge_preview',{document:saved.project.quickForge});
      const geometry={positions:mesh.positions,normals:mesh.normals,uvs:mesh.uvs,indices:mesh.indices};
      report.bspProfile={geometrySha256:crypto.createHash('sha256').update(JSON.stringify(geometry)).digest('hex'),sourceVertices:mesh.positions.length/3,sourceTriangles:mesh.indices.length/3,textures:Number(await page.getByLabel('Native BSP Workshop').getAttribute('data-textures')),samples:[]};
      await page.locator('.bsp-views canvas').evaluate(canvas=>{
        const gl=canvas.getContext('webgl2'),clear=gl.clear.bind(gl);
        window.__bspProfile={draws:0,canvas,gl};
        gl.clear=(...args)=>{window.__bspProfile.draws++;return clear(...args);};
      });
      await page.waitForTimeout(1500);
      const processSnapshot=async()=>JSON.parse((await promisify(execFile)('pwsh.exe',['-NoProfile','-File',path.resolve('scripts/profile-process-tree.ps1'),'-RootProcessId',String(child.pid)],{windowsHide:true,maxBuffer:1024*1024})).stdout);
      for(let sample=0;sample<3;sample++) {
        const before=await processSnapshot(),draws=await page.evaluate(()=>window.__bspProfile.draws);
        await page.waitForTimeout(2000);
        const after=await processSnapshot();
        report.bspProfile.samples.push({before,after,draws:await page.evaluate(()=>window.__bspProfile.draws)-draws,cpuOneCorePercent:100*(after.cpuSeconds-before.cpuSeconds)/((after.timestamp-before.timestamp)/1000)});
      }
      const canvas=page.locator('.bsp-views canvas'),box=await canvas.boundingBox();
      const prior=await canvas.getAttribute('data-gs-camera-pose');
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down({button:'right'});
      await page.keyboard.down('w');await page.waitForTimeout(500);await page.keyboard.up('w');await page.mouse.up({button:'right'});
      await expect(canvas).not.toHaveAttribute('data-gs-camera-pose',prior);
      report.bspProfile.cameraFlightVerified=true;
    }
    await save();
    console.log(JSON.stringify({workspace,clipped:entry.sizes.map(s => s.clippedControls.length),subviews:entry.subviews.length}));
    await invoke(page,'close_application').catch(error => {
      if (!/Target page, context or browser has been closed/.test(String(error))) throw error;
    });
    await expect.poll(() => page.isClosed()).toBe(true);
  }
  report.originalMapUnchanged = await digest(ownedMap) === sourceHash;
  if(strict)for(const entry of report.routes)for(const view of [...entry.sizes,...entry.subviews])
    if(view.pageOverflow||view.clippedControls.length||view.headerOverlaps.length)
      throw Error(`Unreachable/overlapping controls in ${entry.workspace}, ${view.name??view.viewport.width}`);
  expect(report.originalMapUnchanged).toBe(true);
  expect(report.errors).toEqual([]);
  report.complete = true;
} catch (error) { report.errors.push(String(error)); process.exitCode = 1; }
finally {
  await save();
  if (main) await invoke(main,'close_application').catch(()=>{});
  await browser?.close().catch(()=>{});
  if (child.exitCode === null) child.kill();
}
