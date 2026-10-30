// Browser interaction regressions, not native collision/gameplay acceptance.
import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.setViewportSize({width:1280,height:800});await page.goto('/tests/ui/fixtures/editorControls.html');});
test('numeric scrubbing commits once and exact typing remains available',async({page})=>{
  const input=page.getByRole('spinbutton',{name:'Test position'}),box=(await input.boundingBox())!;
  await page.mouse.move(box.x+30,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+60,box.y+box.height/2,{steps:8});await page.mouse.up();
  await expect(input).toHaveValue('4');await page.getByRole('button',{name:'Leave field'}).click();await expect(page.getByTestId('commits')).toHaveText('[4]');
  await input.fill('-2.75');await input.press('Enter');await expect(page.getByTestId('commits')).toHaveText('[4,-2.75]');
  await input.fill('20');await input.press('Enter');await expect(input).toHaveAttribute('aria-invalid','true');await expect(page.getByTestId('commits')).toHaveText('[4,-2.75]');
});
test('End uses object collision above the BSP and does not intercept typing',async({page})=>{
  await page.getByRole('textbox',{name:'Typing here'}).focus();await page.keyboard.press('End');await expect(page.getByTestId('drops')).toHaveText('[]');
  await page.getByRole('button',{name:'Leave field'}).click();await page.keyboard.press('End');await expect(page.getByTestId('height')).toHaveText('2.0001');await expect(page.getByTestId('drops')).toHaveText('[-2.9999]');
  await page.keyboard.press('End');await expect(page.getByTestId('drops')).toHaveText('[-2.9999]');
});
test('drawers drag from an edge, resize, dock at the top and preserve the main flow',async({page})=>{
  await page.getByRole('button',{name:'Toggle Inspector',exact:true}).click();
  const panel=page.getByRole('region',{name:'Inspector panel'}),main=page.getByTestId('main-flow');
  await expect(panel).toHaveAttribute('data-dock','right');
  const edge=(await panel.getByRole('separator').boundingBox())!,before=(await panel.boundingBox())!.width;
  await page.mouse.move(edge.x+2,edge.y+100);await page.mouse.down();await page.mouse.move(edge.x-78,edge.y+100,{steps:8});await page.mouse.up();await expect.poll(async()=>(await panel.boundingBox())!.width).toBe(before+80);
  const handle=(await panel.locator('.gs-panel-drag').boundingBox())!;await page.mouse.move(handle.x+40,handle.y+15);await page.mouse.down();await page.mouse.move(500,300,{steps:10});await page.mouse.up();await expect(panel).toHaveAttribute('data-dock','float');
  const float=(await panel.locator('.gs-panel-drag').boundingBox())!;await page.mouse.move(float.x+30,float.y+10);await page.mouse.down();await page.mouse.move(500,40,{steps:10});await page.mouse.up();await expect(panel).toHaveAttribute('data-dock','top');
  await panel.getByRole('button',{name:'Close Inspector',exact:true}).click();await expect(panel).toBeHidden();await expect(main).toBeVisible();await page.getByRole('button',{name:'Toggle Inspector',exact:true}).click();await expect(panel).toHaveAttribute('data-dock','top');
});
test('helper explanations render above a clipped drawer',async({page})=>{
  await page.getByRole('button',{name:'Toggle Inspector',exact:true}).click();await page.getByRole('button',{name:'Explain this field'}).hover();
  const tip=page.getByRole('tooltip');await expect(tip).toBeVisible();expect(await tip.evaluate(element=>element.parentElement===document.body)).toBe(true);
  const box=(await tip.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(1280);expect(box.y+box.height).toBeLessThanOrEqual(800);
});
