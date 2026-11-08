import {test,expect} from '@playwright/test';
import {chooseTool,revealPagedControl} from './helpers/navigation';

test('Open Work is keyboard accessible and stays separate from visibility recovery and source Undo',async({page})=>{
  await page.goto('/');await expect(page.getByRole('button',{name:'Open work and workspace windows',exact:true})).toBeVisible();
  await page.keyboard.press('Control+Alt+o');await expect(page.getByRole('dialog',{name:'Open work',exact:true})).toBeHidden();
  await page.keyboard.press('Control+Shift+p');const work=page.getByRole('dialog',{name:'Open work',exact:true});await expect(work).toBeVisible();await expect(work.getByLabel('Search open work',{exact:true})).toBeFocused();
  await work.getByLabel('Workspace in this window',{exact:true}).selectOption('creator');await expect(page.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace','creator');
  await page.keyboard.press('Control+Shift+p');await work.getByLabel('Workspace in this window',{exact:true}).selectOption('features');
  await page.keyboard.press('Control+Shift+p');const recent=work.getByRole('region',{name:'Recent places',exact:true});await expect(recent.getByRole('button').filter({hasText:'Creator Studio'})).toBeVisible();
  await work.getByRole('button',{name:'Open another view',exact:true}).focus();await page.keyboard.press('Tab');await expect(work.getByRole('button',{name:'Close open work',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');await expect(work).toBeHidden();await expect(page.getByRole('button',{name:'Open work and workspace windows',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Back to previous workspace',exact:true}).click();await expect(page.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace','creator');
});

test('Workspace fades affect content only and honor saved reduced-motion and animation choices',async({page})=>{
  await page.goto('/');await expect(page.getByRole('button',{name:'Toggle workspace navigation',exact:true})).toBeVisible();
  await page.evaluate(()=>{(window as any).flowAnimations=[];const original=Element.prototype.animate;Element.prototype.animate=function(frames,options){(window as any).flowAnimations.push({className:this.className,frames,options});return original.call(this,frames,options);};});
  await chooseTool(page,'Features & workflows');await chooseTool(page,'Community maps');
  const fades=await page.evaluate(()=>(window as any).flowAnimations.filter((a:any)=>a.className==='gs-workspace-content'));
  expect(fades.length).toBeGreaterThan(0);for(const fade of fades){expect(fade.options.duration).toBeLessThanOrEqual(200);expect(fade.frames.every((f:any)=>f.opacity>=.8)).toBe(true);}
  expect(await page.evaluate(()=>(window as any).flowAnimations.some((a:any)=>String(a.className).includes('app-header')))).toBe(false);
  await chooseTool(page,'Settings & tools');await page.getByRole('tab',{name:'Interface Studio',exact:true}).click();
  for(const [name,checked]of [['Subtle workspace fades',false],['Shield loading animation',false],['Reduced motion and interface transitions',true]] as const){const input=page.getByRole('checkbox',{name,exact:true,includeHidden:true});await revealPagedControl(input);await input.setChecked(checked);}
  await page.reload();await chooseTool(page,'Settings & tools');await page.getByRole('tab',{name:'Interface Studio',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'Subtle workspace fades',exact:true,includeHidden:true})).not.toBeChecked();await expect(page.getByRole('checkbox',{name:'Shield loading animation',exact:true,includeHidden:true})).not.toBeChecked();await expect(page.getByRole('checkbox',{name:'Reduced motion and interface transitions',exact:true,includeHidden:true})).toBeChecked();
  await page.evaluate(()=>(window as any).flowAnimations=[]);await chooseTool(page,'Features & workflows');await chooseTool(page,'Community maps');expect(await page.evaluate(()=>(window as any).flowAnimations)).toEqual([]);
});
