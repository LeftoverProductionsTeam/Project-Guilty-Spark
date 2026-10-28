import { test, expect } from '@playwright/test';
test('workspace search keeps focus bounded and navigates with the keyboard', async ({ page }) => {
  await page.goto('/');
  const launcher=page.getByRole('button',{name:/Find tools/});
  await launcher.click();
  const search=page.getByRole('textbox',{name:'Search workspaces'});
  await expect(search).toBeFocused();
  await search.fill('zzzz-no-workspace');
  await search.press('ArrowUp');await search.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('No workspace matches.',{exact:false})).toBeVisible();
  await search.fill('QuickForge');await search.press('Enter');
  await expect(page.getByRole('heading',{name:'Make a place to play.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Create editable map',exact:true})).toBeDisabled();
  await launcher.click();await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(launcher).toBeFocused();
});
test('browser preview states native boundaries and navigates workspaces', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Browser preview', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Make a Halo world. Know what the engine needs.' })).toBeVisible();
  await page.getByRole('button', { name: 'Map library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your worlds, reimagined.' })).toBeVisible();
  await page.getByRole('button', { name: 'Tag editor', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose a world to work on' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings & tools', exact: true }).click();
  await expect(page.getByText('Live editing · AI replication · VR')).toBeVisible();
  await page.getByRole('button', { name: 'Map library', exact: false }).first().click();
  await page.getByRole('button', { name: 'Import map or archive', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('desktop application');
});
test('preservation and runtime workspaces disclose unavailable evidence without fake controls', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Compare variants', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Import two map variants' })).toBeVisible();
  await page.getByRole('button', { name: 'Runtimes & friends', exact: true }).click();
  await expect(
    page.getByText('Runtime discovery and file hashing require the desktop application.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh reports', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Level editor', exact: true }).click();
  await page.getByRole('combobox',{name:'Editing target',exact:true}).selectOption('live');
  await expect(
    page.getByRole('heading', { name: 'Live Halo 1 objects · MCC' }),
  ).toBeVisible();
  const connect=page.getByRole('button', { name: 'Connect current Halo 1 session',exact:true });
  await expect(connect).toBeDisabled();
  await page.getByRole('checkbox',{name:'I launched MCC using Anti-Cheat Disabled in Steam'}).check();
  await expect(connect).toBeDisabled();
  await expect(page.getByRole('button', { name: /Spawn|Dispatch/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Build & playtest', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose a world to work on' })).toBeVisible();
});
test('help modal traps focus and restores it after Escape', async ({ page }) => {
  await page.goto('/');
  const help = page.getByRole('button', { name: 'Help & shortcuts' });
  await help.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Back to the workbench' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close help' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(help).toBeFocused();
});

test('Dark Glow saves custom colors and keeps text white on dark surfaces',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Interface Studio',exact:true}).click();
  await page.locator('.interface-theme-dark-glow').click();
  await expect(page.locator('html')).toHaveAttribute('data-gs-theme','dark-glow');
  const choose=async(label:string,color:string)=>page.getByLabel(label,{exact:true}).evaluate((element,value)=>{
    const input=element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);
    input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
  },color);
  await choose('Primary glow color','#ff5d9c');await choose('Secondary glow color','#83ffcd');
  const strength=page.getByRole('slider',{name:'Glow strength',exact:true});await strength.focus();await strength.press('End');
  await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--gs-glow-primary').trim())).toBe('#ff5d9c');
  await expect(page.locator('.analysis-card').first()).toHaveCSS('background-color','rgb(16, 23, 37)');
  await expect(page.getByRole('heading',{name:'Make the workbench yours.'})).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(page.getByRole('button',{name:'Restore defaults',exact:true})).toHaveCSS('color','rgb(255, 255, 255)');
  await choose('Primary glow color','#ffffff');
  await expect(page.getByRole('button',{name:'Restore defaults',exact:true})).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(page.locator('.analysis-card').first()).toHaveCSS('background-color','rgb(16, 23, 37)');
  await choose('Primary glow color','#ff5d9c');await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-gs-theme','dark-glow');
  await page.getByRole('button',{name:'Interface Studio',exact:true}).click();
  await expect(page.getByLabel('Primary glow color',{exact:true})).toHaveValue('#ff5d9c');
  await expect(page.getByLabel('Secondary glow color',{exact:true})).toHaveValue('#83ffcd');
  await expect(page.getByRole('slider',{name:'Glow strength',exact:true})).toHaveValue('100');
  await strength.focus();await strength.press('Home');
  await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--gs-glow-percent').trim())).toBe('0%');
});
