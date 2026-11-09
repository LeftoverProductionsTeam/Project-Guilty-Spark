// Native dedicated acceptance reuses the real CE Workshop authoring/compile fixture.
// Authenticated status is genuine upstream output; no synthetic server or game state.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { chooseTool, openStudioMenu } from '../tests/ui/helpers/navigation.ts';
import { auditPagedSurface } from '../tests/ui/helpers/compactSurfaces.ts';
import {windowUiScale} from '../src/uiScale.ts';
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
}) {
  const hash = async (file) =>
    crypto
      .createHash('sha256')
      .update(await fs.readFile(file))
      .digest('hex');
  const created = (await call('bootstrap')).entries.find((row) => projectId ? row.id === projectId : row.title === 'Native live rebuild');
  expect(created).toBeTruthy();
  const saved = (await call('open_project', { id: created.id })).project;
  expect(
    saved.builds.some((row) => row.id === compiled.build.id && row.sha256 === compiled.build.sha256),
  ).toBe(true);
  (receipt.liveRebuild??={}).projectId = created.id;

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
    .poll(async () => (await call('community_server_installation')).installed, {
      timeout: 180000,
      intervals: [1000, 2500],
    })
    .toBe(true);
  const installed = await call('community_server_installation');
  expect(await hash(installed.executable)).toBe(
    '25a206c6c7d6454a6f6a41a8a5987a1e30334db7404e8bf895f1e8429485ce85',
  );
  await panel.getByRole('checkbox', { name: /Use current CE build/ }).check();
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
  expect(session.sourceBuildId).toBe(compiled.build.id);
  expect(session.mapSha256).toBe(compiled.build.sha256);
  const base = session.sessionDirectory,
    map = path.join(base, 'data/maps_ce', session.map.replace(/@ce$/, '') + '.map');
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
  const clients = [];
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
  try {
    for (let index = 0; index < 2; index++) {
      const client = await createScratch('dedicated-client-' + index);
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
        HALO_DATA_ROOT: path.join(base, 'data'),
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
        HALO_EXIT_AFTER: '100',
        HALO_HIDDEN_WINDOW: 'true',
        HALO_CONSOLE_LOG: 'all',
        SDL_AUDIO_DRIVER: 'dummy',
      });
      const privateExecutable=path.resolve(client,'engine',pin.executable);
      const outsideOriginal=path.relative(runtime,privateExecutable);
      expect(path.isAbsolute(outsideOriginal)||outsideOriginal.split(path.sep)[0]==='..').toBe(true);
      expect(path.relative(client,privateExecutable)).toBe(path.join('engine',pin.executable));
      for(const key of ['HALO_SAVE_ROOT','HALO_CACHE_ROOT','HALO_LOG_ROOT'])expect(path.relative(client,env[key])).not.toMatch(/^\.\.|^[A-Za-z]:/);
      expect(path.resolve(env.HALO_DATA_ROOT)).toBe(path.resolve(base,'data'));
      const child = spawn(privateExecutable, ['--play'], {
        cwd: client,
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
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
      clients.push({
        child,
        client,
        ticks,
        get output() {
          return output;
        },
        get networkLog() {
          return networkLog;
        },
      });
    }
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
    if(expectedSpawns){
      expect(expectedSpawns).toHaveLength(4);
      const peerPositions=spawned.map(t=>[...t.line.matchAll(/player (\d+): \(([-.\d]+) ([-.\d]+) ([-.\d]+)\)/g)].map(match=>({player:Number(match[1]),position:match.slice(2).map(Number)})));
      for(const positions of peerPositions){expect(positions).toHaveLength(2);for(const row of positions)expect(expectedSpawns.some(position=>Math.abs(position[0]-row.position[0])<.05&&Math.abs(position[1]-row.position[1])<.05&&Math.abs(position[2]-row.position[2])<1)).toBe(true);}
      expect(peerPositions[0]).toEqual(peerPositions[1]);
      receipt.nativeDedicated.spawnReadback={sourcePositions:expectedSpawns,peerPositions,agreed:true,sourceZAllowance:1,sourceXyAllowance:.05};
    }
    receipt.nativeDedicated.spawnedClients = spawned;
    receipt.nativeDedicated.joined = session;
    receipt.nativeDedicated.twoClients = true;
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
  } finally {
    for (const client of clients) {
      if (client.child.exitCode === null) {
        client.child.kill();
        await new Promise((resolve) => client.child.once('exit', resolve));
      }
      await fs.writeFile(path.join(client.client, 'native-client.log'), client.output);
    }
    receipt.nativeDedicated.clients = clients.map((client) => ({
      pid: client.child.pid,
      exitCode: client.child.exitCode,
      networkLog: client.networkLog.slice(-24000),
      tail: client.output.slice(-4000),
    }));
    const stop = panel.getByRole('button', { name: 'Stop server', exact: true });
    if (await stop.isVisible()) await stop.click();
    await expect
      .poll(async () => (await call('community_server_status'))?.phase, { timeout: 30000 })
      .toBe('stopped');
    const stopped = await call('community_server_status');
    expect(stopped.originalInputsUnchanged).toBe(true);
    receipt.nativeDedicated.stopped = stopped;
    for(const row of originalClientPins)expect(await hash(row.file)).toBe(row.sha256);
    expect(await fs.readFile(runtimeConfig).catch(error=>{if(error.code==='ENOENT')return null;throw error;})).toEqual(configBefore);
    receipt.nativeDedicated.originalClientInputsUnchanged=true;
    receipt.nativeDedicated.executedOnlyDisposableCopies=true;
    receipt.nativeDedicated.originalsUnchanged = true;
    await expect(panel).toContainText('stopped');
    await expect.poll(async () => !!(await fs.stat(base).catch(() => null)), { timeout: 30000 }).toBe(false);
  }
  const label = await page.evaluate(() => window.__TAURI_INTERNALS__.metadata.currentWindow.label);
  receipt.nativeDedicated.layouts = [];
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
    receipt.nativeDedicated.layouts.push({ requested: { width, height }, ...bounds, surfaces });
    if ([800, 1500, 3440, 5120].includes(width))
      await page.screenshot({ path: path.join(root, 'native-dedicated-' + width + 'x' + height + '.png') });
  }
  await call('plugin:window|set_size', { label, value: { Logical: { width: 1500, height: 950 } } });
  return receipt.nativeDedicated;
}
