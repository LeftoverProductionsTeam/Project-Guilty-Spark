import {expect,type Locator,type Page} from '@playwright/test';
const controls='button,a[href],input,select,textarea,summary';
// Native WebView fractional zoom produced 26.562/26.563 for the same
// page-relative coordinate. This tolerance ONLY compares measurement stability;
// the actual clipping, overlap and complete control coverage checks stay below.
export function samePagedLayout(before:string,after:string){
 if(before===after)return true;if(!before||!after)return false;
 const a=JSON.parse(before),b=JSON.parse(after),same=(x:number,y:number)=>Math.abs(x-y)<=.002;
 return a.pages===b.pages&&a.content===b.content&&same(a.width,b.width)&&same(a.height,b.height)
  &&a.controls.length===b.controls.length&&a.controls.every((row:number[],i:number)=>row.length===b.controls[i].length&&row.every((value:number,j:number)=>same(value,b.controls[i][j])));
}

/** Read layout from the actual rendered surface and visit its visible page
 * controls. No scrollIntoView, forced clicks, style edits or mocked bounds. */
export async function auditPagedSurface(surface:Locator,options:{afterInitialLayout?:()=>Promise<void>;beforePageRead?:()=>Promise<void>}={}){
 await expect(surface).toBeVisible();
 await surface.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 await expect.poll(async()=>Number(await surface.locator(':scope > .gs-page-viewport').evaluate(node=>node.getBoundingClientRect().height))).toBeGreaterThan(35);

 // Registration, fonts and native zoom can settle after the menu first opens.
 // Require one coherent measured layout, then enumerate every page of it.
 const settled=async()=>{
  let previous='';
  await expect.poll(async()=>{
   const signature=await surface.evaluate(async(root,selector)=>{
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    const view=root.querySelector(':scope > .gs-page-viewport')!,body=view.firstElementChild!,bounds=body.getBoundingClientRect(),box=view.getBoundingClientRect();
    const n=(value:number)=>Math.round(value*1000)/1000;
    return JSON.stringify({pages:root.getAttribute('data-pages'),width:n(box.width),height:n(box.height),content:body.scrollHeight,
     controls:[...body.querySelectorAll<HTMLElement>(selector)].map(node=>{const r=node.getBoundingClientRect();return [n(r.left-bounds.left),n(r.top-bounds.top),n(r.width),n(r.height)];})});
   },controls);
   const stable=samePagedLayout(signature,previous);previous=signature;return stable;
  },{message:'Paged control layout must settle before auditing reachability',timeout:5000,intervals:[16,32,64]}).toBe(true);
  return previous;
 };
 await settled();await options.afterInitialLayout?.();
 if(await surface.getAttribute('data-navigation')==='scroll')return auditContinuousSurface(surface,settled,options.beforePageRead);
 const changes:unknown[]=[];
 const changedLayout=(before:string,after:string)=>{
  if(samePagedLayout(before,after))return false;
  const a=JSON.parse(before),b=JSON.parse(after);
  changes.push({before:{...a,controls:undefined},after:{...b,controls:undefined},controls:a.controls.flatMap((r:number[],index:number)=>JSON.stringify(r)===JSON.stringify(b.controls[index])?[]:[{index,before:r,after:b.controls[index]}]).slice(0,5)});
  return true;
 };
 for(let generation=0;generation<4;generation++){
 const signature=await settled(),count=Number(await surface.getAttribute('data-pages'));
 expect(Number.isInteger(count)&&count>0,'A paged surface must expose a positive measured page count').toBe(true);
 const seen=new Set<number>();let expected:number[]=[];const pages=[];let changed=false;
 for(let page=1;page<=count;page++){
  if(changedLayout(signature,await settled())){changed=true;break;}
  const choice=surface.locator(':scope > .gs-surface-pages input[type=number]');
  if(count>1){await choice.fill(String(page));await expect(surface).toHaveAttribute('data-page',String(page));}
  if(changedLayout(signature,await settled())){changed=true;break;}
  await options.beforePageRead?.();
  const result=await surface.evaluate((root,selector)=>{
   const view=root.querySelector(':scope > .gs-page-viewport')!,box=view.getBoundingClientRect();
   const body=view.firstElementChild!;
   const all=[...body.querySelectorAll<HTMLElement>(selector)];
   const eligible=all.flatMap((node,index)=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&node.checkVisibility({visibilityProperty:false,opacityProperty:false})&&!node.closest('[hidden]')?[index]:[];});
   const visible=all.flatMap((node,index)=>{
    const r=node.getBoundingClientRect();if(!eligible.includes(index)||node.closest('[inert],[aria-hidden="true"]')||getComputedStyle(node).visibility==='hidden')return [];
    let left=Math.max(0,box.left),right=Math.min(innerWidth,box.right),top=Math.max(0,box.top),bottom=Math.min(innerHeight,box.bottom);
    for(let parent=node.parentElement;parent&&parent!==root;parent=parent.parentElement){const style=getComputedStyle(parent),p=parent.getBoundingClientRect();if(/auto|scroll|clip|hidden/.test(style.overflowX)){left=Math.max(left,p.left);right=Math.min(right,p.right);}if(/auto|scroll|clip|hidden/.test(style.overflowY)){top=Math.max(top,p.top);bottom=Math.min(bottom,p.bottom);}}
    const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return [{index,rectangle:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},limit:{left,right,top,bottom},off:node.hasAttribute('data-gs-offpage'),inert:node.inert,clickable:!!hit&&(node===hit||node.contains(hit)),blockedBy:hit?.tagName+':'+(hit?.getAttribute('aria-label')||hit?.className||''),label:(node.getAttribute('aria-label')||node.textContent||node.getAttribute('title')||node.tagName).trim().slice(0,85),fits:r.left>=left-1&&r.right<=right+1&&r.top>=top-1&&r.bottom<=bottom+1}];
   });
   const scrolls=[...body.querySelectorAll<HTMLElement>('*')].flatMap(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&!node.closest('[hidden],[inert]')&&s.visibility!=='hidden'&&((/auto|scroll/.test(s.overflowY)&&node.scrollHeight>node.clientHeight+1)||(/auto|scroll/.test(s.overflowX)&&node.scrollWidth>node.clientWidth+1))?[{tag:node.className,height:node.clientHeight,content:node.scrollHeight}]:[];});
   // A tab can replace its content after the settled read but before this
   // evaluation. Compare geometry captured in this SAME snapshot before
   // asserting reachability; a stable clipped layout must still fail below.
   const bounds=body.getBoundingClientRect(),n=(value:number)=>Math.round(value*1000)/1000;
   const layoutSignature=JSON.stringify({pages:root.getAttribute('data-pages'),width:n(box.width),height:n(box.height),content:body.scrollHeight,
    controls:all.map(node=>{const r=node.getBoundingClientRect();return [n(r.left-bounds.left),n(r.top-bounds.top),n(r.width),n(r.height)];})});
   return {eligible,visible,scrolls,layoutSignature,viewport:{x:box.x,y:box.y,width:box.width,height:box.height}};
  },controls);
  if(changedLayout(signature,result.layoutSignature)){changed=true;break;}
  expected=result.eligible;for(const item of result.visible)if(item.fits)seen.add(item.index);
  expect(result.scrolls,'Nested control surfaces must use pages, not scrolling').toEqual([]);
  expect(result.visible.filter(item=>!item.fits),'Every visible control must be fully reachable').toEqual([]);
  expect(result.visible.filter(item=>!item.clickable),'Another control must not cover a command target').toEqual([]);
  pages.push({page,controls:result.visible.length,viewport:result.viewport});
 }
 if(changed||changedLayout(signature,await settled()))continue;
 expect(expected.filter(index=>!seen.has(index)),'Every mounted control must be reachable on at least one page').toEqual([]);
 return {surface:await surface.getAttribute('data-surface'),controls:expected.length,pages};
 }
 throw Error('Paged controls kept changing during four complete reachability audits: '+JSON.stringify(changes.slice(-4)));
}
export async function auditVisiblePages(page:Page){const result=[];for(const surface of await page.locator('.gs-paged-surface:visible').all())result.push(await auditPagedSurface(surface));return result;}


