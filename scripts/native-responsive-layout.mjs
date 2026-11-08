import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {expect} from '@playwright/test';
import {chooseTool,openDrawer,openViewMenu,openStudioMenu,revealPagedControl} from '../tests/ui/helpers/navigation.ts';
import {auditPagedSurface} from '../tests/ui/helpers/compactSurfaces.ts';
// Called by the existing owned native-window harness. Window sizes are native
// Tauri requests, never browser device-metric emulation. Physical hardware and
// human mouse/monitor acceptance remain separate from WebView screenshots.
export async function nativeResponsiveLayout({page,root,invoke,report,step,baseline=false}){
 const label=await page.evaluate(()=>window.__TAURI_INTERNALS__.metadata.currentWindow.label);
 const hardware=await invoke(page,'plugin:window|available_monitors');
 report.responsive={baseline,devicePixelRatio:await page.evaluate(()=>devicePixelRatio),hardware,results:[],physicalDpiChangesTested:false,physicalMonitorDisconnectTested:false};
 await invoke(page,'plugin:window|unmaximize',{label});
 await chooseTool(page,'Settings & tools');
 if(!baseline){
  await page.getByRole('tab',{name:'Interface Studio',exact:true}).click();
  const scale=page.getByRole('combobox',{name:'UI scale',exact:true,includeHidden:true});await revealPagedControl(scale);await scale.selectOption('1');
  await expect(page.locator('html')).toHaveAttribute('data-gs-ui-scale','1');
  await page.getByRole('tab',{name:'Games & tools',exact:true}).click();
 }
 await expect(page.getByRole('heading',{name:'Games & tools',exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'Tools',exact:true}).click();
 await expect(page.getByRole('region',{name:'Source-aware editing tools',exact:true}).getByRole('button',{name:'Recheck tools',exact:true})).toBeEnabled({timeout:45000});
 for(const [width,height]of [[800,600],[1280,720],[1366,768],[1500,950],[1920,1080],[2560,1080],[3440,1440],[5120,1440]]){
  await invoke(page,'plugin:window|set_size',{label,value:{Logical:{width,height}}});
  await expect.poll(()=>page.evaluate(()=>[innerWidth,innerHeight])).toEqual([width,height]);
  const surfaces=[];
  if(!baseline){for(const name of ['Tools','Runtime setup','Packs','Preferences']){await page.getByRole('tab',{name,exact:true}).click();try{if(name==='Preferences')await expect(page.getByRole('heading',{name:'Folders & preferences',exact:true})).toBeVisible({timeout:45000});surfaces.push(await auditPagedSurface(page.locator('.games-tools-pane:visible > .gs-paged-surface')));}catch(error){report.responsive.failure={width,height,section:name,panes:await page.locator('.games-tools-pane').evaluateAll(nodes=>nodes.map(node=>({hidden:node.hidden,rect:JSON.stringify(node.getBoundingClientRect()),style:getComputedStyle(node).display}))),text:(await page.locator('main').innerText()).slice(0,1500)};await page.screenshot({path:path.join(root,'native-layout-failure.png')});throw error;}}await page.getByRole('tab',{name:'Tools',exact:true}).click();}
  const bounds=await page.evaluate(()=>({width:innerWidth,height:innerHeight,horizontalOverflow:document.documentElement.scrollWidth-innerWidth,verticalOverflow:document.documentElement.scrollHeight-innerHeight,scrollingControls:[...document.querySelectorAll('*')].flatMap(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width&&r.height&&!node.closest('[hidden],[inert]')&&s.visibility!=='hidden'&&/auto|scroll/.test(s.overflowY)&&node.scrollHeight>node.clientHeight+1?[{className:node.className,height:node.clientHeight,content:node.scrollHeight}]:[];})}));
  if(!baseline){expect(bounds.horizontalOverflow).toBeLessThanOrEqual(1);expect(bounds.scrollingControls).toEqual([]);}
  const screenshot='native-games-tools-'+width+'x'+height+'.png';await page.screenshot({path:path.join(root,screenshot)});
  const result={requested:{width,height},...bounds,screenshot,surfaces};report.responsive.results.push(result);
  await fs.writeFile(path.join(root,'responsive-layout.json'),JSON.stringify(report.responsive,null,2));
  step((baseline?'Before-layout baseline':'Native paged control bounds')+' '+width+'x'+height,{controls:surfaces.reduce((n,s)=>n+s.controls,0),screenshot});
 }
 await invoke(page,'plugin:window|set_size',{label,value:{Logical:{width:800,height:600}}});
 if(!baseline){
  await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();report.responsive.navigation=await auditPagedSurface(page.locator('[data-surface="navigation"]'));await page.screenshot({path:path.join(root,'native-navigation-800x600.png')});await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();
  const view=await openViewMenu(page);report.responsive.view=await auditPagedSurface(view.locator('[data-surface="view-menu"]'));await page.screenshot({path:path.join(root,'native-view-800x600.png')});await page.keyboard.press('Escape');
  await page.getByLabel('File menu',{exact:true}).click();report.responsive.file=await auditPagedSurface(page.locator('[data-surface="file-menu"]'));await page.keyboard.press('Escape');
 }
 if(!baseline){
  await invoke(page,'plugin:window|set_size',{label,value:{Logical:{width:1280,height:720}}});
  report.responsive.monitorTransfers=[];
  for(const monitor of hardware){const position={x:monitor.workArea.position.x+40,y:monitor.workArea.position.y+40};await invoke(page,'plugin:window|set_position',{label,value:{Physical:position}});const actual=await invoke(page,'plugin:window|current_monitor',{label});expect(actual.name).toBe(monitor.name);report.responsive.monitorTransfers.push({name:actual.name,scaleFactor:actual.scaleFactor,requested:position});}
  const view=await openViewMenu(page);await view.getByRole('button',{name:'Fullscreen editing',exact:true}).click();await expect.poll(()=>invoke(page,'plugin:window|is_fullscreen',{label})).toBe(true);await page.screenshot({path:path.join(root,'native-fullscreen.png')});await page.keyboard.press('F11');await expect.poll(()=>invoke(page,'plugin:window|is_fullscreen',{label})).toBe(false);
  report.responsive.fullscreenToggle=true;
 }
 if(!baseline){
  await invoke(page,'plugin:window|set_size',{label,value:{Logical:{width:1500,height:950}}});
  await chooseTool(page,'Settings & tools');await page.getByRole('tab',{name:'Interface Studio',exact:true}).click();
  const scale=page.getByRole('combobox',{name:'UI scale',exact:true,includeHidden:true});await revealPagedControl(scale);await scale.selectOption('1.25');
  await expect(page.locator('html')).toHaveAttribute('data-gs-ui-scale','1.25');
  report.responsive.scale={requested:1.25,manual:await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,applied:document.documentElement.dataset.gsUiScale}))};
  expect(report.responsive.scale.manual.width).toBe(1200);
  report.responsive.scale.manual.controls=await auditPagedSurface(page.locator('[data-surface="settings-interface"]'));
  report.responsive.scale.manual.bounds=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,app:document.querySelector('.application').getBoundingClientRect().toJSON()}));
  expect(report.responsive.scale.manual.bounds.scrollWidth).toBeLessThanOrEqual(report.responsive.scale.manual.width+1);
  await page.screenshot({path:path.join(root,'native-ui-scale-125.png'),scale:'device',fullPage:true});
  await revealPagedControl(scale);await scale.selectOption('auto');
  await invoke(page,'plugin:window|set_size',{label,value:{Logical:{width:1920,height:1080}}});
  await expect(page.locator('html')).toHaveAttribute('data-gs-ui-scale','1.14');
  report.responsive.scale.auto=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,applied:document.documentElement.dataset.gsUiScale}));
  report.responsive.scale.auto.controls=await auditPagedSurface(page.locator('[data-surface="settings-interface"]'));
  const view=await openViewMenu(page);await view.getByRole('button',{name:'Fullscreen editing',exact:true}).click();await expect.poll(()=>invoke(page,'plugin:window|is_fullscreen',{label})).toBe(true);
  await page.screenshot({path:path.join(root,'native-ui-scale-fullscreen-auto.png')});report.responsive.scale.fullscreen=await page.evaluate(()=>({width:innerWidth,height:innerHeight,applied:document.documentElement.dataset.gsUiScale}));
  await page.keyboard.press('F11');await expect.poll(()=>invoke(page,'plugin:window|is_fullscreen',{label})).toBe(false);
  await page.reload();await chooseTool(page,'Settings & tools');await page.getByRole('tab',{name:'Interface Studio',exact:true}).click();await revealPagedControl(scale);await expect(scale).toHaveValue('auto');report.responsive.scale.reloadPreserved=true;
  await scale.selectOption('1');await expect(page.locator('html')).toHaveAttribute('data-gs-ui-scale','1');
  await page.getByRole('tab',{name:'Storage & Cache',exact:true}).click();
  const limits=page.getByText('Preview memory & graphics',{exact:true,includeHidden:true});await revealPagedControl(limits);await limits.click();
  const cpu=page.getByRole('spinbutton',{name:'Reusable preview cache',exact:true,includeHidden:true}),map=page.getByRole('spinbutton',{name:'Native map data cache',exact:true,includeHidden:true});
  await revealPagedControl(cpu);await cpu.fill('16');await revealPagedControl(map);await map.fill('32');
  const save=page.getByRole('button',{name:'Save preview limits',exact:true,includeHidden:true});await revealPagedControl(save);await save.click();
  await expect.poll(async()=>(await invoke(page,'inspection_cache_status')).maxEstimatedBytes).toBe(32*1024**2);
  report.responsive.cache={native:await invoke(page,'inspection_cache_status'),saved:await page.evaluate(()=>JSON.parse(localStorage.getItem('spark.previewBudgets.v1')??'null'))};
  expect(report.responsive.cache.saved.decodedMiB).toBe(16);
  await page.reload();await expect.poll(async()=>(await invoke(page,'inspection_cache_status')).maxEstimatedBytes).toBe(32*1024**2);report.responsive.cache.reloadPreserved=true;
  step('Saved native WebView zoom, responsive fullscreen scale and user cache budgets survive reload',{scale:report.responsive.scale,cache:report.responsive.cache});
 }
 report.responsive.nativeViewportAcceptance=!baseline;report.responsive.physicalUltrawideHardwareTested=hardware.some(m=>m.size.width>=5120);
 await fs.writeFile(path.join(root,'responsive-layout.json'),JSON.stringify(report.responsive,null,2));
}


