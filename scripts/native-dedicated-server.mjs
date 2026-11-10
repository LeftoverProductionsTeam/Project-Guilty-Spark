// Native dedicated acceptance reuses the real CE Workshop authoring/compile fixture.
// Authenticated status is genuine upstream output; no synthetic server or game state.
import fs from 'node:fs/promises';
import {watch as watchFs} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import {promisify} from 'node:util';
import { chooseTool, openStudioMenu, revealPagedControl } from '../tests/ui/helpers/navigation.ts';
import { auditPagedSurface } from '../tests/ui/helpers/compactSurfaces.ts';
import {windowUiScale} from '../src/uiScale.ts';
import {stopQaProcess,waitForQaExit,sealQaScratch,disposeQaScratch} from './native-qa-storage.mjs';
export async function nativeDedicatedServer({
  page,
  root,
  call,
  expect,
  receipt,
  compiled,
  trackProcess,
  createScratch,
  projectId,
  expectedSpawns,
  liveRebuild,
  emptyGameLifecycle=false,
  verifyLifecycleFaults=false,
  compilerFailureBeforeRebuild=false,
  ownerProcessId,
  checkpoint=async()=>{},
}) {
  const hash = async (file) =>
    crypto
      .createHash('sha256')
      .update(await fs.readFile(file))
      .digest('hex');
  if(verifyLifecycleFaults&&(!compiled||!liveRebuild||process.platform!=='win32'||!Number.isSafeInteger(ownerProcessId)||ownerProcessId<=0))throw Error('Native lifecycle faults require this harness-owned Windows app and compiled CE session');
  const created = compiled ? (await call('bootstrap')).entries.find((row) => projectId ? row.id === projectId : row.title === 'Native live rebuild') : null;
  if(compiled){
    expect(created).toBeTruthy();
    const saved = (await call('open_project', { id: created.id })).project;
    expect(saved.builds.some((row) => row.id === compiled.build.id && row.sha256 === compiled.build.sha256)).toBe(true);
    (receipt.liveRebuild??={}).projectId = created.id;
  }else expect(liveRebuild).toBeUndefined();

  await page.evaluate(()=>{
    window.__sparkQaHostClicks=[];
    document.addEventListener('pointerdown',event=>{
      const button=event.target?.closest?.('button');if(!button)return;
      const rect=button.getBoundingClientRect();
      window.__sparkQaHostClicks.push({label:(button.getAttribute('aria-label')||button.textContent||'').trim().slice(0,160),x:event.clientX,y:event.clientY,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},zoom:document.documentElement.style.zoom,selected:[...document.querySelectorAll('.online-toolbar button.selected')].map(node=>node.textContent.trim())});
      if(window.__sparkQaHostClicks.length>32)window.__sparkQaHostClicks.shift();
    },true);
  });
  const studio = await openStudioMenu(page);
  await studio.getByLabel('Active Halo runtime', { exact: true }).selectOption('chupathingyCe');
  await studio.getByLabel('Studio options', { exact: true }).click();
  await chooseTool(page, 'Online');
  await page.getByRole('button', { name: 'Host game', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Private Chupathingy dedicated server', exact: true });
  await expect(panel).toBeVisible();
  const download = panel.getByRole('button', { name: 'Download verified server · 21 MB', exact: true });
  if (await download.isVisible()) await download.click();
  await expect
    .poll(async () => {
      const installed = await call('community_server_installation');
      const problem = (await panel.locator(':scope > .notice').allTextContents()).join(' ').trim();
      return installed.installed || problem ? 'finished' : 'pending';
    }, { timeout: 180000, intervals: [1000, 2500] })
    .toBe('finished');
  const installed = await call('community_server_installation');
  receipt.dedicatedSetup={installed:installed.installed,problem:(await panel.locator(':scope > .notice').allTextContents()).join(' ').trim()};
  await checkpoint('server-setup-finished');
  expect(installed.installed,`Native dedicated setup: ${receipt.dedicatedSetup.problem || 'installation not present'}`).toBe(true);
  expect(await hash(installed.executable)).toBe(
    '25a206c6c7d6454a6f6a41a8a5987a1e30334db7404e8bf895f1e8429485ce85',
  );
  if(compiled)await panel.getByRole('checkbox', { name: /Use current CE build/ }).check();
  else await expect(panel.getByRole('checkbox', { name: /Use current CE build/ })).toHaveCount(0);
  await panel.getByText('Local trial routing', { exact: true }).click();
  await panel.getByRole('textbox', { name: 'Private trial client addresses', exact: true }).fill('127.0.0.1');
  await panel.getByRole('button', { name: 'Start private dedicated server', exact: true }).click();
  await expect(panel).toContainText('localhost is redirected');
  expect(await call('community_server_status')).toBeNull();
  await panel
    .getByRole('textbox', { name: 'Private trial client addresses', exact: true })
    .fill('127.0.0.3,127.0.0.4');
  await panel.getByRole('button', { name: 'Start private dedicated server', exact: true }).click();
  let session;
  await expect
    .poll(
      async () => {
        session = await call('community_server_status');
        if (session?.phase === 'failed') throw Error(session.detail);
        return session?.status;
      },
      { timeout: 240000, intervals: [1000, 2000] },
    )
    .toMatchObject({ version: '0.9.0c', networkVersion: 32, public: false });
  if(compiled){expect(session.sourceBuildId).toBe(compiled.build.id);expect(session.mapSha256).toBe(compiled.build.sha256);}
  else{expect(session.sourceBuildId).toBeNull();expect(session.map).toBe('bloodgulch');}
  const base = session.sessionDirectory,
    map = path.join(base, session.map.endsWith('@ce')?'data/maps_ce':'data/maps', session.map.replace(/@ce$/, '') + '.map');
  expect(await hash(map)).toBe(session.mapSha256);
  console.log(
    'DEDICATED_NATIVE',
    JSON.stringify({ phase: 'authenticated-ready', pid: session.processId, map: session.map }),
  );
  receipt.nativeDedicated = {
    installed,
    start: session,
    unsafeDefaultRejectedBeforeSession: true,
    originalsUnchanged: false,
    twoClients: false,
    gameplayAccepted: false,
    aiAccepted: false,
    persistenceAccepted: false,
  };
  await page.screenshot({ path: path.join(root, 'native-dedicated-ready.png') });
  await checkpoint('authenticated-ready');
  const allClients=[];
  let clients=[];
  const runtime = path.resolve(process.env.SPARK_TEST_CHUPATHINGY_ROOT);
  const sourceMembers=JSON.parse(await fs.readFile(new URL('../docs/fixtures/chupathingy-playtest-members-20261108.json',import.meta.url),'utf8'));
  const runtimeConfig=path.join(runtime,'config.toml'),configBefore=await fs.readFile(runtimeConfig).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  const originalClientPins=await Promise.all(sourceMembers.files.map(async row=>({file:path.join(runtime,row.file),sha256:await hash(path.join(runtime,row.file))})));
  for(let i=0;i<sourceMembers.files.length;i++)expect(originalClientPins[i].sha256).toBe(sourceMembers.files[i].sha256);
  const pin = JSON.parse(
    await fs.readFile(
      new URL('../docs/fixtures/managed-runtime-packages-20261107.json', import.meta.url),
      'utf8',
    ),
  ).packages.find((p) => p.id === 'chupathingy');
  // Each independent engine gets its own executable/settings/save/cache/log roots;
  // the same disposable, immutable map snapshot is read by all three processes.
  async function auditLayouts(phase=''){
  const label = await page.evaluate(() => window.__TAURI_INTERNALS__.metadata.currentWindow.label);
  const layouts=[];
  // A newly launched game owns foreground input. DOM focus alone can remain
  // true in an inactive WebView; keyboard layout checks need the real window.
  await call('plugin:window|set_focus', { label });
  await checkpoint('native-layout-focus-request');
  await expect.poll(()=>call('plugin:window|is_focused',{label}),{timeout:45000,message:'Activate only this private Spark owner before native keyboard layout checks'}).toBe(true);
  await call('plugin:window|unmaximize', { label });
  for (const [width, height] of [
    [800, 600],
    [1280, 720],
    [1366, 768],
    [1500, 950],
    [1920, 1080],
    [2560, 1080],
    [3440, 1440],
    [5120, 1440],
  ]) {
    await call('plugin:window|set_size', { label, value: { Logical: { width, height } } });
    const dpi=await call('plugin:window|scale_factor',{label}),scale=windowUiScale(null,width,height);
    await expect.poll(async()=>{const size=await call('plugin:window|inner_size',{label});return [Math.round(size.width/dpi),Math.round(size.height/dpi)];}).toEqual([width,height]);
    await expect(page.locator('html')).toHaveAttribute('data-gs-ui-scale',String(scale));
    await expect.poll(()=>page.evaluate(()=>({width:innerWidth,height:innerHeight})).then(v=>Math.max(Math.abs(v.width*scale-width),Math.abs(v.height*scale-height)))).toBeLessThanOrEqual(1.5);
    const surfaces = [];
    for (const surface of await page.locator('.gs-paged-surface:visible').all()) {
      let previous='',stable=0;
      await expect.poll(async()=>{const next=await surface.evaluate(root=>JSON.stringify({pages:root.getAttribute('data-pages'),box:root.getBoundingClientRect().toJSON(),viewport:root.querySelector('.gs-page-viewport').getBoundingClientRect().toJSON(),content:root.querySelector('.gs-page-body').getBoundingClientRect().toJSON()}));stable=next===previous?stable+1:0;previous=next;return stable;},{timeout:8000,intervals:[100]}).toBeGreaterThanOrEqual(5);
      const before=JSON.parse(previous);
      try{surfaces.push(await auditPagedSurface(surface));}catch(error){console.log('DEDICATED_LAYOUT_FAILURE',JSON.stringify({requested:{width,height},before,after:await surface.evaluate(root=>({pages:root.getAttribute('data-pages'),box:root.getBoundingClientRect().toJSON(),viewport:root.querySelector('.gs-page-viewport').getBoundingClientRect().toJSON(),content:root.querySelector('.gs-page-body').getBoundingClientRect().toJSON()}))}));throw error;}
    }
    expect(surfaces.length).toBeGreaterThan(0);
    const bounds = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
    }));
    expect(bounds.horizontalOverflow).toBeLessThanOrEqual(1);
    layouts.push({ requested: { width, height }, ...bounds, surfaces });
    if ([800, 1500, 3440, 5120].includes(width))
      await page.screenshot({ path: path.join(root, 'native-dedicated-' + (phase?phase+'-':'') + width + 'x' + height + '.png') });
  }
  await call('plugin:window|set_size', { label, value: { Logical: { width: 1500, height: 950 } } });
    return layouts;
  }
  async function startClients(dataBase,label,reuse=[]){
    clients=[];
    for (let index = 0; index < 2; index++) {
      const prior=reuse[index];
      if(prior){
        expect(allClients.includes(prior)&&prior.retired).toBe(true);
        expect(prior.child.exitCode!==null||prior.child.signalCode!==null).toBe(true);
        expect(prior.retainedSaveFiles.length).toBeGreaterThan(0);
        for(const row of prior.retainedSaveFiles)expect(await hash(row.file)).toBe(row.sha256);
        expect(await fs.stat(path.join(prior.client,'engine')).catch(()=>null)).toBeNull();
      }
      const client = prior?.client??await createScratch(label+'-client-' + index);
      for (const dir of ['engine', 'save', 'cache', 'logs'])
        await fs.mkdir(path.join(client, dir), { recursive: true });
      const members = JSON.parse(
        await fs.readFile(
          new URL('../docs/fixtures/chupathingy-playtest-members-20261108.json', import.meta.url),
          'utf8',
        ),
      );
      for (const row of members.files) {
        const source = path.join(runtime, row.file);
        expect(await hash(source)).toBe(row.sha256);
        await fs.copyFile(source, path.join(client, 'engine', row.file), fs.constants.COPYFILE_EXCL);
      }
      const env = { ...process.env };
      for (const key of Object.keys(env)) if (key.startsWith('HALO_')) delete env[key];
      Object.assign(env, {
        HALO_DATA_ROOT: path.join(dataBase, 'data'),
        HALO_SAVE_ROOT: path.join(client, 'save'),
        HALO_CACHE_ROOT: path.join(client, 'cache'),
        HALO_LOG_ROOT: path.join(client, 'logs'),
        HALO_NETWORK_TEST: 'join',
        HALO_NETWORK_TEST_START: '5',
        HALO_NETWORK_TEST_SHOOT: '0',
        HALO_NETWORK_TEST_KILL: '0',
        HALO_TEST_INPUT: '',
        HALO_NET_ADDRESS: `127.0.0.${3 + index}`,
        HALO_NET_BROADCAST: '127.0.0.2',
        HALO_NET_ONLINE: 'false',
        HALO_NET_ALLOW_UPNP: 'false',
        HALO_NET_LIST_GAMES: 'false',
        HALO_NET_BROWSER: '',
        HALO_NET_PUBLIC_LOBBY: 'false',
        HALO_NET_HOST_PUBLIC: 'false',
        HALO_NET_REPORT_HOSTED: 'false',
        HALO_NET_REPORT_GAMES: 'false',
        HALO_NET_REPORT_EVENTS: 'false',
        HALO_NET_SHARE_PROFILE: 'false',
        HALO_NET_JOIN_FROM_CLIPBOARD: 'never',
        HALO_NET_MAP_DOWNLOADS: 'never',
        HALO_UPDATE_AUTO: 'false',
        HALO_MOVE_OLD_MAP_FOLDERS: 'no',
        HALO_CRASH_REPORTS: 'no',
        HALO_DISCORD_PRESENCE: 'off',
        HALO_EXIT_AFTER: liveRebuild?'600':'100',
        HALO_HIDDEN_WINDOW: 'true',
        HALO_CONSOLE_LOG: 'all',
        SDL_AUDIO_DRIVER: 'dummy',
      });
      const privateExecutable=path.resolve(client,'engine',pin.executable);
      const outsideOriginal=path.relative(runtime,privateExecutable);
      expect(path.isAbsolute(outsideOriginal)||outsideOriginal.split(path.sep)[0]==='..').toBe(true);
      expect(path.relative(client,privateExecutable)).toBe(path.join('engine',pin.executable));
      for(const key of ['HALO_SAVE_ROOT','HALO_CACHE_ROOT','HALO_LOG_ROOT'])expect(path.relative(client,env[key])).not.toMatch(/^\.\.|^[A-Za-z]:/);
      expect(path.resolve(env.HALO_DATA_ROOT)).toBe(path.resolve(dataBase,'data'));
      const child = spawn(privateExecutable, ['--play'], {
        cwd: client,
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.once('spawn',()=>{receipt.gameLaunched=true;});
      await trackProcess(child);
      let output = '',
        pending = '',
        networkLog = '';
      const ticks = [];
      for (const stream of [child.stdout, child.stderr])
        stream.on('data', (chunk) => {
          const text = String(chunk);
          output = (output + text).slice(-65536);
          pending += text;
          const lines = pending.split('\n');
          pending = lines.pop().slice(-8192);
          for (const line of lines) {
            if (/network test:|network version|wire chupa|fatal|error|failed/i.test(line))
              networkLog = (networkLog + line + '\n').slice(-65536);
            const match = line.match(/network test: tick (\d+)/);
            if (match) {
              ticks.push({ tick: Number(match[1]), line: line.trim() });
              if (ticks.length > 180) ticks.shift();
            }
          }
        });
      const peer={
        child,
        client,
        ticks,
        get output() {
          return output;
        },
        get networkLog() {
          return networkLog;
        },
      };
      clients.push(peer);allClients.push(peer);
      if(prior)(receipt.nativeDedicated.reusedPlayerProfiles??=[]).push({previousPid:prior.child.pid,newPid:child.pid,samePrivateDirectory:client===prior.client,retainedFiles:prior.retainedSaveFiles.length,allRetainedFilesHashMatchedBeforeLaunch:true,qaOnly:true});
    }
  }
  async function waitForPeers(expected){
    await expect
      .poll(
        async () => {
          session = await call('community_server_status');
          if (session?.phase === 'failed') throw Error(session.detail);
          return session?.status;
        },
        { timeout: 120000, intervals: [1000, 2000] },
      )
      .toMatchObject({ state: 'in_game', players: 2, public: false });
    await expect
      .poll(
        () =>
          clients.every((c) =>
            c.ticks.some((t) => t.tick >= 60 && (t.line.match(/player \d+: \(/g) ?? []).length === 2),
          ),
        { timeout: 60000, intervals: [500, 1000] },
      )
      .toBe(true);
    const spawned = clients.map((c) => c.ticks.at(-1));
    const localIds = spawned.map((t) => Number(t.line.match(/\| local (\d+) camera/)?.[1]));
    expect(new Set(localIds).size).toBe(2);
    expect(localIds.every((i) => Number.isInteger(i) && i >= 0)).toBe(true);
    let spawnReadback;
    if(expected){
      expect(expected).toHaveLength(4);
      const peerPositions=spawned.map(t=>[...t.line.matchAll(/player (\d+): \(([-.\d]+) ([-.\d]+) ([-.\d]+)\)/g)].map(match=>({player:Number(match[1]),position:match.slice(2).map(Number)})));
      for(const positions of peerPositions){expect(positions).toHaveLength(2);for(const row of positions)expect(expected.some(position=>Math.abs(position[0]-row.position[0])<.05&&Math.abs(position[1]-row.position[1])<.05&&Math.abs(position[2]-row.position[2])<1)).toBe(true);}
      expect(peerPositions[0]).toEqual(peerPositions[1]);
      spawnReadback={sourcePositions:expected,peerPositions,agreed:true,sourceZAllowance:1,sourceXyAllowance:.05};
    }
    return {spawned,spawnReadback};
  }
  async function stopClients(peers){
    for(const peer of peers){await stopQaProcess(peer.child);await waitForQaExit(peer.child);}
    for(const peer of peers){
      // Retire only the finished test engine copy and six reproducible cache
      // slots. Keep its generated player saves/configuration and native logs.
      const save=path.join(peer.client,'save'),kept=[];
      async function savedFiles(directory,relative=''){
        for(const entry of await fs.readdir(directory,{withFileTypes:true})){
          const next=path.join(relative,entry.name),file=path.join(directory,entry.name);
          if(entry.isSymbolicLink())throw Error('Linked QA player save refused');
          if(/^z[\\/]cache00[0-5]\.map$/.test(next))continue;
          if(entry.isDirectory())await savedFiles(file,next);
          else if(entry.isFile()){
            if(kept.length>=1024||(await fs.stat(file)).size>64*1024**2)throw Error('QA save snapshot exceeds its bound');
            kept.push({file,sha256:await hash(file)});
          }else throw Error('Unexpected QA player save entry');
        }
      }
      await savedFiles(save);
      const targets=[path.join(peer.client,'engine'),...Array.from({length:6},(_,i)=>path.join(save,'z',`cache${String(i).padStart(3,'0')}.map`))];
      let bytes=0;
      for(const target of targets)if(await fs.stat(target).catch(error=>{if(error.code==='ENOENT')return null;throw error;})){
        const seal=await sealQaScratch(root,target),removed=await disposeQaScratch(root,seal,{ownerFinished:true});bytes+=removed.bytes;
      }
      for(const row of kept)expect(await hash(row.file)).toBe(row.sha256);
      peer.retainedSaveFiles=kept;peer.retired=true;
      (receipt.nativeDedicated.retiredStoppedClients??=[]).push({pid:peer.child.pid,logicalBytes:bytes,savedFiles:kept.length,savesUnchanged:true,onlyDisposableCopies:true});
    }
    await checkpoint('stopped-old-client-caches-retired-saves-preserved');
  }
  let primaryFailure;
  try {
    await startClients(base,'dedicated');
    const firstPeers=await waitForPeers(expectedSpawns);
    receipt.nativeDedicated.spawnReadback=firstPeers.spawnReadback;
    receipt.nativeDedicated.spawnedClients = firstPeers.spawned;
    receipt.nativeDedicated.joined = session;
    receipt.nativeDedicated.twoClients = true;
    if(liveRebuild)receipt.nativeDedicated.activeLayouts=await auditLayouts('active');
    await checkpoint('two-clients-and-active-layouts');
    console.log('DEDICATED_NATIVE', JSON.stringify({ phase: 'two-clients-in-game', status: session.status }));
    const beforeRestart = clients.map((c) => ({ tick: c.ticks.at(-1).tick, count: c.ticks.length }));
    await panel.getByRole('button', { name: 'Restart map', exact: true }).click();
    await expect
      .poll(async () => (await call('community_server_status'))?.restarts, { timeout: 30000 })
      .toBe(1);
    await expect
      .poll(
        () =>
          clients.every((c, i) =>
            c.ticks.slice(beforeRestart[i].count).some((t) => t.tick < beforeRestart[i].tick),
          ),
        { timeout: 60000, intervals: [500, 1000] },
      )
      .toBe(true);
    await expect
      .poll(async () => (await call('community_server_status'))?.status, { timeout: 30000 })
      .toMatchObject({ state: 'in_game', players: 2, map: session.map });
    receipt.nativeDedicated.restart = await call('community_server_status');
    receipt.nativeDedicated.restartClients = clients.map((c) => c.ticks.at(-1));
    const handle = await fs.open(map, 'r+');
    const original = Buffer.alloc(4);
    await handle.read(original, 0, 4, 4);
    await handle.write(Buffer.alloc(4), 0, 4, 4);
    await handle.close();
    try {
      await panel.getByRole('button', { name: 'Restart map', exact: true }).click();
      await expect
        .poll(async () => (await call('community_server_status'))?.detail, { timeout: 15000 })
        .toContain('restart rejected');
      const rejected = await call('community_server_status');
      expect(rejected.processId).toBe(session.processId);
      expect(rejected.restarts).toBe(1);
      receipt.nativeDedicated.changedCacheRejected = rejected;
    } finally {
      const restore = await fs.open(map, 'r+');
      await restore.write(original, 0, 4, 4);
      await restore.close();
    }
    expect(await hash(map)).toBe(session.mapSha256);
    await page.screenshot({ path: path.join(root, 'native-dedicated-two-clients.png') });
    if(liveRebuild){
      const previous=await call('community_server_status'),previousClients=[...clients],ticksBefore=clients.map(peer=>peer.ticks.at(-1).tick);
      async function rejectBuild(baseline,actions,kind){
      await actions.breakBuild();
      await checkpoint(kind+'-invalid-source-selected');
      const failedTicks=clients.map(peer=>peer.ticks.at(-1).tick);
      const stagesParent=path.dirname(base),stagesBefore=(await fs.readdir(stagesParent)).sort(),newStages=new Set();let watchError;
      const watcher=watchFs(stagesParent,(_event,name)=>{if(name&&/^[0-9a-f-]{36}$/.test(String(name))&&!stagesBefore.includes(String(name)))newStages.add(String(name));});
      watcher.on('error',error=>{watchError=String(error);});
      const priorError=(await call('community_server_status')).error;
      const feedback=actions.uiPreflightError?panel.locator('.notice.warning').filter({hasText:actions.uiPreflightError}):null;
      if(feedback)await expect(feedback).toHaveCount(0);
      let uiPreflightError=null,observedJob=false;
      try{
        await panel.getByRole('button',{name:'Live Rebuild · restart round',exact:true}).click();
        if(feedback){
          await expect(feedback).toBeVisible();uiPreflightError=await feedback.innerText();
          const next=await call('community_server_status');expect(next.pendingJobId).toBeNull();expect(next.error).toBe(priorError);
        }else await expect.poll(async()=>{const next=await call('community_server_status');observedJob ||= !!next?.pendingJobId;return next?.pendingJobId===null&&next?.error&&(observedJob||next.error!==priorError);},{timeout:300000,intervals:[1000,2000]}).toBeTruthy();
      }finally{watcher.close();}
      expect(watchError).toBeUndefined();expect([...newStages]).toEqual([]);expect((await fs.readdir(stagesParent)).sort()).toEqual(stagesBefore);
      const rejected=await call('community_server_status');
      expect(rejected.processId).toBe(baseline.processId);expect(rejected.gameSha256).toBe(baseline.gameSha256);expect(rejected.compiledBuildId).toBe(baseline.compiledBuildId);expect(rejected.restarts).toBe(baseline.restarts);expect(rejected.status).toMatchObject({state:'in_game',players:2});
      expect(await hash(path.join(baseline.sessionDirectory,'data/maps_ce',baseline.map.replace(/@ce$/,'')+'.map'))).toBe(baseline.mapSha256);
      await expect.poll(()=>clients.every((peer,index)=>peer.ticks.at(-1)?.tick>failedTicks[index]),{timeout:10000}).toBe(true);
      const diagnostics=await actions.restoreBuild();
        const result={rejected,diagnostics,failureChannel:feedback?'ui-preflight':'native-job',uiPreflightError,serverProcessRetained:true,previousGoodCacheRetained:true,bothPeersKeptTicking:true,rejectedBeforeRuntimeCopy:true,newRuntimeStages:[...newStages]};
        await checkpoint(kind+'-failure-kept-two-peers');
        await page.screenshot({path:path.join(root,'native-dedicated-'+kind+'-rejected.png')});
        return result;
      }
      if(verifyLifecycleFaults){
        const frozen=await liveRebuild.edit();
        await panel.getByRole('button',{name:'Live Rebuild · restart round',exact:true}).click();
        await expect.poll(async()=>(await call('community_server_status'))?.pendingJobId,{timeout:10000}).toBeTruthy();
        const pending=await call('community_server_status'),racingTicks=clients.map(peer=>peer.ticks.at(-1).tick);
        expect(pending.processId).toBe(previous.processId);expect(pending.gameSha256).toBe(previous.gameSha256);
        const advanced=await liveRebuild.editDuringBuild();
        const afterEdit=await call('community_server_status');
        expect(afterEdit.pendingJobId,'The actual second edit must occur while the native compiler is still pending').toBe(pending.pendingJobId);
        expect(afterEdit.sourceFingerprint).not.toBe(pending.sourceFingerprint);
        await checkpoint('saved-source-advanced-during-native-compile');
        await expect.poll(async()=>{const next=await call('community_server_status');return next?.pendingJobId===null&&next?.error;},{timeout:300000,intervals:[1000,2000]}).toContain('Source changed during compilation');
        const refused=await call('community_server_status');
        expect(refused.processId).toBe(previous.processId);expect(refused.gameSha256).toBe(previous.gameSha256);expect(refused.compiledBuildId).toBe(previous.compiledBuildId);expect(refused.restarts).toBe(previous.restarts);
        expect(refused.status).toMatchObject({state:'in_game',players:2});expect(await hash(map)).toBe(previous.mapSha256);
        await expect.poll(()=>clients.every((peer,index)=>peer.ticks.at(-1)?.tick>racingTicks[index]),{timeout:10000}).toBe(true);
        const readback=await liveRebuild.reviewUnadoptedBuild(pending.pendingJobId,frozen);
        receipt.nativeDedicated.pendingSourceRace={pending,advanced,afterEdit,refused,readback,serverProcessRetained:true,bothPeersKeptTicking:true,staleOutputNotAdopted:true};
        await expect(panel).toContainText('Source changed during compilation');
        await page.screenshot({path:path.join(root,'native-dedicated-source-race.png')});
        await checkpoint('changed-source-native-output-refused');
      }
      // The large native-content fixture checks the real compiler rejection
      // before retaining a second runtime stage. It additionally checks an
      // actual prerequisite failure after successful adoption. No checks or
      // inputs are omitted and the same 4 GiB QA budget remains in force.
      const earlyCompilerFailure=compilerFailureBeforeRebuild?await rejectBuild(previous,liveRebuild,'native-compiler'):null;
      await liveRebuild.edit();
      await panel.getByRole('button',{name:'Live Rebuild · restart round',exact:true}).click();
      await expect.poll(async()=>(await call('community_server_status'))?.pendingJobId,{timeout:10000}).toBeTruthy();
      const compiling=await call('community_server_status');
      expect(compiling.processId).toBe(previous.processId);expect(compiling.gameSha256).toBe(previous.gameSha256);expect(await hash(map)).toBe(previous.mapSha256);
      await expect.poll(()=>clients.every((peer,index)=>peer.ticks.at(-1)?.tick>ticksBefore[index]),{timeout:10000}).toBe(true);
      await checkpoint('live-rebuild-compiling-with-two-peers');
      console.log('DEDICATED_NATIVE',JSON.stringify({phase:'live-rebuild-compiling-with-two-peers',pending:compiling.pendingJobId}));
      await expect.poll(async()=>{
        const next=await call('community_server_status');if(next?.error)throw Error(next.error);
        return next?.pendingJobId===null&&next?.processId!==previous.processId&&next?.sourceBuildId!==previous.sourceBuildId&&next;
      },{timeout:300000,intervals:[1000,2000]}).toMatchObject({projectId:created.id});
      const adopted=await call('community_server_status');
      expect(adopted.mapSha256).not.toBe(previous.mapSha256);expect(adopted.compiledSha256).toBe(adopted.mapSha256);expect(adopted.restarts).toBe(previous.restarts+1);
      const readback=await liveRebuild.readback(adopted);
      expect(readback.sha256).toBe(adopted.mapSha256);expect(await hash(map)).toBe(previous.mapSha256);expect(await fs.stat(base)).toBeTruthy();
      for(let i=0;i<6;i++)expect(await fs.stat(path.join(base,'save/z',`cache${String(i).padStart(3,'0')}.map`)).catch(error=>{if(error.code==='ENOENT')return null;throw error;})).toBeNull();
      receipt.nativeDedicated.adoptedReadback={adopted,readback,previousMapUnchanged:true,stoppedServerCachesRetired:true};
      await checkpoint('new-revision-adopted-and-independent-readback');
      await stopClients(previousClients);
      await startClients(adopted.sessionDirectory,'rebuilt-dedicated');
      const newPeers=await waitForPeers(readback.positions);
      const loaded=await call('community_server_status');expect(loaded.gameSha256).toBe(adopted.mapSha256);expect(loaded.gameBuildId).toBe(adopted.sourceBuildId);
      receipt.nativeDedicated.liveRebuild={compiling,adopted,loaded,readback,spawnReadback:newPeers.spawnReadback,peers:newPeers.spawned,previousStageUnchanged:true,roundReset:true,clientsExplicitlyRejoined:true};
      await expect(panel).toContainText('Game '+loaded.gameSha256.slice(0,8));
      await expect(panel).toContainText(/2\/\d+ players · native in_game/);
      await page.screenshot({path:path.join(root,'native-dedicated-live-rebuild.png')});
      await checkpoint('new-revision-readback-and-two-rejoined-clients');
      await checkpoint('before-post-rebuild-failure-tests');
      const compilerFailure=earlyCompilerFailure??await rejectBuild(loaded,liveRebuild,'native-compiler');
      receipt.nativeDedicated.liveRebuild.failedBuild={...compilerFailure,beforeValidReplacement:compilerFailureBeforeRebuild};
      const prerequisiteFailure=liveRebuild.prerequisiteFailure?await rejectBuild(loaded,liveRebuild.prerequisiteFailure,'native-prerequisite'):null;
      if(prerequisiteFailure)receipt.nativeDedicated.liveRebuild.prerequisiteFailure=prerequisiteFailure;
      const rejected=(prerequisiteFailure??compilerFailure).rejected;
      if(verifyLifecycleFaults){
        const privateExecutable=path.join(adopted.sessionDirectory,'engine/chupathingyce-server.exe');
        const relative=path.relative(root,privateExecutable);expect(path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep)).toBe(false);
        expect(await hash(privateExecutable)).toBe('25a206c6c7d6454a6f6a41a8a5987a1e30334db7404e8bf895f1e8429485ce85');
        const pinnedPath=privateExecutable.replaceAll("'","''");
        const script=`$ErrorActionPreference='Stop'; $owned=Get-CimInstance Win32_Process -Filter 'ProcessId=${rejected.processId}'; if(!$owned -or $owned.ParentProcessId -ne ${ownerProcessId} -or ![StringComparer]::OrdinalIgnoreCase.Equals([IO.Path]::GetFullPath($owned.ExecutablePath),'${pinnedPath}')){throw 'Refused fault injection outside the exact owned native server'}; Stop-Process -Id ${rejected.processId} -Force -ErrorAction Stop; 'Owned native server exit injected'`;
        const fault=await promisify(execFile)('pwsh.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:15000,maxBuffer:8192});
        expect(fault.stdout).toContain('Owned native server exit injected');
        await expect.poll(async()=>{const next=await call('community_server_status');if(next?.phase==='failed')throw Error(next.detail);return next?.processId!==rejected.processId&&next?.mapSha256===previous.mapSha256&&next?.status&&next;},{timeout:150000,intervals:[1000,2000]}).toMatchObject({sourceBuildId:previous.sourceBuildId});
        const restoredStart=await call('community_server_status');
        expect(restoredStart.error).toContain('retained previous-good private stage');expect(restoredStart.compiledSha256).toBe(adopted.mapSha256);expect(restoredStart.sessionDirectory).toBe(base);
        expect(await hash(map)).toBe(previous.mapSha256);
        await stopClients(clients);
        await startClients(base,'rollback-dedicated',previousClients);
        const restoredPeers=await waitForPeers(expectedSpawns),restored=await call('community_server_status');
        expect(restored.gameSha256).toBe(previous.mapSha256);expect(restored.gameBuildId).toBe(previous.sourceBuildId);expect(restored.compiledSha256).toBe(adopted.mapSha256);expect(restored.processId).not.toBe(rejected.processId);
        await expect(panel).toContainText('Game '+previous.mapSha256.slice(0,8));await expect(panel).toContainText('Compiled '+adopted.mapSha256.slice(0,8));await expect(panel).toContainText(/2\/\d+ players · native in_game/);
        receipt.nativeDedicated.unexpectedServerExit={failed:rejected,restoredStart,restored,spawnReadback:restoredPeers.spawnReadback,peers:restoredPeers.spawned,onlyExactOwnedProcessTerminated:true,previousGoodMapUnchanged:true,existingPrivateProfilesRejoined:true,gameplayAccepted:false};
        await page.screenshot({path:path.join(root,'native-dedicated-rollback.png')});
        await checkpoint('native-server-exit-restored-previous-good-two-peers');
      }
    }
    if(emptyGameLifecycle){
      const before=await call('community_server_status');
      expect(before.status).toMatchObject({state:'in_game',players:2});
      expect(before.gameSha256).toBe(before.mapSha256);
      await stopClients(clients);
      await expect.poll(async()=>{const next=await call('community_server_status');return next?.status?.players;},{timeout:30000,intervals:[1000]}).toBe(0);
      await expect.poll(async()=>{const next=await call('community_server_status');return next?.status?.state;},{timeout:90000,intervals:[1000,2000]}).not.toBe('in_game');
      const after=await call('community_server_status');
      receipt.nativeDedicated.emptyGame={before,after,allClientsExited:clients.every(peer=>peer.child.exitCode!==null||peer.child.signalCode!==null),gameplayAccepted:false};
      await checkpoint('empty-game-native-state-observed');
      await expect(panel).toContainText('native '+after.status.state);
      await page.screenshot({path:path.join(root,'native-dedicated-empty.png')});
      expect(after.processId).toBe(before.processId);expect(after.mapSha256).toBe(before.mapSha256);
      expect(await hash(map)).toBe(before.mapSha256);
      expect(after.gameSha256,'A non-playing native state must not confirm the prior cache as the active game revision').toBeNull();
      expect(after.gameBuildId).toBeNull();
      if(compiled)await expect(panel).toContainText('Game not confirmed');
      else await expect(panel).toContainText('native '+after.status.state);
    }

  } catch(problem) {
    primaryFailure=problem;
    receipt.nativeDedicated.primaryFailure={error:String(problem.stack??problem),ui:await page.locator('body').innerText().then(text=>text.slice(0,16000)).catch(()=>''),clicks:await page.evaluate(()=>window.__sparkQaHostClicks).catch(()=>[])};
    await page.screenshot({path:path.join(root,'native-dedicated-primary-failure.png')}).catch(()=>{});
    await checkpoint('native-primary-failure-before-cleanup').catch(()=>{});
    throw problem;
  } finally {
    try {
    for (const client of allClients) {
      await stopQaProcess(client.child);
      await waitForQaExit(client.child);
      await fs.writeFile(path.join(client.client, `native-client-${client.child.pid}.log`), client.output);
    }
    receipt.nativeDedicated.clients = allClients.map((client) => ({
      pid: client.child.pid,
      exitCode: client.child.exitCode,
      signalCode: client.child.signalCode,
      networkLog: client.networkLog.slice(-24000),
      tail: client.output.slice(-4000),
    }));
    const terminal = await call('community_server_status');
    let stopped;
    if(primaryFailure && terminal?.phase==='failed' && terminal.processId===null){
      // The adapter already disposed its child/stages. Preserve the real failure;
      // a terminal failed view correctly offers no Stop control.
      stopped=terminal;
      receipt.nativeDedicated.failedAfterDisposal=terminal;
    }else{
      const stop = panel.getByRole('button', { name: 'Stop server', exact: true, includeHidden:true });
      if(!await panel.isVisible()){
        await chooseTool(page,'Online');
        await page.getByRole('button',{name:'Host game',exact:true}).click();
      }
      await revealPagedControl(stop);await stop.click();
      await expect
        .poll(async () => (await call('community_server_status'))?.phase, { timeout: 30000 })
        .toBe('stopped');
      stopped = await call('community_server_status');
      receipt.nativeDedicated.stopped = stopped;
      await expect(panel).toContainText('stopped');
    }
    expect(stopped.originalInputsUnchanged).toBe(true);
    for(const row of originalClientPins)expect(await hash(row.file)).toBe(row.sha256);
    expect(await fs.readFile(runtimeConfig).catch(error=>{if(error.code==='ENOENT')return null;throw error;})).toEqual(configBefore);
    receipt.nativeDedicated.originalClientInputsUnchanged=true;
    receipt.nativeDedicated.executedOnlyDisposableCopies=true;
    receipt.nativeDedicated.originalsUnchanged = true;
    for(const staged of [base,receipt.nativeDedicated.liveRebuild?.adopted.sessionDirectory].filter(Boolean))await expect.poll(async () => !!(await fs.stat(staged).catch(() => null)), { timeout: 30000 }).toBe(false);
    }catch(problem){
      receipt.nativeDedicated.cleanupError=String(problem.stack??problem);
      if(!primaryFailure)throw problem;
    }
  }
  receipt.nativeDedicated.layouts=await auditLayouts();
  await checkpoint('stopped-originals-rechecked-and-layouts');
  return receipt.nativeDedicated;
}
