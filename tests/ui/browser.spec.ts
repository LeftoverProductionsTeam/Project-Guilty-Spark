import {chooseTool} from './helpers/navigation';
import { test, expect } from '@playwright/test';
test('runtime dock keeps all nine tools visible without a horizontal scrollbar',async({page})=>{
  for(const size of [{width:1500,height:950},{width:1280,height:768},{width:1024,height:640}]){
    await page.setViewportSize(size);await page.goto('/');
    const dock=page.getByRole('contentinfo',{name:'Runtime & Tools Dock'});
    for(const name of ['Play Halo','Test Scene','Edit level','Edit tags','Build','Publish','Find games','Host','Legacy tools'])await expect(dock.getByRole('button',{name:new RegExp(`^${name}`)})).toBeVisible();
    const bounds=await dock.evaluate(element=>{const r=element.getBoundingClientRect();return {bottom:r.bottom,extra:element.scrollWidth-element.clientWidth,clipped:[...element.querySelectorAll('.runtime-dock-actions>button')].some(button=>button.getBoundingClientRect().right>r.right)};});
    expect(bounds.bottom).toBeLessThanOrEqual(size.height);expect(bounds.extra).toBe(0);expect(bounds.clipped).toBe(false);
  }
});

test('linked Halo sound segments decode in link order without an inserted gap', async ({page}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const {createEmitter, decodeSoundChain} = await import('/src/spatialAudio.ts');
    const sourceSha256 = 'a'.repeat(64), context = new OfflineAudioContext(1, 882, 44100),
      hash = async (data: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)),
        b => b.toString(16).padStart(2, '0')).join('');
    async function wave(value: number) {
      const bytes = new Uint8Array(44 + 882), view = new DataView(bytes.buffer),
        text = (at: number, s: string) => [...s].forEach((c,i) => view.setUint8(at+i,c.charCodeAt(0)));
      text(0,'RIFF');view.setUint32(4,bytes.length-8,true);text(8,'WAVE');text(12,'fmt ');
      view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
      view.setUint32(24,44100,true);view.setUint32(28,88200,true);view.setUint16(32,2,true);
      view.setUint16(34,16,true);text(36,'data');view.setUint32(40,882,true);
      for(let i=0;i<441;i++) view.setInt16(44+i*2,value,true);
      return {name:'Synthetic segment',mime:'audio/wav' as const,bytes:[...bytes],sha256:await hash(bytes),
        sourceSha256,sourceSampleSha256:await hash(bytes.slice(44))};
    }
    const clips = [await wave(-3276),await wave(6553)], calls: number[] = [],
      emitter = createEmitter(9,'Synthetic linked sample'),
      permutations = [0,2].map((permutation,i) => ({pitchRange:0,permutation,name:'segment',format:'PCM',
        channels:1,sampleRate:44100,byteLength:882,embedded:true,available:true,
        sha256:clips[i].sourceSampleSha256,durationSeconds:.01,reason:null,
        nextPermutation:i === 0 ? 2 : null,chainStart:i===0})),
      report = {tagId:9,tagPath:'synthetic',sourceSha256,permutations,warnings:[]};
    const combined = await decodeSoundChain(context,emitter,report,sourceSha256,async index => {
      calls.push(index);return clips[index===0?0:1];
    });
    const samples = combined.getChannelData(0);
    let rejectedAfterStop = false;
    try { await decodeSoundChain(context,emitter,report,sourceSha256,async () => clips[0],() => true); }
    catch { rejectedAfterStop = true; }
    return {calls,length:combined.length,first:samples[440],second:samples[441],rejectedAfterStop};
  });
  expect(result.calls).toEqual([0,2]);expect(result.length).toBe(882);
  expect(result.first).toBeCloseTo(-.1,3);expect(result.second).toBeCloseTo(.2,3);
  expect(result.rejectedAfterStop).toBe(true);
});