// Native controls and source metadata acceptance, not a compiled/gameplay pass.
export async function nativeSeamRouteControls({page,root,invoke,report,step,run,invader,baseFile,donorFile}){
 const call=(command,args={})=>invoke(page,command,args),hash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
 const originals=await Promise.all([baseFile,donorFile].map(async file=>({file,sha256:await hash(file)})));
 try {
 const [base,donor]=await call('import_paths',{paths:[baseFile,donorFile]});
 if(!base?.project?.source||!donor?.project?.source)throw Error('Select two owned supported BSP sources');
 const bsp=donor.inspection.tags.find(tag=>tag.class==='sbsp');if(!bsp)throw Error('The donor has no BSP');
 const folder=path.join(root,'seam-donor-tags');
 const extracted=await run(path.join(invader,'invader-extract.exe'),['-m',path.dirname(donorFile),'-s',bsp.path+'.scenario_structure_bsp','-r','-t','seam-donor-tags',donorFile],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:8*1024**2});
 expect(extracted.stdout+'\n'+extracted.stderr).not.toMatch(/Failed to extract|ERROR:/i);
 let fileCount=0,bytes=0;const walk=async directory=>{for(const item of await fs.readdir(directory,{withFileTypes:true})){
  const file=path.join(directory,item.name),info=await fs.lstat(file);if(info.isSymbolicLink())throw Error('Linked donor dependency refused');
  if(info.isDirectory())await walk(file);else if(info.isFile()){fileCount++;bytes+=info.size;if(fileCount>4096||bytes>256*1024**2)throw Error('Donor dependency closure exceeds its bounded fixture');}else throw Error('Unexpected donor dependency type');
 }};await walk(folder);
 const boot=await call('bootstrap');await call('save_settings',{settings:{...boot.settings,onboardingCompleted:true,autoBuild:false,hekTagsDirectory:folder,invaderDirectory:invader}});
 await page.reload();await chooseTool(page,'Map library');await page.locator(`.map-card[data-project-id="${donor.project.id}"]`).click();await openDrawer(page,'Project setup');
 const setup=page.getByRole('region',{name:'Project setup panel',exact:true});
 for(const selector of ['.gs-map-tools','.gs-build-targets']){const details=setup.locator(selector);if(await details.getAttribute('open')===null){const summary=details.locator(':scope>summary');await revealPagedControl(summary);await summary.click();}}
 const targetRuntime=setup.getByRole('combobox',{name:'New engine target runtime',exact:true,includeHidden:true});await revealPagedControl(targetRuntime);await targetRuntime.selectOption('haloCustomEdition');
 const add=setup.getByRole('button',{name:'Add runtime target',exact:true,includeHidden:true});await revealPagedControl(add);await add.click();
 const tagRoot=setup.getByRole('textbox',{name:/^Editable Halo Tags folder/,includeHidden:true});await revealPagedControl(tagRoot);await tagRoot.fill(folder);await tagRoot.press('Tab');
 report.seamSaveFocus=await page.evaluate(()=>({active:document.activeElement?.outerHTML?.slice(0,350),historyOwner:document.activeElement?.closest('[data-history-project]')?.getAttribute('data-history-project')}));
 await page.getByLabel('File menu',{exact:true}).click();await page.getByRole('menu',{name:'File commands',exact:true}).getByRole('menuitem',{name:'Save',exact:true}).click();
 await expect.poll(async()=>{const project=(await call('open_project',{id:donor.project.id})).project;return project.buildTargets?.find(target=>target.id===project.activeBuildTarget)?.tagsDirectory;}).toBe(folder);
 await setup.getByRole('button',{name:'Close Project setup',exact:true}).click();await chooseTool(page,'Map library');await page.locator(`.map-card[data-project-id="${base.project.id}"]`).click();await chooseTool(page,'Level editor');await openDrawer(page,'Construction');
 const panel=page.getByRole('region',{name:'Construction panel',exact:true});
 const control=async(role,name)=>{const node=panel.getByRole(role,{name,exact:true,includeHidden:true});await revealPagedControl(node);return node;};
 const click=async name=>(await control('button',name)).click();
 const summary=panel.locator('.bsp-assembly>summary');await revealPagedControl(summary);if(await panel.locator('.bsp-assembly').getAttribute('open')===null)await summary.click();
 await (await control('combobox','BSP donor map')).selectOption(donor.project.id);
 await expect.poll(async()=>await panel.getByRole('button',{name:'Plan connected tunnel',exact:true,includeHidden:true}).isEnabled(),{timeout:180000}).toBe(true);
 await click('Plan connected tunnel');await expect(panel.getByRole('button',{name:'Make three-route seam',exact:true,includeHidden:true})).toBeAttached();await click('Make three-route seam');
 await (await control('combobox','Connection route')).selectOption('highGround');
 const width=await control('spinbutton','Tunnel width');await width.fill('4.5');await width.press('Enter');await click('Apply connection');
 const save=async()=>{await page.keyboard.press('Control+s');await expect.poll(async()=>(await call('read_workspace_history',{projectId:base.project.id})).history?.head.dirty).toBe(false);return (await call('open_project',{id:base.project.id})).project;};
 const saved=await save();expect(saved.bspAssembly.highGround.width).toBe(4.5);expect(saved.bspAssembly.highGround.points).toHaveLength(6);expect(saved.bspAssembly.infantryTunnel.points).toHaveLength(4);
 await page.keyboard.press('Control+z');expect((await save()).bspAssembly??null).toBeNull();
 await page.keyboard.press('Control+y');expect((await save()).bspAssembly).toEqual(saved.bspAssembly);
 await chooseTool(page,'Features & workflows');await chooseTool(page,'Level editor');await expect(await control('combobox','Connection route')).toHaveValue('highGround');await expect(await control('spinbutton','Tunnel width')).toHaveValue('4.5');
 // Opening an owned CE map may attach its verified sound-bank scope. It
 // enriches provenance without changing the source cache or resource identity.
 const expectedSource={...base.project.source};
 const audioScopeDiscovered=!expectedSource.audioResources&&!!saved.source.audioResources;
 if(audioScopeDiscovered){
  const bank=expectedSource.resourceSha256?.['sounds.map'];expect(bank).toBeTruthy();
  expect(await hash(path.join(path.dirname(baseFile),'sounds.map'))).toBe(bank);
  expectedSource.audioResources={kind:'classic',directory:expectedSource.resourceDirectory,sha256:{'sounds.map':bank}};
 }
 expect(saved.source).toEqual(expectedSource);
 report.seamRoutes={projectId:base.project.id,donorDependencyFiles:fileCount,donorDependencyBytes:bytes,sourceHashes:originals.map(row=>row.sha256),savedPlan:saved.bspAssembly,sourceIdentityUnchanged:true,verifiedAudioScopeDiscovered:audioScopeDiscovered,oneActionUndoRedoImmediateSave:true,retainedRoute:true,donorProfileConfiguredThroughUi:true,nativeCompilation:false,gameplayVerified:false};
 await click('Preview joined seam & clearance');
 await expect.poll(async()=>await panel.locator('.bsp-error').count()?'blocked':(await panel.innerText()).includes('Source clearance checked at')?'checked':'working',{timeout:180000,intervals:[500,1000]}).not.toBe('working');
 const error=await panel.locator('.bsp-error').allTextContents();expect(error).toEqual([]);report.seamRoutes.sourceGeometry={accepted:error.length===0,errors:error,scope:'Derived source BSP and standing-biped samples; not a native compiler or vehicle/sniper acceptance'};
 if(!error.length){const text=await panel.textContent();report.seamRoutes.sourceGeometry.routes=['Primary connection','Infantry tunnel','High-ground route'].map(label=>{const found=text.match(new RegExp(label+': (\\d+) biped samples'));expect(found).toBeTruthy();return {label,bipedSamples:Number(found[1])};});}
 await page.screenshot({path:path.join(root,'native-three-route-authoring.png'),fullPage:true,scale:'device'});
 for(const input of originals)expect(await hash(input.file)).toBe(input.sha256);report.seamRoutes.originalsUnchanged=true;
 step('Actual three-route Construction controls, saved metadata and own-author Undo; source geometry gate recorded separately',report.seamRoutes);
 return saved;
 } finally {
  const all=(await call('bootstrap')).entries;
  report.seamSavedProfiles=[];
  for(const entry of all){const p=(await call('open_project',{id:entry.id})).project;const view=await call('read_workspace_history',{projectId:entry.id});const head=view.history?.snapshots?.find(row=>row.key===view.history.head.current)?.project;report.seamSavedProfiles.push({id:p.id,title:p.title,targets:p.buildTargets,active:p.activeBuildTarget,historyTargets:head?.buildTargets,historyDirty:view.history?.head?.dirty});}
  report.seamInputAudit=await Promise.all(originals.map(async input=>({file:path.basename(input.file),before:input.sha256,after:await hash(input.file)})));
  for(const input of report.seamInputAudit)expect(input.after).toBe(input.before);
  report.seamInputsUnchanged=true;
 }
}

