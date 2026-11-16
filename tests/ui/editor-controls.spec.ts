// Browser interaction regressions, not native collision/gameplay acceptance.
import {test,expect} from '@playwright/test';
import {openDrawer} from './helpers/navigation';
test.beforeEach(async({page})=>{await page.setViewportSize({width:1280,height:800});await page.goto('/tests/ui/fixtures/editorControls.html');});
test('numeric scrubbing commits once and exact typing remains available',async({page})=>{
  const input=page.getByRole('spinbutton',{name:'Test position'}),box=(await input.boundingBox())!;
  await page.mouse.move(box.x+30,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+60,box.y+box.height/2,{steps:8});await page.mouse.up();
  await expect(input).toHaveValue('4');await page.getByRole('button',{name:'Leave field'}).click();await expect(page.getByTestId('commits')).toHaveText('[4]');
  await input.fill('-2.75');await input.press('Enter');await expect(page.getByTestId('commits')).toHaveText('[4,-2.75]');
  await input.fill('20');await input.press('Enter');await expect(input).toHaveAttribute('aria-invalid','true');await expect(page.getByTestId('commits')).toHaveText('[4,-2.75]');
});
for(const interrupted of ['released-button','lost-capture','window-blur'] as const)test(`numeric scrubbing cancels ${interrupted} without committing a stale drag`,async({page})=>{
  const input=page.getByRole('spinbutton',{name:'Test position'}),box=(await input.boundingBox())!;
  await page.mouse.move(box.x+30,box.y+box.height/2);await page.mouse.down();
  if(interrupted==='released-button')await input.dispatchEvent('pointermove',{pointerId:1,pointerType:'mouse',clientX:box.x+110,clientY:box.y+box.height/2,buttons:0});
  else{
    await page.mouse.move(box.x+60,box.y+box.height/2,{steps:8});
    if(interrupted==='lost-capture')await input.dispatchEvent('lostpointercapture',{pointerId:1,pointerType:'mouse'});
    else await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  }
  await page.mouse.up();await page.getByRole('button',{name:'Leave field'}).click();
  await expect(input).toHaveValue('1');await expect(page.getByTestId('commits')).toHaveText('[]');
  // A window-focus notification must not erase a typed value when no scrub is active.
  await input.fill('2.75');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.getByRole('button',{name:'Leave field'}).click();await expect(input).toHaveValue('2.75');await expect(page.getByTestId('commits')).toHaveText('[2.75]');
});
test('End uses object collision above the BSP and does not intercept typing',async({page})=>{
  await page.getByRole('textbox',{name:'Typing here'}).focus();await page.keyboard.press('End');await expect(page.getByTestId('drops')).toHaveText('[]');
  await page.getByRole('button',{name:'Leave field'}).click();await page.keyboard.press('End');await expect(page.getByTestId('height')).toHaveText('2.0001');await expect(page.getByTestId('drops')).toHaveText('[-2.9999]');
  await page.keyboard.press('End');await expect(page.getByTestId('drops')).toHaveText('[-2.9999]');
});
test('drawers drag from an edge, resize, dock at the top and preserve the main flow',async({page})=>{
  await openDrawer(page,'Inspector');
  const panel=page.getByRole('region',{name:'Inspector panel'}),main=page.getByTestId('main-flow');
  await expect(panel).toHaveAttribute('data-dock','right');
  const edge=(await panel.getByRole('separator').boundingBox())!,before=(await panel.boundingBox())!.width;
  await page.mouse.move(edge.x+2,edge.y+100);await page.mouse.down();await page.mouse.move(edge.x-78,edge.y+100,{steps:8});await page.mouse.up();await expect.poll(async()=>(await panel.boundingBox())!.width).toBe(before+80);
  const handle=(await panel.locator('.gs-panel-drag').boundingBox())!;await page.mouse.move(handle.x+Math.min(40,handle.width/2),handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(500,300,{steps:10});await page.mouse.up();await expect(panel).toHaveAttribute('data-dock','float');
  const float=(await panel.locator('.gs-panel-drag').boundingBox())!;await page.mouse.move(float.x+Math.min(30,float.width/2),float.y+float.height/2);await page.mouse.down();await page.mouse.move(500,40,{steps:10});await page.mouse.up();await expect(panel).toHaveAttribute('data-dock','top');
  await panel.getByRole('button',{name:'Close Inspector',exact:true}).click();await expect(panel).toBeHidden();await expect(main).toBeVisible();await openDrawer(page,'Inspector');await expect(panel).toHaveAttribute('data-dock','top');
});
test('helper explanations render above a clipped drawer',async({page})=>{
  await openDrawer(page,'Inspector');await page.getByRole('button',{name:'Explain this field'}).hover();
  const tip=page.getByRole('tooltip');await expect(tip).toBeVisible();expect(await tip.evaluate(element=>element.parentElement===document.body)).toBe(true);
  const box=(await tip.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(1280);expect(box.y+box.height).toBeLessThanOrEqual(800);
});

// Retained inspectors share only source ownership, never their local busy flag.
test('native AI preview remains stable with an idle retained inspector',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto('/tests/ui/fixtures/editorControls.html?native-ai');
 const first=page.getByTestId('ai-inspector-0'),second=page.getByTestId('ai-inspector-1');
 await first.locator('summary').click();await second.locator('summary').click();
 await first.getByRole('spinbutton',{name:'AI start X',exact:true}).fill('5');
 await first.getByRole('button',{name:'Show handles in Level Editor',exact:true}).click();
 const state=()=>page.getByTestId('ai-draft').textContent().then(text=>JSON.parse(text!));
 await first.getByRole('button',{name:'Preview AI starting position',exact:true}).click();
 await expect(first.getByRole('spinbutton',{name:'AI start X',exact:true})).toBeDisabled();
 await expect(second.getByRole('spinbutton',{name:'AI start X',exact:true})).toBeEnabled();
 expect(await state()).toMatchObject({values:['5','2','3'],locked:false,active:true});
 await page.getByRole('button',{name:'Finish preview',exact:true}).click();
 await expect(first.getByRole('spinbutton',{name:'AI start X',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Toggle project dirty',exact:true}).click();
 await expect.poll(async()=>(await state()).locked).toBe(true);
 await expect(second.getByRole('spinbutton',{name:'AI start X',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Toggle project dirty',exact:true}).click();
 await expect.poll(async()=>(await state()).locked).toBe(false);expect(errors).toEqual([]);
});

// Source pose proposals must preserve units, unknown telemetry and retained ownership.
test('native AI facing reuses reviewed source pose editing and refuses unavailable heading',async({page})=>{
 await page.goto('/tests/ui/fixtures/editorControls.html?native-ai-facing');
 const panel=page.getByTestId('ai-inspector-0');await panel.locator('summary').click();
 const heading=panel.getByRole('spinbutton',{name:'AI start facing degrees',exact:true});await expect(heading).toHaveValue('90');
 await panel.getByRole('combobox',{name:'AI start handle mode',exact:true}).selectOption('rotate');
 await heading.fill('-90');await panel.getByRole('button',{name:'Show handles in Level Editor',exact:true}).click();
 await expect.poll(()=>page.getByTestId('ai-draft').textContent().then(text=>JSON.parse(text!).mode)).toBe('rotate');
 await panel.getByRole('button',{name:'Preview AI facing',exact:true}).click();
 const operation=JSON.parse((await page.getByTestId('ai-operation').textContent())!);
 expect(operation).toMatchObject({kind:'encounterStartPosition',position:[1,2,3],sourceSha256:'a'.repeat(64)});expect(operation.facingRadians).toBeCloseTo(-Math.PI/2,7);
 await page.getByRole('button',{name:'Finish preview',exact:true}).click();await heading.fill('361');
 await expect(panel.getByRole('button',{name:/^Preview AI /})).toBeDisabled();
 await page.goto('/tests/ui/fixtures/editorControls.html?native-ai');await page.getByTestId('ai-inspector-0').locator('summary').click();
 await expect(page.getByTestId('ai-inspector-0').getByRole('spinbutton',{name:'AI start facing degrees',exact:true})).toHaveCount(0);
 const unavailable=page.getByTestId('ai-inspector-0');await expect(unavailable.getByRole('option',{name:/Rotate facing/})).toHaveAttribute('disabled','');
 const mode=unavailable.getByRole('combobox',{name:'AI start handle mode',exact:true});await mode.focus();await mode.press('End');await expect(mode).toHaveValue('translate');
});

test('native firing-position proposals preserve native group and refuse heading through retained inspectors',async({page})=>{
 await page.goto('/tests/ui/fixtures/editorControls.html?native-ai-firing');const first=page.getByTestId('ai-inspector-0'),second=page.getByTestId('ai-inspector-1');await first.locator('summary').click();await second.locator('summary').click();await first.getByRole('spinbutton',{name:'AI firing X',exact:true}).fill('7');await first.getByRole('combobox',{name:'AI firing native group',exact:true}).selectOption('b');await first.getByRole('button',{name:'Show handles in Level Editor',exact:true}).click();await expect.poll(()=>page.getByTestId('ai-draft').textContent().then(text=>JSON.parse(text!).kind)).toBe('firing');await expect(first.getByRole('option',{name:/Rotate facing/})).toHaveAttribute('disabled','');await expect(first.getByRole('spinbutton',{name:'AI start facing degrees',exact:true})).toHaveCount(0);await first.getByRole('button',{name:'Preview AI firing position',exact:true}).click();expect(JSON.parse((await page.getByTestId('ai-operation').textContent())!)).toEqual({kind:'encounterFiringPosition',encounter:0,point:0,encounterName:'guards',position:[7,2,3],group:'b',sourceSha256:'a'.repeat(64)});await expect(first.getByRole('spinbutton',{name:'AI firing X',exact:true})).toBeDisabled();await expect(second.getByRole('spinbutton',{name:'AI firing X',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Finish preview',exact:true}).click();await first.getByRole('button',{name:'Reset firing draft',exact:true}).click();await expect(first.getByRole('spinbutton',{name:'AI firing X',exact:true})).toHaveValue('1');await expect(first.getByRole('combobox',{name:'AI firing native group',exact:true})).toHaveValue('z');
});

test('native behavior reviews squad states and explicit starting-location overrides without changing source',async({page})=>{
 await page.goto('/tests/ui/fixtures/editorControls.html?native-behavior');const editor=page.locator('.native-squad-behavior');await editor.locator('summary').click();const initial=editor.getByRole('combobox',{name:'Native squad initial state',exact:true}),ret=editor.getByRole('combobox',{name:'Native squad return state',exact:true}),preview=editor.getByRole('button',{name:'Preview native behavior',exact:true});await expect(preview).toBeDisabled();await expect(initial.locator('option')).toHaveCount(12);await expect(initial.locator('option[value="moving_loop"]')).toHaveAttribute('disabled','');await initial.selectOption('sleeping');await ret.selectOption('guarding');await preview.click();let op=JSON.parse((await page.getByTestId('behavior-operation').textContent())!);expect(op).toMatchObject({kind:'encounterSquadBehavior',encounter:0,squad:0,sourceSha256:'a'.repeat(64),behavior:{initialState:'sleeping',returnState:'guarding',patrolCount:0}});expect(op.behavior.starts.map(p=>p.initialState)).toEqual(['alert','none']);await editor.getByRole('combobox',{name:'Native behavior starting location',exact:true}).selectOption('1');await editor.getByRole('combobox',{name:'Native behavior start initial state',exact:true}).selectOption('fleeing');await preview.click();op=JSON.parse((await page.getByTestId('behavior-operation').textContent())!);expect(op.behavior.starts[0].initialState).toBe('alert');expect(op.behavior.starts[1].initialState).toBe('fleeing');await editor.getByRole('button',{name:'Use squad behavior on all starts',exact:true}).click();await preview.click();op=JSON.parse((await page.getByTestId('behavior-operation').textContent())!);expect(op.behavior.starts.every(p=>p.initialState==='sleeping'&&p.returnState==='guarding')).toBe(true);expect(JSON.parse((await page.getByTestId('behavior-original').textContent())!).initialState).toBe('none');await page.getByRole('button',{name:'Toggle project dirty',exact:true}).click();await expect(preview).toBeDisabled();await expect(initial).toBeDisabled();await page.getByRole('button',{name:'Toggle project dirty',exact:true}).click();await editor.getByRole('button',{name:'Reset behavior draft',exact:true}).click();await expect(initial).toHaveValue('none');await initial.selectOption('guarding_at_guard_position');await page.getByRole('button',{name:'Refresh source revision',exact:true}).click();await expect(initial).toHaveValue('none');await expect(preview).toBeDisabled();
});


test('recovered patrol form preserves source rows, ordered edits and source-change guards',async({page})=>{
 await page.goto('/tests/ui/fixtures/editorControls.html?native-patrol');const editor=page.locator('.native-squad-patrol');await editor.locator('> summary').click();const original=await page.getByTestId('patrol-source').textContent();
 const x=editor.getByRole('spinbutton',{name:'Native patrol X',exact:true}),preview=editor.getByRole('button',{name:'Preview native patrol',exact:true});await expect(preview).toBeDisabled();
 await editor.getByRole('button',{name:'Duplicate patrol point',exact:true}).click();await x.fill('9');await editor.getByRole('spinbutton',{name:'Native patrol weight',exact:true}).fill('2.5');await editor.getByRole('spinbutton',{name:'Native patrol minimum wait',exact:true}).fill('1');await editor.getByRole('spinbutton',{name:'Native patrol maximum wait',exact:true}).fill('4');
 await editor.getByRole('button',{name:'Move point earlier',exact:true}).click();await expect(x).toHaveValue('9');await preview.click();let operation=JSON.parse((await page.getByTestId('patrol-operation').textContent())!);expect(operation.kind).toBe('encounterSquadPatrol');expect(operation.route.points.map((p:any)=>p.sourceIndex)).toEqual([0,0,1]);expect(operation.route.points[0]).toMatchObject({position:[9,2,3],animation:7,sequenceId:-4,weight:2.5,waitSeconds:[1,4]});expect(await page.getByTestId('patrol-source').textContent()).toBe(original);
 await editor.getByRole('button',{name:'Show patrol handles in Level Editor',exact:true}).click();await expect.poll(()=>page.getByTestId('patrol-draft').textContent().then(s=>JSON.parse(s!).active)).toBe(true);
 await page.getByRole('button',{name:'Toggle project dirty',exact:true}).click();await expect(x).toBeDisabled();await expect(preview).toBeDisabled();await page.getByRole('button',{name:'Toggle project dirty',exact:true}).click();await expect(x).toBeEnabled();
 await editor.getByRole('button',{name:'Reset patrol draft',exact:true}).click();await expect(x).toHaveValue('1');await editor.getByRole('button',{name:'Remove patrol point',exact:true}).click();await expect(preview).toBeDisabled();await expect(editor).toContainText('every starting-location movement state');
 await editor.getByRole('button',{name:'Add patrol point',exact:true}).click();await preview.click();operation=JSON.parse((await page.getByTestId('patrol-operation').textContent())!);expect(operation.route.points[1]).toMatchObject({sourceIndex:null,animation:-1,sequenceId:0});
 await page.getByRole('button',{name:'Refresh source revision',exact:true}).click();await expect(preview).toBeDisabled();await expect(editor.getByRole('combobox',{name:'Native patrol point',exact:true})).toHaveValue('0');
 await page.getByRole('button',{name:'Toggle source protection',exact:true}).click();await expect(x).toBeDisabled();await expect(preview).toBeDisabled();
});


test('native starting command-list binding keeps the pose, source and other inspector drafts',async({page})=>{
 await page.goto('/tests/ui/fixtures/editorControls.html?native-ai-start&commands&facing');const first=page.getByTestId('ai-inspector-0');await first.locator('summary').click();
 const binding=first.getByRole('combobox',{name:'AI start command list',exact:true});await expect(binding).toHaveValue('-1');await expect(binding.getByRole('option',{name:'1 · patrol · 3 commands',exact:true})).toHaveCount(1);
 await binding.selectOption('1');await first.getByRole('button',{name:'Show handles in Level Editor',exact:true}).click();await expect(binding).toHaveValue('1');await first.getByRole('button',{name:'Preview AI start command binding',exact:true}).click();
 const operation=JSON.parse((await page.getByTestId('ai-operation').textContent())!);expect(operation).toMatchObject({kind:'encounterStartPosition',encounter:0,squad:0,start:0,position:[1,2,3],commandList:1,facingRadians:Math.PI/2,sourceSha256:'a'.repeat(64)});
 await page.getByRole('button',{name:'Finish preview',exact:true}).click();await first.getByRole('button',{name:'Reset coordinate draft',exact:true}).click();await expect(binding).toHaveValue('-1');
 await binding.selectOption('0');await page.getByRole('button',{name:'Toggle project dirty',exact:true}).click();await expect(binding).toBeDisabled();await page.getByRole('button',{name:'Toggle project dirty',exact:true}).click();await expect(binding).toHaveValue('0');
});


test('existing cutscene camera proposals preserve identity, validate lens and discard stale source',async({page})=>{
 await page.goto('/tests/ui/fixtures/editorControls.html?native-camera');const form=page.locator('.native-cutscene-cameras');await form.locator('> summary').click();const x=form.getByRole('spinbutton',{name:'Cutscene camera X',exact:true}),lens=form.getByRole('spinbutton',{name:'Cutscene camera FOV',exact:true}),preview=form.getByRole('button',{name:'Preview native camera edit',exact:true});await expect(preview).toBeDisabled();await x.fill('8.5');await lens.fill('180');await expect(preview).toBeDisabled();await lens.fill('80');await preview.click();const op=JSON.parse((await page.getByTestId('camera-operation').textContent())!);expect(op).toMatchObject({kind:'cutsceneCamera',sourceSha256:'a'.repeat(64),point:{index:0,name:'intro',position:[8.5,2,3]}});expect(op.point.fovRadians).toBeCloseTo(80*Math.PI/180,8);
 await page.getByRole('button',{name:'Toggle project dirty',exact:true}).click();await expect(preview).toBeDisabled();await expect(x).toBeDisabled();await page.getByRole('button',{name:'Toggle project dirty',exact:true}).click();await expect(x).toHaveValue('8.5');await page.getByRole('button',{name:'Refresh source revision',exact:true}).click();await expect(x).toHaveValue('1');await expect(preview).toBeDisabled();
 await form.getByRole('button',{name:'Use Level Editor camera',exact:true}).click();await expect(form).toContainText('A current pose and supported lens are required');
});

test('existing trigger geometry keeps native identity and rejects invalid or stale drafts',async({page})=>{
 await page.goto('/tests/ui/fixtures/editorControls.html?native-volume');const form=page.locator('.native-trigger-volumes');await form.locator('> summary').click();const x=form.getByRole('spinbutton',{name:'Trigger center X',exact:true}),size=form.getByRole('spinbutton',{name:'Trigger size X',exact:true}),preview=form.getByRole('button',{name:'Preview trigger geometry',exact:true});await expect(x).toHaveValue('2');await expect(preview).toBeDisabled();await x.fill('5');await size.fill('0');await expect(preview).toBeDisabled();await size.fill('8');await preview.click();const op=JSON.parse((await page.getByTestId('volume-operation').textContent())!);expect(op).toMatchObject({kind:'triggerVolume',index:0,name:'intro_area',sourceSha256:'a'.repeat(64),geometry:{corner:[1,0,0],dimensions:[8,6,8]}});
 await page.getByRole('button',{name:'Toggle project dirty',exact:true}).click();await expect(x).toBeDisabled();await expect(preview).toBeDisabled();await page.getByRole('button',{name:'Toggle project dirty',exact:true}).click();await page.getByRole('button',{name:'Refresh source revision',exact:true}).click();await expect(x).toHaveValue('2');await expect(preview).toBeDisabled();
});
