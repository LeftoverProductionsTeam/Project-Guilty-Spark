import {openStudioMenu} from '../tests/ui/helpers/navigation.ts';
// Opt-in actual Steam SDK/desktop integration. One account cannot prove relay.
import { chromium, expect as check } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
const args = process.argv.slice(2);
if (args.length !== 3)
  throw Error('test-steam-session-native <Spark.exe> <fresh evidence root> <verified module folder>');
const [app, root, module] = args.map((p) => path.resolve(p)),
  expect = check.configure({ timeout: 45000 }),
  actors = [];
await fs.mkdir(root, { recursive: false });
const hash = async (p) =>
  crypto
    .createHash('sha256')
    .update(await fs.readFile(p))
    .digest('hex');
const receipt = {
  schemaVersion: 1,
  appSha256: await hash(app),
  harnessSha256: await hash(new URL(import.meta.url)),
  nativeProcesses: 2,
  physicalMachines: 1,
  steamAccounts: 1,
  appId: 480,
  mockedIpc: false,
  gameLaunched: false,
  remoteRelayTested: false,
  complete: false,
};
async function actor(name) {
  const dir = path.join(root, name);
  await fs.mkdir(dir);
  const exe = path.join(dir, 'GuiltySpark-Steam-qa.exe');
  await fs.copyFile(app, exe, fs.constants.COPYFILE_EXCL);
  const listener = net.createServer();
  await new Promise((r) => listener.listen(0, '127.0.0.1', r));
  const port = listener.address().port;
  await new Promise((r) => listener.close(r));
  const a = { name, dir };
  actors.push(a);
  a.child = spawn(exe, [], {
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      GUILTY_SPARK_DATA_DIR: path.join(dir, 'library'),
      WEBVIEW2_USER_DATA_FOLDER: path.join(dir, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  });
  await expect
    .poll(() =>
      fetch(`http://127.0.0.1:${port}/json/version`).then(
        (r) => r.ok,
        () => false,
      ),
    )
    .toBe(true);
  a.browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect
    .poll(() =>
      a.browser
        .contexts()
        .flatMap((c) => c.pages())
        .some((p) => p.url().includes('tauri.localhost')),
    )
    .toBe(true);
  a.page = a.browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes('tauri.localhost'));
  a.call = (command, params = {}) =>
    a.page.evaluate(({ command, params }) => window.__TAURI_INTERNALS__.invoke(command, params), {
      command,
      params,
    });
  const boot = await a.call('bootstrap');
  await a.call('save_settings', {
    settings: { ...boot.settings, onboardingCompleted: true, autoBuild: false },
  });
  const selected = await a.call('choose_steam_module', { path: module });
  expect(selected.configured).toBe(true);
  const made = await a.call('create_quickforge_project', {
    title: `C48 Steam ${name}`,
    template: 'emptyArena',
    target: 'mccSteam',
  });
  a.id = made.project.id;
  await a.page.reload();
  await a.page
    .locator('.map-card')
    .filter({ has: a.page.getByRole('heading', { name: made.project.title, exact: true }) })
    .click();
  await a.call('claim_project_document', { id: a.id });
  await openStudioMenu(a.page);await a.page.getByRole('button', { name: 'Live Studio · Solo', exact: true }).click();
  a.panel = a.page.locator('.studio-panel');
  if (!(await a.panel.evaluate((el) => el.open))) await a.panel.locator(':scope > summary').click();
  await a.panel
    .getByRole('combobox', { name: 'Editor connection', exact: true })
    .selectOption('steamSpacewar');
  return a;
}
try {
  const owner = await actor('owner');
  await owner.panel.getByRole('button', { name: 'Test Steam connection', exact: true }).click();
  await expect(owner.panel.getByText(/Steam initialized for app 480/)).toBeVisible();
  const ready = await owner.call('steam_session_probe');
  expect(ready.appId).toBe(480);
  expect(ready.testMode).toBe(true);
  receipt.nativeAppSteamProbe = {
    initialized: true,
    relayStatus: ready.relayStatus,
    remotePeerVerified: false,
  };
  await owner.panel.getByRole('button', { name: 'Host editing session', exact: true }).click();
  await openStudioMenu(owner.page);await expect(owner.page.getByRole('button', { name: 'Live Studio · Hosting', exact: true })).toBeVisible();
  const hosted = await owner.call('forge_session_status', { projectId: owner.id });
  owner.session = hosted.sessionId;
  expect(hosted.transport).toBe('steamSpacewar');
  expect(hosted.view.durable).toBe(true);
  const invite = await owner.call('forge_session_invite', {
    projectId: owner.id,
    sessionId: owner.session,
    address: '127.0.0.1',
    viewer: false,
  });
  const parsed = await owner.call('forge_session_parse_invite', { text: invite });
  expect(parsed.transport).toBe('steamSpacewar');
  expect(parsed.certificate ?? null).toBe(null);
  expect(parsed.schemaVersion).toBe(5);
  receipt.actualDesktopSteamHost = {
    started: true,
    durableSource: true,
    framedSdkTransport: true,
    invitationProtocol: parsed.schemaVersion,
    invitationHasTlsCertificate: false,
  };
  const guest = await actor('guest');
  const guestReady = await guest.call('steam_session_probe');
  expect(guestReady.steamId).toBe(ready.steamId);
  await guest.panel.getByRole('textbox', { name: 'Private Spark invite', exact: true }).fill(invite);
  await guest.panel.getByRole('button', { name: 'Join private invite', exact: true }).click();
  await expect(guest.panel.locator('.notice.error')).toContainText(
    'Steam test connection did not initialize',
  );
  expect(await guest.call('forge_session_status', { projectId: guest.id })).toBe(null);
  receipt.sameAccountJoinRefused = true;
  receipt.sameAccountVerifiedByBothSdkProbes = true;
  receipt.joinRefusalDiagnostic =
    'Desktop reports a generic initialization failure; the Steam panel separately states that a second account is required. More precise failure reporting remains open.';
  await expect(
    owner.call('forge_studio_recover', {
      projectId: owner.id,
      directoryId: hosted.directoryId,
      address: '127.0.0.1',
      displayName: 'Owner',
      transport: 'steamSpacewar',
    }),
  ).rejects.toThrow(/Steam session recovery is not verified/);
  const after = await owner.call('forge_session_poll', { projectId: owner.id, sessionId: owner.session });
  expect(after.document).toEqual(hosted.view.document);
  expect(after.revision).toBe(hosted.view.revision);
  receipt.unverifiedSteamRecoveryGatedWithoutChangingSource = true;
  await owner.panel.getByRole('button', { name: 'Leave session', exact: true }).click();
  await expect(owner.page.getByRole('button', { name: 'Live Studio · Solo', exact: true })).toBeVisible();
  receipt.ownedHostAndBridgeClosed = true;
  receipt.complete = true;
  await fs.writeFile(path.join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(
    'PASS actual Steam desktop probe and host; same-account join and unverified recovery refused. No remote relay claim.',
  );
} catch (error) {
  receipt.error = String(error);
  receipt.stack = error.stack;
  for (const a of actors) await a.page?.screenshot({ path: path.join(a.dir, 'failure.png') }).catch(() => {});
  await fs.writeFile(path.join(root, 'failure.json'), JSON.stringify(receipt, null, 2));
  throw error;
} finally {
  for (const a of actors) {
    if (a.session)
      await a.call('forge_session_leave', { projectId: a.id, sessionId: a.session }).catch(() => {});
    if (a.child?.exitCode === null) a.child.kill();
    await a.browser?.close().catch(() => {});
  }
}