// A retained setup may still be on its tools step, even after settings change.
// Follow the real visible Back/Change action instead of remounting the editor.
export async function openNativeHaloChoice(page){
 await chooseTool(page,'Start here');await page.locator('[data-surface="get-started"]').waitFor({state:'visible'});
 const choice=page.getByRole('combobox',{name:'Setup OpenCE flavor',exact:true,includeHidden:true});
 if(!await choice.count()){const back=page.getByRole('button',{name:/^(Change Halo or tools|Back to Halo choice)$/,includeHidden:true});await back.waitFor({state:'attached'});await revealPagedControl(back);await back.click();}
 await choice.waitFor({state:'attached'});return choice;
}

// Reuse the actual saved profile registry and the same first-run controls.
export async function nativeOpenCeFlavorSetup({page,root,invoke,report,step}){
 const call=(command,args={})=>invoke(page,command,args);
 const candidates=(await call('discover_halo_connections')).filter(row=>row.runtimeId==='openCe'&&row.contentReady);
 if(!candidates.length)throw Error('Native flavor acceptance requires an installed owner-supplied OpenCE flavor');
 const pins=[];for(const candidate of candidates){const sha256=createHash('sha256').update(await fs.readFile(candidate.executable)).digest('hex');expect(sha256).toBe(candidate.executableSha256);pins.push({file:candidate.executable,sha256});await call('connect_detected_halo',{runtimeId:candidate.runtimeId,executableSha256:candidate.executableSha256});}
 await openNativeHaloChoice(page);
 const ideas=page.locator('.gs-project-paths');if(await ideas.getAttribute('open')!==null){const summary=ideas.locator(':scope>summary');await revealPagedControl(summary);await summary.click();}
 const choices=page.getByRole('combobox',{name:'Setup OpenCE flavor',exact:true,includeHidden:true});await revealPagedControl(choices);
 const profiles=(await call('list_runtime_registrations')).filter(row=>row.runtimeId==='openCe');
 const results=[];
 for(const profile of profiles){await revealPagedControl(choices);await choices.selectOption('profile:'+profile.id);await expect(choices).toHaveValue('profile:'+profile.id);await expect.poll(async()=>(await call('runtime_report')).find(row=>row.id==='openCe')?.installation?.registrationId).toBe(profile.id);results.push({registrationId:profile.id,root:profile.root});}
 const label=await page.evaluate(()=>window.__TAURI_INTERNALS__.metadata.currentWindow.label),layouts=[];
 await call('plugin:window|unmaximize',{label});
 for(const [width,height]of [[800,600],[1280,720],[1366,768],[1500,950],[1920,1080],[2560,1080],[3440,1440],[5120,1440]]){
  await call('plugin:window|set_size',{label,value:{Logical:{width,height}}});
  const surface=page.locator('[data-surface="get-started"]');const result=await auditPagedSurface(surface);await revealPagedControl(choices);
  const bounds=await page.evaluate(()=>({width:innerWidth,height:innerHeight,horizontalOverflow:document.documentElement.scrollWidth-innerWidth}));expect(bounds.horizontalOverflow).toBeLessThanOrEqual(1);
  const screenshot='native-setup-flavors-'+width+'x'+height+'.png';await page.screenshot({path:path.join(root,screenshot)});layouts.push({requested:{width,height},...bounds,controls:result,screenshot});
 }
 await call('plugin:window|set_size',{label,value:{Logical:{width:1500,height:950}}});
 const next=page.getByRole('button',{name:'Continue to tools',exact:true,includeHidden:true});await revealPagedControl(next);await next.click();
 await expect.poll(async()=>(await call('bootstrap')).settings.preferredHalo).toBe('openCe');
 for(const pin of pins)expect(createHash('sha256').update(await fs.readFile(pin.file)).digest('hex')).toBe(pin.sha256);
 report.setupFlavors={actualNativeControls:true,profiles:results,selectedRegistrationId:profiles.at(-1).id,layouts,originalExecutablesUnchanged:true,noGameLaunched:true,noPackageDownloaded:true};
 step('Native OpenCE setup icon, saved flavor selection and all eight requested window sizes',report.setupFlavors);
}