test('spatial sound rehearsal renders the correct ear, falloff and solo bus in Web Audio',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {SpatialSoundMixer,createEmitter,emptySoundScene}=await import('/src/spatialAudio.ts');
    async function render(position:[number,number,number],reverse=false,soloOther=false){
      const context=new OfflineAudioContext(2,48000,48000),buffer=context.createBuffer(1,48000,48000),samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.sin(i*2*Math.PI*700/48000)*.1;
      const scene=emptySoundScene(),emitter=createEmitter(1,'Synthetic audio test',position);emitter.loop=false;scene.master=1;scene.emitters=[emitter];if(soloOther)scene.buses.music.solo=true;
      const mixer=new SpatialSoundMixer(context,async()=>buffer);mixer.configure(scene);mixer.setListener({position:[0,0,0],forward:reverse?[-1,0,0]:[1,0,0],up:[0,0,1]});await mixer.play(emitter);const rendered=await context.startRendering();const energy=[0,1].map(channel=>{const data=rendered.getChannelData(channel);let sum=0;for(let i=9600;i<data.length;i++)sum+=data[i]*data[i];return sum/(data.length-9600);});mixer.dispose();return energy;
    }
    return {right:await render([0,-2,0]),left:await render([0,2,0]),reverse:await render([0,-2,0],true),far:await render([0,-10,0]),solo:await render([0,-2,0],false,true)};
  });
  expect(result.right[1]).toBeGreaterThan(result.right[0]*1.2);expect(result.left[0]).toBeGreaterThan(result.left[1]*1.2);expect(result.reverse[0]).toBeGreaterThan(result.reverse[1]*1.2);
  const near=result.right[0]+result.right[1],far=result.far[0]+result.far[1];expect(far/near).toBeGreaterThan(.03);expect(far/near).toBeLessThan(.05);expect(result.solo[0]+result.solo[1]).toBeLessThan(1e-8);
});
test('sidebar keeps every workspace visible in tall and short windows', async ({ page }) => {
  for (const size of [{width:1280,height:944},{width:1280,height:768},{width:1024,height:640}]) {
    await page.setViewportSize(size);await page.goto('/');
    const sidebar=page.locator('.sidebar');
    if(!await sidebar.isVisible())await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();await expect(sidebar.getByRole('navigation',{name:'Workspaces'})).toBeVisible();
    const overflow=await sidebar.evaluate(element=>{
      const box=element.getBoundingClientRect();
      return {extra:element.scrollHeight-element.clientHeight,clipped:[...element.querySelectorAll('.nav-item')].filter(item=>{const r=item.getBoundingClientRect();return r.top<box.top-1||r.bottom>box.bottom+1;}).map(item=>item.textContent)};
    });
    expect(overflow,`${size.width}x${size.height}`).toEqual({extra:0,clipped:[]});
    await expect(sidebar.getByRole('button',{name:'Community Thanks',exact:true})).toBeVisible();
    await expect(sidebar.getByRole('button',{name:'Settings & tools',exact:true})).toBeVisible();
  }
});
test('workspace search keeps focus bounded and navigates with the keyboard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Toggle window and project header',exact:true}).click();
  const launcher=page.getByRole('button',{name:/Find tools/});
  await launcher.click();
  const search=page.getByRole('textbox',{name:'Search workspaces'});
  await expect(search).toBeFocused();
  await search.fill('zzzz-no-workspace');
  await search.press('ArrowUp');await search.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('No workspace matches.',{exact:false})).toBeVisible();
  await search.fill('QuickForge');await search.press('Enter');
  await page.getByRole('button',{name:'Create a new Halo level',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Make a place to play.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Create editable map',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Toggle window and project header',exact:true}).click();await launcher.click();await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(launcher).toBeFocused();
});
test('browser preview states native boundaries and navigates workspaces', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Toggle window and project header',exact:true}).click();
  await expect(page.getByText('Browser preview', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Make a Halo world. Know what the engine needs.' })).toBeVisible();
  await chooseTool(page,"Map library");
  await expect(page.getByRole('heading', { name: 'Your worlds, reimagined.' })).toBeVisible();
  await chooseTool(page,"Tag editor");
  await expect(page.getByRole('heading', { name: 'Choose a world to work on' })).toBeVisible();
  await chooseTool(page,"Settings & tools");
  await expect(page.getByText('Live editing · AI replication · VR')).toBeVisible();
  await chooseTool(page,'Map library');
  await page.getByRole('button', { name: 'Import map or archive', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('desktop application');
});
test('preservation and runtime workspaces disclose unavailable evidence without fake controls', async ({
  page,
}) => {
  await page.goto('/');
  await chooseTool(page,"Compare variants");
  await expect(page.getByRole('heading', { name: 'Import two map variants' })).toBeVisible();
  await chooseTool(page,"Play & servers");
  await expect(
    page.getByText('Runtime discovery and file hashing require the desktop application.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh reports', exact: true })).toBeDisabled();
  await chooseTool(page,"Level editor");
  await page.getByRole('button',{name:'Connect to a running Halo game',exact:true}).click();
  await page.getByRole('combobox',{name:'Editing target',exact:true}).selectOption('live');
  await page.getByRole('button',{name:'Toggle Game connection',exact:true}).click();
  await expect(
    page.getByRole('heading', { name: 'Live Halo 1 objects · MCC' }),
  ).toBeVisible();
  const connect=page.getByRole('button', { name: 'Connect current Halo 1 session',exact:true });
  await expect(connect).toBeDisabled();
  await page.getByRole('checkbox',{name:'I launched MCC using Anti-Cheat Disabled in Steam'}).check();
  await expect(connect).toBeDisabled();
  await expect(page.getByRole('button', { name: /Spawn|Dispatch/ })).toHaveCount(0);
  await chooseTool(page,"Build & playtest");
  await expect(page.getByRole('heading', { name: 'Choose a world to work on' })).toBeVisible();
});
test('help modal traps focus and restores it after Escape', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Toggle window and project header',exact:true}).click();
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
  await chooseTool(page,"Settings & tools");
  await page.getByRole('tab',{name:'Interface Studio',exact:true}).click();
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
  await chooseTool(page,"Settings & tools");
  await page.getByRole('tab',{name:'Interface Studio',exact:true}).click();
  await expect(page.getByLabel('Primary glow color',{exact:true})).toHaveValue('#ff5d9c');
  await expect(page.getByLabel('Secondary glow color',{exact:true})).toHaveValue('#83ffcd');
  await expect(page.getByRole('slider',{name:'Glow strength',exact:true})).toHaveValue('100');
  await strength.focus();await strength.press('Home');
  await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--gs-glow-percent').trim())).toBe('0%');
});
