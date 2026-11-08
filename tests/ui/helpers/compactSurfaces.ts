import {expect,type Locator,type Page} from '@playwright/test';
const controls='button,a[href],input,select,textarea,summary';
/** Read layout from the actual rendered surface and visit its visible page
 * controls. No scrollIntoView, forced clicks, style edits or mocked bounds. */
export async function auditPagedSurface(surface:Locator){
 await expect(surface).toBeVisible();
 await surface.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 await expect.poll(async()=>Number(await surface.locator(':scope > .gs-page-viewport').evaluate(node=>node.getBoundingClientRect().height))).toBeGreaterThan(35);
 const count=Number(await surface.getAttribute('data-pages'));
 const seen=new Set<number>();
 let expected:number[]=[];const pages=[];
 for(let page=1;page<=count;page++){
  const choice=surface.locator(':scope > .gs-surface-pages input[type=number]');
  if(count>1){await choice.fill(String(page));await expect(surface).toHaveAttribute('data-page',String(page));}
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
   return {eligible,visible,scrolls,viewport:{x:box.x,y:box.y,width:box.width,height:box.height}};
  },controls);
  expected=result.eligible;for(const item of result.visible)if(item.fits)seen.add(item.index);
  expect(result.scrolls,'Nested control surfaces must use pages, not scrolling').toEqual([]);
  expect(result.visible.filter(item=>!item.fits),'Every visible control must be fully reachable').toEqual([]);
  expect(result.visible.filter(item=>!item.clickable),'Another control must not cover a command target').toEqual([]);
  pages.push({page,controls:result.visible.length,viewport:result.viewport});
 }
 expect(expected.filter(index=>!seen.has(index)),'Every mounted control must be reachable on at least one page').toEqual([]);
 return {surface:await surface.getAttribute('data-surface'),controls:expected.length,pages};
}
export async function auditVisiblePages(page:Page){const result=[];for(const surface of await page.locator('.gs-paged-surface:visible').all())result.push(await auditPagedSurface(surface));return result;}