// Optional bounded visual review of the real Windows native select popup.
// CSS/readiness assertions are automated; a screenshot observation is separate.
export async function nativeStudioPopupReview({page,root,report,step}){
 await openStudioMenu(page);const select=page.getByRole('combobox',{name:'Active Halo runtime',exact:true});
 await expect(select).toHaveCSS('color-scheme','dark');
 const colors=await select.evaluate(select=>({fill:getComputedStyle(select).backgroundColor,options:[...select.querySelectorAll('option:not(:checked):not(:disabled),optgroup')].map(option=>({label:option.textContent,color:getComputedStyle(option).color,background:getComputedStyle(option).backgroundColor}))}));
 for(const option of colors.options){expect(option.background).toMatch(/^rgb\(/);expect(option.background).not.toBe('rgb(255, 255, 255)');}
 await select.focus();await select.press('Alt+ArrowDown');
 report.studioPopup={openedWithNativeKeyboard:true,colors,desktopVisualAcceptance:false};
 console.log('NATIVE_STUDIO_POPUP_REVIEW',JSON.stringify({seconds:45,at:new Date().toISOString()}));
 await new Promise(resolve=>setTimeout(resolve,45000));
 await page.keyboard.press('Escape');await page.screenshot({path:path.join(root,'native-studio-theme.png'),scale:'device'});await page.keyboard.press('Escape');
 step('Actual Windows Studio runtime palette and native popup keyboard opening; separate visual review',report.studioPopup);
}