/** Audit the real workspace scrollbar with wheel/Home input. Every mounted
 * command must become fully visible and hit-testable, without extra pages. */
async function auditContinuousSurface(surface:Locator,settled:()=>Promise<string>,beforeRead?:()=>Promise<void>){
 const page=surface.page(),view=surface.locator(':scope > .gs-page-viewport');
 await expect(surface).toHaveAttribute('data-pages','1');await expect(surface.locator(':scope > .gs-surface-pages')).toHaveCount(0);
 for(let generation=0;generation<4;generation++){
  const signature=await settled(),seen=new Set<number>(),positions:unknown[]=[];let expected:number[]=[],changed=false;
  await view.focus();await page.keyboard.press('Home');
  try{await expect.poll(()=>view.evaluate(node=>node.scrollTop)).toBe(0);}catch(error){
   console.log('SCROLL_KEY_FAILURE',JSON.stringify(await view.evaluate(node=>({surface:node.parentElement?.getAttribute('data-surface'),focused:document.activeElement===node,activeTag:document.activeElement?.tagName,activeLabel:document.activeElement?.getAttribute('aria-label'),documentFocused:document.hasFocus(),top:node.scrollTop,maximum:node.scrollHeight-node.clientHeight,ancestors:[...function*(entry:HTMLElement|null):Generator<HTMLElement>{while(entry){yield entry;entry=entry.parentElement;}}(node)].map(entry=>({tag:entry.tagName,class:entry.className,top:entry.scrollTop,height:entry.clientHeight,content:entry.scrollHeight}))}))));throw error;
  }
  for(let step=0;step<512;step++){
   await beforeRead?.();
   const result=await surface.evaluate((root,selector)=>{
    const view=root.querySelector<HTMLElement>(':scope > .gs-page-viewport')!,body=view.firstElementChild!,box=view.getBoundingClientRect(),bounds=body.getBoundingClientRect();
    const all=[...body.querySelectorAll<HTMLElement>(selector)],n=(value:number)=>Math.round(value*1000)/1000;
    const eligible=all.flatMap((node,index)=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&node.checkVisibility({visibilityProperty:false,opacityProperty:false})&&!node.closest('[hidden],[inert],[aria-hidden="true"]')?[index]:[];});
    const visible=all.flatMap((node,index)=>{
     if(!eligible.includes(index))return [];const r=node.getBoundingClientRect();
     let left=Math.max(0,box.left),right=Math.min(innerWidth,box.right),top=Math.max(0,box.top),bottom=Math.min(innerHeight,box.bottom);
     for(let parent=node.parentElement;parent&&parent!==root;parent=parent.parentElement){const style=getComputedStyle(parent),p=parent.getBoundingClientRect();if(/auto|scroll|clip|hidden/.test(style.overflowX)){left=Math.max(left,p.left);right=Math.min(right,p.right);}if(/auto|scroll|clip|hidden/.test(style.overflowY)){top=Math.max(top,p.top);bottom=Math.min(bottom,p.bottom);}}
     if(r.left<left-1||r.right>right+1||r.top<top-1||r.bottom>bottom+1)return [];
     const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
     return [{index,clickable:!!hit&&(node===hit||node.contains(hit)),label:(node.getAttribute('aria-label')||node.textContent||node.tagName).trim().slice(0,85),blockedBy:hit?.tagName+':'+(hit?.getAttribute('aria-label')||hit?.className||'')}];
    });
    const horizontal=[view,...body.querySelectorAll<HTMLElement>('*')].flatMap(node=>node.clientWidth>0&&node.scrollWidth>node.clientWidth+1&&/auto|scroll/.test(getComputedStyle(node).overflowX)?[{tag:node.className,width:node.clientWidth,content:node.scrollWidth}]:[]);
    const layoutSignature=JSON.stringify({pages:root.getAttribute('data-pages'),width:n(box.width),height:n(box.height),content:body.scrollHeight,controls:all.map(node=>{const r=node.getBoundingClientRect();return [n(r.left-bounds.left),n(r.top-bounds.top),n(r.width),n(r.height)];})});
    return {eligible,visible,horizontal,largestControl:Math.max(0,...eligible.map(index=>all[index].getBoundingClientRect().height)),top:view.scrollTop,max:Math.max(0,view.scrollHeight-view.clientHeight),layoutSignature,viewport:{x:box.x,y:box.y,width:box.width,height:box.height}};
   },controls);
   if(!samePagedLayout(signature,result.layoutSignature)){changed=true;break;}
   expected=result.eligible;for(const item of result.visible)seen.add(item.index);
   expect(result.horizontal,'Workspace controls must not require horizontal scrolling').toEqual([]);
   expect(result.visible.filter(item=>!item.clickable),'Another control must not cover a command target').toEqual([]);
   positions.push({top:result.top,controls:result.visible.length});
   if(result.top>=result.max-1)break;
   const before=result.top;await page.mouse.move(result.viewport.x+result.viewport.width/2,result.viewport.y+Math.min(result.viewport.height-8,result.viewport.height/2));
   await page.mouse.wheel(0,Math.max(12,Math.min(Math.floor(result.viewport.height*.6),Math.floor(result.viewport.height-result.largestControl-2))));
   await expect.poll(()=>view.evaluate(node=>node.scrollTop),{message:'The workspace must respond to actual wheel input'}).toBeGreaterThan(before);
   await surface.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  }
  if(changed||!samePagedLayout(signature,await settled()))continue;
  const missing=expected.filter(index=>!seen.has(index));
  if(missing.length)console.log('SCROLL_REACHABILITY_FAILURE',JSON.stringify(await surface.evaluate((root,indices)=>{const view=root.querySelector<HTMLElement>(':scope > .gs-page-viewport')!,body=view.firstElementChild!,all=[...body.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,summary')];return {surface:root.getAttribute('data-surface'),viewport:view.getBoundingClientRect().toJSON(),scrollTop:view.scrollTop,maximum:view.scrollHeight-view.clientHeight,missing:indices.slice(0,8).map(index=>({index,label:all[index]?.textContent||all[index]?.getAttribute('aria-label'),rectangle:all[index]?.getBoundingClientRect().toJSON()}))};},missing)));
  expect(missing,'Every mounted control must be fully reachable by scrolling').toEqual([]);
  return {surface:await surface.getAttribute('data-surface'),navigation:'scroll',controls:expected.length,pages:[{page:1,controls:expected.length}],scrollPositions:positions};
 }
 throw Error('Workspace content kept changing during four complete scrolling reachability audits');
}
