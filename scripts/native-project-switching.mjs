import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {expect} from '@playwright/test';
import {chooseTool,openStudioMenu,openViewMenu,revealPagedControl} from '../tests/ui/helpers/navigation.ts';

// Real embedded WebViews, native document journals and files. Only the small
// initial source fixtures use IPC setup; every acceptance action uses controls.
export async function nativeProjectSwitching({page,root,invoke,report,step,openProject,inspector,x,setX,state,acknowledged,pages,nextPage,restart,baseline=false}){
 const make=title=>invoke(page,'create_quickforge_project',{title,template:'smallIndoorArena',target:'haloCustomEdition'});
 const a=await make('UI audit project A'),b=await make('UI audit project B'),c=await make('UI audit project C');
 await page.reload();await openProject(page,c.project.title);await page.keyboard.press('Control+s');const cfile=path.join(root,'library','projects',c.project.id,'project.gsproject');await expect.poll(()=>fs.stat(cfile).then(s=>s.isFile(),()=>false)).toBe(true);await page.getByRole('button',{name:'Close map '+c.project.title,exact:true}).click();await openProject(page,b.project.title);await page.keyboard.press('Control+s');
 const bfile=path.join(root,'library','projects',b.project.id,'project.gsproject');await expect.poll(()=>fs.stat(bfile).then(s=>s.isFile(),()=>false)).toBe(true);
 await page.getByRole('button',{name:'Close map '+b.project.title,exact:true}).click();
 await openProject(page,a.project.title);await page.keyboard.press('Control+s');await inspector(page,true);
 const afile=path.join(root,'library','projects',a.project.id,'project.gsproject');await expect.poll(()=>fs.stat(afile).then(s=>s.isFile(),()=>false)).toBe(true);const original=await x(page).inputValue(),savedBefore=await fs.readFile(afile);
 await setX(page,.75);await acknowledged(page,a.project.id,.75);
 await page.getByLabel('Choose open map',{exact:true}).click();
 const maps=page.getByRole('menu',{name:'Open map switcher',exact:true}),browse=maps.getByRole('menuitem',{name:'Open saved project…',exact:true});
 await page.screenshot({path:path.join(root,baseline?'project-picker-before.png':'project-picker-after.png')});
 report.projectSwitching={a:a.project.id,b:b.project.id,c:c.project.id,baseline,original,initialDraft:.75,savedBeforeSha256:crypto.createHash('sha256').update(savedBefore).digest('hex')};
 if(baseline){expect(await browse.count()).toBe(0);await page.keyboard.press('Escape');await page.keyboard.press('Control+Shift+p');const work=page.getByRole('dialog',{name:'Open work',exact:true});expect(await work.getByRole('tab',{name:'Saved projects',exact:true}).count()).toBe(0);await page.screenshot({path:path.join(root,'project-work-before.png')});await page.keyboard.press('Escape');step('Baseline reproduces missing saved-project action in Maps and Work; B is saved but not open',report.projectSwitching);return;}
 await expect(page.getByLabel('Choose open map',{exact:true})).toHaveAttribute('title',/Open saved project/);
 await browse.click();let work=page.getByRole('dialog',{name:'Open work',exact:true});await expect(work.getByRole('tab',{name:'Saved projects',exact:true})).toHaveAttribute('aria-selected','true');await work.getByLabel('Search open work',{exact:true}).fill('project B');await work.getByRole('button',{name:'Open saved project '+b.project.title,exact:true}).click();
 await expect(page.getByRole('tab',{name:b.project.title,exact:true})).toHaveAttribute('aria-selected','true');await inspector(page,true);await setX(page,1.25);await acknowledged(page,b.project.id,1.25);
 await page.getByRole('tab',{name:a.project.title,exact:true}).click();await expect(x(page)).toHaveValue('0.75');
 const atab=page.getByRole('tab',{name:a.project.title,exact:true});await expect(atab).toHaveAttribute('aria-description','Unsaved changes');expect(await fs.readFile(afile)).toEqual(savedBefore);
 await atab.focus();await page.keyboard.press('Control+z');await expect(x(page)).toHaveValue(original);await page.keyboard.press('Control+Shift+z');await expect(x(page)).toHaveValue('0.75');
 await page.keyboard.press('Control+Shift+p');work=page.getByRole('dialog',{name:'Open work',exact:true});await work.getByRole('tab',{name:'Open work',exact:true}).click();await work.getByLabel('Workspace in this window',{exact:true}).selectOption('features');await expect(page.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace','features');await expect(atab).toHaveAttribute('aria-selected','true');
 await page.getByLabel('File menu',{exact:true}).click();const file=page.getByRole('menu',{name:'File commands',exact:true}),saved=file.getByRole('menuitem',{name:'Open saved project…',exact:true,includeHidden:true});await revealPagedControl(saved);await saved.click();work=page.getByRole('dialog',{name:'Open work',exact:true});await work.getByLabel('Search open work',{exact:true}).fill('project A');await work.getByRole('button',{name:'Open saved project '+a.project.title,exact:true}).click();await expect(page.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace','level');await expect(x(page)).toHaveValue('0.75');
 await page.keyboard.press('Control+Shift+p');await work.getByLabel('Search open work',{exact:true}).fill('project C');const beforeSavedWindow=new Set(pages());await work.getByRole('button',{name:'Open saved project '+c.project.title+' in another window',exact:true}).click();const savedWindow=await nextPage(beforeSavedWindow);await inspector(savedWindow,true);expect((await state(savedWindow,c.project.id)).writable).toBe(true);await setX(savedWindow,2);await acknowledged(savedWindow,c.project.id,2);await expect(atab).toHaveAttribute('aria-selected','true');await expect(x(page)).toHaveValue('0.75');await savedWindow.keyboard.press('Control+s');await expect(savedWindow.getByRole('tab',{name:c.project.title,exact:true})).not.toHaveAttribute('aria-description','Unsaved changes');await savedWindow.getByRole('button',{name:'Close window',exact:true}).click();await expect.poll(()=>savedWindow.isClosed()).toBe(true);await expect(atab).toHaveAttribute('aria-selected','true');report.projectSwitching.unopenedProjectOwnWindow=true;
 await page.keyboard.press('Control+Shift+p');await work.getByLabel('Search open work',{exact:true}).fill('project B');const before=new Set(pages());await work.getByRole('button',{name:'Open saved project '+b.project.title+' in another window',exact:true}).click();let view=await nextPage(before);await inspector(view);await expect(x(view)).toHaveValue('1.25');await expect(atab).toHaveAttribute('aria-selected','true');expect((await state(page,b.project.id)).writable).toBe(true);expect((await state(view,b.project.id)).writable).toBe(false);
 await chooseTool(view,'Features & workflows');await expect(page.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace','level');await view.getByRole('button',{name:'Close window',exact:true}).click();await expect.poll(()=>view.isClosed()).toBe(true);
 await page.getByLabel('Choose open map',{exact:true}).click();const beforeMove=new Set(pages());await maps.getByRole('button',{name:'Move '+a.project.title+' to another window',exact:true}).click();const moved=await nextPage(beforeMove);await inspector(moved);await expect(x(moved)).toHaveValue('0.75');expect((await state(moved,a.project.id)).writable).toBe(true);expect((await state(page,a.project.id)).writable).toBe(false);
 await moved.getByRole('tab',{name:a.project.title,exact:true}).focus();await moved.keyboard.press('Control+z');await expect(x(moved)).toHaveValue(original);await moved.keyboard.press('Control+Shift+z');await expect(x(moved)).toHaveValue('0.75');await moved.getByRole('button',{name:'Return map to workspace',exact:true}).click();await expect.poll(async()=>(await state(page,a.project.id)).writable).toBe(true);if(!moved.isClosed()){await moved.getByRole('button',{name:'Close window',exact:true}).click();}
 await expect(page.getByRole('tab',{name:a.project.title,exact:true})).toHaveAttribute('aria-selected','true');await expect(x(page)).toHaveValue('0.75');
 await page.getByRole('tab',{name:b.project.title,exact:true}).click();await expect(x(page)).toHaveValue('1.25');await page.keyboard.press('Control+s');await page.getByRole('tab',{name:a.project.title,exact:true}).click();await page.keyboard.press('Control+s');await expect(page.getByRole('tab',{name:a.project.title,exact:true})).not.toHaveAttribute('aria-description','Unsaved changes');
 const savedAfter=await fs.readFile(afile);expect(savedAfter).not.toEqual(savedBefore);
 const savedB=await fs.readFile(bfile),savedC=await fs.readFile(cfile);const descriptorValues=[savedAfter,savedB,savedC].map(bytes=>JSON.parse(bytes.toString('utf8')).quickForge.geometry[0].position[0]);expect(descriptorValues).toEqual([.75,1.25,2]);report.projectSwitching.independentDescriptorReadback={values:descriptorValues,sha256:[savedAfter,savedB,savedC].map(bytes=>crypto.createHash('sha256').update(bytes).digest('hex'))};
report.projectSwitching.savedAfterSha256=crypto.createHash('sha256').update(savedAfter).digest('hex');report.projectSwitching.singleWriterAndIndependentView=true;
 await page.screenshot({path:path.join(root,'project-draft-after.png')});
 await chooseTool(page,'Settings & tools');await page.getByRole('tab',{name:'Interface Studio',exact:true}).click();const restore=page.getByRole('checkbox',{name:'Restore my saved workspace layout on launch',exact:true,includeHidden:true});await revealPagedControl(restore);await restore.check();await page.getByRole('tab',{name:a.project.title,exact:true}).click();
 await openViewMenu(page);const layout=page.getByRole('button',{name:'Save workspace windows',exact:true,includeHidden:true});await revealPagedControl(layout);await layout.click();await expect(page.getByText(/Saved “Studio”/)).toBeVisible();await page.keyboard.press('Escape');
 const savedLayout=await invoke(page,'read_workspace_layout',{name:'Studio'});expect(savedLayout.windows.some(w=>w.main&&w.view.project===a.project.id&&w.view.documents.includes(b.project.id))).toBe(true);report.projectSwitching.restoreMode='Existing opt-in saved workspace layout, configured and saved through Settings/View controls';
 page=await restart();await expect(page.getByRole('tab',{name:a.project.title,exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByRole('tab',{name:b.project.title,exact:true})).toBeVisible();await expect(page.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace','level');await inspector(page);await expect(x(page)).toHaveValue('0.75');await page.getByRole('tab',{name:a.project.title,exact:true}).focus();await page.keyboard.press('Control+z');await expect(x(page)).toHaveValue(original);await page.keyboard.press('Control+Shift+z');await expect(x(page)).toHaveValue('0.75');
 await page.screenshot({path:path.join(root,'project-restart-after.png')});await projectPickerLayouts({page,root,invoke,report});page=await nativeWorkspaceScrollRestart({page,root,invoke,report,step,restart,inspector,x});if(process.env.SPARK_PROJECT_SWITCH_REVIEW==='1'){console.log('NATIVE_PROJECT_REVIEW_READY',JSON.stringify({root,url:page.url()}));await new Promise(resolve=>setTimeout(resolve,180000));await page.screenshot({path:path.join(root,'physical-input-after.png')});}
 report.projectSwitching.restartRestored=true;report.projectSwitching.unsavedAndUndoPreserved=true;step('File/Maps saved-project picker, unsaved A/B isolation, independent view, ownership transfer/return, explicit Save and full native restart retain histories',report.projectSwitching);
}


async function projectPickerLayouts({page,root,invoke,report}){
 const label=await page.evaluate(()=>window.__TAURI_INTERNALS__.metadata.currentWindow.label);
 await chooseTool(page,'Settings & tools');await page.getByRole('tab',{name:'Interface Studio',exact:true}).click();const scale=page.getByRole('combobox',{name:'UI scale',exact:true,includeHidden:true});await revealPagedControl(scale);await scale.selectOption('1');
 await page.getByRole('tab',{name:'UI audit project A',exact:true}).click();
 await page.locator('.forge-viewport canvas').evaluate(canvas=>{window.__uiProjectCanvas=canvas;});report.projectPickerLayouts=[];
 const bounds=scope=>scope.evaluate(root=>{const controls=[...root.querySelectorAll('button,input,select,summary')].filter(node=>node.getClientRects().length&&!node.closest('[hidden],[inert]')&&getComputedStyle(node).visibility!=='hidden');return {controls:controls.length,unreachable:controls.flatMap(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width<1||r.height<1||r.left<-.5||r.top<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5||!hit||!node.contains(hit)?[{label:node.getAttribute('aria-label')??node.textContent,bounds:{x:r.x,y:r.y,width:r.width,height:r.height}}]:[];}),scrolling:[...root.querySelectorAll('*')].filter(node=>/auto|scroll/.test(getComputedStyle(node).overflowY)&&node.scrollHeight>node.clientHeight+1).map(node=>node.className)};});
 for(const [width,height]of [[800,600],[1280,720],[1366,768],[1500,950],[1920,1080],[2560,1080],[3440,1440],[5120,1440]]){
  await invoke(page,'plugin:window|set_size',{label,value:{Logical:{width,height}}});await expect.poll(()=>page.evaluate(()=>[innerWidth,innerHeight])).toEqual([width,height]);
  await page.getByLabel('Choose open map',{exact:true}).click();const maps=await bounds(page.getByRole('menu',{name:'Open map switcher',exact:true}));expect(maps.unreachable).toEqual([]);expect(maps.scrolling).toEqual([]);await page.getByRole('menuitem',{name:'Open saved project…',exact:true}).click();const work=await bounds(page.getByRole('dialog',{name:'Open work',exact:true}));expect(work.unreachable).toEqual([]);expect(work.scrolling).toEqual([]);const screenshot='native-project-picker-'+width+'x'+height+'.png';await page.screenshot({path:path.join(root,screenshot)});await page.keyboard.press('Escape');expect(await page.locator('.forge-viewport canvas').evaluate(canvas=>canvas===window.__uiProjectCanvas)).toBe(true);
  report.projectPickerLayouts.push({width,height,maps,work,screenshot,canvasRetained:true,devicePixelRatio:await page.evaluate(()=>devicePixelRatio)});
 }
 await invoke(page,'plugin:window|set_size',{label,value:{Logical:{width:1500,height:950}}});await page.keyboard.press('F11');await expect.poll(()=>invoke(page,'plugin:window|is_fullscreen',{label})).toBe(true);await page.getByLabel('Choose open map',{exact:true}).click();expect((await bounds(page.getByRole('menu',{name:'Open map switcher',exact:true}))).unreachable).toEqual([]);await page.keyboard.press('Escape');await page.keyboard.press('F11');await expect.poll(()=>invoke(page,'plugin:window|is_fullscreen',{label})).toBe(false);report.projectPickerFullscreen=true;
 const studio=await openStudioMenu(page);await studio.getByLabel('Active Halo runtime',{exact:true}).selectOption('chupathingyCe');await studio.getByLabel('Studio options',{exact:true}).click();const host=page.getByRole('contentinfo',{name:'Runtime & Tools Dock',exact:true}).getByRole('button',{name:/^Host /});await expect(host).toHaveAttribute('data-state','setupRequired');await expect(host).toHaveAttribute('title',/Private Chupathingy dedicated server/);await host.click();await expect(page.getByRole('region',{name:'Private Chupathingy dedicated server',exact:true})).toBeVisible();report.chupathingyHostRoute={from:'Runtime dock Host',to:'Online > Host game > Private Chupathingy dedicated server',setupRequired:true,serverStarted:false};
}

// Extend the existing native close/restart journey; browser reload and
// leave/return evidence do not prove a new application process restores scroll.
async function nativeWorkspaceScrollRestart({page,root,invoke,report,step,restart,inspector,x}){
 const label=await page.evaluate(()=>window.__TAURI_INTERNALS__.metadata.currentWindow.label);
 await invoke(page,'plugin:window|set_size',{label,value:{Logical:{width:800,height:600}}});
 await expect.poll(()=>page.evaluate(()=>[innerWidth,innerHeight])).toEqual([800,600]);
 await chooseTool(page,'Settings & tools');await page.getByRole('tab',{name:'Interface Studio',exact:true}).click();
 let surface=page.locator('[data-surface="settings-interface"]'),view=surface.locator(':scope > .gs-page-viewport');
 await expect(surface).toHaveAttribute('data-navigation','scroll');await expect(surface).toHaveAttribute('data-pages','1');
 await expect(surface.locator('.gs-surface-pages')).toHaveCount(0);
 await expect.poll(()=>view.evaluate(node=>node.scrollHeight-node.clientHeight)).toBeGreaterThan(100);
 await view.focus();await page.keyboard.press('PageDown');await expect.poll(()=>view.evaluate(node=>node.scrollTop)).toBeGreaterThan(30);
 await page.keyboard.press('End');await expect.poll(()=>view.evaluate(node=>Math.abs(node.scrollHeight-node.clientHeight-node.scrollTop))).toBeLessThan(2);
 const before=await view.evaluate(node=>({top:node.scrollTop,maximum:node.scrollHeight-node.clientHeight}));
 expect(before.top).toBeGreaterThan(100);await expect(surface.locator('[data-gs-offpage]')).toHaveCount(0);
 await openViewMenu(page);const layout=page.getByRole('button',{name:'Save workspace windows',exact:true,includeHidden:true});await revealPagedControl(layout);await layout.click();
 await expect(page.getByText(/Saved “Studio”/)).toBeVisible();await page.keyboard.press('Escape');
 const saved=await invoke(page,'read_workspace_layout',{name:'Studio'});expect(saved.windows.some(row=>row.main&&row.view.workspace==='settings')).toBe(true);
 await expect.poll(()=>view.evaluate((node,top)=>Math.abs(node.scrollTop-top),before.top)).toBeLessThan(2);
 await page.screenshot({path:path.join(root,'native-workspace-scroll-before-restart.png')});
 page=await restart();await expect(page.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace','settings');
 await expect(page.getByRole('tab',{name:'Interface Studio',exact:true})).toHaveAttribute('aria-selected','true');
 surface=page.locator('[data-surface="settings-interface"]');view=surface.locator(':scope > .gs-page-viewport');
 await expect(surface).toHaveAttribute('data-navigation','scroll');await expect(surface).toHaveAttribute('data-pages','1');await expect(surface.locator('.gs-surface-pages')).toHaveCount(0);
 await expect.poll(()=>view.evaluate((node,top)=>Math.abs(node.scrollTop-top),before.top)).toBeLessThan(2);
 const after=await view.evaluate(node=>({top:node.scrollTop,maximum:node.scrollHeight-node.clientHeight,horizontalOverflow:node.scrollWidth-node.clientWidth}));
 expect(after.horizontalOverflow).toBeLessThanOrEqual(1);await expect(surface.locator('[data-gs-offpage]')).toHaveCount(0);
 await page.screenshot({path:path.join(root,'native-workspace-scroll-after-restart.png')});
 await view.focus();await page.keyboard.press('Home');await expect.poll(()=>view.evaluate(node=>node.scrollTop)).toBe(0);
 await surface.getByRole('searchbox',{name:'Find in Settings interface',exact:true}).fill('Reset glow colors');
 const action=surface.getByRole('button',{name:'Reset glow colors',exact:true});await expect(action).toBeInViewport();await action.click();
 await page.getByRole('tab',{name:'UI audit project A',exact:true}).click();
 // Small windows collapse inactive tabs into the actual Maps menu. Prove the
 // retained documents by switching to them, rather than requiring wide tabs.
 const maps=page.getByRole('menu',{name:'Open map switcher',exact:true});
 await page.getByLabel('Choose open map',{exact:true}).click();await maps.getByRole('menuitemradio',{name:'UI audit project B',exact:true}).click();
 await inspector(page);await expect(x(page)).toHaveValue('1.25');
 await page.getByLabel('Choose open map',{exact:true}).click();await maps.getByRole('menuitemradio',{name:'UI audit project A',exact:true}).click();
 await inspector(page);await expect(x(page)).toHaveValue('0.75');await page.getByRole('tab',{name:'UI audit project A',exact:true}).focus();
 await page.keyboard.press('Control+z');await expect(x(page)).toHaveValue('0');await page.keyboard.press('Control+Shift+z');await expect(x(page)).toHaveValue('0.75');
 report.nativeWorkspaceScrollRestart={requested:{width:800,height:600},before,after,continuousPages:1,actualApplicationRestart:true,settingsWorkspaceRestored:true,findAndKeyboardAccessible:true,openMapsRetained:true,mapMenuValues:[.75,1.25],sourceUndoRedoRetained:true};
 step('One continuous native Settings workspace restores its scroll after full application restart; keyboard and Find remain usable',report.nativeWorkspaceScrollRestart);
 return page;
}
